/**
 * DeepResearchViewer Component
 *
 * Split-panel visualization for deep research runs:
 * - Left: Phase timeline stepper with loop groups
 * - Center: KG canvas (ReactFlow) with diff highlighting
 * - Bottom: Step scrubber, delta counters, evolution sparklines
 * - Right (overlay): ClaimDetailPanel on node click
 */

import { useMemo, useState, useCallback } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Panel,
  type Node,
  type Edge,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import '@/styles/components/DeepResearchViewer.css'
import { useTheme } from '@/contexts/useTheme'
import { useDeepResearchViewer } from '@/hooks/useDeepResearchViewer'
import type { PhaseTimelineItem } from '@/hooks/useDeepResearchViewer'
import { ClaimDetailPanel } from './ClaimDetailPanel'
import type { Run, Workflow, ExtractedClaim, SourceRecord } from '@lifeos/agents'

// ----- Constants -----

const NODE_WIDTH = 180
const NODE_HEIGHT = 60
const LAYER_GAP = 220
const ROW_GAP = 90

const PHASE_ICONS: Record<string, string> = {
  sense_making: '🧠',
  search_planning: '🗺️',
  search_execution: '🔍',
  source_ingestion: '📥',
  claim_extraction: '📝',
  kg_construction: '🏗️',
  thesis_generation: '💡',
  cross_negation: '⚔️',
  contradiction_crystallization: '⚡',
  sublation: '🔄',
  meta_reflection: '🪞',
  gap_analysis: '🔎',
  answer_generation: '✅',
}

const DIALECTICAL_PHASES = new Set([
  'thesis_generation',
  'cross_negation',
  'contradiction_crystallization',
  'sublation',
  'meta_reflection',
])

// Node type → visual config
interface NodeTypeConfig {
  icon: string
  color: string
  bgColor: string
  borderColor: string
}

const NODE_TYPE_CONFIG: Record<string, NodeTypeConfig> = {
  claim: {
    icon: '📝',
    color: 'var(--accent)',
    bgColor: 'color-mix(in srgb, var(--accent) 8%, var(--surface))',
    borderColor: 'var(--accent)',
  },
  concept: {
    icon: '💡',
    color: 'var(--info)',
    bgColor: 'color-mix(in srgb, var(--info) 8%, var(--surface))',
    borderColor: 'var(--info)',
  },
  source: {
    icon: '📄',
    color: 'var(--success)',
    bgColor: 'color-mix(in srgb, var(--success) 8%, var(--surface))',
    borderColor: 'var(--success)',
  },
  mechanism: {
    icon: '⚙️',
    color: 'var(--warning)',
    bgColor: 'color-mix(in srgb, var(--warning) 8%, var(--surface))',
    borderColor: 'var(--warning)',
  },
  contradiction: {
    icon: '⚡',
    color: 'var(--error)',
    bgColor: 'color-mix(in srgb, var(--error) 8%, var(--surface))',
    borderColor: 'var(--error)',
  },
  community: {
    icon: '🔗',
    color: 'var(--text-secondary)',
    bgColor: 'var(--muted)',
    borderColor: 'var(--border)',
  },
}

const DEFAULT_NODE_CONFIG: NodeTypeConfig = {
  icon: '●',
  color: 'var(--text-secondary)',
  bgColor: 'var(--surface)',
  borderColor: 'var(--border)',
}

// Edge type → visual config
// Edge styles use CSS variable references — ReactFlow resolves these via computed styles
const EDGE_STYLES: Record<string, { stroke: string; animated?: boolean; dashArray?: string }> = {
  supports: { stroke: 'var(--success)' },
  contradicts: { stroke: 'var(--error)', animated: true, dashArray: '5,5' },
  sourced_from: { stroke: 'var(--text-tertiary)', dashArray: '3,3' },
  references: { stroke: 'var(--info)' },
  part_of: { stroke: 'var(--text-tertiary)' },
}

// ----- Props -----

interface DeepResearchViewerProps {
  run: Run
  workflow: Workflow | null
}

// ----- Component -----

