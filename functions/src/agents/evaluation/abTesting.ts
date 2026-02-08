/**
 * A/B Testing Infrastructure
 *
 * Provides prompt variant testing with:
 * - Thompson sampling for variant selection
 * - Statistical significance testing
 * - Experiment lifecycle management
 * - Automatic winner promotion
 */

import { getFirestore } from 'firebase-admin/firestore'
import type { Experiment, ExperimentId, PromptVariant, PromptVariantId } from '@lifeos/agents'
import type { AgentId } from '@lifeos/agents'
import { randomUUID } from 'crypto'

// ----- Collection Paths -----

const AB_TESTING_COLLECTION = 'abTesting'
const EXPERIMENTS_SUBCOLLECTION = 'experiments'
const VARIANTS_SUBCOLLECTION = 'variants'

function getExperimentsPath(userId: string): string {
  return `users/${userId}/${AB_TESTING_COLLECTION}/${EXPERIMENTS_SUBCOLLECTION}`
}

function getVariantsPath(userId: string): string {
  return `users/${userId}/${AB_TESTING_COLLECTION}/${VARIANTS_SUBCOLLECTION}`
}

// ----- Statistical Utilities -----

/**
 * Sample from a Beta distribution using the inverse transform method
 * Approximation using the mean and variance
 */
function sampleBeta(alpha: number, beta: number): number {
  // Use gamma distribution sampling for Beta
  // Beta(a,b) = Gamma(a,1) / (Gamma(a,1) + Gamma(b,1))
  const gammaA = sampleGamma(alpha)
  const gammaB = sampleGamma(beta)
  return gammaA / (gammaA + gammaB)
}

/**
 * Sample from a Gamma distribution using Marsaglia and Tsang's method
 */
function sampleGamma(shape: number): number {
  if (shape < 1) {
    // For shape < 1, use the transformation
    return sampleGamma(shape + 1) * Math.pow(Math.random(), 1 / shape)
  }

  const d = shape - 1 / 3
  const c = 1 / Math.sqrt(9 * d)

  while (true) {
    let x: number
    let v: number

    do {
      x = normalRandom()
      v = 1 + c * x
    } while (v <= 0)

    v = v * v * v
    const u = Math.random()

    if (u < 1 - 0.0331 * (x * x) * (x * x)) {
      return d * v
    }

    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) {
      return d * v
    }
  }
}

/**
 * Sample from standard normal distribution using Box-Muller transform
 */
function normalRandom(): number {
  const u1 = Math.random()
  const u2 = Math.random()
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
}

/**
 * Compute p-value for A/B test using Welch's t-test
 */
function computePValue(
  mean1: number,
  var1: number,
  n1: number,
  mean2: number,
  var2: number,
  n2: number
): number {
  if (n1 < 2 || n2 < 2) return 1 // Not enough samples

  const se = Math.sqrt(var1 / n1 + var2 / n2)
  if (se === 0) return 1

  const t = Math.abs(mean1 - mean2) / se

  // Welch-Satterthwaite degrees of freedom
  const num = Math.pow(var1 / n1 + var2 / n2, 2)
  const denom = Math.pow(var1 / n1, 2) / (n1 - 1) + Math.pow(var2 / n2, 2) / (n2 - 1)
  const df = num / denom

  // Approximate p-value using t-distribution CDF
  // Using the approximation: 2 * (1 - normalCDF(t * sqrt(df / (df - 2))))
  if (df <= 2) return 1

  const z = t * Math.sqrt(df / (df - 2))
  const pValue = 2 * (1 - normalCDF(z))

  return pValue
}

/**
 * Standard normal CDF approximation
 */
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

/**
 * Compute Cohen's d effect size
 */
function computeEffectSize(
  mean1: number,
  var1: number,
  n1: number,
  mean2: number,
  var2: number,
  n2: number
): number {
  // Pooled standard deviation
  const pooledVar = ((n1 - 1) * var1 + (n2 - 1) * var2) / (n1 + n2 - 2)
  const pooledStd = Math.sqrt(pooledVar)

  if (pooledStd === 0) return 0

  return (mean1 - mean2) / pooledStd
}

// ----- Experiment Management -----

/**
 * Create a new experiment
 */
