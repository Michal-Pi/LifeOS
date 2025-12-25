/**
 * useNoteOperations Hook
 *
 * Provides CRUD operations for notes using Firestore repositories.
 * Manages note state, loading, and error handling.
 */

import { useState, useCallback, useEffect } from 'react'
import { useAuth } from './useAuth'
import { createFirestoreNoteRepository } from '@/adapters/notes/firestoreNoteRepository'
import type { Note, NoteId, CreateNoteInput, UpdateNoteInput, NoteFilters } from '@lifeos/notes'
import type { JSONContent } from '@tiptap/core'

export interface UseNoteOperationsReturn {
  notes: Note[]
  currentNote: Note | null
  isLoading: boolean
  error: Error | null
  createNote: (input: Omit<CreateNoteInput, 'userId'>) => Promise<Note>
  updateNote: (noteId: NoteId, updates: UpdateNoteInput) => Promise<Note>
  deleteNote: (noteId: NoteId) => Promise<void>
  getNote: (noteId: NoteId) => Promise<Note | null>
  setCurrentNote: (note: Note | null) => void
  listNotes: (filters?: NoteFilters) => Promise<Note[]>
  searchNotes: (query: string) => Promise<Note[]>
  saveNoteContent: (noteId: NoteId, content: JSONContent, html: string) => Promise<void>
}

const noteRepository = createFirestoreNoteRepository()

/**
 * Hook for managing note operations
 */
export function useNoteOperations(): UseNoteOperationsReturn {
  const { user } = useAuth()
  const [notes, setNotes] = useState<Note[]>([])
  const [currentNote, setCurrentNote] = useState<Note | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const userId = user?.uid

  // Create a new note
  const createNote = useCallback(
    async (input: Omit<CreateNoteInput, 'userId'>): Promise<Note> => {
      if (!userId) {
        throw new Error('User not authenticated')
      }

      setIsLoading(true)
      setError(null)

      try {
        const note = await noteRepository.create(userId, {
          ...input,
          content: input.content || { type: 'doc', content: [] },
          topicId: input.topicId || null,
          sectionId: input.sectionId || null,
          projectIds: input.projectIds || [],
          okrIds: input.okrIds || [],
          tags: input.tags || [],
          attachmentIds: input.attachmentIds || [],
        })

        setNotes((prev) => [note, ...prev])
        return note
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to create note')
        setError(error)
        throw error
      } finally {
        setIsLoading(false)
      }
    },
    [userId]
  )

  // Update an existing note
  const updateNote = useCallback(
    async (noteId: NoteId, updates: UpdateNoteInput): Promise<Note> => {
      if (!userId) {
        throw new Error('User not authenticated')
      }

      setIsLoading(true)
      setError(null)

      try {
        const updatedNote = await noteRepository.update(userId, noteId, updates)

        setNotes((prev) => prev.map((n) => (n.noteId === noteId ? updatedNote : n)))

        if (currentNote?.noteId === noteId) {
          setCurrentNote(updatedNote)
        }

        return updatedNote
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to update note')
        setError(error)
        throw error
      } finally {
        setIsLoading(false)
      }
    },
    [userId, currentNote]
  )

  // Delete a note
  const deleteNote = useCallback(
    async (noteId: NoteId): Promise<void> => {
      if (!userId) {
        throw new Error('User not authenticated')
      }

      setIsLoading(true)
      setError(null)

      try {
        await noteRepository.delete(userId, noteId)

        setNotes((prev) => prev.filter((n) => n.noteId !== noteId))

        if (currentNote?.noteId === noteId) {
          setCurrentNote(null)
        }
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to delete note')
        setError(error)
        throw error
      } finally {
        setIsLoading(false)
      }
    },
    [userId, currentNote]
  )

  // Get a single note
  const getNote = useCallback(
    async (noteId: NoteId): Promise<Note | null> => {
      if (!userId) {
        throw new Error('User not authenticated')
      }

      setIsLoading(true)
      setError(null)

      try {
        const note = await noteRepository.get(userId, noteId)

        if (note) {
          // Update last accessed timestamp
          await noteRepository.updateLastAccessed(userId, noteId)
        }

        return note
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to get note')
        setError(error)
        throw error
      } finally {
        setIsLoading(false)
      }
    },
    [userId]
  )

  // List notes with optional filters
  const listNotes = useCallback(
    async (filters?: NoteFilters): Promise<Note[]> => {
      if (!userId) {
        throw new Error('User not authenticated')
      }

      setIsLoading(true)
      setError(null)

      try {
        const fetchedNotes = await noteRepository.list(userId, filters)
        setNotes(fetchedNotes)
        return fetchedNotes
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to list notes')
        setError(error)
        throw error
      } finally {
        setIsLoading(false)
      }
    },
    [userId]
  )

  // Search notes
  const searchNotes = useCallback(
    async (query: string): Promise<Note[]> => {
      if (!userId) {
        throw new Error('User not authenticated')
      }

      setIsLoading(true)
      setError(null)

      try {
        const results = await noteRepository.search(userId, query)
        return results
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to search notes')
        setError(error)
        throw error
      } finally {
        setIsLoading(false)
      }
    },
    [userId]
  )

  // Save note content (for auto-save)
  const saveNoteContent = useCallback(
    async (noteId: NoteId, content: JSONContent, html: string): Promise<void> => {
      if (!userId) {
        throw new Error('User not authenticated')
      }

      await noteRepository.update(userId, noteId, {
        content,
        contentHtml: html,
      })

      // Update local state
      setNotes((prev) =>
        prev.map((n) =>
          n.noteId === noteId
            ? { ...n, content, contentHtml: html, updatedAtMs: Date.now() }
            : n
        )
      )

      if (currentNote?.noteId === noteId) {
        setCurrentNote((prev) =>
          prev ? { ...prev, content, contentHtml: html, updatedAtMs: Date.now() } : null
        )
      }
    },
    [userId, currentNote]
  )

  // Load initial notes when user is authenticated
  useEffect(() => {
    if (userId) {
      listNotes().catch(console.error)
    }
  }, [userId, listNotes])

  return {
    notes,
    currentNote,
    isLoading,
    error,
    createNote,
    updateNote,
    deleteNote,
    getNote,
    setCurrentNote,
    listNotes,
    searchNotes,
    saveNoteContent,
  }
}
