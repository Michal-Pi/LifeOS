/**
 * Drift Response - Self-Healing Automation
 *
 * Automatically responds to detected drift with corrective actions:
 * - Rule-based response system with priorities and cooldowns
 * - Action execution with fallbacks
 * - Effectiveness tracking and learning
 * - Integration with drift detection alerts
 */

import { getFirestore } from 'firebase-admin/firestore'
import { createLogger } from '../../lib/logger.js'

const log = createLogger('DriftResponse')
import { v4 as uuidv4 } from 'uuid'
import type {
  DriftResponseRule,
  DriftResponseRuleId,
  DriftTriggerCondition,
  DriftResponseAction,
  DriftResponseExecution,
  OptimizationEvent,
} from '@lifeos/agents'
import { asId } from '@lifeos/agents'
import type { AgentId, DriftAlertId } from '@lifeos/agents'
import type { DriftAlert } from '@lifeos/agents'

// ----- Collection Paths -----

function getRulesPath(userId: string): string {
  return `users/${userId}/optimization/driftRules`
}

function getExecutionsPath(userId: string): string {
  return `users/${userId}/optimization/driftExecutions`
}

function getOptimizationEventsPath(userId: string): string {
  return `users/${userId}/optimization/events`
}

function getDriftAlertsPath(userId: string): string {
  return `users/${userId}/evaluation/driftAlerts`
}

// ----- Rule CRUD -----

/**
 * Create a drift response rule
 */
export async function createRule(
  userId: string,
  data: Omit<
    DriftResponseRule,
    'ruleId' | 'createdAtMs' | 'updatedAtMs' | 'activationCount' | 'successCount' | 'failureCount'
  >
): Promise<DriftResponseRule> {
  const db = getFirestore()
  const ruleId = `rule_${uuidv4()}` as DriftResponseRuleId
  const now = Date.now()

  const rule: DriftResponseRule = {
    ...data,
    ruleId,
    activationCount: 0,
    successCount: 0,
    failureCount: 0,
    createdAtMs: now,
    updatedAtMs: now,
  }

  await db.doc(`${getRulesPath(userId)}/${ruleId}`).set(rule)

  return rule
}

/**
 * Get a rule by ID
 */
export async function getRule(
  userId: string,
  ruleId: DriftResponseRuleId
): Promise<DriftResponseRule | null> {
  const db = getFirestore()
  const doc = await db.doc(`${getRulesPath(userId)}/${ruleId}`).get()

  if (!doc.exists) {
    return null
  }

  return doc.data() as DriftResponseRule
}

/**
 * List rules
 */
export async function listRules(
  userId: string,
  options: {
    workflowType?: string
    agentId?: AgentId
    activeOnly?: boolean
  } = {}
): Promise<DriftResponseRule[]> {
  const db = getFirestore()
  let query = db.collection(getRulesPath(userId)).orderBy('priority', 'desc')

  if (options.workflowType) {
    query = query.where('workflowType', '==', options.workflowType)
  }

  if (options.agentId) {
    query = query.where('agentId', '==', options.agentId)
  }

  if (options.activeOnly) {
    query = query.where('isActive', '==', true)
  }

  const snapshot = await query.get()
  return snapshot.docs.map((doc) => doc.data() as DriftResponseRule)
}

/**
 * Update a rule
 */
export async function updateRule(
  userId: string,
  ruleId: DriftResponseRuleId,
  updates: Partial<
    Pick<
      DriftResponseRule,
      'name' | 'description' | 'trigger' | 'actions' | 'cooldownMs' | 'isActive' | 'priority'
    >
  >
): Promise<DriftResponseRule | null> {
  const db = getFirestore()
  const docRef = db.doc(`${getRulesPath(userId)}/${ruleId}`)
  const doc = await docRef.get()

  if (!doc.exists) {
    return null
  }

  const updateData = {
    ...updates,
    updatedAtMs: Date.now(),
  }

  await docRef.update(updateData)

  const updated = await docRef.get()
  return updated.data() as DriftResponseRule
}

