/**
 * Custom Workflow Builder Reducer
 *
 * Pure state management for the visual workflow builder.
 * Handles node/edge CRUD, parallel splits, conditional branches, and layout computation.
 */

import type {
  WorkflowGraph,
  WorkflowNode,
  WorkflowNodeType,
  WorkflowEdgeCondition,
  JoinAggregationMode,
  AgentId,
  ToolId,
} from '@lifeos/agents'

export interface BuilderNode {
  id: string
  type: WorkflowNodeType
  agentId?: AgentId
  toolId?: ToolId
  label: string
  outputKey?: string
  aggregationMode?: JoinAggregationMode
  requestConfig?: WorkflowNode['requestConfig']
  column: number
  row: number
}

export interface BuilderEdge {
  from: string
  to: string
  condition: WorkflowEdgeCondition
}

export interface BuilderState {
  nodes: BuilderNode[]
  edges: BuilderEdge[]
  startNodeId: string
  selectedNodeId: string | null
}

export type BuilderAction =
  | { type: 'ADD_NODE_AFTER'; afterNodeId: string; nodeType: WorkflowNodeType; label?: string }
  | { type: 'REMOVE_NODE'; nodeId: string }
  | {
      type: 'UPDATE_NODE'
      nodeId: string
      updates: Partial<Omit<BuilderNode, 'id' | 'column' | 'row'>>
    }
  | { type: 'ADD_EDGE'; from: string; to: string; condition: WorkflowEdgeCondition }
  | { type: 'REMOVE_EDGE'; from: string; to: string }
  | { type: 'UPDATE_EDGE'; from: string; to: string; condition: WorkflowEdgeCondition }
  | { type: 'SELECT_NODE'; nodeId: string | null }
  | { type: 'SPLIT_PARALLEL'; afterNodeId: string; branchCount: number }
  | {
      type: 'ADD_CONDITIONAL'
      afterNodeId: string
      branches: Array<{ label: string; condition: WorkflowEdgeCondition }>
    }
  | { type: 'ADD_AGENT_NODE_AFTER'; afterNodeId: string; agentId: AgentId; agentName: string }
  | { type: 'LOAD_GRAPH'; graph: WorkflowGraph }
  | { type: 'RESET' }

let nodeCounter = 0
function generateNodeId(): string {
  return `node_${++nodeCounter}_${Date.now().toString(36)}`
}

export function createInitialState(): BuilderState {
  const startId = generateNodeId()
  const endId = generateNodeId()
  return computeLayout({
    nodes: [
      { id: startId, type: 'agent', label: 'Start Agent', column: 0, row: 0 },
      { id: endId, type: 'end', label: 'End', column: 0, row: 0 },
    ],
    edges: [{ from: startId, to: endId, condition: { type: 'always' } }],
    startNodeId: startId,
    selectedNodeId: null,
  })
}

export function builderStateToGraph(state: BuilderState): WorkflowGraph {
  return {
    version: 1,
    startNodeId: state.startNodeId,
    nodes: state.nodes.map((n) => {
      const node: WorkflowNode = { id: n.id, type: n.type }
      if (n.agentId) node.agentId = n.agentId
      if (n.toolId) node.toolId = n.toolId
      if (n.label) node.label = n.label
      if (n.outputKey) node.outputKey = n.outputKey
      if (n.aggregationMode) node.aggregationMode = n.aggregationMode
      if (n.requestConfig) node.requestConfig = n.requestConfig
      return node
    }),
    edges: state.edges.map((e) => ({
      from: e.from,
      to: e.to,
      condition: e.condition,
    })),
  }
}

function graphToBuilderState(graph: WorkflowGraph): BuilderState {
  const nodes: BuilderNode[] = graph.nodes.map((n) => ({
    id: n.id,
    type: n.type,
    agentId: n.agentId,
    toolId: n.toolId,
    label: n.label ?? n.type,
    outputKey: n.outputKey,
    aggregationMode: n.aggregationMode,
    requestConfig: n.requestConfig,
    column: 0,
    row: 0,
  }))

  const edges: BuilderEdge[] = graph.edges.map((e) => ({
    from: e.from,
    to: e.to,
    condition: e.condition,
  }))

  return computeLayout({
    nodes,
    edges,
    startNodeId: graph.startNodeId,
    selectedNodeId: null,
  })
}

