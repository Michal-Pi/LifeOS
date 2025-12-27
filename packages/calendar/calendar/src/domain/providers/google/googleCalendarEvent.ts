import { z } from 'zod'
import type {
  CanonicalCalendarEvent,
  CanonicalAttendee,
  CanonicalOrganizer,
  CanonicalCreator,
  CanonicalEventRole,
  CanonicalRSVP,
  ProviderCapabilities,
} from '../../models'
import { normalizeResponseStatus } from '../../models'
import { parseGoogleRecurrenceStrings } from '../../recurrence/parseGoogleRecurrence'

export const GoogleCalendarEventSchema = z.object({
  kind: z.string().optional(),
  etag: z.string().optional(),
  id: z.string(),
  status: z.string().optional(),
  htmlLink: z.string().optional(),
  created: z.string().optional(),
  updated: z.string(),
  summary: z.string().optional(),
  description: z.string().optional(),
  location: z.string().optional(),
  creator: z
    .object({
      email: z.string().optional(),
      displayName: z.string().optional(),
      self: z.boolean().optional(),
    })
    .optional(),
  organizer: z
    .object({
      email: z.string().optional(),
      displayName: z.string().optional(),
      self: z.boolean().optional(),
    })
    .optional(),
  start: z
    .object({
      dateTime: z.string().optional(),
      date: z.string().optional(),
      timeZone: z.string().optional(),
    })
    .optional(),
  end: z
    .object({
      dateTime: z.string().optional(),
      date: z.string().optional(),
      timeZone: z.string().optional(),
    })
    .optional(),
  recurrence: z.array(z.string()).optional(),
  recurringEventId: z.string().optional(),
  originalStartTime: z
    .object({
      dateTime: z.string().optional(),
      date: z.string().optional(),
    })
    .optional(),
  transparency: z.string().optional(),
  visibility: z.string().optional(),
  attendees: z
    .array(
      z.object({
        email: z.string().optional(),
        displayName: z.string().optional(),
        self: z.boolean().optional(),
        organizer: z.boolean().optional(),
        optional: z.boolean().optional(),
        resource: z.boolean().optional(),
        responseStatus: z.string().optional(),
        comment: z.string().optional(),
        additionalGuests: z.number().optional(),
      })
    )
    .optional(),
  reminders: z
    .object({
      useDefault: z.boolean().optional(),
      overrides: z
        .array(
          z.object({
            method: z.string().optional(),
            minutes: z.number().optional(),
          })
        )
        .optional(),
    })
    .optional(),
  attendeesOmitted: z.boolean().optional(),
  hangoutLink: z.string().optional(),
  conferenceData: z
    .object({
      entryPoints: z
        .array(
          z.object({
            uri: z.string().optional(),
            entryPointType: z.string().optional(),
          })
        )
        .optional(),
    })
    .optional(),
  creatorSelf: z.boolean().optional(),
  source: z.object({ url: z.string().optional(), title: z.string().optional() }).optional(),
  iCalUID: z.string().optional(),
  sequence: z.number().optional(),
  colorId: z.string().optional(),
})

export type GoogleCalendarEvent = z.infer<typeof GoogleCalendarEventSchema>
type GoogleCalendarAttendee =
  NonNullable<GoogleCalendarEvent['attendees']> extends Array<infer Att> ? Att : never
type GoogleCalendarReminderOverride = NonNullable<
  NonNullable<GoogleCalendarEvent['reminders']>['overrides']
>[number]

function buildOccursOn(start: string, end: string, capDays = 60) {
  const days: string[] = []
  const startDate = new Date(start)
  const endDate = new Date(end)
  let cursor = new Date(startDate)
  let iterations = 0
  while (cursor <= endDate && iterations < capDays) {
    days.push(cursor.toISOString().split('T')[0])
    cursor.setUTCDate(cursor.getUTCDate() + 1)
    iterations += 1
  }
  return days
}

/**
 * Normalize Google attendee to canonical format
 */
function normalizeGoogleAttendee(attendee: GoogleCalendarAttendee): CanonicalAttendee {
  return {
    email: attendee.email,
    displayName: attendee.displayName,
    self: attendee.self,
    organizer: attendee.organizer,
    optional: attendee.optional,
    resource: attendee.resource,
    responseStatus: normalizeResponseStatus(attendee.responseStatus),
    comment: attendee.comment,
    additionalGuests: attendee.additionalGuests,
  }
}

/**
 * Normalize Google organizer to canonical format
 */
function normalizeGoogleOrganizer(
  organizer?: GoogleCalendarEvent['organizer']
): CanonicalOrganizer | undefined {
  if (!organizer) return undefined
  return {
    email: organizer.email,
    displayName: organizer.displayName,
    self: organizer.self,
  }
}

/**
 * Normalize Google creator to canonical format
 */
function normalizeGoogleCreator(
  creator?: GoogleCalendarEvent['creator']
): CanonicalCreator | undefined {
  if (!creator) return undefined
  return {
    email: creator.email,
    displayName: creator.displayName,
    self: creator.self,
  }
}

/**
 * Determine user's role in event from Google data
 */
