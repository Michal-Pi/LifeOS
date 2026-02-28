/**
 * Workflow Layout Utilities
 *
 * Shared BFS layout algorithm, spacing constants, and node colors
 * used by WorkflowGraphView, InteractiveWorkflowGraph, and CustomWorkflowBuilder.
 */

import dagre from '@dagrejs/dagre'
import type { WorkflowNodeType } from '@lifeos/agents'

// ── Layout Constants ──

export const WORKFLOW_LAYOUT = {
  node: { width: 260, height: 110 },
  gap: { column: 90, row: 50 },
  compact: {
    node: { width: 140, height: 50 },
    gap: { column: 36, row: 24 },
  },
} as const

export type LayoutPreset = 'default' | 'compact'

// ── Node Colors ──

export const NODE_TYPE_COLORS: Record<WorkflowNodeType, { background: string; border: string }> = {
  agent: { background: 'var(--info-light)', border: 'var(--info)' },
  tool: { background: 'var(--warning-light)', border: 'var(--warning)' },
  human_input: { background: 'var(--error-light)', border: 'var(--error)' },
  join: { background: 'var(--accent-subtle)', border: 'var(--accent-secondary)' },
  end: { background: 'var(--background-secondary)', border: 'var(--border-strong)' },
  research_request: { background: 'var(--success-light)', border: 'var(--success)' },
  // Composition nodes
  subworkflow: { background: 'var(--accent-subtle)', border: 'var(--accent)' },
  // Dialectical phase nodes
  retrieve_context: { background: 'var(--info-light)', border: 'var(--info)' },
  generate_theses: { background: 'var(--accent-subtle)', border: 'var(--accent-secondary)' },
  cross_negation: { background: 'var(--warning-light)', border: 'var(--warning)' },
  crystallize_contradictions: { background: 'var(--error-light)', border: 'var(--error)' },
  sublate: { background: 'var(--success-light)', border: 'var(--success)' },
  meta_reflect: { background: 'var(--accent-subtle)', border: 'var(--accent-secondary)' },
  // Deep research phase nodes
  sense_making: { background: 'var(--info-light)', border: 'var(--info)' },
  search_planning: { background: 'var(--accent-subtle)', border: 'var(--accent-secondary)' },
  search_execution: { background: 'var(--warning-light)', border: 'var(--warning)' },
  source_ingestion: { background: 'var(--success-light)', border: 'var(--success)' },
  claim_extraction: { background: 'var(--info-light)', border: 'var(--info)' },
  kg_construction: { background: 'var(--accent-subtle)', border: 'var(--accent-secondary)' },
  gap_analysis: { background: 'var(--warning-light)', border: 'var(--warning)' },
  answer_generation: { background: 'var(--success-light)', border: 'var(--success)' },
}

// ── Layout Algorithm ──

export interface LayoutResult {
  depths: Map<string, number>
  nodesByDepth: Map<number, string[]>
  /** Edge keys ("from->to") that are back-edges (target already visited when discovered). */
  backEdges: Set<string>
}

/**
 * Compute a hierarchical left-to-right layout using BFS from the start node.
 *
 * Handles cyclic graphs correctly: edges to already-visited nodes are recorded
 * as back-edges but do NOT push the target to a deeper column.
 */
