/**
 * InteractiveWorkflowGraph Component
 *
 * Interactive visualization for workflow graphs with execution state tracking.
 * Shows real-time status of nodes and allows clicking to view details.
 */

import { useMemo, useCallback } from 'react'
import { useTheme } from '@/contexts/useTheme'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  MarkerType,
  type Edge,
  type Node,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { WorkflowGraph, WorkflowStep, Message } from '@lifeos/agents'
import {
  computeWorkflowLayout,
  getNodePosition,
  getNodeDimensions,
  NODE_TYPE_COLORS,
} from './workflowLayoutUtils'

type ExecutionStatus = 'pending' | 'running' | 'completed' | 'failed'

interface InteractiveWorkflowGraphProps {
  graph: WorkflowGraph
  workflowSteps: WorkflowStep[]
  messages: Message[]
  onNodeClick?: (nodeId: string, step?: WorkflowStep) => void
  /** When set, only steps up to this index are shown as executed */
  replayStepIndex?: number
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
  messages: _messages,
  onNodeClick,
  replayStepIndex,
}: InteractiveWorkflowGraphProps) {
  const { theme } = useTheme()
  const { width: nw, height: nh } = getNodeDimensions()

  // Determine execution status for each node
  const nodeStatuses = useMemo(() => {
    const statuses = new Map<string, { status: ExecutionStatus; step?: WorkflowStep }>()

    // When replaying, only show steps up to the replay index
    const visibleSteps =
      replayStepIndex != null ? workflowSteps.slice(0, replayStepIndex + 1) : workflowSteps

    for (const step of visibleSteps) {
      const status: ExecutionStatus = step.error
        ? 'failed'
        : step.completedAtMs
          ? 'completed'
          : 'running'

      statuses.set(step.nodeId, { status, step })
    }

    // All nodes not in visible steps are pending
    for (const node of graph.nodes) {
      if (!statuses.has(node.id)) {
        statuses.set(node.id, { status: 'pending' })
      }
    }

    return statuses
  }, [graph.nodes, workflowSteps, replayStepIndex])

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
    const { depths, nodesByDepth } = computeWorkflowLayout(
      graph.nodes,
      graph.edges,
      graph.startNodeId
    )

    const nodes: Node[] = graph.nodes.map((node) => {
      const depth = depths.get(node.id) ?? 0
      const row = (nodesByDepth.get(depth) ?? []).indexOf(node.id)
      const { x, y } = getNodePosition(depth, row)
      const label = node.label ?? node.id

      // Get execution status
      const nodeStatus = nodeStatuses.get(node.id)
      const status = nodeStatus?.status ?? 'pending'

      // Choose colors based on status or base type
      const statusColor = status !== 'pending' ? STATUS_COLORS[status] : null
      const color = statusColor ?? NODE_TYPE_COLORS[node.type]

      const meta = [
        node.outputKey ? `output: ${node.outputKey}` : null,
        node.type === 'join' && node.aggregationMode ? `mode: ${node.aggregationMode}` : null,
      ]
        .filter(Boolean)
        .join(' · ')

      // Add status indicator
      const statusEmoji =
        status === 'running' ? '⏳' : status === 'completed' ? '✓' : status === 'failed' ? '✗' : '○'

      // Duration display for completed/failed nodes
      const step = nodeStatus?.step
      const durationLabel =
        step?.durationMs != null
          ? step.durationMs < 1000
            ? `${step.durationMs}ms`
            : `${(step.durationMs / 1000).toFixed(1)}s`
          : null

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
                {durationLabel && (
                  <span className="workflow-node__duration"> · {durationLabel}</span>
                )}
              </div>
            </div>
          ),
        },
        position: { x, y },
        style: {
          width: nw,
          minHeight: nh,
          borderRadius: 14,
          border: `2px solid ${color.border}`,
          padding: '10px 12px',
          fontSize: 12,
          background: color.background,
          boxShadow:
            (statusColor as { shadow?: string } | null)?.shadow ?? '0 6px 18px var(--shadow-soft)',
          cursor: onNodeClick ? 'pointer' : 'default',
          transition: 'all 0.2s ease',
        },
      }
    })

    const edges: Edge[] = graph.edges.map((edge) => {
      const conditionLabel =
        edge.condition.type === 'always'
          ? ''
          : edge.condition.type === 'llm_evaluate'
            ? `AI: ${(edge.condition.value ?? '').slice(0, 25)}${(edge.condition.value ?? '').length > 25 ? '...' : ''}`
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
        type: 'smoothstep',
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 16,
          height: 16,
          color: isTraversed ? 'var(--info)' : 'var(--border-strong)',
        },
        style: {
          stroke: isTraversed ? 'var(--info)' : 'var(--border-strong)',
          strokeWidth: isTraversed ? 2 : 1,
        },
        labelStyle: { fill: 'var(--muted-foreground)', fontSize: 11 },
      }
    })

    return { nodes, edges }
  }, [graph, nodeStatuses, onNodeClick, nw, nh])

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
        <MiniMap
          nodeStrokeWidth={3}
          pannable
          zoomable
          style={{ background: 'var(--background-secondary)' }}
        />
      </ReactFlow>

      <style>{`
        .workflow-node__status {
          margin-right: 6px;
          font-size: 14px;
        }
        .workflow-node__duration {
          font-weight: 600;
          color: var(--info);
        }
        .workflow-graph-container {
          position: relative;
          min-height: 300px;
        }
      `}</style>
    </div>
  )
}
