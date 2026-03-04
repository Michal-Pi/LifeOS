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
  ModelTier,
  WorkflowCriticality,
} from '@lifeos/agents'
import type { UnifiedWorkflowState, AgentExecutionStep } from '@lifeos/agents'
import { createFirestoreCheckpointer } from './firestoreCheckpointer.js'
import { createLogger } from '../../lib/logger.js'
import type { ProviderKeys } from '../providerService.js'
import type { RunEventWriter } from '../runEvents.js'
import type { SearchToolKeys } from '../providerKeys.js'
import type { ToolRegistry } from '../toolExecutor.js'
import { executeAgentWithEvents, type AgentExecutionContext } from './utils.js'
import { SequentialStateAnnotation, type SequentialState } from './stateAnnotations.js'

const log = createLogger('SequentialGraph')

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
      const step = await executeAgentWithEvents(
        agent,
        state.currentGoal,
        agentContext,
        execContext,
        {
          stepNumber: i + 1,
        }
      )

      return {
        currentAgentIndex: i + 1,
        currentGoal: step.output, // Next agent's goal is previous agent's output
        steps: [step],
        totalTokensUsed: step.tokensUsed,
        totalEstimatedCost: step.estimatedCost,
        lastOutput: step.output,
        finalOutput: i === agents.length - 1 ? step.output : null,
        status: i === agents.length - 1 ? 'completed' : 'running',
      }
    })
  }

  // Add edges: START -> agent_0 -> agent_1 -> ... -> agent_n -> END
  // Note: Type assertions needed because LangGraph's strict typing requires compile-time node names
  graph.addEdge(START, 'agent_0' as typeof START)

  for (let i = 0; i < agents.length - 1; i++) {
    graph.addEdge(`agent_${i}` as typeof START, `agent_${i + 1}` as typeof START)
  }

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
  context?: Record<string, unknown>
): Promise<{
  output: string
  steps: AgentExecutionStep[]
  totalTokensUsed: number
  totalEstimatedCost: number
  totalSteps: number
  status: UnifiedWorkflowState['status']
}> {
  const { workflow, userId, runId } = config

  const compiledGraph = createSequentialGraph(config)

  // Initial state
  const initialState: Partial<SequentialState> = {
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
  }

  // Execute the graph
  const finalState = await compiledGraph.invoke(initialState)

  return {
    output: finalState.finalOutput ?? finalState.lastOutput ?? 'No output generated',
    steps: finalState.steps ?? [],
    totalTokensUsed: finalState.totalTokensUsed ?? 0,
    totalEstimatedCost: finalState.totalEstimatedCost ?? 0,
    totalSteps: finalState.steps?.length ?? 0,
    status: finalState.status ?? 'completed',
  }
}
