/**
 * Workflow Executor
 *
 * Orchestrates multi-agent workflows with different execution patterns.
 * Supports sequential, parallel, supervisor-based, graph, and custom agent coordination.
 *
 * As of the LangGraph migration (Phase 0), this module now uses LangGraph for workflow
 * execution when the USE_LANGGRAPH feature flag is enabled (default: true).
 *
 * LangGraph provides:
 * - Unified state management across all workflow types
 * - Conditional edges and cycles for complex workflows
 * - Firestore checkpointing for resumable executions
 * - Human-in-the-loop via interrupt() mechanism
 * - Real-time streaming via state updates
 *
 * The legacy executors are kept as fallback and can be enabled by setting
 * USE_LANGGRAPH=false environment variable.
 */

import { randomUUID } from 'crypto'
import type {
  AgentConfig,
  DeepResearchRequest,
  JoinAggregationMode,
  Run,
  Workflow,
  WorkflowEdge,
  WorkflowNode,
  WorkflowState,
} from '@lifeos/agents'
import { getFirestore } from 'firebase-admin/firestore'
import { Graph } from 'graphlib'
import jsonLogic from 'json-logic-js'

import { createLogger } from '../lib/logger.js'
import { assertValidResearchContext, normalizeResearchQuestions } from './deepResearchValidation.js'
import {
  executeLangGraphWorkflow,
  isLangGraphSupported,
  type LangGraphExecutionConfig,
} from './langgraph/index.js'
import { resolvePrompt } from './promptResolver.js'
import type { SearchToolKeys } from './providerKeys.js'
import type { ProviderKeys } from './providerService.js'
import { executeWithProvider, executeWithProviderStreaming } from './providerService.js'
import type { RunEventWriter } from './runEvents.js'
import type { StreamContext } from './streamingTypes.js'
import type { ToolRegistry } from './toolExecutor.js'

/**
 * Feature flag to control LangGraph usage
 *
 * Set to true to use LangGraph for all supported workflow types.
 * Set to false to use the legacy executors.
 *
 * This allows gradual rollout and easy rollback if issues are found.
 */
const log = createLogger('WorkflowExecutor')

export const USE_LANGGRAPH = process.env.USE_LANGGRAPH !== 'false'

/**
 * Result from a single agent execution within a workflow
 */
export interface AgentExecutionStep {
  agentId: string
  agentName: string
  output: string
  tokensUsed: number
  estimatedCost: number
  provider: string
  model: string
  executedAtMs: number
}

/**
 * Result from complete workflow execution
 */
export interface WorkflowExecutionResult {
  output: string // Final output from the workflow
  steps: AgentExecutionStep[] // All execution steps
  totalTokensUsed: number
  totalEstimatedCost: number
  totalSteps: number
  status?: Run['status']
  pendingInput?: Run['pendingInput']
  constraintPause?: Run['constraintPause']
  workflowState?: WorkflowState
  error?: string
}

/**
 * Execute a sequential workflow
 * Agents execute one after another, each receiving the previous agent's output as context
 *
 * @param workflow Workflow configuration
 * @param agents Array of agent configurations in execution order
 * @param goal User's goal/task description
 * @param context Optional initial context
 * @param apiKeys Provider API keys
 * @param maxIterations Maximum number of iterations to prevent infinite loops
 * @param userId User ID for tool execution context
 * @param runId Run ID for tool execution context
 * @returns Workflow execution result
 */
export async function executeSequentialWorkflow(
  workflow: Workflow,
  agents: AgentConfig[],
  goal: string,
  context: Record<string, unknown> | undefined,
  apiKeys: ProviderKeys,
  maxIterations: number = 10,
  userId?: string,
  runId?: string,
  eventWriter?: RunEventWriter,
  toolRegistry?: ToolRegistry,
  searchToolKeys?: SearchToolKeys
): Promise<WorkflowExecutionResult> {
  const steps: AgentExecutionStep[] = []
  let currentContext = context ?? {}
  let currentGoal = goal

  // Limit iterations to prevent infinite loops
  const iterationLimit = Math.min(maxIterations, workflow.maxIterations ?? 10)
  const executionCount = Math.min(agents.length, iterationLimit)

  for (let i = 0; i < executionCount; i++) {
    const agent = agents[i]

    log.info('Sequential workflow step', {
      step: i + 1,
      totalSteps: executionCount,
      agentId: agent.agentId,
      agentName: agent.name,
    })

    // Build tool execution context if userId and runId are provided
    const toolContext =
      userId && runId
        ? {
            userId,
            agentId: agent.agentId,
            workflowId: workflow.workflowId,
            runId,
            eventWriter,
            toolRegistry,
            searchToolKeys,
          }
        : undefined

    const streamContext: StreamContext | undefined =
      eventWriter && toolContext
        ? {
            eventWriter,
            agentId: agent.agentId,
            agentName: agent.name,
            step: i + 1,
          }
        : undefined

    if (eventWriter && toolContext) {
      await eventWriter.writeEvent({
        type: 'status',
        workflowId: workflow.workflowId,
        agentId: agent.agentId,
        agentName: agent.name,
        status: `agent_start:${i + 1}`,
      })
    }

    const result = streamContext
      ? await executeWithProviderStreaming(
          agent,
          currentGoal,
          { ...currentContext, ...buildProjectManagerContext(workflow, currentContext) },
          apiKeys,
          toolContext,
          streamContext
        )
      : await executeWithProvider(
          agent,
          currentGoal,
          { ...currentContext, ...buildProjectManagerContext(workflow, currentContext) },
          apiKeys,
          toolContext
        )

    // Record execution step
    const step: AgentExecutionStep = {
      agentId: agent.agentId,
      agentName: agent.name,
      output: result.output,
      tokensUsed: result.tokensUsed,
      estimatedCost: result.estimatedCost,
      provider: result.provider,
      model: result.model,
      executedAtMs: Date.now(),
    }
    steps.push(step)

    if (eventWriter && toolContext) {
      await eventWriter.flushTokens({
        workflowId: workflow.workflowId,
        agentId: agent.agentId,
        agentName: agent.name,
        provider: result.provider,
        model: result.model,
        step: i + 1,
      })
      await eventWriter.writeEvent({
        type: 'status',
        workflowId: workflow.workflowId,
        agentId: agent.agentId,
        agentName: agent.name,
        status: `agent_done:${i + 1}`,
      })
    }

    // Update context with previous agent's output for next iteration
    currentContext = {
      ...currentContext,
      previousAgentOutput: result.output,
      previousAgentName: agent.name,
      stepNumber: i + 1,
    }

    // For sequential workflows, the output becomes the refined goal for the next agent
    currentGoal = result.output
  }

  // Calculate totals
  const totalTokensUsed = steps.reduce((sum, step) => sum + step.tokensUsed, 0)
  const totalEstimatedCost = steps.reduce((sum, step) => sum + step.estimatedCost, 0)

  return {
    output: steps[steps.length - 1]?.output ?? 'No output generated',
    steps,
    totalTokensUsed,
    totalEstimatedCost,
    totalSteps: steps.length,
    status: 'completed',
  }
}

