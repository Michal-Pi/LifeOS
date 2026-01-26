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
  getNoteLocally,
  saveTopicLocally,
  deleteTopicLocally,
  listTopicsLocally,
  listSectionsByTopicLocally,
  saveSectionLocally,
  deleteSectionLocally,
} from './offlineStore'
import { isRecoverableFirestoreError } from '@/lib/firestoreErrorHandler'
import { isNoteEmptyDraft, sanitizeNoteContent } from './noteContent'

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
  isPaused: boolean
  retryCount: number
  onSyncComplete?: () => void
  onSyncError?: (error: Error) => void
  cleanup?: () => void
}

const state: SyncWorkerState = {
  isRunning: false,
  lastSyncMs: null,
  syncIntervalId: null,
  isPaused: false,
  retryCount: 0,
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
    const existingNote = await getNoteLocally(op.noteId)
    if (existingNote) {
      await saveNoteLocally({ ...existingNote, syncState: 'syncing' })
    }

    switch (op.type) {
      case 'create': {
        const payload = op.payload as NoteCreatePayload
        const baseNote = payload.note ?? existingNote
        if (!baseNote) {
          await markNoteOpFailed(op.opId, 'Invalid note create payload')
          await removeNoteOp(op.opId)
          return
        }
        const sanitizedContent = sanitizeNoteContent(baseNote.content)
        if (isNoteEmptyDraft(baseNote, { content: sanitizedContent })) {
          await saveNoteLocally({ ...baseNote, content: sanitizedContent, syncState: 'synced' })
          await markNoteOpApplied(op.opId)
          await removeNoteOp(op.opId)
          return
        }
        const created = await noteRepository.create(userId, {
          title: baseNote.title?.trim() || 'Untitled',
          content: sanitizedContent ?? { type: 'doc', content: [] },
          topicId: baseNote.topicId,
          sectionId: baseNote.sectionId,
          projectIds: baseNote.projectIds,
          okrIds: baseNote.okrIds,
          tags: baseNote.tags,
          attachmentIds: baseNote.attachmentIds,
        })

        // Update local store with server version
        await saveNoteLocally({ ...created, syncState: 'synced' })
        break
      }

      case 'update': {
        const payload = op.payload as NoteUpdatePayload
        const nextNote = existingNote ? { ...existingNote, ...payload.updates } : null
        const sanitizedContent = sanitizeNoteContent(nextNote?.content)
        if (nextNote && isNoteEmptyDraft(nextNote, { content: sanitizedContent })) {
          await saveNoteLocally({ ...nextNote, content: sanitizedContent, syncState: 'synced' })
          await markNoteOpApplied(op.opId)
          await removeNoteOp(op.opId)
          return
        }

        if (!nextNote) {
          await markNoteOpApplied(op.opId)
          await removeNoteOp(op.opId)
          return
        }

        let updated: Awaited<ReturnType<typeof noteRepository.update>>
        try {
          const updatePayload: NoteUpdatePayload['updates'] = { ...payload.updates }
          if (Object.prototype.hasOwnProperty.call(payload.updates, 'content')) {
            updatePayload.content = sanitizedContent
          }
          updated = await noteRepository.update(userId, op.noteId, updatePayload)
        } catch (error) {
          const message = error instanceof Error ? error.message : ''
          const isNotFound = message.toLowerCase().includes('not found')
          if (!isNotFound) {
            throw error
          }
          const created = await noteRepository.create(userId, {
            title: nextNote.title?.trim() || 'Untitled',
            content: sanitizedContent ?? { type: 'doc', content: [] },
            topicId: nextNote.topicId,
            sectionId: nextNote.sectionId,
            projectIds: nextNote.projectIds,
            okrIds: nextNote.okrIds,
            tags: nextNote.tags,
            attachmentIds: nextNote.attachmentIds,
          })
          await saveNoteLocally({ ...created, syncState: 'synced' })
          await markNoteOpApplied(op.opId)
          await removeNoteOp(op.opId)
          return
        }

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
    const localNote = await getNoteLocally(op.noteId)
    if (localNote) {
      await saveNoteLocally({ ...localNote, syncState: 'failed' })
    }
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
    const localTopics = await listTopicsLocally(userId)
    const remoteTopicIds = new Set(remoteTopics.map((topic) => topic.topicId))

    for (const topic of remoteTopics) {
      await saveTopicLocally({ ...topic, syncState: 'synced' })
    }

    for (const localTopic of localTopics) {
      if (!remoteTopicIds.has(localTopic.topicId) && localTopic.syncState === 'synced') {
        await deleteTopicLocally(localTopic.topicId)
        const localSections = await listSectionsByTopicLocally(userId, localTopic.topicId)
        for (const section of localSections) {
          if (section.syncState === 'synced') {
            await deleteSectionLocally(section.sectionId)
          }
        }
      }
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
      const localSections = await listSectionsByTopicLocally(userId, topicId)
      const remoteSectionIds = new Set(remoteSections.map((section) => section.sectionId))

      for (const section of remoteSections) {
        await saveSectionLocally({ ...section, syncState: 'synced' })
      }

      for (const section of localSections) {
        if (!remoteSectionIds.has(section.sectionId) && section.syncState === 'synced') {
          await deleteSectionLocally(section.sectionId)
        }
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
  if (state.isRunning || state.isPaused) {
    if (state.isPaused) {
      console.log('Sync paused (page hidden), skipping')
    } else {
      console.log('Sync already running, skipping')
    }
    return
  }

  // Don't sync if offline
  if (!navigator.onLine) {
    console.log('Sync skipped - offline')
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
    state.retryCount = 0 // Reset retry count on success

    if (state.onSyncComplete) {
      state.onSyncComplete()
    }
  } catch (error) {
    const err = error instanceof Error ? error : new Error('Unknown sync error')
    console.error('Sync failed:', err)

    // Only retry if error is recoverable
    if (isRecoverableFirestoreError(error)) {
      state.retryCount++
      console.warn(`Sync error (recoverable), retry count: ${state.retryCount}`)
    } else {
      state.retryCount = 0 // Reset on non-recoverable errors
    }

    if (state.onSyncError) {
      state.onSyncError(err)
    }

    // Don't throw recoverable errors - let the worker continue
    if (!isRecoverableFirestoreError(error)) {
      throw error
    }
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
  state.isPaused = false

  // Handle page visibility changes
  const handleVisibilityChange = () => {
    if (document.hidden) {
      console.log('Page hidden - pausing sync worker')
      state.isPaused = true
    } else {
      console.log('Page visible - resuming sync worker')
      state.isPaused = false
      state.retryCount = 0 // Reset retry count on resume
      // Trigger immediate sync when page becomes visible
      if (navigator.onLine) {
        syncNotes(userId).catch((error) => {
          console.error('Resume sync failed:', error)
        })
      }
    }
  }

  document.addEventListener('visibilitychange', handleVisibilityChange)

  // Handle network connection changes
  const handleOnline = () => {
    console.log('Connection restored - resuming sync worker')
    state.isPaused = false
    state.retryCount = 0
    // Trigger immediate sync when connection is restored
    syncNotes(userId).catch((error) => {
      console.error('Post-online sync failed:', error)
    })
  }

  const handleOffline = () => {
    console.log('Connection lost - pausing sync worker')
    state.isPaused = true
  }

  window.addEventListener('online', handleOnline)
  window.addEventListener('offline', handleOffline)

  // Initial sync
  syncNotes(userId).catch((error) => {
    console.error('Initial sync failed:', error)
  })

  // Set up interval
  state.syncIntervalId = window.setInterval(() => {
    syncNotes(userId).catch(() => {
      // Errors are already logged in syncNotes
    })
  }, intervalMs)

  console.log(`Note sync worker started (interval: ${intervalMs}ms)`)

  // Store cleanup function
  state.cleanup = () => {
    document.removeEventListener('visibilitychange', handleVisibilityChange)
    window.removeEventListener('online', handleOnline)
    window.removeEventListener('offline', handleOffline)
  }
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

  // Clean up event listeners
  if (state.cleanup) {
    state.cleanup()
    state.cleanup = undefined
  }

  state.isPaused = false
  state.retryCount = 0
}

/**
 * Get worker status
 */
export function getSyncStatus(): {
  isRunning: boolean
  lastSyncMs: number | null
  isPaused: boolean
  retryCount: number
} {
  return {
    isRunning: state.isRunning,
    lastSyncMs: state.lastSyncMs,
    isPaused: state.isPaused,
    retryCount: state.retryCount,
  }
}

/**
 * Manually trigger a sync
 */
export async function triggerManualSync(userId: string): Promise<void> {
  return syncNotes(userId)
}
