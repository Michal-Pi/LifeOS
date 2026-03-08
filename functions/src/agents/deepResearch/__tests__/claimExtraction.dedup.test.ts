import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: vi.fn(() => mockDb),
}))

const mockSet = vi.fn().mockResolvedValue(undefined)
const mockDoc = vi.fn(() => ({ set: mockSet, update: vi.fn() }))
const mockGet = vi.fn().mockResolvedValue({ docs: [] })
const mockCollection = vi.fn(() => ({ get: mockGet }))
const mockDb = { doc: mockDoc, collection: mockCollection }

import { mapClaimsToKG } from '../claimExtraction.js'
import { KnowledgeHypergraph } from '../../knowledgeHypergraph.js'
import type { DialecticalSessionId, ExtractedClaim, SourceRecord } from '@lifeos/agents'

function makeKg(): KnowledgeHypergraph {
  return new KnowledgeHypergraph('session-1' as DialecticalSessionId, 'user-1', mockDb as never)
}

function makeClaim(overrides?: Partial<ExtractedClaim>): ExtractedClaim {
  return {
    claimText: 'A causes B',
    confidence: 0.9,
    evidenceType: 'empirical',
    sourceId: 'src-1',
    concepts: ['ConceptA', 'ConceptB'],
    ...overrides,
  }
}

function makeSource(id: string): SourceRecord {
  return {
    sourceId: id,
    url: `https://example.com/${id}`,
    title: `Source ${id}`,
    domain: 'example.com',
    fetchedAtMs: Date.now(),
    fetchMethod: 'read_url',
    contentLength: 1000,
    contentHash: `hash_${id}`,
    sourceType: 'web',
  }
}

describe('Duplicate causal edge guard', () => {
  let kg: KnowledgeHypergraph

  beforeEach(() => {
    vi.clearAllMocks()
    kg = makeKg()
  })

  it('does not re-insert causal_link edge for same claim between same concepts', async () => {
    const claims = [makeClaim()]
    const sources = [makeSource('src-1')]

    // First pass — creates concepts + claim + causal_link edge
    await mapClaimsToKG(claims, sources, kg, 'session-1' as DialecticalSessionId, 'user-1')

    // Grab the concepts that were created
    const concepts = kg.getNodesByType('concept')
    expect(concepts.length).toBeGreaterThanOrEqual(2)
    const conceptA = concepts.find((c) => c.label === 'ConceptA')!
    const conceptB = concepts.find((c) => c.label === 'ConceptB')!

    // Count causal_link edges between conceptA and conceptB
    const edgesBefore = kg.getEdges(conceptA.id, conceptB.id)
    const causalBefore = edgesBefore.filter((e) => e.type === 'causal_link')
    expect(causalBefore.length).toBe(1)

    // Second pass with the same claim — should NOT add another causal_link
    await mapClaimsToKG(claims, sources, kg, 'session-1' as DialecticalSessionId, 'user-1')

    const edgesAfter = kg.getEdges(conceptA.id, conceptB.id)
    const causalAfter = edgesAfter.filter((e) => e.type === 'causal_link')
    expect(causalAfter.length).toBe(1)
  })

  it('allows causal_link edge for different claim between same concepts', async () => {
    const sources = [makeSource('src-1')]

    // First claim
    await mapClaimsToKG(
      [makeClaim({ claimText: 'A causes B via mechanism 1' })],
      sources,
      kg,
      'session-1' as DialecticalSessionId,
      'user-1'
    )

    const concepts = kg.getNodesByType('concept')
    const conceptA = concepts.find((c) => c.label === 'ConceptA')!
    const conceptB = concepts.find((c) => c.label === 'ConceptB')!

    const edgesBefore = kg.getEdges(conceptA.id, conceptB.id)
    const causalBefore = edgesBefore.filter((e) => e.type === 'causal_link')
    expect(causalBefore.length).toBe(1)

    // Small delay to avoid Date.now() collision in multigraph edge names
    await new Promise((resolve) => setTimeout(resolve, 2))

    // Second claim with different text — different claimId
    await mapClaimsToKG(
      [makeClaim({ claimText: 'A causes B via mechanism 2' })],
      sources,
      kg,
      'session-1' as DialecticalSessionId,
      'user-1'
    )

    const edges = kg.getEdges(conceptA.id, conceptB.id)
    const causalEdges = edges.filter((e) => e.type === 'causal_link')
    expect(causalEdges.length).toBe(2)
  })
})
