import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: vi.fn(() => mockDb),
}))

const mockSet = vi.fn().mockResolvedValue(undefined)
const mockUpdate = vi.fn().mockResolvedValue(undefined)
const mockDoc = vi.fn(() => ({ set: mockSet, update: mockUpdate }))
const mockGet = vi.fn().mockResolvedValue({ docs: [] })
const mockCollection = vi.fn(() => ({ get: mockGet }))
const mockDb = { doc: mockDoc, collection: mockCollection }

import { KnowledgeHypergraph } from '../knowledgeHypergraph.js'
import {
  createSupportsEdges,
  scanForResearchContradictions,
  mergeNearDuplicateConcepts,
  bridgeCausalChains,
  applyKGDiffToGraph,
} from '../deepResearch/kgEnrichment.js'
import { mapClaimsToKG } from '../deepResearch/claimExtraction.js'
import type {
  DialecticalSessionId,
  CreateClaimInput,
  EpisodeId,
  AgentId,
  ThesisLens,
  ConceptId,
  KGDiff,
  ExtractedClaim,
  SourceRecord,
} from '@lifeos/agents'
import { createBiTemporalEdge } from '@lifeos/agents'

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

const SESSION_ID = 'session-1' as DialecticalSessionId
const USER_ID = 'user-1'

