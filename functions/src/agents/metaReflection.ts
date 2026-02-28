/**
 * Meta-Reflection Agent
 *
 * Implements the meta-reflection phase of the dialectical cycle with:
 * - Conceptual velocity tracking (rate of meaningful change)
 * - Contradiction density monitoring
 * - Termination decision logic (CONTINUE, TERMINATE, RESPECIFY)
 * - Process quality assessment
 * - Learning rate estimation
 *
 * The meta-reflection agent is the "executive function" of the dialectical
 * system, responsible for deciding when the dialectic has converged or
 * needs redirection.
 */

import type {
  AgentConfig,
  AgentExecutionStep,
  MetaDecision,
  ThesisOutput,
  NegationOutput,
  ContradictionOutput,
  SublationOutput,
  DialecticalWorkflowConfig,
  Community,
  KGDiff,
} from '@lifeos/agents'
import { createLogger } from '../lib/logger.js'
import { executeAgentWithEvents, type AgentExecutionContext } from './langgraph/utils.js'

const log = createLogger('MetaReflection')

// ----- Configuration Constants -----

/** Default velocity threshold for termination consideration */
const DEFAULT_VELOCITY_THRESHOLD = 0.1
/** Number of cycles to compute velocity trend */
const VELOCITY_TREND_WINDOW = 3
/** Minimum cycles before auto-termination */
const MIN_CYCLES_BEFORE_TERMINATE = 2
/** Contradiction density threshold (contradictions per claim) */
const HIGH_CONTRADICTION_DENSITY = 0.5
/** Low learning rate threshold */
const LOW_LEARNING_RATE = 0.05
/** Threshold for velocity trend slope to be considered increasing */
const VELOCITY_TREND_THRESHOLD = 0.05

// ----- Velocity Calculation Weights -----

/** Weight for new claims contribution to velocity */
const VELOCITY_WEIGHT_NEW_CLAIMS = 0.3
/** Weight for new predictions contribution to velocity */
const VELOCITY_WEIGHT_NEW_PREDICTIONS = 0.3
/** Weight for operators contribution to velocity */
const VELOCITY_WEIGHT_OPERATORS = 0.2
/** Weight for concept splits contribution to velocity */
const VELOCITY_WEIGHT_SPLITS = 0.4
/** Weight for concept merges contribution to velocity */
const VELOCITY_WEIGHT_MERGES = 0.4
/** Weight for new mediators contribution to velocity */
const VELOCITY_WEIGHT_MEDIATORS = 0.3
/** Weight for edge reversals contribution to velocity */
const VELOCITY_WEIGHT_REVERSALS = 0.5
/** Weight for new contradictions contribution to velocity */
const VELOCITY_WEIGHT_NEW_CONTRADICTIONS = 0.2
/** Weight for resolved contradictions (reduces velocity) */
const VELOCITY_WEIGHT_RESOLVED_CONTRADICTIONS = 0.1
/** Decay factor per thesis beyond 2 */
const VELOCITY_THESIS_DECAY = 0.95

// ----- Max Expected Counts for Normalization -----

/** Max expected new claims per synthesis */
const MAX_EXPECTED_NEW_CLAIMS = 10
/** Max expected new predictions per synthesis */
const MAX_EXPECTED_NEW_PREDICTIONS = 5
/** Max expected operators per synthesis */
const MAX_EXPECTED_OPERATORS = 5
/** Max expected concept splits per cycle */
const MAX_EXPECTED_SPLITS = 3
/** Max expected concept merges per cycle */
const MAX_EXPECTED_MERGES = 3
/** Max expected mediators per cycle */
const MAX_EXPECTED_MEDIATORS = 3
/** Max expected edge reversals per cycle */
const MAX_EXPECTED_REVERSALS = 2
/** Max expected new contradictions per cycle */
const MAX_EXPECTED_NEW_CONTRADICTIONS = 5

// ----- Types -----

/**
 * Comprehensive metrics for a dialectical cycle
 */
export interface CycleMetrics {
  cycleNumber: number
  timestamp: number

  // Conceptual velocity
  velocity: number
  velocityTrend: 'increasing' | 'decreasing' | 'stable'
  velocityHistory: number[]

