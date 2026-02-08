/**
 * Component-Level Evaluation
 *
 * Evaluates individual components (routers, tools, memory) based on
 * their specific performance characteristics.
 */

import { getFirestore } from 'firebase-admin/firestore'
import type {
  RouterEval,
  RouterEvalId,
  ToolEval,
  ToolEvalId,
  MemoryEval,
  MemoryEvalId,
  ComponentTelemetry,
} from '@lifeos/agents'
import type { RunId } from '@lifeos/agents'
import { randomUUID } from 'crypto'

// ----- Collection Paths -----

const EVALUATION_COLLECTION = 'evaluation'
const ROUTER_EVALS_SUBCOLLECTION = 'routerEvals'
const TOOL_EVALS_SUBCOLLECTION = 'toolEvals'
const MEMORY_EVALS_SUBCOLLECTION = 'memoryEvals'

function getRouterEvalsPath(userId: string): string {
  return `users/${userId}/${EVALUATION_COLLECTION}/${ROUTER_EVALS_SUBCOLLECTION}`
}

function getToolEvalsPath(userId: string): string {
  return `users/${userId}/${EVALUATION_COLLECTION}/${TOOL_EVALS_SUBCOLLECTION}`
}

function getMemoryEvalsPath(userId: string): string {
  return `users/${userId}/${EVALUATION_COLLECTION}/${MEMORY_EVALS_SUBCOLLECTION}`
}

// ----- Router Evaluation -----

/**
 * Record a router evaluation
 */
export async function recordRouterEval(
  userId: string,
  input: Omit<RouterEval, 'evalId' | 'createdAtMs'>
): Promise<RouterEval> {
  const db = getFirestore()
  const evalId = randomUUID() as RouterEvalId
  const now = Date.now()

  const routerEval: RouterEval = {
    ...input,
    evalId,
    createdAtMs: now,
  }

  await db.doc(`${getRouterEvalsPath(userId)}/${evalId}`).set(routerEval)

  return routerEval
}

/**
 * Record router eval from component telemetry
 */
export async function recordRouterEvalFromTelemetry(
  userId: string,
  telemetry: ComponentTelemetry,
  correctPath?: string,
  correctnessSource: RouterEval['correctnessSource'] = 'unknown'
): Promise<RouterEval> {
  if (!telemetry.routerDecision) {
    throw new Error('Component telemetry does not contain router decision')
  }

  return recordRouterEval(userId, {
    runId: telemetry.runId,
    userId,
    stepIndex: telemetry.stepIndex,
    chosenPath: telemetry.routerDecision.chosenPath,
    availableOptions: telemetry.routerDecision.availableOptions,
    correctPath,
    wasCorrect: correctPath ? telemetry.routerDecision.chosenPath === correctPath : true,
    correctnessSource,
    decisionLatencyMs: telemetry.durationMs,
    confidenceScore: telemetry.routerDecision.confidence,
  })
}

/**
 * Get router evals for a run
 */
export async function getRouterEvalsByRun(userId: string, runId: RunId): Promise<RouterEval[]> {
  const db = getFirestore()
  const snapshot = await db
    .collection(getRouterEvalsPath(userId))
    .where('runId', '==', runId)
    .orderBy('stepIndex', 'asc')
    .get()

  return snapshot.docs.map((doc) => doc.data() as RouterEval)
}

/**
 * Get router accuracy statistics
 */
