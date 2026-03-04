/**
 * Quality Gate Tests — Phase 10
 *
 * Tests for quality gates in sequential workflows:
 * - Quality gate passes (score >= threshold) — agent runs once
 * - Quality gate fails (score < threshold) — agent retries with upgraded model
 * - Quality gate disabled — no scoring call made
 * - Quality gate on last agent — no scoring call made (skip)
 * - Quality gate with thinking tier — no retry possible, original output used
 * - Quality gate with early exit — no scoring call made (skip)
 * - scoreAgentOutput returns valid score on success
 * - scoreAgentOutput returns 3 on parse failure
 * - Custom threshold (qualityGateThreshold: 4) — fails at 3, passes at 4
 * - Tokens/cost accumulate from both original and retry attempts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AgentConfig, Workflow, AgentExecutionStep } from '@lifeos/agents'

// Mock providerService
const mockExecuteWithProvider = vi.fn().mockResolvedValue({
  output: '3',
  tokensUsed: 50,
  estimatedCost: 0.001,
  iterationsUsed: 1,
  provider: 'openai',
  model: 'gpt-4o-mini',
})

vi.mock('../providerService.js', () => ({
  executeWithProvider: (...args: unknown[]) => mockExecuteWithProvider(...args),
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
      resolvedTier: 'fast',
    }),
  }
})

import {
  executeSequentialWorkflowLangGraph,
  scoreAgentOutput,
} from '../langgraph/sequentialGraph.js'
import { executeAgentWithEvents } from '../langgraph/utils.js'
import { resolveEffectiveModel } from '@lifeos/agents'

const mockExecuteAgent = vi.mocked(executeAgentWithEvents)
const mockResolve = vi.mocked(resolveEffectiveModel)

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

/**
 * Set up the mock to return specific outputs for each call in sequence.
 */
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