  // Contradiction metrics
  totalContradictions: number
  highSeverityContradictions: number
  resolvedContradictions: number
  contradictionDensity: number

  // Thesis metrics
  thesisCount: number
  averageThesisConfidence: number
  lensDistribution: Record<string, number>

  // Synthesis metrics
  operatorCount: number
  preservedRatio: number
  noveltyScore: number

  // Community metrics
  communityCount: number
  avgCommunitySize: number
  crossCommunityRelations: number

  // Learning metrics
  learningRate: number
  convergenceScore: number

  // Cost metrics
  tokensUsed: number
  estimatedCost: number
}

/**
 * Input for meta-reflection
 */
export interface MetaReflectionInput {
  cycleNumber: number
  goal: string
  context: Record<string, unknown>
  theses: ThesisOutput[]
  negations: NegationOutput[]
  contradictions: ContradictionOutput[]
  synthesis: SublationOutput | null
  communities: Community[]
  kgDiff: KGDiff | null
  previousMetrics: CycleMetrics[]
  tokensUsedThisCycle: number
  costThisCycle: number
}

/**
 * Result of meta-reflection
 */
export interface MetaReflectionResult {
  decision: MetaDecision
  metrics: CycleMetrics
  reasoning: string
  refinedGoal?: string
  focusAreas?: string[]
  warnings: string[]
  step: AgentExecutionStep
}

// ----- Main Function -----

/**
 * Run meta-reflection to decide next steps
 */
export async function runMetaReflection(
  input: MetaReflectionInput,
  metaAgent: AgentConfig,
  execContext: AgentExecutionContext,
  config: DialecticalWorkflowConfig,
  baseStepCount: number
): Promise<MetaReflectionResult> {
  log.info('Running meta-reflection', { cycleNumber: input.cycleNumber })

  // Calculate comprehensive metrics
  const metrics = calculateCycleMetrics(input, config)

  // Check automatic termination conditions
  const autoTermination = checkAutoTermination(metrics, input, config)
  if (autoTermination) {
    log.info('Auto-termination triggered', { reason: autoTermination.reason })
    return {
      decision: 'TERMINATE',
      metrics,
      reasoning: autoTermination.reason,
      warnings: autoTermination.warnings,
      step: createDummyStep('auto_terminate', metrics, autoTermination.reason),
    }
  }

  // Consult meta-agent for decision
  const prompt = buildMetaReflectionPrompt(input, metrics, config)

  const step = await executeAgentWithEvents(
    metaAgent,
    prompt,
    {
      cycleNumber: input.cycleNumber,
      phase: 'meta_reflection',
      velocity: metrics.velocity,
      contradictionDensity: metrics.contradictionDensity,
      learningRate: metrics.learningRate,
    },
    execContext,
    { stepNumber: baseStepCount + 1 }
  )

  // Parse the decision
  const parsed = parseMetaReflectionOutput(step.output)

  return {
    decision: parsed.decision,
    metrics,
    reasoning: parsed.reasoning,
    refinedGoal: parsed.refinedGoal,
    focusAreas: parsed.focusAreas,
    warnings: generateWarnings(metrics, config),
    step,
  }
}

// ----- Metrics Calculation -----

/**
 * Calculate comprehensive metrics for the current cycle
 */
