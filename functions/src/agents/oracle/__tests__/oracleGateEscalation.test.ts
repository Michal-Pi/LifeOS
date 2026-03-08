import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AgentConfig, OracleRunConfig } from '@lifeos/agents'

vi.mock('../../../lib/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}))

vi.mock('../../langgraph/utils.js', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return {
    ...actual,
    executeAgentWithEvents: vi.fn(),
    handleAskUserInterrupt: vi.fn().mockReturnValue(null),
  }
})

vi.mock('../axiomLoader.js', () => ({
  getRecipesForAgent: vi.fn().mockReturnValue([]),
  getRecipesByCategory: vi.fn().mockReturnValue([]),
  getRecipesByPhase: vi.fn().mockReturnValue([]),
  getRecipeById: vi.fn().mockReturnValue(undefined),
  getTechniqueById: vi.fn().mockReturnValue(undefined),
  getTechniquesForRecipe: vi.fn().mockReturnValue([]),
  getAxiomById: vi.fn().mockReturnValue(undefined),
  getAxiomsByIds: vi.fn().mockReturnValue([]),
  getSystemElevations: vi.fn().mockReturnValue([]),
  getRecipesUsingAxiom: vi.fn().mockReturnValue([]),
  getAxiomsByDomain: vi.fn().mockReturnValue([]),
  formatRecipeForPrompt: vi.fn().mockReturnValue(''),
  formatTechniqueForPrompt: vi.fn().mockReturnValue(''),
  formatAxiomForPrompt: vi.fn().mockReturnValue(''),
}))

vi.mock('../../expertCouncil.js', () => ({
  createExpertCouncilPipeline: vi.fn(),
}))

import { executeAgentWithEvents } from '../../langgraph/utils.js'
import { executeOracleWorkflowLangGraph, type OracleGraphConfig } from '../../langgraph/oracleGraph.js'

const mockExecuteAgent = vi.mocked(executeAgentWithEvents)

function makeAgent(role: string): AgentConfig {
  return {
    agentId: `agent-${role}`,
    name: `Test ${role}`,
    modelProvider: 'anthropic',
    modelName: 'claude-sonnet-4-20250514',
    systemPrompt: '',
    temperature: 0.7,
    archived: false,
    createdAtMs: Date.now(),
    updatedAtMs: Date.now(),
    role: 'custom',
    syncState: 'synced',
    version: 1,
    userId: 'user-test',
  } as AgentConfig
}

function makeOracleConfig(overrides: Partial<OracleRunConfig> = {}): OracleRunConfig {
  return {
    depthMode: 'standard',
    maxBudgetUsd: 25,
    maxRefinementsPerGate: 1,
    maxCouncilSessions: 3,
    enableHumanGate: false,
    scenarioCount: 4,
    ...overrides,
  }
}

function makeGraphConfig(overrides: Partial<OracleGraphConfig> = {}): OracleGraphConfig {
  return {
    workflow: {
      workflowId: 'wf-oracle-escalation',
      name: 'Oracle Escalation',
      workflowType: 'oracle',
      agentIds: [],
      edges: [],
      archived: false,
      syncState: 'synced',
      version: 1,
      createdAtMs: Date.now(),
      updatedAtMs: Date.now(),
      userId: 'user-test',
    } as unknown as OracleGraphConfig['workflow'],
    oracleConfig: makeOracleConfig(),
    contextGatherer: makeAgent('context_gatherer'),
    decomposer: makeAgent('decomposer'),
    systemsMapper: makeAgent('systems_mapper'),
    verifier: makeAgent('verifier'),
    scanner: makeAgent('scanner'),
    impactAssessor: makeAgent('impact_assessor'),
    weakSignalHunter: makeAgent('weak_signal_hunter'),
    scenarioDeveloper: makeAgent('scenario_developer'),
    equilibriumAnalyst: makeAgent('equilibrium_analyst'),
    redTeam: makeAgent('red_team'),
    apiKeys: { anthropic: 'test-key' },
    userId: 'user-test',
    runId: 'run-test',
    ...overrides,
  }
}

