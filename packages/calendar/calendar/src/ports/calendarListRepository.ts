import type { CanonicalCalendar } from '../domain/models'

/**
 * Repository for managing canonical calendars
 */
export interface CalendarListRepository {
  /**
   * Get all calendars for a user
   */
  listCalendars(userId: string): Promise<CanonicalCalendar[]>

  /**
   * Get a single calendar by ID
   */
  getCalendar(userId: string, calendarId: string): Promise<CanonicalCalendar | null>

  /**
   * Get calendars by provider calendar ID
   */
  getCalendarByProviderId(
    userId: string,
    provider: string,
    providerCalendarId: string
  ): Promise<CanonicalCalendar | null>

  /**
   * Save a calendar (create or update)
   */
  saveCalendar(userId: string, calendar: CanonicalCalendar): Promise<void>

  /**
   * Delete a calendar
   */
  deleteCalendar(userId: string, calendarId: string): Promise<void>

  /**
   * Subscribe to calendar changes (optional, for real-time updates)
   */
  subscribeToCalendars?(
    userId: string,
    callback: (calendars: CanonicalCalendar[]) => void
  ): () => void
}





