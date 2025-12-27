import {
  normalizeGoogleEvent,
  type CanonicalCalendar,
  type GoogleCalendarEvent,
} from '@lifeos/calendar'
import { firestore } from '../lib/firebase.js'
import { fetchCalendarEvents } from './calendarApi.js'
import { calendarsCollection, canonicalEventRef, syncStateRef } from './paths.js'
import { syncGoogleCalendars } from './sync.js'
import { getFullSyncTimeMin, isSyncTokenInvalid } from './syncHelpers.js'

const MAX_BATCH_SIZE = 500

interface CalendarSyncState {
  accountId: string
  calendarId: string
  syncToken?: string
  lastSyncAt?: string
  lastSuccessAt?: string
  lastError?: string
  updatedAt?: string
}

export interface CalendarSyncResult {
  calendarId: string
  providerCalendarId: string
  eventsFetched: number
  eventsUpserted: number
  nextSyncToken?: string
}

interface IncrementalSyncResult extends CalendarSyncResult {
  mode: 'incremental' | 'full'
}

function calendarStateId(accountId: string, calendarId: string): string {
  return `${accountId}:${calendarId}`
}

async function readCalendarSyncState(
  uid: string,
  accountId: string,
  calendarId: string
): Promise<CalendarSyncState | null> {
  const stateSnap = await syncStateRef(uid, calendarStateId(accountId, calendarId)).get()
  if (!stateSnap.exists) return null
  return stateSnap.data() as CalendarSyncState
}