/**
 * Delete a rule
 */
export async function deleteRule(userId: string, ruleId: DriftResponseRuleId): Promise<boolean> {
  const db = getFirestore()
  const docRef = db.doc(`${getRulesPath(userId)}/${ruleId}`)
  const doc = await docRef.get()

  if (!doc.exists) {
    return false
  }

  await docRef.delete()
  return true
}

// ----- Default Rules -----

/**
 * Get default drift response rules for a workflow type
 */
export function getDefaultRules(
  workflowType: string
): Omit<
  DriftResponseRule,
  | 'ruleId'
  | 'userId'
  | 'createdAtMs'
  | 'updatedAtMs'
  | 'activationCount'
  | 'successCount'
  | 'failureCount'
>[] {
  const commonRules: Omit<
    DriftResponseRule,
    | 'ruleId'
    | 'userId'
    | 'createdAtMs'
    | 'updatedAtMs'
    | 'activationCount'
    | 'successCount'
    | 'failureCount'
  >[] = [
    // Critical quality degradation → notify user + switch model
    {
      name: 'Critical Quality Drop',
      description: 'Responds to critical quality degradation by switching models',
      workflowType,
      trigger: {
        metric: 'avg_score',
        direction: 'decrease',
        severity: 'critical',
      },
      actions: [
        {
          actionType: 'notify_user',
          params: {
            message: 'Critical quality degradation detected. Switching to backup model.',
            severity: 'high',
          },
        },
        {
          actionType: 'switch_model',
          params: {
            targetModel: 'claude-sonnet-4-5',
            reason: 'quality_degradation',
          },
          fallbackAction: {
            actionType: 'rollback_prompt',
            params: {},
          },
        },
      ],
      cooldownMs: 60 * 60 * 1000, // 1 hour
      isActive: true,
      priority: 100,
    },

    // Warning-level consistency issues → decrease temperature
    {
      name: 'High Output Variance',
      description: 'Reduces temperature when output consistency drops',
      workflowType,
      trigger: {
        metric: 'consistency',
        direction: 'decrease',
        severity: 'warning',
      },
      actions: [
        {
          actionType: 'decrease_temperature',
          params: {
            delta: -0.2,
            minTemperature: 0.1,
          },
        },
      ],
      cooldownMs: 30 * 60 * 1000, // 30 minutes
      isActive: true,
      priority: 50,
    },

    // Critical success rate drop → add retry + notify
    {
      name: 'High Failure Rate',
      description: 'Responds to high failure rates with increased retries',
      workflowType,
      trigger: {
        metric: 'success_rate',
        direction: 'decrease',
        severity: 'critical',
      },
      actions: [
        {
          actionType: 'notify_user',
          params: {
            message: 'High failure rate detected. Increasing retry attempts.',
            severity: 'medium',
          },
        },
        {
          actionType: 'custom',
          params: {
            action: 'increase_retries',
            maxRetries: 5,
          },
        },
      ],
      cooldownMs: 15 * 60 * 1000, // 15 minutes
      isActive: true,
      priority: 90,
    },

    // Cost increase warning → switch to cheaper model
    {
      name: 'Cost Increase',
      description: 'Switches to a more cost-effective model when costs increase',
      workflowType,
      trigger: {
        metric: 'cost',
        direction: 'increase',
        severity: 'warning',
        threshold: 0.5, // 50% increase
      },
      actions: [
        {
          actionType: 'switch_model',
          params: {
            targetModel: 'gpt-5-mini',
            reason: 'cost_reduction',
          },
        },
      ],
      cooldownMs: 2 * 60 * 60 * 1000, // 2 hours
      isActive: true,
      priority: 30,
    },
  ]

  return commonRules
}

/**
 * Initialize default rules for a user's workflow type
 */
export async function initializeDefaultRules(
  userId: string,
  workflowType: string
): Promise<DriftResponseRule[]> {
  const defaults = getDefaultRules(workflowType)
  const created: DriftResponseRule[] = []

  for (const ruleData of defaults) {
    const rule = await createRule(userId, {
      ...ruleData,
      userId,
    })
    created.push(rule)
  }

  return created
}

