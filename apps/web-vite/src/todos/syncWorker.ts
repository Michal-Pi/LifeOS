/**
 * Todo Sync Worker
 *
 * Background worker that synchronizes todos between local IndexedDB and Firestore.
 * Handles:
 * - Processing outbox operations when online
 * - Pulling remote changes from Firestore
 * - Conflict detection and resolution
 */

import { createFirestoreTodoRepository } from '@/adapters/firestoreTodoRepository'
import { isRecoverableFirestoreError } from '@/lib/firestoreErrorHandler'

import {
  saveProjectLocally,
  deleteProjectLocally,
  listProjectsLocally,
  getProjectLocally,
  saveChapterLocally,
  deleteChapterLocally,
  listChaptersLocally,
  getChapterLocally,
  saveTaskLocally,
  deleteTaskLocally,
  listTasksLocally,
  getTaskLocally,
  type LocalProject,
  type LocalChapter,
  type LocalTask,
} from './offlineStore'

import {
  listReadyProjectOps,
  markProjectOpApplying,
  markProjectOpApplied,
  markProjectOpFailed,
  removeProjectOp,
  listReadyChapterOps,
  markChapterOpApplying,
  markChapterOpApplied,
  markChapterOpFailed,
  listReadyTaskOps,
  markTaskOpApplying,
  markTaskOpApplied,
  markTaskOpFailed,
  removeTaskOp,
  type ProjectOutboxOp,
  type ChapterOutboxOp,
  type TaskOutboxOp,
  type ProjectCreatePayload,
  type ProjectUpdatePayload,
  type ChapterCreatePayload,
  type ChapterUpdatePayload,
  type TaskCreatePayload,
  type TaskUpdatePayload,
} from './todoOutbox'

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

// Repository
const todoRepository = createFirestoreTodoRepository()

// ============================================================================
// Project Sync Operations
// ============================================================================

async function processProjectOp(userId: string, op: ProjectOutboxOp): Promise<void> {
  try {
    await markProjectOpApplying(op.opId)
    const existingProject = await getProjectLocally(op.projectId)
    if (existingProject) {
      await saveProjectLocally({ ...existingProject, syncState: 'syncing' })
    }

    switch (op.type) {
      case 'create': {
        const payload = op.payload as ProjectCreatePayload
        const project = payload.project
        if (!project) {
          await markProjectOpFailed(op.opId, 'Invalid project create payload')
          await removeProjectOp(op.opId)
          return
        }

        // Save to Firestore
        await todoRepository.saveProject(project)

        // Update local store with synced version
        await saveProjectLocally({ ...project, syncState: 'synced' })
        break
      }

      case 'update': {
        const payload = op.payload as ProjectUpdatePayload
        const existing = existingProject || (await getProjectLocally(op.projectId))
        if (!existing) {
          await markProjectOpApplied(op.opId)
          await removeProjectOp(op.opId)
          return
        }

        // Fetch current server state to check for conflicts
        const serverProjects = await todoRepository.getProjects(userId)
        const serverProject = serverProjects.find((p) => p.id === op.projectId)

        // Use server state if available and newer, otherwise use local
        const baseProject =
          serverProject && serverProject.updatedAt >= existing.updatedAt ? serverProject : existing

        // Merge updates with base state
        const updated: LocalProject = {
          ...baseProject,
          ...payload.updates,
          updatedAt: new Date().toISOString(),
        }

        // Save to Firestore
        await todoRepository.saveProject(updated)

        // Update local store
        await saveProjectLocally({ ...updated, syncState: 'synced' })
        break
      }

      case 'delete': {
        // Check if server has newer data before deleting
        const serverProjects = await todoRepository.getProjects(userId)
        const serverProject = serverProjects.find((p) => p.id === op.projectId)
        const localProject = existingProject || (await getProjectLocally(op.projectId))

        // Only delete if local delete is newer than server update, or no server version exists
        if (!serverProject || !localProject || localProject.updatedAt >= serverProject.updatedAt) {
          await todoRepository.deleteProject(userId, op.projectId)
          await deleteProjectLocally(op.projectId)
        } else {
          // Server has newer data - cancel delete, use server version instead
          await saveProjectLocally({ ...serverProject, syncState: 'synced' })
        }
        break
      }
    }

    await markProjectOpApplied(op.opId)

    // Clean up applied operations after 24 hours
    setTimeout(() => removeProjectOp(op.opId), 24 * 60 * 60 * 1000)
  } catch (error) {
    const err = error instanceof Error ? error : new Error('Unknown error')
    await markProjectOpFailed(op.opId, err)
    const localProject = await getProjectLocally(op.projectId)
    if (localProject) {
      await saveProjectLocally({ ...localProject, syncState: 'failed' })
    }
    throw err
  }
}

