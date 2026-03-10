/**
 * useNoteOperations Hook
 *
 * Provides CRUD operations for notes using Firestore repositories.
 * Manages note state, loading, and error handling.
 */

import { useState, useCallback, useEffect } from 'react'
import { useAuth } from './useAuth'
import { newId } from '@lifeos/core'
import type {
  Note,
  NoteId,
  CreateNoteInput,
  UpdateNoteInput,
  NoteFilters,
  AttachmentId,
} from '@lifeos/notes'
import type { JSONContent } from '@tiptap/core'
import {
  saveNoteLocally,
  deleteNoteLocally,
  getNoteLocally,
  listNotesLocally,
  searchNotesLocally,
} from '@/notes/offlineStore'
import { enqueueNoteOp } from '@/notes/noteOutbox'
import { isNoteEmptyDraft, sanitizeNoteContent } from '@/notes/noteContent'

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
  updateProjectLinks: (noteId: NoteId, projectIds: string[]) => Promise<Note>
  updateChapterLinks: (noteId: NoteId, chapterIds: string[]) => Promise<Note>
  updateOKRLinks: (noteId: NoteId, okrIds: string[]) => Promise<Note>
  updateAttachments: (noteId: NoteId, attachmentIds: AttachmentId[]) => Promise<Note>
  updateTags: (noteId: NoteId, tags: string[]) => Promise<Note>
}

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
        const now = Date.now()
        const sanitizedContent = sanitizeNoteContent(input.content)
        const note: Note = {
          ...input,
          noteId: newId<'note'>('note'),
          userId,
          content: sanitizedContent || { type: 'doc', content: [] },
          topicId: input.topicId || null,
          sectionId: input.sectionId || null,
          projectIds: input.projectIds || [],
          chapterIds: input.chapterIds || [],
          okrIds: input.okrIds || [],
          tags: input.tags || [],
          attachmentIds: input.attachmentIds || [],
          linkedNoteIds: input.linkedNoteIds || [],
          backlinkNoteIds: input.backlinkNoteIds || [],
          mentionedNoteIds: input.mentionedNoteIds || [],
          createdAtMs: now,
          updatedAtMs: now,
          lastAccessedAtMs: now,
          syncState: 'pending',
          version: 1,
          archived: input.archived ?? false,
        }

        setNotes((prev) => [note, ...prev])
        await saveNoteLocally(note)
        try {
          await enqueueNoteOp('create', userId, note.noteId, { note })
        } catch (err) {
          await saveNoteLocally({ ...note, syncState: 'failed' })
          setNotes((prev) =>
            prev.map((n) => (n.noteId === note.noteId ? { ...note, syncState: 'failed' } : n))
          )
          throw err
        }
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
        const existingNote =
          notes.find((n) => n.noteId === noteId) ?? (await getNoteLocally(noteId))
        if (!existingNote) {
          throw new Error(`Note ${noteId} not found`)
        }
        const now = Date.now()
        const updatePayload: UpdateNoteInput = { ...updates }
        if (Object.prototype.hasOwnProperty.call(updates, 'content')) {
          updatePayload.content = sanitizeNoteContent(updates.content)
        }
        const updatedNote: Note = {
          ...existingNote,
          ...updatePayload,
          updatedAtMs: now,
          version: existingNote.version + 1,
          syncState: 'pending',
        }

        setNotes((prev) => prev.map((n) => (n.noteId === noteId ? updatedNote : n)))
        await saveNoteLocally(updatedNote)
        try {
          await enqueueNoteOp(
            'update',
            userId,
            noteId,
            {
              noteId,
              updates: updatePayload,
            },
            existingNote.version,
            existingNote.updatedAtMs
          )
        } catch (err) {
          await saveNoteLocally({ ...updatedNote, syncState: 'failed' })
          setNotes((prev) =>
            prev.map((n) => (n.noteId === noteId ? { ...updatedNote, syncState: 'failed' } : n))
          )
          throw err
        }

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
    [userId, currentNote, notes]
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
        const existingNote =
          notes.find((n) => n.noteId === noteId) ?? (await getNoteLocally(noteId))
        await deleteNoteLocally(noteId)
        setNotes((prev) => prev.filter((n) => n.noteId !== noteId))
        try {
          await enqueueNoteOp('delete', userId, noteId, { noteId })
        } catch (err) {
          if (existingNote) {
            await saveNoteLocally({ ...existingNote, syncState: 'failed' })
            setNotes((prev) => [existingNote, ...prev])
          }
          throw err
        }

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
    [userId, currentNote, notes]
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
        const note = await getNoteLocally(noteId)

        if (note) {
          const updated = { ...note, lastAccessedAtMs: Date.now() }
          await saveNoteLocally(updated)
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
        let fetchedNotes = await listNotesLocally(userId)
        if (filters?.topicId) {
          fetchedNotes = fetchedNotes.filter((note) => note.topicId === filters.topicId)
        }
        if (filters?.sectionId) {
          fetchedNotes = fetchedNotes.filter((note) => note.sectionId === filters.sectionId)
        }
        if (filters?.tags && filters.tags.length > 0) {
          fetchedNotes = fetchedNotes.filter((note) =>
            filters.tags!.some((tag) => note.tags.includes(tag))
          )
        }
        if (filters?.projectIds && filters.projectIds.length > 0) {
          fetchedNotes = fetchedNotes.filter((note) =>
            filters.projectIds!.some((projectId) => note.projectIds.includes(projectId))
          )
        }
        if (filters?.okrIds && filters.okrIds.length > 0) {
          fetchedNotes = fetchedNotes.filter((note) =>
            filters.okrIds!.some((okrId) => note.okrIds.includes(okrId))
          )
        }
        if (filters?.searchQuery) {
          const lowerQuery = filters.searchQuery.toLowerCase()
          fetchedNotes = fetchedNotes.filter(
            (note) =>
              note.title.toLowerCase().includes(lowerQuery) ||
              note.contentHtml?.toLowerCase().includes(lowerQuery) ||
              note.tags.some((tag) => tag.toLowerCase().includes(lowerQuery))
          )
        }
        if (typeof filters?.archived === 'boolean') {
          fetchedNotes = fetchedNotes.filter((note) => note.archived === filters.archived)
        }
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
        const results = await searchNotesLocally(userId, query)
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

      const existingNote =
        notes.find((note) => note.noteId === noteId) ?? (await getNoteLocally(noteId))
      if (!existingNote) {
        throw new Error(`Note ${noteId} not found`)
      }

      const sanitizedContent = sanitizeNoteContent(content)
      const shouldSkipSync = isNoteEmptyDraft(existingNote, {
        content: sanitizedContent,
        contentHtml: html,
      })

      if (shouldSkipSync) {
        const now = Date.now()
        const localNote: Note = {
          ...existingNote,
          content: sanitizedContent,
          contentHtml: html,
          updatedAtMs: now,
          version: existingNote.version + 1,
          syncState: 'synced',
        }
        setNotes((prev) => prev.map((note) => (note.noteId === noteId ? localNote : note)))
        if (currentNote?.noteId === noteId) {
          setCurrentNote(localNote)
        }
        await saveNoteLocally(localNote)
        return
      }

      await updateNote(noteId, { content: sanitizedContent, contentHtml: html })
    },
    [userId, notes, currentNote, updateNote]
  )

  // Update project links for a note
  const updateProjectLinks = useCallback(
    async (noteId: NoteId, projectIds: string[]): Promise<Note> => {
      if (!userId) {
        throw new Error('User not authenticated')
      }

      return updateNote(noteId, { projectIds })
    },
    [userId, updateNote]
  )

  // Update chapter links for a note
  const updateChapterLinks = useCallback(
    async (noteId: NoteId, chapterIds: string[]): Promise<Note> => {
      if (!userId) {
        throw new Error('User not authenticated')
      }

      return updateNote(noteId, { chapterIds })
    },
    [userId, updateNote]
  )

  // Update OKR links for a note
  const updateOKRLinks = useCallback(
    async (noteId: NoteId, okrIds: string[]): Promise<Note> => {
      if (!userId) {
        throw new Error('User not authenticated')
      }

      return updateNote(noteId, { okrIds })
    },
    [userId, updateNote]
  )

  // Update attachments for a note
  const updateAttachments = useCallback(
    async (noteId: NoteId, attachmentIds: AttachmentId[]): Promise<Note> => {
      if (!userId) {
        throw new Error('User not authenticated')
      }

      return updateNote(noteId, { attachmentIds })
    },
    [userId, updateNote]
  )

  const updateTags = useCallback(
    async (noteId: NoteId, tags: string[]): Promise<Note> => {
      if (!userId) {
        throw new Error('User not authenticated')
      }

      return updateNote(noteId, { tags })
    },
    [userId, updateNote]
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
    updateProjectLinks,
    updateChapterLinks,
    updateOKRLinks,
    updateAttachments,
    updateTags,
  }
}
