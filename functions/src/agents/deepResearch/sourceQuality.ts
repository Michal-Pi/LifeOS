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
import { safeParseJson } from '../shared/jsonParser.js'

const log = createLogger('SourceQuality')

function sanitizeForPrompt(input: string, maxLength = 500): string {
  return input.replace(/[{}\\"<>]/g, ' ').substring(0, maxLength).trim()
}

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
    // Weighted blend: 70% original confidence, 30% source quality
    const adjusted = claim.confidence * 0.7 + qualityScore * 0.3
    return {
      ...claim,
      confidence: Math.min(1, Math.max(0, adjusted)),
    }
  })
}

/**
 * Adversarial search executor — abstracts the search + ingest pipeline
 * so generateCounterclaims doesn't import it directly.
 */
export interface AdversarialSearchFn {
  (queries: string[]): Promise<{
    sources: SourceRecord[]
    contentMap: Record<string, string>
  }>
}

/**
 * Generate counterclaims via full adversarial search pipeline:
 * 1. LLM generates targeted adversarial search queries
 * 2. Execute those queries via real search infrastructure
 * 3. Extract counterclaims from adversarial sources
 * 4. Cross-reference against original claims
 */
export async function generateCounterclaims(
  claims: ExtractedClaim[],
  query: string,
  executeProvider: ProviderExecuteFn,
  adversarialSearch?: AdversarialSearchFn,
): Promise<CounterclaimResult[]> {
  // Take top claims by confidence — spread to avoid mutating the input array
  const topClaims = [...claims].sort((a, b) => b.confidence - a.confidence).slice(0, 10)

  if (topClaims.length === 0) return []

  const claimList = topClaims
    .map((c, i) => `${i + 1}. [${c.evidenceType}, conf=${c.confidence.toFixed(2)}] ${c.claimText}`)
    .join('\n')

  try {
    // Phase 1: Generate adversarial search queries
    const queryResponse = await executeProvider(
      `You are an adversarial research analyst. Your job is to find the strongest evidence AGAINST the claims presented. Generate targeted search queries that would find counter-evidence, rival theories, failed replications, or critical analyses. Output valid JSON only, no markdown fences.`,
      `## Research Question
${sanitizeForPrompt(query)}

## Claims to Challenge
${claimList}

## Task
Generate 3-5 search queries designed to find evidence that CONTRADICTS or WEAKENS these claims. Prioritize:
1. Studies with opposing conclusions
2. Methodological criticisms of supporting evidence
3. Counter-examples from different contexts or time periods
4. Failed replications or contradictory studies
5. Alternative explanations or rival theories

## Output Schema
{ "adversarialQueries": ["query1", "query2", ...], "rationale": "brief explanation of strategy" }

Output valid JSON only. No markdown fences.`
    )

    const queryParsed = safeParseJson(queryResponse) as {
      adversarialQueries?: string[]
      rationale?: string
    } | null

    const adversarialQueries = queryParsed?.adversarialQueries?.filter(
      (q): q is string => typeof q === 'string' && q.length > 0
    ) ?? []

    // Phase 2: Execute adversarial search (if search function provided and queries generated)
    let adversarialContext = ''
    if (adversarialSearch && adversarialQueries.length > 0) {
      try {
        const { sources: advSources, contentMap } = await adversarialSearch(adversarialQueries)

        if (advSources.length > 0) {
          // Build context from adversarial sources for the counterclaim generator
          const sourceSnippets = advSources.slice(0, 5).map((s) => {
            const content = contentMap[s.sourceId]?.substring(0, 1500) ?? ''
            return `### ${s.title} (${s.domain})\nURL: ${s.url}\n${content}`
          })
          adversarialContext = `\n\n## Adversarial Sources Found\nThe following sources contain potential counter-evidence:\n\n${sourceSnippets.join('\n\n')}`

          log.info('Adversarial search found sources', {
            queriesExecuted: adversarialQueries.length,
            sourcesFound: advSources.length,
          })
        }
      } catch (err) {
        log.warn('Adversarial search failed, falling back to LLM-only', { error: String(err) })
      }
    }

    // Phase 3: Generate counterclaims (grounded in adversarial sources when available)
    const counterResponse = await executeProvider(
      `You are an adversarial research analyst who generates the strongest possible counterarguments to claims. ${adversarialContext ? 'You have access to real counter-evidence sources — cite them specifically using [title](url) format.' : ''} Prioritize accuracy over agreement. Ground counterarguments in evidence, logic, or established alternative frameworks. Output valid JSON only, no markdown fences.`,
      `## Research Question
${sanitizeForPrompt(query)}

## Task
For each claim below, generate the single strongest counterargument. Rate the counterargument strength as strong/moderate/weak based on evidence quality.${adversarialContext ? ' You MUST cite specific sources from the adversarial sources section using [title](url) format in your evidenceBasis.' : ''}

## Claims
${claimList}${adversarialContext}

## Output Schema
{ "counterclaims": [{ "claimIndex": 1, "counterargument": "...", "strength": "strong" | "moderate" | "weak", "evidenceBasis": "what evidence or reasoning supports this counterargument — cite [title](url) from adversarial sources when available" }] }

Output valid JSON only. No markdown fences.`
    )

    const parsed = safeParseJson(counterResponse) as {
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

/** Simple FNV-1a-style hash for claim text → stable short identifier. */
function simpleHash(str: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(36)
}