// ----- Rule Matching -----

/**
 * Check if a rule's trigger matches an alert
 */
function triggerMatches(trigger: DriftTriggerCondition, alert: DriftAlert): boolean {
  // Check metric
  if (trigger.metric !== alert.metric) {
    return false
  }

  // Check direction
  if (trigger.direction !== 'any') {
    const isIncrease = alert.current > alert.baseline
    if (trigger.direction === 'increase' && !isIncrease) return false
    if (trigger.direction === 'decrease' && isIncrease) return false
  }

  // Check severity
  if (trigger.severity !== 'any' && trigger.severity !== alert.severity) {
    return false
  }

  // Check threshold if specified
  if (trigger.threshold !== undefined) {
    const changePercent = Math.abs((alert.current - alert.baseline) / alert.baseline)
    if (changePercent < trigger.threshold) {
      return false
    }
  }

  return true
}

/**
 * Find matching rules for an alert, respecting cooldowns
 */
export async function findMatchingRules(
  userId: string,
  alert: DriftAlert
): Promise<DriftResponseRule[]> {
  const rules = await listRules(userId, {
    workflowType: alert.workflowType,
    activeOnly: true,
  })

  const now = Date.now()
  const matchingRules: DriftResponseRule[] = []

  for (const rule of rules) {
    // Check if trigger matches
    if (!triggerMatches(rule.trigger, alert)) {
      continue
    }

    // Check cooldown
    if (rule.lastActivatedAtMs) {
      const timeSinceLastActivation = now - rule.lastActivatedAtMs
      if (timeSinceLastActivation < rule.cooldownMs) {
        continue // Still in cooldown
      }
    }

    // Check agent scope if specified
    if (rule.agentId && alert.agentId && rule.agentId !== alert.agentId) {
      continue
    }

    matchingRules.push(rule)
  }

  // Sort by priority (higher first)
  matchingRules.sort((a, b) => b.priority - a.priority)

  return matchingRules
}

// ----- Action Execution -----

/**
 * Execute a single action
 */
async function executeAction(
  userId: string,
  action: DriftResponseAction,
  context: {
    alert: DriftAlert
    workflowType: string
    agentId?: AgentId
  }
): Promise<{ success: boolean; errorMessage?: string; durationMs: number }> {
  const startMs = Date.now()

  try {
    switch (action.actionType) {
      case 'notify_user':
        await executeNotifyUser(userId, action.params as { message: string; severity: string })
        break

      case 'increase_temperature':
        await executeTemperatureChange(
          userId,
          context.agentId,
          action.params as { delta: number; maxTemperature?: number }
        )
        break

      case 'decrease_temperature':
        await executeTemperatureChange(userId, context.agentId, {
          delta: -(action.params as { delta: number }).delta,
          minTemperature: (action.params as { minTemperature?: number }).minTemperature,
        })
        break

      case 'switch_model':
        await executeSwitchModel(
          userId,
          context.agentId,
          action.params as { targetModel: string; reason: string }
        )
        break

      case 'switch_variant':
        await executeSwitchVariant(userId, context.agentId, action.params as { variantId: string })
        break

      case 'rollback_prompt':
        await executeRollbackPrompt(userId, context.agentId)
        break

      case 'disable_agent':
        await executeDisableAgent(userId, context.agentId)
        break

      case 'run_diagnostic':
        await executeRunDiagnostic(userId, context.workflowType, context.agentId)
        break

      case 'custom':
        await executeCustomAction(userId, action.params, context)
        break

      default:
        throw new Error(`Unknown action type: ${action.actionType}`)
    }

    return {
      success: true,
      durationMs: Date.now() - startMs,
    }
  } catch (error) {
    return {
      success: false,
      errorMessage: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - startMs,
    }
  }
}

/**
 * Execute notify user action
 */
