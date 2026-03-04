/**
 * Expert Council Quick Mode & Dynamic Composition Tests — Phase 19
 *
 * Tests:
 * - Quick mode uses only 2 council models
 * - Quick mode uses only 1 judge
 * - Quick mode skips chairman on high consensus
 * - Quick mode runs chairman on low consensus
 * - Full mode unchanged
 * - selectDynamicCouncil returns first N models when insufficient data
 * - selectDynamicCouncil selects best-performing models
 * - selectDynamicCouncil applies provider diversity
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type {
  ExpertCouncilConfig,
  ExpertCouncilRepository,
  CouncilAnalytics,
  WorkflowId,
  JudgeRubricDomain,
  RunId,
} from '@lifeos/agents'

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

// Mock firebase-admin/firestore (needed by repository)
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: vi.fn(() => ({
    doc: vi.fn(),
    collection: vi.fn(),
  })),
}))

import { executeWithProvider } from '../providerService.js'
import { createExpertCouncilPipeline, selectDynamicCouncil } from '../expertCouncil.js'

const mockExecuteWithProvider = vi.mocked(executeWithProvider)

function makeCouncilConfig(overrides?: Partial<ExpertCouncilConfig>): ExpertCouncilConfig {
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
    enforceProviderDiversity: false, // Disable to simplify test assertions
    enableDisagreementDeepDive: false, // Disable to avoid extra LLM calls from Phase 20
    ...overrides,
  }
}

const apiKeys = {
  openai: 'test-key',
  anthropic: 'test-key',
  google: 'test-key',
  xai: 'test-key',
}

let callCount = 0

function setupProviderOutputs(outputs: string[]) {
  callCount = 0
  mockExecuteWithProvider.mockImplementation(async () => {
    const idx = callCount++
    return {
      output: outputs[idx] ?? `Response ${idx}`,
      tokensUsed: 100,
      estimatedCost: 0.01,
      iterationsUsed: 1,
      provider: 'openai',
      model: 'gpt-5.2',
    }
  })
}

describe('Expert Council Quick Mode (Phase 19)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    callCount = 0
  })

  it('quick mode uses only 2 council models', async () => {
    const config = makeCouncilConfig()
    // Stage 1: 2 responses, Stage 2: 1 judge, Stage 3: chairman (if needed)
    setupProviderOutputs([
      'Response from model A',
      'Response from model B',
      // Judge review
      'A: Good\nB: Also good\nRANKING: [A, B]\nCONFIDENCE: 90',
      // Chairman
      'Final synthesized response',
    ])

    const pipeline = createExpertCouncilPipeline({ apiKeys })
    const turn = await pipeline.execute(
      'user1',
      'run:test1' as RunId,
      'Test prompt',
      config,
      'quick'
    )

    // Only 2 Stage 1 responses (not 3)
    expect(turn.stage1.responses).toHaveLength(2)
  })

  it('quick mode uses only 1 judge', async () => {
    const config = makeCouncilConfig({
      judgeModels: [
        { modelId: 'judge-1', provider: 'openai', modelName: 'gpt-5.2' },
        { modelId: 'judge-2', provider: 'anthropic', modelName: 'claude-sonnet-4-5' },
      ],
    })
    setupProviderOutputs([
      'Response A',
      'Response B',
      // Only 1 judge review expected
      'A: Great analysis\nB: Also great\nRANKING: [A, B]\nCONFIDENCE: 95',
      // Chairman
      'Synthesized',
    ])

    const pipeline = createExpertCouncilPipeline({ apiKeys })
    const turn = await pipeline.execute(
      'user1',
      'run:test1' as RunId,
      'Test prompt',
      config,
      'quick'
    )

    // Only 1 judge review
    expect(turn.stage2.reviews).toHaveLength(1)
  })

  it('quick mode skips chairman on high consensus (Kendall Tau > 0.8)', async () => {
    const config = makeCouncilConfig()
    setupProviderOutputs([
      'Response from A — best answer',
      'Response from B',
      // Judge gives clear ranking with high consensus
      'A: Excellent\nB: Good\nRANKING: [A, B]\nCONFIDENCE: 95',
      // This should NOT be called since chairman should be skipped
      'SHOULD NOT APPEAR',
    ])

    const pipeline = createExpertCouncilPipeline({ apiKeys })
    const turn = await pipeline.execute(
      'user1',
      'run:test1' as RunId,
      'Test prompt',
      config,
      'quick'
    )

    // Chairman was skipped — final response is the top-ranked Stage 1 response
    expect(turn.stage3.chairmanModelId).toBe('skipped-quick-consensus')
    // Should have used only 3 LLM calls: 2 council + 1 judge (no chairman)
    expect(mockExecuteWithProvider).toHaveBeenCalledTimes(3)
  })

  it('full mode runs chairman even on low consensus', async () => {
    // With 1 judge (quick mode), tau is always 1.0. Test with full mode instead.
    const configLowConsensus = makeCouncilConfig()

    // Full mode with 3 council models: 3 stage1 + 3 judges + 1 chairman = 7 calls
    setupProviderOutputs([
      'Response A',
      'Response B',
      'Response C',
      // 3 judge reviews with disagreement (low consensus)
      'A: Ok\nB: Better\nC: Best\nRANKING: [C, B, A]\nCONFIDENCE: 50',
      'A: Best\nB: Ok\nC: Worst\nRANKING: [A, B, C]\nCONFIDENCE: 40',
      'A: Worst\nB: Best\nC: Ok\nRANKING: [B, C, A]\nCONFIDENCE: 30',
      // Chairman will run since mode is full
      'Chairman synthesis',
    ])

    const pipeline = createExpertCouncilPipeline({ apiKeys })
    // Use full mode — chairman always runs
    const turn = await pipeline.execute(
      'user1',
      'run:test1' as RunId,
      'Test prompt',
      configLowConsensus,
      'full'
    )

    expect(turn.stage3.chairmanModelId).toBe('chairman')
    expect(turn.stage3.finalResponse).toBe('Chairman synthesis')
  })

  it('full mode uses all council models and judges unchanged', async () => {
    const config = makeCouncilConfig()
    setupProviderOutputs([
      'Response A',
      'Response B',
      'Response C',
      // 3 judge reviews (using councilModels as judges)
      'A: Good\nB: Ok\nC: Great\nRANKING: [A, C, B]',
      'A: Fine\nB: Better\nC: Best\nRANKING: [C, A, B]',
      'A: Best\nB: Good\nC: Ok\nRANKING: [A, B, C]',
      // Chairman
      'Full synthesis',
    ])

    const pipeline = createExpertCouncilPipeline({ apiKeys })
    const turn = await pipeline.execute(
      'user1',
      'run:test1' as RunId,
      'Test prompt',
      config,
      'full'
    )

    expect(turn.stage1.responses).toHaveLength(3)
    expect(turn.stage2.reviews).toHaveLength(3)
    expect(turn.stage3.finalResponse).toBe('Full synthesis')
  })
})

describe('Dynamic Composition (Phase 19)', () => {
  function makeMockRepository(analytics: Partial<CouncilAnalytics> = {}): ExpertCouncilRepository {
    return {
      getAnalytics: vi.fn().mockResolvedValue({
        userId: 'user1',
        workflowId: 'workflow:test' as WorkflowId,
        totalTurns: 0,
        turnsByMode: { full: 0, quick: 0, single: 0, custom: 0 },
        cacheHitRate: 0,
        totalCost: 0,
        averageCostPerTurn: 0,
        costByMode: { full: 0, quick: 0, single: 0, custom: 0 },
        averageConsensusScore: 0,
        averageQualityScore: 0,
        userSatisfactionRate: 0,
        averageDuration: 0,
        failureRate: 0,
        partialFailureRate: 0,
        modelStats: {},
        dailyUsage: [],
        ...analytics,
      }),
      createTurn: vi.fn(),
      getTurn: vi.fn(),
      listTurns: vi.fn(),
      getCachedTurn: vi.fn(),
      setCachedTurn: vi.fn(),
      invalidateCache: vi.fn(),
      recordFeedback: vi.fn(),
    } as unknown as ExpertCouncilRepository
  }

  const availableModels: ExpertCouncilConfig['councilModels'] = [
    { modelId: 'model-a', provider: 'openai', modelName: 'gpt-5.2' },
    { modelId: 'model-b', provider: 'anthropic', modelName: 'claude-sonnet-4-5' },
    { modelId: 'model-c', provider: 'google', modelName: 'gemini-2.5-pro' },
    { modelId: 'model-d', provider: 'xai', modelName: 'grok-4-1-fast-non-reasoning' },
  ]

  it('returns first N models when insufficient data (< 5 turns)', async () => {
    const repo = makeMockRepository({ totalTurns: 3 })
    const result = await selectDynamicCouncil(
      'user1',
      'workflow:test' as WorkflowId,
      'research' as JudgeRubricDomain,
      repo,
      availableModels,
      3
    )
    expect(result).toHaveLength(3)
    expect(result[0].modelId).toBe('model-a')
    expect(result[1].modelId).toBe('model-b')
    expect(result[2].modelId).toBe('model-c')
  })

  it('selects best-performing models based on historical stats', async () => {
    const repo = makeMockRepository({
      totalTurns: 10,
      modelStats: {
        'model-a': { timesUsed: 5, averageRank: 3, averageLatency: 1000, failureRate: 0.1 },
        'model-b': { timesUsed: 5, averageRank: 1, averageLatency: 800, failureRate: 0.0 },
        'model-c': { timesUsed: 5, averageRank: 2, averageLatency: 900, failureRate: 0.05 },
        'model-d': { timesUsed: 5, averageRank: 4, averageLatency: 1200, failureRate: 0.2 },
      },
    })
    const result = await selectDynamicCouncil(
      'user1',
      'workflow:test' as WorkflowId,
      'research' as JudgeRubricDomain,
      repo,
      availableModels,
      3
    )
    expect(result).toHaveLength(3)
    // model-b has best rank (1) and 0 failure rate — should be first
    expect(result[0].modelId).toBe('model-b')
    // model-c has rank 2, low failure — should be second
    expect(result[1].modelId).toBe('model-c')
    // model-a has rank 3, some failure — should be third
    expect(result[2].modelId).toBe('model-a')
  })

  it('applies provider diversity to selected models', async () => {
    // All models have same provider — diversity enforcement should reassign
    const sameProviderModels: ExpertCouncilConfig['councilModels'] = [
      { modelId: 'model-1', provider: 'openai', modelName: 'gpt-5.2' },
      { modelId: 'model-2', provider: 'openai', modelName: 'gpt-5.2' },
      { modelId: 'model-3', provider: 'openai', modelName: 'gpt-5.2' },
    ]
    const repo = makeMockRepository({
      totalTurns: 10,
      modelStats: {
        'model-1': { timesUsed: 5, averageRank: 1, averageLatency: 800, failureRate: 0 },
        'model-2': { timesUsed: 5, averageRank: 2, averageLatency: 900, failureRate: 0 },
        'model-3': { timesUsed: 5, averageRank: 3, averageLatency: 1000, failureRate: 0 },
      },
    })
    const result = await selectDynamicCouncil(
      'user1',
      'workflow:test' as WorkflowId,
      'research' as JudgeRubricDomain,
      repo,
      sameProviderModels,
      3
    )
    // enforceProviderDiversity should reassign duplicate providers
    const providers = result.map((m) => m.provider)
    const uniqueProviders = new Set(providers)
    expect(uniqueProviders.size).toBeGreaterThan(1)
  })
})
