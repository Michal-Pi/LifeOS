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
import type { AgentConfig, JoinAggregationMode, Workflow, ModelProvider } from '@lifeos/agents'
import type {
  UnifiedWorkflowState,
  AgentExecutionStep,
  WorkflowExecutionMode,
  ModelTier,
  WorkflowCriticality,
} from '@lifeos/agents'
import { resolveEffectiveModel } from '@lifeos/agents'
import { createLogger } from '../../lib/logger.js'
import type { ProviderKeys } from '../providerService.js'
import type { RunEventWriter } from '../runEvents.js'
import type { SearchToolKeys } from '../providerKeys.js'
import type { ToolRegistry } from '../toolExecutor.js'
import { createFirestoreCheckpointer } from './firestoreCheckpointer.js'
import {
  executeAgentWithEvents,
  handleAskUserInterrupt,
  type AgentExecutionContext,
} from './utils.js'
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
 * Format an agent entry for merge output
 */
function formatAgentEntry(step: AgentExecutionStep, prefix?: string): string {
  const namePrefix = prefix ? `${prefix} ` : ''
  return `**${namePrefix}${step.agentName}:**\n${step.output}`
}

/**
 * Merge parallel outputs based on strategy
 */
function mergeOutputs(
  outputs: Record<string, AgentExecutionStep>,
  failedAgents: FailedAgent[],
  strategy: JoinAggregationMode = 'list'
): string {
  const allEntries = Object.values(outputs)

  // Filter out agents that returned empty output and log a warning
  const emptyEntries = allEntries.filter((e) => !e.output || e.output.trim() === '')
  if (emptyEntries.length > 0) {
    log.warn('Parallel merge received empty outputs from agents', {
      emptyAgents: emptyEntries.map((e) => e.agentName ?? e.agentId),
      totalEntries: allEntries.length,
    })
  }
  // Use substantive entries for merge; fall back to all if none have content
  const entries =
    allEntries.length > emptyEntries.length
      ? allEntries.filter((e) => e.output && e.output.trim() !== '')
      : allEntries

  // Include failure notices if any agents failed
  let failureNotice = ''
  if (failedAgents.length > 0) {
    const failureDetails = failedAgents.map((f) => `- **${f.agentName}**: ${f.error}`).join('\n')
    failureNotice = `\n\n---\n\n⚠️ **${failedAgents.length} agent(s) failed:**\n${failureDetails}`
  }

  // Include empty output notices
  if (emptyEntries.length > 0 && entries.length > 0) {
    const emptyNames = emptyEntries.map((e) => e.agentName ?? e.agentId).join(', ')
    failureNotice += `\n\n---\n\n⚠️ **${emptyEntries.length} agent(s) returned empty output:** ${emptyNames}`
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
      output = entries.map((step) => formatAgentEntry(step)).join('\n\n---\n\n')
      break

    case 'ranked': {
      // Sort by output length (longest first) as a heuristic for thoroughness
      const sorted = [...entries].sort((a, b) => b.output.length - a.output.length)
      output = sorted.map((step, i) => formatAgentEntry(step, `#${i + 1}`)).join('\n\n---\n\n')
      break
    }

    case 'consensus':
      output = `## Consensus Summary\n\n${entries
        .map((step) => `- **${step.agentName}**: ${step.output.slice(0, 200)}...`)
        .join('\n')}`
      break

    case 'synthesize':
      output = `## Synthesized Output\n\nCombined perspectives from ${entries.length} agents:\n\n${entries.map((step) => formatAgentEntry(step)).join('\n\n')}`
      break

    case 'dedup_combine': {
      const seen = new Set<string>()
      const unique = entries.filter((step) => {
        if (seen.has(step.output)) return false
        seen.add(step.output)
        return true
      })
      output = unique.map((step) => formatAgentEntry(step)).join('\n\n---\n\n')
      break
    }

    default:
      output = entries.map((step) => formatAgentEntry(step)).join('\n\n---\n\n')
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
 * Compute a simple consensus score (0-1) based on output similarity.
 * Uses Jaccard similarity of word sets across all outputs.
 * Returns 1.0 for perfect agreement, 0.0 for no overlap.
 */
export function computeSimpleConsensus(steps: AgentExecutionStep[]): number {
  if (steps.length < 2) return 1.0

  const wordSets = steps.map(
    (s) =>
      new Set(
        s.output
          .toLowerCase()
          .split(/\s+/)
          .filter((w) => w.length > 3)
      )
  )

  let totalSimilarity = 0
  let pairCount = 0

  for (let i = 0; i < wordSets.length; i++) {
    for (let j = i + 1; j < wordSets.length; j++) {
      const intersection = new Set([...wordSets[i]].filter((w) => wordSets[j].has(w)))
      const union = new Set([...wordSets[i], ...wordSets[j]])
      totalSimilarity += union.size > 0 ? intersection.size / union.size : 0
      pairCount++
    }
  }

  return pairCount > 0 ? totalSimilarity / pairCount : 1.0
}

/**
 * Build a list of available providers from the API keys.
 * Maps ProviderKeys key names to ModelProvider names.
 */
function getAvailableProviders(apiKeys: ProviderKeys): ModelProvider[] {
  const providers: ModelProvider[] = []
  if (apiKeys.openai) providers.push('openai')
  if (apiKeys.anthropic) providers.push('anthropic')
  if (apiKeys.google) providers.push('google')
  if (apiKeys.grok) providers.push('xai')
  return providers
}

/**
 * Apply provider rotation to an agent for heterogeneous parallel execution.
 * Returns a new agent config with the provider rotated (preserving tier).
 */
function rotateAgentProvider(
  agent: AgentConfig,
  branchIndex: number,
  providers: ModelProvider[],
  executionMode: WorkflowExecutionMode = 'as_designed',
  tierOverride: ModelTier | null | undefined,
  workflowCriticality: WorkflowCriticality = 'core'
): AgentConfig {
  if (providers.length === 0) return agent
  const targetProvider = providers[branchIndex % providers.length]
  if (targetProvider === agent.modelProvider) return agent

  // Resolve the agent's effective tier via the rotated provider
  const rotatedAgent = { ...agent, modelProvider: targetProvider }
  const resolved = resolveEffectiveModel(
    rotatedAgent,
    executionMode,
    tierOverride,
    workflowCriticality
  )

  return { ...agent, modelProvider: resolved.provider, modelName: resolved.model }
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

  // Pre-compute provider rotation if heterogeneous models are enabled
  const availableProviders = workflow.heterogeneousModels
    ? getAvailableProviders(config.apiKeys)
    : []

  // Single node that executes all agents in parallel
  graph.addNode('parallel_execution', async (state: ParallelState) => {
    // Budget-aware fan-out: reduce agents if estimated cost exceeds 80% of budget
    let budgetReducedAgents = agents
    if (workflow.maxBudget !== undefined && workflow.maxBudget > 0) {
      // Rough cost estimate: ~2000 input + 1000 output tokens per agent, ~$0.01 per 1K tokens
      const estimatedCostPerAgent = 0.03
      const estimatedTotalCost = estimatedCostPerAgent * agents.length
      const budgetThreshold = workflow.maxBudget * 0.8

      if (estimatedTotalCost > budgetThreshold && agents.length > 2) {
        const reducedCount = Math.max(2, Math.ceil(agents.length / 2))
        log.info('Budget-aware fan-out reduction', {
          originalCount: agents.length,
          reducedCount,
          estimatedCost: estimatedTotalCost,
          maxBudget: workflow.maxBudget,
        })
        budgetReducedAgents = agents.slice(0, reducedCount)
      }
    }

    log.info('Starting agents in parallel', { agentCount: budgetReducedAgents.length })

    // Apply provider rotation if heterogeneous models are enabled
    const effectiveAgents =
      workflow.heterogeneousModels && availableProviders.length > 1
        ? budgetReducedAgents.map((agent, i) =>
            rotateAgentProvider(
              agent,
              i,
              availableProviders,
              config.executionMode,
              config.tierOverride,
              config.workflowCriticality
            )
          )
        : budgetReducedAgents

    // Execute all agents in parallel with Promise.all
    const results = await Promise.all(
      effectiveAgents.map((agent) => executeAgentSafely(agent, state, config))
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

    // Check if any agent requested user input
    const interruptedStep = successfulSteps.find((s) => s.askUserInterrupt)
    if (interruptedStep) {
      const interrupt = handleAskUserInterrupt(interruptedStep, interruptedStep.agentId)
      if (interrupt) {
        return {
          agentOutputs,
          steps: successfulSteps,
          failedAgents,
          totalTokensUsed: totalTokens,
          totalEstimatedCost: totalCost,
          resumeNodeHint: 'parallel_execution',
          ...interrupt,
        }
      }
    }

    log.info('Parallel execution completed', {
      succeeded: successfulSteps.length,
      total: effectiveAgents.length,
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

    // Adaptive fan-out: if consensus merge and consensus is low, spawn additional agents
    if (
      workflow.adaptiveFanOut === true &&
      mergeStrategy === 'consensus' &&
      successfulSteps.length >= 2
    ) {
      const consensusScore = computeSimpleConsensus(successfulSteps)

      if (consensusScore < 0.6) {
        log.info('Low consensus detected, spawning additional agents', {
          consensusScore,
          originalCount: successfulSteps.length,
        })

        // Spawn 2 additional agents (reuse from pool, rotate providers if heterogeneous)
        const additionalAgents = agents.slice(0, 2).map((agent, i) => {
          const extraIndex = effectiveAgents.length + i
          return workflow.heterogeneousModels && availableProviders.length > 1
            ? rotateAgentProvider(
                agent,
                extraIndex,
                availableProviders,
                config.executionMode,
                config.tierOverride,
                config.workflowCriticality
              )
            : agent
        })

        const additionalResults = await Promise.all(
          additionalAgents.map((agent) => executeAgentSafely(agent, state, config))
        )

        for (const result of additionalResults) {
          if (result.success) {
            successfulSteps.push(result.step)
            agentOutputs[result.step.agentId] = result.step
            totalTokens += result.step.tokensUsed
            totalCost += result.step.estimatedCost
          } else {
            failedAgents.push(result.failed)
          }
        }

        log.info('Adaptive fan-out completed', {
          newTotal: successfulSteps.length,
          originalConsensus: consensusScore,
        })
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

  // Merge node - only runs if we didn't fail or pause in parallel_execution
  graph.addNode('merge', async (state: ParallelState) => {
    // If paused for user input or already failed, don't override status
    if (state.status === 'waiting_for_input' || state.status === 'failed') {
      return {}
    }

    const mergedOutput = mergeOutputs(state.agentOutputs, state.failedAgents, mergeStrategy)

    // Budget tracking warning
    if (workflow.maxBudget !== undefined && state.totalEstimatedCost > workflow.maxBudget) {
      log.warn('Budget exceeded during parallel execution', {
        totalCost: state.totalEstimatedCost,
        maxBudget: workflow.maxBudget,
      })
    }

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
      error:
        hasFailures && hasSuccesses
          ? `Partial failure: ${state.failedAgents.length} agent(s) failed: ${state.failedAgents.map((a: FailedAgent) => a.agentName).join(', ')}`
          : null,
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
  context?: Record<string, unknown>,
  resumeState?: Partial<ParallelState>
): Promise<{
  output: string
  steps: AgentExecutionStep[]
  failedAgents: FailedAgent[]
  totalTokensUsed: number
  totalEstimatedCost: number
  totalSteps: number
  status: UnifiedWorkflowState['status']
  error?: string
  pendingInput?: { prompt: string; nodeId: string }
  parallelResumeState?: Partial<ParallelState>
}> {
  const { workflow, userId, runId } = config

  const compiledGraph = createParallelGraph(config)

  const freshState: Partial<ParallelState> = {
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
    pendingInput: null,
    resumeNodeHint: null,
  }

  // If resuming, merge previous state (parallel re-runs all agents)
  const initialState: Partial<ParallelState> = resumeState
    ? { ...freshState, ...resumeState, status: 'running', pendingInput: null }
    : freshState

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
    pendingInput: finalState.pendingInput ?? undefined,
    parallelResumeState: {
      agentOutputs: finalState.agentOutputs,
      steps: finalState.steps,
      failedAgents: finalState.failedAgents,
      totalTokensUsed: finalState.totalTokensUsed,
      totalEstimatedCost: finalState.totalEstimatedCost,
      pendingInput: finalState.pendingInput,
      resumeNodeHint: finalState.resumeNodeHint,
      finalOutput: finalState.finalOutput,
      status: finalState.status,
      error: finalState.error,
    },
  }
}
