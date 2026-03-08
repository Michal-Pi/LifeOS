/**
 * Evaluation Domain Types
 *
 * Types for the evaluation infrastructure including:
 * - LLM-as-Judge rubrics and results
 * - A/B testing variants and experiments
 * - Consistency evaluation
 * - Drift detection
 * - Telemetry collection
 * - Component-level telemetry (router, tools, memory)
 * - Code-based evaluators
 * - Human labeling workflow
 * - Trajectory/efficiency evaluation
 * - Test case derivation
 * - Evaluator routing
 */

import type { Id } from '@lifeos/core'
import type { RunId, WorkflowId, AgentId } from './models'

// ----- IDs -----

export type EvalRubricId = Id<'evalRubric'>
export type EvalResultId = Id<'evalResult'>
export type PromptVariantId = Id<'promptVariant'>
export type ExperimentId = Id<'experiment'>
export type TelemetryRunId = Id<'telemetryRun'>
export type DriftAlertId = Id<'driftAlert'>
export type ConsistencyCheckId = Id<'consistencyCheck'>
export type ComponentTelemetryId = Id<'componentTelemetry'>
export type CodeEvaluatorId = Id<'codeEvaluator'>
export type CodeEvalResultId = Id<'codeEvalResult'>
export type LabelingTaskId = Id<'labelingTask'>
export type LabelingQueueId = Id<'labelingQueue'>
export type RouterEvalId = Id<'routerEval'>
export type ToolEvalId = Id<'toolEval'>
export type MemoryEvalId = Id<'memoryEval'>
export type TrajectoryEvalId = Id<'trajectoryEval'>
export type TrajectoryPatternId = Id<'trajectoryPattern'>
export type DerivedTestCaseId = Id<'derivedTestCase'>
export type EvaluatorConfigId = Id<'evaluatorConfig'>
export type BenchmarkCohortId = Id<'benchmarkCohort'>
export type SharedComparisonResultId = Id<'sharedComparisonResult'>

// ----- Telemetry -----

/**
 * Per-step telemetry data
 */
export interface StepTelemetry {
  stepIndex: number
  agentId: AgentId
  agentName: string

  // Timing
  startedAtMs: number
  completedAtMs: number
  durationMs: number

  // Resources
  tokensUsed: number
  estimatedCost: number
  provider: string
  model: string

  // Tool usage
  toolCallCount: number
  toolCallIds?: string[]

  // Output
  outputLength: number
  outputHash?: string // For consistency checking
}

/**
 * Run-level telemetry data
 */
export interface RunTelemetry {
  telemetryId: TelemetryRunId
  runId: RunId
  workflowId: WorkflowId
  userId: string

  // Workflow info
  workflowType: string
  workflowName: string

  // Timing
  startedAtMs: number
  completedAtMs: number
  durationMs: number

  // Resources
  totalTokens: number
  estimatedCost: number
  stepCount: number
  toolCallCount: number

  // Status
  status: 'completed' | 'failed' | 'cancelled'
  errorMessage?: string

  // Per-step details
  steps: StepTelemetry[]

  // Input/output hashes for consistency tracking
  inputHash?: string
  outputHash?: string

  // Evaluation (populated after LLM-as-Judge runs)
  evalResultId?: EvalResultId
  qualityScore?: number

  // A/B testing context
  experimentId?: ExperimentId
  variantIds?: PromptVariantId[]

  createdAtMs: number
}

/**
 * Daily aggregated telemetry summary
 */
export interface DailyTelemetrySummary {
  userId: string
  date: string // YYYY-MM-DD

  // By workflow type
  byWorkflowType: Record<
    string,
    {
      runCount: number
      successCount: number
      failedCount: number
      totalDurationMs: number
      avgDurationMs: number
      totalTokens: number
      totalCost: number
      avgQualityScore?: number
    }
  >

  // Totals
  totalRuns: number
  totalTokens: number
  totalCost: number
  avgDurationMs: number

  computedAtMs: number
}

// ----- LLM-as-Judge -----

/**
 * A single evaluation criterion
 */
export interface EvalCriterion {
  name: string // e.g., 'coherence', 'accuracy', 'actionability'
  description: string
  weight: number // 0-1, weights should sum to 1 within a rubric
  prompt: string // The judge prompt for this criterion
  scoreRange: {
    min: number // Usually 1
    max: number // Usually 5 or 10
  }
}

