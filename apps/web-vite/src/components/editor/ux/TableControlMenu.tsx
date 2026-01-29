/**
 * Table Control Menu
 *
 * Floating menu that appears when a table cell is selected,
 * providing controls to add/delete rows and columns.
 */

import { type Editor } from '@tiptap/react'
import { useEffect, useState } from 'react'
import './TableControlMenu.css'

export interface TableControlMenuProps {
  editor: Editor | null
}

export function TableControlMenu({ editor }: TableControlMenuProps) {
  const [isVisible, setIsVisible] = useState(false)
  const [position, setPosition] = useState({ x: 0, y: 0 })

  useEffect(() => {
    if (!editor) return

    const updateMenu = () => {
      // Check if we're in a table
      const isInTable = editor.isActive('table')

      if (isInTable) {
        // Get the current selection
        const { from } = editor.state.selection
        const domNode = editor.view.nodeDOM(from)

        if (domNode instanceof HTMLElement) {
          const cell = domNode.closest('td, th')
          if (cell) {
            const rect = cell.getBoundingClientRect()
            setPosition({
              x: rect.right + 8,
              y: rect.top,
            })
            setIsVisible(true)
            return
          }
        }
      }

      setIsVisible(false)
    }

    // Update on selection change
    editor.on('selectionUpdate', updateMenu)
    editor.on('transaction', updateMenu)

    // Initial check
    updateMenu()

    return () => {
      editor.off('selectionUpdate', updateMenu)
      editor.off('transaction', updateMenu)
    }
  }, [editor])

  if (!editor || !isVisible) {
    return null
  }

  return (
    <div
      className="table-control-menu"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
      }}
    >
      <div className="table-control-section">
        <span className="table-control-label">Row:</span>
        <button
          type="button"
          className="table-control-btn"
          onClick={() => editor.chain().focus().addRowBefore().run()}
          title="Add row above"
          disabled={!editor.can().addRowBefore()}
        >
          ↑ Add
        </button>
        <button
          type="button"
          className="table-control-btn"
          onClick={() => editor.chain().focus().addRowAfter().run()}
          title="Add row below"
          disabled={!editor.can().addRowAfter()}
        >
          ↓ Add
        </button>
        <button
          type="button"
          className="table-control-btn table-control-danger"
          onClick={() => editor.chain().focus().deleteRow().run()}
          title="Delete row"
          disabled={!editor.can().deleteRow()}
        >
          ✕ Del
        </button>
      </div>

      <div className="table-control-section">
        <span className="table-control-label">Column:</span>
        <button
          type="button"
          className="table-control-btn"
          onClick={() => editor.chain().focus().addColumnBefore().run()}
          title="Add column before"
          disabled={!editor.can().addColumnBefore()}
        >
          ← Add
        </button>
        <button
          type="button"
          className="table-control-btn"
          onClick={() => editor.chain().focus().addColumnAfter().run()}
          title="Add column after"
          disabled={!editor.can().addColumnAfter()}
        >
          → Add
        </button>
        <button
          type="button"
          className="table-control-btn table-control-danger"
          onClick={() => editor.chain().focus().deleteColumn().run()}
          title="Delete column"
          disabled={!editor.can().deleteColumn()}
        >
          ✕ Del
        </button>
      </div>

      <div className="table-control-divider" />

      <div className="table-control-section">
        <button
          type="button"
          className="table-control-btn"
          onClick={() => editor.chain().focus().mergeCells().run()}
          title="Merge cells"
          disabled={!editor.can().mergeCells()}
        >
          ⊞ Merge
        </button>
        <button
          type="button"
          className="table-control-btn"
          onClick={() => editor.chain().focus().splitCell().run()}
          title="Split cell"
          disabled={!editor.can().splitCell()}
        >
          ⊟ Split
        </button>
        <button
          type="button"
          className="table-control-btn table-control-danger"
          onClick={() => {
            if (confirm('Delete entire table?')) {
              editor.chain().focus().deleteTable().run()
            }
          }}
          title="Delete table"
          disabled={!editor.can().deleteTable()}
        >
          🗑 Delete Table
        </button>
      </div>
    </div>
  )
}
