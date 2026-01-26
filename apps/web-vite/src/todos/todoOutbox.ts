/**
 * Todo Operations Outbox
 *
 * Queue for offline todo operations (create, update, delete).
 * Handles projects, chapters, and tasks.
 */

import { openDB, type IDBPDatabase } from 'idb'
import type { CanonicalProject, CanonicalChapter, CanonicalTask } from '@/types/todo'

// Generate device ID for conflict resolution
function getOrCreateDeviceId(): string {
  const key = 'lifeos-device-id'
  let deviceId = localStorage.getItem(key)
  if (!deviceId) {
    deviceId = crypto.randomUUID()
    localStorage.setItem(key, deviceId)
  }
  return deviceId
}

// Generate operation ID
function generateOpId(): string {
  return crypto.randomUUID()
}

// ============================================================================
// Types
// ============================================================================

export type ProjectOpType = 'create' | 'update' | 'delete'
export type ChapterOpType = 'create' | 'update' | 'delete'
export type TaskOpType = 'create' | 'update' | 'delete'
export type OutboxStatus = 'pending' | 'applying' | 'failed' | 'applied'

export interface ProjectOutboxOp {
  opId: string
  type: ProjectOpType
  userId: string
  projectId: string
  payload: ProjectCreatePayload | ProjectUpdatePayload | ProjectDeletePayload
  deviceId: string
  createdAtMs: number
  availableAtMs: number
  attempts: number
  maxAttempts: number
  status: OutboxStatus
  lastError?: { message: string; code?: string; timestamp?: number }
}

export interface ChapterOutboxOp {
  opId: string
  type: ChapterOpType
  userId: string
  chapterId: string
  payload: ChapterCreatePayload | ChapterUpdatePayload | ChapterDeletePayload
  deviceId: string
  createdAtMs: number
  availableAtMs: number
  attempts: number
  maxAttempts: number
  status: OutboxStatus
  lastError?: { message: string; code?: string; timestamp?: number }
}

export interface TaskOutboxOp {
  opId: string
  type: TaskOpType
  userId: string
  taskId: string
  payload: TaskCreatePayload | TaskUpdatePayload | TaskDeletePayload
  deviceId: string
  createdAtMs: number
  availableAtMs: number
  attempts: number
  maxAttempts: number
  status: OutboxStatus
  lastError?: { message: string; code?: string; timestamp?: number }
}

// Payloads
export interface ProjectCreatePayload {
  project: CanonicalProject
}

export interface ProjectUpdatePayload {
  projectId: string
  updates: Partial<Omit<CanonicalProject, 'id' | 'userId' | 'createdAt' | 'updatedAt'>>
}

export interface ProjectDeletePayload {
  projectId: string
}

export interface ChapterCreatePayload {
  chapter: CanonicalChapter
}

export interface ChapterUpdatePayload {
  chapterId: string
  updates: Partial<
    Omit<CanonicalChapter, 'id' | 'projectId' | 'userId' | 'createdAt' | 'updatedAt'>
  >
}

export interface ChapterDeletePayload {
  chapterId: string
}

export interface TaskCreatePayload {
  task: CanonicalTask
}

export interface TaskUpdatePayload {
  taskId: string
  updates: Partial<Omit<CanonicalTask, 'id' | 'userId' | 'createdAt' | 'updatedAt'>>
}

export interface TaskDeletePayload {
  taskId: string
}

// Backoff configuration
const BACKOFF_CONFIG = {
  baseDelayMs: 1000,
  maxDelayMs: 60 * 1000,
  maxAttempts: 10,
  jitterFactor: 0.2,
} as const

function calculateBackoffMs(attempts: number): number {
  const { baseDelayMs, maxDelayMs, jitterFactor } = BACKOFF_CONFIG
  const exponentialDelay = baseDelayMs * Math.pow(2, attempts)
  const cappedDelay = Math.min(exponentialDelay, maxDelayMs)
  const jitter = cappedDelay * jitterFactor * (Math.random() - 0.5) * 2
  return Math.round(cappedDelay + jitter)
}

// ============================================================================
// IndexedDB Setup
// ============================================================================

const DB_NAME = 'lifeos-todo-outbox'
const DB_VERSION = 1

const PROJECT_OUTBOX_STORE = 'project-operations'
const CHAPTER_OUTBOX_STORE = 'chapter-operations'
const TASK_OUTBOX_STORE = 'task-operations'

let dbPromise: Promise<IDBPDatabase> | null = null

