import type { CanonicalCalendarEvent } from '../domain/models'

export interface CalendarEventRepository {
  listByOccursOn(
    userId: string,
    dayKeys: string[],
    filters?: { calendarId?: string[] }
  ): Promise<CanonicalCalendarEvent[]>
  listByRange(
    userId: string,
    startMs: number,
    endMs: number,
    filters?: { calendarId?: string[] }
  ): Promise<CanonicalCalendarEvent[]>
  getById(userId: string, canonicalEventId: string): Promise<CanonicalCalendarEvent | null>
  createEvent(userId: string, event: CanonicalCalendarEvent): Promise<void>
  updateEvent(
    userId: string,
    eventId: string,
    event: CanonicalCalendarEvent,
    baseUpdatedAtMs?: number
  ): Promise<void>
  deleteEvent(userId: string, eventId: string, baseUpdatedAtMs?: number): Promise<void>
}
