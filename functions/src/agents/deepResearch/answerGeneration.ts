/**
 * Answer Generation Module
 *
 * Assembles the final DeepResearchAnswer from:
 * - KnowledgeHypergraph state (claims, concepts, contradictions, sources)
 * - Dialectical synthesis output (preserved/negated elements)
 * - Budget and iteration metadata
 *
 * Uses a strong model (opus/gpt-5) for final answer quality.
 */

import type {
  DeepResearchAnswer,
  RunBudget,
  SublationOutput,
  ContradictionOutput,
  CounterclaimResult,
  SourceRecord,
  CompactGraph,
  ThesisOutput,
  NegationOutput,
} from '@lifeos/agents'
import { validateEvidenceType } from '@lifeos/agents'
import type { KnowledgeHypergraph } from '../knowledgeHypergraph.js'
import { recordSpend, canAffordOperation, estimateLLMCost } from './budgetController.js'
import type { ProviderExecuteFn } from './claimExtraction.js'
import { createLogger } from '../../lib/logger.js'

const log = createLogger('AnswerGeneration')

// ----- Prompts -----

const ANSWER_SYSTEM_PROMPT = `CRITICAL: Output valid JSON only. No markdown fences, no explanation, no preamble.

## Role
You are a senior research synthesizer who produces structured, well-cited answers from knowledge graph evidence. You are intellectually rigorous, creative in connecting ideas, and uncompromising on source traceability.

## Rules
1. EVERY factual claim in directAnswer MUST include an inline citation with the actual source URL — use [sourceId](url) format. NEVER write vague attributions like "sources suggest", "research indicates", or "the evidence shows" without a specific source.
2. Clearly distinguish high-confidence claims (multiple corroborating sources) from low-confidence claims (single source). Show confidence levels inline.
3. Present counterclaims and unresolved contradictions honestly — do not hide disagreement. Show the tension between competing views.
4. When dialectical reasoning (theses/negations) is provided, use it to generate novel insights by synthesizing opposing perspectives. Don't just list points — reason through the dialectical tension to arrive at creative, non-obvious conclusions.
5. Identify remaining uncertainties explicitly in the openUncertainties field.
6. If the evidence is insufficient to answer part of the query, state that directly rather than speculating.
7. Prioritize accuracy over validation. If the evidence contradicts a commonly held view, say so with evidence.
8. Use the causal chains and graph structure to explain WHY things are connected, not just WHAT is connected.
9. For each supportingClaim, the sources array must contain actual URLs (not source IDs). Map sourceIds to their URLs using the Source Attribution Map.

CRITICAL (restated): Output valid JSON only. No other text.`

function buildAnswerPrompt(
  query: string,
  kgSummary: string,
  synthesisContext: string,
  contradictionContext: string,
  counterclaimContext?: string,
  rawSourceContext?: string,
  dialecticalContext?: string,
  graphStructureContext?: string
): string {
  return `## Research Query
"${query}"

## Evidence Base
${kgSummary}

${rawSourceContext ?? ''}

${graphStructureContext ?? ''}

${dialecticalContext ?? ''}

${synthesisContext}

${contradictionContext}

${counterclaimContext ?? ''}

## Task
Synthesize all evidence above into a comprehensive, well-cited research answer.

CRITICAL CITATION RULES:
1. Every factual claim in directAnswer MUST cite its source using [sourceId](url) format — e.g. [src_1](https://example.com).
2. If you cannot attribute a claim to a specific source, explicitly say "based on the knowledge graph analysis" and explain the logical chain.
3. When multiple sources agree, cite all of them: [src_1](url1), [src_2](url2).
4. For claims derived from dialectical reasoning (thesis/negation interplay), explain the reasoning chain rather than citing a source.
5. Never write vague attributions like "sources suggest" or "research indicates" — be specific.

## Output Schema
{
  "directAnswer": "A clear, well-supported answer with inline citations [sourceId](url) (3-5 paragraphs)",
  "supportingClaims": [
    {
      "claimText": "An atomic claim supporting the answer",
      "confidence": 0.0-1.0,
      "sources": ["source URLs — actual URLs, not IDs"],
      "evidenceType": "empirical|theoretical|meta_analysis|statistical|expert_opinion|anecdotal|review"
    }
  ],
  "counterclaims": [
    {
      "claimText": "A claim that challenges the main answer",
      "confidence": 0.0-1.0,
      "sources": ["source URLs"]
    }
  ],
  "openUncertainties": ["Areas where evidence is insufficient or conflicting"],
  "confidenceAssessment": {
    "overall": 0.0-1.0,
    "byTopic": { "topic_name": 0.0-1.0 }
  },
  "citations": [
    {
      "sourceId": "source ID",
      "url": "source URL",
      "title": "source title",
      "relevance": "How this source contributed"
    }
  ],
  "knowledgeGraphSummary": {
    "claimCount": 0,
    "conceptCount": 0,
    "contradictionCount": 0,
    "resolvedCount": 0
  }
}`
}

