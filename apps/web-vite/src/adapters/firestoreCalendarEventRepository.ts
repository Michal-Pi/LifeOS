import type { CanonicalCalendarEvent, CalendarEventRepository, IncomingUpdate } from '@lifeos/calendar'
import { resolveConflict, createLogger } from '@lifeos/calendar'
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  setDoc,
  runTransaction,
  type DocumentData,
  type QuerySnapshot,
  type Firestore
} from 'firebase/firestore'
import { getFirestoreClient as getDb } from '@/lib/firestoreClient'

const logger = createLogger('CalendarEventRepository')
const EVENTS_LIMIT = 10

function canonicalCollection(db: Firestore, userId: string) {
  return collection(db, 'users', userId, 'calendarEvents')
}

/**
 * Validates that the data has required fields for CanonicalCalendarEvent
 */
function validateEventData(data: DocumentData, eventId: string): data is CanonicalCalendarEvent {
  const requiredFields = ['canonicalEventId', 'startMs', 'endMs', 'title', 'calendarId']
  for (const field of requiredFields) {
    if (data[field] === undefined && field !== 'canonicalEventId') {
      logger.warn(`Missing required field in event`, { field, eventId })
      return false
    }
  }
  if (typeof data.startMs !== 'number' || isNaN(data.startMs)) {
    logger.warn('Invalid startMs in event', { eventId, startMs: data.startMs })
    return false
  }
  if (typeof data.endMs !== 'number' || isNaN(data.endMs)) {
    logger.warn('Invalid endMs in event', { eventId, endMs: data.endMs })
    return false
  }
  return true
}

function mapSnapshot(snapshot: QuerySnapshot<DocumentData>) {
  return snapshot.docs
    .map((d) => {
      const data = d.data()
      data.canonicalEventId = d.id
      if (!validateEventData(data, d.id)) {
        return null
      }
      return data as CanonicalCalendarEvent
    })
    .filter(Boolean) as CanonicalCalendarEvent[]
}

/**
 * Extended repository interface with conflict resolution
 */
export interface CalendarEventRepositoryWithConflictResolution extends CalendarEventRepository {
  updateEventWithConflictResolution(
    userId: string,
    eventId: string,
    event: CanonicalCalendarEvent,
    baseRev?: number,
    deviceId?: string
  ): Promise<{ winner: CanonicalCalendarEvent; hadConflict: boolean }>
}

export function createFirestoreCalendarEventRepository(): CalendarEventRepositoryWithConflictResolution {
  return {
    async listByOccursOn(userId, dayKeys, filters) {
      if (!dayKeys.length) {
        return []
      }
      const db = await getDb()
      const results: CanonicalCalendarEvent[] = []
      const chunks: string[][] = []
      for (let i = 0; i < dayKeys.length; i += EVENTS_LIMIT) {
        chunks.push(dayKeys.slice(i, i + EVENTS_LIMIT))
      }
      for (const chunk of chunks) {
        const constraints = [where('occursOn', 'array-contains-any', chunk)]
        if (filters?.calendarId) {
          constraints.push(where('calendarId', '==', filters.calendarId[0]))
        }
        const q = query(canonicalCollection(db, userId), ...constraints)
        const snapshot = await getDocs(q)
        results.push(...mapSnapshot(snapshot))
      }
      return results
    },
    async listByRange(userId, startMs, endMs, filters) {
      const db = await getDb()
      const constraints: Parameters<typeof query>[2][] = [
        where('startMs', '>=', startMs),
        where('endMs', '<=', endMs)
      ]
      if (filters?.calendarId) {
        constraints.push(where('calendarId', 'in', filters.calendarId.slice(0, EVENTS_LIMIT)))
      }
      const q = query(canonicalCollection(db, userId), ...constraints)
      const snapshot = await getDocs(q)
      return mapSnapshot(snapshot)
    },
    async getById(userId, canonicalEventId) {
      const db = await getDb()
      const reference = doc(db, 'users', userId, 'calendarEvents', canonicalEventId)
      const snapshot = await getDoc(reference)
      if (!snapshot.exists()) {
        return null
      }
      const data = snapshot.data()
      data.canonicalEventId = snapshot.id
      if (!validateEventData(data, snapshot.id)) {
        logger.error('Invalid event data', undefined, { eventId: snapshot.id })
        return null
      }
      return data as CanonicalCalendarEvent
    },
    async createEvent(userId, event) {
      const db = await getDb()
      const eventRef = doc(db, 'users', userId, 'calendarEvents', event.canonicalEventId)

      // Use transaction to prevent duplicates
      await runTransaction(db, async (transaction) => {
        const existing = await transaction.get(eventRef)
        if (existing.exists()) {
          throw new Error(`Event ${event.canonicalEventId} already exists`)
        }
        const eventWithRev: CanonicalCalendarEvent = {
          ...event,
          rev: event.rev ?? 1
        }
        transaction.set(eventRef, eventWithRev)
      })
    },
    async updateEvent(userId, eventId, event, baseUpdatedAtMs) {
      const db = await getDb()
      await setDoc(
        doc(db, 'users', userId, 'calendarEvents', eventId),
        {
          ...event,
          updatedAtMs: baseUpdatedAtMs ?? Date.now()
        },
        { merge: true }
      )
    },

    /**
     * Update event with transaction-based conflict resolution
     * Uses the deterministic LWW strategy from packages/calendar
     */
    async updateEventWithConflictResolution(
      userId: string,
      eventId: string,
      event: CanonicalCalendarEvent,
      baseRev?: number,
      deviceId?: string
    ): Promise<{ winner: CanonicalCalendarEvent; hadConflict: boolean }> {
      const db = await getDb()
      const eventRef = doc(db, 'users', userId, 'calendarEvents', eventId)

      return runTransaction(db, async (transaction) => {
        const serverSnapshot = await transaction.get(eventRef)

        if (!serverSnapshot.exists()) {
          // Event doesn't exist, create it
          const newEvent: CanonicalCalendarEvent = {
            ...event,
            rev: 1,
            updatedByDeviceId: deviceId
          }
          transaction.set(eventRef, newEvent)
          return { winner: newEvent, hadConflict: false }
        }

        const serverEvent = serverSnapshot.data() as CanonicalCalendarEvent

        // Build incoming update
        const incoming: IncomingUpdate = {
          baseRev: baseRev ?? serverEvent.rev ?? 0,
          event: {
            ...event,
            canonicalEventId: eventId
          },
          updatedAtMs: event.canonicalUpdatedAtMs ?? Date.now(),
          deviceId: deviceId ?? 'unknown'
        }

        // Resolve conflict deterministically
        const result = resolveConflict(serverEvent, incoming)

        // Write the winner
        const winnerWithRev: CanonicalCalendarEvent = {
          ...result.winner,
          rev: result.newRev
        }
        transaction.set(eventRef, winnerWithRev)

        return {
          winner: winnerWithRev,
          hadConflict: result.hasConflict
        }
      })
    },

    async deleteEvent(userId, eventId, baseUpdatedAtMs) {
      const db = await getDb()
      const eventRef = doc(db, 'users', userId, 'calendarEvents', eventId)

      // Use transaction to increment rev on delete
      await runTransaction(db, async (transaction) => {
        const existing = await transaction.get(eventRef)
        const currentRev = existing.exists() ? (existing.data()?.rev ?? 0) : 0

        transaction.set(
          eventRef,
          {
            deletedAtMs: Date.now(),
            updatedAtMs: baseUpdatedAtMs ?? Date.now(),
            rev: currentRev + 1
          },
          { merge: true }
        )
      })
    }
  }
}