async function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // Project operations store
        if (!db.objectStoreNames.contains(PROJECT_OUTBOX_STORE)) {
          const store = db.createObjectStore(PROJECT_OUTBOX_STORE, { keyPath: 'opId' })
          store.createIndex('userId', 'userId')
          store.createIndex('projectId', 'projectId')
          store.createIndex('status', 'status')
          store.createIndex('availableAtMs', 'availableAtMs')
        }

        // Chapter operations store
        if (!db.objectStoreNames.contains(CHAPTER_OUTBOX_STORE)) {
          const store = db.createObjectStore(CHAPTER_OUTBOX_STORE, { keyPath: 'opId' })
          store.createIndex('userId', 'userId')
          store.createIndex('chapterId', 'chapterId')
          store.createIndex('status', 'status')
          store.createIndex('availableAtMs', 'availableAtMs')
        }

        // Task operations store
        if (!db.objectStoreNames.contains(TASK_OUTBOX_STORE)) {
          const store = db.createObjectStore(TASK_OUTBOX_STORE, { keyPath: 'opId' })
          store.createIndex('userId', 'userId')
          store.createIndex('taskId', 'taskId')
          store.createIndex('status', 'status')
          store.createIndex('availableAtMs', 'availableAtMs')
        }
      },
    })
  }
  return dbPromise
}

// ============================================================================
// Project Operations
// ============================================================================

function createProjectOp(
  type: ProjectOpType,
  userId: string,
  projectId: string,
  payload: ProjectOutboxOp['payload']
): ProjectOutboxOp {
  const now = Date.now()
  return {
    opId: generateOpId(),
    type,
    userId,
    projectId,
    payload,
    deviceId: getOrCreateDeviceId(),
    createdAtMs: now,
    availableAtMs: now,
    attempts: 0,
    maxAttempts: BACKOFF_CONFIG.maxAttempts,
    status: 'pending',
  }
}

export async function enqueueProjectOp(
  type: ProjectOpType,
  userId: string,
  projectId: string,
  payload: ProjectOutboxOp['payload']
): Promise<ProjectOutboxOp> {
  if (!userId || userId.trim() === '') {
    throw new Error('Invalid userId')
  }
  const db = await getDb()
  const tx = db.transaction(PROJECT_OUTBOX_STORE, 'readwrite')
  const store = tx.store
  const index = store.index('projectId')

  // Find existing pending ops for this project
  const existingOps = (await index.getAll(projectId)) as ProjectOutboxOp[]
  const pendingOps = existingOps.filter(
    (op) => op.userId === userId && (op.status === 'pending' || op.status === 'failed')
  )

  // Coalescing logic
  if (type === 'delete') {
    // Delete overrides all pending ops
    for (const op of pendingOps) {
      await store.delete(op.opId)
    }
  } else if (type === 'update' && pendingOps.length > 0) {
    // Coalesce with existing update
    const existingUpdate = pendingOps.find((op) => op.type === 'update')
    if (existingUpdate) {
      const updatePayload = payload as ProjectUpdatePayload
      const existingUpdatePayload = existingUpdate.payload as ProjectUpdatePayload
      existingUpdatePayload.updates = { ...existingUpdatePayload.updates, ...updatePayload.updates }
      existingUpdate.status = 'pending'
      existingUpdate.availableAtMs = Date.now()
      await store.put(existingUpdate)
      await tx.done
      return existingUpdate
    }

    // If there's a pending create, update that instead
    const existingCreate = pendingOps.find((op) => op.type === 'create')
    if (existingCreate) {
      const updatePayload = payload as ProjectUpdatePayload
      const createPayload = existingCreate.payload as ProjectCreatePayload
      createPayload.project = {
        ...createPayload.project,
        ...updatePayload.updates,
        updatedAt: new Date().toISOString(),
      }
      existingCreate.payload = createPayload
      await store.put(existingCreate)
      await tx.done
      return existingCreate
    }
  }

  // Create new op
  const op = createProjectOp(type, userId, projectId, payload)
  await store.add(op)
  await tx.done
  return op
}

export async function listPendingProjectOps(userId: string): Promise<ProjectOutboxOp[]> {
  if (!userId || userId.trim() === '') {
    return []
  }
  const db = await getDb()
  const index = db.transaction(PROJECT_OUTBOX_STORE).store.index('userId')
  const ops = (await index.getAll(userId)) as ProjectOutboxOp[]
  return ops.filter((op) => op.status === 'pending' || op.status === 'failed')
}

