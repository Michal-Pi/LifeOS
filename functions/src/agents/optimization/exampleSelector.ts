/**
 * Example Selector
 *
 * Implements different strategies for selecting few-shot examples:
 * - Random: Random sampling from active examples
 * - Top-scored: Select highest quality examples
 * - Recent: Most recently added examples
 * - Similarity: Semantic similarity to input (requires embeddings)
 *
 * Also handles:
 * - Auto-promotion of high-scoring outputs to examples
 * - Auto-pruning of degraded examples
 * - Example usage tracking
 */

import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { randomUUID } from 'crypto'
import type {
  FewShotExample,
  FewShotExampleId,
  ExampleLibrary,
  ExampleLibraryId,
  SelectedExamples,
  PromotionCriteria,
  PendingPromotion,
  ExampleLibraryStats,
} from '@lifeos/agents'
import type {
  ExampleSelectionConfig,
  ExampleSelectionResult,
  ExampleSelectionStats,
} from '@lifeos/agents'
import type { RunId, AgentId } from '@lifeos/agents'

// ----- Collection Paths -----

function getLibrariesPath(userId: string): string {
  return `users/${userId}/exampleLibraries`
}

function getExamplesPath(userId: string, libraryId: ExampleLibraryId): string {
  return `users/${userId}/exampleLibraries/${libraryId}/examples`
}

function getPendingPromotionsPath(userId: string): string {
  return `users/${userId}/exampleLibraries/pendingPromotions`
}

function getSelectionStatsPath(userId: string): string {
  return `users/${userId}/optimization/exampleSelectionStats`
}

// ----- Example Selection -----

/**
 * Select examples based on the configured strategy
 */
export async function selectExamples(
  userId: string,
  config: ExampleSelectionConfig,
  _input: string
): Promise<SelectedExamples> {
  // Note: _input is reserved for future similarity-based selection with embeddings

  // Gather examples from all configured libraries
  const allExamples: FewShotExample[] = []

  for (const libraryId of config.libraryIds) {
    const examples = await getActiveExamples(userId, libraryId, config.minQualityScore)
    allExamples.push(...examples)
  }

  if (allExamples.length === 0) {
    return {
      examples: [],
      libraryIds: config.libraryIds,
      selectionStrategy: config.strategy,
      totalAvailable: 0,
      selectedCount: 0,
    }
  }

  // Apply selection strategy
  let selectedExamples: FewShotExample[]

  switch (config.strategy) {
    case 'top_scored':
      selectedExamples = selectByTopScored(allExamples, config.maxExamples)
      break

    case 'recent':
      selectedExamples = selectByRecent(allExamples, config.maxExamples)
      break

    case 'similarity':
      // For similarity, we'd need embeddings - fallback to top_scored for now
      // TODO: Implement embedding-based similarity selection
      selectedExamples = selectByTopScored(allExamples, config.maxExamples)
      break

    case 'random':
    default:
      selectedExamples = selectRandom(allExamples, config.maxExamples)
      break
  }

  // Apply diversity weighting if configured
  if (config.diversityWeight && config.diversityWeight > 0) {
    selectedExamples = applyDiversityFilter(selectedExamples, config.diversityWeight)
  }

  return {
    examples: selectedExamples,
    libraryIds: config.libraryIds,
    selectionStrategy: config.strategy,
    totalAvailable: allExamples.length,
    selectedCount: selectedExamples.length,
  }
}

/**
 * Get all active examples from a library
 */
async function getActiveExamples(
  userId: string,
  libraryId: ExampleLibraryId,
  minQualityScore?: number
): Promise<FewShotExample[]> {
  const db = getFirestore()

  let query = db.collection(getExamplesPath(userId, libraryId)).where('isActive', '==', true)

  if (minQualityScore !== undefined) {
    query = query.where('qualityScore', '>=', minQualityScore)
  }

  const snapshot = await query.get()

  return snapshot.docs.map((doc) => doc.data() as FewShotExample)
}

