/**
 * Optimization Domain Types
 *
 * Types for the data-driven optimization layer:
 * - Prompt variant optimization (auto-promotion from A/B tests)
 * - Example selection strategies
 * - Retrieval pattern templates
 * - Orchestration tuning recommendations
 * - Drift response automation
 */

import type { Id } from '@lifeos/core'
import type { AgentId, WorkflowId, RunId } from './models'
import type { ExperimentId, PromptVariantId, DriftAlertId } from './evaluation'
import type { ExampleLibraryId, ExampleSelectionStrategy } from './exampleLibrary'

// ----- IDs -----

export type OptimizedPromptVersionId = Id<'optimizedPromptVersion'>
export type RetrievalTemplateId = Id<'retrievalTemplate'>
export type OrchestrationRecommendationId = Id<'orchestrationRecommendation'>
export type DriftResponseRuleId = Id<'driftResponseRule'>
export type OptimizationEventId = Id<'optimizationEvent'>

// ----- Prompt Version Management -----

/**
 * A versioned prompt with full history tracking for optimization.
 * Distinct from OptimizedPromptVersion in promptLibrary.ts which is simpler.
 */
export interface OptimizedPromptVersion {
  versionId: OptimizedPromptVersionId
  userId: string
  agentId: AgentId

  // Version info
  version: number
  previousVersionId?: OptimizedPromptVersionId

  // Content
  promptTemplate: string
  systemPrompt?: string

  // A/B test provenance
  sourceExperimentId?: ExperimentId
  sourceVariantId?: PromptVariantId
  promotionReason?: 'manual' | 'ab_test_winner' | 'rollback' | 'drift_response'

  // Quality metrics at time of promotion
  avgQualityScore?: number
  sampleCount?: number
  pValue?: number
  effectSize?: number

  // Lifecycle
  isActive: boolean
  promotedAtMs?: number
  deprecatedAtMs?: number
  deprecationReason?: string

  createdAtMs: number
  updatedAtMs: number
}

/**
 * Request to promote a prompt variant
 */
export interface PromptPromotionRequest {
  userId: string
  agentId: AgentId

  // What to promote
  variantId: PromptVariantId
  experimentId: ExperimentId

  // Why
  promotionReason: 'ab_test_winner' | 'manual' | 'rollback'

  // Validation
  requiresConfirmation: boolean
  confirmedByUser?: boolean
  confirmationNote?: string
}

/**
 * Result of analyzing A/B test results for promotion
 */
export interface PromptPromotionAnalysis {
  experimentId: ExperimentId
  userId: string

  // Winner analysis
  hasWinner: boolean
  winnerVariantId?: PromptVariantId
  controlVariantId: PromptVariantId

  // Statistical significance
  isSignificant: boolean
  pValue: number
  effectSize: number
  confidenceLevel: number // 1 - pValue

  // Quality improvement
  controlAvgScore: number
  winnerAvgScore: number
  absoluteImprovement: number
  relativeImprovement: number // as percentage

  // Sample sizes
  controlSamples: number
  winnerSamples: number
  totalSamples: number

  // Recommendation
  recommendation: 'promote' | 'continue_testing' | 'no_action' | 'stop_experiment'
  recommendationReason: string

  analyzedAtMs: number
}

// ----- Example Selection Optimization -----

/**
 * Configuration for example selection optimization
 */
export interface ExampleSelectionConfig {
  userId: string
  agentId: AgentId

  // Library references
  libraryIds: ExampleLibraryId[]

  // Selection strategy
  strategy: ExampleSelectionStrategy
  maxExamples: number

  // For similarity-based selection
  similarityThreshold?: number // Minimum similarity score
  embeddingModel?: string

  // Quality filtering
  minQualityScore?: number // Only use examples above this score

  // Recency weighting
  recencyBias?: number // 0-1, how much to weight recent examples

  // Diversity
  diversityWeight?: number // 0-1, encourage diverse examples
}

/**
 * Result of selecting examples for a prompt
 */
export interface ExampleSelectionResult {
  userId: string
  runId: RunId

  // Selected examples
  selectedExampleIds: string[]
  selectedCount: number
  totalAvailable: number

  // Selection metadata
  strategy: ExampleSelectionStrategy
  selectionScores?: Record<string, number> // Per-example selection score

  // For similarity selection
  inputEmbedding?: number[]
  similarityScores?: Record<string, number>

  // Quality metrics of selected examples
  avgQualityScore: number
  qualityRange: { min: number; max: number }

  selectedAtMs: number
}

/**
 * Example selection performance tracking
 */
export interface ExampleSelectionStats {
  userId: string
  agentId: AgentId

  // By strategy
  strategyPerformance: Record<
    ExampleSelectionStrategy,
    {
      usageCount: number
      avgOutputQuality: number
      qualityVariance: number
    }
  >

