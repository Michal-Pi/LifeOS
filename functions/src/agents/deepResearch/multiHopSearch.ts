/**
 * Phase 46 — Multi-Hop Search
 *
 * Generates targeted follow-up sub-questions from gap analysis results
 * and executes recursive search with a max hop limit.
 */

import type { RunBudget } from '@lifeos/agents'

export interface GapItem {
  description: string
  missingEvidenceFor: string[]
  uncertaintyScore: number
  suggestedQueries: string[]
  priority: 'high' | 'medium' | 'low'
}

export interface GapAnalysisResult {
  gaps: GapItem[]
  overallCoverageScore: number
  shouldContinue: boolean
}

export interface MultiHopSearchResult {
  subQuestions: string[]
  hopsUsed: number
  budgetExhausted: boolean
}

/**
 * Extract targeted sub-questions from gap analysis results.
 *
 * Filters to high/medium priority gaps and generates specific follow-up
 * queries that are more targeted than the original.
 *
 * @param gaps - Gap analysis result with identified knowledge gaps
 * @param originalQuery - The original research query for context
 * @param maxQuestions - Maximum number of sub-questions to generate (default 5)
 * @returns Array of targeted sub-question strings
 */
export function extractSubQuestions(
  gaps: GapAnalysisResult,
  originalQuery: string,
  maxQuestions: number = 5
): string[] {
  if (gaps.gaps.length === 0) return []

  // Filter to actionable gaps (high/medium priority)
  const actionableGaps = gaps.gaps
    .filter((g) => g.priority === 'high' || g.priority === 'medium')
    .sort((a, b) => b.uncertaintyScore - a.uncertaintyScore)

  // Collect suggested queries from gaps, dedup, limit
  const seen = new Set<string>()
  const subQuestions: string[] = []

  for (const gap of actionableGaps) {
    for (const query of gap.suggestedQueries) {
      const normalized = query.trim().toLowerCase()
      // Skip if too similar to original query
      if (normalized === originalQuery.trim().toLowerCase()) continue
      if (seen.has(normalized)) continue
      seen.add(normalized)
      subQuestions.push(query.trim())
      if (subQuestions.length >= maxQuestions) return subQuestions
    }

    // If gap has no suggested queries, synthesize one from description
    if (gap.suggestedQueries.length === 0 && gap.description) {
      const synthesized = `${gap.description} (evidence for: ${gap.missingEvidenceFor.join(', ')})`
      if (!seen.has(synthesized.toLowerCase())) {
        seen.add(synthesized.toLowerCase())
        subQuestions.push(synthesized)
        if (subQuestions.length >= maxQuestions) return subQuestions
      }
    }
  }

  return subQuestions
}

/**
 * Check if multi-hop search should continue based on budget and hop limit.
 *
 * @param currentHop - Current hop number (0-indexed)
 * @param maxHops - Maximum number of hops allowed
 * @param budget - Current budget state
 * @returns Whether to continue searching
 */
export function shouldContinueMultiHop(
  currentHop: number,
  maxHops: number,
  budget: RunBudget
): boolean {
  if (currentHop >= maxHops) return false
  if (budget.phase === 'exhausted') return false
  if (budget.spentUsd >= budget.maxBudgetUsd * 0.9) return false
  return true
}

/**
 * Plan a multi-hop search from gap analysis results.
 *
 * Returns sub-questions and hop metadata without executing searches
 * (execution happens in the graph pipeline via executeSearchPlan).
 *
 * @param originalQuery - The original research query
 * @param gaps - Gap analysis results
 * @param budget - Current budget state
 * @param maxHops - Maximum hop depth (default 2)
 * @returns Multi-hop search plan with sub-questions
 */
export function planMultiHopSearch(
  originalQuery: string,
  gaps: GapAnalysisResult,
  budget: RunBudget,
  maxHops: number = 2,
  currentHop: number = 0
): MultiHopSearchResult {
  if (!shouldContinueMultiHop(currentHop, maxHops, budget)) {
    return {
      subQuestions: [],
      hopsUsed: currentHop,
      budgetExhausted: budget.phase === 'exhausted',
    }
  }

  const subQuestions = extractSubQuestions(gaps, originalQuery)

  return {
    subQuestions,
    hopsUsed: currentHop + 1,
    budgetExhausted: false,
  }
}
