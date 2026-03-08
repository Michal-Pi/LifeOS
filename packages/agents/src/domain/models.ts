import type { Id } from '@lifeos/core'
import type { ProjectManagerConfig } from './projectManager'
import type { PromptReference } from './promptLibrary'
export type { ProjectManagerConfig } from './projectManager'

// ----- IDs -----

export type AgentId = Id<'agent'>
export type WorkflowId = Id<'workflow'>
export type RunId = Id<'run'>
export type MessageId = Id<'message'>
export type ToolId = Id<'tool'>
export type ToolCallRecordId = Id<'toolCallRecord'>
export type WorkflowStepId = Id<'workflowStep'>
export type AgentTemplateId = Id<'agentTemplate'>
export type WorkflowTemplateId = Id<'workflowTemplate'>
export type DeepResearchRequestId = Id<'research'>

// ----- Sync State -----

export type SyncState = 'synced' | 'pending' | 'conflict'

// ----- Model Tier System -----

export type ModelTier = 'thinking' | 'balanced' | 'fast'
export type WorkflowExecutionMode = 'as_designed' | 'cost_saving'
export type WorkflowCriticality = 'critical' | 'core' | 'routine'

// ----- Enums -----

export type AgentRole =
  | 'planner'
  | 'researcher'
  | 'critic'
  | 'synthesizer'
  | 'executor'
  | 'supervisor'
  | 'custom'
  // Dialectical roles
  | 'thesis_generator'
  | 'antithesis_agent'
  | 'contradiction_tracker'
  | 'synthesis_agent'
  | 'meta_reflection'
  | 'schema_induction'
  // Deep research roles
  | 'research_planner'
  | 'claim_extractor'
  | 'gap_analyst'
  | 'answer_generator'
  // Workflow-specific roles
  | 'coordinator'
  | 'validator'
  | 'formatter'
  | 'summarizer'
  | 'router'
  // Domain-specific roles
  | 'writer'
  | 'editor'
  | 'analyst'
  | 'advisor'
  | 'translator'
  // Oracle scenario planning roles
  | 'context_gatherer'
  | 'decomposer'
  | 'systems_mapper'
  | 'verifier'
  | 'scanner'
  | 'impact_assessor'
  | 'weak_signal_hunter'
  | 'scenario_developer'
  | 'equilibrium_analyst'
  | 'red_team'
  | 'gate_evaluator'
  | 'consistency_checker'

export type ModelProvider = 'openai' | 'anthropic' | 'google' | 'xai'

export type RunStatus =
  | 'pending'
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'paused'
  | 'waiting_for_input'

export type MessageRole = 'user' | 'assistant' | 'system' | 'tool'

export type ToolCallStatus = 'pending' | 'running' | 'completed' | 'failed'

export type WorkflowNodeType =
  | 'agent'
  | 'tool'
  | 'human_input'
  | 'fork'
  | 'join'
  | 'end'
  | 'research_request'
  // Dialectical phase nodes
  | 'retrieve_context'
  | 'generate_theses'
  | 'cross_negation'
  | 'crystallize_contradictions'
  | 'sublate'
  | 'meta_reflect'
  // Deep research phase nodes
  | 'sense_making'
  | 'search_planning'
  | 'search_execution'
  | 'source_ingestion'
  | 'claim_extraction'
  | 'kg_construction'
  | 'gap_analysis'
  | 'answer_generation'
  // Oracle scenario planning phase nodes
  | 'oracle_context_gathering'
  | 'oracle_decomposition'
  | 'oracle_trend_scanning'
  | 'oracle_scenario_simulation'
  | 'oracle_gate_evaluation'
  | 'oracle_council_review'
  // Composition node
  | 'subworkflow'
  // Approval node
  | 'human_approval'

export type WorkflowEdgeConditionType =
  | 'always'
  | 'equals'
  | 'contains'
  | 'regex'
  | 'llm_evaluate'
  | 'error'

