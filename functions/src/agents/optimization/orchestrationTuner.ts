/**
 * Orchestration Tuner - Step-Level Workflow Optimization
 *
 * Analyzes workflow telemetry to generate orchestration recommendations:
 * - Agent ordering optimization
 * - Parallelization opportunities
 * - Model selection (cost-quality Pareto analysis)
 * - Temperature/parameter tuning
 * - Retry/fallback strategies
 */

import { getFirestore } from 'firebase-admin/firestore'
import { v4 as uuidv4 } from 'uuid'
import type {
  OrchestrationRecommendation,
  OrchestrationRecommendationId,
  OrchestrationRecommendationType,
  CostQualityAnalysis,
  OptimizationEvent,
} from '@lifeos/agents'
import { MODEL_TIER_MAP, asId } from '@lifeos/agents'
import type { RunId, WorkflowId, AgentId } from '@lifeos/agents'
import { EvaluationPaths, TelemetryPaths } from '../shared/collectionPaths.js'

// ----- Collection Paths -----

function getRecommendationsPath(userId: string): string {
  return `users/${userId}/optimization/recommendations`
}

function getCostQualityPath(userId: string): string {
  return `users/${userId}/optimization/costQuality`
}

function getOptimizationEventsPath(userId: string): string {
  return `users/${userId}/optimization/events`
}

// ----- Analysis Types -----

/**
 * Step-level telemetry for analysis
 */
interface StepTelemetry {
  stepIndex: number
  agentId: string
  agentName: string
  model: string
  provider: string
  durationMs: number
  tokensUsed: number
  estimatedCost: number
  qualityScore?: number
  success: boolean
  errorType?: string
  retryCount: number
}

/**
 * Run summary for analysis
 */
interface RunSummary {
  runId: RunId
  workflowId: WorkflowId
  workflowType: string
  steps: StepTelemetry[]
  totalDurationMs: number
  totalTokens: number
  totalCost: number
  qualityScore: number
  success: boolean
  createdAtMs: number
}

/**
 * Agent performance stats
 */
interface AgentPerformanceStats {
  agentId: string
  agentName: string
  runCount: number
  avgDurationMs: number
  p95DurationMs: number
  avgTokens: number
  avgCost: number
  avgQualityContribution: number // How much this agent improves final quality
  successRate: number
  retryRate: number
  modelUsage: Record<string, number> // Model -> count
}

/**
 * Model performance stats
 */
interface ModelPerformanceStats {
  model: string
  provider: string
  runCount: number
  avgQuality: number
  avgCost: number
  avgDuration: number
  successRate: number
}

/**
 * Bottleneck analysis result
 */
interface BottleneckAnalysis {
  bottlenecks: Array<{
    type: 'slow_agent' | 'expensive_agent' | 'unreliable_agent' | 'sequential_blocking'
    agentId: string
    agentName: string
    severity: 'low' | 'medium' | 'high'
    metric: string
    value: number
    threshold: number
    recommendation: string
  }>
  overallHealth: 'good' | 'fair' | 'poor'
}

// ----- Recommendation CRUD -----

/**
 * Create an orchestration recommendation
 */
export async function createRecommendation(
  userId: string,
  data: Omit<OrchestrationRecommendation, 'recommendationId' | 'createdAtMs' | 'status'>
): Promise<OrchestrationRecommendation> {
  const db = getFirestore()
  const recommendationId = `rec_${uuidv4()}` as OrchestrationRecommendationId
  const now = Date.now()

  const recommendation: OrchestrationRecommendation = {
    ...data,
    recommendationId,
    status: 'pending',
    createdAtMs: now,
    expiresAtMs: now + 30 * 24 * 60 * 60 * 1000, // 30 days
  }

  await db.doc(`${getRecommendationsPath(userId)}/${recommendationId}`).set(recommendation)

  return recommendation
}

/**
 * Get a recommendation by ID
 */
export async function getRecommendation(
  userId: string,
  recommendationId: OrchestrationRecommendationId
): Promise<OrchestrationRecommendation | null> {
  const db = getFirestore()
  const doc = await db.doc(`${getRecommendationsPath(userId)}/${recommendationId}`).get()

  if (!doc.exists) {
    return null
  }

  return doc.data() as OrchestrationRecommendation
}

