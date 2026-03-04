/**
 * Supervisor Workflow Graph
 *
 * Implements supervisor workflow execution using LangGraph.
 * A supervisor agent coordinates and delegates tasks to worker agents.
 *
 * Key improvements:
 * - Uses shared state annotations from stateAnnotations.ts
 * - Uses executeAgentWithEvents utility for consistent agent execution
 */

import { StateGraph, END, START, Annotation } from '@langchain/langgraph'
import type { AgentConfig, Workflow } from '@lifeos/agents'
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

const log = createLogger('SupervisorGraph')

/**
 * Configuration for supervisor graph creation
 */
export interface SupervisorGraphConfig {
  workflow: Workflow
  supervisorAgent: AgentConfig
  workerAgents: AgentConfig[]
  apiKeys: ProviderKeys
  userId: string
  runId: string
  maxIterations?: number
  eventWriter?: RunEventWriter
  toolRegistry?: ToolRegistry
  searchToolKeys?: SearchToolKeys
  enableCheckpointing?: boolean
  executionMode?: WorkflowExecutionMode
  tierOverride?: ModelTier | null
  workflowCriticality?: WorkflowCriticality
}

/**
 * State annotation for supervisor workflows
 */
const SupervisorStateAnnotation = Annotation.Root({
  // Core state
  workflowId: Annotation<string>,
  runId: Annotation<string>,
  userId: Annotation<string>,
  goal: Annotation<string>,
  context: Annotation<Record<string, unknown>>,

  // Supervisor state
  supervisorPlan: Annotation<string>,
  currentWorkerIndex: Annotation<number>,
  workerOutputs: Annotation<Record<string, string>>({
    reducer: (current: Record<string, string>, update: Record<string, string>) => ({
      ...current,
      ...update,
    }),
    default: () => ({}),
  }),

  // Execution tracking
  steps: Annotation<AgentExecutionStep[]>({
    reducer: (current: AgentExecutionStep[], update: AgentExecutionStep[]) => [
      ...current,
      ...update,
    ],
    default: () => [],
  }),

  // Metrics
  totalTokensUsed: Annotation<number>({
    reducer: (current: number, update: number) => current + update,
    default: () => 0,
  }),
  totalEstimatedCost: Annotation<number>({
    reducer: (current: number, update: number) => current + update,
    default: () => 0,
  }),

  // Output
  finalOutput: Annotation<string | null>,

  // Status
  status: Annotation<UnifiedWorkflowState['status']>,
  error: Annotation<string | null>,
})

type SupervisorState = typeof SupervisorStateAnnotation.State

/**
 * Create a supervisor workflow graph
 *
 * The graph structure:
 * START -> supervisor_plan -> worker_0 -> worker_1 -> ... -> supervisor_synthesize -> END
 */