/**
 * An evaluation rubric for a specific workflow type
 */
export interface EvalRubric {
  rubricId: EvalRubricId
  userId: string

  // Identity
  name: string
  description: string

  // Scope
  workflowType: string // 'deep_research', 'expert_council', 'dialectical', etc.
  taskType?: string // Optional further scoping

  // Criteria
  criteria: EvalCriterion[]

  // Judge configuration
  judgeModel: string // e.g., 'gpt-4o', 'claude-3-5-sonnet'
  judgeProvider: string // e.g., 'openai', 'anthropic'
  systemPrompt?: string // Optional custom system prompt for judge

  // Lifecycle
  isDefault: boolean // If true, used when no specific rubric is selected
  isArchived: boolean
  version: number

  createdAtMs: number
  updatedAtMs: number
}

/**
 * Result of evaluating an output with LLM-as-Judge
 */
export interface EvalResult {
  evalResultId: EvalResultId
  rubricId: EvalRubricId
  runId: RunId
  userId: string

  // Scores
  criterionScores: Record<string, number> // Per-criterion raw scores
  normalizedScores: Record<string, number> // Normalized to 0-1
  aggregateScore: number // Weighted aggregate (0-1)

  // Judge output
  judgeReasoning?: string // Optional reasoning from the judge
  judgeModel: string
  judgeProvider: string
  judgeTokensUsed: number
  judgeCost: number

  // Timing
  evaluatedAtMs: number
  durationMs: number

  // Input context (for debugging)
  inputSnapshot?: string
  outputSnapshot?: string

  createdAtMs: number
}

// ----- A/B Testing -----

/**
 * A prompt variant for A/B testing
 */
export interface PromptVariant {
  variantId: PromptVariantId
  experimentId: ExperimentId
  userId: string

  // Scope
  agentId: AgentId
  workflowType?: string // If scoped to specific workflow type

  // Variant content
  name: string
  description?: string
  promptTemplate: string // The actual prompt content
  systemPrompt?: string // Optional system prompt override

  // Control vs treatment
  isControl: boolean // The baseline variant

  // Statistics (updated as samples come in)
  sampleCount: number
  successCount: number // Runs that completed successfully
  failedCount: number

  // Quality metrics
  totalScore: number // Sum of all scores (for computing avg)
  avgScore: number // Average quality score
  scoreVariance: number // For statistical tests
  scores: number[] // Raw scores for statistical analysis (capped at N)

  // Thompson sampling parameters (Beta distribution)
  alpha: number // Successes + 1
  beta: number // Failures + 1

  // Lifecycle
  status: 'active' | 'winner' | 'loser' | 'archived'
  promotedAtMs?: number // When this variant was promoted to production

  createdAtMs: number
  updatedAtMs: number
}

/**
 * An A/B testing experiment
 */
export interface Experiment {
  experimentId: ExperimentId
  userId: string

  // Identity
  name: string
  description?: string
  hypothesis?: string

  // Scope
  workflowType: string
  agentId?: AgentId // If testing a specific agent

  // Configuration
  minSamplesPerVariant: number // Minimum samples before significance test
  significanceLevel: number // Usually 0.05
  maxDurationDays?: number // Auto-end after N days

  // Variants
  variantIds: PromptVariantId[]
  controlVariantId: PromptVariantId

  // Status
  status: 'draft' | 'running' | 'paused' | 'completed' | 'cancelled'
  startedAtMs?: number
  completedAtMs?: number
  winnerVariantId?: PromptVariantId

  // Results (populated when completed)
  isSignificant?: boolean
  pValue?: number
  effectSize?: number // Cohen's d or similar

  createdAtMs: number
  updatedAtMs: number
}

// ----- Consistency Evaluation -----

/**
 * Result of a consistency check (running same input multiple times)
 */
export interface ConsistencyResult {
  checkId: ConsistencyCheckId
  userId: string

  // Scope
  workflowId: WorkflowId
  workflowType: string

  // Input
  inputHash: string
  inputSnapshot?: string

  // Runs
  runIds: RunId[]
  runCount: number

  // Outputs
  outputHashes: string[]
  outputs?: string[] // Optional full outputs

