/**
 * Graph Guardrails Tests — Phase 16
 *
 * Tests for loop detection, budget guardrails, and error recovery:
 * - Loop detection triggers — node visited > maxVisitsPerNode times, execution terminates
 * - Normal execution completes without triggering loop detection
 * - Budget guardrail triggers — cost exceeds maxBudget
 * - Budget guardrail doesn't trigger when cost is under budget
 * - Error recovery follows error edge
 * - Error without recovery edge — status set to failed
 * - Default maxVisitsPerNode — defaults to 10
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AgentConfig, Workflow, WorkflowGraph, AgentExecutionStep } from '@lifeos/agents'

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

// Mock firebase-admin/firestore
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: vi.fn().mockReturnValue({
    collection: vi.fn(),
    doc: vi.fn(),
    settings: vi.fn(),
  }),
}))

// Mock json-logic-js
vi.mock('json-logic-js', () => ({
  default: { apply: vi.fn().mockReturnValue(true) },
}))

// Mock crypto
vi.mock('crypto', () => ({
  randomUUID: vi.fn().mockReturnValue('test-uuid'),
}))

// Mock utils.js
vi.mock('../langgraph/utils.js', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return {
    ...actual,
    executeAgentWithEvents: vi.fn(),
  }
})

import { executeGenericGraphWorkflowLangGraph } from '../langgraph/genericGraph.js'
import { executeAgentWithEvents } from '../langgraph/utils.js'

const mockExecuteAgent = vi.mocked(executeAgentWithEvents)

function makeAgent(name: string): AgentConfig {
  return {
    agentId: `agent_${name}` as AgentConfig['agentId'],
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
    name: 'Test Graph',
    workflowType: 'graph',
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

const baseConfig = {
  apiKeys: { openai: 'test-key' },
  userId: 'user1',
  runId: 'run1',
}

describe('Loop Detection (Phase 16)', () => {
  beforeEach(() => {
    mockExecuteAgent.mockReset()
  })

  it('pauses for user decision when node exceeds max visits', async () => {
    const agents = [makeAgent('Agent A')]
    // Create a cycle: A → B → A with maxNodeVisits = 2
    const graphDef: WorkflowGraph = {
      version: 1,
      startNodeId: 'node_a',
      nodes: [
        { id: 'node_a', type: 'agent', agentId: 'agent_Agent A' as AgentConfig['agentId'] },
        { id: 'node_b', type: 'agent', agentId: 'agent_Agent A' as AgentConfig['agentId'] },
      ],
      edges: [
        { from: 'node_a', to: 'node_b', condition: { type: 'always' } },
        { from: 'node_b', to: 'node_a', condition: { type: 'always' } },
      ],
      limits: { maxNodeVisits: 2 },
    }

    mockExecuteAgent.mockResolvedValue(makeStep('Agent A', 'Loop output'))

    const result = await executeGenericGraphWorkflowLangGraph(
      { ...baseConfig, workflow: makeWorkflow(), graphDef, agents },
      'Test goal'
    )

    // Should pause for user decision (constraint pause), not throw
    expect(result.status).toBe('waiting_for_input')
    expect(result.constraintPause).toBeDefined()
    expect(result.constraintPause!.constraintType).toBe('max_node_visits')
    expect(result.constraintPause!.limitValue).toBe(2)
    expect(result.pendingInput).toBeDefined()
    expect(result.pendingInput!.prompt).toContain('limit')
    // A runs twice, B runs twice, then A pauses on 3rd attempt (no agent execution)
    expect(mockExecuteAgent).toHaveBeenCalledTimes(4)
  })

  it('completes normally when visits stay under limit', async () => {
    const agents = [makeAgent('Agent A')]
    const graphDef: WorkflowGraph = {
      version: 1,
      startNodeId: 'node_a',
      nodes: [
        { id: 'node_a', type: 'agent', agentId: 'agent_Agent A' as AgentConfig['agentId'] },
        { id: 'end_node', type: 'end' },
      ],
      edges: [{ from: 'node_a', to: 'end_node', condition: { type: 'always' } }],
      limits: { maxNodeVisits: 10 },
    }

    mockExecuteAgent.mockResolvedValue(makeStep('Agent A', 'Normal output'))

    const result = await executeGenericGraphWorkflowLangGraph(
      { ...baseConfig, workflow: makeWorkflow(), graphDef, agents },
      'Test goal'
    )

    expect(result.status).toBe('completed')
    expect(result.output).toBe('Normal output')
  })
})

describe('Budget Guardrails (Phase 16)', () => {
  beforeEach(() => {
    mockExecuteAgent.mockReset()
  })

  it('pauses for user decision when cost exceeds maxBudget', async () => {
    const agents = [makeAgent('Agent A')]
    // Cycle to accumulate cost
    const graphDef: WorkflowGraph = {
      version: 1,
      startNodeId: 'node_a',
      nodes: [
        { id: 'node_a', type: 'agent', agentId: 'agent_Agent A' as AgentConfig['agentId'] },
        { id: 'node_b', type: 'agent', agentId: 'agent_Agent A' as AgentConfig['agentId'] },
      ],
      edges: [
        { from: 'node_a', to: 'node_b', condition: { type: 'always' } },
        { from: 'node_b', to: 'node_a', condition: { type: 'always' } },
      ],
      limits: { maxNodeVisits: 100 }, // High limit so budget triggers first
    }

    // Each call costs 0.05, budget is 0.10
    // After 2 calls: cost = 0.10, 3rd call: cost = 0.10 > 0.10? No, 0.10 is not > 0.10
    // After 3 calls: cost = 0.15, 4th call: budget check at start of node = 0.15 > 0.10 = yes
    mockExecuteAgent.mockResolvedValue(
      makeStep('Agent A', 'Output', { tokensUsed: 500, estimatedCost: 0.05 })
    )

    const result = await executeGenericGraphWorkflowLangGraph(
      { ...baseConfig, workflow: makeWorkflow({ maxBudget: 0.1 }), graphDef, agents },
      'Test goal'
    )

    expect(result.status).toBe('waiting_for_input')
    expect(result.constraintPause).toBeDefined()
    expect(result.constraintPause!.constraintType).toBe('budget')
    expect(result.constraintPause!.limitValue).toBe(0.1)
    expect(result.constraintPause!.unit).toBe('USD')
    expect(result.pendingInput).toBeDefined()
    expect(result.pendingInput!.prompt).toContain('Budget limit reached')
  })

  it('does not trigger when cost is under budget', async () => {
    const agents = [makeAgent('Agent A')]
    const graphDef: WorkflowGraph = {
      version: 1,
      startNodeId: 'node_a',
      nodes: [
        { id: 'node_a', type: 'agent', agentId: 'agent_Agent A' as AgentConfig['agentId'] },
        { id: 'end_node', type: 'end' },
      ],
      edges: [{ from: 'node_a', to: 'end_node', condition: { type: 'always' } }],
    }

    mockExecuteAgent.mockResolvedValue(
      makeStep('Agent A', 'Cheap output', { tokensUsed: 100, estimatedCost: 0.01 })
    )

    const result = await executeGenericGraphWorkflowLangGraph(
      { ...baseConfig, workflow: makeWorkflow({ maxBudget: 1.0 }), graphDef, agents },
      'Test goal'
    )

    expect(result.status).toBe('completed')
    expect(result.output).toBe('Cheap output')
  })
})

describe('Error Recovery (Phase 16)', () => {
  beforeEach(() => {
    mockExecuteAgent.mockReset()
  })

  it('follows error edge when agent throws and error edge exists', async () => {
    const agents = [makeAgent('Agent A'), makeAgent('Error Handler')]
    const graphDef: WorkflowGraph = {
      version: 1,
      startNodeId: 'node_a',
      nodes: [
        { id: 'node_a', type: 'agent', agentId: 'agent_Agent A' as AgentConfig['agentId'] },
        {
          id: 'error_handler',
          type: 'agent',
          agentId: 'agent_Error Handler' as AgentConfig['agentId'],
        },
        { id: 'end_node', type: 'end' },
      ],
      edges: [
        { from: 'node_a', to: 'end_node', condition: { type: 'always' } },
        { from: 'node_a', to: 'error_handler', condition: { type: 'error' } },
        { from: 'error_handler', to: 'end_node', condition: { type: 'always' } },
      ],
    }

    let callCount = 0
    mockExecuteAgent.mockImplementation(async () => {
      callCount++
      if (callCount === 1) {
        throw new Error('Agent A crashed')
      }
      return makeStep('Error Handler', 'Recovered gracefully')
    })

    const result = await executeGenericGraphWorkflowLangGraph(
      { ...baseConfig, workflow: makeWorkflow(), graphDef, agents },
      'Test goal'
    )

    expect(result.status).toBe('completed')
    expect(result.output).toBe('Recovered gracefully')
    // First call throws, second call is error handler
    expect(mockExecuteAgent).toHaveBeenCalledTimes(2)
  })

  it('sets status to failed when agent throws and no error edge exists', async () => {
    const agents = [makeAgent('Agent A')]
    const graphDef: WorkflowGraph = {
      version: 1,
      startNodeId: 'node_a',
      nodes: [
        { id: 'node_a', type: 'agent', agentId: 'agent_Agent A' as AgentConfig['agentId'] },
        { id: 'end_node', type: 'end' },
      ],
      edges: [{ from: 'node_a', to: 'end_node', condition: { type: 'always' } }],
    }

    mockExecuteAgent.mockRejectedValue(new Error('Agent A crashed'))

    const result = await executeGenericGraphWorkflowLangGraph(
      { ...baseConfig, workflow: makeWorkflow(), graphDef, agents },
      'Test goal'
    )

    expect(result.status).toBe('failed')
    expect(result.output).toContain('Workflow failed at node node_a')
    expect(result.output).toContain('Agent A crashed')
  })
})
