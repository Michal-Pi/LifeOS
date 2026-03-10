import { useEffect, useMemo, useState } from 'react'
import type { EvalResult, Run, RunId } from '@lifeos/agents'
import { useRunTrace } from '@/hooks/useRunTrace'
import { useWorkflowEvalAdapter } from '@/hooks/useWorkflowEvalAdapter'
import { TraceViewer } from '@/components/evaluation/TraceViewer'
import { WorkflowDetailPanel } from '@/components/evaluation/WorkflowDetailPanel'
import { Button } from '@/components/ui/button'

interface TraceInspectorProps {
  recentRuns: Run[]
  results: EvalResult[]
}

export function TraceInspector({ recentRuns, results }: TraceInspectorProps) {
  const [selectedRunId, setSelectedRunId] = useState<string>(recentRuns[0]?.runId ?? '')

  useEffect(() => {
    if (!selectedRunId && recentRuns[0]?.runId) {
      queueMicrotask(() => setSelectedRunId(recentRuns[0].runId))
    }
  }, [recentRuns, selectedRunId])

  const selectedRun = useMemo(
    () => recentRuns.find((run) => run.runId === selectedRunId) ?? null,
    [recentRuns, selectedRunId]
  )
  const resultMap = useMemo(
    () => new Map(results.map((result) => [result.runId, result])),
    [results]
  )
  const selectedResult = selectedRun ? (resultMap.get(selectedRun.runId) ?? null) : null
  const trace = useRunTrace({ runId: (selectedRun?.runId ?? null) as RunId | null })
  const { adapter } = useWorkflowEvalAdapter(selectedRun, trace.workflowState)
  const comparisonHints = adapter.buildComparisonHints({
    run: selectedRun,
    workflowState: trace.workflowState,
  })

  return (
    <div className="eval-panel">
      <section className="eval-trace-layout">
        <aside className="eval-trace-sidebar">
          <div className="eval-section-heading">
            <h3>Trace Runs</h3>
            <p>Select a recent run to inspect.</p>
          </div>
          <div className="eval-list">
            {recentRuns.length === 0 ? (
              <div className="eval-empty">No runs available.</div>
            ) : (
              recentRuns.slice(0, 20).map((run) => (
                <button
                  key={run.runId}
                  type="button"
                  className={`eval-run-picker ${selectedRunId === run.runId ? 'active' : ''}`}
                  onClick={() => setSelectedRunId(run.runId)}
                >
                  <strong>{run.workflowType}</strong>
                  <span>{run.status}</span>
                  <p>{run.goal.slice(0, 88)}</p>
                </button>
              ))
            )}
          </div>
        </aside>

        <div className="eval-trace-main">
          {selectedRun && trace.telemetry ? (
            <>
              <div className="eval-card">
                <div className="eval-section-heading">
                  <h3>Workflow Annotations</h3>
                  <p>{trace.workflowAnnotations.workflowType ?? selectedRun.workflowType}</p>
                </div>
                <div className="eval-badge-row">
                  {trace.workflowAnnotations.summaryBadges.map((badge) => (
                    <span key={badge} className="eval-pill neutral">
                      {badge}
                    </span>
                  ))}
                </div>
                <ul className="eval-note-list">
                  {trace.workflowAnnotations.notes.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
                <div className="eval-trace-hints">
                  {comparisonHints.map((hint) => (
                    <div key={hint.title} className="eval-hint-card">
                      <strong>{hint.title}</strong>
                      <p>{hint.detail}</p>
                    </div>
                  ))}
                </div>
                <div className="eval-trace-actions">
                  <Button
                    variant="ghost"
                    onClick={() => {
                      const blob = new Blob([trace.exportTrace()], { type: 'application/json' })
                      const url = URL.createObjectURL(blob)
                      const link = document.createElement('a')
                      link.href = url
                      link.download = `${selectedRun.runId}-trace.json`
                      link.click()
                      URL.revokeObjectURL(url)
                    }}
                  >
                    Export Trace JSON
                  </Button>
                </div>
              </div>

              <TraceViewer
                runId={selectedRun.runId}
                workflowType={trace.workflowAnnotations.workflowType ?? selectedRun.workflowType}
                steps={trace.steps}
                componentTelemetry={trace.componentTelemetry}
                totalDurationMs={trace.telemetry.durationMs}
                totalTokens={trace.telemetry.totalTokens}
                estimatedCost={trace.telemetry.estimatedCost}
                status={trace.telemetry.status}
              />
              <WorkflowDetailPanel
                run={selectedRun}
                events={trace.events}
                result={selectedResult}
              />
            </>
          ) : trace.loading ? (
            <div className="eval-empty">Loading trace...</div>
          ) : (
            <div className="eval-empty">Select a run with available telemetry.</div>
          )}
        </div>
      </section>
    </div>
  )
}