export type JoinAggregationMode =
  | 'list'
  | 'ranked'
  | 'consensus'
  | 'synthesize'
  | 'dedup_combine'
  | 'concatenate'

export type ExecutionMode = 'full' | 'quick' | 'single' | 'custom'

export type DeepResearchPriority = 'low' | 'medium' | 'high' | 'critical'
export type DeepResearchStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled'
export type DeepResearchSource = 'claude' | 'chatgpt' | 'gemini' | 'other'

// ----- Brand Voice & Content Pipeline Config (Phase 43) -----

export interface BrandVoice {
  tone: string
  vocabulary: string[]
  structure: string
  examples: string[]
}

export interface ContentPipelineConfig {
  brandVoice?: BrandVoice
  seoFirstMode?: boolean
}

// ----- Coaching Context (Phase 48) -----

export interface CoachingContext {
  businessDescription: string
  targetAudience: string
  competitorNames: string[]
  pastDecisions: Array<{ date: string; decision: string; outcome?: string }>
  competitiveLandscape?: string
  contentCalendar?: Array<{ day: string; topic: string; format: string; platform: string }>
}

// ----- Structured Plan Output (Phase 42) -----

export interface StructuredPlanTask {
  title: string
  description: string
  dependencies: string[]
  estimatedHours: number
  assignee?: string
  milestone?: string
}

export interface StructuredPlanMilestone {
  name: string
  tasks: StructuredPlanTask[]
}

export interface StructuredPlan {
  projectName: string
  milestones: StructuredPlanMilestone[]
  summary: string
}

// ----- Agent Configuration -----

export interface AgentConfig {
  agentId: AgentId
  userId: string

  name: string
  role: AgentRole
  systemPrompt: string

  // Model configuration
  modelProvider: ModelProvider
  modelName: string
  temperature?: number // 0-2, default 0.7
  maxTokens?: number // default varies by model

  // Model tier (defaults to 'balanced' if unset)
  modelTier?: ModelTier

  // Tool permissions
  toolIds?: ToolId[] // Which tools this agent can use

  // Deduplication
  configHash?: string // Hash of config for dedup lookup

  // Metadata
  description?: string
  archived: boolean
  createdAtMs: number
  updatedAtMs: number

  syncState: SyncState
  version: number
}

/**
 * Creates a deterministic hash of an agent config for deduplication.
 * Two agents with the same hash are functionally identical.
 */
export function hashAgentConfig(config: {
  systemPrompt: string
  role: AgentRole
  toolIds?: ToolId[]
  modelProvider: ModelProvider
  modelName: string
  temperature?: number
  modelTier?: ModelTier
}): string {
  const normalized = JSON.stringify({
    systemPrompt: config.systemPrompt,
    role: config.role,
    toolIds: [...(config.toolIds ?? [])].sort(),
    modelProvider: config.modelProvider,
    modelName: config.modelName,
    temperature: config.temperature ?? 0.7,
    modelTier: config.modelTier ?? 'balanced',
  })
  // FNV-1a inspired 53-bit hash (uses safe integer range for JS)
  let h1 = 0x811c9dc5 >>> 0
  let h2 = 0x01000193 >>> 0
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized.charCodeAt(i)
    h1 = Math.imul(h1 ^ char, 0x01000193) >>> 0
    h2 = Math.imul(h2 ^ char, 0x00010001) >>> 0
  }
  // Combine into a wider hash string (64-bit via two 32-bit halves)
  return `cfghash_${h1.toString(36)}_${h2.toString(36)}`
}

// ----- Workflow -----

export interface Workflow {
  workflowId: WorkflowId
  userId: string

  name: string
  description?: string

  // Agent configuration
  agentIds: AgentId[] // Agents available in this workflow
  defaultAgentId?: AgentId // Agent that starts the workflow

