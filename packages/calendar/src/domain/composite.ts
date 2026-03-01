import { createLogger } from '@lifeos/core'
import type { Provider, CanonicalCalendarEvent } from './models'

const logger = createLogger('Composite')

// ==================== Phase 2.9: Enhanced Composite Schema ====================

/**
 * Heuristic used to detect duplicate events
 */
export type DedupeHeuristic =
  | 'icaluid' // Same iCalUID across accounts (strong)
  | 'providerEventId' // Same provider event ID (rare but deterministic)
  | 'time-title' // Fuzzy match by time and title (conservative)
  | 'manual' // User-linked
  | 'none' // Single event, no duplicate

/**
 * Reason for dedupe decision (more detailed than heuristic)
 */
export type DedupeReason =
  | 'icaluid_match'
  | 'provider_event_id_match'
  | 'fuzzy_time_title'
  | 'manual_link'
  | 'manual_unlink'
  | 'no_match'

/**
 * Member reference in a composite event (Phase 2.9 enhanced)
 */
export interface CompositeMemberRef {
  canonicalEventId: string
  provider: Provider
  accountId: string
  providerCalendarId: string
  providerEventId?: string
  iCalUID?: string
  etag?: string
  status?: 'confirmed' | 'cancelled' | 'tentative' | 'unknown'
  updatedAtMs?: number // canonical updated time
  providerUpdatedAtMs?: number // provider updated time
}

/**
 * Legacy member format (kept for backwards compatibility)
 * @deprecated Use CompositeMemberRef
 */
export interface CompositeMember {
  canonicalEventId: string
  provider: Provider
  accountId: string
  providerCalendarId: string
  providerEventId: string
  iCalUID?: string
  role: 'primary' | 'duplicate'
}

/**
 * A composite event links multiple canonical events representing the same real-world event
 * Stored at: /users/{uid}/compositeEvents/{compositeId}
 */
export interface CompositeEvent {
  id: string // Composite ID (was compositeEventId)
  compositeEventId?: string // Legacy alias
  userId: string

  // Membership
  members: CompositeMemberRef[]
  primaryMemberId: string // canonicalEventId chosen as "display source"

  // Derived display fields (computed from primary)
  startMs: number
  endMs: number
  allDay: boolean
  title?: string
  location?: string
  description?: string

  // Derived identity & dedupe keys
  iCalUID?: string // If all members share same iCalUID
  dedupeKey?: string // Stable hash of best-known identity
  dedupeReason: DedupeReason

  // Legacy fields (for backwards compatibility)
  canonicalEventIds?: string[] // Denormalized for array-contains queries
  heuristic?: DedupeHeuristic // Legacy
  confidence?: number // 0.0 - 1.0
  primaryCanonicalEventId?: string // Legacy alias for primaryMemberId

  // Auditing
  createdAtMs: number
  updatedAtMs: number
  lastComputedAtMs: number
  version: number

  // Safety / human override hooks
  manualLock?: boolean // If true, don't auto-merge/split

  // Legacy timestamp fields
  createdAt?: string
  updatedAt?: string
  createdBy?: 'system' | 'user'
}

/**
 * Candidate match found during deduplication
 */
export interface DuplicateCandidate {
  eventA: CanonicalCalendarEvent
  eventB: CanonicalCalendarEvent
  heuristic: DedupeHeuristic
  confidence: number
  matchReason: string
}

/**
 * Configuration for time-title matching
 */
export interface TimeTitleConfig {
  timeToleranceMs: number // Default: 5 minutes
  titleSimilarityThreshold: number // Default: 0.9 (conservative)
  maxDurationDiffMs: number // Default: 30 minutes (guardrail)
  minTitleLength: number // Default: 4 (avoid "meeting", "call")
}

export const DEFAULT_TIME_TITLE_CONFIG: TimeTitleConfig = {
  timeToleranceMs: 5 * 60 * 1000, // 5 minutes
  titleSimilarityThreshold: 0.9, // 90% similarity required (conservative)
  maxDurationDiffMs: 30 * 60 * 1000, // 30 minutes max duration difference
  minTitleLength: 4, // Minimum title length to consider fuzzy match
}

