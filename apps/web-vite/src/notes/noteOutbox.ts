/**
 * Note Operations Outbox
 *
 * Queue for offline note operations (create, update, delete).
 * Similar to calendar outbox but specialized for notes domain.
 */

import { openDB, type IDBPDatabase } from 'idb'
import type { Note, NoteId, Topic, TopicId, Section, SectionId } from '@lifeos/notes'
import type { JSONContent } from '@tiptap/core'

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

export type NoteOpType = 'create' | 'update' | 'delete'
export type TopicOpType = 'create' | 'update' | 'delete'
export type SectionOpType = 'create' | 'update' | 'delete'
export type OutboxStatus = 'pending' | 'applying' | 'failed' | 'applied'

export interface NoteOutboxOp {
  opId: string
  type: NoteOpType
  userId: string
  noteId: NoteId
  payload: NoteCreatePayload | NoteUpdatePayload | NoteDeletePayload

  // Conflict resolution
  baseRev?: number
  baseUpdatedAtMs?: number
  deviceId: string

  // Timing and retry
  createdAtMs: number
  availableAtMs: number
  attempts: number
  maxAttempts: number

  // Status
  status: OutboxStatus
  lastError?: { message: string; code?: string; timestamp?: number }
}

export interface TopicOutboxOp {
  opId: string
  type: TopicOpType
  userId: string
  topicId: TopicId
  payload: TopicCreatePayload | TopicUpdatePayload | TopicDeletePayload

  deviceId: string
  createdAtMs: number
  availableAtMs: number
  attempts: number
  maxAttempts: number
  status: OutboxStatus
  lastError?: { message: string; code?: string; timestamp?: number }
}

export interface SectionOutboxOp {
  opId: string
  type: SectionOpType
  userId: string
  sectionId: SectionId
  payload: SectionCreatePayload | SectionUpdatePayload | SectionDeletePayload

  deviceId: string
  createdAtMs: number
  availableAtMs: number
  attempts: number
  maxAttempts: number
  status: OutboxStatus
  lastError?: { message: string; code?: string; timestamp?: number }
}

// Payloads
export interface NoteCreatePayload {
  note: Note
}

export interface NoteUpdatePayload {
  noteId: NoteId
  updates: {
    title?: string
    content?: JSONContent
    contentHtml?: string
    topicId?: TopicId | null
    sectionId?: SectionId | null
    projectIds?: string[]
    okrIds?: string[]
    tags?: string[]
    attachmentIds?: string[]
    archived?: boolean
  }
}

export interface NoteDeletePayload {
  noteId: NoteId
}

export interface TopicCreatePayload {
  topic: Topic
}

export interface TopicUpdatePayload {
  topicId: TopicId
  updates: {
    name?: string
    description?: string
  }
}

export interface TopicDeletePayload {
  topicId: TopicId
}

export interface SectionCreatePayload {
  section: Section
}

export interface SectionUpdatePayload {
  sectionId: SectionId
  updates: {
    name?: string
    order?: number
  }
}

export interface SectionDeletePayload {
  sectionId: SectionId
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

const DB_NAME = 'lifeos-note-outbox'
const DB_VERSION = 1

const NOTE_OUTBOX_STORE = 'note-operations'
const TOPIC_OUTBOX_STORE = 'topic-operations'
const SECTION_OUTBOX_STORE = 'section-operations'

let dbPromise: Promise<IDBPDatabase> | null = null

async function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // Note operations store
        if (!db.objectStoreNames.contains(NOTE_OUTBOX_STORE)) {
          const store = db.createObjectStore(NOTE_OUTBOX_STORE, { keyPath: 'opId' })
          store.createIndex('userId', 'userId')
          store.createIndex('noteId', 'noteId')
          store.createIndex('status', 'status')
          store.createIndex('availableAtMs', 'availableAtMs')
        }

        // Topic operations store
        if (!db.objectStoreNames.contains(TOPIC_OUTBOX_STORE)) {
          const store = db.createObjectStore(TOPIC_OUTBOX_STORE, { keyPath: 'opId' })
          store.createIndex('userId', 'userId')
          store.createIndex('topicId', 'topicId')
          store.createIndex('status', 'status')
        }

        // Section operations store
        if (!db.objectStoreNames.contains(SECTION_OUTBOX_STORE)) {
          const store = db.createObjectStore(SECTION_OUTBOX_STORE, { keyPath: 'opId' })
          store.createIndex('userId', 'userId')
          store.createIndex('sectionId', 'sectionId')
          store.createIndex('status', 'status')
        }
      },
    })
  }
  return dbPromise
}

// ============================================================================
// Note Operations
// ============================================================================

