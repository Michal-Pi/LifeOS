/**
 * KnowledgeGraphVisualization — Top-level orchestrator for the Deep Research
 * knowledge graph visualization.
 *
 * Combines: interactive graph canvas (Cytoscape.js), node inspector sidebar,
 * stats bar, time-travel slider, cycle diff comparison, community detection,
 * source quality heatmap, and JSON/GraphML export.
 */

import { useState, useRef, useMemo, useCallback } from 'react'
import type cytoscape from 'cytoscape'
import type { Run, CompactGraph, KGSnapshot, GraphDiff } from '@lifeos/agents'
import { KGGraphCanvas, type ViewMode } from './KGGraphCanvas'
import { KGNodeInspector } from './KGNodeInspector'
import { KGDiffPanel } from './KGDiffPanel'
import { KGTimelineBar } from './KGTimelineBar'
import type { DeepResearchKGState } from '@/hooks/useDeepResearchKGState'
import { detectCommunities, type Community } from '@/lib/kgLouvain'
import { exportAsJSON, exportAsGraphML } from '@/lib/kgExport'
import './KnowledgeGraphVisualization.css'

interface KnowledgeGraphVisualizationProps {
  state: DeepResearchKGState
  run: Run
}

function MetricCard({
  icon,
  value,
  label,
  subtitle,
}: {
  icon: string
  value: number | string
  label: string
  subtitle?: string
}) {
  return (
    <div className="kg-metric-card">
      <span className="kg-metric-icon">{icon}</span>
      <div className="kg-metric-content">
        <span className="kg-metric-value">{value}</span>
        <span className="kg-metric-label">{label}</span>
        {subtitle && <span className="kg-metric-subtitle">{subtitle}</span>}
      </div>
    </div>
  )
}

function KGStatsBar({
  graph,
  snapshot,
  gapCoverage,
  sources,
}: {
  graph: CompactGraph | null
  snapshot: KGSnapshot | null
  gapCoverage: number | null
  sources: number
}) {
  const stats = snapshot?.stats
  const claimCount = stats?.claimCount ?? graph?.nodes.filter((n) => n.type === 'claim').length ?? 0
  const conceptCount =
    stats?.conceptCount ?? graph?.nodes.filter((n) => n.type === 'concept').length ?? 0
  const contradictionCount = stats?.contradictionCount ?? 0
  const communityCount = stats?.communityCount ?? 0

  return (
    <div className="kg-stats-bar">
      <MetricCard icon="◉" value={claimCount} label="Claims" />
      <MetricCard icon="◇" value={conceptCount} label="Concepts" />
      <MetricCard icon="⊕" value={sources} label="Sources" />
      <MetricCard icon="⚡" value={contradictionCount} label="Contradictions" />
      {gapCoverage !== null && (
        <MetricCard icon="◎" value={`${Math.round(gapCoverage * 100)}%`} label="Coverage" />
      )}
      {communityCount > 0 && <MetricCard icon="⬡" value={communityCount} label="Communities" />}
    </div>
  )
}

