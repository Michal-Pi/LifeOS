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
            />
          )
        })}
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
