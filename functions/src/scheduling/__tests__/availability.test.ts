import { describe, it, expect } from 'vitest'
import { computeAvailableSlots, getDayKey } from '../availability.js'
import type { WeeklyAvailability } from '../types.js'

const DEFAULT_AVAILABILITY: WeeklyAvailability = {
  mon: [{ start: '09:00', end: '17:00' }],
  tue: [{ start: '09:00', end: '17:00' }],
  wed: [{ start: '09:00', end: '17:00' }],
  thu: [{ start: '09:00', end: '17:00' }],
  fri: [{ start: '09:00', end: '17:00' }],
  sat: [],
  sun: [],
}

// Use fixed dates well in the future so all slots pass the "past" filter
// 2099-03-02 is a Monday, 2099-03-03 is a Tuesday
const MONDAY = new Date('2099-03-02T00:00:00Z').getTime()
const MONDAY_END = new Date('2099-03-02T23:59:59Z').getTime()

describe('computeAvailableSlots', () => {
  it('returns slots within availability windows', () => {
    const slots = computeAvailableSlots({
      availability: DEFAULT_AVAILABILITY,
      busyBlocks: [],
      existingBookings: [],
      duration: 30,
      bufferMinutes: 0,
      timezone: 'UTC',
      rangeStartMs: MONDAY,
      rangeEndMs: MONDAY_END,
    })

    expect(slots.length).toBeGreaterThan(0)

    // All slots should start at or after 09:00 and end at or before 17:00
    for (const slot of slots) {
      const startHour = new Date(slot.startMs).getUTCHours()
      const endHour = new Date(slot.endMs).getUTCHours()
      const endMinutes = new Date(slot.endMs).getUTCMinutes()
      expect(startHour).toBeGreaterThanOrEqual(9)
      expect(endHour < 17 || (endHour === 17 && endMinutes === 0)).toBe(true)
    }
  })

  it('excludes busy blocks', () => {
    const busyStart = new Date('2099-03-02T10:00:00Z').getTime()
    const busyEnd = new Date('2099-03-02T11:00:00Z').getTime()

    const slots = computeAvailableSlots({
      availability: DEFAULT_AVAILABILITY,
      busyBlocks: [{ startMs: busyStart, endMs: busyEnd }],
      existingBookings: [],
      duration: 30,
      bufferMinutes: 0,
      timezone: 'UTC',
      rangeStartMs: MONDAY,
      rangeEndMs: MONDAY_END,
    })

    // No slot should overlap with 10:00-11:00
    const conflicting = slots.filter((s) => s.startMs < busyEnd && s.endMs > busyStart)
    expect(conflicting).toHaveLength(0)
  })

  it('respects buffer time', () => {
    // Event from 10:00-10:30, buffer of 15 minutes
    const busyStart = new Date('2099-03-02T10:00:00Z').getTime()
    const busyEnd = new Date('2099-03-02T10:30:00Z').getTime()

    const slots = computeAvailableSlots({
      availability: DEFAULT_AVAILABILITY,
      busyBlocks: [{ startMs: busyStart, endMs: busyEnd }],
      existingBookings: [],
      duration: 30,
      bufferMinutes: 15,
      timezone: 'UTC',
      rangeStartMs: MONDAY,
      rangeEndMs: MONDAY_END,
    })

    // No slot should be within 15 minutes of the busy block
    const bufferedBusyStart = busyStart - 15 * 60 * 1000
    const bufferedBusyEnd = busyEnd + 15 * 60 * 1000

    const conflicting = slots.filter(
      (s) => s.startMs < bufferedBusyEnd && s.endMs > bufferedBusyStart
    )
    expect(conflicting).toHaveLength(0)
  })

  it('returns empty for unavailable days (weekends)', () => {
    // 2099-03-08 is a Sunday (unavailable in default availability)
    const saturday = new Date('2099-03-08T00:00:00Z').getTime()
    const saturdayEnd = new Date('2099-03-08T23:59:59Z').getTime()

    const slots = computeAvailableSlots({
      availability: DEFAULT_AVAILABILITY,
      busyBlocks: [],
      existingBookings: [],
      duration: 30,
      bufferMinutes: 0,
      timezone: 'UTC',
      rangeStartMs: saturday,
      rangeEndMs: saturdayEnd,
    })

    expect(slots).toHaveLength(0)
  })

  it('handles split availability windows', () => {
    const splitAvailability: WeeklyAvailability = {
      mon: [
        { start: '09:00', end: '12:00' },
        { start: '13:00', end: '17:00' },
      ],
      tue: [],
      wed: [],
      thu: [],
      fri: [],
      sat: [],
      sun: [],
    }

    const slots = computeAvailableSlots({
      availability: splitAvailability,
      busyBlocks: [],
      existingBookings: [],
      duration: 60,
      bufferMinutes: 0,
      timezone: 'UTC',
      rangeStartMs: MONDAY,
      rangeEndMs: MONDAY_END,
    })

    // No slot should span the 12:00-13:00 gap
    const crossingGap = slots.filter((s) => {
      const startH = new Date(s.startMs).getUTCHours()
      const endH = new Date(s.endMs).getUTCHours()
      return startH < 12 && endH > 12
    })
    expect(crossingGap).toHaveLength(0)

    // Should have slots in both windows
    const morningSlots = slots.filter((s) => new Date(s.startMs).getUTCHours() < 12)
    const afternoonSlots = slots.filter((s) => new Date(s.startMs).getUTCHours() >= 13)
    expect(morningSlots.length).toBeGreaterThan(0)
    expect(afternoonSlots.length).toBeGreaterThan(0)
  })

  it('generates slots at correct increments', () => {
    const slots = computeAvailableSlots({
      availability: DEFAULT_AVAILABILITY,
      busyBlocks: [],
      existingBookings: [],
      duration: 30,
      bufferMinutes: 0,
      timezone: 'UTC',
      rangeStartMs: MONDAY,
      rangeEndMs: MONDAY_END,
      slotIncrementMinutes: 30,
    })

    // Check that consecutive slots are 30 minutes apart
    for (let i = 1; i < slots.length; i++) {
      const diff = (slots[i].startMs - slots[i - 1].startMs) / (60 * 1000)
      expect(diff).toBe(30)
    }
  })

  it('filters out existing bookings', () => {
    const bookingStart = new Date('2099-03-02T14:00:00Z').getTime()
    const bookingEnd = new Date('2099-03-02T14:30:00Z').getTime()

    const slots = computeAvailableSlots({
      availability: DEFAULT_AVAILABILITY,
      busyBlocks: [],
      existingBookings: [{ startMs: bookingStart, endMs: bookingEnd }],
      duration: 30,
      bufferMinutes: 0,
      timezone: 'UTC',
      rangeStartMs: MONDAY,
      rangeEndMs: MONDAY_END,
    })

    const conflicting = slots.filter((s) => s.startMs < bookingEnd && s.endMs > bookingStart)
    expect(conflicting).toHaveLength(0)
  })
})

describe('getDayKey', () => {
  it('returns correct day for UTC dates', () => {
    // 2099-03-02 is a Monday
    const monday = new Date('2099-03-02T12:00:00Z').getTime()
    expect(getDayKey(monday, 'UTC')).toBe('mon')
  })

  it('respects timezone for day boundary', () => {
    // 2099-03-01 is Sunday. At 23:00 UTC it should still be Sunday in UTC
    const sundayLateUTC = new Date('2099-03-01T23:00:00Z').getTime()
    expect(getDayKey(sundayLateUTC, 'UTC')).toBe('sun')
  })
})