async function executeNotifyUser(
  userId: string,
  params: { message: string; severity: string }
): Promise<void> {
  const db = getFirestore()

  // Create a notification document
  await db.collection(`users/${userId}/notifications`).add({
    type: 'drift_alert',
    message: params.message,
    severity: params.severity,
    read: false,
    createdAtMs: Date.now(),
  })
}

/**
 * Execute temperature change action
 */
async function executeTemperatureChange(
  userId: string,
  agentId: AgentId | undefined,
  params: { delta: number; minTemperature?: number; maxTemperature?: number }
): Promise<void> {
  if (!agentId) {
    throw new Error('Agent ID required for temperature change')
  }

  const db = getFirestore()
  const agentRef = db.doc(`users/${userId}/agents/${agentId}`)
  const agentDoc = await agentRef.get()

  if (!agentDoc.exists) {
    throw new Error(`Agent ${agentId} not found`)
  }

  const agent = agentDoc.data()
  const currentTemp = agent?.temperature ?? 0.7
  let newTemp = currentTemp + params.delta

  // Apply bounds
  if (params.minTemperature !== undefined) {
    newTemp = Math.max(newTemp, params.minTemperature)
  }
  if (params.maxTemperature !== undefined) {
    newTemp = Math.min(newTemp, params.maxTemperature)
  }
  newTemp = Math.max(0, Math.min(2, newTemp)) // Absolute bounds

  await agentRef.update({
    temperature: newTemp,
    updatedAtMs: Date.now(),
    lastModifiedBy: 'drift_response',
  })
}

/**
 * Execute switch model action
 */
async function executeSwitchModel(
  userId: string,
  agentId: AgentId | undefined,
  params: { targetModel: string; reason: string }
): Promise<void> {
  if (!agentId) {
    throw new Error('Agent ID required for model switch')
  }

  const db = getFirestore()
  const agentRef = db.doc(`users/${userId}/agents/${agentId}`)
  const agentDoc = await agentRef.get()

  if (!agentDoc.exists) {
    throw new Error(`Agent ${agentId} not found`)
  }

  const agent = agentDoc.data()
  const previousModel = agent?.modelId

  await agentRef.update({
    modelId: params.targetModel,
    previousModelId: previousModel,
    modelSwitchReason: params.reason,
    modelSwitchedAtMs: Date.now(),
    updatedAtMs: Date.now(),
    lastModifiedBy: 'drift_response',
  })
}

/**
 * Execute switch variant action
 */
async function executeSwitchVariant(
  userId: string,
  agentId: AgentId | undefined,
  params: { variantId: string }
): Promise<void> {
  if (!agentId) {
    throw new Error('Agent ID required for variant switch')
  }

  const db = getFirestore()
  const agentRef = db.doc(`users/${userId}/agents/${agentId}`)
  const agentDoc = await agentRef.get()

  if (!agentDoc.exists) {
    throw new Error(`Agent ${agentId} not found`)
  }

  await agentRef.update({
    activeVariantId: params.variantId,
    updatedAtMs: Date.now(),
    lastModifiedBy: 'drift_response',
  })
}

/**
 * Execute rollback prompt action
 */
async function executeRollbackPrompt(userId: string, agentId: AgentId | undefined): Promise<void> {
  if (!agentId) {
    throw new Error('Agent ID required for prompt rollback')
  }

  const db = getFirestore()

  // Find the previous active prompt version
  const versionsSnapshot = await db
    .collection(`users/${userId}/optimization/promptVersions`)
    .where('agentId', '==', agentId)
    .where('isActive', '==', false)
    .orderBy('deprecatedAtMs', 'desc')
    .limit(1)
    .get()

  if (versionsSnapshot.empty) {
    throw new Error('No previous prompt version to rollback to')
  }

  const previousVersion = versionsSnapshot.docs[0].data()

  // Deactivate current version
  const currentSnapshot = await db
    .collection(`users/${userId}/optimization/promptVersions`)
    .where('agentId', '==', agentId)
    .where('isActive', '==', true)
    .limit(1)
    .get()

  if (!currentSnapshot.empty) {
    await currentSnapshot.docs[0].ref.update({
      isActive: false,
      deprecatedAtMs: Date.now(),
      deprecationReason: 'rollback_due_to_drift',
    })
  }

  // Reactivate previous version
  await versionsSnapshot.docs[0].ref.update({
    isActive: true,
    promotedAtMs: Date.now(),
    promotionReason: 'rollback',
  })

  // Update agent with previous prompt
  const agentRef = db.doc(`users/${userId}/agents/${agentId}`)
  await agentRef.update({
    promptTemplate: previousVersion.promptTemplate,
    systemPrompt: previousVersion.systemPrompt,
    updatedAtMs: Date.now(),
    lastModifiedBy: 'drift_response',
  })
}

