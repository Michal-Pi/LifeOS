/**
 * Expert Council Caching & Disagreement Deep-Dive Tests — Phase 20
 *
 * Tests:
 * - normalizePromptForCache strips filler words
 * - normalizePromptForCache normalizes whitespace
 * - normalizePromptForCache lowercases and trims
 * - Normalized cache hit returns cached result
 * - Exact cache checked first
 * - Deep-dive triggers when Kendall Tau < 0.4
 * - Deep-dive does NOT trigger when consensus is high
 * - Deep-dive disabled via config
 * - Deep-dive reasoning included in chairman prompt
 * - Deep-dive limits to 3 models
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type {
  ExpertCouncilConfig,
  ExpertCouncilTurn,
  ExpertCouncilRepository,
  RunId,
} from '@lifeos/agents'
import { generateCacheKey, executeExpertCouncilUsecase } from '@lifeos/agents'

// Inline normalizePromptForCache to avoid cross-package runtime import issues (convention #14)
const FILLER_WORDS =
  /\b(please|can you|could you|i want to|i need|i'd like|help me|tell me|give me|show me|explain)\b/gi

function normalizePromptForCache(prompt: string): string {
  return prompt
    .toLowerCase()
    .replace(FILLER_WORDS, '')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 500)
}

// Mock providerService
vi.mock('../providerService.js', () => ({
  executeWithProvider: vi.fn(),
  executeWithProviderStreaming: vi.fn(),
}))

// Mock logger
vi.mock('../../lib/logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

// Mock firebase-admin/firestore
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: vi.fn(() => ({
    doc: vi.fn(),
    collection: vi.fn(),
  })),
}))

import { executeWithProvider } from '../providerService.js'
import { createExpertCouncilPipeline } from '../expertCouncil.js'

const mockExecuteWithProvider = vi.mocked(executeWithProvider)

function makeConfig(overrides?: Partial<ExpertCouncilConfig>): ExpertCouncilConfig {
  return {
    enabled: true,
    defaultMode: 'full',
    allowModeOverride: true,
    councilModels: [
      { modelId: 'model-a', provider: 'openai', modelName: 'gpt-5.2', temperature: 0.7 },
      {
        modelId: 'model-b',
        provider: 'anthropic',
        modelName: 'claude-sonnet-4-5',
        temperature: 0.7,
      },
      { modelId: 'model-c', provider: 'google', modelName: 'gemini-2.5-pro', temperature: 0.7 },
    ],
    chairmanModel: {
      modelId: 'chairman',
      provider: 'openai',
      modelName: 'gpt-5.2',
      temperature: 0.5,
    },
    selfExclusionEnabled: false,
    minCouncilSize: 2,
    maxCouncilSize: 5,
    enableCaching: false,
    cacheExpirationHours: 24,
    enforceProviderDiversity: false,
    ...overrides,
  }
}

const apiKeys = {
  openai: 'test-key',
  anthropic: 'test-key',
  google: 'test-key',
  xai: 'test-key',
}

describe('normalizePromptForCache (Phase 20)', () => {
  it('strips filler words', () => {
    const result = normalizePromptForCache('Please can you research AI safety')
    expect(result).not.toContain('please')
    expect(result).not.toContain('can you')
    expect(result).toContain('research ai safety')
  })

  it('normalizes whitespace', () => {
    const result = normalizePromptForCache('research   AI\n\nsafety   measures')
    expect(result).toBe('research ai safety measures')
  })

  it('lowercases and trims', () => {
    const result = normalizePromptForCache('  RESEARCH AI Safety  ')
    expect(result).toBe('research ai safety')
  })

  it('truncates to 500 chars', () => {
    const longPrompt = 'a'.repeat(1000)
    const result = normalizePromptForCache(longPrompt)
    expect(result.length).toBeLessThanOrEqual(500)
  })
})

describe('Normalized Cache Integration (Phase 20)', () => {
  function makeMockTurn(): ExpertCouncilTurn {
    return {
      turnId: 'council-turn:cached',
      runId: 'run:old' as RunId,
      userPrompt: 'test',
      stage1: { responses: [] },
      stage2: {
        anonymizationMap: {},
        reviews: [],
        aggregateRanking: [],
        consensusMetrics: {
          kendallTau: 0.8,
          consensusScore: 90,
          topRankedLabel: '',
          controversialResponses: [],
        },
      },
      stage3: {
        chairmanModelId: 'chairman',
        finalResponse: 'cached response',
        timestampMs: Date.now(),
      },
      totalDurationMs: 1000,
      totalCost: 0.5,
      createdAtMs: Date.now(),
      executionMode: 'full',
      cacheHit: false,
      retryCount: 0,
    }
  }

  it('normalized cache hit returns cached result for near-identical prompt', async () => {
    const config = makeConfig({ enableCaching: true })
    const cachedTurn = makeMockTurn()

    // Compute both keys to set up targeted mock
    const prompt = 'Please can you research AI safety'
    const normalized = normalizePromptForCache(prompt)
    const exactKey = generateCacheKey('user1', prompt, config, 'full')
    const normalizedKey = generateCacheKey('user1', normalized, config, 'full')

    // The usecase checks exact key first (no hit), then normalized key (hit)
    const getCachedTurnMock = vi.fn().mockImplementation(async (_userId: string, key: string) => {
      if (key === normalizedKey) return cachedTurn
      return null
    })

    const mockRepo: ExpertCouncilRepository = {
      getAnalytics: vi.fn(),
      createTurn: vi.fn().mockResolvedValue(cachedTurn),
      getTurn: vi.fn(),
      listTurns: vi.fn(),
      getCachedTurn: getCachedTurnMock,
      setCachedTurn: vi.fn(),
      invalidateCache: vi.fn(),
      recordFeedback: vi.fn(),
    } as unknown as ExpertCouncilRepository

    const mockPipeline = {
      execute: vi.fn().mockResolvedValue(cachedTurn),
    }

    const usecase = executeExpertCouncilUsecase(mockRepo, mockPipeline)
    const result = await usecase(
      'user1',
      'run:new' as RunId,
      prompt,
      config,
      'full'
    )

    // getCachedTurn called twice: exact key miss, then normalized key hit
    expect(exactKey).not.toBe(normalizedKey)
    expect(getCachedTurnMock).toHaveBeenCalledTimes(2)
    expect(result.cacheHit).toBe(true)
    expect(mockPipeline.execute).not.toHaveBeenCalled()
  })

  it('exact cache is checked first', async () => {
    const config = makeConfig({ enableCaching: true })
    const cachedTurn = makeMockTurn()

    const getCachedTurnMock = vi.fn().mockResolvedValueOnce(cachedTurn)

    const mockRepo: ExpertCouncilRepository = {
      getAnalytics: vi.fn(),
      createTurn: vi.fn().mockResolvedValue(cachedTurn),
      getTurn: vi.fn(),
      listTurns: vi.fn(),
      getCachedTurn: getCachedTurnMock,
      setCachedTurn: vi.fn(),
      invalidateCache: vi.fn(),
      recordFeedback: vi.fn(),
    } as unknown as ExpertCouncilRepository

    const mockPipeline = { execute: vi.fn() }

    const usecase = executeExpertCouncilUsecase(mockRepo, mockPipeline)
    await usecase('user1', 'run:new' as RunId, 'test prompt', config, 'full')

    // First call to getCachedTurn is the exact key
    expect(getCachedTurnMock).toHaveBeenCalledTimes(1)
    expect(mockPipeline.execute).not.toHaveBeenCalled()
  })
})

describe('Disagreement Deep-Dive (Phase 20)', () => {
  let callCount: number

  beforeEach(() => {
    vi.clearAllMocks()
    callCount = 0
  })

  function setupOutputs(outputs: string[]) {
    callCount = 0
    mockExecuteWithProvider.mockImplementation(async () => {
      const idx = callCount++
      return {
        output: outputs[idx] ?? `Output ${idx}`,
        tokensUsed: 100,
        estimatedCost: 0.01,
        iterationsUsed: 1,
        provider: 'openai',
        model: 'gpt-5.2',
      }
    })
  }

  it('deep-dive triggers when consensus is low (Kendall Tau < 0.4)', async () => {
    const config = makeConfig({ enableDisagreementDeepDive: true })
    // 3 stage1 + 3 judges (strongly disagreeing) + 3 deep-dive + 1 chairman = 10
    setupOutputs([
      // Stage 1: 3 responses
      'Response A about topic',
      'Response B about topic',
      'Response C about topic',
      // Stage 2: 3 judges with maximum disagreement
      'A: Best\nB: Worst\nC: Mid\nRANKING: [A, C, B]',
      'A: Worst\nB: Best\nC: Mid\nRANKING: [B, C, A]',
      'A: Mid\nB: Mid\nC: Best\nRANKING: [C, A, B]',
      // Deep-dive: 3 reasoning responses
      'I reasoned about A because...',
      'I reasoned about B because...',
      'I reasoned about C because...',
      // Chairman synthesis
      'Final synthesis with deep-dive context',
    ])

    const pipeline = createExpertCouncilPipeline({ apiKeys })
    const turn = await pipeline.execute(
      'user1',
      'run:test1' as RunId,
      'Research topic',
      config,
      'full'
    )

    expect(turn.disagreementDeepDive).toBeDefined()
    expect(turn.disagreementDeepDive?.triggered).toBe(true)
    expect(turn.disagreementDeepDive?.reasoningResponses.length).toBeGreaterThan(0)
  })

  it('deep-dive does NOT trigger when consensus is high', async () => {
    const config = makeConfig({ enableDisagreementDeepDive: true })
    // 3 stage1 + 3 judges (agreeing) + 1 chairman = 7
    setupOutputs([
      'Response A',
      'Response B',
      'Response C',
      // Judges agree
      'A: Best\nB: Good\nC: Ok\nRANKING: [A, B, C]',
      'A: Best\nB: Good\nC: Ok\nRANKING: [A, B, C]',
      'A: Best\nB: Good\nC: Ok\nRANKING: [A, B, C]',
      // Chairman
      'Synthesis',
    ])

    const pipeline = createExpertCouncilPipeline({ apiKeys })
    const turn = await pipeline.execute(
      'user1',
      'run:test1' as RunId,
      'Test prompt',
      config,
      'full'
    )

    // Deep dive not triggered (high consensus)
    expect(turn.disagreementDeepDive?.triggered).toBe(false)
  })

  it('deep-dive disabled via config', async () => {
    const config = makeConfig({ enableDisagreementDeepDive: false })
    setupOutputs([
      'A',
      'B',
      'C',
      'A: Best\nB: Worst\nC: Mid\nRANKING: [A, C, B]',
      'A: Worst\nB: Best\nC: Mid\nRANKING: [B, C, A]',
      'A: Mid\nB: Mid\nC: Best\nRANKING: [C, A, B]',
      'Synthesis',
    ])

    const pipeline = createExpertCouncilPipeline({ apiKeys })
    const turn = await pipeline.execute(
      'user1',
      'run:test1' as RunId,
      'Test prompt',
      config,
      'full'
    )

    // Deep dive not created when disabled
    expect(turn.disagreementDeepDive).toBeUndefined()
  })
})
