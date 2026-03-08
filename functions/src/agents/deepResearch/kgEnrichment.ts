/**
 * KG Enrichment Module
 *
 * Provides five enrichment passes that run after claims are mapped to the KG:
 * 1. Supports edge creation (keyword overlap between similar claims)
 * 2. Early contradiction detection (opposing-term heuristic)
 * 3. Fuzzy concept merging (keyword overlap on concept names)
 * 4. Causal chain bridging (transitive A→B→C inference)
 * 5. KGDiff application (apply dialectical rewrite operators to actual KG)
 *
 * All enrichment functions are zero-LLM-cost (pure computation/heuristics).
 */

import type {
  Claim,
  Concept,
  ConceptId,
  ClaimId,
  ContradictionId,
  KGDiff,
  DialecticalSessionId,
  EpisodeId,
  AgentId,
  ThesisLens,
} from '@lifeos/agents'
import { createBiTemporalEdge } from '@lifeos/agents'
import type { KnowledgeHypergraph } from '../knowledgeHypergraph.js'
import { computeKeywordOverlap } from '../knowledgeGraphSuggestions.js'
import { createLogger } from '../../lib/logger.js'

const log = createLogger('KGEnrichment')

// ----- Stop-word tokenizer (reused for concept guard) -----

const STOP_WORDS = new Set([
  'the',
  'a',
  'an',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'being',
  'have',
  'has',
  'had',
  'do',
  'does',
  'did',
  'will',
  'would',
  'could',
  'should',
  'may',
  'might',
  'shall',
  'can',
  'to',
  'of',
  'in',
  'for',
  'on',
  'with',
  'at',
  'by',
  'from',
  'as',
  'into',
  'about',
  'like',
  'through',
  'after',
  'over',
  'between',
  'out',
  'against',
  'during',
  'without',
  'before',
  'under',
  'around',
  'among',
  'and',
  'but',
  'or',
  'nor',
  'not',
  'so',
  'yet',
  'both',
  'either',
  'neither',
  'each',
  'every',
  'all',
  'any',
  'few',
  'more',
  'most',
  'other',
  'some',
  'such',
  'no',
  'only',
  'own',
  'same',
  'than',
  'too',
  'very',
  'just',
  'because',
  'this',
  'that',
  'these',
  'those',
  'it',
  'its',
  'i',
  'me',
  'my',
  'we',
  'our',
  'you',
  'your',
  'he',
  'she',
  'they',
  'them',
  'their',
])

function significantTokenCount(text: string): number {
  return text
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w)).length
}

// ----- 4a. Supports Edge Creation -----

/**
 * Create `supports` edges between similar (but not identical) claims.
 * Uses keyword overlap — no LLM call.
 */
export function createSupportsEdges(
  newClaimIds: string[],
  kg: KnowledgeHypergraph,
  overlapThreshold: number = 0.35,
  maxComparisons: number = 500
): { edgesCreated: number } {
  let edgesCreated = 0
  let comparisons = 0

  const allClaims = kg.getNodesByType('claim')
  const newClaimSet = new Set(newClaimIds)

  const newClaimTexts = allClaims
    .filter((n) => newClaimSet.has(n.id))
    .map((n) => ({ id: n.id, text: (n.data as Claim).text }))

  const existingClaimTexts = allClaims
    .filter((n) => !newClaimSet.has(n.id))
    .map((n) => ({ id: n.id, text: (n.data as Claim).text }))

  for (const newClaim of newClaimTexts) {
    for (const existingClaim of existingClaimTexts) {
      if (comparisons >= maxComparisons) break
      comparisons++

      const overlap = computeKeywordOverlap(newClaim.text, existingClaim.text)

      if (overlap >= overlapThreshold) {
        const existingEdges = kg.getEdges(newClaim.id, existingClaim.id)
        const alreadySupports = existingEdges.some((e) => e.type === 'supports')

        if (!alreadySupports) {
          kg.addEdge(newClaim.id, existingClaim.id, {
            type: 'supports',
            weight: overlap,
            temporal: createBiTemporalEdge(),
            metadata: { method: 'keyword_overlap', score: overlap },
          })
          edgesCreated++
        }
      }
    }
    if (comparisons >= maxComparisons) break
  }

  return { edgesCreated }
}

// ----- 4b. Early Contradiction Detection -----

const OPPOSING_PAIRS: Array<[string, string]> = [
  ['increase', 'decrease'],
  ['higher', 'lower'],
  ['positive', 'negative'],
  ['beneficial', 'harmful'],
  ['accelerate', 'decelerate'],
  ['strengthen', 'weaken'],
  ['improve', 'worsen'],
  ['cause', 'prevent'],
  ['promote', 'inhibit'],
  ['growth', 'decline'],
  ['rise', 'fall'],
  ['gain', 'loss'],
]

