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
import { updateNoteLinks } from '@/notes/linkExtractor'
import { sanitizeNoteContent } from '@/notes/noteContent'
import { invalidateGraphCache } from './firestoreGraphRepository'
import { getNoteMetadataCache } from './noteMetadataCache'

const COLLECTION_NOTES = 'notes'

// Get global cache instance
const metadataCache = getNoteMetadataCache()

export const createFirestoreNoteRepository = (): NoteRepository => {
  /**
   * Recompute backlinks for all notes that link to or mention the given note
   */
  const recomputeBacklinks = async (userId: string, targetNoteId: NoteId): Promise<void> => {
    const db = await getDb()
    const notesRef = collection(db, `users/${userId}/${COLLECTION_NOTES}`)

    // Query notes that link to the target note (efficient Firestore query)
    const linkedQuery = query(notesRef, where('linkedNoteIds', 'array-contains', targetNoteId))
    const linkedSnapshot = await getDocs(linkedQuery)

    // Query notes that mention the target note
    const mentionedQuery = query(
      notesRef,
      where('mentionedNoteIds', 'array-contains', targetNoteId)
    )
    const mentionedSnapshot = await getDocs(mentionedQuery)

    // Combine results and deduplicate
    const linkingNoteIds = new Set<string>()
    for (const docSnapshot of linkedSnapshot.docs) {
      linkingNoteIds.add(docSnapshot.id)
    }
    for (const docSnapshot of mentionedSnapshot.docs) {
      linkingNoteIds.add(docSnapshot.id)
    }

    // Update backlinks for the target note
    const targetNoteRef = doc(db, `users/${userId}/${COLLECTION_NOTES}/${targetNoteId}`)
    const targetSnapshot = await getDoc(targetNoteRef)
    if (targetSnapshot.exists()) {
      const backlinkNoteIds = Array.from(linkingNoteIds) as NoteId[]
      await setDoc(targetNoteRef, { backlinkNoteIds }, { merge: true })
    }
  }

  const create = async (userId: string, input: CreateNoteInput): Promise<Note> => {
    const db = await getDb()
    const noteId = newId<'note'>('note')
    const now = Date.now()

    // Use cache for link extraction (much faster than loading all notes)
    const allMetadata = await metadataCache.getAllMetadata(userId)

    // Extract links from content
    const noteWithDefaults: Note = {
      ...input,
      userId,
      noteId,
      createdAtMs: now,
      updatedAtMs: now,
      lastAccessedAtMs: now,
      syncState: 'synced',
      version: 1,
      linkedNoteIds: [],
      backlinkNoteIds: [],
      mentionedNoteIds: [],
    }

    const {
      linkedNoteIds,
      mentionedNoteIds,
      paragraphLinks = {},
    } = updateNoteLinks(noteWithDefaults, allMetadata)

    const note: Note = {
      ...noteWithDefaults,
      linkedNoteIds,
      mentionedNoteIds,
      paragraphLinks,
      content: sanitizeNoteContent(noteWithDefaults.content) ?? { type: 'doc', content: [] },
    }

    const ref = doc(db, `users/${userId}/${COLLECTION_NOTES}/${noteId}`)
    await setDoc(ref, note)

    // Invalidate cache for this user (new note added)
    metadataCache.invalidateAll(userId)

    // Recompute backlinks for linked notes (with error handling)
    for (const linkedId of linkedNoteIds) {
      try {
        await recomputeBacklinks(userId, linkedId)
      } catch (err) {
        console.error(`Failed to recompute backlinks for note ${linkedId}:`, err)
        // Continue with other notes even if one fails
      }
    }

    // Invalidate caches
    invalidateGraphCache(userId)
    metadataCache.invalidateAll(userId) // New note added, refresh cache

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

    // If content is being updated, extract links and paragraph tags
    let linkedNoteIds = existingNote.linkedNoteIds || []
    let mentionedNoteIds = existingNote.mentionedNoteIds || []
    let paragraphLinks = existingNote.paragraphLinks || {}

    if (updates.content !== undefined) {
      // Use cache for link extraction (much faster than loading all notes)
      const allMetadata = await metadataCache.getAllMetadata(userId)

      const noteWithUpdates: Note = {
        ...existingNote,
        ...updates,
        content: updates.content as object,
      }
      const extracted = updateNoteLinks(noteWithUpdates, allMetadata)
      linkedNoteIds = extracted.linkedNoteIds
      mentionedNoteIds = extracted.mentionedNoteIds
      paragraphLinks = extracted.paragraphLinks || {}
    }

    const mergedContent = updates.content !== undefined ? updates.content : existingNote.content
    const updatedNote: Note = {
      ...existingNote,
      ...updates,
      userId: existingNote.userId ?? userId,
      updatedAtMs: Date.now(),
      version: existingNote.version + 1,
      content: sanitizeNoteContent(mergedContent) ?? { type: 'doc', content: [] },
      linkedNoteIds,
      mentionedNoteIds,
      paragraphLinks,
    }

    await setDoc(ref, updatedNote)

    // Recompute backlinks for notes that were previously linked/mentioned
    const oldLinkedIds = existingNote.linkedNoteIds || []
    const oldMentionedIds = existingNote.mentionedNoteIds || []
    const allAffectedIds = new Set([
      ...oldLinkedIds,
      ...oldMentionedIds,
      ...linkedNoteIds,
      ...mentionedNoteIds,
    ])

    for (const affectedId of allAffectedIds) {
      try {
        await recomputeBacklinks(userId, affectedId)
      } catch (err) {
        console.error(`Failed to recompute backlinks for note ${affectedId}:`, err)
        // Continue with other notes even if one fails
      }
    }

    // Also recompute backlinks for this note itself
    try {
      await recomputeBacklinks(userId, noteId)
    } catch (err) {
      console.error(`Failed to recompute backlinks for note ${noteId}:`, err)
    }

    // Invalidate caches
    invalidateGraphCache(userId)
    metadataCache.invalidate(userId, noteId)

    return updatedNote
  }

  const deleteNote = async (userId: string, noteId: NoteId): Promise<void> => {
    const db = await getDb()
    const ref = doc(db, `users/${userId}/${COLLECTION_NOTES}/${noteId}`)
    const snapshot = await getDoc(ref)

    if (snapshot.exists()) {
      const note = snapshot.data() as Note

      // Remove this note from linkedNoteIds and mentionedNoteIds of other notes
      const notesRef = collection(db, `users/${userId}/${COLLECTION_NOTES}`)
      const allNotesSnapshot = await getDocs(notesRef)
      const batch = writeBatch(db)
      let hasUpdates = false

      for (const docSnapshot of allNotesSnapshot.docs) {
        const otherNote = docSnapshot.data() as Note
        let needsUpdate = false
        const updatedLinkedIds = otherNote.linkedNoteIds?.filter((id) => id !== noteId) || []
        const updatedMentionedIds = otherNote.mentionedNoteIds?.filter((id) => id !== noteId) || []

        if (
          (otherNote.linkedNoteIds?.length || 0) !== updatedLinkedIds.length ||
          (otherNote.mentionedNoteIds?.length || 0) !== updatedMentionedIds.length
        ) {
          needsUpdate = true
        }

        if (needsUpdate) {
          batch.update(docSnapshot.ref, {
            linkedNoteIds: updatedLinkedIds,
            mentionedNoteIds: updatedMentionedIds,
          })
          hasUpdates = true
        }
      }

      if (hasUpdates) {
        await batch.commit()
      }

      // Recompute backlinks for notes that were linked/mentioned by this note
      const linkedIds = note.linkedNoteIds || []
      const mentionedIds = note.mentionedNoteIds || []
      const allAffectedIds = new Set([...linkedIds, ...mentionedIds])

      await deleteDoc(ref)

      // Recompute backlinks for affected notes (with error handling)
      for (const affectedId of allAffectedIds) {
        try {
          await recomputeBacklinks(userId, affectedId)
        } catch (err) {
          console.error(`Failed to recompute backlinks for note ${affectedId}:`, err)
          // Continue with other notes even if one fails
        }
      }
    } else {
      await deleteDoc(ref)
    }

    // Invalidate caches
    invalidateGraphCache(userId)
    metadataCache.invalidate(userId, noteId)
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

    if (filters?.linkedToNoteId) {
      q = query(q, where('linkedNoteIds', 'array-contains', filters.linkedToNoteId))
    }

    const snapshot = await getDocs(q)
    const batch = writeBatch(db)
    const notes: Note[] = []
    let needsBackfill = false

    for (const docSnapshot of snapshot.docs) {
      const data = docSnapshot.data() as Note
      if (!data.userId) {
        needsBackfill = true
        batch.set(docSnapshot.ref, { userId }, { merge: true })
      }
      notes.push({ ...data, userId: data.userId ?? userId })
    }

    if (needsBackfill) {
      await batch.commit()
    }

    // Filter by hasBacklinks client-side (Firestore doesn't support array length queries)
    let filteredNotes = notes
    if (filters?.hasBacklinks !== undefined) {
      filteredNotes = notes.filter((note) => {
        const hasBacklinks = (note.backlinkNoteIds?.length || 0) > 0
        return filters.hasBacklinks === hasBacklinks
      })
    }

    return filteredNotes
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
