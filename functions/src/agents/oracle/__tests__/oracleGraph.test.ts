import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AgentConfig, ExpertCouncilTurn, OracleRunConfig } from '@lifeos/agents'

// Mock logger first
vi.mock('../../../lib/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}))

// Mock executeAgentWithEvents — the core agent execution utility
vi.mock('../../langgraph/utils.js', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return {
    ...actual,
    executeAgentWithEvents: vi.fn(),
    handleAskUserInterrupt: vi.fn().mockReturnValue(null),
  }
})

// Mock axiomLoader since JSON files may not exist in test environment
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

// Import after mocks
import { executeAgentWithEvents } from '../../langgraph/utils.js'
import { createExpertCouncilPipeline } from '../../expertCouncil.js'
import {
  collectEvidenceFromSearchPlan,
  selectUrlsForCrawl,
  executeOracleWorkflowLangGraph,
  type OracleGraphConfig,
} from '../../langgraph/oracleGraph.js'
import { evaluateGate, parseRubricScores, buildGateEvaluatorPrompt } from '../gateEvaluator.js'
import {
  buildFallbackSummary,
  parsePhaseSummary,
  formatPhaseSummariesForContext,
} from '../phaseSummarizer.js'

// ----- Test Helpers -----

function makeAgent(overrides: Partial<AgentConfig> = {}): AgentConfig {
  return {
    agentId: `agent-${overrides.role ?? 'test'}`,
    name: `Test ${overrides.role ?? 'Agent'}`,
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
    ...overrides,
  } as AgentConfig
}

function makeOracleConfig(overrides: Partial<OracleRunConfig> = {}): OracleRunConfig {
  return {
    depthMode: 'standard',
    maxBudgetUsd: 25,
    maxRefinementsPerGate: 1, // Fewer retries in tests
    maxCouncilSessions: 3,
    enableHumanGate: false,
    scenarioCount: 4,
    ...overrides,
  }
}

const mockSerpSearchTool = {
  name: 'serp_search',
  description: 'Mock SERP search tool for Oracle tests',
  parameters: {
    type: 'object' as const,
    properties: {
      query: { type: 'string' as const, description: 'Search query', required: true },
    },
    required: ['query'],
  },
  execute: vi.fn(async (params: Record<string, unknown>) => {
    const query = String(params.query ?? '')
    return {
      results: [
        {
          title: `Result for ${query}`,
          snippet: `Evidence snippet for ${query}`,
          url: `https://example.com/${encodeURIComponent(query)}`,
          source: 'Example Source',
          date: '2026-01-01',
        },
      ],
    }
  }),
}