/**
 * Execute disable agent action
 */
async function executeDisableAgent(userId: string, agentId: AgentId | undefined): Promise<void> {
  if (!agentId) {
    throw new Error('Agent ID required to disable agent')
  }

  const db = getFirestore()
  const agentRef = db.doc(`users/${userId}/agents/${agentId}`)

  await agentRef.update({
    isEnabled: false,
    disabledReason: 'drift_response',
    disabledAtMs: Date.now(),
    updatedAtMs: Date.now(),
    lastModifiedBy: 'drift_response',
  })
}

/**
 * Execute run diagnostic action
 */
async function executeRunDiagnostic(
  userId: string,
  workflowType: string,
  agentId?: AgentId
): Promise<void> {
  const db = getFirestore()

  // Create a diagnostic request
  await db.collection(`users/${userId}/diagnostics/requests`).add({
    workflowType,
    agentId,
    status: 'pending',
    requestedBy: 'drift_response',
    createdAtMs: Date.now(),
  })
}

/**
 * Execute custom action
 */
async function executeCustomAction(
  userId: string,
  params: Record<string, unknown>,
  context: { alert: DriftAlert; workflowType: string; agentId?: AgentId }
): Promise<void> {
  const action = params.action as string

  switch (action) {
    case 'increase_retries': {
      if (!context.agentId) break
      const db = getFirestore()
      const agentRef = db.doc(`users/${userId}/agents/${context.agentId}`)
      await agentRef.update({
        maxRetries: params.maxRetries || 3,
        updatedAtMs: Date.now(),
        lastModifiedBy: 'drift_response',
      })
      break
    }

    default:
      log.warn('Unknown custom action', { action })
  }
}

// ----- Response Execution -----

/**
 * Execute a drift response rule
 */
