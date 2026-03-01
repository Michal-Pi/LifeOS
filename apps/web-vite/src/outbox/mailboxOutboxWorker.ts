/**
 * Mailbox Outbox Worker
 *
 * Periodically drains the mailbox send queue, sending messages
 * via the Cloud Function. Handles retries with exponential backoff
 * and re-drains on coming back online.
 *
 * Follows the same pattern as the calendar outbox worker (worker.ts).
 */

import { authenticatedFetch } from '@/lib/authenticatedFetch'
import { functionUrl } from '@/lib/functionsUrl'

import {
  listReady,
  markApplying,
  markApplied,
  markFailed,
  retryAll,
  getOutboxStats,
  removeApplied,
  type MailboxSendOp,
} from './mailboxOutbox'

const PROCESS_INTERVAL_MS = 5_000 // Check every 5 seconds
const CLEANUP_INTERVAL_MS = 60_000 // Cleanup applied ops every minute

let drainTimer: ReturnType<typeof globalThis.setTimeout> | null = null
let cleanupTimer: ReturnType<typeof globalThis.setTimeout> | null = null
let activeUser: string | null = null
let isDraining = false
let onlineListener: (() => void) | null = null

// ----- Listeners -----

type MailboxOutboxListener = (stats: { pending: number; failed: number }) => void
const listeners: Set<MailboxOutboxListener> = new Set()

export function addMailboxOutboxListener(listener: MailboxOutboxListener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

async function notifyListeners() {
  if (!activeUser) return
  const stats = await getOutboxStats(activeUser)
  for (const listener of listeners) {
    try {
      listener({ pending: stats.pending + stats.applying, failed: stats.failed })
    } catch {
      // Ignore listener errors
    }
  }
}

// ----- Apply a single send operation -----

async function applyOp(op: MailboxSendOp): Promise<boolean> {
  const marked = await markApplying(op.opId)
  if (!marked) return false

  try {
    const url = functionUrl('mailboxSend')
    const response = await authenticatedFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uid: op.userId,
        source: op.source,
        connectionId: op.connectionId,
        recipientId: op.recipientId,
        recipientName: op.recipientName,
        toRecipients: op.toRecipients,
        ccRecipients: op.ccRecipients,
        bccRecipients: op.bccRecipients,
        subject: op.subject,
        body: op.body,
        htmlBody: op.htmlBody,
        inReplyTo: op.inReplyTo,
        threadId: op.threadId,
      }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
      throw new Error(
        (errorData as { error?: string }).error || `Send failed (${response.status})`
      )
    }

    await markApplied(op.opId)
    return true
  } catch (error) {
    const err = error as Error
    const message = err.message.toLowerCase()
    const isNetworkError =
      message.includes('network') ||
      message.includes('failed to fetch') ||
      message.includes('timeout') ||
      message.includes('connection') ||
      err.name === 'TypeError'

    await markFailed(op.opId, err, isNetworkError)
    return false
  }
}

// ----- Queue drain -----

async function drainQueue(): Promise<void> {
  if (!activeUser || isDraining) return
  isDraining = true

  try {
    const readyOps = await listReady(activeUser)
    if (readyOps.length === 0) return

    for (const op of readyOps) {
      await applyOp(op)
    }

    await notifyListeners()
  } finally {
    isDraining = false
  }
}

function scheduleDrain() {
  if (drainTimer) globalThis.clearTimeout(drainTimer)
  drainTimer = globalThis.setTimeout(async () => {
    await drainQueue()
    scheduleDrain()
  }, PROCESS_INTERVAL_MS)
}

function scheduleCleanup() {
  if (cleanupTimer) globalThis.clearTimeout(cleanupTimer)
  cleanupTimer = globalThis.setTimeout(async () => {
    await removeApplied()
    scheduleCleanup()
  }, CLEANUP_INTERVAL_MS)
}

// ----- Public API -----

export function startMailboxOutboxWorker(userId: string): void {
  activeUser = userId
  scheduleDrain()
  scheduleCleanup()

  if (typeof globalThis !== 'undefined') {
    if (onlineListener) globalThis.removeEventListener('online', onlineListener)
    onlineListener = () => void drainQueue()
    globalThis.addEventListener('online', onlineListener)
  }
}

export function stopMailboxOutboxWorker(): void {
  if (drainTimer) {
    globalThis.clearTimeout(drainTimer)
    drainTimer = null
  }
  if (cleanupTimer) {
    globalThis.clearTimeout(cleanupTimer)
    cleanupTimer = null
  }
  if (onlineListener && typeof globalThis !== 'undefined') {
    globalThis.removeEventListener('online', onlineListener)
    onlineListener = null
  }
  activeUser = null
}

/** Trigger immediate drain (call after enqueueSend) */
export function triggerDrain(): void {
  void drainQueue()
}

export async function retryAllFailed(userId: string): Promise<number> {
  const count = await retryAll(userId)
  if (count > 0) {
    void drainQueue()
    await notifyListeners()
  }
  return count
}