  // Metrics
  semanticVariance: number // 0-1, higher = more variance
  lexicalSimilarity: number // Average pairwise similarity
  isConsistent: boolean // Below variance threshold

  // Configuration
  varianceThreshold: number // Threshold used for isConsistent

  createdAtMs: number
}

// ----- Drift Detection -----

/**
 * Severity of a drift alert
 */
export type DriftSeverity = 'info' | 'warning' | 'critical'

/**
 * A drift detection alert
 */
export interface DriftAlert {
  alertId: DriftAlertId
  userId: string

  // Scope
  workflowType: string
  agentId?: AgentId

  // Metric
  metric: 'avg_score' | 'cost' | 'duration' | 'consistency' | 'success_rate' | 'tokens'
  metricDescription?: string

  // Values
  baseline: number // Historical baseline
  baselineWindow: string // e.g., 'last_30_days', 'last_100_runs'
  current: number // Current value
  currentWindow: string // e.g., 'last_7_days', 'last_20_runs'

  // Change
  absoluteChange: number
  percentChange: number
  direction: 'increase' | 'decrease'

  // Severity
  severity: DriftSeverity
  severityThresholds: {
    info: number
    warning: number
    critical: number
  }

  // Status
  status: 'active' | 'acknowledged' | 'resolved' | 'ignored'
  acknowledgedAtMs?: number
  resolvedAtMs?: number
  resolution?: string // How it was resolved

  // Recommendations
  recommendations?: string[]

  createdAtMs: number
  updatedAtMs: number
}

/**
 * Configuration for drift detection
 */
export interface DriftDetectionConfig {
  userId: string

  // Which metrics to monitor
  metrics: Array<{
    metric: DriftAlert['metric']
    enabled: boolean
    thresholds: {
      info: number // Percent change for info
      warning: number // Percent change for warning
      critical: number // Percent change for critical
    }
  }>

  // Baseline configuration
  baselineWindowDays: number // How far back to look for baseline
  currentWindowDays: number // How far back for current value

  // Alerting
  alertOnInfo: boolean
  alertOnWarning: boolean
  alertOnCritical: boolean

  // Per-workflow overrides
  workflowOverrides?: Record<
    string,
    {
      enabled: boolean
      thresholds?: Record<string, { info: number; warning: number; critical: number }>
    }
  >

  updatedAtMs: number
}

// ----- Quality Scoring -----

/**
 * Quality scoring function weights
 */
export interface QualityScoringWeights {
  taskCompletion: number // alpha
  coherence: number // beta
  actionability: number // gamma
  costPenalty: number // delta (negative)
}

/**
 * Default quality scoring weights by workflow type
 */
export const DEFAULT_QUALITY_WEIGHTS: Record<string, QualityScoringWeights> = {
  deep_research: {
    taskCompletion: 0.4,
    coherence: 0.3,
    actionability: 0.25,
    costPenalty: 0.05,
  },
  expert_council: {
    taskCompletion: 0.35,
    coherence: 0.35,
    actionability: 0.25,
    costPenalty: 0.05,
  },
  dialectical: {
    taskCompletion: 0.3,
    coherence: 0.4,
    actionability: 0.2,
    costPenalty: 0.1,
  },
  default: {
    taskCompletion: 0.4,
    coherence: 0.3,
    actionability: 0.2,
    costPenalty: 0.1,
  },
}

// ----- Component-Level Telemetry -----

/**
 * Types of components that can be tracked
 */
export type ComponentType = 'router' | 'tool' | 'memory' | 'agent'

/**
 * Router decision details
 */
export interface RouterDecision {
  chosenPath: string
  availableOptions: string[]
  decisionReason?: string
  confidence?: number
}

/**
 * Tool execution details
 */
export interface ToolExecution {
  toolId: string
  toolName: string
  input: unknown
  output: unknown
  success: boolean
  errorMessage?: string
  errorType?: string
  latencyMs: number
  retryCount: number
}

/**
 * Memory operation details
 */
export interface MemoryOperation {
  operationType: 'retrieve' | 'store' | 'update' | 'delete'
  query?: string
  retrieved?: string[]
  stored?: unknown
  relevanceScore?: number
  hitCount?: number
}

/**
 * Component-level telemetry entry
 */
export interface ComponentTelemetry {
  componentTelemetryId: ComponentTelemetryId
  runId: RunId
  userId: string
  workflowType: string

