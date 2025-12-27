/**
 * Offline Storage for Notes
 *
 * IndexedDB schema for storing notes locally when offline.
 * Provides full CRUD operations with sync state tracking.
 */

import { openDB, type IDBPDatabase } from 'idb'
import type { Note, NoteId, Topic, TopicId, Section, SectionId } from '@lifeos/notes'

const DB_NAME = 'lifeos-notes'
const DB_VERSION = 1

// Store names
const NOTES_STORE = 'notes'
const TOPICS_STORE = 'topics'
const SECTIONS_STORE = 'sections'

let dbPromise: Promise<IDBPDatabase> | null = null

/**
 * Open or create the notes database
 */
async function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // Notes store
        if (!db.objectStoreNames.contains(NOTES_STORE)) {
          const notesStore = db.createObjectStore(NOTES_STORE, { keyPath: 'noteId' })
          notesStore.createIndex('userId', 'userId')
          notesStore.createIndex('topicId', 'topicId')
          notesStore.createIndex('sectionId', 'sectionId')
          notesStore.createIndex('updatedAtMs', 'updatedAtMs')
          notesStore.createIndex('syncState', 'syncState')
          notesStore.createIndex('userId_topicId', ['userId', 'topicId'])
          notesStore.createIndex('userId_sectionId', ['userId', 'sectionId'])
        }

        // Topics store
        if (!db.objectStoreNames.contains(TOPICS_STORE)) {
          const topicsStore = db.createObjectStore(TOPICS_STORE, { keyPath: 'topicId' })
          topicsStore.createIndex('userId', 'userId')
          topicsStore.createIndex('syncState', 'syncState')
        }

        // Sections store
        if (!db.objectStoreNames.contains(SECTIONS_STORE)) {
          const sectionsStore = db.createObjectStore(SECTIONS_STORE, { keyPath: 'sectionId' })
          sectionsStore.createIndex('userId', 'userId')
          sectionsStore.createIndex('topicId', 'topicId')
          sectionsStore.createIndex('syncState', 'syncState')
          sectionsStore.createIndex('userId_topicId', ['userId', 'topicId'])
        }
      },
    })
  }
  return dbPromise
}

// ============================================================================
// Notes Operations
// ============================================================================

/**
 * Save or update a note in local storage
 */
export async function saveNoteLocally(note: Note): Promise<void> {
  const db = await getDb()
  await db.put(NOTES_STORE, note)
}

/**
 * Get a note from local storage
 */
export async function getNoteLocally(noteId: NoteId): Promise<Note | undefined> {
  const db = await getDb()
  return db.get(NOTES_STORE, noteId)
}

/**
 * Delete a note from local storage
 */
export async function deleteNoteLocally(noteId: NoteId): Promise<void> {
  const db = await getDb()
  await db.delete(NOTES_STORE, noteId)
}

/**
 * List all notes for a user
 */
export async function listNotesLocally(userId: string): Promise<Note[]> {
  const db = await getDb()
  const index = db.transaction(NOTES_STORE).store.index('userId')
  return index.getAll(userId)
}

/**
 * List notes by topic
 */
export async function listNotesByTopicLocally(userId: string, topicId: TopicId): Promise<Note[]> {
  const db = await getDb()
  const index = db.transaction(NOTES_STORE).store.index('userId_topicId')
  return index.getAll([userId, topicId])
}

/**
 * List notes by section
 */
export async function listNotesBySectionLocally(
  userId: string,
  sectionId: SectionId
): Promise<Note[]> {
  const db = await getDb()
  const index = db.transaction(NOTES_STORE).store.index('userId_sectionId')
  return index.getAll([userId, sectionId])
}

/**
 * Search notes locally (simple text search in title and content)
 */
export async function searchNotesLocally(userId: string, query: string): Promise<Note[]> {
  const notes = await listNotesLocally(userId)
  const lowerQuery = query.toLowerCase()

  return notes.filter((note) => {
    const titleMatch = note.title.toLowerCase().includes(lowerQuery)
    const htmlMatch = note.contentHtml?.toLowerCase().includes(lowerQuery)
    const tagsMatch = note.tags.some((tag) => tag.toLowerCase().includes(lowerQuery))

    return titleMatch || htmlMatch || tagsMatch
  })
}

/**
 * Get notes that need syncing (not in 'synced' state)
 */
export async function getUnsyncedNotes(userId: string): Promise<Note[]> {
  const db = await getDb()
  const tx = db.transaction(NOTES_STORE, 'readonly')
  const store = tx.objectStore(NOTES_STORE)
  const index = store.index('userId')
  const notes = await index.getAll(userId)

  return notes.filter((note) => note.syncState !== 'synced')
}

