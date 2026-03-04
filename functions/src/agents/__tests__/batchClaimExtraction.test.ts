/**
 * Batch Claim Extraction Tests — Phase 21
 *
 * Tests for extractClaimsFromSourceBatch, buildBatchExtractionPrompt,
 * and parseBatchExtractionOutput.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  extractClaimsFromSourceBatch,
  buildBatchExtractionPrompt,
  parseBatchExtractionOutput,
  type ProviderExecuteFn,
} from '../deepResearch/claimExtraction.js'
import type { SourceRecord, RunBudget } from '@lifeos/agents'

function makeSource(id: string): SourceRecord {
  return {
    sourceId: id,
    url: `https://example.com/${id}`,
    title: `Source ${id}`,
    domain: 'example.com',
    fetchedAtMs: Date.now(),
    fetchMethod: 'read_url',
    contentLength: 1000,
    contentHash: `hash_${id}`,
    sourceType: 'web',
    relevanceScore: 0.8,
  }
}

function makeBudget(overrides?: Partial<RunBudget>): RunBudget {
  return {
    maxBudgetUsd: 10,
    spentUsd: 0,
    spentTokens: 0,
    searchCallsUsed: 0,
    maxSearchCalls: 20,
    llmCallsUsed: 0,
    phase: 'full',
    maxRecursiveDepth: 3,
    gapIterationsUsed: 0,
    ...overrides,
  }
}

const MOCK_BATCH_RESPONSE = JSON.stringify({
  claims: [
    {
      sourceIndex: 1,
      claimText: 'Claim from source 1',
      confidence: 0.9,
      evidenceType: 'empirical',
      sourceQuote: 'Evidence quote 1',
      concepts: ['concept1'],
    },
    {
      sourceIndex: 2,
      claimText: 'Claim from source 2',
      confidence: 0.7,
      evidenceType: 'theoretical',
      sourceQuote: 'Evidence quote 2',
      concepts: ['concept2'],
    },
    {
      sourceIndex: 3,
      claimText: 'Claim from source 3',
      confidence: 0.8,
      evidenceType: 'statistical',
      sourceQuote: 'Evidence quote 3',
      concepts: ['concept3'],
    },
  ],
})

describe('buildBatchExtractionPrompt', () => {
  it('concatenates sources with clear delimiters', () => {
    const sources = [
      { sourceId: 'src_1', content: 'Content for source 1' },
      { sourceId: 'src_2', content: 'Content for source 2' },
    ]

    const prompt = buildBatchExtractionPrompt(sources, 'test query')

    expect(prompt).toContain('--- SOURCE 1 [src_1] ---')
    expect(prompt).toContain('--- SOURCE 2 [src_2] ---')
    expect(prompt).toContain('Content for source 1')
    expect(prompt).toContain('Content for source 2')
    expect(prompt).toContain('test query')
  })

  it('truncates each source to 3000 chars', () => {
    const longContent = 'x'.repeat(5000)
    const sources = [{ sourceId: 'src_1', content: longContent }]

    const prompt = buildBatchExtractionPrompt(sources, 'query')

    // The source content in the prompt should be truncated
    const sourceSection = prompt.split('--- SOURCE 1 [src_1] ---')[1]
    expect(sourceSection.length).toBeLessThan(longContent.length)
  })
})

describe('parseBatchExtractionOutput', () => {
  it('correctly attributes claims to individual sources', () => {
    const sources = [{ sourceId: 'src_a' }, { sourceId: 'src_b' }, { sourceId: 'src_c' }]

    const claims = parseBatchExtractionOutput(MOCK_BATCH_RESPONSE, sources)

    expect(claims).toHaveLength(3)
    expect(claims[0].sourceId).toBe('src_a')
    expect(claims[1].sourceId).toBe('src_b')
    expect(claims[2].sourceId).toBe('src_c')
  })

  it('handles out-of-range sourceIndex gracefully', () => {
    const response = JSON.stringify({
      claims: [
        {
          sourceIndex: 99,
          claimText: 'Out of range',
          confidence: 0.5,
          evidenceType: 'theoretical',
          concepts: [],
        },
      ],
    })
    const sources = [{ sourceId: 'src_only' }]

    const claims = parseBatchExtractionOutput(response, sources)

    expect(claims).toHaveLength(1)
    // Should clamp to last valid source
    expect(claims[0].sourceId).toBe('src_only')
  })

  it('returns empty array on parse failure', () => {
    const claims = parseBatchExtractionOutput('not json at all', [{ sourceId: 'src_1' }])
    expect(claims).toHaveLength(0)
  })

  it('filters claims without claimText', () => {
    const response = JSON.stringify({
      claims: [
        { sourceIndex: 1, confidence: 0.5, evidenceType: 'theoretical', concepts: [] },
        {
          sourceIndex: 1,
          claimText: 'Valid claim',
          confidence: 0.5,
          evidenceType: 'theoretical',
          concepts: [],
        },
      ],
    })

    const claims = parseBatchExtractionOutput(response, [{ sourceId: 'src_1' }])
    expect(claims).toHaveLength(1)
    expect(claims[0].claimText).toBe('Valid claim')
  })
})

describe('extractClaimsFromSourceBatch', () => {
  let mockProvider: ProviderExecuteFn

  beforeEach(() => {
    mockProvider = vi.fn().mockResolvedValue(MOCK_BATCH_RESPONSE)
  })

  it('groups sources into correct number of batches', async () => {
    const sources = Array.from({ length: 7 }, (_, i) => makeSource(`src_${i}`))
    const contentMap: Record<string, string> = {}
    sources.forEach((s) => {
      contentMap[s.sourceId] = `Content for ${s.sourceId}`
    })

    await extractClaimsFromSourceBatch(sources, contentMap, 'query', mockProvider, makeBudget(), 3)

    // 7 sources, batch 3 → 3 batches (3+3+1)
    expect(mockProvider).toHaveBeenCalledTimes(3)
  })

  it('makes single LLM call per batch (not per source)', async () => {
    const sources = [makeSource('src_1'), makeSource('src_2'), makeSource('src_3')]
    const contentMap: Record<string, string> = {
      src_1: 'Content 1',
      src_2: 'Content 2',
      src_3: 'Content 3',
    }

    await extractClaimsFromSourceBatch(sources, contentMap, 'query', mockProvider, makeBudget(), 3)

    // 3 sources in 1 batch = 1 LLM call
    expect(mockProvider).toHaveBeenCalledTimes(1)
  })

  it('handles fewer sources than batch size', async () => {
    const sources = [makeSource('src_1')]
    const contentMap = { src_1: 'Content 1' }

    const { claims } = await extractClaimsFromSourceBatch(
      sources,
      contentMap,
      'query',
      mockProvider,
      makeBudget(),
      5
    )

    expect(mockProvider).toHaveBeenCalledTimes(1)
    expect(claims.length).toBeGreaterThan(0)
  })

  it('skips sources with no content in contentMap', async () => {
    const sources = [makeSource('src_1'), makeSource('src_no_content'), makeSource('src_2')]
    const contentMap = { src_1: 'Content 1', src_2: 'Content 2' }

    await extractClaimsFromSourceBatch(sources, contentMap, 'query', mockProvider, makeBudget(), 5)

    // Only 2 sources have content, so provider should be called once with batch of 2
    expect(mockProvider).toHaveBeenCalledTimes(1)
    const callArg = (mockProvider as ReturnType<typeof vi.fn>).mock.calls[0][1] as string
    expect(callArg).not.toContain('src_no_content')
  })

  it('stops processing when budget is insufficient', async () => {
    const sources = Array.from({ length: 6 }, (_, i) => makeSource(`src_${i}`))
    const contentMap: Record<string, string> = {}
    sources.forEach((s) => {
      contentMap[s.sourceId] = `Content for ${s.sourceId}`
    })

    // Nearly exhausted budget
    const tightBudget = makeBudget({ maxBudgetUsd: 0.01, spentUsd: 0.009, phase: 'minimal' })

    await extractClaimsFromSourceBatch(sources, contentMap, 'query', mockProvider, tightBudget, 3)

    // Should have stopped early — won't process all batches
    expect((mockProvider as ReturnType<typeof vi.fn>).mock.calls.length).toBeLessThan(2)
  })

  it('returns deduplicated claims', async () => {
    const dupeResponse = JSON.stringify({
      claims: [
        {
          sourceIndex: 1,
          claimText: 'Same claim',
          confidence: 0.9,
          evidenceType: 'empirical',
          concepts: [],
        },
        {
          sourceIndex: 1,
          claimText: 'Same claim',
          confidence: 0.8,
          evidenceType: 'empirical',
          concepts: [],
        },
      ],
    })
    ;(mockProvider as ReturnType<typeof vi.fn>).mockResolvedValue(dupeResponse)

    const sources = [makeSource('src_1')]
    const contentMap = { src_1: 'Content 1' }

    const { claims } = await extractClaimsFromSourceBatch(
      sources,
      contentMap,
      'query',
      mockProvider,
      makeBudget()
    )

    expect(claims).toHaveLength(1)
  })

  it('handles provider errors gracefully', async () => {
    ;(mockProvider as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('LLM failed'))

    const sources = [makeSource('src_1')]
    const contentMap = { src_1: 'Content 1' }

    const { claims } = await extractClaimsFromSourceBatch(
      sources,
      contentMap,
      'query',
      mockProvider,
      makeBudget()
    )

    expect(claims).toHaveLength(0)
  })
})
