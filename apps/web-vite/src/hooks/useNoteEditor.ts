/**
 * useNoteEditor Hook
 *
 * Manages editor state and persistence for notes.
 * Handles auto-save, content conversion, and editor lifecycle.
 */

import { useState, useCallback, useEffect, useRef } from 'react'
import type { Note } from '@lifeos/notes'

export interface UseNoteEditorOptions {
  note?: Note
  autoSaveDelay?: number
  onSave?: (content: object, html: string) => Promise<void>
  onChange?: (content: object, html: string) => void
}

export interface UseNoteEditorReturn {
  content: object | undefined
  html: string
  isDirty: boolean
  isSaving: boolean
  lastSaved: Date | null
  handleContentChange: (content: object) => void
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
  const [content, setContent] = useState<object | undefined>(note?.content)
  const [html, setHtml] = useState<string>(note?.contentHtml || '')
  const [isDirty, setIsDirty] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [lastSaved, setLastSaved] = useState<Date | null>(null)

  const autoSaveTimer = useRef<NodeJS.Timeout>()
  const initialContent = useRef(note?.content)
  const onSaveRef = useRef(onSave)
  const onChangeRef = useRef(onChange)

  // Keep refs up to date
  useEffect(() => {
    onSaveRef.current = onSave
    onChangeRef.current = onChange
  }, [onSave, onChange])

  // Save function
  const save = useCallback(async () => {
    if (!content || !onSaveRef.current || isSaving) {
      return
    }

    setIsSaving(true)

    try {
      await onSaveRef.current(content, html)
      setIsDirty(false)
      setLastSaved(new Date())
    } catch (error) {
      console.error('Failed to save note:', error)
      throw error
    } finally {
      setIsSaving(false)
    }
  }, [content, html, isSaving])

  // Handle content changes
  const handleContentChange = useCallback(
    (newContent: object) => {
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

      // Notify onChange callback
      onChangeRef.current?.(newContent, html)
    },
    [html, autoSaveDelay, save]
  )

  // Handle HTML changes
  const handleHtmlChange = useCallback(
    (newHtml: string) => {
      setHtml(newHtml)
    },
    []
  )

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
    setContent(note?.content)
    setHtml(note?.contentHtml || '')
    setIsDirty(false)
    initialContent.current = note?.content

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
    handleContentChange,
    handleHtmlChange,
    save,
    reset,
  }
}