/**
 * Select examples randomly
 */
function selectRandom(examples: FewShotExample[], count: number): FewShotExample[] {
  const shuffled = [...examples].sort(() => Math.random() - 0.5)
  return shuffled.slice(0, count)
}

/**
 * Select highest quality examples
 */
function selectByTopScored(examples: FewShotExample[], count: number): FewShotExample[] {
  return [...examples].sort((a, b) => b.qualityScore - a.qualityScore).slice(0, count)
}

/**
 * Select most recent examples
 */
function selectByRecent(examples: FewShotExample[], count: number): FewShotExample[] {
  return [...examples].sort((a, b) => b.createdAtMs - a.createdAtMs).slice(0, count)
}

/**
 * Apply diversity filter to selected examples
 * Simple implementation: ensure variety in metadata tags
 */
function applyDiversityFilter(
  examples: FewShotExample[],
  diversityWeight: number
): FewShotExample[] {
  if (examples.length <= 1) return examples

  // Group by tags and ensure variety
  const tagCounts = new Map<string, number>()
  const diverseExamples: FewShotExample[] = []

  // Sort by quality first
  const sorted = [...examples].sort((a, b) => b.qualityScore - a.qualityScore)

  for (const example of sorted) {
    const tags = example.tags || []

    // Calculate penalty based on tag overlap
    let penalty = 0
    for (const tag of tags) {
      penalty += (tagCounts.get(tag) || 0) * diversityWeight
    }

    // Add example if penalty is below threshold
    if (penalty < 1 || diverseExamples.length < 3) {
      diverseExamples.push(example)

      // Update tag counts
      for (const tag of tags) {
        tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1)
      }
    }
  }

  return diverseExamples
}

/**
 * Track example usage for optimization
 */
export async function trackExampleUsage(
  userId: string,
  runId: RunId,
  selectedExamples: SelectedExamples,
  _outputQuality: number
): Promise<ExampleSelectionResult> {
  // Note: _outputQuality is reserved for future quality-based example weighting
  const db = getFirestore()
  const batch = db.batch()

  // Update usage counts for each selected example
  for (const example of selectedExamples.examples) {
    const exampleRef = db.doc(getExamplesPath(userId, example.libraryId) + `/${example.exampleId}`)
    batch.update(exampleRef, {
      usageCount: FieldValue.increment(1),
      lastUsedAtMs: Date.now(),
      updatedAtMs: Date.now(),
    })
  }

  await batch.commit()

  const qualityScores = selectedExamples.examples.map((e) => e.qualityScore)
  const avgQualityScore =
    qualityScores.length > 0 ? qualityScores.reduce((a, b) => a + b, 0) / qualityScores.length : 0

  return {
    userId,
    runId,
    selectedExampleIds: selectedExamples.examples.map((e) => e.exampleId),
    selectedCount: selectedExamples.selectedCount,
    totalAvailable: selectedExamples.totalAvailable,
    strategy: selectedExamples.selectionStrategy,
    avgQualityScore,
    qualityRange: {
      min: qualityScores.length > 0 ? Math.min(...qualityScores) : 0,
      max: qualityScores.length > 0 ? Math.max(...qualityScores) : 0,
    },
    selectedAtMs: Date.now(),
  }
}

// ----- Auto-Promotion -----

/**
 * Check if an output should be promoted to an example
 */
