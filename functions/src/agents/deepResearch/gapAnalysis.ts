/**
 * Gap Analysis Module
 *
 * Examines the current state of the KnowledgeHypergraph and identifies:
 * - Claims with single-source support (fragile)
 * - Concepts referenced in the query but not yet covered
 * - Unresolved contradictions needing evidence
 * - Low-confidence areas
 * - Topics where only one viewpoint exists
 *
 * Produces follow-up search queries to fill gaps and computes an overall
 * coverage score to decide whether to continue the research loop.
 */

import type { GapAnalysisResult, GapItem, SearchPlan, RunBudget } from '@lifeos/agents'
import type { KnowledgeHypergraph } from '../knowledgeHypergraph.js'
import { recordSpend, estimateLLMCost, canAffordOperation } from './budgetController.js'
import { planMultiHopSearch } from './multiHopSearch.js'
import type { ProviderExecuteFn } from './claimExtraction.js'
import { createLogger } from '../../lib/logger.js'

const log = createLogger('GapAnalysis')

// ----- Prompts -----

const GAP_ANALYSIS_SYSTEM_PROMPT = `CRITICAL: Output valid JSON only. No markdown fences, no explanation, no preamble.

## Role
You are a knowledge gap analyst specializing in identifying weaknesses, blind spots, and fragile evidence within a research knowledge graph.

## Task
Given a research query and the current knowledge graph state, identify what is missing, uncertain, or contradicted. For each gap, suggest specific search queries that would fill it.

## Gap Categories (evaluate all five)
1. Fragile evidence: Claims supported by only one source.
2. Uncovered subtopics: Important aspects of the query not yet addressed.
3. Unresolved contradictions: Conflicting claims that need more evidence to adjudicate.
4. Low-confidence areas: Claims where the evidence language is hedged or uncertain.
5. Missing perspectives: Topics where only one viewpoint or methodology is represented.

## Rules
1. Every gap must include at least one actionable search query to fill it.
2. Prioritize gaps that would most improve the overall answer quality.
3. Set shouldContinue to false only when coverage is genuinely sufficient (>=0.8) or all gaps are low-priority.
4. If you are uncertain about whether a gap exists, include it with a lower priority rather than omitting it.

CRITICAL (restated): Output valid JSON only. No other text.`

function buildGapAnalysisPrompt(query: string, kgSummary: string): string {
  return `## Research Query
"${query}"

## Current Knowledge Graph State
${kgSummary}

## Task
Analyze the knowledge graph for gaps across all five categories (fragile evidence, uncovered subtopics, unresolved contradictions, low-confidence areas, missing perspectives).

## Output Schema
{
  "gaps": [
    {
      "description": "What is missing, uncertain, or contradicted",
      "missingEvidenceFor": ["Specific concept or claim names that lack sufficient evidence"],
      "uncertaintyScore": 0.0-1.0,
      "suggestedQueries": ["Specific, actionable search queries to fill this gap"],
      "priority": "high | medium | low"
    }
  ],
  "overallCoverageScore": 0.0-1.0,
  "shouldContinue": true or false
}

## Scoring Guidance
- overallCoverageScore: 0.0 = no coverage, 0.5 = partial, 0.8+ = sufficient for a comprehensive answer.
- shouldContinue: true when high-priority gaps remain and additional research would meaningfully improve the answer.
- priority: "high" = gap would significantly change the answer, "medium" = gap would add useful nuance, "low" = gap is minor or tangential.`
}

// ----- Main Analysis -----

/**
 * Analyze the knowledge graph for gaps and produce follow-up search queries.
 */