export function DeepResearchViewer({ run, workflow }: DeepResearchViewerProps) {
  const { theme } = useTheme()
  const viewer = useDeepResearchViewer(run, workflow)

  // Use KG data from the hook (loaded from Firestore)
  const kgData = viewer.kgData

  // Claim detail panel state
  const [selectedClaim, setSelectedClaim] = useState<ExtractedClaim | null>(null)
  const [selectedSource, setSelectedSource] = useState<SourceRecord | null>(null)

  // Build ReactFlow nodes from KG data
  const { nodes, edges } = useMemo(() => {
    if (!kgData?.nodes?.length) return { nodes: [] as Node[], edges: [] as Edge[] }

    // Group nodes by type for layered layout
    const typeGroups: Record<string, typeof kgData.nodes> = {}
    for (const n of kgData.nodes) {
      const t = n.type || 'claim'
      if (!typeGroups[t]) typeGroups[t] = []
      typeGroups[t].push(n)
    }

    const layerOrder = ['source', 'claim', 'concept', 'mechanism', 'contradiction', 'community']
    const rfNodes: Node[] = []

    let layerIdx = 0
    for (const layerType of layerOrder) {
      const group = typeGroups[layerType]
      if (!group?.length) continue

      for (let row = 0; row < group.length; row++) {
        const n = group[row]
        const config = NODE_TYPE_CONFIG[n.type] ?? DEFAULT_NODE_CONFIG
        const isAdded = viewer.addedNodeIds.has(n.id)
        const isSuperseded = viewer.supersededNodeIds.has(n.id)

        const label =
          n.label ??
          ((n.data as Record<string, unknown>)?.claimText as string) ??
          ((n.data as Record<string, unknown>)?.name as string) ??
          n.id

        rfNodes.push({
          id: n.id,
          type: 'default',
          data: {
            label: (
              <div
                className={`drv-node ${isAdded ? 'node-added' : ''} ${isSuperseded ? 'node-superseded' : ''}`}
              >
                <span className="drv-node-icon">{config.icon}</span>
                <span className="drv-node-text">
                  {typeof label === 'string' ? label.substring(0, 100) : ''}
                </span>
                <span className="drv-node-meta">{n.type}</span>
              </div>
            ),
            kgNode: n,
          },
          position: {
            x: layerIdx * LAYER_GAP,
            y: row * ROW_GAP,
          },
          style: {
            width: NODE_WIDTH,
            minHeight: NODE_HEIGHT,
            borderRadius: 8,
            border: `2px solid ${config.borderColor}`,
            background: config.bgColor,
            opacity: isSuperseded ? 0.3 : 1,
            cursor: 'pointer',
            padding: 0,
          },
        })
      }

      layerIdx++
    }

    // Build edges
    const rfEdges: Edge[] = (kgData.edges ?? []).map((e, idx) => {
      const style = EDGE_STYLES[e.type] ?? { stroke: '#94a3b8' }
      return {
        id: `${e.source}-${e.target}-${e.type}-${idx}`,
        source: e.source,
        target: e.target,
        animated: style.animated ?? false,
        style: {
          stroke: style.stroke,
          strokeWidth: Math.max(1, (e.weight ?? 1) * 1.5),
          strokeDasharray: style.dashArray,
        },
        label: e.type.replace(/_/g, ' '),
        labelStyle: { fill: 'var(--muted-foreground)', fontSize: 9 },
        labelBgStyle: { fill: 'var(--background)', fillOpacity: 0.8 },
      }
    })

    return { nodes: rfNodes, edges: rfEdges }
  }, [kgData, viewer.addedNodeIds, viewer.supersededNodeIds])

  // Handle node click → open claim detail
  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      const kgNode = (node.data as Record<string, unknown>)?.kgNode as
        | {
            id: string
            type: string
            data: Record<string, unknown>
          }
        | undefined
      if (!kgNode || kgNode.type !== 'claim') return

      // Find the matching ExtractedClaim
      const claim = viewer.extractedClaims.find(
        (c) => c.claimText === (kgNode.data?.claimText as string)
      )
      if (!claim) return

      // Find the source
      const source = viewer.sources.find((s) => s.sourceId === claim.sourceId) ?? null

      setSelectedClaim(claim)
      setSelectedSource(source)
    },
    [viewer.extractedClaims, viewer.sources]
  )

  const handleClaimDetailClose = useCallback(() => {
    setSelectedClaim(null)
    setSelectedSource(null)
  }, [])

  const handleRelatedClaimClick = useCallback(
    (claim: ExtractedClaim) => {
      const source = viewer.sources.find((s) => s.sourceId === claim.sourceId) ?? null
      setSelectedClaim(claim)
      setSelectedSource(source)
    },
    [viewer.sources]
  )

  // Get related claims for selected claim
  const relatedClaims = useMemo(() => {
    if (!selectedClaim) return []
    return viewer.extractedClaims
      .filter(
        (c) =>
          c !== selectedClaim &&
          (c.sourceId === selectedClaim.sourceId ||
            c.concepts.some((concept) => selectedClaim.concepts.includes(concept)))
      )
      .slice(0, 5)
  }, [selectedClaim, viewer.extractedClaims])

  // Grid color for ReactFlow background — re-derive when theme changes
  const gridColor = useMemo(() => {
    if (typeof document === 'undefined') return theme === 'dark' ? '#374151' : '#e5e7eb'
    const style = getComputedStyle(document.documentElement)
    return style.getPropertyValue('--border').trim() || '#e5e7eb'
  }, [theme])

  // Step scrubber helpers
  const canPrev = (viewer.selectedStep ?? viewer.totalSteps - 1) > 0
  const canNext = (viewer.selectedStep ?? viewer.totalSteps - 1) < viewer.totalSteps - 1

  const goToPrev = () => {
    const current = viewer.selectedStep ?? viewer.totalSteps - 1
    if (current > 0) viewer.setSelectedStep(current - 1)
  }

  const goToNext = () => {
    const current = viewer.selectedStep ?? viewer.totalSteps - 1
    if (current < viewer.totalSteps - 1) viewer.setSelectedStep(current + 1)
  }

  // Compute delta from previous snapshot
  const currentStats = viewer.currentSnapshot?.stats
  const prevStats = viewer.previousSnapshot?.stats

  return (
    <div className="drv">
      {/* Header */}
      <div className="drv-header">
        <h3>{run.goal || 'Deep Research'}</h3>

        {viewer.budget && (
          <div className="drv-budget">
            <div className="drv-budget-bar">
              <div
                className={`drv-budget-fill phase-${viewer.budget.phase}`}
                style={{
                  width: `${Math.min(100, (viewer.budget.spentUsd / viewer.budget.maxBudgetUsd) * 100)}%`,
                }}
              />
            </div>
            <span className="drv-budget-text">
              ${viewer.budget.spentUsd.toFixed(2)} / ${viewer.budget.maxBudgetUsd.toFixed(2)}
            </span>
            <span className={`drv-phase-badge phase-${viewer.budget.phase}`}>
              {viewer.budget.phase}
            </span>
          </div>
        )}

        <span className="drv-iter-badge">Iter {viewer.gapIterationsUsed}</span>
      </div>

      {/* Body */}
      <div className="drv-body">
        {/* Timeline */}
        <PhaseTimeline
          phases={viewer.phases}
          selectedStep={viewer.selectedStep}
          totalSteps={viewer.totalSteps}
          gapIterationsUsed={viewer.gapIterationsUsed}
          onPhaseClick={(phase) => {
            // Find the snapshot index for this phase
            const idx = viewer.evolutionData.findIndex((d) => d.phase === phase.phase)
            if (idx >= 0) viewer.setSelectedStep(idx)
          }}
        />

        {/* KG Canvas */}
        <div className="drv-canvas">
          {nodes.length > 0 ? (
            <ReactFlow
              nodes={nodes}
              edges={edges}
              fitView
              fitViewOptions={{ padding: 0.3 }}
              nodesDraggable
              nodesConnectable={false}
              zoomOnScroll
              panOnDrag
              onNodeClick={handleNodeClick}
              minZoom={0.1}
              maxZoom={2}
            >
              <Background gap={24} size={1} color={gridColor} />
              <Controls showInteractive={false} />
              <MiniMap nodeColor={() => 'var(--accent)'} maskColor="rgba(0,0,0,0.1)" />
              {currentStats && (
                <Panel position="top-right" className="drv-graph-stats">
                  <span>
                    <strong>{currentStats.claimCount}</strong> claims
                  </span>
                  <span>
                    <strong>{currentStats.sourceCount}</strong> sources
                  </span>
                  <span>
                    <strong>{currentStats.conceptCount}</strong> concepts
                  </span>
                  <span>
                    <strong>{currentStats.contradictionCount}</strong> conflicts
                  </span>
                </Panel>
              )}
            </ReactFlow>
          ) : (
            <div className="drv-empty">
              <span className="drv-empty-icon">🔬</span>
              <span className="drv-empty-text">
                {run.status === 'running'
                  ? 'Building knowledge graph...'
                  : 'No graph data available'}
              </span>
            </div>
          )}
        </div>

        {/* Claim Detail Panel (overlay) */}
        {selectedClaim && (
          <ClaimDetailPanel
            claim={selectedClaim}
            source={selectedSource}
            relatedClaims={relatedClaims}
            onClose={handleClaimDetailClose}
            onClaimClick={handleRelatedClaimClick}
          />
        )}
      </div>

      {/* Metrics Bar */}
      <div className="drv-metrics">
        {/* Scrubber */}
        <div className="drv-scrubber">
          <button className="drv-scrub-btn" onClick={goToPrev} disabled={!canPrev}>
            ◀
          </button>
          <span className="drv-scrub-label">
            {viewer.totalSteps > 0
              ? `${(viewer.selectedStep ?? viewer.totalSteps - 1) + 1} / ${viewer.totalSteps}`
              : '—'}
          </span>
          <button className="drv-scrub-btn" onClick={goToNext} disabled={!canNext}>
            ▶
          </button>
        </div>

        {viewer.totalSteps > 1 && (
          <input
            type="range"
            className="drv-slider"
            min={0}
            max={viewer.totalSteps - 1}
            value={viewer.selectedStep ?? viewer.totalSteps - 1}
            onChange={(e) => viewer.setSelectedStep(Number(e.target.value))}
          />
        )}

        {/* Delta counters */}
        {currentStats && (
          <div className="drv-deltas">
            <DeltaCounter
              label="Claims"
              current={currentStats.claimCount}
              previous={prevStats?.claimCount}
            />
            <DeltaCounter
              label="Sources"
              current={currentStats.sourceCount}
              previous={prevStats?.sourceCount}
            />
            <DeltaCounter
              label="Concepts"
              current={currentStats.conceptCount}
              previous={prevStats?.conceptCount}
            />
            <DeltaCounter
              label="Conflicts"
              current={currentStats.contradictionCount}
              previous={prevStats?.contradictionCount}
            />
          </div>
        )}

        {/* Sparklines */}
        {viewer.evolutionData.length > 1 && (
          <div className="drv-sparklines">
            <Sparkline
              label="Claims"
              data={viewer.evolutionData.map((d) => d.claims)}
              currentIdx={viewer.selectedStep ?? viewer.evolutionData.length - 1}
              className="claims"
            />
            <Sparkline
              label="Conflicts"
              data={viewer.evolutionData.map((d) => d.contradictions)}
              currentIdx={viewer.selectedStep ?? viewer.evolutionData.length - 1}
              className="contradictions"
            />
          </div>
        )}
      </div>
    </div>
  )
}