  // Component identification
  componentType: ComponentType
  componentId: string
  componentName?: string
  stepIndex: number

  // Timing
  startedAtMs: number
  completedAtMs: number
  durationMs: number

  // Type-specific details
  routerDecision?: RouterDecision
  toolExecution?: ToolExecution
  memoryOperation?: MemoryOperation

  // Context
  parentComponentId?: string // For nested components
  metadata?: Record<string, unknown>

  createdAtMs: number
}

// ----- Code-Based Evaluators -----

/**
 * Types of code-based checks
 */
export type CodeCheckType =
  | 'json_valid'
  | 'schema_match'
  | 'contains_field'
  | 'length_range'
  | 'regex_match'
  | 'no_pii'
  | 'no_urls'
  | 'format_compliance'
  | 'custom'

/**
 * A code-based evaluator definition
 */
export interface CodeEvaluator {
  evaluatorId: CodeEvaluatorId
  userId: string

  // Identity
  name: string
  description: string

  // Check configuration
  checkType: CodeCheckType
  params: Record<string, unknown>
  // Examples:
  // - json_valid: {}
  // - schema_match: { schema: JSONSchema }
  // - contains_field: { fields: string[], mode: 'all' | 'any' }
  // - length_range: { minLength?: number, maxLength?: number }
  // - regex_match: { pattern: string, flags?: string, shouldMatch: boolean }
  // - no_pii: { patterns?: string[] }
  // - no_urls: { allowInternal?: boolean }
  // - format_compliance: { format: 'markdown' | 'json' | 'yaml' }
  // - custom: { code: string } // Sandboxed JS function

  // Failure handling
  failureMessage: string
  severity: 'error' | 'warning' // Error blocks, warning logs

  // Scope
  workflowTypes?: string[] // If empty, applies to all
  isActive: boolean

  createdAtMs: number
  updatedAtMs: number
}

/**
 * Result of running a code evaluator
 */
export interface CodeEvalResult {
  codeEvalResultId: CodeEvalResultId
  evaluatorId: CodeEvaluatorId
  runId: RunId
  userId: string

  // Result
  passed: boolean
  failureReason?: string
  matchedContent?: string // What triggered failure

  // Performance
  executionMs: number

  createdAtMs: number
}

// ----- Human Labeling -----

/**
 * Types of labeling questions
 */
export type LabelingQuestionType = 'boolean' | 'rating_1_5' | 'rating_1_10' | 'category' | 'text'

/**
 * A question in a labeling schema
 */
export interface LabelingQuestion {
  questionId: string
  question: string
  type: LabelingQuestionType
  options?: string[] // For category type
  required: boolean
  helpText?: string
}

/**
 * A single label from a labeler
 */
export interface Label {
  labelerId: string
  answers: Record<string, unknown>
  confidence?: number // 0-1, how confident the labeler is
  labeledAtMs: number
  durationMs: number // How long they took
  notes?: string
}

/**
 * A labeling task for human review
 */
export interface LabelingTask {
  taskId: LabelingTaskId
  runId: RunId
  userId: string
  queueId: LabelingQueueId

  // What to label
  input: string
  output: string
  traceSnapshot?: ComponentTelemetry[]

  // Context
  workflowType: string
  workflowName?: string

  // Labeling schema
  questions: LabelingQuestion[]

  // Labels collected
  labels: Label[]

  // Consensus
  status: 'pending' | 'in_progress' | 'completed' | 'disputed' | 'expired'
  requiredLabels: number
  consensusReached: boolean
  finalLabels?: Record<string, unknown>
  disagreementNotes?: string

  // Priority
  priority: 'low' | 'medium' | 'high' | 'urgent'

  // Timing
  createdAtMs: number
  expiresAtMs?: number
  completedAtMs?: number
}

/**
 * A queue for labeling tasks
 */
export interface LabelingQueue {
  queueId: LabelingQueueId
  userId: string

  // Identity
  name: string
  description?: string

  // Scope
  workflowType: string

  // Labeling schema
  labelingSchema: LabelingQuestion[]

  // Sampling
  samplingRate: number // 0-1, what % of runs to queue
  samplingStrategy: 'random' | 'low_score' | 'high_variance' | 'stratified'
  lowScoreThreshold?: number // For low_score strategy

