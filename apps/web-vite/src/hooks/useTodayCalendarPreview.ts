import { isDeleted, listEvents } from '@lifeos/calendar'
import type { CanonicalCalendarEvent } from '@lifeos/calendar'
import { createLogger } from '@lifeos/core'
import { useEffect, useState } from 'react'
import { listEventsByDayKeysLocally, bulkSaveEventsLocally } from '@/calendar/offlineStore'

const logger = createLogger('useTodayCalendarPreview')

interface UseTodayCalendarPreviewOptions {
  userId: string
  dayKeys: string[]
  calendarRepository: unknown
}

export function useTodayCalendarPreview({
  userId,
  dayKeys,
  calendarRepository,
}: UseTodayCalendarPreviewOptions) {
  const [events, setEvents] = useState<CanonicalCalendarEvent[]>([])
  const [eventsLoading, setEventsLoading] = useState(true)

  useEffect(() => {
    if (!userId) return

    listEventsByDayKeysLocally(userId, dayKeys)
      .then((localEvents) => {
        if (localEvents.length > 0) {
          setEvents(localEvents.filter((event) => !isDeleted(event)))
          setEventsLoading(false)
        }
      })
      .catch(() => {
        // ignore local read failure
      })

    listEvents({ repository: calendarRepository }, { userId, dayKeys })
      .then((canonicalEvents) => {
        const freshEvents = canonicalEvents.filter((event) => !isDeleted(event))
        setEvents(freshEvents)
        void bulkSaveEventsLocally(canonicalEvents)
      })
      .catch((error) => {
        logger.error('Failed to load calendar events from Firestore:', error)
        setEvents((prev) => (prev.length > 0 ? prev : []))
      })
      .finally(() => setEventsLoading(false))
  }, [calendarRepository, dayKeys, userId])

  return {
    events,
    eventsLoading,
  }
}
