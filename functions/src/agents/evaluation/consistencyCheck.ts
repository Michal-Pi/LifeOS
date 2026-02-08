/**
 * Consistency Evaluation
 *
 * Measures output consistency across multiple runs with the same input.
 * High variance may indicate:
 * - Model instability
 * - Temperature settings too high
 * - Ambiguous prompts
 * - Model API changes
 */

import { getFirestore } from 'firebase-admin/firestore'
import type { ConsistencyResult, ConsistencyCheckId } from '@lifeos/agents'
import type { WorkflowId, RunId } from '@lifeos/agents'
import { randomUUID } from 'crypto'
import { createHash } from 'crypto'

// ----- Collection Paths -----

const EVALUATION_COLLECTION = 'evaluation'
const CONSISTENCY_SUBCOLLECTION = 'consistency'

function getConsistencyPath(userId: string): string {
  return `users/${userId}/${EVALUATION_COLLECTION}/${CONSISTENCY_SUBCOLLECTION}`
}

// ----- Helper Functions -----

/**
 * Hash content for comparison
 */
export function hashContent(content: string): string {
  return createHash('sha256').update(content).digest('hex').slice(0, 16)
}

/**
 * Compute Jaccard similarity between two strings (word-level)
 */
function jaccardSimilarity(a: string, b: string): number {
  const wordsA = new Set(
    a
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 2)
  )
  const wordsB = new Set(
    b
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 2)
  )

  if (wordsA.size === 0 && wordsB.size === 0) return 1
  if (wordsA.size === 0 || wordsB.size === 0) return 0

  let intersection = 0
  for (const word of wordsA) {
    if (wordsB.has(word)) intersection++
  }

  const union = wordsA.size + wordsB.size - intersection
  return union > 0 ? intersection / union : 0
}

/**
 * Compute cosine similarity between two strings using word frequency vectors
 */
function cosineSimilarity(a: string, b: string): number {
  const wordsA = a
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 2)
  const wordsB = b
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 2)

  const freqA: Map<string, number> = new Map()
  const freqB: Map<string, number> = new Map()

  for (const word of wordsA) {
    freqA.set(word, (freqA.get(word) || 0) + 1)
  }

  for (const word of wordsB) {
    freqB.set(word, (freqB.get(word) || 0) + 1)
  }

  const allWords = new Set([...freqA.keys(), ...freqB.keys()])

  let dotProduct = 0
  let normA = 0
  let normB = 0

  for (const word of allWords) {
    const countA = freqA.get(word) || 0
    const countB = freqB.get(word) || 0
    dotProduct += countA * countB
    normA += countA * countA
    normB += countB * countB
  }

  if (normA === 0 || normB === 0) return 0
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))
}

/**
 * Compute average pairwise similarity for a set of outputs
 */
function computeAverageSimilarity(outputs: string[]): number {
  if (outputs.length < 2) return 1

  let totalSimilarity = 0
  let pairCount = 0

  for (let i = 0; i < outputs.length; i++) {
    for (let j = i + 1; j < outputs.length; j++) {
      // Use average of Jaccard and cosine for more robust similarity
      const jaccard = jaccardSimilarity(outputs[i], outputs[j])
      const cosine = cosineSimilarity(outputs[i], outputs[j])
      totalSimilarity += (jaccard + cosine) / 2
      pairCount++
    }
  }

  return pairCount > 0 ? totalSimilarity / pairCount : 1
}

/**
 * Compute semantic variance (1 - average similarity)
 */
function computeSemanticVariance(outputs: string[]): number {
  return 1 - computeAverageSimilarity(outputs)
}

// ----- Consistency Checking -----

/**
 * Record a consistency check result
 */
export async function recordConsistencyCheck(
  userId: string,
  input: {
    workflowId: WorkflowId
    workflowType: string
    inputHash: string
    inputSnapshot?: string
    runIds: RunId[]
    outputs: string[]
    varianceThreshold?: number
  }
): Promise<ConsistencyResult> {
  const db = getFirestore()
  const checkId = randomUUID() as ConsistencyCheckId
  const now = Date.now()

  const outputHashes = input.outputs.map((o) => hashContent(o))
  const semanticVariance = computeSemanticVariance(input.outputs)
  const lexicalSimilarity = computeAverageSimilarity(input.outputs)
  const varianceThreshold = input.varianceThreshold || 0.3 // Default 30% variance threshold

  const result: ConsistencyResult = {
    checkId,
    userId,
    workflowId: input.workflowId,
    workflowType: input.workflowType,
    inputHash: input.inputHash,
    inputSnapshot: input.inputSnapshot,
    runIds: input.runIds,
    runCount: input.runIds.length,
    outputHashes,
    outputs: input.outputs,
    semanticVariance,
    lexicalSimilarity,
    isConsistent: semanticVariance <= varianceThreshold,
    varianceThreshold,
    createdAtMs: now,
  }

  await db.doc(`${getConsistencyPath(userId)}/${checkId}`).set(result)

  return result
}