async function processProjectOps(userId: string): Promise<void> {
  const ops = await listReadyProjectOps(userId)

  for (const op of ops) {
    try {
      await processProjectOp(userId, op)
    } catch (error) {
      console.error('Failed to process project operation:', error)
      // Continue with next operation
    }
  }
}

// ============================================================================
// Chapter Sync Operations
// ============================================================================

async function processChapterOp(userId: string, op: ChapterOutboxOp): Promise<void> {
  try {
    await markChapterOpApplying(op.opId)
    const existingChapter = await getChapterLocally(op.chapterId)
    if (existingChapter) {
      await saveChapterLocally({ ...existingChapter, syncState: 'syncing' })
    }

    switch (op.type) {
      case 'create': {
        const payload = op.payload as ChapterCreatePayload
        const chapter = payload.chapter
        if (!chapter) {
          await markChapterOpFailed(op.opId, 'Invalid chapter create payload')
          return
        }

        await todoRepository.saveChapter(chapter)
        await saveChapterLocally({ ...chapter, syncState: 'synced' })
        break
      }

      case 'update': {
        const payload = op.payload as ChapterUpdatePayload
        const existing = existingChapter || (await getChapterLocally(op.chapterId))
        if (!existing) {
          await markChapterOpApplied(op.opId)
          return
        }

        // Fetch current server state to check for conflicts
        const serverChapters = await todoRepository.getChapters(userId)
        const serverChapter = serverChapters.find((c) => c.id === op.chapterId)

        // Use server state if available and newer, otherwise use local
        const baseChapter =
          serverChapter && serverChapter.updatedAt >= existing.updatedAt ? serverChapter : existing

        const updated: LocalChapter = {
          ...baseChapter,
          ...payload.updates,
          updatedAt: new Date().toISOString(),
        }

        await todoRepository.saveChapter(updated)
        await saveChapterLocally({ ...updated, syncState: 'synced' })
        break
      }

      case 'delete': {
        // Check if server has newer data before deleting
        const serverChapters = await todoRepository.getChapters(userId)
        const serverChapter = serverChapters.find((c) => c.id === op.chapterId)
        const localChapter = existingChapter || (await getChapterLocally(op.chapterId))

        // Only delete if local delete is newer than server update, or no server version exists
        if (!serverChapter || !localChapter || localChapter.updatedAt >= serverChapter.updatedAt) {
          await todoRepository.deleteChapter(userId, op.chapterId)
          await deleteChapterLocally(op.chapterId)
        } else {
          // Server has newer data - cancel delete, use server version instead
          await saveChapterLocally({ ...serverChapter, syncState: 'synced' })
        }
        break
      }
    }

    await markChapterOpApplied(op.opId)
  } catch (error) {
    const err = error instanceof Error ? error : new Error('Unknown error')
    await markChapterOpFailed(op.opId, err)
    const localChapter = await getChapterLocally(op.chapterId)
    if (localChapter) {
      await saveChapterLocally({ ...localChapter, syncState: 'failed' })
    }
    throw err
  }
}

async function processChapterOps(userId: string): Promise<void> {
  const ops = await listReadyChapterOps(userId)

  for (const op of ops) {
    try {
      await processChapterOp(userId, op)
    } catch (error) {
      console.error('Failed to process chapter operation:', error)
    }
  }
}

// ============================================================================
// Task Sync Operations
// ============================================================================

