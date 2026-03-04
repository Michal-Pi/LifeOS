/**
 * Step Progress Events Tests — Phase 7
 *
 * Tests for step_started and step_completed event emission during agent execution.
 * Verifies that progress events are emitted correctly with step/total info and cost data.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock providerService — inline values (vi.mock is hoisted, no access to module-level vars)
vi.mock('../providerService.js', () => ({
  executeWithProvider: vi.fn().mockResolvedValue({
    output: 'test output',
    tokensUsed: 100,
    estimatedCost: 0.01,
    iterationsUsed: 1,
    provider: 'openai',
    model: 'gpt-4o-mini',
  }),
  executeWithProviderStreaming: vi.fn().mockResolvedValue({
    output: 'test output',
    tokensUsed: 100,
    estimatedCost: 0.01,
    iterationsUsed: 1,
    provider: 'openai',
    model: 'gpt-4o-mini',
  }),
}))

// Mock resolveEffectiveModel from @lifeos/agents
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

import { executeAgentWithEvents, type AgentExecutionContext } from '../langgraph/utils.js'
import type { AgentConfig } from '@lifeos/agents'

const mockAgent: AgentConfig = {
  agentId: 'agent_test' as AgentConfig['agentId'],
  userId: 'user_1',
  name: 'Test Agent',
  role: 'researcher',
  systemPrompt: 'You are a test agent.',
  modelProvider: 'openai',
  modelName: 'gpt-4o-mini',
  archived: false,
  createdAtMs: Date.now(),
  updatedAtMs: Date.now(),
  syncState: 'synced',
  version: 1,
}

function createMockEventWriter() {
  return {
    writeEvent: vi.fn().mockResolvedValue(undefined),
    appendToken: vi.fn().mockResolvedValue(undefined),
    flushTokens: vi.fn().mockResolvedValue(undefined),
  }
}

describe('Step Progress Events', () => {
  let execContext: AgentExecutionContext

  beforeEach(() => {
    execContext = {
      userId: 'user_1',
      workflowId: 'wf_test',
      runId: 'run_test',
      apiKeys: { openai: 'test-key' },
      eventWriter: createMockEventWriter(),
    }
  })

  it('emits step_started event before agent execution', async () => {
    await executeAgentWithEvents(mockAgent, 'test goal', {}, execContext, {
      stepNumber: 1,
      totalSteps: 3,
    })

    const writeEvent = execContext.eventWriter!.writeEvent
    const calls = vi.mocked(writeEvent).mock.calls
    const stepStartedCall = calls.find(
      (call) => (call[0] as { type: string }).type === 'step_started'
    )

    expect(stepStartedCall).toBeDefined()
    const event = stepStartedCall![0] as Record<string, unknown>
    expect(event.type).toBe('step_started')
    expect(event.agentId).toBe('agent_test')
    expect(event.agentName).toBe('Test Agent')
    expect(event.step).toBe(1)
    expect((event.details as Record<string, unknown>).totalSteps).toBe(3)
  })

  it('emits step_completed event after agent execution', async () => {
    await executeAgentWithEvents(mockAgent, 'test goal', {}, execContext, {
      stepNumber: 2,
      totalSteps: 5,
    })

    const writeEvent = execContext.eventWriter!.writeEvent
    const calls = vi.mocked(writeEvent).mock.calls
    const stepCompletedCall = calls.find(
      (call) => (call[0] as { type: string }).type === 'step_completed'
    )

    expect(stepCompletedCall).toBeDefined()
    const event = stepCompletedCall![0] as Record<string, unknown>
    expect(event.type).toBe('step_completed')
    expect(event.agentId).toBe('agent_test')
    expect(event.agentName).toBe('Test Agent')
    expect(event.step).toBe(2)
    const details = event.details as Record<string, unknown>
    expect(details.totalSteps).toBe(5)
    expect(details.cumulativeCost).toBe(0.01)
    expect(details.cumulativeTokens).toBe(100)
    expect(typeof details.durationMs).toBe('number')
  })

  it('includes correct step index and total in events', async () => {
    await executeAgentWithEvents(mockAgent, 'test goal', {}, execContext, {
      stepNumber: 3,
      totalSteps: 4,
    })

    const writeEvent = execContext.eventWriter!.writeEvent
    const calls = vi.mocked(writeEvent).mock.calls

    const startEvent = calls.find(
      (call) => (call[0] as { type: string }).type === 'step_started'
    )![0] as Record<string, unknown>
    const doneEvent = calls.find(
      (call) => (call[0] as { type: string }).type === 'step_completed'
    )![0] as Record<string, unknown>

    expect(startEvent.step).toBe(3)
    expect((startEvent.details as Record<string, unknown>).totalSteps).toBe(4)
    expect(doneEvent.step).toBe(3)
    expect((doneEvent.details as Record<string, unknown>).totalSteps).toBe(4)
  })

  it('does not emit step events when no eventWriter', async () => {
    const contextNoWriter: AgentExecutionContext = {
      ...execContext,
      eventWriter: undefined,
    }

    // Should not throw
    const result = await executeAgentWithEvents(mockAgent, 'test goal', {}, contextNoWriter, {
      stepNumber: 1,
      totalSteps: 3,
    })

    expect(result.output).toBe('test output')
  })

  it('does not emit step events when stepNumber is undefined', async () => {
    await executeAgentWithEvents(mockAgent, 'test goal', {}, execContext, {})

    const writeEvent = execContext.eventWriter!.writeEvent
    const calls = vi.mocked(writeEvent).mock.calls

    const stepEvents = calls.filter(
      (call) =>
        (call[0] as { type: string }).type === 'step_started' ||
        (call[0] as { type: string }).type === 'step_completed'
    )

    expect(stepEvents).toHaveLength(0)
  })

  it('step_started is emitted before step_completed', async () => {
    await executeAgentWithEvents(mockAgent, 'test goal', {}, execContext, {
      stepNumber: 1,
      totalSteps: 2,
    })

    const writeEvent = execContext.eventWriter!.writeEvent
    const calls = vi.mocked(writeEvent).mock.calls

    const startIndex = calls.findIndex(
      (call) => (call[0] as { type: string }).type === 'step_started'
    )
    const doneIndex = calls.findIndex(
      (call) => (call[0] as { type: string }).type === 'step_completed'
    )

    expect(startIndex).toBeGreaterThanOrEqual(0)
    expect(doneIndex).toBeGreaterThanOrEqual(0)
    expect(startIndex).toBeLessThan(doneIndex)
  })
})

describe('Step Progress Event Factories', () => {
  it('stepStartedEvent creates correct structure', async () => {
    const { stepStartedEvent } = await import('../langgraph/events.js')
    const event = stepStartedEvent({
      workflowId: 'wf_1',
      runId: 'run_1',
      agentId: 'agent_1',
      agentName: 'Researcher',
      stepIndex: 2,
      totalSteps: 5,
    })

    expect(event.type).toBe('step_started')
    expect(event.workflowId).toBe('wf_1')
    expect(event.runId).toBe('run_1')
    expect(event.agentId).toBe('agent_1')
    expect(event.agentName).toBe('Researcher')
    expect(event.stepNumber).toBe(2)
    expect(event.data?.totalSteps).toBe(5)
    expect(event.timestamp).toBeGreaterThan(0)
  })

  it('stepCompletedEvent creates correct structure with metrics', async () => {
    const { stepCompletedEvent } = await import('../langgraph/events.js')
    const event = stepCompletedEvent({
      workflowId: 'wf_1',
      runId: 'run_1',
      agentId: 'agent_1',
      agentName: 'Researcher',
      stepIndex: 3,
      totalSteps: 5,
      cumulativeCost: 0.05,
      cumulativeTokens: 500,
      durationMs: 1200,
    })

    expect(event.type).toBe('step_completed')
    expect(event.stepNumber).toBe(3)
    expect(event.data?.totalSteps).toBe(5)
    expect(event.data?.cumulativeCost).toBe(0.05)
    expect(event.data?.cumulativeTokens).toBe(500)
    expect(event.metrics?.durationMs).toBe(1200)
    expect(event.metrics?.estimatedCost).toBe(0.05)
    expect(event.metrics?.tokensUsed).toBe(500)
  })
})
