import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: vi.fn(() => mockDb),
}))

const mockSet = vi.fn().mockResolvedValue(undefined)
const mockDoc = vi.fn(() => ({ set: mockSet, update: vi.fn() }))
const mockGet = vi.fn().mockResolvedValue({ docs: [] })
const mockCollection = vi.fn(() => ({ get: mockGet }))
const mockDb = { doc: mockDoc, collection: mockCollection }

import { KnowledgeHypergraph } from '../../knowledgeHypergraph.js'
import type { KGNode, KGEdge } from '../../knowledgeHypergraph.js'
import type { DialecticalSessionId } from '@lifeos/agents'
import { createBiTemporalEdge } from '@lifeos/agents'
import { serializeKGToCompactGraph, capGraphForPrompt } from '../kgSerializer.js'
import type { CompactGraph } from '@lifeos/agents'

function makeTemporal() {
  return createBiTemporalEdge()
}

function makeClaimNode(id: string, label: string, confidence: number): KGNode {
  return {
    id,
    type: 'claim',
    label,
    temporal: makeTemporal(),
    data: { text: label, confidence, claimId: id } as never,
  }
}

function makeConceptNode(id: string, label: string): KGNode {
  return {
    id,
    type: 'concept',
    label,
    temporal: makeTemporal(),
    data: { conceptId: id, name: label } as never,
  }
}

function makeEdge(type: KGEdge['type'], weight = 1): KGEdge {
  return { type, weight, temporal: makeTemporal() }
}

function makeCompactGraph(overrides: Partial<CompactGraph> = {}): CompactGraph {
  return {
    nodes: [
      { id: 'n1', label: 'Claim A', type: 'claim' },
      { id: 'n2', label: 'Concept B', type: 'concept' },
      { id: 'n3', label: 'Prediction C', type: 'prediction' },
    ],
    edges: [
      { from: 'n1', to: 'n2', rel: 'supports', weight: 0.8 },
      { from: 'n2', to: 'n3', rel: 'causes', weight: 0.3 },
      { from: 'n1', to: 'n3', rel: 'contradicts', weight: 0.9 },
    ],
    summary: 'Test summary',
    reasoning: 'Test reasoning',
    confidence: 0.7,
    regime: 'test',
    temporalGrain: 'monthly',
    ...overrides,
  }
}

describe('capGraphForPrompt', () => {
  it('returns JSON as-is when under maxChars', () => {
    const graph = makeCompactGraph()
    const json = JSON.stringify(graph)
    const result = capGraphForPrompt(graph, json.length + 100)
    expect(result).toBe(json)
  })

  it('prunes lowest-weight edges first when over budget', () => {
    const graph = makeCompactGraph()
    // Set a budget that forces some pruning
    const fullJson = JSON.stringify(graph)
    // Budget that's tight enough to require removing at least one edge
    const result = capGraphForPrompt(graph, fullJson.length - 30)
    const parsed = JSON.parse(result) as CompactGraph
    // The lowest-weight non-contradicts edge (weight=0.3, rel=causes) should be pruned first
    expect(parsed.edges.length).toBeLessThan(3)
    // The contradicts edge should still be present
    expect(parsed.edges.some((e) => e.rel === 'contradicts')).toBe(true)
  })

  it('never prunes contradicts edges', () => {
    const graph = makeCompactGraph({
      edges: [
        { from: 'n1', to: 'n2', rel: 'contradicts', weight: 0.1 },
        { from: 'n2', to: 'n3', rel: 'contradicts', weight: 0.2 },
      ],
    })
    // Very tight budget — but contradicts edges must survive
    const result = capGraphForPrompt(graph, 100)
    const parsed = JSON.parse(result) as CompactGraph
    // All remaining edges should be contradicts (or nodes were pruned instead)
    for (const edge of parsed.edges) {
      expect(edge.rel).toBe('contradicts')
    }
  })

  it('never prunes prediction nodes', () => {
    const graph = makeCompactGraph({
      nodes: [
        { id: 'p1', label: 'Prediction 1', type: 'prediction' },
        { id: 'c1', label: 'Claim 1', type: 'claim' },
        { id: 'c2', label: 'Claim 2', type: 'claim' },
      ],
      edges: [],
    })
    const result = capGraphForPrompt(graph, 150)
    const parsed = JSON.parse(result) as CompactGraph
    expect(parsed.nodes.some((n) => n.type === 'prediction')).toBe(true)
  })

  it('prunes lowest-confidence nodes after edges exhausted', () => {
    const graph = makeCompactGraph({
      nodes: [
        { id: 'n1', label: 'Low conf claim', type: 'claim', sourceConfidence: 0.1 },
        { id: 'n2', label: 'High conf claim', type: 'claim', sourceConfidence: 0.9 },
        { id: 'n3', label: 'Prediction', type: 'prediction' },
      ],
      edges: [],
    })
    const fullJson = JSON.stringify(graph)
    const result = capGraphForPrompt(graph, fullJson.length - 40)
    const parsed = JSON.parse(result) as CompactGraph
    // Prediction nodes are preserved. If any claim survives orphan cleanup, it should be the high-confidence one.
    if (parsed.nodes.length < 3) {
      expect(parsed.nodes.some((n) => n.id === 'n3')).toBe(true)
      const remainingClaims = parsed.nodes.filter((n) => n.type === 'claim')
      if (remainingClaims.length > 0) {
        expect(remainingClaims.some((n) => n.id === 'n2')).toBe(true)
        expect(remainingClaims.some((n) => n.id === 'n1')).toBe(false)
      }
    }
  })

  it('respects custom maxChars parameter', () => {
    // Graph with no contradicts edges or prediction nodes — everything is prunable
    const graph = makeCompactGraph({
      nodes: [
        { id: 'n1', label: 'Claim A', type: 'claim' },
        { id: 'n2', label: 'Concept B', type: 'concept' },
        { id: 'n3', label: 'Mechanism C', type: 'mechanism' },
      ],
      edges: [
        { from: 'n1', to: 'n2', rel: 'supports', weight: 0.8 },
        { from: 'n2', to: 'n3', rel: 'causes', weight: 0.3 },
      ],
    })
    const result = capGraphForPrompt(graph, 200)
    expect(result.length).toBeLessThanOrEqual(200)
  })
})