  // Expert Council configuration (optional)
  expertCouncilConfig?: ExpertCouncilConfig
  projectManagerConfig?: ProjectManagerConfig
  promptConfig?: {
    agentPrompts?: Record<string, PromptReference>
    toneOfVoicePrompt?: PromptReference
    workflowPrompts?: Record<string, PromptReference>
    toolPrompts?: Record<string, PromptReference>
    synthesisPrompts?: Record<string, PromptReference>
  }

  // Workflow configuration
  workflowType:
    | 'sequential'
    | 'parallel'
    | 'supervisor'
    | 'custom'
    | 'graph'
    | 'dialectical'
    | 'deep_research'
    | 'oracle'
  workflowGraph?: WorkflowGraph
  parallelMergeStrategy?: JoinAggregationMode // Only used when workflowType === 'parallel'
  maxIterations?: number // Prevent infinite loops, default 10

  // Memory configuration (Phase 6A)
  memoryMessageLimit?: number // Optional default for conversation history window

  // Cost optimization
  criticality?: WorkflowCriticality // Determines cost-saving behavior
  enableContextCompression?: boolean // Compress output between sequential agents (default: per criticality)
  earlyExitPatterns?: string[] // If agent output contains any of these patterns, skip remaining agents
  enableQualityGates?: boolean // After each agent, score output 1-5; retry with stronger model if < threshold
  qualityGateThreshold?: number // Score threshold for quality gate (default 3, range 1-5)

  // Parallel workflow options
  heterogeneousModels?: boolean // Rotate providers across parallel branches for diversity
  adaptiveFanOut?: boolean // For consensus merge: if consensus low, spawn additional agents
  maxBudget?: number // Maximum USD budget for this workflow run

  // Supervisor workflow options
  maxTokensPerWorker?: number // Per-worker token budget for supervisor workflows

  // Checkpointing
  enableCheckpointing?: boolean // Enable Firestore checkpointing for resumable execution

  // Metadata
  archived: boolean
  createdAtMs: number
  updatedAtMs: number

  syncState: SyncState
  version: number
}

// ----- Templates (Phase 6D) -----

export interface AgentTemplate {
  templateId: AgentTemplateId
  userId: string

  name: string
  description?: string

  agentConfig: Omit<
    AgentConfig,
    'agentId' | 'userId' | 'archived' | 'createdAtMs' | 'updatedAtMs' | 'syncState' | 'version'
  >

  createdAtMs: number
  updatedAtMs: number
}

export interface TemplateParameter {
  /** Human-readable label (also used as the substitution key) */
  name?: string
  description: string
  /** Data type hint for UI rendering (default: 'string') */
  type?: 'string' | 'number' | 'boolean'
  required: boolean
  defaultValue?: string
}

export interface WorkflowTemplate {
  templateId: WorkflowTemplateId
  userId: string

  name: string
  description?: string

  workflowConfig: Omit<
    Workflow,
    'workflowId' | 'userId' | 'archived' | 'createdAtMs' | 'updatedAtMs' | 'syncState' | 'version'
  >

  /** Template parameters — variables like {{topic}} that users fill in at run time */
  parameters?: Record<string, TemplateParameter>

  createdAtMs: number
  updatedAtMs: number
}

// ----- Run (Execution Instance) -----

export interface Run {
  runId: RunId
  workflowId: WorkflowId
  userId: string

  // Input
  goal: string // User's input prompt
  context?: Record<string, unknown> // Additional context data
  memoryMessageLimit?: number // Per-run override for conversation history window

  // Model tier overrides
  executionMode?: WorkflowExecutionMode // 'as_designed' | 'cost_saving'
  tierOverride?: ModelTier | null // Forces all agents to this tier

  // Status
  status: RunStatus
  currentStep: number
  totalSteps?: number // Estimated

  // Results
  output?: string // Final synthesized output
  error?: string // Error message if failed
  pendingInput?: {
    prompt: string
    nodeId: string
  }

