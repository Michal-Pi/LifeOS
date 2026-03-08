/**
 * Oracle Scenario Planning Workflow Graph
 *
 * LangGraph StateGraph implementing the 4-phase Oracle pipeline:
 *
 * START
 *   → context_gathering (scope parse + STEEP+V search)
 *   → decomposer → systems_mapper → verifier
 *   → gate_a ──[PASS]──→ council_gate_a (if enabled) → phase_1_summary
 *            ──[REFINE]──→ decomposer (loop, max 3)
 *            ──[ESCALATE]──→ phase_1_summary (max refinements exhausted)
 *   → scanner → impact_assessor → weak_signal_hunter
 *   → gate_b ──[PASS]──→ council_gate_b (if enabled) → phase_2_summary
 *            ──[REFINE]──→ scanner (loop)
 *   → human_gate (if enabled — pauses for user approval of critical uncertainties)
 *   → consistency_check (Tier 1+2 rule + LLM checks, if enabled)
 *   → equilibrium_analyst → scenario_developer → red_team
 *   → gate_c ──[PASS]──→ council_final (if enabled) → backcasting
 *            ──[REFINE]──→ scenario_developer (loop)
 *   → backcasting → final_output → END
 */

import { StateGraph, END, START } from '@langchain/langgraph'
import type {
  AgentConfig,
  Workflow,
  AgentExecutionStep,
  OracleRunConfig,
  OracleScope,
  OracleSearchPlan,
  OracleClaim,
  OracleAssumption,
  OracleEvidence,
  OracleKnowledgeGraph,
  TrendObject,
  UncertaintyObject,
  CrossImpactEntry,
  OracleScenario,
  BackcastTimeline,
  StrategicMove,
  OraclePhaseSummary,
  OracleGateResult,
  OracleCostTracker,
  OracleCouncilRecord,
  Run,
  RunId,
  ExpertCouncilConfig,
  ExpertCouncilTurn,
  WorkflowExecutionMode,
  ModelTier,
  WorkflowCriticality,
} from '@lifeos/agents'
import type { ProviderKeys } from '../providerService.js'
import { executeWithProvider } from '../providerService.js'
import type { RunEventWriter } from '../runEvents.js'
import type { SearchToolKeys } from '../providerKeys.js'
import type { ToolRegistry } from '../toolExecutor.js'
import { executeAgentWithEvents, type AgentExecutionContext } from './utils.js'
import { OracleStateAnnotation, type OracleState } from './oracleStateAnnotation.js'
import type { ConstraintPauseInfo } from './stateAnnotations.js'
import {
  buildContextGathererPrompt,
  buildDecomposerPrompt,
  buildSystemsMapperPrompt,
  buildVerifierPrompt,
  buildScannerPrompt,
  buildImpactAssessorPrompt,
  buildWeakSignalHunterPrompt,
  buildEquilibriumAnalystPrompt,
  buildScenarioDeveloperPrompt,
  buildRedTeamPrompt,
  buildBackcastingPrompt,
} from '../oracle/oraclePrompts.js'
import {
  evaluateGate,
  parseRubricScores,
  buildGateEvaluatorPrompt,
} from '../oracle/gateEvaluator.js'
import {
  buildPhaseSummarizerPrompt,
  buildFallbackSummary,
  parsePhaseSummary,
} from '../oracle/phaseSummarizer.js'
import { createExpertCouncilPipeline } from '../expertCouncil.js'
import {
  runTier1Checks,
  buildBatchedTier2Prompt,
  parseBatchedTier2Confirmation,
  buildConsistencyReport,
  type ConsistencyFlag,
} from '../oracle/consistencyChecker.js'
import { createLogger } from '../../lib/logger.js'
import { safeParseJson } from '../shared/jsonParser.js'
import {
  buildEmptyStartupSeedSummary,
  createFallbackOracleGoalFrame,
  normalizeStartupInput,
  parseOracleGoalFrame,
  summarizeNormalizedStartupInput,
} from '../startup/inputNormalizer.js'
import {
  buildStarterOracleGraphFromClaims,
  buildStartupSeedSummary,
  linkEvidenceIdsForClaim,
} from '../startup/starterGraph.js'
import {
  extractClaimsFromSourceBatch,
  type ProviderExecuteFn,
} from '../deepResearch/claimExtraction.js'

const log = createLogger('OracleGraph')

// ----- Config -----

export interface OracleGraphConfig {
  workflow: Workflow
  oracleConfig: OracleRunConfig
  // Agent assignments by role
  contextGatherer: AgentConfig
  decomposer: AgentConfig
  systemsMapper: AgentConfig
  verifier: AgentConfig
  scanner: AgentConfig
  impactAssessor: AgentConfig
  weakSignalHunter: AgentConfig
  scenarioDeveloper: AgentConfig
  equilibriumAnalyst: AgentConfig
  redTeam: AgentConfig
  // Infrastructure
  apiKeys: ProviderKeys
  userId: string
  runId: string
  eventWriter?: RunEventWriter
  toolRegistry?: ToolRegistry
  searchToolKeys?: SearchToolKeys
  enableCheckpointing?: boolean
  executionMode?: WorkflowExecutionMode
  tierOverride?: ModelTier | null
  workflowCriticality?: WorkflowCriticality
  // Phase 2: Expert Council at gates
  councilConfig?: ExpertCouncilConfig
  // Phase 2: Human gate after Phase 2 (pauses for user approval of critical uncertainties)
  enableHumanGate?: boolean
  // Phase 2: Consistency checker before Gate C
  enableConsistencyChecker?: boolean
}

// ----- Helpers -----

function buildExecContext(config: OracleGraphConfig): AgentExecutionContext {
  return {
    userId: config.userId,
    workflowId: config.workflow.workflowId,
    runId: config.runId,
    apiKeys: config.apiKeys,
    eventWriter: config.eventWriter,
    toolRegistry: config.toolRegistry,
    searchToolKeys: config.searchToolKeys,
    executionMode: config.executionMode,
    tierOverride: config.tierOverride ?? undefined,
    workflowCriticality: config.workflowCriticality,
  }
}

function updateCostTracker(
  tracker: OracleCostTracker,
  costInput: Pick<AgentExecutionStep, 'model' | 'tokensUsed' | 'estimatedCost'>,
  phase: number,
  component: 'llm' | 'search' | 'council' | 'evaluation'
): OracleCostTracker {
  const cost = Number.isFinite(costInput.estimatedCost) ? costInput.estimatedCost : 0
  const model = costInput.model || 'unknown'
  return {
    total: tracker.total + cost,
    byPhase: {
      ...tracker.byPhase,
      [phase]: (tracker.byPhase[phase] ?? 0) + cost,
    },
    byModel: {
      ...tracker.byModel,
      [model]: (tracker.byModel[model] ?? 0) + cost,
    },
    byComponent: {
      ...tracker.byComponent,
      [component]: (tracker.byComponent[component] ?? 0) + cost,
    },
  }
}

function simpleHash(input: string): string {
  let hash = 0
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash |= 0
  }
  return hash.toString(36)
}

function trackCost(
  state: OracleState,
  costInput: Pick<AgentExecutionStep, 'model' | 'tokensUsed' | 'estimatedCost'>,
  phase: number,
  component: 'llm' | 'search' | 'council' | 'evaluation'
): { costTracker: OracleCostTracker } {
  return { costTracker: updateCostTracker(state.costTracker, costInput, phase, component) }
}

function claimsSummary(claims: OracleClaim[]): string {
  return [...claims]
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 50)
    .map((c) => `${c.id} [${c.type}] (conf: ${c.confidence}): ${c.text.slice(0, 250)}`)
    .join('\n')
}

function knowledgeGraphSummary(graph: OracleKnowledgeGraph): string {
  const nodeLines = graph.nodes
    .slice(0, 12)
    .map((node) => `${node.id} [${node.type}] ${node.label}`)
    .join('\n')
  const edgeLines = graph.edges
    .slice(0, 12)
    .map((edge) => `${edge.source} -${edge.type}-> ${edge.target}`)
    .join('\n')

  return `Nodes (${graph.nodes.length}):\n${nodeLines || '(none)'}\n\nEdges (${graph.edges.length}):\n${edgeLines || '(none)'}`
}

function createInputNormalizerNode() {
  return async (state: OracleState): Promise<Partial<OracleState>> => {
    log.info('Oracle: Input Normalizer', { runId: state.runId })

    const normalizedInput = normalizeStartupInput(state.goal, state.context)
    return {
      goal: normalizedInput.normalizedGoal,
      normalizedInput,
      startupSeedSummary: buildEmptyStartupSeedSummary(normalizedInput.sources.length),
    }
  }
}

function inferOracleClaimType(text: string): OracleClaim['type'] {
  const normalized = text.toLowerCase()
  if (
    normalized.includes('will ') ||
    normalized.includes('likely') ||
    normalized.includes('forecast') ||
    normalized.includes('by 20')
  ) {
    return 'forecast'
  }
  if (
    normalized.includes('cause') ||
    normalized.includes('drive') ||
    normalized.includes('lead to') ||
    normalized.includes('increase') ||
    normalized.includes('reduce')
  ) {
    return 'causal'
  }
  return 'descriptive'
}

function dedupeOracleClaims(claims: OracleClaim[]): OracleClaim[] {
  const seen = new Set<string>()
  const deduped: OracleClaim[] = []

  for (const claim of claims) {
    const key = claim.text.toLowerCase().trim().replace(/\s+/g, ' ')
    if (seen.has(key)) continue
    seen.add(key)
    deduped.push(claim)
  }

  return deduped
}

function buildEvidenceId(index: number): string {
  return `EVD-${String(index + 1).padStart(3, '0')}`
}

function normalizeEvidenceCategory(category: string): string {
  return category.trim().toLowerCase()
}

function requireParsedJson<T>(value: T | null, context: string): T {
  if (!value) {
    throw new Error(`${context} output did not contain valid JSON`)
  }
  return value
}

/**
 * 3-layer JSON parse with retry for Oracle graph nodes.
 * 1. safeParseJson (with trailing comma stripping)
 * 2. Same-provider retry with strict "JSON only" prompt
 * 3. Haiku fallback with relevance gate
 */
async function parseJsonWithRetry<T>(
  rawOutput: string,
  context: string,
  jsonSchema: string,
  emptyFallback: string,
  goal: string,
  baseAgent: AgentConfig,
  execContext: AgentExecutionContext,
  nodeId: string,
  stepNumber: number,
  runId: string,
): Promise<T> {
  // Layer 1: direct parse
  let parsed = safeParseJson<T>(rawOutput)
  if (parsed) return parsed

  // Layer 2: same provider, strict JSON-only re-prompt
  log.warn(`${context} JSON parse failed, retrying with strict prompt`, { runId })
  const retryAgent = {
    ...baseAgent,
    systemPrompt: `You are a JSON formatter. Convert the following analysis into ONLY a valid JSON object. Output nothing else — no markdown, no explanation, no commentary. Just the JSON.\n\nRequired schema:\n${jsonSchema}`,
  }
  const retryStep = await executeAgentWithEvents(
    retryAgent,
    `Convert this text to JSON:\n\n${rawOutput.slice(0, 8000)}`,
    {},
    execContext,
    { nodeId, stepNumber }
  )
  parsed = safeParseJson<T>(retryStep.output)
  if (parsed) return parsed

  // Layer 3: Haiku with relevance gate
  log.warn(`${context} retry 1 failed, falling back to Haiku with relevance gate`, { runId })
  const haikuAgent: AgentConfig = {
    ...baseAgent,
    name: `${nodeId}-json-fixer`,
    modelProvider: 'anthropic',
    modelName: 'claude-haiku',
    systemPrompt: `You are a strict JSON extraction assistant. You will receive text that was supposed to be a JSON analysis of a strategic question, but may instead be an error message, refusal, or irrelevant text.

Step 1: Determine if the text contains substantive analysis relevant to the goal: "${goal}"
- If the text is an error message, API failure, refusal, or completely unrelated to the goal, respond with EXACTLY: ${emptyFallback}
- If the text contains relevant analysis (even partial), proceed to step 2.

Step 2: Extract the analysis into this exact JSON schema. Output ONLY valid JSON, nothing else.
${jsonSchema}`,
    temperature: 0,
  }
  const haikuStep = await executeAgentWithEvents(
    haikuAgent,
    rawOutput.slice(0, 8000),
    {},
    execContext,
    { nodeId, stepNumber }
  )
  parsed = safeParseJson<T>(haikuStep.output)

  return requireParsedJson(parsed, context)
}

