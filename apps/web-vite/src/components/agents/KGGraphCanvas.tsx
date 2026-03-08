/**
 * KGGraphCanvas — Cytoscape.js wrapper for rendering the knowledge graph.
 *
 * Renders CompactGraph as an interactive force-directed graph with support
 * for community overlays, source quality heatmaps, and diff highlighting.
 */

import { useEffect, useRef, useCallback } from 'react'
import cytoscape from 'cytoscape'
import fcose from 'cytoscape-fcose'
import type { CompactGraph, GraphDiff } from '@lifeos/agents'
import type { Community } from '@/lib/kgLouvain'

// Guard against double-registration (HMR / multiple imports)
let fcoseRegistered = false
if (!fcoseRegistered) {
  cytoscape.use(fcose)
  fcoseRegistered = true
}

export type ViewMode = 'graph' | 'diff' | 'heatmap'

interface KGGraphCanvasProps {
  graph: CompactGraph
  viewMode: ViewMode
  communities: Community[]
  showCommunities: boolean
  diffHighlight: GraphDiff | null
  snapshotHighlight: { addedNodeIds: string[]; supersededNodeIds: string[] } | null
  selectedNodeId: string | null
  onNodeSelect: (nodeId: string | null) => void
  onEdgeSelect: (edgeData: { from: string; to: string; rel: string } | null) => void
  cyRef: React.MutableRefObject<cytoscape.Core | null>
}

function confidenceToHeatColor(confidence: number | undefined): string {
  if (confidence === undefined || confidence === null) return '#6b7280'
  if (confidence >= 0.8) return '#22c55e'
  if (confidence >= 0.6) return '#eab308'
  if (confidence >= 0.3) return '#f97316'
  return '#ef4444'
}

function compactGraphToElements(
  graph: CompactGraph,
  communities: Community[],
  showCommunities: boolean
): cytoscape.ElementDefinition[] {
  const communityMap = new Map<string, string>()
  const parentNodes: cytoscape.ElementDefinition[] = []

  if (showCommunities && communities.length > 0) {
    for (const c of communities) {
      parentNodes.push({
        data: { id: `community-${c.id}`, label: c.label },
        classes: 'community-parent',
      })
      for (const memberId of c.memberIds) {
        communityMap.set(memberId, `community-${c.id}`)
      }
    }
  }

  const nodes: cytoscape.ElementDefinition[] = graph.nodes.map((n) => ({
    data: {
      id: n.id,
      label: n.label.length > 30 ? n.label.slice(0, 28) + '…' : n.label,
      fullLabel: n.label,
      type: n.type,
      confidence: n.sourceConfidence ?? 0,
      note: n.note,
      sourceId: n.sourceId,
      sourceUrl: n.sourceUrl,
      parent: communityMap.get(n.id) || undefined,
    },
    classes: n.type,
  }))

  const edges: cytoscape.ElementDefinition[] = graph.edges.map((e, i) => ({
    data: {
      id: `e-${e.from}-${e.to}-${i}`,
      source: e.from,
      target: e.to,
      rel: e.rel,
      weight: e.weight ?? 1,
    },
    classes: e.rel,
  }))

  return [...parentNodes, ...nodes, ...edges]
}

