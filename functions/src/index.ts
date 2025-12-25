import { randomUUID } from 'node:crypto'
import type { CanonicalCalendarEvent } from '@lifeos/calendar'
import { Timestamp } from 'firebase-admin/firestore'
import { onDocumentCreated } from 'firebase-functions/v2/firestore'
import { onRequest } from 'firebase-functions/v2/https'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { OAuth2Client, type Credentials } from 'google-auth-library'
import { recomputeComposites } from './composite/pipeline.js'
import { getAttendeeFreeBusy } from './freeBusy/freeBusy.js'
import { tempStateRef, privateAccountRef, accountRef, canonicalEventRef, calendarRef } from './google/paths.js'
import { syncAllCalendarsIncremental } from './google/syncEvents.js'
import {
  createWritebackJob,
  processWritebackJob,
  processUserWritebackQueue,
  claimJob,
  hasPendingJob
} from './google/writeback.js'
import { buildWritebackPayload } from './google/writebackPayload.js'

/**
 * Convert canonical recurrence to Google RRULE format
 * (inline implementation to avoid importing from @lifeos/calendar)
 */
interface RecurrenceV2Rule {
  freq: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY'
  interval?: number
  byWeekday?: string[]
  byMonthDay?: number[]
  byMonth?: number[]
  bySetPos?: number[]
  count?: number
  untilMs?: number
  wkst?: string
}

interface RecurrenceV2 {
  tz?: string
  rule: RecurrenceV2Rule
  exdatesMs?: number[]
}

function canonicalToGoogleRRule(recurrence: RecurrenceV2): string {
  const { rule } = recurrence
  const parts: string[] = [`FREQ=${rule.freq}`]

  if (rule.interval && rule.interval > 1) {
    parts.push(`INTERVAL=${rule.interval}`)
  }
  if (rule.byWeekday?.length) {
    parts.push(`BYDAY=${rule.byWeekday.join(',')}`)
  }
  if (rule.byMonthDay?.length) {
    parts.push(`BYMONTHDAY=${rule.byMonthDay.join(',')}`)
  }
  if (rule.byMonth?.length) {
    parts.push(`BYMONTH=${rule.byMonth.join(',')}`)
  }
  if (rule.bySetPos?.length) {
    parts.push(`BYSETPOS=${rule.bySetPos.join(',')}`)
  }
  if (rule.count) {
    parts.push(`COUNT=${rule.count}`)
  }
  if (rule.untilMs) {
    const until = new Date(rule.untilMs)
    const year = until.getUTCFullYear()
    const month = String(until.getUTCMonth() + 1).padStart(2, '0')
    const day = String(until.getUTCDate()).padStart(2, '0')
    const hour = String(until.getUTCHours()).padStart(2, '0')
    const minute = String(until.getUTCMinutes()).padStart(2, '0')
    const second = String(until.getUTCSeconds()).padStart(2, '0')
    parts.push(`UNTIL=${year}${month}${day}T${hour}${minute}${second}Z`)
  }
  if (rule.wkst) {
    parts.push(`WKST=${rule.wkst}`)
  }

  return `RRULE:${parts.join(';')}`
}

function canonicalToGoogleRecurrence(recurrence: RecurrenceV2): string[] {
  const result: string[] = []
  result.push(canonicalToGoogleRRule(recurrence))
  
  if (recurrence.exdatesMs?.length) {
    for (const exdateMs of recurrence.exdatesMs) {
      const exdate = new Date(exdateMs)
      const year = exdate.getUTCFullYear()
      const month = String(exdate.getUTCMonth() + 1).padStart(2, '0')
      const day = String(exdate.getUTCDate()).padStart(2, '0')
      const hour = String(exdate.getUTCHours()).padStart(2, '0')
      const minute = String(exdate.getUTCMinutes()).padStart(2, '0')
      const second = String(exdate.getUTCSeconds()).padStart(2, '0')
      result.push(`EXDATE:${year}${month}${day}T${hour}${minute}${second}Z`)
    }
  }

  return result
}

