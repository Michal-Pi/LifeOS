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
import type { ProviderExecuteFn } from './claimExtraction.js'
import { createLogger } from '../../lib/logger.js'

const log = createLogger('GapAnalysis')

// ----- Prompts -----

const GAP_ANALYSIS_SYSTEM_PROMPT = `You are a knowledge gap analyst. Given a research query and a summary of the current knowledge graph state, identify what is missing, uncertain, or contradicted.

Focus on:
1. Claims supported by only one source (fragile evidence)
2. Important subtopics not yet covered
3. Unresolved contradictions that need more evidence
4. Areas where confidence is low
5. Missing perspectives (only one viewpoint exists)

For each gap, suggest specific search queries that would help fill it.

Output valid JSON only, no markdown fences.`

function buildGapAnalysisPrompt(query: string, kgSummary: string): string {
  return `Research query: "${query}"

Current knowledge graph state:
${kgSummary}

Analyze the gaps in the current knowledge and respond with JSON:
{
  "gaps": [
    {
      "description": "What is missing or uncertain",
      "missingEvidenceFor": ["concept or claim names"],
      "uncertaintyScore": 0.0-1.0,
      "suggestedQueries": ["specific search queries"],
      "priority": "high" | "medium" | "low"
    }
  ],
  "overallCoverageScore": 0.0-1.0,
  "shouldContinue": true/false
}`
}

// ----- Main Analysis -----

/**
 * Analyze the knowledge graph for gaps and produce follow-up search queries.
 */
export async function analyzeKnowledgeGaps(
  kg: KnowledgeHypergraph,
  query: string,
  executeProvider: ProviderExecuteFn,
  budget: RunBudget
): Promise<{ result: GapAnalysisResult; updatedBudget: RunBudget }> {
  let currentBudget = { ...budget }

  // Build KG summary for the LLM
  const kgSummary = buildKGSummary(kg)

  const estimatedCost = estimateLLMCost('gpt-5-mini', kgSummary.length / 4 + 200, 800)
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
      result.newSearchPlan = buildSearchPlanFromGaps(result.gaps)
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
  lines.push('')

  // Top claims (by confidence)
  const sortedClaims = claims
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
    .slice(0, 15)

  lines.push('## Top Claims')
  for (const claim of sortedClaims) {
    const sourceCount = kg
      .getOutEdges(claim.id)
      .filter((e) => e.data.type === 'sourced_from').length
    lines.push(`- [c=${claim.confidence.toFixed(2)}, sources=${sourceCount}] ${claim.text}`)
  }
  lines.push('')

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
