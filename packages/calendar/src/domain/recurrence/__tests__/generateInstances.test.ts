import { describe, it, expect } from 'vitest'
import {
  generateInstances,
  generateSingleInstance,
  isValidOccurrence,
  getNextOccurrence,
  type MasterEventData
} from '../generateInstances'
import type { CanonicalRecurrence } from '../types'

// Helper to create a master event for testing
function createMaster(
  recurrence: CanonicalRecurrence,
  startMs = new Date('2025-01-01T09:00:00Z').getTime(),
  durationMs = 60 * 60 * 1000 // 1 hour
): MasterEventData {
  return {
    canonicalEventId: 'series-1',
    startMs,
    endMs: startMs + durationMs,
    title: 'Test Event',
    timezone: 'UTC',
    recurrence
  }
}

describe('generateInstances', () => {
  describe('daily recurrence', () => {
    it('generates daily instances in range', () => {
      const master = createMaster({
        rule: { freq: 'DAILY' }
      })

      const result = generateInstances(master, {
        startMs: new Date('2025-01-01T00:00:00Z').getTime(),
        endMs: new Date('2025-01-05T23:59:59Z').getTime()
      })

      expect(result.instances).toHaveLength(5)
      expect(result.truncated).toBe(false)
    })

    it('respects interval', () => {
      const master = createMaster({
        rule: { freq: 'DAILY', interval: 2 }
      })

      const result = generateInstances(master, {
        startMs: new Date('2025-01-01T00:00:00Z').getTime(),
        endMs: new Date('2025-01-10T23:59:59Z').getTime()
      })

      // Every other day: 1, 3, 5, 7, 9
      expect(result.instances).toHaveLength(5)
    })
  })

  describe('weekly recurrence', () => {
    it('generates weekly instances', () => {
      const master = createMaster({
        rule: { freq: 'WEEKLY' }
      })

      const result = generateInstances(master, {
        startMs: new Date('2025-01-01T00:00:00Z').getTime(),
        endMs: new Date('2025-01-31T23:59:59Z').getTime()
      })

      // Jan 1, 8, 15, 22, 29
      expect(result.instances).toHaveLength(5)
    })

    it('respects BYDAY', () => {
      // Start on Monday Jan 6, 2025
      const monday = new Date('2025-01-06T09:00:00Z')
      const master = createMaster(
        {
          rule: { freq: 'WEEKLY', byWeekday: ['MO', 'WE', 'FR'] }
        },
        monday.getTime()
      )

      const result = generateInstances(master, {
        startMs: new Date('2025-01-06T00:00:00Z').getTime(),
        endMs: new Date('2025-01-12T23:59:59Z').getTime()
      })

      // Week of Jan 6: Mon 6, Wed 8, Fri 10
      expect(result.instances).toHaveLength(3)
    })
  })

  describe('monthly recurrence', () => {
    it('generates monthly on same day', () => {
      const master = createMaster({
        rule: { freq: 'MONTHLY' }
      })

      const result = generateInstances(master, {
        startMs: new Date('2025-01-01T00:00:00Z').getTime(),
        endMs: new Date('2025-06-30T23:59:59Z').getTime()
      })

      // Jan 1, Feb 1, Mar 1, Apr 1, May 1, Jun 1
      expect(result.instances).toHaveLength(6)
    })
  })

  describe('COUNT limit', () => {
    it('stops after count occurrences', () => {
      const master = createMaster({
        rule: { freq: 'DAILY', count: 3 }
      })

      const result = generateInstances(master, {
        startMs: new Date('2025-01-01T00:00:00Z').getTime(),
        endMs: new Date('2025-01-31T23:59:59Z').getTime()
      })

      expect(result.instances).toHaveLength(3)
    })
  })

  describe('UNTIL limit', () => {
    it('stops at until date', () => {
      const until = new Date('2025-01-05T23:59:59Z')
      const master = createMaster({
        rule: { freq: 'DAILY', untilMs: until.getTime() }
      })

      const result = generateInstances(master, {
        startMs: new Date('2025-01-01T00:00:00Z').getTime(),
        endMs: new Date('2025-01-31T23:59:59Z').getTime()
      })

      expect(result.instances).toHaveLength(5)
    })
  })

  describe('EXDATE exclusions', () => {
    it('excludes dates in exdatesMs', () => {
      const jan3 = new Date('2025-01-03T09:00:00Z')
      const master = createMaster({
        rule: { freq: 'DAILY' },
        exdatesMs: [jan3.getTime()]
      })

      const result = generateInstances(master, {
        startMs: new Date('2025-01-01T00:00:00Z').getTime(),
        endMs: new Date('2025-01-05T23:59:59Z').getTime()
      })

      // Jan 1, 2, 4, 5 (skipping 3)
      expect(result.instances).toHaveLength(4)
      expect(result.instances.map((i) => new Date(i.startMs).getUTCDate())).toEqual([1, 2, 4, 5])
    })

    it('includes excluded instances when requested', () => {
      const jan3 = new Date('2025-01-03T09:00:00Z')
      const master = createMaster({
        rule: { freq: 'DAILY' },
        exdatesMs: [jan3.getTime()]
      })

      const result = generateInstances(master, {
        startMs: new Date('2025-01-01T00:00:00Z').getTime(),
        endMs: new Date('2025-01-05T23:59:59Z').getTime(),
        includeExcluded: true
      })

      expect(result.instances).toHaveLength(5)
      const cancelled = result.instances.find((i) => new Date(i.startMs).getUTCDate() === 3)
      expect(cancelled?.isCancelled).toBe(true)
    })
  })

  describe('overrides', () => {
    it('applies override to specific instance', () => {
      const jan3Start = new Date('2025-01-03T09:00:00Z').getTime()
      const master = createMaster({
        rule: { freq: 'DAILY' },
        overrides: {
          [`${jan3Start}`]: {
            title: 'Modified Event',
            location: 'New Location',
            updatedAtMs: Date.now()
          }
        }
      })

      const result = generateInstances(master, {
        startMs: new Date('2025-01-01T00:00:00Z').getTime(),
        endMs: new Date('2025-01-05T23:59:59Z').getTime()
      })

      const jan3Instance = result.instances.find((i) => new Date(i.startMs).getUTCDate() === 3)
      expect(jan3Instance?.isOverride).toBe(true)
      expect(jan3Instance?.title).toBe('Modified Event')
      expect(jan3Instance?.location).toBe('New Location')
    })

    it('applies time change override', () => {
      const jan3OriginalStart = new Date('2025-01-03T09:00:00Z').getTime()
      const jan3NewStart = new Date('2025-01-03T10:00:00Z').getTime()
      const jan3NewEnd = new Date('2025-01-03T11:00:00Z').getTime()

      const master = createMaster({
        rule: { freq: 'DAILY' },
        overrides: {
          [`${jan3OriginalStart}`]: {
            startMs: jan3NewStart,
            endMs: jan3NewEnd,
            updatedAtMs: Date.now()
          }
        }
      })

      const result = generateInstances(master, {
        startMs: new Date('2025-01-01T00:00:00Z').getTime(),
        endMs: new Date('2025-01-05T23:59:59Z').getTime()
      })

      const jan3Instance = result.instances.find(
        (i) => i.occurrenceKey === `${jan3OriginalStart}`
      )
      expect(jan3Instance?.startMs).toBe(jan3NewStart)
      expect(jan3Instance?.endMs).toBe(jan3NewEnd)
    })
  })

  describe('splits', () => {
    it('respects split boundary for parent series', () => {
      const splitAt = new Date('2025-01-10T09:00:00Z').getTime()
      const master = createMaster({
        rule: { freq: 'DAILY' },
        split: {
          splitAtMs: splitAt,
          childSeriesId: 'child-series'
        }
      })

      const result = generateInstances(master, {
        startMs: new Date('2025-01-01T00:00:00Z').getTime(),
        endMs: new Date('2025-01-15T23:59:59Z').getTime()
      })

      // Should only have Jan 1-9 (before split)
      expect(result.instances.length).toBeLessThanOrEqual(9)
      const lastInstance = result.instances[result.instances.length - 1]
      expect(lastInstance.startMs).toBeLessThan(splitAt)
    })
  })

  describe('instance identity', () => {
    it('generates stable instanceId', () => {
      const master = createMaster({
        rule: { freq: 'DAILY' }
      })

      const result1 = generateInstances(master, {
        startMs: new Date('2025-01-01T00:00:00Z').getTime(),
        endMs: new Date('2025-01-03T23:59:59Z').getTime()
      })

      const result2 = generateInstances(master, {
        startMs: new Date('2025-01-01T00:00:00Z').getTime(),
        endMs: new Date('2025-01-03T23:59:59Z').getTime()
      })

      expect(result1.instances[0].instanceId).toBe(result2.instances[0].instanceId)
      expect(result1.instances[0].occurrenceKey).toBe(result2.instances[0].occurrenceKey)
    })
  })

  describe('maxInstances limit', () => {
    it('truncates results and sets truncated flag', () => {
      const master = createMaster({
        rule: { freq: 'DAILY' }
      })

      const result = generateInstances(master, {
        startMs: new Date('2025-01-01T00:00:00Z').getTime(),
        endMs: new Date('2025-12-31T23:59:59Z').getTime(),
        maxInstances: 10
      })

      expect(result.instances).toHaveLength(10)
      expect(result.truncated).toBe(true)
    })
  })
})

