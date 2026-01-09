/**
 * useNoteEditor Hook
 *
 * Manages editor state and persistence for notes.
 * Handles auto-save, content conversion, and editor lifecycle.
 */

import { useState, useCallback, useEffect, useRef } from 'react'
import type { Note } from '@lifeos/notes'
import type { JSONContent } from '@tiptap/core'
import { sanitizeNoteContent } from '@/notes/noteContent'

export interface UseNoteEditorOptions {
  note?: Note
  autoSaveDelay?: number
  onSave?: (content: JSONContent, html: string) => Promise<void>
  onChange?: (content: JSONContent, html: string) => void
}

export interface UseNoteEditorReturn {
  content: JSONContent | undefined
  html: string
  isDirty: boolean
  isSaving: boolean
  lastSaved: Date | null
  error: Error | null
  handleContentChange: (content: JSONContent) => void
  handleHtmlChange: (html: string) => void
  save: () => Promise<void>
  reset: () => void
}

/**
 * Hook for managing note editor state
 */
export function useNoteEditor({
  note,
  autoSaveDelay = 2000,
  onSave,
  onChange,
}: UseNoteEditorOptions): UseNoteEditorReturn {
  const [content, setContent] = useState<JSONContent | undefined>(() =>
    sanitizeNoteContent(note?.content as JSONContent)
  )
  const [html, setHtml] = useState<string>(note?.contentHtml || '')
  const [isDirty, setIsDirty] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const [error, setError] = useState<Error | null>(null)

  const autoSaveTimer = useRef<ReturnType<typeof setTimeout>>()
  const initialContent = useRef(note?.content)
  const onSaveRef = useRef(onSave)
  const onChangeRef = useRef(onChange)
  const htmlRef = useRef(html)

  // Keep refs up to date
  useEffect(() => {
    onSaveRef.current = onSave
    onChangeRef.current = onChange
    htmlRef.current = html
  }, [onSave, onChange, html])

  // Save function
  const save = useCallback(async () => {
    if (!content || !onSaveRef.current || isSaving) {
      return
    }

    setIsSaving(true)
    setError(null)

    try {
      await onSaveRef.current(content, htmlRef.current)
      setIsDirty(false)
      setLastSaved(new Date())
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to save note')
      setError(error)
      console.error('Failed to save note:', error)
      throw error
    } finally {
      setIsSaving(false)
    }
  }, [content, isSaving])

  // Handle content changes
  const handleContentChange = useCallback(
    (newContent: JSONContent) => {
      setContent(newContent)
      setIsDirty(true)

      // Clear existing auto-save timer
      if (autoSaveTimer.current) {
        clearTimeout(autoSaveTimer.current)
      }

      // Schedule auto-save
      if (onSaveRef.current && autoSaveDelay > 0) {
        autoSaveTimer.current = setTimeout(() => {
          save()
        }, autoSaveDelay)
      }

      // Notify onChange callback with current HTML from ref
      onChangeRef.current?.(newContent, htmlRef.current)
    },
    [autoSaveDelay, save]
  )

  // Handle HTML changes
  const handleHtmlChange = useCallback((newHtml: string) => {
    setHtml(newHtml)
  }, [])

  // Reset to initial state
  const reset = useCallback(() => {
    setContent(initialContent.current)
    setHtml(note?.contentHtml || '')
    setIsDirty(false)

    if (autoSaveTimer.current) {
      clearTimeout(autoSaveTimer.current)
    }
  }, [note?.contentHtml])

  // Update when note changes
  useEffect(() => {
    const sanitized = sanitizeNoteContent(note?.content as JSONContent)
    setContent(sanitized)
    setHtml(note?.contentHtml || '')
    setIsDirty(false)
    initialContent.current = sanitized

    if (note?.updatedAtMs) {
      setLastSaved(new Date(note.updatedAtMs))
    }
  }, [note?.noteId, note?.content, note?.contentHtml, note?.updatedAtMs])

  // Cleanup auto-save timer on unmount
  useEffect(() => {
    return () => {
      if (autoSaveTimer.current) {
        clearTimeout(autoSaveTimer.current)
      }
    }
  }, [])

  return {
    content,
    html,
    isDirty,
    isSaving,
    lastSaved,
    error,
    handleContentChange,
    handleHtmlChange,
    save,
    reset,
  }
}
