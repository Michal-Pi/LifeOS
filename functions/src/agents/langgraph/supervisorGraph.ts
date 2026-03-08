/**
 * Supervisor Workflow Graph
 *
 * Implements supervisor workflow execution using LangGraph.
 * A supervisor agent coordinates and delegates tasks to worker agents.
 *
 * Key improvements:
 * - Uses shared state annotations from stateAnnotations.ts
 * - Uses executeAgentWithEvents utility for consistent agent execution
 * - Phase 13: Enhanced planning prompt, self-reflection after each worker
 * - Phase 14: Tool-aware delegation, per-worker token budgets
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
import {
  executeAgentWithEvents,
  handleAskUserInterrupt,
  type AgentExecutionContext,
} from './utils.js'

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
  enableReflection?: boolean // Supervisor evaluates each worker's output (default true)
  maxTokensPerWorker?: number // Optional per-worker token budget
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

  // Reflection results (Phase 13)
  reflectionResults: Annotation<Record<string, string>>({
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

  // User input pause
  pendingInput: Annotation<{ prompt: string; nodeId: string } | null>,

  // Resume hint — which node to skip to on workflow resume after pause
  resumeNodeHint: Annotation<string | null>({
    reducer: (_cur: string | null, upd: string | null) => upd,
    default: () => null,
  }),
})

type SupervisorState = typeof SupervisorStateAnnotation.State

/**
 * Create a supervisor workflow graph
 *
 * The graph structure:
 * START -> supervisor_plan -> worker_0 -> worker_1 -> ... -> supervisor_synthesize -> END
 *
 * With reflection enabled, each worker node also runs a supervisor reflection step.
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

  const enableReflection = config.enableReflection !== false // default true
  const iterationLimit = Math.min(maxIterations, workflow.maxIterations ?? 10)

  // Calculate total steps: plan + workers (with optional reflections) + synthesis
  const totalStepsCount = enableReflection ? 2 * workerAgents.length + 2 : workerAgents.length + 2

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
        tools: (a.toolIds ?? []).map((toolId) => {
          const toolDef = toolRegistry?.get(toolId)
          return toolDef
            ? { id: toolId, name: toolDef.name, description: toolDef.description }
            : { id: toolId }
        }),
      })),
      instruction:
        'You are a supervisor agent. Analyze the goal and create a structured delegation plan.\n\n' +
        'Each worker has specific tools available. Consider tool capabilities when assigning tasks.\n\n' +
        'For each worker, specify:\n' +
        '1. Which agent should handle the task (and why their tools make them suited)\n' +
        '2. What specific subtask they should accomplish\n' +
        '3. What you expect their output to contain\n' +
        '4. How their output feeds into the next step\n\n' +
        'Format: use clear headings per worker.',
    }

    // Execute the supervisor agent using shared utility
    const step = await executeAgentWithEvents(
      supervisorAgent,
      state.goal,
      supervisorContext,
      execContext,
      { stepNumber: 1, totalSteps: totalStepsCount }
    )

    // Check for ask_user interrupt
    const interrupt = handleAskUserInterrupt(step, 'supervisor_plan')
    if (interrupt) {
      return {
        steps: [step],
        totalTokensUsed: step.tokensUsed,
        totalEstimatedCost: step.estimatedCost,
        resumeNodeHint: 'supervisor_plan',
        ...interrupt,
      }
    }

    // Override the agent name for planning step
    step.agentName = `${supervisorAgent.name} (Planning)`

    // Emit supervisor plan event
    if (execContext.eventWriter) {
      await execContext.eventWriter.writeEvent({
        type: 'status',
        status: 'supervisor_plan',
        output: step.output,
        agentName: supervisorAgent.name,
      })
    }

    return {
      supervisorPlan: step.output,
      currentWorkerIndex: 0,
      steps: [step],
      totalTokensUsed: step.tokensUsed,
      totalEstimatedCost: step.estimatedCost,
    }
  })

  // Finding 14: Warn when iteration limit drops workers
  const effectiveWorkerCount = Math.min(workerAgents.length, iterationLimit - 1)
  if (workerAgents.length > effectiveWorkerCount) {
    log.warn(
      `Iteration limit (${iterationLimit}) dropping ${workerAgents.length - effectiveWorkerCount} worker(s)`,
      { total: workerAgents.length, running: effectiveWorkerCount }
    )
  }

  // Create worker nodes
  for (let i = 0; i < effectiveWorkerCount; i++) {
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

      // Calculate step number based on reflection mode
      const workerStepNumber = enableReflection ? i * 2 + 2 : i + 2

      // Execute the worker agent using shared utility
      const step = await executeAgentWithEvents(worker, state.goal, workerContext, execContext, {
        stepNumber: workerStepNumber,
        totalSteps: totalStepsCount,
        maxTokens: config.maxTokensPerWorker,
      })

      // Check for ask_user interrupt
      const interrupt = handleAskUserInterrupt(step, nodeId)
      if (interrupt) {
        return {
          steps: [step],
          totalTokensUsed: step.tokensUsed,
          totalEstimatedCost: step.estimatedCost,
          resumeNodeHint: nodeId,
          ...interrupt,
        }
      }

      // Warn if worker returned empty output
      const workerOutput = step.output && step.output.trim() !== '' ? step.output : ''
      if (!workerOutput) {
        log.warn('Worker returned empty output', {
          worker: worker.name,
          agentId: worker.agentId,
          iterationsUsed: step.iterationsUsed,
        })
      }

      const updates: Partial<SupervisorState> = {
        currentWorkerIndex: i + 1,
        workerOutputs: { [`${worker.name}_output`]: workerOutput || `[Worker "${worker.name}" returned no output]` },
        steps: [step],
        totalTokensUsed: step.tokensUsed,
        totalEstimatedCost: step.estimatedCost,
      }

      // Reflection after worker (Phase 13)
      if (enableReflection) {
        const reflectionContext = {
          supervisorPlan: state.supervisorPlan,
          workerName: worker.name,
          workerOutput: workerOutput || `[Worker "${worker.name}" returned no output]`,
          instruction:
            "Review this worker's output against your plan. Respond with:\n" +
            '1. SATISFACTORY or UNSATISFACTORY\n' +
            '2. Brief explanation (1-2 sentences)\n' +
            'Be concise.',
        }

        const reflectionStepNumber = workerStepNumber + 1
        const reflectionStep = await executeAgentWithEvents(
          supervisorAgent,
          state.goal,
          reflectionContext,
          execContext,
          { stepNumber: reflectionStepNumber, totalSteps: totalStepsCount }
        )

        reflectionStep.agentName = `${supervisorAgent.name} (Reflection on ${worker.name})`

        // Emit reflection event
        if (execContext.eventWriter) {
          await execContext.eventWriter.writeEvent({
            type: 'status',
            status: 'supervisor_reflection',
            output: reflectionStep.output,
            agentName: reflectionStep.agentName,
          })
        }

        // Log warning if unsatisfactory
        // TODO: Future — re-delegate to another worker when enableReDelegation is true
        if (reflectionStep.output.toUpperCase().includes('UNSATISFACTORY')) {
          log.warn('Worker output rated unsatisfactory', { worker: worker.name })
        }

        updates.steps = [step, reflectionStep]
        updates.totalTokensUsed = step.tokensUsed + reflectionStep.tokensUsed
        updates.totalEstimatedCost = step.estimatedCost + reflectionStep.estimatedCost
        updates.reflectionResults = { [worker.name]: reflectionStep.output }
      }

      return updates
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

    // Execute the supervisor synthesis using shared utility
    const step = await executeAgentWithEvents(
      supervisorAgent,
      state.goal,
      synthesisContext,
      execContext,
      { stepNumber: totalStepsCount, totalSteps: totalStepsCount }
    )

    // Check for ask_user interrupt
    const interrupt = handleAskUserInterrupt(step, 'supervisor_synthesize')
    if (interrupt) {
      return {
        steps: [step],
        totalTokensUsed: step.tokensUsed,
        totalEstimatedCost: step.estimatedCost,
        resumeNodeHint: 'supervisor_synthesize',
        ...interrupt,
      }
    }

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
  // On resume after pause, skip to the paused node via resumeNodeHint
  graph.addConditionalEdges(START, (state: SupervisorState) => {
    const hint = state.resumeNodeHint
    if (hint === 'supervisor_synthesize') return 'supervisor_synthesize'
    if (hint && workerAgents.some((_, idx) => `worker_${idx}` === hint)) return hint
    return 'supervisor_plan'
  })

  // Helper: route to END if waiting for user input, otherwise continue
  const routeOrPause = (next: string) => (state: SupervisorState) =>
    state.status === 'waiting_for_input' ? END : next

  if (workerAgents.length > 0) {
    graph.addConditionalEdges('supervisor_plan' as typeof START, routeOrPause('worker_0'), {
      worker_0: 'worker_0' as typeof START,
      [END]: END,
    })

    for (let i = 0; i < Math.min(workerAgents.length, iterationLimit - 1) - 1; i++) {
      graph.addConditionalEdges(`worker_${i}` as typeof START, routeOrPause(`worker_${i + 1}`), {
        [`worker_${i + 1}`]: `worker_${i + 1}` as typeof START,
        [END]: END,
      })
    }

    const lastWorkerIndex = Math.min(workerAgents.length, iterationLimit - 1) - 1
    graph.addConditionalEdges(
      `worker_${lastWorkerIndex}` as typeof START,
      routeOrPause('supervisor_synthesize'),
      { supervisor_synthesize: 'supervisor_synthesize' as typeof START, [END]: END }
    )
  } else {
    graph.addConditionalEdges(
      'supervisor_plan' as typeof START,
      routeOrPause('supervisor_synthesize'),
      { supervisor_synthesize: 'supervisor_synthesize' as typeof START, [END]: END }
    )
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
  context?: Record<string, unknown>,
  resumeState?: Partial<SupervisorState>
): Promise<{
  output: string
  steps: AgentExecutionStep[]
  totalTokensUsed: number
  totalEstimatedCost: number
  totalSteps: number
  status: UnifiedWorkflowState['status']
  pendingInput?: { prompt: string; nodeId: string }
  supervisorResumeState?: Partial<SupervisorState>
}> {
  const { workflow, userId, runId } = config

  const compiledGraph = createSupervisorGraph(config)

  const freshState: Partial<SupervisorState> = {
    workflowId: workflow.workflowId,
    runId,
    userId,
    goal,
    context: context ?? {},
    supervisorPlan: '',
    currentWorkerIndex: 0,
    workerOutputs: {},
    reflectionResults: {},
    steps: [],
    totalTokensUsed: 0,
    totalEstimatedCost: 0,
    finalOutput: null,
    status: 'running',
    error: null,
    pendingInput: null,
    resumeNodeHint: null,
  }

  // If resuming, merge previous state
  const initialState: Partial<SupervisorState> = resumeState
    ? { ...freshState, ...resumeState, status: 'running', pendingInput: null }
    : freshState

  // Execute the graph
  let finalState: SupervisorState
  try {
    finalState = (await compiledGraph.invoke(initialState)) as SupervisorState
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e)
    log.error('Supervisor graph execution failed', { error: errorMessage })
    return {
      output: errorMessage,
      steps: [],
      totalTokensUsed: 0,
      totalEstimatedCost: 0,
      totalSteps: 0,
      status: 'failed' as const,
    }
  }

  return {
    output: finalState.finalOutput ?? 'No output generated',
    steps: finalState.steps ?? [],
    totalTokensUsed: finalState.totalTokensUsed ?? 0,
    totalEstimatedCost: finalState.totalEstimatedCost ?? 0,
    totalSteps: finalState.steps?.length ?? 0,
    status: finalState.status ?? 'completed',
    pendingInput: finalState.pendingInput ?? undefined,
    supervisorResumeState: {
      supervisorPlan: finalState.supervisorPlan,
      currentWorkerIndex: finalState.currentWorkerIndex,
      workerOutputs: finalState.workerOutputs,
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
