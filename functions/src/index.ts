import { randomUUID } from 'node:crypto'
import type { CanonicalCalendarEvent } from '@lifeos/calendar'
import type { Request, Response } from 'express'
import { getAuth } from 'firebase-admin/auth'
import { Timestamp } from 'firebase-admin/firestore'
import { onDocumentCreated } from 'firebase-functions/v2/firestore'
import { onRequest } from 'firebase-functions/v2/https'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { OAuth2Client, type Credentials } from 'google-auth-library'
import { recomputeComposites } from './composite/pipeline.js'
import { getAttendeeFreeBusy } from './freeBusy/freeBusy.js'
import {
  tempStateRef,
  privateAccountRef,
  accountRef,
  canonicalEventRef,
  calendarRef,
} from './google/paths.js'
import { syncAllCalendarsIncremental } from './google/syncEvents.js'
import {
  createWritebackJob,
  processWritebackJob,
  processUserWritebackQueue,
  claimJob,
  hasPendingJob,
} from './google/writeback.js'
import { buildWritebackPayload } from './google/writebackPayload.js'
import { firestore } from './lib/firebase.js'
import { createLogger } from './lib/logger.js'
export { synthesizeResearch } from './agents/researchSynthesis.js'
export {
  extractProjectManagerContext,
  summarizeProjectManagerContext,
  detectProjectManagerConflicts,
} from './agents/projectManagerFunctions.js'
export { testSearchToolKey, testAgentConfig } from './agents/testEndpoints.js'
export { analyzeNoteWithAI } from './agents/noteAnalysis.js'
export { analyzeWorkoutWithAI } from './agents/workoutAITools.js'
export { mailboxAITool } from './agents/mailboxAITools.js'
export { getMeetingBriefing, suggestCirclePlacement } from './contacts/contactAITools.js'
export { findDuplicateContacts } from './contacts/findDuplicates.js'
export { mergeContacts } from './contacts/mergeContacts.js'
export { discoverModels } from './agents/modelDiscovery.js'

const log = createLogger('Functions')

// ==================== Cloud Functions Configuration ====================

/**
 * Shared configuration for Cloud Functions (budget-friendly, small-scale).
 * Simple configuration with extended timeout - no fancy scaling or always-on instances.
 *
 * Key settings:
 * - timeoutSeconds: Extended to handle cold starts (300s for HTTP, 540s for scheduled)
 * - memory: 256MiB is sufficient and cost-effective for low traffic
 */
const FUNCTION_CONFIG = {
  http: {
    timeoutSeconds: 300, // 5 minutes for HTTP functions
    memory: '256MiB' as const, // Cost-effective for low traffic
  },
  scheduled: {
    timeoutSeconds: 540, // 9 minutes (max for scheduled functions)
    memory: '256MiB' as const,
  },
} as const

/**
 * Verify that the authenticated user matches the requested uid
 * Validates the Firebase ID token from the Authorization header
 * @param request - The HTTP request object
 * @param response - The HTTP response object
 * @param uid - The user ID from the request parameters
 * @returns true if authorized, false if unauthorized (response already sent)
 */
async function verifyAuth(request: Request, response: Response, uid: string): Promise<boolean> {
  try {
    // Extract token from Authorization header
    const authHeader = request.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      response.status(401).json({
        error: 'Unauthorized: Missing or invalid Authorization header. Expected "Bearer <token>"',
      })
      return false
    }

    const idToken = authHeader.split('Bearer ')[1]

    // Verify the Firebase ID token
    const decodedToken = await getAuth().verifyIdToken(idToken)

    // Check if the authenticated user matches the requested uid
    if (decodedToken.uid !== uid) {
      response.status(403).json({
        error: 'Forbidden: Authenticated user does not match requested user ID',
      })
      return false
    }

    return true
  } catch (error) {
    response.status(401).json({
      error: 'Unauthorized: Invalid or expired token',
      details: (error as Error).message,
    })
    return false
  }
}

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

const SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/contacts',
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  'openid',
]

let _oauthClient: OAuth2Client | null = null
let _oauthConfigLogged = false

function logOAuthConfigOnce() {
  if (_oauthConfigLogged) return
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim()
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI?.trim()
  log.info('OAuth config loaded', {
    clientIdTail: clientId ? clientId.slice(-6) : 'missing',
    clientIdLength: clientId ? clientId.length : 0,
    redirectUri: redirectUri ?? 'missing',
  })
  _oauthConfigLogged = true
}

function getOAuthClient(): OAuth2Client {
  if (_oauthClient) return _oauthClient

  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim()
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim()
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI?.trim()
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('Missing Google OAuth configuration')
  }
  logOAuthConfigOnce()
  _oauthClient = new OAuth2Client(clientId, clientSecret, redirectUri)
  return _oauthClient
}

async function storeTokens(uid: string, accountId: string, tokens: Credentials) {
  const now = new Date()
  await privateAccountRef(uid, accountId).set(
    {
      refreshToken: tokens.refresh_token ?? null,
      accessToken: tokens.access_token ?? null,
      expiryDate: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null,
      scope: tokens.scope ?? null,
      tokenType: tokens.token_type ?? null,
      updatedAt: now.toISOString(),
      lastIssuedAt: now.toISOString(),
      status: 'connected',
    },
    { merge: true }
  )
  await accountRef(uid, accountId).set(
    {
      provider: 'google',
      status: 'connected',
      grantedScopes: tokens.scope ?? null,
      lastSuccessAt: now.toISOString(),
      updatedAt: now.toISOString(),
    },
    { merge: true }
  )
}

