import { OAuth2Client } from 'google-auth-library'
import { privateAccountRef } from '../google/paths.js'
import { firestore as db } from '../lib/firebase.js'

// Google Calendar Freebusy API types
interface GoogleFreeBusyRequest {
  timeMin: string
  timeMax: string
  timeZone: string
  items: Array<{ id: string }>
}

interface GoogleFreeBusyResponse {
  kind: string
  timeMin: string
  timeMax: string
  calendars: Record<
    string,
    {
      busy: Array<{ start: string; end: string }>
      errors?: Array<{ domain: string; reason: string }>
    }
  >
}

// Output types
export interface BusyBlock {
  startMs: number
  endMs: number
}

export interface AttendeeAvailability {
  email: string
  busy: BusyBlock[]
  error?: string
}

export interface FreeBusyResult {
  attendees: AttendeeAvailability[]
  rangeStartMs: number
  rangeEndMs: number
  timeZone: string
  cached: boolean
}

// Cache configuration
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

interface CacheEntry {
  payload: FreeBusyResult
  expiresAtMs: number
}

function getCacheKey(emails: string[], startMs: number, endMs: number, timeZone: string): string {
  const emailHash = emails.sort().join(',')
  return `freebusy:${emailHash}:${startMs}:${endMs}:${timeZone}`
}

/**
 * Get free/busy information for attendees
 * Privacy-preserving: returns only busy blocks, no event details
 */
export async function getAttendeeFreeBusy(
  userId: string,
  emails: string[],
  startMs: number,
  endMs: number,
  timeZone: string = 'UTC'
): Promise<FreeBusyResult> {
  // Check cache first
  const cacheKey = getCacheKey(emails, startMs, endMs, timeZone)
  const cacheRef = db
    .collection('users')
    .doc(userId)
    .collection('freeBusyCache')
    .doc(Buffer.from(cacheKey).toString('base64').replace(/[/+=]/g, '_').slice(0, 100))

  try {
    const cacheDoc = await cacheRef.get()
    if (cacheDoc.exists) {
      const cached = cacheDoc.data() as CacheEntry
      if (cached.expiresAtMs > Date.now()) {
        return { ...cached.payload, cached: true }
      }
    }
  } catch {
    // Cache miss, continue to fetch
  }

  // Get OAuth tokens for the user
  const accountsSnapshot = await db
    .collection('users')
    .doc(userId)
    .collection('calendarAccounts')
    .where('status', '==', 'connected')
    .limit(1)
    .get()

  if (accountsSnapshot.empty) {
    throw new Error('No connected calendar account')
  }

  const accountDoc = accountsSnapshot.docs[0]
  const accountId = accountDoc.id
  const privateDoc = await privateAccountRef(userId, accountId).get()

  if (!privateDoc.exists) {
    throw new Error('Account tokens not found')
  }

  const tokens = privateDoc.data()
  if (!tokens?.accessToken) {
    throw new Error('No access token available')
  }

  // Refresh token if needed
  const oAuth2Client = new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  )

  oAuth2Client.setCredentials({
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken,
    expiry_date: tokens.expiresAt,
  })

  // Refresh if expired
  if (tokens.expiresAt && tokens.expiresAt < Date.now()) {
    const refreshed = await oAuth2Client.refreshAccessToken()
    const newCreds = refreshed.credentials
    await privateAccountRef(userId, accountId).update({
      accessToken: newCreds.access_token,
      expiresAt: newCreds.expiry_date,
    })
  }

  // Call Google Freebusy API
  const accessToken = oAuth2Client.credentials.access_token
  const requestBody: GoogleFreeBusyRequest = {
    timeMin: new Date(startMs).toISOString(),
    timeMax: new Date(endMs).toISOString(),
    timeZone,
    items: emails.map((email) => ({ id: email })),
  }

  const response = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Google Freebusy API error: ${response.status} - ${errorText}`)
  }

  const googleResponse = (await response.json()) as GoogleFreeBusyResponse

  // Transform response
  const attendees: AttendeeAvailability[] = emails.map((email) => {
    const calendarData = googleResponse.calendars[email]
    if (!calendarData) {
      return { email, busy: [], error: 'Not found' }
    }

    if (calendarData.errors?.length) {
      const error = calendarData.errors[0]
      return { email, busy: [], error: `${error.domain}: ${error.reason}` }
    }

    const busy: BusyBlock[] = calendarData.busy.map((block) => ({
      startMs: new Date(block.start).getTime(),
      endMs: new Date(block.end).getTime(),
    }))

    return { email, busy }
  })

  const result: FreeBusyResult = {
    attendees,
    rangeStartMs: startMs,
    rangeEndMs: endMs,
    timeZone,
    cached: false,
  }

  // Cache the result
  try {
    await cacheRef.set({
      payload: result,
      expiresAtMs: Date.now() + CACHE_TTL_MS,
    })
  } catch {
    // Cache write failed, continue anyway
  }

  return result
}

/**
 * Check if a proposed time slot conflicts with any busy blocks
 */
export function hasConflict(
  proposedStartMs: number,
  proposedEndMs: number,
  busyBlocks: BusyBlock[]
): boolean {
  return busyBlocks.some((block) => proposedStartMs < block.endMs && proposedEndMs > block.startMs)
}

/**
 * Find the first available time slot starting from a given time
 */
export function findNextAvailable(
  searchStartMs: number,
  searchEndMs: number,
  durationMs: number,
  busyBlocks: BusyBlock[]
): { startMs: number; endMs: number } | null {
  const sorted = [...busyBlocks].sort((a, b) => a.startMs - b.startMs)
  let currentStart = searchStartMs

  for (const block of sorted) {
    // Check if there's a gap before this block
    if (block.startMs > currentStart) {
      const gapEnd = block.startMs
      if (gapEnd - currentStart >= durationMs && gapEnd <= searchEndMs) {
        return {
          startMs: currentStart,
          endMs: currentStart + durationMs,
        }
      }
    }
    // Move past this block
    currentStart = Math.max(currentStart, block.endMs)
  }

  // Check for time after all blocks
  if (currentStart + durationMs <= searchEndMs) {
    return {
      startMs: currentStart,
      endMs: currentStart + durationMs,
    }
  }

  return null
}

/**
 * Get combined busy blocks for multiple attendees
 * Useful for finding times when all attendees are free
 */
export function combineBusyBlocks(attendees: AttendeeAvailability[]): BusyBlock[] {
  const allBlocks: BusyBlock[] = []

  for (const attendee of attendees) {
    if (!attendee.error) {
      allBlocks.push(...attendee.busy)
    }
  }

  // Merge overlapping blocks
  if (allBlocks.length === 0) return []

  const sorted = [...allBlocks].sort((a, b) => a.startMs - b.startMs)
  const merged: BusyBlock[] = [sorted[0]]

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i]
    const last = merged[merged.length - 1]

    if (current.startMs <= last.endMs) {
      last.endMs = Math.max(last.endMs, current.endMs)
    } else {
      merged.push(current)
    }
  }

  return merged
}
