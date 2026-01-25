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
import { Link } from '@tiptap/extension-link'
import { FontFamily } from './extensions/FontFamily'
import { FontSize } from './extensions/FontSize'
import { TextColor } from './extensions/TextColor'
import { NoteLink } from './extensions/NoteLink'
import { ParagraphTag } from './extensions/ParagraphTag'
import { useEffect, useState, useRef } from 'react'
import type { Note, TopicId } from '@lifeos/notes'
import { TipTapMenuBar } from './TipTapMenuBar'
import { DragDropContext } from './ux/DragDropContext'
import { NodeDividerContainer } from './ux/NodeDividerContainer'
import { CommandMenu } from './ux/CommandMenu'
import { MathInlinePanel } from './ux/MathInlinePanel'
import { NoteLinkAutocomplete } from './ux/NoteLinkAutocomplete'
import { ParagraphTagMenu } from './ux/ParagraphTagMenu'
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
  availableNotes?: Note[]
  availableTopics?: Array<{ topicId: TopicId; name: string }>
  onNoteLinkClick?: (noteId: string) => void
  onParagraphTag?: (tagType: 'note' | 'topic', id: string) => void
}

export function TipTapEditor({
  content,
  placeholder = 'Type "/" for commands, or click + to add a block',
  editable = true,
  onChange,
  onUpdate,
  className = '',
  availableNotes = [],
  availableTopics = [],
  onNoteLinkClick,
  onParagraphTag,
}: TipTapEditorProps) {
  const [commandMenuState, setCommandMenuState] = useState<{
    isOpen: boolean
    query: string
    position: { x: number; y: number }
  } | null>(null)
  const [mathPanelState, setMathPanelState] = useState<{
    isOpen: boolean
    position: { x: number; y: number }
  } | null>(null)
  const [noteLinkAutocompleteState, setNoteLinkAutocompleteState] = useState<{
    isOpen: boolean
    query: string
    position: { x: number; y: number }
    startPos: number // Position where [[ starts
  } | null>(null)
  const [paragraphTagMenuState, setParagraphTagMenuState] = useState<{
    isOpen: boolean
    position: { x: number; y: number }
  } | null>(null)
  const lastCharRef = useRef<string>('') // Track last character for [[ detection

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3, 4],
        },
        codeBlock: {
          HTMLAttributes: {
            class: 'code-block',
          },
        },
        link: false, // Disable StarterKit's Link, we'll add our own
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'tiptap-link',
        },
      }),
      NoteLink.configure({
        availableNotes,
        onNoteClick: onNoteLinkClick,
      }),
      ParagraphTag.configure({
        availableNotes,
        availableTopics,
        onTagClick: onParagraphTag,
      }),
      Placeholder.configure({
        placeholder,
      }),
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
      TextColor,
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

        // Note link autocomplete: Detect [[ typing
        if (
          event.key === '[' &&
          lastCharRef.current === '[' &&
          !noteLinkAutocompleteState?.isOpen &&
          !commandMenuState?.isOpen &&
          availableNotes.length > 0
        ) {
          // Don't prevent default - let the second [ be inserted
          // Get cursor position for menu placement after insertion
          setTimeout(() => {
            const newState = editor.view.state
            const newFrom = newState.selection.$from
            const coords = editor.view.coordsAtPos(newFrom.pos)
            const startPos = newFrom.pos - 2 // Position of first [
            setNoteLinkAutocompleteState({
              isOpen: true,
              query: '',
              position: { x: coords.left, y: coords.bottom + 8 },
              startPos,
            })
          }, 0)
          lastCharRef.current = ''
          return false // Let the character be inserted
        }

        // Update last character for [[ detection
        if (event.key === '[' && !commandMenuState?.isOpen && !noteLinkAutocompleteState?.isOpen) {
          lastCharRef.current = '['
          return false // Let the character be inserted
        } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
          lastCharRef.current = event.key
        } else {
          lastCharRef.current = ''
        }

        // Handle note link autocomplete when open
        if (noteLinkAutocompleteState?.isOpen) {
          // Close on Escape
          if (event.key === 'Escape') {
            event.preventDefault()
            handleNoteLinkAutocompleteClose()
            return true
          }

          // Don't intercept arrow keys, Enter - let NoteLinkAutocomplete handle them
          if (['ArrowUp', 'ArrowDown', 'Enter'].includes(event.key)) {
            return false
          }

          // Update query as user types
          if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
            if (event.key === ']') {
              // If ] is typed, close autocomplete
              event.preventDefault()
              handleNoteLinkAutocompleteClose()
              return true
            }

            // Update query and let character be inserted
            const newQuery = noteLinkAutocompleteState.query + event.key
            setNoteLinkAutocompleteState((prev) =>
              prev
                ? {
                    ...prev,
                    query: newQuery,
                  }
                : null
            )
            return false // Let character be inserted
          }

          // Handle backspace in query
          if (event.key === 'Backspace') {
            if (noteLinkAutocompleteState.query.length > 0) {
              // Update query and let backspace happen
              setNoteLinkAutocompleteState((prev) =>
                prev
                  ? {
                      ...prev,
                      query: prev.query.slice(0, -1),
                    }
                  : null
              )
              return false // Let backspace happen
            } else {
              // If query is empty, close autocomplete
              event.preventDefault()
              handleNoteLinkAutocompleteClose()
              // Remove the [[ from editor
              if (editor) {
                const { state } = editor.view
                const { $from } = state.selection
                if ($from.pos >= noteLinkAutocompleteState.startPos + 2) {
                  editor
                    .chain()
                    .focus()
                    .deleteRange({ from: noteLinkAutocompleteState.startPos, to: $from.pos })
                    .run()
                }
              }
              return true
            }
          }
        }

        // Slash command menu
        if (event.key === '/' && !commandMenuState?.isOpen && !noteLinkAutocompleteState?.isOpen) {
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

        // Enter key: Close command menu if open, otherwise let default behavior (line break)
        if (event.key === 'Enter' && !event.shiftKey) {
          // Close command menu if open
          if (commandMenuState?.isOpen) {
            setCommandMenuState(null)
            // Don't prevent default - let Enter work normally
          }
          // Let TipTap handle Enter normally (creates line breaks)
          return false
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

        // Cmd/Ctrl+T: Open paragraph tag menu
        if (
          (event.metaKey || event.ctrlKey) &&
          event.key === 't' &&
          !event.shiftKey &&
          (availableNotes.length > 0 || availableTopics.length > 0)
        ) {
          event.preventDefault()
          const coords = view.coordsAtPos($from.pos)
          setParagraphTagMenuState({
            isOpen: true,
            position: { x: coords.left, y: coords.bottom + 8 },
          })
          return true
        }

        // Cmd/Ctrl+K: Open note link autocomplete (if available notes provided)
        if ((event.metaKey || event.ctrlKey) && event.key === 'k' && availableNotes.length > 0) {
          event.preventDefault()
          const { from, to } = editor.state.selection
          const text = editor.state.doc.textBetween(from, to)

          if (text) {
            // If text is selected, insert [[text and open autocomplete
            editor.chain().focus().deleteRange({ from, to }).insertContent(`[[${text}`).run()
            // Wait for editor to update, then open autocomplete
            setTimeout(() => {
              const newPos = editor.state.selection.$from.pos
              const newCoords = editor.view.coordsAtPos(newPos)
              setNoteLinkAutocompleteState({
                isOpen: true,
                query: text,
                position: { x: newCoords.left, y: newCoords.bottom + 8 },
                startPos: newPos - text.length - 2, // Position of first [
              })
            }, 0)
          } else {
            // Otherwise insert [[ and open autocomplete
            editor.chain().focus().insertContent('[[').run()
            setTimeout(() => {
              const newPos = editor.state.selection.$from.pos
              const newCoords = editor.view.coordsAtPos(newPos)
              setNoteLinkAutocompleteState({
                isOpen: true,
                query: '',
                position: { x: newCoords.left, y: newCoords.bottom + 8 },
                startPos: newPos - 2, // Position of first [
              })
            }, 0)
          }
          return true
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

  const openMathPanel = (position?: { x: number; y: number }) => {
    const fallbackPosition = position ?? {
      x: Math.max(16, window.innerWidth / 2 - 180),
      y: Math.max(16, window.innerHeight / 2 - 120),
    }
    setMathPanelState({ isOpen: true, position: fallbackPosition })
  }

  const handleInsertMathFromCommand = () => {
    const position = commandMenuState?.position
    handleCommandMenuClose()
    openMathPanel(position ? { x: position.x, y: position.y + 4 } : undefined)
  }

  const handleNoteLinkAutocompleteClose = () => {
    setNoteLinkAutocompleteState(null)
    lastCharRef.current = ''
    // Note: We don't remove the [[ text from the editor - user can continue typing or delete it manually
  }

  const handleNoteLinkSelect = (noteId: string, noteTitle: string) => {
    if (!editor || !noteLinkAutocompleteState) return

    const { state } = editor.view
    const { $from } = state.selection
    const startPos = noteLinkAutocompleteState.startPos
    const currentPos = $from.pos

    // Replace [[query with note title and convert to note link
    // Delete everything from startPos (first [) to currentPos
    editor
      .chain()
      .focus()
      .deleteRange({ from: startPos, to: currentPos })
      .insertContent(noteTitle) // Insert just the title text
      .run()

    // Convert the inserted text to a note link after a short delay
    setTimeout(() => {
      const newState = editor.view.state
      const { $from: newFrom } = newState.selection
      const textStart = newFrom.pos - noteTitle.length
      const textEnd = newFrom.pos

      // Select the text and convert it to a note link
      editor
        .chain()
        .focus()
        .setTextSelection({ from: textStart, to: textEnd })
        .setNoteLink({ href: `note://${noteId}`, noteId })
        .run()
    }, 10)

    handleNoteLinkAutocompleteClose()
  }

  return (
    <div className={`tiptap-wrapper ${className}`}>
      {editor && editable && (
        <TipTapMenuBar editor={editor} onOpenMathPanel={(position) => openMathPanel(position)} />
      )}
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
          onInsertMath={handleInsertMathFromCommand}
        />
      )}
      {mathPanelState && editor && (
        <MathInlinePanel
          editor={editor}
          isOpen={mathPanelState.isOpen}
          position={mathPanelState.position}
          onClose={() => setMathPanelState(null)}
        />
      )}
      {noteLinkAutocompleteState && editor && availableNotes.length > 0 && (
        <NoteLinkAutocomplete
          editor={editor}
          isOpen={noteLinkAutocompleteState.isOpen}
          onClose={handleNoteLinkAutocompleteClose}
          position={noteLinkAutocompleteState.position}
          query={noteLinkAutocompleteState.query}
          availableNotes={availableNotes}
          onSelectNote={handleNoteLinkSelect}
        />
      )}
      {paragraphTagMenuState &&
        editor &&
        (availableNotes.length > 0 || availableTopics.length > 0) && (
          <ParagraphTagMenu
            editor={editor}
            isOpen={paragraphTagMenuState.isOpen}
            onClose={() => setParagraphTagMenuState(null)}
            position={paragraphTagMenuState.position}
            availableNotes={availableNotes}
            availableTopics={availableTopics}
            onTagSelect={handleParagraphTagSelect}
          />
        )}
    </div>
  )
}
