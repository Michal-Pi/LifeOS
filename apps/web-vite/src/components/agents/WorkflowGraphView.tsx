/**
 * WorkflowGraphView Component
 *
 * Read-only visualization for workflow graphs.
 */

import { useMemo } from 'react'
import { ReactFlow, Background, Controls, type Edge, type Node } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { WorkflowGraph, WorkflowNodeType } from '@lifeos/agents'

type WorkflowGraphViewProps = {
  graph: WorkflowGraph
}

const NODE_WIDTH = 240
const NODE_HEIGHT = 90
const COLUMN_GAP = 60
const ROW_GAP = 40

const NODE_COLORS: Record<WorkflowNodeType, { background: string; border: string }> = {
  agent: { background: '#e0f2fe', border: '#0ea5e9' },
  tool: { background: '#fef9c3', border: '#eab308' },
  human_input: { background: '#fee2e2', border: '#ef4444' },
  join: { background: '#ede9fe', border: '#8b5cf6' },
  end: { background: '#f3f4f6', border: '#9ca3af' },
}

export function WorkflowGraphView({ graph }: WorkflowGraphViewProps) {
  const { nodes, edges } = useMemo(() => {
    const nodeById = new Map(graph.nodes.map((node) => [node.id, node]))
    const depths = new Map<string, number>()
    const queue: string[] = []

    if (nodeById.has(graph.startNodeId)) {
      depths.set(graph.startNodeId, 0)
      queue.push(graph.startNodeId)
    }

    while (queue.length > 0) {
      const current = queue.shift()
      if (!current) break
      const currentDepth = depths.get(current) ?? 0
      const outgoing = graph.edges.filter((edge) => edge.from === current)

      for (const edge of outgoing) {
        const nextDepth = currentDepth + 1
        const existing = depths.get(edge.to)
        if (existing === undefined || nextDepth > existing) {
          depths.set(edge.to, nextDepth)
        }
        if (!queue.includes(edge.to)) {
          queue.push(edge.to)
        }
      }
    }

    for (const node of graph.nodes) {
      if (!depths.has(node.id)) {
        depths.set(node.id, 0)
      }
    }

    const nodesByDepth = new Map<number, string[]>()
    for (const [nodeId, depth] of depths.entries()) {
      const bucket = nodesByDepth.get(depth) ?? []
      bucket.push(nodeId)
      nodesByDepth.set(depth, bucket)
    }

    for (const bucket of nodesByDepth.values()) {
      bucket.sort((a, b) => a.localeCompare(b))
    }

    const nodes: Node[] = graph.nodes.map((node) => {
      const depth = depths.get(node.id) ?? 0
      const column = depth
      const row = (nodesByDepth.get(depth) ?? []).indexOf(node.id)
      const x = column * (NODE_WIDTH + COLUMN_GAP)
      const y = row * (NODE_HEIGHT + ROW_GAP)
      const label = node.label ?? node.id
      const color = NODE_COLORS[node.type]
      const meta = [
        node.outputKey ? `output: ${node.outputKey}` : null,
        node.type === 'join' && node.aggregationMode ? `mode: ${node.aggregationMode}` : null,
      ]
        .filter(Boolean)
        .join(' · ')

      return {
        id: node.id,
        data: {
          label: (
            <div className="workflow-node">
              <div className="workflow-node__title">{label}</div>
              <div className="workflow-node__meta">
                {node.type.replace('_', ' ')}
                {meta ? ` · ${meta}` : ''}
              </div>
            </div>
          ),
        },
        position: { x, y },
        style: {
          width: NODE_WIDTH,
          minHeight: NODE_HEIGHT,
          borderRadius: 14,
          border: `1px solid ${color.border}`,
          padding: '10px 12px',
          fontSize: 12,
          background: color.background,
          boxShadow: '0 6px 18px rgba(15, 23, 42, 0.08)',
        },
      }
    })

    const edges: Edge[] = graph.edges.map((edge) => {
      const conditionLabel =
        edge.condition.type === 'always'
          ? ''
          : edge.condition.key && edge.condition.value
            ? `${edge.condition.type} ${edge.condition.key}=${edge.condition.value}`
            : edge.condition.type

      return {
        id: `${edge.from}-${edge.to}`,
        source: edge.from,
        target: edge.to,
        label: conditionLabel,
        animated: edge.condition.type === 'always',
        style: { stroke: '#64748b' },
        labelStyle: { fill: '#6b7280', fontSize: 11 },
      }
    })

    return { nodes, edges }
  }, [graph])

  return (
    <div className="workflow-graph">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        nodesDraggable={false}
        nodesConnectable={false}
        zoomOnScroll
        panOnDrag
      >
        <Background gap={24} size={1} color="#e5e7eb" />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  )
}
