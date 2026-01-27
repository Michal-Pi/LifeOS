import type { CanonicalCalendarEvent } from '@lifeos/calendar'
import { getOrCreateDeviceId, createLogger } from '@lifeos/calendar'

import { createFirestoreCalendarEventRepository } from '@/adapters/firestoreCalendarEventRepository'
import { functionUrl } from '@/lib/functionsUrl'
import { authenticatedFetch } from '@/lib/authenticatedFetch'

import {
  enqueueOp,
  listReady,
  listPending,
  markApplying,
  markApplied,
  markFailed,
  retryOp,
  retryAll,
  getOutboxStats,
} from './store'
import type { OutboxOp, CreatePayload, UpdatePayload, WritebackOp, WritebackMeta } from './types'

const logger = createLogger('Outbox')
const repository = createFirestoreCalendarEventRepository()
const PROCESS_INTERVAL_MS = 5 * 1000 // Check every 5 seconds

let drainTimer: ReturnType<typeof globalThis.setTimeout> | null = null
let activeUser: string | null = null
let isDraining = false
let onlineListener: (() => void) | null = null

/** Event listeners for outbox state changes */
type OutboxListener = (stats: { pending: number; failed: number }) => void
const listeners: Set<OutboxListener> = new Set()

export function addOutboxListener(listener: OutboxListener): () => void {
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

/**
 * Trigger writeback to Google Calendar after canonical write
 * This calls the Cloud Function to enqueue a server-side writeback job
 */
async function triggerWriteback(
  userId: string,
  eventId: string,
  op: 'create' | 'update' | 'delete' | WritebackOp,
  meta?: WritebackMeta
): Promise<void> {
  try {
    const params = new URLSearchParams({
      uid: userId,
      eventId,
      op,
    })
    if (meta?.isInstanceEdit) {
      params.set('isInstanceEdit', 'true')
    }
    if (typeof meta?.occurrenceStartMs === 'number') {
      params.set('occurrenceStartMs', String(meta.occurrenceStartMs))
    }
    const url = functionUrl(`enqueueWriteback?${params.toString()}`)
    const response = await authenticatedFetch(url)
    if (!response.ok) {
      logger.warn('Failed to enqueue writeback', { response: await response.text(), eventId, op })
    }
  } catch (error) {
    // Non-critical - writeback will be picked up by scheduler
    logger.warn('Failed to trigger writeback', { error, eventId, op })
  }
}

/**
 * Apply a single outbox operation
 */
async function applyOp(op: OutboxOp): Promise<boolean> {
  const markedOp = await markApplying(op.opId)
  if (!markedOp) {
    logger.warn('Op not found', { opId: op.opId })
    return false
  }

  try {
    if (op.type === 'create') {
      const payload = op.payload as CreatePayload
      // Ensure event has rev and deviceId
      const eventWithMetadata: CanonicalCalendarEvent = {
        ...payload.event,
        rev: payload.event.rev ?? 1,
        updatedByDeviceId: op.deviceId,
      }
      await repository.createEvent(op.userId, eventWithMetadata)
      // Trigger writeback after successful canonical write
      await triggerWriteback(op.userId, op.eventId, 'create')
    } else if (op.type === 'update') {
      const payload = op.payload as UpdatePayload
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/2bddec7c-aa7e-4f19-a8ce-8da88e49811f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'worker.ts:109',message:'Before updateEventWithConflictResolution',data:{userId:op.userId,eventId:op.eventId,hasEvent:!!payload.event,baseRev:op.baseRev,deviceId:op.deviceId,eventKeys:payload.event?Object.keys(payload.event):[]},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
      // #endregion
      // Use transaction-based update with conflict resolution
      await repository.updateEventWithConflictResolution(
        op.userId,
        op.eventId,
        payload.event,
        op.baseRev,
        op.deviceId
      )
      const writebackOp = payload.writebackOp ?? 'update'
      const writebackMeta = payload.writebackMeta
      // Trigger writeback after successful canonical write
      await triggerWriteback(op.userId, op.eventId, writebackOp, writebackMeta)
    } else if (op.type === 'delete') {
      await repository.deleteEvent(op.userId, op.eventId, op.baseUpdatedAtMs)
      // Trigger writeback after successful canonical write
      await triggerWriteback(op.userId, op.eventId, 'delete')
    }

    await markApplied(op.opId)
    logger.info(`Applied ${op.type} for event`, { eventId: op.eventId, opType: op.type })
    return true
  } catch (error) {
    const err = error as Error & { code?: string }
    const errorCode = err.code ?? 'unknown'

    // Determine if error is retryable
    const isConflict = errorCode === 'conflict' || err.message.includes('conflict')

    await markFailed(op.opId, err, isConflict ? 'conflict' : errorCode)

      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/2bddec7c-aa7e-4f19-a8ce-8da88e49811f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'worker.ts:138',message:'Outbox op failed',data:{errorCode:errorCode,errorMessage:err.message,eventId:op.eventId,opType:op.type,attempt:op.attempts+1,userId:op.userId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
      // #endregion
      logger.warn(`Failed ${op.type} for event`, {
        error: err,
        eventId: op.eventId,
        attempt: op.attempts + 1,
        opType: op.type,
      })

    return false
  }
}

/**
 * Drain the outbox queue, processing ready operations
 */
async function drainQueue(): Promise<void> {
  if (!activeUser) return
  if (isDraining) return
  // Always attempt drain - network errors handled gracefully by applyOp

  isDraining = true

  try {
    const readyOps = await listReady(activeUser)
    if (readyOps.length === 0) {
      return
    }

    logger.info('Processing ready ops', { count: readyOps.length })

    // Process ops sequentially to respect order
    for (const op of readyOps) {
      const success = await applyOp(op)
      if (!success) {
        // Continue with other ops even if one fails
        continue
      }
    }

    // Notify listeners of state change
    await notifyListeners()
  } finally {
    isDraining = false
  }
}

function scheduleDrain() {
  if (drainTimer) {
    globalThis.clearTimeout(drainTimer)
  }
  drainTimer = globalThis.setTimeout(async () => {
    await drainQueue()
    scheduleDrain()
  }, PROCESS_INTERVAL_MS)
}

/**
 * Start the outbox worker for a user
 */
export function startOutboxWorker(userId: string): void {
  activeUser = userId
  scheduleDrain()

  if (typeof globalThis !== 'undefined') {
    if (onlineListener) {
      globalThis.removeEventListener('online', onlineListener)
    }
    onlineListener = () => {
      logger.info('Back online, draining queue')
      void drainQueue()
    }
    globalThis.addEventListener('online', onlineListener)
  }

  logger.info('Worker started', { userId })
}

/**
 * Stop the outbox worker
 */
export function stopOutboxWorker(): void {
  if (drainTimer) {
    globalThis.clearTimeout(drainTimer)
    drainTimer = null
  }
  if (onlineListener && typeof globalThis !== 'undefined') {
    globalThis.removeEventListener('online', onlineListener)
    onlineListener = null
  }
  activeUser = null
  logger.info('Worker stopped')
}

/**
 * Enqueue a create operation
 */
export async function enqueueCreate(
  userId: string,
  event: CanonicalCalendarEvent
): Promise<OutboxOp> {
  // Ensure event has initial rev
  const eventWithRev: CanonicalCalendarEvent = {
    ...event,
    rev: event.rev ?? 1,
    updatedByDeviceId: getOrCreateDeviceId(),
  }

  const op = await enqueueOp('create', userId, event.canonicalEventId, { event: eventWithRev })
  void drainQueue()
  await notifyListeners()
  return op
}

/**
 * Enqueue an update operation
 */
export async function enqueueUpdate(
  userId: string,
  event: CanonicalCalendarEvent,
  baseRev?: number,
  writebackOp?: WritebackOp,
  writebackMeta?: WritebackMeta
): Promise<OutboxOp> {
  const op = await enqueueOp(
    'update',
    userId,
    event.canonicalEventId,
    { event, writebackOp, writebackMeta },
    baseRev ?? event.rev,
    event.updatedAtMs
  )
  void drainQueue()
  await notifyListeners()
  return op
}

/**
 * Enqueue a delete operation
 */
export async function enqueueDelete(
  userId: string,
  eventId: string,
  baseRev?: number,
  baseUpdatedAtMs?: number
): Promise<OutboxOp> {
  const op = await enqueueOp('delete', userId, eventId, {}, baseRev, baseUpdatedAtMs)
  void drainQueue()
  await notifyListeners()
  return op
}

/**
 * Retry a specific failed operation
 */
export async function retryFailedOp(opId: string): Promise<boolean> {
  const op = await retryOp(opId)
  if (op) {
    void drainQueue()
    await notifyListeners()
    return true
  }
  return false
}

/**
 * Retry all failed operations
 */
export async function retryAllFailed(userId: string): Promise<number> {
  const count = await retryAll(userId)
  if (count > 0) {
    void drainQueue()
    await notifyListeners()
  }
  return count
}

/**
 * Get current outbox status
 */
export async function getOutboxStatus(userId: string) {
  return getOutboxStats(userId)
}

/**
 * Re-export listPending for external use
 */
export { listPending }