describe('KG Enrichment', () => {
  let kg: KnowledgeHypergraph

  beforeEach(() => {
    vi.clearAllMocks()
    kg = new KnowledgeHypergraph(SESSION_ID, USER_ID, mockDb as never)
  })

  // =============================================
  // 4a. Supports Edge Creation
  // =============================================
  describe('createSupportsEdges', () => {
    it('creates supports edge when keyword overlap exceeds threshold', async () => {
      const c1 = await kg.addClaim(makeClaimInput('Interest rates strongly affect economic growth'))
      const c2 = await kg.addClaim(
        makeClaimInput('Interest rates influence economic growth through multiple channels', {
          sourceEpisodeId: 'episode:source:src-2' as EpisodeId,
        })
      )

      const { edgesCreated } = createSupportsEdges([c2.claimId], kg)
      expect(edgesCreated).toBeGreaterThanOrEqual(1)

      const edges = kg.getEdges(c2.claimId, c1.claimId)
      const supportsEdge = edges.find((e) => e.type === 'supports')
      expect(supportsEdge).toBeDefined()
    })

    it('does not create edge when overlap is below threshold', async () => {
      await kg.addClaim(makeClaimInput('Interest rates affect economic growth'))
      const c2 = await kg.addClaim(
        makeClaimInput('Weather patterns impact agricultural yields significantly', {
          sourceEpisodeId: 'episode:source:src-2' as EpisodeId,
        })
      )

      const { edgesCreated } = createSupportsEdges([c2.claimId], kg)
      expect(edgesCreated).toBe(0)
    })

    it('respects maxComparisons cap', async () => {
      await kg.addClaim(makeClaimInput('Interest rates affect economic growth'))
      const c2 = await kg.addClaim(
        makeClaimInput('Interest rates influence economic growth patterns', {
          sourceEpisodeId: 'episode:source:src-2' as EpisodeId,
        })
      )

      // With max 0 comparisons, no edges should be created
      const { edgesCreated } = createSupportsEdges([c2.claimId], kg, 0.35, 0)
      expect(edgesCreated).toBe(0)
    })

    it('does not create duplicate supports edges', async () => {
      const c1 = await kg.addClaim(makeClaimInput('Interest rates strongly affect economic growth'))
      const c2 = await kg.addClaim(
        makeClaimInput('Interest rates influence economic growth through channels', {
          sourceEpisodeId: 'episode:source:src-2' as EpisodeId,
        })
      )

      createSupportsEdges([c2.claimId], kg)
      const first = kg.getEdges(c2.claimId, c1.claimId).filter((e) => e.type === 'supports').length

      // Run again — should not duplicate
      createSupportsEdges([c2.claimId], kg)
      const second = kg.getEdges(c2.claimId, c1.claimId).filter((e) => e.type === 'supports').length

      expect(second).toBe(first)
    })
  })

  describe('sourced_from edge target format', () => {
    it('uses real source node ids instead of legacy episode:source:* ids', async () => {
      const sources: SourceRecord[] = [
        {
          sourceId: 'src-1',
          url: 'https://example.com/1',
          title: 'Source 1',
          domain: 'example.com',
          fetchedAtMs: Date.now(),
          fetchMethod: 'read_url',
          contentLength: 100,
          contentHash: 'hash-1',
          sourceType: 'web',
          relevanceScore: 0.9,
          sourceQualityScore: 0.8,
        },
        {
          sourceId: 'src-2',
          url: 'https://example.com/2',
          title: 'Source 2',
          domain: 'example.com',
          fetchedAtMs: Date.now(),
          fetchMethod: 'read_url',
          contentLength: 100,
          contentHash: 'hash-2',
          sourceType: 'web',
          relevanceScore: 0.9,
          sourceQualityScore: 0.8,
        },
      ]

      const duplicateClaims: ExtractedClaim[] = [
        {
          claimText: 'AI improves diagnostic accuracy',
          confidence: 0.8,
          evidenceType: 'empirical',
          sourceId: 'src-1',
          concepts: [],
        },
        {
          claimText: 'AI improves diagnostic accuracy',
          confidence: 0.7,
          evidenceType: 'empirical',
          sourceId: 'src-2',
          concepts: [],
        },
      ]

      await mapClaimsToKG(duplicateClaims, sources, kg, SESSION_ID, USER_ID)

      const claimNode = kg.getNodesByType('claim')[0]
      const sourcedEdges = kg.getOutEdges(claimNode!.id).filter((edge) => edge.data.type === 'sourced_from')

      expect(sourcedEdges).toHaveLength(2)
      expect(sourcedEdges.map((edge) => edge.target)).toEqual(expect.arrayContaining(['src-1', 'src-2']))
      expect(sourcedEdges.some((edge) => edge.target.startsWith('episode:source:'))).toBe(false)
    })
  })

  // =============================================
  // 4b. Early Contradiction Detection
  // =============================================
  describe('scanForResearchContradictions', () => {
    it('detects contradictions with opposing terms and shared concepts', async () => {
      const sharedConcept = 'concept-growth' as ConceptId
      const c1 = await kg.addClaim(
        makeClaimInput('Coffee consumption increases cognitive performance', {
          conceptIds: [sharedConcept],
        })
      )
      const c2 = await kg.addClaim(
        makeClaimInput('Coffee consumption decreases cognitive performance over time', {
          sourceEpisodeId: 'episode:source:src-2' as EpisodeId,
          conceptIds: [sharedConcept],
        })
      )

      const { contradictionEdgesCreated } = scanForResearchContradictions([c2.claimId], kg)
      expect(contradictionEdgesCreated).toBeGreaterThanOrEqual(1)

      const edges = kg.getEdges(c2.claimId, c1.claimId)
      const contradicts = edges.find((e) => e.type === 'contradicts')
      expect(contradicts).toBeDefined()
    })

    it('skips claims with no shared concepts', async () => {
      await kg.addClaim(
        makeClaimInput('Coffee consumption increases focus', {
          conceptIds: ['concept-coffee' as ConceptId],
        })
      )
      const c2 = await kg.addClaim(
        makeClaimInput('Exercise decreases stress levels', {
          sourceEpisodeId: 'episode:source:src-2' as EpisodeId,
          conceptIds: ['concept-exercise' as ConceptId],
        })
      )

      const { contradictionEdgesCreated } = scanForResearchContradictions([c2.claimId], kg)
      expect(contradictionEdgesCreated).toBe(0)
    })

    it('respects maxComparisons cap', async () => {
      const sharedConcept = 'concept-shared' as ConceptId
      await kg.addClaim(
        makeClaimInput('A increases B', { conceptIds: [sharedConcept] })
      )
      const c2 = await kg.addClaim(
        makeClaimInput('A decreases B', {
          sourceEpisodeId: 'episode:source:src-2' as EpisodeId,
          conceptIds: [sharedConcept],
        })
      )

      const { contradictionEdgesCreated } = scanForResearchContradictions([c2.claimId], kg, 0)
      expect(contradictionEdgesCreated).toBe(0)
    })

    it('does not create duplicate contradicts edges', async () => {
      const sharedConcept = 'concept-shared' as ConceptId
      const c1 = await kg.addClaim(
        makeClaimInput('Policy promotes economic growth', { conceptIds: [sharedConcept] })
      )
      const c2 = await kg.addClaim(
        makeClaimInput('Policy inhibits economic growth', {
          sourceEpisodeId: 'episode:source:src-2' as EpisodeId,
          conceptIds: [sharedConcept],
        })
      )

      scanForResearchContradictions([c2.claimId], kg)
      const first = kg.getEdges(c2.claimId, c1.claimId).filter((e) => e.type === 'contradicts').length

      scanForResearchContradictions([c2.claimId], kg)
      const second = kg.getEdges(c2.claimId, c1.claimId).filter((e) => e.type === 'contradicts').length

      expect(second).toBe(first)
    })
  })

  // =============================================
  // 4c. Fuzzy Concept Merging
  // =============================================
  describe('mergeNearDuplicateConcepts', () => {
    function addConcept(id: string, name: string, alternateNames: string[] = []) {
      kg.addNode({
        id,
        type: 'concept',
        label: name,
        temporal: createBiTemporalEdge(),
        data: {
          conceptId: id,
          sessionId: SESSION_ID,
          userId: USER_ID,
          name,
          definition: `Definition of ${name}`,
          alternateNames,
          version: 1,
          claimIds: [],
          temporal: createBiTemporalEdge(),
        } as never,
      })
    }

    it('merges multi-word concepts with high overlap', async () => {
      addConcept('concept-old', 'machine learning algorithms')
      addConcept('concept-new', 'machine learning algorithms approaches')

      const { mergesPerformed } = await mergeNearDuplicateConcepts(['concept-new'], kg, 0.5)
      expect(mergesPerformed).toBe(1)
    })

    it('skips single-token concepts to avoid false positives', async () => {
      addConcept('concept-old', 'growth')
      addConcept('concept-new', 'growth')

      const { mergesPerformed } = await mergeNearDuplicateConcepts(['concept-new'], kg)
      expect(mergesPerformed).toBe(0)
    })

    it('respects maxMerges limit', async () => {
      addConcept('concept-old-1', 'reinforcement learning techniques')
      addConcept('concept-old-2', 'neural network architectures')
      addConcept('concept-new-1', 'reinforcement learning technique approaches')
      addConcept('concept-new-2', 'neural network architecture designs')

      const { mergesPerformed } = await mergeNearDuplicateConcepts(
        ['concept-new-1', 'concept-new-2'],
        kg,
        0.5,
        1
      )
      expect(mergesPerformed).toBe(1)
    })

    it('does not merge concepts below threshold', async () => {
      addConcept('concept-old', 'deep learning neural networks')
      addConcept('concept-new', 'quantum computing algorithms')

      const { mergesPerformed } = await mergeNearDuplicateConcepts(['concept-new'], kg)
      expect(mergesPerformed).toBe(0)
    })

    it('uses alternateNames for overlap calculation', async () => {
      addConcept('concept-old', 'artificial intelligence', ['AI', 'machine intelligence'])
      addConcept('concept-new', 'machine intelligence systems')

      const { mergesPerformed } = await mergeNearDuplicateConcepts(['concept-new'], kg, 0.4)
      expect(mergesPerformed).toBe(1)
    })
  })

  // =============================================
  // 4d. Causal Chain Bridging
  // =============================================
  describe('bridgeCausalChains', () => {
    function addConceptNode(id: string, name: string) {
      kg.addNode({
        id,
        type: 'concept',
        label: name,
        temporal: createBiTemporalEdge(),
        data: { name } as never,
      })
    }

    it('creates transitive A→B→C causal edge from different sources', () => {
      addConceptNode('A', 'A')
      addConceptNode('B', 'B')
      addConceptNode('C', 'C')

      kg.addEdge('A', 'B', {
        type: 'causal_link',
        weight: 0.8,
        temporal: createBiTemporalEdge(),
        metadata: { claimId: 'claim-1' },
      })
      kg.addEdge('B', 'C', {
        type: 'causal_link',
        weight: 0.6,
        temporal: createBiTemporalEdge(),
        metadata: { claimId: 'claim-2' },
      })

      const { edgesCreated, chains } = bridgeCausalChains(kg)
      expect(edgesCreated).toBe(1)
      expect(chains).toHaveLength(1)
      expect(chains[0].path).toEqual(['A', 'B', 'C'])
    })

    it('does not bridge edges from the same source', () => {
      addConceptNode('A', 'A')
      addConceptNode('B', 'B')
      addConceptNode('C', 'C')

      kg.addEdge('A', 'B', {
        type: 'causal_link',
        weight: 0.8,
        temporal: createBiTemporalEdge(),
        metadata: { claimId: 'claim-same' },
      })
      kg.addEdge('B', 'C', {
        type: 'causal_link',
        weight: 0.6,
        temporal: createBiTemporalEdge(),
        metadata: { claimId: 'claim-same' },
      })

      const { edgesCreated } = bridgeCausalChains(kg)
      expect(edgesCreated).toBe(0)
    })

    it('avoids cycles (A→B→A)', () => {
      addConceptNode('A', 'A')
      addConceptNode('B', 'B')

      kg.addEdge('A', 'B', {
        type: 'causal_link',
        weight: 0.8,
        temporal: createBiTemporalEdge(),
        metadata: { claimId: 'claim-1' },
      })
      kg.addEdge('B', 'A', {
        type: 'causal_link',
        weight: 0.6,
        temporal: createBiTemporalEdge(),
        metadata: { claimId: 'claim-2' },
      })

      const { edgesCreated } = bridgeCausalChains(kg)
      expect(edgesCreated).toBe(0)
    })

    it('applies weight decay (0.8 factor)', () => {
      addConceptNode('A', 'A')
      addConceptNode('B', 'B')
      addConceptNode('C', 'C')

      kg.addEdge('A', 'B', {
        type: 'causal_link',
        weight: 1.0,
        temporal: createBiTemporalEdge(),
        metadata: { claimId: 'claim-1' },
      })
      kg.addEdge('B', 'C', {
        type: 'causal_link',
        weight: 0.5,
        temporal: createBiTemporalEdge(),
        metadata: { claimId: 'claim-2' },
      })

      bridgeCausalChains(kg)

      const edges = kg.getEdges('A', 'C')
      const inferred = edges.find((e) => e.type === 'causal_link')
      expect(inferred).toBeDefined()
      expect(inferred!.weight).toBeCloseTo(0.4) // min(1.0, 0.5) * 0.8 = 0.4
    })
  })

  // =============================================
  // Corroboration Boost (tested via addClaim)
  // =============================================
  describe('Corroboration confidence boost', () => {
    it('boosts confidence via noisy-OR on duplicate claim', async () => {
      await kg.addClaim(makeClaimInput('Test claim for corroboration', { confidence: 0.6 }))
      const c2 = await kg.addClaim(
        makeClaimInput('Test claim for corroboration', {
          confidence: 0.5,
          sourceEpisodeId: 'episode:source:src-2' as EpisodeId,
        })
      )

      // noisy-OR: 1 - (1 - 0.6) * (1 - 0.5) = 1 - 0.4 * 0.5 = 0.8
      expect(c2.confidence).toBeCloseTo(0.8)
    })

    it('increments corroboration count on duplicate', async () => {
      const c1 = await kg.addClaim(makeClaimInput('Count test claim'))
      expect(c1.corroborationCount).toBe(1)

      const c2 = await kg.addClaim(
        makeClaimInput('Count test claim', {
          sourceEpisodeId: 'episode:source:src-2' as EpisodeId,
        })
      )
      expect(c2.corroborationCount).toBe(2)
    })

    it('caps boosted confidence at 0.99', async () => {
      await kg.addClaim(makeClaimInput('High confidence claim', { confidence: 0.95 }))
      const c2 = await kg.addClaim(
        makeClaimInput('High confidence claim', {
          confidence: 0.95,
          sourceEpisodeId: 'episode:source:src-2' as EpisodeId,
        })
      )

      // noisy-OR: 1 - 0.05 * 0.05 = 0.9975, capped at 0.99
      expect(c2.confidence).toBeLessThanOrEqual(0.99)
    })

    it('initializes corroborationCount to 1 for new claims', async () => {
      const c1 = await kg.addClaim(makeClaimInput('Brand new claim'))
      expect(c1.corroborationCount).toBe(1)
      expect(c1.corroboratingSourceIds).toEqual([])
    })
  })

  // =============================================
  // 5. Apply KGDiff to Graph
  // =============================================
  describe('applyKGDiffToGraph', () => {
    function emptyKGDiff(): KGDiff {
      return {
        conceptSplits: [],
        conceptMerges: [],
        edgeReversals: [],
        newMediators: [],
        regimeScopings: [],
        temporalizations: [],
        newClaims: [],
        supersededClaims: [],
        newContradictions: [],
        resolvedContradictions: [],
        newPredictions: [],
      }
    }

    it('creates new claims from KGDiff', async () => {
      const diff = emptyKGDiff()
      diff.newClaims = [
        { id: 'new-1', text: 'Synthesis produced new insight about economics' },
      ]

      const before = kg.getNodesByType('claim').length
      const { applied } = await applyKGDiffToGraph(diff, kg, SESSION_ID, USER_ID)
      const after = kg.getNodesByType('claim').length

      expect(applied.newClaims).toBe(1)
      expect(after).toBe(before + 1)
    })

    it('creates predictions from KGDiff', async () => {
      const diff = emptyKGDiff()
      diff.newPredictions = [
        { id: 'pred-1', text: 'Economic growth will slow in Q3' },
      ]

      const { applied } = await applyKGDiffToGraph(diff, kg, SESSION_ID, USER_ID)
      expect(applied.newPredictions).toBe(1)

      const claims = kg.getNodesByType('claim')
      const prediction = claims.find((c) => {
        const data = c.data as { claimType?: string }
        return data.claimType === 'PREDICTION'
      })
      expect(prediction).toBeDefined()
    })

    it('supersedes claims from KGDiff', async () => {
      const claim = await kg.addClaim(makeClaimInput('Old claim to supersede'))
      const diff = emptyKGDiff()
      diff.supersededClaims = [claim.claimId]

      const { applied } = await applyKGDiffToGraph(diff, kg, SESSION_ID, USER_ID)
      expect(applied.supersededClaims).toBe(1)
    })

    it('resolves contradictions from KGDiff', async () => {
      // Add a contradiction node manually
      const contradictionId = 'contradiction:test-1'
      kg.addNode({
        id: contradictionId,
        type: 'contradiction',
        label: 'Test contradiction',
        temporal: createBiTemporalEdge(),
        data: {
          contradictionId,
          status: 'OPEN',
          type: 'SYNCHRONIC',
          severity: 'HIGH',
          description: 'Test',
          detailedAnalysis: 'Test analysis',
          claimIds: [],
          actionDistance: 1,
          discoveredInCycle: 1,
          sessionId: SESSION_ID,
          userId: USER_ID,
        } as never,
      })

      const diff = emptyKGDiff()
      diff.resolvedContradictions = [contradictionId]

      const { applied } = await applyKGDiffToGraph(diff, kg, SESSION_ID, USER_ID)
      expect(applied.resolvedContradictions).toBe(1)
    })

    it('handles missing target nodes gracefully (no crash)', async () => {
      const diff = emptyKGDiff()
      diff.supersededClaims = ['nonexistent-claim-id']
      diff.resolvedContradictions = ['nonexistent-contradiction-id']
      diff.conceptSplits = [{ from: 'nonexistent-concept', to: ['a', 'b'] }]

      const { applied } = await applyKGDiffToGraph(diff, kg, SESSION_ID, USER_ID)

      // All should be 0 since targets don't exist
      expect(applied.supersededClaims).toBe(0)
      expect(applied.resolvedContradictions).toBe(0)
      expect(applied.conceptSplits).toBe(0)
    })

    it('returns correct counts for mixed operations', async () => {
      await kg.addClaim(makeClaimInput('Existing claim for mixed test'))

      const diff = emptyKGDiff()
      diff.newClaims = [
        { id: 'nc-1', text: 'New claim from synthesis A' },
        { id: 'nc-2', text: 'New claim from synthesis B' },
      ]
      diff.newPredictions = [
        { id: 'pred-1', text: 'Prediction about future trends' },
      ]

      const { applied } = await applyKGDiffToGraph(diff, kg, SESSION_ID, USER_ID)
      expect(applied.newClaims).toBe(2)
      expect(applied.newPredictions).toBe(1)
    })

    it('applies concept splits when target exists', async () => {
      const conceptId = 'concept:to-split' as ConceptId
      kg.addNode({
        id: conceptId,
        type: 'concept',
        label: 'Economic Policy',
        temporal: createBiTemporalEdge(),
        data: {
          conceptId,
          sessionId: SESSION_ID,
          userId: USER_ID,
          name: 'Economic Policy',
          definition: 'Policies affecting the economy',
          alternateNames: [],
          version: 1,
          claimIds: [],
          temporal: createBiTemporalEdge(),
        } as never,
      })

      const diff = emptyKGDiff()
      diff.conceptSplits = [{ from: conceptId, to: ['Fiscal Policy', 'Monetary Policy'] }]

      const { applied } = await applyKGDiffToGraph(diff, kg, SESSION_ID, USER_ID)
      expect(applied.conceptSplits).toBe(1)
    })

    it('applies concept merges when targets exist', async () => {
      const ids = ['concept:merge-a', 'concept:merge-b'] as unknown as ConceptId[]
      for (const id of ids) {
        kg.addNode({
          id,
          type: 'concept',
          label: id,
          temporal: createBiTemporalEdge(),
          data: {
            conceptId: id,
            sessionId: SESSION_ID,
            userId: USER_ID,
            name: id,
            definition: `Def of ${id}`,
            alternateNames: [],
            version: 1,
            claimIds: [],
            temporal: createBiTemporalEdge(),
          } as never,
        })
      }

      const diff = emptyKGDiff()
      diff.conceptMerges = [{ from: ids, to: 'Merged Concept' }]

      const { applied } = await applyKGDiffToGraph(diff, kg, SESSION_ID, USER_ID)
      expect(applied.conceptMerges).toBe(1)
    })
  })
})
