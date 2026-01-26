/**
 * NoteGraphView Component
 *
 * Visualization for note graphs using ReactFlow.
 */

import { useMemo, useCallback } from 'react'
import { useTheme } from '@/contexts/useTheme'
import { ReactFlow, Background, Controls, type Edge, type Node } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { NoteGraph, NoteGraphEdgeType } from '@lifeos/notes'

type NoteGraphViewProps = {
  graph: NoteGraph
  onNodeClick?: (noteId: string) => void
  highlightedNoteIds?: Set<string>
}

const NODE_WIDTH = 200
const NODE_HEIGHT = 80
const COLUMN_GAP = 80
const ROW_GAP = 60

const EDGE_COLORS: Record<NoteGraphEdgeType, string> = {
  explicit_link: 'var(--accent)',
  mention: 'var(--muted-foreground)',
  shared_project: 'var(--info)',
  shared_tag: 'var(--warning)',
  paragraph_tag: 'var(--primary)',
}

function getNodeColor(node: { projectIds: string[]; topicId: string | null }): {
  background: string
  border: string
} {
  // Color by topic if available, otherwise by project
  if (node.topicId) {
    return {
      background: 'var(--accent-subtle)',
      border: 'var(--accent)',
    }
  }
  if (node.projectIds && node.projectIds.length > 0) {
    return {
      background: 'var(--info-light)',
      border: 'var(--info)',
    }
  }
  return {
    background: 'var(--background-secondary)',
    border: 'var(--border-strong)',
  }
}

export function NoteGraphView({
  graph,
  onNodeClick,
  highlightedNoteIds = new Set(),
}: NoteGraphViewProps) {
  const { theme } = useTheme()

  const { nodes, edges } = useMemo(() => {
    // Simple hierarchical layout based on link depth
    const nodeMap = new Map(graph.nodes.map((node) => [node.noteId, node]))
    const edgeMap = new Map<string, Set<string>>()

    // Build adjacency list
    for (const edge of graph.edges) {
      if (!edgeMap.has(edge.fromNoteId)) {
        edgeMap.set(edge.fromNoteId, new Set())
      }
      edgeMap.get(edge.fromNoteId)!.add(edge.toNoteId)
    }

    // Calculate depths using BFS from nodes with no incoming edges
    const depths = new Map<string, number>()
    const inDegree = new Map<string, number>()

    // Initialize in-degrees
    for (const node of graph.nodes) {
      inDegree.set(node.noteId, 0)
    }

    for (const edge of graph.edges) {
      const current = inDegree.get(edge.toNoteId) || 0
      inDegree.set(edge.toNoteId, current + 1)
    }

    // BFS from nodes with no incoming edges
    const queue: string[] = []
    for (const [nodeId, degree] of inDegree.entries()) {
      if (degree === 0) {
        depths.set(nodeId, 0)
        queue.push(nodeId)
      }
    }

    while (queue.length > 0) {
      const current = queue.shift()!
      const currentDepth = depths.get(current) || 0
      const neighbors = edgeMap.get(current) || new Set()

      for (const neighbor of neighbors) {
        const existingDepth = depths.get(neighbor)
        if (existingDepth === undefined || currentDepth + 1 > existingDepth) {
          depths.set(neighbor, currentDepth + 1)
          queue.push(neighbor)
        }
      }
    }

    // Assign depth 0 to any remaining nodes
    for (const node of graph.nodes) {
      if (!depths.has(node.noteId)) {
        depths.set(node.noteId, 0)
      }
    }

    // Group nodes by depth
    const nodesByDepth = new Map<number, string[]>()
    for (const [nodeId, depth] of depths.entries()) {
      const bucket = nodesByDepth.get(depth) || []
      bucket.push(nodeId)
      nodesByDepth.set(depth, bucket)
    }

    // Sort nodes within each depth
    for (const bucket of nodesByDepth.values()) {
      bucket.sort((a, b) => {
        const nodeA = nodeMap.get(a)!
        const nodeB = nodeMap.get(b)!
        return nodeA.title.localeCompare(nodeB.title)
      })
    }

    // Convert to ReactFlow nodes
    const reactFlowNodes: Node[] = graph.nodes.map((node) => {
      const depth = depths.get(node.noteId) || 0
      const column = depth
      const row = (nodesByDepth.get(depth) || []).indexOf(node.noteId)
      const x = column * (NODE_WIDTH + COLUMN_GAP)
      const y = row * (NODE_HEIGHT + ROW_GAP)

      const color = getNodeColor(node)
      const isHighlighted = highlightedNoteIds.has(node.noteId)
      const truncatedTitle =
        node.title.length > 30 ? `${node.title.substring(0, 30)}...` : node.title

      return {
        id: node.noteId,
        data: {
          label: (
            <div className="note-graph-node">
              <div className="note-graph-node__title">{truncatedTitle}</div>
              <div className="note-graph-node__meta">
                {node.linkCount} links · {node.backlinkCount} backlinks
              </div>
            </div>
          ),
        },
        position: { x, y },
        style: {
          width: NODE_WIDTH,
          minHeight: NODE_HEIGHT,
          borderRadius: 12,
          border: `2px solid ${isHighlighted ? 'var(--accent)' : color.border}`,
          padding: '10px 12px',
          fontSize: 12,
          background: isHighlighted ? 'var(--accent-subtle)' : color.background,
          boxShadow: isHighlighted
            ? '0 0 0 3px var(--accent-subtle)'
            : '0 4px 12px var(--shadow-soft)',
          cursor: 'pointer',
        },
      }
    })

    // Convert to ReactFlow edges
    const reactFlowEdges: Edge[] = graph.edges.map((edge) => {
      const edgeColor = EDGE_COLORS[edge.edgeType]
      return {
        id: `${edge.fromNoteId}-${edge.toNoteId}-${edge.edgeType}`,
        source: edge.fromNoteId,
        target: edge.toNoteId,
        animated: edge.edgeType === 'explicit_link',
        style: {
          stroke: edgeColor,
          strokeWidth: edge.edgeType === 'explicit_link' ? 2 : 1,
        },
        labelStyle: {
          fill: 'var(--muted-foreground)',
          fontSize: 10,
        },
      }
    })

    return { nodes: reactFlowNodes, edges: reactFlowEdges }
  }, [graph, highlightedNoteIds])

  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      if (onNodeClick) {
        onNodeClick(node.id)
      }
    },
    [onNodeClick]
  )

  const gridColor = useMemo(() => {
    void theme
    if (typeof window === 'undefined') return 'var(--border)'
    const value = getComputedStyle(document.documentElement).getPropertyValue('--border').trim()
    return value || 'var(--border)'
  }, [theme])

  return (
    <div className="note-graph-view">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        nodesDraggable={true}
        nodesConnectable={false}
        zoomOnScroll
        panOnDrag
        onNodeClick={handleNodeClick}
      >
        <Background gap={24} size={1} color={gridColor} />
        <Controls showInteractive={false} />
      </ReactFlow>
      <style>{`
        .note-graph-view {
          width: 100%;
          height: 100%;
        }
        .note-graph-node {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .note-graph-node__title {
          font-weight: 600;
          font-size: 13px;
          line-height: 1.3;
          color: var(--foreground);
        }
        .note-graph-node__meta {
          font-size: 10px;
          color: var(--muted-foreground);
        }
      `}</style>
    </div>
  )
}
