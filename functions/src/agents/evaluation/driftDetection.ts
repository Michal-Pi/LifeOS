/**
 * Drift Detection System
 *
 * Monitors quality metrics over time to detect degradation.
 * Supports:
 * - Multiple metrics (score, cost, duration, consistency, success rate)
 * - Configurable thresholds per severity level
 * - Automatic alert generation
 * - Recommendations for remediation
 */

import { getFirestore } from 'firebase-admin/firestore'
import type { DriftAlert, DriftAlertId, DriftDetectionConfig, DriftSeverity } from '@lifeos/agents'
import type { AgentId } from '@lifeos/agents'
import { randomUUID } from 'crypto'
import { getWorkflowMetrics } from '../telemetry/runTelemetry.js'
import { getConsistencyStats } from './consistencyCheck.js'
import { getAverageScores } from './llmJudge.js'

// ----- Collection Paths -----

const EVALUATION_COLLECTION = 'evaluation'
const DRIFT_ALERTS_SUBCOLLECTION = 'driftAlerts'
const DRIFT_CONFIG_DOC = 'driftConfig'

function getDriftAlertsPath(userId: string): string {
  return `users/${userId}/${EVALUATION_COLLECTION}/${DRIFT_ALERTS_SUBCOLLECTION}`
}

function getDriftConfigPath(userId: string): string {
  return `users/${userId}/${EVALUATION_COLLECTION}/${DRIFT_CONFIG_DOC}`
}

// ----- Default Configuration -----

const DEFAULT_DRIFT_CONFIG: Omit<DriftDetectionConfig, 'userId' | 'updatedAtMs'> = {
  metrics: [
    {
      metric: 'avg_score',
      enabled: true,
      thresholds: { info: 5, warning: 15, critical: 30 },
    },
    {
      metric: 'cost',
      enabled: true,
      thresholds: { info: 20, warning: 50, critical: 100 },
    },
    {
      metric: 'duration',
      enabled: true,
      thresholds: { info: 25, warning: 50, critical: 100 },
    },
    {
      metric: 'consistency',
      enabled: true,
      thresholds: { info: 10, warning: 25, critical: 50 },
    },
    {
      metric: 'success_rate',
      enabled: true,
      thresholds: { info: 5, warning: 15, critical: 30 },
    },
    {
      metric: 'tokens',
      enabled: false, // Disabled by default - cost covers this
      thresholds: { info: 20, warning: 50, critical: 100 },
    },
  ],
  baselineWindowDays: 30,
  currentWindowDays: 7,
  alertOnInfo: false,
  alertOnWarning: true,
  alertOnCritical: true,
}

// ----- Configuration Management -----

/**
 * Get drift detection configuration
 */
export async function getDriftDetectionConfig(userId: string): Promise<DriftDetectionConfig> {
  const db = getFirestore()
  const doc = await db.doc(getDriftConfigPath(userId)).get()

  if (!doc.exists) {
    // Return default config
    return {
      ...DEFAULT_DRIFT_CONFIG,
      userId,
      updatedAtMs: Date.now(),
    }
  }

  return doc.data() as DriftDetectionConfig
}

/**
 * Update drift detection configuration
 */
export async function updateDriftDetectionConfig(
  userId: string,
  updates: Partial<Omit<DriftDetectionConfig, 'userId' | 'updatedAtMs'>>
): Promise<DriftDetectionConfig> {
  const db = getFirestore()
  const current = await getDriftDetectionConfig(userId)

  const updated: DriftDetectionConfig = {
    ...current,
    ...updates,
    userId,
    updatedAtMs: Date.now(),
  }

  await db.doc(getDriftConfigPath(userId)).set(updated)

  return updated
}

// ----- Alert Management -----

/**
 * Create a drift alert
 */
