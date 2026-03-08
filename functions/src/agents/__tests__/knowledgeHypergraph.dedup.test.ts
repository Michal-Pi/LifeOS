import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: vi.fn(() => mockDb),
}))

const mockSet = vi.fn().mockResolvedValue(undefined)
const mockDoc = vi.fn(() => ({ set: mockSet, update: vi.fn() }))
const mockGet = vi.fn().mockResolvedValue({ docs: [] })
const mockCollection = vi.fn(() => ({ get: mockGet }))
const mockDb = { doc: mockDoc, collection: mockCollection }

import { KnowledgeHypergraph } from '../knowledgeHypergraph.js'
import type {
  DialecticalSessionId,
  CreateClaimInput,
  EpisodeId,
  AgentId,
  ThesisLens,
} from '@lifeos/agents'

function makeClaimInput(text: string, overrides?: Partial<CreateClaimInput>): CreateClaimInput {
  return {
    sessionId: 'session-1' as DialecticalSessionId,
    userId: 'user-1',
    text,
    normalizedText: text.toLowerCase().trim().replace(/\s+/g, ' '),
    sourceEpisodeId: 'episode:source:src-1' as EpisodeId,
    sourceAgentId: 'agent:test' as AgentId,
    sourceLens: 'systems' as ThesisLens,
    claimType: 'ASSERTION',
    confidence: 0.8,
    conceptIds: [],
    ...overrides,
  }
}

describe('KG duplicate claim guard', () => {
  let kg: KnowledgeHypergraph

  beforeEach(() => {
    vi.clearAllMocks()
    kg = new KnowledgeHypergraph('session-1' as DialecticalSessionId, 'user-1', mockDb as never)
  })

  it('findClaimByNormalizedText returns null for no match', () => {
    expect(kg.findClaimByNormalizedText('nonexistent claim')).toBeNull()
  })

  it('findClaimByNormalizedText finds exact match (case-insensitive, whitespace-normalized)', async () => {
    await kg.addClaim(makeClaimInput('Interest rates affect growth'))

    // Different case and extra whitespace
    const found = kg.findClaimByNormalizedText('  INTEREST  RATES  AFFECT  GROWTH  ')
    expect(found).not.toBeNull()
    expect(found!.text).toBe('Interest rates affect growth')
  })

  it('addClaim skips duplicate but returns existing claim', async () => {
    const first = await kg.addClaim(makeClaimInput('Interest rates affect growth'))
    const second = await kg.addClaim(makeClaimInput('Interest rates affect growth'))

    expect(first.claimId).toBe(second.claimId)
    // Firestore set should only have been called once for this claim text
    const setCalls = mockSet.mock.calls
    const claimSetCalls = setCalls.filter(
      (c: unknown[]) => (c[0] as { text?: string })?.text === 'Interest rates affect growth'
    )
    expect(claimSetCalls).toHaveLength(1)
  })

  it('addClaim attaches missing source edge to existing claim', async () => {
    const first = await kg.addClaim(
      makeClaimInput('Interest rates affect growth', {
        sourceEpisodeId: 'episode:source:src-1' as EpisodeId,
      })
    )

    // Add again with a different source
    const second = await kg.addClaim(
      makeClaimInput('Interest rates affect growth', {
        sourceEpisodeId: 'episode:source:src-2' as EpisodeId,
      })
    )

    expect(first.claimId).toBe(second.claimId)

    // Check that the claim now has an edge to src-2
    const outEdges = kg.getOutEdges(first.claimId)
    const sourceEdges = outEdges.filter((e) => e.data.type === 'sourced_from')
    const targets = sourceEdges.map((e) => e.target)
    expect(targets).toContain('episode:source:src-2')
  })

  it('addClaim creates new claim when no duplicate exists', async () => {
    const first = await kg.addClaim(makeClaimInput('Interest rates affect growth'))
    const second = await kg.addClaim(makeClaimInput('A completely different claim'))

    expect(first.claimId).not.toBe(second.claimId)
  })
})