// ----- Main Generation -----

/**
 * Options for additional context passed to answer generation.
 */
export interface AnswerGenerationOptions {
  /** Counterclaim results from the counterclaim_search phase */
  counterclaims?: CounterclaimResult[]
  /** Raw source records for fallback when KG is empty (e.g. quick mode) */
  rawSources?: SourceRecord[]
  /** Source content map for fallback when KG is empty (e.g. quick mode) */
  rawSourceContentMap?: Record<string, string>
  /** Merged CompactGraph — the full serialized knowledge graph */
  mergedGraph?: CompactGraph | null
  /** Theses from dialectical reasoning (current cycle) */
  theses?: ThesisOutput[]
  /** Negations from dialectical reasoning (current cycle) */
  negations?: NegationOutput[]
  /** Actual model used for answer generation when available */
  modelName?: string
}

/**
 * Generate the final structured answer from KG state and dialectical outputs.
 */
export async function generateAnswer(
  kg: KnowledgeHypergraph,
  query: string,
  executeProvider: ProviderExecuteFn,
  budget: RunBudget,
  synthesis?: SublationOutput | null,
  contradictions?: ContradictionOutput[],
  options?: AnswerGenerationOptions
): Promise<{ answer: DeepResearchAnswer; updatedBudget: RunBudget }> {
  let currentBudget = { ...budget }

  const kgSummary = buildDetailedKGSummary(kg)
  const synthesisContext = formatSynthesisContext(synthesis)
  const contradictionContext = formatContradictionContext(contradictions ?? [])
  const counterclaimContext = formatCounterclaimResults(options?.counterclaims ?? [])
  const dialecticalContext = formatDialecticalContext(options?.theses, options?.negations)
  const graphStructureContext = formatGraphStructure(options?.mergedGraph)

  // When KG is empty (e.g. quick mode), fall back to raw source content
  const kgStats = kg.getStats()
  const kgIsEmpty = kgStats.nodesByType.claim === 0 && kgStats.nodesByType.source === 0
  const rawSourceContext =
    kgIsEmpty && options?.rawSources?.length
      ? formatRawSourceContext(options.rawSources, options.rawSourceContentMap ?? {})
      : ''
  const totalPromptLen =
    kgSummary.length +
    synthesisContext.length +
    contradictionContext.length +
    counterclaimContext.length +
    dialecticalContext.length +
    graphStructureContext.length +
    rawSourceContext.length +
    query.length
  const costModel = options?.modelName ?? 'generic-llm'
  if (!options?.modelName) {
    log.debug('Answer generation cost estimate using fallback model', { modelName: costModel })
  }
  const estimatedCost = estimateLLMCost(costModel, totalPromptLen / 4 + 300, 2000)

  if (!canAffordOperation(currentBudget, estimatedCost)) {
    throw new Error('Budget insufficient for answer generation')
  }

  const output = await executeProvider(
    ANSWER_SYSTEM_PROMPT,
    buildAnswerPrompt(
      query,
      kgSummary,
      synthesisContext,
      contradictionContext,
      counterclaimContext,
      rawSourceContext,
      dialecticalContext,
      graphStructureContext
    )
  )

  currentBudget = recordSpend(currentBudget, estimatedCost, totalPromptLen / 4 + 2000, 'llm')

  const answer = parseAnswerResult(output, kg)

  log.info('Answer generation complete', {
    supportingClaims: answer.supportingClaims.length,
    counterclaims: answer.counterclaims.length,
    citations: answer.citations.length,
    confidence: answer.confidenceAssessment.overall,
  })

  return { answer, updatedBudget: currentBudget }
}

