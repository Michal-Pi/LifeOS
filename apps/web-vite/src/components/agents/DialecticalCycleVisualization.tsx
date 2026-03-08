/**
 * Dialectical Cycle Visualization
 *
 * Displays real-time progress of the 6-phase Hegelian dialectical cycle with:
 * - Phase progress indicator
 * - Conceptual velocity chart
 * - Contradiction density graph
 * - Thesis comparison view
 * - Synthesis preview
 */

import { useMemo, useState, useEffect, useCallback } from 'react'
import type {
  DialecticalPhase,
  ThesisOutput,
  NegationOutput,
  ContradictionOutput,
  SublationOutput,
  MetaDecision,
  CompactGraph,
  GraphDiff,
} from '@lifeos/agents'
import { DialecticalGraphPanel, type GraphSource } from './DialecticalGraphPanel'
import './DialecticalCycleVisualization.css'

// ----- Types -----

export interface CycleHistoryEntry {
  cycle: number
  theses: ThesisOutput[]
  negations: NegationOutput[]
  contradictions: ContradictionOutput[]
}

export interface CycleState {
  cycleNumber: number
  maxCycles: number
  phase: DialecticalPhase
  theses: ThesisOutput[]
  negations: NegationOutput[]
  contradictions: ContradictionOutput[]
  synthesis: SublationOutput | null
  mergedGraph: CompactGraph | null
  graphHistory: Array<{ cycle: number; diff: GraphDiff }>
  metaDecision: MetaDecision | null
  conceptualVelocity: number
  velocityHistory: number[]
  contradictionDensity: number
  densityHistory: number[]
  refinedGoal?: string
  cycleHistory?: CycleHistoryEntry[]
  status: 'running' | 'completed' | 'failed' | 'paused'
  tokensUsed: number
  estimatedCost: number
  startedAtMs: number
}

interface DialecticalCycleVisualizationProps {
  state: CycleState
  velocityThreshold: number
  onPause?: () => void
  onResume?: () => void
  onTerminate?: () => void
}

// Phase metadata
const PHASES: { key: DialecticalPhase; label: string; icon: string; description: string }[] = [
  {
    key: 'retrieve_context',
    label: 'Retrieve',
    icon: '🔍',
    description: 'Query knowledge graph for relevant context',
  },
  {
    key: 'thesis_generation',
    label: 'Thesis',
    icon: '💡',
    description: 'Generate theses from multiple perspectives',
  },
  {
    key: 'cross_negation',
    label: 'Negation',
    icon: '⚔️',
    description: 'Cross-critique theses with determinate negation',
  },
  {
    key: 'contradiction_crystallization',
    label: 'Crystallize',
    icon: '💎',
    description: 'Identify and classify contradictions',
  },
  { key: 'sublation', label: 'Sublation', icon: '🔄', description: 'Synthesize opposing views' },
  {
    key: 'regrounding',
    label: 'Reground',
    icon: '🔗',
    description: 'Reground synthesis in knowledge graph',
  },
  {
    key: 'meta_reflection',
    label: 'Meta',
    icon: '🪞',
    description: 'Reflect and decide next steps',
  },
]

// ----- Main Component -----

