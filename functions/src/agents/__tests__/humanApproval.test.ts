/**
 * Human Approval Tests — Phase 15
 *
 * Tests for human_approval node type in graph workflows:
 * - Execution pauses at approval node (no approval in context)
 * - Execution resumes on approval
 * - Execution routes to end on rejection
 * - No approval node — graph executes normally
 * - pendingInput populated correctly
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

describe('Human Approval Nodes (Phase 15)', () => {
  beforeEach(() => {
    mockExecuteAgent.mockReset()
  })

  it('pauses execution at approval node when no approval in context', async () => {
    const agents = [makeAgent('Agent A')]
    const graphDef: WorkflowGraph = {
      version: 1,
      startNodeId: 'agent_node',
      nodes: [
        { id: 'agent_node', type: 'agent', agentId: 'agent_Agent A' as AgentConfig['agentId'] },
        { id: 'approval_node', type: 'human_approval', label: 'Please approve this output' },
        { id: 'end_node', type: 'end' },
      ],
      edges: [
        { from: 'agent_node', to: 'approval_node', condition: { type: 'always' } },
        { from: 'approval_node', to: 'end_node', condition: { type: 'always' } },
      ],
    }

    mockExecuteAgent.mockResolvedValue(makeStep('Agent A', 'Draft output'))

    const result = await executeGenericGraphWorkflowLangGraph(
      { ...baseConfig, workflow: makeWorkflow(), graphDef, agents },
      'Test goal'
    )

    expect(result.status).toBe('waiting_for_input')
    expect(result.pendingInput).toEqual({
      prompt: 'Please approve this output',
      nodeId: 'approval_node',
    })
    // Agent ran before the approval node
    expect(mockExecuteAgent).toHaveBeenCalledTimes(1)
  })

  it('resumes execution on approval', async () => {
    const agents = [makeAgent('Agent A'), makeAgent('Agent B')]
    const graphDef: WorkflowGraph = {
      version: 1,
      startNodeId: 'agent_a',
      nodes: [
        { id: 'agent_a', type: 'agent', agentId: 'agent_Agent A' as AgentConfig['agentId'] },
        { id: 'approval_node', type: 'human_approval', label: 'Approve?' },
        { id: 'agent_b', type: 'agent', agentId: 'agent_Agent B' as AgentConfig['agentId'] },
        { id: 'end_node', type: 'end' },
      ],
      edges: [
        { from: 'agent_a', to: 'approval_node', condition: { type: 'always' } },
        { from: 'approval_node', to: 'agent_b', condition: { type: 'always' } },
        { from: 'agent_b', to: 'end_node', condition: { type: 'always' } },
      ],
    }

    let callCount = 0
    mockExecuteAgent.mockImplementation(async () => {
      callCount++
      return makeStep(`Agent ${callCount}`, `Result ${callCount}`)
    })

    // Run with approval provided in context
    const result = await executeGenericGraphWorkflowLangGraph(
      { ...baseConfig, workflow: makeWorkflow(), graphDef, agents },
      'Test goal',
      { humanApproval: { nodeId: 'approval_node', approved: true, response: 'Looks good' } }
    )

    expect(result.status).toBe('completed')
    // Both agents should have run
    expect(mockExecuteAgent).toHaveBeenCalledTimes(2)
  })

  it('terminates on rejection', async () => {
    const agents = [makeAgent('Agent A')]
    const graphDef: WorkflowGraph = {
      version: 1,
      startNodeId: 'agent_a',
      nodes: [
        { id: 'agent_a', type: 'agent', agentId: 'agent_Agent A' as AgentConfig['agentId'] },
        { id: 'approval_node', type: 'human_approval', label: 'Approve?' },
        { id: 'end_node', type: 'end' },
      ],
      edges: [
        { from: 'agent_a', to: 'approval_node', condition: { type: 'always' } },
        { from: 'approval_node', to: 'end_node', condition: { type: 'always' } },
      ],
    }

    mockExecuteAgent.mockResolvedValue(makeStep('Agent A', 'Draft'))

    const result = await executeGenericGraphWorkflowLangGraph(
      { ...baseConfig, workflow: makeWorkflow(), graphDef, agents },
      'Test goal',
      {
        humanApproval: {
          nodeId: 'approval_node',
          approved: false,
          response: 'Not acceptable',
        },
      }
    )

    expect(result.status).toBe('completed')
    expect(result.output).toBe('Not acceptable')
    // Only the first agent ran, no agent after approval
    expect(mockExecuteAgent).toHaveBeenCalledTimes(1)
  })

  it('executes normally without approval nodes', async () => {
    const agents = [makeAgent('Agent A')]
    const graphDef: WorkflowGraph = {
      version: 1,
      startNodeId: 'agent_a',
      nodes: [
        { id: 'agent_a', type: 'agent', agentId: 'agent_Agent A' as AgentConfig['agentId'] },
        { id: 'end_node', type: 'end' },
      ],
      edges: [{ from: 'agent_a', to: 'end_node', condition: { type: 'always' } }],
    }

    mockExecuteAgent.mockResolvedValue(makeStep('Agent A', 'Final output'))

    const result = await executeGenericGraphWorkflowLangGraph(
      { ...baseConfig, workflow: makeWorkflow(), graphDef, agents },
      'Test goal'
    )

    expect(result.status).toBe('completed')
    expect(result.output).toBe('Final output')
    expect(result.pendingInput).toBeUndefined()
  })
})