async function processTaskOp(userId: string, op: TaskOutboxOp): Promise<void> {
  try {
    await markTaskOpApplying(op.opId)
    const existingTask = await getTaskLocally(op.taskId)
    if (existingTask) {
      await saveTaskLocally({ ...existingTask, syncState: 'syncing' })
    }

    switch (op.type) {
      case 'create': {
        const payload = op.payload as TaskCreatePayload
        const task = payload.task
        if (!task) {
          await markTaskOpFailed(op.opId, 'Invalid task create payload')
          await removeTaskOp(op.opId)
          return
        }

        await todoRepository.saveTask(task)
        await saveTaskLocally({ ...task, syncState: 'synced' })
        break
      }

      case 'update': {
        const payload = op.payload as TaskUpdatePayload
        const existing = existingTask || (await getTaskLocally(op.taskId))
        if (!existing) {
          await markTaskOpApplied(op.opId)
          await removeTaskOp(op.opId)
          return
        }

        // Fetch current server state to check for conflicts
        const serverTasks = await todoRepository.getTasks(userId)
        const serverTask = serverTasks.find((t) => t.id === op.taskId)

        // Use server state if available and newer, otherwise use local
        const baseTask =
          serverTask && serverTask.updatedAt >= existing.updatedAt ? serverTask : existing

        const updated: LocalTask = {
          ...baseTask,
          ...payload.updates,
          updatedAt: new Date().toISOString(),
        }

        await todoRepository.saveTask(updated)
        await saveTaskLocally({ ...updated, syncState: 'synced' })
        break
      }

      case 'delete': {
        // Check if server has newer data before deleting
        const serverTasks = await todoRepository.getTasks(userId)
        const serverTask = serverTasks.find((t) => t.id === op.taskId)
        const localTask = existingTask || (await getTaskLocally(op.taskId))

        // Only delete if local delete is newer than server update, or no server version exists
        if (!serverTask || !localTask || localTask.updatedAt >= serverTask.updatedAt) {
          await todoRepository.deleteTask(userId, op.taskId)
          await deleteTaskLocally(op.taskId)
        } else {
          // Server has newer data - cancel delete, use server version instead
          await saveTaskLocally({ ...serverTask, syncState: 'synced' })
        }
        break
      }
    }

    await markTaskOpApplied(op.opId)

    // Clean up applied operations after 24 hours
    setTimeout(() => removeTaskOp(op.opId), 24 * 60 * 60 * 1000)
  } catch (error) {
    const err = error instanceof Error ? error : new Error('Unknown error')
    await markTaskOpFailed(op.opId, err)
    const localTask = await getTaskLocally(op.taskId)
    if (localTask) {
      await saveTaskLocally({ ...localTask, syncState: 'failed' })
    }
    throw err
  }
}

async function processTaskOps(userId: string): Promise<void> {
  const ops = await listReadyTaskOps(userId)

  for (const op of ops) {
    try {
      await processTaskOp(userId, op)
    } catch (error) {
      console.error('Failed to process task operation:', error)
      // Continue with next operation
    }
  }
}

// ============================================================================
// Pull Remote Changes
// ============================================================================

/**
 * Pull remote projects and update local store
 */
async function pullRemoteProjects(userId: string): Promise<void> {
  try {
    const remoteProjects = await todoRepository.getProjects(userId)
    const localProjects = await listProjectsLocally(userId)
    const localProjectMap = new Map(localProjects.map((p) => [p.id, p]))

    // Update or add remote projects to local store
    for (const remoteProject of remoteProjects) {
      const localProject = localProjectMap.get(remoteProject.id)

      // Simple last-write-wins conflict resolution
      if (!localProject || remoteProject.updatedAt >= localProject.updatedAt) {
        await saveProjectLocally({ ...remoteProject, syncState: 'synced' })
      }
    }

    // Detect deleted projects (exist locally but not remotely)
    const remoteProjectIds = new Set(remoteProjects.map((p) => p.id))
    for (const localProject of localProjects) {
      if (!remoteProjectIds.has(localProject.id) && localProject.syncState === 'synced') {
        await deleteProjectLocally(localProject.id)
      }
    }
  } catch (error) {
    console.error('Failed to pull remote projects:', error)
    throw error
  }
}

/**
 * Pull remote chapters
 */
