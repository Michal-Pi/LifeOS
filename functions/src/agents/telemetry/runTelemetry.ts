/**
 * Run Telemetry Collection
 *
 * Collects and persists telemetry data for workflow runs.
 * Integrates with the LangGraph executor to capture:
 * - Timing metrics (duration per step and total)
 * - Resource usage (tokens, cost)
 * - Tool call counts
 * - Status and error information
 */

import { getFirestore } from 'firebase-admin/firestore'
import type {
  RunTelemetry,
  TelemetryRunId,
  StepTelemetry,
  DailyTelemetrySummary,
} from '@lifeos/agents'
import type { RunId, WorkflowId } from '@lifeos/agents'
import { randomUUID } from 'crypto'
import { createHash } from 'crypto'

// ----- Collection Paths -----

const TELEMETRY_COLLECTION = 'telemetry'
const RUNS_SUBCOLLECTION = 'runs'
const SUMMARIES_SUBCOLLECTION = 'summaries'

function getTelemetryRunsPath(userId: string): string {
  return `users/${userId}/${TELEMETRY_COLLECTION}/${RUNS_SUBCOLLECTION}`
}

function getTelemetrySummariesPath(userId: string): string {
  return `users/${userId}/${TELEMETRY_COLLECTION}/${SUMMARIES_SUBCOLLECTION}`
}

// ----- Input Types -----

export interface RecordTelemetryInput {
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
  steps: StepTelemetry[]
  inputHash?: string
  outputHash?: string
  experimentId?: string
  variantIds?: string[]
}

// ----- Helper Functions -----

/**
 * Generate a hash for an input or output string
 */
export function hashContent(content: string): string {
  return createHash('sha256').update(content).digest('hex').slice(0, 16)
}

/**
 * Convert Firestore document to RunTelemetry
 */
function docToTelemetry(doc: FirebaseFirestore.DocumentSnapshot): RunTelemetry | null {
  if (!doc.exists) return null

  const data = doc.data()
  if (!data) return null

  return {
    telemetryId: doc.id as TelemetryRunId,
    runId: data.runId as RunId,
    workflowId: data.workflowId as WorkflowId,
    userId: data.userId,
    workflowType: data.workflowType,
    workflowName: data.workflowName,
    startedAtMs: data.startedAtMs,
    completedAtMs: data.completedAtMs,
    durationMs: data.durationMs,
    totalTokens: data.totalTokens,
    estimatedCost: data.estimatedCost,
    stepCount: data.stepCount,
    toolCallCount: data.toolCallCount,
    status: data.status,
    errorMessage: data.errorMessage,
    steps: data.steps || [],
    inputHash: data.inputHash,
    outputHash: data.outputHash,
    evalResultId: data.evalResultId,
    qualityScore: data.qualityScore,
    experimentId: data.experimentId,
    variantIds: data.variantIds,
    createdAtMs: data.createdAtMs,
  }
}

// ----- Telemetry Recording -----

/**
 * Record telemetry for a completed workflow run
 */
export async function recordRunTelemetry(
  userId: string,
  input: RecordTelemetryInput
): Promise<RunTelemetry> {
  const db = getFirestore()
  const telemetryId = randomUUID() as TelemetryRunId
  const now = Date.now()

  const telemetryData = {
    telemetryId,
    runId: input.runId,
    workflowId: input.workflowId,
    userId,
    workflowType: input.workflowType,
    workflowName: input.workflowName,
    startedAtMs: input.startedAtMs,
    completedAtMs: input.completedAtMs,
    durationMs: input.durationMs,
    totalTokens: input.totalTokens,
    estimatedCost: input.estimatedCost,
    stepCount: input.stepCount,
    toolCallCount: input.toolCallCount,
    status: input.status,
    errorMessage: input.errorMessage || null,
    steps: input.steps,
    inputHash: input.inputHash || null,
    outputHash: input.outputHash || null,
    experimentId: input.experimentId || null,
    variantIds: input.variantIds || null,
    evalResultId: null,
    qualityScore: null,
    createdAtMs: now,
  }

  await db.doc(`${getTelemetryRunsPath(userId)}/${telemetryId}`).set(telemetryData)

  return {
    ...telemetryData,
    evalResultId: undefined,
    qualityScore: undefined,
    errorMessage: input.errorMessage,
    inputHash: input.inputHash,
    outputHash: input.outputHash,
    experimentId: input.experimentId as unknown as undefined,
    variantIds: input.variantIds as unknown as undefined,
  }
}

