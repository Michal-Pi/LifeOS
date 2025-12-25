import { describe, it, expect } from 'vitest'
import {
  normalizeTitle,
  titleSimilarity,
  matchByICalUID,
  matchByTimeTitle,
  findDuplicateCandidates,
  createCompositeFromCandidate,
  addMemberToComposite,
  removeMemberFromComposite
} from '../composite'
import type { CanonicalCalendarEvent } from '../models'

// Helper to create a test event
function createTestEvent(overrides: Partial<CanonicalCalendarEvent> = {}): CanonicalCalendarEvent {
  const now = Date.now()
  return {
    canonicalEventId: `event-${Math.random().toString(36).slice(2)}`,
    schemaVersion: 1,
    normalizationVersion: 1,
    providerRef: {
      provider: 'google',
      accountId: 'account-1',
      providerCalendarId: 'primary',
      providerEventId: 'provider-event-1'
    },
    createdAt: new Date(now).toISOString(),
    updatedAt: new Date(now).toISOString(),
    createdAtMs: now,
    updatedAtMs: now,
    canonicalUpdatedAtMs: now,
    syncState: 'synced',
    source: { type: 'provider' },
    startMs: now,
    endMs: now + 3600000,
    startIso: new Date(now).toISOString(),
    endIso: new Date(now + 3600000).toISOString(),
    title: 'Test Event',
    occursOn: [new Date(now).toISOString().split('T')[0]],
    ...overrides
  }
}

describe('normalizeTitle', () => {
  it('lowercases and trims', () => {
    expect(normalizeTitle('  Hello World  ')).toBe('hello world')
  })

  it('removes Re: prefix', () => {
    expect(normalizeTitle('Re: Meeting Notes')).toBe('meeting notes')
  })

  it('removes Fwd: prefix', () => {
    expect(normalizeTitle('Fwd: Project Update')).toBe('project update')
  })

  it('collapses whitespace', () => {
    expect(normalizeTitle('Hello    World')).toBe('hello world')
  })

  it('handles undefined', () => {
    expect(normalizeTitle(undefined)).toBe('')
  })
})

describe('titleSimilarity', () => {
  it('returns 1.0 for exact match', () => {
    expect(titleSimilarity('Team Standup', 'Team Standup')).toBe(1.0)
  })

  it('returns 1.0 for match after normalization', () => {
    expect(titleSimilarity('Re: Team Standup', 'team standup')).toBe(1.0)
  })

  it('returns high score for containment', () => {
    const score = titleSimilarity('Weekly Team Standup', 'Team Standup')
    expect(score).toBeGreaterThan(0.5)
  })

  it('returns word overlap score', () => {
    const score = titleSimilarity('Project Review Meeting', 'Project Planning Meeting')
    expect(score).toBeGreaterThan(0.4)
  })

  it('returns 0 for completely different titles', () => {
    expect(titleSimilarity('Alpha', 'Omega')).toBe(0)
  })
})

describe('matchByICalUID', () => {
  it('returns match for same iCalUID different accounts', () => {
    const eventA = createTestEvent({
      iCalUID: 'shared-uid@google.com',
      providerRef: { provider: 'google', accountId: 'account-1', providerCalendarId: 'p1', providerEventId: 'e1' }
    })
    const eventB = createTestEvent({
      iCalUID: 'shared-uid@google.com',
      providerRef: { provider: 'google', accountId: 'account-2', providerCalendarId: 'p2', providerEventId: 'e2' }
    })

    const result = matchByICalUID(eventA, eventB)

    expect(result).not.toBeNull()
    expect(result?.heuristic).toBe('icaluid')
    expect(result?.confidence).toBe(0.95)
  })

  it('returns null for same account', () => {
    const eventA = createTestEvent({
      iCalUID: 'shared-uid@google.com',
      providerRef: { provider: 'google', accountId: 'account-1', providerCalendarId: 'p1', providerEventId: 'e1' }
    })
    const eventB = createTestEvent({
      iCalUID: 'shared-uid@google.com',
      providerRef: { provider: 'google', accountId: 'account-1', providerCalendarId: 'p2', providerEventId: 'e2' }
    })

    expect(matchByICalUID(eventA, eventB)).toBeNull()
  })

  it('returns null for different iCalUID', () => {
    const eventA = createTestEvent({ iCalUID: 'uid-1@google.com' })
    const eventB = createTestEvent({ iCalUID: 'uid-2@google.com' })

    expect(matchByICalUID(eventA, eventB)).toBeNull()
  })

  it('returns null when iCalUID missing', () => {
    const eventA = createTestEvent({ iCalUID: undefined })
    const eventB = createTestEvent({ iCalUID: 'uid@google.com' })

    expect(matchByICalUID(eventA, eventB)).toBeNull()
  })
})

