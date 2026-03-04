/**
 * Parallel Workflow Graph
 *
 * Implements parallel workflow execution using LangGraph.
 * All agents execute concurrently with the same goal and context.
 * Outputs are merged using the specified merge strategy.
 *
 * Key improvements over previous version:
 * - Proper error tracking with failed agents list
 * - Uses shared state annotations
 * - Uses executeAgentWithEvents from utils
 * - Properly propagates partial failures to workflow state
 */

import { StateGraph, END, START } from '@langchain/langgraph'
import type { AgentConfig, JoinAggregationMode, Workflow } from '@lifeos/agents'
import type {
  UnifiedWorkflowState,
  AgentExecutionStep,
  WorkflowExecutionMode,
  ModelTier,
  WorkflowCriticality,
} from '@lifeos/agents'
import { createLogger } from '../../lib/logger.js'
import type { ProviderKeys } from '../providerService.js'
import type { RunEventWriter } from '../runEvents.js'
import type { SearchToolKeys } from '../providerKeys.js'
import type { ToolRegistry } from '../toolExecutor.js'
import { createFirestoreCheckpointer } from './firestoreCheckpointer.js'
import { executeAgentWithEvents, type AgentExecutionContext } from './utils.js'
import { ParallelStateAnnotation, type ParallelState } from './stateAnnotations.js'
import { agentFailedEvent, formatEventForLog } from './events.js'
import { ErrorCodes } from '../shared/config.js'

const log = createLogger('ParallelGraph')

/**
 * Failed agent record for tracking partial failures
 * Matches FailedAgentRecord in stateAnnotations.ts
 */
interface FailedAgent {
  agentId: string
  agentName: string
  error: string
  errorCode?: string
}

/**
 * Configuration for parallel graph creation
 */
export interface ParallelGraphConfig {
  workflow: Workflow
  agents: AgentConfig[]
  apiKeys: ProviderKeys
  userId: string
  runId: string
  mergeStrategy?: JoinAggregationMode
  eventWriter?: RunEventWriter
  toolRegistry?: ToolRegistry
  searchToolKeys?: SearchToolKeys
  enableCheckpointing?: boolean
  /** If true, fail the entire workflow if any agent fails. Default: false (partial success allowed) */
  failOnPartialError?: boolean
  executionMode?: WorkflowExecutionMode
  tierOverride?: ModelTier | null
  workflowCriticality?: WorkflowCriticality
}

/**
 * Result of executing a single agent
 */
type AgentResult =
  | { success: true; step: AgentExecutionStep }
  | { success: false; failed: FailedAgent }

/**
 * Merge parallel outputs based on strategy
 */
function mergeOutputs(
  outputs: Record<string, AgentExecutionStep>,
  failedAgents: FailedAgent[],
  strategy: JoinAggregationMode = 'list'
): string {
  const entries = Object.values(outputs)

  // Include failure notices if any agents failed
  let failureNotice = ''
  if (failedAgents.length > 0) {
    const failureDetails = failedAgents.map((f) => `- **${f.agentName}**: ${f.error}`).join('\n')
    failureNotice = `\n\n---\n\n⚠️ **${failedAgents.length} agent(s) failed:**\n${failureDetails}`
  }

  if (entries.length === 0) {
    if (failedAgents.length > 0) {
      return `All agents failed:${failureNotice}`
    }
    return 'No output generated'
  }

  let output: string

  switch (strategy) {
    case 'list':
      output = entries.map((step) => `**${step.agentName}:**\n${step.output}`).join('\n\n---\n\n')
      break

    case 'ranked': {
      // Sort by output length as a simple heuristic
      const sorted = [...entries].sort((a, b) => b.output.length - a.output.length)
      output = sorted
        .map((step, i) => `**#${i + 1} ${step.agentName}:**\n${step.output}`)
        .join('\n\n---\n\n')
      break
    }

    case 'consensus':
      output = `## Consensus Summary\n\n${entries.map((step) => `- **${step.agentName}**: ${step.output.slice(0, 200)}...`).join('\n')}`
      break

    case 'synthesize':
      output = `## Synthesized Output\n\nCombined perspectives from ${entries.length} agents:\n\n${entries.map((step) => step.output).join('\n\n')}`
      break

    case 'dedup_combine': {
      // Simple deduplication by removing exact duplicates
      const seen = new Set<string>()
      const unique = entries.filter((step) => {
        if (seen.has(step.output)) return false
        seen.add(step.output)
        return true
      })
      output = unique.map((step) => `**${step.agentName}:**\n${step.output}`).join('\n\n---\n\n')
      break
    }

    default:
      output = entries.map((step) => `**${step.agentName}:**\n${step.output}`).join('\n\n---\n\n')
  }

  return output + failureNotice
}