export async function executeRule(
  userId: string,
  rule: DriftResponseRule,
  alert: DriftAlert
): Promise<DriftResponseExecution> {
  const db = getFirestore()
  const executionId = `exec_${uuidv4()}`
  const now = Date.now()

  const actionsExecuted: DriftResponseExecution['actionsExecuted'] = []
  let overallSuccess = true
  let errorMessage: string | undefined

  // Execute each action in sequence
  for (const action of rule.actions) {
    const result = await executeAction(userId, action, {
      alert,
      workflowType: rule.workflowType,
      agentId: rule.agentId,
    })

    actionsExecuted.push({
      actionType: action.actionType,
      params: action.params,
      success: result.success,
      errorMessage: result.errorMessage,
      durationMs: result.durationMs,
    })

    if (!result.success) {
      overallSuccess = false
      errorMessage = result.errorMessage

      // Try fallback if available
      if (action.fallbackAction) {
        const fallbackResult = await executeAction(userId, action.fallbackAction, {
          alert,
          workflowType: rule.workflowType,
          agentId: rule.agentId,
        })

        actionsExecuted.push({
          actionType: `fallback:${action.fallbackAction.actionType}`,
          params: action.fallbackAction.params,
          success: fallbackResult.success,
          errorMessage: fallbackResult.errorMessage,
          durationMs: fallbackResult.durationMs,
        })

        if (fallbackResult.success) {
          overallSuccess = true
          errorMessage = undefined
        }
      }
    }
  }

  // Create execution record
  const execution: DriftResponseExecution = {
    executionId,
    ruleId: rule.ruleId,
    alertId: alert.alertId as DriftAlertId,
    userId,
    triggerMetric: alert.metric,
    triggerValue: alert.current,
    triggerThreshold: alert.baseline,
    actionsExecuted,
    overallSuccess,
    errorMessage,
    metricBefore: alert.current,
    executedAtMs: now,
  }

  await db.doc(`${getExecutionsPath(userId)}/${executionId}`).set(execution)

  // Update rule stats
  const ruleRef = db.doc(`${getRulesPath(userId)}/${rule.ruleId}`)
  await ruleRef.update({
    activationCount: rule.activationCount + 1,
    lastActivatedAtMs: now,
    successCount: overallSuccess ? rule.successCount + 1 : rule.successCount,
    failureCount: overallSuccess ? rule.failureCount : rule.failureCount + 1,
    updatedAtMs: now,
  })

  // Mark alert as responded
  const alertRef = db.doc(`${getDriftAlertsPath(userId)}/${alert.alertId}`)
  await alertRef.update({
    status: 'acknowledged',
    acknowledgedAtMs: now,
    respondedWithRuleId: rule.ruleId,
  })

  // Log optimization event
  await logOptimizationEvent(userId, {
    eventType: 'drift_response_triggered',
    description: `Executed drift response rule: ${rule.name}`,
    workflowType: rule.workflowType,
    agentId: rule.agentId,
    details: {
      ruleId: rule.ruleId,
      alertId: alert.alertId,
      actionsExecuted: actionsExecuted.length,
      overallSuccess,
    },
    triggeredBy: 'drift_detection',
    sourceId: alert.alertId,
  })

  return execution
}

/**
 * Process pending drift alerts and execute matching rules
 */