describe('matchByTimeTitle', () => {
  it('returns match for same time and similar title', () => {
    const startMs = Date.now()
    const eventA = createTestEvent({
      startMs,
      endMs: startMs + 3600000, // 1 hour
      title: 'Project Review Session',
      providerRef: { provider: 'google', accountId: 'account-1', providerCalendarId: 'p1', providerEventId: 'e1' }
    })
    const eventB = createTestEvent({
      startMs: startMs + 60000, // 1 minute later
      endMs: startMs + 3660000, // ~1 hour
      title: 'Project Review Session',
      providerRef: { provider: 'google', accountId: 'account-2', providerCalendarId: 'p2', providerEventId: 'e2' }
    })

    const result = matchByTimeTitle(eventA, eventB)

    expect(result).not.toBeNull()
    expect(result?.heuristic).toBe('time-title')
    expect(result?.confidence).toBeGreaterThanOrEqual(0.7) // 0.7 * 1.0 similarity = 0.7
  })

  it('returns null for time difference > tolerance', () => {
    const startMs = Date.now()
    const eventA = createTestEvent({
      startMs,
      title: 'Meeting',
      providerRef: { provider: 'google', accountId: 'account-1', providerCalendarId: 'p1', providerEventId: 'e1' }
    })
    const eventB = createTestEvent({
      startMs: startMs + 10 * 60 * 1000, // 10 minutes later
      title: 'Meeting',
      providerRef: { provider: 'google', accountId: 'account-2', providerCalendarId: 'p2', providerEventId: 'e2' }
    })

    expect(matchByTimeTitle(eventA, eventB)).toBeNull()
  })

  it('returns null for different titles', () => {
    const startMs = Date.now()
    const eventA = createTestEvent({
      startMs,
      title: 'Project Alpha',
      providerRef: { provider: 'google', accountId: 'account-1', providerCalendarId: 'p1', providerEventId: 'e1' }
    })
    const eventB = createTestEvent({
      startMs,
      title: 'Project Beta',
      providerRef: { provider: 'google', accountId: 'account-2', providerCalendarId: 'p2', providerEventId: 'e2' }
    })

    expect(matchByTimeTitle(eventA, eventB)).toBeNull()
  })

  it('returns null for same account', () => {
    const startMs = Date.now()
    const eventA = createTestEvent({
      startMs,
      title: 'Meeting',
      providerRef: { provider: 'google', accountId: 'account-1', providerCalendarId: 'p1', providerEventId: 'e1' }
    })
    const eventB = createTestEvent({
      startMs,
      title: 'Meeting',
      providerRef: { provider: 'google', accountId: 'account-1', providerCalendarId: 'p2', providerEventId: 'e2' }
    })

    expect(matchByTimeTitle(eventA, eventB)).toBeNull()
  })
})

