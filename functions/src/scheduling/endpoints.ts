/**
 * @fileoverview Public scheduling link endpoints (no auth required).
 *
 * - getSchedulingLink: Fetch link data by slug
 * - getAvailability: Compute available time slots
 * - createBooking: Book a slot, create calendar event, send invite
 */

import type { Request, Response } from 'express'
import { randomUUID } from 'node:crypto'
import { slugLookupRef, schedulingLinkRef, bookingsCollection, bookingRef } from './paths.js'
import { computeAvailableSlots } from './availability.js'
import { getAttendeeFreeBusy } from '../freeBusy/freeBusy.js'
import { insertEvent, type GoogleCalendarEventInput } from '../google/calendarApi.js'
import { createLogger } from '../lib/logger.js'
import type { SchedulingLink, Booking, SlugLookup, PublicLinkData } from './types.js'

const log = createLogger('Scheduling')

/**
 * Resolve a slug to its SchedulingLink document.
 * Returns null if slug not found or link is inactive.
 */
async function resolveSlug(slug: string): Promise<{ link: SchedulingLink; userId: string } | null> {
  const lookupDoc = await slugLookupRef(slug).get()
  if (!lookupDoc.exists) return null

  const { userId, linkId } = lookupDoc.data() as SlugLookup
  const linkDoc = await schedulingLinkRef(userId, linkId).get()
  if (!linkDoc.exists) return null

  const link = linkDoc.data() as SchedulingLink
  if (!link.active) return null

  return { link, userId }
}

/**
 * GET ?slug=xxx
 * Returns sanitized scheduling link data for the public booking page.
 */
