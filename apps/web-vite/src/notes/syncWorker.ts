/**
 * Note Sync Worker
 *
 * Background worker that synchronizes notes between local IndexedDB and Firestore.
 * Handles:
 * - Processing outbox operations when online
 * - Pulling remote changes from Firestore
 * - Conflict detection and resolution
 */

import { createFirestoreNoteRepository } from '@/adapters/notes/firestoreNoteRepository'
import { createFirestoreTopicRepository } from '@/adapters/notes/firestoreTopicRepository'
import { createFirestoreSectionRepository } from '@/adapters/notes/firestoreSectionRepository'
import type { TopicId } from '@lifeos/notes'

import {
  saveNoteLocally,
  deleteNoteLocally,
  listNotesLocally,
  saveTopicLocally,
  deleteTopicLocally,
  saveSectionLocally,
  deleteSectionLocally,
} from './offlineStore'

import {
  listReadyNoteOps,
  markNoteOpApplying,
  markNoteOpApplied,
  markNoteOpFailed,
  removeNoteOp,
  listPendingTopicOps,
  markTopicOpApplied,
  markTopicOpFailed,
  listPendingSectionOps,
  markSectionOpApplied,
  markSectionOpFailed,
  type NoteOutboxOp,
  type TopicOutboxOp,
  type SectionOutboxOp,
  type NoteCreatePayload,
  type NoteUpdatePayload,
  type TopicCreatePayload,
  type TopicUpdatePayload,
  type SectionCreatePayload,
  type SectionUpdatePayload,
} from './noteOutbox'

// ============================================================================
// Worker State
// ============================================================================

interface SyncWorkerState {
  isRunning: boolean
  lastSyncMs: number | null
  syncIntervalId: number | null
  onSyncComplete?: () => void
  onSyncError?: (error: Error) => void
}

const state: SyncWorkerState = {
  isRunning: false,
  lastSyncMs: null,
  syncIntervalId: null,
}

// Repositories
const noteRepository = createFirestoreNoteRepository()
const topicRepository = createFirestoreTopicRepository()
const sectionRepository = createFirestoreSectionRepository()

// ============================================================================
// Note Sync Operations
// ============================================================================

async function processNoteOp(userId: string, op: NoteOutboxOp): Promise<void> {
  try {
    await markNoteOpApplying(op.opId)

    switch (op.type) {
      case 'create': {
        const payload = op.payload as NoteCreatePayload
        const created = await noteRepository.create(userId, {
          title: payload.note.title,
          content: payload.note.content,
          topicId: payload.note.topicId,
          sectionId: payload.note.sectionId,
          projectIds: payload.note.projectIds,
          okrIds: payload.note.okrIds,
          tags: payload.note.tags,
          attachmentIds: payload.note.attachmentIds,
        })

        // Update local store with server version
        await saveNoteLocally({ ...created, syncState: 'synced' })
        break
      }

      case 'update': {
        const payload = op.payload as NoteUpdatePayload
        const updated = await noteRepository.update(userId, op.noteId, payload.updates)

        // Update local store
        await saveNoteLocally({ ...updated, syncState: 'synced' })
        break
      }

      case 'delete': {
        await noteRepository.delete(userId, op.noteId)
        await deleteNoteLocally(op.noteId)
        break
      }
    }

    await markNoteOpApplied(op.opId)

    // Clean up applied operations after 24 hours
    setTimeout(() => removeNoteOp(op.opId), 24 * 60 * 60 * 1000)
  } catch (error) {
    const err = error instanceof Error ? error : new Error('Unknown error')
    await markNoteOpFailed(op.opId, err)
    throw err
  }
}

async function processNoteOps(userId: string): Promise<void> {
  const ops = await listReadyNoteOps(userId)

  for (const op of ops) {
    try {
      await processNoteOp(userId, op)
    } catch (error) {
      console.error('Failed to process note operation:', error)
      // Continue with next operation
    }
  }
}

// ============================================================================
// Topic Sync Operations
// ============================================================================

async function processTopicOp(userId: string, op: TopicOutboxOp): Promise<void> {
  try {
    switch (op.type) {
      case 'create': {
        const payload = op.payload as TopicCreatePayload
        const created = await topicRepository.create(userId, {
          name: payload.topic.name,
          description: payload.topic.description,
        })
        await saveTopicLocally({ ...created, syncState: 'synced' })
        break
      }

      case 'update': {
        const payload = op.payload as TopicUpdatePayload
        const updated = await topicRepository.update(userId, op.topicId, payload.updates)
        await saveTopicLocally({ ...updated, syncState: 'synced' })
        break
      }

      case 'delete': {
        await topicRepository.delete(userId, op.topicId)
        await deleteTopicLocally(op.topicId)
        break
      }
    }

    await markTopicOpApplied(op.opId)
  } catch (error) {
    const err = error instanceof Error ? error : new Error('Unknown error')
    await markTopicOpFailed(op.opId, err)
    throw err
  }
}

async function processTopicOps(userId: string): Promise<void> {
  const ops = await listPendingTopicOps(userId)

  for (const op of ops) {
    try {
      await processTopicOp(userId, op)
    } catch (error) {
      console.error('Failed to process topic operation:', error)
    }
  }
}

// ============================================================================
// Section Sync Operations
// ============================================================================

