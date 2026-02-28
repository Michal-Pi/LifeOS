/**
 * Prompt Optimizer
 *
 * Analyzes A/B test results and manages prompt version lifecycle:
 * - Auto-promote winning variants based on statistical significance
 * - Archive losing variants with metadata
 * - Version tracking and rollback support
 * - Audit logging for all promotions
 */

import { getFirestore } from 'firebase-admin/firestore'
import { createLogger } from '../../lib/logger.js'

const log = createLogger('PromptOptimizer')
import { randomUUID } from 'crypto'
import type {
  OptimizedPromptVersion,
  OptimizedPromptVersionId,
  PromptPromotionAnalysis,
  OptimizationEvent,
  OptimizationEventId,
} from '@lifeos/agents'
import type { AgentId, ExperimentId, PromptVariantId } from '@lifeos/agents'

// ----- Collection Paths -----

function getOptimizedPromptVersionsPath(userId: string): string {
  return `users/${userId}/optimization/promptVersions`
}

function getOptimizationEventsPath(userId: string): string {
  return `users/${userId}/optimization/events`
}

function getExperimentsPath(userId: string): string {
  return `users/${userId}/abTesting/experiments`
}

function getVariantsPath(userId: string): string {
  return `users/${userId}/abTesting/variants`
}

// ----- Prompt Version Management -----

/**
 * Create a new prompt version
 */
export async function createOptimizedPromptVersion(
  userId: string,
  agentId: AgentId,
  data: {
    promptTemplate: string
    systemPrompt?: string
    sourceExperimentId?: ExperimentId
    sourceVariantId?: PromptVariantId
    promotionReason: 'manual' | 'ab_test_winner' | 'rollback' | 'drift_response'
    avgQualityScore?: number
    sampleCount?: number
    pValue?: number
    effectSize?: number
  }
): Promise<OptimizedPromptVersion> {
  const db = getFirestore()
  const now = Date.now()

  // Get current active version to determine version number
  const currentVersion = await getActiveOptimizedPromptVersion(userId, agentId)
  const newVersionNumber = currentVersion ? currentVersion.version + 1 : 1

  const versionId = randomUUID() as OptimizedPromptVersionId

  const promptVersion: OptimizedPromptVersion = {
    versionId,
    userId,
    agentId,
    version: newVersionNumber,
    previousVersionId: currentVersion?.versionId,
    promptTemplate: data.promptTemplate,
    systemPrompt: data.systemPrompt,
    sourceExperimentId: data.sourceExperimentId,
    sourceVariantId: data.sourceVariantId,
    promotionReason: data.promotionReason,
    avgQualityScore: data.avgQualityScore,
    sampleCount: data.sampleCount,
    pValue: data.pValue,
    effectSize: data.effectSize,
    isActive: true,
    promotedAtMs: now,
    createdAtMs: now,
    updatedAtMs: now,
  }

  // Deactivate current version if exists
  if (currentVersion) {
    await db.doc(`${getOptimizedPromptVersionsPath(userId)}/${currentVersion.versionId}`).update({
      isActive: false,
      deprecatedAtMs: now,
      deprecationReason: `Superseded by version ${newVersionNumber}`,
      updatedAtMs: now,
    })
  }

  // Save new version
  await db.doc(`${getOptimizedPromptVersionsPath(userId)}/${versionId}`).set(promptVersion)

  // Log optimization event
  await logOptimizationEvent(userId, {
    eventType: 'prompt_promoted',
    description: `Prompt version ${newVersionNumber} promoted for agent ${agentId}`,
    agentId,
    details: {
      versionId,
      version: newVersionNumber,
      previousVersionId: currentVersion?.versionId,
      promotionReason: data.promotionReason,
      avgQualityScore: data.avgQualityScore,
    },
    qualityBefore: currentVersion?.avgQualityScore,
    qualityAfter: data.avgQualityScore,
    triggeredBy: data.promotionReason === 'manual' ? 'user' : 'system',
    sourceId: data.sourceExperimentId,
  })

  return promptVersion
}

/**
 * Get the currently active prompt version for an agent
 */
export async function getActiveOptimizedPromptVersion(
  userId: string,
  agentId: AgentId
): Promise<OptimizedPromptVersion | null> {
  const db = getFirestore()

  const snapshot = await db
    .collection(getOptimizedPromptVersionsPath(userId))
    .where('agentId', '==', agentId)
    .where('isActive', '==', true)
    .limit(1)
    .get()

  if (snapshot.empty) {
    return null
  }

  return snapshot.docs[0].data() as OptimizedPromptVersion
}

/**
 * Get prompt version by ID
 */