// ----- KG Summary for Answer Generation -----

function buildDetailedKGSummary(kg: KnowledgeHypergraph): string {
  const stats = kg.getStats()
  const claims = kg.getNodesByType('claim')
  const sources = kg.getNodesByType('source')
  const contradictions = kg.getActiveContradictions()

  const lines: string[] = []

  lines.push('## Evidence Base')
  lines.push(
    `Claims: ${stats.nodesByType.claim}, Sources: ${stats.nodesByType.source}, Contradictions: ${contradictions.length}`
  )
  lines.push('')

  // Claims ranked by confidence and source count
  const rankedClaims = claims
    .map((n) => {
      const data = n.data as unknown as Record<string, unknown>
      const sourceEdges = kg.getOutEdges(n.id).filter((e) => e.data.type === 'sourced_from')
      const sourceNodes = sourceEdges
        .map((e) => {
          const srcNode = kg.getNode(e.target)
          return srcNode ? (srcNode.data as unknown as Record<string, unknown>) : null
        })
        .filter(Boolean)

      return {
        id: n.id,
        text: String(data.text ?? n.label),
        confidence: Number(data.confidence ?? 0.5),
        evidenceType: String(data.epistemicType ?? 'theoretical'),
        sourceCount: sourceEdges.length,
        sourceQuote: data.qualifiers
          ? String((data.qualifiers as Record<string, unknown>).sourceQuote ?? '')
          : '',
        sourceUrls: sourceNodes.map((s) => String((s as Record<string, unknown>).url ?? '')),
        sourceTitles: sourceNodes.map((s) => String((s as Record<string, unknown>).title ?? '')),
      }
    })
    .sort((a, b) => {
      // Sort by confidence * sourceCount (most robust first)
      const scoreA = a.confidence * (1 + a.sourceCount * 0.5)
      const scoreB = b.confidence * (1 + b.sourceCount * 0.5)
      return scoreB - scoreA
    })

  lines.push('## Claims (ranked by evidence strength)')
  for (const claim of rankedClaims.slice(0, 50)) {
    const singleSourceMarker = claim.sourceCount < 2 ? ' [single-source]' : ''
    lines.push(
      `- [confidence=${claim.confidence.toFixed(2)}, sources=${claim.sourceCount}, type=${claim.evidenceType}] ${claim.text}${singleSourceMarker}`
    )
    if (claim.sourceQuote) {
      lines.push(`  Quote: "${claim.sourceQuote.substring(0, 200)}"`)
    }
    for (let i = 0; i < claim.sourceUrls.length; i++) {
      const url = claim.sourceUrls[i]
      const title = claim.sourceTitles[i] || 'unknown'
      if (url) {
        lines.push(`  Source: [${title}](${url})`)
      }
    }
  }
  if (rankedClaims.length > 50) {
    lines.push(`  ... and ${rankedClaims.length - 50} additional claims`)
  }
  lines.push('')

  // Contradictions
  if (contradictions.length > 0) {
    lines.push('## Active Contradictions')
    for (const c of contradictions.slice(0, 8)) {
      const data = c.data as unknown as Record<string, unknown>
      lines.push(`- [${data.type}/${data.severity}] ${c.label}`)
    }
    lines.push('')
  }

  // Source list
  lines.push('## Sources')
  for (const source of sources.slice(0, 15)) {
    const data = source.data as unknown as Record<string, unknown>
    const scholar = data.scholarMetadata as Record<string, unknown> | undefined
    const scholarInfo = scholar
      ? ` (${scholar.authors ? (scholar.authors as string[]).join(', ') : ''} ${scholar.year ?? ''}, cited ${scholar.citations ?? '?'}x)`
      : ''
    lines.push(
      `- [${source.id}] ${data.title ?? source.label} | ${data.url ?? 'no url'} | ${data.sourceType ?? 'web'}${scholarInfo}`
    )
  }

  return lines.join('\n')
}