/**
 * Get a consistency check by ID
 */
export async function getConsistencyCheck(
  userId: string,
  checkId: ConsistencyCheckId
): Promise<ConsistencyResult | null> {
  const db = getFirestore()
  const doc = await db.doc(`${getConsistencyPath(userId)}/${checkId}`).get()

  if (!doc.exists) return null
  return doc.data() as ConsistencyResult
}

/**
 * List consistency checks with optional filters
 */
export async function listConsistencyChecks(
  userId: string,
  filters?: {
    workflowType?: string
    isConsistent?: boolean
    startAfterMs?: number
  },
  limit: number = 100
): Promise<ConsistencyResult[]> {
  const db = getFirestore()
  let query: FirebaseFirestore.Query = db.collection(getConsistencyPath(userId))

  if (filters?.workflowType) {
    query = query.where('workflowType', '==', filters.workflowType)
  }

  if (filters?.isConsistent !== undefined) {
    query = query.where('isConsistent', '==', filters.isConsistent)
  }

  if (filters?.startAfterMs) {
    query = query.where('createdAtMs', '>=', filters.startAfterMs)
  }

  query = query.orderBy('createdAtMs', 'desc').limit(limit)

  const snapshot = await query.get()
  return snapshot.docs.map((doc) => doc.data() as ConsistencyResult)
}

/**
 * Get consistency statistics for a workflow type
 */
export async function getConsistencyStats(
  userId: string,
  workflowType: string,
  windowDays: number = 30
): Promise<{
  totalChecks: number
  consistentCount: number
  consistencyRate: number
  avgVariance: number
  avgSimilarity: number
}> {
  const startMs = Date.now() - windowDays * 24 * 60 * 60 * 1000
  const checks = await listConsistencyChecks(userId, { workflowType, startAfterMs: startMs }, 1000)

  if (checks.length === 0) {
    return {
      totalChecks: 0,
      consistentCount: 0,
      consistencyRate: 0,
      avgVariance: 0,
      avgSimilarity: 0,
    }
  }

  let consistentCount = 0
  let totalVariance = 0
  let totalSimilarity = 0

  for (const check of checks) {
    if (check.isConsistent) consistentCount++
    totalVariance += check.semanticVariance
    totalSimilarity += check.lexicalSimilarity
  }

  return {
    totalChecks: checks.length,
    consistentCount,
    consistencyRate: consistentCount / checks.length,
    avgVariance: totalVariance / checks.length,
    avgSimilarity: totalSimilarity / checks.length,
  }
}

/**
 * Check if recent outputs are becoming less consistent (potential drift indicator)
 */
export async function detectConsistencyDrift(
  userId: string,
  workflowType: string,
  baselineWindowDays: number = 30,
  recentWindowDays: number = 7
): Promise<{
  hasDrift: boolean
  baselineConsistency: number
  recentConsistency: number
  change: number
  percentChange: number
}> {
  const now = Date.now()
  const recentStart = now - recentWindowDays * 24 * 60 * 60 * 1000
  const baselineEnd = recentStart
  const baselineStart = now - baselineWindowDays * 24 * 60 * 60 * 1000

  // Get baseline checks
  const baselineChecks = await listConsistencyChecks(
    userId,
    { workflowType, startAfterMs: baselineStart },
    1000
  )
  const baselineFiltered = baselineChecks.filter((c) => c.createdAtMs < baselineEnd)

  // Get recent checks
  const recentChecks = await listConsistencyChecks(
    userId,
    { workflowType, startAfterMs: recentStart },
    100
  )

  if (baselineFiltered.length === 0 || recentChecks.length === 0) {
    return {
      hasDrift: false,
      baselineConsistency: 0,
      recentConsistency: 0,
      change: 0,
      percentChange: 0,
    }
  }

  const baselineConsistency =
    baselineFiltered.filter((c) => c.isConsistent).length / baselineFiltered.length
  const recentConsistency = recentChecks.filter((c) => c.isConsistent).length / recentChecks.length

  const change = recentConsistency - baselineConsistency
  const percentChange = baselineConsistency > 0 ? (change / baselineConsistency) * 100 : 0

  // Drift threshold: 20% decrease in consistency rate
  const hasDrift = percentChange < -20

  return {
    hasDrift,
    baselineConsistency,
    recentConsistency,
    change,
    percentChange,
  }
}