// ----- Sub-components -----

function PhaseTimeline({
  phases,
  selectedStep,
  onPhaseClick,
}: {
  phases: PhaseTimelineItem[]
  selectedStep: number | null
  totalSteps: number
  gapIterationsUsed: number
  onPhaseClick: (phase: PhaseTimelineItem) => void
}) {
  // Detect loop groups: when a phase repeats, it means a new gap/dialectical iteration started
  const loopBoundaries = useMemo(() => {
    const boundaries: Array<{ beforeIdx: number; loopNumber: number }> = []
    const seen = new Set<string>()
    let loopNum = 1

    for (let i = 0; i < phases.length; i++) {
      if (seen.has(phases[i].phase)) {
        boundaries.push({ beforeIdx: i, loopNumber: loopNum++ })
        seen.clear()
      }
      seen.add(phases[i].phase)
    }
    return boundaries
  }, [phases])

  // Build flat list with loop headers inserted
  const items: Array<
    { type: 'phase'; phase: PhaseTimelineItem; idx: number } | { type: 'loop'; loopNumber: number }
  > = []
  const boundarySet = new Map(loopBoundaries.map((b) => [b.beforeIdx, b.loopNumber]))

  for (let idx = 0; idx < phases.length; idx++) {
    const loopNum = boundarySet.get(idx)
    if (loopNum !== undefined) {
      items.push({ type: 'loop', loopNumber: loopNum })
    }
    items.push({ type: 'phase', phase: phases[idx], idx })
  }

  return (
    <nav className="drv-timeline" role="navigation" aria-label="Research phases">
      {items.map((item) => {
        if (item.type === 'loop') {
          return (
            <div key={`loop-${item.loopNumber}`} className="drv-loop-header">
              Loop {item.loopNumber}
            </div>
          )
        }

        const { phase, idx } = item
        const isDialectical = DIALECTICAL_PHASES.has(phase.phase)
        const statusIcon =
          phase.status === 'completed' ? '✓' : phase.status === 'active' ? '▶' : '○'

        const tooltip = [
          phase.durationMs !== undefined ? `Duration: ${phase.durationMs}ms` : null,
          phase.costUsd !== undefined ? `Cost: $${phase.costUsd.toFixed(4)}` : null,
        ]
          .filter(Boolean)
          .join(' | ')

        return (
          <div
            key={`${phase.phase}-${idx}`}
            className={`drv-phase-item ${phase.status} ${isDialectical ? 'dialectical' : ''} ${
              selectedStep !== null && phase.stepIndex === selectedStep ? 'selected' : ''
            }`}
            role="listitem"
            aria-current={phase.status === 'active' ? 'step' : undefined}
            title={tooltip || undefined}
            onClick={() => onPhaseClick(phase)}
          >
            <div className="drv-phase-icon">{statusIcon}</div>
            <span className="drv-phase-label">
              {PHASE_ICONS[phase.phase] ?? '●'} {phase.label}
            </span>
          </div>
        )
      })}
    </nav>
  )
}