export const googleAuthStart = onRequest(
  {
    ...FUNCTION_CONFIG.http,
    secrets: ['GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_SECRET', 'GOOGLE_OAUTH_REDIRECT_URI'],
    cors: true,
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
        createdAt: Timestamp.now(),
      })
      const url = getOAuthClient().generateAuthUrl({
        access_type: 'offline',
        prompt: 'consent',
        scope: SCOPES,
        state: nonce,
        include_granted_scopes: true,
      })
      response.json({ url })
    } catch (error) {
      log.error('googleAuthStart failed', error)
      response.status(500).json({ error: (error as Error).message })
    }
  }
)

export const googleAuthCallback = onRequest(
  {
    ...FUNCTION_CONFIG.http,
    secrets: ['GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_SECRET', 'GOOGLE_OAUTH_REDIRECT_URI'],
  },
  async (request, response) => {
    try {
      const code = String(request.query.code ?? '')
      const state = String(request.query.state ?? '')

      log.info('googleAuthCallback invoked', {
        hasCode: !!code,
        hasState: !!state,
        codeLength: code.length,
      })

      if (!code || !state) {
        log.error('Missing code or state parameter')
        response.status(400).json({ error: 'Missing code or state' })
        return
      }

      const stateDocRef = tempStateRef(state)
      const stateSnap = await stateDocRef.get()
      if (!stateSnap.exists) {
        log.error('Invalid or expired state', undefined, { state })
        response.status(400).json({ error: 'Invalid or expired state' })
        return
      }

      const stored = stateSnap.data() as AuthState
      const { uid, accountId } = stored

      log.info('Exchanging code for tokens', { uid, accountId })

      // This is where invalid_client error happens if OAuth client config is wrong
      const { tokens } = await getOAuthClient().getToken(code)

      log.info('Token exchange successful', {
        hasRefreshToken: !!tokens.refresh_token,
        hasAccessToken: !!tokens.access_token,
        scope: tokens.scope,
      })

      await storeTokens(uid, accountId, tokens)
      await stateDocRef.delete()

      log.info('Tokens stored successfully, redirecting to app')
      // Redirect back to the app calendar page
      response.redirect('https://lifeos-pi.web.app/calendar?success=true')
    } catch (error) {
      log.error('googleAuthCallback failed', error, {
        name: error instanceof Error ? error.name : undefined,
      })
      response.status(500).json({
        error: error instanceof Error ? error.message : 'OAuth callback failed',
      })
    }
  }
)

