/**
 * Run Executor
 *
 * Cloud Function trigger that executes agent runs when they are created.
 * Supports both single-agent execution and multi-agent workflows.
 */

import { executeExpertCouncilUsecase } from '@lifeos/agents'
import type {
  DeepResearchRequest,
  ExecutionMode,
  ModelProvider,
  Run,
  RunId,
  Workflow,
  WorkflowId,
  WorkflowState,
} from '@lifeos/agents'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore'

import { createLogger } from '../lib/logger.js'
import { wrapError } from './errorHandler.js'
import {
  buildExpertCouncilContextHash,
  createExpertCouncilPipeline,
  createExpertCouncilRepository,
} from './expertCouncil.js'
import { buildConversationContext } from './messageStore.js'
import { loadProviderKeys, loadSearchToolKeys } from './providerKeys.js'
import {
  checkQuotaSoft,
  updateQuota,
  shouldSendQuotaAlert,
  updateDailyCostQuota,
  updateDailyTokenQuota,
  updateDailyRunQuota,
} from './quotaManager.js'
import {
  checkRunRateLimitSoft,
  recordRunUsage,
  updateDailyCostLimit,
  updateRunsPerHourLimit,
  updateDailyTokenRateLimit,
} from './rateLimiter.js'
import { createRunEventWriter } from './runEvents.js'
import { loadToolRegistryForUser } from './toolExecutor.js'
import { evaluateRunOutput } from './evaluation.js'
import { executeWorkflow } from './workflowExecutor.js'
import { sanitizeForFirestore } from './langgraph/firestoreSanitizer.js'

const log = createLogger('RunExecutor')

type MemorySettings = {
  memoryMessageLimit?: number
}

function extractOracleResumeState(
  workflowState: Run['workflowState']
): Record<string, unknown> | undefined {
  if (!workflowState || typeof workflowState !== 'object') return undefined

  const stateRecord = workflowState as Record<string, unknown>
  const nestedResumeState = stateRecord.oracleResumeState
  if (nestedResumeState && typeof nestedResumeState === 'object') {
    return nestedResumeState as Record<string, unknown>
  }

  // Backward compatibility for runs persisted before the nested resume snapshot.
  if (
    Array.isArray(stateRecord.scenarioPortfolio) ||
    Array.isArray(stateRecord.phaseSummaries) ||
    Array.isArray(stateRecord.gateResults)
  ) {
    return stateRecord
  }

  return undefined
}

function extractNestedResumeState(
  workflowState: Run['workflowState'],
  key: string
): Record<string, unknown> | undefined {
  if (!workflowState || typeof workflowState !== 'object') return undefined

  const stateRecord = workflowState as Record<string, unknown>
  const nestedResumeState = stateRecord[key]
  if (nestedResumeState && typeof nestedResumeState === 'object') {
    return nestedResumeState as Record<string, unknown>
  }

  return undefined
}

function extractGenericResumeState(
  workflowState: Run['workflowState'],
  pendingInput?: Run['pendingInput'],
  constraintPause?: Run['constraintPause']
): Record<string, unknown> | undefined {
  if (!workflowState || typeof workflowState !== 'object') return undefined

  const stateRecord = workflowState as Record<string, unknown>
  const pendingNodes = Array.isArray(stateRecord.pendingNodes)
    ? (stateRecord.pendingNodes as unknown[])
    : []
  const nextNodeId =
    typeof pendingNodes[0] === 'string' ? (pendingNodes[0] as string) : (null as string | null)

  return {
    ...stateRecord,
    nextNodeId,
    pendingInput: pendingInput ?? null,
    constraintPause: constraintPause ?? null,
  }
}

// Function configuration — dialectical workflows can run 20+ minutes across multiple cycles
const FUNCTION_CONFIG = {
  timeoutSeconds: 1800,
  memory: '1GiB' as const,
}

const MIN_QUEUE_RETRY_MS = 60 * 1000
const MAX_QUEUE_RETRY_MS = 15 * 60 * 1000
const QUEUED_RUN_BATCH_SIZE = 25

