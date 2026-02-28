/**
 * Component-Level Telemetry
 *
 * Tracks individual component executions (router decisions, tool calls, memory operations)
 * for detailed debugging and evaluation.
 */

import { getFirestore } from 'firebase-admin/firestore'
import type {
  ComponentTelemetry,
  ComponentTelemetryId,
  ComponentType,
  RouterDecision,
  ToolExecution,
  MemoryOperation,
  ToolPerformanceStats,
} from '@lifeos/agents'
import type { RunId } from '@lifeos/agents'
import { randomUUID } from 'crypto'

// ----- Collection Paths -----

const TELEMETRY_COLLECTION = 'telemetry'
const COMPONENT_TELEMETRY_SUBCOLLECTION = 'components'

function getComponentTelemetryPath(userId: string): string {
  return `users/${userId}/${TELEMETRY_COLLECTION}/${COMPONENT_TELEMETRY_SUBCOLLECTION}`
}

// ----- Recording Functions -----

/**
 * Record a router decision
 */
export async function recordRouterDecision(
  userId: string,
  runId: RunId,
  workflowType: string,
  stepIndex: number,
  routerId: string,
  decision: RouterDecision,
  startedAtMs: number,
  completedAtMs: number
): Promise<ComponentTelemetry> {
  const db = getFirestore()
  const componentTelemetryId = randomUUID() as ComponentTelemetryId
  const now = Date.now()

  const telemetry: ComponentTelemetry = {
    componentTelemetryId,
    runId,
    userId,
    workflowType,
    componentType: 'router',
    componentId: routerId,
    stepIndex,
    startedAtMs,
    completedAtMs,
    durationMs: completedAtMs - startedAtMs,
    routerDecision: decision,
    createdAtMs: now,
  }

  await db.doc(`${getComponentTelemetryPath(userId)}/${componentTelemetryId}`).set(telemetry)

  return telemetry
}

/**
 * Record a tool execution
 */
export async function recordToolExecution(
  userId: string,
  runId: RunId,
  workflowType: string,
  stepIndex: number,
  execution: ToolExecution,
  startedAtMs: number,
  completedAtMs: number,
  parentComponentId?: string
): Promise<ComponentTelemetry> {
  const db = getFirestore()
  const componentTelemetryId = randomUUID() as ComponentTelemetryId
  const now = Date.now()

  const telemetry: ComponentTelemetry = {
    componentTelemetryId,
    runId,
    userId,
    workflowType,
    componentType: 'tool',
    componentId: execution.toolId,
    componentName: execution.toolName,
    stepIndex,
    startedAtMs,
    completedAtMs,
    durationMs: completedAtMs - startedAtMs,
    toolExecution: execution,
    parentComponentId,
    createdAtMs: now,
  }

  await db.doc(`${getComponentTelemetryPath(userId)}/${componentTelemetryId}`).set(telemetry)

  return telemetry
}

/**
 * Record a memory operation
 */
export async function recordMemoryOperation(
  userId: string,
  runId: RunId,
  workflowType: string,
  stepIndex: number,
  memoryId: string,
  operation: MemoryOperation,
  startedAtMs: number,
  completedAtMs: number
): Promise<ComponentTelemetry> {
  const db = getFirestore()
  const componentTelemetryId = randomUUID() as ComponentTelemetryId
  const now = Date.now()

  const telemetry: ComponentTelemetry = {
    componentTelemetryId,
    runId,
    userId,
    workflowType,
    componentType: 'memory',
    componentId: memoryId,
    stepIndex,
    startedAtMs,
    completedAtMs,
    durationMs: completedAtMs - startedAtMs,
    memoryOperation: operation,
    createdAtMs: now,
  }

  await db.doc(`${getComponentTelemetryPath(userId)}/${componentTelemetryId}`).set(telemetry)

  return telemetry
}

/**
 * Record a generic component telemetry entry
 */
