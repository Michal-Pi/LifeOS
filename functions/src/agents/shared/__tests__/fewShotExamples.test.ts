import { describe, expect, it } from 'vitest'

import {
  CompactGraphSchema,
  NegationOutputSchema,
  GraphSublationOutputSchema,
} from '../../langgraph/structuredOutputSchemas.js'
import {
  COMPACT_GRAPH_EXAMPLE,
  NEGATION_OUTPUT_EXAMPLE,
  SUBLATION_OUTPUT_EXAMPLE,
  META_REFLECTION_EXAMPLE,
  CLAIM_EXTRACTION_EXAMPLE,
  BATCH_CLAIM_EXTRACTION_EXAMPLE,
  GAP_ANALYSIS_EXAMPLE,
  ANSWER_GENERATION_EXAMPLE,
  SENSE_MAKING_EXAMPLE,
  SYNTHESIS_NEGATION_EXAMPLE,
} from '../fewShotExamples.js'

describe('fewShotExamples', () => {
  it('COMPACT_GRAPH_EXAMPLE validates against CompactGraphSchema', () => {
    const parsed = JSON.parse(COMPACT_GRAPH_EXAMPLE)
    const result = CompactGraphSchema.safeParse(parsed)
    expect(result.success).toBe(true)
  })

  it('NEGATION_OUTPUT_EXAMPLE validates against NegationOutputSchema', () => {
    const parsed = JSON.parse(NEGATION_OUTPUT_EXAMPLE)
    const result = NegationOutputSchema.safeParse(parsed)
    expect(result.success).toBe(true)
  })

  it('SUBLATION_OUTPUT_EXAMPLE validates against GraphSublationOutputSchema', () => {
    const parsed = JSON.parse(SUBLATION_OUTPUT_EXAMPLE)
    const result = GraphSublationOutputSchema.safeParse(parsed)
    expect(result.success).toBe(true)
  })

  it('META_REFLECTION_EXAMPLE is valid JSON with required fields', () => {
    const parsed = JSON.parse(META_REFLECTION_EXAMPLE)
    expect(parsed).toHaveProperty('decision')
    expect(parsed).toHaveProperty('reasoning')
    expect(['CONTINUE', 'TERMINATE', 'RESPECIFY']).toContain(parsed.decision)
  })

  it('CLAIM_EXTRACTION_EXAMPLE is valid JSON with claims array', () => {
    const parsed = JSON.parse(CLAIM_EXTRACTION_EXAMPLE)
    expect(parsed).toHaveProperty('claims')
    expect(Array.isArray(parsed.claims)).toBe(true)
    expect(parsed.claims.length).toBeGreaterThan(0)
    for (const claim of parsed.claims) {
      expect(claim).toHaveProperty('claimText')
      expect(claim).toHaveProperty('confidence')
      expect(claim).toHaveProperty('evidenceType')
      expect(claim).toHaveProperty('sourceQuote')
      expect(claim).toHaveProperty('concepts')
    }
  })

  it('BATCH_CLAIM_EXTRACTION_EXAMPLE includes sourceIndex', () => {
    const parsed = JSON.parse(BATCH_CLAIM_EXTRACTION_EXAMPLE)
    expect(parsed).toHaveProperty('claims')
    expect(Array.isArray(parsed.claims)).toBe(true)
    for (const claim of parsed.claims) {
      expect(claim).toHaveProperty('sourceIndex')
      expect(typeof claim.sourceIndex).toBe('number')
    }
  })

  it('GAP_ANALYSIS_EXAMPLE is valid JSON with required fields', () => {
    const parsed = JSON.parse(GAP_ANALYSIS_EXAMPLE)
    expect(parsed).toHaveProperty('gaps')
    expect(parsed).toHaveProperty('overallCoverageScore')
    expect(parsed).toHaveProperty('shouldContinue')
    expect(Array.isArray(parsed.gaps)).toBe(true)
    for (const gap of parsed.gaps) {
      expect(gap).toHaveProperty('description')
      expect(gap).toHaveProperty('suggestedQueries')
      expect(gap).toHaveProperty('priority')
    }
  })

  it('ANSWER_GENERATION_EXAMPLE is valid JSON with required fields', () => {
    const parsed = JSON.parse(ANSWER_GENERATION_EXAMPLE)
    expect(parsed).toHaveProperty('directAnswer')
    expect(parsed).toHaveProperty('supportingClaims')
    expect(parsed).toHaveProperty('counterclaims')
    expect(parsed).toHaveProperty('openUncertainties')
    expect(parsed).toHaveProperty('confidenceAssessment')
    expect(parsed).toHaveProperty('citations')
    expect(parsed).toHaveProperty('knowledgeGraphSummary')
  })

  it('SENSE_MAKING_EXAMPLE is valid JSON with required fields', () => {
    const parsed = JSON.parse(SENSE_MAKING_EXAMPLE)
    expect(parsed).toHaveProperty('canonicalGoal')
    expect(parsed).toHaveProperty('coreQuestion')
    expect(parsed).toHaveProperty('subquestions')
    expect(parsed).toHaveProperty('keyConcepts')
    expect(parsed).toHaveProperty('verificationTargets')
    expect(parsed).toHaveProperty('plannerRationale')
    expect(parsed).toHaveProperty('searchPlan')
    expect(parsed.searchPlan).toHaveProperty('serpQueries')
    expect(parsed.searchPlan).toHaveProperty('scholarQueries')
    expect(parsed.searchPlan).toHaveProperty('semanticQueries')
    expect(parsed.searchPlan).toHaveProperty('targetSourceCount')
  })

  it('SYNTHESIS_NEGATION_EXAMPLE is valid JSON with required fields', () => {
    const parsed = JSON.parse(SYNTHESIS_NEGATION_EXAMPLE)
    expect(parsed).toHaveProperty('critiques')
    expect(parsed).toHaveProperty('missingElements')
    expect(parsed).toHaveProperty('overreaches')
    expect(parsed).toHaveProperty('proposedRefinements')
    expect(Array.isArray(parsed.proposedRefinements)).toBe(true)
    for (const r of parsed.proposedRefinements) {
      expect(r).toHaveProperty('type')
      expect(r).toHaveProperty('target')
      expect(r).toHaveProperty('rationale')
    }
  })
})