function hasSearchQueries(searchPlan: OracleSearchPlan): boolean {
  return Object.values(searchPlan).some((queries) => Array.isArray(queries) && queries.length > 0)
}

function normalizeWeakSignalCategory(category: string | undefined): TrendObject['steepCategory'] {
  const value = (category ?? '').toLowerCase().trim()
  if (!value) return 'values'

  if (value.includes('tech') || value.includes('digital') || value.includes('ai'))
    return 'technological'
  if (value.includes('econ') || value.includes('market') || value.includes('financial'))
    return 'economic'
  if (value.includes('env') || value.includes('ecolog') || value.includes('climate'))
    return 'environmental'
  if (
    value.includes('polit') ||
    value.includes('policy') ||
    value.includes('govern') ||
    value.includes('regulator') ||
    value.includes('geo')
  )
    return 'political'
  if (
    value.includes('social') ||
    value.includes('socio') ||
    value.includes('cultur') ||
    value.includes('demograph')
  )
    return 'social'
  if (value.includes('value') || value.includes('ethic') || value.includes('norm')) return 'values'

  log.debug('Weak signal category unmapped, defaulting to values', { raw: category })
  return 'values'
}

function extractTopSearchResult(raw: unknown): {
  title?: string
  snippet?: string
  url?: string
  date?: string
  source?: string
} | null {
  if (!raw || typeof raw !== 'object') return null

  const results = (raw as { results?: unknown[] }).results
  if (!Array.isArray(results) || results.length === 0) return null

  const first = results[0]
  if (!first || typeof first !== 'object') return null

  const result = first as Record<string, unknown>
  return {
    title: typeof result.title === 'string' ? result.title : undefined,
    snippet: typeof result.snippet === 'string' ? result.snippet : undefined,
    url: typeof result.url === 'string' ? result.url : undefined,
    date: typeof result.date === 'string' ? result.date : undefined,
    source: typeof result.source === 'string' ? result.source : undefined,
  }
}

export async function collectEvidenceFromSearchPlan(
  searchPlan: OracleSearchPlan,
  config: Pick<
    OracleGraphConfig,
    'toolRegistry' | 'searchToolKeys' | 'userId' | 'workflow' | 'runId'
  >
): Promise<{ evidence: OracleEvidence[]; failedQueries: string[] }> {
  const plannedQueries = Object.entries(searchPlan).flatMap(([category, queries]) =>
    queries.map((query) => ({ category: normalizeEvidenceCategory(category), query }))
  )
  if (plannedQueries.length === 0) {
    throw new Error('Evidence gathering requires a non-empty search plan')
  }

  const searchTool = config.toolRegistry?.get('serp_search')
  const canSearch = !!searchTool && !!config.searchToolKeys?.serper
  if (!canSearch || !searchTool) {
    throw new Error('Evidence gathering requires serp_search and Serper credentials')
  }

  const settled = await Promise.allSettled(
    plannedQueries.map(async ({ category, query }, index) => {
      const timestamp = Date.now()
      const raw = await searchTool.execute(
        { query, maxResults: 3, searchType: 'search' },
        {
          userId: config.userId,
          agentId: 'oracle_context_gatherer',
          workflowId: config.workflow.workflowId,
          runId: config.runId,
          provider: 'openai',
          modelName: 'oracle-evidence-search',
          iteration: 0,
          searchToolKeys: config.searchToolKeys,
          toolRegistry: config.toolRegistry,
        }
      )

      const top = extractTopSearchResult(raw)
      if (!top) {
        throw new Error(`Evidence search for query "${query}" returned no usable results`)
      }

      return {
        id: buildEvidenceId(index),
        category,
        query,
        source: top.source ?? top.title ?? query,
        url: top.url ?? '',
        date: top.date ?? new Date(timestamp).toISOString().slice(0, 10),
        timestamp,
        excerpt: top.snippet?.slice(0, 200) ?? '',
        reliability: 0.7,
        searchTool: 'serper',
      } satisfies OracleEvidence
    })
  )

  const evidence: OracleEvidence[] = []
  const failedQueries: string[] = []

  settled.forEach((result, index) => {
    const plannedQuery = plannedQueries[index]
    if (!plannedQuery) return

    if (result.status === 'fulfilled') {
      evidence.push(result.value)
      return
    }

    failedQueries.push(plannedQuery.query)
    log.warn('Oracle evidence query failed; continuing with partial evidence', {
      workflowId: config.workflow.workflowId,
      runId: config.runId,
      query: plannedQuery.query,
      error: result.reason instanceof Error ? result.reason.message : String(result.reason),
    })
  })

  return {
    evidence: evidence.slice(-200),
    failedQueries,
  }
}

function maybeGateEscalation(
  gateResult: Pick<OracleGateResult, 'passed' | 'feedback'>,
  currentGateRefinements: number,
  maxRefinementsPerGate: number
): Partial<OracleState> {
  if (gateResult.passed || currentGateRefinements < maxRefinementsPerGate) {
    return {}
  }

  return {
    gateEscalated: true,
    gateEscalationFeedback: gateResult.feedback,
    status: 'waiting_for_input' as const,
    pendingInput: {
      prompt: `Gate escalation requires human review before continuing.\n\nFeedback: ${gateResult.feedback}`,
      nodeId: 'gate_escalation',
    },
  }
}

function getLowDiversityScenarioPairs(
  scenarios: OracleState['scenarioPortfolio']
): Array<{ scenarioA: string; scenarioB: string; overlap: number }> {
  const warnings: Array<{ scenarioA: string; scenarioB: string; overlap: number }> = []

  for (let i = 0; i < scenarios.length; i++) {
    for (let j = i + 1; j < scenarios.length; j++) {
      const leftPremise = scenarios[i]?.premise ?? {}
      const rightPremise = scenarios[j]?.premise ?? {}
      const keys = [...new Set([...Object.keys(leftPremise), ...Object.keys(rightPremise)])]
      if (keys.length === 0) continue

      const sharedAssignments = keys.filter((key) => leftPremise[key] === rightPremise[key]).length
      const overlap = sharedAssignments / keys.length
      if (overlap > 0.8) {
        warnings.push({
          scenarioA: scenarios[i]?.name ?? scenarios[i]?.id ?? `scenario-${i + 1}`,
          scenarioB: scenarios[j]?.name ?? scenarios[j]?.id ?? `scenario-${j + 1}`,
          overlap,
        })
      }
    }
  }

  return warnings
}

/**
 * Run Expert Council on a prompt and map result to OracleCouncilRecord.
 */
async function runCouncilAtGate(
  config: OracleGraphConfig,
  gateType: OracleCouncilRecord['gateType'],
  prompt: string
): Promise<{ councilRecord: OracleCouncilRecord; totalCost: number; totalTokens: number } | null> {
  if (!config.councilConfig?.enabled) return null

  const pipeline = createExpertCouncilPipeline({
    apiKeys: config.apiKeys,
    eventWriter: config.eventWriter,
    workflowId: config.workflow.workflowId,
  })

  const turn: ExpertCouncilTurn = await pipeline.execute(
    config.userId,
    config.runId as RunId,
    prompt,
    config.councilConfig,
    config.councilConfig.defaultMode ?? 'quick'
  )

  const models = turn.stage1.responses
    .filter((r) => r.status === 'completed')
    .map((r) => ({
      provider: r.provider,
      model: r.modelName,
      response: r.answerText.slice(0, 2000),
      tokensUsed: r.tokensUsed ?? 0,
    }))

  const convergenceRate = turn.stage2.consensusMetrics?.consensusScore ?? 0
  const persistentDissent = turn.stage2.consensusMetrics?.controversialResponses ?? []

  const councilRecord: OracleCouncilRecord = {
    sessionId: turn.turnId,
    gateType,
    models,
    convergenceRate,
    persistentDissent,
    synthesis: turn.stage3.finalResponse.slice(0, 3000),
    evaluatedAtMs: Date.now(),
  }

  const totalTokens =
    turn.stage1.responses.reduce((sum, r) => sum + (r.tokensUsed ?? 0), 0) +
    turn.stage2.reviews.reduce((sum, review) => sum + (review.tokensUsed ?? 0), 0) +
    (turn.stage3.tokensUsed ?? 0)

  await emitOracleEvent(config, 'oracle_council_complete', {
    gateType,
    convergenceRate,
    modelsUsed: models.length,
    hasDissent: persistentDissent.length > 0,
  })

  return { councilRecord, totalCost: turn.totalCost ?? 0, totalTokens }
}

// ----- Oracle Event Emitter -----