export const googleDisconnect = onRequest(
  {
    ...FUNCTION_CONFIG.http,
    cors: true,
  },
  async (request, response) => {
    try {
      const uid = String(request.query.uid ?? request.body.uid ?? '')
      const accountId = String(request.query.accountId ?? 'primary')
      const deleteEvents =
        request.query.deleteEvents === 'true' || request.body.deleteEvents === true

      if (!uid) {
        response.status(400).json({ error: 'Missing uid' })
        return
      }

      // Verify authentication
      if (!(await verifyAuth(request, response, uid))) {
        return
      }

      // Delete OAuth tokens
      await privateAccountRef(uid, accountId).delete()

      // Mark account as disconnected
      await accountRef(uid, accountId).set(
        {
          status: 'disconnected',
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      )

      // Delete all calendars from this account
      const calendarsSnapshot = await firestore
        .collection(`users/${uid}/calendars`)
        .where('providerMeta.accountId', '==', accountId)
        .get()

      const maxBatchOps = 100
      let batch = firestore.batch()
      let batchOps = 0

      for (const doc of calendarsSnapshot.docs) {
        batch.delete(doc.ref)
        batchOps += 1
        if (batchOps >= maxBatchOps) {
          await batch.commit()
          batch = firestore.batch()
          batchOps = 0
        }
      }

      if (batchOps > 0) {
        await batch.commit()
      }

      let eventsDeleted = 0

      // Optionally delete events from this account
      if (deleteEvents) {
        const eventsSnapshot = await firestore
          .collection(`users/${uid}/calendarEvents`)
          .where('providerMeta.accountId', '==', accountId)
          .get()

        let eventBatch = firestore.batch()
        let eventBatchOps = 0

        for (const doc of eventsSnapshot.docs) {
          eventBatch.delete(doc.ref)
          eventBatchOps += 1
          if (eventBatchOps >= maxBatchOps) {
            await eventBatch.commit()
            eventBatch = firestore.batch()
            eventBatchOps = 0
          }
        }

        if (eventBatchOps > 0) {
          await eventBatch.commit()
        }

        eventsDeleted = eventsSnapshot.size
      }

      response.json({
        ok: true,
        calendarsDeleted: calendarsSnapshot.size,
        eventsDeleted,
      })
    } catch (error) {
      response.status(500).json({ error: (error as Error).message })
    }
  }
)

export const syncNow = onRequest(
  {
    ...FUNCTION_CONFIG.http,
    secrets: ['GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_SECRET', 'GOOGLE_OAUTH_REDIRECT_URI'],
    cors: true,
  },
  async (request, response) => {
    try {
      const uid = String(request.query.uid ?? request.body.uid ?? '')
      const accountId = String(request.query.accountId ?? 'primary')

      log.info('syncNow invoked', { uid, accountId })

      if (!uid) {
        log.error('Missing uid parameter')
        response.status(400).json({ error: 'Missing uid' })
        return
      }

      // Verify authentication
      if (!(await verifyAuth(request, response, uid))) {
        log.error('Authentication verification failed', undefined, { uid })
        return
      }

      const accountSnap = await accountRef(uid, accountId).get()
      log.info('Checking account status', {
        uid,
        accountId,
        exists: accountSnap.exists,
        status: accountSnap.exists ? accountSnap.data()?.status : 'no_document',
        data: accountSnap.exists ? accountSnap.data() : null,
      })
      if (!accountSnap.exists || accountSnap.data()?.status !== 'connected') {
        log.error('Google account not connected', undefined, {
          uid,
          accountId,
          exists: accountSnap.exists,
        })
        response.status(400).json({ error: 'not_connected' })
        return
      }

      const privateAccountSnap = await privateAccountRef(uid, accountId).get()
      const refreshToken = privateAccountSnap.exists
        ? (privateAccountSnap.data()?.refreshToken as string | null | undefined)
        : null
      if (!refreshToken) {
        log.error('Missing refresh token', undefined, { uid, accountId })
        response.status(400).json({ error: 'missing_refresh_token' })
        return
      }

      log.info('Starting calendar sync', { uid, accountId })
      const calendars = await syncAllCalendarsIncremental(uid, accountId)
      log.info('Sync completed successfully', {
        uid,
        accountId,
        calendarCount: calendars.length,
      })

      // Write account-level sync state for the frontend status display
      const now = new Date().toISOString()
      await firestore.doc(`users/${uid}/calendarSyncState/${accountId}:primary`).set(
        {
          accountId,
          calendarId: 'primary',
          lastSyncAt: now,
          lastSuccessAt: now,
          updatedAt: now,
        },
        { merge: true }
      )

      response.json({ ok: true, calendars })
    } catch (error) {
      log.error('syncNow failed', error)
      response.status(500).json({ error: (error as Error).message })
    }
  }
)

export const scheduleSync = onSchedule(
  {
    ...FUNCTION_CONFIG.scheduled,
    schedule: 'every 24 hours',
    secrets: ['GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_SECRET', 'GOOGLE_OAUTH_REDIRECT_URI'],
  },
  async () => {
    log.info('Starting scheduled Google Calendar sync')

    try {
      // Query all users with connected Google Calendar accounts
      const usersSnapshot = await firestore.collectionGroup('calendarAccounts').get()

      if (usersSnapshot.empty) {
        log.info('No connected Google Calendar accounts found')
        return
      }

      log.info('Found connected accounts', { count: usersSnapshot.size })

      // Group accounts by user ID
      const accountsByUser = new Map<string, string[]>()
      for (const doc of usersSnapshot.docs) {
        const data = doc.data()
        const status = data.status as string | undefined

        // Only process connected accounts
        if (status === 'connected') {
          const pathParts = doc.ref.path.split('/')
          const uid = pathParts[1] // users/{uid}/calendarAccounts/{accountId}
          const accountId = pathParts[3]

          if (!accountsByUser.has(uid)) {
            accountsByUser.set(uid, [])
          }
          accountsByUser.get(uid)!.push(accountId)
        }
      }

      log.info('Processing users with connected accounts', { userCount: accountsByUser.size })

      // Process each user's accounts with rate limiting
      const MAX_CONCURRENT = 5 // Process 5 users at a time
      const DELAY_BETWEEN_USERS = 2000 // 2 seconds between users
      const DELAY_BETWEEN_ACCOUNTS = 1000 // 1 second between accounts for same user
      const ACCOUNT_TIMEOUT_MS = 2 * 60 * 1000 // 2 minutes per account

      const userIds = Array.from(accountsByUser.keys())
      let processed = 0
      let succeeded = 0
      let failed = 0

      for (let i = 0; i < userIds.length; i += MAX_CONCURRENT) {
        const batch = userIds.slice(i, i + MAX_CONCURRENT)

        await Promise.all(
          batch.map(async (uid) => {
            const accountIds = accountsByUser.get(uid) || []

            for (const accountId of accountIds) {
              try {
                // Add delay between accounts for same user
                if (accountIds.indexOf(accountId) > 0) {
                  await new Promise((resolve) => setTimeout(resolve, DELAY_BETWEEN_ACCOUNTS))
                }

                log.info('Syncing account', { uid, accountId })

                // Use existing incremental sync function with timeout protection
                const { syncAllCalendarsIncremental } = await import('./google/syncEvents.js')

                // Wrap sync in timeout
                const syncWithTimeout = Promise.race([
                  syncAllCalendarsIncremental(uid, accountId),
                  new Promise<never>((_, reject) =>
                    setTimeout(() => reject(new Error('Sync timeout')), ACCOUNT_TIMEOUT_MS)
                  ),
                ])

                const results = await syncWithTimeout

                const totalEvents = results.reduce((sum, r) => sum + r.eventsUpserted, 0)
                log.info('Successfully synced account', { uid, accountId, totalEvents })

                succeeded++
              } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error)
                log.error('Failed to sync account', error, { uid, accountId })

                // Handle timeout specifically
                if (errorMessage === 'Sync timeout') {
                  log.warn('Sync timeout, marking for retry', { uid, accountId })
                  try {
                    await accountRef(uid, accountId).set(
                      {
                        lastSyncAttempt: new Date().toISOString(),
                        syncStatus: 'timeout',
                        lastError: 'Sync timeout - will retry in next run',
                        updatedAt: new Date().toISOString(),
                      },
                      { merge: true }
                    )
                  } catch (updateError) {
                    log.error('Failed to update account status after timeout', updateError)
                  }
                } else if (
                  // Mark account as needs_attention if it's a token/auth error
                  errorMessage.includes('token') ||
                  errorMessage.includes('auth') ||
                  errorMessage.includes('refresh')
                ) {
                  try {
                    await accountRef(uid, accountId).set(
                      {
                        status: 'needs_attention',
                        lastError: errorMessage,
                        updatedAt: new Date().toISOString(),
                      },
                      { merge: true }
                    )
                  } catch (updateError) {
                    log.error('Failed to update account status', updateError)
                  }
                }

                failed++
              } finally {
                processed++
              }
            }
          })
        )

        // Add delay between user batches
        if (i + MAX_CONCURRENT < userIds.length) {
          await new Promise((resolve) => setTimeout(resolve, DELAY_BETWEEN_USERS))
        }
      }

      log.info('Completed scheduled sync', { processed, succeeded, failed })
    } catch (error) {
      log.error('Fatal error in scheduled sync', error)
      // Don't throw - scheduled functions should not throw to avoid retries
    }
  }
)

