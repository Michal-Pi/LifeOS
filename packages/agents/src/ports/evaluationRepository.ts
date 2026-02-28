/**
 * Evaluation Repository Port
 *
 * Interface for persisting and retrieving evaluation data including:
 * - Telemetry (run metrics)
 * - LLM-as-Judge rubrics and results
 * - A/B testing experiments and variants
 * - Consistency checks
 * - Drift alerts
 */

import type { RunId, WorkflowId, AgentId } from '../domain/models'
import type {
  RunTelemetry,
  TelemetryRunId,
  DailyTelemetrySummary,
  EvalRubric,
  EvalRubricId,
  EvalResult,
  EvalResultId,
  PromptVariant,
  PromptVariantId,
  Experiment,
  ExperimentId,
  ConsistencyResult,
  ConsistencyCheckId,
  DriftAlert,
  DriftAlertId,
  DriftDetectionConfig,
  DriftSeverity,
} from '../domain/evaluation'

// ----- Input Types -----

export interface CreateRunTelemetryInput {
  runId: RunId
  workflowId: WorkflowId
  workflowType: string
  workflowName: string
  startedAtMs: number
  completedAtMs: number
  durationMs: number
  totalTokens: number
  estimatedCost: number
  stepCount: number
  toolCallCount: number
  status: 'completed' | 'failed' | 'cancelled'
  errorMessage?: string
  steps: RunTelemetry['steps']
  inputHash?: string
  outputHash?: string
  experimentId?: ExperimentId
  variantIds?: PromptVariantId[]
}

export interface CreateEvalRubricInput {
  name: string
  description: string
  workflowType: string
  taskType?: string
  criteria: EvalRubric['criteria']
  judgeModel: string
  judgeProvider: string
  systemPrompt?: string
  isDefault?: boolean
}

export interface UpdateEvalRubricInput {
  name?: string
  description?: string
  criteria?: EvalRubric['criteria']
  judgeModel?: string
  judgeProvider?: string
  systemPrompt?: string
  isDefault?: boolean
  isArchived?: boolean
}

export interface CreateEvalResultInput {
  rubricId: EvalRubricId
  runId: RunId
  criterionScores: Record<string, number>
  normalizedScores: Record<string, number>
  aggregateScore: number
  judgeReasoning?: string
  judgeModel: string
  judgeProvider: string
  judgeTokensUsed: number
  judgeCost: number
  durationMs: number
  inputSnapshot?: string
  outputSnapshot?: string
}

export interface CreateExperimentInput {
  name: string
  description?: string
  hypothesis?: string
  workflowType: string
  agentId?: AgentId
  minSamplesPerVariant?: number
  significanceLevel?: number
  maxDurationDays?: number
}

export interface CreatePromptVariantInput {
  experimentId: ExperimentId
  agentId: AgentId
  name: string
  description?: string
  promptTemplate: string
  systemPrompt?: string
  isControl: boolean
}

export interface UpdateExperimentInput {
  name?: string
  description?: string
  hypothesis?: string
  status?: Experiment['status']
  winnerVariantId?: PromptVariantId
  isSignificant?: boolean
  pValue?: number
  effectSize?: number
}

export interface CreateConsistencyCheckInput {
  workflowId: WorkflowId
  workflowType: string
  inputHash: string
  inputSnapshot?: string
  runIds: RunId[]
  outputHashes: string[]
  outputs?: string[]
  semanticVariance: number
  lexicalSimilarity: number
  isConsistent: boolean
  varianceThreshold: number
}

export interface CreateDriftAlertInput {
  workflowType: string
  agentId?: AgentId
  metric: DriftAlert['metric']
  metricDescription?: string
  baseline: number
  baselineWindow: string
  current: number
  currentWindow: string
  absoluteChange: number
  percentChange: number
  direction: 'increase' | 'decrease'
  severity: DriftSeverity
  severityThresholds: DriftAlert['severityThresholds']
  recommendations?: string[]
}

// ----- Repository Interface -----

export interface EvaluationRepository {
  // ----- Telemetry -----

  recordTelemetry(userId: string, input: CreateRunTelemetryInput): Promise<RunTelemetry>

  getTelemetry(userId: string, telemetryId: TelemetryRunId): Promise<RunTelemetry | null>

  getTelemetryByRunId(userId: string, runId: RunId): Promise<RunTelemetry | null>

  listTelemetry(
    userId: string,
    filters?: {
      workflowType?: string
      status?: 'completed' | 'failed' | 'cancelled'
      startAfterMs?: number
      startBeforeMs?: number
      minDurationMs?: number
      maxDurationMs?: number
      experimentId?: ExperimentId
    },
    limit?: number
  ): Promise<RunTelemetry[]>

  getDailySummary(userId: string, date: string): Promise<DailyTelemetrySummary | null>

  computeDailySummary(userId: string, date: string): Promise<DailyTelemetrySummary>

  listDailySummaries(
    userId: string,
    startDate: string,
    endDate: string
  ): Promise<DailyTelemetrySummary[]>

  // ----- LLM-as-Judge Rubrics -----

  createRubric(userId: string, input: CreateEvalRubricInput): Promise<EvalRubric>

  getRubric(userId: string, rubricId: EvalRubricId): Promise<EvalRubric | null>

  getDefaultRubric(userId: string, workflowType: string): Promise<EvalRubric | null>