interface AuthState {
  uid: string
  accountId: string
  createdAt: Timestamp
}

// Updated scopes to include write access for Phase 2.2
const SCOPES = [
  'https://www.googleapis.com/auth/calendar.events.readonly',
  'https://www.googleapis.com/auth/calendar.events'
]

let _oauthClient: OAuth2Client | null = null

function getOAuthClient(): OAuth2Client {
  if (_oauthClient) return _oauthClient
  
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('Missing Google OAuth configuration')
  }
  _oauthClient = new OAuth2Client(clientId, clientSecret, redirectUri)
  return _oauthClient
}

async function storeTokens(uid: string, accountId: string, tokens: Credentials) {
  const now = new Date()
  await privateAccountRef(uid, accountId).set(
    {
      refreshToken: tokens.refresh_token ?? null,
      accessToken: tokens.access_token ?? null,
      expiryDate: tokens.expiry_date
        ? new Date(tokens.expiry_date).toISOString()
        : null,
      scope: tokens.scope ?? null,
      tokenType: tokens.token_type ?? null,
      updatedAt: now.toISOString(),
      lastIssuedAt: now.toISOString(),
      status: 'connected'
    },
    { merge: true }
  )
  await accountRef(uid, accountId).set(
    {
      provider: 'google',
      status: 'connected',
      lastSuccessAt: now.toISOString(),
      updatedAt: now.toISOString()
    },
    { merge: true }
  )
}

export const googleAuthStart = onRequest(
  {
    secrets: ['GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_SECRET', 'GOOGLE_OAUTH_REDIRECT_URI'],
    cors: true
  },
  async (request, response) => {
  try {
    const uid = String(request.query.uid ?? request.body.uid ?? '')
    if (!uid) {
      response.status(400).json({ error: 'Missing uid' })
      return
    }
    const accountId = String(request.query.accountId ?? 'primary')
    const nonce = randomUUID()
    await tempStateRef(nonce).set({
      uid,
      accountId,
      createdAt: Timestamp.now()
    })
    const url = getOAuthClient().generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: SCOPES,
      state: nonce,
      include_granted_scopes: true
    })
    response.json({ url })
  } catch (error) {
    response.status(500).json({ error: (error as Error).message })
  }
})

export const googleAuthCallback = onRequest(
  {
    secrets: ['GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_SECRET', 'GOOGLE_OAUTH_REDIRECT_URI']
  },
  async (request, response) => {
  try {
    const code = String(request.query.code ?? '')
    const state = String(request.query.state ?? '')
    if (!code || !state) {
      response.status(400).json({ error: 'Missing code or state' })
      return
    }
    const stateDocRef = tempStateRef(state)
    const stateSnap = await stateDocRef.get()
    if (!stateSnap.exists) {
      response.status(400).json({ error: 'Invalid or expired state' })
      return
    }
    const stored = stateSnap.data() as AuthState
    const { uid, accountId } = stored
    const { tokens } = await getOAuthClient().getToken(code)
    await storeTokens(uid, accountId, tokens)
    await stateDocRef.delete()

    // Redirect back to the app calendar page
    response.redirect('https://lifeos-pi.web.app/calendar?success=true')
  } catch (error) {
    response.status(500).json({ error: (error as Error).message })
  }
})

export const googleDisconnect = onRequest({ cors: true }, async (request, response) => {
  try {
    const uid = String(request.query.uid ?? request.body.uid ?? '')
    const accountId = String(request.query.accountId ?? 'primary')
    if (!uid) {
      response.status(400).json({ error: 'Missing uid' })
      return
    }
    await privateAccountRef(uid, accountId).delete()
    await accountRef(uid, accountId).set(
      {
        status: 'disconnected',
        updatedAt: new Date().toISOString()
      },
      { merge: true }
    )
    response.json({ ok: true })
  } catch (error) {
    response.status(500).json({ error: (error as Error).message })
  }
})