  // Configuration
  requiredLabelsPerTask: number
  defaultPriority: LabelingTask['priority']
  expirationHours?: number

  // Status
  isActive: boolean
  totalTasks: number
  completedTasks: number
  pendingTasks: number

  createdAtMs: number
  updatedAtMs: number
}

// ----- Component Evaluation -----

/**
 * Evaluation of a router decision
 */
export interface RouterEval {
  evalId: RouterEvalId
  runId: RunId
  userId: string
  stepIndex: number

  // Decision made
  chosenPath: string
  availableOptions: string[]

  // Ground truth (from human label or heuristic)
  correctPath?: string
  wasCorrect: boolean
  correctnessSource: 'human_label' | 'heuristic' | 'unknown'

  // Metrics
  decisionLatencyMs: number
  confidenceScore?: number

  // Context
  inputSnapshot?: string
  contextSnapshot?: string

  createdAtMs: number
}

/**
 * Evaluation of a tool execution
 */
export interface ToolEval {
  evalId: ToolEvalId
  runId: RunId
  userId: string
  stepIndex: number

  // Tool info
  toolId: string
  toolName: string

  // Execution details
  input: unknown
  output: unknown
  success: boolean
  errorType?: string

  // Performance
  latencyMs: number
  retryCount: number

  // Quality (from code check or LLM judge)
  outputQuality?: number
  qualityReason?: string
  qualitySource: 'code_eval' | 'llm_judge' | 'human_label' | 'none'

  // Did this tool help?
  contributedToSuccess?: boolean

  createdAtMs: number
}

/**
 * Evaluation of a memory operation
 */
export interface MemoryEval {
  evalId: MemoryEvalId
  runId: RunId
  userId: string
  stepIndex: number

  // Retrieval quality
  query: string
  retrievedItems: string[]
  relevanceScores: number[] // Per-item relevance
  avgRelevance: number

  // Usage metrics
  usedInOutput: boolean
  contributedToSuccess: boolean

  // Coverage
  expectedItems?: string[] // What should have been retrieved
  recall?: number // Retrieved / expected

  createdAtMs: number
}

/**
 * Aggregated tool performance statistics
 */
export interface ToolPerformanceStats {
  toolId: string
  toolName: string
  workflowType: string

  // Counts
  totalCalls: number
  successfulCalls: number
  failedCalls: number

  // Rates
  successRate: number

  // Latency
  avgLatencyMs: number
  p50LatencyMs: number
  p95LatencyMs: number
  maxLatencyMs: number

  // Retries
  avgRetries: number
  maxRetries: number

  // Quality
  avgOutputQuality: number
  qualitySampleCount: number

  // Time window
  windowStartMs: number
  windowEndMs: number
  computedAtMs: number
}

// ----- Trajectory & Efficiency Evaluation -----

/**
 * Types of trajectory patterns
 */
export type TrajectoryPatternType =
  | 'loop'
  | 'backtrack'
  | 'dead_end'
  | 'optimal'
  | 'inefficient'
  | 'redundant'

/**
 * Trajectory evaluation for a run
 */
export interface TrajectoryEval {
  evalId: TrajectoryEvalId
  runId: RunId
  userId: string
  workflowType: string

  // Step efficiency
  totalSteps: number
  optimalSteps?: number // From labeled examples or heuristic
  convergenceScore: number // optimalSteps / totalSteps (capped at 1)

  // Wasted effort
  redundantSteps: number // Steps that didn't advance toward goal
  backtrackCount: number // Times agent "undid" previous work
  toolRetryCount: number // Failed tool calls that were retried
  loopCount: number // Detected loops in reasoning

  // Resource efficiency
  tokensPerStep: number
  costPerStep: number
  tokenEfficiency: number // quality / tokens
  costEfficiency: number // quality / cost

  // Time efficiency
  avgStepLatencyMs: number
  longestStepMs: number
  longestStepIndex: number
  parallelizationRatio: number // Parallel steps / total steps

  // Quality outcome
  qualityScore: number // From LLM-as-Judge
  success: boolean

  // Patterns detected
  patternsDetected: TrajectoryPatternType[]

  createdAtMs: number
}

/**
 * A detected trajectory pattern across runs
 */
export interface TrajectoryPattern {
  patternId: TrajectoryPatternId
  userId: string
  workflowType: string

