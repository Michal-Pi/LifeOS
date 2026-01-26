/**
 * Note Metadata Cache
 *
 * In-memory cache for note metadata (title, archived status) to avoid
 * loading full notes on every link extraction operation.
 */

import { collection, getDocs } from 'firebase/firestore'
import { getFirestoreClient as getDb } from '@/lib/firestoreClient'
import type { NoteId } from '@lifeos/notes'

const COLLECTION_NOTES = 'notes'

/**
 * Minimal note metadata for link extraction
 */
export interface NoteMetadata {
  noteId: NoteId
  title: string
  archived: boolean
}

/**
 * Cache entry with expiration
 */
interface CacheEntry {
  metadata: Map<NoteId, NoteMetadata>
  timestamp: number
}

/**
 * Cache TTL: 10 minutes
 */
const CACHE_TTL_MS = 10 * 60 * 1000

/**
 * Per-user cache storage
 */
const userCaches = new Map<string, CacheEntry>()

/**
 * Note Metadata Cache Interface
 */
export interface NoteMetadataCache {
  /**
   * Get metadata for a specific note
   */
  getMetadata(userId: string, noteId: NoteId): Promise<NoteMetadata | null>

  /**
   * Get all metadata for a user
   */
  getAllMetadata(userId: string): Promise<NoteMetadata[]>

  /**
   * Invalidate metadata for a specific note
   */
  invalidate(userId: string, noteId: NoteId): void

  /**
   * Invalidate all metadata for a user
   */
  invalidateAll(userId: string): void

  /**
   * Refresh metadata for a user (force reload from Firestore)
   */
  refresh(userId: string): Promise<void>

  /**
   * Check if cache is valid for a user
   */
  isValid(userId: string): boolean
}

/**
 * Create a note metadata cache instance
 */
export function createNoteMetadataCache(): NoteMetadataCache {
  /**
   * Load metadata from Firestore
   */
  const loadMetadata = async (userId: string): Promise<Map<NoteId, NoteMetadata>> => {
    const db = await getDb()
    const notesRef = collection(db, `users/${userId}/${COLLECTION_NOTES}`)

    // Only fetch title and archived fields for efficiency
    const snapshot = await getDocs(notesRef)
    const metadata = new Map<NoteId, NoteMetadata>()

    for (const docSnapshot of snapshot.docs) {
      const data = docSnapshot.data()
      metadata.set(docSnapshot.id as NoteId, {
        noteId: docSnapshot.id as NoteId,
        title: data.title || '',
        archived: data.archived || false,
      })
    }

    return metadata
  }

  /**
   * Get or load cache for a user
   */
  const getOrLoadCache = async (userId: string): Promise<Map<NoteId, NoteMetadata>> => {
    const cached = userCaches.get(userId)
    const now = Date.now()

    // Return cached data if valid
    if (cached && now - cached.timestamp < CACHE_TTL_MS) {
      return cached.metadata
    }

    // Load fresh data
    const metadata = await loadMetadata(userId)
    userCaches.set(userId, {
      metadata,
      timestamp: now,
    })

    return metadata
  }

  return {
    async getMetadata(userId: string, noteId: NoteId): Promise<NoteMetadata | null> {
      const metadata = await getOrLoadCache(userId)
      return metadata.get(noteId) || null
    },

    async getAllMetadata(userId: string): Promise<NoteMetadata[]> {
      const metadata = await getOrLoadCache(userId)
      return Array.from(metadata.values())
    },

    invalidate(userId: string, noteId: NoteId): void {
      const cached = userCaches.get(userId)
      if (cached) {
        cached.metadata.delete(noteId)
        // Reset timestamp to force refresh on next access
        cached.timestamp = 0
      }
    },

    invalidateAll(userId: string): void {
      userCaches.delete(userId)
    },

    async refresh(userId: string): Promise<void> {
      const metadata = await loadMetadata(userId)
      userCaches.set(userId, {
        metadata,
        timestamp: Date.now(),
      })
    },

    isValid(userId: string): boolean {
      const cached = userCaches.get(userId)
      if (!cached) return false
      return Date.now() - cached.timestamp < CACHE_TTL_MS
    },
  }
}

/**
 * Global cache instance (singleton)
 */
let globalCache: NoteMetadataCache | null = null

/**
 * Get the global note metadata cache instance
 */
export function getNoteMetadataCache(): NoteMetadataCache {
  if (!globalCache) {
    globalCache = createNoteMetadataCache()
  }
  return globalCache
}