export async function getOptimizedPromptVersion(
  userId: string,
  versionId: OptimizedPromptVersionId
): Promise<OptimizedPromptVersion | null> {
  const db = getFirestore()
  const doc = await db.doc(`${getOptimizedPromptVersionsPath(userId)}/${versionId}`).get()

  if (!doc.exists) {
    return null
  }

  return doc.data() as OptimizedPromptVersion
}

/**
 * List all prompt versions for an agent
 */
export async function listOptimizedPromptVersions(
  userId: string,
  agentId: AgentId,
  limit = 20
): Promise<OptimizedPromptVersion[]> {
  const db = getFirestore()

  const snapshot = await db
    .collection(getOptimizedPromptVersionsPath(userId))
    .where('agentId', '==', agentId)
    .orderBy('version', 'desc')
    .limit(limit)
    .get()

  return snapshot.docs.map((doc) => doc.data() as OptimizedPromptVersion)
}

/**
 * Rollback to a previous prompt version
 */
export async function rollbackOptimizedPromptVersion(
  userId: string,
  agentId: AgentId,
  targetVersionId: OptimizedPromptVersionId
): Promise<OptimizedPromptVersion> {
  const targetVersion = await getOptimizedPromptVersion(userId, targetVersionId)

  if (!targetVersion) {
    throw new Error(`Prompt version ${targetVersionId} not found`)
  }

  if (targetVersion.agentId !== agentId) {
    throw new Error(`Prompt version ${targetVersionId} does not belong to agent ${agentId}`)
  }

  // Create a new version based on the target
  return createOptimizedPromptVersion(userId, agentId, {
    promptTemplate: targetVersion.promptTemplate,
    systemPrompt: targetVersion.systemPrompt,
    promotionReason: 'rollback',
    avgQualityScore: targetVersion.avgQualityScore,
    sampleCount: targetVersion.sampleCount,
  })
}

// ----- A/B Test Analysis -----

/**
 * Analyze an experiment to determine if there's a winner
 */
export async function analyzeExperimentForPromotion(
  userId: string,
  experimentId: ExperimentId
): Promise<PromptPromotionAnalysis> {
  const db = getFirestore()

  // Get experiment
  const experimentDoc = await db.doc(`${getExperimentsPath(userId)}/${experimentId}`).get()

  if (!experimentDoc.exists) {
    throw new Error(`Experiment ${experimentId} not found`)
  }

  const experiment = experimentDoc.data() as {
    experimentId: ExperimentId
    variantIds: PromptVariantId[]
    controlVariantId: PromptVariantId
    minSamplesPerVariant: number
    significanceLevel: number
    status: string
  }

  // Get all variants
  const variantDocs = await Promise.all(
    experiment.variantIds.map((id) => db.doc(`${getVariantsPath(userId)}/${id}`).get())
  )

  const variants = variantDocs
    .filter((doc) => doc.exists)
    .map(
      (doc) =>
        doc.data() as {
          variantId: PromptVariantId
          isControl: boolean
          sampleCount: number
          avgScore: number
          scoreVariance: number
          status: string
        }
    )

  // Find control and best treatment
  const control = variants.find((v) => v.isControl)
  if (!control) {
    throw new Error('No control variant found')
  }

  const treatments = variants.filter((v) => !v.isControl && v.status === 'active')
  const bestTreatment = treatments.reduce(
    (best, current) => (current.avgScore > (best?.avgScore ?? 0) ? current : best),
    null as (typeof treatments)[0] | null
  )

  // Check if we have enough samples
  const hasEnoughSamples =
    control.sampleCount >= experiment.minSamplesPerVariant &&
    (bestTreatment?.sampleCount ?? 0) >= experiment.minSamplesPerVariant

  // Calculate statistical significance
  let pValue = 1
  let effectSize = 0
  let isSignificant = false

  if (hasEnoughSamples && bestTreatment) {
    const stats = computeStatistics(
      control.avgScore,
      control.scoreVariance,
      control.sampleCount,
      bestTreatment.avgScore,
      bestTreatment.scoreVariance,
      bestTreatment.sampleCount
    )

    pValue = stats.pValue
    effectSize = stats.effectSize
    isSignificant = pValue < experiment.significanceLevel
  }

  // Determine recommendation
  let recommendation: 'promote' | 'continue_testing' | 'no_action' | 'stop_experiment'
  let recommendationReason: string

  if (!hasEnoughSamples) {
    recommendation = 'continue_testing'
    recommendationReason = `Need more samples. Control: ${control.sampleCount}/${experiment.minSamplesPerVariant}, Treatment: ${bestTreatment?.sampleCount ?? 0}/${experiment.minSamplesPerVariant}`
  } else if (!bestTreatment) {
    recommendation = 'no_action'
    recommendationReason = 'No treatment variants available'
  } else if (isSignificant && bestTreatment.avgScore > control.avgScore) {
    recommendation = 'promote'
    recommendationReason = `Treatment outperforms control with p=${pValue.toFixed(4)}, effect size=${effectSize.toFixed(3)}`
  } else if (isSignificant && bestTreatment.avgScore <= control.avgScore) {
    recommendation = 'stop_experiment'
    recommendationReason = 'Control performs better or equal to treatments'
  } else {
    recommendation = 'continue_testing'
    recommendationReason = `Not yet statistically significant (p=${pValue.toFixed(4)})`
  }

  const absoluteImprovement = bestTreatment ? bestTreatment.avgScore - control.avgScore : 0
  const relativeImprovement =
    control.avgScore > 0 && bestTreatment ? (absoluteImprovement / control.avgScore) * 100 : 0

  return {
    experimentId,
    userId,
    hasWinner: recommendation === 'promote',
    winnerVariantId: recommendation === 'promote' ? bestTreatment?.variantId : undefined,
    controlVariantId: control.variantId,
    isSignificant,
    pValue,
    effectSize,
    confidenceLevel: 1 - pValue,
    controlAvgScore: control.avgScore,
    winnerAvgScore: bestTreatment?.avgScore ?? 0,
    absoluteImprovement,
    relativeImprovement,
    controlSamples: control.sampleCount,
    winnerSamples: bestTreatment?.sampleCount ?? 0,
    totalSamples: variants.reduce((sum, v) => sum + v.sampleCount, 0),
    recommendation,
    recommendationReason,
    analyzedAtMs: Date.now(),
  }
}