const BASE_STYLESHEET: cytoscape.Stylesheet[] = [
  // Default node
  {
    selector: 'node',
    style: {
      label: 'data(label)',
      'text-valign': 'bottom',
      'text-halign': 'center',
      'font-size': '10px',
      'text-margin-y': 6,
      'text-max-width': '80px',
      'text-wrap': 'ellipsis',
      color: '#9ca3af',
      width: 28,
      height: 28,
      'border-width': 2,
      'border-color': '#374151',
      'background-color': '#4b5563',
      'transition-property': 'background-color, border-color, width, height',
      'transition-duration': 200,
    },
  },
  // Claim — circle, blue
  {
    selector: 'node.claim',
    style: {
      shape: 'ellipse',
      'background-color': '#3b82f6',
      'border-color': '#2563eb',
      width: 'mapData(confidence, 0, 1, 22, 40)',
      height: 'mapData(confidence, 0, 1, 22, 40)',
    },
  },
  // Concept — diamond, purple
  {
    selector: 'node.concept',
    style: {
      shape: 'diamond',
      'background-color': '#8b5cf6',
      'border-color': '#7c3aed',
      width: 32,
      height: 32,
    },
  },
  // Mechanism — hexagon, green
  {
    selector: 'node.mechanism',
    style: {
      shape: 'hexagon',
      'background-color': '#22c55e',
      'border-color': '#16a34a',
      width: 30,
      height: 30,
    },
  },
  // Prediction — triangle, orange
  {
    selector: 'node.prediction',
    style: {
      shape: 'triangle',
      'background-color': '#f97316',
      'border-color': '#ea580c',
      width: 30,
      height: 30,
    },
  },
  // Community parent
  {
    selector: 'node.community-parent',
    style: {
      'background-opacity': 0.08,
      'background-color': '#8b5cf6',
      'border-width': 1,
      'border-color': '#6d28d9',
      'border-opacity': 0.3,
      shape: 'round-rectangle',
      padding: '20px',
      label: 'data(label)',
      'text-valign': 'top',
      'text-halign': 'center',
      'font-size': '11px',
      'font-weight': 'bold',
      color: '#a78bfa',
      'text-margin-y': -6,
    },
  },
  // Selected node
  {
    selector: 'node:selected',
    style: {
      'border-width': 3,
      'border-color': '#a78bfa',
      'overlay-color': '#a78bfa',
      'overlay-padding': 4,
      'overlay-opacity': 0.15,
    },
  },
  // Default edge
  {
    selector: 'edge',
    style: {
      width: 'mapData(weight, 0, 1, 1, 3)',
      'line-color': '#4b5563',
      'target-arrow-color': '#4b5563',
      'target-arrow-shape': 'triangle',
      'curve-style': 'bezier',
      opacity: 0.6,
      'arrow-scale': 0.8,
    },
  },
  // supports — green solid
  {
    selector: 'edge.supports',
    style: {
      'line-color': '#22c55e',
      'target-arrow-color': '#22c55e',
    },
  },
  // contradicts — red dashed
  {
    selector: 'edge.contradicts',
    style: {
      'line-color': '#ef4444',
      'target-arrow-color': '#ef4444',
      'line-style': 'dashed',
      width: 2,
      opacity: 0.8,
    },
  },
  // causes — dark arrow
  {
    selector: 'edge.causes',
    style: {
      'line-color': '#6b7280',
      'target-arrow-color': '#6b7280',
      'target-arrow-shape': 'vee',
      width: 2,
    },
  },
  // mediates — dotted
  {
    selector: 'edge.mediates',
    style: {
      'line-color': '#8b5cf6',
      'target-arrow-color': '#8b5cf6',
      'line-style': 'dotted',
    },
  },
  // scopes — grey
  {
    selector: 'edge.scopes',
    style: {
      'line-color': '#9ca3af',
      'target-arrow-color': '#9ca3af',
      'target-arrow-shape': 'diamond',
    },
  },
  // Diff: added
  {
    selector: 'node.diff-added',
    style: {
      'border-color': '#22c55e',
      'border-width': 3,
      'overlay-color': '#22c55e',
      'overlay-padding': 5,
      'overlay-opacity': 0.2,
    },
  },
  // Diff: removed
  {
    selector: 'node.diff-removed',
    style: {
      'border-color': '#ef4444',
      'border-width': 3,
      'overlay-color': '#ef4444',
      'overlay-padding': 5,
      'overlay-opacity': 0.2,
      opacity: 0.5,
    },
  },
  // Diff: modified
  {
    selector: 'node.diff-modified',
    style: {
      'border-color': '#eab308',
      'border-width': 3,
      'overlay-color': '#eab308',
      'overlay-padding': 5,
      'overlay-opacity': 0.2,
    },
  },
  // Snapshot: added highlight
  {
    selector: 'node.snapshot-added',
    style: {
      'border-color': '#22c55e',
      'border-width': 3,
      'overlay-color': '#22c55e',
      'overlay-padding': 4,
      'overlay-opacity': 0.15,
    },
  },
  // Snapshot: superseded
  {
    selector: 'node.snapshot-superseded',
    style: {
      'border-color': '#ef4444',
      'border-width': 2,
      opacity: 0.4,
    },
  },
  // Dimmed (for neighborhood focus)
  {
    selector: 'node.dimmed',
    style: {
      opacity: 0.1,
    },
  },
  {
    selector: 'edge.dimmed',
    style: {
      opacity: 0.05,
    },
  },
]

