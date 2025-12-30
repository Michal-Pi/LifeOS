/**
 * WorkflowGraphView Component
 *
 * Read-only visualization for workflow graphs.
 */

import { useMemo } from 'react'
import { ReactFlow, Background, Controls, type Edge, type Node } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { WorkflowGraph } from '@lifeos/agents'

type WorkflowGraphViewProps = {
  graph: WorkflowGraph
}

const NODE_WIDTH = 220
const NODE_HEIGHT = 80
const COLUMN_GAP = 40
const ROW_GAP = 30
const MAX_COLUMNS = 3

export function WorkflowGraphView({ graph }: WorkflowGraphViewProps) {
  const { nodes, edges } = useMemo(() => {
    const nodes: Node[] = graph.nodes.map((node, index) => {
      const column = index % MAX_COLUMNS
      const row = Math.floor(index / MAX_COLUMNS)
      const x = column * (NODE_WIDTH + COLUMN_GAP)
      const y = row * (NODE_HEIGHT + ROW_GAP)
      const label = node.label ?? `${node.type} · ${node.id}`

      return {
        id: node.id,
        data: { label },
        position: { x, y },
        style: {
          width: NODE_WIDTH,
          minHeight: NODE_HEIGHT,
          borderRadius: 12,
          border: '1px solid #2f2f2f',
          padding: '10px 12px',
          fontSize: 12,
          background: '#ffffff',
        },
      }
    })

    const edges: Edge[] = graph.edges.map((edge) => ({
      id: `${edge.from}-${edge.to}`,
      source: edge.from,
      target: edge.to,
      label: edge.condition.type === 'always' ? '' : edge.condition.type,
      animated: edge.condition.type === 'always',
      style: { stroke: '#4b5563' },
      labelStyle: { fill: '#6b7280', fontSize: 11 },
    }))

    return { nodes, edges }
  }, [graph])

  return (
    <div className="workflow-graph">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        fitView
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
