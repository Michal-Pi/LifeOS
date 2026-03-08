/**
 * Graph Gap Analysis for Dialectical Workflows
 *
 * Lightweight gap analyzer that works on CompactGraph (not KnowledgeHypergraph).
 * Examines graph structure to identify research needs — no LLM calls,
 * purely structural analysis. Produces SearchPlans for targeted research.
 *
 * Used by retrieve_context to decide whether external search is needed
 * and what to search for based on the evolving merged knowledge graph.
 */

import type { CompactGraph, SearchPlan, RunBudget, ContradictionOutput } from '@lifeos/agents'
import { classifyQueryType, getSearchStrategy } from './searchRouter.js'
import { getBudgetPhase, canAffordOperation } from './budgetController.js'

/** Result of analyzing a CompactGraph for research needs */
export interface GraphGapResult {
  needsResearch: boolean
  searchPlan: SearchPlan | null
  rationale: string
  gapTypes: GapType[]
  researchIntensity: 'full' | 'targeted' | 'verification' | 'none'
}

export type GapType =
  | 'unresolved_contradiction'
  | 'low_confidence'
  | 'unsupported_prediction'
  | 'thin_area'
  | 'focus_area_directive'
  | 'initial_exploration'

export interface GraphGapDirectives {
  focusAreas?: string[]
  refinedGoal?: string
  contradictions?: ContradictionOutput[]
  cycleNumber: number
  budget: RunBudget
  /** User-provided context summary for enriching first-cycle search queries */
  contextSummary?: string
}

/**
 * Analyze a CompactGraph for research gaps and generate a targeted SearchPlan.
 *
 * Cycle 1 (no graph): initial exploration queries from goal text.
 * Cycle 2+: structural gap analysis on mergedGraph — contradictions,
 * low confidence, unsupported predictions, thin areas, focus directives.
 */
export function analyzeGraphGaps(
  graph: CompactGraph | null,
  goal: string,
  directives: GraphGapDirectives
): GraphGapResult {
  const effectiveGoal = directives.refinedGoal || goal

  // Budget gate
  if (!canAffordOperation(directives.budget, 0.01)) {
    return {
      needsResearch: false,
      searchPlan: null,
      rationale: 'Research budget exhausted',
      gapTypes: [],
      researchIntensity: 'none',
    }
  }

  // Cycle 1: no graph yet, do initial exploration
  if (!graph || graph.nodes.length === 0) {
    return buildInitialSearchPlan(effectiveGoal, directives.focusAreas, directives.contextSummary)
  }

  // Cycle 2+: analyze the graph for gaps
  const gaps: GapType[] = []
  const serpQueries: string[] = []
  const scholarQueries: string[] = []
  const semanticQueries: string[] = []

  // 1. Unresolved contradictions → need evidence to resolve
  const contradictEdges = graph.edges.filter(e => e.rel === 'contradicts')
  if (contradictEdges.length > 0) {
    gaps.push('unresolved_contradiction')
    for (const edge of contradictEdges.slice(0, 3)) {
      const fromNode = graph.nodes.find(n => n.id === edge.from)
      const toNode = graph.nodes.find(n => n.id === edge.to)
      if (fromNode && toNode) {
        serpQueries.push(`evidence "${fromNode.label}" vs "${toNode.label}"`)
      }
    }
  }

  // 2. Low-confidence graph → need corroboration
  if (graph.confidence < 0.6) {
    gaps.push('low_confidence')
    const claimNodes = graph.nodes.filter(n => n.type === 'claim').slice(0, 2)
    for (const node of claimNodes) {
      scholarQueries.push(`evidence "${node.label}"`)
    }
  }

  // 3. Prediction nodes → check if evidence exists for/against
  const predictions = graph.nodes.filter(n => n.type === 'prediction')
  if (predictions.length > 0) {
    gaps.push('unsupported_prediction')
    for (const pred of predictions.slice(0, 2)) {
      serpQueries.push(`${pred.label} evidence data`)
    }
  }

  // 4. Thin areas (nodes with ≤1 edge) → expand understanding
  const nodeEdgeCounts = new Map<string, number>()
  for (const node of graph.nodes) {
    nodeEdgeCounts.set(node.id, 0)
  }
  for (const edge of graph.edges) {
    nodeEdgeCounts.set(edge.from, (nodeEdgeCounts.get(edge.from) ?? 0) + 1)
    nodeEdgeCounts.set(edge.to, (nodeEdgeCounts.get(edge.to) ?? 0) + 1)
  }
  const thinNodes = graph.nodes.filter(n => (nodeEdgeCounts.get(n.id) ?? 0) <= 1)
  if (thinNodes.length > graph.nodes.length * 0.3) {
    gaps.push('thin_area')
    for (const node of thinNodes.slice(0, 2)) {
      semanticQueries.push(`${node.label} mechanisms causes effects`)
    }
  }

  // 5. Focus areas from meta-reflection → targeted queries
  if (directives.focusAreas && directives.focusAreas.length > 0) {
    gaps.push('focus_area_directive')
    for (const area of directives.focusAreas.slice(0, 3)) {
      serpQueries.push(`${area} ${effectiveGoal}`)
    }
  }

  // 6. High-severity contradictions from crystallization → need resolution evidence
  if (directives.contradictions && directives.contradictions.length > 0) {
    const highSeverity = directives.contradictions.filter(c => c.severity === 'HIGH')
    for (const c of highSeverity.slice(0, 2)) {
      serpQueries.push(`resolving: ${c.description.slice(0, 100)}`)
    }
  }

  if (gaps.length === 0) {
    return {
      needsResearch: false,
      searchPlan: null,
      rationale: 'Graph is well-supported with no gaps identified',
      gapTypes: [],
      researchIntensity: 'none',
    }
  }

  const intensity = determineIntensity(gaps, directives.budget, directives.cycleNumber)
  if (intensity === 'none') {
    return {
      needsResearch: false,
      searchPlan: null,
      rationale: 'Budget phase does not allow research',
      gapTypes: gaps,
      researchIntensity: 'none',
    }
  }

  // Apply smart search routing based on goal type
  const strategy = getSearchStrategy(classifyQueryType(effectiveGoal))

  // Limit queries based on intensity
  const serpLimit = intensity === 'full' ? 5 : intensity === 'targeted' ? 3 : 1
  const scholarLimit = intensity === 'full' ? 3 : intensity === 'targeted' ? 2 : 0
  const semanticLimit = intensity === 'full' ? 3 : intensity === 'targeted' ? 1 : 0

  return {
    needsResearch: true,
    searchPlan: {
      serpQueries: strategy.useSERP ? deduplicateQueries(serpQueries).slice(0, serpLimit) : [],
      scholarQueries: strategy.useScholar ? deduplicateQueries(scholarQueries).slice(0, scholarLimit) : [],
      semanticQueries: strategy.useSemantic ? deduplicateQueries(semanticQueries).slice(0, semanticLimit) : [],
      rationale: `Filling ${gaps.length} gap types: ${gaps.join(', ')}`,
      targetSourceCount: intensity === 'full' ? 5 : intensity === 'targeted' ? 3 : 1,
    },
    rationale: `Found ${gaps.length} research needs: ${gaps.join(', ')}`,
    gapTypes: gaps,
    researchIntensity: intensity,
  }
}

