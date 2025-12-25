import { createLogger } from '@lifeos/core'
import type {
  CanonicalRecurrence,
  CanonicalRecurrenceRule,
  RecurrenceFrequency,
  Weekday,
  WeekStart
} from './types'

const logger = createLogger('ParseGoogleRecurrence')

/**
 * Parse Google Calendar recurrence strings into canonical format
 *
 * Google returns recurrence as an array of strings:
 * - RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR
 * - EXDATE;TZID=America/New_York:20250115T090000
 * - EXDATE:20250115T090000Z
 *
 * We parse these into our canonical CanonicalRecurrence type.
 */

/**
 * Parse a Google recurrence array into canonical recurrence
 */
export function parseGoogleRecurrenceStrings(
  recurrence: string[],
  dtstart?: string,
  timezone?: string
): CanonicalRecurrence | null {
  let rule: CanonicalRecurrenceRule | null = null
  const exdatesMs: number[] = []
  let tz = timezone

  for (const line of recurrence) {
    const trimmed = line.trim()

    if (trimmed.startsWith('RRULE:')) {
      rule = parseRRule(trimmed.substring(6))
    } else if (trimmed.startsWith('EXDATE')) {
      const exdates = parseExDate(trimmed)
      exdatesMs.push(...exdates)
    } else if (trimmed.startsWith('RDATE')) {
      // RDATE not supported - document and skip
      logger.warn('RDATE not supported, skipping', { rdate: trimmed })
    }
    // Extract timezone from EXDATE if present
    const tzMatch = trimmed.match(/TZID=([^:;]+)/)
    if (tzMatch && !tz) {
      tz = tzMatch[1]
    }
  }

  if (!rule) {
    return null
  }

  return {
    tz,
    rule,
    exdatesMs: exdatesMs.length > 0 ? exdatesMs : undefined
  }
}

/**
 * Parse an RRULE string into canonical rule
 *
 * Example: FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE,FR;UNTIL=20251231T235959Z
 */
function parseRRule(rruleStr: string): CanonicalRecurrenceRule | null {
  const parts = rruleStr.split(';')
  const props: Record<string, string> = {}

  for (const part of parts) {
    const [key, value] = part.split('=')
    if (key && value) {
      props[key.toUpperCase()] = value
    }
  }

  // FREQ is required
  const freq = props['FREQ'] as RecurrenceFrequency
  if (!freq || !['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].includes(freq)) {
    return null
  }

  const rule: CanonicalRecurrenceRule = {
    freq
  }

  // INTERVAL
  if (props['INTERVAL']) {
    const interval = parseInt(props['INTERVAL'], 10)
    if (!isNaN(interval) && interval > 0) {
      rule.interval = interval
    }
  }

  // BYDAY (for WEEKLY)
  if (props['BYDAY']) {
    const byWeekday = parseByDay(props['BYDAY'])
    if (byWeekday.length > 0) {
      rule.byWeekday = byWeekday
    }
  }

  // BYMONTHDAY (for MONTHLY)
  if (props['BYMONTHDAY']) {
    const byMonthDay = props['BYMONTHDAY'].split(',').map((d) => parseInt(d, 10)).filter((d) => !isNaN(d))
    if (byMonthDay.length > 0) {
      rule.byMonthDay = byMonthDay
    }
  }

  // BYMONTH (for YEARLY)
  if (props['BYMONTH']) {
    const byMonth = props['BYMONTH'].split(',').map((m) => parseInt(m, 10)).filter((m) => !isNaN(m))
    if (byMonth.length > 0) {
      rule.byMonth = byMonth
    }
  }

  // BYSETPOS
  if (props['BYSETPOS']) {
    const bySetPos = props['BYSETPOS'].split(',').map((p) => parseInt(p, 10)).filter((p) => !isNaN(p))
    if (bySetPos.length > 0) {
      rule.bySetPos = bySetPos
    }
  }

  // COUNT
  if (props['COUNT']) {
    const count = parseInt(props['COUNT'], 10)
    if (!isNaN(count) && count > 0) {
      rule.count = count
    }
  }

  // UNTIL
  if (props['UNTIL']) {
    const untilMs = parseRRuleDate(props['UNTIL'])
    if (untilMs) {
      rule.untilMs = untilMs
    }
  }

  // WKST
  if (props['WKST']) {
    const wkst = props['WKST'].toUpperCase()
    if (wkst === 'SU' || wkst === 'MO') {
      rule.wkst = wkst as WeekStart
    }
  }

  return rule
}

/**
 * Parse BYDAY value into weekday array
 *
 * Examples:
 * - "MO,WE,FR" -> ["MO", "WE", "FR"]
 * - "1MO" -> ["MO"] (first Monday - we ignore the position for now)
 * - "-1FR" -> ["FR"] (last Friday - we ignore the position for now)
 */
function parseByDay(byday: string): Weekday[] {
  const days: Weekday[] = []
  const parts = byday.split(',')

  for (const part of parts) {
    // Extract day code (last 2 chars)
    const dayCode = part.slice(-2).toUpperCase()
    if (isWeekday(dayCode)) {
      days.push(dayCode)
    }
  }

  return days
}

function isWeekday(s: string): s is Weekday {
  return ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'].includes(s)
}

/**
 * Parse RRULE date format
 *
 * Examples:
 * - "20251231T235959Z" -> UTC timestamp
 * - "20251231" -> date only
 */
function parseRRuleDate(dateStr: string): number | null {
  // Remove any quotes
  const clean = dateStr.replace(/"/g, '')

  if (clean.endsWith('Z')) {
    // UTC format: YYYYMMDDTHHmmssZ
    const match = clean.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/)
    if (match) {
      const [, year, month, day, hour, minute, second] = match
      const date = new Date(Date.UTC(
        parseInt(year, 10),
        parseInt(month, 10) - 1,
        parseInt(day, 10),
        parseInt(hour, 10),
        parseInt(minute, 10),
        parseInt(second, 10)
      ))
      return date.getTime()
    }
  }

  // Date only: YYYYMMDD
  const dateMatch = clean.match(/^(\d{4})(\d{2})(\d{2})$/)
  if (dateMatch) {
    const [, year, month, day] = dateMatch
    const date = new Date(Date.UTC(
      parseInt(year, 10),
      parseInt(month, 10) - 1,
      parseInt(day, 10),
      23, 59, 59 // End of day
    ))
    return date.getTime()
  }

  // Try ISO format
  try {
    return new Date(clean).getTime()
  } catch {
    return null
  }
}

/**
 * Parse EXDATE line
 *
 * Examples:
 * - "EXDATE:20250115T090000Z"
 * - "EXDATE;TZID=America/New_York:20250115T090000"
 * - "EXDATE;VALUE=DATE:20250115"
 */
function parseExDate(line: string): number[] {
  const exdates: number[] = []

  // Find the colon that separates params from value
  const colonIndex = line.indexOf(':', 6) // Skip "EXDATE"
  if (colonIndex === -1) return exdates

  const values = line.substring(colonIndex + 1)
  const dates = values.split(',')

  for (const dateStr of dates) {
    const ms = parseExDateTime(dateStr.trim())
    if (ms) {
      exdates.push(ms)
    }
  }

  return exdates
}

/**
 * Parse EXDATE value
 */
function parseExDateTime(dateStr: string): number | null {
  // UTC format with Z
  if (dateStr.endsWith('Z')) {
    const match = dateStr.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/)
    if (match) {
      const [, year, month, day, hour, minute, second] = match
      const date = new Date(Date.UTC(
        parseInt(year, 10),
        parseInt(month, 10) - 1,
        parseInt(day, 10),
        parseInt(hour, 10),
        parseInt(minute, 10),
        parseInt(second, 10)
      ))
      return date.getTime()
    }
  }

  // Local time format: YYYYMMDDTHHmmss
  const localMatch = dateStr.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/)
  if (localMatch) {
    const [, year, month, day, hour, minute, second] = localMatch
    // Treat as UTC for consistency (timezone should be handled separately)
    const date = new Date(Date.UTC(
      parseInt(year, 10),
      parseInt(month, 10) - 1,
      parseInt(day, 10),
      parseInt(hour, 10),
      parseInt(minute, 10),
      parseInt(second, 10)
    ))
    return date.getTime()
  }

  // Date only: YYYYMMDD
  const dateMatch = dateStr.match(/^(\d{4})(\d{2})(\d{2})$/)
  if (dateMatch) {
    const [, year, month, day] = dateMatch
    const date = new Date(Date.UTC(
      parseInt(year, 10),
      parseInt(month, 10) - 1,
      parseInt(day, 10)
    ))
    return date.getTime()
  }

  return null
}