export const syncNow = onRequest(
  {
    secrets: ['GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_SECRET', 'GOOGLE_OAUTH_REDIRECT_URI'],
    cors: true
  },
  async (request, response) => {
  try {
    const uid = String(request.query.uid ?? request.body.uid ?? '')
    const accountId = String(request.query.accountId ?? 'primary')
    if (!uid) {
      response.status(400).json({ error: 'Missing uid' })
      return
    }

    const calendars = await syncAllCalendarsIncremental(uid, accountId)
    response.json({ ok: true, calendars })
  } catch (error) {
    response.status(500).json({ error: (error as Error).message })
  }
})

export const scheduleSync = onSchedule(
  {
    schedule: 'every 24 hours',
    secrets: ['GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_SECRET', 'GOOGLE_OAUTH_REDIRECT_URI']
  },
  async () => {
  // TODO: query users with connected accounts and iterate
})

// ==================== Phase 2.2: Writeback Functions ====================

/**
 * Enqueue a writeback job for a canonical event
 * Called by the client after canonical write is committed
 */
export const enqueueWriteback = onRequest(
  {
    secrets: ['GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_SECRET', 'GOOGLE_OAUTH_REDIRECT_URI'],
    cors: true
  },
  async (request, response) => {
  try {
    const uid = String(request.query.uid ?? request.body.uid ?? '')
    const eventId = String(request.query.eventId ?? request.body.eventId ?? '')
    const op = String(request.query.op ?? request.body.op ?? '') as 'create' | 'update' | 'delete' | 'rsvp' | 'update_attendees'
    const isInstanceEdit = String(request.query.isInstanceEdit ?? request.body.isInstanceEdit ?? '') === 'true'
    const occurrenceStartMs = request.query.occurrenceStartMs ?? request.body.occurrenceStartMs
    let occurrenceStartMsNum = typeof occurrenceStartMs !== 'undefined' ? Number(occurrenceStartMs) : undefined
    if (typeof occurrenceStartMsNum === 'number' && Number.isNaN(occurrenceStartMsNum)) {
      occurrenceStartMsNum = undefined
    }

    if (!uid || !eventId || !op) {
      response.status(400).json({ error: 'Missing uid, eventId, or op' })
      return
    }

    if (!['create', 'update', 'delete', 'rsvp', 'update_attendees'].includes(op)) {
      response.status(400).json({ error: 'Invalid op' })
      return
    }

    // Check for existing pending job to prevent duplicates
    const pending = await hasPendingJob(uid, eventId)
    if (pending) {
      response.json({ ok: true, message: 'Writeback job already pending', skipped: true })
      return
    }

    // Load canonical event to get provider details
    const eventDoc = await canonicalEventRef(uid, eventId).get()
    if (!eventDoc.exists) {
      response.status(404).json({ error: 'Event not found' })
      return
    }

    const event = eventDoc.data() as CanonicalCalendarEvent
    if (!event) {
      response.status(404).json({ error: 'Event data is empty' })
      return
    }

    const calendarId = event.calendarId ?? event.providerRef?.providerCalendarId
    if (!calendarId) {
      response.status(400).json({ error: 'Missing calendarId on event' })
      return
    }

    const calendarSnap = await calendarRef(uid, calendarId).get()
    const calendar = calendarSnap.exists ? calendarSnap.data() : null

    const isLocalSource = event.source?.type !== 'provider'
    if (isLocalSource && calendar && calendar.writebackEnabled === false) {
      response.json({ ok: true, message: 'Writeback disabled for calendar', skipped: true })
      return
    }

    // Check if event is eligible for writeback
    const provider = event.primaryProvider ?? event.providerRef?.provider
    if (!provider || provider === 'local') {
      response.json({ ok: true, message: 'Event has no target provider', skipped: true })
      return
    }

    // Check if this is a provider instance (recurrence exception from provider)
    // These cannot be written back as they're managed by the provider
    if (event.providerRef?.recurringEventId) {
      response.json({ ok: true, message: 'Provider recurrence instance cannot be written back', skipped: true })
      return
    }

    // Avoid creating provider-origin events
    if (op === 'create' && event.source?.type === 'provider') {
      response.json({ ok: true, message: 'Event source is provider, skipping create writeback', skipped: true })
      return
    }

    // Build recurrence strings if this is a recurring series
    let recurrenceStrings: string[] | undefined
    if (event.recurrenceV2?.rule) {
      recurrenceStrings = canonicalToGoogleRecurrence(event.recurrenceV2 as RecurrenceV2)
    }

    if (op === 'update' && isInstanceEdit) {
      if (!event.providerRef?.providerEventId || typeof occurrenceStartMsNum !== 'number') {
        response.status(400).json({ error: 'Missing series or occurrence info for instance edit' })
        return
      }
    }

    const writebackVisibility = calendar?.writebackVisibility
    const payload = buildWritebackPayload({
      op,
      event,
      writebackVisibility,
      isInstanceEdit,
      occurrenceStartMs: occurrenceStartMsNum
    })
    if (recurrenceStrings) {
      payload.recurrence = recurrenceStrings
    }

    // Create the job
    const job = await createWritebackJob({
      uid,
      eventId,
      op,
      provider,
      accountId: event.providerRef?.accountId ?? 'primary',
      providerCalendarId: event.providerRef?.providerCalendarId ?? 'primary',
      providerEventId: op !== 'create' ? event.providerRef?.providerEventId : undefined,
      payload,
      baseProviderEtag: event.providerRef?.etag,
      ...(op === 'update' && isInstanceEdit && typeof occurrenceStartMsNum === 'number'
        ? {
            isInstanceEdit: true,
            occurrenceStartMs: occurrenceStartMsNum,
            providerSeriesId: event.providerRef?.providerEventId,
            seriesId: event.canonicalEventId
          }
        : {})
    })

    response.json({ ok: true, jobId: job.jobId })
  } catch (error) {
    response.status(500).json({ error: (error as Error).message })
  }
})

