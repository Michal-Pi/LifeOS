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

// High-authority domains score higher.
// Specific domains listed first, TLD patterns (starting with '.') at end.
// Sorted longest-first so the most specific match wins.
const HIGH_AUTHORITY_DOMAINS: Array<[pattern: string, score: number]> = [
  ['pubmed.ncbi.nlm.nih.gov', 0.9],
  ['nature.com', 0.95],
  ['science.org', 0.95],
  ['thelancet.com', 0.95],
  ['nejm.org', 0.95],
  ['bmj.com', 0.92],
  ['arxiv.org', 0.85],
  ['ieee.org', 0.88],
  ['acm.org', 0.88],
  ['springer.com', 0.85],
  ['wiley.com', 0.85],
  ['reuters.com', 0.82],
  ['apnews.com', 0.82],
  ['bbc.com', 0.8],
  ['nytimes.com', 0.8],
  ['washingtonpost.com', 0.78],
  ['economist.com', 0.8],
  ['ft.com', 0.8],
  ['hbr.org', 0.78],
  ['mckinsey.com', 0.78],
  ['who.int', 0.9],
  ['cdc.gov', 0.88],
  ['gov.uk', 0.82],
  // TLD patterns — matched via endsWith only
  ['.edu', 0.75],
  ['.gov', 0.8],
]

/**
 * Compute a source quality score (0-1) based on domain authority,
 * publication date recency, and citation count.
 */
export function computeSourceQualityScore(source: SourceRecord): number {
  let score = 0.5 // baseline

  // Domain authority — specific domains match via === or endsWith('.'+pattern),
  // TLD patterns (starting with '.') match via endsWith only.
  const domain = source.domain.toLowerCase()
  for (const [pattern, authority] of HIGH_AUTHORITY_DOMAINS) {
    if (pattern.startsWith('.')) {
      // TLD pattern — only match as suffix
      if (domain.endsWith(pattern)) {
        score = authority
        break
      }
    } else {
      // Exact domain or subdomain match
      if (domain === pattern || domain.endsWith('.' + pattern)) {
        score = authority
        break
      }
    }
  }

  // Academic sources get a base boost
  if (source.sourceType === 'academic') {
    score = Math.max(score, 0.75)
  }

  // Recency bonus — use publication year for academic sources, fetchedAtMs as fallback
  const publicationYear = source.scholarMetadata?.year
  if (publicationYear) {
    const ageYears = new Date().getFullYear() - publicationYear
    if (ageYears <= 1) score = Math.min(1, score + 0.1)
    else if (ageYears <= 3) score = Math.min(1, score + 0.05)
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
 * Uses a weighted average of claim confidence and source quality (70/30)
 * to avoid overly aggressive penalty from pure multiplication.
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
    // Weighted blend: 70% original confidence, 30% quality-adjusted
    const adjusted = claim.confidence * 0.7 + claim.confidence * qualityScore * 0.3
    return {
      ...claim,
      confidence: Math.min(1, Math.max(0, adjusted)),
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
  // Take top claims by confidence — spread to avoid mutating the input array
  const topClaims = [...claims].sort((a, b) => b.confidence - a.confidence).slice(0, 10)

  if (topClaims.length === 0) return []

  const claimList = topClaims
    .map((c, i) => `${i + 1}. [${c.evidenceType}, conf=${c.confidence.toFixed(2)}] ${c.claimText}`)
    .join('\n')

  try {
    const response = await executeProvider(
      `You are an adversarial research analyst. Your job is to find the strongest counterarguments to claims. Be rigorous and evidence-based. Output valid JSON only, no markdown fences.`,
      `Research question:
<user_query>${query}</user_query>

For each claim below, generate the strongest counterargument. Rate each as strong/moderate/weak.

Claims:
${claimList}

Respond with JSON: { "counterclaims": [{ "claimIndex": 1, "counterargument": "...", "strength": "strong|moderate|weak", "evidenceBasis": "..." }, ...] }`
    )

    const parsed = safeParseJson(response) as {
      counterclaims?: Array<{
        claimIndex?: number
        counterargument?: string
        strength?: string
        evidenceBasis?: string
      }>
    } | null

    if (!parsed?.counterclaims || !Array.isArray(parsed.counterclaims)) return []

    return parsed.counterclaims
      .filter((c) => c.counterargument)
      .map((c) => {
        const idx = Math.max(0, Math.min(topClaims.length - 1, (Number(c.claimIndex) || 1) - 1))
        const validStrengths = ['strong', 'moderate', 'weak'] as const
        const strength = validStrengths.includes(c.strength as (typeof validStrengths)[number])
          ? (c.strength as 'strong' | 'moderate' | 'weak')
          : 'moderate'

        // Use a stable claim identifier derived from text, since claims don't have IDs yet at this stage
        const claimText = topClaims[idx].claimText
        const claimHash = `claim:${simpleHash(claimText)}`

        return {
          originalClaimId: claimHash,
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

/**
 * Extract the first balanced JSON object from a string.
 * Uses brace counting instead of greedy regex to handle edge cases.
 */
function safeParseJson(text: string): unknown | null {
  const start = text.indexOf('{')
  if (start === -1) return null
  let depth = 0
  for (let i = start; i < text.length; i++) {
    if (text[i] === '{') depth++
    else if (text[i] === '}') depth--
    if (depth === 0) {
      try {
        return JSON.parse(text.slice(start, i + 1))
      } catch {
        return null
      }
    }
  }
  return null
}

/** Simple FNV-1a-style hash for claim text → stable short identifier. */
function simpleHash(str: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(36)
}