async function processSectionOp(userId: string, op: SectionOutboxOp): Promise<void> {
  try {
    switch (op.type) {
      case 'create': {
        const payload = op.payload as SectionCreatePayload
        const created = await sectionRepository.create(userId, {
          topicId: payload.section.topicId,
          name: payload.section.name,
          order: payload.section.order,
        })
        await saveSectionLocally({ ...created, syncState: 'synced' })
        break
      }

      case 'update': {
        const payload = op.payload as SectionUpdatePayload
        const updated = await sectionRepository.update(userId, op.sectionId, payload.updates)
        await saveSectionLocally({ ...updated, syncState: 'synced' })
        break
      }

      case 'delete': {
        await sectionRepository.delete(userId, op.sectionId)
        await deleteSectionLocally(op.sectionId)
        break
      }
    }

    await markSectionOpApplied(op.opId)
  } catch (error) {
    const err = error instanceof Error ? error : new Error('Unknown error')
    await markSectionOpFailed(op.opId, err)
    throw err
  }
}

async function processSectionOps(userId: string): Promise<void> {
  const ops = await listPendingSectionOps(userId)

  for (const op of ops) {
    try {
      await processSectionOp(userId, op)
    } catch (error) {
      console.error('Failed to process section operation:', error)
    }
  }
}

// ============================================================================
// Pull Remote Changes
// ============================================================================

/**
 * Pull remote notes and update local store
 */
async function pullRemoteNotes(userId: string): Promise<void> {
  try {
    // Get all remote notes
    const remoteNotes = await noteRepository.list(userId)

    // Get all local notes
    const localNotes = await listNotesLocally(userId)
    const localNoteMap = new Map(localNotes.map((n) => [n.noteId, n]))

    // Update or add remote notes to local store
    for (const remoteNote of remoteNotes) {
      const localNote = localNoteMap.get(remoteNote.noteId)

      // Simple last-write-wins conflict resolution
      if (!localNote || remoteNote.updatedAtMs >= localNote.updatedAtMs) {
        await saveNoteLocally({ ...remoteNote, syncState: 'synced' })
      }
    }

    // Detect deleted notes (exist locally but not remotely)
    const remoteNoteIds = new Set(remoteNotes.map((n) => n.noteId))
    for (const localNote of localNotes) {
      if (!remoteNoteIds.has(localNote.noteId) && localNote.syncState === 'synced') {
        // Note was deleted on server
        await deleteNoteLocally(localNote.noteId)
      }
    }
  } catch (error) {
    console.error('Failed to pull remote notes:', error)
    throw error
  }
}

/**
 * Pull remote topics
 */
async function pullRemoteTopics(userId: string): Promise<void> {
  try {
    const remoteTopics = await topicRepository.list(userId)

    for (const topic of remoteTopics) {
      await saveTopicLocally({ ...topic, syncState: 'synced' })
    }
  } catch (error) {
    console.error('Failed to pull remote topics:', error)
    throw error
  }
}

/**
 * Pull remote sections
 */
async function pullRemoteSections(userId: string, topicIds: TopicId[]): Promise<void> {
  try {
    for (const topicId of topicIds) {
      const remoteSections = await sectionRepository.listByTopic(userId, topicId)

      for (const section of remoteSections) {
        await saveSectionLocally({ ...section, syncState: 'synced' })
      }
    }
  } catch (error) {
    console.error('Failed to pull remote sections:', error)
    throw error
  }
}

// ============================================================================
// Main Sync Function
// ============================================================================

/**
 * Run a complete sync cycle
 */
export async function syncNotes(userId: string): Promise<void> {
  if (state.isRunning) {
    console.log('Sync already running, skipping')
    return
  }

  state.isRunning = true

  try {
    // 1. Process pending outbox operations (push local changes)
    await Promise.all([processNoteOps(userId), processTopicOps(userId), processSectionOps(userId)])

    // 2. Pull remote changes
    await pullRemoteNotes(userId)
    await pullRemoteTopics(userId)

    // Get topic IDs for pulling sections
    const topics = await topicRepository.list(userId)
    await pullRemoteSections(
      userId,
      topics.map((t) => t.topicId)
    )

    state.lastSyncMs = Date.now()

    if (state.onSyncComplete) {
      state.onSyncComplete()
    }
  } catch (error) {
    console.error('Sync failed:', error)

    if (state.onSyncError) {
      state.onSyncError(error instanceof Error ? error : new Error('Unknown sync error'))
    }

    throw error
  } finally {
    state.isRunning = false
  }
}

// ============================================================================
// Worker Control
// ============================================================================

/**
 * Start automatic sync with given interval
 */
export function startNoteSyncWorker(
  userId: string,
  intervalMs: number = 30000, // Default 30 seconds
  callbacks?: {
    onSyncComplete?: () => void
    onSyncError?: (error: Error) => void
  }
): void {
  if (state.syncIntervalId !== null) {
    console.warn('Sync worker already running')
    return
  }

  state.onSyncComplete = callbacks?.onSyncComplete
  state.onSyncError = callbacks?.onSyncError

  // Initial sync
  syncNotes(userId).catch((error) => {
    console.error('Initial sync failed:', error)
  })

  // Set up interval
  state.syncIntervalId = window.setInterval(() => {
    syncNotes(userId).catch((error) => {
      console.error('Periodic sync failed:', error)
    })
  }, intervalMs)

  console.log(`Note sync worker started (interval: ${intervalMs}ms)`)
}

/**
 * Stop automatic sync
 */
export function stopNoteSyncWorker(): void {
  if (state.syncIntervalId !== null) {
    clearInterval(state.syncIntervalId)
    state.syncIntervalId = null
    console.log('Note sync worker stopped')
  }
}

/**
 * Get worker status
 */
export function getSyncStatus(): {
  isRunning: boolean
  lastSyncMs: number | null
} {
  return {
    isRunning: state.isRunning,
    lastSyncMs: state.lastSyncMs,
  }
}

/**
 * Manually trigger a sync
 */
export async function triggerManualSync(userId: string): Promise<void> {
  return syncNotes(userId)
}
