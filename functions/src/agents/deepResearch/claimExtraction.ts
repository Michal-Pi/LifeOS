/**
 * Claim Extraction Module
 *
 * Extracts atomic claims from document chunks using LLM-powered analysis.
 * Each claim is tagged with epistemic metadata (evidence type, confidence)
 * and linked to its source document.
 *
 * Budget-aware extraction depth:
 * - full:    Process all chunks
 * - reduced: Process first N chunks + conclusion
 * - minimal: Extract from snippet/abstract only
 */

import type {
  ExtractedClaim,
  RunBudget,
  DocumentChunk,
  SourceRecord,
  EpisodeId,
  AgentId,
  ThesisLens,
} from '@lifeos/agents'
import { validateEvidenceType } from '@lifeos/agents'
import type { KnowledgeHypergraph } from '../knowledgeHypergraph.js'
import type { DialecticalSessionId, CreateClaimInput, ConceptId } from '@lifeos/agents'
import { createBiTemporalEdge } from '@lifeos/agents'
import { recordSpend, canAffordOperation, estimateLLMCost } from './budgetController.js'
import { chunkDocument } from './sourceIngestion.js'
import { createLogger } from '../../lib/logger.js'
import { safeParseJson } from '../shared/jsonParser.js'
import { CLAIM_EXTRACTION_EXAMPLE, BATCH_CLAIM_EXTRACTION_EXAMPLE } from '../shared/fewShotExamples.js'

const log = createLogger('ClaimExtraction')

// ----- Extraction Prompt -----

const EXTRACTION_SYSTEM_PROMPT = `CRITICAL: Output valid JSON only. No markdown fences, no explanation, no preamble.

## Role
You are a precision claim extraction agent specializing in decomposing text into atomic, verifiable assertions with epistemic metadata.

## Rules
1. Each claim must be a single, self-contained assertion — one fact per claim.
2. Only state what the text explicitly says. Preserve the author's uncertainty language (e.g., "may", "suggests", "correlates with").
3. Include the exact quote from the source text that supports each claim.
4. Assign confidence based on the strength of evidence language in the source (1.0 = definitive statement, 0.5 = suggestive or hedged).
5. Classify evidence type accurately from the allowed set.
6. If the text is ambiguous, extract the most conservative interpretation and note the ambiguity.

CRITICAL (restated): Output valid JSON only. No other text.`