export async function analyzeKnowledgeGaps(
  kg: KnowledgeHypergraph,
  query: string,
  executeProvider: ProviderExecuteFn,
  budget: RunBudget,
  /** Maximum multi-hop depth for follow-up searches (Phase 46, default 2) */
  maxMultiHopDepth: number = 2,
  modelName?: string,
): Promise<{ result: GapAnalysisResult; updatedBudget: RunBudget }> {
  let currentBudget = { ...budget }

  // Build KG summary for the LLM
  const kgSummary = buildKGSummary(kg)

  const costModel = modelName ?? 'generic-llm'
  if (!modelName) {
    log.debug('Gap analysis cost estimate using fallback model', { modelName: costModel })
  }
  const estimatedCost = estimateLLMCost(costModel, kgSummary.length / 4 + 200, 800)
  if (!canAffordOperation(currentBudget, estimatedCost)) {
    return {
      result: {
        gaps: [],
        overallCoverageScore: 0.5,
        shouldContinue: false,
      },
      updatedBudget: currentBudget,
    }
  }

  try {
    const output = await executeProvider(
      GAP_ANALYSIS_SYSTEM_PROMPT,
      buildGapAnalysisPrompt(query, kgSummary)
    )

    currentBudget = recordSpend(currentBudget, estimatedCost, kgSummary.length / 4 + 1000, 'llm')

    const result = parseGapAnalysisResult(output)

    // If continuing, build a search plan from gap suggestions
    if (result.shouldContinue && result.gaps.length > 0) {
      const basePlan = buildSearchPlanFromGaps(result.gaps)

      // Phase 46: Enrich with multi-hop sub-questions for deeper coverage
      const multiHop = planMultiHopSearch(query, result, currentBudget, maxMultiHopDepth)
      if (multiHop.subQuestions.length > 0) {
        basePlan.serpQueries.push(...multiHop.subQuestions.slice(0, 3))
        log.info('Multi-hop sub-questions added', {
          count: multiHop.subQuestions.length,
          hop: multiHop.hopsUsed,
        })
      }

      result.newSearchPlan = basePlan
    }

    log.info('Gap analysis complete', {
      gapCount: result.gaps.length,
      coverageScore: result.overallCoverageScore,
      shouldContinue: result.shouldContinue,
    })

    return { result, updatedBudget: currentBudget }
  } catch (err) {
    log.warn('Gap analysis failed', { error: String(err) })
    return {
      result: {
        gaps: [],
        overallCoverageScore: 0.5,
        shouldContinue: false,
      },
      updatedBudget: currentBudget,
    }
  }
}

// ----- KG Summary Builder -----

function buildKGSummary(kg: KnowledgeHypergraph): string {
  const stats = kg.getStats()
  const claims = kg.getNodesByType('claim')
  const concepts = kg.getNodesByType('concept')
  const contradictions = kg.getActiveContradictions()
  const sources = kg.getNodesByType('source')

  const lines: string[] = []

  lines.push(`## Knowledge Graph Summary`)
  lines.push(`- Claims: ${stats.nodesByType.claim}`)
  lines.push(`- Concepts: ${stats.nodesByType.concept}`)
  lines.push(`- Sources: ${stats.nodesByType.source}`)
  lines.push(`- Active contradictions: ${contradictions.length}`)
  // Count supports edges across all claims
  const supportsEdgeCount = claims.reduce((sum, n) => {
    return sum + kg.getOutEdges(n.id).filter((e) => e.data.type === 'supports').length
  }, 0)
  lines.push(`- Supports edges: ${supportsEdgeCount}`)
  lines.push('')

  // Tiered claims: top 15 by confidence (full detail) + bottom 10 (brief, most likely to have gaps)
  const allMappedClaims = claims
    .map((n) => {
      const data = n.data as unknown as Record<string, unknown>
      return {
        id: n.id,
        text: String(data.text ?? n.label),
        confidence: Number(data.confidence ?? 0.5),
        conceptIds: (data.conceptIds as string[]) ?? [],
      }
    })
    .sort((a, b) => b.confidence - a.confidence)

  const topClaims = allMappedClaims.slice(0, 15)
  const bottomClaims = allMappedClaims.length > 15
    ? allMappedClaims.slice(-Math.min(10, allMappedClaims.length - 15))
    : []

  lines.push('## Top Claims (highest confidence, well-supported)')
  for (const claim of topClaims) {
    const outEdges = kg.getOutEdges(claim.id)
    const sourceCount = outEdges.filter((e) => e.data.type === 'sourced_from').length
    const data = kg.getNode(claim.id)?.data as Record<string, unknown> | undefined
    const corr = Number(data?.corroborationCount ?? 1)
    const supCount = outEdges.filter((e) => e.data.type === 'supports').length
    lines.push(`- [c=${claim.confidence.toFixed(2)}, sources=${sourceCount}, corr=${corr}, supports=${supCount}] ${claim.text}`)
  }
  lines.push('')

  if (bottomClaims.length > 0) {
    lines.push('## Weakest Claims (lowest confidence, most likely to have gaps)')
    for (const claim of bottomClaims) {
      lines.push(`- [c=${claim.confidence.toFixed(2)}] ${claim.text}`)
    }
    lines.push('')
  }

  // Concepts
  lines.push('## Concepts')
  for (const concept of concepts.slice(0, 20)) {
    lines.push(`- ${concept.label}`)
  }
  lines.push('')

  // Active contradictions
  if (contradictions.length > 0) {
    lines.push('## Active Contradictions')
    for (const c of contradictions.slice(0, 5)) {
      const data = c.data as unknown as Record<string, unknown>
      lines.push(`- [${data.type}/${data.severity}] ${c.label}`)
    }
    lines.push('')
  }

  // Sources
  lines.push('## Sources')
  for (const source of sources.slice(0, 10)) {
    const data = source.data as unknown as Record<string, unknown>
    lines.push(`- ${data.title ?? source.label} (${data.domain ?? 'unknown'})`)
  }

  return lines.join('\n')
}

