import { createLogger } from '../lib/logger.js'
import { FieldValue } from 'firebase-admin/firestore'
import {
  insertEvent,
  patchEvent,
  deleteEvent as deleteGoogleEvent,
  toGoogleEventInput,
  getRecurringInstances,
} from './calendarApi.js'
import {
  writebackQueueRef,
  writebackQueueCollection,
  canonicalEventRef,
  accountRef,
  instanceMapRef,
} from './paths.js'

const log = createLogger('GoogleWriteback')

/**
 * Writeback job status
 */
type WritebackJobStatus = 'pending' | 'processing' | 'failed' | 'succeeded'

/**
 * RSVP response status
 */
type ResponseStatus = 'needsAction' | 'accepted' | 'tentative' | 'declined' | 'unknown'

/**
 * Attendee for writeback
 */
interface WritebackAttendee {
  email?: string
  displayName?: string
  responseStatus?: ResponseStatus
  optional?: boolean
  resource?: boolean
  self?: boolean
}

/**
 * Writeback job from Firestore
 */
export interface WritebackJob {
  jobId: string
  uid: string
  eventId: string
  op: 'create' | 'update' | 'delete' | 'rsvp' | 'update_attendees'
  provider: string
  accountId: string
  providerCalendarId: string
  providerEventId?: string
  payload: {
    title?: string
    description?: string
    location?: string
    startIso?: string
    endIso?: string
    allDay?: boolean
    timezone?: string
    transparency?: string
    visibility?: string
    recurrence?: string[] // RRULE/EXDATE strings for recurring series
    // RSVP fields
    selfEmail?: string
    newStatus?: ResponseStatus
    // Attendee update fields
    attendees?: WritebackAttendee[]
    sendUpdates?: 'all' | 'none' | 'externalOnly'
  }
  baseProviderEtag?: string
  createdAtMs: number
  availableAtMs: number
  attempts: number
  maxAttempts: number
  status: WritebackJobStatus
  lastError?: { code?: string; message: string; atMs?: number }
  // Recurrence instance fields
  isInstanceEdit?: boolean // True if editing a single occurrence
  occurrenceStartMs?: number // Original occurrence start time
  providerSeriesId?: string // Provider ID of the recurring series
  seriesId?: string // Canonical ID of the series (for cache lookup)
}

/**
 * Retry delays in milliseconds
 */
const RETRY_DELAYS = [
  1 * 60 * 1000, // 1 minute
  5 * 60 * 1000, // 5 minutes
  15 * 60 * 1000, // 15 minutes
  60 * 60 * 1000, // 1 hour
  6 * 60 * 60 * 1000, // 6 hours (cap)
]

function getRetryDelay(attempts: number): number {
  return RETRY_DELAYS[Math.min(attempts, RETRY_DELAYS.length - 1)]
}

/**
 * Categorize an error for retry decisions
 */