  // By example count
  countPerformance: Array<{
    exampleCount: number
    usageCount: number
    avgOutputQuality: number
  }>

  // Optimal configuration
  optimalStrategy?: ExampleSelectionStrategy
  optimalCount?: number
  optimalQualityScore?: number

  computedAtMs: number
}

// ----- Retrieval Pattern Templates -----

/**
 * A step in a retrieval template
 */
export interface RetrievalStep {
  stepIndex: number
  action: 'THINK' | 'QUERY' | 'RETRIEVE' | 'FILTER' | 'EXPAND' | 'TERMINATE'

  // For QUERY action
  queryType?: 'keyword' | 'semantic' | 'graph' | 'hybrid'
  queryTemplate?: string

  // For FILTER action
  filterCriteria?: Record<string, unknown>

  // For EXPAND action
  expansionHops?: number
  expansionType?: 'neighbors' | 'similar' | 'related'

  // Metadata
  description?: string
  avgDurationMs?: number
}

/**
 * A retrieval pattern template derived from successful runs
 */
export interface RetrievalTemplate {
  templateId: RetrievalTemplateId
  userId: string

  // Identity
  name: string
  description: string

  // Scope
  workflowType: string
  taskType?: string

  // Pattern
  steps: RetrievalStep[]
  avgStepCount: number

  // Quality metrics from source runs
  avgContradictionClarity?: number
  avgSynthesisNovelty?: number
  avgOutputQuality: number

  // Source runs
  sourceRunIds: RunId[]
  sourceRunCount: number

  // Usage statistics
  usageCount: number
  successRate: number
  avgImprovementOverBaseline?: number

  // Lifecycle
  isActive: boolean
  validatedByUser: boolean

  createdAtMs: number
  updatedAtMs: number
}

/**
 * Request to derive a retrieval template from runs
 */
export interface RetrievalTemplateDerivationRequest {
  userId: string
  workflowType: string
  taskType?: string

  // Source runs to analyze
  runIds: RunId[]
  minQualityThreshold: number

  // Pattern detection settings
  minPatternFrequency: number // Minimum times pattern must appear
  maxSteps: number // Maximum steps to include in template
}

// ----- Orchestration Tuning -----

/**
 * Type of orchestration recommendation
 */
export type OrchestrationRecommendationType =
  | 'reorder_agents' // Change agent execution order
  | 'parallelize' // Run agents in parallel instead of sequential
  | 'add_agent' // Add an agent to the workflow
  | 'remove_agent' // Remove an underperforming agent
  | 'change_model' // Switch to different model
  | 'tune_temperature' // Adjust temperature parameter
  | 'tune_max_tokens' // Adjust max tokens
  | 'add_retry' // Add retry logic
  | 'add_fallback' // Add fallback model

/**
 * An orchestration tuning recommendation
 */
export interface OrchestrationRecommendation {
  recommendationId: OrchestrationRecommendationId
  userId: string

  // Scope
  workflowId: WorkflowId
  workflowType: string
  agentId?: AgentId

  // Recommendation
  type: OrchestrationRecommendationType
  title: string
  description: string
  rationale: string

  // Impact estimates
  expectedQualityChange: number // -1 to 1
  expectedCostChange: number // -1 to 1 (negative = savings)
  expectedDurationChange: number // -1 to 1 (negative = faster)
  confidenceLevel: number // 0-1

  // Evidence
  evidenceRunIds: RunId[]
  evidenceSummary: string
  sampleSize: number

  // Specific changes
  changes: Record<string, unknown> // Type-specific changes

  // Status
  status: 'pending' | 'approved' | 'applied' | 'rejected' | 'expired'
  appliedAtMs?: number
  rejectedReason?: string

  createdAtMs: number
  expiresAtMs?: number
}

/**
 * Cost-quality Pareto analysis result
 */
export interface CostQualityAnalysis {
  userId: string
  workflowType: string

  // Pareto frontier points
  frontier: Array<{
    model: string
    provider: string
    avgCost: number
    avgQuality: number
    sampleCount: number
    isDominated: boolean // True if another point is better in both dimensions
  }>

  // Current operating point
  currentModel: string
  currentCost: number
  currentQuality: number

  // Recommendations
  recommendations: Array<{
    action: 'upgrade' | 'downgrade' | 'maintain'
    targetModel: string
    expectedQualityChange: number
    expectedCostChange: number
    rationale: string
  }>

  analyzedAtMs: number
}

// ----- Drift Response Automation -----

/**
 * Trigger condition for drift response
 */
export interface DriftTriggerCondition {
  metric: 'avg_score' | 'cost' | 'duration' | 'consistency' | 'success_rate'
  direction: 'increase' | 'decrease' | 'any'
  severity: 'warning' | 'critical' | 'any'
  threshold?: number // Optional specific threshold
}

