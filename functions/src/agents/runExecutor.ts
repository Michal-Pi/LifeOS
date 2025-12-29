/**
 * Run Executor
 *
 * Cloud Function trigger that executes agent runs when they are created.
 * Supports both single-agent execution and multi-agent workflows.
 */

import type { Run, Workspace } from '@lifeos/agents'
import { getFirestore } from 'firebase-admin/firestore'
import { defineSecret } from 'firebase-functions/params'
import { onDocumentCreated } from 'firebase-functions/v2/firestore'

import { wrapError } from './errorHandler.js'
import { checkQuota, updateQuota, shouldSendQuotaAlert } from './quotaManager.js'
import { checkRunRateLimit, recordRunUsage } from './rateLimiter.js'
import { executeWorkflow } from './workflowExecutor.js'

type ProviderKeys = {
  openai?: string
  anthropic?: string
  google?: string
  grok?: string
}

// Optional fallback secrets (only used if user has not set their own key)
const OPENAI_API_KEY = defineSecret('OPENAI_API_KEY')
const ANTHROPIC_API_KEY = defineSecret('ANTHROPIC_API_KEY')

// Function configuration (matching existing patterns)
const FUNCTION_CONFIG = {
  timeoutSeconds: 300,
  memory: '512MiB' as const,
}

/**
 * Firestore trigger that executes when a new run is created
 *
 * Document path: users/{userId}/workspaces/{workspaceId}/runs/{runId}
 * Triggers when: A new run document is created with status 'pending'
 */
export const onRunCreated = onDocumentCreated(
  {
    ...FUNCTION_CONFIG,
    document: 'users/{userId}/workspaces/{workspaceId}/runs/{runId}',
    secrets: [OPENAI_API_KEY, ANTHROPIC_API_KEY],
  },
  async (event) => {
    const snapshot = event.data
    if (!snapshot) {
      console.error('No snapshot data available')
      return
    }

    const run = snapshot.data() as Run
    const { userId, workspaceId, runId } = event.params

    console.log(`Processing run ${runId} for user ${userId} in workspace ${workspaceId}`)

    // Only process pending runs
    if (run.status !== 'pending') {
      console.log(`Run ${runId} is not pending (status: ${run.status}), skipping`)
      return
    }

    const db = getFirestore()
    const runRef = db.doc(`users/${userId}/workspaces/${workspaceId}/runs/${runId}`)

    try {
      // Phase 5E: Check rate limits and quotas before starting
      await checkRunRateLimit(userId)
      await checkQuota(userId)

      // Update status to running
      await runRef.update({
        status: 'running',
        currentStep: 0,
      })

      // Load workspace configuration
      const workspaceDoc = await db.doc(`users/${userId}/workspaces/${workspaceId}`).get()
      if (!workspaceDoc.exists) {
        throw new Error(`Workspace ${workspaceId} not found`)
      }
      const workspace = workspaceDoc.data() as Workspace

      if (!workspace.agentIds || workspace.agentIds.length === 0) {
        throw new Error('No agents configured in workspace')
      }

      const providerKeys = await loadProviderKeys(userId)

      // Execute workflow with multi-agent orchestration
      const result = await executeWorkflow(userId, workspace, run, {
        openai: providerKeys.openai,
        anthropic: providerKeys.anthropic,
        google: providerKeys.google,
        grok: providerKeys.grok,
      })

      // Phase 5E: Record usage in rate limiter and quota manager
      await recordRunUsage(userId, result.totalTokensUsed, result.totalEstimatedCost)

      // Update quota with provider-specific usage (use first agent's provider as representative)
      const firstAgent = await db.doc(`users/${userId}/agents/${workspace.agentIds[0]}`).get()
      const provider = firstAgent.exists ? (firstAgent.data() as any).modelProvider : 'openai'
      await updateQuota(userId, provider, result.totalTokensUsed, result.totalEstimatedCost)

      // Check if quota alert should be sent
      const alert = await shouldSendQuotaAlert(userId)
      if (alert) {
        console.log(
          `Quota alert for user ${userId}: ${alert.type} at ${alert.threshold}% (${alert.used}/${alert.limit})`
        )
        // TODO: Future - send in-app notification
      }

      // Update run with successful result
      await runRef.update({
        status: 'completed',
        output: result.output,
        tokensUsed: result.totalTokensUsed,
        estimatedCost: result.totalEstimatedCost,
        completedAtMs: Date.now(),
        totalSteps: result.totalSteps,
        currentStep: result.totalSteps,
      })

      console.log(
        `Run ${runId} completed successfully. Workflow: ${workspace.workflowType}, Steps: ${result.totalSteps}, Tokens: ${result.totalTokensUsed}, Cost: $${result.totalEstimatedCost.toFixed(4)}`
      )
    } catch (error) {
      console.error(`Run ${runId} failed:`, error)

      // Phase 5E: Wrap error for better user messages
      const agentError = wrapError(error, 'run_execution')

      // Update run with error (including category and quota flag)
      await runRef.update({
        status: 'failed',
        error: agentError.userMessage,
        errorCategory: agentError.category,
        errorDetails: agentError.details,
        quotaExceeded: agentError.category === 'quota' || agentError.category === 'rate_limit',
        completedAtMs: Date.now(),
      })
    }
  }
)

async function loadProviderKeys(userId: string): Promise<ProviderKeys> {
  const db = getFirestore()
  const docRef = db.doc(`users/${userId}/settings/aiProviderKeys`)
  const snapshot = await docRef.get()
  const userKeys = snapshot.exists
    ? (snapshot.data() as {
        openaiKey?: string
        anthropicKey?: string
        googleKey?: string
        xaiKey?: string
      })
    : {}

  const fallbackKeys: ProviderKeys = {
    openai: OPENAI_API_KEY.value() || process.env.OPENAI_API_KEY,
    anthropic: ANTHROPIC_API_KEY.value() || process.env.ANTHROPIC_API_KEY,
    google: process.env.GOOGLE_AI_API_KEY,
    grok: process.env.XAI_API_KEY,
  }

  return {
    openai: userKeys.openaiKey || fallbackKeys.openai || undefined,
    anthropic: userKeys.anthropicKey || fallbackKeys.anthropic || undefined,
    google: userKeys.googleKey || fallbackKeys.google || undefined,
    grok: userKeys.xaiKey || fallbackKeys.grok || undefined,
  }
}