export async function createDriftAlert(
  userId: string,
  input: {
    workflowType: string
    agentId?: AgentId
    metric: DriftAlert['metric']
    metricDescription?: string
    baseline: number
    baselineWindow: string
    current: number
    currentWindow: string
    absoluteChange: number
    percentChange: number
    direction: 'increase' | 'decrease'
    severity: DriftSeverity
    severityThresholds: DriftAlert['severityThresholds']
    recommendations?: string[]
  }
): Promise<DriftAlert> {
  const db = getFirestore()
  const alertId = randomUUID() as DriftAlertId
  const now = Date.now()

  const alert: DriftAlert = {
    alertId,
    userId,
    workflowType: input.workflowType,
    agentId: input.agentId,
    metric: input.metric,
    metricDescription: input.metricDescription,
    baseline: input.baseline,
    baselineWindow: input.baselineWindow,
    current: input.current,
    currentWindow: input.currentWindow,
    absoluteChange: input.absoluteChange,
    percentChange: input.percentChange,
    direction: input.direction,
    severity: input.severity,
    severityThresholds: input.severityThresholds,
    status: 'active',
    recommendations: input.recommendations,
    createdAtMs: now,
    updatedAtMs: now,
  }

  await db.doc(`${getDriftAlertsPath(userId)}/${alertId}`).set(alert)

  return alert
}

/**
 * Get a drift alert by ID
 */
export async function getDriftAlert(
  userId: string,
  alertId: DriftAlertId
): Promise<DriftAlert | null> {
  const db = getFirestore()
  const doc = await db.doc(`${getDriftAlertsPath(userId)}/${alertId}`).get()

  if (!doc.exists) return null
  return doc.data() as DriftAlert
}

/**
 * List drift alerts with optional filters
 */
export async function listDriftAlerts(
  userId: string,
  filters?: {
    workflowType?: string
    severity?: DriftSeverity
    status?: DriftAlert['status']
    metric?: DriftAlert['metric']
  }
): Promise<DriftAlert[]> {
  const db = getFirestore()
  let query: FirebaseFirestore.Query = db.collection(getDriftAlertsPath(userId))

  if (filters?.workflowType) {
    query = query.where('workflowType', '==', filters.workflowType)
  }

  if (filters?.severity) {
    query = query.where('severity', '==', filters.severity)
  }

  if (filters?.status) {
    query = query.where('status', '==', filters.status)
  }

  if (filters?.metric) {
    query = query.where('metric', '==', filters.metric)
  }

  query = query.orderBy('createdAtMs', 'desc')

  const snapshot = await query.get()
  return snapshot.docs.map((doc) => doc.data() as DriftAlert)
}

/**
 * Acknowledge a drift alert
 */
export async function acknowledgeDriftAlert(
  userId: string,
  alertId: DriftAlertId
): Promise<DriftAlert> {
  const db = getFirestore()
  const alert = await getDriftAlert(userId, alertId)

  if (!alert) {
    throw new Error(`Alert ${alertId} not found`)
  }

  const updates = {
    status: 'acknowledged' as const,
    acknowledgedAtMs: Date.now(),
    updatedAtMs: Date.now(),
  }

  await db.doc(`${getDriftAlertsPath(userId)}/${alertId}`).update(updates)

  return { ...alert, ...updates }
}

/**
 * Resolve a drift alert
 */
export async function resolveDriftAlert(
  userId: string,
  alertId: DriftAlertId,
  resolution: string
): Promise<DriftAlert> {
  const db = getFirestore()
  const alert = await getDriftAlert(userId, alertId)

  if (!alert) {
    throw new Error(`Alert ${alertId} not found`)
  }

  const updates = {
    status: 'resolved' as const,
    resolvedAtMs: Date.now(),
    resolution,
    updatedAtMs: Date.now(),
  }

  await db.doc(`${getDriftAlertsPath(userId)}/${alertId}`).update(updates)

  return { ...alert, ...updates }
}

/**
 * Ignore a drift alert
 */