  listRubrics(
    userId: string,
    filters?: {
      workflowType?: string
      includeArchived?: boolean
    }
  ): Promise<EvalRubric[]>

  updateRubric(
    userId: string,
    rubricId: EvalRubricId,
    updates: UpdateEvalRubricInput
  ): Promise<EvalRubric>

  deleteRubric(userId: string, rubricId: EvalRubricId): Promise<void>

  // ----- LLM-as-Judge Results -----

  recordEvalResult(userId: string, input: CreateEvalResultInput): Promise<EvalResult>

  getEvalResult(userId: string, evalResultId: EvalResultId): Promise<EvalResult | null>

  getEvalResultByRunId(userId: string, runId: RunId): Promise<EvalResult | null>

  listEvalResults(
    userId: string,
    filters?: {
      rubricId?: EvalRubricId
      minScore?: number
      maxScore?: number
      startAfterMs?: number
      startBeforeMs?: number
    },
    limit?: number
  ): Promise<EvalResult[]>

  getAverageScore(
    userId: string,
    workflowType: string,
    windowDays?: number
  ): Promise<{
    avgScore: number
    sampleCount: number
    bycriterion: Record<string, number>
  }>

  // ----- A/B Testing Experiments -----

  createExperiment(userId: string, input: CreateExperimentInput): Promise<Experiment>

  getExperiment(userId: string, experimentId: ExperimentId): Promise<Experiment | null>

  listExperiments(
    userId: string,
    filters?: {
      status?: Experiment['status']
      workflowType?: string
    }
  ): Promise<Experiment[]>

  updateExperiment(
    userId: string,
    experimentId: ExperimentId,
    updates: UpdateExperimentInput
  ): Promise<Experiment>

  deleteExperiment(userId: string, experimentId: ExperimentId): Promise<void>

  startExperiment(userId: string, experimentId: ExperimentId): Promise<Experiment>

  completeExperiment(
    userId: string,
    experimentId: ExperimentId,
    winnerVariantId?: PromptVariantId,
    isSignificant?: boolean,
    pValue?: number,
    effectSize?: number
  ): Promise<Experiment>

  // ----- A/B Testing Variants -----

  createVariant(userId: string, input: CreatePromptVariantInput): Promise<PromptVariant>

  getVariant(userId: string, variantId: PromptVariantId): Promise<PromptVariant | null>

  listVariants(userId: string, experimentId: ExperimentId): Promise<PromptVariant[]>

  selectVariantThompson(userId: string, experimentId: ExperimentId): Promise<PromptVariant>

  recordVariantSample(
    userId: string,
    variantId: PromptVariantId,
    score: number,
    success: boolean
  ): Promise<PromptVariant>

  promoteVariant(userId: string, variantId: PromptVariantId): Promise<PromptVariant>

  // ----- Consistency Checks -----

  recordConsistencyCheck(
    userId: string,
    input: CreateConsistencyCheckInput
  ): Promise<ConsistencyResult>

  getConsistencyCheck(
    userId: string,
    checkId: ConsistencyCheckId
  ): Promise<ConsistencyResult | null>

  listConsistencyChecks(
    userId: string,
    filters?: {
      workflowType?: string
      isConsistent?: boolean
      startAfterMs?: number
    },
    limit?: number
  ): Promise<ConsistencyResult[]>

  getConsistencyStats(
    userId: string,
    workflowType: string,
    windowDays?: number
  ): Promise<{
    totalChecks: number
    consistentCount: number
    avgVariance: number
    avgSimilarity: number
  }>

  // ----- Drift Detection -----

  createDriftAlert(userId: string, input: CreateDriftAlertInput): Promise<DriftAlert>

  getDriftAlert(userId: string, alertId: DriftAlertId): Promise<DriftAlert | null>

  listDriftAlerts(
    userId: string,
    filters?: {
      workflowType?: string
      severity?: DriftSeverity
      status?: DriftAlert['status']
      metric?: DriftAlert['metric']
    }
  ): Promise<DriftAlert[]>

  acknowledgeDriftAlert(userId: string, alertId: DriftAlertId): Promise<DriftAlert>

  resolveDriftAlert(userId: string, alertId: DriftAlertId, resolution: string): Promise<DriftAlert>

  ignoreDriftAlert(userId: string, alertId: DriftAlertId): Promise<DriftAlert>

  getDriftDetectionConfig(userId: string): Promise<DriftDetectionConfig | null>

  updateDriftDetectionConfig(
    userId: string,
    config: Partial<DriftDetectionConfig>
  ): Promise<DriftDetectionConfig>

  // ----- Analytics -----

  getWorkflowMetrics(
    userId: string,
    workflowType: string,
    windowDays: number
  ): Promise<{
    runCount: number
    successRate: number
    avgDurationMs: number
    avgTokens: number
    avgCost: number
    avgQualityScore: number
    consistencyRate: number
  }>

  compareMetrics(
    userId: string,
    workflowType: string,
    baselineWindowDays: number,
    currentWindowDays: number
  ): Promise<{
    baseline: Awaited<ReturnType<EvaluationRepository['getWorkflowMetrics']>>
    current: Awaited<ReturnType<EvaluationRepository['getWorkflowMetrics']>>
    changes: Record<
      string,
      { absolute: number; percent: number; direction: 'increase' | 'decrease' }
    >
  }>
}
