import { useState, useEffect, useCallback } from 'react'
import { listEventsWithRecurrence, type CanonicalCalendarEvent, type RecurrenceInstance, createLogger } from '@lifeos/calendar'
import { createFirestoreCalendarEventRepository } from '@/adapters/firestoreCalendarEventRepository'

const logger = createLogger('useCalendarEvents')
const calendarRepository = createFirestoreCalendarEventRepository()

export function useCalendarEvents(userId: string, dayKeys: string[]) {
  const [events, setEvents] = useState<CanonicalCalendarEvent[]>([])
  const [instances, setInstances] = useState<RecurrenceInstance[]>([])
  const [loading, setLoading] = useState(false)

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

  // Initial load when dependencies change
  useEffect(() => {
    void loadEvents()
  }, [loadEvents])

  return { events, instances, setEvents, loading, reload: loadEvents }
}
