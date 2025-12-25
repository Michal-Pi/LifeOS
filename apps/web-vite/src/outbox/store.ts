import { getOrCreateDeviceId } from '@lifeos/calendar'
import { openDB, type IDBPDatabase } from 'idb'

import { BACKOFF_CONFIG, calculateBackoffMs } from './types'
import type { OutboxOp, OutboxOpType } from './types'

// Use browser's crypto.randomUUID()
function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  // Fallback for older browsers
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

const DB_NAME = 'lifeos-outbox'
const DB_VERSION = 2 // Upgraded for Phase 2.7
const STORE_NAME = 'outbox'

let dbPromise: Promise<IDBPDatabase> | null = null

async function getDb() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        // Delete old store if upgrading from v1
        if (oldVersion < 2 && db.objectStoreNames.contains(STORE_NAME)) {
          db.deleteObjectStore(STORE_NAME)
        }
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'opId' })
          store.createIndex('userId', 'userId')
          store.createIndex('eventId', 'eventId')
          store.createIndex('status', 'status')
          store.createIndex('availableAtMs', 'availableAtMs')
        }
      }
    })
  }
  return dbPromise
}

/** Get stable device ID */
let cachedDeviceId: string | null = null
function getDeviceId(): string {
  if (!cachedDeviceId) {
    cachedDeviceId = getOrCreateDeviceId()
  }
  return cachedDeviceId
}

function defaultOp(
  type: OutboxOpType,
  userId: string,
  eventId: string,
  payload: OutboxOp['payload'],
  baseRev?: number,
  baseUpdatedAtMs?: number
): OutboxOp {
  const now = Date.now()
  return {
    opId: generateId(),
    type,
    userId,
    eventId,
    payload,
    baseRev,
    baseUpdatedAtMs,
    deviceId: getDeviceId(),
    createdAtMs: now,
    availableAtMs: now, // Available immediately
    attempts: 0,
    maxAttempts: BACKOFF_CONFIG.maxAttempts,
    status: 'pending'
  }
}

/**
 * Enqueue an operation with coalescing support
 * - Multiple updates to same event collapse into one patch
 * - Delete overrides pending creates/updates
 */
export async function enqueueOp(
  type: OutboxOpType,
  userId: string,
  eventId: string,
  payload: OutboxOp['payload'],
  baseRev?: number,
  baseUpdatedAtMs?: number
): Promise<OutboxOp> {
  const db = await getDb()
  const tx = db.transaction(STORE_NAME, 'readwrite')
  const store = tx.objectStore(STORE_NAME)
  const index = store.index('eventId')

  // Find existing pending ops for this event
  const existingOps = (await index.getAll(eventId)) as OutboxOp[]
  const pendingOps = existingOps.filter(
    (op) => op.userId === userId && (op.status === 'pending' || op.status === 'failed')
  )

  // Coalescing logic
  if (type === 'delete') {
    // Delete overrides all pending ops for this event
    for (const op of pendingOps) {
      await store.delete(op.opId)
    }
  } else if (type === 'update' && pendingOps.length > 0) {
    // Find existing update to coalesce
    const existingUpdate = pendingOps.find((op) => op.type === 'update')
    if (existingUpdate) {
      // Merge payload and update the existing op
      existingUpdate.payload = payload
      existingUpdate.baseRev = baseRev ?? existingUpdate.baseRev
      existingUpdate.baseUpdatedAtMs = baseUpdatedAtMs ?? existingUpdate.baseUpdatedAtMs
      existingUpdate.status = 'pending'
      existingUpdate.availableAtMs = Date.now()
      await store.put(existingUpdate)
      await tx.done
      return existingUpdate
    }

    // If there's a pending create, update that instead
    const existingCreate = pendingOps.find((op) => op.type === 'create')
    if (existingCreate) {
      existingCreate.payload = payload
      await store.put(existingCreate)
      await tx.done
      return existingCreate
    }
  }

  // Create new op
  const op = defaultOp(type, userId, eventId, payload, baseRev, baseUpdatedAtMs)
  await store.add(op)
  await tx.done
  return op
}

/**
 * List pending ops that are ready to be processed
 */
export async function listPending(userId: string): Promise<OutboxOp[]> {
  const db = await getDb()
  const tx = db.transaction(STORE_NAME, 'readonly')
  const store = tx.objectStore(STORE_NAME)
  const index = store.index('userId')
  const ops = (await index.getAll(userId)) as OutboxOp[]
  return ops.filter((op) => op.status === 'pending' || op.status === 'failed')
}