// ==================== Phase 2.2: Writeback Functions ====================

/**
 * Enqueue a writeback job for a canonical event
 * Called by the client after canonical write is committed
 */
export const enqueueWriteback = onRequest(
  {
    ...FUNCTION_CONFIG.http,
    secrets: ['GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_SECRET', 'GOOGLE_OAUTH_REDIRECT_URI'],
    cors: true,
  },
  async (request, response) => {
    try {
      const uid = String(request.query.uid ?? request.body.uid ?? '')
      const eventId = String(request.query.eventId ?? request.body.eventId ?? '')
      const op = String(request.query.op ?? request.body.op ?? '') as
        | 'create'
        | 'update'
        | 'delete'
        | 'rsvp'
        | 'update_attendees'
      const isInstanceEdit =
        String(request.query.isInstanceEdit ?? request.body.isInstanceEdit ?? '') === 'true'
      const occurrenceStartMs = request.query.occurrenceStartMs ?? request.body.occurrenceStartMs
      let occurrenceStartMsNum =
        typeof occurrenceStartMs !== 'undefined' ? Number(occurrenceStartMs) : undefined
      if (typeof occurrenceStartMsNum === 'number' && Number.isNaN(occurrenceStartMsNum)) {
        occurrenceStartMsNum = undefined
      }

      if (!uid || !eventId || !op) {
        response.status(400).json({ error: 'Missing uid, eventId, or op' })
        return
      }

      // Verify authentication
      if (!(await verifyAuth(request, response, uid))) {
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
        response.json({
          ok: true,
          message: 'Provider recurrence instance cannot be written back',
          skipped: true,
        })
        return
      }

      // Avoid creating provider-origin events
      if (op === 'create' && event.source?.type === 'provider') {
        response.json({
          ok: true,
          message: 'Event source is provider, skipping create writeback',
          skipped: true,
        })
        return
      }

      // Build recurrence strings if this is a recurring series
      let recurrenceStrings: string[] | undefined
      if (event.recurrenceV2?.rule) {
        recurrenceStrings = canonicalToGoogleRecurrence(event.recurrenceV2 as RecurrenceV2)
      }

      if (op === 'update' && isInstanceEdit) {
        if (!event.providerRef?.providerEventId || typeof occurrenceStartMsNum !== 'number') {
          response
            .status(400)
            .json({ error: 'Missing series or occurrence info for instance edit' })
          return
        }
      }

      const writebackVisibility = calendar?.writebackVisibility
      const payload = buildWritebackPayload({
        op,
        event,
        writebackVisibility,
        isInstanceEdit,
        occurrenceStartMs: occurrenceStartMsNum,
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
              seriesId: event.canonicalEventId,
            }
          : {}),
      })

      response.json({ ok: true, jobId: job.jobId })
    } catch (error) {
      response.status(500).json({ error: (error as Error).message })
    }
  }
)

/**
 * Retry a failed writeback job
 */
export const retryWriteback = onRequest(
  {
    ...FUNCTION_CONFIG.http,
    secrets: ['GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_SECRET', 'GOOGLE_OAUTH_REDIRECT_URI'],
    cors: true,
  },
  async (request, response) => {
    try {
      const uid = String(request.query.uid ?? request.body.uid ?? '')
      const eventId = String(request.query.eventId ?? request.body.eventId ?? '')

      if (!uid || !eventId) {
        response.status(400).json({ error: 'Missing uid or eventId' })
        return
      }

      // Verify authentication
      if (!(await verifyAuth(request, response, uid))) {
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
      } else if (
        !event.providerRef?.providerEventId ||
        event.providerRef.providerEventId.startsWith('local:')
      ) {
        op = 'create'
      }

      // Clear previous error and reset sync state
      await canonicalEventRef(uid, eventId).update({
        syncState: 'pending_writeback',
        writebackError: null,
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
        visibility:
          op === 'create' && writebackVisibility === 'private' ? 'private' : event.visibility,
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
        baseProviderEtag: event.providerRef?.etag,
      })

      response.json({ ok: true, jobId: job.jobId })
    } catch (error) {
      response.status(500).json({ error: (error as Error).message })
    }
  }
)

/**
 * Process writeback queue for a user
 * Can be called manually or by scheduler
 */
