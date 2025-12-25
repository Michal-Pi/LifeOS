/**
 * Recurring Events System - Canonical Recurrence Model
 *
 * This module implements a comprehensive recurring events system that can represent
 * complex repeating patterns while remaining provider-agnostic. It supports:
 *
 * Core Features:
 * - RRULE-like repeating patterns (daily/weekly/monthly/yearly with intervals)
 * - End conditions (until date or occurrence count)
 * - Timezone-aware occurrence calculation
 * - Exceptions (EXDATE - excluded/cancelled instances)
 * - Overrides (modified individual instances)
 * - Series splits ("this and future" modifications)
 *
 * Design Philosophy:
 * - Provider-neutral: Works with Google Calendar, Outlook, or any provider
 * - Deterministic: Same recurrence always generates same instances
 * - Efficient: Lazy generation of occurrences within time ranges
 * - Conflict-aware: Supports modifications to individual instances
 * - Split-support: Handles "this and future" modifications that create new series
 *
 * Usage Example:
 * - "Every 2 weeks on Monday and Wednesday, until December 2024"
 * - "Monthly on the 15th, with one instance moved to different time"
 * - "Weekly team meetings, but skip holidays (exceptions)"
 */

/**
 * Weekday constants (ISO 8601: Monday = 1, Sunday = 7)
 */
export type Weekday = 'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA' | 'SU'

/**
 * Frequency of recurrence
 */
export type RecurrenceFrequency = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY'

/**
 * Week start day for RRULE
 */
export type WeekStart = 'MO' | 'SU'

/**
 * Canonical recurrence rule (RRULE-like)
 */
export interface CanonicalRecurrenceRule {
  freq: RecurrenceFrequency
  interval?: number // default 1
  byWeekday?: Weekday[] // for WEEKLY: which days
  byMonthDay?: number[] // for MONTHLY: which days of month (1-31, negative for from end)
  byMonth?: number[] // for YEARLY: which months (1-12)
  bySetPos?: number[] // position within set
  count?: number // stop after N occurrences
  untilMs?: number // stop at this time (inclusive)
  wkst?: WeekStart // week start day, default MO
}

/**
 * Override for a specific occurrence (exception instance)
 * Key in overrides map is the occurrence key: `${seriesId}:${occurrenceStartMs}`
 */
export interface CanonicalEventOverride {
  title?: string
  location?: string
  description?: string
  startMs?: number // moved start time
  endMs?: number // moved end time
  allDay?: boolean
  status?: 'confirmed' | 'tentative' | 'cancelled'
  updatedAtMs: number
  // Provider instance ID for write-back
  providerInstanceId?: string
  providerEtag?: string
}

/**
 * Split reference - when "this and future" creates a new series
 */
export interface RecurrenceSplit {
  splitAtMs: number // occurrence start where split happened
  childSeriesId?: string // ID of the new series (if this is the parent)
  parentSeriesId?: string // ID of the old series (if this is the child)
}

/**
 * Complete Recurrence Definition - The Master Recurrence Object
 *
 * This interface represents the complete definition of a recurring event series,
 * including the base pattern, exceptions, overrides, and split history.
 *
 * Components:
 * 1. Rule: The base repeating pattern (RRULE-like)
 * 2. Exceptions: Specific instances that are cancelled/excluded
 * 3. Overrides: Modified individual instances
 * 4. Splits: History of "this and future" modifications
 *
 * Example:
 * A weekly meeting that:
 * - Normally occurs every Monday at 10 AM
 * - Has one instance moved to Tuesday (override)
 * - Skips holidays (exceptions)
 * - Was modified "this and future" to be at 11 AM (split)
 */
export interface CanonicalRecurrence {
  /**
   * Timezone for occurrence calculation
   * IANA timezone identifier (e.g., "America/New_York", "Europe/London")
   * Ensures consistent occurrence times across different user locations
   */
  tz?: string

  /**
   * The base recurrence rule defining the pattern
   * Similar to iCalendar RRULE but simplified for common use cases
   */
  rule: CanonicalRecurrenceRule

  /**
   * Excluded occurrences - cancelled instances
   * Array of timestamps (milliseconds) for occurrences that should be skipped
   * Equivalent to iCalendar EXDATE property
   * Example: [1703126400000] - skip January 20, 2024 at 10 AM
   */
  exdatesMs?: number[]