export function DialecticalCycleVisualization({
  state,
  velocityThreshold,
  onPause,
  onResume,
  onTerminate,
}: DialecticalCycleVisualizationProps) {
  const currentPhaseIndex = PHASES.findIndex((p) => p.key === state.phase)

  // Track elapsed time with state to avoid impure Date.now() during render
  const [elapsedMs, setElapsedMs] = useState(() => Date.now() - state.startedAtMs)

  // Graph panel state: null = hidden, GraphSource = which graph to show
  const [graphSource, setGraphSource] = useState<GraphSource | null>(null)

  useEffect(() => {
    if (state.status !== 'running') return
    const interval = setInterval(() => {
      setElapsedMs(Date.now() - state.startedAtMs)
    }, 1000)
    return () => clearInterval(interval)
  }, [state.status, state.startedAtMs])

  const handleOpenMergedGraph = useCallback(() => {
    setGraphSource({ type: 'merged' })
  }, [])

  const handleOpenThesisGraph = useCallback(
    (index: number, thesis: ThesisOutput) => {
      if (thesis.graph && thesis.graph.nodes.length > 0) {
        setGraphSource({ type: 'thesis', index, thesis })
      }
    },
    []
  )

  const handleCloseGraph = useCallback(() => {
    setGraphSource(null)
  }, [])

  return (
    <div className="dialectical-cycle-viz" role="region" aria-label="Dialectical cycle progress">
      {/* Header */}
      <div className="cycle-header">
        <div className="cycle-info">
          <h3 id="cycle-heading">
            Dialectical Cycle {state.cycleNumber}/{state.maxCycles}
          </h3>
          <span className={`cycle-status ${state.status}`} role="status" aria-live="polite">
            {state.status.toUpperCase()}
          </span>
        </div>
        {state.refinedGoal && (
          <div className="refined-goal" aria-label="Refined goal from meta-reflection">
            <span className="refined-goal-label">Refined goal:</span> {state.refinedGoal}
          </div>
        )}
        <div className="cycle-actions" role="group" aria-label="Cycle controls">
          {state.status === 'running' && onPause && (
            <button
              onClick={onPause}
              className="action-btn pause"
              aria-label="Pause dialectical cycle"
            >
              Pause
            </button>
          )}
          {state.status === 'paused' && onResume && (
            <button
              onClick={onResume}
              className="action-btn resume"
              aria-label="Resume dialectical cycle"
            >
              Resume
            </button>
          )}
          {(state.status === 'running' || state.status === 'paused') && onTerminate && (
            <button
              onClick={onTerminate}
              className="action-btn terminate"
              aria-label="Terminate dialectical cycle"
            >
              Terminate
            </button>
          )}
        </div>
      </div>

      {/* Phase Progress */}
      <nav
        className="phase-progress"
        role="navigation"
        aria-label="Dialectical phases"
        aria-describedby="phase-progress-description"
      >
        <span id="phase-progress-description" className="sr-only">
          Current phase: {PHASES[currentPhaseIndex]?.label ?? 'Unknown'}. Step{' '}
          {currentPhaseIndex + 1} of {PHASES.length}.
        </span>
        {PHASES.map((phase, idx) => (
          <div
            key={phase.key}
            className={`phase-step ${idx < currentPhaseIndex ? 'completed' : ''} ${idx === currentPhaseIndex ? 'active' : ''}`}
            title={phase.description}
            role="listitem"
            aria-current={idx === currentPhaseIndex ? 'step' : undefined}
            aria-label={`${phase.label}: ${phase.description}${idx < currentPhaseIndex ? ' (completed)' : idx === currentPhaseIndex ? ' (current)' : ' (pending)'}`}
          >
            <div className="phase-icon" aria-hidden="true">
              {phase.icon}
            </div>
            <div className="phase-label">{phase.label}</div>
            {idx < PHASES.length - 1 && <div className="phase-connector" aria-hidden="true" />}
          </div>
        ))}
      </nav>

      {/* Metrics Grid */}
      <div className="metrics-grid" role="group" aria-label="Cycle metrics">
        <VelocityChart
          velocity={state.conceptualVelocity}
          history={state.velocityHistory}
          threshold={velocityThreshold}
        />
        <ContradictionDensityChart
          density={state.contradictionDensity}
          history={state.densityHistory}
        />
        <MetricsCard
          title="Theses"
          value={state.theses.length}
          subtitle={`${state.theses.map((t) => t.lens).join(', ')}`}
          icon="💡"
        />
        <MetricsCard
          title="Contradictions"
          value={state.contradictions.length}
          subtitle={`${state.contradictions.filter((c) => c.severity === 'HIGH').length} HIGH severity`}
          icon="⚡"
        />
      </div>

      {/* Interactive Graph Panel */}
      {graphSource && state.mergedGraph && (
        <DialecticalGraphPanel
          source={graphSource}
          mergedGraph={state.mergedGraph}
          theses={state.theses}
          graphHistory={state.graphHistory}
          onClose={handleCloseGraph}
          onSwitchSource={setGraphSource}
        />
      )}

      {/* Merged Knowledge Graph Summary */}
      {state.mergedGraph && (
        <MergedGraphSummary
          graph={state.mergedGraph}
          graphHistory={state.graphHistory}
          onViewGraph={handleOpenMergedGraph}
        />
      )}

      {/* Per-Cycle Data View */}
      {state.cycleHistory && state.cycleHistory.length > 1 && (
        <CycleSelector
          cycleHistory={state.cycleHistory}
          currentTheses={state.theses}
          currentNegations={state.negations}
          currentContradictions={state.contradictions}
          onViewThesisGraph={handleOpenThesisGraph}
        />
      )}

      {/* Thesis Comparison (when no per-cycle history or single cycle) */}
      {(!state.cycleHistory || state.cycleHistory.length <= 1) && state.theses.length > 0 && (
        <ThesisComparisonView theses={state.theses} onViewThesisGraph={handleOpenThesisGraph} />
      )}

      {/* Contradiction List (when no per-cycle history or single cycle) */}
      {(!state.cycleHistory || state.cycleHistory.length <= 1) && state.contradictions.length > 0 && (
        <ContradictionList contradictions={state.contradictions} />
      )}

      {/* Synthesis Preview */}
      {state.synthesis && <SynthesisPreview synthesis={state.synthesis} />}

      {/* Footer Stats */}
      <footer className="cycle-footer" role="contentinfo" aria-label="Cycle statistics">
        <div className="stat">
          <span className="stat-label" id="elapsed-label">
            Elapsed
          </span>
          <span className="stat-value" aria-labelledby="elapsed-label">
            {formatDuration(elapsedMs)}
          </span>
        </div>
        <div className="stat">
          <span className="stat-label" id="tokens-label">
            Tokens
          </span>
          <span className="stat-value" aria-labelledby="tokens-label">
            {state.tokensUsed.toLocaleString()}
          </span>
        </div>
        <div className="stat">
          <span className="stat-label" id="cost-label">
            Cost
          </span>
          <span className="stat-value" aria-labelledby="cost-label">
            ${state.estimatedCost.toFixed(4)}
          </span>
        </div>
        {state.metaDecision && (
          <div className="stat decision">
            <span className="stat-label" id="decision-label">
              Decision
            </span>
            <span
              className={`stat-value ${state.metaDecision.toLowerCase()}`}
              aria-labelledby="decision-label"
              role="status"
            >
              {state.metaDecision}
            </span>
          </div>
        )}
      </footer>
    </div>
  )
}

