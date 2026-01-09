/**
 * Firestore Note Repository
 *
 * Implements NoteRepository interface for Firestore persistence.
 * Handles CRUD operations and search for notes.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  query,
  where,
  writeBatch,
} from 'firebase/firestore'
import { getFirestoreClient as getDb } from '@/lib/firestoreClient'
import { newId } from '@lifeos/core'
import type {
  Note,
  NoteId,
  NoteFilters,
  CreateNoteInput,
  UpdateNoteInput,
  NoteRepository,
} from '@lifeos/notes'

const COLLECTION_NOTES = 'notes'

export const createFirestoreNoteRepository = (): NoteRepository => {
  const create = async (userId: string, input: CreateNoteInput): Promise<Note> => {
    const db = await getDb()
    const noteId = newId<'note'>('note')
    const now = Date.now()

    const note: Note = {
      ...input,
      noteId,
      createdAtMs: now,
      updatedAtMs: now,
      lastAccessedAtMs: now,
      syncState: 'synced',
      version: 1,
    }

    const ref = doc(db, `users/${userId}/${COLLECTION_NOTES}/${noteId}`)
    await setDoc(ref, note)

    return note
  }

  const update = async (
    userId: string,
    noteId: NoteId,
    updates: UpdateNoteInput
  ): Promise<Note> => {
    const db = await getDb()
    const ref = doc(db, `users/${userId}/${COLLECTION_NOTES}/${noteId}`)
    const snapshot = await getDoc(ref)

    if (!snapshot.exists()) {
      throw new Error(`Note ${noteId} not found`)
    }

    const existingNote = snapshot.data() as Note
    const updatedNote: Note = {
      ...existingNote,
      ...updates,
      updatedAtMs: Date.now(),
      version: existingNote.version + 1,
    }

    await setDoc(ref, updatedNote)
    return updatedNote
  }

  const deleteNote = async (userId: string, noteId: NoteId): Promise<void> => {
    const db = await getDb()
    const ref = doc(db, `users/${userId}/${COLLECTION_NOTES}/${noteId}`)
    await deleteDoc(ref)
  }

  const get = async (userId: string, noteId: NoteId): Promise<Note | null> => {
    const db = await getDb()
    const ref = doc(db, `users/${userId}/${COLLECTION_NOTES}/${noteId}`)
    const snapshot = await getDoc(ref)

    if (!snapshot.exists()) {
      return null
    }

    return snapshot.data() as Note
  }

  const list = async (userId: string, filters?: NoteFilters): Promise<Note[]> => {
    const db = await getDb()
    let q = query(collection(db, `users/${userId}/${COLLECTION_NOTES}`))

    if (filters?.topicId) {
      q = query(q, where('topicId', '==', filters.topicId))
    }

    if (filters?.sectionId) {
      q = query(q, where('sectionId', '==', filters.sectionId))
    }

    if (filters?.tags && filters.tags.length > 0) {
      q = query(q, where('tags', 'array-contains-any', filters.tags))
    }

    const snapshot = await getDocs(q)
    return snapshot.docs.map((doc) => doc.data() as Note)
  }

  const search = async (userId: string, searchQuery: string): Promise<Note[]> => {
    // For now, fetch all notes and filter client-side
    // TODO: Implement vectorized text search with BM25 + semantic search
    // Plan: Vectorize note content, use BM25 for keyword matching and semantic search for meaning-based queries
    const allNotes = await list(userId)

    const lowerQuery = searchQuery.toLowerCase()
    return allNotes.filter(
      (note) =>
        note.title.toLowerCase().includes(lowerQuery) ||
        note.contentHtml?.toLowerCase().includes(lowerQuery)
    )
  }

  const updateLastAccessed = async (userId: string, noteId: NoteId): Promise<void> => {
    const db = await getDb()
    const ref = doc(db, `users/${userId}/${COLLECTION_NOTES}/${noteId}`)
    const snapshot = await getDoc(ref)

    if (!snapshot.exists()) {
      return
    }

    const note = snapshot.data() as Note
    await setDoc(ref, {
      ...note,
      lastAccessedAtMs: Date.now(),
    })
  }

  const batchUpdate = async (userId: string, notes: Note[]): Promise<void> => {
    const db = await getDb()
    const batch = writeBatch(db)

    for (const note of notes) {
      const ref = doc(db, `users/${userId}/${COLLECTION_NOTES}/${note.noteId}`)
      batch.set(ref, note)
    }

    await batch.commit()
  }

  return {
    create,
    update,
    delete: deleteNote,
    get,
    list,
    search,
    updateLastAccessed,
    batchUpdate,
  }
}