// ----- Context Formatters -----

function formatSynthesisContext(synthesis: SublationOutput | null | undefined): string {
  if (!synthesis) return '## Dialectical Synthesis\nNo synthesis available.'

  const lines = ['## Dialectical Synthesis']

  if (synthesis.preservedElements.length > 0) {
    lines.push('### Preserved Elements')
    for (const e of synthesis.preservedElements) {
      lines.push(`- ${e}`)
    }
  }

  if (synthesis.negatedElements.length > 0) {
    lines.push('### Negated Elements')
    for (const e of synthesis.negatedElements) {
      lines.push(`- ${e}`)
    }
  }

  if (synthesis.newClaims.length > 0) {
    lines.push('### New Claims from Synthesis')
    for (const c of synthesis.newClaims) {
      lines.push(`- [confidence=${c.confidence.toFixed(2)}] ${c.text}`)
    }
  }

  return lines.join('\n')
}

function formatContradictionContext(contradictions: ContradictionOutput[]): string {
  if (contradictions.length === 0) {
    return '## Contradictions\nNo contradictions detected.'
  }

  const resolved = contradictions.filter((c) => c.severity === 'LOW')
  const unresolved = contradictions.filter((c) => c.severity !== 'LOW')

  const lines = ['## Contradictions']
  lines.push(
    `Total: ${contradictions.length} (${resolved.length} resolved, ${unresolved.length} unresolved)`
  )

  if (unresolved.length > 0) {
    lines.push('### Unresolved — these tensions should be addressed in the answer')
    for (const c of unresolved) {
      lines.push(`- [${c.severity}] ${c.type}: ${c.description}`)
      if (c.participatingClaims && c.participatingClaims.length > 0) {
        lines.push(`  Involved claims: ${c.participatingClaims.join(', ')}`)
      }
    }
  }

  if (resolved.length > 0) {
    lines.push('### Resolved')
    for (const c of resolved) {
      lines.push(`- ${c.description}`)
    }
  }

  return lines.join('\n')
}

function formatCounterclaimResults(counterclaims: CounterclaimResult[]): string {
  if (counterclaims.length === 0) return ''

  const lines = ['## Counterclaim Analysis']
  lines.push(`Found ${counterclaims.length} counterclaim(s) challenging extracted claims.\n`)

  const byStrength = {
    strong: counterclaims.filter((c) => c.strength === 'strong'),
    moderate: counterclaims.filter((c) => c.strength === 'moderate'),
    weak: counterclaims.filter((c) => c.strength === 'weak'),
  }

  for (const [strength, items] of Object.entries(byStrength)) {
    if (items.length === 0) continue
    lines.push(`### ${strength.charAt(0).toUpperCase() + strength.slice(1)} Counterclaims`)
    for (const cc of items) {
      lines.push(`- [against claim ${cc.originalClaimId}] ${cc.counterargument}`)
      if (cc.evidenceBasis) {
        lines.push(`  Evidence basis: ${cc.evidenceBasis}`)
      }
    }
  }

  return lines.join('\n')
}