// ----- Sub-Components -----

function VelocityChart({
  velocity,
  history,
  threshold,
}: {
  velocity: number
  history: number[]
  threshold: number
}) {
  const displayHistory = history.length > 0 ? history : [velocity]
  const maxVelocity = Math.max(...displayHistory, 1)
  const isLow = velocity < threshold

  return (
    <div
      className="chart-card velocity-chart"
      role="figure"
      aria-label={`Conceptual velocity chart: ${(velocity * 100).toFixed(1)}%${isLow ? ' (below threshold)' : ''}`}
    >
      <div className="chart-header">
        <h4 id="velocity-chart-title">Conceptual Velocity</h4>
        <span
          className={`velocity-value ${isLow ? 'low' : 'normal'}`}
          aria-live="polite"
          aria-atomic="true"
        >
          {(velocity * 100).toFixed(1)}%
        </span>
      </div>
      <div className="chart-body" aria-hidden="true">
        <div className="sparkline">
          {displayHistory.map((v, idx) => (
            <div
              key={idx}
              className="sparkline-bar"
              style={{ height: `${(v / maxVelocity) * 100}%` }}
            />
          ))}
        </div>
        <div className="threshold-line" style={{ bottom: `${(threshold / maxVelocity) * 100}%` }}>
          <span className="threshold-label">Threshold</span>
        </div>
      </div>
      <span className="sr-only">
        History: {displayHistory.map((v) => `${(v * 100).toFixed(0)}%`).join(', ')}. Threshold:{' '}
        {(threshold * 100).toFixed(0)}%.
      </span>
    </div>
  )
}

