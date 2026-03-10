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
  WorkflowId,
} from '@lifeos/agents'
import { computeWorkflowLayout, computeDagreLayout, WORKFLOW_LAYOUT } from './workflowLayoutUtils'

export interface BuilderNode {
  id: string
  type: WorkflowNodeType
  agentId?: AgentId
  toolId?: ToolId
  label: string
  outputKey?: string
  aggregationMode?: JoinAggregationMode
  requestConfig?: WorkflowNode['requestConfig']
  /** Reference to another workflow (for subworkflow nodes) */
  subworkflowId?: WorkflowId
  column: number
  row: number
  /** When true the node is bypassed (pass-through) during execution */
  bypassed?: boolean
  /** When true the node is muted (skipped silently) during execution */
  muted?: boolean
  /** Optional group identifier for visually grouping nodes together */
  groupId?: string
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
  /** IDs of all currently selected nodes (multi-select) */
  selectedNodeIds: string[]
  /** True if user has manually repositioned any nodes (disables auto-layout on structural changes) */
  hasManualPositions: boolean
  /** Transient clipboard for copy/paste – not persisted to the workflow graph */
  clipboard: { nodes: BuilderNode[]; edges: BuilderEdge[] } | null
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
  | { type: 'SET_NODE_POSITION'; nodeId: string; column: number; row: number }
  | { type: 'AUTO_LAYOUT' }
  | { type: 'SELECT_NODES'; nodeIds: string[] }
  | { type: 'REMOVE_NODES'; nodeIds: string[] }
  | { type: 'COPY_NODES'; nodeIds: string[] }
  | { type: 'PASTE_NODES' }
  | { type: 'TOGGLE_BYPASS'; nodeId: string }
  | { type: 'TOGGLE_MUTE'; nodeId: string }
  | { type: 'GROUP_NODES'; nodeIds: string[]; groupLabel: string }
  | { type: 'UNGROUP_NODES'; groupId: string }
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
    selectedNodeId: startId, // Auto-select start node so options are not greyed out
    selectedNodeIds: [startId],
    hasManualPositions: false,
    clipboard: null,
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
      if (n.subworkflowId) node.subworkflowId = n.subworkflowId
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
    subworkflowId: n.subworkflowId,
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
    selectedNodeId: graph.startNodeId,
    selectedNodeIds: [graph.startNodeId],
    hasManualPositions: false,
    clipboard: null,
  })
}

/**
 * Compute structured layout using dagre for optimal node positioning.
 * Falls back to BFS-based grid layout if dagre produces empty results.
 */
