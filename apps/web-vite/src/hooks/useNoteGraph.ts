/**
 * useNoteGraph Hook
 *
 * React hooks for note graph operations.
 */

import { useState, useCallback, useEffect } from 'react'
import { useAuth } from './useAuth'
import { createFirestoreNoteRepository } from '@/adapters/notes/firestoreNoteRepository'
import { createFirestoreGraphRepository } from '@/adapters/notes/firestoreGraphRepository'
import type { Note, NoteId } from '@lifeos/notes'
import type { NoteGraph, GraphFilters } from '@lifeos/notes'

const noteRepository = createFirestoreNoteRepository()
const graphRepository = createFirestoreGraphRepository(noteRepository)

/**
 * Hook for loading and managing note graph state
 */
export function useNoteGraph(filters?: GraphFilters) {
  const { user } = useAuth()
  const [graph, setGraph] = useState<NoteGraph | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const userId = user?.uid

  const loadGraph = useCallback(async () => {
    if (!userId) return

    setIsLoading(true)
    setError(null)

    try {
      const graphData = await graphRepository.buildGraph(userId, filters)
      setGraph(graphData)
    } catch (err) {
      setError(err as Error)
    } finally {
      setIsLoading(false)
    }
  }, [userId, filters])

  useEffect(() => {
    void loadGraph()
  }, [loadGraph])

  return {
    graph,
    isLoading,
    error,
    reload: loadGraph,
  }
}

/**
 * Hook for getting backlinks for a note
 */
export function useBacklinks(noteId: NoteId | null) {
  const { user } = useAuth()
  const [backlinks, setBacklinks] = useState<Note[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const userId = user?.uid

  const loadBacklinks = useCallback(async () => {
    if (!userId || !noteId) {
      setBacklinks([])
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const links = await graphRepository.getBacklinks(userId, noteId)
      setBacklinks(links)
    } catch (err) {
      setError(err as Error)
    } finally {
      setIsLoading(false)
    }
  }, [userId, noteId])

  useEffect(() => {
    void loadBacklinks()
  }, [loadBacklinks])

  return {
    backlinks,
    isLoading,
    error,
    reload: loadBacklinks,
  }
}

/**
 * Hook for getting connected notes within N hops
 */
export function useConnectedNotes(noteId: NoteId | null, depth: number = 1) {
  const { user } = useAuth()
  const [connectedNotes, setConnectedNotes] = useState<Note[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const userId = user?.uid

  const loadConnectedNotes = useCallback(async () => {
    if (!userId || !noteId) {
      setConnectedNotes([])
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const notes = await graphRepository.getConnectedNotes(userId, noteId, depth)
      setConnectedNotes(notes)
    } catch (err) {
      setError(err as Error)
    } finally {
      setIsLoading(false)
    }
  }, [userId, noteId, depth])

  useEffect(() => {
    void loadConnectedNotes()
  }, [loadConnectedNotes])

  return {
    connectedNotes,
    isLoading,
    error,
    reload: loadConnectedNotes,
  }
}
