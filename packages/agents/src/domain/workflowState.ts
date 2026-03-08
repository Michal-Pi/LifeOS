/**
 * Unified Workflow State Schema for LangGraph
 *
 * This module defines the state schema that will be shared across all workflow types
 * (sequential, parallel, supervisor, graph, custom, dialectical) when running on LangGraph.
 */

import type { Message, ModelProvider, RunId, ToolCall, ToolResult, WorkflowId } from './models'
import type {
  DeepResearchAnswer,
  ExtractedClaim,
  KGSnapshot,
  RunBudget,
  SourceRecord,
} from './deepResearchWorkflow'
import type {
  OraclePhase,
  OracleScope,
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
  OracleCouncilRecord,
  OracleCostTracker,
} from './oracleWorkflow'

// ----- Agent Execution Step -----

/**
 * Result from a single agent execution within a workflow
 */
export interface AgentExecutionStep {
  agentId: string
  agentName: string
  output: string
  tokensUsed: number
  estimatedCost: number
  provider: string
  model: string
  executedAtMs: number
  iterationsUsed?: number
  agentRole?: string
  /** Populated when the agent invoked the ask_user tool to request user input */
  askUserInterrupt?: { question: string }
}

// ----- Iteration Usage Summary -----

/**
 * Compact summary of iteration usage per agent role for a completed run.
 * Stored in Firestore for historical budget learning.
 */
export interface IterationUsageSummary {
  perRole: {
    thesis: { avg: number; max: number; count: number }
    negation: { avg: number; max: number; count: number }
    synthesis: { avg: number; max: number; count: number }
    meta: { avg: number; max: number; count: number }
  }
  allocatedBudget: {
    perThesisAgent: number
    perNegationAgent: number
    perSynthesisAgent: number
    perMetaAgent: number
  }
  totalCycles: number
  avgToolCount: number
  completedAtMs: number
  workflowId: string
}

// ----- LangGraph State Channels -----

/**
 * Core state fields shared by all workflow types
 */
export interface CoreWorkflowState {
  // Identifiers
  workflowId: WorkflowId
  runId: RunId
  userId: string

  // Input
  goal: string
  context: Record<string, unknown>

  // Execution tracking
  currentNodeId: string | null
  pendingNodes: string[]
  steps: AgentExecutionStep[]
  stepCount: number

  // Messages and tool calls
  messages: Message[]
  toolCalls: ToolCall[]
  toolResults: ToolResult[]

  // Metrics
  totalTokensUsed: number
  totalEstimatedCost: number

  // Output
  lastOutput: unknown
  finalOutput: string | null

  // Status
  status: 'running' | 'completed' | 'failed' | 'paused' | 'waiting_for_input'
  error: string | null

  // Pending input (for human-in-the-loop)
  pendingInput: {
    prompt: string
    nodeId: string
  } | null
}

/**
 * State extension for graph-based workflows
 */
export interface GraphWorkflowState {
  // Graph traversal
  visitedCount: Record<string, number>
  edgeHistory: Array<{ from: string; to: string; atMs: number }>

  // Join node aggregation
  joinOutputs: Record<string, unknown>
  joinBuffers: Record<string, JoinBufferEntry[]>

  // Named outputs from nodes
  namedOutputs: Record<string, unknown>

  // Deep research integration
  pendingResearchRequestId: string | null
  pendingResearchOutputKey: string | null
}

/**
 * Join buffer entry for aggregating parallel outputs
 */
export interface JoinBufferEntry {
  agentId?: string
  agentName?: string
  role?: string
  output: string
  confidence?: number
}

/**
 * State extension for dialectical workflows (Hegel)
 */
export interface DialecticalWorkflowState {
  // Cycle tracking
  cycleNumber: number
  phase: DialecticalPhase

  // Dialectical outputs
  theses: ThesisOutput[]
  negations: NegationOutput[]
  contradictions: ContradictionOutput[]
  synthesis: SublationOutput | null

  // Metrics
  conceptualVelocity: number
  kgDiff: KGDiff | null

  // Meta-reflection
  metaDecision: MetaDecision | null
}

export type DialecticalPhase =
  | 'retrieve_context'
  | 'thesis_generation'
  | 'cross_negation'
  | 'contradiction_crystallization'
  | 'sublation'
  | 'regrounding'
  | 'meta_reflection'

export type MetaDecision = 'CONTINUE' | 'TERMINATE' | 'RESPECIFY'

/**
 * Thesis output from thesis generation phase
 */
export interface ThesisOutput {
  agentId: string
  model: string
  lens: string
  conceptGraph: Record<string, unknown>
  causalModel: string[]
  falsificationCriteria: string[]
  decisionImplications: string[]
  unitOfAnalysis: string
  temporalGrain: string
  regimeAssumptions: string[]
  confidence: number
  rawText: string
  graph?: CompactGraph
}

/**
 * Negation output from cross-negation phase
 */