export async function createExperiment(
  userId: string,
  input: {
    name: string
    description?: string
    hypothesis?: string
    workflowType: string
    agentId?: AgentId
    minSamplesPerVariant?: number
    significanceLevel?: number
    maxDurationDays?: number
  }
): Promise<Experiment> {
  const db = getFirestore()
  const experimentId = randomUUID() as ExperimentId
  const now = Date.now()

  const experiment: Experiment = {
    experimentId,
    userId,
    name: input.name,
    description: input.description,
    hypothesis: input.hypothesis,
    workflowType: input.workflowType,
    agentId: input.agentId,
    minSamplesPerVariant: input.minSamplesPerVariant || 30,
    significanceLevel: input.significanceLevel || 0.05,
    maxDurationDays: input.maxDurationDays,
    variantIds: [],
    controlVariantId: '' as PromptVariantId, // Will be set when control variant is created
    status: 'draft',
    createdAtMs: now,
    updatedAtMs: now,
  }

  await db.doc(`${getExperimentsPath(userId)}/${experimentId}`).set(experiment)

  return experiment
}

/**
 * Get an experiment by ID
 */
export async function getExperiment(
  userId: string,
  experimentId: ExperimentId
): Promise<Experiment | null> {
  const db = getFirestore()
  const doc = await db.doc(`${getExperimentsPath(userId)}/${experimentId}`).get()

  if (!doc.exists) return null
  return doc.data() as Experiment
}

/**
 * List experiments with optional filters
 */
export async function listExperiments(
  userId: string,
  filters?: {
    status?: Experiment['status']
    workflowType?: string
  }
): Promise<Experiment[]> {
  const db = getFirestore()
  let query: FirebaseFirestore.Query = db.collection(getExperimentsPath(userId))

  if (filters?.status) {
    query = query.where('status', '==', filters.status)
  }

  if (filters?.workflowType) {
    query = query.where('workflowType', '==', filters.workflowType)
  }

  query = query.orderBy('createdAtMs', 'desc')

  const snapshot = await query.get()
  return snapshot.docs.map((doc) => doc.data() as Experiment)
}

/**
 * Start an experiment
 */
export async function startExperiment(
  userId: string,
  experimentId: ExperimentId
): Promise<Experiment> {
  const db = getFirestore()
  const experiment = await getExperiment(userId, experimentId)

  if (!experiment) {
    throw new Error(`Experiment ${experimentId} not found`)
  }

  if (experiment.status !== 'draft') {
    throw new Error(`Experiment ${experimentId} is not in draft status`)
  }

  if (experiment.variantIds.length < 2) {
    throw new Error('Experiment must have at least 2 variants')
  }

  const updates = {
    status: 'running' as const,
    startedAtMs: Date.now(),
    updatedAtMs: Date.now(),
  }

  await db.doc(`${getExperimentsPath(userId)}/${experimentId}`).update(updates)

  return { ...experiment, ...updates }
}

/**
 * Complete an experiment
 */
export async function completeExperiment(
  userId: string,
  experimentId: ExperimentId,
  winnerVariantId?: PromptVariantId,
  isSignificant?: boolean,
  pValue?: number,
  effectSize?: number
): Promise<Experiment> {
  const db = getFirestore()
  const experiment = await getExperiment(userId, experimentId)

  if (!experiment) {
    throw new Error(`Experiment ${experimentId} not found`)
  }

  const updates = {
    status: 'completed' as const,
    completedAtMs: Date.now(),
    updatedAtMs: Date.now(),
    winnerVariantId,
    isSignificant,
    pValue,
    effectSize,
  }

  await db.doc(`${getExperimentsPath(userId)}/${experimentId}`).update(updates)

  return { ...experiment, ...updates }
}

// ----- Variant Management -----

/**
 * Create a prompt variant
 */
export async function createVariant(
  userId: string,
  input: {
    experimentId: ExperimentId
    agentId: AgentId
    name: string
    description?: string
    promptTemplate: string
    systemPrompt?: string
    isControl: boolean
  }
): Promise<PromptVariant> {
  const db = getFirestore()
  const variantId = randomUUID() as PromptVariantId
  const now = Date.now()

  const variant: PromptVariant = {
    variantId,
    experimentId: input.experimentId,
    userId,
    agentId: input.agentId,
    workflowType: undefined, // Will be populated from experiment
    name: input.name,
    description: input.description,
    promptTemplate: input.promptTemplate,
    systemPrompt: input.systemPrompt,
    isControl: input.isControl,
    sampleCount: 0,
    successCount: 0,
    failedCount: 0,
    totalScore: 0,
    avgScore: 0,
    scoreVariance: 0,
    scores: [],
    alpha: 1, // Beta distribution prior
    beta: 1,
    status: 'active',
    createdAtMs: now,
    updatedAtMs: now,
  }

  await db.doc(`${getVariantsPath(userId)}/${variantId}`).set(variant)

  // Update experiment with variant ID
  const experiment = await getExperiment(userId, input.experimentId)
  if (experiment) {
    const updates: Record<string, unknown> = {
      variantIds: [...experiment.variantIds, variantId],
      updatedAtMs: now,
    }

    if (input.isControl) {
      updates.controlVariantId = variantId
    }

    await db.doc(`${getExperimentsPath(userId)}/${input.experimentId}`).update(updates)
  }

  return variant
}