export async function shouldPromoteToExample(
  userId: string,
  libraryId: ExampleLibraryId,
  qualityScore: number,
  evalScores?: Record<string, number>
): Promise<{ shouldPromote: boolean; reason: string }> {
  const db = getFirestore()

  // Get library's promotion criteria
  const libraryDoc = await db.doc(`${getLibrariesPath(userId)}/${libraryId}`).get()

  if (!libraryDoc.exists) {
    return { shouldPromote: false, reason: 'Library not found' }
  }

  const library = libraryDoc.data() as ExampleLibrary & { promotionCriteria?: PromotionCriteria }
  const criteria = library.promotionCriteria || getDefaultPromotionCriteria()

  // Check minimum quality score
  if (qualityScore < criteria.minQualityScore) {
    return {
      shouldPromote: false,
      reason: `Quality score ${qualityScore.toFixed(2)} below threshold ${criteria.minQualityScore}`,
    }
  }

  // Check per-criterion scores if specified
  if (criteria.minCriterionScores && evalScores) {
    for (const [criterion, minScore] of Object.entries(criteria.minCriterionScores)) {
      const score = evalScores[criterion]
      if (score !== undefined && score < minScore) {
        return {
          shouldPromote: false,
          reason: `Criterion ${criterion} score ${score.toFixed(2)} below threshold ${minScore}`,
        }
      }
    }
  }

  // Check daily rate limit
  if (criteria.maxDailyPromotions) {
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)

    const todayPromotions = await db
      .collection(getExamplesPath(userId, libraryId))
      .where('source', '==', 'auto_promoted')
      .where('createdAtMs', '>=', todayStart.getTime())
      .get()

    if (todayPromotions.size >= criteria.maxDailyPromotions) {
      return {
        shouldPromote: false,
        reason: `Daily promotion limit (${criteria.maxDailyPromotions}) reached`,
      }
    }
  }

  return { shouldPromote: true, reason: 'Meets all promotion criteria' }
}

/**
 * Promote an output to an example
 */
export async function promoteToExample(
  userId: string,
  libraryId: ExampleLibraryId,
  data: {
    input: string
    output: string
    qualityScore: number
    evalScores?: Record<string, number>
    runId: RunId
    stepIndex?: number
    metadata?: Record<string, unknown>
    tags?: string[]
    requiresApproval?: boolean
  }
): Promise<FewShotExample | PendingPromotion> {
  const db = getFirestore()

  if (data.requiresApproval) {
    // Create pending promotion for manual review
    const promotionId = randomUUID()

    const pending: PendingPromotion = {
      promotionId,
      libraryId,
      runId: data.runId,
      stepIndex: data.stepIndex,
      input: data.input,
      output: data.output,
      qualityScore: data.qualityScore,
      evalScores: data.evalScores,
      status: 'pending',
      createdAtMs: Date.now(),
    }

    await db.doc(`${getPendingPromotionsPath(userId)}/${promotionId}`).set(pending)

    return pending
  }

  // Create example directly
  const exampleId = randomUUID() as FewShotExampleId
  const now = Date.now()

  const example: FewShotExample = {
    exampleId,
    libraryId,
    input: data.input,
    output: data.output,
    qualityScore: data.qualityScore,
    evalScores: data.evalScores,
    source: 'auto_promoted',
    metadata: data.metadata,
    tags: data.tags,
    isActive: true,
    usageCount: 0,
    createdAtMs: now,
    updatedAtMs: now,
  }

  await db.doc(`${getExamplesPath(userId, libraryId)}/${exampleId}`).set(example)

  // Update library stats
  await updateLibraryStats(userId, libraryId)

  return example
}

/**
 * Approve a pending promotion
 */
export async function approvePendingPromotion(
  userId: string,
  promotionId: string,
  note?: string
): Promise<FewShotExample> {
  const db = getFirestore()

  const pendingDoc = await db.doc(`${getPendingPromotionsPath(userId)}/${promotionId}`).get()

  if (!pendingDoc.exists) {
    throw new Error(`Pending promotion ${promotionId} not found`)
  }

  const pending = pendingDoc.data() as PendingPromotion

  if (pending.status !== 'pending') {
    throw new Error(`Pending promotion ${promotionId} is already ${pending.status}`)
  }

  // Create the example
  const exampleId = randomUUID() as FewShotExampleId
  const now = Date.now()

  const example: FewShotExample = {
    exampleId,
    libraryId: pending.libraryId,
    input: pending.input,
    output: pending.output,
    qualityScore: pending.qualityScore,
    evalScores: pending.evalScores,
    source: 'auto_promoted',
    isActive: true,
    usageCount: 0,
    createdAtMs: now,
    updatedAtMs: now,
  }

  // Update pending status and create example
  const batch = db.batch()

  batch.update(pendingDoc.ref, {
    status: 'approved',
    reviewedAtMs: now,
    reviewerNote: note,
  })

  batch.set(db.doc(`${getExamplesPath(userId, pending.libraryId)}/${exampleId}`), example)

  await batch.commit()

  // Update library stats
  await updateLibraryStats(userId, pending.libraryId)

  return example
}