/**
 * Action to take in response to drift
 */
export interface DriftResponseAction {
  actionType:
    | 'notify_user'
    | 'increase_temperature'
    | 'decrease_temperature'
    | 'switch_model'
    | 'switch_variant'
    | 'rollback_prompt'
    | 'disable_agent'
    | 'run_diagnostic'
    | 'custom'

  // Action parameters
  params: Record<string, unknown>

  // Fallback if action fails
  fallbackAction?: DriftResponseAction
}

/**
 * A drift response rule
 */
export interface DriftResponseRule {
  ruleId: DriftResponseRuleId
  userId: string

  // Identity
  name: string
  description: string

  // Scope
  workflowType: string
  agentId?: AgentId

  // Trigger
  trigger: DriftTriggerCondition

  // Response
  actions: DriftResponseAction[]
  cooldownMs: number // Minimum time between rule activations

  // Lifecycle
  isActive: boolean
  priority: number // Higher = evaluated first

  // Stats
  activationCount: number
  lastActivatedAtMs?: number
  successCount: number
  failureCount: number

  createdAtMs: number
  updatedAtMs: number
}

/**
 * Log of a drift response execution
 */
export interface DriftResponseExecution {
  executionId: string
  ruleId: DriftResponseRuleId
  alertId: DriftAlertId
  userId: string

  // What was detected
  triggerMetric: string
  triggerValue: number
  triggerThreshold: number

  // What was done
  actionsExecuted: Array<{
    actionType: string
    params: Record<string, unknown>
    success: boolean
    errorMessage?: string
    durationMs: number
  }>

  // Outcome
  overallSuccess: boolean
  errorMessage?: string

  // Impact
  metricBefore: number
  metricAfter?: number // Populated after cooldown period
  wasEffective?: boolean

  executedAtMs: number
}

// ----- Optimization Events -----

/**
 * Type of optimization event
 */
export type OptimizationEventType =
  | 'prompt_promoted'
  | 'prompt_rolled_back'
  | 'experiment_completed'
  | 'template_derived'
  | 'recommendation_applied'
  | 'drift_response_triggered'
  | 'example_promoted'
  | 'example_pruned'

/**
 * An optimization event for audit logging
 */
export interface OptimizationEvent {
  eventId: OptimizationEventId
  userId: string

  // Event type
  eventType: OptimizationEventType
  description: string

  // Scope
  workflowType?: string
  agentId?: AgentId

  // Details
  details: Record<string, unknown>

  // Impact
  qualityBefore?: number
  qualityAfter?: number
  costBefore?: number
  costAfter?: number

  // Source
  triggeredBy: 'system' | 'user' | 'drift_detection' | 'ab_test'
  sourceId?: string // ID of the triggering entity

  createdAtMs: number
}

// ----- Quality Scoring -----

/**
 * Weights for the optimization quality scoring function.
 * Quality = α·task_completion + β·coherence + γ·actionability - δ·cost
 * Distinct from QualityScoringWeights in evaluation.ts which has different fields.
 */
export interface OptimizationQualityWeights {
  taskCompletion: number // α
  coherence: number // β
  actionability: number // γ
  costPenalty: number // δ
}

/**
 * Default optimization quality weights by workflow type
 */
export const OPTIMIZATION_QUALITY_WEIGHTS: Record<string, OptimizationQualityWeights> = {
  deep_research: {
    taskCompletion: 0.4,
    coherence: 0.3,
    actionability: 0.2,
    costPenalty: 0.1,
  },
  expert_council: {
    taskCompletion: 0.3,
    coherence: 0.35,
    actionability: 0.25,
    costPenalty: 0.1,
  },
  dialectical: {
    taskCompletion: 0.25,
    coherence: 0.35,
    actionability: 0.3,
    costPenalty: 0.1,
  },
  default: {
    taskCompletion: 0.35,
    coherence: 0.3,
    actionability: 0.25,
    costPenalty: 0.1,
  },
}

/**
 * Calculate optimization quality score using the weighted formula
 */
export function calculateOptimizationQualityScore(
  scores: {
    taskCompletion: number // 0-1
    coherence: number // 0-1
    actionability: number // 0-1
    normalizedCost: number // 0-1 (higher = more expensive)
  },
  weights: OptimizationQualityWeights = OPTIMIZATION_QUALITY_WEIGHTS.default
): number {
  const { taskCompletion, coherence, actionability, normalizedCost } = scores
  const { taskCompletion: α, coherence: β, actionability: γ, costPenalty: δ } = weights

  const quality = α * taskCompletion + β * coherence + γ * actionability - δ * normalizedCost

  // Clamp to 0-1 range
  return Math.max(0, Math.min(1, quality))
}
