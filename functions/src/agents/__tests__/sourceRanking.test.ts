/**
 * Source Ranking & Deduplication Tests — Phase 22
 */

import { describe, it, expect, vi } from 'vitest'
import { rankSourcesByRelevance, deduplicateSources } from '../deepResearch/sourceIngestion.js'
import type { SearchResult, SourceRecord } from '@lifeos/agents'

function makeSearchResult(overrides?: Partial<SearchResult>): SearchResult {
  return {
    url: 'https://example.com/article',
    title: 'Test Article',
    snippet: 'A snippet about the topic',
    source: 'serp',
    ...overrides,
  }
}

function makeSource(id: string, url: string, score?: number): SourceRecord {
  return {
    sourceId: id,
    url,
    title: `Source ${id}`,
    domain: 'example.com',
    fetchedAtMs: Date.now(),
    fetchMethod: 'read_url',
    contentLength: 1000,
    contentHash: `hash_${id}`,
    sourceType: 'web',
    relevanceScore: score,
  }
}

describe('deduplicateSources', () => {
  it('merges duplicate URLs keeping highest score', () => {
    const sources = [
      makeSource('s1', 'https://example.com/article', 0.5),
      makeSource('s2', 'https://example.com/article', 0.9),
      makeSource('s3', 'https://other.com/page', 0.7),
    ]

    const result = deduplicateSources(sources)

    expect(result).toHaveLength(2)
    const article = result.find((s) => s.url.includes('example.com/article'))
    expect(article?.relevanceScore).toBe(0.9)
    expect(article?.sourceId).toBe('s2')
  })

  it('normalizes trailing slashes', () => {
    const sources = [
      makeSource('s1', 'https://example.com/page/', 0.6),
      makeSource('s2', 'https://example.com/page', 0.8),
    ]

    const result = deduplicateSources(sources)
    expect(result).toHaveLength(1)
    expect(result[0].relevanceScore).toBe(0.8)
  })

  it('handles empty array', () => {
    expect(deduplicateSources([])).toHaveLength(0)
  })

  it('preserves unique sources', () => {
    const sources = [
      makeSource('s1', 'https://a.com', 0.5),
      makeSource('s2', 'https://b.com', 0.6),
      makeSource('s3', 'https://c.com', 0.7),
    ]

    expect(deduplicateSources(sources)).toHaveLength(3)
  })
})

describe('rankSourcesByRelevance', () => {
  it('orders sources by relevance score', async () => {
    const results = [
      makeSearchResult({ url: 'https://a.com', title: 'Low relevance' }),
      makeSearchResult({ url: 'https://b.com', title: 'High relevance' }),
      makeSearchResult({ url: 'https://c.com', title: 'Medium relevance' }),
    ]

    const mockProvider = vi.fn().mockResolvedValue('[2, 5, 3]')

    const ranked = await rankSourcesByRelevance(results, 'test query', mockProvider)

    expect(ranked).toHaveLength(3)
    // b.com scored 5, c.com scored 3, a.com scored 2
    expect(ranked[0].url).toBe('https://b.com')
    expect(ranked[1].url).toBe('https://c.com')
    expect(ranked[2].url).toBe('https://a.com')
  })

  it('handles empty results gracefully', async () => {
    const mockProvider = vi.fn()
    const ranked = await rankSourcesByRelevance([], 'query', mockProvider)

    expect(ranked).toHaveLength(0)
    expect(mockProvider).not.toHaveBeenCalled()
  })

  it('returns original order on provider failure', async () => {
    const results = [
      makeSearchResult({ url: 'https://a.com' }),
      makeSearchResult({ url: 'https://b.com' }),
    ]

    const mockProvider = vi.fn().mockRejectedValue(new Error('Failed'))
    const ranked = await rankSourcesByRelevance(results, 'query', mockProvider)

    expect(ranked).toHaveLength(2)
    expect(ranked[0].url).toBe('https://a.com')
  })

  it('clamps scores to valid range', async () => {
    const results = [makeSearchResult({ url: 'https://a.com' })]
    const mockProvider = vi.fn().mockResolvedValue('[10]')

    const ranked = await rankSourcesByRelevance(results, 'query', mockProvider)

    expect(ranked[0].relevanceScore).toBeLessThanOrEqual(1)
  })
})