/**
 * List pending promotions for review
 */
export async function listPendingPromotions(
  userId: string,
  libraryId?: ExampleLibraryId,
  limit = 20
): Promise<
  Array<{
    promotionId: string
    runId: RunId
    libraryId: ExampleLibraryId
    output: string
    qualityScore: number
    createdAtMs: number
  }>
> {
  const db = getFirestore()

  let query = db
    .collection(getPendingPromotionsPath(userId))
    .where('status', '==', 'pending')
    .orderBy('qualityScore', 'desc')
    .limit(limit)

  if (libraryId) {
    query = query.where('libraryId', '==', libraryId)
  }

  const snapshot = await query.get()
  return snapshot.docs.map((doc) => {
    const data = doc.data()
    return {
      promotionId: doc.id,
      runId: data.runId,
      libraryId: data.libraryId,
      output: data.output,
      qualityScore: data.qualityScore,
      createdAtMs: data.createdAtMs,
    }
  })
}

/**
 * Reject a pending promotion
 */
export async function rejectPendingPromotion(
  userId: string,
  promotionId: string,
  reason?: string
): Promise<void> {
  const db = getFirestore()

  await db.doc(`${getPendingPromotionsPath(userId)}/${promotionId}`).update({
    status: 'rejected',
    reviewedAtMs: Date.now(),
    reviewerNote: reason,
  })
}

// ----- Auto-Pruning -----

/**
 * Identify examples that should be pruned based on degraded quality
 */
export async function identifyExamplesForPruning(
  userId: string,
  libraryId: ExampleLibraryId,
  options?: {
    minUsageCount?: number
    qualityThreshold?: number
    inactivityDays?: number
  }
): Promise<FewShotExample[]> {
  const db = getFirestore()

  const { minUsageCount = 5, qualityThreshold = 0.4, inactivityDays = 90 } = options || {}

  const inactivityThreshold = Date.now() - inactivityDays * 24 * 60 * 60 * 1000

  const snapshot = await db
    .collection(getExamplesPath(userId, libraryId))
    .where('isActive', '==', true)
    .get()

  const toPrune: FewShotExample[] = []

  for (const doc of snapshot.docs) {
    const example = doc.data() as FewShotExample

    // Check if example meets pruning criteria
    const isLowQuality = example.qualityScore < qualityThreshold
    const isUnused = example.usageCount < minUsageCount
    const isInactive =
      example.lastUsedAtMs === undefined || example.lastUsedAtMs < inactivityThreshold

    if (isLowQuality && (isUnused || isInactive)) {
      toPrune.push(example)
    }
  }

  return toPrune
}

/**
 * Prune (disable) examples
 */
export async function pruneExamples(
  userId: string,
  exampleIds: Array<{ libraryId: ExampleLibraryId; exampleId: FewShotExampleId }>
): Promise<number> {
  const db = getFirestore()
  const batch = db.batch()
  const now = Date.now()

  const librariesToUpdate = new Set<ExampleLibraryId>()

  for (const { libraryId, exampleId } of exampleIds) {
    const ref = db.doc(`${getExamplesPath(userId, libraryId)}/${exampleId}`)
    batch.update(ref, {
      isActive: false,
      updatedAtMs: now,
    })
    librariesToUpdate.add(libraryId)
  }

  await batch.commit()

  // Update stats for affected libraries
  for (const libraryId of librariesToUpdate) {
    await updateLibraryStats(userId, libraryId)
  }

  return exampleIds.length
}