let stepCounter = 0

function mockStep(output: string) {
  stepCounter++
  return {
    agentId: `agent-${stepCounter}`,
    agentName: `Agent ${stepCounter}`,
    output,
    tokensUsed: 100,
    estimatedCost: 0.002,
    provider: 'anthropic',
    model: 'claude-sonnet-4-20250514',
    executedAtMs: Date.now(),
    agentRole: 'custom' as const,
  }
}

describe('Oracle gate escalation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stepCounter = 0
  })

  it('marks escalation when gate C fails after refinements are exhausted', async () => {
    const nodeIds: string[] = []

    mockExecuteAgent.mockImplementation(async (_agent, _goal, _ctx, _execCtx, opts) => {
      const nodeId = opts?.nodeId ?? 'unknown'
      nodeIds.push(nodeId)

      switch (nodeId) {
        case 'equilibrium_analyst':
          return mockStep(JSON.stringify({
            selectedSkeletons: ['SK-1'],
            candidateSkeletons: [
              { id: 'SK-1', premise: { disruption: 'high' }, consistency: 0.8, plausibility: 0.6, divergence: 0.8 },
            ],
          }))
        case 'scenario_developer':
          return mockStep(JSON.stringify({
            scenarios: [
              {
                id: 'SCN-001',
                name: 'Escalated Scenario',
                premise: { disruption: 'high' },
                narrative: 'A scenario that still needs work.',
                reinforcedPrinciples: [],
                disruptedPrinciples: [],
                feedbackLoops: [],
                implications: 'Implications',
                signposts: ['Signpost'],
                tailRisks: ['Tail risk'],
                assumptionRegister: [],
                councilAssessment: { agreementRate: 0, persistentDissent: [] },
                plausibilityScore: 0.6,
                divergenceScore: 0.8,
              },
            ],
          }))
        case 'red_team':
          return mockStep(JSON.stringify({
            assessments: [{ scenarioId: 'SCN-001', tailRisks: ['Red-team risk'], overallRobustness: 'low' }],
          }))
        case 'gate_c':
          return mockStep(JSON.stringify({
            mechanisticClarity: 3,
            completeness: 3,
            causalDiscipline: 3,
            decisionUsefulness: 3,
            uncertaintyHygiene: 3,
            evidenceQuality: 3,
            feedback: 'Need sharper differentiation between disruption paths.',
          }))
        case 'backcasting':
          return mockStep(JSON.stringify({
            backcastTimelines: [],
            strategicMoves: [],
          }))
        default:
          throw new Error(`Unexpected node in escalation test: ${nodeId}`)
      }
    })

    const result = await executeOracleWorkflowLangGraph(
      makeGraphConfig(),
      'Test goal',
      {},
      {
        currentPhase: 'scenario_simulation',
        scope: {
          topic: 'AI disruption',
          domain: 'technology',
          timeHorizon: '5 years',
          geography: 'global',
          decisionContext: 'Strategic planning',
          boundaries: { inScope: [], outOfScope: [] },
        },
        scenarioPortfolio: [],
        phaseSummaries: [],
        currentGateRefinements: 1,
        gateResults: [],
        costTracker: {
          total: 0,
          byPhase: {},
          byModel: {},
          byComponent: { search: 0, llm: 0, council: 0, evaluation: 0 },
        },
        status: 'running',
      } as never,
    )

    expect(result.status).toBe('waiting_for_input')
    expect(result.pendingInput?.nodeId).toBe('gate_escalation')
    expect(result.gateEscalated).toBe(true)
    expect(result.gateEscalationFeedback).toContain('Need sharper differentiation')
    expect(nodeIds.filter((nodeId) => nodeId === 'scenario_developer')).toHaveLength(1)
  })

  it('keeps gateEscalated sticky once it becomes true', () => {
    const reducer = (current: boolean, update: boolean) => current || update

    expect(reducer(false, true)).toBe(true)
    expect(reducer(true, false)).toBe(true)
  })
})
