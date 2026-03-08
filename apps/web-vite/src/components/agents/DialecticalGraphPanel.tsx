/**
 * DialecticalGraphPanel — Interactive graph visualization for dialectical workflows.
 *
 * Reuses KGGraphCanvas, KGNodeInspector, KGDiffPanel, kgLouvain, and kgExport
 * from the shared KG visualization components.
 *
 * Displays either the merged knowledge graph or an individual thesis graph,
 * with community detection, export, diff view, and node inspection.
 */

import { useState, useRef, useMemo, useCallback, type ChangeEvent } from 'react'
import type cytoscape from 'cytoscape'
import type { CompactGraph, GraphDiff, ThesisOutput } from '@lifeos/agents'
import { KGGraphCanvas, type ViewMode } from './KGGraphCanvas'
import { KGNodeInspector } from './KGNodeInspector'
import { KGDiffPanel } from './KGDiffPanel'
import { detectCommunities, type Community } from '@/lib/kgLouvain'
import { exportAsJSON, exportAsGraphML } from '@/lib/kgExport'

export type GraphSource =
  | { type: 'merged' }
  | { type: 'thesis'; index: number; thesis: ThesisOutput }

interface DialecticalGraphPanelProps {
  source: GraphSource
  mergedGraph: CompactGraph
  theses: ThesisOutput[]
  graphHistory: Array<{ cycle: number; diff: GraphDiff }>
  onClose: () => void
  onSwitchSource: (source: GraphSource) => void
}

