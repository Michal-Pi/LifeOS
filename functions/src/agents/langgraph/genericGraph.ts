/**
 * Generic Graph Workflow
 *
 * Implements user-defined graph topology execution using LangGraph.
 * Supports conditional edges, join nodes, human input, and research requests.
 *
 * Key improvements:
 * - Uses executeAgentWithEvents utility for consistent agent execution
 * - Phase 15: human_approval node type for pause/resume approval flows
 * - Phase 16: Graceful loop termination, budget guardrails, error recovery edges
 */

import { StateGraph, END, START, Annotation } from '@langchain/langgraph'
import type {
  AgentConfig,
  DeepResearchRequest,
  Run,
  Workflow,
  WorkflowEdge,
  WorkflowGraph,
} from '@lifeos/agents'
import type {
  UnifiedWorkflowState,
  AgentExecutionStep,
  JoinBufferEntry,
  WorkflowExecutionMode,
  ModelTier,
  WorkflowCriticality,
} from '@lifeos/agents'
import type { ProviderKeys } from '../providerService.js'
import type { RunEventWriter } from '../runEvents.js'
import type { SearchToolKeys } from '../providerKeys.js'
import type { ToolRegistry } from '../toolExecutor.js'
import { getFirestore } from 'firebase-admin/firestore'
import { randomUUID } from 'crypto'
import jsonLogic from 'json-logic-js'
import { createLogger } from '../../lib/logger.js'
import { createFirestoreCheckpointer } from './firestoreCheckpointer.js'
import { executeAgentWithEvents, handleAskUserInterrupt, type AgentExecutionContext } from './utils.js'
import { parseStructuredPlan, createTodosFromPlan } from '../planToTodos.js'

const log = createLogger('GenericGraph')

/**
 * Resolve {{variable}} placeholders in text using provided parameter values.
 * Unresolved placeholders are left as-is.
 */
export function resolveTemplateParameters(
  text: string,
  parameters: Record<string, string>
): string {
  return text.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return parameters[key] ?? match
  })
}

/**
 * Configuration for generic graph creation
 */
export interface GenericGraphConfig {
  workflow: Workflow
  graphDef: WorkflowGraph
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
 * State annotation for generic graph workflows
 */
export const GenericGraphStateAnnotation = Annotation.Root({
  // Core state
  workflowId: Annotation<string>,
  runId: Annotation<string>,
  userId: Annotation<string>,
  goal: Annotation<string>,
  context: Annotation<Record<string, unknown>>,

  // Graph execution state
  currentNodeId: Annotation<string | null>,
  visitedCount: Annotation<Record<string, number>>({
    reducer: (current: Record<string, number>, update: Record<string, number>) => {
      const result = { ...current }
      for (const [key, value] of Object.entries(update)) {
        result[key] = (result[key] ?? 0) + value
      }
      return result
    },
    default: () => ({}),
  }),
  edgeHistory: Annotation<Array<{ from: string; to: string; atMs: number }>>({
    reducer: (
      current: Array<{ from: string; to: string; atMs: number }>,
      update: Array<{ from: string; to: string; atMs: number }>
    ) => [...current, ...update],
    default: () => [],
  }),
  namedOutputs: Annotation<Record<string, unknown>>({
    reducer: (current: Record<string, unknown>, update: Record<string, unknown>) => ({
      ...current,
      ...update,
    }),
    default: () => ({}),
  }),
  joinOutputs: Annotation<Record<string, unknown>>({
    reducer: (current: Record<string, unknown>, update: Record<string, unknown>) => ({
      ...current,
      ...update,
    }),
    default: () => ({}),
  }),
  joinBuffers: Annotation<Record<string, JoinBufferEntry[]>>({
    reducer: (
      current: Record<string, JoinBufferEntry[]>,
      update: Record<string, JoinBufferEntry[]>
    ) => {
      const result = { ...current }
      for (const [key, entries] of Object.entries(update)) {
        result[key] = [...(result[key] ?? []), ...entries]
      }
      return result
    },
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
  lastOutput: Annotation<unknown>,
  finalOutput: Annotation<string | null>,

  // Status
  status: Annotation<UnifiedWorkflowState['status']>,
  error: Annotation<string | null>,

  // Error recovery (Phase 16)
  lastError: Annotation<string | null>,

  // Pending input
  pendingInput: Annotation<{ prompt: string; nodeId: string } | null>,

  // Constraint pause — workflow paused at a budget/iteration limit
  constraintPause: Annotation<{
    constraintType: string
    currentValue: number
    limitValue: number
    unit: string
    nodeId?: string
    partialOutput?: string
    suggestedIncrease?: number
  } | null>,

  // Research state
  pendingResearchRequestId: Annotation<string | null>,
  pendingResearchOutputKey: Annotation<string | null>,

  // Routing state (for conditional edges)
  nextNodeId: Annotation<string | null>,
})

export type GenericGraphState = typeof GenericGraphStateAnnotation.State

/**
 * Evaluate an edge condition
 */
function evaluateCondition(edge: WorkflowEdge, data: Record<string, unknown>): boolean {
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
    case 'error':
      // Error edges are handled separately in routing, not via evaluateCondition
      return false
    default:
      return false
  }
}

/**
 * Resolve a dotted path to a value in data
 */
function resolveConditionValue(path: string | undefined, data: Record<string, unknown>): unknown {
  if (!path) return undefined
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object' && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key]
    }
    return undefined
  }, data)
}

