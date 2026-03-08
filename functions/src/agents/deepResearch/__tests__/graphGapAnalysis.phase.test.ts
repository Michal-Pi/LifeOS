/**
 * Tests for evaluateResearchNeed — Phase 4 phase-aware research evaluation.
 *
 * Verifies:
 * - pre_cycle phase returns targeted intensity
 * - post_synthesis phase returns verification intensity
 * - Search plan caps are enforced (3 SERP, 1 Scholar, 1 Semantic)
 * - Budget exhaustion returns no research
 * - Never returns 'full' intensity
 */

import { describe, it, expect, vi } from 'vitest'

// Mock searchRouter (used by analyzeGraphGaps internally)
vi.mock('../searchRouter.js', () => ({
  classifyQueryType: vi.fn().mockReturnValue('exploratory'),
  getSearchStrategy: vi.fn().mockReturnValue({
    useSERP: true,
    useScholar: true,
    useSemantic: true,
    priority: 'serp',
  }),
}))

// Mock budgetController
vi.mock('../budgetController.js', () => ({
  getBudgetPhase: vi.fn((budget: { phase: string }) => budget.phase),
  canAffordOperation: vi.fn((budget: { phase: string }) => budget.phase !== 'exhausted'),
}))

import { evaluateResearchNeed } from '../graphGapAnalysis.js'
import type { CompactGraph, RunBudget, ContradictionOutput } from '@lifeos/agents'

function makeHealthyBudget(): RunBudget {
  return {
    maxBudgetUsd: 5,
    spentUsd: 1,
    spentTokens: 1000,
    searchCallsUsed: 2,
    maxSearchCalls: 20,
    llmCallsUsed: 3,
    phase: 'full',
    maxRecursiveDepth: 3,
    gapIterationsUsed: 0,
  }
}

function makeExhaustedBudget(): RunBudget {
  return {
    ...makeHealthyBudget(),
    spentUsd: 4.9,
    phase: 'exhausted',
  }
}

function makeGraph(opts?: {
  lowConfidence?: boolean
  withContradicts?: boolean
  thin?: boolean
}): CompactGraph {
  const nodes: CompactGraph['nodes'] = [
    { id: 'n1', label: 'Claim about economics', type: 'claim' },
    { id: 'n2', label: 'Claim about technology', type: 'claim' },
    { id: 'n3', label: 'Mechanism of growth', type: 'mechanism' },
  ]
  const edges: CompactGraph['edges'] = [
    { from: 'n1', to: 'n3', rel: 'causes', weight: 0.8 },
    { from: 'n2', to: 'n3', rel: 'supports', weight: 0.7 },
  ]

  if (opts?.withContradicts) {
    edges.push({ from: 'n1', to: 'n2', rel: 'contradicts', weight: 0.9 })
  }

  if (opts?.thin) {
    // Add isolated nodes with no edges to make >30% thin
    nodes.push(
      { id: 'n4', label: 'Isolated A', type: 'concept' },
      { id: 'n5', label: 'Isolated B', type: 'concept' },
      { id: 'n6', label: 'Isolated C', type: 'concept' }
    )
  }

  return {
    nodes,
    edges,
    summary: 'Test graph',
    confidence: opts?.lowConfidence ? 0.3 : 0.85,
    regime: 'test',
    temporalGrain: 'medium-term',
    reasoning: '',
  }
}

function makeHighSeverityContradiction(): ContradictionOutput {
  return {
    id: 'c1',
    type: 'SYNCHRONIC',
    severity: 'HIGH',
    description: 'Fundamental disagreement about economic growth model',
    participatingClaims: ['claim1', 'claim2'],
    trackerAgent: 'tracker1',
    actionDistance: 1,
  }
}