function determineRoleFromGoogle(
  organizer?: GoogleCalendarEvent['organizer'],
  attendees?: GoogleCalendarAttendee[]
): CanonicalEventRole {
  // Check if organizer.self is true
  if (organizer?.self === true) {
    return 'organizer'
  }

  // Check if any attendee has self === true
  if (attendees?.some((a) => a.self === true)) {
    return 'attendee'
  }

  return 'unknown'
}

export function normalizeGoogleEvent(
  raw: GoogleCalendarEvent,
  context: { uid: string; accountId: string; providerCalendarId: string }
): CanonicalCalendarEvent {
  const startIso: string =
    raw.start?.dateTime ?? raw.start?.date ?? raw.created ?? raw.updated ?? new Date().toISOString()
  const endIso: string = raw.end?.dateTime ?? raw.end?.date ?? raw.updated ?? startIso
  const startDate = new Date(startIso)
  const endDate = new Date(endIso)
  const canonicalEventId = `${'google'}:${context.accountId}:${context.providerCalendarId}:${raw.id}`
  const occursOn = buildOccursOn(startIso, endIso)
  const updatedAtMs = new Date(raw.updated ?? new Date().toISOString()).getTime()
  const timezone = raw.start?.timeZone ?? raw.end?.timeZone

  // Parse recurrence (Phase 2.3)
  const isRecurringSeries = Boolean(raw.recurrence?.length)
  const isRecurrenceInstance = Boolean(raw.recurringEventId)
  const originalStartTimeMs = raw.originalStartTime
    ? new Date(raw.originalStartTime.dateTime ?? raw.originalStartTime.date ?? '').getTime()
    : undefined

  // Parse Google recurrence strings into canonical format
  let recurrenceV2 = undefined
  if (raw.recurrence?.length) {
    recurrenceV2 = parseGoogleRecurrenceStrings(raw.recurrence, startIso, timezone) ?? undefined
  }

  // Build series ID for instances
  let seriesId: string | undefined
  if (raw.recurringEventId) {
    seriesId = `google:${context.accountId}:${context.providerCalendarId}:${raw.recurringEventId}`
  }

  // Normalize attendees (Phase 2.4)
  const attendees = raw.attendees?.map(normalizeGoogleAttendee)
  const organizer = normalizeGoogleOrganizer(raw.organizer)
  const creator = normalizeGoogleCreator(raw.creator)

  // Determine role and self attendee
  const role = determineRoleFromGoogle(raw.organizer, raw.attendees)
  const selfAttendee = attendees?.find((attendee: CanonicalAttendee) => attendee.self === true)

  // Derive RSVP capabilities
  const rsvp: CanonicalRSVP = {
    canRespond: role === 'attendee' && selfAttendee != null,
    status: selfAttendee?.responseStatus,
  }

  // Derive provider capabilities (based on role)
  const providerCapabilities: ProviderCapabilities = {
    canInvite: role === 'organizer',
    canRespond: role === 'attendee',
    canUpdate: role === 'organizer',
    canCancel: role === 'organizer',
  }

  return {
    canonicalEventId,
    schemaVersion: 1,
    normalizationVersion: 1,
    providerRef: {
      provider: 'google',
      accountId: context.accountId,
      providerCalendarId: context.providerCalendarId,
      providerEventId: raw.id,
      etag: raw.etag,
      recurringEventId: raw.recurringEventId,
    },
    iCalUID: raw.iCalUID,
    createdAt: raw.created ?? new Date().toISOString(),
    updatedAt: raw.updated,
    createdAtMs: new Date(raw.created ?? new Date().toISOString()).getTime(),
    updatedAtMs,
    // Phase 2.2 sync metadata
    canonicalUpdatedAtMs: updatedAtMs,
    providerUpdatedAtMs: updatedAtMs,
    syncState: 'synced' as const,
    source: { type: 'provider' as const },
    // Event fields
    status: raw.status,
    visibility: raw.visibility,
    transparency: raw.transparency,
    title: raw.summary,
    description: raw.description,
    location: raw.location,
    hangoutLink: raw.hangoutLink,
    conferencing: (raw.conferenceData as { entryPoints?: { uri?: string }[] } | undefined)
      ?.entryPoints?.[0]?.uri,
    startMs: Number(startDate.getTime()) || Date.now(),
    endMs: Number(endDate.getTime()) || Date.now(),
    startIso: startIso ?? '',
    endIso: endIso ?? '',
    timezone,
    allDay: Boolean(raw.start?.date && raw.end?.date),
    occursOn,
    // Attendee fields (Phase 2.4)
    organizer,
    creator,
    attendees,
    selfAttendee,
    role,
    rsvp,
    providerCapabilities,
    // Legacy recurrence (kept for backwards compat)
    recurrence: {
      recurringEventId: raw.recurringEventId,
      recurrenceRules: raw.recurrence,
      originalStartTime: raw.originalStartTime?.dateTime ?? raw.originalStartTime?.date,
    },
    // Phase 2.3 recurrence
    recurrenceV2,
    isRecurringSeries,
    isRecurrenceInstance,
    seriesId,
    originalStartTimeMs,
    reminders: raw.reminders?.overrides?.map((override: GoogleCalendarReminderOverride) => ({
      method: override?.method,
      minutesBefore: override?.minutes,
    })),
    attachments: [],
    calendarId: context.providerCalendarId,
    raw,
  }
}
