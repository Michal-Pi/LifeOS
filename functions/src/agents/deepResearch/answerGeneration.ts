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
  EvidenceType,
} from '@lifeos/agents'
import { validateEvidenceType } from '@lifeos/agents'
import type { KnowledgeHypergraph } from '../knowledgeHypergraph.js'
import { recordSpend, canAffordOperation, estimateLLMCost } from './budgetController.js'
import type { ProviderExecuteFn } from './claimExtraction.js'
import { createLogger } from '../../lib/logger.js'

const log = createLogger('AnswerGeneration')

// ----- Prompts -----

const ANSWER_SYSTEM_PROMPT = `You are a research answer generator. You synthesize evidence from a knowledge graph into a structured, well-cited answer.

Rules:
1. Only make claims supported by the provided evidence
2. Clearly distinguish high-confidence from low-confidence claims
3. Present counterclaims and unresolved contradictions honestly
4. Cite sources for every claim using [sourceId] format
5. Identify remaining uncertainties

Output valid JSON only, no markdown fences.`

function buildAnswerPrompt(
  query: string,
  kgSummary: string,
  synthesisContext: string,
  contradictionContext: string
): string {
  return `Research query: "${query}"

${kgSummary}

${synthesisContext}

${contradictionContext}

Generate a comprehensive research answer as JSON:
{
  "directAnswer": "A clear, well-supported answer to the research query (2-4 paragraphs)",
  "supportingClaims": [
    {
      "claimText": "An atomic claim supporting the answer",
      "confidence": 0.0-1.0,
      "sources": ["source URLs"],
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
 * Generate the final structured answer from KG state and dialectical outputs.
 */
export async function generateAnswer(
  kg: KnowledgeHypergraph,
  query: string,
  executeProvider: ProviderExecuteFn,
  budget: RunBudget,
  synthesis?: SublationOutput | null,
  contradictions?: ContradictionOutput[]
): Promise<{ answer: DeepResearchAnswer; updatedBudget: RunBudget }> {
  let currentBudget = { ...budget }

  const kgSummary = buildDetailedKGSummary(kg)
  const synthesisContext = formatSynthesisContext(synthesis)
  const contradictionContext = formatContradictionContext(contradictions ?? [])

  const totalPromptLen =
    kgSummary.length + synthesisContext.length + contradictionContext.length + query.length
  const estimatedCost = estimateLLMCost('claude-opus', totalPromptLen / 4 + 300, 2000)

  if (!canAffordOperation(currentBudget, estimatedCost)) {
    log.warn('Budget insufficient for answer generation, producing minimal answer')
    return {
      answer: buildMinimalAnswer(kg, query),
      updatedBudget: currentBudget,
    }
  }

  try {
    const output = await executeProvider(
      ANSWER_SYSTEM_PROMPT,
      buildAnswerPrompt(query, kgSummary, synthesisContext, contradictionContext)
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
  } catch (err) {
    log.warn('Answer generation failed, producing minimal answer', { error: String(err) })
    return {
      answer: buildMinimalAnswer(kg, query),
      updatedBudget: currentBudget,
    }
  }
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
  for (const claim of rankedClaims.slice(0, 20)) {
    lines.push(
      `- [confidence=${claim.confidence.toFixed(2)}, sources=${claim.sourceCount}, type=${claim.evidenceType}] ${claim.text}`
    )
    if (claim.sourceQuote) {
      lines.push(`  Quote: "${claim.sourceQuote.substring(0, 150)}"`)
    }
    if (claim.sourceUrls.length > 0) {
      lines.push(`  Sources: ${claim.sourceUrls.join(', ')}`)
    }
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
    lines.push('### Unresolved')
    for (const c of unresolved) {
      lines.push(`- [${c.severity}] ${c.type}: ${c.description}`)
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

// ----- Parsing -----

function parseAnswerResult(output: string, kg: KnowledgeHypergraph): DeepResearchAnswer {
  try {
    const jsonMatch = output.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return buildMinimalAnswer(kg, '')
    }

    const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>
    const stats = kg.getStats()

    return {
      directAnswer: String(parsed.directAnswer ?? ''),
      supportingClaims: parseClaimsArray(parsed.supportingClaims),
      counterclaims: parseCounterclaimsArray(parsed.counterclaims),
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
  } catch (err) {
    log.warn('Failed to parse answer output', { error: String(err) })
    return buildMinimalAnswer(kg, '')
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

// ----- Minimal Answer (Budget Fallback) -----

function buildMinimalAnswer(kg: KnowledgeHypergraph, query: string): DeepResearchAnswer {
  const stats = kg.getStats()
  const claims = kg.getNodesByType('claim')
  const sources = kg.getNodesByType('source')
  const contradictions = kg.getActiveContradictions()

  // Build answer from top claims
  const topClaims = claims
    .map((n) => {
      const data = n.data as unknown as Record<string, unknown>
      return {
        text: String(data.text ?? n.label),
        confidence: Number(data.confidence ?? 0.5),
      }
    })
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 10)

  const directAnswer =
    topClaims.length > 0
      ? `Based on ${stats.nodesByType.claim} claims extracted from ${stats.nodesByType.source} sources:\n\n` +
        topClaims.map((c) => `- ${c.text} (confidence: ${c.confidence.toFixed(2)})`).join('\n')
      : `Research for "${query}" was limited by budget constraints. ${stats.nodesByType.claim} claims were extracted from ${stats.nodesByType.source} sources.`

  return {
    directAnswer,
    supportingClaims: topClaims.slice(0, 5).map((c) => ({
      claimText: c.text,
      confidence: c.confidence,
      sources: [],
      evidenceType: 'theoretical' as EvidenceType,
    })),
    counterclaims: [],
    openUncertainties: [
      'Answer was generated with limited budget — full analysis may reveal additional nuances.',
    ],
    confidenceAssessment: {
      overall: topClaims.length > 0 ? topClaims[0].confidence * 0.8 : 0.3,
      byTopic: {},
    },
    citations: sources.slice(0, 10).map((s) => {
      const data = s.data as unknown as Record<string, unknown>
      return {
        sourceId: s.id,
        url: String(data.url ?? ''),
        title: String(data.title ?? s.label),
        relevance: 'Source used in research',
      }
    }),
    knowledgeGraphSummary: {
      claimCount: stats.nodesByType.claim,
      conceptCount: stats.nodesByType.concept,
      contradictionCount: contradictions.length,
      resolvedCount: 0,
    },
  }
}