function createNoteOp(
  type: NoteOpType,
  userId: string,
  noteId: NoteId,
  payload: NoteOutboxOp['payload'],
  baseRev?: number,
  baseUpdatedAtMs?: number
): NoteOutboxOp {
  const now = Date.now()
  return {
    opId: generateOpId(),
    type,
    userId,
    noteId,
    payload,
    baseRev,
    baseUpdatedAtMs,
    deviceId: getOrCreateDeviceId(),
    createdAtMs: now,
    availableAtMs: now,
    attempts: 0,
    maxAttempts: BACKOFF_CONFIG.maxAttempts,
    status: 'pending',
  }
}

export async function enqueueNoteOp(
  type: NoteOpType,
  userId: string,
  noteId: NoteId,
  payload: NoteOutboxOp['payload'],
  baseRev?: number,
  baseUpdatedAtMs?: number
): Promise<NoteOutboxOp> {
  const db = await getDb()
  const tx = db.transaction(NOTE_OUTBOX_STORE, 'readwrite')
  const store = tx.store
  const index = store.index('noteId')

  // Find existing pending ops for this note
  const existingOps = (await index.getAll(noteId)) as NoteOutboxOp[]
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
      const updatePayload = payload as NoteUpdatePayload
      const existingPayload = existingCreate.payload as NoteCreatePayload
      existingPayload.note = {
        ...existingPayload.note,
        ...updatePayload.updates,
        updatedAtMs: Date.now(),
        version: existingPayload.note.version + 1,
        syncState: 'pending',
      }
      existingCreate.payload = existingPayload
      await store.put(existingCreate)
      await tx.done
      return existingCreate
    }
  }

  // Create new op
  const op = createNoteOp(type, userId, noteId, payload, baseRev, baseUpdatedAtMs)
  await store.add(op)
  await tx.done
  return op
}

export async function listPendingNoteOps(userId: string): Promise<NoteOutboxOp[]> {
  const db = await getDb()
  const index = db.transaction(NOTE_OUTBOX_STORE).store.index('userId')
  const ops = (await index.getAll(userId)) as NoteOutboxOp[]
  return ops.filter((op) => op.status === 'pending' || op.status === 'failed')
}

export async function listReadyNoteOps(userId: string): Promise<NoteOutboxOp[]> {
  const db = await getDb()
  const index = db.transaction(NOTE_OUTBOX_STORE).store.index('userId')
  const ops = (await index.getAll(userId)) as NoteOutboxOp[]
  const now = Date.now()

  return ops.filter(
    (op) =>
      (op.status === 'pending' || op.status === 'failed') &&
      op.availableAtMs <= now &&
      op.attempts < op.maxAttempts
  )
}

export async function markNoteOpApplying(opId: string): Promise<NoteOutboxOp | null> {
  const db = await getDb()
  const op = (await db.get(NOTE_OUTBOX_STORE, opId)) as NoteOutboxOp | undefined
  if (!op) return null
  op.status = 'applying'
  await db.put(NOTE_OUTBOX_STORE, op)
  return op
}

export async function markNoteOpApplied(opId: string): Promise<void> {
  const db = await getDb()
  const op = await db.get(NOTE_OUTBOX_STORE, opId)
  if (!op) return
  op.status = 'applied'
  await db.put(NOTE_OUTBOX_STORE, op)
}

export async function markNoteOpFailed(
  opId: string,
  error: Error | string,
  errorCode?: string
): Promise<void> {
  const db = await getDb()
  const op = (await db.get(NOTE_OUTBOX_STORE, opId)) as NoteOutboxOp | undefined
  if (!op) return

  op.status = 'failed'
  op.attempts = (op.attempts ?? 0) + 1
  op.lastError = {
    message: typeof error === 'string' ? error : error.message,
    code: errorCode,
    timestamp: Date.now(),
  }

  op.availableAtMs = Date.now() + calculateBackoffMs(op.attempts)
  await db.put(NOTE_OUTBOX_STORE, op)
}

export async function removeNoteOp(opId: string): Promise<void> {
  const db = await getDb()
  await db.delete(NOTE_OUTBOX_STORE, opId)
}

export function __resetNoteOutboxDbForTests(): void {
  dbPromise = null
}

// ============================================================================
// Topic Operations
// ============================================================================

function createTopicOp(
  type: TopicOpType,
  userId: string,
  topicId: TopicId,
  payload: TopicOutboxOp['payload']
): TopicOutboxOp {
  const now = Date.now()
  return {
    opId: generateOpId(),
    type,
    userId,
    topicId,
    payload,
    deviceId: getOrCreateDeviceId(),
    createdAtMs: now,
    availableAtMs: now,
    attempts: 0,
    maxAttempts: BACKOFF_CONFIG.maxAttempts,
    status: 'pending',
  }
}

export async function enqueueTopicOp(
  type: TopicOpType,
  userId: string,
  topicId: TopicId,
  payload: TopicOutboxOp['payload']
): Promise<TopicOutboxOp> {
  const db = await getDb()
  const op = createTopicOp(type, userId, topicId, payload)
  await db.add(TOPIC_OUTBOX_STORE, op)
  return op
}