describe('findDuplicateCandidates', () => {
  it('finds duplicates by iCalUID', () => {
    const now = Date.now()
    const events = [
      createTestEvent({
        canonicalEventId: 'event-1',
        iCalUID: 'shared@google.com',
        title: 'Meeting Alpha',
        startMs: now,
        providerRef: { provider: 'google', accountId: 'a1', providerCalendarId: 'p1', providerEventId: 'e1' }
      }),
      createTestEvent({
        canonicalEventId: 'event-2',
        iCalUID: 'shared@google.com',
        title: 'Meeting Alpha',
        startMs: now,
        providerRef: { provider: 'google', accountId: 'a2', providerCalendarId: 'p2', providerEventId: 'e2' }
      }),
      createTestEvent({
        canonicalEventId: 'event-3',
        iCalUID: 'other@google.com',
        title: 'Different Event',  // Different title to avoid time-title match
        startMs: now + 7200000,     // 2 hours later to avoid time-title match
        providerRef: { provider: 'google', accountId: 'a3', providerCalendarId: 'p3', providerEventId: 'e3' }
      })
    ]

    const candidates = findDuplicateCandidates(events)

    expect(candidates).toHaveLength(1)
    expect(candidates[0].heuristic).toBe('icaluid')
  })

  it('finds duplicates by time-title', () => {
    const startMs = Date.now()
    const events = [
      createTestEvent({
        canonicalEventId: 'event-1',
        startMs,
        title: 'Team Sync',
        providerRef: { provider: 'google', accountId: 'a1', providerCalendarId: 'p1', providerEventId: 'e1' }
      }),
      createTestEvent({
        canonicalEventId: 'event-2',
        startMs: startMs + 60000,
        title: 'Team Sync',
        providerRef: { provider: 'google', accountId: 'a2', providerCalendarId: 'p2', providerEventId: 'e2' }
      })
    ]

    const candidates = findDuplicateCandidates(events)

    expect(candidates).toHaveLength(1)
    expect(candidates[0].heuristic).toBe('time-title')
  })

  it('prefers iCalUID over time-title', () => {
    const startMs = Date.now()
    const events = [
      createTestEvent({
        canonicalEventId: 'event-1',
        iCalUID: 'shared@google.com',
        startMs,
        title: 'Meeting',
        providerRef: { provider: 'google', accountId: 'a1', providerCalendarId: 'p1', providerEventId: 'e1' }
      }),
      createTestEvent({
        canonicalEventId: 'event-2',
        iCalUID: 'shared@google.com',
        startMs,
        title: 'Meeting',
        providerRef: { provider: 'google', accountId: 'a2', providerCalendarId: 'p2', providerEventId: 'e2' }
      })
    ]

    const candidates = findDuplicateCandidates(events)

    expect(candidates).toHaveLength(1)
    expect(candidates[0].heuristic).toBe('icaluid')
  })

  it('sorts by confidence descending', () => {
    const startMs = Date.now()
    const events = [
      createTestEvent({
        canonicalEventId: 'event-1',
        iCalUID: 'shared@google.com',
        startMs,
        title: 'Meeting',
        providerRef: { provider: 'google', accountId: 'a1', providerCalendarId: 'p1', providerEventId: 'e1' }
      }),
      createTestEvent({
        canonicalEventId: 'event-2',
        iCalUID: 'shared@google.com',
        startMs,
        title: 'Meeting',
        providerRef: { provider: 'google', accountId: 'a2', providerCalendarId: 'p2', providerEventId: 'e2' }
      }),
      createTestEvent({
        canonicalEventId: 'event-3',
        startMs: startMs + 100000,
        title: 'Other Call',
        providerRef: { provider: 'google', accountId: 'a3', providerCalendarId: 'p3', providerEventId: 'e3' }
      }),
      createTestEvent({
        canonicalEventId: 'event-4',
        startMs: startMs + 100000,
        title: 'Other Call',
        providerRef: { provider: 'google', accountId: 'a4', providerCalendarId: 'p4', providerEventId: 'e4' }
      })
    ]

    const candidates = findDuplicateCandidates(events)

    expect(candidates.length).toBeGreaterThanOrEqual(1)
    for (let i = 1; i < candidates.length; i++) {
      expect(candidates[i - 1].confidence).toBeGreaterThanOrEqual(candidates[i].confidence)
    }
  })
})