export async function listReadyProjectOps(userId: string): Promise<ProjectOutboxOp[]> {
  if (!userId || userId.trim() === '') {
    return []
  }
  const db = await getDb()
  const index = db.transaction(PROJECT_OUTBOX_STORE).store.index('userId')
  const ops = (await index.getAll(userId)) as ProjectOutboxOp[]
  const now = Date.now()

  return ops.filter(
    (op) =>
      (op.status === 'pending' || op.status === 'failed') &&
      op.availableAtMs <= now &&
      op.attempts < op.maxAttempts
  )
}

export async function markProjectOpApplying(opId: string): Promise<ProjectOutboxOp | null> {
  const db = await getDb()
  const op = (await db.get(PROJECT_OUTBOX_STORE, opId)) as ProjectOutboxOp | undefined
  if (!op) return null
  op.status = 'applying'
  await db.put(PROJECT_OUTBOX_STORE, op)
  return op
}

export async function markProjectOpApplied(opId: string): Promise<void> {
  const db = await getDb()
  const op = await db.get(PROJECT_OUTBOX_STORE, opId)
  if (!op) return
  op.status = 'applied'
  await db.put(PROJECT_OUTBOX_STORE, op)
}

export async function markProjectOpFailed(
  opId: string,
  error: Error | string,
  errorCode?: string
): Promise<void> {
  const db = await getDb()
  const op = (await db.get(PROJECT_OUTBOX_STORE, opId)) as ProjectOutboxOp | undefined
  if (!op) return

  op.status = 'failed'
  op.attempts = (op.attempts ?? 0) + 1
  op.lastError = {
    message: typeof error === 'string' ? error : error.message,
    code: errorCode,
    timestamp: Date.now(),
  }

  op.availableAtMs = Date.now() + calculateBackoffMs(op.attempts)
  await db.put(PROJECT_OUTBOX_STORE, op)
}

export async function removeProjectOp(opId: string): Promise<void> {
  const db = await getDb()
  await db.delete(PROJECT_OUTBOX_STORE, opId)
}

// ============================================================================
// Chapter Operations
// ============================================================================

function createChapterOp(
  type: ChapterOpType,
  userId: string,
  chapterId: string,
  payload: ChapterOutboxOp['payload']
): ChapterOutboxOp {
  const now = Date.now()
  return {
    opId: generateOpId(),
    type,
    userId,
    chapterId,
    payload,
    deviceId: getOrCreateDeviceId(),
    createdAtMs: now,
    availableAtMs: now,
    attempts: 0,
    maxAttempts: BACKOFF_CONFIG.maxAttempts,
    status: 'pending',
  }
}

export async function enqueueChapterOp(
  type: ChapterOpType,
  userId: string,
  chapterId: string,
  payload: ChapterOutboxOp['payload']
): Promise<ChapterOutboxOp> {
  if (!userId || userId.trim() === '') {
    throw new Error('Invalid userId')
  }
  const db = await getDb()
  const tx = db.transaction(CHAPTER_OUTBOX_STORE, 'readwrite')
  const store = tx.store
  const index = store.index('chapterId')

  // Find existing pending ops for this chapter
  const existingOps = (await index.getAll(chapterId)) as ChapterOutboxOp[]
  const pendingOps = existingOps.filter(
    (op) => op.userId === userId && (op.status === 'pending' || op.status === 'failed')
  )

  // Coalescing logic (similar to projects)
  if (type === 'delete') {
    for (const op of pendingOps) {
      await store.delete(op.opId)
    }
  } else if (type === 'update' && pendingOps.length > 0) {
    const existingUpdate = pendingOps.find((op) => op.type === 'update')
    if (existingUpdate) {
      const updatePayload = payload as ChapterUpdatePayload
      const existingUpdatePayload = existingUpdate.payload as ChapterUpdatePayload
      existingUpdatePayload.updates = { ...existingUpdatePayload.updates, ...updatePayload.updates }
      existingUpdate.status = 'pending'
      existingUpdate.availableAtMs = Date.now()
      await store.put(existingUpdate)
      await tx.done
      return existingUpdate
    }

    const existingCreate = pendingOps.find((op) => op.type === 'create')
    if (existingCreate) {
      const updatePayload = payload as ChapterUpdatePayload
      const createPayload = existingCreate.payload as ChapterCreatePayload
      createPayload.chapter = {
        ...createPayload.chapter,
        ...updatePayload.updates,
        updatedAt: new Date().toISOString(),
      }
      existingCreate.payload = createPayload
      await store.put(existingCreate)
      await tx.done
      return existingCreate
    }
  }

  const op = createChapterOp(type, userId, chapterId, payload)
  await store.add(op)
  await tx.done
  return op
}

