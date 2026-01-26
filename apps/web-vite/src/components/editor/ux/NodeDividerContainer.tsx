/**
 * NodeDividerContainer Component
 *
 * Container that renders dividers between top-level nodes.
 */

import { useEffect, useState, useRef } from 'react'
import type { Editor } from '@tiptap/react'
import { NodeDivider } from './NodeDivider'
import { BlockMenu } from './BlockMenu'
import { getTopLevelNodes, getTopLevelNodeAt } from './nodeDetection'
import { insertBlockAt } from './nodeOperations'
import './NodeDivider.css'

export interface NodeDividerContainerProps {
  editor: Editor
}

export function NodeDividerContainer({ editor }: NodeDividerContainerProps) {
  const [topLevelNodes, setTopLevelNodes] = useState(getTopLevelNodes(editor))
  const [menuState, setMenuState] = useState<{
    isOpen: boolean
    nodePosition: number
    position: { x: number; y: number }
  } | null>(null)
  const [hoverButton, setHoverButton] = useState<{
    nodePosition: number
    x: number
    y: number
  } | null>(null)
  const lastHoverPositionRef = useRef<number | null>(null)
  const hoverLockRef = useRef(false)

  // Update nodes when editor content changes
  useEffect(() => {
    const updateNodes = () => {
      setTopLevelNodes(getTopLevelNodes(editor))
    }

    editor.on('update', updateNodes)
    editor.on('selectionUpdate', updateNodes)

    return () => {
      editor.off('update', updateNodes)
      editor.off('selectionUpdate', updateNodes)
    }
  }, [editor])

  useEffect(() => {
    const view = editor.view
    const container = view.dom.closest('.editor-content-wrapper') as HTMLElement | null
    if (!container) return

    const clearHover = () => {
      if (hoverLockRef.current) return
      lastHoverPositionRef.current = null
      setHoverButton(null)
    }

    const handleMouseMove = (event: MouseEvent) => {
      const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })
      if (!pos) {
        clearHover()
        return
      }

      const nodeInfo = getTopLevelNodeAt(editor, pos.pos)
      if (!nodeInfo) {
        clearHover()
        return
      }

      if (lastHoverPositionRef.current === nodeInfo.position) {
        return
      }

      try {
        const coords = view.coordsAtPos(nodeInfo.position)
        const containerRect = view.dom.getBoundingClientRect()
        const lineHeight = Math.max(0, coords.bottom - coords.top)
        const x = Math.max(8, coords.left - containerRect.left - 36)
        const y = coords.top - containerRect.top + Math.max(0, (lineHeight - 24) / 2)

        lastHoverPositionRef.current = nodeInfo.position
        setHoverButton({ nodePosition: nodeInfo.position, x, y })
      } catch {
        clearHover()
      }
    }

    container.addEventListener('mousemove', handleMouseMove)
    container.addEventListener('mouseleave', clearHover)

    return () => {
      container.removeEventListener('mousemove', handleMouseMove)
      container.removeEventListener('mouseleave', clearHover)
    }
  }, [editor])

  const handleMenuOpen = (position: number, event?: MouseEvent) => {
    if (event) {
      setMenuState({
        isOpen: true,
        nodePosition: position,
        position: { x: event.clientX, y: event.clientY },
      })
    } else {
      // Default position if no event
      setMenuState({
        isOpen: true,
        nodePosition: position,
        position: { x: 0, y: 0 },
      })
    }
  }

  const handleMenuClose = () => {
    setMenuState(null)
  }

  const handleInsertBlock = (position: number) => {
    // Calculate position after the current node
    const nodeInfo = topLevelNodes.find((n) => n.position === position)
    if (nodeInfo) {
      const insertPos = nodeInfo.position + nodeInfo.node.nodeSize
      insertBlockAt(editor, insertPos, 'paragraph')
    } else {
      // If not found, insert at the end
      const lastNode = topLevelNodes[topLevelNodes.length - 1]
      if (lastNode) {
        const insertPos = lastNode.position + lastNode.node.nodeSize
        insertBlockAt(editor, insertPos, 'paragraph')
      } else {
        // Empty document
        insertBlockAt(editor, 1, 'paragraph')
      }
    }
  }

  const handleInsertBlockAfterLast = () => {
    if (topLevelNodes.length === 0) {
      // Empty document
      insertBlockAt(editor, 1, 'paragraph')
    } else {
      const lastNode = topLevelNodes[topLevelNodes.length - 1]
      const insertPos = lastNode.position + lastNode.node.nodeSize
      insertBlockAt(editor, insertPos, 'paragraph')
    }
  }

  return (
    <>
      {hoverButton && (
        <button
          className="node-hover-button"
          style={{ top: hoverButton.y, left: hoverButton.x }}
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            handleMenuOpen(hoverButton.nodePosition, event.nativeEvent)
          }}
          onMouseEnter={() => {
            hoverLockRef.current = true
          }}
          onMouseLeave={() => {
            hoverLockRef.current = false
            lastHoverPositionRef.current = null
            setHoverButton(null)
          }}
          title="Block menu"
          type="button"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 16 16"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      )}
      <div className="node-dividers-container">
        {topLevelNodes.map((nodeInfo, index) => {
          // Only show divider if not the last node
          if (index === topLevelNodes.length - 1) {
            return null
          }

          return (
            <NodeDivider
              key={nodeInfo.id}
              nodePosition={nodeInfo.position}
              nodeId={nodeInfo.id}
              onMenuOpen={(pos, event) => handleMenuOpen(pos, event)}
              onInsertBlock={handleInsertBlock}
            />
          )
        })}
        {/* Add button after last node */}
        {topLevelNodes.length > 0 && (
          <div className="node-add-button-container">
            <button
              className="node-add-button"
              onClick={handleInsertBlockAfterLast}
              title="Add block"
              type="button"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M8 3v10M3 8h10"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
        )}
      </div>
      {menuState && (
        <BlockMenu
          editor={editor}
          nodePosition={menuState.nodePosition}
          isOpen={menuState.isOpen}
          onClose={handleMenuClose}
          position={menuState.position}
        />
      )}
    </>
  )
}