function formatDialecticalContext(
  theses?: ThesisOutput[],
  negations?: NegationOutput[]
): string {
  if ((!theses || theses.length === 0) && (!negations || negations.length === 0)) return ''

  const lines = ['## Dialectical Reasoning (Thesis-Antithesis Analysis)']
  lines.push('The following competing perspectives were generated and stress-tested:\n')

  if (theses && theses.length > 0) {
    lines.push('### Theses')
    for (const t of theses) {
      lines.push(`#### Thesis [${t.lens}] (confidence: ${t.confidence.toFixed(2)})`)
      lines.push(`Unit of analysis: ${t.unitOfAnalysis}`)
      lines.push(`Temporal grain: ${t.temporalGrain}`)
      if (t.causalModel.length > 0) {
        lines.push('Causal model:')
        for (const cm of t.causalModel.slice(0, 5)) {
          lines.push(`  - ${cm}`)
        }
      }
      if (t.falsificationCriteria.length > 0) {
        lines.push('Falsification criteria:')
        for (const fc of t.falsificationCriteria.slice(0, 3)) {
          lines.push(`  - ${fc}`)
        }
      }
      if (t.decisionImplications.length > 0) {
        lines.push('Decision implications:')
        for (const di of t.decisionImplications.slice(0, 3)) {
          lines.push(`  - ${di}`)
        }
      }
      if (t.regimeAssumptions.length > 0) {
        lines.push('Regime assumptions:')
        for (const ra of t.regimeAssumptions.slice(0, 3)) {
          lines.push(`  - ${ra}`)
        }
      }
      lines.push('')
    }
  }

  if (negations && negations.length > 0) {
    lines.push('### Negations (Critical Challenges)')
    for (const n of negations) {
      lines.push(`#### Challenge to [${n.targetThesisAgentId}]`)
      lines.push(`Rewrite operator: ${n.rewriteOperator}`)
      if (n.rivalFraming) {
        lines.push(`Rival framing: ${n.rivalFraming}`)
      }
      if (n.internalTensions.length > 0) {
        lines.push('Internal tensions identified:')
        for (const t of n.internalTensions.slice(0, 3)) {
          lines.push(`  - ${t}`)
        }
      }
      if (n.categoryAttacks.length > 0) {
        lines.push('Category attacks:')
        for (const ca of n.categoryAttacks.slice(0, 3)) {
          lines.push(`  - ${ca}`)
        }
      }
      if (n.preservedValid.length > 0) {
        lines.push('Preserved as valid:')
        for (const pv of n.preservedValid.slice(0, 3)) {
          lines.push(`  - ${pv}`)
        }
      }
      lines.push('')
    }
  }

  return lines.join('\n')
}

function formatGraphStructure(graph?: CompactGraph | null): string {
  if (!graph || graph.nodes.length === 0) return ''

  const lines = ['## Knowledge Graph Structure']
  lines.push(`Graph: ${graph.nodes.length} nodes, ${graph.edges.length} edges`)
  lines.push(`Summary: ${graph.summary}`)
  lines.push(`Confidence: ${graph.confidence.toFixed(2)}, Regime: ${graph.regime}`)
  lines.push('')

  // Show key relationships — the causal and contradiction structure
  const causalEdges = graph.edges.filter(e => e.rel === 'causes')
  const contradictEdges = graph.edges.filter(e => e.rel === 'contradicts')
  const supportEdges = graph.edges.filter(e => e.rel === 'supports')

  const nodeMap = new Map(graph.nodes.map(n => [n.id, n]))

  if (causalEdges.length > 0) {
    lines.push('### Causal Chains')
    for (const e of causalEdges.slice(0, 15)) {
      const from = nodeMap.get(e.from)
      const to = nodeMap.get(e.to)
      if (from && to) {
        const srcInfo = from.sourceUrl ? ` [${from.sourceUrl}]` : ''
        lines.push(`- "${from.label}" → causes → "${to.label}"${srcInfo}`)
      }
    }
    lines.push('')
  }

  if (contradictEdges.length > 0) {
    lines.push('### Contradictions in Graph')
    for (const e of contradictEdges.slice(0, 10)) {
      const from = nodeMap.get(e.from)
      const to = nodeMap.get(e.to)
      if (from && to) {
        lines.push(`- "${from.label}" contradicts "${to.label}"`)
      }
    }
    lines.push('')
  }

  if (supportEdges.length > 0) {
    lines.push('### Supporting Evidence Chains')
    for (const e of supportEdges.slice(0, 15)) {
      const from = nodeMap.get(e.from)
      const to = nodeMap.get(e.to)
      if (from && to) {
        const srcInfo = from.sourceUrl ? ` [${from.sourceUrl}]` : ''
        lines.push(`- "${from.label}" supports "${to.label}"${srcInfo}`)
      }
    }
    lines.push('')
  }

  // List nodes with source attribution for traceability
  const sourcedNodes = graph.nodes.filter(n => n.sourceUrl)
  if (sourcedNodes.length > 0) {
    lines.push('### Source Attribution Map')
    for (const n of sourcedNodes.slice(0, 30)) {
      lines.push(`- [${n.id}] "${n.label}" (${n.type}) → ${n.sourceUrl}`)
    }
    lines.push('')
  }

  return lines.join('\n')
}