/**
 * Lightweight contradiction scanner for the research phase.
 * Adapts the LOGIC tracker's opposing-term heuristic to work on raw claims.
 * Zero LLM cost — pure heuristic string matching.
 */
export function scanForResearchContradictions(
  newClaimIds: string[],
  kg: KnowledgeHypergraph,
  maxComparisons: number = 300
): { contradictionEdgesCreated: number } {
  let edgesCreated = 0
  let comparisons = 0

  const allClaims = kg.getNodesByType('claim')
  const newClaimSet = new Set(newClaimIds)

  const newClaims = allClaims.filter((n) => newClaimSet.has(n.id))
  const existingClaims = allClaims.filter((n) => !newClaimSet.has(n.id))

  for (const newNode of newClaims) {
    const newClaim = newNode.data as Claim
    const newText = (newClaim.text ?? '').toLowerCase()
    const newConcepts = new Set(newClaim.conceptIds ?? [])

    for (const existingNode of existingClaims) {
      if (comparisons >= maxComparisons) break
      comparisons++

      const existingClaim = existingNode.data as Claim
      const existingText = (existingClaim.text ?? '').toLowerCase()
      const existingConcepts = new Set(existingClaim.conceptIds ?? [])

      // Must share at least 1 concept to be about the same thing
      const hasSharedConcept = Array.from(newConcepts).some((c) => existingConcepts.has(c))
      if (!hasSharedConcept) continue

      // Check for opposing terms
      let isContradictory = false
      for (const [term1, term2] of OPPOSING_PAIRS) {
        if (
          (newText.includes(term1) && existingText.includes(term2)) ||
          (newText.includes(term2) && existingText.includes(term1))
        ) {
          isContradictory = true
          break
        }
      }

      if (isContradictory) {
        const existingEdges = kg.getEdges(newNode.id, existingNode.id)
        const alreadyContradicts = existingEdges.some((e) => e.type === 'contradicts')

        if (!alreadyContradicts) {
          kg.addEdge(newNode.id, existingNode.id, {
            type: 'contradicts',
            weight: 0.5,
            temporal: createBiTemporalEdge(),
            metadata: {
              method: 'research_heuristic',
              verified: false,
            },
          })
          edgesCreated++
        }
      }
    }
    if (comparisons >= maxComparisons) break
  }

  return { contradictionEdgesCreated: edgesCreated }
}

// ----- 4c. Fuzzy Concept Merging -----

/**
 * Detect and merge near-duplicate concepts in the KG.
 * Uses keyword overlap on concept names + alternate names.
 * Triggers the existing applyMerge() rewrite operator.
 * Zero LLM cost — pure string comparison.
 */
export async function mergeNearDuplicateConcepts(
  newConceptIds: string[],
  kg: KnowledgeHypergraph,
  mergeThreshold: number = 0.7,
  maxMerges: number = 5
): Promise<{ mergesPerformed: number }> {
  let mergesPerformed = 0

  const allConcepts = kg.getNodesByType('concept')
  const newConceptSet = new Set(newConceptIds)
  const mergedAway = new Set<string>()

  for (const newId of newConceptIds) {
    if (mergesPerformed >= maxMerges) break
    if (mergedAway.has(newId)) continue

    const newNode = kg.getNode(newId)
    if (!newNode) continue
    const newConcept = newNode.data as Concept
    const newName = newConcept.name
    const newAltNames = newConcept.alternateNames ?? []
    const newSearchText = [newName, ...newAltNames].join(' ')

    // Guard: skip single-token concept names (too many false positives)
    if (significantTokenCount(newSearchText) < 2) continue

    for (const existingNode of allConcepts) {
      if (existingNode.id === newId) continue
      if (newConceptSet.has(existingNode.id)) continue
      if (mergedAway.has(existingNode.id)) continue

      const existingConcept = existingNode.data as Concept

      // Skip expired concepts
      if (
        existingConcept.temporal?.tExpired !== null &&
        existingConcept.temporal?.tExpired !== undefined
      )
        continue

      const existingName = existingConcept.name
      const existingAltNames = existingConcept.alternateNames ?? []
      const existingSearchText = [existingName, ...existingAltNames].join(' ')

      // Guard: skip single-token existing concepts too
      if (significantTokenCount(existingSearchText) < 2) continue

      const overlap = computeKeywordOverlap(newSearchText, existingSearchText)

      if (overlap >= mergeThreshold) {
        try {
          await kg.applyMerge([newId as ConceptId, existingNode.id as ConceptId], {
            name: existingName,
            definition: existingConcept.definition,
          })
          mergedAway.add(newId)
          mergesPerformed++
          break
        } catch (err) {
          log.warn('Concept merge failed', {
            newId,
            existingId: existingNode.id,
            error: String(err),
          })
        }
      }
    }
  }

  return { mergesPerformed }
}

