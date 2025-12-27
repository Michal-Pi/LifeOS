import type { CanonicalAttendee, CanonicalResponseStatus, Provider } from './models'

/**
 * Writeback operation type
 */
export type WritebackOp = 'create' | 'update' | 'delete' | 'rsvp' | 'update_attendees'

/**
 * Writeback job status
 */
export type WritebackJobStatus = 'pending' | 'processing' | 'failed' | 'succeeded'

/**
 * Error from a writeback attempt
 */
export interface WritebackJobError {
  code?: string
  message: string
  atMs?: number
}

/**
 * Payload for a create operation
 */
export interface WritebackCreatePayload {
  title?: string
  description?: string
  location?: string
  startIso: string
  endIso: string
  allDay: boolean
  timezone?: string
  transparency?: string
  visibility?: string
}

/**
 * Payload for an update operation (partial)
 */
export interface WritebackUpdatePayload {
  title?: string
  description?: string
  location?: string
  startIso?: string
  endIso?: string
  allDay?: boolean
  timezone?: string
  transparency?: string
  visibility?: string
}

/**
 * Payload for a delete operation (empty, but typed for consistency)
 */
export type WritebackDeletePayload = Record<string, never>

/**
 * Payload for an RSVP operation
 */
export interface WritebackRSVPPayload {
  selfEmail: string
  newStatus: CanonicalResponseStatus
}

/**
 * Payload for an attendee update operation
 */
export interface WritebackAttendeesPayload {
  attendees: CanonicalAttendee[]
  sendUpdates?: 'all' | 'none' | 'externalOnly'
}

/**
 * Union of all writeback payloads
 */
export type WritebackPayload =
  | WritebackCreatePayload
  | WritebackUpdatePayload
  | WritebackDeletePayload
  | WritebackRSVPPayload
  | WritebackAttendeesPayload

/**
 * A job in the writeback queue
 * Stored at /users/{uid}/calendarWritebackQueue/{jobId}
 */
export interface WritebackJob {
  jobId: string
  uid: string
  eventId: string // canonical event ID

  op: WritebackOp
  provider: Provider
  accountId: string
  providerCalendarId: string
  providerEventId?: string // Required for update/delete, set after create

  payload: WritebackPayload
  baseProviderEtag?: string // For optimistic concurrency

  createdAtMs: number
  availableAtMs: number // For retry scheduling (delay before next attempt)
  attempts: number
  maxAttempts: number
  status: WritebackJobStatus
  lastError?: WritebackJobError
}

/**
 * Retry schedule (exponential backoff)
 * Returns delay in ms before next retry
 */
export function getRetryDelay(attempts: number): number {
  const delays = [
    1 * 60 * 1000, // 1 minute
    5 * 60 * 1000, // 5 minutes
    15 * 60 * 1000, // 15 minutes
    60 * 60 * 1000, // 1 hour
    6 * 60 * 60 * 1000, // 6 hours (cap)
  ]
  return delays[Math.min(attempts, delays.length - 1)]
}

/**
 * Create a new writeback job
 */
export function createWritebackJob(params: {
  jobId: string
  uid: string
  eventId: string
  op: WritebackOp
  provider: Provider
  accountId: string
  providerCalendarId: string
  providerEventId?: string
  payload: WritebackPayload
  baseProviderEtag?: string
}): WritebackJob {
  const now = Date.now()
  return {
    ...params,
    createdAtMs: now,
    availableAtMs: now, // Immediately available
    attempts: 0,
    maxAttempts: 10,
    status: 'pending',
  }
}

/**
 * Mark a job as processing
 */
export function markJobProcessing(job: WritebackJob): WritebackJob {
  return {
    ...job,
    status: 'processing',
    attempts: job.attempts + 1,
  }
}

/**
 * Mark a job as succeeded
 */
export function markJobSucceeded(job: WritebackJob): WritebackJob {
  return {
    ...job,
    status: 'succeeded',
  }
}

/**
 * Mark a job as failed with retry
 */
export function markJobFailedWithRetry(job: WritebackJob, error: WritebackJobError): WritebackJob {
  const delay = getRetryDelay(job.attempts)
  return {
    ...job,
    status: 'pending', // Back to pending for retry
    availableAtMs: Date.now() + delay,
    lastError: error,
  }
}

/**
 * Mark a job as permanently failed
 */
export function markJobFailed(job: WritebackJob, error: WritebackJobError): WritebackJob {
  return {
    ...job,
    status: 'failed',
    lastError: error,
  }
}

/**
 * Check if a job should be retried
 */
export function shouldRetry(job: WritebackJob): boolean {
  return job.attempts < job.maxAttempts
}

/**
 * Check if a job is available for processing
 */
export function isJobAvailable(job: WritebackJob): boolean {
  return job.status === 'pending' && job.availableAtMs <= Date.now()
}

/**
 * Error categories for retry decisions
 */
export type ErrorCategory =
  | 'auth' // Auth error - stop retries, mark account needs_attention
  | 'validation' // 4xx validation - fail permanently
  | 'conflict' // 409/412 etag mismatch - treat as conflict
  | 'transient' // 5xx or network - retry

/**
 * Categorize an error for retry decisions
 */
export function categorizeError(code?: string, statusCode?: number): ErrorCategory {
  if (code === 'invalid_grant' || code === 'auth_error') {
    return 'auth'
  }
  if (statusCode === 409 || statusCode === 412) {
    return 'conflict'
  }
  if (statusCode && statusCode >= 400 && statusCode < 500) {
    return 'validation'
  }
  return 'transient'
}