describe('Sequential Quality Gates', () => {
  beforeEach(() => {
    mockExecuteAgent.mockReset()
    mockExecuteWithProvider.mockReset()
    mockResolve.mockReset()
    mockResolve.mockReturnValue({
      provider: 'openai',
      model: 'gpt-4o-mini',
      resolvedTier: 'fast',
    })
  })

  it('passes quality gate (score >= 3) — agent runs once, output used as-is', async () => {
    const agents = [makeAgent('Agent A', 0), makeAgent('Agent B', 1)]
    const workflow = makeWorkflow({ enableQualityGates: true })

    // Score returns 4 (pass)
    mockExecuteWithProvider.mockResolvedValue({
      output: '4',
      tokensUsed: 50,
      estimatedCost: 0.001,
      iterationsUsed: 1,
      provider: 'openai',
      model: 'gpt-4o-mini',
    })

    setupAgentOutputs([
      { name: 'Agent A', output: 'Good output' },
      { name: 'Agent B', output: 'Final result' },
    ])

    const result = await executeSequentialWorkflowLangGraph(
      { ...baseConfig, workflow, agents },
      'Test goal'
    )

    // Both agents run, no retry
    expect(mockExecuteAgent).toHaveBeenCalledTimes(2)
    // Score was called once (for Agent A, not for Agent B since it's last)
    expect(mockExecuteWithProvider).toHaveBeenCalledTimes(1)
    expect(result.output).toBe('Final result')
  })

  it('fails quality gate (score < 3) — retries with upgraded model', async () => {
    const agents = [makeAgent('Agent A', 0), makeAgent('Agent B', 1)]
    const workflow = makeWorkflow({ enableQualityGates: true })

    // Score returns 2 (fail)
    mockExecuteWithProvider.mockResolvedValue({
      output: '2',
      tokensUsed: 50,
      estimatedCost: 0.001,
      iterationsUsed: 1,
      provider: 'openai',
      model: 'gpt-4o-mini',
    })

    setupAgentOutputs([
      { name: 'Agent A', output: 'Bad output' },
      { name: 'Agent A (retry)', output: 'Better output after retry' },
      { name: 'Agent B', output: 'Final result' },
    ])

    const result = await executeSequentialWorkflowLangGraph(
      { ...baseConfig, workflow, agents },
      'Test goal'
    )

    // Agent A (original) + Agent A (retry) + Agent B = 3 calls
    expect(mockExecuteAgent).toHaveBeenCalledTimes(3)
    expect(result.output).toBe('Final result')
  })

  it('does not run quality gate when disabled', async () => {
    const agents = [makeAgent('Agent A', 0), makeAgent('Agent B', 1)]
    const workflow = makeWorkflow({ enableQualityGates: false })

    setupAgentOutputs([
      { name: 'Agent A', output: 'Output A' },
      { name: 'Agent B', output: 'Output B' },
    ])

    await executeSequentialWorkflowLangGraph({ ...baseConfig, workflow, agents }, 'Test goal')

    // No scoring call made
    expect(mockExecuteWithProvider).not.toHaveBeenCalled()
    expect(mockExecuteAgent).toHaveBeenCalledTimes(2)
  })

  it('does not run quality gate when enableQualityGates is undefined', async () => {
    const agents = [makeAgent('Agent A', 0), makeAgent('Agent B', 1)]
    const workflow = makeWorkflow() // No enableQualityGates

    setupAgentOutputs([
      { name: 'Agent A', output: 'Output A' },
      { name: 'Agent B', output: 'Output B' },
    ])

    await executeSequentialWorkflowLangGraph({ ...baseConfig, workflow, agents }, 'Test goal')

    expect(mockExecuteWithProvider).not.toHaveBeenCalled()
    expect(mockExecuteAgent).toHaveBeenCalledTimes(2)
  })

  it('skips quality gate on last agent', async () => {
    const agents = [makeAgent('Agent A', 0)]
    const workflow = makeWorkflow({ enableQualityGates: true })

    setupAgentOutputs([{ name: 'Agent A', output: 'Only output' }])

    await executeSequentialWorkflowLangGraph({ ...baseConfig, workflow, agents }, 'Test goal')

    // No scoring call for last (only) agent
    expect(mockExecuteWithProvider).not.toHaveBeenCalled()
    expect(mockExecuteAgent).toHaveBeenCalledTimes(1)
  })

  it('does not retry when already at thinking tier (highest)', async () => {
    const agents = [makeAgent('Agent A', 0), makeAgent('Agent B', 1)]
    const workflow = makeWorkflow({ enableQualityGates: true })

    mockResolve.mockReturnValue({
      provider: 'openai',
      model: 'o1',
      resolvedTier: 'thinking',
    })

    // Score returns 1 (fail)
    mockExecuteWithProvider.mockResolvedValue({
      output: '1',
      tokensUsed: 50,
      estimatedCost: 0.001,
      iterationsUsed: 1,
      provider: 'openai',
      model: 'o1',
    })

    setupAgentOutputs([
      { name: 'Agent A', output: 'Original output at thinking tier' },
      { name: 'Agent B', output: 'Final' },
    ])

    const result = await executeSequentialWorkflowLangGraph(
      { ...baseConfig, workflow, agents },
      'Test goal'
    )

    // No retry — already at thinking tier
    expect(mockExecuteAgent).toHaveBeenCalledTimes(2)
    expect(result.output).toBe('Final')
  })

  it('skips quality gate when early exit is triggered', async () => {
    const agents = [makeAgent('Agent A', 0), makeAgent('Agent B', 1), makeAgent('Agent C', 2)]
    const workflow = makeWorkflow({
      enableQualityGates: true,
      earlyExitPatterns: ['ANSWER_FOUND'],
    })

    setupAgentOutputs([
      { name: 'Agent A', output: 'Result: ANSWER_FOUND' },
      { name: 'Agent B', output: 'Should not run' },
      { name: 'Agent C', output: 'Should not run' },
    ])

    const result = await executeSequentialWorkflowLangGraph(
      { ...baseConfig, workflow, agents },
      'Test goal'
    )

    // Early exit => no scoring call
    expect(mockExecuteWithProvider).not.toHaveBeenCalled()
    expect(mockExecuteAgent).toHaveBeenCalledTimes(1)
    expect(result.output).toContain('ANSWER_FOUND')
  })

  it('uses custom threshold (qualityGateThreshold: 4)', async () => {
    const agents = [makeAgent('Agent A', 0), makeAgent('Agent B', 1)]
    const workflow = makeWorkflow({
      enableQualityGates: true,
      qualityGateThreshold: 4,
    })

    // Score returns 3 — which is below threshold 4
    mockExecuteWithProvider.mockResolvedValue({
      output: '3',
      tokensUsed: 50,
      estimatedCost: 0.001,
      iterationsUsed: 1,
      provider: 'openai',
      model: 'gpt-4o-mini',
    })

    setupAgentOutputs([
      { name: 'Agent A', output: 'Decent output' },
      { name: 'Agent A (retry)', output: 'Improved output' },
      { name: 'Agent B', output: 'Final' },
    ])

    const result = await executeSequentialWorkflowLangGraph(
      { ...baseConfig, workflow, agents },
      'Test goal'
    )

    // Score 3 < threshold 4 → retry triggered
    expect(mockExecuteAgent).toHaveBeenCalledTimes(3)
    expect(result.output).toBe('Final')
  })

  it('accumulates tokens/cost from both original and retry attempts', async () => {
    const agents = [makeAgent('Agent A', 0), makeAgent('Agent B', 1)]
    const workflow = makeWorkflow({ enableQualityGates: true })

    // Score returns 1 (fail)
    mockExecuteWithProvider.mockResolvedValue({
      output: '1',
      tokensUsed: 50,
      estimatedCost: 0.001,
      iterationsUsed: 1,
      provider: 'openai',
      model: 'gpt-4o-mini',
    })

    setupAgentOutputs([
      { name: 'Agent A', output: 'Bad', tokens: 200, cost: 0.02 },
      { name: 'Agent A (retry)', output: 'Better', tokens: 300, cost: 0.03 },
      { name: 'Agent B', output: 'Final', tokens: 150, cost: 0.015 },
    ])

    const result = await executeSequentialWorkflowLangGraph(
      { ...baseConfig, workflow, agents },
      'Test goal'
    )

    // Total = original(200) + retry(300) + agent_b(150) = 650
    expect(result.totalTokensUsed).toBe(650)
    // Total cost = original(0.02) + retry(0.03) + agent_b(0.015) = 0.065
    expect(result.totalEstimatedCost).toBeCloseTo(0.065, 4)
  })
})