// ----- Statistics -----

/**
 * Update library statistics
 */
async function updateLibraryStats(userId: string, libraryId: ExampleLibraryId): Promise<void> {
  const db = getFirestore()

  const snapshot = await db.collection(getExamplesPath(userId, libraryId)).get()

  let totalCount = 0
  let activeCount = 0
  let activeQuality = 0

  for (const doc of snapshot.docs) {
    const example = doc.data() as FewShotExample
    totalCount++

    if (example.isActive) {
      activeCount++
      activeQuality += example.qualityScore
    }
  }

  const avgQualityScore = activeCount > 0 ? activeQuality / activeCount : 0

  await db.doc(`${getLibrariesPath(userId)}/${libraryId}`).update({
    exampleCount: totalCount,
    activeExampleCount: activeCount,
    avgQualityScore,
    updatedAtMs: Date.now(),
  })
}

/**
 * Get comprehensive library statistics
 */
export async function getLibraryStats(
  userId: string,
  libraryId: ExampleLibraryId
): Promise<ExampleLibraryStats> {
  const db = getFirestore()

  const snapshot = await db.collection(getExamplesPath(userId, libraryId)).get()

  const stats: ExampleLibraryStats = {
    libraryId,
    totalExamples: 0,
    activeExamples: 0,
    manualExamples: 0,
    autoPromotedExamples: 0,
    avgQualityScore: 0,
    qualityDistribution: { excellent: 0, good: 0, fair: 0, poor: 0 },
    totalUsageCount: 0,
    usageLast7Days: 0,
    usageLast30Days: 0,
    oldestExampleMs: Infinity,
    newestExampleMs: 0,
    computedAtMs: Date.now(),
  }

  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000

  let totalQuality = 0

  for (const doc of snapshot.docs) {
    const example = doc.data() as FewShotExample

    stats.totalExamples++
    totalQuality += example.qualityScore
    stats.totalUsageCount += example.usageCount

    if (example.isActive) stats.activeExamples++
    if (example.source === 'manual') stats.manualExamples++
    if (example.source === 'auto_promoted') stats.autoPromotedExamples++

    // Quality distribution
    if (example.qualityScore >= 0.9) stats.qualityDistribution.excellent++
    else if (example.qualityScore >= 0.7) stats.qualityDistribution.good++
    else if (example.qualityScore >= 0.5) stats.qualityDistribution.fair++
    else stats.qualityDistribution.poor++

    // Usage tracking
    if (example.lastUsedAtMs && example.lastUsedAtMs > sevenDaysAgo) {
      stats.usageLast7Days++
    }
    if (example.lastUsedAtMs && example.lastUsedAtMs > thirtyDaysAgo) {
      stats.usageLast30Days++
    }

    // Timestamps
    stats.oldestExampleMs = Math.min(stats.oldestExampleMs, example.createdAtMs)
    stats.newestExampleMs = Math.max(stats.newestExampleMs, example.createdAtMs)

    if (example.lastUsedAtMs) {
      stats.lastUsedMs = Math.max(stats.lastUsedMs || 0, example.lastUsedAtMs)
    }
  }

  stats.avgQualityScore = stats.totalExamples > 0 ? totalQuality / stats.totalExamples : 0

  if (stats.oldestExampleMs === Infinity) stats.oldestExampleMs = 0

  return stats
}

/**
 * Get example selection performance stats for an agent
 */
export async function getExampleSelectionStats(
  userId: string,
  agentId: AgentId
): Promise<ExampleSelectionStats | null> {
  const db = getFirestore()

  const doc = await db.doc(`${getSelectionStatsPath(userId)}/${agentId}`).get()

  if (!doc.exists) {
    return null
  }

  return doc.data() as ExampleSelectionStats
}

// ----- Helpers -----

function getDefaultPromotionCriteria(): PromotionCriteria {
  return {
    minQualityScore: 0.8,
    requireManualApproval: false,
    maxDailyPromotions: 10,
  }
}
