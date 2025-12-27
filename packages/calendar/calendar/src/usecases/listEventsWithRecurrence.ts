import type { CanonicalCalendarEvent } from '../domain/models'
import { isDeleted, isRecurringSeries } from '../domain/models'
import type { MasterEventData } from '../domain/recurrence/generateInstances'
import { generateInstances } from '../domain/recurrence/generateInstances'
import type { GenerateInstancesOptions, RecurrenceInstance } from '../domain/recurrence/types'
import type { CalendarEventRepository } from '../ports/calendarRepository'

export interface ListEventsWithRecurrenceInput {
  userId: string
  startMs: number
  endMs: number
  maxInstances?: number
}

export interface ListEventsWithRecurrenceDeps {
  repository: CalendarEventRepository
}

/**
 * A unified event item that can be either a canonical event or a generated instance
 */
export interface UnifiedEventItem {
  // Common fields
  id: string // canonicalEventId or instanceId
  startMs: number
  endMs: number
  allDay: boolean
  title?: string
  description?: string
  location?: string
  status?: string
  timezone?: string

  // Type discriminator
  type: 'single' | 'series_master' | 'instance' | 'provider_instance'

  // For instances
  seriesId?: string
  occurrenceKey?: string
  isOverride?: boolean
  isCancelled?: boolean

  // For series masters
  recurrenceDescription?: string

  // Source event reference
  sourceEvent?: CanonicalCalendarEvent
  sourceInstance?: RecurrenceInstance

  // Sync state
  syncState?: string
  providerInstanceId?: string
}

/**
 * Convert a canonical event to a unified event item
 */
function canonicalToUnified(event: CanonicalCalendarEvent): UnifiedEventItem {
  const isSeries = isRecurringSeries(event)
  const isProviderInstance = Boolean(
    event.isRecurrenceInstance || event.recurrence?.recurringEventId
  )

  return {
    id: event.canonicalEventId,
    startMs: event.startMs,
    endMs: event.endMs,
    allDay: event.allDay ?? false,
    title: event.title,
    description: event.description,
    location: event.location,
    status: event.status,
    timezone: event.timezone,
    type: isSeries ? 'series_master' : isProviderInstance ? 'provider_instance' : 'single',
    seriesId: event.seriesId,
    syncState: event.syncState,
    sourceEvent: event,
  }
}

/**
 * Convert a recurrence instance to a unified event item
 */
function instanceToUnified(
  instance: RecurrenceInstance,
  masterEvent: CanonicalCalendarEvent
): UnifiedEventItem {
  return {
    id: instance.instanceId,
    startMs: instance.startMs,
    endMs: instance.endMs,
    allDay: instance.allDay,
    title: instance.title,
    description: instance.description,
    location: instance.location,
    status: instance.status,
    timezone: instance.timezone,
    type: 'instance',
    seriesId: instance.seriesId,
    occurrenceKey: instance.occurrenceKey,
    isOverride: instance.isOverride,
    isCancelled: instance.isCancelled,
    recurrenceDescription: instance.recurrenceDescription,
    syncState: masterEvent.syncState,
    providerInstanceId: instance.providerInstanceId,
    sourceInstance: instance,
    sourceEvent: masterEvent,
  }
}

/**
 * Convert a canonical event to master event data for instance generation
 */
function toMasterEventData(event: CanonicalCalendarEvent): MasterEventData | null {
  if (!event.recurrenceV2?.rule) {
    return null
  }

  return {
    canonicalEventId: event.canonicalEventId,
    startMs: event.startMs,
    endMs: event.endMs,
    allDay: event.allDay,
    title: event.title,
    description: event.description,
    location: event.location,
    status: event.status,
    timezone: event.timezone,
    recurrence: event.recurrenceV2,
  }
}

/**
 * List events with recurrence expansion
 *
 * This is the main usecase for fetching events to display in the UI.
 * It:
 * 1. Fetches single events in the range
 * 2. Fetches recurring series masters that may have instances in the range
 * 3. Generates instances for each recurring series
 * 4. Merges and deduplicates results
 * 5. Returns a unified list sorted by start time
 */