/**
 * List recommendations
 */
export async function listRecommendations(
  userId: string,
  options: {
    workflowId?: WorkflowId
    workflowType?: string
    status?: OrchestrationRecommendation['status']
    type?: OrchestrationRecommendationType
    limit?: number
  } = {}
): Promise<OrchestrationRecommendation[]> {
  const db = getFirestore()
  let query = db.collection(getRecommendationsPath(userId)).orderBy('createdAtMs', 'desc')

  if (options.workflowId) {
    query = query.where('workflowId', '==', options.workflowId)
  }

  if (options.workflowType) {
    query = query.where('workflowType', '==', options.workflowType)
  }

  if (options.status) {
    query = query.where('status', '==', options.status)
  }

  if (options.type) {
    query = query.where('type', '==', options.type)
  }

  if (options.limit) {
    query = query.limit(options.limit)
  }

  const snapshot = await query.get()
  return snapshot.docs.map((doc) => doc.data() as OrchestrationRecommendation)
}

/**
 * Update recommendation status
 */
export async function updateRecommendationStatus(
  userId: string,
  recommendationId: OrchestrationRecommendationId,
  status: OrchestrationRecommendation['status'],
  reason?: string
): Promise<OrchestrationRecommendation | null> {
  const db = getFirestore()
  const docRef = db.doc(`${getRecommendationsPath(userId)}/${recommendationId}`)
  const doc = await docRef.get()

  if (!doc.exists) {
    return null
  }

  const updates: Partial<OrchestrationRecommendation> = { status }

  if (status === 'applied') {
    updates.appliedAtMs = Date.now()
  }

  if (status === 'rejected' && reason) {
    updates.rejectedReason = reason
  }

  await docRef.update(updates)

  // Log event
  await logOptimizationEvent(userId, {
    eventType: 'recommendation_applied',
    description: `Recommendation ${recommendationId} ${status}`,
    details: { recommendationId, status, reason },
    triggeredBy: 'user',
  })

  const updated = await docRef.get()
  return updated.data() as OrchestrationRecommendation
}

// ----- Telemetry Analysis -----

/**
 * Fetch run summaries for analysis
 */
async function fetchRunSummaries(
  userId: string,
  options: {
    workflowType?: string
    workflowId?: WorkflowId
    lookbackDays?: number
    limit?: number
  }
): Promise<RunSummary[]> {
  const db = getFirestore()
  const { workflowType, workflowId, lookbackDays = 30, limit = 100 } = options
  const cutoffMs = Date.now() - lookbackDays * 24 * 60 * 60 * 1000

  let query = db
    .collection(TelemetryPaths.runs(userId))
    .where('createdAtMs', '>=', cutoffMs)
    .orderBy('createdAtMs', 'desc')

  if (workflowType) {
    query = query.where('workflowType', '==', workflowType)
  }

  if (workflowId) {
    query = query.where('workflowId', '==', workflowId)
  }

  query = query.limit(limit)

  const snapshot = await query.get()
  return snapshot.docs.map((doc) => {
    const data = doc.data()
    return {
      runId: doc.id as RunId,
      workflowId: data.workflowId,
      workflowType: data.workflowType,
      steps: data.steps || [],
      totalDurationMs: data.totalDurationMs || 0,
      totalTokens: data.totalTokens || 0,
      totalCost: data.totalCost || 0,
      qualityScore: data.qualityScore || 0,
      success: data.success !== false,
      createdAtMs: data.createdAtMs,
    }
  })
}

/**
 * Compute agent performance stats from run summaries
 */