export interface NegationOutput {
  agentId: string
  targetThesisAgentId: string
  internalTensions: string[]
  categoryAttacks: string[]
  preservedValid: string[]
  rivalFraming: string
  rewriteOperator: RewriteOperatorType
  /** Multiple rewrite operators for compound transformations */
  rewriteOperators?: Array<{ type: RewriteOperatorType; target: string; rationale: string }>
  operatorArgs: Record<string, unknown>
  rawText: string
}

/**
 * Contradiction output from crystallization phase
 */
export interface ContradictionOutput {
  id: string
  type: 'SYNCHRONIC' | 'DIACHRONIC' | 'REGIME_SHIFT'
  severity: 'HIGH' | 'MEDIUM' | 'LOW'
  actionDistance: number
  participatingClaims: string[]
  trackerAgent: string
  description: string
}

/**
 * Sublation output from synthesis phase
 */
export interface SublationOutput {
  operators: RewriteOperator[]
  preservedElements: string[]
  negatedElements: string[]
  newConceptGraph: Record<string, unknown>
  newClaims: Array<{ id: string; text: string; confidence: number }>
  newPredictions: Array<{ id: string; text: string; threshold: string }>
  schemaDiff: Record<string, unknown> | null
  incompleteReason?: string
}

/**
 * Typed rewrite operators for graph transformation
 */
export type RewriteOperatorType =
  | 'SPLIT'
  | 'MERGE'
  | 'REVERSE_EDGE'
  | 'ADD_MEDIATOR'
  | 'SCOPE_TO_REGIME'
  | 'TEMPORALIZE'

export interface RewriteOperator {
  type: RewriteOperatorType
  target: string
  args: Record<string, unknown>
  rationale: string
}

/**
 * Compact graph representation of a thesis.
 * Structure (~400 chars) + reasoning (≤500 chars) for hybrid token efficiency + nuance.
 */
export interface CompactGraph {
  nodes: Array<{
    id: string
    label: string
    type: 'claim' | 'concept' | 'mechanism' | 'prediction'
    note?: string
    /** Source attribution for research-backed nodes */
    sourceId?: string
    sourceUrl?: string
    sourceConfidence?: number
  }>
  edges: Array<{
    from: string
    to: string
    rel: 'causes' | 'contradicts' | 'supports' | 'mediates' | 'scopes'
    weight?: number
  }>
  summary: string
  reasoning: string
  confidence: number
  regime: string
  temporalGrain: string
}

/**
 * Snapshot of a KG serialized to a CompactGraph at a point in time.
 * Used to capture KG state between research and dialectical phases.
 */
export interface KGCompactSnapshot {
  graph: CompactGraph
  claimCount: number
  conceptCount: number
  sourceCount: number
  contradictionEdgeCount: number
  snapshotAtMs: number
  gapIteration: number
}

/**
 * Diff between two graphs — tracks what changed per cycle
 */
export interface GraphDiff {
  addedNodes: string[]
  removedNodes: string[]
  addedEdges: Array<{ from: string; to: string; rel: string }>
  removedEdges: Array<{ from: string; to: string; rel: string }>
  modifiedNodes: Array<{ id: string; oldLabel: string; newLabel: string }>
  resolvedContradictions: string[]
  newContradictions: string[]
}

/**
 * Knowledge graph diff tracking changes per cycle
 */
export interface KGDiff {
  conceptSplits: Array<{ from: string; to: string[] }>
  conceptMerges: Array<{ from: string[]; to: string }>
  newMediators: Array<{ edge: string; mediator: string }>
  edgeReversals: Array<{ edge: string }>
  regimeScopings: Array<{ claim: string; regime: string }>
  temporalizations: Array<{ claims: string[]; sequence: string[] }>
  newClaims: Array<{ id: string; text: string }>
  supersededClaims: string[]
  newContradictions: ContradictionOutput[]
  resolvedContradictions: string[]
  newPredictions: Array<{ id: string; text: string }>
}

/**
 * State extension for expert council execution
 */
export interface ExpertCouncilWorkflowState {
  councilTurnId: string | null
  councilResponses: Array<{
    modelId: string
    provider: ModelProvider
    modelName: string
    answerText: string
    tokensUsed?: number
    estimatedCost?: number
  }>
  judgeReviews: Array<{
    judgeModelId: string
    critiques: Record<string, string>
    ranking: string[]
    confidenceScore?: number
  }>
  aggregateRanking: Array<{
    label: string
    modelId: string
    bordaScore: number
    averageRank: number
  }>
  chairmanResponse: string | null
}

/**
 * State extension for deep research workflows
 */
export interface DeepResearchWorkflowState {
  budget: RunBudget
  sources: SourceRecord[]
  extractedClaims: ExtractedClaim[]
  kgSnapshots: KGSnapshot[]
  kgSessionId: string | null
  gapIterationsUsed: number
  answer: DeepResearchAnswer | null
  mergedGraph?: CompactGraph
  graphHistory?: Array<{ cycle: number; diff: GraphDiff }>
}

