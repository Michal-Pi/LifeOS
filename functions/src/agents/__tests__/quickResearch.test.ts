/**
 * Quick Research Mode Tests — Phase 25
 *
 * Tests the routing function that determines whether quick mode
 * skips claim extraction and dialectical phases.
 */

import { describe, it, expect } from 'vitest'
import { routeAfterSearch } from '../langgraph/deepResearchGraph.js'
import type { DeepResearchRunConfig } from '@lifeos/agents'

describe('Quick Research Mode routing', () => {
  it('quick mode routes to answer_generation, skipping claim extraction', () => {
    const result = routeAfterSearch({} as never, 'quick')
    expect(result).toBe('answer_generation')
  })

  it('full mode routes to claim_extraction', () => {
    const result = routeAfterSearch({} as never, 'full')
    expect(result).toBe('claim_extraction')
  })

  it('quick mode config disables dialectical cycles and gap iterations', () => {
    const quickConfig: DeepResearchRunConfig = {
      query: 'simple question',
      maxBudgetUsd: 2,
      searchDepth: 'shallow',
      includeAcademic: false,
      includeSemanticSearch: false,
      thesisLenses: [],
      maxGapIterations: 0,
      maxDialecticalCycles: 0,
      mode: 'quick',
    }

    // Quick mode should skip dialectical phases and gap iterations
    expect(quickConfig.thesisLenses).toHaveLength(0)
    expect(quickConfig.maxDialecticalCycles).toBe(0)
    expect(quickConfig.maxGapIterations).toBe(0)
    // Verify routing matches
    expect(routeAfterSearch({} as never, quickConfig.mode!)).toBe('answer_generation')
  })

  it('full mode config with lenses routes through claim extraction', () => {
    const fullConfig: DeepResearchRunConfig = {
      query: 'complex research topic',
      maxBudgetUsd: 10,
      searchDepth: 'deep',
      includeAcademic: true,
      includeSemanticSearch: true,
      thesisLenses: ['economic', 'systems', 'adversarial'],
      maxGapIterations: 3,
      maxDialecticalCycles: 2,
      mode: 'full',
    }

    expect(routeAfterSearch({} as never, fullConfig.mode!)).toBe('claim_extraction')
    expect(fullConfig.thesisLenses.length).toBeGreaterThan(0)
  })
})
