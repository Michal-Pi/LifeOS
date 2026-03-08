import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentConfig, DialecticalWorkflowConfig } from '@lifeos/agents'

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: vi.fn().mockReturnValue({
    collection: vi.fn(),
    doc: vi.fn(),
    settings: vi.fn(),
  }),
}))

vi.mock('../../../lib/logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

vi.mock('../../messageStore.js', () => ({
  recordMessage: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../deepResearch/graphGapAnalysis.js', () => ({
  analyzeGraphGaps: vi.fn(),
  evaluateResearchNeed: vi.fn(),
}))

vi.mock('../../deepResearch/sourceIngestion.js', () => ({
  executeSearchPlan: vi.fn(),
  ingestSources: vi.fn(),
}))

vi.mock('../../deepResearch/claimExtraction.js', () => ({
  extractClaimsFromSourceBatch: vi.fn(),
}))

vi.mock('../../deepResearch/sourceQuality.js', () => ({
  computeSourceQualityScore: vi.fn().mockReturnValue(0.8),
  applyQualityScoresToClaims: vi.fn().mockImplementation((claims) => claims),
}))

vi.mock('../../providerService.js', () => ({
  executeWithProvider: vi.fn(),
}))

vi.mock('../../quotaManager.js', () => ({
  checkQuotaSoft: vi.fn().mockResolvedValue(null),
}))

vi.mock('../../rateLimiter.js', () => ({
  checkRunRateLimitSoft: vi.fn().mockResolvedValue(null),
}))

vi.mock('../../retrievalAgent.js', () => ({
  executeRetrievalAgent: vi.fn().mockResolvedValue({
    context: { claims: [], concepts: [], mechanisms: [], contradictions: [], regimes: [] },
  }),
}))

vi.mock('../../optimization/retrievalTemplates.js', () => ({
  selectBestTemplate: vi.fn().mockResolvedValue(null),
  getAttenuatedSteps: vi.fn().mockReturnValue([]),
}))

vi.mock('../firestoreCheckpointer.js', () => ({
  createFirestoreCheckpointer: vi.fn(),
}))

vi.mock('../utils.js', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return {
    ...actual,
    executeAgentWithEvents: vi.fn(),
    handleAskUserInterrupt: vi.fn().mockReturnValue(null),
  }
})

vi.mock('../../sublationEngine.js', () => ({
  runCompetitiveSynthesis: vi.fn(),
  runSynthesisCrossNegation: vi.fn(),
}))

vi.mock('../../metaReflection.js', () => ({
  runMetaReflection: vi.fn(),
}))

vi.mock('../../schemaInduction.js', () => ({
  runSchemaInduction: vi.fn(),
}))

vi.mock('../../contradictionTrackers.js', () => ({
  runContradictionTrackers: vi.fn().mockReturnValue({
    allContradictions: [],
    trackerResults: [],
    totalProcessingTimeMs: 0,
  }),
}))

vi.mock('../iterationBudget.js', () => ({
  calculateIterationBudget: vi.fn().mockReturnValue({
    perThesisAgent: 3,
    perNegationAgent: 2,
    perSynthesisAgent: 3,
    perMetaAgent: 2,
    suggestedTotal: 10,
  }),
}))

vi.mock('../iterationHistory.js', () => ({
  fetchIterationHistory: vi.fn().mockResolvedValue(null),
  writeIterationUsageSummary: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../knowledgeHypergraph.js', () => ({
  KnowledgeHypergraph: vi.fn(),
}))

import {
  createDialecticalGraph,
  executeDialecticalWorkflowLangGraph,
  type DialecticalGraphConfig,
} from '../dialecticalGraph.js'

function makeAgent(agentId: string): AgentConfig {
  return {
    agentId: `agent:${agentId}` as AgentConfig['agentId'],
    userId: 'user-1',
    name: agentId,
    role: 'custom',
    systemPrompt: '',
    modelProvider: 'openai',
    modelName: 'gpt-4o',
    temperature: 0.7,
    archived: false,
    createdAtMs: Date.now(),
    updatedAtMs: Date.now(),
    syncState: 'synced',
    version: 1,
  }
}

function makeConfig(): DialecticalGraphConfig {
  const thesisAgents = ['economic', 'systems', 'adversarial', 'historical'].map((lens, index) =>
    makeAgent(`thesis-${index + 1}-${lens}`)
  )
  const dialecticalConfig: DialecticalWorkflowConfig = {
    maxCycles: 5,
    minCycles: 1,
    enabledTrackers: ['LOGIC'],
    velocityThreshold: 0.1,
    sublationStrategy: 'COMPETITIVE',
    maxSublationCandidates: 2,
    enableCrossNegation: true,
    negationDepth: 1,
    minActionDistance: 0,
    enableKGPersistence: false,
    enableCommunityDetection: false,
    communityDetectionMethod: 'LLM_GROUPING',
    retrievalDepth: 2,
    retrievalTopK: 5,
    minTheses: 2,
    maxTheses: 4,
    thesisAgents: [
      { agentId: thesisAgents[0]!.agentId, lens: 'economic', modelProvider: 'openai', modelName: 'gpt-4o', temperature: 0.7 },
      { agentId: thesisAgents[1]!.agentId, lens: 'systems', modelProvider: 'openai', modelName: 'gpt-4o', temperature: 0.7 },
      { agentId: thesisAgents[2]!.agentId, lens: 'adversarial', modelProvider: 'openai', modelName: 'gpt-4o', temperature: 0.7 },
      { agentId: thesisAgents[3]!.agentId, lens: 'historical', modelProvider: 'openai', modelName: 'gpt-4o', temperature: 0.7 },
    ],
    mode: 'quick',
  }

  return {
    workflow: {
      workflowId: 'wf-1',
      name: 'Dialectical',
      workflowType: 'dialectical',
      agentIds: [],
      edges: [],
      archived: false,
      syncState: 'synced',
      version: 1,
      createdAtMs: Date.now(),
      updatedAtMs: Date.now(),
      userId: 'user-1',
    } as never,
    dialecticalConfig,
    thesisAgents,
    synthesisAgents: [makeAgent('synthesis-1')],
    metaAgent: makeAgent('meta-1'),
    apiKeys: { openai: 'test-key' },
    userId: 'user-1',
    runId: 'run-1',
  }
}

describe('createDialecticalGraph quick mode config cloning', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does not mutate caller-owned config or thesisAgents arrays', () => {
    const config = makeConfig()
    const originalMaxCycles = config.dialecticalConfig.maxCycles
    const originalThesisAgentIds = config.thesisAgents.map((agent) => agent.agentId)

    expect(() => createDialecticalGraph(config)).not.toThrow()
    expect(() => createDialecticalGraph(config)).not.toThrow()

    expect(config.dialecticalConfig.maxCycles).toBe(originalMaxCycles)
    expect(config.thesisAgents).toHaveLength(4)
    expect(config.thesisAgents.map((agent) => agent.agentId)).toEqual(originalThesisAgentIds)
  })

  it('rejects configs without configured API keys', () => {
    const config = makeConfig()
    config.apiKeys = {}

    expect(() => createDialecticalGraph(config)).toThrow(
      'Dialectical graph requires at least 1 configured API key'
    )
  })

  it('rejects blank goals at the execution entry point', async () => {
    const config = makeConfig()

    await expect(
      executeDialecticalWorkflowLangGraph(config, '   ')
    ).resolves.toMatchObject({
      output: 'Dialectical reasoning failed: Goal is required',
      status: 'failed',
      dialecticalState: {
        cycleNumber: 0,
        degradedPhases: [],
      },
    })
  })
})