export async function ignoreDriftAlert(userId: string, alertId: DriftAlertId): Promise<DriftAlert> {
  const db = getFirestore()
  const alert = await getDriftAlert(userId, alertId)

  if (!alert) {
    throw new Error(`Alert ${alertId} not found`)
  }

  const updates = {
    status: 'ignored' as const,
    updatedAtMs: Date.now(),
  }

  await db.doc(`${getDriftAlertsPath(userId)}/${alertId}`).update(updates)

  return { ...alert, ...updates }
}

// ----- Drift Detection -----

/**
 * Determine severity based on percent change and thresholds
 */
function determineSeverity(
  percentChange: number,
  thresholds: { info: number; warning: number; critical: number },
  isNegativeWorst: boolean
): DriftSeverity | null {
  const absChange = Math.abs(percentChange)

  // For metrics where decrease is bad (e.g., success_rate, avg_score)
  // we only care about negative changes
  // For metrics where increase is bad (e.g., cost, duration)
  // we only care about positive changes
  if (isNegativeWorst && percentChange > 0) return null
  if (!isNegativeWorst && percentChange < 0) return null

  if (absChange >= thresholds.critical) return 'critical'
  if (absChange >= thresholds.warning) return 'warning'
  if (absChange >= thresholds.info) return 'info'

  return null
}

/**
 * Generate recommendations based on the metric and severity
 */
function generateRecommendations(
  metric: DriftAlert['metric'],
  severity: DriftSeverity,
  _direction: 'increase' | 'decrease'
): string[] {
  const recommendations: string[] = []

  switch (metric) {
    case 'avg_score':
      recommendations.push('Review recent prompt changes')
      recommendations.push('Check for model API updates')
      if (severity === 'critical') {
        recommendations.push('Consider reverting to previous prompt version')
      }
      break

    case 'cost':
      recommendations.push('Review token usage patterns')
      recommendations.push('Consider model downgrade for some tasks')
      if (severity === 'critical') {
        recommendations.push('Check for runaway loops or excessive retries')
      }
      break

    case 'duration':
      recommendations.push('Check for network latency issues')
      recommendations.push('Review tool call patterns')
      if (severity === 'critical') {
        recommendations.push('Consider adding timeouts or circuit breakers')
      }
      break

    case 'consistency':
      recommendations.push('Review temperature settings')
      recommendations.push('Check for ambiguous prompts')
      if (severity === 'critical') {
        recommendations.push('Consider lowering temperature')
        recommendations.push('Add more specific instructions to prompts')
      }
      break

    case 'success_rate':
      recommendations.push('Review error logs for patterns')
      recommendations.push('Check for API rate limiting')
      if (severity === 'critical') {
        recommendations.push('Enable fallback models')
        recommendations.push('Review tool implementations')
      }
      break

    case 'tokens':
      recommendations.push('Review prompt verbosity')
      recommendations.push('Consider context pruning strategies')
      break
  }

  return recommendations
}

/**
 * Run drift detection for a specific workflow type
 */