/**
 * Retry a failed writeback job
 */
export const retryWriteback = onRequest(
  {
    secrets: ['GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_SECRET', 'GOOGLE_OAUTH_REDIRECT_URI'],
    cors: true
  },
  async (request, response) => {
  try {
    const uid = String(request.query.uid ?? request.body.uid ?? '')
    const eventId = String(request.query.eventId ?? request.body.eventId ?? '')

    if (!uid || !eventId) {
      response.status(400).json({ error: 'Missing uid or eventId' })
      return
    }

    // Load canonical event
    const eventDoc = await canonicalEventRef(uid, eventId).get()
    if (!eventDoc.exists) {
      response.status(404).json({ error: 'Event not found' })
      return
    }

    const event = eventDoc.data() as CanonicalCalendarEvent
    if (!event) {
      response.status(404).json({ error: 'Event data is empty' })
      return
    }

    const calendarId = event.calendarId ?? event.providerRef?.providerCalendarId
    if (!calendarId) {
      response.status(400).json({ error: 'Missing calendarId on event' })
      return
    }

    const calendarSnap = await calendarRef(uid, calendarId).get()
    const calendar = calendarSnap.exists ? calendarSnap.data() : null

    if (calendar && calendar.writebackEnabled === false) {
      response.json({ ok: true, message: 'Writeback disabled for calendar', skipped: true })
      return
    }

    // Determine operation type
    let op: 'create' | 'update' | 'delete' = 'update'
    if (event.deletedAtMs) {
      op = 'delete'
    } else if (!event.providerRef?.providerEventId || event.providerRef.providerEventId.startsWith('local:')) {
      op = 'create'
    }

    // Clear previous error and reset sync state
    await canonicalEventRef(uid, eventId).update({
      syncState: 'pending_writeback',
      writebackError: null
    })

    // Check for existing pending job
    const pending = await hasPendingJob(uid, eventId)
    if (pending) {
      response.json({ ok: true, message: 'Writeback job already pending' })
      return
    }

    // Create new job
    const writebackVisibility = calendar?.writebackVisibility
    const payload = {
      title: event.title,
      description: event.description,
      location: event.location,
      startIso: event.startIso,
      endIso: event.endIso,
      allDay: event.allDay ?? false,
      timezone: event.timezone,
      transparency: event.transparency,
      visibility: op === 'create' && writebackVisibility === 'private'
        ? 'private'
        : event.visibility
    }

    const provider = event.primaryProvider ?? event.providerRef?.provider ?? 'google'

    const job = await createWritebackJob({
      uid,
      eventId,
      op,
      provider,
      accountId: event.providerRef?.accountId ?? 'primary',
      providerCalendarId: event.providerRef?.providerCalendarId ?? 'primary',
      providerEventId: op !== 'create' ? event.providerRef?.providerEventId : undefined,
      payload,
      baseProviderEtag: event.providerRef?.etag
    })

    response.json({ ok: true, jobId: job.jobId })
  } catch (error) {
    response.status(500).json({ error: (error as Error).message })
  }
})