export const processWritebackQueue = onRequest(
  {
    ...FUNCTION_CONFIG.http,
    secrets: ['GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_SECRET', 'GOOGLE_OAUTH_REDIRECT_URI'],
    cors: true,
  },
  async (request, response) => {
    try {
      const uid = String(request.query.uid ?? request.body.uid ?? '')

      if (!uid) {
        response.status(400).json({ error: 'Missing uid' })
        return
      }

      // Verify authentication
      if (!(await verifyAuth(request, response, uid))) {
        return
      }

      const processedCount = await processUserWritebackQueue(uid, 10)
      response.json({ ok: true, processed: processedCount })
    } catch (error) {
      response.status(500).json({ error: (error as Error).message })
    }
  }
)

/**
 * Firestore trigger: Process writeback job when created
 */
export const onWritebackJobCreated = onDocumentCreated(
  {
    ...FUNCTION_CONFIG.http,
    document: 'users/{uid}/calendarWritebackQueue/{jobId}',
    secrets: ['GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_SECRET', 'GOOGLE_OAUTH_REDIRECT_URI'],
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
    ...FUNCTION_CONFIG.scheduled,
    schedule: 'every 5 minutes',
    secrets: ['GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_SECRET', 'GOOGLE_OAUTH_REDIRECT_URI'],
  },
  async () => {
    // In production, you'd query for users with pending jobs
    // For now, process the demo user
    await processUserWritebackQueue('demo-user', 20)
  }
)

// ==================== Phase 2.9: Composite Pipeline ====================

/**
 * Recompute composites for a user in a time range
 * Called after sync or manually triggered
 */
export const recomputeCompositesEndpoint = onRequest(
  {
    ...FUNCTION_CONFIG.http,
    cors: true,
  },
  async (request, response) => {
    try {
      const uid = request.query.uid as string
      const startMs = Number(request.query.startMs) || Date.now() - 30 * 24 * 60 * 60 * 1000 // -30 days
      const endMs = Number(request.query.endMs) || Date.now() + 365 * 24 * 60 * 60 * 1000 // +365 days

      if (!uid) {
        response.status(400).json({ error: 'Missing uid' })
        return
      }

      // Verify authentication
      if (!(await verifyAuth(request, response, uid))) {
        return
      }

      const result = await recomputeComposites(uid, startMs, endMs)
      response.json({ ok: true, ...result })
    } catch (error) {
      log.error('Error recomputing composites', error)
      response.status(500).json({ error: (error as Error).message })
    }
  }
)

/**
 * Scheduled: Recompute composites for all users
 * Runs daily to catch any missed deduplication
 */
export const scheduleCompositeRecompute = onSchedule(
  {
    ...FUNCTION_CONFIG.scheduled,
    schedule: 'every 24 hours',
  },
  async () => {
    // In production, you'd query for users with connected accounts
    // For now, process the demo user
    const startMs = Date.now() - 30 * 24 * 60 * 60 * 1000 // -30 days
    const endMs = Date.now() + 365 * 24 * 60 * 60 * 1000 // +365 days
    await recomputeComposites('demo-user', startMs, endMs)
  }
)

// ==================== Phase 2.10: Free/Busy API ====================

/**
 * Get free/busy information for attendees
 * Privacy-preserving: returns only busy blocks, no event details
 */
export const attendeeFreeBusy = onRequest(
  {
    ...FUNCTION_CONFIG.http,
    cors: true,
  },
  async (request, response) => {
    try {
      const uid = request.query.uid as string
      const emails = ((request.query.emails as string) || '').split(',').filter(Boolean)
      const startMs = Number(request.query.startMs) || Date.now()
      const endMs = Number(request.query.endMs) || Date.now() + 14 * 24 * 60 * 60 * 1000 // +14 days
      const timeZone = (request.query.timeZone as string) || 'UTC'

      if (!uid) {
        response.status(400).json({ error: 'Missing uid' })
        return
      }

      // Verify authentication
      if (!(await verifyAuth(request, response, uid))) {
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
      log.error('Error fetching free/busy', error)
      response.status(500).json({ error: (error as Error).message })
    }
  }
)

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
    ...FUNCTION_CONFIG.http,
    cors: true,
    secrets: [
      'FB_API_KEY',
      'FB_AUTH_DOMAIN',
      'FB_PROJECT_ID',
      'FB_STORAGE_BUCKET',
      'FB_MESSAGING_SENDER_ID',
      'FB_APP_ID',
      'FB_MEASUREMENT_ID',
    ],
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
        measurementId: process.env.FB_MEASUREMENT_ID || '',
      }

      // Validate that required config values are present
      const requiredKeys = ['apiKey', 'authDomain', 'projectId'] as const
      const missingRequired = requiredKeys.filter((key) => !config[key])

      if (missingRequired.length > 0) {
        log.error('Missing required Firebase config', undefined, { missingRequired })
        response.status(500).json({
          error: `Missing required Firebase config: ${missingRequired.join(', ')}`,
        })
        return
      }

      // Set cache headers (config rarely changes, cache for 1 hour)
      response.set('Cache-Control', 'public, max-age=3600')
      response.json(config)
    } catch (error) {
      log.error('Error providing Firebase config', error)
      response.status(500).json({ error: (error as Error).message })
    }
  }
)

// ==================== Delete All Calendar Data ====================

/**
 * Delete all calendar data for a user with granular control over linked data
 * Provides options for handling tasks, composites, habit check-ins, and sync data
 */