// ----- 4d. Causal Chain Bridging -----

/**
 * Discover transitive causal chains across sources.
 * If A→B from source 1 and B→C from source 2, create an inferred A→C edge.
 * Zero LLM cost — pure graph traversal.
 */
export function bridgeCausalChains(
  kg: KnowledgeHypergraph,
  maxDepth: number = 2,
  maxInferred: number = 10
): { edgesCreated: number; chains: Array<{ path: string[]; sources: string[] }> } {
  // Only depth=2 is supported (A→B→C)
  void maxDepth

  let edgesCreated = 0
  const chains: Array<{ path: string[]; sources: string[] }> = []

  const concepts = kg.getNodesByType('concept')

  for (const startNode of concepts) {
    if (edgesCreated >= maxInferred) break

    const outEdges = kg.getOutEdges(startNode.id)
    const causalOutEdges = outEdges.filter((e) => e.data.type === 'causal_link')

    for (const firstHop of causalOutEdges) {
      if (edgesCreated >= maxInferred) break

      const midNode = kg.getNode(firstHop.target)
      if (!midNode || midNode.type !== 'concept') continue

      const firstSource = (firstHop.data.metadata?.claimId as string) ?? ''

      const midOutEdges = kg.getOutEdges(midNode.id)
      const secondHopEdges = midOutEdges.filter((e) => e.data.type === 'causal_link')

      for (const secondHop of secondHopEdges) {
        if (edgesCreated >= maxInferred) break
        if (secondHop.target === startNode.id) continue // avoid cycles

        const secondSource = (secondHop.data.metadata?.claimId as string) ?? ''

        // Only bridge if claims come from different sources
        if (firstSource === secondSource && firstSource !== '') continue

        // Check no existing causal_link from start to end
        const existing = kg.getEdges(startNode.id, secondHop.target)
        const alreadyCausal = existing.some((e) => e.type === 'causal_link')

        if (!alreadyCausal) {
          const inferredWeight = Math.min(firstHop.data.weight, secondHop.data.weight) * 0.8

          kg.addEdge(startNode.id, secondHop.target, {
            type: 'causal_link',
            weight: inferredWeight,
            temporal: createBiTemporalEdge(),
            metadata: {
              method: 'transitive_inference',
              via: midNode.id,
              sourceClaimIds: [firstSource, secondSource].filter(Boolean),
              depth: 2,
            },
          })

          edgesCreated++
          chains.push({
            path: [startNode.id, midNode.id, secondHop.target],
            sources: [firstSource, secondSource].filter(Boolean),
          })
        }
      }
    }
  }

  return { edgesCreated, chains }
}

// ----- 5. Apply KGDiff to Graph -----

/**
 * Apply a KGDiff (from dialectical sublation) to the actual KnowledgeHypergraph.
 * Wraps each operation in try/catch so partial failures don't block the rest.
 * Skips operations where the target node isn't found (graceful degradation
 * for CompactGraph IDs that don't have corresponding KG nodes).
 */
