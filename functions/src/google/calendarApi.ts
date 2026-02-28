import { OAuth2Client, type Credentials } from 'google-auth-library'
import { privateAccountRef, accountRef } from './paths.js'

const env = typeof globalThis.process !== 'undefined' ? globalThis.process.env : {}

// Google Calendar API base URL
const CALENDAR_API_BASE = 'https://www.googleapis.com/calendar/v3'

/**
 * Google Calendar event shape (minimal for writeback)
 */
export interface GoogleCalendarEventInput {
  summary?: string
  description?: string
  location?: string
  start: {
    dateTime?: string
    date?: string
    timeZone?: string
  }
  end: {
    dateTime?: string
    date?: string
    timeZone?: string
  }
  transparency?: string
  visibility?: string
  recurrence?: string[] // RRULE/EXDATE strings
  attendees?: Array<{
    email?: string
    displayName?: string
    responseStatus?: string
    optional?: boolean
    resource?: boolean
    self?: boolean
  }>
}

/**
 * Response from Google Calendar API for event operations
 */
export interface GoogleCalendarEventResponse {
  id: string
  etag: string
  updated: string
  htmlLink?: string
  summary?: string
  start?: { dateTime?: string; date?: string }
  end?: { dateTime?: string; date?: string }
}

/**
 * Error from Google Calendar API
 */
export interface GoogleApiError {
  code: number
  message: string
  errors?: Array<{ reason: string; message: string }>
}

function getOAuthClient() {
  const clientId = env.GOOGLE_OAUTH_CLIENT_ID
  const clientSecret = env.GOOGLE_OAUTH_CLIENT_SECRET
  const redirectUri = env.GOOGLE_OAUTH_REDIRECT_URI
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('Missing Google OAuth configuration')
  }
  return new OAuth2Client(clientId, clientSecret, redirectUri)
}

/**
 * Get a valid access token for a user's Google account
 * Refreshes if necessary
 */
export async function getValidAccessToken(uid: string, accountId: string): Promise<string> {
  const tokenDoc = await privateAccountRef(uid, accountId).get()
  if (!tokenDoc.exists) {
    throw new Error('No tokens found for account')
  }

  const data = tokenDoc.data()
  if (!data) {
    throw new Error('Token document is empty')
  }

  const { refreshToken, accessToken, expiryDate } = data

  // Check if token is expired (with 5 minute buffer)
  const expiryMs = expiryDate ? new Date(expiryDate).getTime() : 0
  const isExpired = expiryMs < Date.now() + 5 * 60 * 1000

  if (!isExpired && accessToken) {
    return accessToken
  }

  // Refresh the token
  if (!refreshToken) {
    // Mark account as needs_attention
    await accountRef(uid, accountId).set(
      { status: 'needs_attention', updatedAt: new Date().toISOString() },
      { merge: true }
    )
    throw new Error('No refresh token available, account needs reconnection')
  }

  const oauthClient = getOAuthClient()
  oauthClient.setCredentials({ refresh_token: refreshToken })

  let credentials: Credentials
  try {
    const result = await oauthClient.refreshAccessToken()
    credentials = result.credentials
  } catch (refreshError) {
    const err = refreshError as Error & { response?: { data?: { error?: string } } }
    const errMsg = String(err?.response?.data?.error ?? err.message ?? '')
    if (errMsg.includes('invalid_grant')) {
      await accountRef(uid, accountId).set(
        { status: 'needs_attention', updatedAt: new Date().toISOString() },
        { merge: true }
      )
    }
    throw refreshError
  }

  // Store updated tokens
  await privateAccountRef(uid, accountId).set(
    {
      accessToken: credentials.access_token,
      expiryDate: credentials.expiry_date ? new Date(credentials.expiry_date).toISOString() : null,
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  )

  if (!credentials.access_token) {
    throw new Error('Failed to refresh access token')
  }

  return credentials.access_token
}

/**
 * Make an authenticated request to Google Calendar API
 */
async function makeCalendarRequest<T>(
  accessToken: string,
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const url = `${CALENDAR_API_BASE}${path}`
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  }

  const options: RequestInit = {
    method,
    headers,
  }

  if (body) {
    options.body = JSON.stringify(body)
  }

  const response = await fetch(url, options)
  const responseData = (await response.json()) as { error?: GoogleApiError; [key: string]: unknown }

  if (!response.ok) {
    const error = responseData.error
    const apiError = new Error(error?.message ?? 'Google Calendar API error') as Error & {
      code: number
      statusCode: number
    }
    apiError.code = error?.code ?? response.status
    apiError.statusCode = response.status
    throw apiError
  }

  return responseData as T
}