function computeAgentStats(runs: RunSummary[]): Map<string, AgentPerformanceStats> {
  const agentData = new Map<string, StepTelemetry[]>()

  for (const run of runs) {
    for (const step of run.steps) {
      const existing = agentData.get(step.agentId) || []
      existing.push(step)
      agentData.set(step.agentId, existing)
    }
  }

  const stats = new Map<string, AgentPerformanceStats>()

  for (const [agentId, steps] of agentData) {
    const durations = steps.map((s) => s.durationMs).sort((a, b) => a - b)
    const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length
    const p95Index = Math.floor(durations.length * 0.95)
    const p95Duration = durations[p95Index] || durations[durations.length - 1]

    const avgTokens = steps.reduce((sum, s) => sum + s.tokensUsed, 0) / steps.length
    const avgCost = steps.reduce((sum, s) => sum + s.estimatedCost, 0) / steps.length

    const successCount = steps.filter((s) => s.success).length
    const retryCount = steps.filter((s) => s.retryCount > 0).length

    // Compute quality contribution (average of quality scores where available)
    const stepsWithQuality = steps.filter((s) => s.qualityScore !== undefined)
    const avgQualityContribution =
      stepsWithQuality.length > 0
        ? stepsWithQuality.reduce((sum, s) => sum + (s.qualityScore || 0), 0) /
          stepsWithQuality.length
        : 0

    // Model usage distribution
    const modelUsage: Record<string, number> = {}
    for (const step of steps) {
      modelUsage[step.model] = (modelUsage[step.model] || 0) + 1
    }

    stats.set(agentId, {
      agentId,
      agentName: steps[0].agentName,
      runCount: steps.length,
      avgDurationMs: avgDuration,
      p95DurationMs: p95Duration,
      avgTokens,
      avgCost,
      avgQualityContribution,
      successRate: successCount / steps.length,
      retryRate: retryCount / steps.length,
      modelUsage,
    })
  }

  return stats
}

/**
 * Compute model performance stats from run summaries
 */
function computeModelStats(runs: RunSummary[]): Map<string, ModelPerformanceStats> {
  const modelData = new Map<string, { steps: StepTelemetry[]; runs: RunSummary[] }>()

  for (const run of runs) {
    for (const step of run.steps) {
      const key = `${step.provider}:${step.model}`
      const existing = modelData.get(key) || { steps: [], runs: [] }
      existing.steps.push(step)
      if (!existing.runs.includes(run)) {
        existing.runs.push(run)
      }
      modelData.set(key, existing)
    }
  }

  const stats = new Map<string, ModelPerformanceStats>()

  for (const [key, data] of modelData) {
    const [provider, model] = key.split(':')
    const { steps, runs: modelRuns } = data

    const avgCost = steps.reduce((sum, s) => sum + s.estimatedCost, 0) / steps.length
    const avgDuration = steps.reduce((sum, s) => sum + s.durationMs, 0) / steps.length

    // Use run-level quality for model quality
    const avgQuality = modelRuns.reduce((sum, r) => sum + r.qualityScore, 0) / modelRuns.length

    const successCount = steps.filter((s) => s.success).length

    stats.set(key, {
      model,
      provider,
      runCount: steps.length,
      avgQuality,
      avgCost,
      avgDuration,
      successRate: successCount / steps.length,
    })
  }

  return stats
}

// ----- Bottleneck Detection -----

/**
 * Analyze workflow for bottlenecks
 */