export function KGGraphCanvas({
  graph,
  viewMode,
  communities,
  showCommunities,
  diffHighlight,
  snapshotHighlight,
  selectedNodeId,
  onNodeSelect,
  onEdgeSelect,
  cyRef,
}: KGGraphCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  // Initialize cytoscape
  useEffect(() => {
    if (!containerRef.current) return

    const cy = cytoscape({
      container: containerRef.current,
      style: BASE_STYLESHEET,
      layout: { name: 'grid' }, // placeholder — real layout applied after elements
      minZoom: 0.2,
      maxZoom: 4,
    })

    cyRef.current = cy

    return () => {
      cy.destroy()
      cyRef.current = null
    }
  }, [cyRef])

  // Track whether we've done the initial layout (randomize only on first load)
  const hasLaidOut = useRef(false)

  // Update elements when graph or community state changes
  useEffect(() => {
    const cy = cyRef.current
    if (!cy || !graph) return

    const elements = compactGraphToElements(graph, communities, showCommunities)
    cy.elements().remove()
    cy.add(elements)

    // Apply fCoSE layout — randomize only on first layout to avoid jarring jumps
    const shouldRandomize = !hasLaidOut.current
    hasLaidOut.current = true

    cy.layout({
      name: 'fcose',
      animate: true,
      animationDuration: 600,
      randomize: shouldRandomize,
      quality: 'default',
      nodeSeparation: 80,
      idealEdgeLength: 120,
      nodeRepulsion: 6000,
      edgeElasticity: 0.45,
      gravity: 0.3,
      gravityRange: 3.8,
      numIter: 2500,
      tile: true,
      tilingPaddingVertical: 20,
      tilingPaddingHorizontal: 20,
    } as cytoscape.LayoutOptions).run()
  }, [graph, communities, showCommunities, cyRef])

  // Handle heatmap overlay
  useEffect(() => {
    const cy = cyRef.current
    if (!cy) return

    if (viewMode === 'heatmap') {
      cy.nodes().forEach((node) => {
        if (node.hasClass('community-parent')) return
        const confidence = node.data('confidence') as number | undefined
        node.style('background-color', confidenceToHeatColor(confidence))
      })
    } else {
      // Reset to type-based colors
      cy.nodes().forEach((node) => {
        node.removeStyle('background-color')
      })
    }
  }, [viewMode, cyRef])

  // Handle diff highlighting
  useEffect(() => {
    const cy = cyRef.current
    if (!cy) return

    // Clear previous diff classes
    cy.nodes().removeClass('diff-added diff-removed diff-modified')

    if (viewMode === 'diff' && diffHighlight) {
      for (const nodeId of diffHighlight.addedNodes) {
        cy.getElementById(nodeId).addClass('diff-added')
      }
      for (const nodeId of diffHighlight.removedNodes) {
        cy.getElementById(nodeId).addClass('diff-removed')
      }
      for (const mod of diffHighlight.modifiedNodes) {
        cy.getElementById(mod.id).addClass('diff-modified')
      }
    }
  }, [viewMode, diffHighlight, cyRef])

  // Handle snapshot highlighting
  useEffect(() => {
    const cy = cyRef.current
    if (!cy) return

    cy.nodes().removeClass('snapshot-added snapshot-superseded')

    if (snapshotHighlight) {
      for (const nodeId of snapshotHighlight.addedNodeIds) {
        cy.getElementById(nodeId).addClass('snapshot-added')
      }
      for (const nodeId of snapshotHighlight.supersededNodeIds) {
        cy.getElementById(nodeId).addClass('snapshot-superseded')
      }
    }
  }, [snapshotHighlight, cyRef])

  // Handle selected node
  useEffect(() => {
    const cy = cyRef.current
    if (!cy) return

    cy.nodes().unselect()
    if (selectedNodeId) {
      cy.getElementById(selectedNodeId).select()
    }
  }, [selectedNodeId, cyRef])

  // Event handlers
  const handleTap = useCallback(
    (evt: cytoscape.EventObject) => {
      const target = evt.target
      if (target === cyRef.current) {
        // Clicked on background
        onNodeSelect(null)
        onEdgeSelect(null)
        return
      }
      if (target.isNode()) {
        if (target.hasClass('community-parent')) return
        onNodeSelect(target.id())
        onEdgeSelect(null)
      } else if (target.isEdge()) {
        onNodeSelect(null)
        onEdgeSelect({
          from: target.data('source'),
          to: target.data('target'),
          rel: target.data('rel'),
        })
      }
    },
    [onNodeSelect, onEdgeSelect, cyRef]
  )

  useEffect(() => {
    const cy = cyRef.current
    if (!cy) return

    cy.on('tap', handleTap)
    return () => {
      cy.off('tap', handleTap)
    }
  }, [cyRef, handleTap])

  return (
    <div className="kg-graph-canvas-wrapper">
      <div ref={containerRef} className="kg-graph-canvas" />
      {/* Always-visible edge type legend */}
      <div className="kg-edge-legend" role="group" aria-label="Edge type legend">
        <span className="kg-legend-item">
          <span className="kg-legend-line" style={{ background: '#22c55e' }} /> supports
        </span>
        <span className="kg-legend-item">
          <span className="kg-legend-line kg-legend-dashed" style={{ background: '#ef4444' }} />{' '}
          contradicts
        </span>
        <span className="kg-legend-item">
          <span className="kg-legend-line" style={{ background: '#6b7280' }} /> causes
        </span>
        <span className="kg-legend-item">
          <span className="kg-legend-line kg-legend-dotted" style={{ background: '#8b5cf6' }} />{' '}
          mediates
        </span>
        <span className="kg-legend-item">
          <span className="kg-legend-line" style={{ background: '#9ca3af' }} /> scopes
        </span>
      </div>
      {viewMode === 'heatmap' && (
        <div className="kg-heatmap-legend">
          <span className="kg-legend-label">Source Quality:</span>
          <span className="kg-legend-stop" style={{ background: '#ef4444' }}>
            Low
          </span>
          <span className="kg-legend-stop" style={{ background: '#f97316' }}>
            Fair
          </span>
          <span className="kg-legend-stop" style={{ background: '#eab308' }}>
            Good
          </span>
          <span className="kg-legend-stop" style={{ background: '#22c55e' }}>
            High
          </span>
        </div>
      )}
      {graph.nodes.length === 0 && (
        <div className="kg-empty-state">
          No graph data yet. The knowledge graph will appear as research progresses.
        </div>
      )}
    </div>
  )
}