/**
 * Execute a parallel workflow
 * All agents execute concurrently with the same goal and context
 *
 * @param workflow Workflow configuration
 * @param agents Array of agent configurations
 * @param goal User's goal/task description
 * @param context Optional initial context
 * @param apiKeys Provider API keys
 * @param userId User ID for tool execution context
 * @param runId Run ID for tool execution context
 * @returns Workflow execution result
 */
export async function executeParallelWorkflow(
  workflow: Workflow,
  agents: AgentConfig[],
  goal: string,
  context: Record<string, unknown> | undefined,
  apiKeys: ProviderKeys,
  userId?: string,
  runId?: string,
  eventWriter?: RunEventWriter,
  toolRegistry?: ToolRegistry,
  searchToolKeys?: SearchToolKeys
): Promise<WorkflowExecutionResult> {
  log.info('Executing parallel workflow', { agentCount: agents.length })

  // Execute all agents in parallel
  const executionPromises = agents.map(async (agent) => {
    log.info('Parallel workflow starting agent', { agentId: agent.agentId, agentName: agent.name })

    // Build tool execution context if userId and runId are provided
    const toolContext =
      userId && runId
        ? {
            userId,
            agentId: agent.agentId,
            workflowId: workflow.workflowId,
            runId,
            eventWriter,
            toolRegistry,
            searchToolKeys,
          }
        : undefined

    const streamContext: StreamContext | undefined =
      eventWriter && toolContext
        ? {
            eventWriter,
            agentId: agent.agentId,
            agentName: agent.name,
          }
        : undefined

    if (eventWriter && toolContext) {
      await eventWriter.writeEvent({
        type: 'status',
        workflowId: workflow.workflowId,
        agentId: agent.agentId,
        agentName: agent.name,
        status: 'agent_start',
      })
    }

    const result = streamContext
      ? await executeWithProviderStreaming(
          agent,
          goal,
          context,
          apiKeys,
          toolContext,
          streamContext
        )
      : await executeWithProvider(agent, goal, context, apiKeys, toolContext)

    const step: AgentExecutionStep = {
      agentId: agent.agentId,
      agentName: agent.name,
      output: result.output,
      tokensUsed: result.tokensUsed,
      estimatedCost: result.estimatedCost,
      provider: result.provider,
      model: result.model,
      executedAtMs: Date.now(),
    }

    log.info('Parallel workflow completed agent', { agentId: agent.agentId, agentName: agent.name })

    if (eventWriter && toolContext) {
      await eventWriter.flushTokens({
        workflowId: workflow.workflowId,
        agentId: agent.agentId,
        agentName: agent.name,
        provider: result.provider,
        model: result.model,
      })
      await eventWriter.writeEvent({
        type: 'status',
        workflowId: workflow.workflowId,
        agentId: agent.agentId,
        agentName: agent.name,
        status: 'agent_done',
      })
    }
    return step
  })

  const steps = await Promise.all(executionPromises)

  // Calculate totals
  const totalTokensUsed = steps.reduce((sum, step) => sum + step.tokensUsed, 0)
  const totalEstimatedCost = steps.reduce((sum, step) => sum + step.estimatedCost, 0)

  // Combine all outputs into a summary
  const combinedOutput = steps
    .map((step) => `**${step.agentName}:**\n${step.output}`)
    .join('\n\n---\n\n')

  return {
    output: combinedOutput,
    steps,
    totalTokensUsed,
    totalEstimatedCost,
    totalSteps: steps.length,
    status: 'completed',
  }
}

/**
 * Execute a supervisor workflow
 * A supervisor agent coordinates and delegates tasks to worker agents
 *
 * @param workflow Workflow configuration
 * @param supervisorAgent The supervisor agent (should be first in workflow.agentIds)
 * @param workerAgents Array of worker agent configurations
 * @param goal User's goal/task description
 * @param context Optional initial context
 * @param apiKeys Provider API keys
 * @param maxIterations Maximum number of iterations
 * @param userId User ID for tool execution context
 * @param runId Run ID for tool execution context
 * @returns Workflow execution result
 */