async function writeCalendarSyncState(uid: string, state: CalendarSyncState): Promise<void> {
  await syncStateRef(uid, calendarStateId(state.accountId, state.calendarId)).set(
    {
      ...state,
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  )
}

async function upsertEvents(
  uid: string,
  calendar: CanonicalCalendar,
  events: GoogleCalendarEvent[]
): Promise<number> {
  let batch = firestore.batch()
  let count = 0
  let pending = 0

  for (const raw of events) {
    const normalized = normalizeGoogleEvent(raw, {
      uid,
      accountId: calendar.providerMeta.accountId,
      providerCalendarId: calendar.providerMeta.providerCalendarId,
    })

    const eventToWrite = {
      ...normalized,
      calendarId: calendar.calendarId,
      deletedAtMs:
        normalized.status === 'cancelled' ? normalized.updatedAtMs : normalized.deletedAtMs,
    }

    const ref = canonicalEventRef(uid, eventToWrite.canonicalEventId)
    batch.set(ref, eventToWrite, { merge: true })
    pending += 1
    count += 1

    if (pending >= MAX_BATCH_SIZE) {
      await batch.commit()
      batch = firestore.batch()
      pending = 0
    }
  }

  if (pending > 0) {
    await batch.commit()
  }

  return count
}

export async function syncCalendarEventsFull(
  uid: string,
  calendar: CanonicalCalendar
): Promise<CalendarSyncResult> {
  const providerCalendarId = calendar.providerMeta.providerCalendarId
  const accountId = calendar.providerMeta.accountId
  const timeMin = getFullSyncTimeMin()
  let pageToken: string | undefined
  let nextSyncToken: string | undefined
  let eventsFetched = 0
  let eventsUpserted = 0

  do {
    const response = await fetchCalendarEvents(uid, accountId, providerCalendarId, {
      timeMin,
      pageToken,
    })

    const pageEvents = (response.events ?? []) as GoogleCalendarEvent[]
    eventsFetched += pageEvents.length
    eventsUpserted += await upsertEvents(uid, calendar, pageEvents)

    pageToken = response.nextPageToken
    if (response.nextSyncToken) {
      nextSyncToken = response.nextSyncToken
    }
  } while (pageToken)

  await writeCalendarSyncState(uid, {
    accountId,
    calendarId: calendar.calendarId,
    syncToken: nextSyncToken,
    lastSyncAt: new Date().toISOString(),
    lastSuccessAt: new Date().toISOString(),
    lastError: undefined,
  })

  return {
    calendarId: calendar.calendarId,
    providerCalendarId,
    eventsFetched,
    eventsUpserted,
    nextSyncToken,
  }
}

async function syncCalendarEventsIncremental(
  uid: string,
  calendar: CanonicalCalendar,
  syncToken: string
): Promise<CalendarSyncResult> {
  const providerCalendarId = calendar.providerMeta.providerCalendarId
  const accountId = calendar.providerMeta.accountId
  let pageToken: string | undefined
  let nextSyncToken: string | undefined
  let eventsFetched = 0
  let eventsUpserted = 0

  do {
    const response = await fetchCalendarEvents(uid, accountId, providerCalendarId, {
      syncToken,
      pageToken,
    })

    const pageEvents = (response.events ?? []) as GoogleCalendarEvent[]
    eventsFetched += pageEvents.length
    eventsUpserted += await upsertEvents(uid, calendar, pageEvents)

    pageToken = response.nextPageToken
    if (response.nextSyncToken) {
      nextSyncToken = response.nextSyncToken
    }
  } while (pageToken)

  await writeCalendarSyncState(uid, {
    accountId,
    calendarId: calendar.calendarId,
    syncToken: nextSyncToken ?? syncToken,
    lastSyncAt: new Date().toISOString(),
    lastSuccessAt: new Date().toISOString(),
    lastError: undefined,
  })

  return {
    calendarId: calendar.calendarId,
    providerCalendarId,
    eventsFetched,
    eventsUpserted,
    nextSyncToken: nextSyncToken ?? syncToken,
  }
}

export async function syncAllCalendarsFull(
  uid: string,
  accountId: string
): Promise<CalendarSyncResult[]> {
  const calendarsSnap = await calendarsCollection(uid)
    .where('providerMeta.provider', '==', 'google')
    .get()

  const calendars = calendarsSnap.docs
    .map((doc) => doc.data() as CanonicalCalendar)
    .filter((calendar) => calendar.providerMeta.accountId === accountId)
    .filter((calendar) => calendar.syncEnabled !== false)

  const results: CalendarSyncResult[] = []
  for (const calendar of calendars) {
    const result = await syncCalendarEventsFull(uid, calendar)
    results.push(result)
  }

  return results
}

export async function syncAllCalendarsIncremental(
  uid: string,
  accountId: string
): Promise<IncrementalSyncResult[]> {
  await syncGoogleCalendars(uid, accountId)
  const calendarsSnap = await calendarsCollection(uid)
    .where('providerMeta.provider', '==', 'google')
    .get()

  const calendars = calendarsSnap.docs
    .map((doc) => doc.data() as CanonicalCalendar)
    .filter((calendar) => calendar.providerMeta.accountId === accountId)
    .filter((calendar) => calendar.syncEnabled !== false)

  const results: IncrementalSyncResult[] = []

  for (const calendar of calendars) {
    const state = await readCalendarSyncState(uid, accountId, calendar.calendarId)
    if (!state?.syncToken) {
      const full = await syncCalendarEventsFull(uid, calendar)
      results.push({ ...full, mode: 'full' })
      continue
    }

    try {
      const incremental = await syncCalendarEventsIncremental(uid, calendar, state.syncToken)
      results.push({ ...incremental, mode: 'incremental' })
    } catch (error) {
      if (isSyncTokenInvalid(error)) {
        const full = await syncCalendarEventsFull(uid, calendar)
        results.push({ ...full, mode: 'full' })
      } else {
        const err = error as Error
        await writeCalendarSyncState(uid, {
          accountId,
          calendarId: calendar.calendarId,
          syncToken: state.syncToken,
          lastSyncAt: new Date().toISOString(),
          lastError: err.message,
        })
        throw error
      }
    }
  }

  return results
}

export async function getCalendarSyncState(
  uid: string,
  accountId: string,
  calendarId: string
): Promise<CalendarSyncState | null> {
  return readCalendarSyncState(uid, accountId, calendarId)
}