describe('scoreAgentOutput', () => {
  beforeEach(() => {
    mockExecuteWithProvider.mockReset()
  })

  it('returns valid score on success', async () => {
    mockExecuteWithProvider.mockResolvedValue({
      output: '4',
      tokensUsed: 50,
      estimatedCost: 0.001,
      iterationsUsed: 1,
      provider: 'openai',
      model: 'gpt-4o-mini',
    })

    const score = await scoreAgentOutput('Good output', 'Test goal', { openai: 'test-key' })
    expect(score).toBe(4)
  })

  it('returns 3 on parse failure (non-numeric response)', async () => {
    mockExecuteWithProvider.mockResolvedValue({
      output: 'The score is about four out of five',
      tokensUsed: 50,
      estimatedCost: 0.001,
      iterationsUsed: 1,
      provider: 'openai',
      model: 'gpt-4o-mini',
    })

    const score = await scoreAgentOutput('Some output', 'Test goal', { openai: 'test-key' })
    expect(score).toBe(3)
  })

  it('returns 3 on out-of-range score', async () => {
    mockExecuteWithProvider.mockResolvedValue({
      output: '7',
      tokensUsed: 50,
      estimatedCost: 0.001,
      iterationsUsed: 1,
      provider: 'openai',
      model: 'gpt-4o-mini',
    })

    const score = await scoreAgentOutput('Some output', 'Test goal', { openai: 'test-key' })
    expect(score).toBe(3)
  })

  it('returns 3 on provider error', async () => {
    mockExecuteWithProvider.mockRejectedValue(new Error('API error'))

    const score = await scoreAgentOutput('Some output', 'Test goal', { openai: 'test-key' })
    expect(score).toBe(3)
  })
})