function calculateCycleMetrics(
  input: MetaReflectionInput,
  config: DialecticalWorkflowConfig
): CycleMetrics {
  const { theses, contradictions, synthesis, communities, kgDiff, previousMetrics } = input

  // Velocity calculation
  const velocity = calculateConceptualVelocity(synthesis, kgDiff, theses)
  const velocityHistory = [...previousMetrics.map((m) => m.velocity), velocity]
  const velocityTrend = calculateVelocityTrend(velocityHistory)

  // Contradiction metrics
  const highSeverityContradictions = contradictions.filter((c) => c.severity === 'HIGH').length
  const resolvedContradictions = kgDiff?.resolvedContradictions?.length ?? 0
  const totalClaims = theses.reduce((sum, t) => {
    const claimCount = t.falsificationCriteria.length + t.decisionImplications.length
    return sum + claimCount
  }, 0)
  const contradictionDensity = totalClaims > 0 ? contradictions.length / totalClaims : 0

  // Thesis metrics
  const averageThesisConfidence =
    theses.length > 0 ? theses.reduce((sum, t) => sum + t.confidence, 0) / theses.length : 0

  const lensDistribution: Record<string, number> = {}
  for (const t of theses) {
    lensDistribution[t.lens] = (lensDistribution[t.lens] ?? 0) + 1
  }

  // Synthesis metrics
  const operatorCount = synthesis?.operators?.length ?? 0
  const preservedCount = synthesis?.preservedElements?.length ?? 0
  const negatedCount = synthesis?.negatedElements?.length ?? 0
  const preservedRatio =
    preservedCount + negatedCount > 0 ? preservedCount / (preservedCount + negatedCount) : 0
  const noveltyScore = calculateNoveltyScore(synthesis)

  // Community metrics
  const avgCommunitySize =
    communities.length > 0
      ? communities.reduce((sum, c) => sum + c.conceptIds.length, 0) / communities.length
      : 0

  // Learning rate (rate of new concepts being solidified)
  const learningRate = calculateLearningRate(kgDiff, previousMetrics)

  // Convergence score (inverse of velocity over time)
  const convergenceScore = calculateConvergenceScore(velocityHistory, config)

  return {
    cycleNumber: input.cycleNumber,
    timestamp: Date.now(),
    velocity,
    velocityTrend,
    velocityHistory,
    totalContradictions: contradictions.length,
    highSeverityContradictions,
    resolvedContradictions,
    contradictionDensity,
    thesisCount: theses.length,
    averageThesisConfidence,
    lensDistribution,
    operatorCount,
    preservedRatio,
    noveltyScore,
    communityCount: communities.length,
    avgCommunitySize,
    crossCommunityRelations: 0, // Would need CrossCommunityRelation[] input
    learningRate,
    convergenceScore,
    tokensUsed: input.tokensUsedThisCycle,
    estimatedCost: input.costThisCycle,
  }
}

/**
 * Calculate conceptual velocity (rate of meaningful change)
 */
function calculateConceptualVelocity(
  synthesis: SublationOutput | null,
  kgDiff: KGDiff | null,
  theses: ThesisOutput[]
): number {
  if (!synthesis && !kgDiff) return 1.0 // High velocity at start

  let changeScore = 0
  let maxPossibleChange = 1

  // Changes from synthesis
  if (synthesis) {
    const newClaims = synthesis.newClaims?.length ?? 0
    const newPredictions = synthesis.newPredictions?.length ?? 0
    const operators = synthesis.operators?.length ?? 0

    changeScore +=
      newClaims * VELOCITY_WEIGHT_NEW_CLAIMS +
      newPredictions * VELOCITY_WEIGHT_NEW_PREDICTIONS +
      operators * VELOCITY_WEIGHT_OPERATORS

    maxPossibleChange +=
      MAX_EXPECTED_NEW_CLAIMS * VELOCITY_WEIGHT_NEW_CLAIMS +
      MAX_EXPECTED_NEW_PREDICTIONS * VELOCITY_WEIGHT_NEW_PREDICTIONS +
      MAX_EXPECTED_OPERATORS * VELOCITY_WEIGHT_OPERATORS
  }

  // Changes from KG diff
  if (kgDiff) {
    const splits = kgDiff.conceptSplits?.length ?? 0
    const merges = kgDiff.conceptMerges?.length ?? 0
    const mediators = kgDiff.newMediators?.length ?? 0
    const reversals = kgDiff.edgeReversals?.length ?? 0
    const newContradictions = kgDiff.newContradictions?.length ?? 0
    const resolvedContradictions = kgDiff.resolvedContradictions?.length ?? 0

    changeScore +=
      splits * VELOCITY_WEIGHT_SPLITS +
      merges * VELOCITY_WEIGHT_MERGES +
      mediators * VELOCITY_WEIGHT_MEDIATORS +
      reversals * VELOCITY_WEIGHT_REVERSALS +
      newContradictions * VELOCITY_WEIGHT_NEW_CONTRADICTIONS -
      resolvedContradictions * VELOCITY_WEIGHT_RESOLVED_CONTRADICTIONS // Resolution reduces velocity

    maxPossibleChange +=
      MAX_EXPECTED_SPLITS * VELOCITY_WEIGHT_SPLITS +
      MAX_EXPECTED_MERGES * VELOCITY_WEIGHT_MERGES +
      MAX_EXPECTED_MEDIATORS * VELOCITY_WEIGHT_MEDIATORS +
      MAX_EXPECTED_REVERSALS * VELOCITY_WEIGHT_REVERSALS +
      MAX_EXPECTED_NEW_CONTRADICTIONS * VELOCITY_WEIGHT_NEW_CONTRADICTIONS
  }

  // Normalize to 0-1
  const velocity = Math.min(1, Math.max(0, changeScore / maxPossibleChange))

  // Decay based on thesis count (more theses = more expected change)
  const thesisDecay = Math.pow(VELOCITY_THESIS_DECAY, theses.length - 2)

  return velocity * thesisDecay
}

