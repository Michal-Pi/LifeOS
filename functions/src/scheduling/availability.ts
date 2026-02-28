/**
 * @fileoverview Availability computation for scheduling links.
 *
 * Pure functions — no Firestore or API calls. Takes pre-fetched busy blocks
 * and existing bookings, returns available time slots.
 */

import type { WeeklyAvailability, DayKey, TimeSlot } from './types.js'
import type { BusyBlock } from '../freeBusy/freeBusy.js'

export interface ComputeSlotsParams {
  availability: WeeklyAvailability
  busyBlocks: BusyBlock[]
  existingBookings: Array<{ startMs: number; endMs: number }>
  /** Requested meeting duration in minutes */
  duration: number
  /** Buffer in minutes before/after each meeting */
  bufferMinutes: number
  /** Owner's IANA timezone */
  timezone: string
  /** Start of the date range (epoch ms) */
  rangeStartMs: number
  /** End of the date range (epoch ms) */
  rangeEndMs: number
  /** Slot increment in minutes (default 15) */
  slotIncrementMinutes?: number
}

const MS_PER_MINUTE = 60_000

/**
 * Get the day-of-week key for a date in a specific timezone.
 */
export function getDayKey(dateMs: number, timezone: string): DayKey {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
  })
  const dayStr = formatter.format(new Date(dateMs)).toLowerCase()
  const map: Record<string, DayKey> = {
    sun: 'sun',
    mon: 'mon',
    tue: 'tue',
    wed: 'wed',
    thu: 'thu',
    fri: 'fri',
    sat: 'sat',
  }
  return map[dayStr] ?? 'mon'
}

/**
 * Parse "HH:mm" string into { hours, minutes }.
 */
function parseTimeString(time: string): { hours: number; minutes: number } {
  const [h, m] = time.split(':').map(Number)
  return { hours: h, minutes: m }
}

/**
 * Get the start of a day in a specific timezone as epoch ms.
 * Returns midnight of that date in the given timezone.
 */
function getStartOfDayInTimezone(dateMs: number, timezone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(dateMs))

  const year = Number(parts.find((p) => p.type === 'year')?.value)
  const month = Number(parts.find((p) => p.type === 'month')?.value)
  const day = Number(parts.find((p) => p.type === 'day')?.value)

  // Create a date string in the target timezone and get its UTC equivalent
  const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T00:00:00`
  // Use a temporary date to find the UTC offset for this timezone at this date
  const tempDate = new Date(dateStr + 'Z')
  const utcDateStr = tempDate.toLocaleString('en-US', { timeZone: 'UTC' })
  const tzDateStr = tempDate.toLocaleString('en-US', { timeZone: timezone })
  const utcDate = new Date(utcDateStr)
  const tzDate = new Date(tzDateStr)
  const offsetMs = utcDate.getTime() - tzDate.getTime()

  return (
    new Date(
      `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T00:00:00Z`
    ).getTime() + offsetMs
  )
}

/**
 * Enumerate each day (as epoch ms at midnight in the owner's timezone) within the range.
 */
function enumerateDays(rangeStartMs: number, rangeEndMs: number, timezone: string): number[] {
  const days: number[] = []
  let cursor = getStartOfDayInTimezone(rangeStartMs, timezone)
  const endDay = getStartOfDayInTimezone(rangeEndMs, timezone)

  while (cursor <= endDay) {
    days.push(cursor)
    // Advance by ~25 hours to handle DST transitions, then snap back to start of day
    cursor = getStartOfDayInTimezone(cursor + 25 * 60 * MS_PER_MINUTE, timezone)
    // Safety: prevent infinite loop
    if (days.length > 60) break
  }

  return days
}

/**
 * Check if a slot overlaps with any block (considering buffer).
 */
function overlaps(
  slotStart: number,
  slotEnd: number,
  blocks: Array<{ startMs: number; endMs: number }>,
  bufferMs: number
): boolean {
  return blocks.some(
    (block) => slotStart < block.endMs + bufferMs && slotEnd + bufferMs > block.startMs
  )
}

/**
 * Compute available time slots for the given parameters.
 *
 * 1. Enumerate each day in the date range
 * 2. Map the owner's WeeklyAvailability windows to absolute epoch times
 * 3. Generate slots at fixed increments for the requested duration
 * 4. Filter out slots overlapping busy blocks or existing bookings (with buffer)
 * 5. Filter out past slots
 */
export function computeAvailableSlots(params: ComputeSlotsParams): TimeSlot[] {
  const {
    availability,
    busyBlocks,
    existingBookings,
    duration,
    bufferMinutes,
    timezone,
    rangeStartMs,
    rangeEndMs,
    slotIncrementMinutes = 15,
  } = params

  const durationMs = duration * MS_PER_MINUTE
  const bufferMs = bufferMinutes * MS_PER_MINUTE
  const incrementMs = slotIncrementMinutes * MS_PER_MINUTE
  const nowMs = Date.now()

  const allBlocks = [...busyBlocks, ...existingBookings]
  const days = enumerateDays(rangeStartMs, rangeEndMs, timezone)
  const slots: TimeSlot[] = []

  for (const dayStartMs of days) {
    const dayKey = getDayKey(dayStartMs, timezone)
    const windows = availability[dayKey]

    if (!windows || windows.length === 0) continue

    for (const window of windows) {
      const { hours: startH, minutes: startM } = parseTimeString(window.start)
      const { hours: endH, minutes: endM } = parseTimeString(window.end)

      const windowStartMs = dayStartMs + (startH * 60 + startM) * MS_PER_MINUTE
      const windowEndMs = dayStartMs + (endH * 60 + endM) * MS_PER_MINUTE

      let cursor = windowStartMs

      while (cursor + durationMs <= windowEndMs) {
        const slotEnd = cursor + durationMs

        // Skip past slots
        if (cursor > nowMs && !overlaps(cursor, slotEnd, allBlocks, bufferMs)) {
          slots.push({ startMs: cursor, endMs: slotEnd })
        }

        cursor += incrementMs
      }
    }
  }

  return slots
}
