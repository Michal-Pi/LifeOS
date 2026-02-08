/**
 * Knowledge Graph Explorer
 *
 * Interactive visualization for exploring the 4-layer dialectical knowledge hypergraph:
 * - Layer 0: Episodes (raw agent exchanges)
 * - Layer 1: Claims, Mechanisms, Contradictions (semantic layer)
 * - Layer 2: Concepts, Regimes (ontology layer)
 * - Layer 3: Communities (auto-discovered clusters)
 *
 * Features:
 * - 4-layer graph visualization with filtering
 * - Bi-temporal edge filtering (view graph at different points in time)
 * - Concept lineage explorer (track concept evolution)
 * - Node detail panel with full entity information
 */

import { useMemo, useCallback, useState } from 'react'
import { useTheme } from '@/contexts/useTheme'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type Edge,
  type Node,
  Panel,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import type { KnowledgeGraphExplorerProps, KGNode, KGNodeType, TemporalFilterType } from './types'
import {
  NODE_TYPE_CONFIG,
  EDGE_TYPE_CONFIG,
  NODE_WIDTH,
  NODE_HEIGHT,
  LAYER_GAP,
  NODE_GAP,
  ALL_NODE_TYPES,
} from './types'
import { truncateText, formatEdgeLabel } from './utils'
import { FilterPanel } from './FilterPanel'
import { NodeDetailPanel } from './NodeDetailPanel'
import '../KnowledgeGraphExplorer.css'

// ----- Main Component -----

