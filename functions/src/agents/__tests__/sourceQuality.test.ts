/**
 * Source Quality Scoring & Counterclaim Tests — Phase 23
 */

import { describe, it, expect, vi } from 'vitest'
import {
  computeSourceQualityScore,
  applyQualityScoresToClaims,
  generateCounterclaims,
} from '../deepResearch/sourceQuality.js'
import type { SourceRecord, ExtractedClaim } from '@lifeos/agents'

function makeSource(overrides?: Partial<SourceRecord>): SourceRecord {
  return {
    sourceId: 'src_1',
    url: 'https://example.com/article',
    title: 'Test Article',
    domain: 'example.com',
    fetchedAtMs: Date.now(),
    fetchMethod: 'read_url',
    contentLength: 1000,
    contentHash: 'hash_1',
    sourceType: 'web',
    ...overrides,
  }
}

function makeClaim(overrides?: Partial<ExtractedClaim>): ExtractedClaim {
  return {
    claimText: 'Test claim',
    confidence: 0.8,
    evidenceType: 'empirical',
    sourceId: 'src_1',
    concepts: ['concept1'],
    ...overrides,
  }
}

describe('computeSourceQualityScore', () => {
  it('gives high scores to high-authority domains', () => {
    const nature = makeSource({ domain: 'nature.com' })
    const random = makeSource({ domain: 'randomsite.xyz' })

    expect(computeSourceQualityScore(nature)).toBeGreaterThan(0.9)
    expect(computeSourceQualityScore(random)).toBeLessThan(0.7)
  })

  it('scores academic sources higher', () => {
    const academic = makeSource({ sourceType: 'academic', domain: 'university.edu' })
    const web = makeSource({ sourceType: 'web', domain: 'blog.com' })

    expect(computeSourceQualityScore(academic)).toBeGreaterThan(computeSourceQualityScore(web))
  })

  it('boosts recent sources by publication year', () => {
    const currentYear = new Date().getFullYear()
    const recent = makeSource({
      sourceType: 'academic',
      domain: 'journal.com',
      scholarMetadata: { year: currentYear },
    })
    const old = makeSource({
      sourceType: 'academic',
      domain: 'journal.com',
      scholarMetadata: { year: currentYear - 15 },
    })

    expect(computeSourceQualityScore(recent)).toBeGreaterThan(computeSourceQualityScore(old))
  })

  it('boosts sources with high citation count', () => {
    const highCitations = makeSource({
      sourceType: 'academic',
      domain: 'journal.com',
      scholarMetadata: { citations: 500 },
    })
    const noCitations = makeSource({
      sourceType: 'academic',
      domain: 'journal.com',
    })

    expect(computeSourceQualityScore(highCitations)).toBeGreaterThan(
      computeSourceQualityScore(noCitations)
    )
  })

  it('returns score between 0 and 1', () => {
    const sources = [
      makeSource({
        domain: 'nature.com',
        sourceType: 'academic',
        scholarMetadata: { citations: 1000 },
      }),
      makeSource({ domain: 'unknown.xyz' }),
    ]

    for (const source of sources) {
      const score = computeSourceQualityScore(source)
      expect(score).toBeGreaterThanOrEqual(0)
      expect(score).toBeLessThanOrEqual(1)
    }
  })
})

describe('applyQualityScoresToClaims', () => {
  it('adjusts claim confidence using weighted blend (70/30)', () => {
    const sources = [makeSource({ sourceId: 'src_1', sourceQualityScore: 0.5 })]
    const claims = [makeClaim({ sourceId: 'src_1', confidence: 0.8 })]

    const result = applyQualityScoresToClaims(claims, sources)

    // Weighted blend: 0.8 * 0.7 + 0.8 * 0.5 * 0.3 = 0.56 + 0.12 = 0.68
    expect(result[0].confidence).toBeCloseTo(0.68, 2)
  })

  it('uses default 0.5 quality for unknown sources', () => {
    const claims = [makeClaim({ sourceId: 'unknown_src', confidence: 1.0 })]

    const result = applyQualityScoresToClaims(claims, [])

    // Weighted blend: 1.0 * 0.7 + 1.0 * 0.5 * 0.3 = 0.7 + 0.15 = 0.85
    expect(result[0].confidence).toBeCloseTo(0.85, 2)
  })

  it('caps confidence at 1.0', () => {
    const sources = [makeSource({ sourceId: 'src_1', sourceQualityScore: 1.0 })]
    const claims = [makeClaim({ sourceId: 'src_1', confidence: 1.0 })]

    const result = applyQualityScoresToClaims(claims, sources)

    expect(result[0].confidence).toBeLessThanOrEqual(1)
  })
})

describe('generateCounterclaims', () => {
  it('produces adversarial arguments for claims', async () => {
    const mockResponse = JSON.stringify({
      counterclaims: [
        {
          claimIndex: 1,
          counterargument: 'This claim ignores confounding variables',
          strength: 'strong',
          evidenceBasis: 'Multiple studies show otherwise',
        },
      ],
    })

    const mockProvider = vi.fn().mockResolvedValue(mockResponse)
    const claims = [makeClaim({ confidence: 0.9 })]

    const result = await generateCounterclaims(claims, 'test query', mockProvider)

    expect(result).toHaveLength(1)
    expect(result[0].counterargument).toContain('confounding')
    expect(result[0].strength).toBe('strong')
  })

  it('returns empty array on empty claims', async () => {
    const mockProvider = vi.fn()
    const result = await generateCounterclaims([], 'query', mockProvider)

    expect(result).toHaveLength(0)
    expect(mockProvider).not.toHaveBeenCalled()
  })

  it('handles provider errors gracefully', async () => {
    const mockProvider = vi.fn().mockRejectedValue(new Error('Failed'))
    const claims = [makeClaim()]

    const result = await generateCounterclaims(claims, 'query', mockProvider)

    expect(result).toHaveLength(0)
  })

  it('validates strength values', async () => {
    const mockResponse = JSON.stringify({
      counterclaims: [
        { claimIndex: 1, counterargument: 'Counter', strength: 'invalid', evidenceBasis: 'basis' },
      ],
    })

    const mockProvider = vi.fn().mockResolvedValue(mockResponse)
    const result = await generateCounterclaims([makeClaim()], 'query', mockProvider)

    expect(result[0].strength).toBe('moderate') // defaults to moderate
  })
})