function makeGraphConfig(overrides: Partial<OracleGraphConfig> = {}): OracleGraphConfig {
  return {
    workflow: {
      workflowId: 'wf-oracle-test',
      name: 'Test Oracle',
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
    contextGatherer: makeAgent({ role: 'context_gatherer' }),
    decomposer: makeAgent({ role: 'decomposer' }),
    systemsMapper: makeAgent({ role: 'systems_mapper' }),
    verifier: makeAgent({ role: 'verifier' }),
    scanner: makeAgent({ role: 'scanner' }),
    impactAssessor: makeAgent({ role: 'impact_assessor' }),
    weakSignalHunter: makeAgent({ role: 'weak_signal_hunter' }),
    scenarioDeveloper: makeAgent({ role: 'scenario_developer' }),
    equilibriumAnalyst: makeAgent({ role: 'equilibrium_analyst' }),
    redTeam: makeAgent({ role: 'red_team' }),
    apiKeys: { anthropic: 'test-key' },
    toolRegistry: new Map([['serp_search', mockSerpSearchTool]]),
    searchToolKeys: { serper: 'test-serper-key' },
    userId: 'user-test',
    runId: 'run-test',
    ...overrides,
  }
}

function makeCouncilTurn(): ExpertCouncilTurn {
  return {
    turnId: 'turn-1',
    runId: 'run-test' as ExpertCouncilTurn['runId'],
    userPrompt: 'test prompt',
    stage1: {
      responses: [
        {
          modelId: 'm1',
          provider: 'anthropic',
          modelName: 'claude-sonnet-4-20250514',
          answerText: 'Answer 1',
          status: 'completed',
          latency: 100,
          tokensUsed: 100,
          estimatedCost: 0.001,
          timestampMs: Date.now(),
        },
        {
          modelId: 'm2',
          provider: 'openai',
          modelName: 'gpt-4o',
          answerText: 'Answer 2',
          status: 'completed',
          latency: 110,
          tokensUsed: 150,
          estimatedCost: 0.002,
          timestampMs: Date.now(),
        },
      ],
    },
    stage2: {
      anonymizationMap: {},
      reviews: [
        {
          judgeModelId: 'judge-1',
          critiques: {},
          ranking: ['A', 'B'],
          timestampMs: Date.now(),
          tokensUsed: 50,
          estimatedCost: 0.001,
        },
      ],
      aggregateRanking: [],
      consensusMetrics: {
        kendallTau: 1,
        consensusScore: 1,
        topRankedLabel: 'A',
        controversialResponses: [],
      },
    },
    stage3: {
      chairmanModelId: 'chair',
      finalResponse: 'Council synthesis',
      tokensUsed: 200,
      estimatedCost: 0.003,
      timestampMs: Date.now(),
    },
    totalDurationMs: 1000,
    totalCost: 0.007,
    createdAtMs: Date.now(),
    executionMode: 'quick',
    cacheHit: false,
    retryCount: 0,
  }
}

/** Step counter for mock implementation */
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

// ----- Gate Evaluator Tests -----

describe('Gate Evaluator', () => {
  describe('parseRubricScores', () => {
    it('parses valid JSON rubric scores', () => {
      const input = JSON.stringify({
        mechanisticClarity: 4,
        completeness: 3.5,
        causalDiscipline: 4,
        decisionUsefulness: 3,
        uncertaintyHygiene: 3.5,
        evidenceQuality: 4,
      })

      const result = parseRubricScores(input)
      expect(result).not.toBeNull()
      expect(result!.scores.mechanisticClarity).toBe(4)
      expect(result!.scores.completeness).toBe(3.5)
    })

    it('handles snake_case field names', () => {
      const input = JSON.stringify({
        mechanistic_clarity: 4,
        completeness: 3,
        causal_discipline: 4,
        decision_usefulness: 3,
        uncertainty_hygiene: 3.5,
        evidence_quality: 4,
      })

      const result = parseRubricScores(input)
      expect(result).not.toBeNull()
      expect(result!.scores.mechanisticClarity).toBe(4)
    })

    it('extracts JSON from surrounding text', () => {
      const input = `Here is my evaluation:

      {"mechanisticClarity": 4, "completeness": 3, "causalDiscipline": 4, "decisionUsefulness": 3, "uncertaintyHygiene": 4, "evidenceQuality": 3}

      The analysis was solid.`

      const result = parseRubricScores(input)
      expect(result).not.toBeNull()
    })

    it('extracts the first valid rubric object when other JSON appears nearby', () => {
      const input = `Context:
{"claims":[],"evidence":[{"id":"EVD-001"}]}

Evaluation:
{"mechanisticClarity": 3, "completeness": 3, "causalDiscipline": 3, "decisionUsefulness": 4, "uncertaintyHygiene": 4, "evidenceQuality": 4, "feedback":"Sparse but parseable."}

Trailing:
{"verifiedClaims":[],"axiomGroundingPercent":0}`

      const result = parseRubricScores(input)
      expect(result).not.toBeNull()
      expect(result!.scores.mechanisticClarity).toBe(3)
      expect(result!.scores.decisionUsefulness).toBe(4)
      expect(result!.llmFeedback).toBe('Sparse but parseable.')
    })

    it('returns null for invalid input', () => {
      expect(parseRubricScores('not json at all')).toBeNull()
    })

    it('clamps scores to 1-5 range', () => {
      const input = JSON.stringify({
        mechanisticClarity: 0,
        completeness: 7,
        causalDiscipline: 3,
        decisionUsefulness: 3,
        uncertaintyHygiene: 3,
        evidenceQuality: 3,
      })

      const result = parseRubricScores(input)
      expect(result!.scores.mechanisticClarity).toBe(1)
      expect(result!.scores.completeness).toBe(5)
    })

    it('extracts feedback field from LLM output', () => {
      const input = JSON.stringify({
        mechanisticClarity: 4,
        completeness: 3,
        causalDiscipline: 4,
        decisionUsefulness: 3,
        uncertaintyHygiene: 3,
        evidenceQuality: 3,
        feedback: 'Improve completeness and decision usefulness.',
      })

      const result = parseRubricScores(input)
      expect(result).not.toBeNull()
      expect(result!.llmFeedback).toBe('Improve completeness and decision usefulness.')
    })

    it('returns undefined llmFeedback when not present', () => {
      const input = JSON.stringify({
        mechanisticClarity: 4,
        completeness: 4,
        causalDiscipline: 4,
        decisionUsefulness: 4,
        uncertaintyHygiene: 4,
        evidenceQuality: 4,
      })

      const result = parseRubricScores(input)
      expect(result!.llmFeedback).toBeUndefined()
    })
  })

  describe('evaluateGate', () => {
    const passingScores = {
      mechanisticClarity: 4,
      completeness: 4,
      causalDiscipline: 4,
      decisionUsefulness: 4,
      uncertaintyHygiene: 4,
      evidenceQuality: 4,
    }

    it('passes when all dimensions >= 3 and avg >= 3.5', () => {
      const result = evaluateGate(
        {
          gateType: 'gate_b',
          phaseOutput: 'test output',
          refinementAttempt: 0,
          maxRefinements: 3,
        },
        passingScores
      )

      expect(result.gateResult.passed).toBe(true)
      expect(result.shouldRefine).toBe(false)
      expect(result.gateResult.averageScore).toBe(4)
    })

    it('fails when any dimension < 2 (hard floor)', () => {
      const scores = { ...passingScores, evidenceQuality: 1.5 }
      const result = evaluateGate(
        {
          gateType: 'gate_b',
          phaseOutput: 'test',
          refinementAttempt: 0,
          maxRefinements: 3,
        },
        scores
      )

      expect(result.gateResult.passed).toBe(false)
      expect(result.shouldRefine).toBe(true)
      expect(result.feedback).toContain('evidenceQuality')
    })

    it('fails when average < 3.5', () => {
      const scores = {
        mechanisticClarity: 3,
        completeness: 3,
        causalDiscipline: 3,
        decisionUsefulness: 3,
        uncertaintyHygiene: 3,
        evidenceQuality: 3,
      }
      const result = evaluateGate(
        {
          gateType: 'gate_b',
          phaseOutput: 'test',
          refinementAttempt: 0,
          maxRefinements: 3,
        },
        scores
      )

      expect(result.gateResult.passed).toBe(false)
      expect(result.feedback).toContain('below 3.5')
    })

    it('Gate A fails with low axiom grounding', () => {
      const result = evaluateGate(
        {
          gateType: 'gate_a',
          phaseOutput: 'test',
          axiomGroundingPercent: 0.5,
          refinementAttempt: 0,
          maxRefinements: 3,
        },
        passingScores
      )

      expect(result.gateResult.passed).toBe(false)
      expect(result.feedback).toContain('Axiom grounding')
      expect(result.feedback).toContain('50%')
    })

    it('Gate A passes with sufficient axiom grounding', () => {
      const result = evaluateGate(
        {
          gateType: 'gate_a',
          phaseOutput: 'test',
          axiomGroundingPercent: 0.85,
          refinementAttempt: 0,
          maxRefinements: 3,
        },
        passingScores
      )

      expect(result.gateResult.passed).toBe(true)
    })

    it('Gate C fails with low decision usefulness', () => {
      const scores = { ...passingScores, decisionUsefulness: 3.5 }
      const result = evaluateGate(
        {
          gateType: 'gate_c',
          phaseOutput: 'test',
          refinementAttempt: 0,
          maxRefinements: 3,
        },
        scores
      )

      expect(result.gateResult.passed).toBe(false)
      expect(result.feedback).toContain('Decision usefulness')
    })

    it('shouldRefine is false when max refinements reached', () => {
      const scores = { ...passingScores, evidenceQuality: 1.5 }
      const result = evaluateGate(
        {
          gateType: 'gate_b',
          phaseOutput: 'test',
          refinementAttempt: 3,
          maxRefinements: 3,
        },
        scores
      )

      expect(result.gateResult.passed).toBe(false)
      expect(result.shouldRefine).toBe(false)
      expect(result.feedback).toContain('Max refinements')
    })
  })

  describe('buildGateEvaluatorPrompt', () => {
    it('includes axiom grounding note for gate_a', () => {
      const prompt = buildGateEvaluatorPrompt('gate_a')
      expect(prompt).toContain('Axiom grounding')
      expect(prompt).toContain('computed separately')
    })

    it('includes decision usefulness requirement for gate_c', () => {
      const prompt = buildGateEvaluatorPrompt('gate_c')
      expect(prompt).toContain('Decision usefulness must be >= 4')
    })

    it('includes 6 rubric dimensions', () => {
      const prompt = buildGateEvaluatorPrompt('gate_b')
      expect(prompt).toContain('mechanisticClarity')
      expect(prompt).toContain('completeness')
      expect(prompt).toContain('causalDiscipline')
      expect(prompt).toContain('decisionUsefulness')
      expect(prompt).toContain('uncertaintyHygiene')
      expect(prompt).toContain('evidenceQuality')
    })
  })
})

// ----- Phase Summarizer Tests -----

describe('Phase Summarizer', () => {
  describe('parsePhaseSummary', () => {
    it('parses valid LLM summary output', () => {
      const output = JSON.stringify({
        executive: ['Finding 1', 'Finding 2'],
        keyClaims: [{ id: 'CLM-001', summary: 'Test claim', confidence: 0.8 }],
        keyAssumptions: [{ id: 'ASM-001', statement: 'Test assumption', sensitivity: 'high' }],
        unresolvedTensions: ['Tension 1'],
      })

      const summary = parsePhaseSummary('decomposition', output)
      expect(summary).not.toBeNull()
      expect(summary!.phase).toBe('decomposition')
      expect(summary!.executive).toHaveLength(2)
      expect(summary!.keyClaims).toHaveLength(1)
      expect(summary!.keyAssumptions).toHaveLength(1)
      expect(summary!.unresolvedTensions).toHaveLength(1)
    })

    it('limits executive bullets to 10', () => {
      const bullets = Array.from({ length: 15 }, (_, i) => `Bullet ${i + 1}`)
      const output = JSON.stringify({
        executive: bullets,
        keyClaims: [],
        keyAssumptions: [],
        unresolvedTensions: [],
      })

      const summary = parsePhaseSummary('trend_scanning', output)
      expect(summary!.executive).toHaveLength(10)
    })

    it('limits keyClaims to 15', () => {
      const claims = Array.from({ length: 20 }, (_, i) => ({
        id: `CLM-${i}`,
        summary: `Claim ${i}`,
        confidence: 0.5,
      }))
      const output = JSON.stringify({
        executive: [],
        keyClaims: claims,
        keyAssumptions: [],
        unresolvedTensions: [],
      })

      const summary = parsePhaseSummary('decomposition', output)
      expect(summary!.keyClaims).toHaveLength(15)
    })

    it('returns null for invalid JSON', () => {
      expect(parsePhaseSummary('decomposition', 'not json')).toBeNull()
    })
  })

  describe('buildFallbackSummary', () => {
    it('creates summary from raw claims and assumptions', () => {
      const claims = [
        {
          id: 'CLM-001',
          text: 'High confidence claim',
          type: 'causal' as const,
          confidence: 0.9,
          confidenceBasis: 'data' as const,
          assumptions: [],
          dependencies: [],
          axiomRefs: [],
          evidenceIds: [],
          sourceIds: [],
          createdBy: 'test',
          phase: 1,
          createdAtMs: Date.now(),
        },
        {
          id: 'CLM-002',
          text: 'Low confidence claim',
          type: 'descriptive' as const,
          confidence: 0.3,
          confidenceBasis: 'speculative' as const,
          assumptions: [],
          dependencies: [],
          axiomRefs: [],
          evidenceIds: [],
          sourceIds: [],
          createdBy: 'test',
          phase: 1,
          createdAtMs: Date.now(),
        },
      ]
      const assumptions = [
        {
          id: 'ASM-001',
          statement: 'Test assumption',
          type: 'regulatory' as const,
          sensitivity: 'high' as const,
          observables: ['FDA announcements'],
          confidence: 0.6,
        },
      ]

      const summary = buildFallbackSummary('decomposition', claims, assumptions)
      expect(summary.phase).toBe('decomposition')
      expect(summary.executive).toHaveLength(3)
      expect(summary.keyClaims).toHaveLength(2)
      expect(summary.keyClaims[0].id).toBe('CLM-001') // Sorted by confidence desc
      expect(summary.keyAssumptions).toHaveLength(1)
    })
  })

  describe('formatPhaseSummariesForContext', () => {
    it('returns empty string for no summaries', () => {
      expect(formatPhaseSummariesForContext([])).toBe('')
    })

    it('formats summaries as markdown', () => {
      const summaries = [
        {
          phase: 'decomposition' as const,
          executive: ['Found 10 claims'],
          keyClaims: [{ id: 'CLM-001', summary: 'Test', confidence: 0.8 }],
          keyAssumptions: [],
          unresolvedTensions: ['Open question 1'],
          tokenCount: 200,
        },
      ]

      const output = formatPhaseSummariesForContext(summaries)
      expect(output).toContain('## Prior Phase Context')
      expect(output).toContain('### decomposition')
      expect(output).toContain('CLM-001')
      expect(output).toContain('Unresolved')
    })
  })
})

// ----- Oracle Graph Integration Tests -----

describe('Oracle Graph Integration', () => {
  const mockExecuteAgent = vi.mocked(executeAgentWithEvents)
  const mockCreateCouncilPipeline = vi.mocked(createExpertCouncilPipeline)

  beforeEach(() => {
    vi.clearAllMocks()
    stepCounter = 0
    mockSerpSearchTool.execute.mockReset()
    mockSerpSearchTool.execute.mockImplementation(async (params: Record<string, unknown>) => {
      const query = String(params.query ?? '')
      return {
        results: [
          {
            title: `Result for ${query}`,
            snippet: `Evidence snippet for ${query}`,
            url: `https://example.com/${encodeURIComponent(query)}`,
            source: 'Example Source',
            date: '2026-01-01',
          },
        ],
      }
    })
    mockCreateCouncilPipeline.mockReturnValue({
      execute: vi.fn().mockResolvedValue(makeCouncilTurn()),
    } as ReturnType<typeof createExpertCouncilPipeline>)
  })

  /**
   * Set up mock responses for the full Oracle pipeline.
   * Each call to executeAgentWithEvents returns a structured JSON response
   * appropriate for that node in the graph.
   */
  function setupFullPipelineNodeResponse(nodeId: string) {
    switch (nodeId) {
      case 'context_gathering':
        return mockStep(
          JSON.stringify({
            scope: {
              topic: 'AI impact on healthcare',
              domain: 'technology',
              timeHorizon: '5 years',
              geography: 'global',
              decisionContext: 'Strategic planning for a hospital network',
              boundaries: {
                inScope: ['AI diagnostics', 'telemedicine'],
                outOfScope: ['administrative AI'],
              },
            },
            searchPlan: {
              technological: ['AI diagnostics trends 2026', 'healthcare AI regulation'],
              social: ['patient trust in AI diagnostics'],
            },
          })
        )

      case 'decomposer':
        return mockStep(
          JSON.stringify({
            claims: [
              {
                id: 'CLM-001',
                text: 'AI will reduce diagnostic errors by 30% in radiology',
                type: 'causal',
                confidence: 0.75,
                axiomRefs: ['AXM-045'],
                evidenceIds: ['E1'],
                sourceIds: ['S1'],
                createdAtMs: Date.now(),
              },
              {
                id: 'CLM-002',
                text: 'Regulatory approval timelines will slow AI adoption',
                type: 'constraint',
                confidence: 0.8,
                axiomRefs: ['AXM-036'],
                evidenceIds: ['E2'],
                sourceIds: ['S2'],
                createdAtMs: Date.now(),
              },
              {
                id: 'CLM-003',
                text: 'Patient trust remains a barrier',
                type: 'descriptive',
                confidence: 0.6,
                axiomRefs: ['AXM-022'],
                evidenceIds: [],
                sourceIds: [],
                createdAtMs: Date.now(),
              },
            ],
            assumptions: [
              {
                id: 'ASM-001',
                statement: 'Regulatory framework will be updated within 2 years',
                sensitivity: 'high',
                justification: 'Current proposals',
                impactIfWrong: 'Timeline shifts',
                monitoringSignals: ['FDA announcements'],
              },
            ],
          })
        )

      case 'systems_mapper':
        return mockStep(
          JSON.stringify({
            nodes: [
              { id: 'N1', type: 'principle', label: 'AI Diagnostic Accuracy', metadata: {} },
              { id: 'N2', type: 'constraint', label: 'Regulatory Approval', metadata: {} },
              { id: 'N3', type: 'trend', label: 'Patient Trust', metadata: {} },
            ],
            edges: [
              { id: 'E1', source: 'N1', target: 'N2', type: 'constrained_by', weight: 0.8 },
              { id: 'E2', source: 'N3', target: 'N1', type: 'influences', weight: 0.6 },
            ],
            loops: [
              {
                id: 'L1',
                nodeIds: ['N1', 'N3'],
                type: 'reinforcing',
                label: 'Trust-adoption loop',
              },
            ],
          })
        )

      case 'verifier':
        return mockStep(
          JSON.stringify({
            verifiedClaims: [
              { claimId: 'CLM-001', adjustedConfidence: 0.7 },
              { claimId: 'CLM-002', adjustedConfidence: 0.85 },
            ],
            axiomGroundingPercent: 0.67,
          })
        )

      case 'gate_a':
      case 'gate_b':
      case 'gate_c':
        return mockStep(
          JSON.stringify({
            mechanisticClarity: 4,
            completeness: 4,
            causalDiscipline: 4,
            decisionUsefulness: 4.5,
            uncertaintyHygiene: 4,
            evidenceQuality: 4,
          })
        )

      case 'phase_1_summary':
      case 'phase_2_summary':
        return mockStep(
          JSON.stringify({
            executive: ['Phase completed successfully', 'Key findings identified'],
            keyClaims: [{ id: 'CLM-001', summary: 'AI diagnostics', confidence: 0.7 }],
            keyAssumptions: [
              { id: 'ASM-001', statement: 'Regulatory update', sensitivity: 'high' },
            ],
            unresolvedTensions: ['Regulatory timeline uncertainty'],
          })
        )

      case 'scanner':
        return mockStep(
          JSON.stringify({
            trends: [
              {
                id: 'TRD-001',
                statement: 'Generative AI in medical imaging',
                steepCategory: 'technological',
                direction: 'rising',
                momentum: 'accelerating',
                impactScore: 0.9,
                uncertaintyScore: 0.4,
                evidenceIds: [],
                causalLinks: [],
                secondOrderEffects: [],
              },
              {
                id: 'TRD-002',
                statement: 'Remote patient monitoring adoption',
                steepCategory: 'social',
                direction: 'rising',
                momentum: 'steady',
                impactScore: 0.7,
                uncertaintyScore: 0.3,
                evidenceIds: [],
                causalLinks: [],
                secondOrderEffects: [],
              },
            ],
          })
        )

      case 'impact_assessor':
        return mockStep(
          JSON.stringify({
            crossImpactMatrix: [
              { sourceId: 'TRD-001', targetId: 'TRD-002', effect: 'increases', strength: 0.7 },
            ],
            criticalUncertainties: [
              {
                id: 'UNC-001',
                variable: 'Regulatory approval speed',
                states: ['fast', 'slow', 'blocked'],
                currentAssessment: 'slow',
                impactScore: 0.9,
              },
              {
                id: 'UNC-002',
                variable: 'AI reliability maturity',
                states: ['mature', 'improving', 'stagnant'],
                currentAssessment: 'improving',
                impactScore: 0.8,
              },
            ],
          })
        )

      case 'weak_signal_hunter':
        return mockStep(
          JSON.stringify({
            weakSignals: [
              {
                id: 'WS-001',
                statement: 'Patient-led AI diagnostics via consumer devices',
                category: 'technological',
                potentialImpact: 0.6,
                confidence: 0.3,
              },
            ],
          })
        )

      case 'equilibrium_analyst':
        return mockStep(
          JSON.stringify({
            selectedSkeletons: ['SK-1', 'SK-2', 'SK-3'],
            candidateSkeletons: [
              {
                id: 'SK-1',
                premise: { regulation: 'fast', reliability: 'mature' },
                consistency: 0.8,
                plausibility: 0.7,
                divergence: 0.6,
              },
              {
                id: 'SK-2',
                premise: { regulation: 'slow', reliability: 'improving' },
                consistency: 0.9,
                plausibility: 0.8,
                divergence: 0.5,
              },
              {
                id: 'SK-3',
                premise: { regulation: 'blocked', reliability: 'stagnant' },
                consistency: 0.7,
                plausibility: 0.4,
                divergence: 0.9,
              },
            ],
          })
        )

      case 'scenario_developer':
        return mockStep(
          JSON.stringify({
            scenarios: [
              {
                id: 'SCN-001',
                name: 'AI Healthcare Revolution',
                narrative: 'Fast regulatory approval enables rapid AI adoption in hospitals...',
                signposts: ['FDA fast-track announcement', 'Major hospital AI pilot'],
                tailRisks: ['AI misdiagnosis scandal'],
                plausibilityScore: 0.7,
                divergenceScore: 0.6,
              },
              {
                id: 'SCN-002',
                name: 'Cautious Integration',
                narrative: 'Slow but steady adoption with regulatory caution...',
                signposts: ['Incremental FDA guidelines', 'Academic validation studies'],
                tailRisks: ['Competitor nations leapfrog'],
                plausibilityScore: 0.8,
                divergenceScore: 0.5,
              },
              {
                id: 'SCN-003',
                name: 'AI Winter in Healthcare',
                narrative: 'Regulatory blockage and a high-profile failure freeze AI adoption...',
                signposts: ['Major AI diagnostic failure', 'Congressional hearings'],
                tailRisks: ['Brain drain to less regulated markets'],
                plausibilityScore: 0.4,
                divergenceScore: 0.9,
              },
            ],
          })
        )

      case 'red_team':
        return mockStep(
          JSON.stringify({
            assessments: [
              {
                scenarioId: 'SCN-001',
                tailRisks: ['Overreliance risk', 'Equity gaps in AI access'],
                overallRobustness: 'moderate',
              },
              {
                scenarioId: 'SCN-002',
                tailRisks: ['Innovation stagnation'],
                overallRobustness: 'high',
              },
              {
                scenarioId: 'SCN-003',
                tailRisks: ['Self-fulfilling pessimism'],
                overallRobustness: 'low',
              },
            ],
          })
        )

      case 'backcasting':
        return mockStep(
          JSON.stringify({
            backcastTimelines: [
              {
                scenarioId: 'SCN-001',
                milestones: [{ year: 2027, event: 'FDA fast-track program' }],
              },
            ],
            strategicMoves: [
              {
                id: 'SM-001',
                type: 'no_regret',
                description: 'Invest in AI training for radiologists',
                timing: 'immediate',
                scenarioIds: ['SCN-001', 'SCN-002'],
              },
              {
                id: 'SM-002',
                type: 'option_to_buy',
                description: 'Partner with AI diagnostics startups',
                timing: '6-12 months',
                scenarioIds: ['SCN-001'],
              },
              {
                id: 'SM-003',
                type: 'hedge',
                description: 'Maintain manual diagnostic capacity',
                timing: 'ongoing',
                scenarioIds: ['SCN-003'],
              },
            ],
          })
        )

      default:
        return mockStep(`Default output for ${nodeId}`)
    }
  }

  function setupFullPipelineMocks() {
    // Track which node we're in by call count
    let callCount = 0

    mockExecuteAgent.mockImplementation(async (_agent, _goal, _ctx, _execCtx, opts) => {
      callCount++
      const nodeId = opts?.nodeId ?? `unknown-${callCount}`
      return setupFullPipelineNodeResponse(nodeId)
    })
  }

  it('executes full pipeline and produces scenarios', async () => {
    setupFullPipelineMocks()

    const config = makeGraphConfig()
    const result = await executeOracleWorkflowLangGraph(
      config,
      'How will AI transform healthcare diagnostics in the next 5 years?',
      {}
    )

    expect(result.status).toBe('completed')
    expect(result.output).toContain('Oracle Scenario Planning Report')
    expect(result.scenarioPortfolio.length).toBeGreaterThanOrEqual(3)
    expect(result.gateResults.length).toBe(3) // Gates A, B, C
    expect(result.phaseSummaries.length).toBe(2) // Phase 1 + Phase 2 summaries
    expect(result.claims.length).toBeGreaterThan(0)
    expect(result.trends.length).toBeGreaterThan(0)
    expect(result.uncertainties.length).toBeGreaterThan(0)
    expect(result.strategicMoves.length).toBeGreaterThan(0)
    expect(result.totalTokensUsed).toBeGreaterThan(0)
    expect(result.totalEstimatedCost).toBeGreaterThan(0)
  })

  it('all 3 gates are evaluated', async () => {
    setupFullPipelineMocks()

    const config = makeGraphConfig()
    const result = await executeOracleWorkflowLangGraph(config, 'Test goal', {})

    const gateTypes = result.gateResults.map((g) => g.gateType)
    expect(gateTypes).toContain('gate_a')
    expect(gateTypes).toContain('gate_b')
    expect(gateTypes).toContain('gate_c')
    result.gateResults.forEach((g) => {
      expect(g.passed).toBe(true)
      expect(g.scores).toBeDefined()
    })
  })

  it('KG has nodes and edges after systems mapper', async () => {
    setupFullPipelineMocks()

    const config = makeGraphConfig()
    const result = await executeOracleWorkflowLangGraph(config, 'Test goal', {})

    expect(result.knowledgeGraph.nodes.length).toBe(3)
    expect(result.knowledgeGraph.edges.length).toBe(2)
    expect(result.knowledgeGraph.loops.length).toBe(1)
  })

  it('cost tracker accumulates across phases', async () => {
    setupFullPipelineMocks()

    const config = makeGraphConfig()
    const result = await executeOracleWorkflowLangGraph(config, 'Test goal', {})

    expect(result.costTracker.total).toBeGreaterThan(0)
    expect(Object.keys(result.costTracker.byPhase).length).toBeGreaterThan(0)
    expect(result.costTracker.byComponent.llm).toBeGreaterThan(0)
    expect(result.costTracker.byComponent.evaluation).toBeGreaterThan(0)
  })

  it('scenarios include red team tail risks', async () => {
    setupFullPipelineMocks()

    const config = makeGraphConfig()
    const result = await executeOracleWorkflowLangGraph(config, 'Test goal', {})

    // Red team adds tail risks to existing scenarios
    const firstScenario = result.scenarioPortfolio[0]
    expect(firstScenario.tailRisks.length).toBeGreaterThanOrEqual(1)
  })

  it('output includes scope, statistics, and strategic moves', async () => {
    setupFullPipelineMocks()

    const config = makeGraphConfig()
    const result = await executeOracleWorkflowLangGraph(config, 'Test goal', {})

    expect(result.output).toContain('Scope')
    expect(result.output).toContain('Key Statistics')
    expect(result.output).toContain('Strategic Moves')
    expect(result.output).toContain('no_regret')
  })

  it('falls back to a synthetic Phase 1 summary and marks degradation when summary parsing fails', async () => {
    let callCount = 0
    mockExecuteAgent.mockImplementation(async (_agent, _goal, _ctx, _execCtx, opts) => {
      callCount++
      const nodeId = opts?.nodeId ?? `unknown-${callCount}`
      if (nodeId === 'phase_1_summary') {
        return mockStep('not json')
      }
      return setupFullPipelineNodeResponse(nodeId)
    })

    const config = makeGraphConfig()
    const result = await executeOracleWorkflowLangGraph(config, 'Test goal', {})

    expect(result.status).toBe('completed')
    expect(result.degradedPhases).toContain('phase_1_summary')
    expect(result.phaseSummaries).toHaveLength(2)
    expect(result.phaseSummaries[0]?.phase).toBe('decomposition')
    expect(result.phaseSummaries[0]?.executive[0]).toContain('Phase decomposition produced')
  })

  it('falls back to a synthetic Phase 2 summary and marks degradation when summary parsing fails', async () => {
    let callCount = 0
    mockExecuteAgent.mockImplementation(async (_agent, _goal, _ctx, _execCtx, opts) => {
      callCount++
      const nodeId = opts?.nodeId ?? `unknown-${callCount}`
      if (nodeId === 'phase_2_summary') {
        return mockStep('not json')
      }
      return setupFullPipelineNodeResponse(nodeId)
    })

    const config = makeGraphConfig()
    const result = await executeOracleWorkflowLangGraph(config, 'Test goal', {})

    expect(result.status).toBe('completed')
    expect(result.degradedPhases).toContain('phase_2_summary')
    expect(result.phaseSummaries).toHaveLength(2)
    expect(result.phaseSummaries[1]?.phase).toBe('trend_scanning')
    expect(result.phaseSummaries[1]?.executive[0]).toContain('Phase trend_scanning identified')
  })

  it('calls executeAgentWithEvents for each node', async () => {
    setupFullPipelineMocks()

    const config = makeGraphConfig()
    await executeOracleWorkflowLangGraph(config, 'Test goal', {})

    // 17 nodes total. final_output doesn't call executeAgentWithEvents → 16 calls.
    // context_gathering, decomposer, systems_mapper, verifier, gate_a,
    // phase_1_summary, scanner, impact_assessor, weak_signal_hunter, gate_b,
    // phase_2_summary, equilibrium_analyst, scenario_developer, red_team,
    // gate_c, backcasting = 16
    expect(mockExecuteAgent).toHaveBeenCalledTimes(16)
  })

  it('passes Phase 0 evidence into decomposition, mapping, and verification', async () => {
    const capturedPrompts: Record<string, string> = {}
    const capturedContexts: Record<string, unknown> = {}

    mockExecuteAgent.mockImplementation(async (agent, _goal, ctx, _execCtx, opts) => {
      const nodeId = opts?.nodeId ?? 'unknown'
      capturedPrompts[nodeId] = agent.systemPrompt
      capturedContexts[nodeId] = ctx
      return setupFullPipelineNodeResponse(nodeId)
    })

    const result = await executeOracleWorkflowLangGraph(makeGraphConfig(), 'Test goal', {})

    expect(result.status).toBe('completed')
    expect(result.evidence.length).toBeGreaterThan(0)
    expect(capturedPrompts.decomposer).toContain('## Phase 0 Evidence')
    expect(capturedPrompts.systems_mapper).toContain('## Phase 0 Evidence')
    expect(capturedPrompts.verifier).toContain('## Phase 0 Evidence')
    expect(capturedContexts.decomposer).toMatchObject({ evidence: result.evidence })
    expect(capturedContexts.systems_mapper).toMatchObject({ evidence: result.evidence })
    expect(capturedContexts.verifier).toMatchObject({ evidence: result.evidence })
  })

  it('continues with partial evidence when one search query fails and marks degradation', async () => {
    setupFullPipelineMocks()
    mockSerpSearchTool.execute
      .mockImplementationOnce(async () => ({ results: [] }))
      .mockImplementation(async (params: Record<string, unknown>) => {
        const query = String(params.query ?? '')
        return {
          results: [
            {
              title: `Result for ${query}`,
              snippet: `Evidence snippet for ${query}`,
              url: `https://example.com/${encodeURIComponent(query)}`,
              source: 'Example Source',
              date: '2026-01-01',
            },
          ],
        }
      })

    const result = await executeOracleWorkflowLangGraph(makeGraphConfig(), 'Test goal', {})

    expect(result.status).toBe('completed')
    expect(result.degradedPhases).toContain('evidence_gathering')
    expect(result.evidence.length).toBeGreaterThan(0)
  })

  it('recovers complete decomposer claims from truncated JSON instead of falling back to empty output', async () => {
    const verifierContexts: unknown[] = []
    let decomposerCallCount = 0

    mockExecuteAgent.mockImplementation(async (_agent, _goal, ctx, _execCtx, opts) => {
      const nodeId = opts?.nodeId ?? 'unknown'

      if (nodeId === 'decomposer') {
        decomposerCallCount++
        if (decomposerCallCount === 1) {
          return mockStep(`{
  "claims": [
    {
      "id": "CLM-REC-001",
      "type": "causal",
      "text": "AI agents reduce implementation time for horizontal SaaS vendors.",
      "confidence": 0.76,
      "confidenceBasis": "expert_judgment",
      "assumptions": ["ASM-REC-001"],
      "evidenceIds": ["EVD-001"],
      "dependencies": [],
      "axiomRefs": ["AXM-011"],
      "createdBy": "decomposer:test",
      "phase": 1
    },
    {
      "id": "CLM-REC-002",
      "type": "forecast",
      "text": "Incumbents with weak switching-cost moats will face pricing pressure.",
      "confidence": 0.71,
      "confidenceBasis": "expert_judgment",
      "assumptions": ["ASM-REC-001"],
      "evidenceIds": ["EVD-002"],
      "dependencies": ["CLM-REC-001"],
      "axiomRefs": ["AXM-012"],
      "createdBy": "decomposer:test",
      "phase": 1
    }
  ],
  "assumptions": [
    {
      "id": "ASM-REC-001",
      "type": "technical",
      "statement": "Coding-agent quality continues improving over the horizon.",
      "sensitivity": "high",
      "observables": ["Benchmark improvements"],
      "confidence": 0.66
    }
  ]
`)
        }

        if (decomposerCallCount === 2) {
          return mockStep('not json')
        }

        return mockStep('{"claims":[],"assumptions":[]}')
      }

      if (nodeId === 'json_repair') {
        return mockStep('not json')
      }

      if (nodeId === 'verifier') {
        verifierContexts.push(ctx)
      }

      return setupFullPipelineNodeResponse(nodeId)
    })

    const result = await executeOracleWorkflowLangGraph(makeGraphConfig(), 'Test goal', {})

    expect(result.status).toBe('completed')
    expect(result.degradedPhases).toContain('decomposer_partial_recovery')
    expect(result.claims.find((claim) => claim.id === 'CLM-REC-001')).toBeDefined()
    expect(result.claims.find((claim) => claim.id === 'CLM-REC-002')).toBeDefined()
    expect(verifierContexts).toHaveLength(1)
    expect(verifierContexts[0]).toMatchObject({
      claims: expect.arrayContaining([
        expect.objectContaining({ id: 'CLM-REC-001' }),
        expect.objectContaining({ id: 'CLM-REC-002' }),
      ]),
    })
  })

  it('selects a later unique search result when top hits duplicate prior evidence', async () => {
    mockSerpSearchTool.execute.mockImplementation(async (params: Record<string, unknown>) => {
      const query = String(params.query ?? '')
      return {
        results: [
          {
            title: 'Repeated top result',
            snippet: `Duplicate snippet for ${query}`,
            url: 'https://duplicate.example.com/shared',
            source: 'Duplicate Source',
            date: '2026-01-01',
          },
          {
            title: `Unique result for ${query}`,
            snippet: `Unique snippet for ${query}`,
            url: `https://unique-${encodeURIComponent(query)}.example.com/article`,
            source: `Unique Source ${query}`,
            date: '2026-01-02',
          },
        ],
      }
    })

    const { evidence, failedQueries } = await collectEvidenceFromSearchPlan(
      {
        technological: ['coding agents moat shift'],
        economic: ['software margin compression AI'],
      },
      {
        toolRegistry: new Map([['serp_search', mockSerpSearchTool]]),
        searchToolKeys: { serper: 'test-serper-key' },
        userId: 'user-test',
        workflow: makeGraphConfig().workflow,
        runId: 'run-test',
      }
    )

    expect(failedQueries).toEqual([])
    expect(evidence).toHaveLength(2)
    expect(evidence[0]?.url).toBe('https://duplicate.example.com/shared')
    expect(evidence[1]?.url).not.toBe('https://duplicate.example.com/shared')
    expect(evidence[1]?.url).toContain('https://unique-')
  })

  it('handles graph initialization failure gracefully', async () => {
    // Invalid config that causes graph construction to fail
    const config = makeGraphConfig()
    // Sabotage the workflow to trigger init error
    Object.defineProperty(config, 'oracleConfig', {
      get() {
        throw new Error('Config explosion')
      },
    })

    const result = await executeOracleWorkflowLangGraph(config, 'Test goal', {})

    expect(result.status).toBe('failed')
    expect(result.output).toContain('initialization failed')
  })

  it('handles execution failure gracefully', async () => {
    // Mock that throws during execution
    mockExecuteAgent.mockRejectedValueOnce(new Error('Provider timeout'))

    const config = makeGraphConfig()
    const result = await executeOracleWorkflowLangGraph(config, 'Test goal', {})

    expect(result.status).toBe('failed')
    expect(result.output).toContain('execution failed')
  })

  it('weak signals are added to trends', async () => {
    setupFullPipelineMocks()

    const config = makeGraphConfig()
    const result = await executeOracleWorkflowLangGraph(config, 'Test goal', {})

    // Scanner produces 2 trends, weak signal hunter adds 1 more
    expect(result.trends.length).toBe(3)
    const weakSignal = result.trends.find((t) => t.id === 'WS-001')
    expect(weakSignal).toBeDefined()
  })

  it('normalizes weak signal category variants into STEEP buckets', async () => {
    setupFullPipelineMocks()
    mockExecuteAgent.mockImplementation(async (_agent, _goal, _ctx, _execCtx, opts) => {
      const nodeId = opts?.nodeId ?? 'unknown'
      if (nodeId === 'weak_signal_hunter') {
        return mockStep(
          JSON.stringify({
            weakSignals: [
              {
                id: 'WS-ALT-1',
                statement: 'Ecology pressure signal',
                category: 'ecological',
                potentialImpact: 0.6,
                confidence: 0.4,
              },
              {
                id: 'WS-ALT-2',
                statement: 'Cross-domain governance signal',
                category: 'socio-political',
                potentialImpact: 0.5,
                confidence: 0.5,
              },
            ],
          })
        )
      }
      return setupFullPipelineNodeResponse(nodeId)
    })

    const result = await executeOracleWorkflowLangGraph(makeGraphConfig(), 'Test goal', {})

    expect(result.trends.find((t) => t.id === 'WS-ALT-1')?.steepCategory).toBe('environmental')
    expect(result.trends.find((t) => t.id === 'WS-ALT-2')?.steepCategory).toBe('political')
  })

  it('verifier adjusts claim confidences', async () => {
    setupFullPipelineMocks()

    const config = makeGraphConfig()
    const result = await executeOracleWorkflowLangGraph(config, 'Test goal', {})

    // CLM-001 was 0.75, verifier adjusts to 0.7
    const claim1 = result.claims.find((c) => c.id === 'CLM-001')
    expect(claim1).toBeDefined()
    expect(claim1!.confidence).toBe(0.7)

    // CLM-002 was 0.8, verifier adjusts to 0.85
    const claim2 = result.claims.find((c) => c.id === 'CLM-002')
    expect(claim2).toBeDefined()
    expect(claim2!.confidence).toBe(0.85)
  })

  it('human gate pauses when enabled', async () => {
    setupFullPipelineMocks()

    const config = makeGraphConfig({ enableHumanGate: true })
    const result = await executeOracleWorkflowLangGraph(config, 'Test goal', {})

    // Pipeline should pause at human_gate, not reach Phase 3
    expect(result.status).toBe('waiting_for_input')
    expect(result.pendingInput).toBeDefined()
    expect(result.pendingInput?.nodeId).toBe('human_gate')
    expect(result.pendingInput?.prompt).toContain('critical uncertainties')
    // Should have completed through Phase 2 but not Phase 3
    expect(result.scenarioPortfolio.length).toBe(0) // Phase 3 not reached
    expect(result.trends.length).toBeGreaterThan(0) // Phase 2 completed
  })

  it('resumes after human gate without restarting earlier phases', async () => {
    setupFullPipelineMocks()

    const config = makeGraphConfig({ enableHumanGate: true })
    const paused = await executeOracleWorkflowLangGraph(config, 'Test goal', {})

    expect(paused.status).toBe('waiting_for_input')
    const workflowState = paused.workflowState as Record<string, unknown>
    const resumeState = workflowState.oracleResumeState as Record<string, unknown> | undefined
    expect(resumeState).toBeDefined()
    expect((resumeState?.claims as unknown[] | undefined)?.length).toBe(paused.claims.length)
    expect((resumeState?.trends as unknown[] | undefined)?.length).toBe(paused.trends.length)
    expect((resumeState?.crossImpactMatrix as unknown[] | undefined)?.length).toBe(
      paused.crossImpactMatrix.length
    )
    expect(resumeState?.status).toBe('waiting_for_input')
    expect((resumeState?.costTracker as { total?: number } | undefined)?.total).toBe(
      paused.costTracker.total
    )

    const resumedNodeIds: string[] = []
    mockExecuteAgent.mockImplementation(async (_agent, _goal, _ctx, _execCtx, opts) => {
      const nodeId = opts?.nodeId ?? 'unknown'
      resumedNodeIds.push(nodeId)

      switch (nodeId) {
        case 'equilibrium_analyst':
          return mockStep(
            JSON.stringify({
              selectedSkeletons: ['SK-1'],
              candidateSkeletons: [
                {
                  id: 'SK-1',
                  premise: { regulation: 'slow' },
                  consistency: 0.9,
                  plausibility: 0.8,
                  divergence: 0.5,
                },
              ],
            })
          )

        case 'scenario_developer':
          return mockStep(
            JSON.stringify({
              scenarios: [
                {
                  id: 'SCN-001',
                  name: 'Resumed Scenario',
                  premise: { regulation: 'slow' },
                  narrative: 'Scenario development resumed from the human gate.',
                  reinforcedPrinciples: [],
                  disruptedPrinciples: [],
                  feedbackLoops: [],
                  implications: 'Resumed implications',
                  signposts: ['Resumed signpost'],
                  tailRisks: ['Resumed tail risk'],
                  assumptionRegister: [],
                  councilAssessment: { agreementRate: 0, persistentDissent: [] },
                  plausibilityScore: 0.8,
                  divergenceScore: 0.5,
                },
              ],
            })
          )

        case 'red_team':
          return mockStep(
            JSON.stringify({
              assessments: [
                {
                  scenarioId: 'SCN-001',
                  tailRisks: ['Red-team risk'],
                  overallRobustness: 'medium',
                },
              ],
            })
          )

        case 'gate_c':
          return mockStep(
            JSON.stringify({
              mechanisticClarity: 4,
              completeness: 4,
              causalDiscipline: 4,
              decisionUsefulness: 4.5,
              uncertaintyHygiene: 4,
              evidenceQuality: 4,
            })
          )

        case 'backcasting':
          return mockStep(
            JSON.stringify({
              backcastTimelines: [
                {
                  scenarioId: 'SCN-001',
                  targetYear: '2030',
                  milestones: [{ year: '2028', event: 'Pilot launch', prerequisites: [] }],
                  strategicMoves: [],
                },
              ],
              strategicMoves: [
                {
                  type: 'no_regret',
                  description: 'Start pilot program',
                  worksAcross: ['SCN-001'],
                  timing: 'now',
                  ledgerRefs: [],
                },
              ],
            })
          )

        default:
          throw new Error(`Unexpected node during resume: ${nodeId}`)
      }
    })

    const resumed = await executeOracleWorkflowLangGraph(
      config,
      'Test goal',
      {},
      resumeState as never
    )

    expect(resumed.status).toBe('completed')
    expect(resumedNodeIds).toEqual([
      'equilibrium_analyst',
      'scenario_developer',
      'red_team',
      'gate_c',
      'backcasting',
    ])
    expect(resumed.claims).toEqual(paused.claims)
    expect(resumed.trends).toEqual(paused.trends)
    expect(resumed.uncertainties).toEqual(paused.uncertainties)
    expect(resumed.crossImpactMatrix).toEqual(paused.crossImpactMatrix)
    expect(resumed.costTracker.total).toBeGreaterThan(paused.costTracker.total)
    expect(resumed.output).toContain('Resumed Scenario')
  })

  it('resumes directly at backcasting for late-phase budget pauses', async () => {
    const resumedNodeIds: string[] = []
    mockExecuteAgent.mockImplementation(async (_agent, _goal, _ctx, _execCtx, opts) => {
      const nodeId = opts?.nodeId ?? 'unknown'
      resumedNodeIds.push(nodeId)

      if (nodeId !== 'backcasting') {
        throw new Error(`Unexpected node during late resume test: ${nodeId}`)
      }

      return mockStep(
        JSON.stringify({
          backcastTimelines: [
            {
              scenarioId: 'SCN-001',
              targetYear: '2030',
              milestones: [{ year: '2028', event: 'Pilot launch', prerequisites: [] }],
              strategicMoves: [],
            },
          ],
          strategicMoves: [
            {
              type: 'no_regret',
              description: 'Launch the pilot program',
              worksAcross: ['SCN-001'],
              timing: 'now',
              ledgerRefs: [],
            },
          ],
        })
      )
    })

    const resumed = await executeOracleWorkflowLangGraph(makeGraphConfig(), 'Test goal', {}, {
      currentPhase: 'scenario_simulation',
      status: 'paused',
      constraintPause: {
        constraintType: 'budget',
        currentValue: 1,
        limitValue: 1,
        unit: 'USD',
        partialOutput: 'Paused before backcasting',
      },
      degradedPhases: ['backcasting'],
      resumeNodeHint: 'backcasting',
      scope: {
        topic: 'AI impact on healthcare',
        domain: 'technology',
        timeHorizon: '5 years',
        geography: 'global',
        decisionContext: 'Strategic planning',
        boundaries: { inScope: ['AI diagnostics'], outOfScope: [] },
      },
      scenarioPortfolio: [
        {
          id: 'SCN-001',
          name: 'Paused Scenario',
          premise: { regulation: 'slow' },
          narrative: 'Scenario already developed before pause.',
          reinforcedPrinciples: [],
          disruptedPrinciples: [],
          feedbackLoops: [],
          implications: 'Prior implications',
          signposts: ['Pilot signal'],
          tailRisks: ['Execution risk'],
          assumptionRegister: [],
          councilAssessment: { agreementRate: 0, persistentDissent: [] },
          plausibilityScore: 0.8,
          divergenceScore: 0.5,
        },
      ],
      phaseSummaries: [
        {
          phase: 'decomposition',
          executive: ['Decomposition done'],
          keyClaims: [],
          keyAssumptions: [],
          unresolvedTensions: [],
          tokenCount: 100,
        },
        {
          phase: 'trend_scanning',
          executive: ['Trend scan done'],
          keyClaims: [],
          keyAssumptions: [],
          unresolvedTensions: [],
          tokenCount: 100,
        },
      ],
      gateResults: [],
      claims: [],
      assumptions: [],
      evidence: [],
      knowledgeGraph: { nodes: [], edges: [], loops: [] },
      trends: [],
      uncertainties: [],
      crossImpactMatrix: [],
      backcastTimelines: [],
      strategicMoves: [],
      councilRecords: [],
      costTracker: {
        total: 0.01,
        byPhase: {},
        byModel: {},
        byComponent: { search: 0, llm: 0, council: 0, evaluation: 0 },
      },
      steps: [],
      totalTokensUsed: 0,
      totalEstimatedCost: 0,
      currentGateRefinements: 0,
      gateEscalated: false,
      gateEscalationFeedback: null,
      humanGateApproved: false,
      humanGateFeedback: null,
    } as never)

    expect(resumed.status).toBe('completed')
    expect(resumedNodeIds).toEqual(['backcasting'])
    expect(resumed.output).toContain('Launch the pilot program')
  })

  it('persists human gate feedback on resume and injects it into Phase 3 prompts', async () => {
    setupFullPipelineMocks()

    const config = makeGraphConfig({ enableHumanGate: true })
    const paused = await executeOracleWorkflowLangGraph(config, 'Test goal', {})
    const workflowState = paused.workflowState as Record<string, unknown>
    const resumeState = workflowState.oracleResumeState as Record<string, unknown> | undefined

    expect(paused.status).toBe('waiting_for_input')
    expect(resumeState).toBeDefined()

    const capturedPrompts: Record<string, string> = {}

    mockExecuteAgent.mockImplementation(async (agent, _goal, _ctx, _execCtx, opts) => {
      const nodeId = opts?.nodeId ?? 'unknown'
      capturedPrompts[nodeId] = agent.systemPrompt

      switch (nodeId) {
        case 'equilibrium_analyst':
          return mockStep(
            JSON.stringify({
              selectedSkeletons: ['SK-1'],
              candidateSkeletons: [
                {
                  id: 'SK-1',
                  premise: { disruption: 'high' },
                  consistency: 0.9,
                  plausibility: 0.7,
                  divergence: 0.8,
                },
              ],
            })
          )
        case 'scenario_developer':
          return mockStep(
            JSON.stringify({
              scenarios: [
                {
                  id: 'SCN-001',
                  name: 'AI Disruption Scenario',
                  premise: { disruption: 'high' },
                  narrative: 'A disruption-focused scenario.',
                  reinforcedPrinciples: [],
                  disruptedPrinciples: [],
                  feedbackLoops: [],
                  implications: 'Disruption implications',
                  signposts: ['Disruption signpost'],
                  tailRisks: ['Disruption risk'],
                  assumptionRegister: [],
                  councilAssessment: { agreementRate: 0, persistentDissent: [] },
                  plausibilityScore: 0.7,
                  divergenceScore: 0.8,
                },
              ],
            })
          )
        case 'red_team':
          return mockStep(
            JSON.stringify({
              assessments: [
                {
                  scenarioId: 'SCN-001',
                  tailRisks: ['Follow-up risk'],
                  overallRobustness: 'moderate',
                },
              ],
            })
          )
        case 'gate_c':
          return mockStep(
            JSON.stringify({
              mechanisticClarity: 4,
              completeness: 4,
              causalDiscipline: 4,
              decisionUsefulness: 4,
              uncertaintyHygiene: 4,
              evidenceQuality: 4,
            })
          )
        case 'backcasting':
          return mockStep(
            JSON.stringify({
              backcastTimelines: [],
              strategicMoves: [],
            })
          )
        default:
          throw new Error(`Unexpected node during feedback resume test: ${nodeId}`)
      }
    })

    const resumed = await executeOracleWorkflowLangGraph(
      config,
      'Test goal',
      {
        humanApproval: {
          nodeId: 'human_gate',
          approved: true,
          response: 'Focus more on AI disruption scenarios',
        },
      },
      resumeState as never
    )

    expect(resumed.status).toBe('completed')
    expect(resumed.humanGateFeedback).toBe('Focus more on AI disruption scenarios')
    expect(capturedPrompts.equilibrium_analyst).toContain('Focus more on AI disruption scenarios')
    expect(capturedPrompts.scenario_developer).toContain('Focus more on AI disruption scenarios')
    expect(capturedPrompts.red_team).toContain('Focus more on AI disruption scenarios')
    expect(capturedPrompts.backcasting).toContain('Focus more on AI disruption scenarios')

    const resumedWorkflowState = resumed.workflowState as Record<string, unknown>
    const resumedState = resumedWorkflowState.oracleResumeState as
      | Record<string, unknown>
      | undefined
    expect(resumedState?.humanGateFeedback).toBe('Focus more on AI disruption scenarios')
  })

  it('pauses early with a budget constraint once the next LLM node would exceed budget', async () => {
    setupFullPipelineMocks()
    const config = makeGraphConfig({
      oracleConfig: makeOracleConfig({ maxBudgetUsd: 0.001 }),
    })

    const result = await executeOracleWorkflowLangGraph(config, 'Test goal', {})

    expect(result.status).toBe('paused')
    expect(result.constraintPause?.constraintType).toBe('budget')
    expect(mockExecuteAgent).toHaveBeenCalledTimes(1)

    const workflowState = result.workflowState as Record<string, unknown> | undefined
    const resumeState = workflowState?.oracleResumeState as Record<string, unknown> | undefined
    expect(resumeState?.degradedPhases).toEqual(['evidence_enrichment'])
  })

  it('pauses at mid-phase LLM nodes once cumulative spend crosses budget', async () => {
    setupFullPipelineMocks()
    const config = makeGraphConfig({
      oracleConfig: makeOracleConfig({ maxBudgetUsd: 0.003 }),
    })

    const result = await executeOracleWorkflowLangGraph(config, 'Test goal', {})

    expect(result.status).toBe('paused')
    expect(result.constraintPause?.constraintType).toBe('budget')
    expect(mockExecuteAgent).toHaveBeenCalledTimes(2)

    const workflowState = result.workflowState as Record<string, unknown> | undefined
    const resumeState = workflowState?.oracleResumeState as Record<string, unknown> | undefined
    expect(resumeState?.degradedPhases).toEqual(['systems_mapper'])
  })

  it('exits the gate-c refinement loop once refinement budget is exhausted', async () => {
    const nodeIds: string[] = []
    mockExecuteAgent.mockImplementation(async (_agent, _goal, _ctx, _execCtx, opts) => {
      const nodeId = opts?.nodeId ?? 'unknown'
      nodeIds.push(nodeId)

      switch (nodeId) {
        case 'equilibrium_analyst':
          return mockStep(
            JSON.stringify({
              selectedSkeletons: ['SK-1'],
              candidateSkeletons: [
                {
                  id: 'SK-1',
                  premise: { regulation: 'slow' },
                  consistency: 0.9,
                  plausibility: 0.8,
                  divergence: 0.5,
                },
              ],
            })
          )
        case 'scenario_developer':
          return mockStep(
            JSON.stringify({
              scenarios: [
                {
                  id: 'SCN-001',
                  name: 'Escalated Scenario',
                  premise: { regulation: 'slow' },
                  narrative: 'Scenario development after exhausted refinements.',
                  reinforcedPrinciples: [],
                  disruptedPrinciples: [],
                  feedbackLoops: [],
                  implications: 'Implications',
                  signposts: ['Signpost'],
                  tailRisks: ['Tail risk'],
                  assumptionRegister: [],
                  councilAssessment: { agreementRate: 0, persistentDissent: [] },
                  plausibilityScore: 0.8,
                  divergenceScore: 0.5,
                },
              ],
            })
          )
        case 'red_team':
          return mockStep(
            JSON.stringify({
              assessments: [
                { scenarioId: 'SCN-001', tailRisks: ['Red-team risk'], overallRobustness: 'low' },
              ],
            })
          )
        case 'gate_c':
          return mockStep(
            JSON.stringify({
              mechanisticClarity: 3,
              completeness: 3,
              causalDiscipline: 3,
              decisionUsefulness: 3,
              uncertaintyHygiene: 3,
              evidenceQuality: 3,
            })
          )
        case 'backcasting':
          return mockStep(
            JSON.stringify({
              backcastTimelines: [],
              strategicMoves: [],
            })
          )
        default:
          throw new Error(`Unexpected node during exhausted refinement test: ${nodeId}`)
      }
    })

    const result = await executeOracleWorkflowLangGraph(makeGraphConfig(), 'Test goal', {}, {
      currentPhase: 'scenario_simulation',
      scope: {
        topic: 'AI impact on healthcare',
        domain: 'technology',
        timeHorizon: '5 years',
        geography: 'global',
        decisionContext: 'Strategic planning',
        boundaries: { inScope: [], outOfScope: [] },
      },
      phaseSummaries: [],
      scenarioPortfolio: [],
      currentGateRefinements: 1,
      gateResults: [],
      costTracker: {
        total: 0,
        byPhase: {},
        byModel: {},
        byComponent: { search: 0, llm: 0, council: 0, evaluation: 0 },
      },
      status: 'running',
    } as never)

    expect(result.status).toBe('waiting_for_input')
    expect(result.pendingInput?.nodeId).toBe('gate_escalation')
    expect(nodeIds.filter((id) => id === 'scenario_developer')).toHaveLength(1)
    expect(result.gateEscalated).toBe(true)
    expect(result.gateEscalationFeedback).toContain('Average score')
    expect(nodeIds).toEqual(['equilibrium_analyst', 'scenario_developer', 'red_team', 'gate_c'])
  })

  it('skips human gate when not enabled', async () => {
    setupFullPipelineMocks()

    const config = makeGraphConfig() // no enableHumanGate
    const result = await executeOracleWorkflowLangGraph(config, 'Test goal', {})

    expect(result.status).toBe('completed')
    expect(result.pendingInput).toBeUndefined()
    expect(result.scenarioPortfolio.length).toBeGreaterThan(0) // Phase 3 completed
  })

  it('council nodes are no-ops when council not configured', async () => {
    setupFullPipelineMocks()

    const config = makeGraphConfig() // no councilConfig
    const result = await executeOracleWorkflowLangGraph(config, 'Test goal', {})

    expect(result.status).toBe('completed')
    expect(result.councilRecords.length).toBe(0)
  })

  it('includes stage 2 review tokens in council token totals', async () => {
    setupFullPipelineMocks()

    const config = makeGraphConfig({
      councilConfig: {
        enabled: true,
        defaultMode: 'quick',
        allowModeOverride: true,
        councilModels: [
          { modelId: 'c1', provider: 'anthropic', modelName: 'claude-sonnet-4-20250514' },
          { modelId: 'c2', provider: 'openai', modelName: 'gpt-4o' },
        ],
        chairmanModel: {
          modelId: 'chair',
          provider: 'anthropic',
          modelName: 'claude-sonnet-4-20250514',
        },
        selfExclusionEnabled: true,
        minCouncilSize: 2,
        maxCouncilSize: 2,
        enableCaching: false,
        cacheExpirationHours: 24,
      },
    })

    const result = await executeOracleWorkflowLangGraph(config, 'Test goal', {})

    expect(result.councilRecords).toHaveLength(3)
    expect(result.totalTokensUsed).toBe(3100)
  })

  it('consistency check is no-op when not enabled', async () => {
    setupFullPipelineMocks()

    const config = makeGraphConfig() // no enableConsistencyChecker
    const result = await executeOracleWorkflowLangGraph(config, 'Test goal', {})

    expect(result.status).toBe('completed')
    // No consistency check step in the output
    const ccStep = result.steps.find((s) => s.agentId === 'consistency_checker')
    expect(ccStep).toBeUndefined()
  })
})

// ===== selectUrlsForCrawl =====

describe('selectUrlsForCrawl', () => {
  function makeEvidence(
    overrides: Partial<import('@lifeos/agents').OracleEvidence> = {}
  ): import('@lifeos/agents').OracleEvidence {
    return {
      id: 'EVD-001',
      source: 'Test Source',
      url: 'https://example.com/article',
      date: '2026-01-01',
      excerpt: 'Test excerpt about software investment.',
      reliability: 0.7,
      searchTool: 'serper',
      ...overrides,
    }
  }

  it('prioritizes domain diversity', () => {
    const evidence = [
      makeEvidence({ id: 'EVD-001', url: 'https://a.com/1', category: 'economic' }),
      makeEvidence({ id: 'EVD-002', url: 'https://a.com/2', category: 'economic' }),
      makeEvidence({ id: 'EVD-003', url: 'https://b.com/1', category: 'technological' }),
    ]
    const selected = selectUrlsForCrawl(evidence, 2)
    const domains = selected.map((e) => new URL(e.url).hostname)
    expect(new Set(domains).size).toBe(2)
  })

  it('caps at maxUrls', () => {
    const evidence = Array.from({ length: 20 }, (_, i) =>
      makeEvidence({ id: `EVD-${i}`, url: `https://domain${i}.com/page` })
    )
    expect(selectUrlsForCrawl(evidence, 6)).toHaveLength(6)
  })

  it('skips PDF URLs', () => {
    const evidence = [
      makeEvidence({ id: 'EVD-001', url: 'https://arxiv.org/paper.pdf' }),
      makeEvidence({ id: 'EVD-002', url: 'https://example.com/article' }),
    ]
    const selected = selectUrlsForCrawl(evidence, 5)
    expect(selected).toHaveLength(1)
    expect(selected[0].id).toBe('EVD-002')
  })

  it('returns empty for empty evidence', () => {
    expect(selectUrlsForCrawl([], 6)).toHaveLength(0)
  })

  it('prioritizes category diversity', () => {
    const evidence = [
      makeEvidence({
        id: 'EVD-001',
        url: 'https://a.com/1',
        category: 'economic',
        reliability: 0.9,
      }),
      makeEvidence({
        id: 'EVD-002',
        url: 'https://b.com/1',
        category: 'economic',
        reliability: 0.9,
      }),
      makeEvidence({
        id: 'EVD-003',
        url: 'https://c.com/1',
        category: 'technological',
        reliability: 0.5,
      }),
    ]
    const selected = selectUrlsForCrawl(evidence, 2)
    const categories = selected.map((e) => e.category)
    // Should pick from different categories even if reliability differs
    expect(new Set(categories).size).toBe(2)
  })

  it('prefers higher reliability within same domain/category', () => {
    const evidence = [
      makeEvidence({
        id: 'EVD-001',
        url: 'https://a.com/1',
        category: 'economic',
        reliability: 0.3,
      }),
      makeEvidence({
        id: 'EVD-002',
        url: 'https://a.com/2',
        category: 'economic',
        reliability: 0.9,
      }),
    ]
    const selected = selectUrlsForCrawl(evidence, 1)
    // Both have same domain+category so diversity bonus is equal; reliability breaks the tie
    expect(selected[0].id).toBe('EVD-002')
  })
})
