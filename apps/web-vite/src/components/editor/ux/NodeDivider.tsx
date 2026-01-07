/**
 * NodeDivider Component
 *
 * Visual divider between top-level nodes with drag handle.
 * Appears on hover and provides drag & drop functionality.
 */

import { useState, useRef } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

export interface NodeDividerProps {
  nodePosition: number
  nodeId: string
  onMenuOpen?: (position: number, event?: MouseEvent) => void
}

export function NodeDivider({ nodePosition, nodeId, onMenuOpen }: NodeDividerProps) {
  const [isHovered, setIsHovered] = useState(false)
  const dividerRef = useRef<HTMLDivElement>(null)

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: nodeId,
    data: {
      nodePosition,
    },
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div
      ref={(node) => {
        setNodeRef(node)
        if (dividerRef.current !== node) {
          dividerRef.current = node as HTMLDivElement
        }
      }}
      className={`node-divider ${isHovered ? 'is-hovered' : ''} ${isDragging ? 'is-dragging' : ''}`}
      style={style}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="divider-line" />
      <div
        className="divider-handle"
        {...attributes}
        {...listeners}
        onClick={(e) => {
          e.stopPropagation()
          e.preventDefault()
          onMenuOpen?.(nodePosition, e.nativeEvent)
        }}
        onContextMenu={(e) => {
          e.preventDefault()
          e.stopPropagation()
          onMenuOpen?.(nodePosition, e.nativeEvent)
        }}
        title="Drag to reorder or click for menu"
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <circle cx="2" cy="2" r="1" fill="currentColor" />
          <circle cx="6" cy="2" r="1" fill="currentColor" />
          <circle cx="10" cy="2" r="1" fill="currentColor" />
          <circle cx="2" cy="6" r="1" fill="currentColor" />
          <circle cx="6" cy="6" r="1" fill="currentColor" />
          <circle cx="10" cy="6" r="1" fill="currentColor" />
          <circle cx="2" cy="10" r="1" fill="currentColor" />
          <circle cx="6" cy="10" r="1" fill="currentColor" />
          <circle cx="10" cy="10" r="1" fill="currentColor" />
        </svg>
      </div>
    </div>
  )
}
