/**
 * CommandMenu Component
 *
 * Slash command menu for inserting blocks.
 * Appears when user types "/" at the start of a block.
 */

import { useState, useEffect, useLayoutEffect, useRef, useMemo } from 'react'
import type { Editor } from '@tiptap/react'
import './CommandMenu.css'

export interface CommandMenuProps {
  editor: Editor
  isOpen: boolean
  onClose: () => void
  position: { x: number; y: number }
  query?: string
  onInsertMath?: () => void
}

export interface Command {
  id: string
  label: string
  description: string
  icon: string
  keywords: string[]
  action: (editor: Editor) => void
}

const commands: Command[] = [
  {
    id: 'heading1',
    label: 'Heading 1',
    description: 'Large section heading',
    icon: 'H1',
    keywords: ['heading', 'h1', 'title', 'header'],
    action: (editor) => {
      editor.chain().focus().toggleHeading({ level: 1 }).run()
    },
  },
  {
    id: 'heading2',
    label: 'Heading 2',
    description: 'Medium section heading',
    icon: 'H2',
    keywords: ['heading', 'h2', 'subtitle', 'header'],
    action: (editor) => {
      editor.chain().focus().toggleHeading({ level: 2 }).run()
    },
  },
  {
    id: 'heading3',
    label: 'Heading 3',
    description: 'Small section heading',
    icon: 'H3',
    keywords: ['heading', 'h3', 'subheader'],
    action: (editor) => {
      editor.chain().focus().toggleHeading({ level: 3 }).run()
    },
  },
  {
    id: 'bulletList',
    label: 'Bullet List',
    description: 'Create a bulleted list',
    icon: '•',
    keywords: ['list', 'bullet', 'ul', 'unordered'],
    action: (editor) => {
      editor.chain().focus().toggleBulletList().run()
    },
  },
  {
    id: 'orderedList',
    label: 'Numbered List',
    description: 'Create a numbered list',
    icon: '1.',
    keywords: ['list', 'numbered', 'ol', 'ordered', 'number'],
    action: (editor) => {
      editor.chain().focus().toggleOrderedList().run()
    },
  },
  {
    id: 'taskList',
    label: 'Task List',
    description: 'Create a checklist',
    icon: '☑',
    keywords: ['task', 'todo', 'checklist', 'checkbox'],
    action: (editor) => {
      editor.chain().focus().toggleTaskList().run()
    },
  },
  {
    id: 'table',
    label: 'Table',
    description: 'Insert a table',
    icon: '⊞',
    keywords: ['table', 'grid', 'spreadsheet'],
    action: (editor) => {
      editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
    },
  },
  {
    id: 'image',
    label: 'Image',
    description: 'Upload an image',
    icon: '🖼️',
    keywords: ['image', 'picture', 'photo', 'img'],
    action: (editor) => {
      // Trigger file input
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = 'image/*'
      input.onchange = (e) => {
        const file = (e.target as HTMLInputElement).files?.[0]
        if (file) {
          const reader = new FileReader()
          reader.onload = (event) => {
            const src = event.target?.result as string
            if (src) {
              editor.chain().focus().setImage({ src }).run()
            }
          }
          reader.readAsDataURL(file)
        }
      }
      input.click()
    },
  },
  {
    id: 'codeBlock',
    label: 'Code Block',
    description: 'Insert a code block',
    icon: '</>',
    keywords: ['code', 'codeblock', 'snippet', 'programming'],
    action: (editor) => {
      editor.chain().focus().toggleCodeBlock().run()
    },
  },
  {
    id: 'math',
    label: 'Math Equation',
    description: 'Insert a math equation',
    icon: '∑',
    keywords: ['math', 'equation', 'latex', 'formula', 'scientific'],
    action: () => {},
  },
  {
    id: 'blockquote',
    label: 'Quote',
    description: 'Insert a quote',
    icon: '"',
    keywords: ['quote', 'blockquote', 'citation'],
    action: (editor) => {
      editor.chain().focus().toggleBlockquote().run()
    },
  },
  {
    id: 'divider',
    label: 'Divider',
    description: 'Insert a horizontal divider',
    icon: '—',
    keywords: ['divider', 'hr', 'horizontal', 'line', 'separator'],
    action: (editor) => {
      editor.chain().focus().setHorizontalRule().run()
    },
  },
]

export function CommandMenu({
  editor,
  isOpen,
  onClose,
  position,
  query = '',
  onInsertMath,
}: CommandMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)

  // Filter commands based on query
  const filteredCommands = useMemo(
    () =>
      query
        ? commands.filter(
            (cmd) =>
              cmd.label.toLowerCase().includes(query.toLowerCase()) ||
              cmd.keywords.some((keyword) => keyword.toLowerCase().includes(query.toLowerCase()))
          )
        : commands,
    [query]
  )

  // Reset selectedIndex when query changes
  // Use a ref to track the previous query value
  const prevQueryRef = useRef(query)
  const [selectedIndex, setSelectedIndex] = useState(0)

  // Reset selectedIndex when query changes
  // This is necessary to reset selection when filtering changes
  // Using useLayoutEffect to synchronously reset before render
  useLayoutEffect(() => {
    if (prevQueryRef.current !== query) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedIndex(0)
      prevQueryRef.current = query
    }
  }, [query])

  // Handle keyboard navigation
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setSelectedIndex((prev) => (prev + 1) % filteredCommands.length)
      } else if (event.key === 'ArrowUp') {
        event.preventDefault()
        setSelectedIndex((prev) => (prev - 1 + filteredCommands.length) % filteredCommands.length)
      } else if (event.key === 'Enter') {
        event.preventDefault()
        if (filteredCommands[selectedIndex]) {
          const command = filteredCommands[selectedIndex]
          if (command.id === 'math' && onInsertMath) {
            onInsertMath()
          } else {
            command.action(editor)
          }
          onClose()
        }
      } else if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, selectedIndex, filteredCommands, editor, onClose, onInsertMath])

  // Scroll selected item into view
  useEffect(() => {
    if (menuRef.current && selectedIndex >= 0) {
      const selectedItem = menuRef.current.children[selectedIndex] as HTMLElement
      if (selectedItem) {
        selectedItem.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
      }
    }
  }, [selectedIndex])

  if (!isOpen || filteredCommands.length === 0) {
    return null
  }

  return (
    <div
      ref={menuRef}
      className="command-menu"
      style={{
        position: 'fixed',
        left: `${position.x}px`,
        top: `${position.y}px`,
      }}
    >
      {filteredCommands.map((command, index) => (
        <button
          key={command.id}
          type="button"
          className={`command-menu-item ${index === selectedIndex ? 'is-selected' : ''}`}
          onClick={() => {
            if (command.id === 'math' && onInsertMath) {
              onInsertMath()
            } else {
              command.action(editor)
            }
            onClose()
          }}
          onMouseEnter={() => setSelectedIndex(index)}
        >
          <span className="command-icon">{command.icon}</span>
          <div className="command-content">
            <span className="command-label">{command.label}</span>
            <span className="command-description">{command.description}</span>
          </div>
        </button>
      ))}
    </div>
  )
}