/**
 * Generic titles that should not be used for fuzzy matching
 */
const GENERIC_TITLES = new Set([
  'meeting',
  'call',
  'sync',
  'chat',
  'catchup',
  'catch up',
  '1:1',
  '1on1',
  'standup',
  'stand up',
  'standup meeting',
  'weekly',
  'daily',
  'monthly',
  'bi-weekly',
  'biweekly',
  'check in',
  'check-in',
  'checkin',
  'touch base',
  'busy',
  'hold',
  'block',
  'blocked',
  'focus',
  'focus time',
])

/**
 * Check if a title is too generic for fuzzy matching
 */
export function isGenericTitle(title?: string): boolean {
  if (!title) return true
  const normalized = normalizeTitle(title)
  if (normalized.length < 4) return true
  return GENERIC_TITLES.has(normalized)
}

/**
 * Composite run log for auditing
 */
export interface CompositeRun {
  runId: string
  userId: string
  rangeStartMs: number
  rangeEndMs: number
  startedAtMs: number
  completedAtMs?: number
  status: 'running' | 'completed' | 'failed'
  stats: {
    eventsProcessed: number
    compositesCreated: number
    compositesUpdated: number
    compositesDeleted: number
    mergesPerformed: number
    errors: number
  }
  error?: string
}

/**
 * Normalize a title for comparison
 * - Lowercase
 * - Remove extra whitespace
 * - Remove common prefixes like "Re:", "Fwd:"
 */