/**
 * List ops ready to process (available and not exceeded max attempts)
 */
export async function listReady(userId: string): Promise<OutboxOp[]> {
  const db = await getDb()
  const tx = db.transaction(STORE_NAME, 'readonly')
  const store = tx.objectStore(STORE_NAME)
  const index = store.index('userId')
  const ops = (await index.getAll(userId)) as OutboxOp[]
  const now = Date.now()

  return ops.filter(
    (op) =>
      (op.status === 'pending' || op.status === 'failed') &&
      op.availableAtMs <= now &&
      op.attempts < op.maxAttempts
  )
}

/**
 * List all ops (for debugging)
 */
export async function listAll(userId: string): Promise<OutboxOp[]> {
  const db = await getDb()
  const tx = db.transaction(STORE_NAME, 'readonly')
  const store = tx.objectStore(STORE_NAME)
  const index = store.index('userId')
  return (await index.getAll(userId)) as OutboxOp[]
}

/**
 * Get a single op by ID
 */
export async function getOp(opId: string): Promise<OutboxOp | undefined> {
  const db = await getDb()
  return db.get(STORE_NAME, opId) as Promise<OutboxOp | undefined>
}

export async function markApplying(opId: string): Promise<OutboxOp | null> {
  const db = await getDb()
  const op = await db.get(STORE_NAME, opId)
  if (!op) return null
  op.status = 'applying'
  await db.put(STORE_NAME, op)
  return op as OutboxOp
}

export async function markApplied(opId: string): Promise<void> {
  const db = await getDb()
  const op = await db.get(STORE_NAME, opId)
  if (!op) return
  op.status = 'applied'
  await db.put(STORE_NAME, op)
}

export async function markFailed(opId: string, error: Error | string, errorCode?: string): Promise<void> {
  const db = await getDb()
  const op = await db.get(STORE_NAME, opId)
  if (!op) return

  op.status = 'failed'
  op.attempts = (op.attempts ?? 0) + 1
  op.lastError = {
    message: typeof error === 'string' ? error : error.message,
    code: errorCode,
    timestamp: Date.now()
  }

  // Calculate next retry time with backoff
  op.availableAtMs = Date.now() + calculateBackoffMs(op.attempts)

  await db.put(STORE_NAME, op)
}

/**
 * Retry a specific failed op
 */
export async function retryOp(opId: string): Promise<OutboxOp | null> {
  const db = await getDb()
  const op = await db.get(STORE_NAME, opId)
  if (!op || op.status !== 'failed') return null

  op.status = 'pending'
  op.availableAtMs = Date.now()
  await db.put(STORE_NAME, op)
  return op as OutboxOp
}

/**
 * Retry all failed ops for a user
 */
export async function retryAll(userId: string): Promise<number> {
  const db = await getDb()
  const tx = db.transaction(STORE_NAME, 'readwrite')
  const store = tx.objectStore(STORE_NAME)
  const index = store.index('userId')
  const ops = (await index.getAll(userId)) as OutboxOp[]

  let count = 0
  for (const op of ops) {
    if (op.status === 'failed') {
      op.status = 'pending'
      op.availableAtMs = Date.now()
      await store.put(op)
      count++
    }
  }

  await tx.done
  return count
}

export async function removeApplied(olderThanMs?: number): Promise<void> {
  const db = await getDb()
  const tx = db.transaction(STORE_NAME, 'readwrite')
  const store = tx.objectStore(STORE_NAME)
  const allOps = (await store.getAll()) as OutboxOp[]
  for (const op of allOps) {
    if (op.status === 'applied' && (!olderThanMs || op.createdAtMs + olderThanMs < Date.now())) {
      await store.delete(op.opId)
    }
  }
  await tx.done
}

/**
 * Remove a specific op by ID
 */
export async function removeOp(opId: string): Promise<void> {
  const db = await getDb()
  await db.delete(STORE_NAME, opId)
}

/**
 * Get statistics about the outbox
 */
export async function getOutboxStats(userId: string): Promise<{
  pending: number
  failed: number
  applying: number
  applied: number
  total: number
}> {
  const ops = await listAll(userId)
  return {
    pending: ops.filter((op) => op.status === 'pending').length,
    failed: ops.filter((op) => op.status === 'failed').length,
    applying: ops.filter((op) => op.status === 'applying').length,
    applied: ops.filter((op) => op.status === 'applied').length,
    total: ops.length
  }
}

