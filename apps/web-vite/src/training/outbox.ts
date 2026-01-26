/**
 * Training Outbox
 *
 * IndexedDB-backed queue for offline training operations.
 */

import { openDB, type IDBPDatabase } from 'idb'
import type {
  ExerciseLibraryItem,
  ExerciseId,
  WorkoutTemplate,
  TemplateId,
  WorkoutPlan,
  PlanId,
  WorkoutSession,
  SessionId,
} from '@lifeos/training'

export type TrainingEntityType = 'exercise' | 'template' | 'plan' | 'session'
export type TrainingOpType = 'create' | 'update' | 'delete'
export type TrainingOutboxStatus = 'pending' | 'applying' | 'failed' | 'applied'

export type TrainingEntityId = ExerciseId | TemplateId | PlanId | SessionId

export interface TrainingOutboxOp {
  opId: string
  type: TrainingOpType
  entityType: TrainingEntityType
  userId: string
  entityId: TrainingEntityId
  payload?: {
    item?: ExerciseLibraryItem | WorkoutTemplate | WorkoutPlan | WorkoutSession
  }

  deviceId: string
  createdAtMs: number
  availableAtMs: number
  attempts: number
  maxAttempts: number
  status: TrainingOutboxStatus
  lastError?: { message: string; code?: string; timestamp?: number }
}

const DB_NAME = 'lifeos-training-outbox'
const DB_VERSION = 1
const STORE_NAME = 'training-ops'

const BACKOFF_CONFIG = {
  baseDelayMs: 1000,
  maxDelayMs: 60 * 1000,
  maxAttempts: 10,
  jitterFactor: 0.2,
} as const

let dbPromise: Promise<IDBPDatabase> | null = null

function getOrCreateDeviceId(): string {
  const key = 'lifeos-device-id'
  let deviceId = localStorage.getItem(key)
  if (!deviceId) {
    deviceId = crypto.randomUUID()
    localStorage.setItem(key, deviceId)
  }
  return deviceId
}

function generateOpId(): string {
  return crypto.randomUUID()
}

function calculateBackoffMs(attempts: number): number {
  const { baseDelayMs, maxDelayMs, jitterFactor } = BACKOFF_CONFIG
  const exponentialDelay = baseDelayMs * Math.pow(2, attempts)
  const cappedDelay = Math.min(exponentialDelay, maxDelayMs)
  const jitter = cappedDelay * jitterFactor * (Math.random() - 0.5) * 2
  return Math.round(cappedDelay + jitter)
}

async function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'opId' })
          store.createIndex('userId', 'userId')
          store.createIndex('entityId', 'entityId')
          store.createIndex('status', 'status')
          store.createIndex('availableAtMs', 'availableAtMs')
          store.createIndex('userId_status', ['userId', 'status'])
        }
      },
    })
  }
  return dbPromise
}

function createOp(params: {
  type: TrainingOpType
  entityType: TrainingEntityType
  userId: string
  entityId: TrainingEntityId
  item?: ExerciseLibraryItem | WorkoutTemplate | WorkoutPlan | WorkoutSession
}): TrainingOutboxOp {
  const now = Date.now()
  return {
    opId: generateOpId(),
    type: params.type,
    entityType: params.entityType,
    userId: params.userId,
    entityId: params.entityId,
    payload: params.item ? { item: params.item } : undefined,
    deviceId: getOrCreateDeviceId(),
    createdAtMs: now,
    availableAtMs: now,
    attempts: 0,
    maxAttempts: BACKOFF_CONFIG.maxAttempts,
    status: 'pending',
  }
}

export async function enqueueTrainingUpsert(
  entityType: TrainingEntityType,
  userId: string,
  entityId: TrainingEntityId,
  item: ExerciseLibraryItem | WorkoutTemplate | WorkoutPlan | WorkoutSession,
  type: 'create' | 'update'
): Promise<TrainingOutboxOp> {
  const db = await getDb()
  const op = createOp({ type, entityType, userId, entityId, item })
  await db.put(STORE_NAME, op)
  return op
}

export async function enqueueTrainingDelete(
  entityType: TrainingEntityType,
  userId: string,
  entityId: TrainingEntityId
): Promise<TrainingOutboxOp> {
  const db = await getDb()
  const op = createOp({ type: 'delete', entityType, userId, entityId })
  await db.put(STORE_NAME, op)
  return op
}

export async function listReadyTrainingOps(userId: string): Promise<TrainingOutboxOp[]> {
  const db = await getDb()
  const index = db.transaction(STORE_NAME).store.index('userId')
  const ops = await index.getAll(userId)
  const now = Date.now()
  return ops.filter((op) => op.status === 'pending' && op.availableAtMs <= now)
}

export async function markTrainingOpApplying(opId: string): Promise<void> {
  const db = await getDb()
  const op = (await db.get(STORE_NAME, opId)) as TrainingOutboxOp | undefined
  if (!op) return
  op.status = 'applying'
  await db.put(STORE_NAME, op)
}

export async function markTrainingOpApplied(opId: string): Promise<void> {
  const db = await getDb()
  const op = (await db.get(STORE_NAME, opId)) as TrainingOutboxOp | undefined
  if (!op) return
  op.status = 'applied'
  await db.put(STORE_NAME, op)
}

export async function markTrainingOpFailed(opId: string, error: Error): Promise<void> {
  const db = await getDb()
  const op = (await db.get(STORE_NAME, opId)) as TrainingOutboxOp | undefined
  if (!op) return
  const attempts = op.attempts + 1
  const shouldRetry = attempts < op.maxAttempts
  op.attempts = attempts
  op.status = shouldRetry ? 'pending' : 'failed'
  op.availableAtMs = shouldRetry ? Date.now() + calculateBackoffMs(attempts) : Date.now()
  op.lastError = { message: error.message, timestamp: Date.now() }
  await db.put(STORE_NAME, op)
}

export async function removeTrainingOp(opId: string): Promise<void> {
  const db = await getDb()
  await db.delete(STORE_NAME, opId)
}
