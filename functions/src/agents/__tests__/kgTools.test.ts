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
import type { KGNode, KGEdge } from '../knowledgeHypergraph.js'
import type { DialecticalSessionId, BiTemporalEdge } from '@lifeos/agents'
import { createBiTemporalEdge } from '@lifeos/agents'
import { createKGTools } from '../kgTools.js'
import type { ToolExecutionContext } from '../toolExecutor.js'

function makeTemporal(): BiTemporalEdge {
  return createBiTemporalEdge()
}

function makeClaimNode(id: string, label: string, confidence: number): KGNode {
  return {
    id,
    type: 'claim',
    label,
    temporal: makeTemporal(),
    data: { text: `Full text: ${label}`, confidence, claimId: id } as never,
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

function makeContradictionNode(id: string, label: string): KGNode {
  return {
    id,
    type: 'contradiction',
    label,
    temporal: makeTemporal(),
    data: {} as never,
  }
}

function makeSourceNode(id: string, label: string, url: string, domain: string): KGNode {
  return {
    id,
    type: 'source',
    label,
    temporal: makeTemporal(),
    data: { sourceId: id, url, domain, title: label } as never,
  }
}

function makeEdge(type: KGEdge['type'], weight = 1): KGEdge {
  return { type, weight, temporal: makeTemporal() }
}

const dummyContext: ToolExecutionContext = {
  userId: 'user-1',
  agentId: 'agent-1',
  workflowId: 'wf-1',
  runId: 'run-1',
  provider: 'openai',
  modelName: 'gpt-4o',
  iteration: 0,
}

describe('createKGTools', () => {
  let kg: KnowledgeHypergraph

  beforeEach(() => {
    vi.clearAllMocks()
    kg = new KnowledgeHypergraph('session-1' as DialecticalSessionId, 'user-1', mockDb as never)
  })

  it('returns 6 tools with correct names', () => {
    const tools = createKGTools(kg)
    expect(tools).toHaveLength(6)
    const names = tools.map((t) => t.name)
    expect(names).toContain('kg_summary')
    expect(names).toContain('kg_get_claims')
    expect(names).toContain('kg_get_neighborhood')
    expect(names).toContain('kg_get_sources_for_claim')
    expect(names).toContain('kg_get_contradictions')
    expect(names).toContain('kg_shortest_path')
  })

  describe('kg_summary', () => {
    it('returns stats, top claims, and contradictions', async () => {
      kg.addNode(makeClaimNode('c1', 'Claim 1', 0.9))
      kg.addNode(makeClaimNode('c2', 'Claim 2', 0.7))
      kg.addNode(makeContradictionNode('x1', 'Contradiction 1'))

      const tools = createKGTools(kg)
      const summaryTool = tools.find((t) => t.name === 'kg_summary')!
      const result = (await summaryTool.execute({}, dummyContext)) as {
        stats: { nodeCount: number }
        topClaims: Array<{ id: string; confidence: number }>
        activeContradictions: Array<{ id: string }>
      }

      expect(result.stats.nodeCount).toBe(3)
      expect(result.topClaims).toHaveLength(2)
      expect(result.topClaims[0].id).toBe('c1') // highest confidence first
      expect(result.activeContradictions).toHaveLength(1)
    })
  })

  describe('kg_get_claims', () => {
    it('returns all claims when no filters', async () => {
      kg.addNode(makeClaimNode('c1', 'Claim 1', 0.9))
      kg.addNode(makeClaimNode('c2', 'Claim 2', 0.5))

      const tools = createKGTools(kg)
      const tool = tools.find((t) => t.name === 'kg_get_claims')!
      const result = (await tool.execute({}, dummyContext)) as Array<{ id: string }>

      expect(result).toHaveLength(2)
    })

    it('filters by minConfidence', async () => {
      kg.addNode(makeClaimNode('c1', 'Claim 1', 0.9))
      kg.addNode(makeClaimNode('c2', 'Claim 2', 0.3))

      const tools = createKGTools(kg)
      const tool = tools.find((t) => t.name === 'kg_get_claims')!
      const result = (await tool.execute({ minConfidence: 0.5 }, dummyContext)) as Array<{
        id: string
      }>

      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('c1')
    })

    it('filters by conceptFilter', async () => {
      kg.addNode(makeConceptNode('k1', 'Concept K'))
      kg.addNode(makeClaimNode('c1', 'Claim 1', 0.9))
      kg.addNode(makeClaimNode('c2', 'Claim 2', 0.8))
      kg.addEdge('k1', 'c1', makeEdge('supports'))
      // c2 is NOT connected to k1

      const tools = createKGTools(kg)
      const tool = tools.find((t) => t.name === 'kg_get_claims')!
      const result = (await tool.execute({ conceptFilter: 'k1' }, dummyContext)) as Array<{
        id: string
      }>

      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('c1')
    })

    it('respects limit parameter', async () => {
      for (let i = 0; i < 10; i++) {
        kg.addNode(makeClaimNode(`c${i}`, `Claim ${i}`, 0.5 + i / 20))
      }

      const tools = createKGTools(kg)
      const tool = tools.find((t) => t.name === 'kg_get_claims')!
      const result = (await tool.execute({ limit: 3 }, dummyContext)) as Array<{ id: string }>

      expect(result).toHaveLength(3)
    })
  })

  describe('kg_get_neighborhood', () => {
    it('returns nodes and edges within maxDepth', async () => {
      kg.addNode(makeClaimNode('c1', 'Claim 1', 0.9))
      kg.addNode(makeConceptNode('k1', 'Concept K'))
      kg.addNode(makeClaimNode('c2', 'Claim 2', 0.8))
      kg.addEdge('c1', 'k1', makeEdge('supports'))
      kg.addEdge('k1', 'c2', makeEdge('causal_link'))

      const tools = createKGTools(kg)
      const tool = tools.find((t) => t.name === 'kg_get_neighborhood')!
      const result = (await tool.execute({ nodeId: 'c1', maxDepth: 2 }, dummyContext)) as {
        nodes: Array<{ id: string }>
        edges: Array<{ source: string; target: string }>
      }

      expect(result.nodes.length).toBeGreaterThanOrEqual(2)
      expect(result.edges.length).toBeGreaterThanOrEqual(1)
    })
  })

  describe('kg_get_sources_for_claim', () => {
    it('returns source nodes for a claim', async () => {
      kg.addNode(makeClaimNode('c1', 'Claim 1', 0.9))
      kg.addNode(makeSourceNode('s1', 'Source 1', 'https://example.com', 'example.com'))
      kg.addEdge('c1', 's1', makeEdge('sourced_from'))

      const tools = createKGTools(kg)
      const tool = tools.find((t) => t.name === 'kg_get_sources_for_claim')!
      const result = (await tool.execute({ claimId: 'c1' }, dummyContext)) as Array<{
        sourceId: string
        url: string
      }>

      expect(result).toHaveLength(1)
      expect(result[0].sourceId).toBe('s1')
      expect(result[0].url).toBe('https://example.com')
    })
  })

  describe('kg_get_contradictions', () => {
    it('returns active contradictions', async () => {
      kg.addNode(makeContradictionNode('x1', 'Contradiction 1'))
      kg.addNode(makeContradictionNode('x2', 'Contradiction 2'))

      const tools = createKGTools(kg)
      const tool = tools.find((t) => t.name === 'kg_get_contradictions')!
      const result = (await tool.execute({}, dummyContext)) as Array<{ id: string }>

      expect(result).toHaveLength(2)
    })
  })

  describe('kg_shortest_path', () => {
    it('returns resolved path when path exists', async () => {
      kg.addNode(makeClaimNode('c1', 'Claim 1', 0.9))
      kg.addNode(makeConceptNode('k1', 'Concept K'))
      kg.addNode(makeClaimNode('c2', 'Claim 2', 0.8))
      kg.addEdge('c1', 'k1', makeEdge('supports'))
      kg.addEdge('k1', 'c2', makeEdge('causal_link'))

      const tools = createKGTools(kg)
      const tool = tools.find((t) => t.name === 'kg_shortest_path')!
      const result = (await tool.execute({ fromNodeId: 'c1', toNodeId: 'c2' }, dummyContext)) as {
        path: Array<{ id: string; label: string; type: string }>
      }

      expect(result.path).toBeDefined()
      expect(result.path.length).toBeGreaterThanOrEqual(2)
      expect(result.path[0].id).toBe('c1')
      expect(result.path[result.path.length - 1].id).toBe('c2')
    })

    it('returns null message when no path', async () => {
      kg.addNode(makeClaimNode('c1', 'Claim 1', 0.9))
      kg.addNode(makeClaimNode('c2', 'Claim 2', 0.8))
      // No edges between c1 and c2

      const tools = createKGTools(kg)
      const tool = tools.find((t) => t.name === 'kg_shortest_path')!
      const result = (await tool.execute({ fromNodeId: 'c1', toNodeId: 'c2' }, dummyContext)) as {
        path: null
        message: string
      }

      expect(result.path).toBeNull()
      expect(result.message).toBe('No path found')
    })
  })
})