  // Pattern info
  patternType: TrajectoryPatternType
  description: string
  signature: string // Serialized pattern signature for matching

  // Statistics
  frequency: number // How often this pattern occurs
  avgImpactOnQuality: number // Positive = helps, negative = hurts
  avgExtraSteps: number // How many extra steps this causes

  // Examples
  exampleRunIds: RunId[]
  exampleCount: number

  // Recommendations
  recommendations: string[]

  // Window
  windowStartMs: number
  windowEndMs: number
  computedAtMs: number
}

// ----- Derived Test Cases -----

/**
 * A test case derived from a production trace
 */
export interface DerivedTestCase {
  testCaseId: DerivedTestCaseId
  sourceRunId: RunId
  userId: string
  workflowType: string

  // Test input
  input: string
  context?: Record<string, unknown>

  // Expected behavior (from successful run)
  expectedOutput?: string
  expectedOutputHash?: string
  expectedSteps?: number
  expectedToolCalls?: string[] // Ordered list of expected tools
  expectedRouterDecisions?: Array<{
    step: number
    chosenPath: string
  }>

  // Quality thresholds
  minQualityScore: number
  maxSteps: number
  maxCost: number
  maxDurationMs?: number

  // Metadata
  derivedFromLabel: boolean // Was the source run human-labeled?
  sourceQualityScore: number
  description?: string
  tags?: string[]

  // Usage tracking
  lastUsedMs?: number
  passCount: number
  failCount: number
  lastPassMs?: number
  lastFailMs?: number

  // Lifecycle
  isActive: boolean
  isGolden: boolean // Golden tests are high-priority regressions

  createdAtMs: number
  updatedAtMs: number
}

/**
 * Result of running a regression test
 */
export interface RegressionTestResult {
  testCaseId: DerivedTestCaseId
  runId: RunId
  userId: string

  // Result
  passed: boolean
  failureReasons?: string[]

  // Comparisons
  qualityScore: number
  qualityPassed: boolean
  stepCount: number
  stepsPassed: boolean
  cost: number
  costPassed: boolean
  durationMs: number
  durationPassed?: boolean

  // Output comparison
  outputSimilarity?: number // Semantic similarity to expected
  outputMatched: boolean

  // Tool call comparison
  toolCallsMatched: boolean
  missingTools?: string[]
  extraTools?: string[]

  // Execution info
  workflowVersion: string
  executedAtMs: number
}

// ----- Benchmark Cohorts -----

/**
 * A benchmark cohort defines a shared comparison space for heterogeneous workflows.
 */
export interface BenchmarkCohort {
  cohortId: BenchmarkCohortId
  userId: string

  // Identity
  name: string
  description?: string
  useCase: string

  // Scope
  workflowTypes: string[]
  sharedRubricId: EvalRubricId
  testCaseIds: DerivedTestCaseId[]

  // Comparison behavior
  comparisonMode: 'pairwise' | 'leaderboard'
  allowManualReview: boolean
  acceptanceThresholds?: {
    minScore?: number
    maxCost?: number
    maxDurationMs?: number
    minPassRate?: number
  }
  workflowSpecificRubricIds?: Record<string, EvalRubricId>
  rawOutputComparisonAllowed?: boolean
  allVsAllEnabled?: boolean

  // Lifecycle
  isActive: boolean

  createdAtMs: number
  updatedAtMs: number
}

/**
 * Shared comparison score for a run evaluated under a cohort-compatible rubric.
 */
export interface SharedComparisonResult {
  resultId: SharedComparisonResultId
  runId: RunId
  rubricId: EvalRubricId
  cohortId?: BenchmarkCohortId
  userId: string

  aggregateScore: number
  criterionScores: Record<string, number>
  normalizedScores: Record<string, number>

  createdAtMs: number
}

// ----- Evaluator Routing -----

/**
 * Types of evaluators
 */
export type EvaluatorType = 'code' | 'llm_judge' | 'human' | 'trajectory' | 'component'

/**
 * Condition for running an evaluator
 */
export type EvaluatorRunCondition =
  | 'always'
  | 'on_code_pass'
  | 'on_code_fail'
  | 'on_sample'
  | 'on_failure'
  | 'on_success'
  | 'on_low_score'
  | 'on_high_variance'

/**
 * A step in the evaluator pipeline
 */