function buildInitialSearchPlan(goal: string, focusAreas?: string[], contextSummary?: string): GraphGapResult {
  const strategy = getSearchStrategy(classifyQueryType(goal))
  const serpQueries = [goal]
  const scholarQueries: string[] = []
  const semanticQueries: string[] = []

  if (strategy.useScholar) scholarQueries.push(goal)
  if (strategy.useSemantic) semanticQueries.push(goal)

  if (focusAreas) {
    for (const area of focusAreas.slice(0, 2)) {
      serpQueries.push(`${area} ${goal}`)
    }
  }

  // Extract key terms from user context to generate context-aware queries
  if (contextSummary) {
    const contextQueries = extractContextSearchTerms(contextSummary, goal)
    serpQueries.push(...contextQueries.slice(0, 2))
    if (strategy.useScholar && contextQueries.length > 0) {
      scholarQueries.push(contextQueries[0])
    }
  }

  const hasContext = !!contextSummary

  return {
    needsResearch: true,
    searchPlan: {
      serpQueries: deduplicateQueries(serpQueries).slice(0, 5),
      scholarQueries: deduplicateQueries(scholarQueries).slice(0, 3),
      semanticQueries: deduplicateQueries(semanticQueries).slice(0, 3),
      rationale: hasContext
        ? 'Initial exploration informed by user-provided context'
        : 'Initial exploration for dialectical analysis',
      targetSourceCount: 5,
    },
    rationale: hasContext
      ? 'Cycle 1: user context provided, searching for corroborating/contrasting evidence'
      : 'Cycle 1: no prior knowledge, initial research needed',
    gapTypes: ['initial_exploration'],
    researchIntensity: 'full',
  }
}

/**
 * Extract key terms/phrases from user context to generate search queries.
 * Lightweight keyword extraction — no LLM call.
 */
