import type { CanonicalCalendarEvent } from '../domain/models'
import type { CalendarEventRepository } from '../ports/calendarRepository'

export interface ListEventsInput {
  userId: string
  dayKeys: string[]
}

export interface ListEventsDeps {
  repository: CalendarEventRepository
}

export async function listEvents(
  deps: ListEventsDeps,
  input: ListEventsInput
): Promise<CanonicalCalendarEvent[]> {
  return deps.repository.listByOccursOn(input.userId, input.dayKeys)
}