async function pullRemoteChapters(userId: string): Promise<void> {
  try {
    const remoteChapters = await todoRepository.getChapters(userId)
    const localChapters = await listChaptersLocally(userId)
    const localChapterMap = new Map(localChapters.map((c) => [c.id, c]))
    const remoteChapterIds = new Set(remoteChapters.map((c) => c.id))

    // Update or add remote chapters to local store with conflict resolution
    for (const remoteChapter of remoteChapters) {
      const localChapter = localChapterMap.get(remoteChapter.id)

      // Simple last-write-wins conflict resolution
      if (!localChapter || remoteChapter.updatedAt >= localChapter.updatedAt) {
        await saveChapterLocally({ ...remoteChapter, syncState: 'synced' })
      }
    }

    // Detect deleted chapters (exist locally but not remotely)
    for (const localChapter of localChapters) {
      if (!remoteChapterIds.has(localChapter.id) && localChapter.syncState === 'synced') {
        await deleteChapterLocally(localChapter.id)
      }
    }
  } catch (error) {
    console.error('Failed to pull remote chapters:', error)
    throw error
  }
}

/**
 * Pull remote tasks
 */
async function pullRemoteTasks(userId: string): Promise<void> {
  try {
    const remoteTasks = await todoRepository.getTasks(userId)
    const localTasks = await listTasksLocally(userId)
    const localTaskMap = new Map(localTasks.map((t) => [t.id, t]))

    for (const remoteTask of remoteTasks) {
      const localTask = localTaskMap.get(remoteTask.id)

      // Simple last-write-wins conflict resolution
      if (!localTask || remoteTask.updatedAt >= localTask.updatedAt) {
        await saveTaskLocally({ ...remoteTask, syncState: 'synced' })
      }
    }

    // Detect deleted tasks
    const remoteTaskIds = new Set(remoteTasks.map((t) => t.id))
    for (const localTask of localTasks) {
      if (!remoteTaskIds.has(localTask.id) && localTask.syncState === 'synced') {
        await deleteTaskLocally(localTask.id)
      }
    }
  } catch (error) {
    console.error('Failed to pull remote tasks:', error)
    throw error
  }
}

// ============================================================================
// Main Sync Function
// ============================================================================

/**
 * Run a complete sync cycle
 */
export async function syncTodos(userId: string): Promise<void> {
  if (state.isRunning || state.isPaused) {
    if (state.isPaused) {
      console.log('Sync paused (page hidden), skipping')
    } else {
      console.log('Sync already running, skipping')
    }
    return
  }

  // Always attempt sync - network errors handled gracefully
  state.isRunning = true

  try {
    // 1. Process pending outbox operations (push local changes)
    await Promise.all([
      processProjectOps(userId),
      processChapterOps(userId),
      processTaskOps(userId),
    ])

    // 2. Pull remote changes
    await pullRemoteProjects(userId)
    await pullRemoteChapters(userId)
    await pullRemoteTasks(userId)

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
export function startTodoSyncWorker(
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
      // Always attempt sync when page becomes visible
      syncTodos(userId).catch((error) => {
        console.error('Resume sync failed:', error)
      })
    }
  }

  document.addEventListener('visibilitychange', handleVisibilityChange)

  // Handle network connection changes
  const handleOnline = () => {
    console.log('Connection restored - triggering immediate sync')
    state.retryCount = 0
    // Trigger immediate sync when connection is restored
    syncTodos(userId).catch((error) => {
      console.error('Post-online sync failed:', error)
    })
  }

  const handleOffline = () => {
    console.log('Connection lost - sync will continue to attempt and fail gracefully')
  }

  window.addEventListener('online', handleOnline)
  window.addEventListener('offline', handleOffline)

  // Initial sync
  syncTodos(userId).catch((error) => {
    console.error('Initial sync failed:', error)
  })

  // Set up interval
  state.syncIntervalId = window.setInterval(() => {
    syncTodos(userId).catch(() => {
      // Errors are already logged in syncTodos
    })
  }, intervalMs)

  console.log(`Todo sync worker started (interval: ${intervalMs}ms)`)

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
export function stopTodoSyncWorker(): void {
  if (state.syncIntervalId !== null) {
    clearInterval(state.syncIntervalId)
    state.syncIntervalId = null
    console.log('Todo sync worker stopped')
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
  return syncTodos(userId)
}
