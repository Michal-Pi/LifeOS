/**
 * BlockMenu Component
 *
 * Context menu for block operations: duplicate, delete, convert, move.
 */

import { useRef, useEffect, useMemo } from 'react'
import type { Editor } from '@tiptap/react'
import { duplicateNode, deleteNode } from './nodeOperations'
import { getTopLevelNodeAt } from './nodeDetection'
import './BlockMenu.css'
import { useDialog } from '@/contexts/useDialog'

export interface BlockMenuProps {
  editor: Editor
  nodePosition: number
  isOpen: boolean
  onClose: () => void
  position: { x: number; y: number }
}

export function BlockMenu({ editor, nodePosition, isOpen, onClose, position }: BlockMenuProps) {
  const { confirm } = useDialog()
  const menuRef = useRef<HTMLDivElement>(null)

  // Compute node info during render instead of in effect
  const nodeInfo = useMemo(() => {
    return getTopLevelNodeAt(editor, nodePosition)
  }, [editor, nodePosition])

  // Close menu when clicking outside
  useEffect(() => {
    if (!isOpen) return

    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose()
      }
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen, onClose])

  if (!isOpen || !nodeInfo) {
    return null
  }

  const handleDuplicate = () => {
    duplicateNode(editor, nodePosition)
    onClose()
  }

  const handleDelete = async () => {
    const confirmed = await confirm({
      title: 'Delete block',
      description: 'Delete this block?',
      confirmLabel: 'Delete',
      confirmVariant: 'danger',
    })
    if (confirmed) {
      deleteNode(editor, nodePosition)
      onClose()
    }
  }

  const handleConvert = (newType: string) => {
    // Set selection to the node
    const nodeStart = nodeInfo.position
    const nodeEnd = nodeStart + nodeInfo.node.nodeSize

    try {
      // Use TipTap commands to convert
      editor.chain().focus().setTextSelection({ from: nodeStart, to: nodeEnd }).run()

      // Convert based on type
      switch (newType) {
        case 'paragraph':
          editor.chain().focus().setParagraph().run()
          break
        case 'heading1':
          editor.chain().focus().toggleHeading({ level: 1 }).run()
          break
        case 'heading2':
          editor.chain().focus().toggleHeading({ level: 2 }).run()
          break
        case 'heading3':
          editor.chain().focus().toggleHeading({ level: 3 }).run()
          break
        case 'bulletList':
          editor.chain().focus().toggleBulletList().run()
          break
        case 'orderedList':
          editor.chain().focus().toggleOrderedList().run()
          break
        case 'taskList':
          editor.chain().focus().toggleTaskList().run()
          break
        case 'blockquote':
          editor.chain().focus().toggleBlockquote().run()
          break
        case 'codeBlock':
          editor.chain().focus().toggleCodeBlock().run()
          break
      }

      onClose()
    } catch (error) {
      console.error('Failed to convert node:', error)
    }
  }

  const handleMove = (direction: 'up' | 'down') => {
    const { state } = editor
    const { doc } = state
    const topLevelNodes = Array.from(doc.content.content)
    const currentIndex = topLevelNodes.findIndex((node, index) => {
      let pos = 1
      for (let i = 0; i < index; i++) {
        pos += topLevelNodes[i].nodeSize
      }
      return pos === nodePosition
    })

    if (currentIndex === -1) return

    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1
    if (targetIndex < 0 || targetIndex >= topLevelNodes.length) return

    // Calculate target position
    let targetPos = 1
    for (let i = 0; i < targetIndex; i++) {
      targetPos += topLevelNodes[i].nodeSize
    }

    // Move the node
    const { tr, view } = state
    const node = topLevelNodes[currentIndex]
    const nodeStart = nodePosition
    const nodeEnd = nodeStart + node.nodeSize

    // Delete and reinsert
    tr.delete(nodeStart, nodeEnd)
    const newState = state.apply(tr)
    const adjustedTargetPos = targetIndex < currentIndex ? targetPos : targetPos - node.nodeSize
    const tr2 = newState.tr.insert(adjustedTargetPos, node)
    view.dispatch(tr2)

    onClose()
  }

  const nodeType = nodeInfo.node.type.name
  const canMoveUp = nodePosition > 1
  const canMoveDown = nodePosition + nodeInfo.node.nodeSize < editor.state.doc.content.size

  return (
    <div
      ref={menuRef}
      className="block-menu"
      style={{
        position: 'fixed',
        left: `${position.x}px`,
        top: `${position.y}px`,
      }}
    >
      <div className="block-menu-section">
        <button
          type="button"
          className="block-menu-item"
          onClick={handleDuplicate}
          title="Duplicate (Cmd+D)"
        >
          <span className="menu-item-icon">📋</span>
          <span className="menu-item-label">Duplicate</span>
          <span className="menu-item-shortcut">⌘D</span>
        </button>
        <button
          type="button"
          className="block-menu-item block-menu-item-danger"
          onClick={handleDelete}
          title="Delete"
        >
          <span className="menu-item-icon">🗑️</span>
          <span className="menu-item-label">Delete</span>
          <span className="menu-item-shortcut">⌫</span>
        </button>
      </div>

      <div className="block-menu-divider" />

      <div className="block-menu-section">
        <div className="block-menu-item block-menu-item-header">Turn into</div>
        {nodeType !== 'paragraph' && (
          <button
            type="button"
            className="block-menu-item"
            onClick={() => handleConvert('paragraph')}
          >
            <span className="menu-item-label">Paragraph</span>
          </button>
        )}
        {nodeType !== 'heading' && (
          <>
            <button
              type="button"
              className="block-menu-item"
              onClick={() => handleConvert('heading1')}
            >
              <span className="menu-item-label">Heading 1</span>
            </button>
            <button
              type="button"
              className="block-menu-item"
              onClick={() => handleConvert('heading2')}
            >
              <span className="menu-item-label">Heading 2</span>
            </button>
            <button
              type="button"
              className="block-menu-item"
              onClick={() => handleConvert('heading3')}
            >
              <span className="menu-item-label">Heading 3</span>
            </button>
          </>
        )}
        {nodeType !== 'bulletList' && (
          <button
            type="button"
            className="block-menu-item"
            onClick={() => handleConvert('bulletList')}
          >
            <span className="menu-item-label">Bullet List</span>
          </button>
        )}
        {nodeType !== 'orderedList' && (
          <button
            type="button"
            className="block-menu-item"
            onClick={() => handleConvert('orderedList')}
          >
            <span className="menu-item-label">Numbered List</span>
          </button>
        )}
        {nodeType !== 'taskList' && (
          <button
            type="button"
            className="block-menu-item"
            onClick={() => handleConvert('taskList')}
          >
            <span className="menu-item-label">Task List</span>
          </button>
        )}
        {nodeType !== 'blockquote' && (
          <button
            type="button"
            className="block-menu-item"
            onClick={() => handleConvert('blockquote')}
          >
            <span className="menu-item-label">Quote</span>
          </button>
        )}
        {nodeType !== 'codeBlock' && (
          <button
            type="button"
            className="block-menu-item"
            onClick={() => handleConvert('codeBlock')}
          >
            <span className="menu-item-label">Code Block</span>
          </button>
        )}
      </div>

      <div className="block-menu-divider" />

      <div className="block-menu-section">
        <button
          type="button"
          className="block-menu-item"
          onClick={() => handleMove('up')}
          disabled={!canMoveUp}
          title="Move up"
        >
          <span className="menu-item-icon">↑</span>
          <span className="menu-item-label">Move up</span>
        </button>
        <button
          type="button"
          className="block-menu-item"
          onClick={() => handleMove('down')}
          disabled={!canMoveDown}
          title="Move down"
        >
          <span className="menu-item-icon">↓</span>
          <span className="menu-item-label">Move down</span>
        </button>
      </div>
    </div>
  )
}