describe('generateSingleInstance', () => {
  it('generates a single instance', () => {
    const master = createMaster({
      rule: { freq: 'DAILY' }
    })

    const occurrenceStartMs = new Date('2025-01-03T09:00:00Z').getTime()
    const instance = generateSingleInstance(master, occurrenceStartMs)

    expect(instance).not.toBeNull()
    expect(instance!.startMs).toBe(occurrenceStartMs)
    expect(instance!.seriesId).toBe('series-1')
  })

  it('returns null for excluded instance', () => {
    const jan3 = new Date('2025-01-03T09:00:00Z').getTime()
    const master = createMaster({
      rule: { freq: 'DAILY' },
      exdatesMs: [jan3]
    })

    const instance = generateSingleInstance(master, jan3)
    expect(instance).toBeNull()
  })
})

describe('isValidOccurrence', () => {
  it('returns true for valid occurrence', () => {
    const recurrence: CanonicalRecurrence = {
      rule: { freq: 'DAILY' }
    }
    const masterStart = new Date('2025-01-01T09:00:00Z').getTime()
    const occurrence = new Date('2025-01-03T09:00:00Z').getTime()

    expect(isValidOccurrence(recurrence, masterStart, occurrence)).toBe(true)
  })

  it('returns false for invalid time', () => {
    const recurrence: CanonicalRecurrence = {
      rule: { freq: 'DAILY' }
    }
    const masterStart = new Date('2025-01-01T09:00:00Z').getTime()
    const invalidOccurrence = new Date('2025-01-03T10:00:00Z').getTime() // Wrong time

    expect(isValidOccurrence(recurrence, masterStart, invalidOccurrence)).toBe(false)
  })
})

describe('getNextOccurrence', () => {
  it('returns next occurrence after given time', () => {
    const recurrence: CanonicalRecurrence = {
      rule: { freq: 'DAILY' }
    }
    const masterStart = new Date('2025-01-01T09:00:00Z').getTime()
    const afterMs = new Date('2025-01-03T10:00:00Z').getTime()

    const next = getNextOccurrence(recurrence, masterStart, afterMs)
    expect(next).toBeDefined()

    const nextDate = new Date(next!)
    expect(nextDate.getUTCDate()).toBe(4) // Jan 4
  })
})





