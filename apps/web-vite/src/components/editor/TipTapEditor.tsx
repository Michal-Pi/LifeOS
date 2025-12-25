/**
 * TipTap Editor Component
 *
 * Rich text editor with support for:
 * - Markdown formatting
 * - LaTeX/KaTeX math equations
 * - Code blocks with syntax highlighting
 * - Tables, task lists, images
 */

import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import CharacterCount from '@tiptap/extension-character-count'
import Highlight from '@tiptap/extension-highlight'
import Table from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableCell from '@tiptap/extension-table-cell'
import TableHeader from '@tiptap/extension-table-header'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Image from '@tiptap/extension-image'
import Mathematics from '@tiptap/extension-mathematics'
import 'katex/dist/katex.min.css'
import './TipTapEditor.css'

export interface TipTapEditorProps {
  content?: object | string
  placeholder?: string
  editable?: boolean
  onChange?: (content: object) => void
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
      }),
      Mathematics.configure({
        katexOptions: {
          throwOnError: false,
          displayMode: false,
        },
      }),
    ],
    content,
    editable,
    onUpdate: ({ editor }) => {
      // Get JSON content for storage
      const json = editor.getJSON()
      onChange?.(json)

      // Get HTML for display/preview
      const html = editor.getHTML()
      onUpdate?.(html)
    },
    editorProps: {
      attributes: {
        class: 'tiptap-editor',
      },
    },
  })

  return (
    <div className={`tiptap-wrapper ${className}`}>
      <EditorContent editor={editor} />
      {editor && (
        <div className="editor-footer">
          <span className="character-count">
            {editor.storage.characterCount.characters()} characters
          </span>
        </div>
      )}
    </div>
  )
}
