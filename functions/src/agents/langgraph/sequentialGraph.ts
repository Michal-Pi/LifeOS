/**
 * Sequential Workflow Graph
 *
 * Implements sequential workflow execution using LangGraph.
 * Agents execute one after another, each receiving the previous agent's output as context.
 *
 * Key improvements:
 * - Uses shared state annotations from stateAnnotations.ts
 * - Uses executeAgentWithEvents utility for consistent agent execution
 */

import { StateGraph, END, START } from '@langchain/langgraph'
import type {
  AgentConfig,
  Workflow,
  WorkflowExecutionMode,
  WorkflowCriticality,
  ModelTier,
} from '@lifeos/agents'
import { resolveEffectiveModel } from '@lifeos/agents'
import type { UnifiedWorkflowState, AgentExecutionStep } from '@lifeos/agents'
import { createFirestoreCheckpointer } from './firestoreCheckpointer.js'
import { createLogger } from '../../lib/logger.js'
import type { ProviderKeys } from '../providerService.js'
import { executeWithProvider } from '../providerService.js'
import type { RunEventWriter } from '../runEvents.js'
import type { SearchToolKeys } from '../providerKeys.js'
import type { ToolRegistry } from '../toolExecutor.js'
import {
  executeAgentWithEvents,
  handleAskUserInterrupt,
  type AgentExecutionContext,
} from './utils.js'
import { SequentialStateAnnotation, type SequentialState } from './stateAnnotations.js'
import { estimateTokenCount } from '../anthropicService.js'

const log = createLogger('SequentialGraph')

/** Minimum estimated token count before compression is applied */
const COMPRESSION_TOKEN_THRESHOLD = 2000

/**
 * Determine whether context compression is enabled for a workflow.
 * Explicit flag takes priority; otherwise defaults by criticality:
 *  - critical → false, core → false, routine → true
 */
function isCompressionEnabled(
  explicit: boolean | undefined,
  criticality: WorkflowCriticality | undefined
): boolean {
  if (explicit !== undefined) return explicit
  return (criticality ?? 'core') === 'routine'
}

/**
 * Compress agent output using a fast model to reduce tokens for downstream agents.
 * Returns the original output unchanged if the model call fails.
 */
export async function compressAgentOutput(output: string, apiKeys: ProviderKeys): Promise<string> {
  const compressionAgent: AgentConfig = {
    agentId: '__context_compressor__' as AgentConfig['agentId'],
    userId: '',
    name: 'Context Compressor',
    role: 'synthesizer',
    systemPrompt:
      'You are a context compression specialist. Condense the input into the shortest possible summary that preserves all key findings, data points, decisions, action items, and conclusions. Remove redundancy, filler, and preamble. Output ONLY the compressed summary — no explanation of what you did.',
    // Hardcoded to cheapest available model — compression is a utility task
    // where cost efficiency matters more than provider consistency with the workflow.
    modelProvider: 'openai',
    modelName: 'gpt-4o-mini',
    temperature: 0.3,
    archived: false,
    createdAtMs: 0,
    updatedAtMs: 0,
    syncState: 'synced',
    version: 0,
  }

  try {
    const result = await executeWithProvider(compressionAgent, output, {}, apiKeys)
    return result.output
  } catch (error) {
    log.warn('Context compression failed, using original output', { error })
    return output
  }
}

/** Tier upgrade mapping for quality gate retries */
const NEXT_TIER_UP: Record<ModelTier, ModelTier> = {
  fast: 'balanced',
  balanced: 'thinking',
  thinking: 'thinking', // already highest — no upgrade possible
}

/**
 * Score an agent's output using a cheap model.
 * Returns 1-5 score; defaults to 3 on parse failure (safe default).
 */
export async function scoreAgentOutput(
  output: string,
  goal: string,
  apiKeys: ProviderKeys
): Promise<number> {
  const scorerAgent: AgentConfig = {
    agentId: '__quality_scorer__' as AgentConfig['agentId'],
    userId: '',
    name: 'Quality Scorer',
    role: 'critic',
    systemPrompt:
      'You are a quality scorer. Given a goal and an output, rate how well the output achieves the goal on a 1-5 scale. 1 = completely fails, 3 = partially achieves, 5 = fully achieves. Respond with ONLY a single integer (1, 2, 3, 4, or 5). No explanation.',
    modelProvider: 'openai',
    modelName: 'gpt-4o-mini',
    temperature: 0.1,
    archived: false,
    createdAtMs: 0,
    updatedAtMs: 0,
    syncState: 'synced',
    version: 0,
  }

  try {
    const result = await executeWithProvider(
      scorerAgent,
      `Goal: ${goal.replace(/[{}"\\]/g, ' ').substring(0, 500)}\n\nOutput to score:\n${output.substring(0, 16000)}`,
      {},
      apiKeys
    )
    const score = parseInt(result.output.trim(), 10)
    if (isNaN(score) || score < 1 || score > 5) return 3
    return score
  } catch (error) {
    log.warn('Quality scoring failed, using safe default 3', { error })
    return 3
  }
}