export async function analyzeBottlenecks(
  userId: string,
  options: {
    workflowType?: string
    workflowId?: WorkflowId
    thresholds?: {
      slowAgentMs?: number
      expensiveAgentCost?: number
      unreliableAgentSuccessRate?: number
    }
  }
): Promise<BottleneckAnalysis> {
  const runs = await fetchRunSummaries(userId, {
    workflowType: options.workflowType,
    workflowId: options.workflowId,
  })

  if (runs.length === 0) {
    return { bottlenecks: [], overallHealth: 'good' }
  }

  const agentStats = computeAgentStats(runs)
  const thresholds = options.thresholds || {}
  const slowThreshold = thresholds.slowAgentMs || 30000 // 30 seconds
  const expensiveThreshold = thresholds.expensiveAgentCost || 0.1 // $0.10
  const unreliableThreshold = thresholds.unreliableAgentSuccessRate || 0.9 // 90%

  const bottlenecks: BottleneckAnalysis['bottlenecks'] = []

  for (const [agentId, stats] of agentStats) {
    // Check for slow agents
    if (stats.p95DurationMs > slowThreshold) {
      const severity =
        stats.p95DurationMs > slowThreshold * 3
          ? 'high'
          : stats.p95DurationMs > slowThreshold * 2
            ? 'medium'
            : 'low'

      bottlenecks.push({
        type: 'slow_agent',
        agentId,
        agentName: stats.agentName,
        severity,
        metric: 'p95DurationMs',
        value: stats.p95DurationMs,
        threshold: slowThreshold,
        recommendation: `Consider using a faster model or caching results for ${stats.agentName}`,
      })
    }

    // Check for expensive agents
    if (stats.avgCost > expensiveThreshold) {
      const severity =
        stats.avgCost > expensiveThreshold * 5
          ? 'high'
          : stats.avgCost > expensiveThreshold * 2
            ? 'medium'
            : 'low'

      bottlenecks.push({
        type: 'expensive_agent',
        agentId,
        agentName: stats.agentName,
        severity,
        metric: 'avgCost',
        value: stats.avgCost,
        threshold: expensiveThreshold,
        recommendation: `Consider using a cheaper model for ${stats.agentName} if quality permits`,
      })
    }

    // Check for unreliable agents
    if (stats.successRate < unreliableThreshold) {
      const severity =
        stats.successRate < unreliableThreshold * 0.7
          ? 'high'
          : stats.successRate < unreliableThreshold * 0.9
            ? 'medium'
            : 'low'

      bottlenecks.push({
        type: 'unreliable_agent',
        agentId,
        agentName: stats.agentName,
        severity,
        metric: 'successRate',
        value: stats.successRate,
        threshold: unreliableThreshold,
        recommendation: `Add retry logic or fallback model for ${stats.agentName}`,
      })
    }
  }

  // Determine overall health
  const highCount = bottlenecks.filter((b) => b.severity === 'high').length
  const mediumCount = bottlenecks.filter((b) => b.severity === 'medium').length

  const overallHealth = highCount > 0 ? 'poor' : mediumCount > 1 ? 'fair' : 'good'

  return { bottlenecks, overallHealth }
}

// ----- Cost-Quality Pareto Analysis -----

/**
 * Analyze cost-quality tradeoffs across models
 */
