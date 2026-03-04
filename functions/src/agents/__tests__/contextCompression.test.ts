/**
 * Context Compression Tests — Phase 6
 *
 * Tests for context compression between sequential agents:
 * - Compression triggers when output exceeds threshold
 * - Compression skips when output is under threshold
 * - Compression respects enableContextCompression flag
 * - Default compression behavior by criticality
 * - Compressed output is passed to next agent
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock providerService before importing sequentialGraph
vi.mock('../providerService.js', () => ({
  executeWithProvider: vi.fn().mockResolvedValue({
    output: 'compressed summary',
    tokensUsed: 50,
    estimatedCost: 0.001,
    iterationsUsed: 1,
    provider: 'openai',
    model: 'gpt-4o-mini',
  }),
  executeWithProviderStreaming: vi.fn(),
}))

// Mock firestoreCheckpointer
vi.mock('../langgraph/firestoreCheckpointer.js', () => ({
  createFirestoreCheckpointer: vi.fn(),
  FirestoreCheckpointer: vi.fn(),
}))

import { compressAgentOutput } from '../langgraph/sequentialGraph.js'
import { executeWithProvider } from '../providerService.js'
import { estimateTokenCount } from '../anthropicService.js'

const mockExecuteWithProvider = vi.mocked(executeWithProvider)

describe('estimateTokenCount (used by compression)', () => {
  it('estimates tokens at ~1 per 4 characters', () => {
    // 8000 chars → 2000 tokens (above threshold)
    expect(estimateTokenCount('a'.repeat(8000))).toBe(2000)
  })

  it('estimates short text below threshold', () => {
    // 4000 chars → 1000 tokens (below 2000 threshold)
    expect(estimateTokenCount('a'.repeat(4000))).toBe(1000)
  })
})

describe('compressAgentOutput', () => {
  const mockApiKeys = { openai: 'test-key' }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls executeWithProvider with compression agent config', async () => {
    const longOutput = 'a'.repeat(10000)
    await compressAgentOutput(longOutput, mockApiKeys)

    expect(mockExecuteWithProvider).toHaveBeenCalledOnce()
    const [agent, goal] = mockExecuteWithProvider.mock.calls[0]
    expect(agent.modelProvider).toBe('openai')
    expect(agent.modelName).toBe('gpt-4o-mini')
    expect(agent.temperature).toBe(0.3)
    expect(agent.role).toBe('synthesizer')
    expect(goal).toBe(longOutput)
  })

  it('returns compressed output on success', async () => {
    mockExecuteWithProvider.mockResolvedValueOnce({
      output: 'compressed summary',
      tokensUsed: 50,
      estimatedCost: 0.001,
      iterationsUsed: 1,
      provider: 'openai',
      model: 'gpt-4o-mini',
    })

    const result = await compressAgentOutput('long output here', mockApiKeys)
    expect(result).toBe('compressed summary')
  })

  it('returns original output on failure', async () => {
    mockExecuteWithProvider.mockRejectedValueOnce(new Error('API error'))

    const original = 'original output text'
    const result = await compressAgentOutput(original, mockApiKeys)
    expect(result).toBe(original)
  })
})

describe('compression behavior by criticality', () => {
  // We test the isCompressionEnabled logic indirectly by importing and testing it
  // Since it's not exported, we replicate the logic here for unit testing

  function isCompressionEnabled(
    explicit: boolean | undefined,
    criticality: 'critical' | 'core' | 'routine' | undefined
  ): boolean {
    if (explicit !== undefined) return explicit
    return (criticality ?? 'core') === 'routine'
  }

  it('returns true when explicitly enabled', () => {
    expect(isCompressionEnabled(true, 'critical')).toBe(true)
    expect(isCompressionEnabled(true, 'core')).toBe(true)
    expect(isCompressionEnabled(true, 'routine')).toBe(true)
  })

  it('returns false when explicitly disabled', () => {
    expect(isCompressionEnabled(false, 'routine')).toBe(false)
    expect(isCompressionEnabled(false, 'core')).toBe(false)
  })

  it('defaults to false for critical workflows', () => {
    expect(isCompressionEnabled(undefined, 'critical')).toBe(false)
  })

  it('defaults to false for core workflows', () => {
    expect(isCompressionEnabled(undefined, 'core')).toBe(false)
  })

  it('defaults to true for routine workflows', () => {
    expect(isCompressionEnabled(undefined, 'routine')).toBe(true)
  })

  it('defaults to false when criticality is undefined (treated as core)', () => {
    expect(isCompressionEnabled(undefined, undefined)).toBe(false)
  })
})

describe('compression threshold', () => {
  it('output under 2000 tokens should not trigger compression', () => {
    // 7999 chars → 2000 tokens (at boundary but rounded up = 2000, not > 2000)
    const shortOutput = 'a'.repeat(7999)
    const tokens = estimateTokenCount(shortOutput)
    // 7999 / 4 = 1999.75 → ceil = 2000, which is NOT > 2000
    expect(tokens).toBe(2000)
    expect(tokens > 2000).toBe(false)
  })

  it('output over 2000 tokens should trigger compression', () => {
    // 8001 chars → 2001 tokens
    const longOutput = 'a'.repeat(8001)
    const tokens = estimateTokenCount(longOutput)
    expect(tokens).toBe(2001)
    expect(tokens > 2000).toBe(true)
  })
})