export function DialecticalGraphPanel({
  source,
  mergedGraph,
  theses,
  graphHistory,
  onClose,
  onSwitchSource,
}: DialecticalGraphPanelProps) {
  const cyRef = useRef<cytoscape.Core | null>(null)

  // View state
  const [viewMode, setViewMode] = useState<ViewMode>('graph')
  const [showCommunities, setShowCommunities] = useState(false)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [selectedEdge, setSelectedEdge] = useState<{
    from: string
    to: string
    rel: string
  } | null>(null)
  const [diffHighlight, setDiffHighlight] = useState<GraphDiff | null>(null)
  const [showDiffPanel, setShowDiffPanel] = useState(false)

  // Active graph based on source
  const activeGraph = useMemo(() => {
    if (source.type === 'merged') return mergedGraph
    return source.thesis.graph ?? null
  }, [source, mergedGraph])

  // Communities for active graph
  const communities: Community[] = useMemo(() => {
    if (!activeGraph || !showCommunities) return []
    return detectCommunities(activeGraph)
  }, [activeGraph, showCommunities])

  // Clear selection when source changes
  const handleSwitchSource = useCallback(
    (newSource: GraphSource) => {
      setSelectedNodeId(null)
      setSelectedEdge(null)
      setDiffHighlight(null)
      onSwitchSource(newSource)
    },
    [onSwitchSource]
  )

  // Focus neighborhood
  const handleFocusNeighborhood = useCallback((nodeId: string) => {
    const cy = cyRef.current
    if (!cy) return
    const node = cy.getElementById(nodeId)
    if (node.length === 0) return
    const neighborhood = node.closedNeighborhood().closedNeighborhood()
    cy.elements().addClass('dimmed')
    neighborhood.removeClass('dimmed')
    cy.fit(neighborhood, 40)
  }, [])

  const handleClearFocus = useCallback(() => {
    const cy = cyRef.current
    if (!cy) return
    cy.elements().removeClass('dimmed')
    cy.fit(undefined, 40)
  }, [])

  // Export
  const handleExportJSON = useCallback(() => {
    if (!activeGraph) return
    exportAsJSON(activeGraph, undefined, {
      source:
        source.type === 'merged'
          ? 'dialectical-merged'
          : `thesis-${source.type === 'thesis' ? source.thesis.lens : ''}`,
    })
  }, [activeGraph, source])

  const handleExportGraphML = useCallback(() => {
    if (!activeGraph) return
    exportAsGraphML(activeGraph)
  }, [activeGraph])

  // Thesis tabs with available graphs
  const thesisesWithGraphs = useMemo(
    () =>
      theses
        .map((t, i) => ({ thesis: t, index: i }))
        .filter((t) => t.thesis.graph && t.thesis.graph.nodes.length > 0),
    [theses]
  )

  if (!activeGraph) {
    return (
      <div className="dialectical-graph-panel">
        <div className="dgp-header">
          <h4>Knowledge Graph</h4>
          <button className="ghost-button dgp-close" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="dgp-empty">
          <p>No graph data available for this view.</p>
          {source.type === 'thesis' && (
            <button className="ghost-button" onClick={() => handleSwitchSource({ type: 'merged' })}>
              View merged graph instead
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="dialectical-graph-panel">
      {/* Header with source tabs */}
      <div className="dgp-header">
        <div className="dgp-tabs">
          <button
            className={`ghost-button dgp-tab ${source.type === 'merged' ? 'active' : ''}`}
            onClick={() => handleSwitchSource({ type: 'merged' })}
          >
            Merged Graph
            <span className="dgp-tab-count">
              {mergedGraph.nodes.length}n / {mergedGraph.edges.length}e
            </span>
          </button>
          {thesisesWithGraphs.map(({ thesis, index }) => (
            <button
              key={index}
              className={`ghost-button dgp-tab ${source.type === 'thesis' && source.index === index ? 'active' : ''}`}
              onClick={() => handleSwitchSource({ type: 'thesis', index, thesis })}
            >
              {thesis.lens}
              <span className="dgp-tab-count">{thesis.graph!.nodes.length}n</span>
            </button>
          ))}
        </div>
        <button className="ghost-button dgp-close" onClick={onClose} aria-label="Close graph panel">
          Close
        </button>
      </div>

      {/* Toolbar */}
      <div className="dgp-toolbar">
        <div className="dgp-toolbar-group">
          <button
            className={`ghost-button dgp-tool-btn ${viewMode === 'graph' ? 'active' : ''}`}
            onClick={() => {
              setViewMode('graph')
              setDiffHighlight(null)
              setShowDiffPanel(false)
            }}
          >
            Graph
          </button>
          <button
            className={`ghost-button dgp-tool-btn ${viewMode === 'heatmap' ? 'active' : ''}`}
            onClick={() => setViewMode('heatmap')}
          >
            Heatmap
          </button>
          {source.type === 'merged' && graphHistory.length > 0 && (
            <button
              className={`ghost-button dgp-tool-btn ${viewMode === 'diff' ? 'active' : ''}`}
              onClick={() => {
                setViewMode('diff')
                setShowDiffPanel(true)
              }}
            >
              Diff
            </button>
          )}
        </div>
        <div className="dgp-toolbar-group">
          <button
            className={`ghost-button dgp-tool-btn ${showCommunities ? 'active' : ''}`}
            onClick={() => setShowCommunities(!showCommunities)}
          >
            Communities
          </button>
          <button className="ghost-button dgp-tool-btn" onClick={handleClearFocus}>
            Reset
          </button>
        </div>
        <div className="dgp-toolbar-group">
          <button className="ghost-button dgp-tool-btn" onClick={handleExportJSON}>
            JSON
          </button>
          <button className="ghost-button dgp-tool-btn" onClick={handleExportGraphML}>
            GraphML
          </button>
        </div>
      </div>

      {/* Graph + Inspector */}
      <div className="dgp-content">
        <div className="dgp-graph-area">
          <KGGraphCanvas
            graph={activeGraph}
            viewMode={viewMode}
            communities={communities}
            showCommunities={showCommunities}
            diffHighlight={diffHighlight}
            snapshotHighlight={null}
            selectedNodeId={selectedNodeId}
            onNodeSelect={(id) => {
              setSelectedNodeId(id)
              if (id) setSelectedEdge(null)
            }}
            onEdgeSelect={(edge) => {
              setSelectedEdge(edge)
              if (edge) setSelectedNodeId(null)
            }}
            cyRef={cyRef}
          />
        </div>
        <KGNodeInspector
          graph={activeGraph}
          selectedNodeId={selectedNodeId}
          selectedEdge={selectedEdge}
          onClose={() => {
            setSelectedNodeId(null)
            setSelectedEdge(null)
          }}
          onFocusNeighborhood={handleFocusNeighborhood}
        />
      </div>

      {/* Diff Panel (only for merged graph with history) */}
      {showDiffPanel && viewMode === 'diff' && source.type === 'merged' && (
        <KGDiffPanel graphHistory={graphHistory} onHighlightDiff={setDiffHighlight} />
      )}

      {/* Cycle scrubber for time-travel through graph history */}
      {source.type === 'merged' && graphHistory.length > 1 && (
        <CycleScrubber
          graphHistory={graphHistory}
          onSelectCycle={(diff) => {
            setViewMode('diff')
            setDiffHighlight(diff)
            setShowDiffPanel(false)
          }}
        />
      )}

      {/* Footer stats */}
      <div className="dgp-footer">
        <span className="dgp-footer-stat">
          {activeGraph.nodes.length} nodes, {activeGraph.edges.length} edges
        </span>
        {activeGraph.confidence > 0 && (
          <span className="dgp-footer-stat">
            Confidence: {(activeGraph.confidence * 100).toFixed(0)}%
          </span>
        )}
        {activeGraph.regime && (
          <span className="dgp-footer-stat">Regime: {activeGraph.regime}</span>
        )}
        {communities.length > 0 && (
          <span className="dgp-footer-stat">{communities.length} communities</span>
        )}
      </div>
    </div>
  )
}

// ----- Cycle Scrubber -----

function CycleScrubber({
  graphHistory,
  onSelectCycle,
}: {
  graphHistory: Array<{ cycle: number; diff: GraphDiff }>
  onSelectCycle: (diff: GraphDiff) => void
}) {
  const [selectedIdx, setSelectedIdx] = useState(graphHistory.length - 1)
  const entry = graphHistory[selectedIdx]

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const idx = Number(e.target.value)
      setSelectedIdx(idx)
      onSelectCycle(graphHistory[idx].diff)
    },
    [graphHistory, onSelectCycle]
  )

  if (!entry) return null

  return (
    <div className="dgp-scrubber" role="group" aria-label="Cycle time-travel">
      <label className="dgp-scrubber-label" htmlFor="cycle-scrubber">
        Cycle {entry.cycle}
      </label>
      <input
        id="cycle-scrubber"
        type="range"
        min={0}
        max={graphHistory.length - 1}
        value={selectedIdx}
        onChange={handleChange}
        className="dgp-scrubber-input"
      />
      <div className="dgp-scrubber-stats">
        <span className="diff-added">+{entry.diff.addedNodes.length}</span>
        <span className="diff-removed">-{entry.diff.removedNodes.length}</span>
        {entry.diff.modifiedNodes.length > 0 && (
          <span className="diff-modified">~{entry.diff.modifiedNodes.length}</span>
        )}
        {entry.diff.resolvedContradictions.length > 0 && (
          <span className="diff-resolved">{entry.diff.resolvedContradictions.length} resolved</span>
        )}
      </div>
    </div>
  )
}