export async function listPendingChapterOps(userId: string): Promise<ChapterOutboxOp[]> {
  if (!userId || userId.trim() === '') {
    return []
  }
  const db = await getDb()
  const index = db.transaction(CHAPTER_OUTBOX_STORE).store.index('userId')
  const ops = (await index.getAll(userId)) as ChapterOutboxOp[]
  return ops.filter((op) => op.status === 'pending' || op.status === 'failed')
}

export async function listReadyChapterOps(userId: string): Promise<ChapterOutboxOp[]> {
  if (!userId || userId.trim() === '') {
    return []
  }
  const db = await getDb()
  const index = db.transaction(CHAPTER_OUTBOX_STORE).store.index('userId')
  const ops = (await index.getAll(userId)) as ChapterOutboxOp[]
  const now = Date.now()

  return ops.filter(
    (op) =>
      (op.status === 'pending' || op.status === 'failed') &&
      op.availableAtMs <= now &&
      op.attempts < op.maxAttempts
  )
}

export async function markChapterOpApplying(opId: string): Promise<ChapterOutboxOp | null> {
  const db = await getDb()
  const op = (await db.get(CHAPTER_OUTBOX_STORE, opId)) as ChapterOutboxOp | undefined
  if (!op) return null
  op.status = 'applying'
  await db.put(CHAPTER_OUTBOX_STORE, op)
  return op
}

export async function markChapterOpApplied(opId: string): Promise<void> {
  const db = await getDb()
  const op = await db.get(CHAPTER_OUTBOX_STORE, opId)
  if (!op) return
  op.status = 'applied'
  await db.put(CHAPTER_OUTBOX_STORE, op)
}

export async function markChapterOpFailed(
  opId: string,
  error: Error | string,
  errorCode?: string
): Promise<void> {
  const db = await getDb()
  const op = (await db.get(CHAPTER_OUTBOX_STORE, opId)) as ChapterOutboxOp | undefined
  if (!op) return

  op.status = 'failed'
  op.attempts = (op.attempts ?? 0) + 1
  op.lastError = {
    message: typeof error === 'string' ? error : error.message,
    code: errorCode,
    timestamp: Date.now(),
  }

  op.availableAtMs = Date.now() + calculateBackoffMs(op.attempts)
  await db.put(CHAPTER_OUTBOX_STORE, op)
}

// ============================================================================
// Task Operations
// ============================================================================

function createTaskOp(
  type: TaskOpType,
  userId: string,
  taskId: string,
  payload: TaskOutboxOp['payload']
): TaskOutboxOp {
  const now = Date.now()
  return {
    opId: generateOpId(),
    type,
    userId,
    taskId,
    payload,
    deviceId: getOrCreateDeviceId(),
    createdAtMs: now,
    availableAtMs: now,
    attempts: 0,
    maxAttempts: BACKOFF_CONFIG.maxAttempts,
    status: 'pending',
  }
}

export async function enqueueTaskOp(
  type: TaskOpType,
  userId: string,
  taskId: string,
  payload: TaskOutboxOp['payload']
): Promise<TaskOutboxOp> {
  if (!userId || userId.trim() === '') {
    throw new Error('Invalid userId')
  }
  const db = await getDb()
  const tx = db.transaction(TASK_OUTBOX_STORE, 'readwrite')
  const store = tx.store
  const index = store.index('taskId')

  // Find existing pending ops for this task
  const existingOps = (await index.getAll(taskId)) as TaskOutboxOp[]
  const pendingOps = existingOps.filter(
    (op) => op.userId === userId && (op.status === 'pending' || op.status === 'failed')
  )

  // Coalescing logic (similar to projects)
  if (type === 'delete') {
    for (const op of pendingOps) {
      await store.delete(op.opId)
    }
  } else if (type === 'update' && pendingOps.length > 0) {
    const existingUpdate = pendingOps.find((op) => op.type === 'update')
    if (existingUpdate) {
      const updatePayload = payload as TaskUpdatePayload
      const existingUpdatePayload = existingUpdate.payload as TaskUpdatePayload
      existingUpdatePayload.updates = { ...existingUpdatePayload.updates, ...updatePayload.updates }
      existingUpdate.status = 'pending'
      existingUpdate.availableAtMs = Date.now()
      await store.put(existingUpdate)
      await tx.done
      return existingUpdate
    }

    const existingCreate = pendingOps.find((op) => op.type === 'create')
    if (existingCreate) {
      const updatePayload = payload as TaskUpdatePayload
      const createPayload = existingCreate.payload as TaskCreatePayload
      createPayload.task = {
        ...createPayload.task,
        ...updatePayload.updates,
        updatedAt: new Date().toISOString(),
      }
      existingCreate.payload = createPayload
      await store.put(existingCreate)
      await tx.done
      return existingCreate
    }
  }

  const op = createTaskOp(type, userId, taskId, payload)
  await store.add(op)
  await tx.done
  return op
}