/**
 * Calculate velocity trend over recent cycles
 */
function calculateVelocityTrend(velocityHistory: number[]): 'increasing' | 'decreasing' | 'stable' {
  if (velocityHistory.length < 2) return 'stable'

  const recent = velocityHistory.slice(-VELOCITY_TREND_WINDOW)
  if (recent.length < 2) return 'stable'

  // Calculate trend using linear regression slope
  const n = recent.length
  const sumX = (n * (n - 1)) / 2
  const sumY = recent.reduce((a, b) => a + b, 0)
  const sumXY = recent.reduce((sum, y, x) => sum + x * y, 0)
  const sumXX = (n * (n - 1) * (2 * n - 1)) / 6

  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX)

  if (slope > VELOCITY_TREND_THRESHOLD) return 'increasing'
  if (slope < -VELOCITY_TREND_THRESHOLD) return 'decreasing'
  return 'stable'
}

/**
 * Calculate novelty score from synthesis
 */
function calculateNoveltyScore(synthesis: SublationOutput | null): number {
  if (!synthesis) return 0

  const newClaims = synthesis.newClaims?.length ?? 0
  const newPredictions = synthesis.newPredictions?.length ?? 0
  const newGraph = Object.keys(synthesis.newConceptGraph ?? {}).length

  // Weighted novelty
  const rawNovelty = newClaims * 0.4 + newPredictions * 0.4 + newGraph * 0.2

  // Normalize (assume max of ~10 new items is "full" novelty)
  return Math.min(1, rawNovelty / 10)
}

/**
 * Calculate learning rate (solidification of new concepts)
 */
function calculateLearningRate(kgDiff: KGDiff | null, previousMetrics: CycleMetrics[]): number {
  if (!kgDiff || previousMetrics.length === 0) return 0.5 // Initial rate

  // Learning = new claims that persist - superseded claims
  const newClaims = kgDiff.newClaims?.length ?? 0
  const superseded = kgDiff.supersededClaims?.length ?? 0

  // Compare to previous cycles
  const avgPreviousNovelty =
    previousMetrics.length > 0
      ? previousMetrics.reduce((sum, m) => sum + m.noveltyScore, 0) / previousMetrics.length
      : 0.5

  const netLearning = newClaims - superseded
  const learningRate = netLearning / Math.max(1, newClaims + superseded)

  // Blend with historical trend
  return 0.7 * learningRate + 0.3 * avgPreviousNovelty
}

/**
 * Calculate convergence score (how close to termination)
 */
function calculateConvergenceScore(
  velocityHistory: number[],
  config: DialecticalWorkflowConfig
): number {
  if (velocityHistory.length === 0) return 0

  const currentVelocity = velocityHistory[velocityHistory.length - 1]
  const threshold = config.velocityThreshold

  // Convergence is inverse of velocity relative to threshold
  if (currentVelocity <= threshold) return 1.0 // Fully converged
  if (currentVelocity >= 1.0) return 0.0 // No convergence

  return 1 - (currentVelocity - threshold) / (1 - threshold)
}