/**
 * Compute structured grid layout using BFS from the start node.
 * Assigns column (depth) and row (sibling index at that depth).
 */
function computeLayout(state: BuilderState): BuilderState {
  const { nodes, edges, startNodeId } = state
  const nodeMap = new Map(nodes.map((n) => [n.id, n]))
  const adjacency = new Map<string, string[]>()

  for (const edge of edges) {
    const existing = adjacency.get(edge.from) ?? []
    existing.push(edge.to)
    adjacency.set(edge.from, existing)
  }

  const depths = new Map<string, number>()
  const queue: string[] = []

  if (nodeMap.has(startNodeId)) {
    depths.set(startNodeId, 0)
    queue.push(startNodeId)
  }

  // BFS to assign depths
  while (queue.length > 0) {
    const current = queue.shift()!
    const currentDepth = depths.get(current) ?? 0
    const children = adjacency.get(current) ?? []

    for (const child of children) {
      const existingDepth = depths.get(child)
      if (existingDepth === undefined || existingDepth < currentDepth + 1) {
        depths.set(child, currentDepth + 1)
        queue.push(child)
      }
    }
  }

  // Group nodes by column (depth)
  const columnGroups = new Map<number, string[]>()
  for (const [nodeId, depth] of depths) {
    const group = columnGroups.get(depth) ?? []
    group.push(nodeId)
    columnGroups.set(depth, group)
  }

  // Assign row within each column
  const updatedNodes = nodes.map((node) => {
    const depth = depths.get(node.id) ?? 0
    const group = columnGroups.get(depth) ?? [node.id]
    const row = group.indexOf(node.id)
    return { ...node, column: depth, row: row === -1 ? 0 : row }
  })

  return { ...state, nodes: updatedNodes }
}