export async function executeSupervisorWorkflow(
  workflow: Workflow,
  supervisorAgent: AgentConfig,
  workerAgents: AgentConfig[],
  goal: string,
  context: Record<string, unknown> | undefined,
  apiKeys: ProviderKeys,
  maxIterations: number = 10,
  userId?: string,
  runId?: string,
  eventWriter?: RunEventWriter,
  toolRegistry?: ToolRegistry,
  searchToolKeys?: SearchToolKeys
): Promise<WorkflowExecutionResult> {
  const steps: AgentExecutionStep[] = []
  const iterationLimit = Math.min(maxIterations, workflow.maxIterations ?? 10)

  log.info('Starting supervisor workflow', { supervisor: supervisorAgent.name })

  // Step 1: Supervisor creates execution plan
  const supervisorContext = {
    ...context,
    availableAgents: workerAgents.map((a) => ({
      name: a.name,
      role: a.role,
      description: a.description,
    })),
    instruction:
      'You are a supervisor agent. Analyze the goal and create a delegation plan. Which agents should work on this task and in what order?',
  }

  // Build tool execution context for supervisor
  const supervisorToolContext =
    userId && runId
      ? {
          userId,
          agentId: supervisorAgent.agentId,
          workflowId: workflow.workflowId,
          runId,
          eventWriter,
          toolRegistry,
          searchToolKeys,
        }
      : undefined

  const planStreamContext: StreamContext | undefined =
    eventWriter && supervisorToolContext
      ? {
          eventWriter,
          agentId: supervisorAgent.agentId,
          agentName: supervisorAgent.name,
          step: 1,
        }
      : undefined

  if (eventWriter && supervisorToolContext) {
    await eventWriter.writeEvent({
      type: 'status',
      workflowId: workflow.workflowId,
      agentId: supervisorAgent.agentId,
      agentName: supervisorAgent.name,
      status: 'agent_start:plan',
    })
  }

  const planResult = planStreamContext
    ? await executeWithProviderStreaming(
        supervisorAgent,
        goal,
        supervisorContext,
        apiKeys,
        supervisorToolContext,
        planStreamContext
      )
    : await executeWithProvider(
        supervisorAgent,
        goal,
        supervisorContext,
        apiKeys,
        supervisorToolContext
      )

  steps.push({
    agentId: supervisorAgent.agentId,
    agentName: `${supervisorAgent.name} (Planning)`,
    output: planResult.output,
    tokensUsed: planResult.tokensUsed,
    estimatedCost: planResult.estimatedCost,
    provider: planResult.provider,
    model: planResult.model,
    executedAtMs: Date.now(),
  })

  if (eventWriter && supervisorToolContext) {
    await eventWriter.flushTokens({
      workflowId: workflow.workflowId,
      agentId: supervisorAgent.agentId,
      agentName: supervisorAgent.name,
      provider: planResult.provider,
      model: planResult.model,
      step: 1,
    })
    await eventWriter.writeEvent({
      type: 'status',
      workflowId: workflow.workflowId,
      agentId: supervisorAgent.agentId,
      agentName: supervisorAgent.name,
      status: 'agent_done:plan',
    })
  }

  // Step 2: Execute worker agents (simplified - execute all workers in sequence)
  let currentContext = {
    ...context,
    supervisorPlan: planResult.output,
  }

  for (let i = 0; i < Math.min(workerAgents.length, iterationLimit - 1); i++) {
    const worker = workerAgents[i]

    log.info('Supervisor workflow executing worker', {
      worker: i + 1,
      totalWorkers: workerAgents.length,
      workerName: worker.name,
    })

    // Build tool execution context for worker
    const workerToolContext =
      userId && runId
        ? {
            userId,
            agentId: worker.agentId,
            workflowId: workflow.workflowId,
            runId,
            eventWriter,
            toolRegistry,
            searchToolKeys,
          }
        : undefined

    const workerStreamContext: StreamContext | undefined =
      eventWriter && workerToolContext
        ? {
            eventWriter,
            agentId: worker.agentId,
            agentName: worker.name,
            step: i + 2,
          }
        : undefined

    if (eventWriter && workerToolContext) {
      await eventWriter.writeEvent({
        type: 'status',
        workflowId: workflow.workflowId,
        agentId: worker.agentId,
        agentName: worker.name,
        status: `agent_start:${i + 2}`,
      })
    }

    const result = workerStreamContext
      ? await executeWithProviderStreaming(
          worker,
          goal,
          currentContext,
          apiKeys,
          workerToolContext,
          workerStreamContext
        )
      : await executeWithProvider(worker, goal, currentContext, apiKeys, workerToolContext)

    steps.push({
      agentId: worker.agentId,
      agentName: worker.name,
      output: result.output,
      tokensUsed: result.tokensUsed,
      estimatedCost: result.estimatedCost,
      provider: result.provider,
      model: result.model,
      executedAtMs: Date.now(),
    })

    if (eventWriter && workerToolContext) {
      await eventWriter.flushTokens({
        workflowId: workflow.workflowId,
        agentId: worker.agentId,
        agentName: worker.name,
        provider: result.provider,
        model: result.model,
        step: i + 2,
      })
      await eventWriter.writeEvent({
        type: 'status',
        workflowId: workflow.workflowId,
        agentId: worker.agentId,
        agentName: worker.name,
        status: `agent_done:${i + 2}`,
      })
    }

    currentContext = {
      ...currentContext,
      [`worker_${i + 1}_output`]: result.output,
      [`worker_${i + 1}_name`]: worker.name,
    }
  }

  // Step 3: Supervisor synthesizes final output
  const synthesisContext = {
    ...currentContext,
    instruction:
      'You are a supervisor agent. Review all worker outputs and synthesize a final comprehensive response.',
  }

  const synthesisStreamContext: StreamContext | undefined =
    eventWriter && supervisorToolContext
      ? {
          eventWriter,
          agentId: supervisorAgent.agentId,
          agentName: supervisorAgent.name,
          step: steps.length + 1,
        }
      : undefined

  if (eventWriter && supervisorToolContext) {
    await eventWriter.writeEvent({
      type: 'status',
      workflowId: workflow.workflowId,
      agentId: supervisorAgent.agentId,
      agentName: supervisorAgent.name,
      status: 'agent_start:synthesis',
    })
  }

  const finalResult = synthesisStreamContext
    ? await executeWithProviderStreaming(
        supervisorAgent,
        goal,
        synthesisContext,
        apiKeys,
        supervisorToolContext,
        synthesisStreamContext
      )
    : await executeWithProvider(
        supervisorAgent,
        goal,
        synthesisContext,
        apiKeys,
        supervisorToolContext
      )

  steps.push({
    agentId: supervisorAgent.agentId,
    agentName: `${supervisorAgent.name} (Synthesis)`,
    output: finalResult.output,
    tokensUsed: finalResult.tokensUsed,
    estimatedCost: finalResult.estimatedCost,
    provider: finalResult.provider,
    model: finalResult.model,
    executedAtMs: Date.now(),
  })

  if (eventWriter && supervisorToolContext) {
    await eventWriter.flushTokens({
      workflowId: workflow.workflowId,
      agentId: supervisorAgent.agentId,
      agentName: supervisorAgent.name,
      provider: finalResult.provider,
      model: finalResult.model,
      step: steps.length,
    })
    await eventWriter.writeEvent({
      type: 'status',
      workflowId: workflow.workflowId,
      agentId: supervisorAgent.agentId,
      agentName: supervisorAgent.name,
      status: 'agent_done:synthesis',
    })
  }

  // Calculate totals
  const totalTokensUsed = steps.reduce((sum, step) => sum + step.tokensUsed, 0)
  const totalEstimatedCost = steps.reduce((sum, step) => sum + step.estimatedCost, 0)

  return {
    output: finalResult.output,
    steps,
    totalTokensUsed,
    totalEstimatedCost,
    totalSteps: steps.length,
    status: 'completed',
  }
}

