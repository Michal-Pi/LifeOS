import { describe, it, expect } from 'vitest'
import {
  parseGoogleRecurrenceStrings,
  canonicalToGoogleRRule,
  canonicalToGoogleRecurrence
} from '../parseGoogleRecurrence'

describe('parseGoogleRecurrenceStrings', () => {
  describe('RRULE parsing', () => {
    it('parses daily recurrence', () => {
      const result = parseGoogleRecurrenceStrings(['RRULE:FREQ=DAILY'])
      expect(result).not.toBeNull()
      expect(result!.rule.freq).toBe('DAILY')
      // interval is undefined when not specified (defaults to 1)
      expect(result!.rule.interval ?? 1).toBe(1)
    })

    it('parses weekly with interval', () => {
      const result = parseGoogleRecurrenceStrings(['RRULE:FREQ=WEEKLY;INTERVAL=2'])
      expect(result!.rule.freq).toBe('WEEKLY')
      expect(result!.rule.interval).toBe(2)
    })

    it('parses weekly with BYDAY', () => {
      const result = parseGoogleRecurrenceStrings(['RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR'])
      expect(result!.rule.freq).toBe('WEEKLY')
      expect(result!.rule.byWeekday).toEqual(['MO', 'WE', 'FR'])
    })

    it('parses monthly with BYMONTHDAY', () => {
      const result = parseGoogleRecurrenceStrings(['RRULE:FREQ=MONTHLY;BYMONTHDAY=15'])
      expect(result!.rule.freq).toBe('MONTHLY')
      expect(result!.rule.byMonthDay).toEqual([15])
    })

    it('parses COUNT', () => {
      const result = parseGoogleRecurrenceStrings(['RRULE:FREQ=DAILY;COUNT=10'])
      expect(result!.rule.count).toBe(10)
    })

    it('parses UNTIL (UTC)', () => {
      const result = parseGoogleRecurrenceStrings(['RRULE:FREQ=DAILY;UNTIL=20251231T235959Z'])
      expect(result!.rule.untilMs).toBeDefined()
      const untilDate = new Date(result!.rule.untilMs!)
      expect(untilDate.getUTCFullYear()).toBe(2025)
      expect(untilDate.getUTCMonth()).toBe(11) // December
      expect(untilDate.getUTCDate()).toBe(31)
    })

    it('parses WKST', () => {
      const result = parseGoogleRecurrenceStrings(['RRULE:FREQ=WEEKLY;WKST=SU'])
      expect(result!.rule.wkst).toBe('SU')
    })
  })

  describe('EXDATE parsing', () => {
    it('parses UTC EXDATE', () => {
      const result = parseGoogleRecurrenceStrings([
        'RRULE:FREQ=DAILY',
        'EXDATE:20250115T090000Z'
      ])
      expect(result!.exdatesMs).toHaveLength(1)
      const exdate = new Date(result!.exdatesMs![0])
      expect(exdate.getUTCFullYear()).toBe(2025)
      expect(exdate.getUTCMonth()).toBe(0) // January
      expect(exdate.getUTCDate()).toBe(15)
    })

    it('parses multiple EXDATEs', () => {
      const result = parseGoogleRecurrenceStrings([
        'RRULE:FREQ=DAILY',
        'EXDATE:20250115T090000Z',
        'EXDATE:20250116T090000Z'
      ])
      expect(result!.exdatesMs).toHaveLength(2)
    })

    it('parses date-only EXDATE', () => {
      const result = parseGoogleRecurrenceStrings([
        'RRULE:FREQ=DAILY',
        'EXDATE;VALUE=DATE:20250115'
      ])
      expect(result!.exdatesMs).toHaveLength(1)
    })
  })

  describe('timezone extraction', () => {
    it('extracts timezone from EXDATE', () => {
      const result = parseGoogleRecurrenceStrings([
        'RRULE:FREQ=DAILY',
        'EXDATE;TZID=America/New_York:20250115T090000'
      ])
      expect(result!.tz).toBe('America/New_York')
    })

    it('uses provided timezone parameter', () => {
      const result = parseGoogleRecurrenceStrings(
        ['RRULE:FREQ=DAILY'],
        '2025-01-01T09:00:00',
        'Europe/London'
      )
      expect(result!.tz).toBe('Europe/London')
    })
  })

  describe('edge cases', () => {
    it('returns null for empty array', () => {
      const result = parseGoogleRecurrenceStrings([])
      expect(result).toBeNull()
    })

    it('returns null for array without RRULE', () => {
      const result = parseGoogleRecurrenceStrings(['EXDATE:20250115T090000Z'])
      expect(result).toBeNull()
    })

    it('ignores RDATE', () => {
      const result = parseGoogleRecurrenceStrings([
        'RRULE:FREQ=DAILY',
        'RDATE:20250201T090000Z'
      ])
      // Should parse successfully, just ignoring RDATE
      expect(result).not.toBeNull()
      expect(result!.rule.freq).toBe('DAILY')
    })
  })
})

describe('canonicalToGoogleRRule', () => {
  it('converts daily recurrence', () => {
    const rrule = canonicalToGoogleRRule({
      rule: { freq: 'DAILY' }
    })
    expect(rrule).toBe('RRULE:FREQ=DAILY')
  })

  it('includes INTERVAL when > 1', () => {
    const rrule = canonicalToGoogleRRule({
      rule: { freq: 'WEEKLY', interval: 2 }
    })
    expect(rrule).toBe('RRULE:FREQ=WEEKLY;INTERVAL=2')
  })

  it('includes BYDAY', () => {
    const rrule = canonicalToGoogleRRule({
      rule: { freq: 'WEEKLY', byWeekday: ['MO', 'WE', 'FR'] }
    })
    expect(rrule).toContain('BYDAY=MO,WE,FR')
  })

  it('includes COUNT', () => {
    const rrule = canonicalToGoogleRRule({
      rule: { freq: 'DAILY', count: 10 }
    })
    expect(rrule).toContain('COUNT=10')
  })

  it('includes UNTIL', () => {
    const until = new Date('2025-12-31T23:59:59Z')
    const rrule = canonicalToGoogleRRule({
      rule: { freq: 'DAILY', untilMs: until.getTime() }
    })
    expect(rrule).toContain('UNTIL=20251231T235959Z')
  })
})

describe('canonicalToGoogleRecurrence', () => {
  it('produces RRULE and EXDATEs', () => {
    const exdate = new Date('2025-01-15T09:00:00Z')
    const result = canonicalToGoogleRecurrence({
      rule: { freq: 'DAILY' },
      exdatesMs: [exdate.getTime()]
    })
    expect(result).toHaveLength(2)
    expect(result[0]).toContain('RRULE')
    expect(result[1]).toContain('EXDATE')
  })

  it('handles no EXDATEs', () => {
    const result = canonicalToGoogleRecurrence({
      rule: { freq: 'DAILY' }
    })
    expect(result).toHaveLength(1)
    expect(result[0]).toContain('RRULE')
  })
})