function DeltaCounter({
  label,
  current,
  previous,
}: {
  label: string
  current: number
  previous?: number
}) {
  const delta = previous !== undefined ? current - previous : 0

  return (
    <span className="drv-delta">
      <strong>{current}</strong> {label}
      {delta > 0 && <span className="drv-delta-up">▲{delta}</span>}
      {delta < 0 && <span className="drv-delta-down">▼{Math.abs(delta)}</span>}
    </span>
  )
}

function Sparkline({
  label,
  data,
  currentIdx,
  className,
}: {
  label: string
  data: number[]
  currentIdx: number
  className: string
}) {
  if (data.length < 2) return null

  const max = Math.max(...data, 1)
  const w = 80
  const h = 28
  const padding = 2

  const points = data.map((val, i) => ({
    x: padding + (i / (data.length - 1)) * (w - 2 * padding),
    y: h - padding - (val / max) * (h - 2 * padding),
  }))

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${h} L ${points[0].x} ${h} Z`

  const marker = currentIdx < points.length ? points[currentIdx] : null

  return (
    <div className="drv-sparkline">
      <span className="drv-sparkline-label">{label}</span>
      <div className="drv-sparkline-chart">
        <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
          <path d={areaPath} className={`drv-sparkline-area ${className}`} />
          <path d={linePath} className={`drv-sparkline-line ${className}`} />
          {marker && (
            <circle cx={marker.x} cy={marker.y} className={`drv-sparkline-marker ${className}`} />
          )}
        </svg>
      </div>
    </div>
  )
}