export function normalizeTitle(title?: string): string {
  if (!title) return ''
  return title
    .toLowerCase()
    .replace(/^(re:|fwd:|fw:)\s*/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Simple string similarity using Levenshtein-like approach
 * Returns a value between 0 and 1
 */
export function titleSimilarity(a?: string, b?: string): number {
  const normA = normalizeTitle(a)
  const normB = normalizeTitle(b)

  if (normA === normB) return 1.0
  if (!normA || !normB) return 0.0

  const longer = normA.length > normB.length ? normA : normB
  const shorter = normA.length > normB.length ? normB : normA

  if (longer.length === 0) return 1.0

  // Simple containment check
  if (longer.includes(shorter) || shorter.includes(longer)) {
    return shorter.length / longer.length
  }

  // Word overlap
  const wordsA = new Set(normA.split(' '))
  const wordsB = new Set(normB.split(' '))
  const intersection = [...wordsA].filter((w) => wordsB.has(w))
  const union = new Set([...wordsA, ...wordsB])

  return intersection.length / union.size
}

/**
 * Check if two events are from the exact same calendar source.
 * Events from the same calendar cannot be duplicates of each other
 * (the provider guarantees uniqueness within a single calendar).
 * Events from different calendars within the same account CAN be duplicates
 * (e.g., Siri creating copies, or the same meeting appearing in multiple calendars).
 */
export function isSameSource(a: CanonicalCalendarEvent, b: CanonicalCalendarEvent): boolean {
  return (
    a.providerRef.provider === b.providerRef.provider &&
    a.providerRef.accountId === b.providerRef.accountId &&
    a.providerRef.providerCalendarId === b.providerRef.providerCalendarId
  )
}

/**
 * Check if two events match by iCalUID
 *
 * Guardrail: Even with matching iCalUID, verify reasonable time overlap
 * (iCalUIDs can rarely be reused or collide)
 */
export function matchByICalUID(
  eventA: CanonicalCalendarEvent,
  eventB: CanonicalCalendarEvent
): DuplicateCandidate | null {
  if (!eventA.iCalUID || !eventB.iCalUID) return null
  if (eventA.iCalUID !== eventB.iCalUID) return null

  // Same calendar source — not a duplicate
  if (isSameSource(eventA, eventB)) {
    return null
  }

  // Guardrail: Verify reasonable time overlap (1 day tolerance for recurrence edge cases)
  const timeDiff = Math.abs(eventA.startMs - eventB.startMs)
  const oneDayMs = 24 * 60 * 60 * 1000
  if (timeDiff > oneDayMs) {
    // iCalUID match but times too different - could be recurring instances
    // Log for debugging but don't merge automatically
    logger.warn('iCalUID match with large time diff', {
      iCalUID: eventA.iCalUID,
      timeDiffMs: timeDiff,
    })
    return null
  }

  return {
    eventA,
    eventB,
    heuristic: 'icaluid',
    confidence: 0.95,
    matchReason: `Matching iCalUID: ${eventA.iCalUID}`,
  }
}

/**
 * Check if two events match by provider event ID
 * (Same provider + same providerEventId across accounts or calendars)
 */
export function matchByProviderEventId(
  eventA: CanonicalCalendarEvent,
  eventB: CanonicalCalendarEvent
): DuplicateCandidate | null {
  const providerIdA = eventA.providerRef.providerEventId
  const providerIdB = eventB.providerRef.providerEventId

  if (!providerIdA || !providerIdB) return null
  if (providerIdA !== providerIdB) return null

  // Must be same provider
  if (eventA.providerRef.provider !== eventB.providerRef.provider) return null
  // Same calendar source — not a duplicate
  if (isSameSource(eventA, eventB)) return null

  return {
    eventA,
    eventB,
    heuristic: 'providerEventId',
    confidence: 0.98,
    matchReason: `Matching providerEventId: ${providerIdA}`,
  }
}

/**
 * Check if two events match by time and title (with guardrails)
 *
 * Guardrails to prevent false merges:
 * 1. Don't merge if durations differ drastically (> 30 min)
 * 2. Don't merge if titles are too generic ("meeting", "call")
 * 3. Don't merge cancelled with confirmed (unless iCalUID)
 * 4. Don't merge end times differing by more than tolerance
 */
export function matchByTimeTitle(
  eventA: CanonicalCalendarEvent,
  eventB: CanonicalCalendarEvent,
  config: TimeTitleConfig = DEFAULT_TIME_TITLE_CONFIG
): DuplicateCandidate | null {
  // Same calendar source — not a duplicate
  if (isSameSource(eventA, eventB)) {
    return null
  }

  // Guardrail: Don't merge cancelled with confirmed
  const statusA = eventA.status?.toLowerCase()
  const statusB = eventB.status?.toLowerCase()
  if (
    (statusA === 'cancelled' && statusB === 'confirmed') ||
    (statusA === 'confirmed' && statusB === 'cancelled')
  ) {
    return null
  }

  // Start time check
  const startDiff = Math.abs(eventA.startMs - eventB.startMs)
  if (startDiff > config.timeToleranceMs) return null

  // End time check
  const endDiff = Math.abs(eventA.endMs - eventB.endMs)
  if (endDiff > config.timeToleranceMs) return null

  // Guardrail: Duration difference check
  const durationA = eventA.endMs - eventA.startMs
  const durationB = eventB.endMs - eventB.startMs
  const durationDiff = Math.abs(durationA - durationB)
  if (durationDiff > config.maxDurationDiffMs) return null

  // Guardrail: Don't fuzzy match generic titles
  if (isGenericTitle(eventA.title) || isGenericTitle(eventB.title)) {
    return null
  }

  // Title similarity check (conservative threshold)
  const similarity = titleSimilarity(eventA.title, eventB.title)
  if (similarity < config.titleSimilarityThreshold) return null

  return {
    eventA,
    eventB,
    heuristic: 'time-title',
    confidence: 0.7 * similarity, // Lower base confidence for fuzzy matches
    matchReason: `Start diff: ${startDiff}ms, End diff: ${endDiff}ms, Title similarity: ${(similarity * 100).toFixed(0)}%`,
  }
}

/**
 * Check if two events match by participant overlap and time
 *
 * Useful when titles are generic (e.g. "meeting", "call") but the same
 * set of participants at the same time strongly indicates a duplicate.
 *
 * Guardrails:
 * - Both events must have at least 2 attendees
 * - 80%+ participant overlap required (Jaccard similarity on emails)
 * - Time must match within tolerance
 */
export function matchByParticipantsAndTime(
  eventA: CanonicalCalendarEvent,
  eventB: CanonicalCalendarEvent,
  config: TimeTitleConfig = DEFAULT_TIME_TITLE_CONFIG
): DuplicateCandidate | null {
  if (isSameSource(eventA, eventB)) return null

  // Time check
  if (Math.abs(eventA.startMs - eventB.startMs) > config.timeToleranceMs) return null
  if (Math.abs(eventA.endMs - eventB.endMs) > config.timeToleranceMs) return null

  // Need at least 2 attendees each to make overlap meaningful
  const emailsA = new Set(
    (eventA.attendees ?? []).map((a) => a.email?.toLowerCase()).filter(Boolean) as string[]
  )
  const emailsB = new Set(
    (eventB.attendees ?? []).map((a) => a.email?.toLowerCase()).filter(Boolean) as string[]
  )
  if (emailsA.size < 2 || emailsB.size < 2) return null

  // Calculate Jaccard overlap
  const intersection = [...emailsA].filter((e) => emailsB.has(e))
  const union = new Set([...emailsA, ...emailsB])
  const overlap = intersection.length / union.size

  if (overlap < 0.8) return null // Need 80%+ participant overlap

  return {
    eventA,
    eventB,
    heuristic: 'time-title',
    confidence: 0.85 * overlap,
    matchReason: `Participant overlap: ${(overlap * 100).toFixed(0)}% (${intersection.length}/${union.size} emails), time diff: ${Math.abs(eventA.startMs - eventB.startMs)}ms`,
  }
}

/**
 * Find all duplicate candidates among a set of events
 *
 * Priority order:
 * 1. Provider event ID match (highest confidence)
 * 2. iCalUID match (strong)
 * 3. Participant + time match (medium-high)
 * 4. Fuzzy time-title match (conservative)
 */
export function findDuplicateCandidates(
  events: CanonicalCalendarEvent[],
  config: TimeTitleConfig = DEFAULT_TIME_TITLE_CONFIG
): DuplicateCandidate[] {
  const candidates: DuplicateCandidate[] = []
  const seen = new Set<string>()

  for (let i = 0; i < events.length; i++) {
    for (let j = i + 1; j < events.length; j++) {
      const eventA = events[i]
      const eventB = events[j]
      const pairKey = [eventA.canonicalEventId, eventB.canonicalEventId].sort().join('|')

      if (seen.has(pairKey)) continue
      seen.add(pairKey)

      // Try provider event ID first (highest confidence)
      const providerMatch = matchByProviderEventId(eventA, eventB)
      if (providerMatch) {
        candidates.push(providerMatch)
        continue
      }

      // Try iCalUID second (strong)
      const icalMatch = matchByICalUID(eventA, eventB)
      if (icalMatch) {
        candidates.push(icalMatch)
        continue
      }

      // Try participant overlap (medium-high confidence)
      const participantMatch = matchByParticipantsAndTime(eventA, eventB, config)
      if (participantMatch) {
        candidates.push(participantMatch)
        continue
      }

      // Fall back to fuzzy time-title (conservative)
      const timeTitleMatch = matchByTimeTitle(eventA, eventB, config)
      if (timeTitleMatch) {
        candidates.push(timeTitleMatch)
      }
    }
  }

  return candidates.sort((a, b) => b.confidence - a.confidence)
}

/**
 * Group candidates into composite groups using union-find
 * This handles transitive relationships (A matches B, B matches C → A,B,C are one group)
 */
export function groupCandidatesIntoComposites(
  candidates: DuplicateCandidate[]
): Map<string, CanonicalCalendarEvent[]> {
  const parent = new Map<string, string>()

  function find(x: string): string {
    if (!parent.has(x)) parent.set(x, x)
    if (parent.get(x) !== x) {
      parent.set(x, find(parent.get(x)!))
    }
    return parent.get(x)!
  }

  function union(a: string, b: string) {
    const rootA = find(a)
    const rootB = find(b)
    if (rootA !== rootB) {
      parent.set(rootA, rootB)
    }
  }

  // Build union-find structure
  const allEvents = new Map<string, CanonicalCalendarEvent>()
  for (const candidate of candidates) {
    allEvents.set(candidate.eventA.canonicalEventId, candidate.eventA)
    allEvents.set(candidate.eventB.canonicalEventId, candidate.eventB)
    union(candidate.eventA.canonicalEventId, candidate.eventB.canonicalEventId)
  }

  // Group by root
  const groups = new Map<string, CanonicalCalendarEvent[]>()
  for (const [eventId, event] of allEvents) {
    const root = find(eventId)
    if (!groups.has(root)) {
      groups.set(root, [])
    }
    groups.get(root)!.push(event)
  }

  return groups
}

/**
 * Choose the primary event from a list (for display)
 * Prefers: more data, organizer role, earlier creation
 */
export function choosePrimaryEvent(events: CanonicalCalendarEvent[]): CanonicalCalendarEvent {
  if (events.length === 0) throw new Error('Cannot choose primary from empty list')
  if (events.length === 1) return events[0]

  return events.reduce((best, current) => {
    // Prefer organizer
    if (current.role === 'organizer' && best.role !== 'organizer') return current
    if (best.role === 'organizer' && current.role !== 'organizer') return best

    // Prefer more description
    const descLenCurrent = current.description?.length ?? 0
    const descLenBest = best.description?.length ?? 0
    if (descLenCurrent > descLenBest) return current
    if (descLenBest > descLenCurrent) return best

    // Prefer more attendees
    const attendeesCurrent = current.attendees?.length ?? 0
    const attendeesBest = best.attendees?.length ?? 0
    if (attendeesCurrent > attendeesBest) return current
    if (attendeesBest > attendeesCurrent) return best

    // Prefer earlier creation
    return (current.createdAtMs ?? 0) < (best.createdAtMs ?? 0) ? current : best
  })
}

/**
 * Map heuristic to dedupe reason
 */
function heuristicToReason(heuristic: DedupeHeuristic): DedupeReason {
  switch (heuristic) {
    case 'icaluid':
      return 'icaluid_match'
    case 'providerEventId':
      return 'provider_event_id_match'
    case 'time-title':
      return 'fuzzy_time_title'
    case 'manual':
      return 'manual_link'
    default:
      return 'no_match'
  }
}

/**
 * Create a composite event from matched canonical events
 */
export function createCompositeFromCandidate(
  candidate: DuplicateCandidate,
  compositeId: string,
  userId: string
): CompositeEvent {
  const { eventA, eventB, heuristic, confidence } = candidate

  // Choose primary
  const primary = choosePrimaryEvent([eventA, eventB])
  const events = [eventA, eventB]

  const now = Date.now()

  // Build member refs
  const members: CompositeMemberRef[] = events.map((e) => ({
    canonicalEventId: e.canonicalEventId,
    provider: e.providerRef.provider,
    accountId: e.providerRef.accountId,
    providerCalendarId: e.providerRef.providerCalendarId,
    providerEventId: e.providerRef.providerEventId,
    iCalUID: e.iCalUID,
    etag: e.providerRef.etag,
    status: (e.status as 'confirmed' | 'cancelled' | 'tentative') ?? 'unknown',
    updatedAtMs: e.canonicalUpdatedAtMs ?? e.updatedAtMs,
    providerUpdatedAtMs: e.providerUpdatedAtMs,
  }))

  // Compute shared iCalUID if all members have the same one
  const iCalUIDs = events.map((e) => e.iCalUID).filter(Boolean)
  const sharedICalUID =
    iCalUIDs.length === events.length && new Set(iCalUIDs).size === 1 ? iCalUIDs[0] : undefined

  return {
    id: compositeId,
    compositeEventId: compositeId, // Legacy alias
    userId,

    // Membership
    members,
    primaryMemberId: primary.canonicalEventId,

    // Derived display fields
    startMs: primary.startMs,
    endMs: primary.endMs,
    allDay: primary.allDay ?? false,
    title: primary.title,
    location: primary.location,
    description: primary.description,

    // Identity
    iCalUID: sharedICalUID,
    dedupeKey: sharedICalUID ?? `${primary.startMs}:${normalizeTitle(primary.title)}`,
    dedupeReason: heuristicToReason(heuristic),

    // Legacy
    canonicalEventIds: events.map((e) => e.canonicalEventId),
    heuristic,
    confidence,
    primaryCanonicalEventId: primary.canonicalEventId,

    // Auditing
    createdAtMs: now,
    updatedAtMs: now,
    lastComputedAtMs: now,
    version: 1,

    // Legacy timestamps
    createdAt: new Date(now).toISOString(),
    updatedAt: new Date(now).toISOString(),
    createdBy: 'system',
  }
}

/**
 * Create a composite from a group of events
 */
export function createCompositeFromGroup(
  events: CanonicalCalendarEvent[],
  compositeId: string,
  userId: string,
  heuristic: DedupeHeuristic,
  confidence: number
): CompositeEvent {
  if (events.length < 2) {
    throw new Error('Composite requires at least 2 events')
  }

  const primary = choosePrimaryEvent(events)
  const now = Date.now()

  const members: CompositeMemberRef[] = events.map((e) => ({
    canonicalEventId: e.canonicalEventId,
    provider: e.providerRef.provider,
    accountId: e.providerRef.accountId,
    providerCalendarId: e.providerRef.providerCalendarId,
    providerEventId: e.providerRef.providerEventId,
    iCalUID: e.iCalUID,
    etag: e.providerRef.etag,
    status: (e.status as 'confirmed' | 'cancelled' | 'tentative') ?? 'unknown',
    updatedAtMs: e.canonicalUpdatedAtMs ?? e.updatedAtMs,
    providerUpdatedAtMs: e.providerUpdatedAtMs,
  }))

  const iCalUIDs = events.map((e) => e.iCalUID).filter(Boolean)
  const sharedICalUID =
    iCalUIDs.length === events.length && new Set(iCalUIDs).size === 1 ? iCalUIDs[0] : undefined

  return {
    id: compositeId,
    compositeEventId: compositeId,
    userId,
    members,
    primaryMemberId: primary.canonicalEventId,
    startMs: primary.startMs,
    endMs: primary.endMs,
    allDay: primary.allDay ?? false,
    title: primary.title,
    location: primary.location,
    description: primary.description,
    iCalUID: sharedICalUID,
    dedupeKey: sharedICalUID ?? `${primary.startMs}:${normalizeTitle(primary.title)}`,
    dedupeReason: heuristicToReason(heuristic),
    canonicalEventIds: events.map((e) => e.canonicalEventId),
    heuristic,
    confidence,
    primaryCanonicalEventId: primary.canonicalEventId,
    createdAtMs: now,
    updatedAtMs: now,
    lastComputedAtMs: now,
    version: 1,
    createdAt: new Date(now).toISOString(),
    updatedAt: new Date(now).toISOString(),
    createdBy: 'system',
  }
}

/**
 * Add a new member to an existing composite event
 */
export function addMemberToComposite(
  composite: CompositeEvent,
  event: CanonicalCalendarEvent
): CompositeEvent {
  const existingIds =
    composite.canonicalEventIds ?? composite.members.map((m) => m.canonicalEventId)
  if (existingIds.includes(event.canonicalEventId)) {
    return composite // Already a member
  }

  const newMember: CompositeMemberRef = {
    canonicalEventId: event.canonicalEventId,
    provider: event.providerRef.provider,
    accountId: event.providerRef.accountId,
    providerCalendarId: event.providerRef.providerCalendarId,
    providerEventId: event.providerRef.providerEventId,
    iCalUID: event.iCalUID,
    etag: event.providerRef.etag,
    status: (event.status as 'confirmed' | 'cancelled' | 'tentative') ?? 'unknown',
    updatedAtMs: event.canonicalUpdatedAtMs ?? event.updatedAtMs,
    providerUpdatedAtMs: event.providerUpdatedAtMs,
  }

  const now = Date.now()
  const newMembers = [...composite.members, newMember]
  const newCanonicalIds = [...existingIds, event.canonicalEventId]

  return {
    ...composite,
    members: newMembers,
    canonicalEventIds: newCanonicalIds,
    updatedAtMs: now,
    updatedAt: new Date(now).toISOString(),
    version: (composite.version ?? 0) + 1,
  }
}

/**
 * Remove a member from a composite event
 * Returns null if the composite would have fewer than 2 members (should be deleted)
 */
export function removeMemberFromComposite(
  composite: CompositeEvent,
  canonicalEventId: string
): CompositeEvent | null {
  const filteredMembers = composite.members.filter((m) => m.canonicalEventId !== canonicalEventId)

  if (filteredMembers.length < 2) {
    return null // Composite should be deleted
  }

  const now = Date.now()

  // If we removed the primary, promote another member
  let newPrimaryId = composite.primaryMemberId ?? composite.primaryCanonicalEventId
  if (canonicalEventId === newPrimaryId) {
    newPrimaryId = filteredMembers[0].canonicalEventId
  }

  return {
    ...composite,
    members: filteredMembers,
    canonicalEventIds: filteredMembers.map((m) => m.canonicalEventId),
    primaryMemberId: newPrimaryId,
    primaryCanonicalEventId: newPrimaryId,
    updatedAtMs: now,
    updatedAt: new Date(now).toISOString(),
    version: (composite.version ?? 0) + 1,
  }
}

// ==================== Busy Blocks (Phase 2.9B) ====================

/**
 * A busy block representing a time period when the user is unavailable
 */
export interface BusyBlock {
  startMs: number
  endMs: number
  sourceCompositeId?: string
  sourceCanonicalEventId?: string
  title?: string // Optional: for debugging only
  isAllDay?: boolean
}

/**
 * Get busy blocks from composite events (deduplicated)
 *
 * @param composites - Composite events in the range
 * @param canonicalEvents - Canonical events (for single events not in composites)
 * @returns Deduplicated busy blocks
 */
export function getBusyBlocksFromComposites(
  composites: CompositeEvent[],
  canonicalEvents: CanonicalCalendarEvent[]
): BusyBlock[] {
  const blocks: BusyBlock[] = []
  const processedCanonicalIds = new Set<string>()

  // Add blocks from composites (already deduplicated)
  for (const composite of composites) {
    // Skip if manually locked and cancelled
    if (composite.manualLock) continue

    // Check if any member is busy
    // Note: We use the primary member's details for the block
    blocks.push({
      startMs: composite.startMs,
      endMs: composite.endMs,
      sourceCompositeId: composite.id,
      title: composite.title,
      isAllDay: composite.allDay,
    })

    // Mark all member canonical IDs as processed
    for (const member of composite.members) {
      processedCanonicalIds.add(member.canonicalEventId)
    }
  }

  // Add blocks from canonical events not in any composite
  for (const event of canonicalEvents) {
    if (processedCanonicalIds.has(event.canonicalEventId)) continue

    // Apply busy rules (from Phase 2.4)
    // Skip if declined RSVP
    if (event.selfAttendee?.responseStatus === 'declined') continue
    // Skip if transparent
    if (event.transparency === 'transparent') continue
    // Skip if cancelled
    if (event.status === 'cancelled') continue

    blocks.push({
      startMs: event.startMs,
      endMs: event.endMs,
      sourceCanonicalEventId: event.canonicalEventId,
      title: event.title,
      isAllDay: event.allDay,
    })
  }

  // Sort by start time
  return blocks.sort((a, b) => a.startMs - b.startMs)
}

/**
 * Merge overlapping busy blocks into contiguous ranges
 */
export function mergeOverlappingBlocks(blocks: BusyBlock[]): BusyBlock[] {
  if (blocks.length === 0) return []

  const sorted = [...blocks].sort((a, b) => a.startMs - b.startMs)
  const merged: BusyBlock[] = [sorted[0]]

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i]
    const last = merged[merged.length - 1]

    // Check for overlap or adjacency
    if (current.startMs <= last.endMs) {
      // Extend the last block
      last.endMs = Math.max(last.endMs, current.endMs)
    } else {
      merged.push(current)
    }
  }

  return merged
}