// ----- Auto-Termination -----

interface AutoTerminationResult {
  reason: string
  warnings: string[]
}

/**
 * Check if automatic termination should be triggered
 */
function checkAutoTermination(
  metrics: CycleMetrics,
  _input: MetaReflectionInput,
  config: DialecticalWorkflowConfig
): AutoTerminationResult | null {
  // Note: _input reserved for future heuristic checks

  // Check max cycles
  if (metrics.cycleNumber >= config.maxCycles) {
    return {
      reason: `Maximum cycles (${config.maxCycles}) reached`,
      warnings: ['Consider increasing maxCycles if more exploration needed'],
    }
  }

  // Check velocity threshold (only after minCycles)
  if (metrics.cycleNumber >= config.minCycles) {
    if (metrics.velocity < config.velocityThreshold) {
      // Check for velocity plateau
      if (
        metrics.velocityTrend === 'stable' &&
        metrics.velocityHistory.length >= VELOCITY_TREND_WINDOW
      ) {
        return {
          reason: `Velocity (${metrics.velocity.toFixed(3)}) below threshold (${config.velocityThreshold}) with stable trend`,
          warnings: [],
        }
      }
    }
  }

  // Check for learning stagnation
  if (
    metrics.learningRate < LOW_LEARNING_RATE &&
    metrics.cycleNumber >= MIN_CYCLES_BEFORE_TERMINATE
  ) {
    return {
      reason: `Learning rate (${metrics.learningRate.toFixed(3)}) too low - concepts not solidifying`,
      warnings: ['Consider respecifying the goal with more constraints'],
    }
  }

  // Check for complete convergence
  if (metrics.convergenceScore >= 0.95 && metrics.cycleNumber >= config.minCycles) {
    return {
      reason: 'Full convergence reached - dialectic has stabilized',
      warnings: [],
    }
  }

  return null
}

// ----- Warnings Generation -----

/**
 * Generate warnings based on metrics
 */
function generateWarnings(metrics: CycleMetrics, config: DialecticalWorkflowConfig): string[] {
  const warnings: string[] = []

  // High contradiction density
  if (metrics.contradictionDensity > HIGH_CONTRADICTION_DENSITY) {
    warnings.push(
      `High contradiction density (${(metrics.contradictionDensity * 100).toFixed(1)}%) - consider narrowing scope`
    )
  }

  // Decreasing velocity trend
  if (metrics.velocityTrend === 'decreasing') {
    warnings.push('Conceptual velocity is decreasing - convergence approaching')
  }

  // Low preserved ratio
  if (metrics.preservedRatio < 0.3) {
    warnings.push(
      `Low preservation ratio (${(metrics.preservedRatio * 100).toFixed(1)}%) - synthesis may be too destructive`
    )
  }

  // High operator count
  if (metrics.operatorCount > 10) {
    warnings.push(
      `High operator count (${metrics.operatorCount}) - synthesis complexity may indicate unclear goal`
    )
  }

  // Approaching max cycles
  const cyclesRemaining = config.maxCycles - metrics.cycleNumber
  if (cyclesRemaining <= 2 && cyclesRemaining > 0) {
    warnings.push(`Only ${cyclesRemaining} cycles remaining before automatic termination`)
  }

  return warnings
}

// ----- Prompt Builder -----

