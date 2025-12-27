import { generateId } from '@lifeos/core'
import type { CanonicalCalendarEvent, SyncState, WritebackError } from '../domain/models'
import type {
  WritebackJob,
  WritebackOp,
  WritebackCreatePayload,
  WritebackUpdatePayload,
} from '../domain/writeback'
import { createWritebackJob } from '../domain/writeback'
import type { CalendarEventRepository } from '../ports/calendarRepository'
import type { WritebackRepository } from '../ports/writebackRepository'

export interface WritebackUsecaseDeps {
  eventRepository: CalendarEventRepository
  writebackRepository: WritebackRepository
}

export interface EnqueueWritebackInput {
  uid: string
  eventId: string
  op: WritebackOp
}

export interface EnqueueWritebackResult {
  job: WritebackJob | null
  skipped: boolean
  reason?: string
}

/**
 * Check if event is eligible for writeback
 */
function isWritebackEligible(event: CanonicalCalendarEvent): {
  eligible: boolean
  reason?: string
} {
  // Skip local-only events
  if (event.providerRef.provider === 'local' && !event.primaryProvider) {
    return { eligible: false, reason: 'no_target_provider' }
  }

  // Skip recurring events
  if (event.recurrence?.recurrenceRules?.length || event.providerRef.recurringEventId) {
    return { eligible: false, reason: 'recurring_event_not_supported' }
  }

  // Skip if source is provider (prevent infinite loop)
  if (event.source?.type === 'provider') {
    return { eligible: false, reason: 'source_is_provider' }
  }

  return { eligible: true }
}

/**
 * Build writeback payload for create operation
 */
function buildCreatePayload(event: CanonicalCalendarEvent): WritebackCreatePayload {
  return {
    title: event.title,
    description: event.description,
    location: event.location,
    startIso: event.startIso,
    endIso: event.endIso,
    allDay: event.allDay ?? false,
    timezone: event.timezone,
    transparency: event.transparency,
    visibility: event.visibility,
  }
}

/**
 * Build writeback payload for update operation
 */
function buildUpdatePayload(event: CanonicalCalendarEvent): WritebackUpdatePayload {
  return {
    title: event.title,
    description: event.description,
    location: event.location,
    startIso: event.startIso,
    endIso: event.endIso,
    allDay: event.allDay,
    timezone: event.timezone,
    transparency: event.transparency,
    visibility: event.visibility,
  }
}

/**
 * Enqueue a writeback job for a canonical event
 * Called after canonical write is committed
 */
export async function enqueueWriteback(
  deps: WritebackUsecaseDeps,
  input: EnqueueWritebackInput
): Promise<EnqueueWritebackResult> {
  const { uid, eventId, op } = input

  // Load the canonical event
  const event = await deps.eventRepository.getById(uid, eventId)
  if (!event) {
    return { job: null, skipped: true, reason: 'event_not_found' }
  }

  // Check eligibility
  const { eligible, reason } = isWritebackEligible(event)
  if (!eligible) {
    return { job: null, skipped: true, reason }
  }

  // Check for existing pending job for this event to prevent duplicates
  const existingJobs = await deps.writebackRepository.findPendingByEventId(uid, eventId)
  if (existingJobs.length > 0) {
    // Update existing job instead of creating new one
    const existingJob = existingJobs[0]

    // If same op, just return the existing job
    if (existingJob.op === op) {
      return { job: existingJob, skipped: false, reason: 'reusing_existing_job' }
    }

    // If different op (e.g., update then delete), replace with new op
    // Delete the old job and create new one
    await deps.writebackRepository.delete(uid, existingJob.jobId)
  }

  // Determine provider details
  const provider = event.primaryProvider ?? event.providerRef.provider
  const accountId = event.providerRef.accountId
  const providerCalendarId = event.providerRef.providerCalendarId
  const providerEventId = event.providerRef.providerEventId

  // For update/delete, we need the provider event ID
  if ((op === 'update' || op === 'delete') && !providerEventId) {
    return { job: null, skipped: true, reason: 'no_provider_event_id' }
  }

  // Build payload based on operation
  let payload: WritebackJob['payload']
  if (op === 'create') {
    payload = buildCreatePayload(event)
  } else if (op === 'update') {
    payload = buildUpdatePayload(event)
  } else {
    payload = {} // delete has empty payload
  }

  // Create the job
  const job = createWritebackJob({
    jobId: generateId(),
    uid,
    eventId,
    op,
    provider,
    accountId,
    providerCalendarId,
    providerEventId: op !== 'create' ? providerEventId : undefined,
    payload,
    baseProviderEtag: event.providerRef.etag,
  })

  await deps.writebackRepository.create(uid, job)

  return { job, skipped: false }
}