/**
 * Get a variant by ID
 */
export async function getVariant(
  userId: string,
  variantId: PromptVariantId
): Promise<PromptVariant | null> {
  const db = getFirestore()
  const doc = await db.doc(`${getVariantsPath(userId)}/${variantId}`).get()

  if (!doc.exists) return null
  return doc.data() as PromptVariant
}

/**
 * List variants for an experiment
 */
export async function listVariants(
  userId: string,
  experimentId: ExperimentId
): Promise<PromptVariant[]> {
  const db = getFirestore()
  const snapshot = await db
    .collection(getVariantsPath(userId))
    .where('experimentId', '==', experimentId)
    .get()

  return snapshot.docs.map((doc) => doc.data() as PromptVariant)
}

/**
 * Select a variant using Thompson sampling
 */
export async function selectVariantThompson(
  userId: string,
  experimentId: ExperimentId
): Promise<PromptVariant> {
  const variants = await listVariants(userId, experimentId)

  if (variants.length === 0) {
    throw new Error(`No variants found for experiment ${experimentId}`)
  }

  // Filter to only active variants
  const activeVariants = variants.filter((v) => v.status === 'active')

  if (activeVariants.length === 0) {
    throw new Error(`No active variants for experiment ${experimentId}`)
  }

  // Sample from each variant's Beta distribution and pick the highest
  let bestVariant = activeVariants[0]
  let bestSample = -Infinity

  for (const variant of activeVariants) {
    const sample = sampleBeta(variant.alpha, variant.beta)
    if (sample > bestSample) {
      bestSample = sample
      bestVariant = variant
    }
  }

  return bestVariant
}

/**
 * Record a sample for a variant
 */
export async function recordVariantSample(
  userId: string,
  variantId: PromptVariantId,
  score: number, // 0-1 normalized score
  success: boolean
): Promise<PromptVariant> {
  const db = getFirestore()
  const variant = await getVariant(userId, variantId)

  if (!variant) {
    throw new Error(`Variant ${variantId} not found`)
  }

  // Update statistics
  const newSampleCount = variant.sampleCount + 1
  const newSuccessCount = success ? variant.successCount + 1 : variant.successCount
  const newFailedCount = success ? variant.failedCount : variant.failedCount + 1
  const newTotalScore = variant.totalScore + score
  const newAvgScore = newTotalScore / newSampleCount

  // Keep last 100 scores for variance calculation
  const newScores = [...variant.scores, score].slice(-100)

  // Compute variance
  const mean = newScores.reduce((a, b) => a + b, 0) / newScores.length
  const squaredDiffs = newScores.map((s) => Math.pow(s - mean, 2))
  const newVariance =
    newScores.length > 1 ? squaredDiffs.reduce((a, b) => a + b, 0) / (newScores.length - 1) : 0

  // Update Beta distribution parameters
  // Using score as success probability (threshold at 0.5)
  const newAlpha = variant.alpha + (score >= 0.5 ? 1 : 0)
  const newBeta = variant.beta + (score < 0.5 ? 1 : 0)

  const updates = {
    sampleCount: newSampleCount,
    successCount: newSuccessCount,
    failedCount: newFailedCount,
    totalScore: newTotalScore,
    avgScore: newAvgScore,
    scoreVariance: newVariance,
    scores: newScores,
    alpha: newAlpha,
    beta: newBeta,
    updatedAtMs: Date.now(),
  }

  await db.doc(`${getVariantsPath(userId)}/${variantId}`).update(updates)

  return { ...variant, ...updates }
}

/**
 * Check if an experiment has reached statistical significance
 */