export async function listPendingTaskOps(userId: string): Promise<TaskOutboxOp[]> {
  if (!userId || userId.trim() === '') {
    return []
  }
  const db = await getDb()
  const index = db.transaction(TASK_OUTBOX_STORE).store.index('userId')
  const ops = (await index.getAll(userId)) as TaskOutboxOp[]
  return ops.filter((op) => op.status === 'pending' || op.status === 'failed')
}

export async function listReadyTaskOps(userId: string): Promise<TaskOutboxOp[]> {
  if (!userId || userId.trim() === '') {
    return []
  }
  const db = await getDb()
  const index = db.transaction(TASK_OUTBOX_STORE).store.index('userId')
  const ops = (await index.getAll(userId)) as TaskOutboxOp[]
  const now = Date.now()

  return ops.filter(
    (op) =>
      (op.status === 'pending' || op.status === 'failed') &&
      op.availableAtMs <= now &&
      op.attempts < op.maxAttempts
  )
}

export async function markTaskOpApplying(opId: string): Promise<TaskOutboxOp | null> {
  const db = await getDb()
  const op = (await db.get(TASK_OUTBOX_STORE, opId)) as TaskOutboxOp | undefined
  if (!op) return null
  op.status = 'applying'
  await db.put(TASK_OUTBOX_STORE, op)
  return op
}

export async function markTaskOpApplied(opId: string): Promise<void> {
  const db = await getDb()
  const op = await db.get(TASK_OUTBOX_STORE, opId)
  if (!op) return
  op.status = 'applied'
  await db.put(TASK_OUTBOX_STORE, op)
}

export async function markTaskOpFailed(
  opId: string,
  error: Error | string,
  errorCode?: string
): Promise<void> {
  const db = await getDb()
  const op = (await db.get(TASK_OUTBOX_STORE, opId)) as TaskOutboxOp | undefined
  if (!op) return

  op.status = 'failed'
  op.attempts = (op.attempts ?? 0) + 1
  op.lastError = {
    message: typeof error === 'string' ? error : error.message,
    code: errorCode,
    timestamp: Date.now(),
  }

  op.availableAtMs = Date.now() + calculateBackoffMs(op.attempts)
  await db.put(TASK_OUTBOX_STORE, op)
}

export async function removeTaskOp(opId: string): Promise<void> {
  const db = await getDb()
  await db.delete(TASK_OUTBOX_STORE, opId)
}

// ============================================================================
// Statistics
// ============================================================================

export async function getOutboxStats(userId: string): Promise<{
  projects: { pending: number; failed: number; total: number }
  chapters: { pending: number; failed: number; total: number }
  tasks: { pending: number; failed: number; total: number }
}> {
  if (!userId || userId.trim() === '') {
    return {
      projects: { pending: 0, failed: 0, total: 0 },
      chapters: { pending: 0, failed: 0, total: 0 },
      tasks: { pending: 0, failed: 0, total: 0 },
    }
  }

  const db = await getDb()

  const [projectOps, chapterOps, taskOps] = await Promise.all([
    db.transaction(PROJECT_OUTBOX_STORE).store.index('userId').getAll(userId),
    db.transaction(CHAPTER_OUTBOX_STORE).store.index('userId').getAll(userId),
    db.transaction(TASK_OUTBOX_STORE).store.index('userId').getAll(userId),
  ])

  return {
    projects: {
      pending: (projectOps as ProjectOutboxOp[]).filter((op) => op.status === 'pending').length,
      failed: (projectOps as ProjectOutboxOp[]).filter((op) => op.status === 'failed').length,
      total: projectOps.length,
    },
    chapters: {
      pending: (chapterOps as ChapterOutboxOp[]).filter((op) => op.status === 'pending').length,
      failed: (chapterOps as ChapterOutboxOp[]).filter((op) => op.status === 'failed').length,
      total: chapterOps.length,
    },
    tasks: {
      pending: (taskOps as TaskOutboxOp[]).filter((op) => op.status === 'pending').length,
      failed: (taskOps as TaskOutboxOp[]).filter((op) => op.status === 'failed').length,
      total: taskOps.length,
    },
  }
}

export function __resetTodoOutboxDbForTests(): void {
  dbPromise = null
}
