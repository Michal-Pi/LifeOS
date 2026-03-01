/**
 * Mailbox Outbox Store
 *
 * IndexedDB-backed queue for offline message sends.
 * Follows the same pattern as the calendar outbox (store.ts).
 * No coalescing needed — each send operation is independent.
 */

import { openDB, type IDBPDatabase } from 'idb'
import type { MessageSource } from '@lifeos/agents'

// ----- Types -----

export type MailboxOutboxStatus = 'pending' | 'applying' | 'failed' | 'applied'

export interface MailboxSendOp {
  opId: string
  userId: string
  source: MessageSource
  connectionId?: string
  recipientId: string
  recipientName?: string
  /** Additional To recipients beyond recipientId */
  toRecipients?: Array<{ id: string; name?: string }>
  /** CC recipients (email channels) */
  ccRecipients?: Array<{ id: string; name?: string }>
  /** BCC recipients (email channels) */
  bccRecipients?: Array<{ id: string; name?: string }>
  subject?: string
  body: string
  htmlBody?: string
  inReplyTo?: string
  threadId?: string
  status: MailboxOutboxStatus
  createdAtMs: number
  availableAtMs: number
  attempts: number
  maxAttempts: number
  lastError?: { message: string; code?: string; timestamp?: number }
}

const BACKOFF_CONFIG = {
  baseDelayMs: 1000,
  maxDelayMs: 60_000,
  maxAttempts: 10,
  jitterFactor: 0.2,
} as const

export function calculateBackoffMs(attempts: number): number {
  const { baseDelayMs, maxDelayMs, jitterFactor } = BACKOFF_CONFIG
  const exponentialDelay = baseDelayMs * Math.pow(2, attempts)
  const cappedDelay = Math.min(exponentialDelay, maxDelayMs)
  const jitter = cappedDelay * jitterFactor * (Math.random() - 0.5) * 2
  return Math.round(cappedDelay + jitter)
}

// ----- IndexedDB -----

function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

const DB_NAME = 'lifeos-mailbox-outbox'
const DB_VERSION = 2
const STORE_NAME = 'mailbox-ops'

let dbPromise: Promise<IDBPDatabase> | null = null

async function getDb() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'opId' })
          store.createIndex('userId', 'userId')
          store.createIndex('status', 'status')
          store.createIndex('availableAtMs', 'availableAtMs')
        }
      },
    })
  }
  return dbPromise
}

// ----- Operations -----

export async function enqueueSend(
  userId: string,
  params: {
    source: MessageSource
    connectionId?: string
    recipientId: string
    recipientName?: string
    toRecipients?: Array<{ id: string; name?: string }>
    ccRecipients?: Array<{ id: string; name?: string }>
    bccRecipients?: Array<{ id: string; name?: string }>
    subject?: string
    body: string
    htmlBody?: string
    inReplyTo?: string
    threadId?: string
  }
): Promise<MailboxSendOp> {
  const db = await getDb()
  const now = Date.now()
  const op: MailboxSendOp = {
    opId: generateId(),
    userId,
    source: params.source,
    connectionId: params.connectionId,
    recipientId: params.recipientId,
    recipientName: params.recipientName,
    toRecipients: params.toRecipients,
    ccRecipients: params.ccRecipients,
    bccRecipients: params.bccRecipients,
    subject: params.subject,
    body: params.body,
    htmlBody: params.htmlBody,
    inReplyTo: params.inReplyTo,
    threadId: params.threadId,
    status: 'pending',
    createdAtMs: now,
    availableAtMs: now,
    attempts: 0,
    maxAttempts: BACKOFF_CONFIG.maxAttempts,
  }
  await db.add(STORE_NAME, op)
  return op
}

export async function listReady(userId: string): Promise<MailboxSendOp[]> {
  const db = await getDb()
  const index = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).index('userId')
  const ops = (await index.getAll(userId)) as MailboxSendOp[]
  const now = Date.now()
  return ops.filter(
    (op) =>
      (op.status === 'pending' || op.status === 'failed') &&
      op.availableAtMs <= now &&
      op.attempts < op.maxAttempts
  )
}

export async function listAll(userId: string): Promise<MailboxSendOp[]> {
  const db = await getDb()
  const index = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).index('userId')
  return (await index.getAll(userId)) as MailboxSendOp[]
}

export async function markApplying(opId: string): Promise<MailboxSendOp | null> {
  const db = await getDb()
  const op = (await db.get(STORE_NAME, opId)) as MailboxSendOp | undefined
  if (!op) return null
  op.status = 'applying'
  await db.put(STORE_NAME, op)
  return op
}

export async function markApplied(opId: string): Promise<void> {
  const db = await getDb()
  const op = (await db.get(STORE_NAME, opId)) as MailboxSendOp | undefined
  if (!op) return
  op.status = 'applied'
  await db.put(STORE_NAME, op)
}

export async function markFailed(
  opId: string,
  error: Error | string,
  isNetworkError?: boolean
): Promise<void> {
  const db = await getDb()
  const op = (await db.get(STORE_NAME, opId)) as MailboxSendOp | undefined
  if (!op) return

  op.status = 'failed'
  if (!isNetworkError) {
    op.attempts = (op.attempts ?? 0) + 1
  }
  op.lastError = {
    message: typeof error === 'string' ? error : error.message,
    timestamp: Date.now(),
  }
  const backoffMs = isNetworkError ? 5000 : calculateBackoffMs(op.attempts)
  op.availableAtMs = Date.now() + backoffMs
  await db.put(STORE_NAME, op)
}

export async function retryOp(opId: string): Promise<MailboxSendOp | null> {
  const db = await getDb()
  const op = (await db.get(STORE_NAME, opId)) as MailboxSendOp | undefined
  if (!op || op.status !== 'failed') return null
  op.status = 'pending'
  op.availableAtMs = Date.now()
  await db.put(STORE_NAME, op)
  return op
}

export async function retryAll(userId: string): Promise<number> {
  const db = await getDb()
  const tx = db.transaction(STORE_NAME, 'readwrite')
  const store = tx.objectStore(STORE_NAME)
  const index = store.index('userId')
  const ops = (await index.getAll(userId)) as MailboxSendOp[]
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

export async function removeApplied(): Promise<void> {
  const db = await getDb()
  const tx = db.transaction(STORE_NAME, 'readwrite')
  const store = tx.objectStore(STORE_NAME)
  const allOps = (await store.getAll()) as MailboxSendOp[]
  for (const op of allOps) {
    if (op.status === 'applied') {
      await store.delete(op.opId)
    }
  }
  await tx.done
}

export async function getOutboxStats(userId: string) {
  const ops = await listAll(userId)
  return {
    pending: ops.filter((op) => op.status === 'pending').length,
    failed: ops.filter((op) => op.status === 'failed').length,
    applying: ops.filter((op) => op.status === 'applying').length,
    applied: ops.filter((op) => op.status === 'applied').length,
    total: ops.length,
  }
}
