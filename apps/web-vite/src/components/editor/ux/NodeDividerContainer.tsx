/**
 * NodeDividerContainer Component
 *
 * Container that renders dividers between top-level nodes.
 */

import { useEffect, useState } from 'react'
import type { Editor } from '@tiptap/react'
import { NodeDivider } from './NodeDivider'
import { BlockMenu } from './BlockMenu'
import { getTopLevelNodes } from './nodeDetection'
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