/**
 * Convert canonical event fields to Google Calendar event format
 */
export function toGoogleEventInput(params: {
  title?: string
  description?: string
  location?: string
  startIso: string
  endIso: string
  allDay: boolean
  timezone?: string
  transparency?: string
  visibility?: string
  recurrence?: string[] // RRULE/EXDATE strings for recurring series
  attendees?: GoogleCalendarEventInput['attendees']
}): GoogleCalendarEventInput {
  const {
    title,
    description,
    location,
    startIso,
    endIso,
    allDay,
    timezone,
    transparency,
    visibility,
    recurrence,
    attendees,
  } = params

  const event: GoogleCalendarEventInput = {
    summary: title,
    description,
    location,
    transparency,
    visibility,
    start: {},
    end: {},
  }

  if (allDay) {
    // All-day events use date (YYYY-MM-DD) format
    // Google uses exclusive end date, so we need to add a day
    const startDate = startIso.split('T')[0]
    const endDate = new Date(endIso)
    endDate.setDate(endDate.getDate() + 1)
    const endDateStr = endDate.toISOString().split('T')[0]

    event.start = { date: startDate }
    event.end = { date: endDateStr }
  } else {
    // Timed events use dateTime format
    event.start = { dateTime: startIso, timeZone: timezone }
    event.end = { dateTime: endIso, timeZone: timezone }
  }

  // Add recurrence if provided
  if (recurrence && recurrence.length > 0) {
    event.recurrence = recurrence
  }

  if (attendees && attendees.length > 0) {
    event.attendees = attendees
  }

  return event
}

/**
 * Insert a new event into Google Calendar
 */
export async function insertEvent(
  uid: string,
  accountId: string,
  calendarId: string,
  event: GoogleCalendarEventInput,
  options?: {
    sendUpdates?: 'all' | 'externalOnly' | 'none'
    conferenceDataVersion?: number
  }
): Promise<GoogleCalendarEventResponse> {
  const accessToken = await getValidAccessToken(uid, accountId)
  const params = new URLSearchParams()
  if (options?.sendUpdates) params.set('sendUpdates', options.sendUpdates)
  if (options?.conferenceDataVersion != null)
    params.set('conferenceDataVersion', String(options.conferenceDataVersion))
  const qs = params.toString()
  const path = `/calendars/${encodeURIComponent(calendarId)}/events${qs ? `?${qs}` : ''}`

  return makeCalendarRequest<GoogleCalendarEventResponse>(accessToken, 'POST', path, event)
}

/**
 * Update an existing event in Google Calendar
 */
export async function patchEvent(
  uid: string,
  accountId: string,
  calendarId: string,
  eventId: string,
  event: Partial<GoogleCalendarEventInput>,
  sendUpdates: 'all' | 'externalOnly' | 'none' = 'all'
): Promise<GoogleCalendarEventResponse> {
  const accessToken = await getValidAccessToken(uid, accountId)
  const path = `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?sendUpdates=${sendUpdates}`

  return makeCalendarRequest<GoogleCalendarEventResponse>(accessToken, 'PATCH', path, event)
}

/**
 * Delete an event from Google Calendar
 */
export async function deleteEvent(
  uid: string,
  accountId: string,
  calendarId: string,
  eventId: string
): Promise<void> {
  const accessToken = await getValidAccessToken(uid, accountId)
  const path = `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`

  const url = `${CALENDAR_API_BASE}${path}`
  const response = await fetch(url, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })

  if (!response.ok && response.status !== 410) {
    // 410 Gone is acceptable (already deleted)
    const responseData = await response.json().catch(() => ({}))
    const error = (responseData as { error?: GoogleApiError }).error
    const apiError = new Error(error?.message ?? 'Google Calendar API error') as Error & {
      code: number
      statusCode: number
    }
    apiError.code = error?.code ?? response.status
    apiError.statusCode = response.status
    throw apiError
  }
}