export async function checkSignificance(
  userId: string,
  experimentId: ExperimentId
): Promise<{
  isSignificant: boolean
  pValue: number
  effectSize: number
  winner?: PromptVariantId
  recommendation: string
}> {
  const experiment = await getExperiment(userId, experimentId)
  if (!experiment) {
    throw new Error(`Experiment ${experimentId} not found`)
  }

  const variants = await listVariants(userId, experimentId)
  const controlVariant = variants.find((v) => v.isControl)
  const treatmentVariants = variants.filter((v) => !v.isControl && v.status === 'active')

  if (!controlVariant || treatmentVariants.length === 0) {
    return {
      isSignificant: false,
      pValue: 1,
      effectSize: 0,
      recommendation: 'Not enough variants to compare',
    }
  }

  // Check if we have enough samples
  const minSamples = experiment.minSamplesPerVariant
  if (controlVariant.sampleCount < minSamples) {
    return {
      isSignificant: false,
      pValue: 1,
      effectSize: 0,
      recommendation: `Need ${minSamples - controlVariant.sampleCount} more control samples`,
    }
  }

  // Compare each treatment to control
  let bestTreatment: PromptVariant | null = null
  let bestPValue = 1
  let bestEffectSize = 0

  for (const treatment of treatmentVariants) {
    if (treatment.sampleCount < minSamples) continue

    const pValue = computePValue(
      treatment.avgScore,
      treatment.scoreVariance,
      treatment.sampleCount,
      controlVariant.avgScore,
      controlVariant.scoreVariance,
      controlVariant.sampleCount
    )

    const effectSize = computeEffectSize(
      treatment.avgScore,
      treatment.scoreVariance,
      treatment.sampleCount,
      controlVariant.avgScore,
      controlVariant.scoreVariance,
      controlVariant.sampleCount
    )

    if (pValue < bestPValue && treatment.avgScore > controlVariant.avgScore) {
      bestPValue = pValue
      bestEffectSize = effectSize
      bestTreatment = treatment
    }
  }

  const isSignificant = bestPValue < experiment.significanceLevel

  let recommendation: string
  if (!bestTreatment) {
    recommendation = 'No treatment outperforms control'
  } else if (isSignificant) {
    recommendation = `Promote ${bestTreatment.name} (p=${bestPValue.toFixed(4)}, d=${bestEffectSize.toFixed(2)})`
  } else {
    recommendation = `Continue testing (p=${bestPValue.toFixed(4)} > ${experiment.significanceLevel})`
  }

  return {
    isSignificant,
    pValue: bestPValue,
    effectSize: bestEffectSize,
    winner: isSignificant && bestTreatment ? bestTreatment.variantId : undefined,
    recommendation,
  }
}

/**
 * Promote a winning variant
 */
export async function promoteVariant(
  userId: string,
  variantId: PromptVariantId
): Promise<PromptVariant> {
  const db = getFirestore()
  const variant = await getVariant(userId, variantId)

  if (!variant) {
    throw new Error(`Variant ${variantId} not found`)
  }

  const now = Date.now()

  // Mark this variant as winner
  await db.doc(`${getVariantsPath(userId)}/${variantId}`).update({
    status: 'winner',
    promotedAtMs: now,
    updatedAtMs: now,
  })

  // Mark other variants as losers
  const otherVariants = await listVariants(userId, variant.experimentId)
  for (const other of otherVariants) {
    if (other.variantId !== variantId && other.status === 'active') {
      await db.doc(`${getVariantsPath(userId)}/${other.variantId}`).update({
        status: 'loser',
        updatedAtMs: now,
      })
    }
  }

  return { ...variant, status: 'winner', promotedAtMs: now, updatedAtMs: now }
}

/**
 * Get the currently active variant for an agent (either from experiment or promoted)
 */
export async function getActiveVariantForAgent(
  userId: string,
  agentId: AgentId,
  workflowType?: string
): Promise<PromptVariant | null> {
  const db = getFirestore()

  // First check for any running experiments
  const experiments = await listExperiments(userId, {
    status: 'running',
    workflowType,
  })

  for (const experiment of experiments) {
    if (!experiment.agentId || experiment.agentId === agentId) {
      // This experiment applies to this agent - use Thompson sampling
      return selectVariantThompson(userId, experiment.experimentId)
    }
  }

  // No running experiment - check for promoted winners
  const snapshot = await db
    .collection(getVariantsPath(userId))
    .where('agentId', '==', agentId)
    .where('status', '==', 'winner')
    .orderBy('promotedAtMs', 'desc')
    .limit(1)
    .get()

  if (!snapshot.empty) {
    return snapshot.docs[0].data() as PromptVariant
  }

  return null
}
