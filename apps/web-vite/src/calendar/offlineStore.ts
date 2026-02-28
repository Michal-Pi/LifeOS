/**
 * Offline Storage for Calendar Events
 *
 * IndexedDB cache for storing calendar events locally.
 * Events are keyed by canonicalEventId with indexes for userId, dayKey queries, and time range queries.
 */

import { openDB, type IDBPDatabase } from 'idb'
import type { CanonicalCalendarEvent } from '@lifeos/calendar'

const DB_NAME = 'lifeos-calendar-events'
const DB_VERSION = 1
const EVENTS_STORE = 'events'

let dbPromise: Promise<IDBPDatabase> | null = null

async function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(EVENTS_STORE)) {
          const store = db.createObjectStore(EVENTS_STORE, {
            keyPath: 'canonicalEventId',
          })
          store.createIndex('userId', 'userId')
          store.createIndex('calendarId', 'calendarId')
          store.createIndex('startMs', 'startMs')
          store.createIndex('userId_startMs', ['userId', 'startMs'])
        }
      },
    })
  }
  return dbPromise
}

// ============================================================================
// Single-event operations
// ============================================================================

export async function saveEventLocally(event: CanonicalCalendarEvent): Promise<void> {
  const db = await getDb()
  await db.put(EVENTS_STORE, event)
}

export async function getEventLocally(
  eventId: string
): Promise<CanonicalCalendarEvent | undefined> {
  const db = await getDb()
  return db.get(EVENTS_STORE, eventId)
}

export async function deleteEventLocally(eventId: string): Promise<void> {
  const db = await getDb()
  await db.delete(EVENTS_STORE, eventId)
}

// ============================================================================
// List / query operations
// ============================================================================

/**
 * List all events for a user
 */
export async function listEventsLocally(userId: string): Promise<CanonicalCalendarEvent[]> {
  if (!userId) return []
  const db = await getDb()
  const index = db.transaction(EVENTS_STORE).store.index('userId')
  return index.getAll(userId)
}

/**
 * List events that fall within the given day keys.
 * Uses the `occursOn` array field to match — since IndexedDB cannot natively
 * do array-contains-any, we scan the userId index and filter in memory.
 */
export async function listEventsByDayKeysLocally(
  userId: string,
  dayKeys: string[]
): Promise<CanonicalCalendarEvent[]> {
  if (!userId || dayKeys.length === 0) return []
  const daySet = new Set(dayKeys)
  const all = await listEventsLocally(userId)
  return all.filter((e) => e.occursOn && e.occursOn.some((d) => daySet.has(d)))
}

/**
 * List events whose startMs falls within [startMs, endMs].
 * Scans the userId index and filters in JS (cheaper than full table scan).
 */
export async function listEventsByRangeLocally(
  userId: string,
  startMs: number,
  endMs: number
): Promise<CanonicalCalendarEvent[]> {
  if (!userId) return []
  const all = await listEventsLocally(userId)
  return all.filter((e) => e.startMs >= startMs && e.startMs <= endMs)
}

// ============================================================================
// Bulk operations
// ============================================================================

export async function bulkSaveEventsLocally(events: CanonicalCalendarEvent[]): Promise<void> {
  if (events.length === 0) return
  const db = await getDb()
  const tx = db.transaction(EVENTS_STORE, 'readwrite')
  const store = tx.objectStore(EVENTS_STORE)
  for (const event of events) {
    await store.put(event)
  }
  await tx.done
}

export async function clearAllLocalCalendarEvents(): Promise<void> {
  const db = await getDb()
  await db.clear(EVENTS_STORE)
}