/**
 * Aggregate join buffer entries
 */
function aggregateJoinOutputs(
  entries: JoinBufferEntry[],
  mode: string = 'list'
): Record<string, unknown> | JoinBufferEntry[] {
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

/**
 * Create a generic graph workflow
 *
 * This dynamically creates a LangGraph based on the user-defined WorkflowGraph.
 */
export function createGenericGraph(config: GenericGraphConfig) {
  const {
    workflow,
    graphDef,
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

  const db = getFirestore()
  const agentsById = new Map(agents.map((a) => [a.agentId, a]))
  const nodeById = new Map(graphDef.nodes.map((n) => [n.id, n]))

  // Build edge index
  const edgesFromNode = new Map<string, WorkflowEdge[]>()
  for (const edge of graphDef.edges) {
    const existing = edgesFromNode.get(edge.from) ?? []
    existing.push(edge)
    edgesFromNode.set(edge.from, existing)
  }

  const maxNodeVisits = graphDef.limits?.maxNodeVisits ?? workflow.maxIterations ?? 10

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

  /**
   * Build joinBuffers entries for any outgoing edges that target a join node.
   * Must be called from node handlers (not routing functions) so the reducer processes the update.
   */
  function buildJoinBufferUpdate(
    nodeId: string,
    agentId?: string,
    agentName?: string,
    output?: unknown
  ): Partial<Pick<GenericGraphState, 'joinBuffers'>> {
    const entries: Record<string, JoinBufferEntry[]> = {}
    for (const edge of edgesFromNode.get(nodeId) ?? []) {
      const target = nodeById.get(edge.to)
      if (target?.type === 'join') {
        entries[edge.to] = [
          {
            agentId,
            agentName,
            output: typeof output === 'string' ? output : JSON.stringify(output),
          },
        ]
      }
    }
    return Object.keys(entries).length > 0 ? { joinBuffers: entries } : {}
  }

  // Create the state graph
  const graph = new StateGraph(GenericGraphStateAnnotation)

  // Create a node for each workflow node
  for (const node of graphDef.nodes) {
    graph.addNode(node.id, async (state: GenericGraphState) => {
      // Phase 16: Graceful loop termination — pause and ask user
      const currentVisits = (state.visitedCount[node.id] ?? 0) + 1
      const constraintOverride = state.context.constraintOverride as
        | { type: string; newLimit?: number }
        | undefined

      // Validate constraint override bounds
      const MAX_NODE_VISITS_CAP = 100
      const MAX_BUDGET_CAP = 100 // $100 USD absolute cap
      if (constraintOverride?.newLimit !== undefined) {
        if (constraintOverride.type === 'max_node_visits') {
          constraintOverride.newLimit = Math.min(
            Math.max(constraintOverride.newLimit, maxNodeVisits),
            MAX_NODE_VISITS_CAP
          )
        } else if (constraintOverride.type === 'budget') {
          constraintOverride.newLimit = Math.min(
            Math.max(constraintOverride.newLimit, workflow.maxBudget ?? 0),
            MAX_BUDGET_CAP
          )
        }
      }

      if (currentVisits > maxNodeVisits) {
        // Check if user already increased the limit
        const effectiveLimit =
          constraintOverride?.type === 'max_node_visits' && constraintOverride.newLimit
            ? constraintOverride.newLimit
            : maxNodeVisits
        if (currentVisits > effectiveLimit) {
          log.info(`Node ${node.id} hit visit limit (${effectiveLimit}), pausing for user decision`)
          return {
            currentNodeId: node.id,
            visitedCount: { [node.id]: 1 },
            status: 'waiting_for_input' as const,
            constraintPause: {
              constraintType: 'max_node_visits',
              currentValue: currentVisits,
              limitValue: effectiveLimit,
              unit: 'visits',
              nodeId: node.id,
              partialOutput: typeof state.lastOutput === 'string'
                ? state.lastOutput.slice(0, 2000)
                : undefined,
              suggestedIncrease: effectiveLimit * 2,
            },
            pendingInput: {
              prompt: `Node "${node.id}" has been visited ${currentVisits} times (limit: ${effectiveLimit}). This may indicate a loop. Would you like to increase the limit or stop?`,
              nodeId: node.id,
            },
            nextNodeId: null,
          }
        }
      }

      // Phase 16: Budget guardrail — pause and ask user
      if (workflow.maxBudget && state.totalEstimatedCost > workflow.maxBudget) {
        const effectiveBudget =
          constraintOverride?.type === 'budget' && constraintOverride.newLimit
            ? constraintOverride.newLimit
            : workflow.maxBudget
        if (state.totalEstimatedCost > effectiveBudget) {
          log.info('Budget limit reached, pausing for user decision', {
            cost: state.totalEstimatedCost,
            budget: effectiveBudget,
          })
          return {
            currentNodeId: node.id,
            visitedCount: { [node.id]: 1 },
            status: 'waiting_for_input' as const,
            constraintPause: {
              constraintType: 'budget',
              currentValue: parseFloat(state.totalEstimatedCost.toFixed(4)),
              limitValue: effectiveBudget,
              unit: 'USD',
              nodeId: node.id,
              partialOutput: typeof state.lastOutput === 'string'
                ? state.lastOutput.slice(0, 2000)
                : undefined,
              suggestedIncrease: effectiveBudget * 2,
            },
            pendingInput: {
              prompt: `Budget limit reached: $${state.totalEstimatedCost.toFixed(4)} spent of $${effectiveBudget} budget. Would you like to increase the budget or stop with current results?`,
              nodeId: node.id,
            },
            nextNodeId: null,
          }
        }
      }

      const baseUpdate: Partial<GenericGraphState> = {
        currentNodeId: node.id,
        visitedCount: { [node.id]: 1 },
      }

      // Handle different node types
      switch (node.type) {
        case 'end': {
          const finalOutput =
            typeof state.lastOutput === 'string'
              ? state.lastOutput
              : JSON.stringify(state.lastOutput ?? '')
          return {
            ...baseUpdate,
            status: 'completed' as const,
            finalOutput,
            nextNodeId: null,
          }
        }

        case 'human_input': {
          const humanInput = state.context.humanInput as
            | { nodeId?: string; response?: string }
            | string
            | undefined

          if (typeof humanInput === 'string') {
            return {
              ...baseUpdate,
              lastOutput: humanInput,
              namedOutputs: { [node.outputKey ?? node.id]: humanInput },
            }
          }

          if (humanInput && humanInput.nodeId === node.id && humanInput.response) {
            return {
              ...baseUpdate,
              lastOutput: humanInput.response,
              namedOutputs: { [node.outputKey ?? node.id]: humanInput.response },
            }
          }

          // No input yet - pause
          return {
            ...baseUpdate,
            status: 'waiting_for_input' as const,
            pendingInput: { prompt: node.label ?? 'Additional input required', nodeId: node.id },
            nextNodeId: null,
          }
        }

        case 'human_approval': {
          // Phase 15: Human-in-the-loop approval node
          const humanApproval = state.context.humanApproval as
            | { nodeId?: string; approved?: boolean; response?: string }
            | undefined

          if (humanApproval && humanApproval.nodeId === node.id) {
            if (humanApproval.approved) {
              // Approved — continue to next node
              return {
                ...baseUpdate,
                lastOutput: humanApproval.response ?? 'Approved',
                namedOutputs: {
                  [node.outputKey ?? node.id]: humanApproval.response ?? 'Approved',
                },
              }
            } else {
              // Rejected — terminate workflow
              return {
                ...baseUpdate,
                lastOutput: humanApproval.response ?? 'Rejected',
                namedOutputs: {
                  [node.outputKey ?? node.id]: humanApproval.response ?? 'Rejected',
                },
                status: 'completed' as const,
                finalOutput: humanApproval.response ?? 'Workflow rejected by user',
                nextNodeId: null,
              }
            }
          }

          // No approval yet — pause and wait for input
          if (execContext.eventWriter) {
            await execContext.eventWriter.writeEvent({
              type: 'status',
              status: 'waiting_for_approval',
              details: {
                nodeId: node.id,
                prompt: node.label ?? 'Approval required',
                workflowId: workflow.workflowId,
              },
            })
          }

          return {
            ...baseUpdate,
            status: 'waiting_for_input' as const,
            pendingInput: { prompt: node.label ?? 'Approval required', nodeId: node.id },
            nextNodeId: null,
          }
        }

        case 'join': {
          const buffer = state.joinBuffers[node.id] ?? []
          const aggregation = aggregateJoinOutputs(buffer, node.aggregationMode ?? 'list')

          // Clear the buffer for this node
          const updatedBuffers = { ...state.joinBuffers }
          delete updatedBuffers[node.id]

          return {
            ...baseUpdate,
            lastOutput: aggregation,
            joinOutputs: { [node.id]: aggregation },
            namedOutputs: node.outputKey ? { [node.outputKey]: aggregation } : {},
            joinBuffers: updatedBuffers,
          }
        }

        case 'fork': {
          // Fork distributes the current output to all downstream branches.
          // Each branch runs serially (LangGraph StateGraph doesn't support
          // true parallel branching). Branches converge at a join node.
          const forkOutput = typeof state.lastOutput === 'string'
            ? state.lastOutput
            : JSON.stringify(state.lastOutput ?? '')

          return {
            ...baseUpdate,
            lastOutput: forkOutput,
            namedOutputs: node.outputKey ? { [node.outputKey]: forkOutput } : {},
            ...buildJoinBufferUpdate(node.id, node.agentId, node.label, forkOutput),
          }
        }

        case 'tool': {
          if (!toolRegistry) {
            throw new Error('Tool registry unavailable for tool node execution')
          }

          let tool = toolRegistry.get(node.label ?? node.id)
          if (!tool && node.toolId) {
            for (const t of toolRegistry.values()) {
              if (t.toolId === node.toolId) {
                tool = t
                break
              }
            }
          }

          if (!tool) {
            throw new Error(`Tool ${node.toolId ?? node.id} not found in registry`)
          }

          const agent = (node.agentId && agentsById.get(node.agentId)) ?? agents[0]
          if (!agent) {
            throw new Error('No agent available for tool execution context')
          }

          const toolContext = {
            userId,
            agentId: agent.agentId,
            workflowId: workflow.workflowId,
            runId,
            provider: agent.modelProvider,
            modelName: agent.modelName,
            iteration: state.steps.length + 1,
            eventWriter,
            toolRegistry,
            searchToolKeys,
          }

          const toolResult = await tool.execute({}, toolContext)

          return {
            ...baseUpdate,
            ...buildJoinBufferUpdate(node.id, node.agentId, node.label, toolResult),
            lastOutput: toolResult,
            namedOutputs: { [node.outputKey ?? node.id]: toolResult },
          }
        }

        case 'research_request': {
          if (!node.requestConfig) {
            throw new Error(`Research request node ${node.id} is missing requestConfig`)
          }

          const { topic, questions, priority = 'medium', waitForCompletion } = node.requestConfig
          const outputKey = node.outputKey ?? node.id

          // Check for existing request
          const existingRequestId = state.pendingResearchRequestId
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
              runId: runId as DeepResearchRequest['runId'],
              userId,
              topic: topic.trim(),
              questions: questions.filter((q: string) => q.trim()),
              priority: priority as DeepResearchRequest['priority'],
              createdBy: createdBy as DeepResearchRequest['createdBy'],
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

          if (waitForCompletion && request.status !== 'completed') {
            return {
              ...baseUpdate,
              status: 'paused' as const,
              lastOutput: request,
              namedOutputs: { [outputKey]: request },
              pendingResearchRequestId: request.requestId,
              pendingResearchOutputKey: outputKey,
              nextNodeId: null,
            }
          }

          return {
            ...baseUpdate,
            lastOutput: request,
            namedOutputs: { [outputKey]: request },
            pendingResearchRequestId: null,
            pendingResearchOutputKey: null,
          }
        }

        case 'agent':
        default: {
          const agent = node.agentId ? agentsById.get(node.agentId) : agents[0]
          if (!agent) {
            throw new Error(`Agent not found for node ${node.id}`)
          }

          // Phase 16: Error recovery — wrap agent execution in try/catch
          try {
            // Phase 17: Resolve template parameters in goal and agent context
            const templateParams = (state.context.templateParameters ?? {}) as Record<
              string,
              string
            >
            const resolvedGoal =
              Object.keys(templateParams).length > 0
                ? resolveTemplateParameters(state.goal, templateParams)
                : state.goal

            const nodeContext = {
              ...state.context,
              workflowState: {
                namedOutputs: state.namedOutputs ?? {},
                joinOutputs: state.joinOutputs ?? {},
                lastOutput: state.lastOutput,
              },
            }

            // Phase 17: Resolve template parameters in agent system prompt
            const resolvedAgent =
              Object.keys(templateParams).length > 0
                ? {
                    ...agent,
                    systemPrompt: resolveTemplateParameters(agent.systemPrompt, templateParams),
                  }
                : agent

            // Execute the agent using shared utility
            const step = await executeAgentWithEvents(
              resolvedAgent,
              resolvedGoal,
              nodeContext,
              execContext,
              {
                stepNumber: state.steps.length + 1,
                nodeId: node.id,
              }
            )

            // Check for ask_user interrupt
            const interrupt = handleAskUserInterrupt(step, node.id)
            if (interrupt) {
              return {
                ...baseUpdate,
                steps: [step],
                totalTokensUsed: step.tokensUsed,
                totalEstimatedCost: step.estimatedCost,
                ...interrupt,
              }
            }

            return {
              ...baseUpdate,
              ...buildJoinBufferUpdate(node.id, agent.agentId, agent.name, step.output),
              lastError: null, // Clear any previous error
              steps: [step],
              totalTokensUsed: step.tokensUsed,
              totalEstimatedCost: step.estimatedCost,
              lastOutput: step.output,
              namedOutputs: node.outputKey ? { [node.outputKey]: step.output } : {},
            }
          } catch (e) {
            const errorMsg = e instanceof Error ? e.message : String(e)
            const hasErrorEdge = (edgesFromNode.get(node.id) ?? []).some(
              (edge) => edge.condition.type === 'error'
            )

            if (hasErrorEdge) {
              // Follow error edge — store error and let routing handle it
              log.warn(`Agent node ${node.id} failed, following error edge`, { error: errorMsg })
              return {
                ...baseUpdate,
                ...buildJoinBufferUpdate(node.id, node.agentId, undefined, errorMsg),
                lastError: errorMsg,
                lastOutput: errorMsg,
                namedOutputs: node.outputKey ? { [node.outputKey]: errorMsg } : {},
              }
            }

            // No error edge — re-throw to fail the graph execution
            log.error(`Agent node ${node.id} failed with no error edge`, { error: errorMsg })
            throw new Error(`Workflow failed at node ${node.id}: ${errorMsg}`)
          }
        }
      }
    })
  }

  // Add conditional routing
  const routeFromNode = (nodeId: string) => {
    return (state: GenericGraphState) => {
      // Check if we should stop
      if (
        state.status === 'completed' ||
        state.status === 'paused' ||
        state.status === 'waiting_for_input' ||
        state.status === 'failed'
      ) {
        return END
      }

      if (state.nextNodeId === null) {
        return END
      }

      const node = nodeById.get(nodeId)
      if (!node || node.type === 'end') {
        return END
      }

      const edges = edgesFromNode.get(nodeId) ?? []
      if (edges.length === 0) {
        return END
      }

      // Phase 16: Error routing — if last node errored, find error edge
      if (state.lastError) {
        const errorEdge = edges.find((e) => e.condition.type === 'error')
        if (errorEdge) {
          return errorEdge.to
        }
        return END
      }

      const conditionData = {
        lastAgentOutput: state.lastOutput,
        namedOutput: state.namedOutputs ?? {},
        joinOutputs: state.joinOutputs ?? {},
        runContext: state.context ?? {},
      }

      // Find first matching edge (skip error edges in normal flow)
      for (const edge of edges) {
        if (edge.condition.type === 'error') continue
        if (evaluateCondition(edge, conditionData)) {
          // Check if target is a join node that needs more inputs
          const targetNode = nodeById.get(edge.to)
          if (targetNode?.type === 'join') {
            // Join buffer entries are populated by node handlers via buildJoinBufferUpdate.
            // Here we only read the buffer to check readiness.
            const incomingEdges = graphDef.edges.filter((e) => e.to === edge.to)
            const buffer = state.joinBuffers[edge.to] ?? []
            if (buffer.length < incomingEdges.length) {
              // Not ready yet, wait for more inputs
              continue
            }
          }

          return edge.to
        }
      }

      return END
    }
  }

  // Add edges with conditional routing
  // Note: Type assertions needed because LangGraph's strict typing requires compile-time node names
  graph.addEdge(START, graphDef.startNodeId as typeof START)

  for (const node of graphDef.nodes) {
    if (node.type === 'end') {
      graph.addEdge(node.id as typeof START, END)
    } else {
      const edges = edgesFromNode.get(node.id) ?? []
      // Nodes that can pause (human_approval, human_input) or have error edges
      // must always use conditional routing
      const requiresConditionalRouting =
        node.type === 'human_approval' ||
        node.type === 'human_input' ||
        edges.some((e) => e.condition.type === 'error')

      if (edges.length === 0) {
        graph.addEdge(node.id as typeof START, END)
      } else if (
        edges.length === 1 &&
        edges[0].condition.type === 'always' &&
        !requiresConditionalRouting &&
        !graphDef.limits // Phase 16 fix: use conditional routing when limits are set so guardrails can halt
      ) {
        // Simple edge (only when no limits — limits need routeFromNode to check status)
        graph.addEdge(node.id as typeof START, edges[0].to as typeof START)
      } else {
        // Conditional edges - LangGraph SDK type mismatch requires cast
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        graph.addConditionalEdges(node.id as typeof START, routeFromNode(node.id) as any)
      }
    }
  }

  // Auto-enable checkpointing when constraints are configured (so paused state is recoverable)
  const shouldCheckpoint =
    config.enableCheckpointing ??
    (workflow.maxBudget !== undefined || maxNodeVisits < Infinity)

  if (shouldCheckpoint) {
    const checkpointer = createFirestoreCheckpointer(userId, workflow.workflowId, runId)
    return graph.compile({ checkpointer })
  }

  return graph.compile()
}

/**
 * Execute a generic graph workflow using LangGraph
 */
export async function executeGenericGraphWorkflowLangGraph(
  config: GenericGraphConfig,
  goal: string,
  context?: Record<string, unknown>
): Promise<{
  output: string
  steps: AgentExecutionStep[]
  totalTokensUsed: number
  totalEstimatedCost: number
  totalSteps: number
  status: UnifiedWorkflowState['status']
  pendingInput?: { prompt: string; nodeId: string }
  constraintPause?: Run['constraintPause']
  workflowState?: Record<string, unknown>
}> {
  const { workflow, graphDef, userId, runId } = config

  const compiledGraph = createGenericGraph(config)

  // Initial state
  const initialState: Partial<GenericGraphState> = {
    workflowId: workflow.workflowId,
    runId,
    userId,
    goal,
    context: context ?? {},
    currentNodeId: null,
    visitedCount: {},
    edgeHistory: [],
    namedOutputs: {},
    joinOutputs: {},
    joinBuffers: {},
    steps: [],
    totalTokensUsed: 0,
    totalEstimatedCost: 0,
    lastOutput: null,
    finalOutput: null,
    status: 'running',
    error: null,
    lastError: null,
    pendingInput: null,
    pendingResearchRequestId: null,
    pendingResearchOutputKey: null,
    nextNodeId: graphDef.startNodeId,
  }

  // Execute the graph
  let finalState: typeof initialState
  try {
    finalState = await compiledGraph.invoke(initialState)
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e)
    log.error('Graph execution failed; any partial state accumulated before the error is lost', {
      error: errorMessage,
    })
    return {
      output: errorMessage,
      steps: [],
      totalTokensUsed: 0,
      totalEstimatedCost: 0,
      totalSteps: 0,
      status: 'failed' as const,
    }
  }

  // Phase 42: Auto-create todos from approved plans
  const output =
    finalState.finalOutput ??
    (typeof finalState.lastOutput === 'string'
      ? finalState.lastOutput
      : JSON.stringify(finalState.lastOutput ?? ''))

  if (
    typeof output === 'string' &&
    output.startsWith('APPROVED:') &&
    finalState.namedOutputs
  ) {
    // Look for a structured plan in named outputs from planner/improvement nodes
    const namedValues = Object.values(finalState.namedOutputs)
    for (const val of namedValues) {
      if (typeof val !== 'string') continue
      const plan = parseStructuredPlan(val)
      if (plan) {
        try {
          const db = getFirestore()
          const todoResult = await createTodosFromPlan(plan, userId, db)
          log.info('Created todos from approved plan', {
            created: todoResult.created,
            errors: todoResult.errors.length,
          })
          // Emit plan approved event
          if (config.eventWriter) {
            await config.eventWriter.writeEvent({
              type: 'plan_approved',
              workflowId: workflow.workflowId,
              details: {
                projectName: plan.projectName,
                taskCount: plan.milestones.reduce(
                  (sum, m) => sum + m.tasks.length,
                  0
                ),
              },
            })
          }
        } catch (err) {
          log.warn('Failed to create todos from plan', { error: String(err) })
        }
        break
      }
    }
  }

  return {
    output,
    steps: finalState.steps ?? [],
    totalTokensUsed: finalState.totalTokensUsed ?? 0,
    totalEstimatedCost: finalState.totalEstimatedCost ?? 0,
    totalSteps: finalState.steps?.length ?? 0,
    status: finalState.status ?? 'completed',
    pendingInput: finalState.pendingInput ?? undefined,
    constraintPause: (finalState.constraintPause ?? undefined) as Run['constraintPause'],
    workflowState: {
      currentNodeId: finalState.currentNodeId,
      pendingNodes: finalState.nextNodeId ? [finalState.nextNodeId] : [],
      visitedCount: finalState.visitedCount,
      edgeHistory: finalState.edgeHistory,
      joinOutputs: finalState.joinOutputs,
      namedOutputs: finalState.namedOutputs,
      pendingResearchRequestId: finalState.pendingResearchRequestId,
      pendingResearchOutputKey: finalState.pendingResearchOutputKey,
    },
  }
}