describe('evaluateResearchNeed', () => {
  describe('pre_cycle phase', () => {
    it('returns targeted research when focusAreas present', () => {
      const result = evaluateResearchNeed(
        makeGraph(),
        'test goal',
        {
          cycleNumber: 2,
          budget: makeHealthyBudget(),
          focusAreas: ['economic impact'],
        },
        'pre_cycle'
      )
      expect(result.needsResearch).toBe(true)
      expect(result.researchIntensity).toBe('targeted')
    })

    it('caps search plan to 3 SERP, 1 Scholar, 1 Semantic', () => {
      const result = evaluateResearchNeed(
        makeGraph({ lowConfidence: true, thin: true }),
        'test',
        {
          cycleNumber: 2,
          budget: makeHealthyBudget(),
          focusAreas: ['area1', 'area2', 'area3', 'area4', 'area5'],
        },
        'pre_cycle'
      )
      if (result.searchPlan) {
        expect(result.searchPlan.serpQueries.length).toBeLessThanOrEqual(3)
        expect(result.searchPlan.scholarQueries.length).toBeLessThanOrEqual(1)
        expect(result.searchPlan.semanticQueries.length).toBeLessThanOrEqual(1)
        expect(result.searchPlan.targetSourceCount).toBeLessThanOrEqual(3)
      }
    })

    it('returns no research when budget exhausted', () => {
      const result = evaluateResearchNeed(
        makeGraph(),
        'test',
        {
          cycleNumber: 2,
          budget: makeExhaustedBudget(),
        },
        'pre_cycle'
      )
      expect(result.needsResearch).toBe(false)
      expect(result.researchIntensity).toBe('none')
    })

    it('returns targeted even when base analysis returns full', () => {
      // Cycle 1 with no graph would normally return 'full'
      const result = evaluateResearchNeed(
        null,
        'new exploratory topic',
        {
          cycleNumber: 1,
          budget: makeHealthyBudget(),
        },
        'pre_cycle'
      )
      expect(result.researchIntensity).toBe('targeted')
    })
  })

  describe('post_synthesis phase', () => {
    it('returns verification research for unresolved contradictions', () => {
      const result = evaluateResearchNeed(
        makeGraph({ withContradicts: true }),
        'test',
        {
          cycleNumber: 2,
          budget: makeHealthyBudget(),
          contradictions: [makeHighSeverityContradiction()],
        },
        'post_synthesis'
      )
      expect(result.needsResearch).toBe(true)
      expect(result.researchIntensity).toBe('verification')
      expect(result.gapTypes).toContain('unresolved_contradiction')
    })

    it('returns no research when graph has no gaps', () => {
      // Well-covered graph: high confidence, no contradicts, all nodes well-connected, no predictions
      const wellCovered: CompactGraph = {
        nodes: [
          { id: 'n1', label: 'Claim A', type: 'claim' },
          { id: 'n2', label: 'Claim B', type: 'claim' },
          { id: 'n3', label: 'Mechanism C', type: 'mechanism' },
        ],
        edges: [
          { from: 'n1', to: 'n2', rel: 'supports', weight: 0.9 },
          { from: 'n1', to: 'n3', rel: 'causes', weight: 0.8 },
          { from: 'n2', to: 'n3', rel: 'supports', weight: 0.85 },
        ],
        summary: 'Well covered',
        confidence: 0.9,
        regime: 'stable',
        temporalGrain: 'medium-term',
        reasoning: '',
      }
      const result = evaluateResearchNeed(
        wellCovered,
        'test',
        {
          cycleNumber: 2,
          budget: makeHealthyBudget(),
        },
        'post_synthesis'
      )
      expect(result.needsResearch).toBe(false)
    })

    it('returns no research when budget exhausted', () => {
      const result = evaluateResearchNeed(
        makeGraph({ withContradicts: true }),
        'test',
        {
          cycleNumber: 2,
          budget: makeExhaustedBudget(),
          contradictions: [makeHighSeverityContradiction()],
        },
        'post_synthesis'
      )
      expect(result.needsResearch).toBe(false)
    })
  })

  it('never returns full intensity from non-Phase-1 research', () => {
    // Even with null graph (initial exploration), should cap at targeted/verification
    const preCycle = evaluateResearchNeed(
      null,
      'test',
      {
        cycleNumber: 1,
        budget: makeHealthyBudget(),
      },
      'pre_cycle'
    )
    expect(preCycle.researchIntensity).not.toBe('full')

    const postSynthesis = evaluateResearchNeed(
      null,
      'test',
      {
        cycleNumber: 1,
        budget: makeHealthyBudget(),
      },
      'post_synthesis'
    )
    expect(postSynthesis.researchIntensity).not.toBe('full')
  })
})