/**
 * Process writeback queue for a user
 * Can be called manually or by scheduler
 */
export const processWritebackQueue = onRequest(
  {
    secrets: ['GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_SECRET', 'GOOGLE_OAUTH_REDIRECT_URI'],
    cors: true
  },
  async (request, response) => {
  try {
    const uid = String(request.query.uid ?? request.body.uid ?? '')

    if (!uid) {
      response.status(400).json({ error: 'Missing uid' })
      return
    }

    const processedCount = await processUserWritebackQueue(uid, 10)
    response.json({ ok: true, processed: processedCount })
  } catch (error) {
    response.status(500).json({ error: (error as Error).message })
  }
})

/**
 * Firestore trigger: Process writeback job when created
 */
export const onWritebackJobCreated = onDocumentCreated(
  {
    document: 'users/{uid}/calendarWritebackQueue/{jobId}',
    secrets: ['GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_SECRET', 'GOOGLE_OAUTH_REDIRECT_URI']
  },
  async (event) => {
    const snapshot = event.data
    if (!snapshot) return

    const job = snapshot.data()
    const uid = event.params.uid
    const jobId = event.params.jobId

    // Only process if pending and available
    if (job.status !== 'pending' || job.availableAtMs > Date.now()) {
      return
    }

    // Claim and process
    const claimed = await claimJob(uid, jobId)
    if (claimed) {
      await processWritebackJob(claimed)
    }
  }
)

/**
 * Scheduled: Process any pending writeback jobs
 * Runs every 5 minutes to catch any jobs that weren't processed by triggers
 */
export const scheduleWritebackProcessing = onSchedule(
  {
    schedule: 'every 5 minutes',
    secrets: ['GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_SECRET', 'GOOGLE_OAUTH_REDIRECT_URI']
  },
  async () => {
  // In production, you'd query for users with pending jobs
  // For now, process the demo user
  await processUserWritebackQueue('demo-user', 20)
})

// ==================== Phase 2.9: Composite Pipeline ====================

/**
 * Recompute composites for a user in a time range
 * Called after sync or manually triggered
 */
export const recomputeCompositesEndpoint = onRequest({ cors: true }, async (request, response) => {
  try {
    const uid = request.query.uid as string
    const startMs = Number(request.query.startMs) || Date.now() - 30 * 24 * 60 * 60 * 1000 // -30 days
    const endMs = Number(request.query.endMs) || Date.now() + 365 * 24 * 60 * 60 * 1000 // +365 days

    if (!uid) {
      response.status(400).json({ error: 'Missing uid' })
      return
    }

    const result = await recomputeComposites(uid, startMs, endMs)
    response.json({ ok: true, ...result })
  } catch (error) {
    console.error('Error recomputing composites:', error)
    response.status(500).json({ error: (error as Error).message })
  }
})

/**
 * Scheduled: Recompute composites for all users
 * Runs daily to catch any missed deduplication
 */
