/**
 * Calendar Helper Utilities
 *
 * Utilities for working with calendars, including getting default calendar IDs.
 */

import { createFirestoreCalendarListRepository } from '@/adapters/firestoreCalendarListRepository'

const calendarListRepository = createFirestoreCalendarListRepository()
const cache = new Map<string, { value: string; fetchedAt: number }>()
const CACHE_TTL_MS = 5 * 60 * 1000

/**
 * Get the default calendar ID for a user.
 *
 * Priority:
 * 1. Primary calendar (isPrimary === true)
 * 2. First calendar with write permissions
 * 3. First calendar in list
 * 4. Fallback to 'local:primary'
 *
 * @param userId User ID
 * @returns Default calendar ID
 */
export async function getDefaultCalendarId(userId: string): Promise<string> {
  try {
    const cached = cache.get(userId)
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      return cached.value
    }

    const calendars = await calendarListRepository.listCalendars(userId)

    if (calendars.length === 0) {
      cache.set(userId, { value: 'local:primary', fetchedAt: Date.now() })
      return 'local:primary'
    }

    // Find primary calendar
    const primaryCalendar = calendars.find((cal) => cal.isPrimary)
    if (primaryCalendar) {
      cache.set(userId, { value: primaryCalendar.calendarId, fetchedAt: Date.now() })
      return primaryCalendar.calendarId
    }

    // Find first calendar with write permissions
    const writableCalendar = calendars.find((cal) => cal.canWrite)
    if (writableCalendar) {
      cache.set(userId, { value: writableCalendar.calendarId, fetchedAt: Date.now() })
      return writableCalendar.calendarId
    }

    // Fallback to first calendar
    cache.set(userId, { value: calendars[0].calendarId, fetchedAt: Date.now() })
    return calendars[0].calendarId
  } catch (error) {
    console.error('Failed to get default calendar ID:', error)
    // Fallback to local primary on error
    return 'local:primary'
  }
}