/**
 * Execute a single agent with proper error handling
 */
async function executeAgentSafely(
  agent: AgentConfig,
  state: ParallelState,
  config: ParallelGraphConfig
): Promise<AgentResult> {
  const {
    workflow,
    apiKeys,
    userId,
    runId,
    eventWriter,
    toolRegistry,
    searchToolKeys,
    executionMode,
    tierOverride,
    workflowCriticality,
  } = config

  const execContext: AgentExecutionContext = {
    userId,
    workflowId: workflow.workflowId,
    runId,
    apiKeys,
    eventWriter,
    toolRegistry,
    searchToolKeys,
    executionMode,
    tierOverride,
    workflowCriticality,
  }

  try {
    const step = await executeAgentWithEvents(agent, state.goal, state.context, execContext)
    return { success: true, step }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    const isRetryable = isRetryableAgentError(error)

    // Emit failure event
    if (eventWriter) {
      const failEvent = agentFailedEvent(workflow.workflowId, runId, agent.agentId, agent.name, {
        message: errorMessage,
        code: ErrorCodes.WORKFLOW_AGENT_FAILED,
        retryable: isRetryable,
      })
      log.error('Agent failed', null, {
        event: formatEventForLog(failEvent),
        agentId: agent.agentId,
        agentName: agent.name,
      })
    }

    return {
      success: false,
      failed: {
        agentId: agent.agentId,
        agentName: agent.name,
        error: `${errorMessage}${isRetryable ? ' (retryable)' : ''}`,
        errorCode: ErrorCodes.WORKFLOW_AGENT_FAILED,
      },
    }
  }
}

/**
 * Determine if an agent error is retryable
 */
function isRetryableAgentError(error: unknown): boolean {
  if (!(error instanceof Error)) return false

  const message = error.message.toLowerCase()

  // Retryable errors
  if (message.includes('rate limit')) return true
  if (message.includes('timeout')) return true
  if (message.includes('temporarily unavailable')) return true
  if (message.includes('503')) return true
  if (message.includes('429')) return true

  // Not retryable
  if (message.includes('invalid api key')) return false
  if (message.includes('authentication')) return false
  if (message.includes('permission denied')) return false

  // Default to not retryable for unknown errors
  return false
}

/**
 * Create a parallel workflow graph
 *
 * Uses a single node that executes all agents in parallel with Promise.all,
 * then merges the results. This provides true parallelism while properly
 * tracking failures.
 */
