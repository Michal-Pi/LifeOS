/**
 * InteractiveWorkflowGraph Component
 *
 * Interactive visualization for workflow graphs with execution state tracking.
 * Shows real-time status of nodes and allows clicking to view details.
 */

import { useMemo, useCallback } from 'react'
import { useTheme } from '@/contexts/useTheme'
import { ReactFlow, Background, Controls, type Edge, type Node } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { WorkflowGraph, WorkflowNodeType, WorkflowStep, Message } from '@lifeos/agents'

type ExecutionStatus = 'pending' | 'running' | 'completed' | 'failed'

interface InteractiveWorkflowGraphProps {
  graph: WorkflowGraph
  workflowSteps: WorkflowStep[]
  messages: Message[]
  onNodeClick?: (nodeId: string, step?: WorkflowStep) => void
}

const NODE_WIDTH = 240
const NODE_HEIGHT = 90
const COLUMN_GAP = 60
const ROW_GAP = 40

const BASE_NODE_COLORS: Record<WorkflowNodeType, { background: string; border: string }> = {
  agent: { background: 'var(--info-light)', border: 'var(--info)' },
  tool: { background: 'var(--warning-light)', border: 'var(--warning)' },
  human_input: { background: 'var(--error-light)', border: 'var(--error)' },
  join: { background: 'var(--accent-subtle)', border: 'var(--accent-secondary)' },
  end: { background: 'var(--background-secondary)', border: 'var(--border-strong)' },
  research_request: { background: 'var(--success-light)', border: 'var(--success)' },
}

const STATUS_COLORS: Record<
  ExecutionStatus,
  { background: string; border: string; shadow?: string }
> = {
  pending: {
    background: 'var(--muted)',
    border: 'var(--border)',
  },
  running: {
    background: 'var(--info-light)',
    border: 'var(--info)',
    shadow: '0 0 0 3px var(--info-subtle)',
  },
  completed: {
    background: 'var(--success-light)',
    border: 'var(--success)',
  },
  failed: {
    background: 'var(--error-light)',
    border: 'var(--error)',
  },
}

export function InteractiveWorkflowGraph({
  graph,
  workflowSteps,
  messages: _messages, // eslint-disable-line @typescript-eslint/no-unused-vars
  onNodeClick,
}: InteractiveWorkflowGraphProps) {
  const { theme } = useTheme()

  // Determine execution status for each node
  const nodeStatuses = useMemo(() => {
    const statuses = new Map<string, { status: ExecutionStatus; step?: WorkflowStep }>()

    for (const step of workflowSteps) {
      const status: ExecutionStatus = step.error
        ? 'failed'
        : step.completedAtMs
          ? 'completed'
          : 'running'

      statuses.set(step.nodeId, { status, step })
    }

    // All nodes not in workflowSteps are pending
    for (const node of graph.nodes) {
      if (!statuses.has(node.id)) {
        statuses.set(node.id, { status: 'pending' })
      }
    }

    return statuses
  }, [graph.nodes, workflowSteps])

  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      if (onNodeClick) {
        const nodeStatus = nodeStatuses.get(node.id)
        onNodeClick(node.id, nodeStatus?.step)
      }
    },
    [onNodeClick, nodeStatuses]
  )

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

      // Get execution status
      const nodeStatus = nodeStatuses.get(node.id)
      const status = nodeStatus?.status ?? 'pending'

      // Choose colors based on status or base type
      const color = status !== 'pending' ? STATUS_COLORS[status] : BASE_NODE_COLORS[node.type]

      const meta = [
        node.outputKey ? `output: ${node.outputKey}` : null,
        node.type === 'join' && node.aggregationMode ? `mode: ${node.aggregationMode}` : null,
      ]
        .filter(Boolean)
        .join(' · ')

      // Add status indicator
      const statusEmoji =
        status === 'running' ? '⏳' : status === 'completed' ? '✓' : status === 'failed' ? '✗' : '○'

      return {
        id: node.id,
        data: {
          label: (
            <div className="workflow-node">
              <div className="workflow-node__title">
                <span className="workflow-node__status">{statusEmoji}</span>
                {label}
              </div>
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
          border: `2px solid ${color.border}`,
          padding: '10px 12px',
          fontSize: 12,
          background: color.background,
          boxShadow: color.shadow ?? '0 6px 18px var(--shadow-soft)',
          cursor: onNodeClick ? 'pointer' : 'default',
          transition: 'all 0.2s ease',
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

      // Determine if this edge has been traversed
      const sourceStatus = nodeStatuses.get(edge.from)
      const targetStatus = nodeStatuses.get(edge.to)
      const isTraversed = sourceStatus?.status === 'completed' && targetStatus?.status !== 'pending'

      return {
        id: `${edge.from}-${edge.to}`,
        source: edge.from,
        target: edge.to,
        label: conditionLabel,
        animated: isTraversed,
        style: {
          stroke: isTraversed ? 'var(--info)' : 'var(--border-strong)',
          strokeWidth: isTraversed ? 2 : 1,
        },
        labelStyle: { fill: 'var(--muted-foreground)', fontSize: 11 },
      }
    })

    return { nodes, edges }
  }, [graph, nodeStatuses, onNodeClick])

  const gridColor = useMemo(() => {
    void theme
    if (typeof window === 'undefined') return 'var(--border)'
    const value = getComputedStyle(document.documentElement).getPropertyValue('--border').trim()
    return value || 'var(--border)'
  }, [theme])

  return (
    <div className="workflow-graph">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodeClick={handleNodeClick}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        nodesDraggable={false}
        nodesConnectable={false}
        zoomOnScroll
        panOnDrag
      >
        <Background gap={24} size={1} color={gridColor} />
        <Controls showInteractive={false} />
      </ReactFlow>

      <style>{`
        .workflow-node__status {
          margin-right: 6px;
          font-size: 14px;
        }
      `}</style>
    </div>
  )
}
