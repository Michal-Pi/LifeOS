/**
 * DragDropContext Component
 *
 * Wraps the editor with DnD context and handles drag & drop operations.
 */

import { DndContext, DragOverlay, PointerSensor, useSensor, closestCenter } from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useState } from 'react'
import type { Editor } from '@tiptap/react'
import type { ReactNode } from 'react'
import { moveNode } from './nodeOperations'
import { getTopLevelNodes } from './nodeDetection'

export interface DragDropContextProps {
  editor: Editor
  children: ReactNode
}

export function DragDropContext({ editor, children }: DragDropContextProps) {
  const [activeId, setActiveId] = useState<string | null>(null)

  // Configure pointer sensor for drag
  const sensor = useSensor(PointerSensor, {
    activationDistance: 8, // Require 8px movement before drag starts
  })

  const topLevelNodes = getTopLevelNodes(editor)
  const nodeIds = topLevelNodes.map((node) => node.id)

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event

    setActiveId(null)

    if (!over || active.id === over.id) {
      return
    }

    // Find indices of active and over nodes
    const oldIndex = topLevelNodes.findIndex((node) => node.id === active.id)
    const newIndex = topLevelNodes.findIndex((node) => node.id === over.id)

    if (oldIndex === -1 || newIndex === -1) {
      return
    }

    // Get the actual node positions
    const activeNode = topLevelNodes[oldIndex]
    const newPositionNode = topLevelNodes[newIndex]

    // Move the node using ProseMirror transaction
    // Calculate target position based on new index
    if (oldIndex < newIndex) {
      // Moving down - insert after the target node
      moveNode(
        editor,
        activeNode.position,
        newPositionNode.position + newPositionNode.node.nodeSize
      )
    } else {
      // Moving up - insert before the target node
      moveNode(editor, activeNode.position, newPositionNode.position)
    }
  }

  const handleDragStart = (event: { active: { id: string | number } }) => {
    setActiveId(String(event.active.id))
  }

  return (
    <DndContext
      sensors={[sensor]}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={nodeIds} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>
      <DragOverlay>
        {activeId ? (
          <div className="drag-overlay-node">
            <div className="drag-overlay-content">Dragging...</div>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