  /**
   * Modified occurrences - individual instance overrides
   * Map of occurrence start times to override definitions
   * Key format: `${occurrenceStartMs}` (milliseconds since epoch)
   * Allows changing title, time, location for specific instances
   */
  overrides?: Record<string, CanonicalEventOverride>

  /**
   * Split information for "this and future" modifications
   * Tracks when a series was split due to future-only changes
   * Creates relationship between old and new series
   */
  split?: RecurrenceSplit
}

/**
 * A generated instance of a recurring event (render model)
 */
export interface RecurrenceInstance {
  instanceId: string // seriesId:occurrenceStartMs
  seriesId: string // canonical ID of the master series
  occurrenceKey: string // stable key for this occurrence

  // Time bounds
  startMs: number
  endMs: number
  allDay: boolean

  // Event fields (from master or override)
  title?: string
  description?: string
  location?: string
  status?: string
  timezone?: string

  // Metadata
  isOverride: boolean // true if this instance has modifications
  isCancelled: boolean // true if this instance is excluded
  isGenerated: boolean // true = generated, false = from provider
  isMaster: boolean // true if this represents the master series

  // Provider reference (if known)
  providerInstanceId?: string
  providerEtag?: string

  // For UI
  recurrenceDescription?: string // "Weekly on Mon, Wed, Fri"
}

/**
 * Options for instance generation
 */
export interface GenerateInstancesOptions {
  startMs: number
  endMs: number
  maxInstances?: number // default 500
  includeExcluded?: boolean // include cancelled instances for display
}

/**
 * Result of instance generation
 */
export interface GenerateInstancesResult {
  instances: RecurrenceInstance[]
  truncated: boolean // true if maxInstances was reached
  totalCount?: number // approximate total if truncated
}

/**
 * Make a stable occurrence key from series ID and occurrence start time
 * The key must be deterministic across devices and time
 */
export function makeOccurrenceKey(seriesId: string, occurrenceStartMs: number): string {
  return `${seriesId}:${occurrenceStartMs}`
}

/**
 * Parse an occurrence key back to its components
 */
export function parseOccurrenceKey(key: string): { seriesId: string; occurrenceStartMs: number } | null {
  const lastColon = key.lastIndexOf(':')
  if (lastColon === -1) return null

  const seriesId = key.substring(0, lastColon)
  const occurrenceStartMs = parseInt(key.substring(lastColon + 1), 10)

  if (isNaN(occurrenceStartMs)) return null

  return { seriesId, occurrenceStartMs }
}

/**
 * Make an instance ID from series ID and occurrence start time
 */
export function makeInstanceId(seriesId: string, occurrenceStartMs: number): string {
  return makeOccurrenceKey(seriesId, occurrenceStartMs)
}

/**
 * Describe a recurrence rule in human-readable format
 */
export function describeRecurrence(recurrence: CanonicalRecurrence): string {
  const { rule } = recurrence
  const parts: string[] = []

  // Frequency and interval
  const interval = rule.interval ?? 1
  switch (rule.freq) {
    case 'DAILY':
      parts.push(interval === 1 ? 'Daily' : `Every ${interval} days`)
      break
    case 'WEEKLY':
      parts.push(interval === 1 ? 'Weekly' : `Every ${interval} weeks`)
      if (rule.byWeekday?.length) {
        const days = rule.byWeekday.map(weekdayName).join(', ')
        parts.push(`on ${days}`)
      }
      break
    case 'MONTHLY':
      parts.push(interval === 1 ? 'Monthly' : `Every ${interval} months`)
      if (rule.byMonthDay?.length) {
        const days = rule.byMonthDay.join(', ')
        parts.push(`on day ${days}`)
      }
      break
    case 'YEARLY':
      parts.push(interval === 1 ? 'Yearly' : `Every ${interval} years`)
      break
  }

  // End condition
  if (rule.count) {
    parts.push(`for ${rule.count} times`)
  } else if (rule.untilMs) {
    const until = new Date(rule.untilMs)
    parts.push(`until ${until.toLocaleDateString()}`)
  }

  return parts.join(' ')
}

function weekdayName(day: Weekday): string {
  const names: Record<Weekday, string> = {
    MO: 'Mon',
    TU: 'Tue',
    WE: 'Wed',
    TH: 'Thu',
    FR: 'Fri',
    SA: 'Sat',
    SU: 'Sun'
  }
  return names[day]
}

/**
 * Check if an event has recurrence
 */
export function hasRecurrence(recurrence?: CanonicalRecurrence | null): recurrence is CanonicalRecurrence {
  return recurrence != null && recurrence.rule != null
}