export async function applyKGDiffToGraph(
  kgDiff: KGDiff,
  kg: KnowledgeHypergraph,
  sessionId: DialecticalSessionId,
  userId: string
): Promise<{ applied: Record<string, number> }> {
  const applied: Record<string, number> = {
    conceptSplits: 0,
    conceptMerges: 0,
    edgeReversals: 0,
    newMediators: 0,
    regimeScopings: 0,
    temporalizations: 0,
    newClaims: 0,
    supersededClaims: 0,
    resolvedContradictions: 0,
    newPredictions: 0,
  }

  // Concept splits
  for (const split of kgDiff.conceptSplits) {
    try {
      const node = kg.getNode(split.from)
      if (!node || node.type !== 'concept') continue
      const newConcepts = split.to.map((name) => ({ name, definition: `Split from ${split.from}` }))
      await kg.applySplit(split.from as ConceptId, newConcepts)
      applied.conceptSplits++
    } catch (err) {
      log.warn('applyKGDiff: split failed', { from: split.from, error: String(err) })
    }
  }

  // Concept merges
  for (const merge of kgDiff.conceptMerges) {
    try {
      const ids = merge.from.filter((id) => {
        const node = kg.getNode(id)
        return node && node.type === 'concept'
      })
      if (ids.length < 2) continue
      await kg.applyMerge(ids as ConceptId[], {
        name: merge.to,
        definition: `Merged from ${ids.join(', ')}`,
      })
      applied.conceptMerges++
    } catch (err) {
      log.warn('applyKGDiff: merge failed', { from: merge.from, error: String(err) })
    }
  }

  // New claims
  for (const claim of kgDiff.newClaims) {
    try {
      await kg.addClaim({
        sessionId,
        userId,
        text: claim.text,
        normalizedText: claim.text.toLowerCase().trim().replace(/\s+/g, ' '),
        conceptIds: [],
        claimType: 'ASSERTION',
        confidence: 0.6,
        sourceEpisodeId: `episode:dialectical:sublation` as EpisodeId,
        sourceAgentId: 'agent:sublation_engine' as AgentId,
        sourceLens: 'systems' as ThesisLens,
      })
      applied.newClaims++
    } catch (err) {
      log.warn('applyKGDiff: addClaim failed', { claimId: claim.id, error: String(err) })
    }
  }

  // New predictions
  for (const prediction of kgDiff.newPredictions) {
    try {
      await kg.addClaim({
        sessionId,
        userId,
        text: prediction.text,
        normalizedText: prediction.text.toLowerCase().trim().replace(/\s+/g, ' '),
        conceptIds: [],
        claimType: 'PREDICTION',
        confidence: 0.5,
        sourceEpisodeId: `episode:dialectical:sublation` as EpisodeId,
        sourceAgentId: 'agent:sublation_engine' as AgentId,
        sourceLens: 'systems' as ThesisLens,
      })
      applied.newPredictions++
    } catch (err) {
      log.warn('applyKGDiff: addPrediction failed', { id: prediction.id, error: String(err) })
    }
  }

  // Superseded claims — mark as superseded via supersedeClaim with a placeholder replacement
  // Note: KGDiff only lists IDs to supersede, not replacements. We mark them SUPERSEDED
  // by creating a minimal successor claim that records the supersession.
  for (const claimId of kgDiff.supersededClaims) {
    try {
      const node = kg.getNode(claimId)
      if (!node || node.type !== 'claim') continue
      const oldClaim = node.data as Claim
      await kg.supersedeClaim(claimId as ClaimId, {
        sessionId,
        userId,
        text: `[Superseded] ${oldClaim.text}`,
        normalizedText: `[superseded] ${oldClaim.text.toLowerCase().trim().replace(/\s+/g, ' ')}`,
        conceptIds: oldClaim.conceptIds,
        claimType: oldClaim.claimType,
        confidence: oldClaim.confidence,
        sourceEpisodeId: `episode:dialectical:sublation` as EpisodeId,
        sourceAgentId: 'agent:sublation_engine' as AgentId,
        sourceLens: oldClaim.sourceLens,
      })
      applied.supersededClaims++
    } catch (err) {
      log.warn('applyKGDiff: supersede failed', { claimId, error: String(err) })
    }
  }

  // Resolved contradictions
  for (const contradictionId of kgDiff.resolvedContradictions) {
    try {
      const node = kg.getNode(contradictionId)
      if (!node || node.type !== 'contradiction') continue
      await kg.resolveContradiction(contradictionId as ContradictionId, 'Resolved via sublation')
      applied.resolvedContradictions++
    } catch (err) {
      log.warn('applyKGDiff: resolve contradiction failed', { contradictionId, error: String(err) })
    }
  }

  // Regime scopings
  for (const scoping of kgDiff.regimeScopings) {
    try {
      const claimNode = kg.getNode(scoping.claim)
      if (!claimNode || claimNode.type !== 'claim') continue
      await kg.applyScopeToRegime(scoping.claim as ClaimId, {
        sessionId,
        userId,
        name: scoping.regime,
        description: `Regime scope: ${scoping.regime}`,
        conditions: [],
        discoveredInCycle: 0,
        discoveredReason: 'KGDiff regime scoping',
      })
      applied.regimeScopings++
    } catch (err) {
      log.warn('applyKGDiff: scoping failed', { claim: scoping.claim, error: String(err) })
    }
  }

  // Temporalizations
  for (const temp of kgDiff.temporalizations) {
    try {
      const validClaims = temp.claims.filter((id) => {
        const node = kg.getNode(id)
        return node && node.type === 'claim'
      })
      if (validClaims.length < 2) continue
      await kg.applyTemporalize(
        validClaims as ClaimId[],
        temp.sequence as ClaimId[],
        `Temporal sequence: ${temp.sequence.join(' → ')}`
      )
      applied.temporalizations++
    } catch (err) {
      log.warn('applyKGDiff: temporalize failed', { claims: temp.claims, error: String(err) })
    }
  }

  log.info('KGDiff applied', applied)
  return { applied }
}