export default function KnowledgeGraphVisualization({
  state,
  run,
}: KnowledgeGraphVisualizationProps) {
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
  const [selectedTimeSliderIndex, setSelectedTimeSliderIndex] = useState(
    Math.max(0, state.snapshots.length - 1)
  )
  const [showDiffPanel, setShowDiffPanel] = useState(false)
  const timeSliderIndex =
    state.status === 'running'
      ? Math.max(selectedTimeSliderIndex, state.snapshots.length - 1)
      : Math.min(selectedTimeSliderIndex, Math.max(0, state.snapshots.length - 1))

  // Detect communities
  const communities: Community[] = useMemo(() => {
    if (!state.mergedGraph || !showCommunities) return []
    return detectCommunities(state.mergedGraph)
  }, [state.mergedGraph, showCommunities])

  // Snapshot highlight for time-travel
  const snapshotHighlight = useMemo(() => {
    if (state.snapshots.length === 0) return null
    const snap = state.snapshots[timeSliderIndex]
    if (!snap) return null
    return {
      addedNodeIds: snap.delta.addedNodeIds,
      supersededNodeIds: snap.delta.supersededNodeIds,
    }
  }, [state.snapshots, timeSliderIndex])

  // Current snapshot for stats
  const currentSnapshot = state.snapshots[timeSliderIndex] ?? null

  // Focus neighborhood: filter graph to 2-hop neighbors
  const handleFocusNeighborhood = useCallback((nodeId: string) => {
    const cy = cyRef.current
    if (!cy) return

    const node = cy.getElementById(nodeId)
    if (node.length === 0) return

    const neighborhood = node.closedNeighborhood().closedNeighborhood()
    cy.elements().addClass('dimmed')
    neighborhood.removeClass('dimmed')

    // Fit to neighborhood
    cy.fit(neighborhood, 40)
  }, [])

  const handleClearFocus = useCallback(() => {
    const cy = cyRef.current
    if (!cy) return
    cy.elements().removeClass('dimmed')
    cy.fit(undefined, 40)
  }, [])

  // Export handlers
  const handleExportJSON = useCallback(() => {
    if (!state.mergedGraph) return
    exportAsJSON(state.mergedGraph, run.runId, {
      goal: run.goal,
      status: state.status,
      tokensUsed: state.tokensUsed,
      estimatedCost: state.estimatedCost,
    })
  }, [state.mergedGraph, run.runId, run.goal, state.status, state.tokensUsed, state.estimatedCost])

  const handleExportGraphML = useCallback(() => {
    if (!state.mergedGraph) return
    exportAsGraphML(state.mergedGraph, run.runId)
  }, [state.mergedGraph, run.runId])

  // No graph yet
  if (!state.mergedGraph) {
    return (
      <div className="kg-viz-container">
        <div className="kg-viz-empty">
          <span className="kg-viz-empty-icon">◎</span>
          <p>Knowledge graph building in progress...</p>
          <p className="kg-viz-empty-phase">
            Current phase: {state.currentPhase || 'initializing'}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="kg-viz-container">
      {/* Stats Bar */}
      <KGStatsBar
        graph={state.mergedGraph}
        snapshot={currentSnapshot}
        gapCoverage={state.gapAnalysis?.overallCoverageScore ?? null}
        sources={state.sources.length}
      />

      {/* Toolbar */}
      <div className="kg-toolbar">
        <div className="kg-toolbar-group">
          <button
            className={`ghost-button kg-toolbar-btn ${viewMode === 'graph' ? 'active' : ''}`}
            onClick={() => {
              setViewMode('graph')
              setDiffHighlight(null)
            }}
          >
            Graph
          </button>
          <button
            className={`ghost-button kg-toolbar-btn ${viewMode === 'heatmap' ? 'active' : ''}`}
            onClick={() => setViewMode('heatmap')}
          >
            Quality Heatmap
          </button>
          <button
            className={`ghost-button kg-toolbar-btn ${viewMode === 'diff' ? 'active' : ''}`}
            onClick={() => {
              setViewMode('diff')
              setShowDiffPanel(true)
            }}
          >
            Diff View
          </button>
        </div>

        <div className="kg-toolbar-group">
          <button
            className={`ghost-button kg-toolbar-btn ${showCommunities ? 'active' : ''}`}
            onClick={() => setShowCommunities(!showCommunities)}
          >
            {showCommunities ? 'Hide' : 'Show'} Communities
          </button>
          <button className="ghost-button kg-toolbar-btn" onClick={handleClearFocus}>
            Reset View
          </button>
        </div>

        <div className="kg-toolbar-group">
          <button className="ghost-button kg-toolbar-btn" onClick={handleExportJSON}>
            Export JSON
          </button>
          <button className="ghost-button kg-toolbar-btn" onClick={handleExportGraphML}>
            Export GraphML
          </button>
        </div>
      </div>

      {/* Main content: graph + inspector */}
      <div className="kg-main-content">
        <div className="kg-graph-area">
          <KGGraphCanvas
            graph={state.mergedGraph}
            viewMode={viewMode}
            communities={communities}
            showCommunities={showCommunities}
            diffHighlight={diffHighlight}
            snapshotHighlight={snapshotHighlight}
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
          graph={state.mergedGraph}
          selectedNodeId={selectedNodeId}
          selectedEdge={selectedEdge}
          onClose={() => {
            setSelectedNodeId(null)
            setSelectedEdge(null)
          }}
          onFocusNeighborhood={handleFocusNeighborhood}
        />
      </div>

      {/* Timeline / Diff Panel */}
      {showDiffPanel && viewMode === 'diff' ? (
        <KGDiffPanel graphHistory={state.graphHistory} onHighlightDiff={setDiffHighlight} />
      ) : (
        <KGTimelineBar
          snapshots={state.snapshots}
          currentIndex={timeSliderIndex}
          onIndexChange={setSelectedTimeSliderIndex}
        />
      )}

      {/* Footer */}
      <div className="kg-footer">
        <span className="kg-footer-item">
          {state.mergedGraph.nodes.length} nodes, {state.mergedGraph.edges.length} edges
        </span>
        {state.tokensUsed > 0 && (
          <span className="kg-footer-item">{state.tokensUsed.toLocaleString()} tokens</span>
        )}
        {state.estimatedCost > 0 && (
          <span className="kg-footer-item">${state.estimatedCost.toFixed(4)}</span>
        )}
        <span className={`kg-footer-status kg-status-${state.status}`}>{state.status}</span>
      </div>
    </div>
  )
}