describe('createCompositeFromCandidate', () => {
  it('creates composite with correct structure', () => {
    const eventA = createTestEvent({
      canonicalEventId: 'event-a',
      title: 'Meeting',
      description: 'Long description here',
      providerRef: { provider: 'google', accountId: 'a1', providerCalendarId: 'p1', providerEventId: 'e1' }
    })
    const eventB = createTestEvent({
      canonicalEventId: 'event-b',
      title: 'Meeting',
      providerRef: { provider: 'google', accountId: 'a2', providerCalendarId: 'p2', providerEventId: 'e2' }
    })

    const candidate = {
      eventA,
      eventB,
      heuristic: 'icaluid' as const,
      confidence: 0.95,
      matchReason: 'test'
    }

    const composite = createCompositeFromCandidate(candidate, 'composite-1', 'user-1')

    expect(composite.id).toBe('composite-1')
    expect(composite.userId).toBe('user-1')
    expect(composite.members).toHaveLength(2)
    expect(composite.canonicalEventIds).toContain('event-a')
    expect(composite.canonicalEventIds).toContain('event-b')
    expect(composite.heuristic).toBe('icaluid')
    expect(composite.confidence).toBe(0.95)
    expect(composite.primaryMemberId).toBe('event-a') // Has longer description
  })
})

describe('addMemberToComposite', () => {
  it('adds new member to composite', () => {
    const eventC = createTestEvent({
      canonicalEventId: 'event-c',
      providerRef: { provider: 'google', accountId: 'a3', providerCalendarId: 'p3', providerEventId: 'e3' }
    })

    const eventA = createTestEvent({ canonicalEventId: 'event-a' })
    const eventB = createTestEvent({ canonicalEventId: 'event-b' })
    const candidate = { eventA, eventB, heuristic: 'icaluid' as const, confidence: 0.95, matchReason: '' }
    const composite = createCompositeFromCandidate(candidate, 'composite-1', 'user-1')

    const updated = addMemberToComposite(composite, eventC)

    expect(updated.members).toHaveLength(3)
    expect(updated.canonicalEventIds).toContain('event-c')
  })

  it('does not add duplicate member', () => {
    const eventA = createTestEvent({ canonicalEventId: 'event-a' })
    const eventB = createTestEvent({ canonicalEventId: 'event-b' })
    const candidate = { eventA, eventB, heuristic: 'icaluid' as const, confidence: 0.95, matchReason: '' }
    const composite = createCompositeFromCandidate(candidate, 'composite-1', 'user-1')

    const updated = addMemberToComposite(composite, eventA)

    expect(updated.members).toHaveLength(2)
  })
})

describe('removeMemberFromComposite', () => {
  it('removes member and returns updated composite', () => {
    const eventA = createTestEvent({ canonicalEventId: 'event-a' })
    const eventB = createTestEvent({ canonicalEventId: 'event-b' })
    const eventC = createTestEvent({ canonicalEventId: 'event-c' })
    const candidate = { eventA, eventB, heuristic: 'icaluid' as const, confidence: 0.95, matchReason: '' }
    let composite = createCompositeFromCandidate(candidate, 'composite-1', 'user-1')
    composite = addMemberToComposite(composite, eventC)

    const updated = removeMemberFromComposite(composite, 'event-c')

    expect(updated).not.toBeNull()
    expect(updated?.members).toHaveLength(2)
    expect(updated?.canonicalEventIds).not.toContain('event-c')
  })

  it('returns null when removing would leave < 2 members', () => {
    const eventA = createTestEvent({ canonicalEventId: 'event-a' })
    const eventB = createTestEvent({ canonicalEventId: 'event-b' })
    const candidate = { eventA, eventB, heuristic: 'icaluid' as const, confidence: 0.95, matchReason: '' }
    const composite = createCompositeFromCandidate(candidate, 'composite-1', 'user-1')

    const updated = removeMemberFromComposite(composite, 'event-a')

    expect(updated).toBeNull()
  })

  it('promotes new primary when removing primary', () => {
    const eventA = createTestEvent({ canonicalEventId: 'event-a' })
    const eventB = createTestEvent({ canonicalEventId: 'event-b' })
    const eventC = createTestEvent({ canonicalEventId: 'event-c' })
    const candidate = { eventA, eventB, heuristic: 'icaluid' as const, confidence: 0.95, matchReason: '' }
    let composite = createCompositeFromCandidate(candidate, 'composite-1', 'user-1')
    composite = addMemberToComposite(composite, eventC)

    // event-a is primary
    expect(composite.primaryMemberId).toBe('event-a')

    const updated = removeMemberFromComposite(composite, 'event-a')

    expect(updated).not.toBeNull()
    expect(updated?.primaryMemberId).not.toBe('event-a')
  })
})