export async function getRouterAccuracyStats(
  userId: string,
  routerId?: string,
  windowDays: number = 30
): Promise<{
  totalDecisions: number
  correctDecisions: number
  accuracy: number
  avgConfidence: number
  avgLatencyMs: number
  byPath: Record<string, { count: number; accuracy: number }>
}> {
  const db = getFirestore()
  const windowStartMs = Date.now() - windowDays * 24 * 60 * 60 * 1000

  const query: FirebaseFirestore.Query = db
    .collection(getRouterEvalsPath(userId))
    .where('createdAtMs', '>=', windowStartMs)

  const snapshot = await query.get()
  const evals = snapshot.docs.map((doc) => doc.data() as RouterEval)

  if (evals.length === 0) {
    return {
      totalDecisions: 0,
      correctDecisions: 0,
      accuracy: 0,
      avgConfidence: 0,
      avgLatencyMs: 0,
      byPath: {},
    }
  }

  let correctCount = 0
  let totalConfidence = 0
  let confidenceCount = 0
  let totalLatency = 0

  const byPath: Record<string, { count: number; correctCount: number }> = {}

  for (const evalResult of evals) {
    if (evalResult.wasCorrect) correctCount++
    if (evalResult.confidenceScore !== undefined) {
      totalConfidence += evalResult.confidenceScore
      confidenceCount++
    }
    totalLatency += evalResult.decisionLatencyMs

    const path = evalResult.chosenPath
    if (!byPath[path]) {
      byPath[path] = { count: 0, correctCount: 0 }
    }
    byPath[path].count++
    if (evalResult.wasCorrect) byPath[path].correctCount++
  }

  const byPathWithAccuracy: Record<string, { count: number; accuracy: number }> = {}
  for (const [path, stats] of Object.entries(byPath)) {
    byPathWithAccuracy[path] = {
      count: stats.count,
      accuracy: stats.count > 0 ? stats.correctCount / stats.count : 0,
    }
  }

  return {
    totalDecisions: evals.length,
    correctDecisions: correctCount,
    accuracy: evals.length > 0 ? correctCount / evals.length : 0,
    avgConfidence: confidenceCount > 0 ? totalConfidence / confidenceCount : 0,
    avgLatencyMs: evals.length > 0 ? totalLatency / evals.length : 0,
    byPath: byPathWithAccuracy,
  }
}

// ----- Tool Evaluation -----

/**
 * Record a tool evaluation
 */
export async function recordToolEval(
  userId: string,
  input: Omit<ToolEval, 'evalId' | 'createdAtMs'>
): Promise<ToolEval> {
  const db = getFirestore()
  const evalId = randomUUID() as ToolEvalId
  const now = Date.now()

  const toolEval: ToolEval = {
    ...input,
    evalId,
    createdAtMs: now,
  }

  await db.doc(`${getToolEvalsPath(userId)}/${evalId}`).set(toolEval)

  return toolEval
}

/**
 * Record tool eval from component telemetry
 */
export async function recordToolEvalFromTelemetry(
  userId: string,
  telemetry: ComponentTelemetry,
  outputQuality?: number,
  qualityReason?: string,
  qualitySource: ToolEval['qualitySource'] = 'none',
  contributedToSuccess?: boolean
): Promise<ToolEval> {
  if (!telemetry.toolExecution) {
    throw new Error('Component telemetry does not contain tool execution')
  }

  return recordToolEval(userId, {
    runId: telemetry.runId,
    userId,
    stepIndex: telemetry.stepIndex,
    toolId: telemetry.toolExecution.toolId,
    toolName: telemetry.toolExecution.toolName,
    input: telemetry.toolExecution.input,
    output: telemetry.toolExecution.output,
    success: telemetry.toolExecution.success,
    errorType: telemetry.toolExecution.errorType,
    latencyMs: telemetry.durationMs,
    retryCount: telemetry.toolExecution.retryCount,
    outputQuality,
    qualityReason,
    qualitySource,
    contributedToSuccess,
  })
}

/**
 * Get tool evals for a run
 */
export async function getToolEvalsByRun(userId: string, runId: RunId): Promise<ToolEval[]> {
  const db = getFirestore()
  const snapshot = await db
    .collection(getToolEvalsPath(userId))
    .where('runId', '==', runId)
    .orderBy('stepIndex', 'asc')
    .get()

  return snapshot.docs.map((doc) => doc.data() as ToolEval)
}

/**
 * Get tool performance statistics
 */
