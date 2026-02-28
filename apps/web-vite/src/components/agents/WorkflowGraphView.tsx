/**
 * WorkflowGraphView Component
 *
 * Read-only visualization for workflow graphs.
 */

import { useMemo } from 'react'
import { useTheme } from '@/contexts/useTheme'
import { ReactFlow, Background, Controls, type Edge, type Node } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { WorkflowGraph } from '@lifeos/agents'
import {
  computeWorkflowLayout,
  getNodePosition,
  getNodeDimensions,
  NODE_TYPE_COLORS,
  type LayoutPreset,
} from './workflowLayoutUtils'

type WorkflowGraphViewProps = {
  graph: WorkflowGraph
  compact?: boolean
}

export function WorkflowGraphView({ graph, compact = false }: WorkflowGraphViewProps) {
  const { theme } = useTheme()
  const preset: LayoutPreset = compact ? 'compact' : 'default'
  const { width: nw, height: nh } = getNodeDimensions(preset)

  const { nodes, edges } = useMemo(() => {
    const { depths, nodesByDepth, backEdges } = computeWorkflowLayout(
      graph.nodes,
      graph.edges,
      graph.startNodeId
    )

    const nodes: Node[] = graph.nodes.map((node) => {
      const depth = depths.get(node.id) ?? 0
      const row = (nodesByDepth.get(depth) ?? []).indexOf(node.id)
      const { x, y } = getNodePosition(depth, row, preset)
      const label = node.label ?? node.id
      const color = NODE_TYPE_COLORS[node.type]
      const meta = compact
        ? ''
        : [
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
              {!compact && (
                <div className="workflow-node__meta">
                  {node.type.replace('_', ' ')}
                  {meta ? ` · ${meta}` : ''}
                </div>
              )}
            </div>
          ),
        },
        position: { x, y },
        style: {
          width: nw,
          minHeight: nh,
          borderRadius: compact ? 8 : 14,
          border: `1px solid ${color.border}`,
          padding: compact ? '4px 8px' : '10px 12px',
          fontSize: compact ? 10 : 12,
          background: color.background,
          boxShadow: compact ? 'none' : '0 6px 18px var(--shadow-soft)',
        },
      }
    })

    const edges: Edge[] = graph.edges.map((edge) => {
      const isBack = backEdges.has(`${edge.from}->${edge.to}`)
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
        animated: edge.condition.type === 'always' && !isBack,
        style: {
          stroke: isBack ? 'var(--warning)' : 'var(--border-strong)',
          strokeDasharray: isBack ? '6 3' : undefined,
        },
        labelStyle: { fill: 'var(--muted-foreground)', fontSize: 11 },
      }
    })

    return { nodes, edges }
  }, [graph, compact, preset, nw, nh])

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
        fitView
        fitViewOptions={{ padding: compact ? 0.1 : 0.2 }}
        nodesDraggable={false}
        nodesConnectable={false}
        zoomOnScroll={!compact}
        panOnDrag={!compact}
      >
        <Background gap={compact ? 16 : 24} size={1} color={gridColor} />
        {!compact && <Controls showInteractive={false} />}
      </ReactFlow>
    </div>
  )
}
