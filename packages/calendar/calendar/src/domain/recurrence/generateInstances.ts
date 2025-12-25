import { RRule, Weekday as RRuleWeekday } from '../../recurrence/rruleAdapter'
import type {
  CanonicalRecurrence,
  CanonicalRecurrenceRule,
  GenerateInstancesOptions,
  GenerateInstancesResult,
  RecurrenceInstance,
  Weekday
} from './types'
import { describeRecurrence, makeInstanceId } from './types'

type RRuleWeekdayType = InstanceType<typeof RRuleWeekday>

// Map our weekday to rrule weekday
const WEEKDAY_MAP: Record<Weekday, RRuleWeekdayType> = {
  MO: RRule.MO,
  TU: RRule.TU,
  WE: RRule.WE,
  TH: RRule.TH,
  FR: RRule.FR,
  SA: RRule.SA,
  SU: RRule.SU
}

// Map frequency to rrule frequency
const FREQ_MAP = {
  DAILY: RRule.DAILY,
  WEEKLY: RRule.WEEKLY,
  MONTHLY: RRule.MONTHLY,
  YEARLY: RRule.YEARLY
}

/**
 * Master event data needed for instance generation
 */
export interface MasterEventData {
  canonicalEventId: string
  startMs: number
  endMs: number
  allDay?: boolean
  title?: string
  description?: string
  location?: string
  status?: string
  timezone?: string
  recurrence: CanonicalRecurrence
}

/**
 * Convert canonical recurrence rule to rrule options
 */
function toRRuleOptions(rule: CanonicalRecurrenceRule, dtstart: Date): Partial<ConstructorParameters<typeof RRule>[0]> {
  const options: Partial<ConstructorParameters<typeof RRule>[0]> = {
    freq: FREQ_MAP[rule.freq],
    interval: rule.interval ?? 1,
    dtstart,
    wkst: rule.wkst === 'SU' ? RRule.SU : RRule.MO
  }

  if (rule.byWeekday?.length) {
    options.byweekday = rule.byWeekday.map((d) => WEEKDAY_MAP[d])
  }

  if (rule.byMonthDay?.length) {
    options.bymonthday = rule.byMonthDay
  }

  if (rule.byMonth?.length) {
    options.bymonth = rule.byMonth
  }

  if (rule.bySetPos?.length) {
    options.bysetpos = rule.bySetPos
  }

  if (rule.count != null) {
    options.count = rule.count
  }

  if (rule.untilMs != null) {
    options.until = new Date(rule.untilMs)
  }

  return options
}

/**
 * Generate instances of a recurring event within a time range
 *
 * This is the core recurrence engine that:
 * 1. Uses rrule library to calculate occurrence dates
 * 2. Applies exdates (exclusions)
 * 3. Applies overrides (modifications)
 * 4. Respects splits (this and future)
 * 5. Returns render-ready instances
 */
export function generateInstances(
  master: MasterEventData,
  options: GenerateInstancesOptions
): GenerateInstancesResult {
  const { startMs, endMs, maxInstances = 500, includeExcluded = false } = options
  const { recurrence, canonicalEventId: seriesId } = master

  // Calculate duration for instances
  const durationMs = master.endMs - master.startMs

  // Handle split: if this series was split, only generate up to the split point
  let effectiveUntilMs = recurrence.rule.untilMs
  if (recurrence.split?.splitAtMs && !recurrence.split.childSeriesId) {
    // This is the child series (after split), start from split point
    // Already handled by master.startMs being the split point
  } else if (recurrence.split?.splitAtMs && recurrence.split.childSeriesId) {
    // This is the parent series, end at split point
    effectiveUntilMs = effectiveUntilMs
      ? Math.min(effectiveUntilMs, recurrence.split.splitAtMs - 1)
      : recurrence.split.splitAtMs - 1
  }

  // Create modified rule with effective until
  const modifiedRule: CanonicalRecurrenceRule = {
    ...recurrence.rule,
    untilMs: effectiveUntilMs
  }

  // Create rrule instance
  const dtstart = new Date(master.startMs)
  const rruleOptions = toRRuleOptions(modifiedRule, dtstart)
  const rrule = new RRule(rruleOptions as ConstructorParameters<typeof RRule>[0])

  // Get occurrences in range
  // Add buffer to handle timezone edge cases
  const queryStart = new Date(startMs)
  const queryEnd = new Date(endMs)
  const occurrences = rrule.between(queryStart, queryEnd, true)

  // Build exdates set for fast lookup
  const exdatesSet = new Set(recurrence.exdatesMs ?? [])

  // Get overrides map
  const overrides = recurrence.overrides ?? {}

  // Generate instances
  const instances: RecurrenceInstance[] = []
  let truncated = false

  for (const occurrence of occurrences) {
    if (instances.length >= maxInstances) {
      truncated = true
      break
    }

    const occurrenceStartMs = occurrence.getTime()
    const occurrenceEndMs = occurrenceStartMs + durationMs
    const occurrenceKey = `${occurrenceStartMs}`
    const instanceId = makeInstanceId(seriesId, occurrenceStartMs)

    // Check if excluded
    const isExcluded = exdatesSet.has(occurrenceStartMs)
    if (isExcluded && !includeExcluded) {
      continue
    }

    // Check for override
    const override = overrides[occurrenceKey]
    const isOverride = override != null

    // Build instance
    const instance: RecurrenceInstance = {
      instanceId,
      seriesId,
      occurrenceKey,
      startMs: override?.startMs ?? occurrenceStartMs,
      endMs: override?.endMs ?? occurrenceEndMs,
      allDay: override?.allDay ?? master.allDay ?? false,
      title: override?.title ?? master.title,
      description: override?.description ?? master.description,
      location: override?.location ?? master.location,
      status: override?.status ?? master.status,
      timezone: master.timezone,
      isOverride,
      isCancelled: isExcluded || override?.status === 'cancelled',
      isGenerated: true,
      isMaster: false,
      providerInstanceId: override?.providerInstanceId,
      providerEtag: override?.providerEtag,
      recurrenceDescription: describeRecurrence(recurrence)
    }

    instances.push(instance)
  }

  // Sort by start time
  instances.sort((a, b) => a.startMs - b.startMs)

  return {
    instances,
    truncated,
    totalCount: truncated ? undefined : instances.length
  }
}