describe('serializeKGToCompactGraph', () => {
  let kg: KnowledgeHypergraph

  beforeEach(() => {
    vi.clearAllMocks()
    kg = new KnowledgeHypergraph('session-1' as DialecticalSessionId, 'user-1', mockDb as never)
  })

  it('selects top-N nodes by score (edgeCount * 0.4 + confidence * 0.6)', () => {
    // Add 3 claim nodes with different confidences
    kg.addNode(makeClaimNode('c1', 'Claim 1', 0.9)) // score: 0*0.4 + 0.9*0.6 = 0.54
    kg.addNode(makeClaimNode('c2', 'Claim 2', 0.3)) // score: 0*0.4 + 0.3*0.6 = 0.18
    kg.addNode(makeClaimNode('c3', 'Claim 3', 0.7)) // score: 0*0.4 + 0.7*0.6 = 0.42

    const result = serializeKGToCompactGraph(kg, 2)
    expect(result.nodes.length).toBe(2)
    expect(result.nodes[0].id).toBe('c1') // highest score
    expect(result.nodes[1].id).toBe('c3') // second highest
  })

  it('only includes edges between selected nodes', () => {
    kg.addNode(makeClaimNode('c1', 'Claim 1', 0.9))
    kg.addNode(makeClaimNode('c2', 'Claim 2', 0.8))
    kg.addNode(makeClaimNode('c3', 'Claim 3', 0.1))
    kg.addEdge('c1', 'c2', makeEdge('supports'))
    kg.addEdge('c1', 'c3', makeEdge('supports'))

    const result = serializeKGToCompactGraph(kg, 2) // only c1 and c2 selected
    expect(result.edges.length).toBe(1)
    expect(result.edges[0].from).toBe('c1')
    expect(result.edges[0].to).toBe('c2')
  })

  it('maps KG edge types to CompactGraph rel types', () => {
    kg.addNode(makeClaimNode('c1', 'Claim 1', 0.9))
    kg.addNode(makeClaimNode('c2', 'Claim 2', 0.8))
    kg.addEdge('c1', 'c2', makeEdge('causal_link'))

    const result = serializeKGToCompactGraph(kg)
    expect(result.edges[0].rel).toBe('causes')
  })

  it('skips non-semantic edges (sourced_from, belongs_to)', () => {
    kg.addNode(makeClaimNode('c1', 'Claim 1', 0.9))
    kg.addNode(makeClaimNode('c2', 'Claim 2', 0.8))
    kg.addEdge('c1', 'c2', makeEdge('sourced_from'))
    kg.addEdge('c1', 'c2', makeEdge('references'))

    const result = serializeKGToCompactGraph(kg)
    expect(result.edges.length).toBe(0)
  })

  it('computes summary from top 3 claims', () => {
    kg.addNode(makeClaimNode('c1', 'Alpha claim', 0.9))
    kg.addNode(makeClaimNode('c2', 'Beta claim', 0.7))
    kg.addNode(makeClaimNode('c3', 'Gamma claim', 0.5))

    const result = serializeKGToCompactGraph(kg)
    expect(result.summary).toContain('Alpha claim')
    expect(result.summary).toContain('Beta claim')
    expect(result.summary).toContain('Gamma claim')
    expect(result.summary).toMatch(/^Key findings:/)
  })

  it('defaults maxNodes to 50', () => {
    // Add 55 claim nodes
    for (let i = 0; i < 55; i++) {
      kg.addNode(makeClaimNode(`c${i}`, `Claim ${i}`, 0.5 + i / 200))
    }

    const result = serializeKGToCompactGraph(kg)
    expect(result.nodes.length).toBe(50)
  })

  it('includes concept nodes in output', () => {
    kg.addNode(makeConceptNode('k1', 'Concept K'))
    kg.addNode(makeClaimNode('c1', 'Claim 1', 0.9))
    kg.addEdge('c1', 'k1', makeEdge('supports'))

    const result = serializeKGToCompactGraph(kg)
    expect(result.nodes.some((n) => n.type === 'concept')).toBe(true)
  })

  it('computes average confidence from claim nodes', () => {
    kg.addNode(makeClaimNode('c1', 'Claim 1', 0.8))
    kg.addNode(makeClaimNode('c2', 'Claim 2', 0.6))

    const result = serializeKGToCompactGraph(kg)
    expect(result.confidence).toBeCloseTo(0.7)
  })
})
