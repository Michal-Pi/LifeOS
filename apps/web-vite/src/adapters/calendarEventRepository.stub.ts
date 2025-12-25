import { computeOccursOn, type CalendarEventRepository, type CanonicalCalendarEvent, type CanonicalAttendee } from '@lifeos/calendar'
import { newId, SystemClock } from '@lifeos/core'

const clock = new SystemClock()
const baseDate = new Date(clock.now())
baseDate.setMinutes(0, 0, 0)

const createEvent = ({
  title,
  offsetHours,
  durationMinutes = 45,
  attendees = 0,
  location,
  description
}: {
  title: string
  offsetHours: number
  durationMinutes?: number
  attendees?: number
  location?: string
  description?: string
}): CanonicalCalendarEvent => {
  const startsAt = new Date(baseDate)
  startsAt.setHours(startsAt.getHours() + offsetHours)
  const endsAt = new Date(startsAt)
  endsAt.setMinutes(endsAt.getMinutes() + durationMinutes)
  const startIso = clock.toISOString(startsAt)
  const endIso = clock.toISOString(endsAt)
  const occursOn = computeOccursOn(startIso, endIso)
  const attendeeList: CanonicalAttendee[] | undefined =
    attendees > 0
      ? Array.from({ length: attendees }).map((_, index) => ({
          email: `guest${index + 1}@example.com`,
          displayName: `Guest ${index + 1}`,
          responseStatus: 'accepted' as const
        }))
      : undefined

  const canonicalEventId = newId('CalendarEvent')
  const nowMs = startsAt.getTime()
  return {
    canonicalEventId,
    schemaVersion: 1,
    normalizationVersion: 1,
    providerRef: {
      provider: 'google',
      accountId: 'account-1',
      providerCalendarId: 'primary',
      providerEventId: newId('ProviderEvent'),
      etag: undefined
    },
    createdAt: clock.toISOString(startsAt),
    updatedAt: clock.toISOString(startsAt),
    createdAtMs: nowMs,
    updatedAtMs: nowMs,
    canonicalUpdatedAtMs: nowMs,
    providerUpdatedAtMs: nowMs,
    syncState: 'synced' as const,
    source: { type: 'provider' as const },
    startMs: startsAt.getTime(),
    endMs: endsAt.getTime(),
    startIso,
    endIso,
    timezone: 'UTC',
    title,
    description,
    location,
    occursOn,
    attendees: attendeeList,
    reminders: undefined,
    recurrence: undefined,
    attachments: undefined,
    status: 'confirmed',
    visibility: 'default',
    transparency: 'opaque',
    calendarId: 'primary',
    raw: undefined
  }
}

const stubEvents: CanonicalCalendarEvent[] = [
  createEvent({
    title: 'Leadership standup',
    offsetHours: 0,
    durationMinutes: 30,
    attendees: 3,
    description: 'Align on intents and blockers',
    location: 'Zoom'
  }),
  createEvent({
    title: 'Product review',
    offsetHours: 2,
    durationMinutes: 60,
    attendees: 5,
    location: 'Design Studio'
  }),
  createEvent({
    title: 'Deep focus',
    offsetHours: 4,
    durationMinutes: 90,
    attendees: 0,
    description: 'Timeboxed writing and research'
  })
]

export function createCalendarEventRepositoryStub(): CalendarEventRepository {
  return {
    async listByOccursOn(_userId, dayKeys) {
      return stubEvents.filter((event) => event.occursOn.some((day) => dayKeys.includes(day)))
    },
    async listByRange(_userId, startMs, endMs) {
      return stubEvents.filter((event) => event.startMs >= startMs && event.endMs <= endMs)
    },
    async getById(_userId, canonicalEventId) {
      return stubEvents.find((event) => event.canonicalEventId === canonicalEventId) ?? null
    },
    async createEvent(_userId, event) {
      stubEvents.push(event)
    },
    async updateEvent(_userId, eventId, event) {
      const index = stubEvents.findIndex((doc) => doc.canonicalEventId === eventId)
      if (index >= 0) {
        stubEvents[index] = event
      }
    },
    async deleteEvent() {
      stubEvents.push() // no-op
    }
  }
}