function computeQueueRetryDelayMs(resetInMs?: number): number {
  if (typeof resetInMs !== 'number' || Number.isNaN(resetInMs)) {
    return MIN_QUEUE_RETRY_MS
  }

  return Math.min(MAX_QUEUE_RETRY_MS, Math.max(MIN_QUEUE_RETRY_MS, resetInMs))
}

async function queueRunForCapacity(params: {
  run: Run
  runRef: FirebaseFirestore.DocumentReference
  eventWriter: ReturnType<typeof createRunEventWriter>
  workflowId: string
  reason:
    | 'quota_tokens'
    | 'quota_cost'
    | 'quota_runs'
    | 'rate_runs_per_hour'
    | 'rate_tokens_per_day'
    | 'rate_cost_per_day'
    | 'rate_provider'
  currentValue: number
  limitValue: number
  unit: string
  resetInMs?: number
}): Promise<void> {
  const {
    run,
    runRef,
    eventWriter,
    workflowId,
    reason,
    currentValue,
    limitValue,
    unit,
    resetInMs,
  } = params
  const now = Date.now()
  const retryCount = (run.queueInfo?.retryCount ?? 0) + 1
  const nextRetryAtMs = now + computeQueueRetryDelayMs(resetInMs)

  await runRef.update({
    status: 'queued',
    pendingInput: null,
    queueInfo: {
      reason,
      queuedAtMs: now,
      nextRetryAtMs,
      retryCount,
    },
    constraintPause: {
      constraintType: reason,
      currentValue,
      limitValue,
      unit,
    },
    completedAtMs: FieldValue.delete(),
    error: FieldValue.delete(),
    errorCategory: FieldValue.delete(),
    errorDetails: FieldValue.delete(),
    quotaExceeded: FieldValue.delete(),
  })

  await eventWriter.writeEvent({
    type: 'status',
    workflowId,
    status: 'queued',
    details: {
      reason,
      currentValue,
      limitValue,
      unit,
      retryCount,
      nextRetryAtMs,
    },
  })
}

export async function promoteQueuedRuns(
  limitCount: number = QUEUED_RUN_BATCH_SIZE
): Promise<number> {
  const db = getFirestore()
  const now = Date.now()
  const snapshot = await db
    .collectionGroup('runs')
    .where('status', '==', 'queued')
    .where('queueInfo.nextRetryAtMs', '<=', now)
    .limit(limitCount)
    .get()

  let promoted = 0

  for (const doc of snapshot.docs) {
    await db.runTransaction(async (txn) => {
      const fresh = await txn.get(doc.ref)
      if (!fresh.exists) return

      const run = fresh.data() as Run
      if (run.status !== 'queued') return
      if (run.queueInfo?.nextRetryAtMs && run.queueInfo.nextRetryAtMs > Date.now()) return

      txn.update(doc.ref, {
        status: 'pending',
        queueInfo: FieldValue.delete(),
        constraintPause: FieldValue.delete(),
        pendingInput: null,
      })
      promoted += 1
    })
  }

  if (promoted > 0) {
    log.info(`Promoted ${promoted} queued runs back to pending`)
  }

  return promoted
}

/**
 * Firestore trigger that executes when a new run is created
 *
 * Document path: users/{userId}/workflows/{workflowId}/runs/{runId}
 * Triggers when: A new run document is created with status 'pending'
 */
export const onRunCreated = onDocumentCreated(
  {
    ...FUNCTION_CONFIG,
    document: 'users/{userId}/workflows/{workflowId}/runs/{runId}',
  },
  async (event) => {
    const snapshot = event.data
    if (!snapshot) {
      log.error('No snapshot data available')
      return
    }

    const run = snapshot.data() as Run
    const { userId, workflowId, runId } = event.params

    log.info(`Processing run ${runId} for user ${userId} in workflow ${workflowId}`)
    log.info(`Run status: ${run.status}, Goal: ${run.goal.substring(0, 50)}...`)

    // Only process pending runs
    if (run.status !== 'pending') {
      log.info(`Run ${runId} is not pending (status: ${run.status}), skipping`)
      return
    }

    log.info(`Starting execution for run ${runId}`)

    try {
      await executeRun({
        run,
        userId,
        workflowId,
        runId,
      })
      log.info(`Execution completed for run ${runId}`)
    } catch (error) {
      log.error(`Execution failed for run ${runId}`, error)
      throw error
    }
  }
)