export async function getToolEvalStats(
  userId: string,
  toolId: string,
  windowDays: number = 30
): Promise<{
  totalCalls: number
  successRate: number
  avgLatencyMs: number
  avgRetries: number
  avgQuality: number
  qualitySampleCount: number
  errorDistribution: Record<string, number>
  contributionRate: number
}> {
  const db = getFirestore()
  const windowStartMs = Date.now() - windowDays * 24 * 60 * 60 * 1000

  const snapshot = await db
    .collection(getToolEvalsPath(userId))
    .where('toolId', '==', toolId)
    .where('createdAtMs', '>=', windowStartMs)
    .get()

  const evals = snapshot.docs.map((doc) => doc.data() as ToolEval)

  if (evals.length === 0) {
    return {
      totalCalls: 0,
      successRate: 0,
      avgLatencyMs: 0,
      avgRetries: 0,
      avgQuality: 0,
      qualitySampleCount: 0,
      errorDistribution: {},
      contributionRate: 0,
    }
  }

  let successCount = 0
  let totalLatency = 0
  let totalRetries = 0
  let totalQuality = 0
  let qualityCount = 0
  let contributedCount = 0
  let contributionCheckedCount = 0
  const errorDistribution: Record<string, number> = {}

  for (const evalResult of evals) {
    if (evalResult.success) successCount++
    totalLatency += evalResult.latencyMs
    totalRetries += evalResult.retryCount

    if (evalResult.outputQuality !== undefined) {
      totalQuality += evalResult.outputQuality
      qualityCount++
    }

    if (evalResult.contributedToSuccess !== undefined) {
      contributionCheckedCount++
      if (evalResult.contributedToSuccess) contributedCount++
    }

    if (evalResult.errorType) {
      errorDistribution[evalResult.errorType] = (errorDistribution[evalResult.errorType] || 0) + 1
    }
  }

  return {
    totalCalls: evals.length,
    successRate: successCount / evals.length,
    avgLatencyMs: totalLatency / evals.length,
    avgRetries: totalRetries / evals.length,
    avgQuality: qualityCount > 0 ? totalQuality / qualityCount : 0,
    qualitySampleCount: qualityCount,
    errorDistribution,
    contributionRate:
      contributionCheckedCount > 0 ? contributedCount / contributionCheckedCount : 0,
  }
}

/**
 * Get all tool statistics for comparison
 */
export async function getAllToolEvalStats(
  userId: string,
  windowDays: number = 30
): Promise<
  Array<{ toolId: string; toolName: string } & Awaited<ReturnType<typeof getToolEvalStats>>>
> {
  const db = getFirestore()
  const windowStartMs = Date.now() - windowDays * 24 * 60 * 60 * 1000

  const snapshot = await db
    .collection(getToolEvalsPath(userId))
    .where('createdAtMs', '>=', windowStartMs)
    .get()

  const evals = snapshot.docs.map((doc) => doc.data() as ToolEval)

  // Group by toolId
  const byTool = new Map<string, { toolName: string; evals: ToolEval[] }>()
  for (const evalResult of evals) {
    if (!byTool.has(evalResult.toolId)) {
      byTool.set(evalResult.toolId, { toolName: evalResult.toolName, evals: [] })
    }
    byTool.get(evalResult.toolId)!.evals.push(evalResult)
  }

  const results: Array<
    { toolId: string; toolName: string } & Awaited<ReturnType<typeof getToolEvalStats>>
  > = []

  for (const [toolId, data] of byTool) {
    const stats = await getToolEvalStats(userId, toolId, windowDays)
    results.push({ toolId, toolName: data.toolName, ...stats })
  }

  // Sort by total calls descending
  results.sort((a, b) => b.totalCalls - a.totalCalls)

  return results
}

// ----- Memory Evaluation -----

/**
 * Record a memory evaluation
 */
export async function recordMemoryEval(
  userId: string,
  input: Omit<MemoryEval, 'evalId' | 'createdAtMs'>
): Promise<MemoryEval> {
  const db = getFirestore()
  const evalId = randomUUID() as MemoryEvalId
  const now = Date.now()

  const memoryEval: MemoryEval = {
    ...input,
    evalId,
    createdAtMs: now,
  }

  await db.doc(`${getMemoryEvalsPath(userId)}/${evalId}`).set(memoryEval)

  return memoryEval
}

/**
 * Record memory eval from component telemetry
 */
export async function recordMemoryEvalFromTelemetry(
  userId: string,
  telemetry: ComponentTelemetry,
  relevanceScores: number[],
  usedInOutput: boolean,
  contributedToSuccess: boolean,
  expectedItems?: string[]
): Promise<MemoryEval> {
  if (!telemetry.memoryOperation) {
    throw new Error('Component telemetry does not contain memory operation')
  }

  const retrieved = telemetry.memoryOperation.retrieved || []
  const avgRelevance =
    relevanceScores.length > 0
      ? relevanceScores.reduce((a, b) => a + b, 0) / relevanceScores.length
      : 0

  let recall: number | undefined
  if (expectedItems && expectedItems.length > 0) {
    const retrievedSet = new Set(retrieved)
    const foundCount = expectedItems.filter((item) => retrievedSet.has(item)).length
    recall = foundCount / expectedItems.length
  }

  return recordMemoryEval(userId, {
    runId: telemetry.runId,
    userId,
    stepIndex: telemetry.stepIndex,
    query: telemetry.memoryOperation.query || '',
    retrievedItems: retrieved,
    relevanceScores,
    avgRelevance,
    usedInOutput,
    contributedToSuccess,
    expectedItems,
    recall,
  })
}