export interface EvaluatorPipelineStep {
  evaluatorType: EvaluatorType
  evaluatorId: string
  runCondition: EvaluatorRunCondition
  sampleRate?: number // For 'on_sample' condition
  threshold?: number // For 'on_low_score' condition
  weight?: number // For aggregate scoring
  required: boolean // If true, failure blocks subsequent steps
}

/**
 * Configuration for evaluator routing
 */
export interface EvaluatorConfig {
  configId: EvaluatorConfigId
  userId: string
  workflowType: string

  // Pipeline
  pipeline: EvaluatorPipelineStep[]

  // Aggregation
  aggregationMethod: 'weighted_average' | 'min' | 'all_must_pass' | 'any_must_pass'

  // Human labeling triggers
  humanLabelTriggers: {
    onLowScore: boolean
    lowScoreThreshold: number
    onHighVariance: boolean
    varianceThreshold: number
    sampleRate: number // Random sampling rate
  }

  // Default behavior
  isDefault: boolean
  isActive: boolean

  createdAtMs: number
  updatedAtMs: number
}

/**
 * Result of running the evaluator pipeline
 */
export interface EvaluatorPipelineResult {
  runId: RunId
  userId: string
  configId: EvaluatorConfigId

  // Individual results
  stepResults: Array<{
    step: EvaluatorPipelineStep
    executed: boolean
    skippedReason?: string
    result?: {
      passed: boolean
      score?: number
      details?: unknown
    }
    durationMs: number
  }>

  // Aggregate
  overallPassed: boolean
  aggregateScore: number
  triggeredHumanLabel: boolean

  executedAtMs: number
  totalDurationMs: number
}

/**
 * Default evaluator configurations by workflow type
 */
export const DEFAULT_EVALUATOR_CONFIGS: Record<
  string,
  Omit<EvaluatorConfig, 'configId' | 'userId' | 'createdAtMs' | 'updatedAtMs'>
> = {
  deep_research: {
    workflowType: 'deep_research',
    pipeline: [
      { evaluatorType: 'code', evaluatorId: 'json_valid', runCondition: 'always', required: true },
      { evaluatorType: 'code', evaluatorId: 'has_sources', runCondition: 'always', required: true },
      {
        evaluatorType: 'llm_judge',
        evaluatorId: 'research_rubric',
        runCondition: 'on_code_pass',
        weight: 0.7,
        required: false,
      },
      {
        evaluatorType: 'trajectory',
        evaluatorId: 'efficiency',
        runCondition: 'always',
        weight: 0.3,
        required: false,
      },
    ],
    aggregationMethod: 'weighted_average',
    humanLabelTriggers: {
      onLowScore: true,
      lowScoreThreshold: 0.4,
      onHighVariance: true,
      varianceThreshold: 0.3,
      sampleRate: 0.05,
    },
    isDefault: true,
    isActive: true,
  },
  expert_council: {
    workflowType: 'expert_council',
    pipeline: [
      { evaluatorType: 'code', evaluatorId: 'json_valid', runCondition: 'always', required: true },
      {
        evaluatorType: 'llm_judge',
        evaluatorId: 'council_rubric',
        runCondition: 'on_code_pass',
        weight: 0.8,
        required: false,
      },
      {
        evaluatorType: 'component',
        evaluatorId: 'tool_perf',
        runCondition: 'always',
        weight: 0.2,
        required: false,
      },
    ],
    aggregationMethod: 'weighted_average',
    humanLabelTriggers: {
      onLowScore: true,
      lowScoreThreshold: 0.5,
      onHighVariance: false,
      varianceThreshold: 0.3,
      sampleRate: 0.03,
    },
    isDefault: true,
    isActive: true,
  },
  dialectical: {
    workflowType: 'dialectical',
    pipeline: [
      { evaluatorType: 'code', evaluatorId: 'json_valid', runCondition: 'always', required: true },
      {
        evaluatorType: 'code',
        evaluatorId: 'has_synthesis',
        runCondition: 'always',
        required: true,
      },
      {
        evaluatorType: 'llm_judge',
        evaluatorId: 'dialectical_rubric',
        runCondition: 'on_code_pass',
        weight: 0.5,
        required: false,
      },
      {
        evaluatorType: 'trajectory',
        evaluatorId: 'convergence',
        runCondition: 'always',
        weight: 0.3,
        required: false,
      },
      {
        evaluatorType: 'component',
        evaluatorId: 'contradiction_tracker',
        runCondition: 'always',
        weight: 0.2,
        required: false,
      },
    ],
    aggregationMethod: 'weighted_average',
    humanLabelTriggers: {
      onLowScore: true,
      lowScoreThreshold: 0.4,
      onHighVariance: true,
      varianceThreshold: 0.25,
      sampleRate: 0.1,
    },
    isDefault: true,
    isActive: true,
  },
  default: {
    workflowType: 'default',
    pipeline: [
      { evaluatorType: 'code', evaluatorId: 'json_valid', runCondition: 'always', required: false },
      {
        evaluatorType: 'llm_judge',
        evaluatorId: 'default_rubric',
        runCondition: 'always',
        weight: 1.0,
        required: false,
      },
    ],
    aggregationMethod: 'weighted_average',
    humanLabelTriggers: {
      onLowScore: true,
      lowScoreThreshold: 0.3,
      onHighVariance: false,
      varianceThreshold: 0.3,
      sampleRate: 0.02,
    },
    isDefault: true,
    isActive: true,
  },
}