export async function processPendingAlerts(userId: string): Promise<{
  processed: number
  executed: number
  errors: number
}> {
  const db = getFirestore()

  // Find pending alerts
  const alertsSnapshot = await db
    .collection(getDriftAlertsPath(userId))
    .where('status', '==', 'active')
    .orderBy('detectedAtMs', 'asc')
    .limit(10)
    .get()

  let processed = 0
  let executed = 0
  let errors = 0

  for (const alertDoc of alertsSnapshot.docs) {
    const alert = alertDoc.data() as DriftAlert
    processed++

    try {
      // Find matching rules
      const matchingRules = await findMatchingRules(userId, alert)

      if (matchingRules.length === 0) {
        // No matching rules, mark as acknowledged without action
        await alertDoc.ref.update({
          status: 'acknowledged',
          acknowledgedAtMs: Date.now(),
          noMatchingRules: true,
        })
        continue
      }

      // Execute highest priority matching rule
      const topRule = matchingRules[0]
      await executeRule(userId, topRule, alert)
      executed++
    } catch (error) {
      errors++
      log.error('Error processing alert', error, { alertId: alert.alertId })

      // Mark alert as error
      await alertDoc.ref.update({
        status: 'error',
        errorMessage: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return { processed, executed, errors }
}

// ----- Effectiveness Tracking -----

/**
 * Update execution with post-action metric
 */
export async function updateExecutionEffectiveness(
  userId: string,
  executionId: string,
  metricAfter: number
): Promise<void> {
  const db = getFirestore()
  const executionRef = db.doc(`${getExecutionsPath(userId)}/${executionId}`)
  const executionDoc = await executionRef.get()

  if (!executionDoc.exists) {
    return
  }

  const execution = executionDoc.data() as DriftResponseExecution
  const metricBefore = execution.metricBefore

  // Determine if the response was effective
  // For quality/success metrics, we want increase
  // For cost/duration metrics, we want decrease
  const isImprovementMetric = ['avg_score', 'success_rate', 'consistency'].includes(
    execution.triggerMetric
  )

  const wasEffective = isImprovementMetric ? metricAfter > metricBefore : metricAfter < metricBefore

  await executionRef.update({
    metricAfter,
    wasEffective,
  })
}

/**
 * Get rule effectiveness stats
 */
export async function getRuleEffectiveness(
  userId: string,
  ruleId: DriftResponseRuleId
): Promise<{
  totalExecutions: number
  successfulExecutions: number
  effectiveExecutions: number
  avgEffectiveness: number
}> {
  const db = getFirestore()

  const executionsSnapshot = await db
    .collection(getExecutionsPath(userId))
    .where('ruleId', '==', ruleId)
    .orderBy('executedAtMs', 'desc')
    .limit(100)
    .get()

  const executions = executionsSnapshot.docs.map((doc) => doc.data() as DriftResponseExecution)

  const totalExecutions = executions.length
  const successfulExecutions = executions.filter((e) => e.overallSuccess).length
  const effectiveExecutions = executions.filter((e) => e.wasEffective === true).length

  // Calculate average effectiveness (improvement in metric)
  const executionsWithMetrics = executions.filter(
    (e) => e.metricAfter !== undefined && e.metricBefore !== undefined
  )

  const avgEffectiveness =
    executionsWithMetrics.length > 0
      ? executionsWithMetrics.reduce((sum, e) => {
          const change = ((e.metricAfter! - e.metricBefore) / e.metricBefore) * 100
          return sum + change
        }, 0) / executionsWithMetrics.length
      : 0

  return {
    totalExecutions,
    successfulExecutions,
    effectiveExecutions,
    avgEffectiveness,
  }
}

/**
 * Get overall drift response summary
 */
export async function getDriftResponseSummary(
  userId: string,
  options: { workflowType?: string; lookbackDays?: number } = {}
): Promise<{
  activeRules: number
  totalAlerts: number
  respondedAlerts: number
  avgResponseTimeMs: number
  overallEffectiveness: number
}> {
  const db = getFirestore()
  const { workflowType, lookbackDays = 7 } = options
  const cutoffMs = Date.now() - lookbackDays * 24 * 60 * 60 * 1000

  // Count active rules
  const rulesQuery = workflowType
    ? db
        .collection(getRulesPath(userId))
        .where('isActive', '==', true)
        .where('workflowType', '==', workflowType)
    : db.collection(getRulesPath(userId)).where('isActive', '==', true)

  const rulesSnapshot = await rulesQuery.get()
  const activeRules = rulesSnapshot.size

  // Get recent alerts
  let alertsQuery = db.collection(getDriftAlertsPath(userId)).where('detectedAtMs', '>=', cutoffMs)

  if (workflowType) {
    alertsQuery = alertsQuery.where('workflowType', '==', workflowType)
  }

  const alertsSnapshot = await alertsQuery.get()
  const totalAlerts = alertsSnapshot.size
  const respondedAlerts = alertsSnapshot.docs.filter(
    (doc) => doc.data().status === 'acknowledged'
  ).length

  // Get recent executions
  const executionsSnapshot = await db
    .collection(getExecutionsPath(userId))
    .where('executedAtMs', '>=', cutoffMs)
    .get()

  const executions = executionsSnapshot.docs.map((doc) => doc.data() as DriftResponseExecution)

  // Calculate average response time
  const avgResponseTimeMs =
    executions.length > 0
      ? executions.reduce((sum, e) => {
          const totalDuration = e.actionsExecuted.reduce(
            (s: number, a: { durationMs: number }) => s + a.durationMs,
            0
          )
          return sum + totalDuration
        }, 0) / executions.length
      : 0

  // Calculate overall effectiveness
  const effectiveExecutions = executions.filter((e) => e.wasEffective === true).length
  const executionsWithOutcome = executions.filter((e) => e.wasEffective !== undefined).length
  const overallEffectiveness =
    executionsWithOutcome > 0 ? effectiveExecutions / executionsWithOutcome : 0

  return {
    activeRules,
    totalAlerts,
    respondedAlerts,
    avgResponseTimeMs,
    overallEffectiveness,
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