  // Constraint pause — workflow paused because a budget/iteration limit was reached
  constraintPause?: {
    constraintType:
      | 'budget'
      | 'max_node_visits'
      | 'max_cycles'
      | 'max_gap_iterations'
      | 'max_dialectical_cycles'
      | 'quota_tokens'
      | 'quota_cost'
      | 'quota_runs'
      | 'rate_runs_per_hour'
      | 'rate_tokens_per_day'
      | 'rate_cost_per_day'
      | 'rate_provider'
      | 'max_oracle_refinements'
      | 'oracle_human_gate'
    currentValue: number
    limitValue: number
    unit: string // 'USD', 'visits', 'cycles', 'iterations', 'tokens', 'runs', 'runs/hour'
    partialOutput?: string // Summary of progress so far
    suggestedIncrease?: number
  }

  queueInfo?: {
    reason:
      | 'quota_tokens'
      | 'quota_cost'
      | 'quota_runs'
      | 'rate_runs_per_hour'
      | 'rate_tokens_per_day'
      | 'rate_cost_per_day'
      | 'rate_provider'
    queuedAtMs: number
    nextRetryAtMs: number
    retryCount: number
  }

  workflowState?: WorkflowState

  // Phase 5E: Enhanced error tracking
  errorCategory?:
    | 'network'
    | 'auth'
    | 'rate_limit'
    | 'validation'
    | 'timeout'
    | 'internal'
    | 'quota'
  errorDetails?: Record<string, unknown> // Technical details for debugging
  quotaExceeded?: boolean // True if run failed due to quota limits
  promptResolutionErrors?: Array<{
    agentId: string
    promptType: string
    error: string
  }>

  // Metrics
  startedAtMs: number
  completedAtMs?: number
  tokensUsed?: number
  estimatedCost?: number // USD

  // Evaluation
  evaluationScores?: {
    relevance: number // 1-5: How relevant is the output to the goal?
    completeness: number // 1-5: Does it fully address the goal?
    accuracy: number // 1-5: Is the content factually sound?
    evaluatedAtMs: number // When evaluation was performed
  }

  syncState: SyncState
  version: number
}

// ----- Deep Research Requests -----

export interface DeepResearchResult {
  source: DeepResearchSource
  model: string
  content: string
  uploadedAtMs: number
  uploadedBy: string
}

export interface DeepResearchRequest {
  requestId: DeepResearchRequestId
  workflowId: WorkflowId
  runId: RunId
  userId: string
  topic: string
  questions: string[]
  context?: Record<string, unknown>
  priority: DeepResearchPriority
  estimatedTime?: string
  createdBy: AgentId
  createdAtMs: number
  status: DeepResearchStatus
  results?: DeepResearchResult[]
  synthesizedFindings?: string
  integratedAtMs?: number
}

// ----- Message (Agent Interaction) -----

export interface ToolCall {
  toolCallId: string
  toolId: ToolId
  toolName: string
  parameters: Record<string, unknown>
}

export interface ToolResult {
  toolCallId: string
  result: unknown
  error?: string
}

export interface Message {
  messageId: MessageId
  runId: RunId
  agentId?: AgentId // Null for user messages

  role: MessageRole
  content: string

  // Tool usage
  toolCalls?: ToolCall[]
  toolResults?: ToolResult[]

  // Metadata
  timestampMs: number
  tokensUsed?: number
}

// ----- Workflow Graph (Phase 6E) -----

export interface WorkflowEdgeCondition {
  type: WorkflowEdgeConditionType
  key?: string
  value?: string
  /** Prompt for llm_evaluate condition type — the LLM decides yes/no based on this prompt */
  prompt?: string
}

