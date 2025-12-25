import type { CanonicalCalendarEvent } from '@lifeos/calendar'
import type { WritebackJob } from './writeback.js'

type WritebackOp = WritebackJob['op']

export function buildWritebackPayload(params: {
  op: WritebackOp
  event: CanonicalCalendarEvent
  writebackVisibility?: 'default' | 'private'
  isInstanceEdit?: boolean
  occurrenceStartMs?: number
}): WritebackJob['payload'] {
  const { op, event, writebackVisibility, isInstanceEdit, occurrenceStartMs } = params

  let instanceOverride: { startMs?: number; endMs?: number; title?: string; description?: string; location?: string; allDay?: boolean } | null = null
  if (op === 'update' && isInstanceEdit) {
    if (typeof occurrenceStartMs !== 'number') {
      throw new Error('Missing occurrenceStartMs for instance edit')
    }
    const overrideKey = String(occurrenceStartMs)
    instanceOverride = event.recurrenceV2?.overrides?.[overrideKey] ?? null
    if (!instanceOverride) {
      throw new Error('Missing recurrence override for instance edit')
    }
  }

  const effectiveStartMs = instanceOverride?.startMs ?? event.startMs
  const effectiveEndMs = instanceOverride?.endMs ?? event.endMs
  const effectiveStartIso = effectiveStartMs ? new Date(effectiveStartMs).toISOString() : event.startIso
  const effectiveEndIso = effectiveEndMs ? new Date(effectiveEndMs).toISOString() : event.endIso

  const attendees = (event.attendees ?? []).map((attendee) => ({
    email: attendee.email,
    displayName: attendee.displayName,
    responseStatus: attendee.responseStatus,
    optional: attendee.optional,
    resource: attendee.resource,
    self: attendee.self
  }))
  const selfAttendee = event.selfAttendee ?? event.attendees?.find((attendee) => attendee.self)

  const payload: WritebackJob['payload'] = {
    title: instanceOverride?.title ?? event.title,
    description: instanceOverride?.description ?? event.description,
    location: instanceOverride?.location ?? event.location,
    startIso: effectiveStartIso,
    endIso: effectiveEndIso,
    allDay: instanceOverride?.allDay ?? event.allDay ?? false,
    timezone: event.timezone,
    transparency: event.transparency,
    visibility: op === 'create' && writebackVisibility === 'private'
      ? 'private'
      : event.visibility
  }

  if (op === 'update_attendees' || op === 'create') {
    payload.attendees = attendees
  }
  if (op === 'rsvp') {
    payload.selfEmail = selfAttendee?.email
    payload.newStatus = selfAttendee?.responseStatus as WritebackJob['payload']['newStatus']
  }
  if (op === 'update_attendees') {
    payload.sendUpdates = 'all'
  }

  if (op === 'rsvp' && (!payload.selfEmail || !payload.newStatus)) {
    throw new Error('Missing RSVP details')
  }
  if (op === 'update_attendees' && (!payload.attendees || payload.attendees.length === 0)) {
    throw new Error('Missing attendees for update')
  }

  return payload
}