export function KnowledgeGraphExplorer({
  graph,
  onNodeSelect,
  onConceptLineage,
  initialSelectedNode,
  sessionName = 'Dialectical Session',
}: KnowledgeGraphExplorerProps) {
  const { theme } = useTheme()

  // State
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(initialSelectedNode ?? null)
  const [visibleLayers, setVisibleLayers] = useState<Set<number>>(new Set([1, 2, 3]))
  const [visibleNodeTypes, setVisibleNodeTypes] = useState<Set<KGNodeType>>(new Set(ALL_NODE_TYPES))
  const [temporalFilter, setTemporalFilter] = useState<TemporalFilterType>('active')
  const [searchQuery, setSearchQuery] = useState('')

  // Filter nodes based on settings
  const filteredGraph = useMemo(() => {
    const filteredNodes = graph.nodes.filter((node) => {
      // Type filter
      if (!visibleNodeTypes.has(node.type)) return false

      // Layer filter
      const layer = NODE_TYPE_CONFIG[node.type].layer
      if (!visibleLayers.has(layer)) return false

      // Temporal filter
      if (temporalFilter === 'active') {
        if (node.temporal.tExpired !== null || node.temporal.tInvalid !== null) return false
      } else if (temporalFilter === 'expired') {
        if (node.temporal.tExpired === null && node.temporal.tInvalid === null) return false
      }

      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase()
        const label = node.label.toLowerCase()
        const matchesSearch = label.includes(query)
        if (!matchesSearch) return false
      }

      return true
    })

    const nodeIds = new Set(filteredNodes.map((n) => n.id))

    const filteredEdges = graph.edges.filter((edge) => {
      // Only include edges between visible nodes
      if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) return false

      // Temporal filter for edges
      if (temporalFilter === 'active') {
        if (edge.temporal.tExpired !== null) return false
      }

      return true
    })

    return { nodes: filteredNodes, edges: filteredEdges }
  }, [graph, visibleLayers, visibleNodeTypes, temporalFilter, searchQuery])

  // Convert to ReactFlow format
  const { nodes, edges } = useMemo(() => {
    // Group nodes by layer for layout
    const nodesByLayer = new Map<number, KGNode[]>()
    for (const node of filteredGraph.nodes) {
      const layer = NODE_TYPE_CONFIG[node.type].layer
      const bucket = nodesByLayer.get(layer) || []
      bucket.push(node)
      nodesByLayer.set(layer, bucket)
    }

    // Sort nodes within each layer alphabetically
    for (const bucket of nodesByLayer.values()) {
      bucket.sort((a, b) => a.label.localeCompare(b.label))
    }

    // Create ReactFlow nodes with positions
    const reactFlowNodes: Node[] = filteredGraph.nodes.map((node) => {
      const config = NODE_TYPE_CONFIG[node.type]
      const layer = config.layer
      const layerNodes = nodesByLayer.get(layer) || []
      const row = layerNodes.indexOf(node)

      const x = (layer - 1) * LAYER_GAP
      const y = row * NODE_GAP
      const isSelected = node.id === selectedNodeId
      const isExpired = node.temporal.tExpired !== null
      const isInvalid = node.temporal.tInvalid !== null

      return {
        id: node.id,
        type: 'default',
        data: {
          label: (
            <div
              className={`kg-node ${node.type} ${isExpired ? 'expired' : ''} ${isInvalid ? 'invalid' : ''}`}
            >
              <div className="kg-node-header">
                <span className="kg-node-icon" aria-hidden="true">
                  {config.icon}
                </span>
                <span className="kg-node-type">{node.type}</span>
              </div>
              <div className="kg-node-label">{truncateText(node.label, 40)}</div>
              {(isExpired || isInvalid) && (
                <div className="kg-node-temporal">{isExpired ? 'Expired' : 'Invalid'}</div>
              )}
            </div>
          ),
          kgNode: node, // Store original node for click handler
        },
        position: { x, y },
        style: {
          width: NODE_WIDTH,
          minHeight: NODE_HEIGHT,
          borderRadius: 8,
          border: `2px solid ${isSelected ? 'var(--accent)' : config.color}`,
          padding: 0,
          background: config.bgColor,
          opacity: isExpired || isInvalid ? 0.6 : 1,
          boxShadow: isSelected ? '0 0 0 3px var(--accent-subtle)' : 'none',
          cursor: 'pointer',
        },
      }
    })

    // Create ReactFlow edges
    const reactFlowEdges: Edge[] = filteredGraph.edges.map((edge) => {
      const config = EDGE_TYPE_CONFIG[edge.type]
      return {
        id: `${edge.source}-${edge.target}-${edge.type}`,
        source: edge.source,
        target: edge.target,
        animated: config.animated,
        style: {
          stroke: config.color,
          strokeWidth: Math.max(1, edge.weight * 2),
          strokeDasharray: config.dashed ? '5,5' : undefined,
        },
        label: formatEdgeLabel(edge.type),
        labelStyle: {
          fill: 'var(--muted-foreground)',
          fontSize: 10,
        },
        labelBgStyle: {
          fill: 'var(--background)',
          fillOpacity: 0.8,
        },
      }
    })

    return { nodes: reactFlowNodes, edges: reactFlowEdges }
  }, [filteredGraph, selectedNodeId])

  // Handlers
  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      setSelectedNodeId(node.id)
      const kgNode = (node.data as { kgNode: KGNode }).kgNode
      if (onNodeSelect) {
        onNodeSelect(kgNode)
      }
    },
    [onNodeSelect]
  )

  const toggleLayer = useCallback((layer: number) => {
    setVisibleLayers((prev) => {
      const next = new Set(prev)
      if (next.has(layer)) {
        next.delete(layer)
      } else {
        next.add(layer)
      }
      return next
    })
  }, [])

  const toggleNodeType = useCallback((type: KGNodeType) => {
    setVisibleNodeTypes((prev) => {
      const next = new Set(prev)
      if (next.has(type)) {
        next.delete(type)
      } else {
        next.add(type)
      }
      return next
    })
  }, [])

  const selectedNode = useMemo(() => {
    return graph.nodes.find((n) => n.id === selectedNodeId) ?? null
  }, [graph.nodes, selectedNodeId])

  // Grid color - compute once based on theme
  const gridColor = useMemo(() => {
    void theme
    if (typeof window === 'undefined') return 'var(--border)'
    const value = getComputedStyle(document.documentElement).getPropertyValue('--border').trim()
    return value || 'var(--border)'
  }, [theme])

  return (
    <div className="kg-explorer" role="region" aria-label="Knowledge Graph Explorer">
      {/* Header */}
      <header className="kg-explorer-header">
        <div className="kg-explorer-title">
          <h3>{sessionName}</h3>
          <span className="kg-stats">
            {filteredGraph.nodes.length} nodes · {filteredGraph.edges.length} edges
          </span>
        </div>
        <div className="kg-search">
          <input
            type="text"
            placeholder="Search nodes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Search knowledge graph nodes"
          />
        </div>
      </header>

      <div className="kg-explorer-body">
        {/* Filter Panel */}
        <FilterPanel
          visibleLayers={visibleLayers}
          visibleNodeTypes={visibleNodeTypes}
          temporalFilter={temporalFilter}
          onToggleLayer={toggleLayer}
          onToggleNodeType={toggleNodeType}
          onTemporalFilterChange={setTemporalFilter}
        />

        {/* Graph View */}
        <div className="kg-graph-container">
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
            minZoom={0.1}
            maxZoom={2}
          >
            <Background gap={24} size={1} color={gridColor} />
            <Controls showInteractive={false} />
            <MiniMap
              nodeColor={(node) => {
                const kgNode = (node.data as { kgNode?: KGNode }).kgNode
                if (kgNode) {
                  return NODE_TYPE_CONFIG[kgNode.type].color
                }
                return 'var(--muted-foreground)'
              }}
              maskColor="rgba(0, 0, 0, 0.1)"
            />
            <Panel position="top-right" className="kg-panel-info">
              <div className="panel-badge">
                <span>{filteredGraph.nodes.length}</span> nodes visible
              </div>
            </Panel>
          </ReactFlow>
        </div>

        {/* Detail Panel */}
        {selectedNode && (
          <aside className="kg-detail-panel" role="complementary" aria-label="Node details">
            <NodeDetailPanel
              node={selectedNode}
              onClose={() => setSelectedNodeId(null)}
              onViewLineage={
                selectedNode.type === 'concept' && onConceptLineage
                  ? () => onConceptLineage(selectedNode.id)
                  : undefined
              }
            />
          </aside>
        )}
      </div>
    </div>
  )
}

export default KnowledgeGraphExplorer