/**
 * Google Calendar instance from instances list
 */
export interface GoogleCalendarInstance {
  id: string
  etag: string
  recurringEventId: string
  originalStartTime: {
    dateTime?: string
    date?: string
    timeZone?: string
  }
  updated: string
  status?: string
}

/**
 * Response from events.instances endpoint
 */
interface GoogleInstancesListResponse {
  items?: GoogleCalendarInstance[]
  nextPageToken?: string
}

/**
 * Get instances of a recurring event within a time range
 * Used to resolve instance IDs for write-back
 */
export async function getRecurringInstances(
  uid: string,
  accountId: string,
  calendarId: string,
  recurringEventId: string,
  timeMin: string,
  timeMax: string
): Promise<GoogleCalendarInstance[]> {
  const accessToken = await getValidAccessToken(uid, accountId)
  const instances: GoogleCalendarInstance[] = []
  let pageToken: string | undefined

  do {
    const params = new URLSearchParams({
      timeMin,
      timeMax,
      maxResults: '250',
      showDeleted: 'true',
    })
    if (pageToken) {
      params.set('pageToken', pageToken)
    }

    const path = `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(recurringEventId)}/instances?${params.toString()}`

    const response = await makeCalendarRequest<GoogleInstancesListResponse>(
      accessToken,
      'GET',
      path
    )

    if (response.items) {
      instances.push(...response.items)
    }

    pageToken = response.nextPageToken
  } while (pageToken)

  return instances
}

// ==================== Events API (Calendar Sync) ====================

/**
 * Response from events.list endpoint
 */
export interface GoogleEventsListResponse {
  kind: string
  etag: string
  summary: string
  description?: string
  updated: string
  timeZone: string
  accessRole: string
  defaultReminders?: Array<{ method: string; minutes: number }>
  nextPageToken?: string
  nextSyncToken?: string
  items?: unknown[] // Google Calendar Event objects (typed in domain/providers/google)
}

/**
 * Options for fetching calendar events
 */
export interface FetchEventsOptions {
  /**
   * Lower bound (inclusive) for event's end time (ISO 8601)
   * Used for full sync to define the time window
   */
  timeMin?: string

  /**
   * Upper bound (exclusive) for event's start time (ISO 8601)
   * Omit for "indefinite future"
   */
  timeMax?: string

  /**
   * Token for incremental sync
   * When provided, timeMin/timeMax are ignored
   */
  syncToken?: string

  /**
   * Token for pagination
   */
  pageToken?: string

  /**
   * Maximum number of events per page
   * Default: 2500 (Google's maximum)
   */
  maxResults?: number
}

/**
 * Fetch events from a Google Calendar
 *
 * Supports two modes:
 * 1. Full sync: Provide timeMin/timeMax to fetch all events in a window
 * 2. Incremental sync: Provide syncToken to fetch only changes since last sync
 *
 * @param uid - User ID
 * @param accountId - Calendar account ID
 * @param calendarId - Provider calendar ID (e.g., 'primary' or calendar email)
 * @param options - Fetch options (time window or sync token)
 * @returns Events and pagination tokens
 *
 * @throws Error with code 'SYNC_TOKEN_INVALID' (410) if syncToken is invalid
 *
 * @example
 * // Full sync: Last 90 days to future
 * const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
 * const result = await fetchCalendarEvents(uid, accountId, 'primary', {
 *   timeMin: ninetyDaysAgo.toISOString()
 * })
 *
 * @example
 * // Incremental sync using stored token
 * const result = await fetchCalendarEvents(uid, accountId, 'primary', {
 *   syncToken: storedToken
 * })
 */