/**
 * Configuration for sequential graph creation
 */
export interface SequentialGraphConfig {
  workflow: Workflow
  agents: AgentConfig[]
  apiKeys: ProviderKeys
  userId: string
  runId: string
  eventWriter?: RunEventWriter
  toolRegistry?: ToolRegistry
  searchToolKeys?: SearchToolKeys
  enableCheckpointing?: boolean
  executionMode?: WorkflowExecutionMode
  tierOverride?: ModelTier | null
  workflowCriticality?: WorkflowCriticality
}

/**
 * Create a sequential workflow graph
 *
 * The graph has a simple linear structure:
 * START -> agent_0 -> agent_1 -> ... -> agent_n -> END
 */
export function createSequentialGraph(config: SequentialGraphConfig) {
  const {
    workflow,
    agents,
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

  // Create the state graph
  const graph = new StateGraph(SequentialStateAnnotation)

  // Build execution context (shared by all agents)
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

  // Create a node for each agent
  for (let i = 0; i < agents.length; i++) {
    const agent = agents[i]
    const nodeId = `agent_${i}`

    graph.addNode(nodeId, async (state: SequentialState) => {
      log.info('Executing agent', {
        step: i + 1,
        totalSteps: agents.length,
        agentId: agent.agentId,
        agentName: agent.name,
      })

      // Build context with previous output
      const agentContext = {
        ...state.context,
        previousAgentOutput: state.lastOutput,
        stepNumber: i + 1,
      }

      // Execute the agent using shared utility
      let step = await executeAgentWithEvents(agent, state.currentGoal, agentContext, execContext, {
        stepNumber: i + 1,
        totalSteps: agents.length,
      })

      // Check for ask_user interrupt
      const interrupt = handleAskUserInterrupt(step, `agent_${i}`)
      if (interrupt) {
        return {
          currentAgentIndex: i,
          resumeNodeHint: `agent_${i}`,
          steps: [step],
          totalTokensUsed: step.tokensUsed,
          totalEstimatedCost: step.estimatedCost,
          ...interrupt,
        }
      }

      // Track extra tokens/cost from quality gate retry
      let extraTokens = 0
      let extraCost = 0

      // Warn if agent returned empty output
      if (!step.output || step.output.trim() === '') {
        log.warn('Sequential agent returned empty output', {
          agentName: agent.name,
          step: i + 1,
          totalSteps: agents.length,
          iterationsUsed: step.iterationsUsed,
        })
      }

      // Compress output before passing to next agent (skip for last agent)
      let outputForNext = step.output
      const isLastAgent = i === agents.length - 1

      // Check for early exit patterns
      const earlyExitPatterns = workflow.earlyExitPatterns ?? []
      const shouldEarlyExit =
        !isLastAgent &&
        earlyExitPatterns.length > 0 &&
        earlyExitPatterns.some((pattern) => step.output.includes(pattern))

      if (shouldEarlyExit) {
        log.info('Early exit triggered', {
          step: i + 1,
          totalSteps: agents.length,
          agentName: agent.name,
          pattern: earlyExitPatterns.find((p) => step.output.includes(p)),
        })
      }

      // Quality gate: score output and retry with stronger model if score is low
      const qualityGateThreshold = workflow.qualityGateThreshold ?? 3
      if (workflow.enableQualityGates === true && !isLastAgent && !shouldEarlyExit) {
        const score = await scoreAgentOutput(step.output, state.currentGoal, apiKeys)
        if (score < qualityGateThreshold) {
          // Determine the agent's current resolved tier
          const currentResolved = resolveEffectiveModel(
            agent,
            executionMode ?? 'as_designed',
            tierOverride,
            workflowCriticality ?? 'core'
          )
          const upgradedTier = NEXT_TIER_UP[currentResolved.resolvedTier]

          if (upgradedTier !== currentResolved.resolvedTier) {
            log.warn('Quality gate failed, retrying with upgraded model', {
              score,
              threshold: qualityGateThreshold,
              agentName: agent.name,
              step: i + 1,
              originalTier: currentResolved.resolvedTier,
              retryTier: upgradedTier,
            })

            // Re-execute with upgraded tier
            const retryContext: AgentExecutionContext = {
              ...execContext,
              tierOverride: upgradedTier,
            }
            const retryStep = await executeAgentWithEvents(
              agent,
              state.currentGoal,
              agentContext,
              retryContext,
              {
                stepNumber: i + 1,
                totalSteps: agents.length,
              }
            )

            // Accumulate tokens/cost from both attempts
            extraTokens = step.tokensUsed
            extraCost = step.estimatedCost
            step = retryStep
            outputForNext = step.output
          } else {
            log.info('Quality gate failed but already at highest tier, using original output', {
              score,
              threshold: qualityGateThreshold,
              agentName: agent.name,
            })
          }
        }
      }

      if (
        !isLastAgent &&
        !shouldEarlyExit &&
        isCompressionEnabled(workflow.enableContextCompression, workflowCriticality)
      ) {
        const estimatedTokens = estimateTokenCount(step.output)
        if (estimatedTokens > COMPRESSION_TOKEN_THRESHOLD) {
          log.info('Compressing agent output', {
            originalTokens: estimatedTokens,
            step: i + 1,
            totalSteps: agents.length,
          })
          outputForNext = await compressAgentOutput(step.output, apiKeys)
        }
      }

      return {
        currentAgentIndex: i + 1,
        currentGoal: outputForNext, // Next agent's goal is (possibly compressed) output
        steps: [step],
        totalTokensUsed: step.tokensUsed + extraTokens,
        totalEstimatedCost: step.estimatedCost + extraCost,
        lastOutput: step.output, // Always keep the full output in lastOutput
        finalOutput: isLastAgent || shouldEarlyExit ? step.output : null,
        status: isLastAgent || shouldEarlyExit ? 'completed' : 'running',
      }
    })
  }

  // Add edges: START -> agent_0 -> (conditional) -> agent_1 -> ... -> agent_n -> END
  // Note: Type assertions needed because LangGraph's strict typing requires compile-time node names
  // On resume after pause, skip to the paused agent via resumeNodeHint
  graph.addConditionalEdges(START, (state: SequentialState) => {
    const hint = state.resumeNodeHint
    if (hint && agents.some((_, idx) => `agent_${idx}` === hint)) {
      return hint
    }
    return 'agent_0'
  })

  // Use conditional edges for non-last agents to support early exit
  for (let i = 0; i < agents.length - 1; i++) {
    graph.addConditionalEdges(
      `agent_${i}` as typeof START,
      (state: SequentialState) => {
        // If paused for user input — go to END
        if (state.status === 'waiting_for_input') {
          return END
        }
        // If finalOutput is set, the workflow completed early — go to END
        if (state.finalOutput !== null && state.finalOutput !== undefined) {
          return END
        }
        return `agent_${i + 1}`
      },
      {
        [END]: END,
        [`agent_${i + 1}`]: `agent_${i + 1}` as typeof START,
      }
    )
  }

  // Last agent always goes to END
  graph.addEdge(`agent_${agents.length - 1}` as typeof START, END)

  // Compile with optional checkpointing
  if (config.enableCheckpointing) {
    const checkpointer = createFirestoreCheckpointer(userId, workflow.workflowId, runId)
    return graph.compile({ checkpointer })
  }

  return graph.compile()
}

/**
 * Execute a sequential workflow using LangGraph
 */
export async function executeSequentialWorkflowLangGraph(
  config: SequentialGraphConfig,
  goal: string,
  context?: Record<string, unknown>,
  resumeState?: Partial<SequentialState>
): Promise<{
  output: string
  steps: AgentExecutionStep[]
  totalTokensUsed: number
  totalEstimatedCost: number
  totalSteps: number
  status: UnifiedWorkflowState['status']
  pendingInput?: { prompt: string; nodeId: string }
  sequentialResumeState?: Partial<SequentialState>
}> {
  const { workflow, userId, runId } = config

  const compiledGraph = createSequentialGraph(config)

  const freshState: Partial<SequentialState> = {
    workflowId: workflow.workflowId,
    runId,
    userId,
    goal,
    context: context ?? {},
    currentAgentIndex: 0,
    currentGoal: goal,
    steps: [],
    totalTokensUsed: 0,
    totalEstimatedCost: 0,
    lastOutput: '',
    finalOutput: null,
    status: 'running',
    error: null,
    pendingInput: null,
    resumeNodeHint: null,
  }

  // If resuming, merge previous state
  const initialState: Partial<SequentialState> = resumeState
    ? { ...freshState, ...resumeState, status: 'running', pendingInput: null }
    : freshState

  // Execute the graph
  const finalState = await compiledGraph.invoke(initialState)

  return {
    output: finalState.finalOutput ?? finalState.lastOutput ?? 'No output generated',
    steps: finalState.steps ?? [],
    totalTokensUsed: finalState.totalTokensUsed ?? 0,
    totalEstimatedCost: finalState.totalEstimatedCost ?? 0,
    totalSteps: finalState.steps?.length ?? 0,
    status: finalState.status ?? 'completed',
    pendingInput: finalState.pendingInput ?? undefined,
    sequentialResumeState: {
      currentAgentIndex: finalState.currentAgentIndex,
      currentGoal: finalState.currentGoal,
      lastOutput: finalState.lastOutput,
      steps: finalState.steps,
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
