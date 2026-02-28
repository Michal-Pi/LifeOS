/**
 * Generic Graph Workflow
 *
 * Implements user-defined graph topology execution using LangGraph.
 * Supports conditional edges, join nodes, human input, and research requests.
 *
 * Key improvements:
 * - Uses executeAgentWithEvents utility for consistent agent execution
 */

import { StateGraph, END, START, Annotation } from '@langchain/langgraph'
import type {
  AgentConfig,
  DeepResearchRequest,
  Workflow,
  WorkflowEdge,
  WorkflowGraph,
} from '@lifeos/agents'
import type { UnifiedWorkflowState, AgentExecutionStep, JoinBufferEntry } from '@lifeos/agents'
import type { ProviderKeys } from '../providerService.js'
import type { RunEventWriter } from '../runEvents.js'
import type { SearchToolKeys } from '../providerKeys.js'
import type { ToolRegistry } from '../toolExecutor.js'
import { getFirestore } from 'firebase-admin/firestore'
import { randomUUID } from 'crypto'
import jsonLogic from 'json-logic-js'
import { createFirestoreCheckpointer } from './firestoreCheckpointer.js'
import { executeAgentWithEvents, type AgentExecutionContext } from './utils.js'

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
}

/**
 * State annotation for generic graph workflows
 */
const GenericGraphStateAnnotation = Annotation.Root({
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

  // Pending input
  pendingInput: Annotation<{ prompt: string; nodeId: string } | null>,

  // Research state
  pendingResearchRequestId: Annotation<string | null>,
  pendingResearchOutputKey: Annotation<string | null>,

  // Routing state (for conditional edges)
  nextNodeId: Annotation<string | null>,
})

type GenericGraphState = typeof GenericGraphStateAnnotation.State

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
  }

  // Create the state graph
  const graph = new StateGraph(GenericGraphStateAnnotation)

  // Create a node for each workflow node
  for (const node of graphDef.nodes) {
    graph.addNode(node.id, async (state: GenericGraphState) => {
      // Check visit count
      const currentVisits = (state.visitedCount[node.id] ?? 0) + 1
      if (currentVisits > maxNodeVisits) {
        throw new Error(`Node ${node.id} exceeded max visits (${maxNodeVisits})`)
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

          const nodeContext = {
            ...state.context,
            workflowState: {
              namedOutputs: state.namedOutputs ?? {},
              joinOutputs: state.joinOutputs ?? {},
              lastOutput: state.lastOutput,
            },
          }

          // Execute the agent using shared utility
          const step = await executeAgentWithEvents(agent, state.goal, nodeContext, execContext, {
            stepNumber: state.steps.length + 1,
            nodeId: node.id,
          })

          return {
            ...baseUpdate,
            steps: [step],
            totalTokensUsed: step.tokensUsed,
            totalEstimatedCost: step.estimatedCost,
            lastOutput: step.output,
            namedOutputs: node.outputKey ? { [node.outputKey]: step.output } : {},
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
        state.status === 'waiting_for_input'
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

      const conditionData = {
        lastAgentOutput: state.lastOutput,
        namedOutput: state.namedOutputs ?? {},
        joinOutputs: state.joinOutputs ?? {},
        runContext: state.context ?? {},
      }

      // Find first matching edge
      for (const edge of edges) {
        if (evaluateCondition(edge, conditionData)) {
          // Check if target is a join node that needs more inputs
          const targetNode = nodeById.get(edge.to)
          if (targetNode?.type === 'join') {
            // Add to join buffer
            const agentName =
              node.type === 'agent' && node.agentId
                ? agentsById.get(node.agentId)?.name
                : node.label
            state.joinBuffers[edge.to] = [
              ...(state.joinBuffers[edge.to] ?? []),
              {
                agentId: node.agentId,
                agentName,
                output:
                  typeof state.lastOutput === 'string'
                    ? state.lastOutput
                    : JSON.stringify(state.lastOutput),
              },
            ]

            // Check if join has all inputs
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
      if (edges.length === 0) {
        graph.addEdge(node.id as typeof START, END)
      } else if (edges.length === 1 && edges[0].condition.type === 'always') {
        // Simple edge
        graph.addEdge(node.id as typeof START, edges[0].to as typeof START)
      } else {
        // Conditional edges - LangGraph SDK type mismatch requires cast
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        graph.addConditionalEdges(node.id as typeof START, routeFromNode(node.id) as any)
      }
    }
  }

  // Compile with optional checkpointing
  if (config.enableCheckpointing) {
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
    pendingInput: null,
    pendingResearchRequestId: null,
    pendingResearchOutputKey: null,
    nextNodeId: graphDef.startNodeId,
  }

  // Execute the graph
  const finalState = await compiledGraph.invoke(initialState)

  return {
    output:
      finalState.finalOutput ??
      (typeof finalState.lastOutput === 'string'
        ? finalState.lastOutput
        : JSON.stringify(finalState.lastOutput ?? '')),
    steps: finalState.steps ?? [],
    totalTokensUsed: finalState.totalTokensUsed ?? 0,
    totalEstimatedCost: finalState.totalEstimatedCost ?? 0,
    totalSteps: finalState.steps?.length ?? 0,
    status: finalState.status ?? 'completed',
    pendingInput: finalState.pendingInput ?? undefined,
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