function categorizeError(
  statusCode?: number,
  code?: string
): 'auth' | 'validation' | 'conflict' | 'transient' {
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

/**
 * Claim a job for processing (atomic transition)
 */
export async function claimJob(uid: string, jobId: string): Promise<WritebackJob | null> {
  const jobRef = writebackQueueRef(uid, jobId)

  const result = await jobRef.firestore.runTransaction(async (tx) => {
    const doc = await tx.get(jobRef)
    if (!doc.exists) return null

    const job = doc.data() as WritebackJob
    if (job.status !== 'pending' || job.availableAtMs > Date.now()) {
      return null // Not available
    }

    tx.update(jobRef, {
      status: 'processing',
      attempts: FieldValue.increment(1),
    })

    return { ...job, status: 'processing' as const, attempts: job.attempts + 1 }
  })

  return result
}

/**
 * Mark a job as succeeded
 */
async function markJobSucceeded(uid: string, jobId: string): Promise<void> {
  await writebackQueueRef(uid, jobId).update({
    status: 'succeeded',
  })
}

/**
 * Mark a job as failed with retry
 */
async function markJobForRetry(
  uid: string,
  jobId: string,
  attempts: number,
  error: { code?: string; message: string }
): Promise<void> {
  const delay = getRetryDelay(attempts)
  await writebackQueueRef(uid, jobId).update({
    status: 'pending',
    availableAtMs: Date.now() + delay,
    lastError: { ...error, atMs: Date.now() },
  })
}

/**
 * Mark a job as permanently failed
 */
async function markJobFailed(
  uid: string,
  jobId: string,
  error: { code?: string; message: string }
): Promise<void> {
  await writebackQueueRef(uid, jobId).update({
    status: 'failed',
    lastError: { ...error, atMs: Date.now() },
  })
}

/**
 * Update canonical event sync state after writeback
 */
async function updateEventSyncState(
  uid: string,
  eventId: string,
  updates: {
    syncState: string
    providerEventId?: string
    providerEtag?: string
    providerUpdatedAtMs?: number
    lastWritebackAtMs?: number
    writebackError?: { code?: string; message: string; atMs: number } | null
  }
): Promise<void> {
  const eventRef = canonicalEventRef(uid, eventId)
  const updateData: Record<string, unknown> = {
    syncState: updates.syncState,
  }

  if (updates.providerEventId) {
    updateData['providerRef.providerEventId'] = updates.providerEventId
  }
  if (updates.providerEtag) {
    updateData['providerRef.etag'] = updates.providerEtag
  }
  if (updates.providerUpdatedAtMs !== undefined) {
    updateData.providerUpdatedAtMs = updates.providerUpdatedAtMs
  }
  if (updates.lastWritebackAtMs !== undefined) {
    updateData.lastWritebackAtMs = updates.lastWritebackAtMs
  }
  if (updates.writebackError !== undefined) {
    updateData.writebackError = updates.writebackError
  }

  await eventRef.update(updateData)
}

/**
 * Process a single writeback job
 */
export async function processWritebackJob(job: WritebackJob): Promise<void> {
  const { uid, eventId, op, accountId, providerCalendarId, providerEventId, payload } = job

  try {
    if (op === 'create') {
      // Create event in Google Calendar
      if (!payload.startIso || !payload.endIso) {
        throw new Error('Missing start/end for create operation')
      }

      const googleEvent = toGoogleEventInput({
        title: payload.title,
        description: payload.description,
        location: payload.location,
        startIso: payload.startIso,
        endIso: payload.endIso,
        allDay: payload.allDay ?? false,
        timezone: payload.timezone,
        transparency: payload.transparency,
        visibility: payload.visibility,
        recurrence: payload.recurrence,
        attendees: payload.attendees,
      })

      const result = await insertEvent(uid, accountId, providerCalendarId, googleEvent)

      // Update canonical with provider IDs
      await updateEventSyncState(uid, eventId, {
        syncState: 'synced',
        providerEventId: result.id,
        providerEtag: result.etag,
        providerUpdatedAtMs: new Date(result.updated).getTime(),
        lastWritebackAtMs: Date.now(),
        writebackError: null,
      })

      await markJobSucceeded(uid, job.jobId)
    } else if (op === 'update') {
      let targetEventId = providerEventId

      // For instance edits, resolve the instance ID
      if (job.isInstanceEdit && job.occurrenceStartMs && job.providerSeriesId && job.seriesId) {
        const resolved = await resolveInstanceId(
          uid,
          accountId,
          providerCalendarId,
          job.providerSeriesId,
          job.occurrenceStartMs,
          job.seriesId
        )

        if (!resolved) {
          throw new Error(`Cannot find Google instance for occurrence at ${job.occurrenceStartMs}`)
        }

        targetEventId = resolved.instanceId
      }

      if (!targetEventId) {
        throw new Error('Missing providerEventId for update operation')
      }

      const googleEvent = toGoogleEventInput({
        title: payload.title,
        description: payload.description,
        location: payload.location,
        startIso: payload.startIso ?? '',
        endIso: payload.endIso ?? '',
        allDay: payload.allDay ?? false,
        timezone: payload.timezone,
        transparency: payload.transparency,
        visibility: payload.visibility,
        recurrence: job.isInstanceEdit ? undefined : payload.recurrence, // Don't set recurrence for instance edits
        attendees: payload.attendees,
      })

      const result = await patchEvent(
        uid,
        accountId,
        providerCalendarId,
        targetEventId,
        googleEvent
      )

      await updateEventSyncState(uid, eventId, {
        syncState: 'synced',
        providerEtag: result.etag,
        providerUpdatedAtMs: new Date(result.updated).getTime(),
        lastWritebackAtMs: Date.now(),
        writebackError: null,
      })

      await markJobSucceeded(uid, job.jobId)
    } else if (op === 'delete') {
      if (!providerEventId) {
        throw new Error('Missing providerEventId for delete operation')
      }

      await deleteGoogleEvent(uid, accountId, providerCalendarId, providerEventId)

      await updateEventSyncState(uid, eventId, {
        syncState: 'synced',
        lastWritebackAtMs: Date.now(),
        writebackError: null,
      })

      await markJobSucceeded(uid, job.jobId)
    } else if (op === 'rsvp') {
      // RSVP: Update only the self attendee's response status
      if (!providerEventId) {
        throw new Error('Missing providerEventId for RSVP operation')
      }
      if (!payload.selfEmail || !payload.newStatus) {
        throw new Error('Missing selfEmail or newStatus for RSVP operation')
      }

      // Get current event to preserve other attendees
      // For RSVP, we only need to update the status of the self attendee
      const googleEventPatch = {
        attendees: [
          {
            email: payload.selfEmail,
            responseStatus: payload.newStatus,
            self: true,
          },
        ],
      }

      const result = await patchEvent(
        uid,
        accountId,
        providerCalendarId,
        providerEventId,
        googleEventPatch,
        'externalOnly' // RSVP responses typically don't need to notify others
      )

      await updateEventSyncState(uid, eventId, {
        syncState: 'synced',
        providerEtag: result.etag,
        providerUpdatedAtMs: new Date(result.updated).getTime(),
        lastWritebackAtMs: Date.now(),
        writebackError: null,
      })

      await markJobSucceeded(uid, job.jobId)
    } else if (op === 'update_attendees') {
      // Update attendees list (organizer operation)
      if (!providerEventId) {
        throw new Error('Missing providerEventId for update_attendees operation')
      }
      if (!payload.attendees) {
        throw new Error('Missing attendees for update_attendees operation')
      }

      const googleEventPatch = {
        attendees: payload.attendees.map((a) => ({
          email: a.email,
          displayName: a.displayName,
          responseStatus: a.responseStatus,
          optional: a.optional,
          resource: a.resource,
        })),
      }

      const result = await patchEvent(
        uid,
        accountId,
        providerCalendarId,
        providerEventId,
        googleEventPatch,
        payload.sendUpdates ?? 'all'
      )

      await updateEventSyncState(uid, eventId, {
        syncState: 'synced',
        providerEtag: result.etag,
        providerUpdatedAtMs: new Date(result.updated).getTime(),
        lastWritebackAtMs: Date.now(),
        writebackError: null,
      })

      await markJobSucceeded(uid, job.jobId)
    }
  } catch (error) {
    const err = error as Error & { statusCode?: number; code?: number }
    const statusCode = err.statusCode ?? err.code
    const errorCategory = categorizeError(statusCode, String(err.code))
    const errorInfo = { code: String(statusCode ?? 'unknown'), message: err.message }

    if (errorCategory === 'auth') {
      // Mark account as needs attention, fail job permanently
      await accountRef(uid, accountId).update({
        status: 'needs_attention',
        updatedAt: new Date().toISOString(),
      })
      await markJobFailed(uid, job.jobId, errorInfo)
      await updateEventSyncState(uid, eventId, {
        syncState: 'error',
        writebackError: { ...errorInfo, atMs: Date.now() },
      })
    } else if (errorCategory === 'validation') {
      // Fail permanently - likely bad data
      await markJobFailed(uid, job.jobId, errorInfo)
      await updateEventSyncState(uid, eventId, {
        syncState: 'error',
        writebackError: { ...errorInfo, atMs: Date.now() },
      })
    } else if (errorCategory === 'conflict') {
      // etag mismatch - mark as conflict
      await markJobFailed(uid, job.jobId, errorInfo)
      await updateEventSyncState(uid, eventId, {
        syncState: 'conflict',
        writebackError: { ...errorInfo, atMs: Date.now() },
      })
    } else {
      // Transient error - retry if under max attempts
      if (job.attempts < job.maxAttempts) {
        await markJobForRetry(uid, job.jobId, job.attempts, errorInfo)
        await updateEventSyncState(uid, eventId, {
          syncState: 'pending_writeback',
          writebackError: { ...errorInfo, atMs: Date.now() },
        })
      } else {
        await markJobFailed(uid, job.jobId, errorInfo)
        await updateEventSyncState(uid, eventId, {
          syncState: 'error',
          writebackError: { ...errorInfo, atMs: Date.now() },
        })
      }
    }
  }
}

/**
 * Find and process available writeback jobs for a user
 */
export async function processUserWritebackQueue(uid: string, limit = 10): Promise<number> {
  const now = Date.now()
  const queueRef = writebackQueueCollection(uid)

  const pendingJobs = await queueRef
    .where('status', '==', 'pending')
    .where('availableAtMs', '<=', now)
    .limit(limit)
    .get()

  let processedCount = 0

  for (const doc of pendingJobs.docs) {
    const job = await claimJob(uid, doc.id)
    if (job) {
      await processWritebackJob(job)
      processedCount++
    }
  }

  return processedCount
}

/**
 * Create a writeback job
 */
export async function createWritebackJob(params: {
  uid: string
  eventId: string
  op: 'create' | 'update' | 'delete' | 'rsvp' | 'update_attendees'
  provider: string
  accountId: string
  providerCalendarId: string
  providerEventId?: string
  payload: WritebackJob['payload']
  baseProviderEtag?: string
  isInstanceEdit?: boolean
  occurrenceStartMs?: number
  providerSeriesId?: string
  seriesId?: string
}): Promise<WritebackJob> {
  const { uid, ...jobData } = params
  const jobId = `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const now = Date.now()

  const job: WritebackJob = {
    jobId,
    uid,
    ...jobData,
    createdAtMs: now,
    availableAtMs: now,
    attempts: 0,
    maxAttempts: 10,
    status: 'pending',
  }

  await writebackQueueRef(uid, jobId).set(job)
  return job
}

/**
 * Check if there's already a pending job for an event
 */
export async function hasPendingJob(uid: string, eventId: string): Promise<boolean> {
  const queueRef = writebackQueueCollection(uid)
  const existing = await queueRef
    .where('eventId', '==', eventId)
    .where('status', 'in', ['pending', 'processing'])
    .limit(1)
    .get()

  return !existing.empty
}

// ==================== Instance ID Resolution ====================

/**
 * Cached instance mapping stored in Firestore
 */
interface InstanceMapping {
  seriesId: string
  providerSeriesId: string
  accountId: string
  calendarId: string
  occurrences: Record<
    string,
    {
      providerInstanceId: string
      providerEtag: string
      providerUpdatedAtMs: number
      originalStartMs: number
    }
  >
  fetchedAtMs: number
  rangeMinMs: number
  rangeMaxMs: number
}

/**
 * Resolve Google instance ID for a specific occurrence of a recurring series
 * Caches the mapping in Firestore to avoid repeated API calls
 */
export async function resolveInstanceId(
  uid: string,
  accountId: string,
  calendarId: string,
  providerSeriesId: string,
  occurrenceStartMs: number,
  seriesId: string
): Promise<{ instanceId: string; etag?: string } | null> {
  const occurrenceKey = `${occurrenceStartMs}`

  // Try to get from cache first
  const mapDoc = await instanceMapRef(uid, seriesId).get()
  if (mapDoc.exists) {
    const mapping = mapDoc.data() as InstanceMapping
    const cached = mapping.occurrences?.[occurrenceKey]

    // Check if cache covers this time range (with 24h buffer)
    const bufferMs = 24 * 60 * 60 * 1000
    const cacheValid =
      mapping.rangeMinMs <= occurrenceStartMs + bufferMs &&
      mapping.rangeMaxMs >= occurrenceStartMs - bufferMs

    if (cached && cacheValid) {
      return {
        instanceId: cached.providerInstanceId,
        etag: cached.providerEtag,
      }
    }
  }

  // Fetch from Google Calendar API
  // Query a 7-day window around the occurrence
  const windowMs = 7 * 24 * 60 * 60 * 1000
  const timeMin = new Date(occurrenceStartMs - windowMs).toISOString()
  const timeMax = new Date(occurrenceStartMs + windowMs).toISOString()

  try {
    const instances = await getRecurringInstances(
      uid,
      accountId,
      calendarId,
      providerSeriesId,
      timeMin,
      timeMax
    )

    // Build occurrence map
    const occurrences: InstanceMapping['occurrences'] = {}
    for (const instance of instances) {
      const originalStartTime = instance.originalStartTime
      const originalStartMs = originalStartTime?.dateTime
        ? new Date(originalStartTime.dateTime).getTime()
        : originalStartTime?.date
          ? new Date(originalStartTime.date).getTime()
          : null

      if (originalStartMs !== null) {
        const key = `${originalStartMs}`
        occurrences[key] = {
          providerInstanceId: instance.id,
          providerEtag: instance.etag,
          providerUpdatedAtMs: new Date(instance.updated).getTime(),
          originalStartMs,
        }
      }
    }

    // Cache the mapping
    const mapping: InstanceMapping = {
      seriesId,
      providerSeriesId,
      accountId,
      calendarId,
      occurrences,
      fetchedAtMs: Date.now(),
      rangeMinMs: occurrenceStartMs - windowMs,
      rangeMaxMs: occurrenceStartMs + windowMs,
    }

    await instanceMapRef(uid, seriesId).set(mapping, { merge: true })

    // Return the requested occurrence
    const result = occurrences[occurrenceKey]
    if (result) {
      return {
        instanceId: result.providerInstanceId,
        etag: result.providerEtag,
      }
    }

    return null
  } catch (error) {
    log.error('Failed to resolve instance ID', error)
    return null
  }
}

/**
 * Clear instance mapping cache for a series (after series is modified)
 */
export async function clearInstanceCache(uid: string, seriesId: string): Promise<void> {
  try {
    await instanceMapRef(uid, seriesId).delete()
  } catch {
    // Ignore errors - cache will be refreshed on next use
  }
}