// ----- Labeling Question Defaults -----

/**
 * Common labeling questions used across all workflow types
 */
export const COMMON_LABELING_QUESTIONS: LabelingQuestion[] = [
  {
    questionId: 'overall_quality',
    question: 'How would you rate the overall quality of this output?',
    type: 'rating_1_5',
    required: true,
    helpText: '1 = Very poor, 5 = Excellent',
  },
  {
    questionId: 'factual_accuracy',
    question: 'Is the output factually accurate?',
    type: 'boolean',
    required: true,
    helpText: 'True if no factual errors, False if contains errors',
  },
  {
    questionId: 'task_completion',
    question: 'Did the output complete the requested task?',
    type: 'category',
    options: ['Fully', 'Partially', 'Not at all'],
    required: true,
  },
]

/**
 * Additional labeling questions for deep research workflows
 */
export const DEEP_RESEARCH_LABELING_QUESTIONS: LabelingQuestion[] = [
  {
    questionId: 'source_quality',
    question: 'How reliable are the cited sources?',
    type: 'rating_1_5',
    required: true,
  },
  {
    questionId: 'comprehensiveness',
    question: 'How comprehensive is the research?',
    type: 'rating_1_5',
    required: true,
  },
]

/**
 * Additional labeling questions for expert council workflows
 */
export const EXPERT_COUNCIL_LABELING_QUESTIONS: LabelingQuestion[] = [
  {
    questionId: 'perspective_diversity',
    question: 'Were diverse perspectives adequately represented?',
    type: 'boolean',
    required: true,
  },
  {
    questionId: 'synthesis_quality',
    question: 'How well were the perspectives synthesized?',
    type: 'rating_1_5',
    required: true,
  },
]

/**
 * Additional labeling questions for dialectical workflows
 */
export const DIALECTICAL_LABELING_QUESTIONS: LabelingQuestion[] = [
  {
    questionId: 'thesis_clarity',
    question: 'How clear was the initial thesis?',
    type: 'rating_1_5',
    required: true,
  },
  {
    questionId: 'antithesis_strength',
    question: 'How strong was the antithesis/negation?',
    type: 'rating_1_5',
    required: true,
  },
  {
    questionId: 'synthesis_novelty',
    question: 'Did the synthesis offer genuine new insight?',
    type: 'boolean',
    required: true,
  },
]

/**
 * Get default labeling questions for a workflow type
 * @param workflowType The type of workflow
 * @returns An array of LabelingQuestion for the workflow type
 */
export function getDefaultLabelingQuestions(workflowType: string): LabelingQuestion[] {
  switch (workflowType) {
    case 'deep_research':
      return [...COMMON_LABELING_QUESTIONS, ...DEEP_RESEARCH_LABELING_QUESTIONS]
    case 'expert_council':
      return [...COMMON_LABELING_QUESTIONS, ...EXPERT_COUNCIL_LABELING_QUESTIONS]
    case 'dialectical':
      return [...COMMON_LABELING_QUESTIONS, ...DIALECTICAL_LABELING_QUESTIONS]
    default:
      return COMMON_LABELING_QUESTIONS
  }
}