function buildMetaReflectionPrompt(
  input: MetaReflectionInput,
  metrics: CycleMetrics,
  config: DialecticalWorkflowConfig
): string {
  const cycleProgress = `${input.cycleNumber}/${config.maxCycles}`
  const velocityStatus =
    metrics.velocity < config.velocityThreshold
      ? '⚠️ BELOW THRESHOLD'
      : metrics.velocityTrend === 'decreasing'
        ? '📉 Decreasing'
        : '✓ Healthy'

  return `You are the meta-reflection agent evaluating the dialectical cycle.

GOAL: ${input.goal}

CYCLE PROGRESS: ${cycleProgress}
VELOCITY: ${metrics.velocity.toFixed(3)} (threshold: ${config.velocityThreshold}) ${velocityStatus}
CONVERGENCE: ${(metrics.convergenceScore * 100).toFixed(1)}%
LEARNING RATE: ${(metrics.learningRate * 100).toFixed(1)}%

CONTRADICTION STATUS:
- Total: ${metrics.totalContradictions}
- HIGH severity: ${metrics.highSeverityContradictions}
- Resolved this cycle: ${metrics.resolvedContradictions}
- Density: ${(metrics.contradictionDensity * 100).toFixed(1)}% (contradictions per claim)

THESIS QUALITY:
- Count: ${metrics.thesisCount}
- Avg confidence: ${(metrics.averageThesisConfidence * 100).toFixed(1)}%
- Lens distribution: ${JSON.stringify(metrics.lensDistribution)}

SYNTHESIS QUALITY:
- Operators used: ${metrics.operatorCount}
- Preserved ratio: ${(metrics.preservedRatio * 100).toFixed(1)}%
- Novelty score: ${(metrics.noveltyScore * 100).toFixed(1)}%

COMMUNITY STATUS:
- Communities: ${metrics.communityCount}
- Avg size: ${metrics.avgCommunitySize.toFixed(1)} concepts

COST THIS CYCLE: ${metrics.tokensUsed} tokens, $${metrics.estimatedCost.toFixed(4)}

Based on this analysis, decide:
- **CONTINUE**: More cycles needed, goal remains appropriate
- **TERMINATE**: Sufficient progress made, end the dialectic
- **RESPECIFY**: Goal needs refinement based on discoveries

Respond with JSON:
{
  "decision": "CONTINUE|TERMINATE|RESPECIFY",
  "reasoning": "Explanation for the decision",
  "refinedGoal": "New goal if RESPECIFY",
  "focusAreas": ["areas to focus on next cycle if CONTINUE"]
}

Consider:
1. Are high-severity contradictions being resolved?
2. Is the learning rate positive (new concepts solidifying)?
3. Is the velocity trend sustainable?
4. Have we discovered something that changes the original goal?
5. Is continuing worth the additional cost?`
}

// ----- Parsers -----

interface ParsedMetaReflection {
  decision: MetaDecision
  reasoning: string
  refinedGoal?: string
  focusAreas?: string[]
}

function parseMetaReflectionOutput(output: string): ParsedMetaReflection {
  try {
    const jsonMatch = output.match(/\{[\s\S]*\}/)?.[0]
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch)
      return {
        decision: mapMetaDecision(parsed.decision),
        reasoning: parsed.reasoning ?? 'No reasoning provided',
        refinedGoal: parsed.refinedGoal,
        focusAreas: parsed.focusAreas,
      }
    }
  } catch (error) {
    log.warn('Failed to parse meta-reflection JSON', { error })
  }

  // Default to CONTINUE if parsing fails
  return {
    decision: 'CONTINUE',
    reasoning: 'Failed to parse meta-agent output, defaulting to CONTINUE',
  }
}

function mapMetaDecision(raw: string): MetaDecision {
  const upper = (raw ?? '').toUpperCase()
  if (upper.includes('TERMINATE')) return 'TERMINATE'
  if (upper.includes('RESPECIFY')) return 'RESPECIFY'
  return 'CONTINUE'
}

/**
 * Create a dummy step for auto-termination (no LLM call)
 */
function createDummyStep(
  reason: string,
  _metrics: CycleMetrics,
  reasoning: string
): AgentExecutionStep {
  return {
    agentId: 'system_auto_terminate',
    agentName: 'Auto-Termination',
    output: JSON.stringify({ decision: 'TERMINATE', reason, reasoning }),
    tokensUsed: 0,
    estimatedCost: 0,
    provider: 'system',
    model: 'auto_terminate',
    executedAtMs: Date.now(),
  }
}

// ----- Exports -----

export {
  DEFAULT_VELOCITY_THRESHOLD,
  VELOCITY_TREND_WINDOW,
  MIN_CYCLES_BEFORE_TERMINATE,
  HIGH_CONTRADICTION_DENSITY,
  LOW_LEARNING_RATE,
  calculateCycleMetrics,
  calculateConceptualVelocity,
}
