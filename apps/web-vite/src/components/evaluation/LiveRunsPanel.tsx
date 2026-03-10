import { useEffect, useMemo, useState } from 'react'
import type { Run } from '@lifeos/agents'
import { useLiveRuns } from '@/hooks/useLiveRuns'
import { useRunTrace } from '@/hooks/useRunTrace'
import { useWorkflowEvalAdapter } from '@/hooks/useWorkflowEvalAdapter'
import { WorkflowDetailPanel } from '@/components/evaluation/WorkflowDetailPanel'

function formatElapsed(run: Run) {
  const start = run.startedAtMs ?? run.createdAtMs
  if (!start) return 'n/a'
  const end = run.completedAtMs ?? Date.now()
  const seconds = Math.max(0, Math.round((end - start) / 1000))
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds % 60
  return `${minutes}m ${remainder}s`
}

function formatCost(value?: number) {
  return typeof value === 'number' ? `$${value.toFixed(value < 1 ? 3 : 2)}` : 'n/a'
}

function LiveRunList({
  title,
  subtitle,
  runs,
  selectedRunId,
  onSelect,
}: {
  title: string
  subtitle: string
  runs: Run[]
  selectedRunId: string
  onSelect: (runId: string) => void
}) {
  return (
    <section className="eval-card">
      <div className="eval-section-heading">
        <h3>{title}</h3>
        <p>{subtitle}</p>
      </div>
      <div className="eval-list">
        {runs.length === 0 ? (
          <div className="eval-empty">No runs available.</div>
        ) : (
          runs.map((run) => (
            <button
              key={run.runId}
              type="button"
              className={`eval-run-picker ${selectedRunId === run.runId ? 'active' : ''}`}
              onClick={() => onSelect(run.runId)}
            >
              <strong>{run.workflowType}</strong>
              <span>{run.status.replaceAll('_', ' ')}</span>
              <p>{run.goal.slice(0, 96)}</p>
            </button>
          ))
        )}
      </div>
    </section>
  )
}

export function LiveRunsPanel() {
  const { activeRuns, recentCompleted, loading, error } = useLiveRuns()
  const [selectedRunId, setSelectedRunId] = useState('')

  useEffect(() => {
    if (!selectedRunId && activeRuns[0]?.runId) {
      queueMicrotask(() => setSelectedRunId(activeRuns[0].runId))
      return
    }
    if (!selectedRunId && recentCompleted[0]?.runId) {
      queueMicrotask(() => setSelectedRunId(recentCompleted[0].runId))
    }
  }, [activeRuns, recentCompleted, selectedRunId])

  const selectedRun = useMemo(
    () =>
      activeRuns.find((run) => run.runId === selectedRunId) ??
      recentCompleted.find((run) => run.runId === selectedRunId) ??
      null,
    [activeRuns, recentCompleted, selectedRunId]
  )
  const trace = useRunTrace({ runId: selectedRun?.runId ?? null, includeComponentTelemetry: false })
  const { adapter } = useWorkflowEvalAdapter(selectedRun, trace.workflowState)
  const comparisonHints = adapter.buildComparisonHints({
    run: selectedRun,
    workflowState: trace.workflowState,
  })

  return (
    <div className="eval-panel">
      <section className="eval-card-grid">
        <article className="eval-stat-card">
          <span className="eval-stat-label">Active runs</span>
          <strong>{activeRuns.length}</strong>
        </article>
        <article className="eval-stat-card">
          <span className="eval-stat-label">Queued / waiting</span>
          <strong>
            {
              activeRuns.filter((run) => ['queued', 'waiting_for_input'].includes(run.status))
                .length
            }
          </strong>
        </article>
        <article className="eval-stat-card">
          <span className="eval-stat-label">Running now</span>
          <strong>{activeRuns.filter((run) => run.status === 'running').length}</strong>
        </article>
        <article className="eval-stat-card">
          <span className="eval-stat-label">Recent completed</span>
          <strong>{recentCompleted.length}</strong>
        </article>
      </section>

      {error ? <div className="eval-error-banner">{error}</div> : null}
      {loading ? <div className="eval-loading">Loading live runs...</div> : null}

      <section className="eval-live-layout">
        <aside className="eval-live-sidebar">
          <LiveRunList
            title="Active Runs"
            subtitle="In-flight workflows and queued work."
            runs={activeRuns}
            selectedRunId={selectedRunId}
            onSelect={setSelectedRunId}
          />
          <LiveRunList
            title="Recent Completed"
            subtitle="Quick jump targets for post-run inspection."
            runs={recentCompleted.slice(0, 12)}
            selectedRunId={selectedRunId}
            onSelect={setSelectedRunId}
          />
        </aside>

        <div className="eval-live-main">
          {!selectedRun ? (
            <div className="eval-empty">Select a run to inspect live workflow details.</div>
          ) : (
            <>
              <section className="eval-card">
                <div className="eval-workflow-card__header">
                  <div>
                    <h3>{selectedRun.workflowType}</h3>
                    <p className="eval-shell__small">{selectedRun.goal}</p>
                  </div>
                  <span
                    className={`eval-pill ${selectedRun.status === 'running' ? 'running' : 'neutral'}`}
                  >
                    {selectedRun.status.replaceAll('_', ' ')}
                  </span>
                </div>
                <dl className="eval-metric-list">
                  <div>
                    <dt>Elapsed</dt>
                    <dd>{formatElapsed(selectedRun)}</dd>
                  </div>
                  <div>
                    <dt>Step</dt>
                    <dd>{selectedRun.currentStep ?? 0}</dd>
                  </div>
                  <div>
                    <dt>Cost</dt>
                    <dd>{formatCost(selectedRun.estimatedCost)}</dd>
                  </div>
                  <div>
                    <dt>Events</dt>
                    <dd>{trace.events.length}</dd>
                  </div>
                </dl>
                <div className="eval-trace-hints">
                  {trace.workflowAnnotations.summaryBadges.map((badge) => (
                    <span key={badge} className="eval-pill neutral">
                      {badge}
                    </span>
                  ))}
                  {comparisonHints.map((hint) => (
                    <div key={hint.title} className="eval-hint-card">
                      <strong>{hint.title}</strong>
                      <p>{hint.detail}</p>
                    </div>
                  ))}
                </div>
              </section>

              <WorkflowDetailPanel run={selectedRun} events={trace.events} />
            </>
          )}
        </div>
      </section>
    </div>
  )
}
