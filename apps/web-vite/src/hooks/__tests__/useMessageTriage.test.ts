import { describe, expect, it } from 'vitest'
import type { PrioritizedMessage, TriageCategory } from '@lifeos/agents'

function makeMessage(overrides: Partial<PrioritizedMessage> = {}): PrioritizedMessage {
  return {
    messageId: `msg-${Math.random().toString(36).slice(2)}` as PrioritizedMessage['messageId'],
    userId: 'user-1',
    source: 'gmail',
    accountId: 'acc-1',
    originalMessageId: 'orig-1',
    sender: 'Test User',
    snippet: 'test snippet',
    receivedAtMs: Date.now(),
    priority: 'medium',
    aiSummary: 'test summary',
    requiresFollowUp: false,
    isRead: false,
    isDismissed: false,
    createdAtMs: Date.now(),
    updatedAtMs: Date.now(),
    ...overrides,
  } as PrioritizedMessage
}

const TRIAGE_ORDER: Record<TriageCategory, number> = {
  urgent: 0,
  important: 1,
  fyi: 2,
  automated: 3,
}

function sortByTriage(messages: PrioritizedMessage[]): PrioritizedMessage[] {
  return [...messages].sort((a, b) => {
    const catA = a.triageCategoryOverride || a.triageCategory || 'fyi'
    const catB = b.triageCategoryOverride || b.triageCategory || 'fyi'
    const orderDiff = TRIAGE_ORDER[catA] - TRIAGE_ORDER[catB]
    if (orderDiff !== 0) return orderDiff
    return b.receivedAtMs - a.receivedAtMs
  })
}

function filterByTriage(
  messages: PrioritizedMessage[],
  filter: TriageCategory | 'all' | 'action'
): PrioritizedMessage[] {
  if (filter === 'all') return messages
  if (filter === 'action') {
    return messages.filter((m) => {
      const cat = m.triageCategoryOverride || m.triageCategory
      return !cat || cat === 'urgent' || cat === 'important'
    })
  }
  return messages.filter((m) => {
    const cat = m.triageCategoryOverride || m.triageCategory
    return cat === filter
  })
}

describe('Message Triage', () => {
  it('message with triageCategory urgent resolves to Urgent', () => {
    const msg = makeMessage({ triageCategory: 'urgent' })
    const triageCategory = msg.triageCategoryOverride || msg.triageCategory
    expect(triageCategory).toBe('urgent')
  })

  it('user override takes precedence over AI category', () => {
    const msg = makeMessage({
      triageCategory: 'fyi',
      triageCategoryOverride: 'urgent',
    })
    const triageCategory = msg.triageCategoryOverride || msg.triageCategory
    expect(triageCategory).toBe('urgent')
  })

  it('sort order places urgent before fyi, newest first within group', () => {
    const now = Date.now()
    const messages = [
      makeMessage({ triageCategory: 'fyi', receivedAtMs: now }),
      makeMessage({ triageCategory: 'urgent', receivedAtMs: now - 1000 }),
      makeMessage({ triageCategory: 'urgent', receivedAtMs: now }),
      makeMessage({ triageCategory: 'important', receivedAtMs: now }),
    ]

    const sorted = sortByTriage(messages)

    // First two should be urgent (newest first)
    expect(sorted[0].triageCategory).toBe('urgent')
    expect(sorted[0].receivedAtMs).toBe(now)
    expect(sorted[1].triageCategory).toBe('urgent')
    expect(sorted[1].receivedAtMs).toBe(now - 1000)

    // Then important
    expect(sorted[2].triageCategory).toBe('important')

    // Then fyi
    expect(sorted[3].triageCategory).toBe('fyi')
  })

  it('filter "action" shows only urgent + important', () => {
    const messages = [
      makeMessage({ triageCategory: 'urgent' }),
      makeMessage({ triageCategory: 'important' }),
      makeMessage({ triageCategory: 'fyi' }),
      makeMessage({ triageCategory: 'automated' }),
    ]

    const filtered = filterByTriage(messages, 'action')

    expect(filtered).toHaveLength(2)
    expect(
      filtered.every((m) => m.triageCategory === 'urgent' || m.triageCategory === 'important')
    ).toBe(true)
  })

  it('filter "all" shows everything', () => {
    const messages = [
      makeMessage({ triageCategory: 'urgent' }),
      makeMessage({ triageCategory: 'fyi' }),
      makeMessage({ triageCategory: 'automated' }),
    ]

    const filtered = filterByTriage(messages, 'all')
    expect(filtered).toHaveLength(3)
  })

  it('filter by specific category works', () => {
    const messages = [
      makeMessage({ triageCategory: 'urgent' }),
      makeMessage({ triageCategory: 'fyi' }),
      makeMessage({ triageCategory: 'fyi' }),
      makeMessage({ triageCategory: 'automated' }),
    ]

    const filtered = filterByTriage(messages, 'fyi')
    expect(filtered).toHaveLength(2)
    expect(filtered.every((m) => m.triageCategory === 'fyi')).toBe(true)
  })

  it('messages without triageCategory default to fyi in sort', () => {
    const now = Date.now()
    const messages = [
      makeMessage({ receivedAtMs: now }), // no triageCategory
      makeMessage({ triageCategory: 'urgent', receivedAtMs: now }),
    ]

    const sorted = sortByTriage(messages)
    expect(sorted[0].triageCategory).toBe('urgent')
    expect(sorted[1].triageCategory).toBeUndefined()
  })

  it('override is stored separately from AI category', () => {
    const msg = makeMessage({
      triageCategory: 'automated',
      triageCategoryOverride: 'important',
      triageCategoryConfidence: 0.85,
    })

    expect(msg.triageCategory).toBe('automated')
    expect(msg.triageCategoryOverride).toBe('important')
    expect(msg.triageCategoryConfidence).toBe(0.85)

    // Effective category uses override
    const effective = msg.triageCategoryOverride || msg.triageCategory
    expect(effective).toBe('important')
  })
})