function sanitizeForPrompt(input: string, maxLength = 500): string {
  return input
    .replace(/[{}\\"<>]/g, ' ')
    .substring(0, maxLength)
    .trim()
}

function buildExtractionUserPrompt(chunk: string, query: string): string {
  return `## Context
Research query: "${sanitizeForPrompt(query)}"

## Source Text
"""
${chunk}
"""

## Task
Extract every atomic, verifiable claim from the source text above that is relevant to the research query.

## Output Schema
Respond with JSON: { "claims": [...] }

Each claim object must contain:
- claimText (string): The claim as a clear, self-contained statement.
- confidence (number, 0.0-1.0): Based on the strength of evidence language. 1.0 = definitive ("X causes Y"), 0.5 = suggestive ("X may cause Y").
- evidenceType (string): One of "empirical", "theoretical", "anecdotal", "expert_opinion", "meta_analysis", "statistical", "review".
- sourceQuote (string, max 200 chars): The exact quote from the source text supporting this claim.
- concepts (string[]): Key concept names this claim references.

## Example Output
${CLAIM_EXTRACTION_EXAMPLE}`
}

// ----- Types -----

interface RawExtractedClaim {
  claimText?: string
  confidence?: number
  evidenceType?: string
  sourceQuote?: string
  concepts?: string[]
}

// ----- Main Extraction -----

/**
 * Extract claims from a single source document.
 * Uses budget-aware depth control to determine how many chunks to process.
 */
export async function extractClaimsFromSource(
  source: SourceRecord,
  content: string,
  query: string,
  executeProvider: ProviderExecuteFn,
  budget: RunBudget,
  modelName?: string
): Promise<{ claims: ExtractedClaim[]; updatedBudget: RunBudget }> {
  let currentBudget = { ...budget }
  const chunks = chunkDocument(content, source.sourceId)

  // Budget-aware chunk selection
  const chunksToProcess = selectChunksForBudget(chunks, currentBudget)

  log.info('Extracting claims', {
    sourceId: source.sourceId,
    totalChunks: chunks.length,
    processingChunks: chunksToProcess.length,
    phase: currentBudget.phase,
  })

  const allClaims: ExtractedClaim[] = []
  const costModel = modelName ?? 'generic-llm'
  if (!modelName) {
    log.debug('Claim extraction cost estimate using fallback model', {
      sourceId: source.sourceId,
      modelName: costModel,
    })
  }

  for (const chunk of chunksToProcess) {
    const estimatedCost = estimateLLMCost(costModel, chunk.text.length / 4, 500)
    if (!canAffordOperation(currentBudget, estimatedCost)) {
      log.info('Budget limit reached during extraction', { sourceId: source.sourceId })
      break
    }

    try {
      const result = await executeProvider(
        EXTRACTION_SYSTEM_PROMPT,
        buildExtractionUserPrompt(chunk.text, query)
      )

      currentBudget = recordSpend(currentBudget, estimatedCost, chunk.text.length / 4 + 500, 'llm')

      const claims = parseExtractionResult(result, source.sourceId, chunk.section)
      allClaims.push(...claims)
    } catch (err) {
      log.warn('Claim extraction failed for chunk', {
        sourceId: source.sourceId,
        section: chunk.section,
        error: String(err),
      })
    }
  }

  // Deduplicate within source
  const deduped = deduplicateClaims(allClaims)

  return { claims: deduped, updatedBudget: currentBudget }
}

/**
 * Select which chunks to process based on budget phase.
 */
function selectChunksForBudget(chunks: DocumentChunk[], budget: RunBudget): DocumentChunk[] {
  switch (budget.phase) {
    case 'full':
      return chunks
    case 'reduced':
      // First 3 chunks + last chunk (usually conclusion)
      if (chunks.length <= 4) return chunks
      return [...chunks.slice(0, 3), chunks[chunks.length - 1]]
    case 'minimal':
      // First chunk only (abstract/intro)
      return chunks.slice(0, 1)
    case 'exhausted':
      return []
  }
}

// ----- KG Mapping -----

/**
 * Map extracted claims into the KnowledgeHypergraph.
 * Creates claim nodes, concept nodes, and sourced_from edges.
 */
export async function mapClaimsToKG(
  claims: ExtractedClaim[],
  sources: SourceRecord[],
  kg: KnowledgeHypergraph,
  sessionId: DialecticalSessionId,
  userId: string
): Promise<{ addedClaimIds: string[]; addedConceptIds: string[] }> {
  const addedClaimIds: string[] = []
  const addedConceptIds: string[] = []

  // First, ensure all source nodes exist in the KG
  for (const source of sources) {
    const existing = kg.getNode(source.sourceId)
    if (!existing) {
      await kg.addSource(source)
    }
  }

  // Track concepts we've already added to avoid duplicates
  const existingConcepts = new Map<string, string>() // lowercase name -> conceptId
  for (const node of kg.getNodesByType('concept')) {
    const name = node.label.toLowerCase()
    existingConcepts.set(name, node.id)
  }

  for (const claim of claims) {
    // Resolve concept IDs
    const conceptIds: ConceptId[] = []
    for (const conceptName of claim.concepts) {
      const normalized = conceptName.toLowerCase().trim()
      let conceptId = existingConcepts.get(normalized)

      if (!conceptId) {
        // Create new concept
        const concept = await kg.addConcept({
          sessionId,
          userId,
          name: conceptName,
          definition: `Concept extracted from source: ${conceptName}`,
          alternateNames: [],
          conceptType: 'ENTITY',
          introducedInCycle: 0,
          parentConceptIds: [],
          relatedConceptIds: [],
        })
        conceptId = concept.conceptId
        existingConcepts.set(normalized, conceptId)
        addedConceptIds.push(conceptId)
      }

      conceptIds.push(conceptId as ConceptId)
    }

    // Create the claim in the KG
    const claimInput: CreateClaimInput = {
      sessionId,
      userId,
      text: claim.claimText,
      normalizedText: claim.claimText.toLowerCase().trim().replace(/\s+/g, ' '),
      conceptIds,
      claimType: 'ASSERTION',
      confidence: claim.confidence,
      sourceEpisodeId: claim.sourceId as EpisodeId,
      sourceAgentId: 'agent:deep_research_extractor' as AgentId,
      sourceLens: 'systems' as ThesisLens, // neutral default — claims from extraction are not lens-specific
    }

    const kgClaim = await kg.addClaim(claimInput)
    addedClaimIds.push(kgClaim.claimId)

    // Add sourced_from edge (claim → source)
    kg.addEdge(kgClaim.claimId, claim.sourceId, {
      type: 'sourced_from',
      weight: claim.confidence,
      temporal: createBiTemporalEdge(),
      metadata: {
        evidenceType: claim.evidenceType,
        pageOrSection: claim.pageOrSection,
      },
    })

    // For causal claims with >= 2 concepts, add causal_link edge
    const isCausal =
      claim.evidenceType === 'empirical' ||
      /\b(causes?|leads?\s+to|results?\s+in|increases?|decreases?|drives?|triggers?)\b/i.test(
        claim.claimText
      )
    if (isCausal && conceptIds.length >= 2) {
      const existingEdges = kg.getEdges(conceptIds[0], conceptIds[1])
      const hasDuplicateCausal = existingEdges.some(
        (e) => e.type === 'causal_link' && e.metadata?.claimId === kgClaim.claimId
      )
      if (!hasDuplicateCausal) {
        kg.addEdge(conceptIds[0], conceptIds[1], {
          type: 'causal_link',
          weight: claim.confidence,
          temporal: createBiTemporalEdge(),
          metadata: {
            claimId: kgClaim.claimId,
            direction: 'cause_to_effect',
          },
        })
      }
    }
  }

  return { addedClaimIds, addedConceptIds }
}

// ----- Helpers -----

/**
 * Parse LLM extraction output into ExtractedClaim array.
 */
function parseExtractionResult(
  output: string,
  sourceId: string,
  section?: string
): ExtractedClaim[] {
  try {
    const parsed = safeParseJson(output) as { claims?: RawExtractedClaim[] } | null
    if (!parsed?.claims || !Array.isArray(parsed.claims)) return []

    return parsed.claims
      .filter((c) => c.claimText && typeof c.claimText === 'string')
      .map((c) => ({
        claimText: c.claimText!.trim(),
        confidence: Math.min(1, Math.max(0, Number(c.confidence) || 0.5)),
        evidenceType: validateEvidenceType(c.evidenceType),
        sourceId,
        sourceQuote: c.sourceQuote?.substring(0, 200),
        pageOrSection: section,
        concepts: Array.isArray(c.concepts) ? c.concepts.filter((n) => typeof n === 'string') : [],
      }))
  } catch (err) {
    log.warn('Failed to parse extraction result', { error: String(err) })
    return []
  }
}

/**
 * Deduplicate claims by text similarity (exact match on normalized text).
 */
function deduplicateClaims(claims: ExtractedClaim[]): ExtractedClaim[] {
  const seen = new Set<string>()
  return claims.filter((claim) => {
    const normalized = claim.claimText.toLowerCase().trim().replace(/\s+/g, ' ')
    if (seen.has(normalized)) return false
    seen.add(normalized)
    return true
  })
}

// ----- Batch Extraction (Phase 21) -----

const BATCH_EXTRACTION_SYSTEM_PROMPT = `CRITICAL: Output valid JSON only. No markdown fences, no explanation, no preamble. Attribute each claim to the correct source by its sourceIndex (1-indexed).

## Role
You are a precision claim extraction agent specializing in decomposing multiple source documents into atomic, verifiable assertions with epistemic metadata.

## Rules
1. Each claim must be a single, self-contained assertion — one fact per claim.
2. Only state what each text explicitly says. Preserve the author's uncertainty language (e.g., "may", "suggests", "correlates with").
3. Include the exact quote from the source text that supports each claim.
4. Assign confidence based on the strength of evidence language (1.0 = definitive, 0.5 = suggestive).
5. Classify evidence type accurately from the allowed set.
6. Attribute each claim to the correct source using its sourceIndex (1-indexed). Misattribution is a critical error.
7. If the text is ambiguous, extract the most conservative interpretation.

CRITICAL (restated): Output valid JSON only. Attribute every claim to the correct sourceIndex.`

/**
 * Build a prompt for batch extraction of claims from multiple sources.
 */
export function buildBatchExtractionPrompt(
  sources: Array<{ sourceId: string; content: string }>,
  query: string
): string {
  const sourceBlocks = sources
    .map((s, idx) => `--- SOURCE ${idx + 1} [${s.sourceId}] ---\n${s.content.substring(0, 3000)}`)
    .join('\n\n')

  return `## Context
Research query: "${sanitizeForPrompt(query)}"

## Sources
${sourceBlocks}

## Task
Extract every atomic, verifiable claim from each source above that is relevant to the research query. Attribute each claim to its correct source.

## Output Schema
Respond with JSON: { "claims": [{ "sourceIndex": 1, "claimText": "...", ... }, ...] }

Each claim object must contain:
- sourceIndex (integer, 1-indexed): Which source this claim came from. Must match exactly.
- claimText (string): The claim as a clear, self-contained statement.
- confidence (number, 0.0-1.0): Based on evidence strength. 1.0 = definitive, 0.5 = suggestive.
- evidenceType (string): One of "empirical", "theoretical", "anecdotal", "expert_opinion", "meta_analysis", "statistical", "review".
- sourceQuote (string, max 200 chars): Exact quote from the source text supporting this claim.
- concepts (string[]): Key concept names this claim references.

## Example Output
${BATCH_CLAIM_EXTRACTION_EXAMPLE}`
}

interface RawBatchClaim extends RawExtractedClaim {
  sourceIndex?: number
}

/**
 * Parse batch extraction output, mapping claims back to their source records.
 */
export function parseBatchExtractionOutput(
  output: string,
  sources: Array<{ sourceId: string; section?: string }>
): ExtractedClaim[] {
  if (sources.length === 0) return []

  try {
    const parsed = safeParseJson(output) as { claims?: RawBatchClaim[] } | null
    if (!parsed?.claims || !Array.isArray(parsed.claims)) return []

    return parsed.claims
      .filter((c) => c.claimText && typeof c.claimText === 'string')
      .map((c) => {
        const rawIdx = (Number(c.sourceIndex) || 1) - 1
        const idx = Math.max(0, Math.min(sources.length - 1, rawIdx))
        if (rawIdx !== idx) {
          log.warn('Claim attribution index clamped', {
            rawIndex: c.sourceIndex,
            clampedTo: idx,
            sourceCount: sources.length,
          })
        }
        const source = sources[idx]
        return {
          claimText: c.claimText!.trim(),
          confidence: Math.min(1, Math.max(0, Number(c.confidence) || 0.5)),
          evidenceType: validateEvidenceType(c.evidenceType),
          sourceId: source.sourceId,
          sourceQuote: c.sourceQuote?.substring(0, 200),
          pageOrSection: source.section,
          concepts: Array.isArray(c.concepts)
            ? c.concepts.filter((n) => typeof n === 'string')
            : [],
        }
      })
  } catch (err) {
    log.warn('Failed to parse batch extraction result', { error: String(err) })
    return []
  }
}

/**
 * Extract claims from multiple sources in batches.
 * Processes batchSize sources per LLM call instead of one per source.
 */
export async function extractClaimsFromSourceBatch(
  sources: SourceRecord[],
  contentMap: Record<string, string>,
  query: string,
  executeProvider: ProviderExecuteFn,
  budget: RunBudget,
  batchSize: number = 3,
  modelName?: string
): Promise<{ claims: ExtractedClaim[]; updatedBudget: RunBudget }> {
  let currentBudget = { ...budget }
  const allClaims: ExtractedClaim[] = []
  const costModel = modelName ?? 'generic-llm'
  if (!modelName) {
    log.debug('Batch claim extraction cost estimate using fallback model', {
      modelName: costModel,
    })
  }

  // Filter to sources that have content
  const sourcesWithContent = sources.filter((s) => contentMap[s.sourceId])

  // Group sources into batches
  const batches: SourceRecord[][] = []
  for (let i = 0; i < sourcesWithContent.length; i += batchSize) {
    batches.push(sourcesWithContent.slice(i, i + batchSize))
  }

  log.info('Batch claim extraction', {
    totalSources: sources.length,
    sourcesWithContent: sourcesWithContent.length,
    batchCount: batches.length,
    batchSize,
  })

  for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
    const batch = batches[batchIdx]
    // Estimate cost for this batch (3000 chars per source / 4 chars per token + output, with 1.3x safety margin)
    const inputTokens = batch.reduce(
      (sum, s) => sum + Math.min(3000, (contentMap[s.sourceId] ?? '').length) / 4,
      0
    )
    const estimatedCost = estimateLLMCost(costModel, Math.ceil(inputTokens * 1.3) + 200, 800)

    if (!canAffordOperation(currentBudget, estimatedCost)) {
      log.info('Budget limit reached during batch extraction', {
        remainingBatches: batches.length - batchIdx,
      })
      break
    }

    try {
      const batchSources = batch.map((s) => ({
        sourceId: s.sourceId,
        content: contentMap[s.sourceId] ?? '',
      }))

      const prompt = buildBatchExtractionPrompt(batchSources, query)
      const result = await executeProvider(BATCH_EXTRACTION_SYSTEM_PROMPT, prompt)

      currentBudget = recordSpend(currentBudget, estimatedCost, inputTokens + 1000, 'llm')

      const claims = parseBatchExtractionOutput(
        result,
        batch.map((s) => ({ sourceId: s.sourceId }))
      )
      allClaims.push(...claims)
    } catch (err) {
      log.warn('Batch claim extraction failed', {
        batchSourceIds: batch.map((s) => s.sourceId),
        error: String(err),
      })
    }
  }

  const deduped = deduplicateClaims(allClaims)
  return { claims: deduped, updatedBudget: currentBudget }
}

// ----- Provider Execution Type -----

/**
 * Simplified provider execution function type.
 * The LangGraph node will create this from the full provider context.
 */
export type ProviderExecuteFn = (systemPrompt: string, userPrompt: string) => Promise<string>
