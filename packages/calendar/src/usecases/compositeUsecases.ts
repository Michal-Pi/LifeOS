import { generateId } from '@lifeos/core'
import type { CompositeEvent, DuplicateCandidate, TimeTitleConfig } from '../domain/composite'
import {
  findDuplicateCandidates,
  createCompositeFromCandidate,
  addMemberToComposite,
  removeMemberFromComposite,
  DEFAULT_TIME_TITLE_CONFIG,
} from '../domain/composite'
import type { CanonicalCalendarEvent } from '../domain/models'
import type { CalendarEventRepository } from '../ports/calendarRepository'
import type { CompositeEventRepository } from '../ports/compositeRepository'

export interface CompositeUsecaseDeps {
  compositeRepository: CompositeEventRepository
  eventRepository: CalendarEventRepository
}

export interface DetectDuplicatesInput {
  userId: string
  dayKeys: string[]
  config?: TimeTitleConfig
}

export interface DetectDuplicatesResult {
  candidates: DuplicateCandidate[]
  newComposites: CompositeEvent[]
  updatedComposites: CompositeEvent[]
}

/**
 * Detect duplicates among events in a date range and create/update composites
 */
export async function detectAndLinkDuplicates(
  deps: CompositeUsecaseDeps,
  input: DetectDuplicatesInput
): Promise<DetectDuplicatesResult> {
  const { userId, dayKeys, config = DEFAULT_TIME_TITLE_CONFIG } = input

  // Fetch events for the given days
  const events = await deps.eventRepository.listByOccursOn(userId, dayKeys)

  // Find duplicate candidates
  const candidates = findDuplicateCandidates(events, config)

  const newComposites: CompositeEvent[] = []
  const updatedComposites: CompositeEvent[] = []
  const processedEventIds = new Set<string>()

  // Batch lookup all event IDs involved in candidates to avoid N+1 queries
  const allEventIds = new Set<string>()
  for (const candidate of candidates) {
    allEventIds.add(candidate.eventA.canonicalEventId)
    allEventIds.add(candidate.eventB.canonicalEventId)
  }
  const compositeMap = await deps.compositeRepository.findByCanonicalEventIds(
    userId,
    Array.from(allEventIds)
  )

  for (const candidate of candidates) {
    const { eventA, eventB } = candidate

    // Skip if either event already processed
    if (
      processedEventIds.has(eventA.canonicalEventId) ||
      processedEventIds.has(eventB.canonicalEventId)
    ) {
      continue
    }

    // Check if either event is already in a composite
    const existingA = compositeMap.get(eventA.canonicalEventId) ?? []
    const existingB = compositeMap.get(eventB.canonicalEventId) ?? []

    if (existingA.length > 0 && existingB.length > 0) {
      // Both already in composites - skip (could merge in future)
      processedEventIds.add(eventA.canonicalEventId)
      processedEventIds.add(eventB.canonicalEventId)
      continue
    }

    if (existingA.length > 0) {
      // Add eventB to eventA's composite
      const composite = existingA[0]
      const updated = addMemberToComposite(composite, eventB)
      await deps.compositeRepository.update(
        userId,
        composite.id ?? composite.compositeEventId ?? '',
        updated
      )
      updatedComposites.push(updated)
    } else if (existingB.length > 0) {
      // Add eventA to eventB's composite
      const composite = existingB[0]
      const updated = addMemberToComposite(composite, eventA)
      await deps.compositeRepository.update(
        userId,
        composite.id ?? composite.compositeEventId ?? '',
        updated
      )
      updatedComposites.push(updated)
    } else {
      // Create new composite
      const compositeId = generateId()
      const newComposite = createCompositeFromCandidate(candidate, compositeId, userId)
      await deps.compositeRepository.create(userId, newComposite)
      newComposites.push(newComposite)
    }

    processedEventIds.add(eventA.canonicalEventId)
    processedEventIds.add(eventB.canonicalEventId)
  }

  return {
    candidates,
    newComposites,
    updatedComposites,
  }
}

export interface LinkEventsInput {
  userId: string
  canonicalEventIds: string[]
}