export function computeWorkflowLayout(
  nodes: ReadonlyArray<{ id: string }>,
  edges: ReadonlyArray<{ from: string; to: string }>,
  startNodeId: string
): LayoutResult {
  const nodeSet = new Set(nodes.map((n) => n.id))

  // Build adjacency list
  const adjacency = new Map<string, string[]>()
  for (const edge of edges) {
    const list = adjacency.get(edge.from) ?? []
    list.push(edge.to)
    adjacency.set(edge.from, list)
  }

  const depths = new Map<string, number>()
  const visited = new Set<string>()
  const backEdges = new Set<string>()
  const queue: string[] = []

  if (nodeSet.has(startNodeId)) {
    depths.set(startNodeId, 0)
    queue.push(startNodeId)
  }

  // BFS — each node is processed exactly once.
  // Forward edges may update a node's depth to the maximum before it is visited.
  // Back-edges (to already-visited nodes) are skipped for depth assignment.
  while (queue.length > 0) {
    const current = queue.shift()!
    if (visited.has(current)) continue
    visited.add(current)

    const currentDepth = depths.get(current) ?? 0
    const children = adjacency.get(current) ?? []

    for (const child of children) {
      if (visited.has(child)) {
        backEdges.add(`${current}->${child}`)
        continue
      }
      const nextDepth = currentDepth + 1
      const existing = depths.get(child)
      if (existing === undefined || nextDepth > existing) {
        depths.set(child, nextDepth)
      }
      if (!visited.has(child)) {
        queue.push(child)
      }
    }
  }

  // Assign depth 0 to disconnected nodes
  for (const node of nodes) {
    if (!depths.has(node.id)) {
      depths.set(node.id, 0)
    }
  }

  // Group by depth, sort within each group for stable row order
  const nodesByDepth = new Map<number, string[]>()
  for (const [nodeId, depth] of depths) {
    const bucket = nodesByDepth.get(depth) ?? []
    bucket.push(nodeId)
    nodesByDepth.set(depth, bucket)
  }
  for (const bucket of nodesByDepth.values()) {
    bucket.sort((a, b) => a.localeCompare(b))
  }

  return { depths, nodesByDepth, backEdges }
}

// ── Position Helpers ──

export function getNodePosition(
  column: number,
  row: number,
  preset: LayoutPreset = 'default'
): { x: number; y: number } {
  const cfg = preset === 'compact' ? WORKFLOW_LAYOUT.compact : WORKFLOW_LAYOUT
  return {
    x: column * (cfg.node.width + cfg.gap.column),
    y: row * (cfg.node.height + cfg.gap.row),
  }
}

export function getNodeDimensions(preset: LayoutPreset = 'default') {
  const cfg = preset === 'compact' ? WORKFLOW_LAYOUT.compact : WORKFLOW_LAYOUT
  return { width: cfg.node.width, height: cfg.node.height }
}

// ── Dagre Layout Algorithm ──

/**
 * Compute a hierarchical left-to-right layout using dagre.
 *
 * Returns a Map from node id to top-left pixel coordinates.
 * This produces better layouts than the BFS algorithm for complex graphs
 * with many cross-edges and parallel branches.
 */
export function computeDagreLayout(
  nodes: ReadonlyArray<{ id: string }>,
  edges: ReadonlyArray<{ from: string; to: string }>,
  startNodeId: string,
  preset: LayoutPreset = 'default'
): Map<string, { x: number; y: number }> {
  const cfg = preset === 'compact' ? WORKFLOW_LAYOUT.compact : WORKFLOW_LAYOUT
  const g = new dagre.graphlib.Graph()
  g.setGraph({
    rankdir: 'LR',
    ranksep: cfg.gap.column,
    nodesep: cfg.gap.row,
    marginx: 20,
    marginy: 20,
  })
  g.setDefaultEdgeLabel(() => ({}))

  for (const node of nodes) {
    g.setNode(node.id, { width: cfg.node.width, height: cfg.node.height })
  }
  for (const edge of edges) {
    g.setEdge(edge.from, edge.to)
  }

  dagre.layout(g)

  const positions = new Map<string, { x: number; y: number }>()
  for (const node of nodes) {
    const dagreNode = g.node(node.id)
    if (dagreNode) {
      positions.set(node.id, {
        x: dagreNode.x - cfg.node.width / 2,
        y: dagreNode.y - cfg.node.height / 2,
      })
    }
  }
  return positions
}

// ── Pixel Position Helper ──

/**
 * Identity helper for nodes that already have pixel coordinates (e.g. from dagre).
 */
export function getNodePositionFromPixels(x: number, y: number): { x: number; y: number } {
  return { x, y }
}