function ContradictionDensityChart({ density, history }: { density: number; history: number[] }) {
  const displayHistory = history.length > 0 ? history : [density]
  const maxDensity = Math.max(...displayHistory, 0.5)
  const isHigh = density > 0.5

  return (
    <div
      className="chart-card density-chart"
      role="figure"
      aria-label={`Contradiction density chart: ${(density * 100).toFixed(1)}%${isHigh ? ' (high)' : ''}`}
    >
      <div className="chart-header">
        <h4 id="density-chart-title">Contradiction Density</h4>
        <span
          className={`density-value ${isHigh ? 'high' : 'normal'}`}
          aria-live="polite"
          aria-atomic="true"
        >
          {(density * 100).toFixed(1)}%
        </span>
      </div>
      <div className="chart-body" aria-hidden="true">
        <div className="sparkline">
          {displayHistory.map((d, idx) => (
            <div
              key={idx}
              className={`sparkline-bar ${d > 0.5 ? 'warning' : ''}`}
              style={{ height: `${(d / maxDensity) * 100}%` }}
            />
          ))}
        </div>
      </div>
      <span className="sr-only">
        History: {displayHistory.map((d) => `${(d * 100).toFixed(0)}%`).join(', ')}.
      </span>
    </div>
  )
}

function MetricsCard({
  title,
  value,
  subtitle,
  icon,
}: {
  title: string
  value: number
  subtitle: string
  icon: string
}) {
  return (
    <div className="metrics-card" role="group" aria-label={`${title}: ${value}`}>
      <div className="metrics-icon" aria-hidden="true">
        {icon}
      </div>
      <div className="metrics-content">
        <div className="metrics-value" aria-live="polite">
          {value}
        </div>
        <div className="metrics-title">{title}</div>
        <div className="metrics-subtitle">{subtitle}</div>
      </div>
    </div>
  )
}

function ThesisComparisonView({
  theses,
  onViewThesisGraph,
}: {
  theses: ThesisOutput[]
  onViewThesisGraph: (index: number, thesis: ThesisOutput) => void
}) {
  return (
    <section className="thesis-comparison" aria-labelledby="thesis-comparison-heading">
      <h4 id="thesis-comparison-heading">Theses Comparison</h4>
      <div className="thesis-grid" role="list">
        {theses.map((thesis, idx) => {
          const hasGraph = thesis.graph && thesis.graph.nodes.length > 0
          return (
            <article
              key={thesis.agentId || idx}
              className={`thesis-card ${hasGraph ? 'has-graph' : ''}`}
              role="listitem"
              aria-label={`Thesis from ${thesis.lens} perspective, confidence ${(thesis.confidence * 100).toFixed(0)}%${hasGraph ? '. Click to view graph.' : ''}`}
              onClick={hasGraph ? () => onViewThesisGraph(idx, thesis) : undefined}
            >
              <div className="thesis-header">
                <span className="thesis-lens">{thesis.lens}</span>
                <span
                  className="thesis-confidence"
                  aria-label={`Confidence: ${(thesis.confidence * 100).toFixed(0)}%`}
                >
                  {(thesis.confidence * 100).toFixed(0)}%
                </span>
              </div>
              <div className="thesis-model">{thesis.model}</div>
              {thesis.graph ? (
                <>
                  <div className="thesis-content">{thesis.graph.summary}</div>
                  {thesis.graph.reasoning && (
                    <div className="thesis-reasoning">{thesis.graph.reasoning}</div>
                  )}
                  <div className="thesis-graph-stats">
                    {thesis.graph.nodes.length} nodes, {thesis.graph.edges.length} edges
                    {thesis.graph.regime && (
                      <span className="thesis-regime"> | {thesis.graph.regime}</span>
                    )}
                  </div>
                </>
              ) : (
                <div className="thesis-content">
                  {thesis.rawText.length > 200
                    ? `${thesis.rawText.slice(0, 200)}...`
                    : thesis.rawText}
                </div>
              )}
              <div className="thesis-concepts" role="list" aria-label="Key concepts">
                {thesis.graph
                  ? thesis.graph.nodes.slice(0, 5).map((node) => (
                      <span key={node.id} className="concept-tag" role="listitem" title={node.note}>
                        {node.label}
                      </span>
                    ))
                  : Object.keys(thesis.conceptGraph)
                      .slice(0, 5)
                      .map((concept) => (
                        <span key={concept} className="concept-tag" role="listitem">
                          {concept}
                        </span>
                      ))}
              </div>
              {hasGraph && <div className="thesis-view-graph">View Graph</div>}
            </article>
          )
        })}
      </div>
    </section>
  )
}