export interface WorkflowNode {
  id: string
  type: WorkflowNodeType
  agentId?: AgentId
  toolId?: ToolId
  label?: string
  outputKey?: string
  aggregationMode?: JoinAggregationMode
  /** Reference to another workflow (for subworkflow nodes) */
  subworkflowId?: WorkflowId
  requestConfig?: {
    topic: string
    questions: string[]
    priority: DeepResearchPriority
    waitForCompletion: boolean
    estimatedTime?: string
    context?: Record<string, unknown>
  }
}

export interface WorkflowEdge {
  from: string
  to: string
  condition: WorkflowEdgeCondition
}

export interface WorkflowGraph {
  version: 1
  startNodeId: string
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
  limits?: {
    maxNodeVisits?: number
    maxEdgeRepeats?: number
  }
}

export interface WorkflowState {
  currentNodeId?: string
  pendingNodes?: string[]
  visitedCount?: Record<string, number>
  edgeHistory?: Array<{ from: string; to: string; atMs: number }>
  joinOutputs?: Record<string, unknown>
  namedOutputs?: Record<string, unknown>
  pendingResearchRequestId?: string
  pendingResearchOutputKey?: string

  // Dialectical workflow state (Hegel)
  dialectical?: {
    cycleNumber: number
    maxCycles: number
    phase: import('./workflowState').DialecticalPhase
    theses: import('./workflowState').ThesisOutput[]
    negations: import('./workflowState').NegationOutput[]
    contradictions: import('./workflowState').ContradictionOutput[]
    synthesis: import('./workflowState').SublationOutput | null
    mergedGraph: import('./workflowState').CompactGraph | null
    graphHistory: Array<{ cycle: number; diff: import('./workflowState').GraphDiff }>
    conceptualVelocity: number
    velocityHistory: number[]
    contradictionDensity: number
    densityHistory: number[]
    metaDecision: import('./workflowState').MetaDecision | null
    tokensUsed: number
    estimatedCost: number
    startedAtMs: number
  }

  // Oracle scenario planning state
  // These fields mirror what the executor stores in `workflowState`
  oracle?: {
    scenarioPortfolio: import('./oracleWorkflow').OracleScenario[]
    gateResults: import('./oracleWorkflow').OracleGateResult[]
    phaseSummaries: import('./oracleWorkflow').OraclePhaseSummary[]
    costTracker: import('./oracleWorkflow').OracleCostTracker
    knowledgeGraph: import('./oracleWorkflow').OracleKnowledgeGraph
    claims: import('./oracleWorkflow').OracleClaim[]
    trends: import('./oracleWorkflow').TrendObject[]
    uncertainties: import('./oracleWorkflow').UncertaintyObject[]
    crossImpactMatrix: import('./oracleWorkflow').CrossImpactEntry[]
    backcastTimelines: import('./oracleWorkflow').BackcastTimeline[]
    strategicMoves: import('./oracleWorkflow').StrategicMove[]
    councilRecords: import('./oracleWorkflow').OracleCouncilRecord[]
  }
}

// ----- Tool Definition -----

export interface ToolParameter {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array'
  description: string
  required?: boolean
  properties?: Record<string, ToolParameter> // For nested objects
  items?: ToolParameter // For array item definitions
}

export interface ToolImplementation {
  type: 'javascript'
  code: string
}

export interface ToolDefinition {
  toolId: ToolId
  userId?: string // Null for global tools, set for user-specific

  name: string
  description: string
  parameters: Record<string, ToolParameter>

  // Implementation for custom tools
  implementation?: ToolImplementation
  source?: 'builtin' | 'custom'

  // Security
  requiresAuth: boolean
  allowedModules?: string[] // Which modules can access (e.g., ['calendar', 'todos'])

  // Metadata
  createdAtMs: number
  updatedAtMs: number
}

// ----- Tool Call Record (Phase 5B: Persistence) -----

export interface ToolCallRecord {
  toolCallRecordId: ToolCallRecordId
  runId: RunId
  workflowId: WorkflowId
  userId: string
  agentId: AgentId