export async function analyzeCostQuality(
  userId: string,
  workflowType: string,
  currentModel: string
): Promise<CostQualityAnalysis> {
  const runs = await fetchRunSummaries(userId, { workflowType })

  if (runs.length === 0) {
    return {
      userId,
      workflowType,
      frontier: [],
      currentModel,
      currentCost: 0,
      currentQuality: 0,
      recommendations: [],
      analyzedAtMs: Date.now(),
    }
  }

  const modelStats = computeModelStats(runs)

  // Build Pareto frontier
  const points = Array.from(modelStats.values()).map((stats) => ({
    model: stats.model,
    provider: stats.provider,
    avgCost: stats.avgCost,
    avgQuality: stats.avgQuality,
    sampleCount: stats.runCount,
    isDominated: false,
  }))

  // Mark dominated points
  for (let i = 0; i < points.length; i++) {
    for (let j = 0; j < points.length; j++) {
      if (i === j) continue

      // Point i is dominated if point j has both better quality and lower cost
      if (points[j].avgQuality >= points[i].avgQuality && points[j].avgCost <= points[i].avgCost) {
        if (points[j].avgQuality > points[i].avgQuality || points[j].avgCost < points[i].avgCost) {
          points[i].isDominated = true
          break
        }
      }
    }
  }

  // Find current operating point
  const currentStats = modelStats.get(`*:${currentModel}`) || {
    avgCost: 0,
    avgQuality: 0,
  }

  // Generate recommendations
  const recommendations: CostQualityAnalysis['recommendations'] = []
  const frontierPoints = points.filter((p) => !p.isDominated)

  // Find upgrade opportunities (better quality, higher cost)
  const upgrades = frontierPoints.filter(
    (p) => p.avgQuality > currentStats.avgQuality && p.model !== currentModel
  )

  if (upgrades.length > 0) {
    const bestUpgrade = upgrades.reduce((best, p) => (p.avgQuality > best.avgQuality ? p : best))

    recommendations.push({
      action: 'upgrade',
      targetModel: bestUpgrade.model,
      expectedQualityChange: bestUpgrade.avgQuality - currentStats.avgQuality,
      expectedCostChange: bestUpgrade.avgCost - currentStats.avgCost,
      rationale: `${bestUpgrade.model} offers ${((bestUpgrade.avgQuality - currentStats.avgQuality) * 100).toFixed(1)}% quality improvement`,
    })
  }

  // Find downgrade opportunities (lower cost, acceptable quality loss)
  const downgrades = frontierPoints.filter(
    (p) =>
      p.avgCost < currentStats.avgCost &&
      p.avgQuality >= currentStats.avgQuality * 0.9 && // Accept up to 10% quality loss
      p.model !== currentModel
  )

  if (downgrades.length > 0) {
    const bestDowngrade = downgrades.reduce((best, p) => (p.avgCost < best.avgCost ? p : best))

    const costSavings =
      ((currentStats.avgCost - bestDowngrade.avgCost) / currentStats.avgCost) * 100

    recommendations.push({
      action: 'downgrade',
      targetModel: bestDowngrade.model,
      expectedQualityChange: bestDowngrade.avgQuality - currentStats.avgQuality,
      expectedCostChange: bestDowngrade.avgCost - currentStats.avgCost,
      rationale: `${bestDowngrade.model} offers ${costSavings.toFixed(1)}% cost savings with minimal quality impact`,
    })
  }

  // If current model is on the frontier, recommend maintaining
  const isOnFrontier = frontierPoints.some((p) => p.model === currentModel)
  if (isOnFrontier && recommendations.length === 0) {
    recommendations.push({
      action: 'maintain',
      targetModel: currentModel,
      expectedQualityChange: 0,
      expectedCostChange: 0,
      rationale: 'Current model is Pareto-optimal for this workflow',
    })
  }

  const analysis: CostQualityAnalysis = {
    userId,
    workflowType,
    frontier: points,
    currentModel,
    currentCost: currentStats.avgCost,
    currentQuality: currentStats.avgQuality,
    recommendations,
    analyzedAtMs: Date.now(),
  }

  // Save analysis
  const db = getFirestore()
  await db.doc(`${getCostQualityPath(userId)}/${workflowType}`).set(analysis)

  return analysis
}

// ----- Recommendation Generation -----

/**
 * Generate orchestration recommendations based on analysis
 */
export async function generateRecommendations(
  userId: string,
  workflowId: WorkflowId,
  workflowType: string
): Promise<OrchestrationRecommendation[]> {
  const recommendations: OrchestrationRecommendation[] = []

  // Analyze bottlenecks
  const bottleneckAnalysis = await analyzeBottlenecks(userId, { workflowId })

  for (const bottleneck of bottleneckAnalysis.bottlenecks) {
    if (bottleneck.severity !== 'high') continue // Only recommend for high-severity issues

    let type: OrchestrationRecommendationType
    let changes: Record<string, unknown>

    switch (bottleneck.type) {
      case 'slow_agent':
        type = 'change_model'
        changes = {
          agentId: bottleneck.agentId,
          reason: 'performance',
          suggestedModel: MODEL_TIER_MAP.fast.openai,
        }
        break

      case 'expensive_agent':
        type = 'change_model'
        changes = {
          agentId: bottleneck.agentId,
          reason: 'cost',
          suggestedModel: MODEL_TIER_MAP.fast.openai,
        }
        break

      case 'unreliable_agent':
        type = 'add_retry'
        changes = {
          agentId: bottleneck.agentId,
          maxRetries: 3,
          backoffMs: 1000,
        }
        break

      default:
        continue
    }

    const recommendation = await createRecommendation(userId, {
      userId,
      workflowId,
      workflowType,
      agentId: bottleneck.agentId as AgentId,
      type,
      title: `${bottleneck.type.replace('_', ' ')} detected: ${bottleneck.agentName}`,
      description: bottleneck.recommendation,
      rationale: `${bottleneck.metric} = ${bottleneck.value.toFixed(2)} exceeds threshold of ${bottleneck.threshold}`,
      expectedQualityChange: type === 'add_retry' ? 0.05 : -0.02,
      expectedCostChange: type === 'change_model' ? -0.3 : 0,
      expectedDurationChange: type === 'change_model' ? -0.3 : 0,
      confidenceLevel: 0.7,
      evidenceRunIds: [],
      evidenceSummary: `Based on ${bottleneckAnalysis.bottlenecks.length} identified bottlenecks`,
      sampleSize: 0,
      changes,
    })

    recommendations.push(recommendation)
  }

  // Analyze parallelization opportunities
  const parallelizationRec = await analyzeParallelizationOpportunities(
    userId,
    workflowId,
    workflowType
  )
  if (parallelizationRec) {
    recommendations.push(parallelizationRec)
  }

  return recommendations
}