/**
 * Generate a single instance for a specific occurrence
 */
export function generateSingleInstance(
  master: MasterEventData,
  occurrenceStartMs: number
): RecurrenceInstance | null {
  const { recurrence, canonicalEventId: seriesId } = master
  const durationMs = master.endMs - master.startMs

  // Check if this occurrence is excluded
  const exdatesSet = new Set(recurrence.exdatesMs ?? [])
  if (exdatesSet.has(occurrenceStartMs)) {
    return null
  }

  const occurrenceKey = `${occurrenceStartMs}`
  const instanceId = makeInstanceId(seriesId, occurrenceStartMs)
  const override = recurrence.overrides?.[occurrenceKey]

  return {
    instanceId,
    seriesId,
    occurrenceKey,
    startMs: override?.startMs ?? occurrenceStartMs,
    endMs: override?.endMs ?? (occurrenceStartMs + durationMs),
    allDay: override?.allDay ?? master.allDay ?? false,
    title: override?.title ?? master.title,
    description: override?.description ?? master.description,
    location: override?.location ?? master.location,
    status: override?.status ?? master.status,
    timezone: master.timezone,
    isOverride: override != null,
    isCancelled: override?.status === 'cancelled',
    isGenerated: true,
    isMaster: false,
    providerInstanceId: override?.providerInstanceId,
    providerEtag: override?.providerEtag,
    recurrenceDescription: describeRecurrence(recurrence)
  }
}

/**
 * Check if a given time falls on a valid occurrence of the recurrence
 */
export function isValidOccurrence(
  recurrence: CanonicalRecurrence,
  masterStartMs: number,
  candidateMs: number
): boolean {
  const dtstart = new Date(masterStartMs)
  const rruleOptions = toRRuleOptions(recurrence.rule, dtstart)
  const rrule = new RRule(rruleOptions as ConstructorParameters<typeof RRule>[0])

  // Check if this exact time is a valid occurrence
  // Allow small tolerance for floating point issues
  const before = new Date(candidateMs - 1000)
  const after = new Date(candidateMs + 1000)

  const occurrences = rrule.between(before, after, true)
  return occurrences.some((occ: Date) => Math.abs(occ.getTime() - candidateMs) < 1000)
}

/**
 * Get the next occurrence after a given time
 */
export function getNextOccurrence(
  recurrence: CanonicalRecurrence,
  masterStartMs: number,
  afterMs: number
): number | null {
  const dtstart = new Date(masterStartMs)
  const rruleOptions = toRRuleOptions(recurrence.rule, dtstart)
  const rrule = new RRule(rruleOptions as ConstructorParameters<typeof RRule>[0])

  const after = new Date(afterMs)
  const next = rrule.after(after, false)

  return next ? next.getTime() : null
}

/**
 * Get the previous occurrence before a given time
 */
export function getPreviousOccurrence(
  recurrence: CanonicalRecurrence,
  masterStartMs: number,
  beforeMs: number
): number | null {
  const dtstart = new Date(masterStartMs)
  const rruleOptions = toRRuleOptions(recurrence.rule, dtstart)
  const rrule = new RRule(rruleOptions as ConstructorParameters<typeof RRule>[0])

  const before = new Date(beforeMs)
  const prev = rrule.before(before, false)

  return prev ? prev.getTime() : null
}

/**
 * Count total occurrences (up to a limit)
 */
export function countOccurrences(
  recurrence: CanonicalRecurrence,
  masterStartMs: number,
  limit = 1000
): number {
  const dtstart = new Date(masterStartMs)
  const rruleOptions = toRRuleOptions(recurrence.rule, dtstart)
  const rrule = new RRule(rruleOptions as ConstructorParameters<typeof RRule>[0])

  const all = rrule.all((_: Date, i: number) => i < limit)
  return all.length
}
