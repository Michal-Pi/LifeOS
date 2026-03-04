/**
 * Early-Exit Tests — Phase 9
 *
 * Tests for early-exit conditions in sequential workflows:
 * - Early exit triggers on pattern match
 * - Full chain runs when no match
 * - Multiple patterns supported
 * - No early exit when patterns array is empty
 * - No early exit on last agent
 * - Early exit preserves output
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

// Mock @lifeos/agents
vi.mock('@lifeos/agents', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return {
    ...actual,
    resolveEffectiveModel: vi.fn().mockReturnValue({
      provider: 'openai',
      model: 'gpt-4o-mini',
    }),
  }
})

import { executeSequentialWorkflowLangGraph } from '../langgraph/sequentialGraph.js'
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
    name: 'Test Sequential',
    workflowType: 'sequential',
    agentIds: [],
    archived: false,
    createdAtMs: Date.now(),
    updatedAtMs: Date.now(),
    syncState: 'synced',
    version: 1,
    ...overrides,
  }
}

function makeStep(name: string, output: string): AgentExecutionStep {
  return {
    agentId: 'agent_0' as AgentExecutionStep['agentId'],
    agentName: name,
    output,
    tokensUsed: 100,
    estimatedCost: 0.01,
    provider: 'openai',
    model: 'gpt-4o-mini',
    executedAtMs: Date.now(),
  }
}

/**
 * Set up the mock to return specific outputs for each call in sequence.
 * Uses mockImplementation with a call counter for reliable ordering.
 */
function setupAgentOutputs(outputs: Array<{ name: string; output: string }>) {
  let callIndex = 0
  mockExecuteAgent.mockImplementation(async () => {
    const entry = outputs[callIndex] ?? { name: 'Unknown', output: 'fallback' }
    callIndex++
    return makeStep(entry.name, entry.output)
  })
}