/**
 * Auto-promote a winning variant from an experiment
 */
export async function autoPromoteWinner(
  userId: string,
  experimentId: ExperimentId
): Promise<{ promoted: boolean; version?: OptimizedPromptVersion; reason: string }> {
  const db = getFirestore()

  // Analyze the experiment
  const analysis = await analyzeExperimentForPromotion(userId, experimentId)

  if (analysis.recommendation !== 'promote' || !analysis.winnerVariantId) {
    return {
      promoted: false,
      reason: analysis.recommendationReason,
    }
  }

  // Get the winning variant
  const variantDoc = await db.doc(`${getVariantsPath(userId)}/${analysis.winnerVariantId}`).get()

  if (!variantDoc.exists) {
    return {
      promoted: false,
      reason: `Winner variant ${analysis.winnerVariantId} not found`,
    }
  }

  const variant = variantDoc.data() as {
    variantId: PromptVariantId
    agentId: AgentId
    promptTemplate: string
    systemPrompt?: string
    sampleCount: number
  }

  // Create new prompt version
  const newVersion = await createOptimizedPromptVersion(userId, variant.agentId, {
    promptTemplate: variant.promptTemplate,
    systemPrompt: variant.systemPrompt,
    sourceExperimentId: experimentId,
    sourceVariantId: analysis.winnerVariantId,
    promotionReason: 'ab_test_winner',
    avgQualityScore: analysis.winnerAvgScore,
    sampleCount: variant.sampleCount,
    pValue: analysis.pValue,
    effectSize: analysis.effectSize,
  })

  // Update experiment status
  await db.doc(`${getExperimentsPath(userId)}/${experimentId}`).update({
    status: 'completed',
    completedAtMs: Date.now(),
    winnerVariantId: analysis.winnerVariantId,
    isSignificant: true,
    pValue: analysis.pValue,
    effectSize: analysis.effectSize,
    updatedAtMs: Date.now(),
  })

  // Update variant statuses
  const variantUpdates = await db
    .collection(getVariantsPath(userId))
    .where('experimentId', '==', experimentId)
    .get()

  const batch = db.batch()
  for (const doc of variantUpdates.docs) {
    const variantData = doc.data()
    batch.update(doc.ref, {
      status: variantData.variantId === analysis.winnerVariantId ? 'winner' : 'loser',
      promotedAtMs: variantData.variantId === analysis.winnerVariantId ? Date.now() : undefined,
      updatedAtMs: Date.now(),
    })
  }
  await batch.commit()

  return {
    promoted: true,
    version: newVersion,
    reason: `Promoted variant ${analysis.winnerVariantId} with ${analysis.relativeImprovement.toFixed(1)}% improvement`,
  }
}

/**
 * Check all running experiments for potential promotions
 */
export async function checkExperimentsForPromotion(userId: string): Promise<
  Array<{
    experimentId: ExperimentId
    analysis: PromptPromotionAnalysis
    autoPromoted: boolean
    promotionResult?: { promoted: boolean; version?: OptimizedPromptVersion; reason: string }
  }>
