import type {
  CanonicalCalendarEvent,
  CalendarEventRepository,
  IncomingUpdate,
} from '@lifeos/calendar'
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
  type Firestore,
} from 'firebase/firestore'
import { getFirestoreClient as getDb } from '@/lib/firestoreClient'
import { getAuthClient } from '@/lib/firebase'

const logger = createLogger('CalendarEventRepository')
const EVENTS_LIMIT = 10

/**
 * Ensures Firestore has the auth token before making queries.
 */
async function ensureFirestoreAuthReady(userId: string, maxWaitMs: number = 1000): Promise<void> {
  const startTime = Date.now()
  while (Date.now() - startTime < maxWaitMs) {
    const auth = getAuthClient()
    const currentUser = auth.currentUser
    if (currentUser && currentUser.uid === userId) {
      return
    }
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  // If we timeout, proceed anyway - errors will be handled
}

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
      await ensureFirestoreAuthReady(userId)
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
      await ensureFirestoreAuthReady(userId)
      const db = await getDb()
      const constraints: Parameters<typeof query>[2][] = [
        where('startMs', '>=', startMs),
        where('endMs', '<=', endMs),
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
          rev: event.rev ?? 1,
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
          updatedAtMs: baseUpdatedAtMs ?? Date.now(),
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
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/2bddec7c-aa7e-4f19-a8ce-8da88e49811f', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            location: 'firestoreCalendarEventRepository.ts:191',
            message: 'Inside transaction - before get',
            data: {
              userId,
              eventId,
              hasEvent: !!event,
              eventKeys: event ? Object.keys(event) : [],
              baseRev,
              deviceId,
            },
            timestamp: Date.now(),
            sessionId: 'debug-session',
            runId: 'run1',
            hypothesisId: 'A',
          }),
        }).catch(() => {})
        // #endregion
        const serverSnapshot = await transaction.get(eventRef)

        if (!serverSnapshot.exists()) {
          // Event doesn't exist, create it
          const newEvent: CanonicalCalendarEvent = {
            ...event,
            rev: 1,
            updatedByDeviceId: deviceId,
          }
          // Remove undefined fields - Firestore doesn't allow undefined values
          const cleanedNewEvent: Record<string, unknown> = {}
          for (const [key, value] of Object.entries(newEvent)) {
            if (value !== undefined) {
              cleanedNewEvent[key] = value
            }
          }
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/2bddec7c-aa7e-4f19-a8ce-8da88e49811f', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              location: 'firestoreCalendarEventRepository.ts:207',
              message: 'Creating new event in transaction',
              data: {
                eventId,
                newEventKeys: Object.keys(newEvent),
                cleanedKeys: Object.keys(cleanedNewEvent),
              },
              timestamp: Date.now(),
              sessionId: 'debug-session',
              runId: 'post-fix',
              hypothesisId: 'D',
            }),
          }).catch(() => {})
          // #endregion
          transaction.set(eventRef, cleanedNewEvent as CanonicalCalendarEvent)
          return { winner: newEvent, hadConflict: false }
        }

        const serverEvent = serverSnapshot.data() as CanonicalCalendarEvent

        // Build incoming update
        const incoming: IncomingUpdate = {
          baseRev: baseRev ?? serverEvent.rev ?? 0,
          event: {
            ...event,
            canonicalEventId: eventId,
          },
          updatedAtMs: event.canonicalUpdatedAtMs ?? Date.now(),
          deviceId: deviceId ?? 'unknown',
        }
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/2bddec7c-aa7e-4f19-a8ce-8da88e49811f', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            location: 'firestoreCalendarEventRepository.ts:218',
            message: 'Before resolveConflict',
            data: {
              incomingKeys: Object.keys(incoming.event),
              serverEventKeys: Object.keys(serverEvent),
            },
            timestamp: Date.now(),
            sessionId: 'debug-session',
            runId: 'run1',
            hypothesisId: 'D',
          }),
        }).catch(() => {})
        // #endregion
        // Resolve conflict deterministically
        const result = resolveConflict(serverEvent, incoming)

        // Write the winner
        const winnerWithRev: CanonicalCalendarEvent = {
          ...result.winner,
          rev: result.newRev,
        }
        // Remove undefined fields - Firestore doesn't allow undefined values
        const cleanedWinner: Record<string, unknown> = {}
        for (const [key, value] of Object.entries(winnerWithRev)) {
          if (value !== undefined) {
            cleanedWinner[key] = value
          }
        }
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/2bddec7c-aa7e-4f19-a8ce-8da88e49811f', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            location: 'firestoreCalendarEventRepository.ts:232',
            message: 'Before transaction.set',
            data: {
              winnerKeys: Object.keys(winnerWithRev),
              cleanedKeys: Object.keys(cleanedWinner),
              removedUndefined: Object.entries(winnerWithRev)
                .filter(([, value]) => value === undefined)
                .map(([key]) => key),
            },
            timestamp: Date.now(),
            sessionId: 'debug-session',
            runId: 'post-fix',
            hypothesisId: 'D',
          }),
        }).catch(() => {})
        // #endregion
        transaction.set(eventRef, cleanedWinner as CanonicalCalendarEvent)

        return {
          winner: winnerWithRev,
          hadConflict: result.hasConflict,
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
            rev: currentRev + 1,
          },
          { merge: true }
        )
      })
    },
  }
}