export function createSupervisorGraph(config: SupervisorGraphConfig) {
  const {
    workflow,
    supervisorAgent,
    workerAgents,
    apiKeys,
    userId,
    runId,
    maxIterations = 10,
    eventWriter,
    toolRegistry,
    searchToolKeys,
    executionMode,
    tierOverride,
    workflowCriticality,
  } = config

  const iterationLimit = Math.min(maxIterations, workflow.maxIterations ?? 10)

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

  // Create the state graph
  const graph = new StateGraph(SupervisorStateAnnotation)

  // Supervisor planning node
  graph.addNode('supervisor_plan', async (state: SupervisorState) => {
    log.info('Starting with supervisor', { supervisor: supervisorAgent.name })

    const supervisorContext = {
      ...state.context,
      availableAgents: workerAgents.map((a) => ({
        name: a.name,
        role: a.role,
        description: a.description,
      })),
      instruction:
        'You are a supervisor agent. Analyze the goal and create a delegation plan. Which agents should work on this task and in what order?',
    }

    // Execute the supervisor agent using shared utility
    const step = await executeAgentWithEvents(
      supervisorAgent,
      state.goal,
      supervisorContext,
      execContext,
      { stepNumber: 1 }
    )

    // Override the agent name for planning step
    step.agentName = `${supervisorAgent.name} (Planning)`

    return {
      supervisorPlan: step.output,
      currentWorkerIndex: 0,
      steps: [step],
      totalTokensUsed: step.tokensUsed,
      totalEstimatedCost: step.estimatedCost,
    }
  })

  // Create worker nodes
  for (let i = 0; i < Math.min(workerAgents.length, iterationLimit - 1); i++) {
    const worker = workerAgents[i]
    const nodeId = `worker_${i}`

    graph.addNode(nodeId, async (state: SupervisorState) => {
      log.info('Executing worker', {
        worker: i + 1,
        totalWorkers: workerAgents.length,
        workerName: worker.name,
      })

      const workerContext = {
        ...state.context,
        supervisorPlan: state.supervisorPlan,
        ...state.workerOutputs,
      }

      // Execute the worker agent using shared utility
      const step = await executeAgentWithEvents(worker, state.goal, workerContext, execContext, {
        stepNumber: i + 2,
      })

      return {
        currentWorkerIndex: i + 1,
        workerOutputs: { [`worker_${i + 1}_output`]: step.output },
        steps: [step],
        totalTokensUsed: step.tokensUsed,
        totalEstimatedCost: step.estimatedCost,
      }
    })
  }

  // Supervisor synthesis node
  graph.addNode('supervisor_synthesize', async (state: SupervisorState) => {
    log.info('Synthesizing final output')

    const synthesisContext = {
      ...state.context,
      supervisorPlan: state.supervisorPlan,
      ...state.workerOutputs,
      instruction:
        'You are a supervisor agent. Review all worker outputs and synthesize a final comprehensive response.',
    }

    const stepNumber = state.steps.length + 1

    // Execute the supervisor synthesis using shared utility
    const step = await executeAgentWithEvents(
      supervisorAgent,
      state.goal,
      synthesisContext,
      execContext,
      { stepNumber }
    )

    // Override the agent name for synthesis step
    step.agentName = `${supervisorAgent.name} (Synthesis)`

    return {
      steps: [step],
      totalTokensUsed: step.tokensUsed,
      totalEstimatedCost: step.estimatedCost,
      finalOutput: step.output,
      status: 'completed' as const,
    }
  })

  // Add edges
  // Note: Type assertions needed because LangGraph's strict typing requires compile-time node names
  graph.addEdge(START, 'supervisor_plan' as typeof START)

  if (workerAgents.length > 0) {
    graph.addEdge('supervisor_plan' as typeof START, 'worker_0' as typeof START)

    for (let i = 0; i < Math.min(workerAgents.length, iterationLimit - 1) - 1; i++) {
      graph.addEdge(`worker_${i}` as typeof START, `worker_${i + 1}` as typeof START)
    }

    const lastWorkerIndex = Math.min(workerAgents.length, iterationLimit - 1) - 1
    graph.addEdge(
      `worker_${lastWorkerIndex}` as typeof START,
      'supervisor_synthesize' as typeof START
    )
  } else {
    graph.addEdge('supervisor_plan' as typeof START, 'supervisor_synthesize' as typeof START)
  }

  graph.addEdge('supervisor_synthesize' as typeof START, END)

  // Compile with optional checkpointing
  if (config.enableCheckpointing) {
    const checkpointer = createFirestoreCheckpointer(userId, workflow.workflowId, runId)
    return graph.compile({ checkpointer })
  }

  return graph.compile()
}

/**
 * Execute a supervisor workflow using LangGraph
 */
export async function executeSupervisorWorkflowLangGraph(
  config: SupervisorGraphConfig,
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

  const compiledGraph = createSupervisorGraph(config)

  // Initial state
  const initialState: Partial<SupervisorState> = {
    workflowId: workflow.workflowId,
    runId,
    userId,
    goal,
    context: context ?? {},
    supervisorPlan: '',
    currentWorkerIndex: 0,
    workerOutputs: {},
    steps: [],
    totalTokensUsed: 0,
    totalEstimatedCost: 0,
    finalOutput: null,
    status: 'running',
    error: null,
  }

  // Execute the graph
  const finalState = await compiledGraph.invoke(initialState)

  return {
    output: finalState.finalOutput ?? 'No output generated',
    steps: finalState.steps ?? [],
    totalTokensUsed: finalState.totalTokensUsed ?? 0,
    totalEstimatedCost: finalState.totalEstimatedCost ?? 0,
    totalSteps: finalState.steps?.length ?? 0,
    status: finalState.status ?? 'completed',
  }
}