export const deleteAllCalendarData = onRequest(
  {
    ...FUNCTION_CONFIG.http,
    cors: true,
  },
  async (request, response) => {
    try {
      const uid = String(request.body.uid ?? '')
      const options = request.body.options ?? {}

      if (!uid) {
        response.status(400).json({ error: 'Missing uid' })
        return
      }

      // Verify authentication
      if (!(await verifyAuth(request, response, uid))) {
        return
      }

      // Parse options with defaults
      const taskHandling: 'unlink' | 'delete-linked' | 'keep-orphaned' =
        options.taskHandling ?? 'unlink'
      const compositeHandling: 'delete' | 'keep-orphaned' = options.compositeHandling ?? 'delete'
      const deleteHabitCheckins = options.deleteHabitCheckins === true
      const clearSyncData = options.clearSyncData !== false // Default true

      const counts = {
        calendarsDeleted: 0,
        eventsDeleted: 0,
        compositesDeleted: 0,
        tasksUpdated: 0,
        tasksDeleted: 0,
        habitCheckinsDeleted: 0,
        syncDataDeleted: 0,
      }

      const maxBatchOps = 400 // Conservative limit to avoid "Transaction too big" errors

      // 1. Handle Tasks
      if (taskHandling !== 'keep-orphaned') {
        const tasksSnapshot = await firestore
          .collection(`users/${uid}/tasks`)
          .where('calendarEventIds', '!=', null)
          .get()

        let taskBatch = firestore.batch()
        let taskBatchOps = 0

        for (const taskDoc of tasksSnapshot.docs) {
          const task = taskDoc.data()
          const calendarEventIds = task.calendarEventIds ?? []

          if (calendarEventIds.length > 0) {
            if (taskHandling === 'delete-linked') {
              // Delete tasks that have calendar links
              taskBatch.delete(taskDoc.ref)
              counts.tasksDeleted += 1
            } else if (taskHandling === 'unlink') {
              // Remove calendar links but keep the task
              taskBatch.update(taskDoc.ref, { calendarEventIds: [] })
              counts.tasksUpdated += 1
            }

            taskBatchOps += 1
            if (taskBatchOps >= maxBatchOps) {
              await taskBatch.commit()
              taskBatch = firestore.batch()
              taskBatchOps = 0
            }
          }
        }

        if (taskBatchOps > 0) {
          await taskBatch.commit()
        }
      }

      // 2. Handle Habit Check-ins
      if (deleteHabitCheckins) {
        const checkinsSnapshot = await firestore
          .collection(`users/${uid}/habitCheckins`)
          .where('sourceType', '==', 'calendar')
          .get()

        let checkinBatch = firestore.batch()
        let checkinBatchOps = 0

        for (const checkinDoc of checkinsSnapshot.docs) {
          checkinBatch.delete(checkinDoc.ref)
          counts.habitCheckinsDeleted += 1
          checkinBatchOps += 1

          if (checkinBatchOps >= maxBatchOps) {
            await checkinBatch.commit()
            checkinBatch = firestore.batch()
            checkinBatchOps = 0
          }
        }

        if (checkinBatchOps > 0) {
          await checkinBatch.commit()
        }
      }

      // 3. Handle Composite Events
      if (compositeHandling === 'delete') {
        const compositesSnapshot = await firestore.collection(`users/${uid}/compositeEvents`).get()

        let compositeBatch = firestore.batch()
        let compositeBatchOps = 0

        for (const compositeDoc of compositesSnapshot.docs) {
          compositeBatch.delete(compositeDoc.ref)
          counts.compositesDeleted += 1
          compositeBatchOps += 1

          if (compositeBatchOps >= maxBatchOps) {
            await compositeBatch.commit()
            compositeBatch = firestore.batch()
            compositeBatchOps = 0
          }
        }

        if (compositeBatchOps > 0) {
          await compositeBatch.commit()
        }
      }

      // 4. Delete Calendar Events
      const eventsSnapshot = await firestore.collection(`users/${uid}/calendarEvents`).get()

      let eventBatch = firestore.batch()
      let eventBatchOps = 0

      for (const eventDoc of eventsSnapshot.docs) {
        eventBatch.delete(eventDoc.ref)
        counts.eventsDeleted += 1
        eventBatchOps += 1

        if (eventBatchOps >= maxBatchOps) {
          await eventBatch.commit()
          eventBatch = firestore.batch()
          eventBatchOps = 0
        }
      }

      if (eventBatchOps > 0) {
        await eventBatch.commit()
      }

      // 5. Delete Calendars
      const calendarsSnapshot = await firestore.collection(`users/${uid}/calendars`).get()

      let calendarBatch = firestore.batch()
      let calendarBatchOps = 0

      for (const calendarDoc of calendarsSnapshot.docs) {
        calendarBatch.delete(calendarDoc.ref)
        counts.calendarsDeleted += 1
        calendarBatchOps += 1

        if (calendarBatchOps >= maxBatchOps) {
          await calendarBatch.commit()
          calendarBatch = firestore.batch()
          calendarBatchOps = 0
        }
      }

      if (calendarBatchOps > 0) {
        await calendarBatch.commit()
      }

      // 6. Delete Sync Data and Supporting Collections
      if (clearSyncData) {
        const collections = [
          'calendarAccounts',
          'calendarSyncState',
          'calendarSyncRuns',
          'calendarWritebackQueue',
          'recurrenceInstanceMap',
          'compositeRuns',
          'freeBusyCache',
        ]

        for (const collectionName of collections) {
          const snapshot = await firestore.collection(`users/${uid}/${collectionName}`).get()

          let batch = firestore.batch()
          let batchOps = 0

          for (const doc of snapshot.docs) {
            batch.delete(doc.ref)
            counts.syncDataDeleted += 1
            batchOps += 1

            if (batchOps >= maxBatchOps) {
              await batch.commit()
              batch = firestore.batch()
              batchOps = 0
            }
          }

          if (batchOps > 0) {
            await batch.commit()
          }
        }

        // 7. Delete OAuth tokens to prevent re-syncing after deletion
        // This is critical: without deleting tokens, auto-sync will re-import events from Google Calendar
        const oauthTokensSnapshot = await firestore
          .collection(`users/${uid}/privateIntegrations/google/googleAccounts`)
          .get()

        let oauthBatch = firestore.batch()
        let oauthBatchOps = 0

        for (const doc of oauthTokensSnapshot.docs) {
          oauthBatch.delete(doc.ref)
          counts.syncDataDeleted += 1
          oauthBatchOps += 1

          if (oauthBatchOps >= maxBatchOps) {
            await oauthBatch.commit()
            oauthBatch = firestore.batch()
            oauthBatchOps = 0
          }
        }

        if (oauthBatchOps > 0) {
          await oauthBatch.commit()
        }
      }

      response.json({
        success: true,
        counts,
      })
    } catch (error) {
      log.error('Error deleting calendar data', error)
      response.status(500).json({ error: (error as Error).message })
    }
  }
)