function extractContextSearchTerms(contextSummary: string, goal: string): string[] {
  const queries: string[] = []
  const goalWords = goal.toLowerCase()

  // Extract quoted phrases from context
  const quotedPhrases = contextSummary.match(/"([^"]{3,50})"/g)
  if (quotedPhrases) {
    queries.push(
      ...quotedPhrases
        .map(q => q.replace(/"/g, ''))
        .filter(q => !goalWords.includes(q.toLowerCase()))
        .slice(0, 2)
    )
  }

  // Find substantive sentences and use them as search seeds
  const sentences = contextSummary
    .split(/[.!?\n]/)
    .map(s => s.trim())
    .filter(s => s.length > 30 && s.length < 200)
    .slice(0, 3)

  const goalPrefix = goal.split(' ').slice(0, 3).join(' ')
  for (const sentence of sentences) {
    const core = sentence.substring(0, 100)
    if (!goalWords.includes(core.toLowerCase().substring(0, 30))) {
      queries.push(`${core} ${goalPrefix}`)
    }
  }

  return queries
}

function determineIntensity(
  gaps: GapType[],
  budget: RunBudget,
  cycleNumber: number
): 'full' | 'targeted' | 'verification' | 'none' {
  const phase = getBudgetPhase(budget)
  if (phase === 'exhausted') return 'none'
  if (phase === 'minimal') return 'verification'
  if (phase === 'reduced' || cycleNumber >= 5) return 'targeted'
  if (gaps.length >= 3 || gaps.includes('initial_exploration')) return 'full'
  return 'targeted'
}

function deduplicateQueries(queries: string[]): string[] {
  const seen = new Set<string>()
  return queries.filter(q => {
    const normalized = q.toLowerCase().trim()
    if (seen.has(normalized)) return false
    seen.add(normalized)
    return true
  })
}

// ----- Phase-Aware Research Evaluation (Phase 4) -----

/**
 * Cap a search plan to the reactive research limits.
 * Max 3 SERP, 1 Scholar, 1 Semantic, targetSourceCount ≤ 3.
 */
function capSearchPlan(plan: SearchPlan): SearchPlan {
  return {
    ...plan,
    serpQueries: plan.serpQueries.slice(0, 3),
    scholarQueries: plan.scholarQueries.slice(0, 1),
    semanticQueries: plan.semanticQueries.slice(0, 1),
    targetSourceCount: Math.min(plan.targetSourceCount, 3),
  }
}

/**
 * Evaluate whether targeted research is needed at a specific point in the
 * dialectical cycle. Wraps `analyzeGraphGaps` with phase-specific intensity
 * caps and trigger logic.
 *
 * - `pre_cycle`: Before thesis generation — triggered by focusAreas, stale/low-confidence data.
 * - `post_synthesis`: After sublation — triggered by new contradicts edges, thin areas, unsourced claims.
 *
 * Non-Phase-1 research is always `targeted` or `verification` intensity — never `full`.
 */
export function evaluateResearchNeed(
  graph: CompactGraph | null,
  goal: string,
  directives: GraphGapDirectives,
  phase: 'pre_cycle' | 'post_synthesis',
): GraphGapResult {
  // Budget exhaustion gate
  const budgetPhase = getBudgetPhase(directives.budget)
  if (budgetPhase === 'exhausted') {
    return {
      needsResearch: false,
      searchPlan: null,
      rationale: 'Budget exhausted',
      gapTypes: [],
      researchIntensity: 'none',
    }
  }

  // Use analyzeGraphGaps as the base evaluation
  const baseResult = analyzeGraphGaps(graph, goal, directives)

  // If no research needed from base analysis, return as-is
  if (!baseResult.needsResearch) {
    return baseResult
  }

  if (phase === 'pre_cycle') {
    // Pre-cycle: targeted intensity only, cap the plan
    return {
      ...baseResult,
      researchIntensity: 'targeted',
      searchPlan: baseResult.searchPlan ? capSearchPlan(baseResult.searchPlan) : null,
    }
  }

  // post_synthesis: verification intensity, add contradiction-driven gaps
  const gapTypes = [...baseResult.gapTypes]

  // Scan for HIGH severity contradictions
  if (directives.contradictions && directives.contradictions.length > 0) {
    const highSeverity = directives.contradictions.filter(c => c.severity === 'HIGH')
    if (highSeverity.length > 0 && !gapTypes.includes('unresolved_contradiction')) {
      gapTypes.push('unresolved_contradiction')
    }
  }

  return {
    ...baseResult,
    gapTypes,
    researchIntensity: 'verification',
    searchPlan: baseResult.searchPlan ? capSearchPlan(baseResult.searchPlan) : null,
  }
}