function MergedGraphSummary({
  graph,
  graphHistory,
  onViewGraph,
}: {
  graph: CompactGraph
  graphHistory: Array<{ cycle: number; diff: GraphDiff }>
  onViewGraph: () => void
}) {
  const contradictEdges = graph.edges.filter((e) => e.rel === 'contradicts')
  const latestDiff = graphHistory.length > 0 ? graphHistory[graphHistory.length - 1] : null

  return (
    <section className="merged-graph-summary" aria-labelledby="merged-graph-heading">
      <h4 id="merged-graph-heading">Knowledge Graph</h4>
      <div className="graph-summary-content">
        <div className="graph-headline">{graph.summary}</div>
        {graph.reasoning && <div className="graph-reasoning">{graph.reasoning}</div>}
        <div className="graph-stats" role="group" aria-label="Graph statistics">
          <span className="graph-stat">{graph.nodes.length} nodes</span>
          <span className="graph-stat">{graph.edges.length} edges</span>
          <span className="graph-stat">{contradictEdges.length} contradictions</span>
          <span className="graph-stat">confidence: {(graph.confidence * 100).toFixed(0)}%</span>
        </div>
        {latestDiff && (
          <div className="graph-diff" aria-label="Latest changes">
            <span className="diff-label">Last cycle:</span>
            {latestDiff.diff.addedNodes.length > 0 && (
              <span className="diff-added">+{latestDiff.diff.addedNodes.length} nodes</span>
            )}
            {latestDiff.diff.removedNodes.length > 0 && (
              <span className="diff-removed">-{latestDiff.diff.removedNodes.length} nodes</span>
            )}
            {latestDiff.diff.resolvedContradictions.length > 0 && (
              <span className="diff-resolved">
                {latestDiff.diff.resolvedContradictions.length} resolved
              </span>
            )}
          </div>
        )}
        <div className="graph-summary-actions">
          <button className="view-graph-btn" onClick={onViewGraph}>
            View Interactive Graph
          </button>
        </div>
      </div>
    </section>
  )
}

function ContradictionList({ contradictions }: { contradictions: ContradictionOutput[] }) {
  const sorted = useMemo(() => {
    return [...contradictions].sort((a, b) => {
      const severityOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 }
      return severityOrder[a.severity] - severityOrder[b.severity]
    })
  }, [contradictions])

  return (
    <section className="contradiction-list" aria-labelledby="contradiction-list-heading">
      <h4 id="contradiction-list-heading">Contradictions ({contradictions.length})</h4>
      <ul className="contradiction-items" role="list">
        {sorted.slice(0, 5).map((c) => (
          <li
            key={c.id}
            className={`contradiction-item ${c.severity.toLowerCase()}`}
            role="listitem"
            aria-label={`${c.severity} severity ${c.type} contradiction`}
          >
            <div className="contradiction-header">
              <span
                className={`severity-badge ${c.severity.toLowerCase()}`}
                role="status"
                aria-label={`Severity: ${c.severity}`}
              >
                {c.severity}
              </span>
              <span className="contradiction-type">{c.type}</span>
              <span className="action-distance" aria-label={`Action distance: ${c.actionDistance}`}>
                Distance: {c.actionDistance}
              </span>
            </div>
            <div className="contradiction-description">{c.description}</div>
          </li>
        ))}
        {contradictions.length > 5 && (
          <li
            className="more-contradictions"
            aria-label={`${contradictions.length - 5} more contradictions not shown`}
          >
            +{contradictions.length - 5} more
          </li>
        )}
      </ul>
    </section>
  )
}

