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
import { getFirestore } from 'firebase-admin/firestore'
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
import { checkQuota, updateQuota, shouldSendQuotaAlert } from './quotaManager.js'
import { checkRunRateLimit, recordRunUsage } from './rateLimiter.js'
import { createRunEventWriter } from './runEvents.js'
import { loadToolRegistryForUser } from './toolExecutor.js'
import { evaluateRunOutput } from './evaluation.js'
import { executeWorkflow } from './workflowExecutor.js'

const log = createLogger('RunExecutor')

type MemorySettings = {
  memoryMessageLimit?: number
}

// Function configuration (matching existing patterns)
const FUNCTION_CONFIG = {
  timeoutSeconds: 540,
  memory: '1GiB' as const,
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

    const resumableStatuses = new Set<Run['status']>(['waiting_for_input', 'paused'])
    if (!resumableStatuses.has(before.status) || after.status !== 'pending') {
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

    // Phase 5E: Check rate limits and quotas before starting
    log.info(`Checking rate limits for user ${userId}`)
    await checkRunRateLimit(userId)

    log.info(`Checking quota for user ${userId}`)
    await checkQuota(userId)

    // Update status to running
    log.info(`Updating run ${runId} status to 'running'`)
    await runRef.update({
      status: 'running',
      currentStep: run.currentStep ?? 0,
      pendingInput: null,
    })

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

    const runWithContext: Run = {
      ...run,
      context: {
        ...run.context,
        ...(conversationHistory ? { conversationHistory } : {}),
      },
    }
    const contextHash = buildExpertCouncilContextHash(
      runWithContext.context as Record<string, unknown>
    )

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
      throw new Error(
        (result as unknown as { error?: string }).error || 'Workflow execution failed'
      )
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
        pendingInput: result.pendingInput,
        workflowState: result.workflowState ?? run.workflowState,
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
        workflowState: result.workflowState ?? run.workflowState,
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
    await recordRunUsage(userId, result.totalTokensUsed, result.totalEstimatedCost)

    // Update quota with provider-specific usage (use first agent's provider as representative)
    const firstAgent = await db.doc(`users/${userId}/agents/${workflow.agentIds[0]}`).get()
    const agentData = firstAgent.data() as Record<string, unknown> | undefined
    const provider = (agentData?.modelProvider as ModelProvider | undefined) ?? 'openai'
    await updateQuota(userId, provider, result.totalTokensUsed, result.totalEstimatedCost)

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
    const eventWriter = createRunEventWriter({ userId, runId, workflowId })
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
