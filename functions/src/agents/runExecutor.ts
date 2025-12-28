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

import { executeWorkflow } from './workflowExecutor.js'

// Firebase secrets for AI provider API keys
const OPENAI_API_KEY = defineSecret('OPENAI_API_KEY')
const ANTHROPIC_API_KEY = defineSecret('ANTHROPIC_API_KEY')
const GOOGLE_AI_API_KEY = defineSecret('GOOGLE_AI_API_KEY')
const XAI_API_KEY = defineSecret('XAI_API_KEY')

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
    secrets: [OPENAI_API_KEY, ANTHROPIC_API_KEY, GOOGLE_AI_API_KEY, XAI_API_KEY],
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

      // Execute workflow with multi-agent orchestration
      const result = await executeWorkflow(userId, workspace, run, {
        openai: OPENAI_API_KEY.value(),
        anthropic: ANTHROPIC_API_KEY.value(),
        google: GOOGLE_AI_API_KEY.value(),
        grok: XAI_API_KEY.value(),
      })

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

      // Update run with error
      await runRef.update({
        status: 'failed',
        error: (error as Error).message,
        completedAtMs: Date.now(),
      })
    }
  }
)
