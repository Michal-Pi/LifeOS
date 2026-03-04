/**
 * Parallel Merge & Budget-Aware Parallelism Tests — Phase 12
 *
 * Tests for merge output formatting and budget-aware fan-out:
 * 1. Merge output includes agent names
 * 2. Ranked strategy sorts by output length
 * 3. Budget-aware parallelism reduces fan-out when budget tight
 * 4. Budget-aware parallelism doesn't reduce fan-out when budget ample
 * 5. Budget-aware parallelism respects minimum fan-out of 2
 * 6. Budget tracking accumulates during execution
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

// Mock utils.js
vi.mock('../langgraph/utils.js', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return {
    ...actual,
    executeAgentWithEvents: vi.fn(),
  }
})

// Mock @lifeos/agents
vi.mock('@lifeos/agents', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return {
    ...actual,
    resolveEffectiveModel: vi.fn().mockImplementation((agentConfig: { modelProvider: string }) => ({
      provider: agentConfig.modelProvider,
      model: 'gpt-4o-mini',
      resolvedTier: 'fast',
    })),
  }
})

import { executeParallelWorkflowLangGraph } from '../langgraph/parallelGraph.js'
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

function setupAgentOutputs(outputs: Array<{ name: string; output: string; agentId?: string }>) {
  let callIndex = 0
  mockExecuteAgent.mockImplementation(async (agent) => {
    const entry = outputs[callIndex] ?? { name: 'Unknown', output: 'fallback' }
    callIndex++
    return makeStep(entry.name, entry.output, {
      agentId: entry.agentId ?? agent.agentId,
      agentName: agent.name,
    })
  })
}

const baseConfig = {
  apiKeys: { openai: 'test-key' },
  userId: 'user1',
  runId: 'run1',
}

describe('Merge Output', () => {
  beforeEach(() => {
    mockExecuteAgent.mockReset()
  })

  it('includes agent names in list merge output', async () => {
    const agents = [makeAgent('Agent A', 0), makeAgent('Agent B', 1)]
    const workflow = makeWorkflow()

    setupAgentOutputs([
      { name: 'Agent A', output: 'Output from A', agentId: 'agent_0' },
      { name: 'Agent B', output: 'Output from B', agentId: 'agent_1' },
    ])

    const result = await executeParallelWorkflowLangGraph(
      { ...baseConfig, workflow, agents },
      'Test goal'
    )

    expect(result.output).toContain('Agent A')
    expect(result.output).toContain('Agent B')
    expect(result.output).toContain('Output from A')
    expect(result.output).toContain('Output from B')
  })

  it('ranked strategy sorts by output length', async () => {
    const agents = [makeAgent('Agent A', 0), makeAgent('Agent B', 1)]
    const workflow = makeWorkflow()

    setupAgentOutputs([
      { name: 'Agent A', output: 'Short', agentId: 'agent_0' },
      {
        name: 'Agent B',
        output: 'This is a much longer output that should rank first',
        agentId: 'agent_1',
      },
    ])

    const result = await executeParallelWorkflowLangGraph(
      {
        ...baseConfig,
        workflow,
        agents,
        mergeStrategy: 'ranked',
      },
      'Test goal'
    )

    // Agent B has longer output, should be ranked first
    const outputLines = result.output.split('\n')
    const firstMention = outputLines.findIndex((l) => l.includes('Agent B'))
    const secondMention = outputLines.findIndex((l) => l.includes('Agent A'))
    expect(firstMention).toBeLessThan(secondMention)
  })
})

describe('Budget-Aware Parallelism', () => {
  beforeEach(() => {
    mockExecuteAgent.mockReset()
  })

  it('reduces fan-out when estimated cost exceeds 80% of budget', async () => {
    // 6 agents × $0.03 = $0.18 estimated, budget = $0.10 → 80% threshold = $0.08 → reduce
    const agents = [
      makeAgent('A', 0),
      makeAgent('B', 1),
      makeAgent('C', 2),
      makeAgent('D', 3),
      makeAgent('E', 4),
      makeAgent('F', 5),
    ]
    const workflow = makeWorkflow({ maxBudget: 0.1 })

    setupAgentOutputs(agents.map((a) => ({ name: a.name, output: `Output from ${a.name}` })))

    const result = await executeParallelWorkflowLangGraph(
      { ...baseConfig, workflow, agents },
      'Test goal'
    )

    // Should reduce from 6 to ceil(6/2)=3 agents
    expect(mockExecuteAgent).toHaveBeenCalledTimes(3)
    expect(result.steps.length).toBe(3)
  })

  it('does not reduce fan-out when budget is ample', async () => {
    const agents = [makeAgent('A', 0), makeAgent('B', 1), makeAgent('C', 2)]
    const workflow = makeWorkflow({ maxBudget: 10.0 }) // Very generous budget

    setupAgentOutputs([
      { name: 'A', output: 'Output A' },
      { name: 'B', output: 'Output B' },
      { name: 'C', output: 'Output C' },
    ])

    const result = await executeParallelWorkflowLangGraph(
      { ...baseConfig, workflow, agents },
      'Test goal'
    )

    // All 3 agents run
    expect(mockExecuteAgent).toHaveBeenCalledTimes(3)
    expect(result.steps.length).toBe(3)
  })

  it('respects minimum fan-out of 2 agents', async () => {
    // 4 agents × $0.03 = $0.12, budget $0.01 → reduce to max(2, ceil(4/2))=2
    const agents = [makeAgent('A', 0), makeAgent('B', 1), makeAgent('C', 2), makeAgent('D', 3)]
    const workflow = makeWorkflow({ maxBudget: 0.01 })

    setupAgentOutputs([
      { name: 'A', output: 'Output A' },
      { name: 'B', output: 'Output B' },
    ])

    await executeParallelWorkflowLangGraph({ ...baseConfig, workflow, agents }, 'Test goal')

    // Reduced to minimum 2
    expect(mockExecuteAgent).toHaveBeenCalledTimes(2)
  })

  it('does not reduce when only 2 agents (already at minimum)', async () => {
    const agents = [makeAgent('A', 0), makeAgent('B', 1)]
    const workflow = makeWorkflow({ maxBudget: 0.01 })

    setupAgentOutputs([
      { name: 'A', output: 'Output A' },
      { name: 'B', output: 'Output B' },
    ])

    await executeParallelWorkflowLangGraph({ ...baseConfig, workflow, agents }, 'Test goal')

    // Still runs both (can't go below 2)
    expect(mockExecuteAgent).toHaveBeenCalledTimes(2)
  })

  it('does not reduce when maxBudget is not set', async () => {
    const agents = [
      makeAgent('A', 0),
      makeAgent('B', 1),
      makeAgent('C', 2),
      makeAgent('D', 3),
      makeAgent('E', 4),
      makeAgent('F', 5),
    ]
    const workflow = makeWorkflow() // No maxBudget

    setupAgentOutputs(agents.map((a) => ({ name: a.name, output: `Output from ${a.name}` })))

    await executeParallelWorkflowLangGraph({ ...baseConfig, workflow, agents }, 'Test goal')

    // All 6 agents run
    expect(mockExecuteAgent).toHaveBeenCalledTimes(6)
  })

  it('accumulates cost tracking during execution', async () => {
    const agents = [makeAgent('A', 0), makeAgent('B', 1)]
    const workflow = makeWorkflow()

    setupAgentOutputs([
      { name: 'A', output: 'Output A' },
      { name: 'B', output: 'Output B' },
    ])

    const result = await executeParallelWorkflowLangGraph(
      { ...baseConfig, workflow, agents },
      'Test goal'
    )

    // Each step has 100 tokens and $0.01 cost
    expect(result.totalTokensUsed).toBe(200)
    expect(result.totalEstimatedCost).toBeCloseTo(0.02, 4)
  })
})