function computeLayout(state: BuilderState): BuilderState {
  const { nodes, edges, startNodeId } = state

  // Use dagre for better layout
  const positions = computeDagreLayout(nodes, edges, startNodeId)

  if (positions.size === 0) {
    // Fallback to BFS layout
    const { depths, nodesByDepth } = computeWorkflowLayout(nodes, edges, startNodeId)
    const updatedNodes = nodes.map((node) => {
      const depth = depths.get(node.id) ?? 0
      const group = nodesByDepth.get(depth) ?? [node.id]
      const row = group.indexOf(node.id)
      return { ...node, column: depth, row: row === -1 ? 0 : row }
    })
    return { ...state, nodes: updatedNodes }
  }

  // Convert dagre pixel positions back to grid columns/rows for the builder
  const colWidth = WORKFLOW_LAYOUT.node.width + WORKFLOW_LAYOUT.gap.column
  const rowHeight = WORKFLOW_LAYOUT.node.height + WORKFLOW_LAYOUT.gap.row

  const updatedNodes = nodes.map((node) => {
    const pos = positions.get(node.id)
    if (!pos) return node
    const column = Math.max(0, Math.round(pos.x / colWidth))
    const row = Math.max(0, Math.round(pos.y / rowHeight))
    return { ...node, column, row }
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
      const fromExists = state.nodes.some((n) => n.id === action.from)
      const toExists = state.nodes.some((n) => n.id === action.to)
      if (!fromExists || !toExists) return state
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
      return {
        ...state,
        selectedNodeId: action.nodeId,
        selectedNodeIds: action.nodeId ? [action.nodeId] : [],
      }
    }

    case 'SELECT_NODES': {
      return {
        ...state,
        selectedNodeIds: action.nodeIds,
        selectedNodeId: action.nodeIds[0] ?? null,
      }
    }

    case 'REMOVE_NODES': {
      // Filter out protected nodes (start node, and keep at least 2 nodes)
      const removable = action.nodeIds.filter((id) => id !== state.startNodeId)
      if (removable.length === 0) return state

      let result = state
      for (const nodeId of removable) {
        if (result.nodes.length <= 2) break
        result = builderReducer(result, { type: 'REMOVE_NODE', nodeId })
      }
      return { ...result, selectedNodeIds: [], selectedNodeId: null }
    }

    case 'SET_NODE_POSITION': {
      return {
        ...state,
        hasManualPositions: true,
        nodes: state.nodes.map((n) =>
          n.id === action.nodeId ? { ...n, column: action.column, row: action.row } : n
        ),
      }
    }

    case 'AUTO_LAYOUT': {
      return { ...computeLayout(state), hasManualPositions: false }
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

    case 'COPY_NODES': {
      const nodeIdSet = new Set(action.nodeIds)
      const copiedNodes = state.nodes.filter((n) => nodeIdSet.has(n.id))
      // Only include edges that are internal to the copied set
      const copiedEdges = state.edges.filter((e) => nodeIdSet.has(e.from) && nodeIdSet.has(e.to))
      return {
        ...state,
        clipboard: { nodes: copiedNodes, edges: copiedEdges },
      }
    }

    case 'PASTE_NODES': {
      if (!state.clipboard || state.clipboard.nodes.length === 0) return state

      // Build old-id -> new-id mapping
      const idMap = new Map<string, string>()
      for (const node of state.clipboard.nodes) {
        idMap.set(node.id, generateNodeId())
      }

      // Duplicate nodes with new IDs and offset column by +1
      const pastedNodes: BuilderNode[] = state.clipboard.nodes
        .filter((n) => idMap.has(n.id))
        .map((n) => ({
          ...n,
          id: idMap.get(n.id) as string,
          column: n.column + 1,
        }))

      // Re-wire internal edges to use new IDs (only if both endpoints mapped)
      const pastedEdges: BuilderEdge[] = state.clipboard.edges
        .filter((e) => idMap.has(e.from) && idMap.has(e.to))
        .map((e) => ({
          from: idMap.get(e.from) as string,
          to: idMap.get(e.to) as string,
          condition: e.condition,
        }))

      const pastedIds = pastedNodes.map((n) => n.id)

      return computeLayout({
        ...state,
        nodes: [...state.nodes, ...pastedNodes],
        edges: [...state.edges, ...pastedEdges],
        selectedNodeIds: pastedIds,
        selectedNodeId: pastedIds[0] ?? null,
      })
    }

    case 'TOGGLE_BYPASS': {
      return {
        ...state,
        nodes: state.nodes.map((n) =>
          n.id === action.nodeId ? { ...n, bypassed: !n.bypassed } : n
        ),
      }
    }

    case 'TOGGLE_MUTE': {
      return {
        ...state,
        nodes: state.nodes.map((n) => (n.id === action.nodeId ? { ...n, muted: !n.muted } : n)),
      }
    }

    case 'GROUP_NODES': {
      const groupId = generateNodeId()
      const groupSet = new Set(action.nodeIds)
      return {
        ...state,
        nodes: state.nodes.map((n) => (groupSet.has(n.id) ? { ...n, groupId } : n)),
      }
    }

    case 'UNGROUP_NODES': {
      return {
        ...state,
        nodes: state.nodes.map((n) =>
          n.groupId === action.groupId ? { ...n, groupId: undefined } : n
        ),
      }
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