export async function listPendingTopicOps(userId: string): Promise<TopicOutboxOp[]> {
  const db = await getDb()
  const index = db.transaction(TOPIC_OUTBOX_STORE).store.index('userId')
  const ops = (await index.getAll(userId)) as TopicOutboxOp[]
  return ops.filter((op) => op.status === 'pending' || op.status === 'failed')
}

export async function markTopicOpApplied(opId: string): Promise<void> {
  const db = await getDb()
  const op = await db.get(TOPIC_OUTBOX_STORE, opId)
  if (!op) return
  op.status = 'applied'
  await db.put(TOPIC_OUTBOX_STORE, op)
}

export async function markTopicOpFailed(
  opId: string,
  error: Error | string,
  errorCode?: string
): Promise<void> {
  const db = await getDb()
  const op = (await db.get(TOPIC_OUTBOX_STORE, opId)) as TopicOutboxOp | undefined
  if (!op) return

  op.status = 'failed'
  op.attempts = (op.attempts ?? 0) + 1
  op.lastError = {
    message: typeof error === 'string' ? error : error.message,
    code: errorCode,
    timestamp: Date.now(),
  }

  op.availableAtMs = Date.now() + calculateBackoffMs(op.attempts)
  await db.put(TOPIC_OUTBOX_STORE, op)
}

// ============================================================================
// Section Operations
// ============================================================================

function createSectionOp(
  type: SectionOpType,
  userId: string,
  sectionId: SectionId,
  payload: SectionOutboxOp['payload']
): SectionOutboxOp {
  const now = Date.now()
  return {
    opId: generateOpId(),
    type,
    userId,
    sectionId,
    payload,
    deviceId: getOrCreateDeviceId(),
    createdAtMs: now,
    availableAtMs: now,
    attempts: 0,
    maxAttempts: BACKOFF_CONFIG.maxAttempts,
    status: 'pending',
  }
}

export async function enqueueSectionOp(
  type: SectionOpType,
  userId: string,
  sectionId: SectionId,
  payload: SectionOutboxOp['payload']
): Promise<SectionOutboxOp> {
  const db = await getDb()
  const op = createSectionOp(type, userId, sectionId, payload)
  await db.add(SECTION_OUTBOX_STORE, op)
  return op
}

export async function listPendingSectionOps(userId: string): Promise<SectionOutboxOp[]> {
  const db = await getDb()
  const index = db.transaction(SECTION_OUTBOX_STORE).store.index('userId')
  const ops = (await index.getAll(userId)) as SectionOutboxOp[]
  return ops.filter((op) => op.status === 'pending' || op.status === 'failed')
}

export async function markSectionOpApplied(opId: string): Promise<void> {
  const db = await getDb()
  const op = await db.get(SECTION_OUTBOX_STORE, opId)
  if (!op) return
  op.status = 'applied'
  await db.put(SECTION_OUTBOX_STORE, op)
}

export async function markSectionOpFailed(
  opId: string,
  error: Error | string,
  errorCode?: string
): Promise<void> {
  const db = await getDb()
  const op = (await db.get(SECTION_OUTBOX_STORE, opId)) as SectionOutboxOp | undefined
  if (!op) return

  op.status = 'failed'
  op.attempts = (op.attempts ?? 0) + 1
  op.lastError = {
    message: typeof error === 'string' ? error : error.message,
    code: errorCode,
    timestamp: Date.now(),
  }

  op.availableAtMs = Date.now() + calculateBackoffMs(op.attempts)
  await db.put(SECTION_OUTBOX_STORE, op)
}

// ============================================================================
// Statistics
// ============================================================================

export async function getOutboxStats(userId: string): Promise<{
  notes: { pending: number; failed: number; total: number }
  topics: { pending: number; failed: number; total: number }
  sections: { pending: number; failed: number; total: number }
}> {
  const db = await getDb()

  const [noteOps, topicOps, sectionOps] = await Promise.all([
    db.transaction(NOTE_OUTBOX_STORE).store.index('userId').getAll(userId),
    db.transaction(TOPIC_OUTBOX_STORE).store.index('userId').getAll(userId),
    db.transaction(SECTION_OUTBOX_STORE).store.index('userId').getAll(userId),
  ])

  return {
    notes: {
      pending: (noteOps as NoteOutboxOp[]).filter((op) => op.status === 'pending').length,
      failed: (noteOps as NoteOutboxOp[]).filter((op) => op.status === 'failed').length,
      total: noteOps.length,
    },
    topics: {
      pending: (topicOps as TopicOutboxOp[]).filter((op) => op.status === 'pending').length,
      failed: (topicOps as TopicOutboxOp[]).filter((op) => op.status === 'failed').length,
      total: topicOps.length,
    },
    sections: {
      pending: (sectionOps as SectionOutboxOp[]).filter((op) => op.status === 'pending').length,
      failed: (sectionOps as SectionOutboxOp[]).filter((op) => op.status === 'failed').length,
      total: sectionOps.length,
    },
  }
}