export async function recordComponentTelemetry(
  userId: string,
  input: Omit<ComponentTelemetry, 'componentTelemetryId' | 'createdAtMs'>
): Promise<ComponentTelemetry> {
  const db = getFirestore()
  const componentTelemetryId = randomUUID() as ComponentTelemetryId
  const now = Date.now()

  const telemetry: ComponentTelemetry = {
    ...input,
    componentTelemetryId,
    createdAtMs: now,
  }

  await db.doc(`${getComponentTelemetryPath(userId)}/${componentTelemetryId}`).set(telemetry)

  return telemetry
}

// ----- Query Functions -----

/**
 * Get all component telemetry for a run
 */
export async function getComponentTelemetryByRun(
  userId: string,
  runId: RunId
): Promise<ComponentTelemetry[]> {
  const db = getFirestore()
  const snapshot = await db
    .collection(getComponentTelemetryPath(userId))
    .where('runId', '==', runId)
    .orderBy('stepIndex', 'asc')
    .orderBy('startedAtMs', 'asc')
    .get()

  return snapshot.docs.map((doc) => doc.data() as ComponentTelemetry)
}

/**
 * Get component telemetry by type for a run
 */
export async function getComponentTelemetryByType(
  userId: string,
  runId: RunId,
  componentType: ComponentType
): Promise<ComponentTelemetry[]> {
  const db = getFirestore()
  const snapshot = await db
    .collection(getComponentTelemetryPath(userId))
    .where('runId', '==', runId)
    .where('componentType', '==', componentType)
    .orderBy('stepIndex', 'asc')
    .get()

  return snapshot.docs.map((doc) => doc.data() as ComponentTelemetry)
}

/**
 * List component telemetry with filters
 */
export async function listComponentTelemetry(
  userId: string,
  filters?: {
    workflowType?: string
    componentType?: ComponentType
    componentId?: string
    startAfterMs?: number
    endBeforeMs?: number
  },
  limit: number = 100
): Promise<ComponentTelemetry[]> {
  const db = getFirestore()
  let query: FirebaseFirestore.Query = db.collection(getComponentTelemetryPath(userId))

  if (filters?.workflowType) {
    query = query.where('workflowType', '==', filters.workflowType)
  }

  if (filters?.componentType) {
    query = query.where('componentType', '==', filters.componentType)
  }

  if (filters?.componentId) {
    query = query.where('componentId', '==', filters.componentId)
  }

  if (filters?.startAfterMs) {
    query = query.where('createdAtMs', '>=', filters.startAfterMs)
  }

  if (filters?.endBeforeMs) {
    query = query.where('createdAtMs', '<=', filters.endBeforeMs)
  }

  query = query.orderBy('createdAtMs', 'desc').limit(limit)

  const snapshot = await query.get()
  return snapshot.docs.map((doc) => doc.data() as ComponentTelemetry)
}

// ----- Aggregation Functions -----

/**
 * Get tool performance statistics
 */