/**
 * Firestore trigger that resumes runs waiting for user input.
 *
 * Document path: users/{userId}/workflows/{workflowId}/runs/{runId}
 * Triggers when: status changes from waiting_for_input -> pending
 */
export const onRunUpdated = onDocumentUpdated(
  {
    ...FUNCTION_CONFIG,
    document: 'users/{userId}/workflows/{workflowId}/runs/{runId}',
  },
  async (event) => {
    const snapshot = event.data
    if (!snapshot?.before || !snapshot.after) {
      return
    }

    const before = snapshot.before.data() as Run
    const after = snapshot.after.data() as Run
    const { userId, workflowId, runId } = event.params

    const resumableStatuses = new Set<Run['status']>(['waiting_for_input', 'paused', 'queued'])
    const resumableFailure =
      before.status === 'failed' &&
      (before.quotaExceeded === true || before.errorCategory === 'rate_limit')

    if (
      (!resumableStatuses.has(before.status) && !resumableFailure) ||
      after.status !== 'pending'
    ) {
      return
    }

    log.info(`Resuming run ${runId} for user ${userId}`)
    await executeRun({
      run: after,
      userId,
      workflowId,
      runId,
    })
  }
)

async function executeRun(params: {
  run: Run
  userId: string
  workflowId: string
  runId: string
}): Promise<void> {
  const { run, userId, workflowId, runId } = params
  log.info(`Starting execution for run ${runId}`)

  const db = getFirestore()
  const runRef = db.doc(`users/${userId}/workflows/${workflowId}/runs/${runId}`)

  try {
    log.info(`Creating event writer for run ${runId}`)
    const eventWriter = createRunEventWriter({ userId, runId, workflowId })

    // Phase 5E: Soft-check rate limits and quotas — pause instead of failing
    const constraintOverride = (run.context as Record<string, unknown> | undefined)
      ?.constraintOverride as { type: string; newLimit?: number } | undefined

    // If resuming with a quota/rate override, apply the new limit first
    if (constraintOverride?.newLimit) {
      await applyConstraintOverride(userId, constraintOverride.type, constraintOverride.newLimit)
    }

    log.info(`Checking rate limits for user ${userId}`)
    const rateExceeded = await checkRunRateLimitSoft(userId)
    if (rateExceeded) {
      log.info(`Rate limit exceeded for user ${userId}, queueing run ${runId}`, rateExceeded)
      await queueRunForCapacity({
        run,
        runRef,
        eventWriter,
        workflowId,
        reason: rateExceeded.limitType,
        currentValue: rateExceeded.currentValue,
        limitValue: rateExceeded.limitValue,
        unit: rateExceeded.unit,
        resetInMs: rateExceeded.resetInMs,
      })
      return
    }

    log.info(`Checking quota for user ${userId}`)
    const quotaExceeded = await checkQuotaSoft(userId)
    if (quotaExceeded) {
      log.info(`Quota exceeded for user ${userId}, queueing run ${runId}`, quotaExceeded)
      await queueRunForCapacity({
        run,
        runRef,
        eventWriter,
        workflowId,
        reason: quotaExceeded.quotaType,
        currentValue: quotaExceeded.currentValue,
        limitValue: quotaExceeded.limitValue,
        unit: quotaExceeded.unit,
        resetInMs: quotaExceeded.resetInMs,
      })
      return
    }

    // Update status to running (transactional to prevent duplicate execution)
    log.info(`Updating run ${runId} status to 'running'`)
    let claimedByUs = false
    await db.runTransaction(async (txn) => {
      const snap = await txn.get(runRef)
      const currentStatus = snap.data()?.status
      if (currentStatus !== 'pending') {
        // Another instance already claimed this run — not an error, just a race.
        log.info(
          `Run ${runId} already claimed by another instance (status: ${currentStatus}), yielding`
        )
        claimedByUs = false
        return
      }
      claimedByUs = true
      txn.update(runRef, {
        status: 'running',
        currentStep: run.currentStep ?? 0,
        pendingInput: null,
      })
    })

    if (!claimedByUs) {
      log.info(`Run ${runId} is being handled by another instance, exiting gracefully`)
      return
    }

    log.info(`Writing 'running' status event for run ${runId}`)
    await eventWriter.writeEvent({
      type: 'status',
      workflowId,
      status: 'running',
    })

    // Load workflow configuration
    log.info(`Loading workflow ${workflowId}`)
    const workflowDoc = await db.doc(`users/${userId}/workflows/${workflowId}`).get()
    if (!workflowDoc.exists) {
      throw new Error(`Workflow ${workflowId} not found`)
    }
    const workflow = workflowDoc.data() as Workflow
    log.info(`Workflow loaded: ${workflow.name}, type: ${workflow.workflowType}`)

    log.info(`Loading provider keys for user ${userId}`)
    const providerKeys = await loadProviderKeys(userId)
    log.info(
      `Provider keys loaded. Available: ${Object.keys(providerKeys)
        .filter((k) => providerKeys[k as keyof typeof providerKeys])
        .join(', ')}`
    )

    log.info(`Loading memory settings for user ${userId}`)
    const memorySettings = await loadMemorySettings(userId)

    log.info(`Loading tool registry for user ${userId}`)
    const toolRegistry = await loadToolRegistryForUser(userId)
    log.info(`Tool registry loaded with ${Object.keys(toolRegistry).length} tools`)

    log.info(`Loading search tool keys for user ${userId}`)
    const searchToolKeys = await loadSearchToolKeys(userId)

    const resumeRunId =
      run.context && typeof run.context === 'object'
        ? (run.context as Record<string, unknown>).resumeRunId
        : undefined

    const memoryMessageLimit =
      typeof run.memoryMessageLimit === 'number'
        ? run.memoryMessageLimit
        : typeof workflow.memoryMessageLimit === 'number'
          ? workflow.memoryMessageLimit
          : memorySettings.memoryMessageLimit

    const conversationHistory =
      typeof resumeRunId === 'string' && resumeRunId.length > 0
        ? await buildConversationContext(userId, resumeRunId, {
            limit: memoryMessageLimit,
          })
        : ''

    const oracleResumeState =
      workflow.workflowType === 'oracle' ? extractOracleResumeState(run.workflowState) : undefined
    const sequentialResumeState =
      workflow.workflowType === 'sequential'
        ? extractNestedResumeState(run.workflowState, 'sequentialResumeState')
        : undefined
    const parallelResumeState =
      workflow.workflowType === 'parallel'
        ? extractNestedResumeState(run.workflowState, 'parallelResumeState')
        : undefined
    const supervisorResumeState =
      workflow.workflowType === 'supervisor'
        ? extractNestedResumeState(run.workflowState, 'supervisorResumeState')
        : undefined
    const dialecticalResumeState =
      workflow.workflowType === 'dialectical'
        ? extractNestedResumeState(run.workflowState, 'dialecticalResumeState')
        : undefined
    const deepResearchResumeState =
      workflow.workflowType === 'deep_research'
        ? extractNestedResumeState(run.workflowState, 'deepResearchResumeState')
        : undefined
    const genericResumeState =
      (workflow.workflowType === 'graph' || workflow.workflowType === 'custom') &&
      run.workflowState &&
      typeof run.workflowState === 'object'
        ? extractGenericResumeState(run.workflowState, run.pendingInput, run.constraintPause)
        : undefined

    const runContext =
      run.context && typeof run.context === 'object'
        ? { ...(run.context as Record<string, unknown>) }
        : {}

    if (conversationHistory) {
      runContext.conversationHistory = conversationHistory
    }
    if (oracleResumeState) {
      runContext.resumeState = oracleResumeState
    }
    if (sequentialResumeState) {
      runContext.resumeState = sequentialResumeState
    }
    if (parallelResumeState) {
      runContext.resumeState = parallelResumeState
    }
    if (supervisorResumeState) {
      runContext.resumeState = supervisorResumeState
    }
    if (dialecticalResumeState) {
      runContext.resumeState = dialecticalResumeState
    }
    if (deepResearchResumeState) {
      runContext.resumeState = deepResearchResumeState
    }
    if (genericResumeState) {
      runContext.resumeState = genericResumeState
    }

    const runWithContext: Run = {
      ...run,
      context: runContext,
    }
    const contextHash = buildExpertCouncilContextHash(
      runWithContext.context as Record<string, unknown>
    )

    let councilUsageRecorded = false

    log.info('Checking Expert Council configuration')
    const expertCouncilConfig = workflow.expertCouncilConfig
    if (expertCouncilConfig?.enabled) {
      log.info(`Expert Council is ENABLED for workflow ${workflowId}`)
      try {
        const modeCandidate =
          runWithContext.context &&
          typeof runWithContext.context === 'object' &&
          typeof (runWithContext.context as Record<string, unknown>).expertCouncilMode === 'string'
            ? ((runWithContext.context as Record<string, unknown>).expertCouncilMode as string)
            : undefined
        const modeOverride =
          modeCandidate && ['full', 'quick', 'single', 'custom'].includes(modeCandidate)
            ? (modeCandidate as ExecutionMode)
            : undefined

        log.info(`Expert Council mode: ${modeOverride || expertCouncilConfig.defaultMode}`)

        log.info('Creating Expert Council repository')
        const repository = createExpertCouncilRepository()

        log.info('Creating Expert Council pipeline')
        const pipeline = createExpertCouncilPipeline({
          apiKeys: providerKeys,
          context: runWithContext.context,
          eventWriter,
          workflowId,
        })

        log.info('Creating Expert Council use case')
        const executeCouncil = executeExpertCouncilUsecase(repository, pipeline)

        log.info(`Executing Expert Council for run ${runId}`)
        const turn = await executeCouncil(
          userId,
          runId as RunId,
          runWithContext.goal,
          expertCouncilConfig,
          modeOverride,
          workflowId as WorkflowId,
          contextHash
        )
        log.info(`Expert Council execution completed for run ${runId}`)

        const totalTokensUsed =
          turn.stage1.responses.reduce((sum, response) => sum + (response.tokensUsed ?? 0), 0) +
          turn.stage2.reviews.reduce((sum, review) => sum + (review.tokensUsed ?? 0), 0) +
          (turn.stage3.tokensUsed ?? 0)

        await recordRunUsage(userId, totalTokensUsed, turn.totalCost)
        councilUsageRecorded = true

        const firstProvider = turn.stage1.responses[0]?.provider ?? 'openai'
        await updateQuota(userId, firstProvider, totalTokensUsed, turn.totalCost)

        const alert = await shouldSendQuotaAlert(userId)
        if (alert) {
          log.info(
            `Quota alert for user ${userId}: ${alert.type} at ${alert.threshold}% (${alert.used}/${alert.limit})`
          )
        }

        await runRef.update({
          status: 'completed',
          output: turn.stage3.finalResponse,
          tokensUsed: totalTokensUsed,
          estimatedCost: turn.totalCost,
          totalSteps: 3,
          currentStep: 3,
          completedAtMs: Date.now(),
        })

        await eventWriter.writeEvent({
          type: 'final',
          workflowId,
          output: turn.stage3.finalResponse,
          status: 'completed',
        })

        // Auto-evaluate output quality (awaited to ensure completion before function exits)
        try {
          const scores = await evaluateRunOutput(turn.stage3.finalResponse, run.goal, providerKeys)
          if (scores) {
            await runRef.update({ evaluationScores: scores })
            log.info('Expert Council evaluation complete', {
              runId,
              relevance: scores.relevance,
              completeness: scores.completeness,
              accuracy: scores.accuracy,
            })
          }
        } catch (err) {
          log.warn('Expert Council evaluation failed (non-critical)', { runId, error: err })
        }

        log.info(`Expert Council completed for run ${runId}`)
        return
      } catch (error) {
        log.error('Expert Council failed; falling back to workflow.', error, {
          runId,
          workflowId,
          userId,
          expertCouncilConfig,
        })
        await eventWriter.writeEvent({
          type: 'status',
          workflowId,
          status: 'expert_council_failed_fallback',
          details: {
            reason: error instanceof Error ? error.message : String(error),
            fallback: 'workflow',
          },
        })
      }
    }

    log.info('Expert Council not enabled or failed, using workflow execution')

    if (!workflow.agentIds || workflow.agentIds.length === 0) {
      throw new Error('No agents configured in workflow')
    }
    log.info(`Workflow has ${workflow.agentIds.length} agents configured`)

    // Execute workflow with multi-agent orchestration
    log.info(`Starting workflow execution for run ${runId}`)
    const result = await executeWorkflow(
      userId,
      workflow,
      runWithContext,
      {
        openai: providerKeys.openai,
        anthropic: providerKeys.anthropic,
        google: providerKeys.google,
        grok: providerKeys.grok,
      },
      eventWriter,
      toolRegistry,
      searchToolKeys
    )
    log.info(`Workflow execution completed for run ${runId}`)

    // Check for failed status returned by workflow executor (e.g. dialectical graph failures)
    if (result.status === 'failed') {
      throw new Error(result.error || 'Workflow execution failed')
    }

    if (result.status === 'waiting_for_input') {
      await recordRunUsage(userId, result.totalTokensUsed, result.totalEstimatedCost)

      const firstAgent = await db.doc(`users/${userId}/agents/${workflow.agentIds[0]}`).get()
      const agentData = firstAgent.data() as Record<string, unknown> | undefined
      const provider = (agentData?.modelProvider as ModelProvider | undefined) ?? 'openai'
      await updateQuota(userId, provider, result.totalTokensUsed, result.totalEstimatedCost)

      const alert = await shouldSendQuotaAlert(userId)
      if (alert) {
        log.info(
          `Quota alert for user ${userId}: ${alert.type} at ${alert.threshold}% (${alert.used}/${alert.limit})`
        )
      }

      await runRef.update({
        status: 'waiting_for_input',
        pendingInput: result.pendingInput ?? null,
        constraintPause: result.constraintPause ?? null,
        workflowState: sanitizeForFirestore(result.workflowState ?? run.workflowState) ?? null,
        output: result.output,
        tokensUsed: result.totalTokensUsed,
        estimatedCost: result.totalEstimatedCost,
        totalSteps: result.totalSteps,
        currentStep: result.totalSteps,
      })

      await eventWriter.writeEvent({
        type: 'status',
        workflowId,
        status: 'waiting_for_input',
      })

      log.info(`Run ${runId} is waiting for user input.`)
      return
    }

    if (result.status === 'paused') {
      const extractDeepResearchContext = (
        workflowState?: Run['workflowState']
      ): {
        requestId: string
        status: string
        synthesizedFindings?: string
        integratedAtMs?: number
      } | null => {
        const workflowWithResearch = workflowState as
          | (WorkflowState & {
              pendingResearchRequestId?: string
              pendingResearchOutputKey?: string
            })
          | undefined
        const requestId = workflowWithResearch?.pendingResearchRequestId
        const outputKey = workflowWithResearch?.pendingResearchOutputKey
        if (!requestId || !outputKey) return null
        const output = workflowWithResearch?.namedOutputs?.[outputKey]
        if (!output || typeof output !== 'object' || !('requestId' in output)) {
          return null
        }
        const maybeRequest = output as DeepResearchRequest
        if (maybeRequest.requestId !== requestId) return null

        return {
          requestId: maybeRequest.requestId,
          status: maybeRequest.status,
          synthesizedFindings: maybeRequest.synthesizedFindings,
          integratedAtMs: maybeRequest.integratedAtMs,
        }
      }

      const deepResearchContext = extractDeepResearchContext(
        result.workflowState ?? run.workflowState
      )
      const nextContext =
        deepResearchContext && typeof run.context === 'object'
          ? { ...run.context, deepResearch: deepResearchContext }
          : deepResearchContext
            ? { deepResearch: deepResearchContext }
            : undefined

      await recordRunUsage(userId, result.totalTokensUsed, result.totalEstimatedCost)

      const firstAgent = await db.doc(`users/${userId}/agents/${workflow.agentIds[0]}`).get()
      const agentData = firstAgent.data() as Record<string, unknown> | undefined
      const provider = (agentData?.modelProvider as ModelProvider | undefined) ?? 'openai'
      await updateQuota(userId, provider, result.totalTokensUsed, result.totalEstimatedCost)

      const alert = await shouldSendQuotaAlert(userId)
      if (alert) {
        log.info(
          `Quota alert for user ${userId}: ${alert.type} at ${alert.threshold}% (${alert.used}/${alert.limit})`
        )
      }

      const runUpdates: Record<string, unknown> = {
        status: 'paused',
        pendingInput: null,
        workflowState: sanitizeForFirestore(result.workflowState ?? run.workflowState) ?? null,
        output: result.output,
        tokensUsed: result.totalTokensUsed,
        estimatedCost: result.totalEstimatedCost,
        totalSteps: result.totalSteps,
        currentStep: result.totalSteps,
      }

      if (nextContext) {
        runUpdates.context = nextContext
      }

      await runRef.update(runUpdates)

      await eventWriter.writeEvent({
        type: 'status',
        workflowId,
        status: 'paused',
      })

      log.info(`Run ${runId} paused for research delegation.`)
      return
    }

    // Phase 5E: Record usage in rate limiter and quota manager
    if (!councilUsageRecorded) {
      await recordRunUsage(userId, result.totalTokensUsed, result.totalEstimatedCost)
    }

    // Update quota with provider-specific usage (use first agent's provider as representative)
    const firstAgent = await db.doc(`users/${userId}/agents/${workflow.agentIds[0]}`).get()
    const agentData = firstAgent.data() as Record<string, unknown> | undefined
    const provider = (agentData?.modelProvider as ModelProvider | undefined) ?? 'openai'
    if (!councilUsageRecorded) {
      await updateQuota(userId, provider, result.totalTokensUsed, result.totalEstimatedCost)
    }

    // Check if quota alert should be sent
    const alert = await shouldSendQuotaAlert(userId)
    if (alert) {
      log.info(
        `Quota alert for user ${userId}: ${alert.type} at ${alert.threshold}% (${alert.used}/${alert.limit})`
      )

      // Create in-app notification
      try {
        const notificationRef = db.collection('users').doc(userId).collection('notifications').doc()

        const notification = {
          type: 'quota_alert',
          title: `Quota Alert: ${alert.type === 'runs' ? 'Runs' : alert.type === 'tokens' ? 'Tokens' : 'Cost'} at ${alert.threshold}%`,
          message: `You've used ${alert.used} of ${alert.limit} ${alert.type === 'runs' ? 'runs' : alert.type === 'tokens' ? 'tokens' : 'dollars'} (${alert.threshold}% of your daily limit).`,
          data: {
            alertType: alert.type,
            threshold: alert.threshold,
            used: alert.used,
            limit: alert.limit,
          },
          read: false,
          createdAtMs: Date.now(),
          createdAt: new Date().toISOString(),
        }

        await notificationRef.set(notification)
        log.info(`Created quota alert notification for user ${userId}`)
      } catch (error) {
        log.error('Failed to create quota alert notification', error)
        // Don't throw - notification failure shouldn't break the run
      }
    }

    // Update run with successful result
    log.info(`Updating run ${runId} status to 'completed'`)
    await runRef.update({
      status: 'completed',
      output: result.output,
      tokensUsed: result.totalTokensUsed,
      estimatedCost: result.totalEstimatedCost,
      completedAtMs: Date.now(),
      totalSteps: result.totalSteps,
      currentStep: result.totalSteps,
      workflowState: sanitizeForFirestore(result.workflowState ?? run.workflowState) ?? null,
    })

    log.info(`Writing 'final' event for run ${runId}`)
    await eventWriter.writeEvent({
      type: 'final',
      workflowId,
      output: result.output,
      status: 'completed',
    })

    // Auto-evaluate output quality (awaited to ensure completion before function exits)
    try {
      const scores = await evaluateRunOutput(result.output, run.goal, {
        openai: providerKeys.openai,
        anthropic: providerKeys.anthropic,
        google: providerKeys.google,
        grok: providerKeys.grok,
      })
      if (scores) {
        await runRef.update({ evaluationScores: scores })
        log.info('Run evaluation complete', {
          runId,
          relevance: scores.relevance,
          completeness: scores.completeness,
          accuracy: scores.accuracy,
        })
      }
    } catch (err) {
      log.warn('Run evaluation failed (non-critical)', { runId, error: err })
    }

    log.info(
      `Run ${runId} completed successfully. Workflow: ${workflow.workflowType}, Steps: ${result.totalSteps}, Tokens: ${result.totalTokensUsed}, Cost: $${result.totalEstimatedCost.toFixed(4)}`
    )
  } catch (error) {
    log.error(`Run ${runId} FAILED with error`, error)
    log.error(`Error stack: ${error instanceof Error ? error.stack : 'No stack trace'}`)

    // Phase 5E: Wrap error for better user messages
    const agentError = wrapError(error, 'run_execution')
    log.error(`Error category: ${agentError.category}, User message: ${agentError.userMessage}`)

    const eventWriter = createRunEventWriter({ userId, runId, workflowId })

    if (agentError.category === 'rate_limit' && agentError.retryable) {
      const now = Date.now()
      const retryCount = (run.queueInfo?.retryCount ?? 0) + 1
      const nextRetryAtMs = now + computeQueueRetryDelayMs()

      log.info(`Queueing run ${runId} after provider rate limit`)
      await runRef.update({
        status: 'queued',
        error: agentError.userMessage,
        errorCategory: agentError.category,
        errorDetails: agentError.details,
        quotaExceeded: true,
        pendingInput: null,
        constraintPause: {
          constraintType: 'rate_provider',
          currentValue: 1,
          limitValue: 1,
          unit: 'provider window',
          partialOutput:
            typeof run.output === 'string' && run.output.trim().length > 0 ? run.output : undefined,
        },
        queueInfo: {
          reason: 'rate_provider',
          queuedAtMs: now,
          nextRetryAtMs,
          retryCount,
        },
        completedAtMs: FieldValue.delete(),
      })

      await eventWriter.writeEvent({
        type: 'status',
        workflowId,
        status: 'queued',
        details: {
          reason: 'rate_provider',
          retryCount,
          nextRetryAtMs,
          message: agentError.userMessage,
        },
      })

      log.warn(`Run ${runId} queued for automatic retry after provider rate limit`)
      return
    }

    // Update run with error (including category and quota flag)
    log.info(`Updating run ${runId} status to 'failed'`)
    await runRef.update({
      status: 'failed',
      error: agentError.userMessage,
      errorCategory: agentError.category,
      errorDetails: agentError.details,
      quotaExceeded: agentError.category === 'quota' || agentError.category === 'rate_limit',
      completedAtMs: Date.now(),
    })

    log.info(`Writing 'error' event for run ${runId}`)
    await eventWriter.writeEvent({
      type: 'error',
      workflowId,
      errorMessage: agentError.userMessage,
      errorCategory: agentError.category,
      status: 'failed',
    })

    log.error(`Run ${runId} error handling complete`)
  }
}

