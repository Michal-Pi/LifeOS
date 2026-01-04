import { useState, useEffect, useCallback, useRef } from 'react'
import {
  listEventsWithRecurrence,
  type CanonicalCalendarEvent,
  type RecurrenceInstance,
  createLogger,
} from '@lifeos/calendar'
import { createFirestoreCalendarEventRepository } from '@/adapters/firestoreCalendarEventRepository'
import { collection, query, onSnapshot, type Unsubscribe } from 'firebase/firestore'
import { getFirestoreClient as getDb } from '@/lib/firestoreClient'

const logger = createLogger('useCalendarEvents')
const calendarRepository = createFirestoreCalendarEventRepository()

export function useCalendarEvents(userId: string, dayKeys: string[]) {
  const [events, setEvents] = useState<CanonicalCalendarEvent[]>([])
  const [instances, setInstances] = useState<RecurrenceInstance[]>([])
  const [loading, setLoading] = useState(false)
  const unsubscribeRef = useRef<Unsubscribe | null>(null)

  const getRangeFromDayKeys = useCallback(() => {
    if (dayKeys.length === 0) {
      return null
    }
    const sortedKeys = [...dayKeys].sort()
    const start = new Date(`${sortedKeys[0]}T00:00:00`)
    const end = new Date(`${sortedKeys[sortedKeys.length - 1]}T23:59:59.999`)
    return { startMs: start.getTime(), endMs: end.getTime() }
  }, [dayKeys])

  // Memoize the load function so it can be exposed for manual refreshing
  const loadEvents = useCallback(async () => {
    if (!userId) return
    const range = getRangeFromDayKeys()
    if (!range) return

    setLoading(true)
    try {
      const items = await listEventsWithRecurrence(
        { repository: calendarRepository },
        { userId, startMs: range.startMs, endMs: range.endMs }
      )
      const eventMap = new Map<string, CanonicalCalendarEvent>()
      const nextInstances: RecurrenceInstance[] = []

      for (const item of items) {
        if (item.sourceEvent) {
          eventMap.set(item.sourceEvent.canonicalEventId, item.sourceEvent)
        }
        if (item.type === 'instance' && item.sourceInstance) {
          nextInstances.push(item.sourceInstance)
        }
      }

      setEvents(Array.from(eventMap.values()))
      setInstances(nextInstances)
    } catch (error) {
      logger.error('Failed to load events', error)
    } finally {
      setLoading(false)
    }
  }, [userId, getRangeFromDayKeys])

  // Set up real-time listener for events collection to detect deletions
  useEffect(() => {
    if (!userId) return

    let active = true

    const setupListener = async () => {
      const db = await getDb()
      const eventsCol = collection(db, 'users', userId, 'calendarEvents')

      // Listen to all events in the collection to detect deletions
      // We could optimize this by filtering, but for deletions we need broad coverage
      const q = query(eventsCol)

      const unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          if (!active) return

          // Only reload if there were deletions or significant changes
          const changes = snapshot.docChanges()
          const hasRelevantChanges = changes.some(
            (change) => change.type === 'removed' || change.type === 'added'
          )

          if (hasRelevantChanges) {
            logger.info('Events collection changed, reloading', {
              added: changes.filter((c) => c.type === 'added').length,
              removed: changes.filter((c) => c.type === 'removed').length,
              modified: changes.filter((c) => c.type === 'modified').length,
            })
            void loadEvents()
          }
        },
        (error) => {
          logger.error('Events listener error', error)
        }
      )

      if (active) {
        unsubscribeRef.current = unsubscribe
      } else {
        unsubscribe()
      }
    }

    void setupListener()

    return () => {
      active = false
      if (unsubscribeRef.current) {
        unsubscribeRef.current()
        unsubscribeRef.current = null
      }
    }
  }, [userId, loadEvents])

  // Initial load when dependencies change
  useEffect(() => {
    void loadEvents()
  }, [loadEvents])

  return { events, instances, setEvents, loading, reload: loadEvents }
}