export async function detectDrift(userId: string, workflowType: string): Promise<DriftAlert[]> {
  const config = await getDriftDetectionConfig(userId)
  const alerts: DriftAlert[] = []

  // Get baseline and current metrics
  const baselineMetrics = await getWorkflowMetrics(userId, workflowType, config.baselineWindowDays)

  const currentMetrics = await getWorkflowMetrics(userId, workflowType, config.currentWindowDays)

  // Skip if not enough data
  if (baselineMetrics.runCount < 10 || currentMetrics.runCount < 3) {
    return alerts
  }

  // Get consistency stats
  const baselineConsistency = await getConsistencyStats(
    userId,
    workflowType,
    config.baselineWindowDays
  )
  const currentConsistency = await getConsistencyStats(
    userId,
    workflowType,
    config.currentWindowDays
  )

  // Get quality scores
  const baselineScores = await getAverageScores(userId, workflowType, config.baselineWindowDays)
  const currentScores = await getAverageScores(userId, workflowType, config.currentWindowDays)

  // Check each enabled metric
  for (const metricConfig of config.metrics) {
    if (!metricConfig.enabled) continue

    let baseline: number
    let current: number
    let isNegativeWorst: boolean

    switch (metricConfig.metric) {
      case 'avg_score':
        baseline = baselineScores.avgScore
        current = currentScores.avgScore
        isNegativeWorst = true // Decrease is bad
        break

      case 'cost':
        baseline = baselineMetrics.avgCost
        current = currentMetrics.avgCost
        isNegativeWorst = false // Increase is bad
        break

      case 'duration':
        baseline = baselineMetrics.avgDurationMs
        current = currentMetrics.avgDurationMs
        isNegativeWorst = false // Increase is bad
        break

      case 'consistency':
        baseline = baselineConsistency.consistencyRate
        current = currentConsistency.consistencyRate
        isNegativeWorst = true // Decrease is bad
        break

      case 'success_rate':
        baseline = baselineMetrics.successRate
        current = currentMetrics.successRate
        isNegativeWorst = true // Decrease is bad
        break

      case 'tokens':
        baseline = baselineMetrics.avgTokens
        current = currentMetrics.avgTokens
        isNegativeWorst = false // Increase is bad
        break

      default:
        continue
    }

    // Skip if baseline is 0 (can't compute percent change)
    if (baseline === 0) continue

    const absoluteChange = current - baseline
    const percentChange = (absoluteChange / baseline) * 100
    const direction = absoluteChange > 0 ? 'increase' : 'decrease'

    const severity = determineSeverity(percentChange, metricConfig.thresholds, isNegativeWorst)

    // Skip if no alert needed
    if (!severity) continue
    if (severity === 'info' && !config.alertOnInfo) continue
    if (severity === 'warning' && !config.alertOnWarning) continue
    if (severity === 'critical' && !config.alertOnCritical) continue

    // Check for existing active alert for this metric
    const existingAlerts = await listDriftAlerts(userId, {
      workflowType,
      metric: metricConfig.metric,
      status: 'active',
    })

    // Skip if there's already an active alert for this metric
    if (existingAlerts.length > 0) continue

    // Create alert
    const alert = await createDriftAlert(userId, {
      workflowType,
      metric: metricConfig.metric,
      baseline,
      baselineWindow: `last_${config.baselineWindowDays}_days`,
      current,
      currentWindow: `last_${config.currentWindowDays}_days`,
      absoluteChange,
      percentChange,
      direction,
      severity,
      severityThresholds: metricConfig.thresholds,
      recommendations: generateRecommendations(metricConfig.metric, severity, direction),
    })

    alerts.push(alert)
  }

  return alerts
}

/**
 * Run drift detection for all workflow types
 */
export async function detectDriftAllWorkflows(
  userId: string,
  workflowTypes: string[]
): Promise<DriftAlert[]> {
  const allAlerts: DriftAlert[] = []

  for (const workflowType of workflowTypes) {
    const alerts = await detectDrift(userId, workflowType)
    allAlerts.push(...alerts)
  }

  return allAlerts
}

/**
 * Get summary of drift alerts
 */
export async function getDriftAlertsSummary(userId: string): Promise<{
  total: number
  active: number
  bySeverity: Record<DriftSeverity, number>
  byWorkflowType: Record<string, number>
}> {
  const alerts = await listDriftAlerts(userId)

  const summary = {
    total: alerts.length,
    active: 0,
    bySeverity: { info: 0, warning: 0, critical: 0 },
    byWorkflowType: {} as Record<string, number>,
  }

  for (const alert of alerts) {
    if (alert.status === 'active') summary.active++
    summary.bySeverity[alert.severity]++
    summary.byWorkflowType[alert.workflowType] =
      (summary.byWorkflowType[alert.workflowType] || 0) + 1
  }

  return summary
}
