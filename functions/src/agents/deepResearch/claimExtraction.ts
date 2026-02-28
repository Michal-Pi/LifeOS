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
  EvidenceType,
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

const log = createLogger('ClaimExtraction')

// ----- Extraction Prompt -----

const EXTRACTION_SYSTEM_PROMPT = `You are a precision claim extraction agent. Your task is to extract atomic, verifiable claims from the provided text.

Rules:
1. Each claim must be a single, self-contained assertion
2. Do NOT infer beyond what the text explicitly states
3. Preserve uncertainty language (e.g., "may", "suggests", "correlates with")
4. Include the exact quote from the source text that supports each claim
5. Assign confidence based on the strength of evidence language
6. Classify evidence type accurately

Output valid JSON only, no markdown fences.`

function buildExtractionUserPrompt(chunk: string, query: string): string {
  return `Research query: "${query}"

Extract atomic claims from this text. For each claim, provide:
- claimText: The claim as a clear, self-contained statement
- confidence: 0-1 based on evidence strength (1.0 = definitive, 0.5 = suggestive)
- evidenceType: one of "empirical", "theoretical", "anecdotal", "expert_opinion", "meta_analysis", "statistical", "review"
- sourceQuote: Exact quote from the text supporting this claim (max 200 chars)
- concepts: Array of key concept names this claim references

Text:
"""
${chunk}
"""

Respond with JSON: { "claims": [...] }`
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
  budget: RunBudget
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

  for (const chunk of chunksToProcess) {
    const estimatedCost = estimateLLMCost('gpt-5-mini', chunk.text.length / 4, 500)
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
      sourceEpisodeId: `episode:source:${claim.sourceId}` as EpisodeId,
      sourceAgentId: 'agent:deep_research_extractor' as AgentId,
      sourceLens: 'economic' as ThesisLens,
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
    // Try to extract JSON from the output
    const jsonMatch = output.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return []

    const parsed = JSON.parse(jsonMatch[0]) as { claims?: RawExtractedClaim[] }
    if (!parsed.claims || !Array.isArray(parsed.claims)) return []

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

function _mapEvidenceTypeToEpistemic(
  evidenceType: EvidenceType
): 'DEFINITION' | 'CAUSAL' | 'CORRELATIONAL' | 'NORMATIVE' | 'MEASUREMENT' {
  switch (evidenceType) {
    case 'empirical':
    case 'statistical':
      return 'MEASUREMENT'
    case 'meta_analysis':
    case 'review':
      return 'CORRELATIONAL'
    case 'theoretical':
      return 'DEFINITION'
    case 'expert_opinion':
    case 'anecdotal':
      return 'NORMATIVE'
    default:
      return 'DEFINITION'
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

// ----- Provider Execution Type -----

/**
 * Simplified provider execution function type.
 * The LangGraph node will create this from the full provider context.
 */
export type ProviderExecuteFn = (systemPrompt: string, userPrompt: string) => Promise<string>
