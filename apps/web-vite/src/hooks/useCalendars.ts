/**
 * useCalendars Hook
 *
 * Manages fetching of user's calendars.
 */
import { useState, useEffect, useMemo } from 'react'
import type { CanonicalCalendar, CalendarsById } from '@lifeos/calendar'
import { createFirestoreCalendarListRepository } from '@/adapters/firestoreCalendarListRepository'

const calendarListRepository = createFirestoreCalendarListRepository()

export function useCalendars(userId: string) {
  const [calendars, setCalendars] = useState<CanonicalCalendar[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    if (!userId) {
      setCalendars([])
      setLoading(false)
      return
    }

    let active = true
    const loadCalendars = async () => {
      setLoading(true)
      setError(null)
      try {
        const cals = await calendarListRepository.listCalendars(userId)
        if (active) {
          setCalendars(cals)
        }
      } catch (err) {
        if (active) {
          setError(err as Error)
        }
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    void loadCalendars()

    // Subscribe to real-time updates if available
    if (calendarListRepository.subscribeToCalendars) {
      const unsubscribe = calendarListRepository.subscribeToCalendars(userId, (cals) => {
        if (active) {
          setCalendars(cals)
        }
      })
      return () => {
        active = false
        unsubscribe()
      }
    }

    return () => {
      active = false
    }
  }, [userId])

  const calendarsById = useMemo<CalendarsById>(() => {
    const map = new Map<string, CanonicalCalendar>()
    for (const cal of calendars) {
      map.set(cal.calendarId, cal)
      if (cal.providerMeta?.providerCalendarId) {
        map.set(cal.providerMeta.providerCalendarId, cal)
      }
    }
    return map
  }, [calendars])

  return { calendars, calendarsById, loading, error }
}