async function emitOracleEvent(
  config: OracleGraphConfig,
  type:
    | 'oracle_phase'
    | 'oracle_gate_result'
    | 'oracle_council_complete'
    | 'oracle_human_gate'
    | 'oracle_consistency_check',
  details: Record<string, unknown>
): Promise<void> {
  if (!config.eventWriter) return
  try {
    await config.eventWriter.writeEvent({ type, details })
  } catch (err) {
    log.debug('Oracle event emission failed (non-critical)', {
      type,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

/**
 * Check if the cost tracker has exceeded the budget limit.
 * Returns a constraint pause info if exceeded, null otherwise.
 */
function checkBudgetExceeded(
  tracker: OracleCostTracker,
  maxBudgetUsd: number
): ConstraintPauseInfo | null {
  if (tracker.total >= maxBudgetUsd) {
    return {
      constraintType: 'budget' as const,
      currentValue: tracker.total,
      limitValue: maxBudgetUsd,
      unit: 'USD',
      partialOutput: `Budget exhausted at $${tracker.total.toFixed(4)} (limit: $${maxBudgetUsd})`,
    }
  }
  return null
}

function getBudgetPauseUpdate(
  state: OracleState,
  nodeId: string,
  maxBudgetUsd: number
): Partial<OracleState> | null {
  const budgetPause = checkBudgetExceeded(state.costTracker, maxBudgetUsd)
  if (!budgetPause) return null

  log.warn('Budget exceeded before Oracle node', {
    runId: state.runId,
    nodeId,
    spent: state.costTracker.total,
    maxBudgetUsd,
  })

  return {
    status: 'paused' as const,
    constraintPause: budgetPause,
    degradedPhases: [nodeId],
    resumeNodeHint: nodeId,
  }
}

function nextNodeOrEnd(state: OracleState, nextNode: string): string {
  return state.status === 'running' ? nextNode : END
}

function buildOracleResumeState(state: OracleState): Partial<OracleState> {
  return {
    currentPhase: state.currentPhase,
    normalizedInput: state.normalizedInput,
    goalFrame: state.goalFrame,
    startupSeedSummary: state.startupSeedSummary,
    scope: state.scope,
    searchPlan: state.searchPlan,
    claims: state.claims,
    assumptions: state.assumptions,
    evidence: state.evidence,
    knowledgeGraph: state.knowledgeGraph,
    trends: state.trends,
    uncertainties: state.uncertainties,
    crossImpactMatrix: state.crossImpactMatrix,
    humanGateApproved: state.humanGateApproved,
    humanGateFeedback: state.humanGateFeedback,
    scenarioPortfolio: state.scenarioPortfolio,
    backcastTimelines: state.backcastTimelines,
    strategicMoves: state.strategicMoves,
    phaseSummaries: state.phaseSummaries,
    gateResults: state.gateResults,
    currentGateRefinements: state.currentGateRefinements,
    gateEscalated: state.gateEscalated,
    gateEscalationFeedback: state.gateEscalationFeedback,
    councilRecords: state.councilRecords,
    costTracker: state.costTracker,
    totalTokensUsed: state.totalTokensUsed,
    totalEstimatedCost: state.totalEstimatedCost,
    constraintPause: state.constraintPause,
    pendingInput: state.pendingInput,
    resumeNodeHint: state.resumeNodeHint,
    finalOutput: state.finalOutput,
    status: state.status,
    error: state.error,
    degradedPhases: state.degradedPhases,
    _skeletonCache: state._skeletonCache,
  }
}

function buildPersistedOracleWorkflowState(state: OracleState): Record<string, unknown> {
  return {
    oracle: {
      searchPlan: state.searchPlan,
      evidence: state.evidence,
      scenarioPortfolio: state.scenarioPortfolio,
      gateResults: state.gateResults,
      phaseSummaries: state.phaseSummaries,
      costTracker: state.costTracker,
      knowledgeGraph: state.knowledgeGraph,
      claims: state.claims,
      trends: state.trends,
      uncertainties: state.uncertainties,
      crossImpactMatrix: state.crossImpactMatrix,
      backcastTimelines: state.backcastTimelines,
      strategicMoves: state.strategicMoves,
      councilRecords: state.councilRecords,
      humanGateFeedback: state.humanGateFeedback,
      gateEscalated: state.gateEscalated,
      gateEscalationFeedback: state.gateEscalationFeedback,
      startup: {
        normalizedInput: state.normalizedInput
          ? summarizeNormalizedStartupInput(state.normalizedInput)
          : null,
        goalFrame: state.goalFrame,
        startupSeedSummary: state.startupSeedSummary,
      },
    },
    oracleResumeState: buildOracleResumeState(state),
  }
}

function determineOracleStartNode(state: OracleState): string {
  const resumeNodeHint = state.resumeNodeHint
  if (
    resumeNodeHint &&
    [
      'input_normalizer',
      'context_gathering',
      'evidence_gathering',
      'context_seeding',
      'decomposer',
      'systems_mapper',
      'verifier',
      'gate_a',
      'council_gate_a',
      'phase_1_summary',
      'scanner',
      'impact_assessor',
      'weak_signal_hunter',
      'gate_b',
      'council_gate_b',
      'phase_2_summary',
      'human_gate',
      'consistency_check',
      'equilibrium_analyst',
      'scenario_developer',
      'red_team',
      'gate_c',
      'council_final',
      'backcasting',
    ].includes(resumeNodeHint)
  ) {
    return resumeNodeHint
  }

  const hasPriorProgress =
    state.scope !== null ||
    state.claims.length > 0 ||
    state.evidence.length > 0 ||
    state.phaseSummaries.length > 0 ||
    state.trends.length > 0 ||
    state.scenarioPortfolio.length > 0

  if (!state.normalizedInput && !hasPriorProgress) return 'input_normalizer'

  const hasPhase1Summary = state.phaseSummaries.some((summary) => summary.phase === 'decomposition')
  const hasPhase2Summary = state.phaseSummaries.some(
    (summary) => summary.phase === 'trend_scanning'
  )

  if (state.humanGateApproved) return 'human_gate'
  if (
    state.currentPhase === 'scenario_simulation' ||
    hasPhase2Summary ||
    state.scenarioPortfolio.length > 0
  ) {
    return 'equilibrium_analyst'
  }
  if (state.currentPhase === 'trend_scanning' || hasPhase1Summary || state.trends.length > 0) {
    return 'scanner'
  }
  if (
    state.currentPhase === 'context_gathering' &&
    state.scope !== null &&
    state.claims.length === 0 &&
    state.evidence.length === 0 &&
    Object.keys(state.searchPlan).length > 0
  ) {
    return 'evidence_gathering'
  }
  if (
    state.currentPhase === 'context_gathering' &&
    state.scope !== null &&
    state.evidence.length > 0 &&
    state.claims.length === 0
  ) {
    return 'context_seeding'
  }
  if (state.currentPhase === 'decomposition' || state.scope !== null || state.claims.length > 0) {
    return 'decomposer'
  }
  return 'input_normalizer'
}

function extractHumanGateFeedback(context?: Record<string, unknown>): string | null {
  const directFeedback = context?.humanGateFeedback
  if (typeof directFeedback === 'string' && directFeedback.trim().length > 0) {
    return directFeedback.trim()
  }

  const humanApproval = context?.humanApproval
  if (!humanApproval || typeof humanApproval !== 'object') return null

  const approvalRecord = humanApproval as Record<string, unknown>
  const response = approvalRecord.response
  if (typeof response === 'string' && response.trim().length > 0) {
    return response.trim()
  }

  return null
}

// ----- Graph Construction -----

function createOracleGraph(config: OracleGraphConfig) {
  const execContext = buildExecContext(config)
  const { oracleConfig } = config

  const graph = new StateGraph(OracleStateAnnotation)

  graph.addNode('input_normalizer', createInputNormalizerNode())

  // ===== PHASE 0: Context Gathering =====

  graph.addNode('context_gathering', async (state: OracleState) => {
    const budgetPause = getBudgetPauseUpdate(state, 'context_gathering', oracleConfig.maxBudgetUsd)
    if (budgetPause) return budgetPause

    log.info('Phase 0: Context Gathering', { runId: state.runId })
    await emitOracleEvent(config, 'oracle_phase', {
      phase: 0,
      phaseName: 'context_gathering',
      status: 'started',
    })

    const normalizedInput =
      state.normalizedInput ?? normalizeStartupInput(state.goal, state.context)
    const prompt = buildContextGathererPrompt(state.goal, oracleConfig.depthMode)
    const agent = { ...config.contextGatherer, systemPrompt: prompt }

    const step = await executeAgentWithEvents(
      agent,
      state.goal,
      {
        ...state.context,
        normalizedContextSummary: normalizedInput.contextSummary,
        verificationTargets: state.goalFrame?.verificationTargets ?? [],
      },
      execContext,
      { nodeId: 'context_gathering', stepNumber: 1 }
    )

    const fallbackScope: OracleScope = {
      topic: state.goal,
      domain: oracleConfig.geography ?? 'general',
      timeHorizon: oracleConfig.timeHorizon ?? '5 years',
      geography: oracleConfig.geography ?? 'global',
      decisionContext: 'Strategic decision support',
      boundaries: { inScope: [state.goal], outOfScope: [] },
    }
    const fallbackSearchPlan: OracleSearchPlan = {
      technological: [state.goal],
      economic: [`${state.goal} market drivers`],
      political: [`${state.goal} policy`],
    }
    const parsed = parseOracleGoalFrame(
      step.output,
      createFallbackOracleGoalFrame(state.goal, fallbackScope, fallbackSearchPlan)
    )
    if (!parsed.scope) {
      throw new Error('Context gathering output is missing scope')
    }
    if (!parsed.searchPlan || !hasSearchQueries(parsed.searchPlan)) {
      throw new Error('Context gathering output is missing a usable searchPlan')
    }

    await emitOracleEvent(config, 'oracle_phase', {
      phase: 0,
      phaseName: 'context_gathering',
      status: 'completed',
    })

    return {
      currentPhase: 'context_gathering' as const,
      scope: parsed.scope,
      searchPlan: parsed.searchPlan,
      goalFrame: parsed,
      steps: [step],
      totalTokensUsed: step.tokensUsed,
      totalEstimatedCost: step.estimatedCost,
      ...trackCost(state, step, 0, 'llm'),
    }
  })

  graph.addNode('evidence_gathering', async (state: OracleState) => {
    log.info('Phase 0: Evidence Gathering', { runId: state.runId })

    const { evidence, failedQueries } = await collectEvidenceFromSearchPlan(
      state.searchPlan,
      config
    )

    return {
      currentPhase: 'context_gathering' as const,
      evidence,
      degradedPhases: failedQueries.length > 0 ? ['evidence_gathering'] : [],
    }
  })

  graph.addNode('context_seeding', async (state: OracleState) => {
    const normalizedInput =
      state.normalizedInput ?? normalizeStartupInput(state.goal, state.context)
    const contextSources = normalizedInput.sources
    const contentMap = normalizedInput.contentMap

    if (contextSources.length === 0) {
      log.info('Oracle: no attached context to seed', { runId: state.runId })
      return {
        startupSeedSummary: buildEmptyStartupSeedSummary(0),
      }
    }

    log.info('Oracle: Context Seeding', {
      runId: state.runId,
      sourceCount: contextSources.length,
      evidenceCount: state.evidence.length,
    })

    const providerFn: ProviderExecuteFn = async (systemPrompt, userPrompt) => {
      const result = await executeWithProvider(
        {
          ...config.decomposer,
          systemPrompt,
        },
        userPrompt,
        undefined,
        config.apiKeys
      )
      return result.output ?? ''
    }

    try {
      const { claims } = await extractClaimsFromSourceBatch(
        contextSources,
        contentMap,
        state.goalFrame?.canonicalGoal ?? state.goal,
        providerFn,
        {
          maxBudgetUsd: oracleConfig.maxBudgetUsd,
          spentUsd: state.costTracker.total,
          spentTokens: state.totalTokensUsed,
          searchCallsUsed: 0,
          maxSearchCalls: 20,
          llmCallsUsed: 0,
          phase: 'full',
          maxRecursiveDepth: 1,
          gapIterationsUsed: 0,
        },
        Math.min(contextSources.length, 4),
        config.decomposer.modelName
      )

      const topEvidence = state.evidence.slice(0, 10)
      const seededClaims = claims.slice(0, 10).map((claim, index) => ({
        id: `SEED-CLM-${String(index + 1).padStart(3, '0')}`,
        type: inferOracleClaimType(claim.claimText),
        text: claim.claimText,
        confidence: Math.min(1, claim.confidence * 0.85),
        confidenceBasis: 'data' as const,
        assumptions: [],
        evidenceIds: linkEvidenceIdsForClaim(claim.claimText, topEvidence),
        dependencies: [],
        axiomRefs: [],
        createdBy: 'context_seeding',
        phase: 0,
      }))
      const starterGraph = buildStarterOracleGraphFromClaims(seededClaims)
      const mergedClaims = dedupeOracleClaims([...state.claims, ...seededClaims])
      const evidenceLinkedCount = seededClaims.filter(
        (claim) => claim.evidenceIds.length > 0
      ).length

      return {
        claims: mergedClaims,
        knowledgeGraph: starterGraph.nodes.length > 0 ? starterGraph : state.knowledgeGraph,
        startupSeedSummary: buildStartupSeedSummary(
          contextSources.length,
          seededClaims.length,
          starterGraph.nodes.length,
          starterGraph.edges.length,
          evidenceLinkedCount
        ),
      }
    } catch (error) {
      log.warn('Oracle context seeding failed; continuing without startup seed', {
        runId: state.runId,
        error: error instanceof Error ? error.message : String(error),
      })
      return {
        degradedPhases: ['context_seeding'],
        startupSeedSummary: buildEmptyStartupSeedSummary(contextSources.length),
      }
    }
  })

  // ===== PHASE 1: Decomposition =====

  graph.addNode('decomposer', async (state: OracleState) => {
    const budgetPause = getBudgetPauseUpdate(state, 'decomposer', oracleConfig.maxBudgetUsd)
    if (budgetPause) return budgetPause

    log.info('Phase 1: Decomposer', { runId: state.runId })
    await emitOracleEvent(config, 'oracle_phase', {
      phase: 1,
      phaseName: 'decomposition',
      status: 'started',
    })

    const scope = state.scope!
    const prompt = buildDecomposerPrompt(
      state.goal,
      scope,
      state.phaseSummaries,
      oracleConfig.depthMode,
      state.evidence,
      state.goalFrame?.verificationTargets ?? [],
      claimsSummary(state.claims)
    )
    const agent = { ...config.decomposer, systemPrompt: prompt }

    const step = await executeAgentWithEvents(
      agent,
      state.goal,
      {
        ...state.context,
        scope,
        evidence: state.evidence,
        seededClaims: state.claims,
        verificationTargets: state.goalFrame?.verificationTargets ?? [],
      },
      execContext,
      { nodeId: 'decomposer', stepNumber: 2 }
    )

    const DECOMPOSER_SCHEMA = '{"claims":[{"id":"CLM-001","type":"descriptive|causal|forecast","text":"...","confidence":0.7,"confidenceBasis":"data|model_consensus|expert_judgment|speculative","assumptions":[],"evidenceIds":[],"dependencies":[],"axiomRefs":[],"subQuestionId":"SQ-001"}],"assumptions":[{"id":"ASM-001","type":"economic|technical|behavioral|regulatory|structural","statement":"...","sensitivity":"high|medium|low","observables":["..."],"confidence":0.6}]}'
    const parsed = await parseJsonWithRetry<{
      claims: OracleClaim[]
      assumptions: OracleAssumption[]
    }>(step.output, 'Decomposer', DECOMPOSER_SCHEMA, '{"claims":[],"assumptions":[]}', state.goal, config.decomposer, execContext, 'decomposer', 2, state.runId)

    // Enrich claims with metadata the LLM may not have provided
    const enrichedClaims = (parsed.claims ?? []).map((c) => ({
      ...c,
      createdBy: c.createdBy ?? `${config.decomposer.name}/${config.decomposer.modelName}`,
      phase: c.phase ?? 1,
      confidenceBasis: c.confidenceBasis ?? 'model_consensus',
      assumptions: c.assumptions ?? [],
      dependencies: c.dependencies ?? [],
      axiomRefs: c.axiomRefs ?? [],
      evidenceIds: c.evidenceIds ?? [],
    }))

    const enrichedAssumptions = (parsed.assumptions ?? []).map((a) => ({
      ...a,
      type: a.type ?? 'structural',
      observables: a.observables ?? [],
      confidence: a.confidence ?? 0.5,
    }))
    const mergedClaims = dedupeOracleClaims([...state.claims, ...enrichedClaims])

    return {
      currentPhase: 'decomposition' as const,
      claims: mergedClaims,
      assumptions: enrichedAssumptions,
      steps: [step],
      totalTokensUsed: step.tokensUsed,
      totalEstimatedCost: step.estimatedCost,
      ...trackCost(state, step, 1, 'llm'),
    }
  })

  graph.addNode('systems_mapper', async (state: OracleState) => {
    const budgetPause = getBudgetPauseUpdate(state, 'systems_mapper', oracleConfig.maxBudgetUsd)
    if (budgetPause) return budgetPause

    log.info('Phase 1: Systems Mapper', { runId: state.runId })

    const scope = state.scope!
    const prompt = buildSystemsMapperPrompt(
      scope,
      claimsSummary(state.claims),
      state.phaseSummaries,
      oracleConfig.depthMode,
      state.evidence,
      knowledgeGraphSummary(state.knowledgeGraph)
    )
    const agent = { ...config.systemsMapper, systemPrompt: prompt }

    const step = await executeAgentWithEvents(
      agent,
      `Build knowledge graph for: ${state.goal}`,
      {
        ...state.context,
        claims: state.claims,
        evidence: state.evidence,
        priorKnowledgeGraph: state.knowledgeGraph,
      },
      execContext,
      { nodeId: 'systems_mapper', stepNumber: 3 }
    )

    const SYSTEMS_MAPPER_SCHEMA = '{"nodes":[{"id":"N-001","type":"principle|constraint|trend|uncertainty|variable|scenario_state","label":"...","ledgerRef":"CLM-001","properties":{}}],"edges":[{"source":"N-001","target":"N-002","type":"causes|constrains|disrupts|reinforces","polarity":"+|-|conditional","strength":0.8,"lag":"immediate|short|medium|long"}],"loops":[{"id":"L-001","type":"reinforcing|balancing","nodes":["N-001","N-002"],"description":"..."}]}'
    const parsed = await parseJsonWithRetry<{
      nodes: OracleKnowledgeGraph['nodes']
      edges: OracleKnowledgeGraph['edges']
      loops: OracleKnowledgeGraph['loops']
    }>(step.output, 'Systems mapper', SYSTEMS_MAPPER_SCHEMA, '{"nodes":[],"edges":[],"loops":[]}', state.goal, config.systemsMapper, execContext, 'systems_mapper', 3, state.runId)

    const kg: OracleKnowledgeGraph = {
      nodes: parsed.nodes ?? [],
      edges: parsed.edges ?? [],
      loops: parsed.loops ?? [],
    }

    return {
      knowledgeGraph: kg,
      steps: [step],
      totalTokensUsed: step.tokensUsed,
      totalEstimatedCost: step.estimatedCost,
      ...trackCost(state, step, 1, 'llm'),
    }
  })

  graph.addNode('verifier', async (state: OracleState) => {
    const budgetPause = getBudgetPauseUpdate(state, 'verifier', oracleConfig.maxBudgetUsd)
    if (budgetPause) return budgetPause

    log.info('Phase 1: Verifier', { runId: state.runId })

    const prompt = buildVerifierPrompt(
      claimsSummary(state.claims),
      state.phaseSummaries,
      oracleConfig.depthMode,
      state.evidence,
      state.goalFrame?.verificationTargets ?? []
    )
    const agent = { ...config.verifier, systemPrompt: prompt }

    const step = await executeAgentWithEvents(
      agent,
      `Verify ${state.claims.length} claims`,
      {
        ...state.context,
        claims: state.claims,
        evidence: state.evidence,
        verificationTargets: state.goalFrame?.verificationTargets ?? [],
      },
      execContext,
      { nodeId: 'verifier', stepNumber: 4 }
    )

    // Parse verification results and update claim confidences
    const parsed = requireParsedJson(
      safeParseJson<{
        verifiedClaims: Array<{ claimId: string; adjustedConfidence: number }>
        axiomGroundingPercent: number
      }>(step.output),
      'Verifier'
    )

    // Update claims with adjusted confidence
    const updatedClaims = state.claims.map((c) => {
      const verification = parsed.verifiedClaims?.find((v) => v.claimId === c.id)
      return verification ? { ...c, confidence: verification.adjustedConfidence } : c
    })

    return {
      // Replace claims with updated confidences (not accumulated)
      claims: updatedClaims.length > 0 ? updatedClaims : state.claims,
      steps: [step],
      totalTokensUsed: step.tokensUsed,
      totalEstimatedCost: step.estimatedCost,
      ...trackCost(state, step, 1, 'llm'),
    }
  })

  // ===== GATE A =====

  graph.addNode('gate_a', async (state: OracleState) => {
    const budgetPause = getBudgetPauseUpdate(state, 'gate_a', oracleConfig.maxBudgetUsd)
    if (budgetPause) return budgetPause

    log.info('Gate A evaluation', { runId: state.runId })

    // Gate evaluation reuses the verifier agent's model — both require analytical
    // precision and structured JSON output. Separate gate_evaluator agent is unnecessary.
    const prompt = buildGateEvaluatorPrompt('gate_a')
    const agent = { ...config.verifier, systemPrompt: prompt }

    const phaseOutput = `Claims: ${state.claims.length}, KG nodes: ${state.knowledgeGraph.nodes.length}, Assumptions: ${state.assumptions.length}\n\n${claimsSummary(state.claims)}`

    const step = await executeAgentWithEvents(
      agent,
      `Evaluate Gate A for phase 1 output`,
      { phaseOutput },
      execContext,
      { nodeId: 'gate_a', stepNumber: 5 }
    )

    const rubricResult = parseRubricScores(step.output)
    if (!rubricResult) {
      throw new Error('Gate A evaluation output could not be parsed')
    }

    // Compute axiom grounding from claims
    const claimsWithAxioms = state.claims.filter((c) => c.axiomRefs && c.axiomRefs.length > 0)
    const axiomGroundingPercent =
      state.claims.length > 0 ? claimsWithAxioms.length / state.claims.length : 0

    const { gateResult } = evaluateGate(
      {
        gateType: 'gate_a',
        phaseOutput,
        axiomGroundingPercent,
        refinementAttempt: state.currentGateRefinements,
        maxRefinements: oracleConfig.maxRefinementsPerGate,
      },
      rubricResult.scores,
      rubricResult.llmFeedback
    )

    await emitOracleEvent(config, 'oracle_gate_result', {
      gate: 'gate_a',
      passed: gateResult.passed,
      averageScore: gateResult.averageScore,
      refinement: state.currentGateRefinements,
    })

    return {
      gateResults: [gateResult],
      currentGateRefinements: gateResult.passed ? 0 : state.currentGateRefinements + 1,
      ...maybeGateEscalation(
        gateResult,
        state.currentGateRefinements + 1,
        oracleConfig.maxRefinementsPerGate
      ),
      steps: [step],
      totalTokensUsed: step.tokensUsed,
      totalEstimatedCost: step.estimatedCost,
      ...trackCost(state, step, 1, 'evaluation'),
    }
  })

  // Phase 1 Summary
  graph.addNode('phase_1_summary', async (state: OracleState) => {
    const budgetPause = getBudgetPauseUpdate(state, 'phase_1_summary', oracleConfig.maxBudgetUsd)
    if (budgetPause) return budgetPause

    log.info('Phase 1: Generating summary', { runId: state.runId })

    const lastGateA = [...state.gateResults].reverse().find((g) => g.gateType === 'gate_a')
    const prompt = buildPhaseSummarizerPrompt('decomposition', lastGateA)
    const agent = { ...config.verifier, systemPrompt: prompt, maxTokens: 1500 }

    const phaseContent = `Claims: ${state.claims.length}\nKG: ${state.knowledgeGraph.nodes.length} nodes, ${state.knowledgeGraph.edges.length} edges, ${state.knowledgeGraph.loops.length} loops\nAssumptions: ${state.assumptions.length}\n\n${claimsSummary(state.claims)}`
    let step: AgentExecutionStep | null = null

    try {
      step = await executeAgentWithEvents(agent, phaseContent, {}, execContext, {
        nodeId: 'phase_1_summary',
      })

      const summary = parsePhaseSummary('decomposition', step.output)
      if (!summary) {
        throw new Error('Phase 1 summary output could not be parsed')
      }

      await emitOracleEvent(config, 'oracle_phase', {
        phase: 1,
        phaseName: 'decomposition',
        status: 'completed',
      })

      return {
        phaseSummaries: [summary],
        steps: [step],
        totalTokensUsed: step.tokensUsed,
        totalEstimatedCost: step.estimatedCost,
        ...trackCost(state, step, 1, 'llm'),
      }
    } catch (err) {
      log.warn('Phase 1 summary failed, using fallback summary', {
        runId: state.runId,
        error: err instanceof Error ? err.message : String(err),
      })

      const fallbackSummary = buildFallbackSummary('decomposition', state.claims, state.assumptions)

      await emitOracleEvent(config, 'oracle_phase', {
        phase: 1,
        phaseName: 'decomposition',
        status: 'completed',
        degraded: true,
      })

      if (!step) {
        return {
          phaseSummaries: [fallbackSummary],
          degradedPhases: ['phase_1_summary'],
        }
      }

      return {
        phaseSummaries: [fallbackSummary],
        degradedPhases: ['phase_1_summary'],
        steps: [step],
        totalTokensUsed: step.tokensUsed,
        totalEstimatedCost: step.estimatedCost,
        ...trackCost(state, step, 1, 'llm'),
      }
    }
  })

  // ===== Expert Council: Gate A Review =====

  graph.addNode('council_gate_a', async (state: OracleState) => {
    if (!config.councilConfig?.enabled) {
      log.info('Council Gate A: skipped (not enabled)', { runId: state.runId })
      return { currentGateRefinements: 0 }
    }
    const budgetPause = getBudgetPauseUpdate(state, 'council_gate_a', oracleConfig.maxBudgetUsd)
    if (budgetPause) return budgetPause

    log.info('Council Gate A: Expert Council review', { runId: state.runId })

    const prompt = `Evaluate the decomposition phase output for a scenario planning analysis on: "${state.goal}"\n\nClaims: ${state.claims.length}, KG nodes: ${state.knowledgeGraph.nodes.length}, Assumptions: ${state.assumptions.length}\n\nTop claims:\n${claimsSummary(state.claims)}\n\nAssess: Are the causal claims specific and testable? Is the axiom grounding adequate? Are there major blind spots?`

    const result = await runCouncilAtGate(config, 'gate_a', prompt)
    if (!result) return {}

    return {
      currentGateRefinements: 0, // Reset for next gate
      councilRecords: [result.councilRecord],
      totalTokensUsed: result.totalTokens,
      totalEstimatedCost: result.totalCost,
      ...trackCost(
        state,
        {
          model: 'expert_council',
          tokensUsed: result.totalTokens,
          estimatedCost: result.totalCost,
        },
        1,
        'council'
      ),
    }
  })

  // ===== PHASE 2: Trend Scanning =====

  graph.addNode('scanner', async (state: OracleState) => {
    const budgetPause = getBudgetPauseUpdate(state, 'scanner', oracleConfig.maxBudgetUsd)
    if (budgetPause) return budgetPause

    log.info('Phase 2: Scanner', { runId: state.runId })
    await emitOracleEvent(config, 'oracle_phase', {
      phase: 2,
      phaseName: 'trend_scanning',
      status: 'started',
    })

    const scope = state.scope!
    const prompt = buildScannerPrompt(scope, state.phaseSummaries, oracleConfig.depthMode)
    const agent = { ...config.scanner, systemPrompt: prompt }

    const step = await executeAgentWithEvents(
      agent,
      `Scan trends for: ${state.goal}`,
      { ...state.context, scope },
      execContext,
      { nodeId: 'scanner' }
    )

    const parsed = requireParsedJson(
      safeParseJson<{ trends: TrendObject[] }>(step.output),
      'Scanner'
    )

    return {
      currentPhase: 'trend_scanning' as const,
      trends: parsed.trends ?? [],
      steps: [step],
      totalTokensUsed: step.tokensUsed,
      totalEstimatedCost: step.estimatedCost,
      ...trackCost(state, step, 2, 'llm'),
    }
  })

  graph.addNode('impact_assessor', async (state: OracleState) => {
    const budgetPause = getBudgetPauseUpdate(state, 'impact_assessor', oracleConfig.maxBudgetUsd)
    if (budgetPause) return budgetPause

    log.info('Phase 2: Impact Assessor', { runId: state.runId })

    const trendsSummary = state.trends
      .map(
        (t) =>
          `${t.id} [${t.steepCategory}] ${t.statement} (impact: ${t.impactScore}, uncertainty: ${t.uncertaintyScore})`
      )
      .join('\n')

    const prompt = buildImpactAssessorPrompt(
      trendsSummary,
      state.phaseSummaries,
      oracleConfig.depthMode
    )
    const agent = { ...config.impactAssessor, systemPrompt: prompt }

    const step = await executeAgentWithEvents(
      agent,
      `Assess impact for ${state.trends.length} trends`,
      { trends: state.trends },
      execContext,
      { nodeId: 'impact_assessor' }
    )

    const parsed = requireParsedJson(
      safeParseJson<{
        crossImpactMatrix: CrossImpactEntry[]
        criticalUncertainties: UncertaintyObject[]
      }>(step.output),
      'Impact assessor'
    )

    return {
      crossImpactMatrix: parsed.crossImpactMatrix ?? [],
      uncertainties: parsed.criticalUncertainties ?? [],
      steps: [step],
      totalTokensUsed: step.tokensUsed,
      totalEstimatedCost: step.estimatedCost,
      ...trackCost(state, step, 2, 'llm'),
    }
  })

  graph.addNode('weak_signal_hunter', async (state: OracleState) => {
    // Skip weak signal hunting in quick mode to save cost/latency
    if (oracleConfig.depthMode === 'quick') {
      log.info('Phase 2: Weak Signal Hunter skipped (quick mode)', { runId: state.runId })
      return {}
    }

    const budgetPause = getBudgetPauseUpdate(state, 'weak_signal_hunter', oracleConfig.maxBudgetUsd)
    if (budgetPause) return budgetPause

    log.info('Phase 2: Weak Signal Hunter', { runId: state.runId })

    const scope = state.scope!
    const trendsSummary = state.trends.map((t) => `${t.id}: ${t.statement}`).join('\n')

    const prompt = buildWeakSignalHunterPrompt(
      scope,
      trendsSummary,
      state.phaseSummaries,
      oracleConfig.depthMode
    )
    const agent = { ...config.weakSignalHunter, systemPrompt: prompt }

    const step = await executeAgentWithEvents(
      agent,
      `Hunt weak signals for: ${state.goal}`,
      { ...state.context, scope },
      execContext,
      { nodeId: 'weak_signal_hunter' }
    )

    // Weak signals become additional trends
    const parsed = requireParsedJson(
      safeParseJson<{
        weakSignals: Array<{
          id: string
          statement: string
          category: string
          potentialImpact: number
          confidence: number
        }>
      }>(step.output),
      'Weak signal hunter'
    )

    // Map weak signal categories to STEEP+V
    const weakSignalTrends: TrendObject[] = (parsed.weakSignals ?? []).map((ws) => ({
      id: ws.id,
      statement: ws.statement,
      steepCategory: normalizeWeakSignalCategory(ws.category),
      direction: 'emerging',
      momentum: 'accelerating' as const,
      impactScore: ws.potentialImpact,
      uncertaintyScore: 1 - ws.confidence,
      evidenceIds: [],
      causalLinks: [],
      secondOrderEffects: [],
    }))

    // Merge weak signals with existing trends (replace-on-write reducer)
    return {
      trends: [...state.trends, ...weakSignalTrends],
      steps: [step],
      totalTokensUsed: step.tokensUsed,
      totalEstimatedCost: step.estimatedCost,
      ...trackCost(state, step, 2, 'llm'),
    }
  })

  // ===== GATE B =====

  graph.addNode('gate_b', async (state: OracleState) => {
    const budgetPause = getBudgetPauseUpdate(state, 'gate_b', oracleConfig.maxBudgetUsd)
    if (budgetPause) return budgetPause

    log.info('Gate B evaluation', { runId: state.runId })

    const prompt = buildGateEvaluatorPrompt('gate_b')
    const agent = { ...config.verifier, systemPrompt: prompt }

    const phaseOutput = `Trends: ${state.trends.length}, Uncertainties: ${state.uncertainties.length}, Cross-impact entries: ${state.crossImpactMatrix.length}\n\nTrends:\n${state.trends.map((t) => `${t.id}: ${t.statement}`).join('\n')}`

    const step = await executeAgentWithEvents(
      agent,
      `Evaluate Gate B`,
      { phaseOutput },
      execContext,
      { nodeId: 'gate_b' }
    )

    const rubricResult = parseRubricScores(step.output)
    if (!rubricResult) {
      throw new Error('Gate B evaluation output could not be parsed')
    }

    const { gateResult } = evaluateGate(
      {
        gateType: 'gate_b',
        phaseOutput,
        refinementAttempt: state.currentGateRefinements,
        maxRefinements: oracleConfig.maxRefinementsPerGate,
      },
      rubricResult.scores,
      rubricResult.llmFeedback
    )

    await emitOracleEvent(config, 'oracle_gate_result', {
      gate: 'gate_b',
      passed: gateResult.passed,
      averageScore: gateResult.averageScore,
      refinement: state.currentGateRefinements,
    })

    return {
      gateResults: [gateResult],
      currentGateRefinements: gateResult.passed ? 0 : state.currentGateRefinements + 1,
      ...maybeGateEscalation(
        gateResult,
        state.currentGateRefinements + 1,
        oracleConfig.maxRefinementsPerGate
      ),
      steps: [step],
      totalTokensUsed: step.tokensUsed,
      totalEstimatedCost: step.estimatedCost,
      ...trackCost(state, step, 2, 'evaluation'),
    }
  })

  // Phase 2 Summary
  graph.addNode('phase_2_summary', async (state: OracleState) => {
    const budgetPause = getBudgetPauseUpdate(state, 'phase_2_summary', oracleConfig.maxBudgetUsd)
    if (budgetPause) return budgetPause

    log.info('Phase 2: Generating summary', { runId: state.runId })

    const lastGateB = [...state.gateResults].reverse().find((g) => g.gateType === 'gate_b')
    const prompt = buildPhaseSummarizerPrompt('trend_scanning', lastGateB)
    const agent = { ...config.verifier, systemPrompt: prompt, maxTokens: 1500 }

    const phaseContent = `Trends: ${state.trends.length}, Uncertainties: ${state.uncertainties.length}\n\nTrends:\n${state.trends.map((t) => `${t.id} [${t.steepCategory}]: ${t.statement}`).join('\n')}\n\nUncertainties:\n${state.uncertainties.map((u) => `${u.id}: ${u.variable}`).join('\n')}`
    let step: AgentExecutionStep | null = null

    try {
      step = await executeAgentWithEvents(agent, phaseContent, {}, execContext, {
        nodeId: 'phase_2_summary',
      })

      const summary = parsePhaseSummary('trend_scanning', step.output)
      if (!summary) {
        throw new Error('Phase 2 summary output could not be parsed')
      }

      await emitOracleEvent(config, 'oracle_phase', {
        phase: 2,
        phaseName: 'trend_scanning',
        status: 'completed',
      })

      return {
        phaseSummaries: [summary],
        steps: [step],
        totalTokensUsed: step.tokensUsed,
        totalEstimatedCost: step.estimatedCost,
        ...trackCost(state, step, 2, 'llm'),
      }
    } catch (err) {
      log.warn('Phase 2 summary failed, using fallback summary', {
        runId: state.runId,
        error: err instanceof Error ? err.message : String(err),
      })

      const fallbackSummary = buildFallbackSummary(
        'trend_scanning',
        state.claims,
        state.assumptions,
        state.trends,
        state.uncertainties
      )

      await emitOracleEvent(config, 'oracle_phase', {
        phase: 2,
        phaseName: 'trend_scanning',
        status: 'completed',
        degraded: true,
      })

      if (!step) {
        return {
          phaseSummaries: [fallbackSummary],
          degradedPhases: ['phase_2_summary'],
        }
      }

      return {
        phaseSummaries: [fallbackSummary],
        degradedPhases: ['phase_2_summary'],
        steps: [step],
        totalTokensUsed: step.tokensUsed,
        totalEstimatedCost: step.estimatedCost,
        ...trackCost(state, step, 2, 'llm'),
      }
    }
  })

  // ===== Expert Council: Gate B Review =====

  graph.addNode('council_gate_b', async (state: OracleState) => {
    if (!config.councilConfig?.enabled) {
      log.info('Council Gate B: skipped (not enabled)', { runId: state.runId })
      return { currentGateRefinements: 0 }
    }
    const budgetPause = getBudgetPauseUpdate(state, 'council_gate_b', oracleConfig.maxBudgetUsd)
    if (budgetPause) return budgetPause

    log.info('Council Gate B: Expert Council review', { runId: state.runId })

    const trendsSummary = state.trends
      .map((t) => `${t.id} [${t.steepCategory}]: ${t.statement}`)
      .join('\n')
    const prompt = `Evaluate the trend scanning phase for: "${state.goal}"\n\nTrends: ${state.trends.length}, Uncertainties: ${state.uncertainties.length}, Cross-impact entries: ${state.crossImpactMatrix.length}\n\nTrends:\n${trendsSummary}\n\nAssess: Is STEEP+V coverage balanced? Are trend interactions properly captured? Are weak signals adequately identified?`

    const result = await runCouncilAtGate(config, 'gate_b', prompt)
    if (!result) return {}

    return {
      currentGateRefinements: 0, // Reset for next gate
      councilRecords: [result.councilRecord],
      totalTokensUsed: result.totalTokens,
      totalEstimatedCost: result.totalCost,
      ...trackCost(
        state,
        {
          model: 'expert_council',
          tokensUsed: result.totalTokens,
          estimatedCost: result.totalCost,
        },
        2,
        'council'
      ),
    }
  })

  // ===== Human Gate (Phase 2 → Phase 3 transition) =====

  graph.addNode('human_gate', async (state: OracleState) => {
    if (!config.enableHumanGate) {
      log.info('Human gate: skipped (not enabled)', { runId: state.runId })
      return { humanGateApproved: true }
    }

    // If already approved (resumed after pause), reset status and proceed
    if (state.humanGateApproved) {
      log.info('Human gate: already approved, resuming', { runId: state.runId })
      return {
        status: 'running' as const,
        pendingInput: null,
      }
    }

    log.info('Human gate: pausing for user approval', { runId: state.runId })
    await emitOracleEvent(config, 'oracle_human_gate', {
      status: 'paused',
      uncertaintyCount: state.uncertainties.length,
    })

    const uncertaintiesSummary = state.uncertainties
      .slice(0, 10)
      .map((u) => `- ${u.id}: ${u.variable} [states: ${u.states.join(', ')}]`)
      .join('\n')

    return {
      status: 'waiting_for_input' as const,
      pendingInput: {
        prompt: `Please review the critical uncertainties identified in Phase 2 before proceeding to scenario simulation.\n\n**Critical Uncertainties (${state.uncertainties.length}):**\n${uncertaintiesSummary}\n\n**Trends:** ${state.trends.length} identified\n**Cross-Impact Entries:** ${state.crossImpactMatrix.length}\n\nApprove to proceed to Phase 3 (Scenario Simulation), or provide feedback to refine.`,
        nodeId: 'human_gate',
      },
    }
  })

  // ===== Consistency Check (before Phase 3 gate) =====

  graph.addNode('consistency_check', async (state: OracleState) => {
    if (!config.enableConsistencyChecker) {
      log.info('Consistency check: skipped (not enabled)', { runId: state.runId })
      return {}
    }
    const budgetPause = getBudgetPauseUpdate(state, 'consistency_check', oracleConfig.maxBudgetUsd)
    if (budgetPause) return budgetPause

    log.info('Running consistency check', { runId: state.runId })

    // Tier 1: Rule-based checks
    const tier1Flags = runTier1Checks(
      state.claims,
      state.assumptions,
      state.knowledgeGraph,
      state.evidence
    )

    log.info('Tier 1 consistency check complete', {
      runId: state.runId,
      flagCount: tier1Flags.length,
      critical: tier1Flags.filter((f) => f.severity === 'critical').length,
    })

    // Tier 2: LLM confirmation for critical/warning flags
    // Batch up to 5 flags per LLM call to reduce cost (cap at 10 flags total)
    const flagsToConfirm = tier1Flags
      .filter((f) => f.severity === 'critical' || f.severity === 'warning')
      .slice(0, 10)
    const confirmedFlags: ConsistencyFlag[] = [...tier1Flags]
    let tier2TokensUsed = 0
    let tier2Cost = 0
    const BATCH_SIZE = 5

    if (flagsToConfirm.length > 0) {
      for (let batchStart = 0; batchStart < flagsToConfirm.length; batchStart += BATCH_SIZE) {
        const batch = flagsToConfirm.slice(batchStart, batchStart + BATCH_SIZE)
        const batchPrompt = buildBatchedTier2Prompt(batch, state.claims)
        const agent = {
          ...config.verifier,
          systemPrompt:
            'You are a consistency checker for a scenario planning system. Respond with a JSON array only.',
        }

        try {
          const step = await executeAgentWithEvents(agent, batchPrompt, {}, execContext, {
            nodeId: 'consistency_check',
          })

          tier2TokensUsed += step.tokensUsed
          tier2Cost += step.estimatedCost

          const confirmations = parseBatchedTier2Confirmation(step.output)
          if (!confirmations) {
            throw new Error('Tier 2 batched confirmation output could not be parsed')
          }
          for (const conf of confirmations) {
            const idx = confirmedFlags.findIndex((f) => f.id === conf.flagId)
            if (idx >= 0) {
              confirmedFlags[idx] = {
                ...confirmedFlags[idx],
                llmConfirmed: conf.confirmed,
                llmExplanation: conf.explanation,
              }
            }
          }
        } catch (err) {
          throw new Error(
            `Tier 2 batched confirmation failed for batch of ${batch.length}: ${err instanceof Error ? err.message : String(err)}`
          )
        }
      }
    }

    const totalItems =
      state.claims.length + state.assumptions.length + state.knowledgeGraph.edges.length
    const report = buildConsistencyReport(confirmedFlags, totalItems)

    log.info('Consistency check complete', {
      runId: state.runId,
      tier1Flags: report.tier1FlagCount,
      tier2Confirmed: report.tier2ConfirmedCount,
      healthScore: report.overallHealthScore,
    })

    await emitOracleEvent(config, 'oracle_consistency_check', {
      tier1Flags: report.tier1FlagCount,
      tier2Confirmed: report.tier2ConfirmedCount,
      healthScore: report.overallHealthScore,
    })

    // Store report as a step annotation (no separate state field needed)
    const checkStep = {
      agentId: 'consistency_checker',
      agentName: 'Consistency Checker',
      model: 'consistency_checker',
      provider: 'system',
      tokensUsed: tier2TokensUsed,
      estimatedCost: tier2Cost,
      output: JSON.stringify(report),
      executedAtMs: Date.now(),
    } satisfies AgentExecutionStep

    return {
      steps: [checkStep],
      totalTokensUsed: tier2TokensUsed,
      totalEstimatedCost: tier2Cost,
      ...(tier2Cost > 0 ? trackCost(state, checkStep, 2, 'evaluation') : {}),
    }
  })

  // ===== PHASE 3: Scenario Simulation =====

  graph.addNode('equilibrium_analyst', async (state: OracleState) => {
    const budgetPause = getBudgetPauseUpdate(
      state,
      'equilibrium_analyst',
      oracleConfig.maxBudgetUsd
    )
    if (budgetPause) return budgetPause

    log.info('Phase 3: Equilibrium Analyst', { runId: state.runId })
    await emitOracleEvent(config, 'oracle_phase', {
      phase: 3,
      phaseName: 'scenario_simulation',
      status: 'started',
    })

    // Cache check: skip LLM call if inputs haven't changed since last run
    const cacheInput = JSON.stringify({
      u: state.uncertainties.map((u) => u.id + u.variable),
      c: state.crossImpactMatrix.map((e) => e.sourceId + e.targetId + e.strength),
    })
    const cacheHash = simpleHash(cacheInput)

    if (state._skeletonCache?.hash === cacheHash) {
      log.info('Equilibrium analyst: cache hit, reusing skeletons', { runId: state.runId })
      return {
        currentPhase: 'scenario_simulation' as const,
        scenarioPortfolio: state._skeletonCache.skeletons,
      }
    }

    const uncertaintiesSummary = state.uncertainties
      .map((u) => `${u.id}: ${u.variable} → states: [${u.states.join(', ')}]`)
      .join('\n')

    const crossImpactSummary = state.crossImpactMatrix
      .slice(0, 30)
      .map((e) => `${e.sourceId} → ${e.targetId}: ${e.effect} (${e.strength})`)
      .join('\n')

    const targetScenarioCount =
      oracleConfig.scenarioCount ??
      (oracleConfig.depthMode === 'quick' ? 3 : oracleConfig.depthMode === 'deep' ? 6 : 4)
    const prompt = buildEquilibriumAnalystPrompt(
      uncertaintiesSummary,
      crossImpactSummary,
      state.phaseSummaries,
      targetScenarioCount,
      state.humanGateFeedback,
      oracleConfig.depthMode
    )
    const agent = { ...config.equilibriumAnalyst, systemPrompt: prompt }

    const step = await executeAgentWithEvents(
      agent,
      `Generate scenario skeletons from ${state.uncertainties.length} uncertainties, target ${targetScenarioCount} scenarios`,
      {},
      execContext,
      { nodeId: 'equilibrium_analyst' }
    )

    // Parse the selected skeletons as preliminary scenarios
    const parsed = requireParsedJson(
      safeParseJson<{
        selectedSkeletons: string[]
        candidateSkeletons: Array<{
          id: string
          premise: Record<string, string>
          consistency: number
          plausibility: number
          divergence: number
        }>
      }>(step.output),
      'Equilibrium analyst'
    )

    const selected = (
      parsed?.candidateSkeletons?.filter((s) => parsed.selectedSkeletons?.includes(s.id)) ?? []
    ).slice(0, targetScenarioCount)

    if (parsed.candidateSkeletons.length === 0) {
      throw new Error('Equilibrium analyst did not return any candidate skeletons')
    }
    if (selected.length === 0) {
      throw new Error(
        `Equilibrium analyst returned no matching selected skeletons for IDs: ${parsed.selectedSkeletons.join(', ')}`
      )
    }

    // Create preliminary scenario objects from skeletons
    const preliminaryScenarios: OracleScenario[] = selected.map((s, i) => ({
      id: `SCN-${String(i + 1).padStart(3, '0')}`,
      name: s.id,
      premise: s.premise,
      narrative: '',
      reinforcedPrinciples: [],
      disruptedPrinciples: [],
      feedbackLoops: [],
      implications: '',
      signposts: [],
      tailRisks: [],
      assumptionRegister: [],
      councilAssessment: { agreementRate: 0, persistentDissent: [] },
      plausibilityScore: s.plausibility,
      divergenceScore: s.divergence,
    }))

    return {
      currentPhase: 'scenario_simulation' as const,
      scenarioPortfolio: preliminaryScenarios,
      _skeletonCache: { hash: cacheHash, skeletons: preliminaryScenarios },
      steps: [step],
      totalTokensUsed: step.tokensUsed,
      totalEstimatedCost: step.estimatedCost,
      ...trackCost(state, step, 3, 'llm'),
    }
  })

  graph.addNode('scenario_developer', async (state: OracleState) => {
    const budgetPause = getBudgetPauseUpdate(state, 'scenario_developer', oracleConfig.maxBudgetUsd)
    if (budgetPause) return budgetPause

    log.info('Phase 3: Scenario Developer', { runId: state.runId })

    const scope = state.scope!
    const skeletonsSummary = state.scenarioPortfolio
      .map((s) => `${s.id} (${s.name}): ${JSON.stringify(s.premise)}`)
      .join('\n')

    const prompt = buildScenarioDeveloperPrompt(
      scope,
      skeletonsSummary,
      state.phaseSummaries,
      state.humanGateFeedback,
      oracleConfig.depthMode
    )
    const agent = { ...config.scenarioDeveloper, systemPrompt: prompt }

    const step = await executeAgentWithEvents(
      agent,
      `Develop ${state.scenarioPortfolio.length} scenarios`,
      {},
      execContext,
      { nodeId: 'scenario_developer' }
    )

    const parsed = requireParsedJson(
      safeParseJson<{ scenarios: OracleScenario[] }>(step.output),
      'Scenario developer'
    )
    if (!Array.isArray(parsed.scenarios) || parsed.scenarios.length === 0) {
      throw new Error('Scenario developer did not return any scenarios')
    }

    // Merge developed scenarios with skeleton data by ID
    const developedScenarios = parsed.scenarios.map((s) => {
      const skeleton = state.scenarioPortfolio.find((sk) => sk.id === s.id)
      if (!skeleton) {
        throw new Error(
          `Scenario developer returned scenario ${s.id} with no matching skeleton. Expected one of: ${state.scenarioPortfolio.map((sk) => sk.id).join(', ')}`
        )
      }
      return {
        ...skeleton,
        ...s,
        id: skeleton?.id ?? s.id,
      }
    })

    return {
      scenarioPortfolio: developedScenarios,
      steps: [step],
      totalTokensUsed: step.tokensUsed,
      totalEstimatedCost: step.estimatedCost,
      ...trackCost(state, step, 3, 'llm'),
    }
  })

  graph.addNode('red_team', async (state: OracleState) => {
    const budgetPause = getBudgetPauseUpdate(state, 'red_team', oracleConfig.maxBudgetUsd)
    if (budgetPause) return budgetPause

    log.info('Phase 3: Red Team', { runId: state.runId })

    const scenariosSummary = state.scenarioPortfolio
      .map((s) => `${s.id} "${s.name}": ${s.narrative.slice(0, 300)}`)
      .join('\n\n')

    const prompt = buildRedTeamPrompt(
      scenariosSummary,
      state.phaseSummaries,
      state.humanGateFeedback,
      oracleConfig.depthMode
    )
    const agent = { ...config.redTeam, systemPrompt: prompt }

    const step = await executeAgentWithEvents(
      agent,
      `Red team ${state.scenarioPortfolio.length} scenarios`,
      {},
      execContext,
      { nodeId: 'red_team' }
    )

    // Red team results get attached as tail risks on scenarios
    const parsed = requireParsedJson(
      safeParseJson<{
        assessments: Array<{
          scenarioId: string
          failureConditions?: Array<{
            condition: string
            probability: number
            earlyIndicator: string
          }>
          tailRisks: string[]
          overallRobustness: string
        }>
      }>(step.output),
      'Red team'
    )
    if (!Array.isArray(parsed.assessments) || parsed.assessments.length === 0) {
      throw new Error('Red team did not return any scenario assessments')
    }

    // Merge tail risks + failure conditions into scenarios
    const updated = state.scenarioPortfolio.map((s) => {
      const assessment = parsed.assessments.find((a) => a.scenarioId === s.id)
      if (!assessment) {
        throw new Error(`Red team assessment missing for scenario ${s.id}`)
      }
      // Merge failure conditions as tail risks for richer output
      const failureRisks = (assessment.failureConditions ?? []).map(
        (fc) => `${fc.condition} (P=${fc.probability}, indicator: ${fc.earlyIndicator})`
      )
      return {
        ...s,
        tailRisks: [...s.tailRisks, ...(assessment.tailRisks ?? []), ...failureRisks],
      }
    })

    return {
      scenarioPortfolio: updated,
      steps: [step],
      totalTokensUsed: step.tokensUsed,
      totalEstimatedCost: step.estimatedCost,
      ...trackCost(state, step, 3, 'llm'),
    }
  })

  // ===== GATE C =====

  graph.addNode('gate_c', async (state: OracleState) => {
    const budgetPause = getBudgetPauseUpdate(state, 'gate_c', oracleConfig.maxBudgetUsd)
    if (budgetPause) return budgetPause

    log.info('Gate C evaluation', { runId: state.runId })

    const prompt = buildGateEvaluatorPrompt('gate_c')
    const agent = { ...config.verifier, systemPrompt: prompt }

    const phaseOutput = `Scenarios: ${state.scenarioPortfolio.length}\n\n${state.scenarioPortfolio.map((s) => `${s.id} "${s.name}": ${s.narrative.slice(0, 200)}\nSignposts: ${s.signposts.join(', ')}\nTail risks: ${s.tailRisks.join(', ')}`).join('\n\n')}`

    const step = await executeAgentWithEvents(
      agent,
      `Evaluate Gate C`,
      { phaseOutput },
      execContext,
      { nodeId: 'gate_c' }
    )

    const rubricResult = parseRubricScores(step.output)
    if (!rubricResult) {
      throw new Error('Gate C evaluation output could not be parsed')
    }

    const { gateResult } = evaluateGate(
      {
        gateType: 'gate_c',
        phaseOutput,
        refinementAttempt: state.currentGateRefinements,
        maxRefinements: oracleConfig.maxRefinementsPerGate,
      },
      rubricResult.scores,
      rubricResult.llmFeedback
    )

    await emitOracleEvent(config, 'oracle_gate_result', {
      gate: 'gate_c',
      passed: gateResult.passed,
      averageScore: gateResult.averageScore,
      refinement: state.currentGateRefinements,
    })

    return {
      gateResults: [gateResult],
      currentGateRefinements: gateResult.passed ? 0 : state.currentGateRefinements + 1,
      ...maybeGateEscalation(
        gateResult,
        state.currentGateRefinements + 1,
        oracleConfig.maxRefinementsPerGate
      ),
      steps: [step],
      totalTokensUsed: step.tokensUsed,
      totalEstimatedCost: step.estimatedCost,
      ...trackCost(state, step, 3, 'evaluation'),
    }
  })

  // ===== Expert Council: Final Review =====

  graph.addNode('council_final', async (state: OracleState) => {
    if (!config.councilConfig?.enabled) {
      log.info('Council Final: skipped (not enabled)', { runId: state.runId })
      return {}
    }
    const budgetPause = getBudgetPauseUpdate(state, 'council_final', oracleConfig.maxBudgetUsd)
    if (budgetPause) return budgetPause

    log.info('Council Final: Expert Council review', { runId: state.runId })

    const scenariosSummary = state.scenarioPortfolio
      .map(
        (s) =>
          `${s.id} "${s.name}": ${s.narrative.slice(0, 400)}\nSignposts: ${s.signposts.join(', ')}\nTail risks: ${s.tailRisks.join(', ')}`
      )
      .join('\n\n')

    const humanFeedback = state.humanGateFeedback
      ? `\n\nHuman gate feedback to incorporate: ${state.humanGateFeedback}`
      : ''
    const prompt = `Final review of scenario portfolio for: "${state.goal}"\n\nScenarios: ${state.scenarioPortfolio.length}\n\n${scenariosSummary}\n\nAssess: Are scenarios truly distinct? Are signposts actionable? Are tail risks adequately covered? Is the portfolio decision-useful for the stated scope?${humanFeedback}`

    const result = await runCouncilAtGate(config, 'gate_c', prompt)
    if (!result) return {}

    // Populate councilAssessment on scenarios from council results
    const updatedScenarios = state.scenarioPortfolio.map((s) => ({
      ...s,
      councilAssessment: {
        agreementRate: result.councilRecord.convergenceRate,
        persistentDissent: result.councilRecord.persistentDissent,
      },
    }))

    return {
      scenarioPortfolio: updatedScenarios,
      councilRecords: [result.councilRecord],
      totalTokensUsed: result.totalTokens,
      totalEstimatedCost: result.totalCost,
      ...trackCost(
        state,
        {
          model: 'expert_council',
          tokensUsed: result.totalTokens,
          estimatedCost: result.totalCost,
        },
        3,
        'council'
      ),
    }
  })

  // ===== Backcasting =====

  graph.addNode('backcasting', async (state: OracleState) => {
    const budgetPause = getBudgetPauseUpdate(state, 'backcasting', oracleConfig.maxBudgetUsd)
    if (budgetPause) return budgetPause

    log.info('Phase 3: Backcasting', { runId: state.runId })

    const scenariosSummary = state.scenarioPortfolio
      .map((s) => `${s.id} "${s.name}": ${s.narrative.slice(0, 300)}`)
      .join('\n\n')

    const prompt = buildBackcastingPrompt(
      scenariosSummary,
      state.phaseSummaries,
      state.humanGateFeedback,
      oracleConfig.depthMode
    )
    const agent = { ...config.scenarioDeveloper, systemPrompt: prompt }

    const step = await executeAgentWithEvents(
      agent,
      `Backcast for ${state.scenarioPortfolio.length} scenarios`,
      {},
      execContext,
      { nodeId: 'backcasting' }
    )

    const parsed = requireParsedJson(
      safeParseJson<{
        backcastTimelines: BackcastTimeline[]
        strategicMoves: StrategicMove[]
      }>(step.output),
      'Backcasting'
    )
    if (!Array.isArray(parsed.backcastTimelines) || !Array.isArray(parsed.strategicMoves)) {
      throw new Error('Backcasting output did not include timelines and strategic moves')
    }

    return {
      backcastTimelines: parsed.backcastTimelines,
      strategicMoves: parsed.strategicMoves,
      steps: [step],
      totalTokensUsed: step.tokensUsed,
      totalEstimatedCost: step.estimatedCost,
      ...trackCost(state, step, 3, 'llm'),
    }
  })

  // ===== Final Output =====

  graph.addNode('final_output', async (state: OracleState) => {
    log.info('Generating final output', { runId: state.runId })

    const lowDiversityPairs = getLowDiversityScenarioPairs(state.scenarioPortfolio)
    for (const pair of lowDiversityPairs) {
      log.warn('Low scenario diversity detected', {
        scenario1: pair.scenarioA,
        scenario2: pair.scenarioB,
        overlap: pair.overlap,
      })
    }

    const scenarios = state.scenarioPortfolio
      .map(
        (s) =>
          `## ${s.name}\n${s.narrative}\n\n**Signposts:** ${s.signposts.join(', ')}\n**Tail risks:** ${s.tailRisks.join(', ')}`
      )
      .join('\n\n---\n\n')

    const moves = state.strategicMoves
      .map((m) => `- [${m.type}] ${m.description} (timing: ${m.timing})`)
      .join('\n')

    const warnings: string[] = []
    if (state.gateEscalated && state.gateEscalationFeedback) {
      warnings.push(`Gate escalation: ${state.gateEscalationFeedback}`)
    }
    if (state.degradedPhases.length > 0) {
      warnings.push(`Degraded phases: ${[...new Set(state.degradedPhases)].join(', ')}`)
    }
    if (lowDiversityPairs.length > 0) {
      warnings.push(
        `Low scenario diversity detected between: ${lowDiversityPairs.map((pair) => `${pair.scenarioA} vs ${pair.scenarioB}`).join('; ')}`
      )
    }
    if (state.humanGateFeedback) {
      warnings.push(`Human gate feedback applied: ${state.humanGateFeedback}`)
    }

    const warningsSection =
      warnings.length > 0
        ? `\n## Warnings\n${warnings.map((warning) => `- ${warning}`).join('\n')}\n`
        : ''

    const output = `# Oracle Scenario Planning Report: ${state.scope?.topic ?? state.goal}

## Scope
- Domain: ${state.scope?.domain}
- Time Horizon: ${state.scope?.timeHorizon}
- Geography: ${state.scope?.geography}
- Decision Context: ${state.scope?.decisionContext}

## Key Statistics
- Claims analyzed: ${state.claims.length}
- KG nodes: ${state.knowledgeGraph.nodes.length}, edges: ${state.knowledgeGraph.edges.length}
- Trends identified: ${state.trends.length}
- Critical uncertainties: ${state.uncertainties.length}
- Scenarios developed: ${state.scenarioPortfolio.length}
- Gates passed: ${state.gateResults.filter((g) => g.passed).length}/${state.gateResults.length}

## Scenarios

${scenarios}

## Strategic Moves

${moves}

## Strategic Moves by Type

### No-Regret Moves
${
  state.strategicMoves
    .filter((m) => m.type === 'no_regret')
    .map((m) => `- ${m.description} (timing: ${m.timing})`)
    .join('\n') || '(none)'
}

### Options to Buy
${
  state.strategicMoves
    .filter((m) => m.type === 'option_to_buy')
    .map((m) => `- ${m.description} (timing: ${m.timing})`)
    .join('\n') || '(none)'
}

### Hedges
${
  state.strategicMoves
    .filter((m) => m.type === 'hedge')
    .map((m) => `- ${m.description} (timing: ${m.timing})`)
    .join('\n') || '(none)'
}

### Kill Criteria
${
  state.strategicMoves
    .filter((m) => m.type === 'kill_criterion')
    .map((m) => `- ${m.description} (timing: ${m.timing})`)
    .join('\n') || '(none)'
}

${warningsSection}

## Cost
Total: $${state.costTracker.total.toFixed(4)}

## Model Limitations
*These scenarios are useful fictions — structured explorations of possibility space, not predictions. They are constrained by the evidence, axioms, and assumptions available at the time of analysis. The map is not the territory (AXM-094).*`

    await emitOracleEvent(config, 'oracle_phase', {
      phase: 3,
      phaseName: 'scenario_simulation',
      status: 'completed',
    })

    return {
      finalOutput: output,
      status: 'completed' as const,
      constraintPause: null,
      resumeNodeHint: null,
    }
  })

  // ===== Edges =====
  // Note: `as typeof START` is the standard workaround for LangGraph's
  // TypeScript string literal narrowing on dynamically added nodes.

  // Phase 0 → Phase 1
  graph.addConditionalEdges(START, (state: OracleState) => determineOracleStartNode(state))
  graph.addConditionalEdges(
    'input_normalizer' as typeof START,
    (state: OracleState) => nextNodeOrEnd(state, 'context_gathering'),
    { context_gathering: 'context_gathering' as typeof START, [END]: END }
  )
  graph.addConditionalEdges(
    'context_gathering' as typeof START,
    (state: OracleState) => nextNodeOrEnd(state, 'evidence_gathering'),
    { evidence_gathering: 'evidence_gathering' as typeof START, [END]: END }
  )
  graph.addConditionalEdges(
    'evidence_gathering' as typeof START,
    (state: OracleState) => nextNodeOrEnd(state, 'context_seeding'),
    { context_seeding: 'context_seeding' as typeof START, [END]: END }
  )
  graph.addConditionalEdges(
    'context_seeding' as typeof START,
    (state: OracleState) => nextNodeOrEnd(state, 'decomposer'),
    { decomposer: 'decomposer' as typeof START, [END]: END }
  )

  // Phase 1 chain
  graph.addConditionalEdges(
    'decomposer' as typeof START,
    (state: OracleState) => (state.status === 'paused' ? END : 'systems_mapper'),
    { systems_mapper: 'systems_mapper' as typeof START, [END]: END }
  )
  graph.addConditionalEdges(
    'systems_mapper' as typeof START,
    (state: OracleState) => nextNodeOrEnd(state, 'verifier'),
    { verifier: 'verifier' as typeof START, [END]: END }
  )
  graph.addConditionalEdges(
    'verifier' as typeof START,
    (state: OracleState) => nextNodeOrEnd(state, 'gate_a'),
    { gate_a: 'gate_a' as typeof START, [END]: END }
  )

  // Gate A routing → council_gate_a (always runs, no-ops if disabled)
  graph.addConditionalEdges('gate_a' as typeof START, (state: OracleState) => {
    if (state.status !== 'running') return END
    // Budget guard: if budget exceeded, skip refinements and proceed
    if (checkBudgetExceeded(state.costTracker, oracleConfig.maxBudgetUsd)) return 'council_gate_a'
    const lastGateA = [...state.gateResults].reverse().find((g) => g.gateType === 'gate_a')
    if (lastGateA?.passed) return 'council_gate_a'
    if (state.currentGateRefinements < oracleConfig.maxRefinementsPerGate) return 'decomposer'
    // Max refinements reached — pass anyway
    return 'council_gate_a'
  })

  // Council Gate A → Phase 1 summary → Phase 2
  graph.addConditionalEdges(
    'council_gate_a' as typeof START,
    (state: OracleState) => nextNodeOrEnd(state, 'phase_1_summary'),
    { phase_1_summary: 'phase_1_summary' as typeof START, [END]: END }
  )
  graph.addConditionalEdges(
    'phase_1_summary' as typeof START,
    (state: OracleState) => nextNodeOrEnd(state, 'scanner'),
    { scanner: 'scanner' as typeof START, [END]: END }
  )

  // Phase 2 chain
  graph.addConditionalEdges(
    'scanner' as typeof START,
    (state: OracleState) => nextNodeOrEnd(state, 'impact_assessor'),
    { impact_assessor: 'impact_assessor' as typeof START, [END]: END }
  )
  graph.addConditionalEdges(
    'impact_assessor' as typeof START,
    (state: OracleState) => nextNodeOrEnd(state, 'weak_signal_hunter'),
    { weak_signal_hunter: 'weak_signal_hunter' as typeof START, [END]: END }
  )
  graph.addConditionalEdges(
    'weak_signal_hunter' as typeof START,
    (state: OracleState) => nextNodeOrEnd(state, 'gate_b'),
    { gate_b: 'gate_b' as typeof START, [END]: END }
  )

  // Gate B routing → council_gate_b
  graph.addConditionalEdges('gate_b' as typeof START, (state: OracleState) => {
    if (state.status !== 'running') return END
    // Budget guard: if budget exceeded, skip refinements and proceed
    if (checkBudgetExceeded(state.costTracker, oracleConfig.maxBudgetUsd)) return 'council_gate_b'
    const lastGateB = [...state.gateResults].reverse().find((g) => g.gateType === 'gate_b')
    if (lastGateB?.passed) return 'council_gate_b'
    if (state.currentGateRefinements < oracleConfig.maxRefinementsPerGate) return 'scanner'
    return 'council_gate_b'
  })

  // Council Gate B → Phase 2 summary → Human Gate → Consistency Check → Phase 3
  graph.addConditionalEdges(
    'council_gate_b' as typeof START,
    (state: OracleState) => nextNodeOrEnd(state, 'phase_2_summary'),
    { phase_2_summary: 'phase_2_summary' as typeof START, [END]: END }
  )
  graph.addConditionalEdges(
    'phase_2_summary' as typeof START,
    (state: OracleState) => nextNodeOrEnd(state, 'human_gate'),
    { human_gate: 'human_gate' as typeof START, [END]: END }
  )

  // Human gate routing: if waiting for input, stop; otherwise continue
  graph.addConditionalEdges('human_gate' as typeof START, (state: OracleState) => {
    if (state.status !== 'running') return END
    return 'consistency_check'
  })

  graph.addConditionalEdges(
    'consistency_check' as typeof START,
    (state: OracleState) => nextNodeOrEnd(state, 'equilibrium_analyst'),
    { equilibrium_analyst: 'equilibrium_analyst' as typeof START, [END]: END }
  )

  // Phase 3 chain
  graph.addConditionalEdges(
    'equilibrium_analyst' as typeof START,
    (state: OracleState) => nextNodeOrEnd(state, 'scenario_developer'),
    { scenario_developer: 'scenario_developer' as typeof START, [END]: END }
  )
  graph.addConditionalEdges(
    'scenario_developer' as typeof START,
    (state: OracleState) => nextNodeOrEnd(state, 'red_team'),
    { red_team: 'red_team' as typeof START, [END]: END }
  )
  graph.addConditionalEdges(
    'red_team' as typeof START,
    (state: OracleState) => nextNodeOrEnd(state, 'gate_c'),
    { gate_c: 'gate_c' as typeof START, [END]: END }
  )

  // Gate C routing → council_final
  graph.addConditionalEdges('gate_c' as typeof START, (state: OracleState) => {
    if (state.status !== 'running') return END
    // Budget guard: if budget exceeded, skip refinements and proceed
    if (checkBudgetExceeded(state.costTracker, oracleConfig.maxBudgetUsd)) return 'council_final'
    const lastGateC = [...state.gateResults].reverse().find((g) => g.gateType === 'gate_c')
    if (lastGateC?.passed) return 'council_final'
    if (state.currentGateRefinements < oracleConfig.maxRefinementsPerGate)
      return 'scenario_developer'
    return 'council_final'
  })

  // Council Final → Backcasting → Final output → END
  graph.addConditionalEdges(
    'council_final' as typeof START,
    (state: OracleState) => nextNodeOrEnd(state, 'backcasting'),
    { backcasting: 'backcasting' as typeof START, [END]: END }
  )
  graph.addConditionalEdges(
    'backcasting' as typeof START,
    (state: OracleState) => nextNodeOrEnd(state, 'final_output'),
    { final_output: 'final_output' as typeof START, [END]: END }
  )
  graph.addEdge('final_output' as typeof START, END)

  return graph.compile()
}

// ----- Public Entry Point -----

export async function executeOracleWorkflowLangGraph(
  config: OracleGraphConfig,
  goal: string,
  context?: Record<string, unknown>,
  resumeState?: Partial<OracleState>
): Promise<{
  output: string
  steps: AgentExecutionStep[]
  totalTokensUsed: number
  totalEstimatedCost: number
  status: 'running' | 'completed' | 'failed' | 'paused' | 'waiting_for_input'
  constraintPause?: Run['constraintPause']
  pendingInput?: { prompt: string; nodeId: string }
  scenarioPortfolio: OracleScenario[]
  gateResults: OracleGateResult[]
  phaseSummaries: OraclePhaseSummary[]
  costTracker: OracleCostTracker
  knowledgeGraph: OracleKnowledgeGraph
  claims: OracleClaim[]
  searchPlan: OracleSearchPlan
  evidence: OracleEvidence[]
  trends: TrendObject[]
  uncertainties: UncertaintyObject[]
  backcastTimelines: BackcastTimeline[]
  strategicMoves: StrategicMove[]
  councilRecords: OracleCouncilRecord[]
  crossImpactMatrix: CrossImpactEntry[]
  humanGateFeedback?: string
  gateEscalated?: boolean
  gateEscalationFeedback?: string
  degradedPhases?: string[]
  workflowState?: Record<string, unknown>
}> {
  const { workflow, runId } = config
  const trimmedGoal = goal.trim()

  if (trimmedGoal.length === 0) {
    return {
      output: 'Oracle execution failed: Goal is required',
      steps: [],
      totalTokensUsed: 0,
      totalEstimatedCost: 0,
      status: 'failed',
      scenarioPortfolio: [],
      gateResults: [],
      phaseSummaries: [],
      costTracker: {
        total: 0,
        byPhase: {},
        byModel: {},
        byComponent: { search: 0, llm: 0, council: 0, evaluation: 0 },
      },
      knowledgeGraph: { nodes: [], edges: [], loops: [] },
      claims: [],
      searchPlan: {},
      evidence: [],
      trends: [],
      uncertainties: [],
      crossImpactMatrix: [],
      backcastTimelines: [],
      strategicMoves: [],
      councilRecords: [],
    }
  }

  let compiledGraph: ReturnType<typeof createOracleGraph>

  try {
    compiledGraph = createOracleGraph(config)
  } catch (initError) {
    const msg = initError instanceof Error ? initError.message : String(initError)
    log.error('Oracle graph initialization failed', { error: msg, runId })
    return {
      output: `Oracle initialization failed: ${msg}`,
      steps: [],
      totalTokensUsed: 0,
      totalEstimatedCost: 0,
      status: 'failed',
      scenarioPortfolio: [],
      gateResults: [],
      phaseSummaries: [],
      costTracker: {
        total: 0,
        byPhase: {},
        byModel: {},
        byComponent: { search: 0, llm: 0, council: 0, evaluation: 0 },
      },
      knowledgeGraph: { nodes: [], edges: [], loops: [] },
      claims: [],
      searchPlan: {},
      evidence: [],
      trends: [],
      uncertainties: [],
      crossImpactMatrix: [],
      backcastTimelines: [],
      strategicMoves: [],
      councilRecords: [],
    }
  }

  const freshState: Partial<OracleState> = {
    workflowId: workflow.workflowId,
    runId,
    userId: config.userId,
    goal: trimmedGoal,
    context: context ?? {},
    normalizedInput: null,
    goalFrame: null,
    startupSeedSummary: null,
    currentPhase: 'context_gathering',
    scope: null,
    searchPlan: {},
    claims: [],
    assumptions: [],
    evidence: [],
    knowledgeGraph: { nodes: [], edges: [], loops: [] },
    trends: [],
    uncertainties: [],
    crossImpactMatrix: [],
    humanGateApproved: false,
    humanGateFeedback: null,
    scenarioPortfolio: [],
    backcastTimelines: [],
    strategicMoves: [],
    phaseSummaries: [],
    gateResults: [],
    currentGateRefinements: 0,
    gateEscalated: false,
    gateEscalationFeedback: null,
    councilRecords: [],
    _skeletonCache: null,
    costTracker: {
      total: 0,
      byPhase: {},
      byModel: {},
      byComponent: { search: 0, llm: 0, council: 0, evaluation: 0 },
    },
    steps: [],
    totalTokensUsed: 0,
    totalEstimatedCost: 0,
    constraintPause: null,
    pendingInput: null,
    resumeNodeHint: null,
    finalOutput: null,
    status: 'running',
    error: null,
    degradedPhases: [],
  }

  // If resuming (e.g. after human gate approval), merge previous state
  // and ensure humanGateApproved is set so the gate passes on re-entry
  const humanGateFeedback =
    extractHumanGateFeedback(context) ?? resumeState?.humanGateFeedback ?? null
  const initialState: Partial<OracleState> = resumeState
    ? {
        ...freshState,
        ...resumeState,
        status: 'running',
        constraintPause: null,
        pendingInput: null,
        humanGateFeedback,
        humanGateApproved:
          resumeState.humanGateApproved === true ||
          resumeState.pendingInput?.nodeId === 'human_gate',
      }
    : {
        ...freshState,
        humanGateFeedback,
      }

  let finalState: OracleState
  try {
    // Dynamic recursion limit: 22 base nodes + refinement loops + safety margin
    // Gate A refinement: decomposer→systems_mapper→verifier→gate_a = 4 per loop
    // Gate B refinement: scanner→impact_assessor→weak_signal_hunter→gate_b = 4 per loop
    // Gate C refinement: scenario_developer→red_team→gate_c = 3 per loop
    const maxRef = config.oracleConfig.maxRefinementsPerGate
    const recursionLimit = 22 + maxRef * (4 + 4 + 3) + 10 // safety margin
    finalState = (await compiledGraph.invoke(initialState, { recursionLimit })) as OracleState
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e)
    log.error('Oracle graph execution failed', { error: errorMessage, runId })
    return {
      output: `Oracle execution failed: ${errorMessage}`,
      steps: [],
      totalTokensUsed: 0,
      totalEstimatedCost: 0,
      status: 'failed',
      scenarioPortfolio: [],
      gateResults: [],
      phaseSummaries: [],
      costTracker: {
        total: 0,
        byPhase: {},
        byModel: {},
        byComponent: { search: 0, llm: 0, council: 0, evaluation: 0 },
      },
      knowledgeGraph: { nodes: [], edges: [], loops: [] },
      claims: [],
      searchPlan: {},
      evidence: [],
      trends: [],
      uncertainties: [],
      crossImpactMatrix: [],
      backcastTimelines: [],
      strategicMoves: [],
      councilRecords: [],
    }
  }

  return {
    output: finalState.finalOutput ?? '',
    steps: finalState.steps ?? [],
    totalTokensUsed: finalState.totalTokensUsed ?? 0,
    totalEstimatedCost: finalState.totalEstimatedCost ?? 0,
    status: finalState.status ?? 'completed',
    constraintPause: finalState.constraintPause ?? undefined,
    pendingInput: finalState.pendingInput ?? undefined,
    scenarioPortfolio: finalState.scenarioPortfolio ?? [],
    gateResults: finalState.gateResults ?? [],
    phaseSummaries: finalState.phaseSummaries ?? [],
    costTracker: finalState.costTracker ?? {
      total: 0,
      byPhase: {},
      byModel: {},
      byComponent: { search: 0, llm: 0, council: 0, evaluation: 0 },
    },
    knowledgeGraph: finalState.knowledgeGraph ?? { nodes: [], edges: [], loops: [] },
    claims: finalState.claims ?? [],
    searchPlan: finalState.searchPlan ?? {},
    evidence: finalState.evidence ?? [],
    trends: finalState.trends ?? [],
    uncertainties: finalState.uncertainties ?? [],
    backcastTimelines: finalState.backcastTimelines ?? [],
    strategicMoves: finalState.strategicMoves ?? [],
    councilRecords: finalState.councilRecords ?? [],
    crossImpactMatrix: finalState.crossImpactMatrix ?? [],
    humanGateFeedback: finalState.humanGateFeedback ?? undefined,
    gateEscalated: finalState.gateEscalated || undefined,
    gateEscalationFeedback: finalState.gateEscalationFeedback ?? undefined,
    degradedPhases: finalState.degradedPhases?.length ? finalState.degradedPhases : undefined,
    workflowState: buildPersistedOracleWorkflowState(finalState),
  }
}