/**
 * Get telemetry by ID
 */
export async function getTelemetry(
  userId: string,
  telemetryId: TelemetryRunId
): Promise<RunTelemetry | null> {
  const db = getFirestore()
  const doc = await db.doc(`${getTelemetryRunsPath(userId)}/${telemetryId}`).get()
  return docToTelemetry(doc)
}

/**
 * Get telemetry by run ID
 */
export async function getTelemetryByRunId(
  userId: string,
  runId: RunId
): Promise<RunTelemetry | null> {
  const db = getFirestore()
  const snapshot = await db
    .collection(getTelemetryRunsPath(userId))
    .where('runId', '==', runId)
    .limit(1)
    .get()

  if (snapshot.empty) return null
  return docToTelemetry(snapshot.docs[0])
}

/**
 * List telemetry with filters
 */
export async function listTelemetry(
  userId: string,
  filters?: {
    workflowType?: string
    status?: 'completed' | 'failed' | 'cancelled'
    startAfterMs?: number
    startBeforeMs?: number
    minDurationMs?: number
    maxDurationMs?: number
    experimentId?: string
  },
  limit: number = 100
): Promise<RunTelemetry[]> {
  const db = getFirestore()
  let query: FirebaseFirestore.Query = db.collection(getTelemetryRunsPath(userId))

  if (filters?.workflowType) {
    query = query.where('workflowType', '==', filters.workflowType)
  }

  if (filters?.status) {
    query = query.where('status', '==', filters.status)
  }

  if (filters?.experimentId) {
    query = query.where('experimentId', '==', filters.experimentId)
  }

  if (filters?.startAfterMs) {
    query = query.where('startedAtMs', '>=', filters.startAfterMs)
  }

  if (filters?.startBeforeMs) {
    query = query.where('startedAtMs', '<=', filters.startBeforeMs)
  }

  query = query.orderBy('createdAtMs', 'desc').limit(limit)

  const snapshot = await query.get()
  const results: RunTelemetry[] = []

  for (const doc of snapshot.docs) {
    const telemetry = docToTelemetry(doc)
    if (!telemetry) continue

    // Client-side filtering for duration (can't combine with other inequalities)
    if (filters?.minDurationMs && telemetry.durationMs < filters.minDurationMs) continue
    if (filters?.maxDurationMs && telemetry.durationMs > filters.maxDurationMs) continue

    results.push(telemetry)
  }

  return results
}

/**
 * Update telemetry with evaluation results
 */
export async function updateTelemetryWithEval(
  userId: string,
  telemetryId: TelemetryRunId,
  evalResultId: string,
  qualityScore: number
): Promise<void> {
  const db = getFirestore()
  await db.doc(`${getTelemetryRunsPath(userId)}/${telemetryId}`).update({
    evalResultId,
    qualityScore,
  })
}

// ----- Daily Summaries -----

/**
 * Compute daily summary for a given date
 */