/**
 * Preview what would be deleted before actually deleting
 * Returns counts of items that would be affected
 */
export const previewDeleteCalendarData = onRequest(
  {
    ...FUNCTION_CONFIG.http,
    cors: true,
  },
  async (request, response) => {
    try {
      const uid = String(request.query.uid ?? request.body.uid ?? '')

      if (!uid) {
        response.status(400).json({ error: 'Missing uid' })
        return
      }

      // Verify authentication
      if (!(await verifyAuth(request, response, uid))) {
        return
      }

      // Count items in parallel
      const [
        calendarsSnapshot,
        eventsSnapshot,
        compositesSnapshot,
        tasksWithCalendarLinksSnapshot,
        habitCheckinsSnapshot,
      ] = await Promise.all([
        firestore.collection(`users/${uid}/calendars`).count().get(),
        firestore.collection(`users/${uid}/calendarEvents`).count().get(),
        firestore.collection(`users/${uid}/compositeEvents`).count().get(),
        firestore
          .collection(`users/${uid}/tasks`)
          .where('calendarEventIds', '!=', null)
          .count()
          .get(),
        firestore
          .collection(`users/${uid}/habitCheckins`)
          .where('sourceType', '==', 'calendar')
          .count()
          .get(),
      ])

      response.json({
        calendars: calendarsSnapshot.data().count,
        events: eventsSnapshot.data().count,
        composites: compositesSnapshot.data().count,
        tasksWithCalendarLinks: tasksWithCalendarLinksSnapshot.data().count,
        habitCheckinsFromCalendar: habitCheckinsSnapshot.data().count,
      })
    } catch (error) {
      log.error('Error previewing calendar data deletion', error)
      response.status(500).json({ error: (error as Error).message })
    }
  }
)

// ==================== Inner Circle CRM: Contacts Sync ====================

/**
 * On-demand Google Contacts sync trigger.
 * POST /syncContactsNow?uid=xxx&accountId=primary
 */
export const syncContactsNow = onRequest(
  {
    ...FUNCTION_CONFIG.http,
    secrets: ['GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_SECRET', 'GOOGLE_OAUTH_REDIRECT_URI'],
    cors: true,
  },
  async (request, response) => {
    try {
      const uid = String(request.query.uid ?? request.body.uid ?? '')
      const accountIdParam = String(request.query.accountId ?? request.body.accountId ?? 'primary')

      if (!uid) {
        response.status(400).json({ error: 'Missing uid' })
        return
      }

      if (!(await verifyAuth(request, response, uid))) return

      // Verify Google account is connected
      const accountSnap = await accountRef(uid, accountIdParam).get()
      if (!accountSnap.exists || accountSnap.data()?.status !== 'connected') {
        response.status(400).json({ error: 'Google account not connected' })
        return
      }

      const { syncGoogleContacts } = await import('./contacts/syncContacts.js')
      const result = await syncGoogleContacts(uid, accountIdParam)

      response.json({ ok: true, ...result })
    } catch (error) {
      log.error('syncContactsNow failed', error)
      response.status(500).json({ error: (error as Error).message })
    }
  }
)

/**
 * Scheduled Google Contacts sync — runs every 24 hours.
 * Discovers users with connected Google accounts via the calendarAccounts collectionGroup.
 */