/**
 * Analyze opportunities to parallelize sequential agents
 */
async function analyzeParallelizationOpportunities(
  userId: string,
  workflowId: WorkflowId,
  workflowType: string
): Promise<OrchestrationRecommendation | null> {
  const runs = await fetchRunSummaries(userId, { workflowId, limit: 20 })

  if (runs.length < 5) {
    return null // Need enough runs to analyze
  }

  // Analyze step dependencies
  // If consecutive steps have no data dependency (output not used as input),
  // they could potentially run in parallel

  // For now, use a heuristic: if multiple agents consistently take similar durations,
  // they might benefit from parallelization
  const agentStats = computeAgentStats(runs)
  const agentList = Array.from(agentStats.values())

  if (agentList.length < 2) {
    return null
  }

  // Find agents with similar durations that could be parallelized
  const sortedByDuration = agentList.sort((a, b) => b.avgDurationMs - a.avgDurationMs)
  const topTwo = sortedByDuration.slice(0, 2)

  // If top two agents have similar durations and together take significant time
  const totalWorkflowDuration = runs.reduce((sum, r) => sum + r.totalDurationMs, 0) / runs.length
  const combinedDuration = topTwo[0].avgDurationMs + topTwo[1].avgDurationMs
  const durationRatio = combinedDuration / totalWorkflowDuration

  if (durationRatio > 0.5) {
    // These two agents account for >50% of workflow time
    const potentialSavings =
      (Math.min(topTwo[0].avgDurationMs, topTwo[1].avgDurationMs) / totalWorkflowDuration) * 100

    return await createRecommendation(userId, {
      userId,
      workflowId,
      workflowType,
      type: 'parallelize',
      title: `Parallelize ${topTwo[0].agentName} and ${topTwo[1].agentName}`,
      description: `These agents account for ${(durationRatio * 100).toFixed(0)}% of workflow time and could potentially run in parallel`,
      rationale: `Running these agents in parallel could reduce total duration by up to ${potentialSavings.toFixed(0)}%`,
      expectedQualityChange: 0,
      expectedCostChange: 0,
      expectedDurationChange: -potentialSavings / 100,
      confidenceLevel: 0.6, // Medium confidence - requires manual verification
      evidenceRunIds: runs.slice(0, 5).map((r) => r.runId),
      evidenceSummary: `Based on analysis of ${runs.length} recent runs`,
      sampleSize: runs.length,
      changes: {
        agents: [topTwo[0].agentId, topTwo[1].agentId],
        estimatedSavingsMs: Math.min(topTwo[0].avgDurationMs, topTwo[1].avgDurationMs),
      },
    })
  }

  return null
}

/**
 * Analyze temperature tuning opportunities
 */