export async function computeDailySummary(
  userId: string,
  date: string // YYYY-MM-DD
): Promise<DailyTelemetrySummary> {
  const db = getFirestore()

  // Parse date to get start and end timestamps
  const startOfDay = new Date(`${date}T00:00:00.000Z`).getTime()
  const endOfDay = new Date(`${date}T23:59:59.999Z`).getTime()

  // Get all telemetry for the day
  const snapshot = await db
    .collection(getTelemetryRunsPath(userId))
    .where('startedAtMs', '>=', startOfDay)
    .where('startedAtMs', '<=', endOfDay)
    .get()

  const byWorkflowType: DailyTelemetrySummary['byWorkflowType'] = {}
  let totalRuns = 0
  let totalTokens = 0
  let totalCost = 0
  let totalDuration = 0

  for (const doc of snapshot.docs) {
    const telemetry = docToTelemetry(doc)
    if (!telemetry) continue

    totalRuns++
    totalTokens += telemetry.totalTokens
    totalCost += telemetry.estimatedCost
    totalDuration += telemetry.durationMs

    const wfType = telemetry.workflowType
    if (!byWorkflowType[wfType]) {
      byWorkflowType[wfType] = {
        runCount: 0,
        successCount: 0,
        failedCount: 0,
        totalDurationMs: 0,
        avgDurationMs: 0,
        totalTokens: 0,
        totalCost: 0,
        avgQualityScore: undefined,
      }
    }

    const stats = byWorkflowType[wfType]
    stats.runCount++
    stats.totalDurationMs += telemetry.durationMs
    stats.totalTokens += telemetry.totalTokens
    stats.totalCost += telemetry.estimatedCost

    if (telemetry.status === 'completed') {
      stats.successCount++
    } else if (telemetry.status === 'failed') {
      stats.failedCount++
    }

    // Track quality scores for average
    if (telemetry.qualityScore !== undefined) {
      if (stats.avgQualityScore === undefined) {
        stats.avgQualityScore = telemetry.qualityScore
      } else {
        // Incremental average
        const n = stats.successCount
        stats.avgQualityScore =
          stats.avgQualityScore + (telemetry.qualityScore - stats.avgQualityScore) / n
      }
    }
  }

  // Compute averages
  for (const wfType of Object.keys(byWorkflowType)) {
    const stats = byWorkflowType[wfType]
    stats.avgDurationMs = stats.runCount > 0 ? stats.totalDurationMs / stats.runCount : 0
  }

  const summary: DailyTelemetrySummary = {
    userId,
    date,
    byWorkflowType,
    totalRuns,
    totalTokens,
    totalCost,
    avgDurationMs: totalRuns > 0 ? totalDuration / totalRuns : 0,
    computedAtMs: Date.now(),
  }

  // Store the summary
  await db.doc(`${getTelemetrySummariesPath(userId)}/${date}`).set(summary)

  return summary
}

/**
 * Get daily summary for a given date
 */
export async function getDailySummary(
  userId: string,
  date: string
): Promise<DailyTelemetrySummary | null> {
  const db = getFirestore()
  const doc = await db.doc(`${getTelemetrySummariesPath(userId)}/${date}`).get()

  if (!doc.exists) return null

  const data = doc.data()
  if (!data) return null

  return data as DailyTelemetrySummary
}

/**
 * List daily summaries for a date range
 */
export async function listDailySummaries(
  userId: string,
  startDate: string,
  endDate: string
): Promise<DailyTelemetrySummary[]> {
  const db = getFirestore()
  const snapshot = await db
    .collection(getTelemetrySummariesPath(userId))
    .where('date', '>=', startDate)
    .where('date', '<=', endDate)
    .orderBy('date', 'asc')
    .get()

  return snapshot.docs.map((doc) => doc.data() as DailyTelemetrySummary)
}

// ----- Aggregation Helpers -----

/**
 * Get aggregated metrics for a workflow type over a time window
 */
export async function getWorkflowMetrics(
  userId: string,
  workflowType: string,
  windowDays: number = 30
): Promise<{
  runCount: number
  successRate: number
  avgDurationMs: number
  avgTokens: number
  avgCost: number
  avgQualityScore: number | null
}> {
  const startMs = Date.now() - windowDays * 24 * 60 * 60 * 1000
  const telemetry = await listTelemetry(userId, { workflowType, startAfterMs: startMs }, 1000)

  if (telemetry.length === 0) {
    return {
      runCount: 0,
      successRate: 0,
      avgDurationMs: 0,
      avgTokens: 0,
      avgCost: 0,
      avgQualityScore: null,
    }
  }

  let successCount = 0
  let totalDuration = 0
  let totalTokens = 0
  let totalCost = 0
  let qualitySum = 0
  let qualityCount = 0

  for (const t of telemetry) {
    if (t.status === 'completed') successCount++
    totalDuration += t.durationMs
    totalTokens += t.totalTokens
    totalCost += t.estimatedCost
    if (t.qualityScore !== undefined) {
      qualitySum += t.qualityScore
      qualityCount++
    }
  }

  return {
    runCount: telemetry.length,
    successRate: telemetry.length > 0 ? successCount / telemetry.length : 0,
    avgDurationMs: telemetry.length > 0 ? totalDuration / telemetry.length : 0,
    avgTokens: telemetry.length > 0 ? totalTokens / telemetry.length : 0,
    avgCost: telemetry.length > 0 ? totalCost / telemetry.length : 0,
    avgQualityScore: qualityCount > 0 ? qualitySum / qualityCount : null,
  }
}
