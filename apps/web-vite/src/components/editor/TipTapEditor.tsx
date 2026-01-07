/**
 * TipTap Editor Component
 *
 * Rich text editor with support for:
 * - Markdown formatting
 * - LaTeX/KaTeX math equations
 * - Code blocks with syntax highlighting
 * - Tables, task lists, images
 */

import { useEditor, EditorContent, type JSONContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import CharacterCount from '@tiptap/extension-character-count'
import Highlight from '@tiptap/extension-highlight'
import { Table } from '@tiptap/extension-table'
import { TableRow } from '@tiptap/extension-table-row'
import { TableCell } from '@tiptap/extension-table-cell'
import { TableHeader } from '@tiptap/extension-table-header'
import { TaskList } from '@tiptap/extension-task-list'
import { TaskItem } from '@tiptap/extension-task-item'
import { Image } from '@tiptap/extension-image'
import { Mathematics } from '@tiptap/extension-mathematics'
import Superscript from '@tiptap/extension-superscript'
import Subscript from '@tiptap/extension-subscript'
import { TextStyle } from '@tiptap/extension-text-style'
import { FontFamily } from './extensions/FontFamily'
import { FontSize } from './extensions/FontSize'
import { useEffect, useState } from 'react'
import { TipTapMenuBar } from './TipTapMenuBar'
import { DragDropContext } from './ux/DragDropContext'
import { NodeDividerContainer } from './ux/NodeDividerContainer'
import { CommandMenu } from './ux/CommandMenu'
import { VirtualizedEditor } from './ux/VirtualizedEditor'
import 'katex/dist/katex.min.css'
import './TipTapEditor.css'

export interface TipTapEditorProps {
  content?: JSONContent | string
  placeholder?: string
  editable?: boolean
  onChange?: (content: JSONContent) => void
  onUpdate?: (html: string) => void
  className?: string
}

export function TipTapEditor({
  content,
  placeholder = 'Start writing...',
  editable = true,
  onChange,
  onUpdate,
  className = '',
}: TipTapEditorProps) {
  const [commandMenuState, setCommandMenuState] = useState<{
    isOpen: boolean
    query: string
    position: { x: number; y: number }
  } | null>(null)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3, 4, 5, 6],
        },
        codeBlock: {
          HTMLAttributes: {
            class: 'code-block',
          },
        },
      }),
      Placeholder.configure({
        placeholder,
      }),
      CharacterCount,
      Highlight.configure({
        multicolor: true,
      }),
      Table.configure({
        resizable: true,
      }),
      TableRow,
      TableCell,
      TableHeader,
      TaskList,
      TaskItem.configure({
        nested: true,
      }),
      Image.configure({
        inline: true,
        allowBase64: true,
        HTMLAttributes: {
          class: 'tiptap-image',
        },
      }),
      Mathematics.configure({
        katexOptions: {
          throwOnError: false,
          displayMode: false,
        },
      }),
      TextStyle,
      FontFamily.configure({
        types: ['paragraph', 'heading'],
      }),
      FontSize.configure({
        types: ['paragraph', 'heading'],
      }),
      Superscript,
      Subscript,
    ],
    content,
    editable,
    onUpdate: ({ editor }) => {
      // Debounce updates for performance
      const updateContent = () => {
        // Get JSON content for storage
        const json = editor.getJSON()
        onChange?.(json)

        // Get HTML for display/preview
        const html = editor.getHTML()
        onUpdate?.(html)
      }

      // Use requestAnimationFrame for smooth updates
      requestAnimationFrame(updateContent)
    },
    editorProps: {
      attributes: {
        class: 'tiptap-editor',
        role: 'textbox',
        'aria-label': placeholder,
        'aria-multiline': 'true',
      },
      handleKeyDown: (view, event) => {
        const { state } = view
        const { selection } = state
        const { $from } = selection

        // Slash command menu
        if (event.key === '/' && !commandMenuState?.isOpen) {
          // Check if we're at the start of a paragraph or empty paragraph
          const isAtStart = $from.parentOffset === 0
          const isEmpty = $from.parent.content.size === 0
          const isParagraph = $from.parent.type.name === 'paragraph'

          if ((isAtStart || isEmpty) && isParagraph) {
            event.preventDefault()

            // Get cursor position for menu placement
            const coords = view.coordsAtPos($from.pos)
            setCommandMenuState({
              isOpen: true,
              query: '',
              position: { x: coords.left, y: coords.bottom + 8 },
            })

            return true
          }
        }

        // Handle command menu when open
        if (commandMenuState?.isOpen) {
          // Close on Escape
          if (event.key === 'Escape') {
            event.preventDefault()
            setCommandMenuState(null)
            return true
          }

          // Don't intercept arrow keys, Enter - let CommandMenu handle them
          if (['ArrowUp', 'ArrowDown', 'Enter'].includes(event.key)) {
            return false
          }

          // Update query as user types (but don't prevent default for backspace, etc.)
          if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
            if (event.key === '/') {
              // Close menu if / is typed again
              event.preventDefault()
              setCommandMenuState(null)
              return true
            }

            // Update query and prevent default to avoid inserting the character
            event.preventDefault()
            setCommandMenuState((prev) =>
              prev
                ? {
                    ...prev,
                    query: prev.query + event.key,
                  }
                : null
            )
            return true
          }

          // Handle backspace in query
          if (event.key === 'Backspace' && commandMenuState.query.length > 0) {
            event.preventDefault()
            setCommandMenuState((prev) =>
              prev
                ? {
                    ...prev,
                    query: prev.query.slice(0, -1),
                  }
                : null
            )
            return true
          }
        }

        // Enter key override: Create new top-level node instead of line break
        if (event.key === 'Enter' && !event.shiftKey) {
          // Close command menu if open
          if (commandMenuState?.isOpen) {
            setCommandMenuState(null)
          }
          const { state } = view
          const { selection } = state
          const { $from } = selection

          // Don't override in these contexts:
          // 1. Inside code blocks (Enter should create new line)
          if (editor.isActive('codeBlock')) {
            return false
          }

          // 2. Inside tables (Enter should move to next cell)
          if (editor.isActive('table')) {
            return false
          }

          // 3. Inside lists (Enter should create new list item - keep default behavior)
          if (
            editor.isActive('bulletList') ||
            editor.isActive('orderedList') ||
            editor.isActive('taskList')
          ) {
            // Only override if we're at the end of an empty list item
            const isListItem = $from.parent.type.name === 'listItem'
            const isAtEnd = $from.parentOffset === $from.parent.content.size
            const isEmpty = $from.parent.content.size === 0

            // If empty list item at end, create new paragraph instead
            if (isListItem && isAtEnd && isEmpty) {
              event.preventDefault()
              editor
                .chain()
                .focus()
                .liftListItem('listItem')
                .insertContent({ type: 'paragraph' })
                .run()
              return true
            }
            // Otherwise, let default list behavior handle it
            return false
          }

          // Check if we're at the end of a top-level node
          const isTopLevel = $from.depth === 1
          const isAtEnd = $from.parentOffset === $from.parent.content.size
          const isEmpty = $from.parent.content.size === 0

          // If at end of top-level node (or empty), create new paragraph
          if (isTopLevel && (isAtEnd || isEmpty)) {
            event.preventDefault()

            // Calculate position after current node
            const currentNodeStart = $from.start($from.depth)
            const currentNodeSize = $from.parent.nodeSize
            const nextNodePos = currentNodeStart + currentNodeSize

            // Insert new paragraph after current node
            editor
              .chain()
              .focus()
              .insertContentAt(nextNodePos, { type: 'paragraph' })
              .setTextSelection(nextNodePos + 1) // Position cursor in new paragraph
              .run()

            return true
          }
        }

        // Tab key for nesting lists
        if (event.key === 'Tab' && !event.shiftKey) {
          // Sink list item (nest deeper)
          if (editor.isActive('listItem')) {
            event.preventDefault()
            editor.chain().focus().sinkListItem('listItem').run()
            return true
          }
        }

        // Shift+Tab to lift list item (unnest)
        if (event.key === 'Tab' && event.shiftKey) {
          if (editor.isActive('listItem')) {
            event.preventDefault()
            editor.chain().focus().liftListItem('listItem').run()
            return true
          }
        }

        return false
      },
      handleDrop: (view, event, slice, moved) => {
        if (
          !moved &&
          event.dataTransfer &&
          event.dataTransfer.files &&
          event.dataTransfer.files[0]
        ) {
          const file = event.dataTransfer.files[0]

          // Handle image files
          if (file.type.startsWith('image/')) {
            event.preventDefault()

            const reader = new FileReader()
            reader.onload = (e) => {
              const src = e.target?.result as string
              if (src && editor) {
                editor.chain().focus().setImage({ src }).run()
              }
            }
            reader.readAsDataURL(file)

            return true
          }
        }
        return false
      },
      handlePaste: (view, event) => {
        const items = event.clipboardData?.items
        if (!items) return false

        for (let i = 0; i < items.length; i++) {
          const item = items[i]
          if (item.type.startsWith('image/')) {
            event.preventDefault()
            const file = item.getAsFile()
            if (file && editor) {
              const reader = new FileReader()
              reader.onload = (e) => {
                const src = e.target?.result as string
                if (src) {
                  editor.chain().focus().setImage({ src }).run()
                }
              }
              reader.readAsDataURL(file)
              return true
            }
          }
        }
        return false
      },
    },
  })

  // Update content when prop changes
  useEffect(() => {
    if (editor && content !== undefined && !editor.isDestroyed) {
      const currentContent = editor.getJSON()
      // Only update if content has actually changed to avoid cursor jumps
      if (JSON.stringify(currentContent) !== JSON.stringify(content)) {
        editor.commands.setContent(content)
      }
    }
  }, [editor, content])

  // Cleanup editor on unmount
  useEffect(() => {
    return () => {
      editor?.destroy()
    }
  }, [editor])

  const handleCommandMenuClose = () => {
    setCommandMenuState(null)
    // Remove the "/" and query from the editor
    if (editor) {
      const { state } = editor.view
      const { $from } = state.selection
      const queryLength = commandMenuState?.query.length || 0
      const totalLength = 1 + queryLength // "/" + query

      if ($from.parentOffset >= totalLength) {
        editor
          .chain()
          .focus()
          .deleteRange({ from: $from.pos - totalLength, to: $from.pos })
          .run()
      }
    }
  }

  return (
    <div className={`tiptap-wrapper ${className}`}>
      {editor && editable && <TipTapMenuBar editor={editor} />}
      {editor ? (
        <VirtualizedEditor editor={editor}>
          <DragDropContext editor={editor}>
            <div className="editor-content-wrapper">
              <EditorContent editor={editor} />
              <NodeDividerContainer editor={editor} />
            </div>
          </DragDropContext>
        </VirtualizedEditor>
      ) : (
        <EditorContent editor={editor} />
      )}
      {commandMenuState && editor && (
        <CommandMenu
          editor={editor}
          isOpen={commandMenuState.isOpen}
          onClose={handleCommandMenuClose}
          position={commandMenuState.position}
          query={commandMenuState.query}
        />
      )}
      {editor && (
        <div className="editor-footer">
          <span className="character-count" aria-live="polite" aria-atomic="true">
            {editor.storage.characterCount.characters()} characters
          </span>
        </div>
      )}
    </div>
  )
}