// ----- Parsing -----

function parseGapAnalysisResult(output: string): GapAnalysisResult {
  try {
    const jsonMatch = output.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return { gaps: [], overallCoverageScore: 0.5, shouldContinue: false }
    }

    const parsed = JSON.parse(jsonMatch[0]) as {
      gaps?: Array<{
        description?: string
        missingEvidenceFor?: string[]
        uncertaintyScore?: number
        suggestedQueries?: string[]
        priority?: string
      }>
      overallCoverageScore?: number
      shouldContinue?: boolean
    }

    const gaps: GapItem[] = (parsed.gaps ?? [])
      .filter((g) => g.description)
      .map((g) => ({
        description: g.description!,
        missingEvidenceFor: Array.isArray(g.missingEvidenceFor) ? g.missingEvidenceFor : [],
        uncertaintyScore: Math.min(1, Math.max(0, Number(g.uncertaintyScore) || 0.5)),
        suggestedQueries: Array.isArray(g.suggestedQueries) ? g.suggestedQueries : [],
        priority: (['high', 'medium', 'low'].includes(g.priority ?? '') ? g.priority : 'medium') as
          | 'high'
          | 'medium'
          | 'low',
      }))

    return {
      gaps,
      overallCoverageScore: Math.min(1, Math.max(0, Number(parsed.overallCoverageScore) || 0.5)),
      shouldContinue: Boolean(parsed.shouldContinue),
    }
  } catch (err) {
    log.warn('Failed to parse gap analysis output', { error: String(err) })
    return { gaps: [], overallCoverageScore: 0.5, shouldContinue: false }
  }
}

// ----- Search Plan from Gaps -----

function buildSearchPlanFromGaps(gaps: GapItem[]): SearchPlan {
  const serpQueries: string[] = []
  const scholarQueries: string[] = []
  const semanticQueries: string[] = []

  // Sort gaps by priority
  const sorted = [...gaps].sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 }
    return order[a.priority] - order[b.priority]
  })

  for (const gap of sorted.slice(0, 5)) {
    for (const query of gap.suggestedQueries.slice(0, 2)) {
      // Route queries by intent
      if (query.toLowerCase().includes('study') || query.toLowerCase().includes('research')) {
        scholarQueries.push(query)
      } else if (query.toLowerCase().includes('review') || query.toLowerCase().includes('survey')) {
        semanticQueries.push(query)
      } else {
        serpQueries.push(query)
      }
    }
  }

  return {
    serpQueries: serpQueries.slice(0, 5),
    scholarQueries: scholarQueries.slice(0, 3),
    semanticQueries: semanticQueries.slice(0, 3),
    rationale: `Filling ${gaps.length} knowledge gaps (${gaps.filter((g) => g.priority === 'high').length} high priority)`,
    targetSourceCount: Math.min(10, gaps.length * 2),
  }
}
