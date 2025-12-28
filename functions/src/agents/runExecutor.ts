/**
 * Run Executor
 *
 * Cloud Function trigger that executes agent runs when they are created.
 * Follows existing patterns from other Firestore triggers in the codebase.
 */

import type { AgentConfig, Run, Workspace } from '@lifeos/agents'
import { getFirestore } from 'firebase-admin/firestore'
import { defineSecret } from 'firebase-functions/params'
import { onDocumentCreated } from 'firebase-functions/v2/firestore'

import { createOpenAIClient, executeWithOpenAI } from './openaiService.js'

// Firebase secret for OpenAI API key
const OPENAI_API_KEY = defineSecret('OPENAI_API_KEY')

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
    secrets: [OPENAI_API_KEY],
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
        currentStep: 1,
      })

      // Load workspace configuration
      const workspaceDoc = await db.doc(`users/${userId}/workspaces/${workspaceId}`).get()
      if (!workspaceDoc.exists) {
        throw new Error(`Workspace ${workspaceId} not found`)
      }
      const workspace = workspaceDoc.data() as Workspace

      // Get the agent to use (default or first agent)
      const agentIdToUse = workspace.defaultAgentId ?? workspace.agentIds[0]
      if (!agentIdToUse) {
        throw new Error('No agents configured in workspace')
      }

      // Load agent configuration
      const agentDoc = await db.doc(`users/${userId}/agents/${agentIdToUse}`).get()
      if (!agentDoc.exists) {
        throw new Error(`Agent ${agentIdToUse} not found`)
      }
      const agent = agentDoc.data() as AgentConfig

      // Validate agent uses OpenAI (Phase 4A only supports OpenAI)
      if (agent.modelProvider !== 'openai') {
        throw new Error(
          `Agent uses ${agent.modelProvider} provider. Phase 4A only supports OpenAI.`
        )
      }

      // Execute with OpenAI
      const openaiClient = createOpenAIClient(OPENAI_API_KEY.value())
      const result = await executeWithOpenAI(openaiClient, agent, run.goal, run.context)

      // Update run with successful result
      await runRef.update({
        status: 'completed',
        output: result.output,
        tokensUsed: result.tokensUsed,
        estimatedCost: result.estimatedCost,
        completedAtMs: Date.now(),
        totalSteps: 1,
        currentStep: 1,
      })

      console.log(
        `Run ${runId} completed successfully. Tokens: ${result.tokensUsed}, Cost: $${result.estimatedCost.toFixed(4)}`
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