export async function fetchCalendarEvents(
  uid: string,
  accountId: string,
  calendarId: string,
  options: FetchEventsOptions = {}
): Promise<{
  events: unknown[] // Google Calendar Event objects
  nextPageToken?: string
  nextSyncToken?: string
}> {
  const accessToken = await getValidAccessToken(uid, accountId)

  // Build query parameters
  const params = new URLSearchParams()

  // Always expand recurring events and include deleted events
  params.set('singleEvents', 'true') // Expand recurring series into instances
  params.set('showDeleted', 'true') // Include cancelled events (for sync)
  params.set('maxResults', String(options.maxResults ?? 2500))

  if (options.syncToken) {
    // Incremental sync mode: Only syncToken matters
    params.set('syncToken', options.syncToken)
  } else {
    // Full sync mode: Use time window
    if (options.timeMin) {
      params.set('timeMin', options.timeMin)
    }
    if (options.timeMax) {
      params.set('timeMax', options.timeMax)
    }
  }

  // Pagination
  if (options.pageToken) {
    params.set('pageToken', options.pageToken)
  }

  const path = `/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`

  try {
    const response = await makeCalendarRequest<GoogleEventsListResponse>(accessToken, 'GET', path)

    return {
      events: response.items ?? [],
      nextPageToken: response.nextPageToken,
      nextSyncToken: response.nextSyncToken,
    }
  } catch (error: unknown) {
    // Handle syncToken invalidation (410 Gone)
    // This happens when:
    // - syncToken is too old (>30 days)
    // - Calendar was deleted and recreated
    // - Major changes to calendar structure
    const err = error as Record<string, unknown>
    if (err.statusCode === 410 || err.code === 410) {
      const invalidError = new Error('SYNC_TOKEN_INVALID') as Error & { code: string }
      invalidError.code = 'SYNC_TOKEN_INVALID'
      throw invalidError
    }
    throw error
  }
}

// ==================== Calendar List API (Phase 2.6) ====================

/**
 * Google Calendar entry from calendarList endpoint
 */
export interface GoogleCalendarListEntry {
  id: string
  summary: string
  description?: string
  location?: string
  timeZone?: string
  colorId?: string
  backgroundColor?: string
  foregroundColor?: string
  accessRole: 'owner' | 'writer' | 'reader' | 'freeBusyReader'
  primary?: boolean
  deleted?: boolean
  selected?: boolean
  hidden?: boolean
  defaultReminders?: Array<{ method: string; minutes: number }>
  notificationSettings?: unknown
  conferenceProperties?: unknown
}

/**
 * Response from calendarList.list endpoint
 */
interface GoogleCalendarListResponse {
  kind: string
  etag: string
  nextPageToken?: string
  nextSyncToken?: string
  items?: GoogleCalendarListEntry[]
}

/**
 * Fetch the user's calendar list from Google Calendar API
 */
export async function fetchCalendarList(
  uid: string,
  accountId: string
): Promise<GoogleCalendarListEntry[]> {
  const accessToken = await getValidAccessToken(uid, accountId)
  const calendars: GoogleCalendarListEntry[] = []
  let pageToken: string | undefined

  do {
    const params = new URLSearchParams({
      maxResults: '250',
      showDeleted: 'false',
      showHidden: 'false',
    })
    if (pageToken) {
      params.set('pageToken', pageToken)
    }

    const path = `/users/me/calendarList?${params.toString()}`

    const response = await makeCalendarRequest<GoogleCalendarListResponse>(accessToken, 'GET', path)

    if (response.items) {
      calendars.push(...response.items)
    }

    pageToken = response.nextPageToken
  } while (pageToken)

  return calendars
}

/**
 * Normalize a Google Calendar entry to canonical format
 */
export function normalizeGoogleCalendar(
  entry: GoogleCalendarListEntry,
  accountId: string
): {
  calendarId: string
  name: string
  description?: string
  accessRole: 'owner' | 'writer' | 'reader' | 'freeBusyReader' | 'unknown'
  canWrite: boolean
  isPrimary: boolean
  color?: string
  foregroundColor?: string
  timeZone?: string
  providerMeta: {
    provider: 'google'
    providerCalendarId: string
    accountId: string
  }
  visible: boolean
  selected: boolean
} {
  // Generate a canonical calendar ID
  const calendarId = `google:${accountId}:${entry.id}`

  // Derive canWrite from accessRole
  const canWrite = entry.accessRole === 'owner' || entry.accessRole === 'writer'

  return {
    calendarId,
    name: entry.summary,
    description: entry.description,
    accessRole: entry.accessRole,
    canWrite,
    isPrimary: entry.primary ?? false,
    color: entry.backgroundColor,
    foregroundColor: entry.foregroundColor,
    timeZone: entry.timeZone,
    providerMeta: {
      provider: 'google',
      providerCalendarId: entry.id,
      accountId,
    },
    visible: !entry.hidden,
    selected: entry.selected ?? false,
  }
}
