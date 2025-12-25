import type { BusyBlock } from '../domain/composite'
import {
  getBusyBlocksFromComposites,
  mergeOverlappingBlocks
} from '../domain/composite'
import type { CanonicalCalendarEvent } from '../domain/models'
import type { CalendarEventRepository } from '../ports/calendarRepository'
import type { CompositeEventRepository } from '../ports/compositeRepository'

export interface BusyBlocksDeps {
  eventRepository: CalendarEventRepository
  compositeRepository: CompositeEventRepository
}

export interface GetBusyBlocksInput {
  userId: string
  startMs: number
  endMs: number
  useComposites?: boolean  // Default: true if composites enabled
  mergeOverlapping?: boolean  // Default: true
}

export interface GetBusyBlocksResult {
  blocks: BusyBlock[]
  sourceMode: 'canonical' | 'composite' | 'mixed'
  eventsProcessed: number
  compositesProcessed: number
}

/**
 * Get busy blocks for a user in a time range
 * 
 * When unified view is enabled (useComposites: true), this uses composites
 * to avoid double-counting duplicates.
 * 
 * Busy rules (from Phase 2.4):
 * - Declined RSVP → not busy
 * - Transparency = transparent → not busy
 * - Cancelled events → not busy
 */
export async function getBusyBlocksUnified(
  deps: BusyBlocksDeps,
  input: GetBusyBlocksInput
): Promise<GetBusyBlocksResult> {
  const {
    userId,
    startMs,
    endMs,
    useComposites = true,
    mergeOverlapping = true
  } = input

  let blocks: BusyBlock[] = []
  let sourceMode: 'canonical' | 'composite' | 'mixed' = 'canonical'
  let compositesProcessed = 0

  // Fetch canonical events in range
  const canonicalEvents = await deps.eventRepository.listByRange(userId, startMs, endMs) ?? []

  // Filter to only busy events
  const busyCanonicalEvents = canonicalEvents.filter((event) => isEventBusy(event))

  if (useComposites) {
    // Fetch composites in range
    const composites = await deps.compositeRepository.listByRange(userId, startMs, endMs)
    compositesProcessed = composites.length

    if (composites.length > 0) {
      sourceMode = 'composite'
      // Use composite-aware deduplication
      blocks = getBusyBlocksFromComposites(composites, busyCanonicalEvents)
    } else {
      // No composites, fall back to canonical
      sourceMode = 'mixed'
      blocks = canonicalToBusyBlocks(busyCanonicalEvents)
    }
  } else {
    // Canonical only
    blocks = canonicalToBusyBlocks(busyCanonicalEvents)
  }

  // Optionally merge overlapping blocks
  if (mergeOverlapping) {
    blocks = mergeOverlappingBlocks(blocks)
  }

  return {
    blocks,
    sourceMode,
    eventsProcessed: canonicalEvents.length,
    compositesProcessed
  }
}

/**
 * Check if an event is "busy" (blocks time)
 */
function isEventBusy(event: CanonicalCalendarEvent): boolean {
  // Skip declined RSVP
  if (event.selfAttendee?.responseStatus === 'declined') {
    return false
  }

  // Skip transparent events
  if (event.transparency === 'transparent') {
    return false
  }

  // Skip cancelled events
  if (event.status === 'cancelled') {
    return false
  }

  // Skip deleted events
  if (event.deletedAtMs) {
    return false
  }

  return true
}

/**
 * Convert canonical events to busy blocks
 */
function canonicalToBusyBlocks(events: CanonicalCalendarEvent[]): BusyBlock[] {
  return events.map((event) => ({
    startMs: event.startMs,
    endMs: event.endMs,
    sourceCanonicalEventId: event.canonicalEventId,
    title: event.title,
    isAllDay: event.allDay
  }))
}

/**
 * Check if a time range has any conflicts with busy blocks
 */
export function hasConflict(
  proposedStart: number,
  proposedEnd: number,
  busyBlocks: BusyBlock[]
): boolean {
  return busyBlocks.some((block) => {
    // Check for overlap
    return proposedStart < block.endMs && proposedEnd > block.startMs
  })
}

/**
 * Get all conflicting blocks for a proposed time range
 */
export function getConflictingBlocks(
  proposedStart: number,
  proposedEnd: number,
  busyBlocks: BusyBlock[]
): BusyBlock[] {
  return busyBlocks.filter((block) => {
    return proposedStart < block.endMs && proposedEnd > block.startMs
  })
}

/**
 * Find available time slots within a range
 * Useful for scheduling suggestions
 */
export function findAvailableSlots(
  rangeStart: number,
  rangeEnd: number,
  busyBlocks: BusyBlock[],
  minDurationMs: number = 30 * 60 * 1000 // Default 30 minutes
): Array<{ startMs: number; endMs: number }> {
  const slots: Array<{ startMs: number; endMs: number }> = []
  const sorted = [...busyBlocks].sort((a, b) => a.startMs - b.startMs)

  let currentStart = rangeStart

  for (const block of sorted) {
    // Skip blocks outside our range
    if (block.endMs <= rangeStart) continue
    if (block.startMs >= rangeEnd) break

    // If there's a gap before this block, add it as available
    if (block.startMs > currentStart) {
      const gapEnd = Math.min(block.startMs, rangeEnd)
      const gapDuration = gapEnd - currentStart
      if (gapDuration >= minDurationMs) {
        slots.push({ startMs: currentStart, endMs: gapEnd })
      }
    }

    // Move past this block
    currentStart = Math.max(currentStart, block.endMs)
  }

  // Check for remaining time after all blocks
  if (currentStart < rangeEnd) {
    const remaining = rangeEnd - currentStart
    if (remaining >= minDurationMs) {
      slots.push({ startMs: currentStart, endMs: rangeEnd })
    }
  }

  return slots
}