function formatRawSourceContext(
  sources: SourceRecord[],
  contentMap: Record<string, string>
): string {
  if (sources.length === 0) return ''

  const lines = ['## Raw Source Evidence (quick mode — no KG available)']
  lines.push(
    `${sources.length} source(s) were fetched. Use these directly as evidence.\n`
  )

  for (const source of sources.slice(0, 15)) {
    const content = contentMap[source.sourceId] ?? ''
    lines.push(`### ${source.title || source.url}`)
    lines.push(`- URL: ${source.url}`)
    lines.push(`- Type: ${source.sourceType}`)
    if (source.relevanceScore != null) {
      lines.push(`- Relevance: ${source.relevanceScore.toFixed(2)}`)
    }
    if (content) {
      // Truncate content to avoid blowing up the prompt
      const truncated = content.length > 2000 ? content.substring(0, 2000) + '...' : content
      lines.push(`- Content snippet:\n${truncated}`)
    }
    lines.push('')
  }

  return lines.join('\n')
}

// ----- Parsing -----

function parseAnswerResult(
  output: string,
  kg: KnowledgeHypergraph,
): DeepResearchAnswer {
  const jsonMatch = output.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    throw new Error('Answer output did not contain JSON')
  }

  const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>
  if (typeof parsed.directAnswer !== 'string' || parsed.directAnswer.trim().length === 0) {
    throw new Error('Answer output did not contain a directAnswer')
  }

  const stats = kg.getStats()
  const supportingClaims = markSingleSourceClaims(kg, parseClaimsArray(parsed.supportingClaims))
  const counterclaims = parseCounterclaimsArray(parsed.counterclaims)
  const hasUntraceableClaims = hasUntraceableAnswerClaims(
    kg,
    parsed.directAnswer,
    supportingClaims,
    counterclaims,
  )
  const traceabilityWarning = 'Note: Some claims in this analysis could not be traced to indexed sources.'

  return {
    directAnswer: `${parsed.directAnswer}${hasUntraceableClaims ? `\n\n${traceabilityWarning}` : ''}`,
    supportingClaims,
    counterclaims,
    openUncertainties: Array.isArray(parsed.openUncertainties)
      ? (parsed.openUncertainties as string[]).filter((s) => typeof s === 'string')
      : [],
    confidenceAssessment: parseConfidenceAssessment(parsed.confidenceAssessment),
    citations: parseCitationsArray(parsed.citations),
    knowledgeGraphSummary: {
      claimCount: stats.nodesByType.claim,
      conceptCount: stats.nodesByType.concept,
      contradictionCount: kg.getActiveContradictions().length,
      resolvedCount: Number(
        (parsed.knowledgeGraphSummary as Record<string, unknown>)?.resolvedCount ?? 0
      ),
    },
  }
}

function parseClaimsArray(raw: unknown): DeepResearchAnswer['supportingClaims'] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((c) => c && typeof c === 'object' && (c as Record<string, unknown>).claimText)
    .map((c) => {
      const obj = c as Record<string, unknown>
      return {
        claimText: String(obj.claimText),
        confidence: Math.min(1, Math.max(0, Number(obj.confidence) || 0.5)),
        sources: Array.isArray(obj.sources) ? obj.sources.map(String) : [],
        evidenceType: validateEvidenceType(obj.evidenceType),
      }
    })
}

function parseCounterclaimsArray(raw: unknown): DeepResearchAnswer['counterclaims'] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((c) => c && typeof c === 'object' && (c as Record<string, unknown>).claimText)
    .map((c) => {
      const obj = c as Record<string, unknown>
      return {
        claimText: String(obj.claimText),
        confidence: Math.min(1, Math.max(0, Number(obj.confidence) || 0.5)),
        sources: Array.isArray(obj.sources) ? obj.sources.map(String) : [],
      }
    })
}