/**
 * Get memory evals for a run
 */
export async function getMemoryEvalsByRun(userId: string, runId: RunId): Promise<MemoryEval[]> {
  const db = getFirestore()
  const snapshot = await db
    .collection(getMemoryEvalsPath(userId))
    .where('runId', '==', runId)
    .orderBy('stepIndex', 'asc')
    .get()

  return snapshot.docs.map((doc) => doc.data() as MemoryEval)
}

/**
 * Get memory retrieval statistics
 */
export async function getMemoryEvalStats(
  userId: string,
  windowDays: number = 30
): Promise<{
  totalRetrievals: number
  avgRelevance: number
  avgItemsRetrieved: number
  usageRate: number
  contributionRate: number
  avgRecall: number
  recallSampleCount: number
}> {
  const db = getFirestore()
  const windowStartMs = Date.now() - windowDays * 24 * 60 * 60 * 1000

  const snapshot = await db
    .collection(getMemoryEvalsPath(userId))
    .where('createdAtMs', '>=', windowStartMs)
    .get()

  const evals = snapshot.docs.map((doc) => doc.data() as MemoryEval)

  if (evals.length === 0) {
    return {
      totalRetrievals: 0,
      avgRelevance: 0,
      avgItemsRetrieved: 0,
      usageRate: 0,
      contributionRate: 0,
      avgRecall: 0,
      recallSampleCount: 0,
    }
  }

  let totalRelevance = 0
  let totalItems = 0
  let usedCount = 0
  let contributedCount = 0
  let totalRecall = 0
  let recallCount = 0

  for (const evalResult of evals) {
    totalRelevance += evalResult.avgRelevance
    totalItems += evalResult.retrievedItems.length
    if (evalResult.usedInOutput) usedCount++
    if (evalResult.contributedToSuccess) contributedCount++
    if (evalResult.recall !== undefined) {
      totalRecall += evalResult.recall
      recallCount++
    }
  }

  return {
    totalRetrievals: evals.length,
    avgRelevance: totalRelevance / evals.length,
    avgItemsRetrieved: totalItems / evals.length,
    usageRate: usedCount / evals.length,
    contributionRate: contributedCount / evals.length,
    avgRecall: recallCount > 0 ? totalRecall / recallCount : 0,
    recallSampleCount: recallCount,
  }
}

// ----- Aggregate Component Evaluation -----

/**
 * Get component evaluation summary for a run
 */
export async function getComponentEvalSummary(
  userId: string,
  runId: RunId
): Promise<{
  routerEvals: RouterEval[]
  toolEvals: ToolEval[]
  memoryEvals: MemoryEval[]
  summary: {
    routerAccuracy: number
    toolSuccessRate: number
    avgToolQuality: number
    memoryContributionRate: number
    totalComponents: number
  }
}> {
  const [routerEvals, toolEvals, memoryEvals] = await Promise.all([
    getRouterEvalsByRun(userId, runId),
    getToolEvalsByRun(userId, runId),
    getMemoryEvalsByRun(userId, runId),
  ])

  const routerCorrect = routerEvals.filter((e) => e.wasCorrect).length
  const toolSuccess = toolEvals.filter((e) => e.success).length
  const toolQualities = toolEvals
    .map((e) => e.outputQuality)
    .filter((q): q is number => q !== undefined)
  const memoryContributed = memoryEvals.filter((e) => e.contributedToSuccess).length

  return {
    routerEvals,
    toolEvals,
    memoryEvals,
    summary: {
      routerAccuracy: routerEvals.length > 0 ? routerCorrect / routerEvals.length : 1,
      toolSuccessRate: toolEvals.length > 0 ? toolSuccess / toolEvals.length : 1,
      avgToolQuality:
        toolQualities.length > 0
          ? toolQualities.reduce((a, b) => a + b, 0) / toolQualities.length
          : 0,
      memoryContributionRate: memoryEvals.length > 0 ? memoryContributed / memoryEvals.length : 0,
      totalComponents: routerEvals.length + toolEvals.length + memoryEvals.length,
    },
  }
}
