import type { CanonicalCalendarEvent } from '@lifeos/calendar'

export type OutboxOpType = 'create' | 'update' | 'delete'
export type WritebackOp = 'update' | 'rsvp' | 'update_attendees'

export interface WritebackMeta {
  isInstanceEdit?: boolean
  occurrenceStartMs?: number
}

export type OutboxStatus = 'pending' | 'applying' | 'failed' | 'applied'

/**
 * Outbox operation schema (Phase 2.7 upgrade)
 */
export interface OutboxOp {
  opId: string
  type: OutboxOpType
  userId: string
  eventId: string
  payload: CreatePayload | UpdatePayload | DeletePayload

  // Conflict resolution fields
  baseRev?: number // Revision the client was working from
  baseUpdatedAtMs?: number // Timestamp the client was working from
  deviceId: string // Stable device identifier

  // Timing and retry fields
  createdAtMs: number
  availableAtMs: number // When this op can be retried (for backoff)
  attempts: number
  maxAttempts: number

  // Status tracking
  status: OutboxStatus
  lastError?: { message: string; code?: string; timestamp?: number }
}

export type CreatePayload = { event: CanonicalCalendarEvent }
export type UpdatePayload = {
  event: CanonicalCalendarEvent
  writebackOp?: WritebackOp
  writebackMeta?: WritebackMeta
}
export type DeletePayload = object

/**
 * Backoff configuration
 */
export const BACKOFF_CONFIG = {
  baseDelayMs: 1000, // 1 second
  maxDelayMs: 60 * 1000, // 1 minute max
  maxAttempts: 10,
  jitterFactor: 0.2, // 20% jitter
} as const

/**
 * Calculate next retry time with exponential backoff and jitter
 */
export function calculateBackoffMs(attempts: number): number {
  const { baseDelayMs, maxDelayMs, jitterFactor } = BACKOFF_CONFIG
  const exponentialDelay = baseDelayMs * Math.pow(2, attempts)
  const cappedDelay = Math.min(exponentialDelay, maxDelayMs)
  const jitter = cappedDelay * jitterFactor * (Math.random() - 0.5) * 2
  return Math.round(cappedDelay + jitter)
}