type JoinBufferEntry = {
  agentId?: string
  agentName?: string
  role?: string
  output: string
  confidence?: number
}

const resolveConditionValue = (
  path: string | undefined,
  data: Record<string, unknown>
): unknown => {
  if (!path) return undefined
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object' && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key]
    }
    return undefined
  }, data)
}

const evaluateCondition = async (
  edge: WorkflowEdge,
  data: Record<string, unknown>,
  providerKeys?: ProviderKeys
): Promise<boolean> => {
  const { condition } = edge
  switch (condition.type) {
    case 'always':
      return true
    case 'equals':
      return Boolean(
        jsonLogic.apply({ '==': [{ var: condition.key ?? '' }, condition.value ?? ''] }, data)
      )
    case 'contains':
      return Boolean(
        jsonLogic.apply({ in: [condition.value ?? '', { var: condition.key ?? '' }] }, data)
      )
    case 'regex': {
      const rawValue = resolveConditionValue(condition.key, data)
      if (typeof condition.value !== 'string') return false
      try {
        return new RegExp(condition.value).test(String(rawValue ?? ''))
      } catch {
        return false
      }
    }
    case 'llm_evaluate': {
      if (!providerKeys || !condition.value) return false
      try {
        const dataSnippet = JSON.stringify(data).slice(0, 2000)
        const evalAgent: AgentConfig = {
          agentId: 'edge_evaluator' as AgentConfig['agentId'],
          userId: '',
          name: 'Edge Evaluator',
          role: 'custom',
          systemPrompt: 'You are a boolean evaluator. Respond with ONLY "yes" or "no".',
          modelProvider: 'anthropic',
          modelName: 'claude-haiku-4-5',
          temperature: 0,
          maxTokens: 10,
          archived: false,
          createdAtMs: 0,
          updatedAtMs: 0,
          syncState: 'synced',
          version: 1,
        }
        const goal = `Given this data:\n\`\`\`json\n${dataSnippet}\n\`\`\`\n\nEvaluate: ${condition.value}\n\nRespond with ONLY "yes" or "no".`
        const result = await executeWithProvider(evalAgent, goal, undefined, providerKeys)
        const answer = (result.output ?? '').trim().toLowerCase()
        return answer === 'yes' || answer === 'true'
      } catch (err) {
        console.warn('llm_evaluate condition failed', `${edge.from}->${edge.to}`, err)
        return false
      }
    }
    default:
      return false
  }
}

const findToolInRegistry = (registry: ToolRegistry, toolId?: string, toolName?: string) => {
  if (toolId) {
    for (const tool of registry.values()) {
      if (tool.toolId === toolId) {
        return tool
      }
    }
  }
  if (toolName) {
    return registry.get(toolName)
  }
  return undefined
}

const aggregateJoinOutputs = (
  entries: JoinBufferEntry[],
  mode: JoinAggregationMode = 'list'
): Record<string, unknown> | JoinBufferEntry[] => {
  if (mode === 'list') {
    return entries
  }

  const sorted = [...entries].sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))

  if (mode === 'ranked') {
    return { experts: sorted }
  }

  const consensus = sorted
    .map((entry) => `(${entry.agentName ?? 'Expert'}) ${entry.output}`)
    .join('\n\n')

  return {
    consensus,
    dissent: [],
    experts: sorted,
  }
}

const getHumanInputResponse = (
  nodeId: string,
  context?: Record<string, unknown>
): string | null => {
  const raw = context?.humanInput
  if (typeof raw === 'string') return raw
  if (raw && typeof raw === 'object') {
    const payload = raw as { nodeId?: string; response?: string }
    if (payload.nodeId === nodeId && typeof payload.response === 'string') {
      return payload.response
    }
  }
  return null
}

const getDeepResearchRequestId = (
  node: WorkflowNode,
  workflowState: WorkflowState
): string | null => {
  const outputKey = node.outputKey ?? node.id
  const existing = workflowState.namedOutputs?.[outputKey]
  if (typeof existing === 'string' && existing.startsWith('research:')) {
    return existing
  }
  if (existing && typeof existing === 'object' && 'requestId' in existing) {
    return (existing as DeepResearchRequest).requestId
  }
  return null
}

type WorkflowStateWithResearch = WorkflowState & {
  pendingResearchRequestId?: string
  pendingResearchOutputKey?: string
}

type ResearchRequestConfig = NonNullable<WorkflowNode['requestConfig']> & {
  context?: Record<string, unknown>
}

type WorkflowWithProjectManager = Workflow & {
  projectManagerConfig?: {
    enabled?: boolean
  }
}

const buildProjectManagerContext = (
  workflow: Workflow,
  context?: Record<string, unknown>
): Record<string, unknown> => {
  const workflowWithPm = workflow as WorkflowWithProjectManager
  if (!workflowWithPm.projectManagerConfig?.enabled) return {}
  const existing = context?.projectManagerContext ?? context?.projectManager
  return {
    projectManager: {
      config: workflowWithPm.projectManagerConfig,
      context: existing,
    },
  }
}

