import { type DocumentData } from 'firebase-admin/firestore'
import { firestore as db } from '../lib/firebase.js'

// ==================== Types ====================

interface CompositeMemberRef {
  canonicalEventId: string
  provider: string
  accountId: string
  providerCalendarId: string
  providerEventId?: string
  iCalUID?: string
  status?: string
  updatedAtMs?: number
}

interface CompositeEvent {
  id: string
  userId: string
  members: CompositeMemberRef[]
  primaryMemberId: string
  startMs: number
  endMs: number
  allDay: boolean
  title?: string
  location?: string
  description?: string
  iCalUID?: string
  dedupeKey?: string
  dedupeReason: string
  canonicalEventIds: string[]
  createdAtMs: number
  updatedAtMs: number
  lastComputedAtMs: number
  version: number
  manualLock?: boolean
}

interface CompositeRun {
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

interface CanonicalEvent {
  canonicalEventId: string
  iCalUID?: string
  startMs: number
  endMs: number
  allDay?: boolean
  title?: string
  location?: string
  description?: string
  status?: string
  providerRef: {
    provider: string
    accountId: string
    providerCalendarId: string
    providerEventId: string
  }
  deletedAtMs?: number
  canonicalUpdatedAtMs?: number
  updatedAtMs?: number
  role?: string
  attendees?: Array<{ email?: string; responseStatus?: string }>
}

export interface CompositeRecomputeResult {
  runId: string
  eventsProcessed: number
  compositesCreated: number
  compositesUpdated: number
  compositesDeleted: number
  mergesPerformed: number
  errors: number
  durationMs: number
}

// ==================== Dedupe Heuristics ====================

const GENERIC_TITLES = new Set([
  'meeting', 'call', 'sync', 'chat', 'catchup', 'catch up',
  '1:1', '1on1', 'standup', 'stand up',
  'weekly', 'daily', 'monthly', 'bi-weekly',
  'check in', 'check-in', 'checkin', 'touch base',
  'busy', 'hold', 'block', 'blocked', 'focus', 'focus time'
])

function normalizeTitle(title?: string): string {
  if (!title) return ''
  return title
    .toLowerCase()
    .replace(/^(re:|fwd:|fw:)\s*/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function isGenericTitle(title?: string): boolean {
  if (!title) return true
  const normalized = normalizeTitle(title)
  if (normalized.length < 4) return true
  return GENERIC_TITLES.has(normalized)
}

function titleSimilarity(a?: string, b?: string): number {
  const normA = normalizeTitle(a)
  const normB = normalizeTitle(b)
  if (normA === normB) return 1.0
  if (!normA || !normB) return 0.0
  const longer = normA.length > normB.length ? normA : normB
  const shorter = normA.length > normB.length ? normB : normA
  if (longer.includes(shorter) || shorter.includes(longer)) {
    return shorter.length / longer.length
  }
  const wordsA = new Set(normA.split(' '))
  const wordsB = new Set(normB.split(' '))
  const intersection = [...wordsA].filter((w) => wordsB.has(w))
  const union = new Set([...wordsA, ...wordsB])
  return intersection.length / union.size
}

interface DuplicateMatch {
  eventA: CanonicalEvent
  eventB: CanonicalEvent
  reason: 'icaluid' | 'providerEventId' | 'fuzzy'
  confidence: number
}

function findDuplicates(events: CanonicalEvent[]): DuplicateMatch[] {
  const matches: DuplicateMatch[] = []
  const seen = new Set<string>()

  for (let i = 0; i < events.length; i++) {
    for (let j = i + 1; j < events.length; j++) {
      const a = events[i]
      const b = events[j]
      const pairKey = [a.canonicalEventId, b.canonicalEventId].sort().join('|')
      if (seen.has(pairKey)) continue
      seen.add(pairKey)

      // Skip same account
      if (
        a.providerRef.accountId === b.providerRef.accountId &&
        a.providerRef.provider === b.providerRef.provider
      ) {
        continue
      }

      // Skip deleted events
      if (a.deletedAtMs || b.deletedAtMs) continue

      // iCalUID match (strong)
      if (a.iCalUID && b.iCalUID && a.iCalUID === b.iCalUID) {
        // Guardrail: verify time overlap (1 day tolerance)
        const timeDiff = Math.abs(a.startMs - b.startMs)
        if (timeDiff <= 24 * 60 * 60 * 1000) {
          matches.push({ eventA: a, eventB: b, reason: 'icaluid', confidence: 0.95 })
          continue
        }
      }

      // Provider event ID match
      const providerIdA = a.providerRef.providerEventId
      const providerIdB = b.providerRef.providerEventId
      if (
        providerIdA && providerIdB &&
        providerIdA === providerIdB &&
        a.providerRef.provider === b.providerRef.provider
      ) {
        matches.push({ eventA: a, eventB: b, reason: 'providerEventId', confidence: 0.98 })
        continue
      }

      // Fuzzy match (conservative)
      // Skip if cancelled vs confirmed
      if (
        (a.status === 'cancelled' && b.status === 'confirmed') ||
        (a.status === 'confirmed' && b.status === 'cancelled')
      ) {
        continue
      }

      const startDiff = Math.abs(a.startMs - b.startMs)
      const endDiff = Math.abs(a.endMs - b.endMs)
      const durationA = a.endMs - a.startMs
      const durationB = b.endMs - b.startMs
      const durationDiff = Math.abs(durationA - durationB)

      if (
        startDiff <= 5 * 60 * 1000 && // 5 min tolerance
        endDiff <= 5 * 60 * 1000 &&
        durationDiff <= 30 * 60 * 1000 && // 30 min max duration diff
        !isGenericTitle(a.title) &&
        !isGenericTitle(b.title)
      ) {
        const similarity = titleSimilarity(a.title, b.title)
        if (similarity >= 0.9) {
          matches.push({ eventA: a, eventB: b, reason: 'fuzzy', confidence: 0.7 * similarity })
        }
      }
    }
  }

  return matches.sort((a, b) => b.confidence - a.confidence)
}

// Union-find for grouping
function groupMatches(matches: DuplicateMatch[]): Map<string, CanonicalEvent[]> {
  const parent = new Map<string, string>()
  const allEvents = new Map<string, CanonicalEvent>()

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

  for (const match of matches) {
    allEvents.set(match.eventA.canonicalEventId, match.eventA)
    allEvents.set(match.eventB.canonicalEventId, match.eventB)
    union(match.eventA.canonicalEventId, match.eventB.canonicalEventId)
  }

  const groups = new Map<string, CanonicalEvent[]>()
  for (const [eventId, event] of allEvents) {
    const root = find(eventId)
    if (!groups.has(root)) {
      groups.set(root, [])
    }
    groups.get(root)!.push(event)
  }

  return groups
}

function choosePrimary(events: CanonicalEvent[]): CanonicalEvent {
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
    return best
  })
}

function createComposite(
  events: CanonicalEvent[],
  compositeId: string,
  userId: string,
  reason: string
): CompositeEvent {
  const primary = choosePrimary(events)
  const now = Date.now()

  const members: CompositeMemberRef[] = events.map((e) => ({
    canonicalEventId: e.canonicalEventId,
    provider: e.providerRef.provider,
    accountId: e.providerRef.accountId,
    providerCalendarId: e.providerRef.providerCalendarId,
    providerEventId: e.providerRef.providerEventId,
    iCalUID: e.iCalUID,
    status: e.status,
    updatedAtMs: e.canonicalUpdatedAtMs ?? e.updatedAtMs
  }))

  const iCalUIDs = events.map((e) => e.iCalUID).filter(Boolean)
  const sharedICalUID =
    iCalUIDs.length === events.length && new Set(iCalUIDs).size === 1 ? iCalUIDs[0] : undefined

  return {
    id: compositeId,
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
    dedupeReason: reason,
    canonicalEventIds: events.map((e) => e.canonicalEventId),
    createdAtMs: now,
    updatedAtMs: now,
    lastComputedAtMs: now,
    version: 1
  }
}

// ==================== Pipeline ====================

export async function recomputeComposites(
  userId: string,
  startMs: number,
  endMs: number
): Promise<CompositeRecomputeResult> {
  const runId = `run-${Date.now()}-${Math.random().toString(36).slice(2)}`
  const startTime = Date.now()

  const stats = {
    eventsProcessed: 0,
    compositesCreated: 0,
    compositesUpdated: 0,
    compositesDeleted: 0,
    mergesPerformed: 0,
    errors: 0
  }

  // Create run document
  const runRef = db.collection('users').doc(userId).collection('compositeRuns').doc(runId)
  const run: CompositeRun = {
    runId,
    userId,
    rangeStartMs: startMs,
    rangeEndMs: endMs,
    startedAtMs: startTime,
    status: 'running',
    stats
  }
  await runRef.set(run)

  try {
    // Fetch canonical events in range
    const eventsRef = db.collection('users').doc(userId).collection('calendarEvents')
    const eventsSnapshot = await eventsRef
      .where('startMs', '>=', startMs)
      .where('startMs', '<=', endMs)
      .get()

    const events: CanonicalEvent[] = eventsSnapshot.docs.map((doc) => {
      const data = doc.data() as DocumentData
      return {
        canonicalEventId: doc.id,
        ...data
      } as CanonicalEvent
    })

    stats.eventsProcessed = events.length

    // Find duplicates
    const matches = findDuplicates(events)
    stats.mergesPerformed = matches.length

    // Group into composites
    const groups = groupMatches(matches)

    // Fetch existing composites
    const compositesRef = db.collection('users').doc(userId).collection('compositeEvents')
    const existingSnapshot = await compositesRef
      .where('startMs', '>=', startMs)
      .where('startMs', '<=', endMs)
      .get()

    const existingComposites = new Map<string, CompositeEvent>()
    const existingByCanonicalId = new Map<string, string>() // canonicalEventId -> compositeId

    for (const doc of existingSnapshot.docs) {
      const composite = { id: doc.id, ...doc.data() } as CompositeEvent
      existingComposites.set(doc.id, composite)
      for (const canonicalId of composite.canonicalEventIds ?? []) {
        existingByCanonicalId.set(canonicalId, doc.id)
      }
    }

    const processedCompositeIds = new Set<string>()
    const batch = db.batch()

    // Create/update composites
    for (const [_groupKey, groupEvents] of groups) {
      if (groupEvents.length < 2) continue

      // Check if any event is already in a composite
      const firstEventId = groupEvents[0].canonicalEventId
      const existingCompositeId = existingByCanonicalId.get(firstEventId)

      if (existingCompositeId && existingComposites.has(existingCompositeId)) {
        const existing = existingComposites.get(existingCompositeId)!
        if (existing.manualLock) {
          // Don't modify locked composites
          processedCompositeIds.add(existingCompositeId)
          continue
        }

        // Update existing composite
        const updated = createComposite(groupEvents, existing.id, userId, 'icaluid_match')
        updated.createdAtMs = existing.createdAtMs
        updated.version = existing.version + 1

        const compositeRef = compositesRef.doc(existingCompositeId)
        batch.set(compositeRef, updated)
        processedCompositeIds.add(existingCompositeId)
        stats.compositesUpdated++
      } else {
        // Create new composite
        const newCompositeId = `composite-${Date.now()}-${Math.random().toString(36).slice(2)}`
        const newComposite = createComposite(groupEvents, newCompositeId, userId, 'icaluid_match')

        const compositeRef = compositesRef.doc(newCompositeId)
        batch.set(compositeRef, newComposite)
        processedCompositeIds.add(newCompositeId)
        stats.compositesCreated++
      }
    }

    // Delete composites that are no longer valid (events no longer match)
    for (const [compositeId, composite] of existingComposites) {
      if (!processedCompositeIds.has(compositeId) && !composite.manualLock) {
        const compositeRef = compositesRef.doc(compositeId)
        batch.delete(compositeRef)
        stats.compositesDeleted++
      }
    }

    await batch.commit()

    // Update run status
    run.status = 'completed'
    run.completedAtMs = Date.now()
    run.stats = stats
    await runRef.set(run)

  } catch (error) {
    stats.errors++
    run.status = 'failed'
    run.completedAtMs = Date.now()
    run.error = (error as Error).message
    run.stats = stats
    await runRef.set(run)
    throw error
  }

  return {
    runId,
    ...stats,
    durationMs: Date.now() - startTime
  }
}