/**
 * State extension for Oracle scenario planning workflows
 */
export interface OracleWorkflowState {
  currentPhase: OraclePhase
  scope: OracleScope | null

  // Reasoning Ledger
  reasoningLedger: {
    claims: OracleClaim[]
    assumptions: OracleAssumption[]
    evidence: OracleEvidence[]
  }

  // Knowledge Graph
  knowledgeGraph: OracleKnowledgeGraph

  // Phase 2 outputs
  trends: TrendObject[]
  uncertainties: UncertaintyObject[]
  crossImpactMatrix: CrossImpactEntry[]
  humanGateApproved: boolean

  // Phase 3 outputs
  scenarioPortfolio: OracleScenario[]
  backcastTimelines: BackcastTimeline[]
  strategicMoves: StrategicMove[]

  // Cross-cutting
  phaseSummaries: OraclePhaseSummary[]
  gateResults: OracleGateResult[]
  councilRecords: OracleCouncilRecord[]
  costTracker: OracleCostTracker
  refinementCounts: Record<string, number>
}

// ----- Unified Workflow State -----

/**
 * Complete unified workflow state that combines all extensions
 *
 * LangGraph will use this as the state schema, with optional extensions
 * for different workflow types.
 */
export interface UnifiedWorkflowState extends CoreWorkflowState {
  // Graph workflow extension
  graph?: GraphWorkflowState

  // Dialectical workflow extension (Hegel)
  dialectical?: DialecticalWorkflowState

  // Expert council extension
  expertCouncil?: ExpertCouncilWorkflowState

  // Deep research extension
  deepResearch?: DeepResearchWorkflowState

  // Oracle scenario planning extension
  oracle?: OracleWorkflowState
}

// ----- State Initialization -----

/**
 * Create initial core workflow state
 */
export function createInitialCoreState(params: {
  workflowId: WorkflowId
  runId: RunId
  userId: string
  goal: string
  context?: Record<string, unknown>
}): CoreWorkflowState {
  return {
    workflowId: params.workflowId,
    runId: params.runId,
    userId: params.userId,
    goal: params.goal,
    context: params.context ?? {},
    currentNodeId: null,
    pendingNodes: [],
    steps: [],
    stepCount: 0,
    messages: [],
    toolCalls: [],
    toolResults: [],
    totalTokensUsed: 0,
    totalEstimatedCost: 0,
    lastOutput: null,
    finalOutput: null,
    status: 'running',
    error: null,
    pendingInput: null,
  }
}

/**
 * Create initial graph workflow state extension
 */
export function createInitialGraphState(_startNodeId: string): GraphWorkflowState {
  return {
    visitedCount: {},
    edgeHistory: [],
    joinOutputs: {},
    joinBuffers: {},
    namedOutputs: {},
    pendingResearchRequestId: null,
    pendingResearchOutputKey: null,
  }
}

/**
 * Create initial dialectical workflow state extension
 */
export function createInitialDialecticalState(): DialecticalWorkflowState {
  return {
    cycleNumber: 0,
    phase: 'retrieve_context',
    theses: [],
    negations: [],
    contradictions: [],
    synthesis: null,
    conceptualVelocity: 0,
    kgDiff: null,
    metaDecision: null,
  }
}

/**
 * Create initial expert council state extension
 */
export function createInitialExpertCouncilState(): ExpertCouncilWorkflowState {
  return {
    councilTurnId: null,
    councilResponses: [],
    judgeReviews: [],
    aggregateRanking: [],
    chairmanResponse: null,
  }
}

/**
 * Create initial deep research state extension
 */
export function createInitialDeepResearchState(): DeepResearchWorkflowState {
  return {
    budget: {
      maxBudgetUsd: 0,
      spentUsd: 0,
      spentTokens: 0,
      searchCallsUsed: 0,
      maxSearchCalls: 0,
      llmCallsUsed: 0,
      phase: 'full',
      maxRecursiveDepth: 3,
      gapIterationsUsed: 0,
    },
    sources: [],
    extractedClaims: [],
    kgSnapshots: [],
    kgSessionId: null,
    gapIterationsUsed: 0,
    answer: null,
  }
}

/**
 * Create initial Oracle scenario planning state extension
 */
export function createInitialOracleState(): OracleWorkflowState {
  return {
    currentPhase: 'context_gathering',
    scope: null,
    reasoningLedger: {
      claims: [],
      assumptions: [],
      evidence: [],
    },
    knowledgeGraph: {
      nodes: [],
      edges: [],
      loops: [],
    },
    trends: [],
    uncertainties: [],
    crossImpactMatrix: [],
    humanGateApproved: false,
    scenarioPortfolio: [],
    backcastTimelines: [],
    strategicMoves: [],
    phaseSummaries: [],
    gateResults: [],
    councilRecords: [],
    costTracker: {
      total: 0,
      byPhase: {},
      byModel: {},
      byComponent: { search: 0, llm: 0, council: 0, evaluation: 0 },
    },
    refinementCounts: {},
  }
}
