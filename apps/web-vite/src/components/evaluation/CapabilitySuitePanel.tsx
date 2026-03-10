import { useMemo, useState } from 'react'
import type { CapabilitySuite, DerivedTestCase, EvalResult, Run } from '@lifeos/agents'
import type { CapabilityRunRecord, CapabilitySnapshot } from '@/hooks/evaluationWorkspaceTypes'
import {
  buildCapabilityFamilySummaries,
  buildCapabilitySnapshotDiffs,
} from '@/components/evaluation/capabilityAnalytics'
import { useCapabilitySuiteOperations } from '@/hooks/useCapabilitySuiteOperations'

interface CapabilitySuitePanelProps {
  capabilitySuites: CapabilitySuite[]
  testCases: DerivedTestCase[]
  recentRuns: Run[]
  results: EvalResult[]
  capabilityRunRecords: CapabilityRunRecord[]
  capabilitySnapshots: CapabilitySnapshot[]
  onRefresh?: () => void
  initialSelectedSuiteId?: string | null
}

function formatScore(value?: number | null) {
  if (typeof value !== 'number') return 'n/a'
  return value.toFixed(2)
}

export function CapabilitySuitePanel({
  capabilitySuites,
  testCases,
  recentRuns,
  results,
  capabilityRunRecords,
  capabilitySnapshots,
  onRefresh,
  initialSelectedSuiteId,
}: CapabilitySuitePanelProps) {
  const [selectedSuiteId, setSelectedSuiteId] = useState(
    initialSelectedSuiteId ?? capabilitySuites[0]?.suiteId ?? ''
  )
  const [runSelections, setRunSelections] = useState<Record<string, string>>({})
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({})

  const selectedSuite = capabilitySuites.find((suite) => suite.suiteId === selectedSuiteId) ?? null
  const resultMap = useMemo(
    () => new Map(results.map((result) => [result.runId, result])),
    [results]
  )
  const runMap = useMemo(() => new Map(recentRuns.map((run) => [run.runId, run])), [recentRuns])
  const suiteTestCases = useMemo(
    () =>
      selectedSuite
        ? testCases.filter((testCase) => selectedSuite.testCaseIds.includes(testCase.testCaseId))
        : [],
    [selectedSuite, testCases]
  )
  const suiteRecords = useMemo(
    () =>
      selectedSuite
        ? capabilityRunRecords.filter((record) => record.suiteId === selectedSuite.suiteId)
        : [],
    [capabilityRunRecords, selectedSuite]
  )
  const familySummaries = useMemo(
    () => buildCapabilityFamilySummaries(suiteRecords),
    [suiteRecords]
  )
  const suiteSnapshots = useMemo(
    () =>
      selectedSuite
        ? capabilitySnapshots.filter((snapshot) => snapshot.suiteId === selectedSuite.suiteId)
        : [],
    [capabilitySnapshots, selectedSuite]
  )
  const snapshotDiffs = useMemo(
    () => buildCapabilitySnapshotDiffs(suiteSnapshots),
    [suiteSnapshots]
  )
  const { saveCapabilityExecution, saveCapabilitySnapshotSummary, submitting } =
    useCapabilitySuiteOperations({
      suite: selectedSuite,
      onRefresh,
    })

  return (
    <div className="eval-panel">
      <section className="eval-card">
        <div className="eval-section-heading">
          <h3>Capability Execution</h3>
          <p>Run and review reasoning-family evaluations outside benchmark cohorts.</p>
        </div>
        <label className="eval-cohort-selector">
          Capability suite
          <select
            value={selectedSuiteId}
            onChange={(event) => setSelectedSuiteId(event.target.value)}
          >
            <option value="">Select capability suite</option>
            {capabilitySuites.map((suite) => (
              <option key={suite.suiteId} value={suite.suiteId}>
                {suite.name}
              </option>
            ))}
          </select>
        </label>
        {!selectedSuite ? (
          <div className="eval-empty">Select a capability suite to execute and review it.</div>
        ) : (
          <>
            <div className="eval-card-grid">
              <article className="eval-stat-card">
                <span className="eval-stat-label">Families</span>
                <strong>{selectedSuite.taskFamilies.length}</strong>
              </article>
              <article className="eval-stat-card">
                <span className="eval-stat-label">Linked Test Cases</span>
                <strong>{selectedSuite.testCaseIds.length}</strong>
              </article>
              <article className="eval-stat-card">
                <span className="eval-stat-label">Executions</span>
                <strong>{suiteRecords.length}</strong>
              </article>
              <article className="eval-stat-card">
                <span className="eval-stat-label">Holdout Executions</span>
                <strong>{suiteRecords.filter((record) => record.isHoldout).length}</strong>
              </article>
            </div>

            <section className="eval-card">
              <div className="eval-section-heading">
                <h3>Capability Family Summary</h3>
                <p>Pass rate and human-review pressure by reasoning family.</p>
              </div>
              {familySummaries.length === 0 ? (
                <div className="eval-empty">No capability executions recorded yet.</div>
              ) : (
                <div className="eval-list">
                  {familySummaries.map((summary) => (
                    <div key={summary.taskFamily} className="eval-list-item">
                      <div>
                        <strong>{summary.taskFamily}</strong>
                        <p>
                          {summary.passed}/{summary.total} passed · holdout {summary.holdout} ·
                          human review {summary.humanReview}
                        </p>
                      </div>
                      <span>{formatScore(summary.avgScore)}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="eval-card">
              <div className="eval-section-heading">
                <h3>Capability Snapshot History</h3>
                <p>Save and diff reasoning-family performance over time for this suite.</p>
              </div>
              <div className="eval-form-actions">
                <button
                  type="button"
                  className="eval-refresh-button"
                  disabled={submitting || familySummaries.length === 0}
                  onClick={() => void saveCapabilitySnapshotSummary(familySummaries)}
                >
                  {submitting ? 'Saving...' : 'Save Capability Snapshot'}
                </button>
              </div>
              {snapshotDiffs.length === 0 ? (
                <div className="eval-empty">No capability snapshots saved yet.</div>
              ) : (
                <div className="eval-list">
                  {snapshotDiffs.map(({ snapshot, previous, familyDiffs }) => (
                    <div
                      key={snapshot.snapshotId}
                      className="eval-list-item eval-list-item--stacked"
                    >
                      <div>
                        <strong>{new Date(snapshot.updatedAtMs).toLocaleString()}</strong>
                        <p>
                          {snapshot.summary
                            .map((item) => `${item.taskFamily} ${formatScore(item.avgScore)}`)
                            .join(' · ')}
                        </p>
                        {previous ? (
                          <div className="eval-snapshot-diff-list">
                            {familyDiffs.map((diff) => (
                              <div
                                key={`${snapshot.snapshotId}-${diff.taskFamily}`}
                                className="eval-snapshot-diff-item"
                              >
                                <strong>{diff.taskFamily}</strong>
                                <span>q {formatScore(diff.qualityDelta)}</span>
                                <span>pass {formatScore(diff.passDelta)}</span>
                                <span>review {diff.humanReviewDelta ?? 'n/a'}</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p>Baseline capability snapshot for this suite.</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="eval-card">
              <div className="eval-section-heading">
                <h3>Execution Queue</h3>
                <p>Assign runs to capability cases and persist reasoning-family review records.</p>
              </div>
              <div className="eval-list">
                {suiteTestCases.map((testCase) => {
                  const records = suiteRecords.filter(
                    (record) => record.testCaseId === testCase.testCaseId
                  )
                  const matchingRuns = recentRuns.filter(
                    (run) =>
                      run.workflowType === testCase.workflowType ||
                      run.runId === testCase.sourceRunId
                  )
                  return (
                    <article key={testCase.testCaseId} className="eval-card eval-card--compact">
                      <div className="eval-section-heading">
                        <h3>{testCase.description ?? testCase.input.slice(0, 72)}</h3>
                        <p>
                          {testCase.taskFamily ?? 'unassigned'} · {testCase.difficulty ?? 'n/a'} ·{' '}
                          {testCase.isHoldout ? 'holdout' : 'in-sample'}
                        </p>
                      </div>
                      <div className="eval-form-actions">
                        <select
                          className="eval-select"
                          value={runSelections[testCase.testCaseId] ?? ''}
                          onChange={(event) =>
                            setRunSelections((value) => ({
                              ...value,
                              [testCase.testCaseId]: event.target.value,
                            }))
                          }
                        >
                          <option value="">Select run</option>
                          {matchingRuns.map((run) => (
                            <option key={run.runId} value={run.runId}>
                              {run.workflowType} · {run.goal.slice(0, 56)}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          className="eval-refresh-button"
                          disabled={!runSelections[testCase.testCaseId] || submitting}
                          onClick={() => {
                            const run = runMap.get(runSelections[testCase.testCaseId])
                            if (!run) return
                            const existing = records.find((record) => record.runId === run.runId)
                            void saveCapabilityExecution({
                              testCase,
                              run,
                              result: resultMap.get(run.runId) ?? null,
                              notes: noteDrafts[testCase.testCaseId],
                              existing,
                            })
                          }}
                        >
                          {submitting ? 'Saving...' : 'Record Execution'}
                        </button>
                      </div>
                      <textarea
                        className="eval-textarea"
                        rows={2}
                        value={noteDrafts[testCase.testCaseId] ?? ''}
                        onChange={(event) =>
                          setNoteDrafts((value) => ({
                            ...value,
                            [testCase.testCaseId]: event.target.value,
                          }))
                        }
                        placeholder="Notes on reasoning quality, calibration, or failure mode."
                      />
                      <div className="eval-list">
                        {records.length === 0 ? (
                          <div className="eval-empty">No executions recorded for this case.</div>
                        ) : (
                          records.map((record) => {
                            const run = runMap.get(record.runId)
                            return (
                              <div key={record.recordId} className="eval-list-item">
                                <div>
                                  <strong>{run?.workflowType ?? record.runId}</strong>
                                  <p>
                                    score {formatScore(record.qualityScore)} ·{' '}
                                    {record.passed ? 'pass' : 'fail'} ·{' '}
                                    {record.isHoldout ? 'holdout' : 'in-sample'}
                                  </p>
                                  {record.notes ? <p>{record.notes}</p> : null}
                                </div>
                                <div className="eval-inline-actions">
                                  {typeof record.scoreVariance === 'number' ? (
                                    <span className="eval-pill neutral">
                                      variance {formatScore(record.scoreVariance)}
                                    </span>
                                  ) : null}
                                  {record.requiresHumanReview ? (
                                    <span className="eval-pill warning">human review</span>
                                  ) : null}
                                </div>
                              </div>
                            )
                          })
                        )}
                      </div>
                    </article>
                  )
                })}
              </div>
            </section>
          </>
        )}
      </section>
    </div>
  )
}
