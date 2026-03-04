/**
 * Parallel Heterogeneous Models & Adaptive Fan-Out Tests — Phase 11
 *
 * Tests for heterogeneous model rotation and adaptive fan-out:
 * 1. Heterogeneous models enabled — each branch uses different provider (rotated)
 * 2. Heterogeneous models disabled — all branches use same provider
 * 3. Heterogeneous with fewer providers than branches — providers cycle
 * 4. Heterogeneous respects model tier (tier preserved, only provider rotated)
 * 5. Adaptive fan-out triggers on low consensus — additional agents spawned
 * 6. Adaptive fan-out doesn't trigger on high consensus
 * 7. Adaptive fan-out caps at 1 round
 * 8. Adaptive fan-out disabled — no additional agents regardless of consensus
 * 9. computeSimpleConsensus unit tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AgentConfig, Workflow, AgentExecutionStep } from '@lifeos/agents'

// Mock providerService
vi.mock('../providerService.js', () => ({
  executeWithProvider: vi.fn().mockResolvedValue({
    output: 'test output',
    tokensUsed: 100,
    estimatedCost: 0.01,
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

// Mock logger
vi.mock('../../lib/logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

// Mock utils.js — control what each agent step returns
vi.mock('../langgraph/utils.js', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return {
    ...actual,
    executeAgentWithEvents: vi.fn(),
  }
})

// Mock model map for test assertions
const MOCK_MODELS: Record<string, string> = {
  openai: 'gpt-4o-mini',
  anthropic: 'claude-haiku-4-5',
  google: 'gemini-3-flash',
  xai: 'grok-3-mini',
}

// Mock @lifeos/agents — resolveEffectiveModel returns provider-appropriate models
vi.mock('@lifeos/agents', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return {
    ...actual,
    resolveEffectiveModel: vi.fn().mockImplementation((agentConfig: { modelProvider: string }) => ({
      provider: agentConfig.modelProvider,
      model: MOCK_MODELS[agentConfig.modelProvider] ?? 'gpt-4o-mini',
      resolvedTier: 'fast',
    })),
  }
})

import {
  executeParallelWorkflowLangGraph,
  computeSimpleConsensus,
} from '../langgraph/parallelGraph.js'
import { executeAgentWithEvents } from '../langgraph/utils.js'

const mockExecuteAgent = vi.mocked(executeAgentWithEvents)

function makeAgent(name: string, index: number): AgentConfig {
  return {
    agentId: `agent_${index}` as AgentConfig['agentId'],
    userId: 'user1',
    name,
    role: 'custom',
    systemPrompt: `You are ${name}`,
    modelProvider: 'openai',
    modelName: 'gpt-4o-mini',
    temperature: 0.7,
    archived: false,
    createdAtMs: Date.now(),
    updatedAtMs: Date.now(),
    syncState: 'synced',
    version: 1,
  }
}

function makeWorkflow(overrides?: Partial<Workflow>): Workflow {
  return {
    workflowId: 'wf1' as Workflow['workflowId'],
    userId: 'user1',
    name: 'Test Parallel',
    workflowType: 'parallel',
    agentIds: [],
    archived: false,
    createdAtMs: Date.now(),
    updatedAtMs: Date.now(),
    syncState: 'synced',
    version: 1,
    ...overrides,
  }
}

function makeStep(
  name: string,
  output: string,
  overrides?: Partial<AgentExecutionStep>
): AgentExecutionStep {
  return {
    agentId: `agent_${name}` as AgentExecutionStep['agentId'],
    agentName: name,
    output,
    tokensUsed: 100,
    estimatedCost: 0.01,
    provider: 'openai',
    model: 'gpt-4o-mini',
    executedAtMs: Date.now(),
    ...overrides,
  }
}

function setupAgentOutputs(outputs: Array<{ name: string; output: string }>) {
  let callIndex = 0
  mockExecuteAgent.mockImplementation(async (agent) => {
    const entry = outputs[callIndex] ?? { name: 'Unknown', output: 'fallback' }
    callIndex++
    return makeStep(entry.name, entry.output, {
      agentId: agent.agentId,
      agentName: agent.name,
    })
  })
}

const baseConfig = {
  apiKeys: { openai: 'test-key', anthropic: 'test-key', google: 'test-key' },
  userId: 'user1',
  runId: 'run1',
}

describe('Parallel Heterogeneous Models', () => {
  beforeEach(() => {
    mockExecuteAgent.mockReset()
  })

  it('rotates providers across branches when heterogeneousModels enabled', async () => {
    const agents = [makeAgent('A', 0), makeAgent('B', 1), makeAgent('C', 2)]
    const workflow = makeWorkflow({ heterogeneousModels: true })

    setupAgentOutputs([
      { name: 'A', output: 'Output A' },
      { name: 'B', output: 'Output B' },
      { name: 'C', output: 'Output C' },
    ])

    await executeParallelWorkflowLangGraph({ ...baseConfig, workflow, agents }, 'Test goal')

    expect(mockExecuteAgent).toHaveBeenCalledTimes(3)

    // Check that agents were called with different providers
    const calledAgents = mockExecuteAgent.mock.calls.map((call) => call[0])
    const providers = calledAgents.map((a) => a.modelProvider)

    // With 3 providers available (openai, anthropic, google) and 3 branches,
    // each should get a different provider
    expect(new Set(providers).size).toBe(3)
  })

  it('uses same provider for all branches when heterogeneousModels is disabled', async () => {
    const agents = [makeAgent('A', 0), makeAgent('B', 1)]
    const workflow = makeWorkflow({ heterogeneousModels: false })

    setupAgentOutputs([
      { name: 'A', output: 'Output A' },
      { name: 'B', output: 'Output B' },
    ])

    await executeParallelWorkflowLangGraph({ ...baseConfig, workflow, agents }, 'Test goal')

    const calledAgents = mockExecuteAgent.mock.calls.map((call) => call[0])
    const providers = calledAgents.map((a) => a.modelProvider)

    // All should be the original provider (openai)
    expect(providers).toEqual(['openai', 'openai'])
  })

  it('cycles providers when fewer providers than branches', async () => {
    const agents = [makeAgent('A', 0), makeAgent('B', 1), makeAgent('C', 2), makeAgent('D', 3)]
    const workflow = makeWorkflow({ heterogeneousModels: true })

    // Only 2 providers available
    const twoProviderConfig = {
      apiKeys: { openai: 'test-key', anthropic: 'test-key' },
      userId: 'user1',
      runId: 'run1',
    }

    setupAgentOutputs([
      { name: 'A', output: 'Output A' },
      { name: 'B', output: 'Output B' },
      { name: 'C', output: 'Output C' },
      { name: 'D', output: 'Output D' },
    ])

    await executeParallelWorkflowLangGraph({ ...twoProviderConfig, workflow, agents }, 'Test goal')

    const calledAgents = mockExecuteAgent.mock.calls.map((call) => call[0])
    const providers = calledAgents.map((a) => a.modelProvider)

    // Should cycle: openai, anthropic, openai, anthropic
    expect(providers[0]).toBe('openai')
    expect(providers[1]).toBe('anthropic')
    expect(providers[2]).toBe('openai')
    expect(providers[3]).toBe('anthropic')
  })

  it('does not rotate with only 1 provider available', async () => {
    const agents = [makeAgent('A', 0), makeAgent('B', 1)]
    const workflow = makeWorkflow({ heterogeneousModels: true })

    const singleProviderConfig = {
      apiKeys: { openai: 'test-key' },
      userId: 'user1',
      runId: 'run1',
    }

    setupAgentOutputs([
      { name: 'A', output: 'Output A' },
      { name: 'B', output: 'Output B' },
    ])

    await executeParallelWorkflowLangGraph(
      { ...singleProviderConfig, workflow, agents },
      'Test goal'
    )

    const calledAgents = mockExecuteAgent.mock.calls.map((call) => call[0])
    const providers = calledAgents.map((a) => a.modelProvider)
    expect(providers).toEqual(['openai', 'openai'])
  })
})

describe('Adaptive Fan-Out', () => {
  beforeEach(() => {
    mockExecuteAgent.mockReset()
  })

  it('triggers additional agents on low consensus (consensus merge)', async () => {
    const agents = [makeAgent('A', 0), makeAgent('B', 1)]
    const workflow = makeWorkflow({
      adaptiveFanOut: true,
      parallelMergeStrategy: 'consensus',
    })

    // Outputs are very different → low consensus
    setupAgentOutputs([
      {
        name: 'A',
        output: 'The economic approach suggests deregulation and free markets are optimal',
      },
      {
        name: 'B',
        output: 'Social policy demands strong government intervention and welfare programs',
      },
      {
        name: 'A-extra',
        output: 'Mixed economy approach balances both perspectives with targeted regulation',
      },
      {
        name: 'B-extra',
        output: 'Pragmatic centrism suggests evidence-based policy making is key',
      },
    ])

    const result = await executeParallelWorkflowLangGraph(
      { ...baseConfig, workflow, agents, mergeStrategy: 'consensus' },
      'Test goal'
    )

    // Original 2 + 2 additional = 4
    expect(mockExecuteAgent).toHaveBeenCalledTimes(4)
    expect(result.steps.length).toBe(4)
  })

  it('does not trigger additional agents on high consensus', async () => {
    const agents = [makeAgent('A', 0), makeAgent('B', 1)]
    const workflow = makeWorkflow({
      adaptiveFanOut: true,
      parallelMergeStrategy: 'consensus',
    })

    // Very similar outputs → high consensus
    const sharedOutput =
      'The analysis shows that implementing structured data management processes leads to significant improvements in organizational efficiency and decision-making quality across all departments'
    setupAgentOutputs([
      { name: 'A', output: sharedOutput },
      { name: 'B', output: sharedOutput },
    ])

    await executeParallelWorkflowLangGraph(
      { ...baseConfig, workflow, agents, mergeStrategy: 'consensus' },
      'Test goal'
    )

    // Only original 2 agents — no additional spawned
    expect(mockExecuteAgent).toHaveBeenCalledTimes(2)
  })

  it('does not trigger when adaptiveFanOut is disabled', async () => {
    const agents = [makeAgent('A', 0), makeAgent('B', 1)]
    const workflow = makeWorkflow({
      adaptiveFanOut: false,
      parallelMergeStrategy: 'consensus',
    })

    setupAgentOutputs([
      { name: 'A', output: 'Completely different opinion about markets' },
      { name: 'B', output: 'Totally unrelated perspective on technology' },
    ])

    await executeParallelWorkflowLangGraph(
      { ...baseConfig, workflow, agents, mergeStrategy: 'consensus' },
      'Test goal'
    )

    // Only 2 agents, no fan-out
    expect(mockExecuteAgent).toHaveBeenCalledTimes(2)
  })

  it('does not trigger on non-consensus merge strategy', async () => {
    const agents = [makeAgent('A', 0), makeAgent('B', 1)]
    const workflow = makeWorkflow({
      adaptiveFanOut: true,
      parallelMergeStrategy: 'list',
    })

    setupAgentOutputs([
      { name: 'A', output: 'Completely different A' },
      { name: 'B', output: 'Completely different B' },
    ])

    await executeParallelWorkflowLangGraph(
      { ...baseConfig, workflow, agents, mergeStrategy: 'list' },
      'Test goal'
    )

    expect(mockExecuteAgent).toHaveBeenCalledTimes(2)
  })
})

describe('computeSimpleConsensus', () => {
  it('returns 1.0 for identical outputs', () => {
    const steps = [
      makeStep('A', 'The analysis shows strong results'),
      makeStep('B', 'The analysis shows strong results'),
    ]
    expect(computeSimpleConsensus(steps)).toBe(1.0)
  })

  it('returns 1.0 for single output', () => {
    const steps = [makeStep('A', 'Some output')]
    expect(computeSimpleConsensus(steps)).toBe(1.0)
  })

  it('returns low score for completely different outputs', () => {
    const steps = [
      makeStep('A', 'Machine learning algorithms optimize neural networks efficiently'),
      makeStep('B', 'Historical pottery techniques demonstrate ancient craftsmanship methods'),
    ]
    const score = computeSimpleConsensus(steps)
    expect(score).toBeLessThan(0.3)
  })

  it('returns moderate score for partially overlapping outputs', () => {
    const steps = [
      makeStep('A', 'The quarterly report shows revenue growth from marketing investments'),
      makeStep('B', 'The quarterly report indicates revenue growth across business segments'),
    ]
    const score = computeSimpleConsensus(steps)
    expect(score).toBeGreaterThan(0.2)
    expect(score).toBeLessThan(0.9)
  })

  it('handles empty outputs', () => {
    const steps = [makeStep('A', ''), makeStep('B', '')]
    // Empty strings produce no words > 3 chars, so union is empty
    expect(computeSimpleConsensus(steps)).toBe(0)
  })
})
