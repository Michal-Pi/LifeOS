/**
 * Source Quality Scoring — Phase 23
 *
 * Computes a quality score for source documents based on:
 * - Domain authority (curated list of high-authority domains)
 * - Publication date recency
 * - Citation count (for academic sources)
 */

import type { SourceRecord, CounterclaimResult, ExtractedClaim } from '@lifeos/agents'
import type { ProviderExecuteFn } from './claimExtraction.js'
import { createLogger } from '../../lib/logger.js'

const log = createLogger('SourceQuality')

// High-authority domains score higher
const HIGH_AUTHORITY_DOMAINS: Record<string, number> = {
  'nature.com': 0.95,
  'science.org': 0.95,
  'thelancet.com': 0.95,
  'nejm.org': 0.95,
  'bmj.com': 0.92,
  'arxiv.org': 0.85,
  'scholar.google.com': 0.85,
  'pubmed.ncbi.nlm.nih.gov': 0.9,
  'ieee.org': 0.88,
  'acm.org': 0.88,
  'springer.com': 0.85,
  'wiley.com': 0.85,
  'reuters.com': 0.82,
  'apnews.com': 0.82,
  'bbc.com': 0.8,
  'nytimes.com': 0.8,
  'washingtonpost.com': 0.78,
  'economist.com': 0.8,
  'ft.com': 0.8,
  'hbr.org': 0.78,
  'mckinsey.com': 0.78,
  'who.int': 0.9,
  'cdc.gov': 0.88,
  'gov.uk': 0.82,
  '.edu': 0.75,
  '.gov': 0.8,
}

/**
 * Compute a source quality score (0-1) based on domain authority,
 * publication date recency, and citation count.
 */
export function computeSourceQualityScore(source: SourceRecord): number {
  let score = 0.5 // baseline

  // Domain authority
  const domain = source.domain.toLowerCase()
  for (const [pattern, authority] of Object.entries(HIGH_AUTHORITY_DOMAINS)) {
    if (domain.includes(pattern) || domain.endsWith(pattern)) {
      score = authority
      break
    }
  }

  // Academic sources get a base boost
  if (source.sourceType === 'academic') {
    score = Math.max(score, 0.75)
  }

  // Recency bonus (for non-academic sources)
  if (source.sourceType !== 'academic' && source.fetchedAtMs) {
    const ageMs = Date.now() - source.fetchedAtMs
    const ageYears = ageMs / (365.25 * 24 * 60 * 60 * 1000)
    if (ageYears < 1) score = Math.min(1, score + 0.1)
    else if (ageYears < 3) score = Math.min(1, score + 0.05)
    else if (ageYears > 10) score = Math.max(0.1, score - 0.1)
  }

  // Citation count boost (academic sources)
  if (source.scholarMetadata?.citations) {
    const citations = source.scholarMetadata.citations
    if (citations > 100) score = Math.min(1, score + 0.15)
    else if (citations > 50) score = Math.min(1, score + 0.1)
    else if (citations > 10) score = Math.min(1, score + 0.05)
  }

  return Math.min(1, Math.max(0, score))
}

/**
 * Apply quality scores to extracted claims.
 * Multiplies claim confidence by source quality score.
 */
export function applyQualityScoresToClaims(
  claims: ExtractedClaim[],
  sources: SourceRecord[]
): ExtractedClaim[] {
  const sourceScoreMap = new Map<string, number>()
  for (const source of sources) {
    sourceScoreMap.set(
      source.sourceId,
      source.sourceQualityScore ?? computeSourceQualityScore(source)
    )
  }

  return claims.map((claim) => {
    const qualityScore = sourceScoreMap.get(claim.sourceId) ?? 0.5
    return {
      ...claim,
      confidence: Math.min(1, claim.confidence * qualityScore),
    }
  })
}

/**
 * Generate counterclaims for the top claims using an adversarial agent.
 */
export async function generateCounterclaims(
  claims: ExtractedClaim[],
  query: string,
  executeProvider: ProviderExecuteFn
): Promise<CounterclaimResult[]> {
  // Take top claims by confidence
  const topClaims = claims.sort((a, b) => b.confidence - a.confidence).slice(0, 10)

  if (topClaims.length === 0) return []

  const claimList = topClaims
    .map((c, i) => `${i + 1}. [${c.evidenceType}, conf=${c.confidence.toFixed(2)}] ${c.claimText}`)
    .join('\n')

  try {
    const response = await executeProvider(
      `You are an adversarial research analyst. Your job is to find the strongest counterarguments to claims. Be rigorous and evidence-based. Output valid JSON only, no markdown fences.`,
      `Research question: "${query}"

For each claim below, generate the strongest counterargument. Rate each as strong/moderate/weak.

Claims:
${claimList}

Respond with JSON: { "counterclaims": [{ "claimIndex": 1, "counterargument": "...", "strength": "strong|moderate|weak", "evidenceBasis": "..." }, ...] }`
    )

    const jsonMatch = response.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return []

    const parsed = JSON.parse(jsonMatch[0]) as {
      counterclaims?: Array<{
        claimIndex?: number
        counterargument?: string
        strength?: string
        evidenceBasis?: string
      }>
    }

    if (!parsed.counterclaims || !Array.isArray(parsed.counterclaims)) return []

    return parsed.counterclaims
      .filter((c) => c.counterargument)
      .map((c) => {
        const idx = Math.max(0, Math.min(topClaims.length - 1, (Number(c.claimIndex) || 1) - 1))
        const validStrengths = ['strong', 'moderate', 'weak'] as const
        const strength = validStrengths.includes(c.strength as (typeof validStrengths)[number])
          ? (c.strength as 'strong' | 'moderate' | 'weak')
          : 'moderate'

        return {
          originalClaimId: topClaims[idx].sourceId,
          counterargument: c.counterargument!,
          strength,
          evidenceBasis: c.evidenceBasis ?? '',
        }
      })
  } catch (err) {
    log.warn('Counterclaim generation failed', { error: String(err) })
    return []
  }
}
