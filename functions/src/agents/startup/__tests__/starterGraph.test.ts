import { describe, expect, it } from 'vitest'
import type { ExtractedClaim, OracleClaim, OracleEvidence } from '@lifeos/agents'
import {
  buildStarterCompactGraphFromClaims,
  buildStarterOracleGraphFromClaims,
  linkEvidenceIdsForClaim,
} from '../starterGraph.js'

function makeExtractedClaim(overrides: Partial<ExtractedClaim> = {}): ExtractedClaim {
  return {
    claimText: 'Hospital AI adoption is accelerating in diagnostic workflows.',
    confidence: 0.8,
    evidenceType: 'empirical',
    sourceId: 'src-1',
    concepts: ['AI adoption', 'diagnostics'],
    ...overrides,
  }
}

function makeOracleClaim(overrides: Partial<OracleClaim> = {}): OracleClaim {
  return {
    id: 'CLM-001',
    type: 'descriptive',
    text: 'Regulatory approval delays slow AI deployment in hospitals.',
    confidence: 0.7,
    confidenceBasis: 'data',
    assumptions: [],
    evidenceIds: [],
    dependencies: [],
    axiomRefs: [],
    createdBy: 'context_seeding',
    phase: 0,
    ...overrides,
  }
}

describe('starter graph helpers', () => {
  it('returns an empty compact graph when no claims are available', () => {
    const graph = buildStarterCompactGraphFromClaims([])

    expect(graph.nodes).toEqual([])
    expect(graph.edges).toEqual([])
    expect(graph.summary).toContain('No attached-context claims')
  })

  it('adds support edges for overlapping attached-context claims', () => {
    const graph = buildStarterCompactGraphFromClaims([
      makeExtractedClaim({
        claimText: 'Hospital AI adoption is accelerating in radiology diagnostics.',
        sourceId: 'src-a',
      }),
      makeExtractedClaim({
        claimText: 'Radiology diagnostics show accelerating AI adoption across major hospitals.',
        sourceId: 'src-b',
      }),
    ])

    expect(graph.nodes).toHaveLength(2)
    expect(graph.edges.some((edge) => edge.rel === 'supports')).toBe(true)
  })

  it('adds contradiction edges when overlapping claims use opposing terms', () => {
    const graph = buildStarterCompactGraphFromClaims([
      makeExtractedClaim({
        claimText: 'AI adoption will increase across regional hospitals this year.',
      }),
      makeExtractedClaim({
        claimText: 'AI adoption will decrease across regional hospitals this year.',
        sourceId: 'src-2',
      }),
    ])

    expect(graph.edges).toContainEqual(expect.objectContaining({ rel: 'contradicts' }))
  })

  it('caps starter graph nodes deterministically', () => {
    const claims = Array.from({ length: 12 }, (_, index) =>
      makeExtractedClaim({
        claimText: `Claim ${index + 1} about adoption pattern ${index + 1}`,
        confidence: 1 - index * 0.01,
        sourceId: `src-${index + 1}`,
      })
    )

    const graph = buildStarterCompactGraphFromClaims(claims, 10)

    expect(graph.nodes).toHaveLength(10)
    expect(graph.nodes[0]?.label).toContain('Claim 1')
  })

  it('links Oracle evidence IDs and builds a seeded Oracle graph', () => {
    const evidence: OracleEvidence[] = [
      {
        id: 'EVD-001',
        source: 'Health policy brief',
        query: 'hospital AI regulation delays',
        url: 'https://example.com/policy',
        date: '2026-03-01',
        excerpt: 'Regulatory approval delays slow AI deployment in hospitals.',
        reliability: 0.8,
        searchTool: 'serper',
      },
    ]

    const linkedIds = linkEvidenceIdsForClaim(
      'Regulatory approval delays slow AI deployment in hospitals.',
      evidence
    )
    const graph = buildStarterOracleGraphFromClaims([
      makeOracleClaim({
        evidenceIds: linkedIds,
      }),
      makeOracleClaim({
        id: 'CLM-002',
        text: 'Regulatory approval delays constrain vendor rollout in hospitals.',
        type: 'causal',
        evidenceIds: linkedIds,
        dependencies: ['CLM-001'],
      }),
    ])

    expect(linkedIds).toEqual(['EVD-001'])
    expect(graph.nodes).toHaveLength(2)
    expect(graph.nodes[0]?.type).toBe('constraint')
    expect(graph.edges).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'depends_on' })])
    )
  })
})