export async function handleGetSchedulingLink(req: Request, res: Response): Promise<void> {
  try {
    const slug = req.query.slug as string
    if (!slug) {
      res.status(400).json({ error: 'Missing slug parameter' })
      return
    }

    const result = await resolveSlug(slug)
    if (!result) {
      res.status(404).json({ error: 'Scheduling link not found' })
      return
    }

    const { link } = result
    const publicData: PublicLinkData = {
      title: link.title,
      description: link.description,
      durations: link.durations,
      defaultDuration: link.defaultDuration,
      timezone: link.timezone,
      maxDaysAhead: link.maxDaysAhead,
      location: link.location,
      branding: link.branding,
      availability: link.availability,
    }

    res.json(publicData)
  } catch (error) {
    log.error('handleGetSchedulingLink failed', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

/**
 * GET ?slug=xxx&duration=30&startDate=2026-03-01&endDate=2026-03-07&timezone=America/New_York
 * Returns available time slots for the given date range and duration.
 */
export async function handleGetAvailability(req: Request, res: Response): Promise<void> {
  try {
    const slug = req.query.slug as string
    const duration = Number(req.query.duration)
    const startDate = req.query.startDate as string
    const endDate = req.query.endDate as string
    const guestTimezone = (req.query.timezone as string) || 'UTC'

    if (!slug || !duration || !startDate || !endDate) {
      res
        .status(400)
        .json({ error: 'Missing required parameters: slug, duration, startDate, endDate' })
      return
    }

    const result = await resolveSlug(slug)
    if (!result) {
      res.status(404).json({ error: 'Scheduling link not found' })
      return
    }

    const { link, userId } = result

    if (!link.durations.includes(duration)) {
      res
        .status(400)
        .json({ error: `Invalid duration. Available: ${link.durations.join(', ')} minutes` })
      return
    }

    const rangeStartMs = new Date(startDate).getTime()
    const rangeEndMs = new Date(endDate).getTime() + 24 * 60 * 60 * 1000

    if (isNaN(rangeStartMs) || isNaN(rangeEndMs)) {
      res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD' })
      return
    }

    // Fetch busy blocks from Google Calendar
    const freeBusyResult = await getAttendeeFreeBusy(
      userId,
      [link.calendarId],
      rangeStartMs,
      rangeEndMs,
      link.timezone
    )
    const busyBlocks = freeBusyResult.attendees[0]?.busy ?? []

    // Fetch existing confirmed bookings
    const bookingsSnap = await bookingsCollection(userId, link.id)
      .where('status', '==', 'confirmed')
      .get()
    const existingBookings = bookingsSnap.docs
      .map((d) => {
        const b = d.data() as Booking
        return {
          startMs: new Date(b.startTime).getTime(),
          endMs: new Date(b.endTime).getTime(),
        }
      })
      .filter((b) => b.startMs < rangeEndMs && b.endMs > rangeStartMs)

    const slots = computeAvailableSlots({
      availability: link.availability,
      busyBlocks,
      existingBookings,
      duration,
      bufferMinutes: link.bufferMinutes,
      timezone: link.timezone,
      rangeStartMs,
      rangeEndMs,
    })

    res.json({ slots, timezone: link.timezone, guestTimezone })
  } catch (error) {
    log.error('handleGetAvailability failed', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

/**
 * POST body: { slug, startTime, duration, guestName, guestEmail, guestNotes?, timezone }
 * Creates a booking + Google Calendar event with attendee invite.
 */
export async function handleCreateBooking(req: Request, res: Response): Promise<void> {
  try {
    const { slug, startTime, duration, guestName, guestEmail, guestNotes, timezone } = req.body

    if (!slug || !startTime || !duration || !guestName || !guestEmail) {
      res.status(400).json({
        error: 'Missing required fields: slug, startTime, duration, guestName, guestEmail',
      })
      return
    }

    const result = await resolveSlug(slug)
    if (!result) {
      res.status(404).json({ error: 'Scheduling link not found' })
      return
    }

    const { link, userId } = result

    if (!link.durations.includes(duration)) {
      res.status(400).json({ error: 'Invalid duration' })
      return
    }

    const startMs = new Date(startTime).getTime()
    if (isNaN(startMs)) {
      res.status(400).json({ error: 'Invalid startTime' })
      return
    }

    const endMs = startMs + duration * 60 * 1000
    const startIso = new Date(startMs).toISOString()
    const endIso = new Date(endMs).toISOString()

    // Re-verify slot availability to prevent double-booking
    const freeBusyResult = await getAttendeeFreeBusy(
      userId,
      [link.calendarId],
      startMs - link.bufferMinutes * 60_000,
      endMs + link.bufferMinutes * 60_000,
      link.timezone
    )
    const busyBlocks = freeBusyResult.attendees[0]?.busy ?? []
    const hasBusyConflict = busyBlocks.some(
      (block) =>
        startMs < block.endMs + link.bufferMinutes * 60_000 &&
        endMs + link.bufferMinutes * 60_000 > block.startMs
    )
    if (hasBusyConflict) {
      res.status(409).json({ error: 'This time slot is no longer available' })
      return
    }

    // Check existing bookings for double-booking
    const bookingsSnap = await bookingsCollection(userId, link.id)
      .where('status', '==', 'confirmed')
      .get()
    const hasBookingConflict = bookingsSnap.docs.some((d) => {
      const b = d.data() as Booking
      const bStart = new Date(b.startTime).getTime()
      const bEnd = new Date(b.endTime).getTime()
      return (
        startMs < bEnd + link.bufferMinutes * 60_000 && endMs + link.bufferMinutes * 60_000 > bStart
      )
    })
    if (hasBookingConflict) {
      res.status(409).json({ error: 'This time slot is no longer available' })
      return
    }

    // Build Google Calendar event
    const eventInput: GoogleCalendarEventInput = {
      summary: `${link.title} - ${guestName}`,
      description: [
        link.description,
        guestNotes ? `\nGuest notes: ${guestNotes}` : '',
        `\nBooked via scheduling link`,
      ]
        .filter(Boolean)
        .join('\n'),
      location: link.location,
      start: { dateTime: startIso, timeZone: link.timezone },
      end: { dateTime: endIso, timeZone: link.timezone },
      attendees: [{ email: guestEmail, displayName: guestName }],
    }

    // Add Google Meet conferencing data if enabled
    const eventBody = link.addConferencing
      ? {
          ...eventInput,
          conferenceData: {
            createRequest: {
              requestId: `scheduling-${randomUUID()}`,
              conferenceSolutionKey: { type: 'hangoutsMeet' },
            },
          },
        }
      : eventInput

    // Create the calendar event with sendUpdates=all so Google sends the invite
    const eventResult = await insertEvent(
      userId,
      link.accountId,
      link.calendarId,
      eventBody as GoogleCalendarEventInput,
      {
        sendUpdates: 'all',
        ...(link.addConferencing ? { conferenceDataVersion: 1 } : {}),
      }
    )

    // Save booking record
    const bookingId = randomUUID()
    const booking: Booking = {
      id: bookingId,
      linkId: link.id,
      guestName,
      guestEmail,
      guestNotes,
      startTime: startIso,
      endTime: endIso,
      duration,
      timezone: timezone || 'UTC',
      googleEventId: eventResult.id,
      status: 'confirmed',
      createdAt: new Date().toISOString(),
    }

    await bookingRef(userId, link.id, bookingId).set(booking)

    log.info(`Booking created: ${bookingId} for link ${link.id}`)

    res.json({
      bookingId,
      startTime: startIso,
      endTime: endIso,
      title: link.title,
      location: link.location,
      conferenceLink: eventResult.htmlLink ?? null,
    })
  } catch (error) {
    log.error('handleCreateBooking failed', error)
    res.status(500).json({ error: 'Failed to create booking' })
  }
}