export async function executeGraphWorkflow(
  workflow: Workflow,
  agents: AgentConfig[],
  run: Run,
  apiKeys: ProviderKeys,
  userId?: string,
  runId?: string,
  eventWriter?: RunEventWriter,
  toolRegistry?: ToolRegistry,
  searchToolKeys?: SearchToolKeys
): Promise<WorkflowExecutionResult> {
  if (!workflow.workflowGraph) {
    throw new Error('Graph workflow configuration missing from workflow')
  }

  const db = getFirestore()
  const graphDef = workflow.workflowGraph
  const graph = new Graph({ directed: true })

  graphDef.nodes.forEach((node) => graph.setNode(node.id, node))
  graphDef.edges.forEach((edge) => graph.setEdge(edge.from, edge.to, edge))

  const nodeById = new Map<string, WorkflowNode>(graphDef.nodes.map((node) => [node.id, node]))

  const agentsById = new Map<string, AgentConfig>(agents.map((agent) => [agent.agentId, agent]))

  const runWorkflowState = run.workflowState as WorkflowStateWithResearch | undefined
  const workflowState: WorkflowStateWithResearch = {
    currentNodeId: runWorkflowState?.currentNodeId,
    pendingNodes: runWorkflowState?.pendingNodes ?? [graphDef.startNodeId],
    visitedCount: runWorkflowState?.visitedCount ?? {},
    edgeHistory: runWorkflowState?.edgeHistory ?? [],
    joinOutputs: runWorkflowState?.joinOutputs ?? {},
    namedOutputs: runWorkflowState?.namedOutputs ?? {},
    pendingResearchRequestId: runWorkflowState?.pendingResearchRequestId,
    pendingResearchOutputKey: runWorkflowState?.pendingResearchOutputKey,
  }
  if (run.status !== 'paused') {
    delete workflowState.pendingResearchRequestId
    delete workflowState.pendingResearchOutputKey
  }

  const joinBuffers = new Map<string, JoinBufferEntry[]>()
  let stepCount = 0
  let totalTokensUsed = 0
  let totalEstimatedCost = 0
  const steps: AgentExecutionStep[] = []
  let lastOutput: unknown = run.output

  const maxIterations = workflow.maxIterations ?? 10
  const maxNodeVisits = graphDef.limits?.maxNodeVisits ?? maxIterations
  const maxEdgeRepeats = graphDef.limits?.maxEdgeRepeats ?? maxIterations
  const edgeRepeatCount: Record<string, number> = {}

  const updateWorkflowState = async () => {
    if (!userId || !runId) return
    await db.doc(`users/${userId}/workflows/${workflow.workflowId}/runs/${runId}`).update({
      workflowState,
    })
  }

  const addWorkflowStep = async (params: {
    node: WorkflowNode
    output?: unknown
    error?: string
    startedAtMs: number
    completedAtMs?: number
  }) => {
    if (!userId || !runId) return
    const docRef = db
      .collection('users')
      .doc(userId)
      .collection('runs')
      .doc(runId)
      .collection('workflowSteps')
      .doc()

    await docRef.set({
      workflowStepId: docRef.id,
      runId,
      workflowId: workflow.workflowId,
      userId,
      nodeId: params.node.id,
      nodeType: params.node.type,
      output: params.output,
      error: params.error,
      startedAtMs: params.startedAtMs,
      completedAtMs: params.completedAtMs,
      durationMs: params.completedAtMs ? params.completedAtMs - params.startedAtMs : undefined,
    })
  }

  while (workflowState.pendingNodes && workflowState.pendingNodes.length > 0) {
    if (stepCount >= maxIterations) {
      throw new Error(`Graph execution exceeded max iterations (${maxIterations})`)
    }

    const readyNodes = [...workflowState.pendingNodes]
    const waitingNode = readyNodes.find((nodeId) => {
      const node = nodeById.get(nodeId)
      return node?.type === 'human_input' && !getHumanInputResponse(nodeId, run.context)
    })

    if (waitingNode) {
      const waitingNodeDef = nodeById.get(waitingNode)
      const prompt = waitingNodeDef?.label ?? 'Additional input required'
      workflowState.currentNodeId = waitingNode
      await updateWorkflowState()
      return {
        output: run.output ?? '',
        steps,
        totalTokensUsed,
        totalEstimatedCost,
        totalSteps: stepCount,
        status: 'waiting_for_input',
        pendingInput: { prompt, nodeId: waitingNode },
        workflowState,
      }
    }

    workflowState.pendingNodes = []

    type NodeResult = { node: WorkflowNode; output: unknown }
    const batchResults: Array<NodeResult | WorkflowExecutionResult> = await Promise.all(
      readyNodes.map(async (nodeId) => {
        const node = nodeById.get(nodeId)
        if (!node) {
          throw new Error(`Workflow node ${nodeId} not found`)
        }

        workflowState.currentNodeId = nodeId
        workflowState.visitedCount![nodeId] = (workflowState.visitedCount![nodeId] ?? 0) + 1
        if (workflowState.visitedCount![nodeId] > maxNodeVisits) {
          throw new Error(`Node ${nodeId} exceeded max visits (${maxNodeVisits})`)
        }

        const startedAtMs = Date.now()
        let output: unknown = null

        if (node.type === 'end') {
          await addWorkflowStep({ node, output, startedAtMs, completedAtMs: Date.now() })
          return { node, output }
        }

        if (node.type === 'human_input') {
          const response = getHumanInputResponse(nodeId, run.context)
          if (!response) {
            await addWorkflowStep({ node, output: null, startedAtMs })
            return { node, output: null }
          }
          output = response
          lastOutput = response
          workflowState.namedOutputs![node.outputKey ?? nodeId] = response
          await addWorkflowStep({ node, output, startedAtMs, completedAtMs: Date.now() })
          return { node, output }
        }

        if (node.type === 'research_request') {
          if (!userId || !runId) {
            throw new Error('Research request nodes require userId and runId')
          }
          if (!node.requestConfig) {
            throw new Error(`Research request node ${nodeId} is missing requestConfig`)
          }

          const requestConfig = node.requestConfig as ResearchRequestConfig
          const topic = requestConfig.topic.trim()
          const questions = normalizeResearchQuestions(requestConfig.questions ?? [])
          const priorityInput = requestConfig.priority ?? 'medium'
          const priority = ['low', 'medium', 'high', 'critical'].includes(priorityInput)
            ? (priorityInput as DeepResearchRequest['priority'])
            : 'medium'
          const estimatedTime =
            typeof requestConfig.estimatedTime === 'string' && requestConfig.estimatedTime.trim()
              ? requestConfig.estimatedTime.trim()
              : undefined
          const extraContext =
            requestConfig.context && typeof requestConfig.context === 'object'
              ? requestConfig.context
              : undefined

          if (!topic) {
            throw new Error('Research topic is required')
          }
          if (questions.length === 0) {
            throw new Error('At least one research question is required')
          }
          assertValidResearchContext(extraContext)

          const outputKey = node.outputKey ?? nodeId
          const existingRequestId = getDeepResearchRequestId(node, workflowState)
          let request: DeepResearchRequest | null = null

          if (existingRequestId) {
            const requestDoc = await db
              .doc(
                `users/${userId}/workflows/${workflow.workflowId}/deepResearchRequests/${existingRequestId}`
              )
              .get()
            if (requestDoc.exists) {
              request = requestDoc.data() as DeepResearchRequest
            }
          }

          if (!request) {
            const createdBy = node.agentId ?? agents[0]?.agentId
            if (!createdBy) {
              throw new Error('No agent available to attribute research request')
            }
            const requestId = `research:${randomUUID()}` as DeepResearchRequest['requestId']
            const createdRequest: DeepResearchRequest = {
              requestId,
              workflowId: workflow.workflowId,
              runId: run.runId,
              userId,
              topic,
              questions,
              context: extraContext,
              priority,
              estimatedTime,
              createdBy,
              createdAtMs: Date.now(),
              status: 'pending',
              results: [],
            }

            await db
              .doc(
                `users/${userId}/workflows/${workflow.workflowId}/deepResearchRequests/${requestId}`
              )
              .set(createdRequest)
            request = createdRequest
          }

          if (!request) {
            throw new Error('Research request unavailable after creation')
          }

          output = request
          lastOutput = request
          workflowState.namedOutputs![outputKey] = request
          await addWorkflowStep({ node, output, startedAtMs, completedAtMs: Date.now() })

          if (requestConfig.waitForCompletion && request.status !== 'completed') {
            workflowState.currentNodeId = nodeId
            workflowState.pendingNodes = [nodeId]
            workflowState.pendingResearchRequestId = request.requestId
            workflowState.pendingResearchOutputKey = outputKey
            await updateWorkflowState()
            return {
              output: run.output ?? '',
              steps,
              totalTokensUsed,
              totalEstimatedCost,
              totalSteps: stepCount,
              status: 'paused',
              workflowState,
            }
          }

          delete workflowState.pendingResearchRequestId
          delete workflowState.pendingResearchOutputKey
          return { node, output }
        }

        if (node.type === 'join') {
          const buffer = joinBuffers.get(nodeId) ?? []
          const aggregation = aggregateJoinOutputs(buffer, node.aggregationMode ?? 'list')
          output = aggregation
          lastOutput = aggregation
          workflowState.joinOutputs![nodeId] = aggregation
          if (node.outputKey) {
            workflowState.namedOutputs![node.outputKey] = aggregation
          }
          joinBuffers.delete(nodeId)
          await addWorkflowStep({ node, output, startedAtMs, completedAtMs: Date.now() })
          return { node, output }
        }

        if (node.type === 'tool') {
          if (!toolRegistry) {
            throw new Error('Tool registry unavailable for tool node execution')
          }
          const tool = findToolInRegistry(
            toolRegistry,
            node.toolId ? String(node.toolId) : undefined,
            node.label ?? node.id
          )
          if (!tool) {
            throw new Error(`Tool ${node.toolId ?? node.id} not found in registry`)
          }
          const agent =
            (node.agentId && agentsById.get(node.agentId)) ??
            (workflow.defaultAgentId && agentsById.get(workflow.defaultAgentId)) ??
            agents[0]
          if (!agent) {
            throw new Error('No agent available for tool execution context')
          }

          const toolContext = {
            userId: userId ?? '',
            agentId: agent.agentId,
            workflowId: workflow.workflowId,
            runId: runId ?? '',
            provider: agent.modelProvider,
            modelName: agent.modelName,
            iteration: stepCount + 1,
            eventWriter,
            toolRegistry,
            searchToolKeys,
          }

          const toolResult = await tool.execute({}, toolContext)
          output = toolResult
          lastOutput = toolResult
          workflowState.namedOutputs![node.outputKey ?? nodeId] = toolResult
          await addWorkflowStep({ node, output, startedAtMs, completedAtMs: Date.now() })
          return { node, output }
        }

        const agent = node.agentId ? agentsById.get(node.agentId) : agents[0]
        if (!agent) {
          throw new Error(`Agent not found for node ${nodeId}`)
        }

        const toolContext =
          userId && runId
            ? {
                userId,
                agentId: agent.agentId,
                workflowId: workflow.workflowId,
                runId,
                eventWriter,
                toolRegistry,
                searchToolKeys,
              }
            : undefined

        const streamContext: StreamContext | undefined =
          eventWriter && toolContext
            ? {
                eventWriter,
                agentId: agent.agentId,
                agentName: agent.name,
                step: stepCount + 1,
              }
            : undefined

        if (eventWriter && toolContext) {
          await eventWriter.writeEvent({
            type: 'status',
            workflowId: workflow.workflowId,
            agentId: agent.agentId,
            agentName: agent.name,
            status: `node_start:${nodeId}`,
          })
        }

        const nodeContext = {
          ...run.context,
          ...buildProjectManagerContext(workflow, run.context),
          workflowState: {
            namedOutputs: workflowState.namedOutputs ?? {},
            joinOutputs: workflowState.joinOutputs ?? {},
            lastOutput,
          },
        }

        const result = streamContext
          ? await executeWithProviderStreaming(
              agent,
              run.goal,
              nodeContext,
              apiKeys,
              toolContext,
              streamContext
            )
          : await executeWithProvider(agent, run.goal, nodeContext, apiKeys, toolContext)

        output = result.output
        lastOutput = result.output
        totalTokensUsed += result.tokensUsed
        totalEstimatedCost += result.estimatedCost

        steps.push({
          agentId: agent.agentId,
          agentName: agent.name,
          output: result.output,
          tokensUsed: result.tokensUsed,
          estimatedCost: result.estimatedCost,
          provider: result.provider,
          model: result.model,
          executedAtMs: Date.now(),
        })

        if (eventWriter && toolContext) {
          await eventWriter.flushTokens({
            workflowId: workflow.workflowId,
            agentId: agent.agentId,
            agentName: agent.name,
            provider: result.provider,
            model: result.model,
            step: stepCount + 1,
          })
          await eventWriter.writeEvent({
            type: 'status',
            workflowId: workflow.workflowId,
            agentId: agent.agentId,
            agentName: agent.name,
            status: `node_done:${nodeId}`,
          })
        }

        if (node.outputKey) {
          workflowState.namedOutputs![node.outputKey] = result.output
        }

        await addWorkflowStep({
          node,
          output: result.output,
          startedAtMs,
          completedAtMs: Date.now(),
        })

        return { node, output: result.output }
      })
    )

    const pausedResult = batchResults.find(
      (result): result is WorkflowExecutionResult => !('node' in result)
    )
    if (pausedResult) {
      return pausedResult
    }

    const nodeResults = batchResults as NodeResult[]

    stepCount += nodeResults.length

    const conditionData = {
      lastAgentOutput: lastOutput,
      namedOutput: workflowState.namedOutputs ?? {},
      toolResult: undefined,
      runContext: run.context ?? {},
      joinOutputs: workflowState.joinOutputs ?? {},
    }

    const nextNodes = new Set<string>()

    for (const result of nodeResults) {
      if (result.node.type === 'end') {
        continue
      }

      const edges =
        (graph.outEdges(result.node.id) as Array<{ v: string; w: string }> | undefined) ?? []
      const edgeValues = edges.map((edge) => graph.edge(edge) as WorkflowEdge)
      const evaluationResults = await Promise.all(
        edgeValues.map(async (edge) => ({
          edge,
          match: await evaluateCondition(edge, conditionData, apiKeys),
        }))
      )
      const matches = evaluationResults.filter((r) => r.match).map((r) => r.edge)

      for (const edge of matches) {
        const edgeKey = `${edge.from}->${edge.to}`
        edgeRepeatCount[edgeKey] = (edgeRepeatCount[edgeKey] ?? 0) + 1
        if (edgeRepeatCount[edgeKey] > maxEdgeRepeats) {
          throw new Error(`Edge ${edgeKey} exceeded max repeats (${maxEdgeRepeats})`)
        }

        workflowState.edgeHistory?.push({
          from: edge.from,
          to: edge.to,
          atMs: Date.now(),
        })

        const targetNode = nodeById.get(edge.to)
        if (!targetNode) {
          throw new Error(`Workflow node ${edge.to} not found`)
        }

        if (targetNode.type === 'join') {
          const buffer = joinBuffers.get(edge.to) ?? []
          buffer.push({
            agentId: result.node.type === 'agent' ? (result.node.agentId ?? undefined) : undefined,
            agentName:
              result.node.type === 'agent'
                ? agentsById.get(result.node.agentId ?? '')?.name
                : result.node.label,
            role:
              result.node.type === 'agent'
                ? agentsById.get(result.node.agentId ?? '')?.role
                : undefined,
            output:
              typeof result.output === 'string' ? result.output : JSON.stringify(result.output),
          })
          joinBuffers.set(edge.to, buffer)

          const incomingCount = graph.inEdges(edge.to)?.length ?? 0
          if (buffer.length >= incomingCount) {
            nextNodes.add(edge.to)
          }
        } else {
          nextNodes.add(edge.to)
        }
      }
    }

    workflowState.pendingNodes = Array.from(nextNodes)
    await updateWorkflowState()
  }

  return {
    output: typeof lastOutput === 'string' ? lastOutput : JSON.stringify(lastOutput ?? ''),
    steps,
    totalTokensUsed,
    totalEstimatedCost,
    totalSteps: stepCount,
    status: 'completed',
    workflowState,
  }
}