> {
  const db = getFirestore()

  // Get all running experiments
  const snapshot = await db
    .collection(getExperimentsPath(userId))
    .where('status', '==', 'running')
    .get()

  const results: Array<{
    experimentId: ExperimentId
    analysis: PromptPromotionAnalysis
    autoPromoted: boolean
    promotionResult?: { promoted: boolean; version?: OptimizedPromptVersion; reason: string }
  }> = []

  for (const doc of snapshot.docs) {
    const experiment = doc.data() as { experimentId: ExperimentId }

    try {
      const analysis = await analyzeExperimentForPromotion(userId, experiment.experimentId)

      const result: (typeof results)[0] = {
        experimentId: experiment.experimentId,
        analysis,
        autoPromoted: false,
      }

      // Auto-promote if we have a winner
      if (analysis.recommendation === 'promote') {
        result.promotionResult = await autoPromoteWinner(userId, experiment.experimentId)
        result.autoPromoted = result.promotionResult.promoted
      }

      results.push(result)
    } catch (error) {
      log.error(`Error analyzing experiment ${experiment.experimentId}`, error)
    }
  }

  return results
}

// ----- Optimization Events -----

/**
 * Log an optimization event
 */
async function logOptimizationEvent(
  userId: string,
  data: Omit<OptimizationEvent, 'eventId' | 'userId' | 'createdAtMs'>
): Promise<OptimizationEvent> {
  const db = getFirestore()
  const eventId = randomUUID() as OptimizationEventId

  const event: OptimizationEvent = {
    eventId,
    userId,
    ...data,
    createdAtMs: Date.now(),
  }

  await db.doc(`${getOptimizationEventsPath(userId)}/${eventId}`).set(event)

  return event
}

/**
 * List optimization events
 */
export async function listOptimizationEvents(
  userId: string,
  options?: {
    eventType?: string
    agentId?: AgentId
    limit?: number
    afterMs?: number
    beforeMs?: number
  }
): Promise<OptimizationEvent[]> {
  const db = getFirestore()

  let query = db.collection(getOptimizationEventsPath(userId)).orderBy('createdAtMs', 'desc')

  if (options?.eventType) {
    query = query.where('eventType', '==', options.eventType)
  }

  if (options?.agentId) {
    query = query.where('agentId', '==', options.agentId)
  }

  if (options?.afterMs) {
    query = query.where('createdAtMs', '>', options.afterMs)
  }

  if (options?.beforeMs) {
    query = query.where('createdAtMs', '<', options.beforeMs)
  }

  const snapshot = await query.limit(options?.limit ?? 50).get()

  return snapshot.docs.map((doc) => doc.data() as OptimizationEvent)
}

// ----- Statistical Utilities -----

function computeStatistics(
  mean1: number,
  var1: number,
  n1: number,
  mean2: number,
  var2: number,
  n2: number
): { pValue: number; effectSize: number } {
  // Compute p-value using Welch's t-test
  if (n1 < 2 || n2 < 2) {
    return { pValue: 1, effectSize: 0 }
  }

  const se = Math.sqrt(var1 / n1 + var2 / n2)
  if (se === 0) {
    return { pValue: 1, effectSize: 0 }
  }

  const t = Math.abs(mean1 - mean2) / se

  // Welch-Satterthwaite degrees of freedom
  const num = Math.pow(var1 / n1 + var2 / n2, 2)
  const denom = Math.pow(var1 / n1, 2) / (n1 - 1) + Math.pow(var2 / n2, 2) / (n2 - 1)
  const df = num / denom

  // Approximate p-value using t-distribution CDF
  if (df <= 2) {
    return { pValue: 1, effectSize: 0 }
  }

  const z = t * Math.sqrt(df / (df - 2))
  const pValue = 2 * (1 - normalCDF(z))

  // Cohen's d effect size
  const pooledStd = Math.sqrt(((n1 - 1) * var1 + (n2 - 1) * var2) / (n1 + n2 - 2))
  const effectSize = pooledStd > 0 ? Math.abs(mean1 - mean2) / pooledStd : 0

  return { pValue, effectSize }
}

function normalCDF(x: number): number {
  const a1 = 0.254829592
  const a2 = -0.284496736
  const a3 = 1.421413741
  const a4 = -1.453152027
  const a5 = 1.061405429
  const p = 0.3275911

  const sign = x < 0 ? -1 : 1
  x = Math.abs(x) / Math.sqrt(2)

  const t = 1 / (1 + p * x)
  const y = 1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x)

  return 0.5 * (1 + sign * y)
}