export function createParallelGraph(config: ParallelGraphConfig) {
  const {
    workflow,
    agents,
    userId,
    runId,
    mergeStrategy = 'list',
    failOnPartialError = false,
  } = config

  // Create the state graph
  const graph = new StateGraph(ParallelStateAnnotation)

  // Single node that executes all agents in parallel
  graph.addNode('parallel_execution', async (state: ParallelState) => {
    log.info('Starting agents in parallel', { agentCount: agents.length })

    // Execute all agents in parallel with Promise.all
    const results = await Promise.all(
      agents.map((agent) => executeAgentSafely(agent, state, config))
    )

    // Separate successful and failed results
    const successfulSteps: AgentExecutionStep[] = []
    const agentOutputs: Record<string, AgentExecutionStep> = {}
    const failedAgents: FailedAgent[] = []
    let totalTokens = 0
    let totalCost = 0

    for (const result of results) {
      if (result.success) {
        successfulSteps.push(result.step)
        agentOutputs[result.step.agentId] = result.step
        totalTokens += result.step.tokensUsed
        totalCost += result.step.estimatedCost
      } else {
        failedAgents.push(result.failed)
      }
    }

    log.info('Parallel execution completed', {
      succeeded: successfulSteps.length,
      total: agents.length,
      failed: failedAgents.length,
    })

    // Check if we should fail the entire workflow
    if (failOnPartialError && failedAgents.length > 0) {
      const errorSummary = failedAgents.map((f) => `${f.agentName}: ${f.error}`).join('; ')
      return {
        agentOutputs,
        steps: successfulSteps,
        failedAgents,
        totalTokensUsed: totalTokens,
        totalEstimatedCost: totalCost,
        error: `${failedAgents.length} agent(s) failed: ${errorSummary}`,
        status: 'failed' as const,
      }
    }

    return {
      agentOutputs,
      steps: successfulSteps,
      failedAgents,
      totalTokensUsed: totalTokens,
      totalEstimatedCost: totalCost,
    }
  })

  // Merge node - only runs if we didn't fail in parallel_execution
  graph.addNode('merge', async (state: ParallelState) => {
    // If already failed, don't override status
    if (state.status === 'failed') {
      return {}
    }

    const mergedOutput = mergeOutputs(state.agentOutputs, state.failedAgents, mergeStrategy)

    // Determine final status based on results
    const hasSuccesses = Object.keys(state.agentOutputs).length > 0
    const hasFailures = state.failedAgents.length > 0

    let finalStatus: UnifiedWorkflowState['status'] = 'completed'
    if (!hasSuccesses && hasFailures) {
      finalStatus = 'failed'
    } else if (hasFailures) {
      // Partial success - still mark as completed but failures are noted in output
      finalStatus = 'completed'
    }

    return {
      mergedOutput,
      finalOutput: mergedOutput,
      status: finalStatus,
    }
  })

  // Simple linear edges: START -> parallel_execution -> merge -> END
  graph.addEdge(START, 'parallel_execution' as typeof START)
  graph.addEdge('parallel_execution' as typeof START, 'merge' as typeof START)
  graph.addEdge('merge' as typeof START, END)

  // Compile with optional checkpointing
  if (config.enableCheckpointing) {
    const checkpointer = createFirestoreCheckpointer(userId, workflow.workflowId, runId)
    return graph.compile({ checkpointer })
  }

  return graph.compile()
}

/**
 * Execute a parallel workflow using LangGraph
 */
export async function executeParallelWorkflowLangGraph(
  config: ParallelGraphConfig,
  goal: string,
  context?: Record<string, unknown>
): Promise<{
  output: string
  steps: AgentExecutionStep[]
  failedAgents: FailedAgent[]
  totalTokensUsed: number
  totalEstimatedCost: number
  totalSteps: number
  status: UnifiedWorkflowState['status']
  error?: string
}> {
  const { workflow, userId, runId } = config

  const compiledGraph = createParallelGraph(config)

  // Initial state
  const initialState: Partial<ParallelState> = {
    workflowId: workflow.workflowId,
    runId,
    userId,
    goal,
    context: context ?? {},
    agentOutputs: {},
    steps: [],
    failedAgents: [],
    totalTokensUsed: 0,
    totalEstimatedCost: 0,
    mergedOutput: '',
    finalOutput: null,
    status: 'running',
    error: null,
  }

  // Execute the graph
  const finalState = await compiledGraph.invoke(initialState)

  return {
    output: finalState.finalOutput ?? finalState.mergedOutput ?? 'No output generated',
    steps: finalState.steps ?? [],
    failedAgents: finalState.failedAgents ?? [],
    totalTokensUsed: finalState.totalTokensUsed ?? 0,
    totalEstimatedCost: finalState.totalEstimatedCost ?? 0,
    totalSteps: finalState.steps?.length ?? 0,
    status: finalState.status ?? 'completed',
    error: finalState.error ?? undefined,
  }
}
