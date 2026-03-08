import { describe, it, expect } from 'vitest'
import {
  extractSubQuestions,
  shouldContinueMultiHop,
  planMultiHopSearch,
} from '../deepResearch/multiHopSearch.js'
import type { RunBudget } from '@lifeos/agents'

const makeBudget = (overrides: Partial<RunBudget> = {}): RunBudget => ({
  maxBudgetUsd: 10,
  spentUsd: 2,
  spentTokens: 5000,
  searchCallsUsed: 5,
  maxSearchCalls: 20,
  llmCallsUsed: 3,
  phase: 'full',
  maxRecursiveDepth: 3,
  gapIterationsUsed: 0,
  ...overrides,
})

const makeGaps = (
  gaps: Array<{ priority: 'high' | 'medium' | 'low'; queries: string[] }> = [],
  overallCoverage = 0.5
) => ({
  gaps: gaps.map((g, i) => ({
    description: `Gap ${i + 1}`,
    missingEvidenceFor: [`claim-${i}`],
    uncertaintyScore: g.priority === 'high' ? 0.9 : g.priority === 'medium' ? 0.5 : 0.2,
    suggestedQueries: g.queries,
    priority: g.priority,
  })),
  overallCoverageScore: overallCoverage,
  shouldContinue: overallCoverage < 0.8,
})

describe('Phase 46 — extractSubQuestions', () => {
  it('extracts sub-questions from high/medium priority gaps', () => {
    const gaps = makeGaps([
      { priority: 'high', queries: ['What are the effects of X?'] },
      { priority: 'medium', queries: ['How does Y compare?'] },
      { priority: 'low', queries: ['Trivia about Z'] },
    ])
    const result = extractSubQuestions(gaps, 'original query')
    expect(result).toContain('What are the effects of X?')
    expect(result).toContain('How does Y compare?')
    expect(result).not.toContain('Trivia about Z')
  })

  it('deduplicates queries', () => {
    const gaps = makeGaps([
      { priority: 'high', queries: ['same query', 'Same Query'] },
      { priority: 'medium', queries: ['same query'] },
    ])
    const result = extractSubQuestions(gaps, 'original')
    expect(result).toHaveLength(1)
  })

  it('skips queries identical to original', () => {
    const gaps = makeGaps([{ priority: 'high', queries: ['Original Query'] }])
    const result = extractSubQuestions(gaps, 'original query')
    expect(result).toHaveLength(0)
  })

  it('returns empty array for no gaps', () => {
    const gaps = makeGaps([])
    const result = extractSubQuestions(gaps, 'anything')
    expect(result).toHaveLength(0)
  })

  it('limits to maxQuestions', () => {
    const gaps = makeGaps([
      { priority: 'high', queries: ['Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6', 'Q7'] },
    ])
    const result = extractSubQuestions(gaps, 'original', 3)
    expect(result).toHaveLength(3)
  })

  it('synthesizes query from gap description when no suggested queries', () => {
    const gaps = makeGaps([{ priority: 'high', queries: [] }])
    const result = extractSubQuestions(gaps, 'original')
    expect(result).toHaveLength(1)
    expect(result[0]).toContain('Gap 1')
  })
})

describe('Phase 46 — shouldContinueMultiHop', () => {
  it('stops at maxHops', () => {
    expect(shouldContinueMultiHop(2, 2, makeBudget())).toBe(false)
  })

  it('stops when budget exhausted', () => {
    expect(shouldContinueMultiHop(0, 2, makeBudget({ phase: 'exhausted' }))).toBe(false)
  })

  it('stops when 90% of budget spent', () => {
    expect(shouldContinueMultiHop(0, 2, makeBudget({ spentUsd: 9.5 }))).toBe(false)
  })

  it('continues when under limits', () => {
    expect(shouldContinueMultiHop(0, 2, makeBudget())).toBe(true)
  })

  it('continues at hop 1 of 2 with budget', () => {
    expect(shouldContinueMultiHop(1, 2, makeBudget())).toBe(true)
  })
})

describe('Phase 46 — planMultiHopSearch', () => {
  it('produces sub-questions from gaps', () => {
    const gaps = makeGaps([{ priority: 'high', queries: ['Follow-up Q1'] }])
    const result = planMultiHopSearch('original', gaps, makeBudget(), 2, 0)
    expect(result.subQuestions).toContain('Follow-up Q1')
    expect(result.hopsUsed).toBe(1)
    expect(result.budgetExhausted).toBe(false)
  })

  it('returns empty sub-questions when max hops reached', () => {
    const gaps = makeGaps([{ priority: 'high', queries: ['Q1'] }])
    const result = planMultiHopSearch('original', gaps, makeBudget(), 2, 2)
    expect(result.subQuestions).toHaveLength(0)
    expect(result.hopsUsed).toBe(2)
  })

  it('marks budget exhausted when applicable', () => {
    const gaps = makeGaps([{ priority: 'high', queries: ['Q1'] }])
    const result = planMultiHopSearch('original', gaps, makeBudget({ phase: 'exhausted' }), 2, 0)
    expect(result.budgetExhausted).toBe(true)
    expect(result.subQuestions).toHaveLength(0)
  })
})