export async function analyzeTemperatureTuning(
  userId: string,
  agentId: AgentId,
  _workflowType: string
): Promise<{
  currentTemperature: number
  recommendedTemperature: number
  rationale: string
} | null> {
  const db = getFirestore()

  // Get consistency variance for this agent
  const consistencySnapshot = await db
    .collection(`users/${userId}/evaluation/consistency`)
    .where('agentId', '==', agentId)
    .orderBy('evaluatedAtMs', 'desc')
    .limit(10)
    .get()

  if (consistencySnapshot.empty) {
    return null
  }

  const consistencyRecords = consistencySnapshot.docs.map((doc) => doc.data())
  const avgVariance =
    consistencyRecords.reduce((sum, r) => sum + (r.semanticVariance || 0), 0) /
    consistencyRecords.length

  // Get quality scores for this agent
  const evalSnapshot = await db
    .collection(EvaluationPaths.results(userId))
    .where('agentId', '==', agentId)
    .orderBy('evaluatedAtMs', 'desc')
    .limit(50)
    .get()

  const evalRecords = evalSnapshot.docs.map((doc) => doc.data())
  const avgQuality =
    evalRecords.reduce((sum, r) => sum + (r.aggregateScore || 0), 0) / evalRecords.length

  // Current temperature (assumed default)
  const currentTemperature = 0.7

  // Decision logic:
  // High variance + low quality → decrease temperature
  // Low variance + high quality → could increase for more creativity
  // High variance + high quality → maintain
  // Low variance + low quality → increase temperature

  let recommendedTemperature = currentTemperature
  let rationale = ''

  if (avgVariance > 0.3 && avgQuality < 0.6) {
    recommendedTemperature = 0.3
    rationale = `High output variance (${(avgVariance * 100).toFixed(0)}%) with low quality (${(avgQuality * 100).toFixed(0)}%) suggests reducing temperature for more consistent results`
  } else if (avgVariance < 0.1 && avgQuality > 0.8) {
    recommendedTemperature = 0.9
    rationale = `Low variance (${(avgVariance * 100).toFixed(0)}%) with high quality (${(avgQuality * 100).toFixed(0)}%) - could increase temperature for more creative outputs if desired`
  } else if (avgVariance < 0.15 && avgQuality < 0.5) {
    recommendedTemperature = 0.8
    rationale = `Low variance with low quality suggests the agent is stuck in a suboptimal pattern. Increasing temperature may help explore better solutions`
  } else {
    return null // No strong recommendation
  }

  return {
    currentTemperature,
    recommendedTemperature,
    rationale,
  }
}

// ----- Utility Functions -----

/**
 * Log an optimization event
 */
async function logOptimizationEvent(
  userId: string,
  event: Omit<OptimizationEvent, 'eventId' | 'userId' | 'createdAtMs'>
): Promise<void> {
  const db = getFirestore()
  const eventId = `evt_${uuidv4()}`

  const fullEvent: OptimizationEvent = {
    ...event,
    eventId: asId<'optimizationEvent'>(eventId),
    userId,
    createdAtMs: Date.now(),
  }

  await db.doc(`${getOptimizationEventsPath(userId)}/${eventId}`).set(fullEvent)
}

/**
 * Check for expired recommendations and mark them
 */
export async function expireOldRecommendations(userId: string): Promise<number> {
  const db = getFirestore()
  const now = Date.now()

  const expiredSnapshot = await db
    .collection(getRecommendationsPath(userId))
    .where('status', '==', 'pending')
    .where('expiresAtMs', '<', now)
    .get()

  const batch = db.batch()
  let count = 0

  for (const doc of expiredSnapshot.docs) {
    batch.update(doc.ref, { status: 'expired' })
    count++
  }

  if (count > 0) {
    await batch.commit()
  }

  return count
}

/**
 * Get a summary of optimization status for a workflow
 */
export async function getOptimizationSummary(
  userId: string,
  workflowId: WorkflowId
): Promise<{
  pendingRecommendations: number
  appliedRecommendations: number
  bottleneckHealth: BottleneckAnalysis['overallHealth']
  lastAnalyzedMs: number | null
}> {
  const pending = await listRecommendations(userId, {
    workflowId,
    status: 'pending',
  })

  const applied = await listRecommendations(userId, {
    workflowId,
    status: 'applied',
  })

  const bottlenecks = await analyzeBottlenecks(userId, { workflowId })

  // Get last analysis time from most recent recommendation
  const allRecs = await listRecommendations(userId, { workflowId, limit: 1 })
  const lastAnalyzedMs = allRecs.length > 0 ? allRecs[0].createdAtMs : null

  return {
    pendingRecommendations: pending.length,
    appliedRecommendations: applied.length,
    bottleneckHealth: bottlenecks.overallHealth,
    lastAnalyzedMs,
  }
}