  // Tool execution details
  toolCallId: string // Provider-specific ID (e.g., OpenAI call_xyz, Anthropic toolu_xyz)
  toolName: string
  toolId: ToolId
  parameters: Record<string, unknown>

  // Execution status
  status: ToolCallStatus
  result?: unknown
  error?: string

  // Phase 5E: Enhanced error tracking
  errorCategory?: 'network' | 'auth' | 'rate_limit' | 'validation' | 'timeout' | 'internal'
  errorDetails?: Record<string, unknown> // Technical details for debugging
  retryAttempt?: number // Number of retry attempts (0 = no retries)

  // Timing metrics
  startedAtMs: number
  completedAtMs?: number
  durationMs?: number

  // Cost tracking
  tokensUsed?: number
  estimatedCost?: number

  // Provider context
  provider: ModelProvider
  modelName: string
  iteration: number // Which iteration of agent execution (1-5)

  syncState: SyncState
  version: number
}

// ----- Expert Council -----

export type JudgeRubricDomain = 'research' | 'creative' | 'analytical' | 'code' | 'factual'

export interface ExpertCouncilConfig {
  enabled: boolean

  // Execution settings
  defaultMode: ExecutionMode
  allowModeOverride: boolean

  // Model configuration
  councilModels: Array<{
    modelId: string
    provider: ModelProvider
    modelName: string
    temperature?: number
    maxTokens?: number
    systemPrompt?: string
  }>

  chairmanModel: {
    modelId: string
    provider: ModelProvider
    modelName: string
    temperature?: number
    maxTokens?: number
    systemPrompt?: string
  }

  // Judges are same as council by default, or can be overridden
  judgeModels?: Array<{
    modelId: string
    provider: ModelProvider
    modelName: string
  }>

  // Advanced settings
  selfExclusionEnabled: boolean
  minCouncilSize: number
  maxCouncilSize: number
  requireConsensusThreshold?: number

  // Phase 18: Judge rubric domain — auto-detect from prompt or override
  judgeRubricDomain?: JudgeRubricDomain | 'auto'
  // Phase 18: Enforce provider diversity across council models (default: true)
  enforceProviderDiversity?: boolean

  // Phase 19: Dynamic composition — auto-select best models from historical data (default: false)
  enableDynamicComposition?: boolean

  // Phase 20: Disagreement deep-dive — trigger reasoning follow-up on low consensus (default: true for full mode)
  enableDisagreementDeepDive?: boolean

  // Cost controls
  estimatedCostPerTurn?: number
  maxCostPerTurn?: number
  enableCaching: boolean
  cacheExpirationHours: number
}

export interface ExpertCouncilTurn {
  turnId: string
  sourceTurnId?: string
  runId: RunId
  userPrompt: string

  stage1: {
    responses: Array<{
      modelId: string
      provider: ModelProvider
      modelName: string
      answerText: string
      status: 'completed' | 'failed'
      error?: string
      latency: number
      tokensUsed?: number
      estimatedCost?: number
      timestampMs: number
    }>
  }

  stage2: {
    anonymizationMap: Record<string, string>
    reviews: Array<{
      judgeModelId: string
      critiques: Record<string, string>
      ranking: string[]
      confidenceScore?: number
      timestampMs: number
      tokensUsed?: number
      estimatedCost?: number
    }>
    aggregateRanking: Array<{
      label: string
      modelId: string
      bordaScore: number
      averageRank: number
      individualRanks: number[]
      standardDeviation: number
    }>
    consensusMetrics: {
      kendallTau: number
      consensusScore: number
      topRankedLabel: string
      controversialResponses: string[]
      rankingCompleteness?: number
      excludedResponses?: string[]
    }
  }

  stage3: {
    chairmanModelId: string
    finalResponse: string
    tokensUsed?: number
    estimatedCost?: number
    timestampMs: number
  }