function parseConfidenceAssessment(raw: unknown): DeepResearchAnswer['confidenceAssessment'] {
  if (!raw || typeof raw !== 'object') {
    return { overall: 0.5, byTopic: {} }
  }
  const obj = raw as Record<string, unknown>
  const byTopic: Record<string, number> = {}
  if (obj.byTopic && typeof obj.byTopic === 'object') {
    for (const [key, val] of Object.entries(obj.byTopic as Record<string, unknown>)) {
      byTopic[key] = Math.min(1, Math.max(0, Number(val) || 0.5))
    }
  }
  return {
    overall: Math.min(1, Math.max(0, Number(obj.overall) || 0.5)),
    byTopic,
  }
}

function parseCitationsArray(raw: unknown): DeepResearchAnswer['citations'] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((c) => c && typeof c === 'object')
    .map((c) => {
      const obj = c as Record<string, unknown>
      return {
        sourceId: String(obj.sourceId ?? ''),
        url: String(obj.url ?? ''),
        title: String(obj.title ?? ''),
        relevance: String(obj.relevance ?? ''),
      }
    })
}

function normalizeText(text: string): string {
  return text.toLowerCase().trim().replace(/\s+/g, ' ')
}

function getNodeText(node: ReturnType<KnowledgeHypergraph['getNodesByType']>[number]): string {
  const data = node.data
  if (data && typeof data === 'object' && 'text' in data && typeof data.text === 'string') {
    return data.text
  }
  return node.label ?? ''
}

function getClaimTextsFromKg(kg: KnowledgeHypergraph): string[] {
  return kg.getNodesByType('claim').map((node) => normalizeText(getNodeText(node)))
}

function getSingleSourceClaimTexts(kg: KnowledgeHypergraph): string[] {
  return kg.getNodesByType('claim')
    .filter((node) => kg.getOutEdges(node.id).filter((edge) => edge.data.type === 'sourced_from').length < 2)
    .map((node) => normalizeText(getNodeText(node)))
}

function markSingleSourceClaims(
  kg: KnowledgeHypergraph,
  claims: DeepResearchAnswer['supportingClaims'],
): DeepResearchAnswer['supportingClaims'] {
  const singleSourceClaims = getSingleSourceClaimTexts(kg)

  return claims.map((claim) => {
    const normalized = normalizeText(claim.claimText)
    const isSingleSource = singleSourceClaims.some((kgClaim) =>
      kgClaim === normalized || kgClaim.includes(normalized) || normalized.includes(kgClaim)
    )

    if (!isSingleSource || claim.claimText.includes('[single-source]')) {
      return claim
    }

    return {
      ...claim,
      claimText: `${claim.claimText} [single-source]`,
    }
  })
}

function hasMatchingKgClaim(claimText: string, normalizedKgClaims: string[]): boolean {
  const normalized = normalizeText(claimText)
  if (!normalized) return true

  return normalizedKgClaims.some((kgClaim) =>
    kgClaim === normalized ||
    kgClaim.includes(normalized) ||
    normalized.includes(kgClaim)
  )
}

function hasUntraceableAnswerClaims(
  kg: KnowledgeHypergraph,
  directAnswer: string,
  supportingClaims: DeepResearchAnswer['supportingClaims'],
  counterclaims: DeepResearchAnswer['counterclaims'],
): boolean {
  const normalizedKgClaims = getClaimTextsFromKg(kg)
  if (normalizedKgClaims.length === 0) return false

  const directAnswerClaimRefs = Array.from(directAnswer.matchAll(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g))
    .map((match) => match[1]?.trim() ?? '')
    .filter(Boolean)

  const candidateClaims = [
    ...supportingClaims.map((claim) => claim.claimText),
    ...counterclaims.map((claim) => claim.claimText),
    ...directAnswerClaimRefs,
  ]

  return candidateClaims.some((claimText) => !hasMatchingKgClaim(claimText, normalizedKgClaims))
}