export function builderReducer(state: BuilderState, action: BuilderAction): BuilderState {
  switch (action.type) {
    case 'ADD_NODE_AFTER': {
      const newId = generateNodeId()
      const newNode: BuilderNode = {
        id: newId,
        type: action.nodeType,
        label: action.label ?? action.nodeType,
        column: 0,
        row: 0,
      }

      // Find edges from afterNodeId and re-wire
      const outgoingEdges = state.edges.filter((e) => e.from === action.afterNodeId)
      const otherEdges = state.edges.filter((e) => e.from !== action.afterNodeId)

      // afterNode -> newNode (always)
      const newEdges: BuilderEdge[] = [
        ...otherEdges,
        { from: action.afterNodeId, to: newId, condition: { type: 'always' } },
        // newNode -> each original target
        ...outgoingEdges.map((e) => ({
          from: newId,
          to: e.to,
          condition: e.condition,
        })),
      ]

      return computeLayout({
        ...state,
        nodes: [...state.nodes, newNode],
        edges: newEdges,
        selectedNodeId: newId,
      })
    }

    case 'ADD_AGENT_NODE_AFTER': {
      const newId = generateNodeId()
      const newNode: BuilderNode = {
        id: newId,
        type: 'agent',
        agentId: action.agentId,
        label: action.agentName,
        column: 0,
        row: 0,
      }

      const outgoingEdges = state.edges.filter((e) => e.from === action.afterNodeId)
      const otherEdges = state.edges.filter((e) => e.from !== action.afterNodeId)

      const newEdges: BuilderEdge[] = [
        ...otherEdges,
        { from: action.afterNodeId, to: newId, condition: { type: 'always' } },
        ...outgoingEdges.map((e) => ({
          from: newId,
          to: e.to,
          condition: e.condition,
        })),
      ]

      return computeLayout({
        ...state,
        nodes: [...state.nodes, newNode],
        edges: newEdges,
        selectedNodeId: newId,
      })
    }

    case 'REMOVE_NODE': {
      if (action.nodeId === state.startNodeId) return state
      if (state.nodes.length <= 2) return state // Keep at least start+end

      const incomingEdges = state.edges.filter((e) => e.to === action.nodeId)
      const outgoingEdges = state.edges.filter((e) => e.from === action.nodeId)
      const otherEdges = state.edges.filter(
        (e) => e.from !== action.nodeId && e.to !== action.nodeId
      )

      // Re-wire: connect predecessors to successors
      const rewiredEdges: BuilderEdge[] = []
      for (const incoming of incomingEdges) {
        for (const outgoing of outgoingEdges) {
          rewiredEdges.push({
            from: incoming.from,
            to: outgoing.to,
            condition: outgoing.condition,
          })
        }
      }

      return computeLayout({
        ...state,
        nodes: state.nodes.filter((n) => n.id !== action.nodeId),
        edges: [...otherEdges, ...rewiredEdges],
        selectedNodeId: state.selectedNodeId === action.nodeId ? null : state.selectedNodeId,
      })
    }

    case 'UPDATE_NODE': {
      return {
        ...state,
        nodes: state.nodes.map((n) => (n.id === action.nodeId ? { ...n, ...action.updates } : n)),
      }
    }

    case 'ADD_EDGE': {
      const exists = state.edges.some((e) => e.from === action.from && e.to === action.to)
      if (exists) return state
      return computeLayout({
        ...state,
        edges: [...state.edges, { from: action.from, to: action.to, condition: action.condition }],
      })
    }

    case 'REMOVE_EDGE': {
      return computeLayout({
        ...state,
        edges: state.edges.filter((e) => !(e.from === action.from && e.to === action.to)),
      })
    }

    case 'UPDATE_EDGE': {
      return {
        ...state,
        edges: state.edges.map((e) =>
          e.from === action.from && e.to === action.to ? { ...e, condition: action.condition } : e
        ),
      }
    }

    case 'SELECT_NODE': {
      return { ...state, selectedNodeId: action.nodeId }
    }

    case 'SPLIT_PARALLEL': {
      const { afterNodeId, branchCount } = action
      const outgoingEdges = state.edges.filter((e) => e.from === afterNodeId)
      const otherEdges = state.edges.filter((e) => e.from !== afterNodeId)

      const branchNodes: BuilderNode[] = []
      const branchEdges: BuilderEdge[] = []
      const joinId = generateNodeId()

      // Create branch nodes
      for (let i = 0; i < branchCount; i++) {
        const branchId = generateNodeId()
        branchNodes.push({
          id: branchId,
          type: 'agent',
          label: `Branch ${i + 1}`,
          column: 0,
          row: 0,
        })
        // afterNode -> branch
        branchEdges.push({
          from: afterNodeId,
          to: branchId,
          condition: { type: 'always' },
        })
        // branch -> join
        branchEdges.push({
          from: branchId,
          to: joinId,
          condition: { type: 'always' },
        })
      }

      // Create join node
      const joinNode: BuilderNode = {
        id: joinId,
        type: 'join',
        label: 'Merge',
        aggregationMode: 'list',
        column: 0,
        row: 0,
      }

      // Join -> original successors
      const joinToSuccessors = outgoingEdges.map((e) => ({
        from: joinId,
        to: e.to,
        condition: e.condition,
      }))

      return computeLayout({
        ...state,
        nodes: [...state.nodes, ...branchNodes, joinNode],
        edges: [...otherEdges, ...branchEdges, ...joinToSuccessors],
        selectedNodeId: branchNodes[0]?.id ?? null,
      })
    }

    case 'ADD_CONDITIONAL': {
      const { afterNodeId, branches } = action
      const outgoingEdges = state.edges.filter((e) => e.from === afterNodeId)
      const otherEdges = state.edges.filter((e) => e.from !== afterNodeId)

      const branchNodes: BuilderNode[] = []
      const branchEdges: BuilderEdge[] = []

      // Each branch gets its own agent node
      for (const branch of branches) {
        const branchId = generateNodeId()
        branchNodes.push({
          id: branchId,
          type: 'agent',
          label: branch.label,
          column: 0,
          row: 0,
        })
        branchEdges.push({
          from: afterNodeId,
          to: branchId,
          condition: branch.condition,
        })
        // Branch -> original successors
        for (const outgoing of outgoingEdges) {
          branchEdges.push({
            from: branchId,
            to: outgoing.to,
            condition: { type: 'always' },
          })
        }
      }

      return computeLayout({
        ...state,
        nodes: [...state.nodes, ...branchNodes],
        edges: [...otherEdges, ...branchEdges],
        selectedNodeId: branchNodes[0]?.id ?? null,
      })
    }

    case 'LOAD_GRAPH': {
      return graphToBuilderState(action.graph)
    }

    case 'RESET': {
      return createInitialState()
    }

    default:
      return state
  }
}
