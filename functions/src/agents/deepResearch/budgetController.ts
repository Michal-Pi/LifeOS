/**
 * Deep Research Budget Controller
 *
 * Pure function module for per-run budget tracking and phase-based depth control.
 * Budget phases control how aggressively the system searches, fetches, and processes sources.
 *
 * Phase thresholds (% of maxBudgetUsd spent):
 *   full:      0-60%   → full depth, all sources
 *   reduced:  60-80%   → fewer sources, shallower recursive learning
 *   minimal:  80-95%   → snippets only, essential operations
 *   exhausted: 95-100% → no new operations, proceed to answer
 */

import type { BudgetPhase, RunBudget, GapAnalysisResult } from '@lifeos/agents'
import { MODEL_PRICING } from '@lifeos/agents'

// ----- Constants -----

/** Phase transition thresholds as fraction of maxBudgetUsd spent */
const PHASE_THRESHOLDS: Record<BudgetPhase, number> = {
  full: 0,
  reduced: 0.6,
  minimal: 0.8,
  exhausted: 0.95,
}

/** Max recursive learning depth per budget phase */
const DEPTH_LIMITS: Record<BudgetPhase, number> = {
  full: 3,
  reduced: 2,
  minimal: 1,
  exhausted: 0,
}

/** Max sources to fetch per gap iteration per budget phase */
const MAX_SOURCES_PER_ITERATION: Record<BudgetPhase, number> = {
  full: 10,
  reduced: 5,
  minimal: 2,
  exhausted: 0,
}

/** Relevance threshold for source ingestion per budget phase (higher = pickier) */
export const RELEVANCE_THRESHOLDS: Record<BudgetPhase, number> = {
  full: 0.5,
  reduced: 0.7,
  minimal: 0.9,
  exhausted: 1.1, // effectively never passes
}

/** Estimated cost per search tool call (conservative) */
const AVG_SEARCH_COST_USD = 0.002

/** Estimated average LLM cost per call for budget planning */
const AVG_LLM_COST_USD = 0.02

// ----- Budget Creation -----

/**
 * Create an initial RunBudget for a deep research run.
 */
export function createRunBudget(
  maxBudgetUsd: number,
  searchDepth: 'shallow' | 'standard' | 'deep' = 'standard'
): RunBudget {
  const depthMultiplier = searchDepth === 'shallow' ? 0.5 : searchDepth === 'deep' ? 2.0 : 1.0
  const maxSearchCalls = Math.floor(((maxBudgetUsd * 0.3) / AVG_SEARCH_COST_USD) * depthMultiplier)

  return {
    maxBudgetUsd,
    spentUsd: 0,
    spentTokens: 0,
    searchCallsUsed: 0,
    maxSearchCalls: Math.max(5, maxSearchCalls), // at least 5 searches
    llmCallsUsed: 0,
    phase: 'full',
    maxRecursiveDepth: DEPTH_LIMITS.full,
    gapIterationsUsed: 0,
  }
}

// ----- Phase Calculation -----

/**
 * Determine the current budget phase based on spend.
 */
export function getBudgetPhase(budget: RunBudget): BudgetPhase {
  if (budget.maxBudgetUsd <= 0) return 'exhausted'

  const spentFraction = budget.spentUsd / budget.maxBudgetUsd

  if (spentFraction >= PHASE_THRESHOLDS.exhausted) return 'exhausted'
  if (spentFraction >= PHASE_THRESHOLDS.minimal) return 'minimal'
  if (spentFraction >= PHASE_THRESHOLDS.reduced) return 'reduced'
  return 'full'
}

// ----- Spend Recording -----

/**
 * Record a spend event and update the budget phase.
 * Returns a new budget object (immutable).
 */
export function recordSpend(
  budget: RunBudget,
  costUsd: number,
  tokens: number,
  type: 'llm' | 'search'
): RunBudget {
  const updated: RunBudget = {
    ...budget,
    spentUsd: budget.spentUsd + costUsd,
    spentTokens: budget.spentTokens + tokens,
    searchCallsUsed: type === 'search' ? budget.searchCallsUsed + 1 : budget.searchCallsUsed,
    llmCallsUsed: type === 'llm' ? budget.llmCallsUsed + 1 : budget.llmCallsUsed,
  }

  // Recalculate phase and depth
  updated.phase = getBudgetPhase(updated)
  updated.maxRecursiveDepth = DEPTH_LIMITS[updated.phase]

  return updated
}

// ----- Pre-operation Checks -----

/**
 * Check if the budget can afford an estimated operation cost.
 */
export function canAffordOperation(budget: RunBudget, estimatedCostUsd: number): boolean {
  return budget.spentUsd + estimatedCostUsd <= budget.maxBudgetUsd
}

/**
 * Estimate cost of an LLM call based on model pricing.
 */
export function estimateLLMCost(
  modelName: string,
  estimatedInputTokens: number,
  estimatedOutputTokens: number
): number {
  const pricing = MODEL_PRICING[modelName] ?? MODEL_PRICING['default']
  return (
    (estimatedInputTokens * pricing.input) / 1_000_000 +
    (estimatedOutputTokens * pricing.output) / 1_000_000
  )
}

/**
 * Get max number of sources to fetch for the current budget phase.
 */
export function getMaxSourcesForPhase(budget: RunBudget): number {
  return MAX_SOURCES_PER_ITERATION[budget.phase]
}

/**
 * Get the relevance threshold for source ingestion at the current budget phase.
 */
export function getRelevanceThreshold(budget: RunBudget): number {
  return RELEVANCE_THRESHOLDS[budget.phase]
}

// ----- Loop Control -----

/**
 * Determine if the gap analysis loop should continue.
 */
export function shouldContinueGapLoop(
  budget: RunBudget,
  gapResult: GapAnalysisResult,
  maxGapIterations: number
): boolean {
  if (budget.phase === 'exhausted') return false
  if (budget.gapIterationsUsed >= maxGapIterations) return false
  if (!gapResult.shouldContinue) return false
  if (gapResult.overallCoverageScore >= 0.85) return false
  return true
}

/**
 * Record a gap iteration and return updated budget.
 */
export function recordGapIteration(budget: RunBudget): RunBudget {
  return {
    ...budget,
    gapIterationsUsed: budget.gapIterationsUsed + 1,
  }
}

// ----- Estimation -----

/**
 * Estimate how many more operations the remaining budget can support.
 */
export function estimateRemainingOperations(budget: RunBudget): {
  llmCalls: number
  searchCalls: number
} {
  const remaining = Math.max(0, budget.maxBudgetUsd - budget.spentUsd)
  return {
    llmCalls: Math.floor(remaining / AVG_LLM_COST_USD),
    searchCalls: Math.max(0, budget.maxSearchCalls - budget.searchCallsUsed),
  }
}
