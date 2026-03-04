/**
 * Evaluation Pipeline Tests — Phase 8
 *
 * Tests for auto-evaluation of run output quality using a cheap judge model.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ProviderExecutionResult } from '../providerService.js'

vi.mock('../providerService.js', () => ({
  executeWithProvider: vi.fn(),
}))

vi.mock('../../lib/logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

import { evaluateRunOutput, buildJudgeAgentConfig } from '../evaluation.js'
import { executeWithProvider } from '../providerService.js'

const mockExecuteWithProvider = vi.mocked(executeWithProvider)

const mockApiKeys = { openai: 'test-key' }

function makeProviderResult(output: string): ProviderExecutionResult {
  return {
    output,
    tokensUsed: 50,
    estimatedCost: 0.001,
    iterationsUsed: 1,
    provider: 'openai',
    model: 'gpt-4o-mini',
  }
}

describe('evaluateRunOutput', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns scores on successful evaluation', async () => {
    mockExecuteWithProvider.mockResolvedValue(
      makeProviderResult('{"relevance": 4, "completeness": 3, "accuracy": 5}')
    )

    const result = await evaluateRunOutput('Some output', 'Do something useful', mockApiKeys)

    expect(result).not.toBeNull()
    expect(result!.relevance).toBe(4)
    expect(result!.completeness).toBe(3)
    expect(result!.accuracy).toBe(5)
    expect(result!.evaluatedAtMs).toBeGreaterThan(0)
  })

  it('returns null for invalid JSON response', async () => {
    mockExecuteWithProvider.mockResolvedValue(makeProviderResult('This is not valid JSON at all'))

    const result = await evaluateRunOutput('Some output', 'Do something', mockApiKeys)

    expect(result).toBeNull()
  })

  it('returns null when scores are out of range', async () => {
    mockExecuteWithProvider.mockResolvedValue(
      makeProviderResult('{"relevance": 7, "completeness": 0, "accuracy": 3}')
    )

    const result = await evaluateRunOutput('Some output', 'Do something', mockApiKeys)

    expect(result).toBeNull()
  })

  it('returns null when provider throws', async () => {
    mockExecuteWithProvider.mockRejectedValue(new Error('Provider unavailable'))

    const result = await evaluateRunOutput('Some output', 'Do something', mockApiKeys)

    expect(result).toBeNull()
  })

  it('truncates long output before sending to provider', async () => {
    mockExecuteWithProvider.mockResolvedValue(
      makeProviderResult('{"relevance": 4, "completeness": 4, "accuracy": 4}')
    )

    const longOutput = 'x'.repeat(20000)
    await evaluateRunOutput(longOutput, 'Do something', mockApiKeys)

    expect(mockExecuteWithProvider).toHaveBeenCalledTimes(1)
    const passedGoal = mockExecuteWithProvider.mock.calls[0][1]
    // The prompt should contain truncated output (16000 chars max) + goal prefix
    expect(passedGoal.length).toBeLessThan(longOutput.length + 100)
    expect(passedGoal).toContain('x'.repeat(100)) // still has content
    // Output portion should be truncated to MAX_OUTPUT_CHARS (16000)
    const outputPortion = passedGoal.split('Output to evaluate:\n')[1]
    expect(outputPortion.length).toBe(16000)
  })

  it('passes short output without truncation', async () => {
    mockExecuteWithProvider.mockResolvedValue(
      makeProviderResult('{"relevance": 5, "completeness": 5, "accuracy": 5}')
    )

    const shortOutput = 'Short answer here'
    await evaluateRunOutput(shortOutput, 'Question', mockApiKeys)

    const passedGoal = mockExecuteWithProvider.mock.calls[0][1]
    expect(passedGoal).toContain(shortOutput)
  })

  it('returns null when scores are missing fields', async () => {
    mockExecuteWithProvider.mockResolvedValue(makeProviderResult('{"relevance": 4}'))

    const result = await evaluateRunOutput('Output', 'Goal', mockApiKeys)

    expect(result).toBeNull()
  })

  it('returns null when scores are not numbers', async () => {
    mockExecuteWithProvider.mockResolvedValue(
      makeProviderResult('{"relevance": "high", "completeness": "medium", "accuracy": "low"}')
    )

    const result = await evaluateRunOutput('Output', 'Goal', mockApiKeys)

    expect(result).toBeNull()
  })
})

describe('buildJudgeAgentConfig', () => {
  it('uses gpt-4o-mini for cheap evaluation', () => {
    const config = buildJudgeAgentConfig()

    expect(config.modelProvider).toBe('openai')
    expect(config.modelName).toBe('gpt-4o-mini')
  })

  it('uses low temperature for consistent scoring', () => {
    const config = buildJudgeAgentConfig()

    expect(config.temperature).toBe(0.1)
  })

  it('has a deterministic agent ID', () => {
    const config = buildJudgeAgentConfig()

    expect(config.agentId).toBe('__run_evaluator__')
  })

  it('has a system prompt instructing JSON-only output', () => {
    const config = buildJudgeAgentConfig()

    expect(config.systemPrompt).toContain('Respond ONLY with JSON')
    expect(config.systemPrompt).toContain('"relevance"')
    expect(config.systemPrompt).toContain('"completeness"')
    expect(config.systemPrompt).toContain('"accuracy"')
  })
})
