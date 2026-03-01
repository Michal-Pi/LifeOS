/**
 * useMailboxReplyEditor Hook
 *
 * Lightweight TipTap editor instance for inline mailbox replies.
 * Returns the editor (shared between toolbar and EditorContent),
 * plus helpers to programmatically set/clear content (e.g. from AI drafts).
 */

import { useEditor, type JSONContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Highlight from '@tiptap/extension-highlight'
import { TaskList } from '@tiptap/extension-task-list'
import { TaskItem } from '@tiptap/extension-task-item'
import { Link } from '@tiptap/extension-link'
import { useRef, useCallback, useEffect } from 'react'
import { extractTextFromJSON } from '@/lib/tiptapUtils'

interface UseMailboxReplyEditorOptions {
  placeholder?: string
  onChange?: (json: JSONContent, text: string) => void
}

export function useMailboxReplyEditor(options: UseMailboxReplyEditorOptions = {}) {
  const { placeholder = 'Write your reply...', onChange } = options

  const onChangeRef = useRef(onChange)
  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  const debounceRef = useRef<ReturnType<typeof setTimeout>>()

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: false, // Using standalone Link extension below
      }),
      Link.configure({ openOnClick: false }),
      Placeholder.configure({ placeholder }),
      Highlight,
      TaskList,
      TaskItem.configure({ nested: true }),
    ],
    editorProps: {
      attributes: {
        class: 'mailbox-reply-editor',
        role: 'textbox',
        'aria-label': placeholder,
        'aria-multiline': 'true',
      },
    },
    onUpdate: ({ editor: ed }) => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        if (ed.isDestroyed) return
        const json = ed.getJSON()
        const text = extractTextFromJSON(json)
        onChangeRef.current?.(json, text)
      }, 200)
    },
  })

  const setContent = useCallback(
    (content: JSONContent | string) => {
      if (editor && !editor.isDestroyed) {
        editor.commands.setContent(content)
      }
    },
    [editor]
  )

  const clearContent = useCallback(() => {
    if (editor && !editor.isDestroyed) {
      editor.commands.clearContent()
    }
  }, [editor])

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  return { editor, setContent, clearContent }
}
