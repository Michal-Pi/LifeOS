/**
 * Supervisor Tool-Aware Delegation & Budget Allocation Tests — Phase 14
 *
 * Tests for:
 * - Supervisor prompt includes worker tools
 * - Supervisor prompt without tools (empty array)
 * - Tool registry lookup — tools not found still appear as { id: toolId }
 * - maxTokensPerWorker passed to workers
 * - maxTokensPerWorker not set — no maxTokens in options
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AgentConfig, Workflow, AgentExecutionStep, ToolId } from '@lifeos/agents'

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

// Mock utils.js
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

function makeAgent(name: string, role: string = 'custom', toolIds?: string[]): AgentConfig {
  return {
    agentId: `agent_${name}` as AgentConfig['agentId'],
    userId: 'user1',
    name,
    role: role as AgentConfig['role'],
    systemPrompt: `You are ${name}`,
    modelProvider: 'openai',
    modelName: 'gpt-4o-mini',
    temperature: 0.7,
    toolIds: toolIds as ToolId[] | undefined,
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

describe('Supervisor Tool-Aware Delegation (Phase 14)', () => {
  beforeEach(() => {
    mockExecuteAgent.mockReset()
  })

  it('includes worker tools in supervisor planning context', async () => {
    const supervisor = makeAgent('Supervisor', 'supervisor')
    const workers = [makeAgent('Researcher', 'researcher', ['serp_search', 'query_firestore'])]

    const toolRegistry = new Map([
      [
        'serp_search',
        {
          toolId: 'serp_search',
          name: 'SERP Search',
          description: 'Search the web using SERP API',
          execute: vi.fn(),
        },
      ],
      [
        'query_firestore',
        {
          toolId: 'query_firestore',
          name: 'Query Firestore',
          description: 'Query the Firestore database',
          execute: vi.fn(),
        },
      ],
    ])

    setupAgentOutputs([
      { name: 'Supervisor', output: 'Plan with tools' },
      { name: 'Researcher', output: 'Research done' },
      { name: 'Supervisor', output: 'SATISFACTORY' },
      { name: 'Supervisor', output: 'Final' },
    ])

    await executeSupervisorWorkflowLangGraph(
      {
        ...baseConfig,
        workflow: makeWorkflow(),
        supervisorAgent: supervisor,
        workerAgents: workers,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        toolRegistry: toolRegistry as any,
      },
      'Test goal'
    )

    // Check the planning call's context includes tool info
    const planCall = mockExecuteAgent.mock.calls[0]
    const planContext = planCall[2] as Record<string, unknown>
    const availableAgents = planContext.availableAgents as Array<{
      name: string
      tools: Array<{ id: string; name?: string; description?: string }>
    }>

    expect(availableAgents).toHaveLength(1)
    expect(availableAgents[0].tools).toHaveLength(2)
    expect(availableAgents[0].tools[0]).toMatchObject({
      id: 'serp_search',
      name: 'SERP Search',
      description: 'Search the web using SERP API',
    })
  })

  it('includes empty tools array when worker has no toolIds', async () => {
    const supervisor = makeAgent('Supervisor', 'supervisor')
    const workers = [makeAgent('Worker', 'custom')]

    setupAgentOutputs([
      { name: 'Supervisor', output: 'Plan' },
      { name: 'Worker', output: 'Done' },
      { name: 'Supervisor', output: 'SATISFACTORY' },
      { name: 'Supervisor', output: 'Final' },
    ])

    await executeSupervisorWorkflowLangGraph(
      {
        ...baseConfig,
        workflow: makeWorkflow(),
        supervisorAgent: supervisor,
        workerAgents: workers,
      },
      'Test goal'
    )

    const planCall = mockExecuteAgent.mock.calls[0]
    const planContext = planCall[2] as Record<string, unknown>
    const availableAgents = planContext.availableAgents as Array<{
      tools: unknown[]
    }>

    expect(availableAgents[0].tools).toHaveLength(0)
  })

  it('tool not in registry still appears as { id: toolId }', async () => {
    const supervisor = makeAgent('Supervisor', 'supervisor')
    const workers = [makeAgent('Worker', 'custom', ['unknown_tool'])]

    // Empty registry — tool not found
    const toolRegistry = new Map()

    setupAgentOutputs([
      { name: 'Supervisor', output: 'Plan' },
      { name: 'Worker', output: 'Done' },
      { name: 'Supervisor', output: 'SATISFACTORY' },
      { name: 'Supervisor', output: 'Final' },
    ])

    await executeSupervisorWorkflowLangGraph(
      {
        ...baseConfig,
        workflow: makeWorkflow(),
        supervisorAgent: supervisor,
        workerAgents: workers,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        toolRegistry: toolRegistry as any,
      },
      'Test goal'
    )

    const planCall = mockExecuteAgent.mock.calls[0]
    const planContext = planCall[2] as Record<string, unknown>
    const availableAgents = planContext.availableAgents as Array<{
      tools: Array<{ id: string }>
    }>

    expect(availableAgents[0].tools).toHaveLength(1)
    expect(availableAgents[0].tools[0]).toEqual({ id: 'unknown_tool' })
  })
})

describe('Supervisor Budget Allocation (Phase 14)', () => {
  beforeEach(() => {
    mockExecuteAgent.mockReset()
  })

  it('passes maxTokensPerWorker to worker agent executions', async () => {
    const supervisor = makeAgent('Supervisor', 'supervisor')
    const workers = [makeAgent('Worker A')]
    const workflow = makeWorkflow()

    setupAgentOutputs([
      { name: 'Supervisor', output: 'Plan' },
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
        maxTokensPerWorker: 500,
      },
      'Test goal'
    )

    // Worker call (index 1) should have maxTokens in options
    const workerCall = mockExecuteAgent.mock.calls[1]
    const workerOptions = workerCall[4] as Record<string, unknown>
    expect(workerOptions.maxTokens).toBe(500)

    // Plan call (index 0) should NOT have maxTokens
    const planCall = mockExecuteAgent.mock.calls[0]
    const planOptions = planCall[4] as Record<string, unknown>
    expect(planOptions.maxTokens).toBeUndefined()

    // Synthesis call (last) should NOT have maxTokens
    const synthesisCall = mockExecuteAgent.mock.calls[mockExecuteAgent.mock.calls.length - 1]
    const synthesisOptions = synthesisCall[4] as Record<string, unknown>
    expect(synthesisOptions.maxTokens).toBeUndefined()
  })

  it('does not pass maxTokens when maxTokensPerWorker is not set', async () => {
    const supervisor = makeAgent('Supervisor', 'supervisor')
    const workers = [makeAgent('Worker A')]
    const workflow = makeWorkflow()

    setupAgentOutputs([
      { name: 'Supervisor', output: 'Plan' },
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
        // no maxTokensPerWorker
      },
      'Test goal'
    )

    // Worker call should NOT have maxTokens
    const workerCall = mockExecuteAgent.mock.calls[1]
    const workerOptions = workerCall[4] as Record<string, unknown>
    expect(workerOptions.maxTokens).toBeUndefined()
  })
})