function SynthesisPreview({ synthesis }: { synthesis: SublationOutput }) {
  return (
    <section className="synthesis-preview" aria-labelledby="synthesis-preview-heading">
      <h4 id="synthesis-preview-heading">Synthesis</h4>
      {synthesis.incompleteReason && (
        <p className="warning-text" role="status">
          {synthesis.incompleteReason}
        </p>
      )}
      <div className="synthesis-content">
        <div className="synthesis-section">
          <h5 id="operators-heading">Operators Applied ({synthesis.operators.length})</h5>
          <div className="operator-list" role="list" aria-labelledby="operators-heading">
            {synthesis.operators.slice(0, 3).map((op, idx) => (
              <span key={idx} className="operator-tag" role="listitem">
                {op.type}: {op.target}
              </span>
            ))}
            {synthesis.operators.length > 3 && (
              <span
                className="more"
                aria-label={`${synthesis.operators.length - 3} more operators`}
              >
                +{synthesis.operators.length - 3}
              </span>
            )}
          </div>
        </div>

        <div className="synthesis-stats" role="group" aria-label="Synthesis statistics">
          <div className="stat-item">
            <span className="stat-label" id="preserved-label">
              Preserved
            </span>
            <span className="stat-value" aria-labelledby="preserved-label">
              {synthesis.preservedElements.length}
            </span>
          </div>
          <div className="stat-item">
            <span className="stat-label" id="negated-label">
              Negated
            </span>
            <span className="stat-value" aria-labelledby="negated-label">
              {synthesis.negatedElements.length}
            </span>
          </div>
          <div className="stat-item">
            <span className="stat-label" id="new-claims-label">
              New Claims
            </span>
            <span className="stat-value" aria-labelledby="new-claims-label">
              {synthesis.newClaims.length}
            </span>
          </div>
          <div className="stat-item">
            <span className="stat-label" id="predictions-label">
              Predictions
            </span>
            <span className="stat-value" aria-labelledby="predictions-label">
              {synthesis.newPredictions.length}
            </span>
          </div>
        </div>
      </div>
    </section>
  )
}

function CycleSelector({
  cycleHistory,
  currentTheses,
  currentNegations,
  currentContradictions,
  onViewThesisGraph,
}: {
  cycleHistory: CycleHistoryEntry[]
  currentTheses: ThesisOutput[]
  currentNegations: NegationOutput[]
  currentContradictions: ContradictionOutput[]
  onViewThesisGraph: (index: number, thesis: ThesisOutput) => void
}) {
  const [selectedCycle, setSelectedCycle] = useState<number | 'all'>('all')

  const viewData = useMemo(() => {
    if (selectedCycle === 'all') {
      return { theses: currentTheses, negations: currentNegations, contradictions: currentContradictions }
    }
    const entry = cycleHistory.find((h) => h.cycle === selectedCycle)
    return entry ?? { theses: [], negations: [], contradictions: [] }
  }, [selectedCycle, cycleHistory, currentTheses, currentNegations, currentContradictions])

  return (
    <section className="cycle-selector" aria-label="Per-cycle data view">
      <div className="cycle-tabs" role="tablist">
        <button
          role="tab"
          aria-selected={selectedCycle === 'all'}
          className={`cycle-tab ${selectedCycle === 'all' ? 'active' : ''}`}
          onClick={() => setSelectedCycle('all')}
        >
          All
        </button>
        {cycleHistory.map((entry) => (
          <button
            key={entry.cycle}
            role="tab"
            aria-selected={selectedCycle === entry.cycle}
            className={`cycle-tab ${selectedCycle === entry.cycle ? 'active' : ''}`}
            onClick={() => setSelectedCycle(entry.cycle)}
          >
            C{entry.cycle}
            <span className="cycle-tab-count">
              {entry.theses.length}T {entry.contradictions.length}X
            </span>
          </button>
        ))}
      </div>
      {viewData.theses.length > 0 && (
        <ThesisComparisonView theses={viewData.theses} onViewThesisGraph={onViewThesisGraph} />
      )}
      {viewData.contradictions.length > 0 && (
        <ContradictionList contradictions={viewData.contradictions} />
      )}
    </section>
  )
}

// ----- Utilities -----

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`
  }
  return `${seconds}s`
}

export default DialecticalCycleVisualization