export async function listEventsWithRecurrence(
  deps: ListEventsWithRecurrenceDeps,
  input: ListEventsWithRecurrenceInput
): Promise<UnifiedEventItem[]> {
  const { userId, startMs, endMs, maxInstances = 500 } = input

  // Fetch all events that might be relevant
  const events = await deps.repository.listByRange(userId, startMs, endMs)

  // Separate single events, series masters, and provider instances
  const singleEvents: CanonicalCalendarEvent[] = []
  const seriesMasters: CanonicalCalendarEvent[] = []
  const providerInstances: CanonicalCalendarEvent[] = []
  const instanceSeriesIds = new Set<string>()

  for (const event of events) {
    if (isDeleted(event)) continue

    if (isRecurringSeries(event)) {
      seriesMasters.push(event)
    } else if (event.isRecurrenceInstance || event.recurrence?.recurringEventId) {
      providerInstances.push(event)
      // Track which series we have provider instances for
      const seriesId = event.seriesId ?? event.recurrence?.recurringEventId
      if (seriesId) {
        instanceSeriesIds.add(seriesId)
      }
    } else {
      singleEvents.push(event)
    }
  }

  // Also fetch series masters that might have instances in the range
  // but whose startMs is before our range
  // This is a broader query to catch recurring events that started in the past
  const pastMasters = await fetchPotentialSeriesMasters(deps, userId, startMs, endMs)
  for (const master of pastMasters) {
    if (!seriesMasters.find((m) => m.canonicalEventId === master.canonicalEventId)) {
      seriesMasters.push(master)
    }
  }

  // Build results
  const results: UnifiedEventItem[] = []

  // Add single events
  for (const event of singleEvents) {
    results.push(canonicalToUnified(event))
  }

  // Generate instances for each series master
  const generatedInstanceIds = new Set<string>()
  for (const master of seriesMasters) {
    const masterData = toMasterEventData(master)
    if (!masterData) continue

    const options: GenerateInstancesOptions = {
      startMs,
      endMs,
      maxInstances: Math.min(maxInstances, 100), // Cap per series
    }

    const { instances } = generateInstances(masterData, options)

    for (const instance of instances) {
      // Skip cancelled instances unless they have an override
      if (instance.isCancelled && !instance.isOverride) continue

      results.push(instanceToUnified(instance, master))
      generatedInstanceIds.add(instance.instanceId)
    }
  }

  // Add provider instances that we didn't generate
  // (these are exceptions that came from the provider)
  for (const event of providerInstances) {
    // Check if we already generated this instance
    const seriesId = event.seriesId ?? event.recurrence?.recurringEventId
    if (seriesId && event.originalStartTimeMs) {
      const instanceId = `${seriesId}:${event.originalStartTimeMs}`
      if (generatedInstanceIds.has(instanceId)) {
        // We generated this, skip the provider instance
        continue
      }
    }

    // Add the provider instance
    results.push(canonicalToUnified(event))
  }

  // Sort by start time
  results.sort((a, b) => a.startMs - b.startMs)

  return results
}

/**
 * Fetch series masters that might have instances in the range
 * This looks back further to catch recurring events that started in the past
 */
async function fetchPotentialSeriesMasters(
  deps: ListEventsWithRecurrenceDeps,
  userId: string,
  rangeStartMs: number,
  _rangeEndMs: number
): Promise<CanonicalCalendarEvent[]> {
  // Look back up to 1 year for recurring events
  const lookbackMs = 365 * 24 * 60 * 60 * 1000
  const searchStartMs = rangeStartMs - lookbackMs

  // This is a broader search - in production you might want to:
  // 1. Have an index on isRecurringSeries
  // 2. Use a separate collection for series masters
  // 3. Cache recent series masters
  const events = await deps.repository.listByRange(userId, searchStartMs, rangeStartMs)

  return events.filter((event) => isRecurringSeries(event) && !isDeleted(event))
}

/**
 * Get a specific instance of a recurring series
 */
export async function getRecurrenceInstance(
  deps: ListEventsWithRecurrenceDeps,
  userId: string,
  seriesId: string,
  occurrenceStartMs: number
): Promise<UnifiedEventItem | null> {
  const master = await deps.repository.getById(userId, seriesId)
  if (!master || isDeleted(master) || !isRecurringSeries(master)) {
    return null
  }

  const masterData = toMasterEventData(master)
  if (!masterData) {
    return null
  }

  // Generate just this instance
  const { instances } = generateInstances(masterData, {
    startMs: occurrenceStartMs - 1000,
    endMs: occurrenceStartMs + 1000,
    maxInstances: 1,
  })

  const instance = instances.find((i) => Math.abs(i.startMs - occurrenceStartMs) < 1000)

  if (!instance) {
    return null
  }

  return instanceToUnified(instance, master)
}

/**
 * Get all instances of a recurring series in a range
 */
export async function getSeriesInstances(
  deps: ListEventsWithRecurrenceDeps,
  userId: string,
  seriesId: string,
  startMs: number,
  endMs: number
): Promise<UnifiedEventItem[]> {
  const master = await deps.repository.getById(userId, seriesId)
  if (!master || isDeleted(master) || !isRecurringSeries(master)) {
    return []
  }

  const masterData = toMasterEventData(master)
  if (!masterData) {
    return []
  }

  const { instances } = generateInstances(masterData, {
    startMs,
    endMs,
    maxInstances: 500,
  })

  return instances.filter((i) => !i.isCancelled).map((i) => instanceToUnified(i, master))
}