/**
 * Convert canonical recurrence rule to Google RRULE string
 */
export function canonicalToGoogleRRule(recurrence: CanonicalRecurrence): string {
  const { rule } = recurrence
  const parts: string[] = [`FREQ=${rule.freq}`]

  if (rule.interval && rule.interval > 1) {
    parts.push(`INTERVAL=${rule.interval}`)
  }

  if (rule.byWeekday?.length) {
    parts.push(`BYDAY=${rule.byWeekday.join(',')}`)
  }

  if (rule.byMonthDay?.length) {
    parts.push(`BYMONTHDAY=${rule.byMonthDay.join(',')}`)
  }

  if (rule.byMonth?.length) {
    parts.push(`BYMONTH=${rule.byMonth.join(',')}`)
  }

  if (rule.bySetPos?.length) {
    parts.push(`BYSETPOS=${rule.bySetPos.join(',')}`)
  }

  if (rule.count) {
    parts.push(`COUNT=${rule.count}`)
  }

  if (rule.untilMs) {
    const until = new Date(rule.untilMs)
    const untilStr = formatRRuleDate(until)
    parts.push(`UNTIL=${untilStr}`)
  }

  if (rule.wkst) {
    parts.push(`WKST=${rule.wkst}`)
  }

  return `RRULE:${parts.join(';')}`
}

/**
 * Format date for RRULE UNTIL
 */
function formatRRuleDate(date: Date): string {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  const hour = String(date.getUTCHours()).padStart(2, '0')
  const minute = String(date.getUTCMinutes()).padStart(2, '0')
  const second = String(date.getUTCSeconds()).padStart(2, '0')
  return `${year}${month}${day}T${hour}${minute}${second}Z`
}

/**
 * Build Google recurrence array from canonical recurrence
 */
export function canonicalToGoogleRecurrence(recurrence: CanonicalRecurrence): string[] {
  const result: string[] = []

  // Add RRULE
  result.push(canonicalToGoogleRRule(recurrence))

  // Add EXDATE entries
  if (recurrence.exdatesMs?.length) {
    for (const exdateMs of recurrence.exdatesMs) {
      const exdate = new Date(exdateMs)
      const exdateStr = formatRRuleDate(exdate)
      result.push(`EXDATE:${exdateStr}`)
    }
  }

  return result
}