/**
 * Apply a quota/rate constraint override by updating the user's limit in Firestore.
 */
async function applyConstraintOverride(
  userId: string,
  overrideType: string,
  newLimit: number
): Promise<void> {
  switch (overrideType) {
    case 'quota_cost':
      await updateDailyCostQuota(userId, newLimit)
      break
    case 'quota_tokens':
      await updateDailyTokenQuota(userId, newLimit)
      break
    case 'quota_runs':
      await updateDailyRunQuota(userId, newLimit)
      break
    case 'rate_runs_per_hour':
      await updateRunsPerHourLimit(userId, newLimit)
      break
    case 'rate_tokens_per_day':
      await updateDailyTokenRateLimit(userId, newLimit)
      break
    case 'rate_cost_per_day':
      await updateDailyCostLimit(userId, newLimit)
      break
    default:
      log.warn(`Unknown constraint override type: ${overrideType}`)
  }
}

async function loadMemorySettings(userId: string): Promise<MemorySettings> {
  const db = getFirestore()
  const docRef = db.doc(`users/${userId}/settings/agentMemorySettings`)
  const snapshot = await docRef.get()
  const data = snapshot.exists ? (snapshot.data() as MemorySettings) : {}

  return {
    memoryMessageLimit:
      typeof data.memoryMessageLimit === 'number' ? data.memoryMessageLimit : undefined,
  }
}