export const scheduleContactsSync = onSchedule(
  {
    ...FUNCTION_CONFIG.scheduled,
    schedule: 'every 24 hours',
    secrets: ['GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_SECRET', 'GOOGLE_OAUTH_REDIRECT_URI'],
  },
  async () => {
    log.info('Starting scheduled Google Contacts sync')

    try {
      const usersSnapshot = await firestore.collectionGroup('calendarAccounts').get()

      if (usersSnapshot.empty) {
        log.info('No connected Google accounts found for contacts sync')
        return
      }

      const accountsByUser = new Map<string, string[]>()
      for (const doc of usersSnapshot.docs) {
        const data = doc.data()
        if (data.status === 'connected') {
          const pathParts = doc.ref.path.split('/')
          const uid = pathParts[1]
          const aid = pathParts[3]
          if (!accountsByUser.has(uid)) accountsByUser.set(uid, [])
          accountsByUser.get(uid)!.push(aid)
        }
      }

      log.info('Processing contacts sync', { userCount: accountsByUser.size })

      const MAX_CONCURRENT = 5
      const DELAY_BETWEEN_BATCHES = 2000
      const ACCOUNT_TIMEOUT_MS = 3 * 60 * 1000

      const userIds = Array.from(accountsByUser.keys())
      let succeeded = 0
      let failed = 0

      for (let i = 0; i < userIds.length; i += MAX_CONCURRENT) {
        const userBatch = userIds.slice(i, i + MAX_CONCURRENT)

        await Promise.all(
          userBatch.map(async (uid) => {
            const accountIds = accountsByUser.get(uid) ?? []
            const aid = accountIds[0]
            if (!aid) return

            try {
              const { syncGoogleContacts } = await import('./contacts/syncContacts.js')
              const syncPromise = syncGoogleContacts(uid, aid)
              const timeoutPromise = new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error('Contacts sync timeout')), ACCOUNT_TIMEOUT_MS)
              )

              const result = await Promise.race([syncPromise, timeoutPromise])
              log.info('Contact sync succeeded', {
                uid,
                created: result.contactsCreated,
                merged: result.contactsMerged,
              })
              succeeded++
            } catch (error) {
              log.error('Contact sync failed for user', error, { uid })
              failed++
            }
          })
        )

        if (i + MAX_CONCURRENT < userIds.length) {
          await new Promise((resolve) => setTimeout(resolve, DELAY_BETWEEN_BATCHES))
        }
      }

      log.info('Scheduled contacts sync completed', { succeeded, failed })
    } catch (error) {
      log.error('Fatal error in scheduled contacts sync', error)
    }
  }
)

/**
 * Batch email-to-contact lookup.
 * POST /batchLookupContactEmailsCallable
 * Body: { uid, emails: string[] }
 */
export const batchLookupContactEmailsCallable = onRequest(
  {
    ...FUNCTION_CONFIG.http,
    cors: true,
  },
  async (request, response) => {
    try {
      const uid = String(request.body.uid ?? '')
      const emails = (request.body.emails ?? []) as string[]

      if (!uid) {
        response.status(400).json({ error: 'Missing uid' })
        return
      }

      if (!(await verifyAuth(request, response, uid))) return

      if (!Array.isArray(emails) || emails.length === 0) {
        response.status(400).json({ error: 'emails must be a non-empty array' })
        return
      }

      const { batchLookupContactEmails } = await import('./contacts/batchLookupEmails.js')
      const results = await batchLookupContactEmails(uid, emails)

      response.json({ ok: true, results })
    } catch (error) {
      log.error('batchLookupContactEmails failed', error)
      response.status(500).json({ error: (error as Error).message })
    }
  }
)

// ==================== Contact Linking (Phase 3) ====================

/**
 * Firestore trigger: link incoming mailbox messages to CRM contacts.
 * When a message is created, looks up sender email in contactEmailIndex
 * and creates an interaction + writes contactId back on the message.
 */
export const onMailboxMessageCreated = onDocumentCreated(
  {
    ...FUNCTION_CONFIG.http,
    document: 'users/{uid}/mailboxMessages/{messageId}',
  },
  async (event) => {
    const { handleMailboxMessageCreated } = await import('./contacts/onMailboxMessageCreated.js')
    await handleMailboxMessageCreated(event)
  }
)

/**
 * Firestore trigger: link calendar event attendees to CRM contacts.
 * When a canonical event is created, looks up attendee emails in contactEmailIndex
 * and creates meeting interactions + writes linkedContactIds back on the event.
 */
export const onCalendarEventCreated = onDocumentCreated(
  {
    ...FUNCTION_CONFIG.http,
    document: 'users/{uid}/canonicalEvents/{eventId}',
  },
  async (event) => {
    const { handleCalendarEventCreated } = await import('./contacts/onCalendarEventCreated.js')
    await handleCalendarEventCreated(event)
  }
)

// ==================== AI Agent Framework (Phase 4A) ====================

/**
 * Agent run execution trigger
 * Executes AI agent runs when they are created with 'pending' status
 */
export { onRunCreated, onRunUpdated } from './agents/runExecutor.js'

// ==================== Slack Integration & Mailbox (Phase 2.3) ====================

/**
 * Slack OAuth and mailbox sync endpoints
 * - OAuth flow for connecting Slack workspaces
 * - Message sync with AI prioritization
 * - Channel management
 */
export {
  slackAuthStart,
  slackAuthCallback,
  slackDisconnect,
  slackListChannels,
  slackAddChannel,
  slackRemoveChannel,
  mailboxSync,
  mailboxMessages,
  mailboxMarkRead,
  mailboxDismiss,
} from './slack/slackEndpoints.js'

// ==================== Mailbox Write Endpoints (Phase 3) ====================

/**
 * Mailbox compose, delete, and draft endpoints
 */
export {
  mailboxSend,
  mailboxDelete,
  mailboxSaveDraft,
  mailboxDeleteDraft,
} from './channels/mailboxWriteEndpoints.js'

// ==================== Channel Connection Management ====================

/**
 * CRUD endpoints for LinkedIn, Telegram, and WhatsApp connections
 */
export {
  channelConnectionCreate,
  channelConnectionDelete,
  channelConnectionTest,
} from './channels/channelConnectionEndpoints.js'