/**
 * Manually link events into a composite
 */
export async function linkEventsManually(
  deps: CompositeUsecaseDeps,
  input: LinkEventsInput
): Promise<CompositeEvent> {
  const { userId, canonicalEventIds } = input

  if (canonicalEventIds.length < 2) {
    throw new Error('At least 2 events are required to create a composite')
  }

  // Check if any events are already in a composite - use batch lookup
  const compositeMap = await deps.compositeRepository.findByCanonicalEventIds(
    userId,
    canonicalEventIds
  )
  for (const eventId of canonicalEventIds) {
    const existing = compositeMap.get(eventId) ?? []
    if (existing.length > 0) {
      throw new Error(`Event ${eventId} is already in a composite`)
    }
  }

  // Fetch the events
  const events: CanonicalCalendarEvent[] = []
  for (const eventId of canonicalEventIds) {
    const event = await deps.eventRepository.getById(userId, eventId)
    if (!event) {
      throw new Error(`Event ${eventId} not found`)
    }
    events.push(event)
  }

  // Create the composite using the helper
  const compositeId = generateId()
  const { createCompositeFromGroup } = await import('../domain/composite')
  const composite = createCompositeFromGroup(events, compositeId, userId, 'manual', 1.0)
  composite.manualLock = true // User-created, don't auto-split

  await deps.compositeRepository.create(userId, composite)
  return composite
}

export interface UnlinkEventInput {
  userId: string
  compositeEventId: string
  canonicalEventId: string
}

/**
 * Unlink an event from a composite
 */
export async function unlinkEvent(
  deps: CompositeUsecaseDeps,
  input: UnlinkEventInput
): Promise<CompositeEvent | null> {
  const { userId, compositeEventId, canonicalEventId } = input

  const composite = await deps.compositeRepository.getById(userId, compositeEventId)
  if (!composite) {
    throw new Error(`Composite ${compositeEventId} not found`)
  }

  const updated = removeMemberFromComposite(composite, canonicalEventId)

  if (!updated) {
    // Composite would have fewer than 2 members, delete it
    await deps.compositeRepository.delete(userId, compositeEventId)
    return null
  }

  await deps.compositeRepository.update(userId, compositeEventId, updated)
  return updated
}

export interface GetCompositeForEventInput {
  userId: string
  canonicalEventId: string
}

/**
 * Get the composite event containing a specific canonical event
 */
export async function getCompositeForEvent(
  deps: CompositeUsecaseDeps,
  input: GetCompositeForEventInput
): Promise<CompositeEvent | null> {
  const { userId, canonicalEventId } = input
  const composites = await deps.compositeRepository.findByCanonicalEventId(userId, canonicalEventId)
  return composites[0] ?? null
}

export interface ProcessSyncResultInput {
  userId: string
  upsertedEvents: CanonicalCalendarEvent[]
  config?: TimeTitleConfig
}

export interface ProcessSyncResultOutput {
  compositeCreated: number
  compositeUpdated: number
  duplicatesDetected: number
}

/**
 * Process events after a sync run to detect and create composites
 * This is called at the end of a sync to handle deduplication
 */
export async function processSyncForComposites(
  deps: CompositeUsecaseDeps,
  input: ProcessSyncResultInput
): Promise<ProcessSyncResultOutput> {
  const { userId, upsertedEvents, config = DEFAULT_TIME_TITLE_CONFIG } = input

  if (upsertedEvents.length === 0) {
    return { compositeCreated: 0, compositeUpdated: 0, duplicatesDetected: 0 }
  }

  // Get the day keys for the upserted events
  const dayKeys = new Set<string>()
  for (const event of upsertedEvents) {
    for (const day of event.occursOn) {
      dayKeys.add(day)
    }
  }

  // Detect duplicates among all events in those days
  const result = await detectAndLinkDuplicates(deps, {
    userId,
    dayKeys: Array.from(dayKeys),
    config,
  })

  return {
    compositeCreated: result.newComposites.length,
    compositeUpdated: result.updatedComposites.length,
    duplicatesDetected: result.candidates.length,
  }
}