  totalDurationMs: number
  totalCost: number
  createdAtMs: number

  executionMode: ExecutionMode
  cacheHit: boolean
  retryCount: number

  qualityScore?: number
  disagreementDeepDive?: {
    triggered: boolean
    reasoningResponses: Array<{
      modelId: string
      reasoning: string
      tokensUsed?: number
      estimatedCost?: number
    }>
  }
  userFeedback?: {
    rating: 1 | 2 | 3 | 4 | 5
    helpful: boolean
    comment?: string
    submittedAtMs: number
  }
}

export interface CouncilAnalytics {
  userId: string
  workflowId: WorkflowId

  totalTurns: number
  turnsByMode: Record<ExecutionMode, number>
  cacheHitRate: number

  totalCost: number
  averageCostPerTurn: number
  costByMode: Record<ExecutionMode, number>

  averageConsensusScore: number
  averageQualityScore: number
  userSatisfactionRate: number

  averageDuration: number
  failureRate: number
  partialFailureRate: number

  modelStats: Record<
    string,
    {
      timesUsed: number
      averageRank: number
      averageLatency: number
      failureRate: number
    }
  >

  dailyUsage: Array<{
    date: string
    turns: number
    cost: number
    avgConsensus: number
  }>
}

// ----- Workflow Step (Phase 6E) -----

export interface WorkflowStep {
  workflowStepId: WorkflowStepId
  runId: RunId
  workflowId: WorkflowId
  userId: string
  nodeId: string
  nodeType: WorkflowNodeType
  input?: Record<string, unknown>
  output?: unknown
  error?: string
  startedAtMs: number
  completedAtMs?: number
  durationMs?: number
}

// ----- Input Types for Creation -----

export type CreateAgentInput = Omit<
  AgentConfig,
  'agentId' | 'userId' | 'createdAtMs' | 'updatedAtMs' | 'syncState' | 'version' | 'archived'
>

export type UpdateAgentInput = Partial<
  Omit<AgentConfig, 'agentId' | 'userId' | 'createdAtMs' | 'updatedAtMs' | 'syncState' | 'version'>
>

export type CreateWorkflowInput = Omit<
  Workflow,
  'workflowId' | 'userId' | 'createdAtMs' | 'updatedAtMs' | 'syncState' | 'version' | 'archived'
>

export type UpdateWorkflowInput = Partial<
  Omit<Workflow, 'workflowId' | 'userId' | 'createdAtMs' | 'updatedAtMs' | 'syncState' | 'version'>
>

export type CreateRunInput = Omit<
  Run,
  | 'runId'
  | 'userId'
  | 'status'
  | 'currentStep'
  | 'startedAtMs'
  | 'completedAtMs'
  | 'syncState'
  | 'version'
>

export type CreateMessageInput = Omit<Message, 'messageId' | 'timestampMs'>

export type CreateToolInput = Omit<ToolDefinition, 'toolId' | 'createdAtMs' | 'updatedAtMs'>

export type CreateAgentTemplateInput = Omit<
  AgentTemplate,
  'templateId' | 'createdAtMs' | 'updatedAtMs'
>

export type CreateWorkflowTemplateInput = Omit<
  WorkflowTemplate,
  'templateId' | 'createdAtMs' | 'updatedAtMs'
>

export type CreateToolCallRecordInput = Omit<
  ToolCallRecord,
  'toolCallRecordId' | 'syncState' | 'version' | 'completedAtMs' | 'durationMs' | 'result' | 'error'
>

export type CreateWorkflowStepInput = Omit<
  WorkflowStep,
  'workflowStepId' | 'completedAtMs' | 'durationMs'
>

export type CreateDeepResearchRequestInput = Omit<
  DeepResearchRequest,
  | 'requestId'
  | 'userId'
  | 'createdAtMs'
  | 'status'
  | 'results'
  | 'synthesizedFindings'
  | 'integratedAtMs'
>
