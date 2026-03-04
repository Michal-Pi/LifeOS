/**
 * Supervisor Reflection Tests — Phase 13
 *
 * Tests for supervisor planning and self-reflection:
 * - Planning node emits supervisor plan event
 * - Reflection runs after each worker (default enabled)
 * - Reflection disabled — no reflection calls
 * - Reflection results stored in state
 * - Reflection tokens/cost accumulate
 * - Step numbering with reflection (totalSteps = 2 * workerCount + 2)
 * - No workers — supervisor goes directly to synthesis
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AgentConfig, Workflow, AgentExecutionStep } from '@lifeos/agents'

// Mock providerService
vi.mock('../providerService.js', () => ({
  executeWithProvider: vi.fn(),
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

import { executeSupervisorWorkflowLangGraph } from '../langgraph/supervisorGraph.js'
import { executeAgentWithEvents } from '../langgraph/utils.js'

const mockExecuteAgent = vi.mocked(executeAgentWithEvents)

function makeAgent(name: string, role: string = 'custom'): AgentConfig {
  return {
    agentId: `agent_${name}` as AgentConfig['agentId'],
    userId: 'user1',
    name,
    role: role as AgentConfig['role'],
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
    name: 'Test Supervisor',
    workflowType: 'supervisor',
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
    agentId: 'agent_0' as AgentExecutionStep['agentId'],
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

function setupAgentOutputs(
  outputs: Array<{ name: string; output: string; tokens?: number; cost?: number }>
) {
  let callIndex = 0
  mockExecuteAgent.mockImplementation(async () => {
    const entry = outputs[callIndex] ?? { name: 'Unknown', output: 'fallback' }
    callIndex++
    return makeStep(entry.name, entry.output, {
      tokensUsed: entry.tokens ?? 100,
      estimatedCost: entry.cost ?? 0.01,
    })
  })
}

const baseConfig = {
  apiKeys: { openai: 'test-key' },
  userId: 'user1',
  runId: 'run1',
}

describe('Supervisor Planning & Reflection (Phase 13)', () => {
  beforeEach(() => {
    mockExecuteAgent.mockReset()
  })

  it('emits supervisor plan and runs reflection after each worker (default enabled)', async () => {
    const supervisor = makeAgent('Supervisor', 'supervisor')
    const workers = [makeAgent('Worker A'), makeAgent('Worker B')]
    const workflow = makeWorkflow()

    // Call order with reflection (2 workers):
    // 1. supervisor plan
    // 2. worker_0
    // 3. reflection on worker_0
    // 4. worker_1
    // 5. reflection on worker_1
    // 6. supervisor synthesis
    setupAgentOutputs([
      { name: 'Supervisor', output: 'Plan: Use Worker A for X, Worker B for Y' },
      { name: 'Worker A', output: 'Worker A result' },
      { name: 'Supervisor', output: 'SATISFACTORY - Good output from Worker A' },
      { name: 'Worker B', output: 'Worker B result' },
      { name: 'Supervisor', output: 'SATISFACTORY - Good output from Worker B' },
      { name: 'Supervisor', output: 'Final synthesis' },
    ])

    const result = await executeSupervisorWorkflowLangGraph(
      { ...baseConfig, workflow, supervisorAgent: supervisor, workerAgents: workers },
      'Test goal'
    )

    // 6 calls: plan + (worker_0 + reflection_0) + (worker_1 + reflection_1) + synthesis
    expect(mockExecuteAgent).toHaveBeenCalledTimes(6)
    expect(result.output).toBe('Final synthesis')
    expect(result.status).toBe('completed')
    expect(result.totalSteps).toBe(6)
  })

  it('does not run reflection when disabled', async () => {
    const supervisor = makeAgent('Supervisor', 'supervisor')
    const workers = [makeAgent('Worker A'), makeAgent('Worker B')]
    const workflow = makeWorkflow()

    // Call order without reflection: plan + worker_0 + worker_1 + synthesis
    setupAgentOutputs([
      { name: 'Supervisor', output: 'Plan: delegate' },
      { name: 'Worker A', output: 'Result A' },
      { name: 'Worker B', output: 'Result B' },
      { name: 'Supervisor', output: 'Final synthesis' },
    ])

    const result = await executeSupervisorWorkflowLangGraph(
      {
        ...baseConfig,
        workflow,
        supervisorAgent: supervisor,
        workerAgents: workers,
        enableReflection: false,
      },
      'Test goal'
    )

    // Only 4 calls: no reflections
    expect(mockExecuteAgent).toHaveBeenCalledTimes(4)
    expect(result.output).toBe('Final synthesis')
  })

  it('accumulates tokens/cost from reflections', async () => {
    const supervisor = makeAgent('Supervisor', 'supervisor')
    const workers = [makeAgent('Worker A')]
    const workflow = makeWorkflow()

    // plan(100) + worker(200) + reflection(50) + synthesis(150) = 500
    setupAgentOutputs([
      { name: 'Supervisor', output: 'Plan', tokens: 100, cost: 0.01 },
      { name: 'Worker A', output: 'Result', tokens: 200, cost: 0.02 },
      { name: 'Supervisor', output: 'SATISFACTORY', tokens: 50, cost: 0.005 },
      { name: 'Supervisor', output: 'Final', tokens: 150, cost: 0.015 },
    ])

    const result = await executeSupervisorWorkflowLangGraph(
      { ...baseConfig, workflow, supervisorAgent: supervisor, workerAgents: workers },
      'Test goal'
    )

    expect(result.totalTokensUsed).toBe(500)
    expect(result.totalEstimatedCost).toBeCloseTo(0.05, 4)
  })

  it('uses correct step numbering with reflection enabled', async () => {
    const supervisor = makeAgent('Supervisor', 'supervisor')
    const workers = [makeAgent('Worker A'), makeAgent('Worker B')]
    const workflow = makeWorkflow()

    setupAgentOutputs([
      { name: 'Supervisor', output: 'Plan' },
      { name: 'Worker A', output: 'A result' },
      { name: 'Supervisor', output: 'SATISFACTORY' },
      { name: 'Worker B', output: 'B result' },
      { name: 'Supervisor', output: 'SATISFACTORY' },
      { name: 'Supervisor', output: 'Final' },
    ])

    await executeSupervisorWorkflowLangGraph(
      { ...baseConfig, workflow, supervisorAgent: supervisor, workerAgents: workers },
      'Test goal'
    )

    // totalSteps = 2 * 2 + 2 = 6
    // Plan: step 1/6, Worker A: step 2/6, Reflection A: step 3/6,
    // Worker B: step 4/6, Reflection B: step 5/6, Synthesis: step 6/6
    const calls = mockExecuteAgent.mock.calls

    // Plan: stepNumber 1, totalSteps 6
    expect(calls[0][4]).toMatchObject({ stepNumber: 1, totalSteps: 6 })
    // Worker A: stepNumber 2, totalSteps 6
    expect(calls[1][4]).toMatchObject({ stepNumber: 2, totalSteps: 6 })
    // Reflection on A: stepNumber 3, totalSteps 6
    expect(calls[2][4]).toMatchObject({ stepNumber: 3, totalSteps: 6 })
    // Worker B: stepNumber 4, totalSteps 6
    expect(calls[3][4]).toMatchObject({ stepNumber: 4, totalSteps: 6 })
    // Reflection on B: stepNumber 5, totalSteps 6
    expect(calls[4][4]).toMatchObject({ stepNumber: 5, totalSteps: 6 })
    // Synthesis: stepNumber 6, totalSteps 6
    expect(calls[5][4]).toMatchObject({ stepNumber: 6, totalSteps: 6 })
  })

  it('uses correct step numbering with reflection disabled', async () => {
    const supervisor = makeAgent('Supervisor', 'supervisor')
    const workers = [makeAgent('Worker A'), makeAgent('Worker B')]
    const workflow = makeWorkflow()

    setupAgentOutputs([
      { name: 'Supervisor', output: 'Plan' },
      { name: 'Worker A', output: 'A result' },
      { name: 'Worker B', output: 'B result' },
      { name: 'Supervisor', output: 'Final' },
    ])

    await executeSupervisorWorkflowLangGraph(
      {
        ...baseConfig,
        workflow,
        supervisorAgent: supervisor,
        workerAgents: workers,
        enableReflection: false,
      },
      'Test goal'
    )

    // totalSteps = 2 + 2 = 4
    const calls = mockExecuteAgent.mock.calls
    expect(calls[0][4]).toMatchObject({ stepNumber: 1, totalSteps: 4 })
    expect(calls[1][4]).toMatchObject({ stepNumber: 2, totalSteps: 4 })
    expect(calls[2][4]).toMatchObject({ stepNumber: 3, totalSteps: 4 })
    expect(calls[3][4]).toMatchObject({ stepNumber: 4, totalSteps: 4 })
  })

  it('handles no workers — supervisor goes directly to synthesis', async () => {
    const supervisor = makeAgent('Supervisor', 'supervisor')
    const workflow = makeWorkflow()

    setupAgentOutputs([
      { name: 'Supervisor', output: 'Plan for empty' },
      { name: 'Supervisor', output: 'Synthesis with no workers' },
    ])

    const result = await executeSupervisorWorkflowLangGraph(
      { ...baseConfig, workflow, supervisorAgent: supervisor, workerAgents: [] },
      'Test goal'
    )

    // Only 2 calls: plan + synthesis
    expect(mockExecuteAgent).toHaveBeenCalledTimes(2)
    expect(result.output).toBe('Synthesis with no workers')
  })

  it('emits supervisor plan event when eventWriter is present', async () => {
    const supervisor = makeAgent('Supervisor', 'supervisor')
    const workers = [makeAgent('Worker A')]
    const workflow = makeWorkflow()

    const mockWriteEvent = vi.fn().mockResolvedValue(undefined)
    const mockEventWriter = {
      writeEvent: mockWriteEvent,
      appendToken: vi.fn(),
      flushTokens: vi.fn().mockResolvedValue(undefined),
    }

    setupAgentOutputs([
      { name: 'Supervisor', output: 'The plan is...' },
      { name: 'Worker A', output: 'Result' },
      { name: 'Supervisor', output: 'SATISFACTORY' },
      { name: 'Supervisor', output: 'Final' },
    ])

    await executeSupervisorWorkflowLangGraph(
      {
        ...baseConfig,
        workflow,
        supervisorAgent: supervisor,
        workerAgents: workers,
        eventWriter: mockEventWriter,
      },
      'Test goal'
    )

    // Check that supervisor_plan event was emitted
    const planEvent = mockWriteEvent.mock.calls.find((call) => call[0].status === 'supervisor_plan')
    expect(planEvent).toBeDefined()
    expect(planEvent![0].output).toBe('The plan is...')

    // Check that supervisor_reflection event was emitted
    const reflectionEvent = mockWriteEvent.mock.calls.find(
      (call) => call[0].status === 'supervisor_reflection'
    )
    expect(reflectionEvent).toBeDefined()
  })
})
