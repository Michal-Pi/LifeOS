import type { CalendarListItem } from '../domain/models'

export interface CalendarRepository {
  listCalendars(userId: string): Promise<CalendarListItem[]>
  getCalendar(userId: string, calendarId: string): Promise<CalendarListItem | null>
}