export interface UpdateEventSyncStateInput {
  uid: string
  eventId: string
  syncState: SyncState
  providerEventId?: string
  providerEtag?: string
  providerUpdatedAtMs?: number
  lastWritebackAtMs?: number
  writebackError?: WritebackError
}

/**
 * Update the sync state of a canonical event after writeback
 */
export async function updateEventSyncState(
  deps: WritebackUsecaseDeps,
  input: UpdateEventSyncStateInput
): Promise<void> {
  const { uid, eventId, ...updates } = input

  const event = await deps.eventRepository.getById(uid, eventId)
  if (!event) {
    throw new Error('Event not found')
  }

  const patch: Partial<CanonicalCalendarEvent> = {
    syncState: updates.syncState,
  }

  if (updates.providerEventId) {
    patch.providerRef = {
      ...event.providerRef,
      providerEventId: updates.providerEventId,
      etag: updates.providerEtag,
    }
  }

  if (updates.providerUpdatedAtMs !== undefined) {
    patch.providerUpdatedAtMs = updates.providerUpdatedAtMs
  }

  if (updates.lastWritebackAtMs !== undefined) {
    patch.lastWritebackAtMs = updates.lastWritebackAtMs
  }

  if (updates.writebackError !== undefined) {
    patch.writebackError = updates.writebackError
  } else if (updates.syncState === 'synced') {
    // Clear error on success
    patch.writebackError = undefined
  }

  await deps.eventRepository.updateEvent(uid, eventId, patch as CanonicalCalendarEvent)
}

export interface ConflictCheckInput {
  event: CanonicalCalendarEvent
  providerUpdatedAtMs: number
}

export interface ConflictCheckResult {
  hasConflict: boolean
  resolution: 'local_wins' | 'provider_wins' | 'no_conflict'
  reason: string
}

/**
 * Check for conflicts between local and provider versions
 */
export function checkForConflict(input: ConflictCheckInput): ConflictCheckResult {
  const { event, providerUpdatedAtMs } = input

  // If provider has been updated after our last canonical update
  if (providerUpdatedAtMs > event.canonicalUpdatedAtMs) {
    // If we have pending local changes, keep local
    if (event.syncState === 'pending_writeback') {
      return {
        hasConflict: true,
        resolution: 'local_wins',
        reason: 'Local changes pending, will attempt writeback',
      }
    }

    // Otherwise, provider wins
    return {
      hasConflict: true,
      resolution: 'provider_wins',
      reason: 'Provider updated after last local change',
    }
  }

  return {
    hasConflict: false,
    resolution: 'no_conflict',
    reason: 'No conflict detected',
  }
}

export interface RetryWritebackInput {
  uid: string
  eventId: string
}

/**
 * Retry a failed writeback for an event
 */
export async function retryWriteback(
  deps: WritebackUsecaseDeps,
  input: RetryWritebackInput
): Promise<EnqueueWritebackResult> {
  const { uid, eventId } = input

  const event = await deps.eventRepository.getById(uid, eventId)
  if (!event) {
    return { job: null, skipped: true, reason: 'event_not_found' }
  }

  // Determine operation based on event state
  let op: WritebackOp = 'update'
  if (event.deletedAtMs) {
    op = 'delete'
  } else if (
    !event.providerRef.providerEventId ||
    event.providerRef.providerEventId.startsWith('local:')
  ) {
    op = 'create'
  }

  // Clear previous error and set to pending
  await updateEventSyncState(deps, {
    uid,
    eventId,
    syncState: 'pending_writeback',
    writebackError: undefined,
  })

  return enqueueWriteback(deps, { uid, eventId, op })
}