describe('Sequential Early Exit', () => {
  beforeEach(() => {
    mockExecuteAgent.mockReset()
  })

  it('triggers early exit on pattern match', async () => {
    const agents = [makeAgent('Agent A', 0), makeAgent('Agent B', 1), makeAgent('Agent C', 2)]
    const workflow = makeWorkflow({ earlyExitPatterns: ['ANSWER_FOUND'] })

    setupAgentOutputs([
      { name: 'Agent A', output: 'The result is: ANSWER_FOUND in data' },
      { name: 'Agent B', output: 'Output B' },
      { name: 'Agent C', output: 'Output C' },
    ])

    const result = await executeSequentialWorkflowLangGraph(
      {
        workflow,
        agents,
        apiKeys: { openai: 'test-key' },
        userId: 'user1',
        runId: 'run1',
      },
      'Test goal'
    )

    // Only Agent A should have executed
    expect(mockExecuteAgent).toHaveBeenCalledTimes(1)
    expect(result.output).toContain('ANSWER_FOUND')
    expect(result.status).toBe('completed')
  })

  it('runs full chain when no pattern match', async () => {
    const agents = [makeAgent('Agent A', 0), makeAgent('Agent B', 1), makeAgent('Agent C', 2)]
    const workflow = makeWorkflow({ earlyExitPatterns: ['ANSWER_FOUND'] })

    setupAgentOutputs([
      { name: 'Agent A', output: 'Partial analysis' },
      { name: 'Agent B', output: 'More analysis' },
      { name: 'Agent C', output: 'Final conclusion' },
    ])

    const result = await executeSequentialWorkflowLangGraph(
      {
        workflow,
        agents,
        apiKeys: { openai: 'test-key' },
        userId: 'user1',
        runId: 'run1',
      },
      'Test goal'
    )

    expect(mockExecuteAgent).toHaveBeenCalledTimes(3)
    expect(result.output).toBe('Final conclusion')
    expect(result.status).toBe('completed')
  })

  it('supports multiple early-exit patterns', async () => {
    const agents = [makeAgent('Agent A', 0), makeAgent('Agent B', 1), makeAgent('Agent C', 2)]
    const workflow = makeWorkflow({ earlyExitPatterns: ['DONE', 'ANSWER_FOUND'] })

    setupAgentOutputs([
      { name: 'Agent A', output: 'Analysis phase' },
      { name: 'Agent B', output: 'Result: DONE' },
      { name: 'Agent C', output: 'Should not run' },
    ])

    const result = await executeSequentialWorkflowLangGraph(
      {
        workflow,
        agents,
        apiKeys: { openai: 'test-key' },
        userId: 'user1',
        runId: 'run1',
      },
      'Test goal'
    )

    // Only Agent A and B should have executed
    expect(mockExecuteAgent).toHaveBeenCalledTimes(2)
    expect(result.output).toContain('DONE')
  })

  it('runs all agents when patterns array is empty', async () => {
    const agents = [makeAgent('Agent A', 0), makeAgent('Agent B', 1)]
    const workflow = makeWorkflow({ earlyExitPatterns: [] })

    setupAgentOutputs([
      { name: 'Agent A', output: 'Output with ANSWER_FOUND' },
      { name: 'Agent B', output: 'Final output' },
    ])

    const result = await executeSequentialWorkflowLangGraph(
      {
        workflow,
        agents,
        apiKeys: { openai: 'test-key' },
        userId: 'user1',
        runId: 'run1',
      },
      'Test goal'
    )

    // Both agents should run despite the pattern being in output
    expect(mockExecuteAgent).toHaveBeenCalledTimes(2)
    expect(result.output).toBe('Final output')
  })

  it('does not early exit on last agent (completes normally)', async () => {
    const agents = [makeAgent('Agent A', 0), makeAgent('Agent B', 1)]
    const workflow = makeWorkflow({ earlyExitPatterns: ['ANSWER_FOUND'] })

    setupAgentOutputs([
      { name: 'Agent A', output: 'Normal output' },
      { name: 'Agent B', output: 'Contains ANSWER_FOUND' },
    ])

    const result = await executeSequentialWorkflowLangGraph(
      {
        workflow,
        agents,
        apiKeys: { openai: 'test-key' },
        userId: 'user1',
        runId: 'run1',
      },
      'Test goal'
    )

    // Both agents run — last agent's pattern match doesn't matter
    expect(mockExecuteAgent).toHaveBeenCalledTimes(2)
    expect(result.output).toContain('ANSWER_FOUND')
    expect(result.status).toBe('completed')
  })

  it('preserves the output of the agent that triggered early exit', async () => {
    const agents = [makeAgent('Agent A', 0), makeAgent('Agent B', 1), makeAgent('Agent C', 2)]
    const workflow = makeWorkflow({ earlyExitPatterns: ['ANSWER_FOUND'] })

    const earlyOutput = 'The answer is 42. ANSWER_FOUND. No more processing needed.'
    setupAgentOutputs([
      { name: 'Agent A', output: earlyOutput },
      { name: 'Agent B', output: 'Should not run' },
      { name: 'Agent C', output: 'Should not run' },
    ])

    const result = await executeSequentialWorkflowLangGraph(
      {
        workflow,
        agents,
        apiKeys: { openai: 'test-key' },
        userId: 'user1',
        runId: 'run1',
      },
      'Test goal'
    )

    expect(result.output).toBe(earlyOutput)
    expect(result.steps).toHaveLength(1)
    expect(result.totalSteps).toBe(1)
  })

  it('runs all agents when earlyExitPatterns is undefined', async () => {
    const agents = [makeAgent('Agent A', 0), makeAgent('Agent B', 1)]
    const workflow = makeWorkflow() // No earlyExitPatterns

    setupAgentOutputs([
      { name: 'Agent A', output: 'ANSWER_FOUND' },
      { name: 'Agent B', output: 'Final' },
    ])

    const result = await executeSequentialWorkflowLangGraph(
      {
        workflow,
        agents,
        apiKeys: { openai: 'test-key' },
        userId: 'user1',
        runId: 'run1',
      },
      'Test goal'
    )

    expect(mockExecuteAgent).toHaveBeenCalledTimes(2)
    expect(result.output).toBe('Final')
  })
})