// ============================================================================
// Topics Operations
// ============================================================================

/**
 * Save or update a topic in local storage
 */
export async function saveTopicLocally(topic: Topic): Promise<void> {
  const db = await getDb()
  await db.put(TOPICS_STORE, topic)
}

/**
 * Get a topic from local storage
 */
export async function getTopicLocally(topicId: TopicId): Promise<Topic | undefined> {
  const db = await getDb()
  return db.get(TOPICS_STORE, topicId)
}

/**
 * Delete a topic from local storage
 */
export async function deleteTopicLocally(topicId: TopicId): Promise<void> {
  const db = await getDb()
  await db.delete(TOPICS_STORE, topicId)
}

/**
 * List all topics for a user
 */
export async function listTopicsLocally(userId: string): Promise<Topic[]> {
  const db = await getDb()
  const index = db.transaction(TOPICS_STORE).store.index('userId')
  return index.getAll(userId)
}

/**
 * Get topics that need syncing
 */
export async function getUnsyncedTopics(userId: string): Promise<Topic[]> {
  const db = await getDb()
  const tx = db.transaction(TOPICS_STORE, 'readonly')
  const store = tx.objectStore(TOPICS_STORE)
  const index = store.index('userId')
  const topics = await index.getAll(userId)

  return topics.filter((topic) => topic.syncState !== 'synced')
}

// ============================================================================
// Sections Operations
// ============================================================================

/**
 * Save or update a section in local storage
 */
export async function saveSectionLocally(section: Section): Promise<void> {
  const db = await getDb()
  await db.put(SECTIONS_STORE, section)
}

/**
 * Get a section from local storage
 */
export async function getSectionLocally(sectionId: SectionId): Promise<Section | undefined> {
  const db = await getDb()
  return db.get(SECTIONS_STORE, sectionId)
}

/**
 * Delete a section from local storage
 */
export async function deleteSectionLocally(sectionId: SectionId): Promise<void> {
  const db = await getDb()
  await db.delete(SECTIONS_STORE, sectionId)
}

/**
 * List all sections for a topic
 */
export async function listSectionsByTopicLocally(
  userId: string,
  topicId: TopicId
): Promise<Section[]> {
  const db = await getDb()
  const index = db.transaction(SECTIONS_STORE).store.index('userId_topicId')
  return index.getAll([userId, topicId])
}

/**
 * List all sections for a user
 */
export async function listSectionsLocally(userId: string): Promise<Section[]> {
  const db = await getDb()
  const index = db.transaction(SECTIONS_STORE).store.index('userId')
  return index.getAll(userId)
}

/**
 * Get sections that need syncing
 */
export async function getUnsyncedSections(userId: string): Promise<Section[]> {
  const db = await getDb()
  const tx = db.transaction(SECTIONS_STORE, 'readonly')
  const store = tx.objectStore(SECTIONS_STORE)
  const index = store.index('userId')
  const sections = await index.getAll(userId)

  return sections.filter((section) => section.syncState !== 'synced')
}

// ============================================================================
// Bulk Operations
// ============================================================================

/**
 * Clear all local data (use with caution!)
 */
export async function clearAllLocalData(): Promise<void> {
  const db = await getDb()
  const tx = db.transaction([NOTES_STORE, TOPICS_STORE, SECTIONS_STORE], 'readwrite')

  await Promise.all([
    tx.objectStore(NOTES_STORE).clear(),
    tx.objectStore(TOPICS_STORE).clear(),
    tx.objectStore(SECTIONS_STORE).clear(),
  ])

  await tx.done
}

/**
 * Get storage statistics
 */
export async function getStorageStats(userId: string): Promise<{
  totalNotes: number
  totalTopics: number
  totalSections: number
  unsyncedNotes: number
  unsyncedTopics: number
  unsyncedSections: number
}> {
  const [notes, topics, sections, unsyncedNotes, unsyncedTopics, unsyncedSections] =
    await Promise.all([
      listNotesLocally(userId),
      listTopicsLocally(userId),
      listSectionsLocally(userId),
      getUnsyncedNotes(userId),
      getUnsyncedTopics(userId),
      getUnsyncedSections(userId),
    ])

  return {
    totalNotes: notes.length,
    totalTopics: topics.length,
    totalSections: sections.length,
    unsyncedNotes: unsyncedNotes.length,
    unsyncedTopics: unsyncedTopics.length,
    unsyncedSections: unsyncedSections.length,
  }
}