/**
 * Main workflow executor that routes to appropriate workflow type
 *
 * @param userId User ID
 * @param workflow Workflow configuration
 * @param run Run configuration
 * @param apiKeys Provider API keys
 * @returns Workflow execution result
 */
export async function executeWorkflow(
  userId: string,
  workflow: Workflow,
  run: Run,
  apiKeys: ProviderKeys,
  eventWriter?: RunEventWriter,
  toolRegistry?: ToolRegistry,
  searchToolKeys?: SearchToolKeys
): Promise<WorkflowExecutionResult> {
  const db = getFirestore()

  // Load all agents in the workflow
  const agentDocs = await Promise.all(
    workflow.agentIds.map((agentId) => db.doc(`users/${userId}/agents/${agentId}`).get())
  )

  const agents = agentDocs.filter((doc) => doc.exists).map((doc) => doc.data() as AgentConfig)

  if (agents.length === 0) {
    throw new Error('No agents found in workflow')
  }

  const promptConfig = workflow.promptConfig
  const promptResolutionErrors: Run['promptResolutionErrors'] = []
  const runRef = db.doc(`users/${userId}/workflows/${workflow.workflowId}/runs/${run.runId}`)
  let tonePrompt: string | undefined
  if (promptConfig?.toneOfVoicePrompt) {
    try {
      tonePrompt = await resolvePrompt(userId, promptConfig.toneOfVoicePrompt, {
        goal: run.goal,
        workflowId: workflow.workflowId,
        workflowName: workflow.name,
        runId: run.runId,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      log.warn('Unable to resolve tone-of-voice prompt', { error: message })
      promptResolutionErrors.push({
        agentId: 'tone_of_voice',
        promptType: 'tone-of-voice',
        error: message,
      })
      await eventWriter?.writeEvent({
        type: 'status',
        workflowId: workflow.workflowId,
        status: 'prompt_resolution_failed',
        details: { agentId: 'tone_of_voice', error: message },
      })
    }
  }

  const resolvedAgents = await Promise.all(
    agents.map(async (agent) => {
      const reference = promptConfig?.agentPrompts?.[agent.agentId]
      if (!reference && !tonePrompt) {
        return agent
      }
      try {
        const resolvedPrompt = reference
          ? await resolvePrompt(userId, reference, {
              goal: run.goal,
              workflowId: workflow.workflowId,
              workflowName: workflow.name,
              runId: run.runId,
              agentName: agent.name,
              agentId: agent.agentId,
            })
          : (agent.systemPrompt ?? '')
        const mergedPrompt = tonePrompt
          ? `${resolvedPrompt}\n\nTONE OF VOICE:\n${tonePrompt}`
          : resolvedPrompt
        return {
          ...agent,
          systemPrompt: mergedPrompt,
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        log.warn('Unable to resolve prompt for agent', { agentId: agent.agentId, error: message })
        promptResolutionErrors.push({
          agentId: agent.agentId,
          promptType: 'agent',
          error: message,
        })
        await eventWriter?.writeEvent({
          type: 'status',
          workflowId: workflow.workflowId,
          status: 'prompt_resolution_failed',
          details: { agentId: agent.agentId, error: message },
        })
        return agent
      }
    })
  )

  if (promptResolutionErrors.length > 0) {
    await runRef.update({ promptResolutionErrors })
  }

  // Strip research tools when skipResearch flag is set in run context
  const RESEARCH_TOOL_IDS = new Set([
    'tool:serp_search',
    'tool:semantic_search',
    'tool:search_scholar',
    'tool:search_web',
    'tool:read_url',
    'tool:scrape_url',
    'tool:crawl_website',
    'tool:map_website',
  ])

  const skipResearch =
    run.context && typeof run.context === 'object'
      ? (run.context as Record<string, unknown>).skipResearch === true
      : false

  const finalAgents = skipResearch
    ? resolvedAgents.map((agent) => ({
        ...agent,
        toolIds: (agent.toolIds ?? []).filter((id) => !RESEARCH_TOOL_IDS.has(id)),
        systemPrompt: agent.systemPrompt
          ? agent.systemPrompt +
            '\n\nIMPORTANT: Research tools are disabled for this run. Do NOT attempt to use search tools. Generate your analysis using only the provided context and your existing knowledge.'
          : agent.systemPrompt,
      }))
    : resolvedAgents

  if (skipResearch) {
    log.info('skipResearch enabled — stripped research tools', {
      agentCount: resolvedAgents.length,
    })
  }

  // Use LangGraph for supported workflow types when enabled
  if (USE_LANGGRAPH && isLangGraphSupported(workflow.workflowType)) {
    log.info('Executing workflow using LangGraph', { workflowType: workflow.workflowType })

    const langGraphConfig: LangGraphExecutionConfig = {
      workflow,
      agents: finalAgents,
      apiKeys,
      userId,
      runId: run.runId,
      eventWriter,
      toolRegistry,
      searchToolKeys,
      executionMode: run.executionMode,
      tierOverride: run.tierOverride,
      workflowCriticality: workflow.criticality,
    }

    const result = await executeLangGraphWorkflow(langGraphConfig, run.goal, run.context)

    return {
      output: result.output,
      steps: result.steps,
      totalTokensUsed: result.totalTokensUsed,
      totalEstimatedCost: result.totalEstimatedCost,
      totalSteps: result.totalSteps,
      status: result.status,
      pendingInput: result.pendingInput,
      constraintPause: result.constraintPause,
      workflowState: result.workflowState,
      error: result.error,
    }
  }

  // Legacy executors (fallback when LangGraph is disabled or unsupported)
  // Route to appropriate workflow executor
  switch (workflow.workflowType) {
    case 'sequential':
      log.info('Executing sequential workflow (legacy)')
      return executeSequentialWorkflow(
        workflow,
        finalAgents,
        run.goal,
        run.context,
        apiKeys,
        workflow.maxIterations,
        userId,
        run.runId,
        eventWriter,
        toolRegistry,
        searchToolKeys
      )

    case 'parallel':
      log.info('Executing parallel workflow (legacy)')
      return executeParallelWorkflow(
        workflow,
        finalAgents,
        run.goal,
        run.context,
        apiKeys,
        userId,
        run.runId,
        eventWriter,
        toolRegistry,
        searchToolKeys
      )

    case 'supervisor': {
      log.info('Executing supervisor workflow (legacy)')
      if (finalAgents.length < 2) {
        throw new Error('Supervisor workflow requires at least 2 agents (1 supervisor + 1 worker)')
      }
      // First agent is supervisor, rest are workers
      const supervisorAgent = finalAgents[0]
      const workerAgents = finalAgents.slice(1)
      return executeSupervisorWorkflow(
        workflow,
        supervisorAgent,
        workerAgents,
        run.goal,
        run.context,
        apiKeys,
        workflow.maxIterations,
        userId,
        run.runId,
        eventWriter,
        toolRegistry,
        searchToolKeys
      )
    }

    case 'custom':
      if (workflow.workflowGraph) {
        log.info('Executing custom workflow via graph engine')
        return executeGraphWorkflow(
          workflow,
          finalAgents,
          run,
          apiKeys,
          userId,
          run.runId,
          eventWriter,
          toolRegistry,
          searchToolKeys
        )
      }
      log.info('Custom workflow has no graph, falling back to sequential')
      return executeSequentialWorkflow(
        workflow,
        finalAgents,
        run.goal,
        run.context,
        apiKeys,
        workflow.maxIterations,
        userId,
        run.runId,
        eventWriter,
        toolRegistry,
        searchToolKeys
      )

    case 'graph':
      log.info('Executing graph workflow (legacy)')
      return executeGraphWorkflow(
        workflow,
        finalAgents,
        run,
        apiKeys,
        userId,
        run.runId,
        eventWriter,
        toolRegistry,
        searchToolKeys
      )

    default:
      throw new Error(`Unsupported workflow type: ${workflow.workflowType}`)
  }
}