export const scheduleCompositeRecompute = onSchedule('every 24 hours', async () => {
  // In production, you'd query for users with connected accounts
  // For now, process the demo user
  const startMs = Date.now() - 30 * 24 * 60 * 60 * 1000 // -30 days
  const endMs = Date.now() + 365 * 24 * 60 * 60 * 1000 // +365 days
  await recomputeComposites('demo-user', startMs, endMs)
})

// ==================== Phase 2.10: Free/Busy API ====================

/**
 * Get free/busy information for attendees
 * Privacy-preserving: returns only busy blocks, no event details
 */
export const attendeeFreeBusy = onRequest({ cors: true }, async (request, response) => {
  try {
    const uid = request.query.uid as string
    const emails = (request.query.emails as string || '').split(',').filter(Boolean)
    const startMs = Number(request.query.startMs) || Date.now()
    const endMs = Number(request.query.endMs) || Date.now() + 14 * 24 * 60 * 60 * 1000 // +14 days
    const timeZone = request.query.timeZone as string || 'UTC'

    if (!uid) {
      response.status(400).json({ error: 'Missing uid' })
      return
    }

    // Validation limits
    if (emails.length === 0) {
      response.status(400).json({ error: 'No emails provided' })
      return
    }
    if (emails.length > 20) {
      response.status(400).json({ error: 'Maximum 20 emails allowed' })
      return
    }
    const maxRangeMs = 14 * 24 * 60 * 60 * 1000 // 14 days
    if (endMs - startMs > maxRangeMs) {
      response.status(400).json({ error: 'Maximum range is 14 days' })
      return
    }

    const result = await getAttendeeFreeBusy(uid, emails, startMs, endMs, timeZone)
    response.json(result)
  } catch (error) {
    console.error('Error fetching free/busy:', error)
    response.status(500).json({ error: (error as Error).message })
  }
})

// ==================== Firebase Config Provider ====================

/**
 * Provides Firebase client configuration to the frontend at runtime.
 *
 * This allows the frontend to fetch Firebase config dynamically instead of
 * embedding it at build time. This is essential for the hybrid architecture
 * where we use Firebase secrets for configuration.
 *
 * **Security Note:** These values are safe to expose publicly. They identify
 * the Firebase project but don't grant access. Authentication still requires
 * valid credentials.
 *
 * @returns {object} Firebase client configuration object
 */
export const getFirebaseConfig = onRequest(
  {
    cors: true,
    secrets: ['FB_API_KEY', 'FB_AUTH_DOMAIN', 'FB_PROJECT_ID', 'FB_STORAGE_BUCKET', 'FB_MESSAGING_SENDER_ID', 'FB_APP_ID', 'FB_MEASUREMENT_ID']
  },
  async (request, response) => {
  try {
    // Return public Firebase config from environment variables
    // These are stored as Firebase secrets and injected at runtime
    // Note: Using FB_ prefix instead of FIREBASE_ (which is reserved by Firebase)
    const config = {
      apiKey: process.env.FB_API_KEY || '',
      authDomain: process.env.FB_AUTH_DOMAIN || '',
      projectId: process.env.FB_PROJECT_ID || '',
      storageBucket: process.env.FB_STORAGE_BUCKET || '',
      messagingSenderId: process.env.FB_MESSAGING_SENDER_ID || '',
      appId: process.env.FB_APP_ID || '',
      measurementId: process.env.FB_MEASUREMENT_ID || ''
    }

    // Validate that required config values are present
    const requiredKeys = ['apiKey', 'authDomain', 'projectId'] as const
    const missingRequired = requiredKeys.filter((key) => !config[key])

    if (missingRequired.length > 0) {
      console.error('Missing required Firebase config:', missingRequired)
      response.status(500).json({
        error: `Missing required Firebase config: ${missingRequired.join(', ')}`
      })
      return
    }

    // Set cache headers (config rarely changes, cache for 1 hour)
    response.set('Cache-Control', 'public, max-age=3600')
    response.json(config)
  } catch (error) {
    console.error('Error providing Firebase config:', error)
    response.status(500).json({ error: (error as Error).message })
  }
})
