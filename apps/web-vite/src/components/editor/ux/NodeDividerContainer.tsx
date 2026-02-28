/**
 * NodeDividerContainer Component
 *
 * Container that renders dividers between top-level nodes.
 */

import { useEffect, useState, useRef } from 'react'
import { createPortal } from 'react-dom'
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
  const clearTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null)

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
    const contentWrapper = view.dom.closest('.editor-content-wrapper') as HTMLElement | null
    if (!contentWrapper) return
    // .editor-wrapper is the outer container whose left padding forms the
    // gutter between the sidebar and the article content. We attach mouse
    // listeners there so the gutter is included in hover tracking, and we
    // portal the hover button into it so it isn't clipped by inner overflow.
    const outerWrapper = contentWrapper.closest('.editor-wrapper') as HTMLElement | null
    const hoverTarget = outerWrapper || contentWrapper
    queueMicrotask(() => setPortalTarget(outerWrapper))

    const cancelPendingClear = () => {
      if (clearTimeoutRef.current) {
        clearTimeout(clearTimeoutRef.current)
        clearTimeoutRef.current = null
      }
    }

    const clearHover = () => {
      if (hoverLockRef.current) return
      cancelPendingClear()
      clearTimeoutRef.current = setTimeout(() => {
        if (!hoverLockRef.current) {
          lastHoverPositionRef.current = null
          setHoverButton(null)
        }
        clearTimeoutRef.current = null
      }, 400)
    }

    const handleMouseMove = (event: MouseEvent) => {
      // Don't update position while mouse is over the hover button
      if (hoverLockRef.current) return

      const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })
      if (!pos) {
        // Mouse is in the gutter area — keep the current hover button visible
        return
      }

      const nodeInfo = getTopLevelNodeAt(editor, pos.pos)
      if (!nodeInfo) {
        return
      }

      // Valid node found — cancel any pending clear
      cancelPendingClear()

      if (lastHoverPositionRef.current === nodeInfo.position) {
        return
      }

      try {
        const coords = view.coordsAtPos(nodeInfo.position)
        const targetRect = hoverTarget.getBoundingClientRect()
        const lineHeight = Math.max(0, coords.bottom - coords.top)
        // Center the 24px button in the gutter (space between sidebar and article).
        // The gutter = the left padding of .editor-wrapper (3rem ≈ 48px).
        const gutterWidth = contentWrapper.getBoundingClientRect().left - targetRect.left
        const x = Math.round((gutterWidth - 24) / 2)
        const y =
          coords.top - targetRect.top + hoverTarget.scrollTop + Math.max(0, (lineHeight - 24) / 2)

        lastHoverPositionRef.current = nodeInfo.position
        setHoverButton({ nodePosition: nodeInfo.position, x, y })
      } catch {
        // ignore
      }
    }

    hoverTarget.addEventListener('mousemove', handleMouseMove)
    hoverTarget.addEventListener('mouseleave', clearHover)

    return () => {
      hoverTarget.removeEventListener('mousemove', handleMouseMove)
      hoverTarget.removeEventListener('mouseleave', clearHover)
      queueMicrotask(() => setPortalTarget(null))
      cancelPendingClear()
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

  const hoverButtonRef = useRef<HTMLButtonElement>(null)

  const hoverButtonEl = hoverButton && (
    <button
      ref={hoverButtonRef}
      className="node-hover-button"
      style={{ top: hoverButton.y, left: hoverButton.x }}
      onClick={(event) => {
        event.preventDefault()
        event.stopPropagation()
        // Position the menu to the right of the button, vertically centered
        const btn = hoverButtonRef.current
        if (btn) {
          const rect = btn.getBoundingClientRect()
          setMenuState({
            isOpen: true,
            nodePosition: hoverButton.nodePosition,
            position: {
              x: rect.right + 4,
              y: rect.top + rect.height / 2,
            },
          })
        } else {
          handleMenuOpen(hoverButton.nodePosition, event.nativeEvent)
        }
      }}
      onMouseEnter={() => {
        if (clearTimeoutRef.current) {
          clearTimeout(clearTimeoutRef.current)
          clearTimeoutRef.current = null
        }
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
      {/* 6-dot grip handle (2 columns × 3 rows) */}
      <svg
        width="10"
        height="14"
        viewBox="0 0 10 14"
        fill="currentColor"
        xmlns="http://www.w3.org/2000/svg"
      >
        <circle cx="3" cy="2" r="1.25" />
        <circle cx="7" cy="2" r="1.25" />
        <circle cx="3" cy="7" r="1.25" />
        <circle cx="7" cy="7" r="1.25" />
        <circle cx="3" cy="12" r="1.25" />
        <circle cx="7" cy="12" r="1.25" />
      </svg>
    </button>
  )

  return (
    <>
      {/* Portal the hover button into .editor-wrapper so it sits in the
          outer gutter and isn't clipped by inner overflow containers */}
      {hoverButtonEl && (portalTarget ? createPortal(hoverButtonEl, portalTarget) : hoverButtonEl)}
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
      </div>
      {/* Add button after last node — rendered outside the absolute overlay
          so it participates in normal flow and can use sticky positioning */}
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