export async function getToolPerformanceStats(
  userId: string,
  toolId: string,
  workflowType: string,
  windowDays: number = 30
): Promise<ToolPerformanceStats | null> {
  const windowStartMs = Date.now() - windowDays * 24 * 60 * 60 * 1000
  const windowEndMs = Date.now()

  const telemetry = await listComponentTelemetry(
    userId,
    {
      componentType: 'tool',
      componentId: toolId,
      workflowType,
      startAfterMs: windowStartMs,
    },
    1000
  )

  if (telemetry.length === 0) return null

  const successfulCalls = telemetry.filter((t) => t.toolExecution?.success)
  const failedCalls = telemetry.filter((t) => !t.toolExecution?.success)

  // Calculate latency percentiles
  const latencies = telemetry.map((t) => t.durationMs).sort((a, b) => a - b)
  const p50Index = Math.floor(latencies.length * 0.5)
  const p95Index = Math.floor(latencies.length * 0.95)

  // Calculate retries
  const retries = telemetry.map((t) => t.toolExecution?.retryCount || 0).filter((r) => r > 0)

  // Get quality scores from tool evaluations (would need to join with ToolEval)
  // For now, we'll leave quality at 0 - it would be populated by the evaluation system

  return {
    toolId,
    toolName: telemetry[0].componentName || toolId,
    workflowType,
    totalCalls: telemetry.length,
    successfulCalls: successfulCalls.length,
    failedCalls: failedCalls.length,
    successRate: successfulCalls.length / telemetry.length,
    avgLatencyMs: latencies.reduce((a, b) => a + b, 0) / latencies.length,
    p50LatencyMs: latencies[p50Index] || 0,
    p95LatencyMs: latencies[p95Index] || 0,
    maxLatencyMs: latencies[latencies.length - 1] || 0,
    avgRetries: retries.length > 0 ? retries.reduce((a, b) => a + b, 0) / telemetry.length : 0,
    maxRetries: retries.length > 0 ? Math.max(...retries) : 0,
    avgOutputQuality: 0, // Would be populated by joining with evaluations
    qualitySampleCount: 0,
    windowStartMs,
    windowEndMs,
    computedAtMs: Date.now(),
  }
}

/**
 * Get all tool performance stats for a workflow type
 */
export async function getAllToolPerformanceStats(
  userId: string,
  workflowType: string,
  windowDays: number = 30
): Promise<ToolPerformanceStats[]> {
  const windowStartMs = Date.now() - windowDays * 24 * 60 * 60 * 1000

  // Get all tool telemetry for this workflow type
  const telemetry = await listComponentTelemetry(
    userId,
    {
      componentType: 'tool',
      workflowType,
      startAfterMs: windowStartMs,
    },
    10000
  )

  // Group by toolId
  const byToolId = new Map<string, ComponentTelemetry[]>()
  for (const t of telemetry) {
    const toolId = t.componentId
    if (!byToolId.has(toolId)) {
      byToolId.set(toolId, [])
    }
    byToolId.get(toolId)!.push(t)
  }

  // Compute stats for each tool
  const stats: ToolPerformanceStats[] = []
  for (const [toolId, _entries] of byToolId) {
    const stat = await getToolPerformanceStats(userId, toolId, workflowType, windowDays)
    if (stat) {
      stats.push(stat)
    }
  }

  return stats.sort((a, b) => b.totalCalls - a.totalCalls)
}

/**
 * Get router decision accuracy
 */
export async function getRouterDecisionStats(
  userId: string,
  routerId: string,
  workflowType: string,
  windowDays: number = 30
): Promise<{
  totalDecisions: number
  avgConfidence: number
  pathDistribution: Record<string, number>
  avgLatencyMs: number
}> {
  const windowStartMs = Date.now() - windowDays * 24 * 60 * 60 * 1000

  const telemetry = await listComponentTelemetry(
    userId,
    {
      componentType: 'router',
      componentId: routerId,
      workflowType,
      startAfterMs: windowStartMs,
    },
    1000
  )

  if (telemetry.length === 0) {
    return {
      totalDecisions: 0,
      avgConfidence: 0,
      pathDistribution: {},
      avgLatencyMs: 0,
    }
  }

  const confidences = telemetry
    .map((t) => t.routerDecision?.confidence)
    .filter((c): c is number => c !== undefined)

  const pathDistribution: Record<string, number> = {}
  for (const t of telemetry) {
    const path = t.routerDecision?.chosenPath || 'unknown'
    pathDistribution[path] = (pathDistribution[path] || 0) + 1
  }

  const latencies = telemetry.map((t) => t.durationMs)

  return {
    totalDecisions: telemetry.length,
    avgConfidence:
      confidences.length > 0 ? confidences.reduce((a, b) => a + b, 0) / confidences.length : 0,
    pathDistribution,
    avgLatencyMs: latencies.reduce((a, b) => a + b, 0) / latencies.length,
  }
}
