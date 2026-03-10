import type { Dispatch, SetStateAction } from 'react'
import type { BenchmarkCohort, DerivedTestCase, RegressionTestResult, Run } from '@lifeos/agents'
import type {
  AutoAttachProposalFeedback,
  BenchmarkRunAssignment,
  BenchmarkSnapshot,
  TestCaseReviewDecision,
} from '@/hooks/evaluationWorkspaceTypes'
import type { SuggestedCandidate } from '@/components/evaluation/benchmarkPolicy'

function formatScore(value?: number | null) {
  if (typeof value !== 'number') return 'n/a'
  return value.toFixed(2)
}

function formatUsd(value?: number) {
  return typeof value === 'number' ? `$${value.toFixed(value < 1 ? 3 : 2)}` : 'n/a'
}

function formatSignedDelta(value: number | null | undefined) {
  if (typeof value !== 'number') return 'n/a'
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toFixed(2)}`
}

interface BenchmarkCohortSectionProps {
  benchmarkCohorts: BenchmarkCohort[]
  selectedCohort: BenchmarkCohort | null
  selectedCohortId: string
  setSelectedCohortId: Dispatch<SetStateAction<string>>
  showAutoAttachPreview: boolean
  setShowAutoAttachPreview: Dispatch<SetStateAction<boolean>>
  submitting: boolean
  autoAttachPreview: Array<{
    testCaseId: string
    testCaseLabel: string
    suggestedRun: Run | null
    passed: boolean
    reason: string
    explanation: string[]
  }>
  proposalReasons: Record<string, string>
  setProposalReasons: Dispatch<SetStateAction<Record<string, string>>>
  testCaseMap: Map<string, DerivedTestCase>
  runMap: Map<string, Run>
  rejectedProposalHistory: AutoAttachProposalFeedback[]
  cohortRuns: Run[]
  cohortResults: Array<{ run: Run; score: number | null }>
  workflowTrendSummary: Array<{
    workflowType: string
    currentAverage: number | null
    previousAverage: number | null
    delta: number | null
    regressions: number
  }>
  workflowSummary: Array<{
    workflowType: string
    total: number
    passed: number
    winners: number
    passRate: number
  }>
  cohortFacetSummary: Array<{
    workflowType: string
    runs: number
    avgQuality: number | null
    avgSteps: number | null
    avgCost: number | null
    avgTools: number | null
    avgRouting: number | null
  }>
  cohortFacetProfiles: Array<{
    workflowType: string
    runs: number
    qualityScore: number | null
    efficiencyScore: number | null
    warnings: string[]
  }>
  selectedCohortSnapshots: BenchmarkSnapshot[]
  snapshotDiffs: Array<{
    snapshot: BenchmarkSnapshot
    previous: BenchmarkSnapshot | null
    workflowDiffs: Array<{
      workflowType: string
      qualityDelta: number | null
      efficiencyDelta: number | null
      costDelta: number | null
      stepsDelta: number | null
      warnings: string[]
    }>
  }>
  orderedTestCaseIds: string[]
  assignmentsByTestCase: Map<string, BenchmarkRunAssignment[]>
  decisionsByTestCase: Map<string, TestCaseReviewDecision>
  assignmentSelections: Record<string, string>
  setAssignmentSelections: Dispatch<SetStateAction<Record<string, string>>>
  decisionDrafts: Record<string, string>
  setDecisionDrafts: Dispatch<SetStateAction<Record<string, string>>>
  regressionResults: RegressionTestResult[]
  regressionMap: Map<string, RegressionTestResult>
  evaluateAssignment: (
    run: Run,
    testCase: DerivedTestCase
  ) => {
    passed: boolean
    failures: string[]
    qualityScore: number | null
    stepCount: number
    durationSec: number | null
    outputSimilarity?: number | null
    outputMatched: boolean
    toolCallsMatched: boolean
    missingTools?: string[]
    extraTools?: string[]
    routerDecisionsMatched?: boolean
    missingRouterDecisions?: Array<{ step: number; chosenPath: string }>
    actualRouterChoices?: string[]
  }
  suggestRunForTestCase: (
    testCase: DerivedTestCase,
    assignedRunIds: string[],
    workflowUsage?: Map<string, number>
  ) => SuggestedCandidate | null
  onAutoAttachAll: () => void | Promise<void>
  onSaveBenchmarkSnapshot: () => void | Promise<void>
  onApproveProposal: (testCase: DerivedTestCase, run: Run) => void | Promise<void>
  onRejectProposal: (testCaseId: string, runId: string, reason?: string) => void | Promise<void>
  onAttachRun: (testCase: DerivedTestCase, run: Run) => void | Promise<void>
  onMarkWinner: (
    testCaseId: string,
    winnerRunId: string,
    notes?: string,
    existing?: Pick<TestCaseReviewDecision, 'decisionId' | 'createdAtMs'>
  ) => void | Promise<void>
  onPersistAssignmentEvaluation: (run: Run, testCase: DerivedTestCase) => void | Promise<void>
  onUnassignRun: (assignmentId: string) => void | Promise<void>
}

const MONTH_AGO_CUTOFF = Date.now() - 30 * 24 * 60 * 60 * 1000

export function BenchmarkCohortSection(props: BenchmarkCohortSectionProps) {
  const {
    benchmarkCohorts,
    selectedCohort,
    selectedCohortId,
    setSelectedCohortId,
    showAutoAttachPreview,
    setShowAutoAttachPreview,
    submitting,
    autoAttachPreview,
    proposalReasons,
    setProposalReasons,
    testCaseMap,
    runMap,
    rejectedProposalHistory,
    cohortRuns,
    cohortResults,
    workflowTrendSummary,
    workflowSummary,
    cohortFacetSummary,
    cohortFacetProfiles,
    snapshotDiffs,
    orderedTestCaseIds,
    assignmentsByTestCase,
    decisionsByTestCase,
    assignmentSelections,
    setAssignmentSelections,
    decisionDrafts,
    setDecisionDrafts,
    regressionResults,
    regressionMap,
    evaluateAssignment,
    suggestRunForTestCase,
    onAutoAttachAll,
    onSaveBenchmarkSnapshot,
    onApproveProposal,
    onRejectProposal,
    onAttachRun,
    onMarkWinner,
    onPersistAssignmentEvaluation,
    onUnassignRun,
  } = props

  return (
    <section className="eval-card">
      <div className="eval-section-heading">
        <h3>Benchmark Cohorts</h3>
        <p>Shared comparison spaces for run leaderboards.</p>
      </div>
      <label className="eval-cohort-selector">
        Cohort
        <select
          value={selectedCohortId}
          onChange={(event) => setSelectedCohortId(event.target.value)}
        >
          <option value="">Select cohort</option>
          {benchmarkCohorts.map((cohort) => (
            <option key={cohort.cohortId} value={cohort.cohortId}>
              {cohort.name}
            </option>
          ))}
        </select>
      </label>

      {!selectedCohort ? (
        <div className="eval-empty">Select a cohort to inspect its candidate runs.</div>
      ) : (
        <>
          <div className="eval-cohort-summary">
            <strong>{selectedCohort.name}</strong>
            <p>
              {selectedCohort.useCase} · workflows: {selectedCohort.workflowTypes.join(', ')} · eval
              mode: {selectedCohort.evaluationMode?.mode ?? 'single_judge'}
            </p>
          </div>
          <div className="eval-form-actions">
            <button
              type="button"
              className={`eval-subtab ${showAutoAttachPreview ? 'active' : ''}`}
              onClick={() => setShowAutoAttachPreview((value) => !value)}
            >
              {showAutoAttachPreview ? 'Hide Auto-attach Preview' : 'Show Auto-attach Preview'}
            </button>
            <button
              type="button"
              className="eval-refresh-button"
              onClick={() => void onAutoAttachAll()}
              disabled={submitting || selectedCohort.testCaseIds.length === 0}
            >
              {submitting ? 'Working...' : 'Auto-attach Best Runs'}
            </button>
            <button
              type="button"
              className="eval-subtab"
              onClick={() => void onSaveBenchmarkSnapshot()}
              disabled={submitting || cohortFacetSummary.length === 0}
            >
              Save Benchmark Snapshot
            </button>
          </div>
          {showAutoAttachPreview ? (
            <section className="eval-card">
              <div className="eval-section-heading">
                <h3>Auto-attach Preview</h3>
                <p>Review proposed assignments before bulk attach runs.</p>
              </div>
              <div className="eval-list">
                {autoAttachPreview.map((item) => (
                  <div key={item.testCaseId} className="eval-list-item">
                    <div>
                      <strong>{item.testCaseLabel}</strong>
                      <p>
                        {item.suggestedRun
                          ? `${item.suggestedRun.workflowType} · ${item.suggestedRun.goal.slice(0, 72)}`
                          : 'No suggested run'}
                      </p>
                      {item.explanation.length > 0 ? (
                        <div className="eval-preview-explanation">
                          {item.explanation.map((reason) => (
                            <span key={reason} className="eval-history-item">
                              {reason}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    <div className="eval-inline-actions">
                      <span className={`eval-pill ${item.passed ? 'ok' : 'warning'}`}>
                        {item.reason}
                      </span>
                      {item.suggestedRun ? (
                        <>
                          <button
                            type="button"
                            className="eval-subtab"
                            disabled={!item.passed || submitting || !selectedCohort}
                            onClick={() => {
                              const testCase = testCaseMap.get(item.testCaseId)
                              if (!testCase) return
                              void onApproveProposal(testCase, item.suggestedRun!)
                            }}
                          >
                            Approve
                          </button>
                          <input
                            className="eval-input eval-input--compact"
                            placeholder="Reject reason"
                            value={proposalReasons[item.testCaseId] ?? ''}
                            onChange={(event) =>
                              setProposalReasons((value) => ({
                                ...value,
                                [item.testCaseId]: event.target.value,
                              }))
                            }
                          />
                          <button
                            type="button"
                            className="eval-subtab"
                            disabled={submitting || !selectedCohort}
                            onClick={() =>
                              void onRejectProposal(
                                item.testCaseId,
                                item.suggestedRun!.runId,
                                proposalReasons[item.testCaseId]?.trim() || undefined
                              )
                            }
                          >
                            Reject
                          </button>
                        </>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <section className="eval-card">
            <div className="eval-section-heading">
              <h3>Rejected Proposal History</h3>
              <p>
                Audit prior rejections and reverse them when a proposal was dismissed too
                aggressively.
              </p>
            </div>
            {rejectedProposalHistory.length === 0 ? (
              <div className="eval-empty">No rejected proposals for this cohort yet.</div>
            ) : (
              <div className="eval-list">
                {rejectedProposalHistory.map((feedback) => {
                  const run = runMap.get(feedback.runId)
                  const testCase = testCaseMap.get(feedback.testCaseId)
                  return (
                    <div key={feedback.feedbackId} className="eval-list-item">
                      <div>
                        <strong>
                          {testCase?.description ??
                            testCase?.input.slice(0, 72) ??
                            feedback.testCaseId}
                        </strong>
                        <p>
                          {run ? `${run.workflowType} · ${run.goal.slice(0, 72)}` : feedback.runId}
                        </p>
                        {feedback.reason ? <p>Rejected because: {feedback.reason}</p> : null}
                      </div>
                      <div className="eval-inline-actions">
                        <span className="eval-stat-label">
                          {new Date(feedback.updatedAtMs).toLocaleString()}
                        </span>
                        <button
                          type="button"
                          className="eval-subtab"
                          disabled={!run || !testCase || submitting}
                          onClick={() => {
                            if (!run || !testCase) return
                            void onApproveProposal(testCase, run)
                          }}
                        >
                          Approve Now
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </section>

          <div className="eval-card-grid">
            <article className="eval-stat-card">
              <span className="eval-stat-label">Linked test cases</span>
              <strong>{selectedCohort.testCaseIds.length}</strong>
            </article>
            <article className="eval-stat-card">
              <span className="eval-stat-label">Candidate runs</span>
              <strong>{cohortRuns.length}</strong>
            </article>
            <article className="eval-stat-card">
              <span className="eval-stat-label">Top normalized score</span>
              <strong>{formatScore(cohortResults[0]?.score ?? null)}</strong>
            </article>
          </div>

          <section className="eval-card">
            <div className="eval-section-heading">
              <h3>Workflow Trends</h3>
              <p>Current 30-day quality versus previous 30-day baseline, plus regression count.</p>
            </div>
            {workflowTrendSummary.length === 0 ? (
              <div className="eval-empty">Not enough historical benchmark results yet.</div>
            ) : (
              <div className="eval-list">
                {workflowTrendSummary.map((item) => (
                  <div key={item.workflowType} className="eval-list-item">
                    <div>
                      <strong>{item.workflowType}</strong>
                      <p>
                        current {formatScore(item.currentAverage)} · previous{' '}
                        {formatScore(item.previousAverage)}
                      </p>
                    </div>
                    <div className="eval-inline-actions">
                      <span
                        className={`eval-pill ${item.delta !== null && item.delta < -0.05 ? 'warning' : 'neutral'}`}
                      >
                        delta {formatScore(item.delta)}
                      </span>
                      <span className={`eval-pill ${item.regressions > 0 ? 'warning' : 'ok'}`}>
                        regressions {item.regressions}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="eval-card">
            <div className="eval-section-heading">
              <h3>Cohort Workflow Summary</h3>
              <p>Pass rate and case wins across assigned benchmark runs.</p>
            </div>
            {workflowSummary.length === 0 ? (
              <div className="eval-empty">No assigned benchmark runs yet.</div>
            ) : (
              <div className="eval-list">
                {workflowSummary.map((item) => (
                  <div key={item.workflowType} className="eval-list-item">
                    <div>
                      <strong>{item.workflowType}</strong>
                      <p>
                        {item.passed}/{item.total} passed · {item.winners} winners
                      </p>
                    </div>
                    <span>{formatScore(item.passRate)}</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="eval-card">
            <div className="eval-section-heading">
              <h3>Cohort Benchmark Facets</h3>
              <p>Shared averages across assigned benchmark runs by workflow.</p>
            </div>
            {cohortFacetSummary.length === 0 ? (
              <div className="eval-empty">No assigned runs yet for facet summary.</div>
            ) : (
              <div className="eval-list">
                {cohortFacetSummary.map((item) => (
                  <div key={item.workflowType} className="eval-list-item">
                    <div>
                      <strong>{item.workflowType}</strong>
                      <p>
                        quality {formatScore(item.avgQuality)} · steps {formatScore(item.avgSteps)}{' '}
                        · cost {formatUsd(item.avgCost ?? undefined)}
                      </p>
                    </div>
                    <div className="eval-inline-actions">
                      <span className="eval-pill neutral">tools {formatScore(item.avgTools)}</span>
                      <span className="eval-pill neutral">
                        routing {formatScore(item.avgRouting)}
                      </span>
                      <span className="eval-pill neutral">runs {item.runs}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="eval-card">
            <div className="eval-section-heading">
              <h3>Cohort Normalized Profiles</h3>
              <p>Relative quality and efficiency scores across assigned workflow cohorts.</p>
            </div>
            {cohortFacetProfiles.length === 0 ? (
              <div className="eval-empty">No assigned runs yet for normalized profiles.</div>
            ) : (
              <div className="eval-list">
                {cohortFacetProfiles.map((item) => (
                  <div key={item.workflowType} className="eval-list-item">
                    <div>
                      <strong>{item.workflowType}</strong>
                      <p>
                        quality {formatScore(item.qualityScore)} · efficiency{' '}
                        {formatScore(item.efficiencyScore)}
                      </p>
                      {item.warnings.length > 0 ? (
                        <div className="eval-warning-list">
                          {item.warnings.map((warning) => (
                            <span key={warning} className="eval-history-item">
                              {warning}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    <span className="eval-pill neutral">{item.runs} runs</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="eval-card">
            <div className="eval-section-heading">
              <h3>Snapshot History</h3>
              <p>Saved cohort profile checkpoints for longitudinal review.</p>
            </div>
            {snapshotDiffs.length === 0 ? (
              <div className="eval-empty">No benchmark snapshots saved for this cohort yet.</div>
            ) : (
              <div className="eval-list">
                {snapshotDiffs.map(({ snapshot, previous, workflowDiffs }) => (
                  <div key={snapshot.snapshotId} className="eval-list-item eval-list-item--stacked">
                    <div>
                      <strong>{new Date(snapshot.updatedAtMs).toLocaleString()}</strong>
                      <p>
                        {snapshot.summary.length} workflow summaries ·{' '}
                        {snapshot.summary
                          .map(
                            (item) =>
                              `${item.workflowType} q:${formatScore(item.qualityScore)} e:${formatScore(item.efficiencyScore)}`
                          )
                          .join(' · ')}
                      </p>
                      {previous ? (
                        <div className="eval-snapshot-diff-list">
                          {workflowDiffs.map((diff) => (
                            <div
                              key={`${snapshot.snapshotId}-${diff.workflowType}`}
                              className="eval-snapshot-diff-item"
                            >
                              <strong>{diff.workflowType}</strong>
                              <span>q {formatSignedDelta(diff.qualityDelta)}</span>
                              <span>e {formatSignedDelta(diff.efficiencyDelta)}</span>
                              <span>cost {formatSignedDelta(diff.costDelta)}</span>
                              <span>steps {formatSignedDelta(diff.stepsDelta)}</span>
                              {diff.warnings.map((warning) => (
                                <span
                                  key={`${snapshot.snapshotId}-${diff.workflowType}-${warning}`}
                                  className="eval-history-item"
                                >
                                  {warning}
                                </span>
                              ))}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p>Baseline snapshot for this cohort.</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="eval-card">
            <div className="eval-section-heading">
              <h3>Linked Test Cases</h3>
              <p>Assign runs, check threshold pass/fail, and record a winner for each case.</p>
            </div>
            {selectedCohort.testCaseIds.length === 0 ? (
              <div className="eval-empty">No test cases attached to this cohort yet.</div>
            ) : (
              <div className="eval-list">
                {orderedTestCaseIds.map((testCaseId) => {
                  const testCase = testCaseMap.get(testCaseId)
                  const assignments = assignmentsByTestCase.get(testCaseId) ?? []
                  const decision = decisionsByTestCase.get(testCaseId) ?? null
                  const testCaseHistory = regressionResults
                    .filter((result) => result.testCaseId === testCaseId)
                    .sort((left, right) => right.executedAtMs - left.executedAtMs)
                  const latestResult = testCaseHistory[0] ?? null
                  const bestThisMonth =
                    testCaseHistory
                      .filter((result) => result.executedAtMs >= MONTH_AGO_CUTOFF)
                      .sort((left, right) => right.qualityScore - left.qualityScore)[0] ?? null
                  const assignedRunIds = assignments.map((assignment) => assignment.runId)
                  const suggestedRun = testCase
                    ? (suggestRunForTestCase(testCase, assignedRunIds)?.run ?? null)
                    : null
                  const isRegression = Boolean(
                    latestResult &&
                    bestThisMonth &&
                    latestResult.qualityScore + 0.05 < bestThisMonth.qualityScore
                  )
                  const compatibleRuns = cohortRuns.filter(
                    (run) =>
                      run.workflowType === testCase?.workflowType ||
                      selectedCohort.workflowTypes.includes(run.workflowType)
                  )
                  return (
                    <article
                      key={testCaseId}
                      className={`eval-card eval-card--compact ${isRegression ? 'eval-card--warning' : ''}`}
                    >
                      <div className="eval-section-heading">
                        <h3>
                          {testCase?.description ?? testCase?.input.slice(0, 72) ?? testCaseId}
                        </h3>
                        <p>
                          {testCase?.workflowType ?? 'unknown'} · min quality{' '}
                          {testCase ? formatScore(testCase.minQualityScore) : 'n/a'}
                        </p>
                      </div>
                      {latestResult || bestThisMonth ? (
                        <div className="eval-card-grid">
                          <article className="eval-stat-card">
                            <span className="eval-stat-label">Latest</span>
                            <strong>{formatScore(latestResult?.qualityScore ?? null)}</strong>
                          </article>
                          <article className="eval-stat-card">
                            <span className="eval-stat-label">Best 30d</span>
                            <strong>{formatScore(bestThisMonth?.qualityScore ?? null)}</strong>
                          </article>
                          <article className="eval-stat-card">
                            <span className="eval-stat-label">Delta</span>
                            <strong>
                              {latestResult && bestThisMonth
                                ? formatScore(
                                    latestResult.qualityScore - bestThisMonth.qualityScore
                                  )
                                : 'n/a'}
                            </strong>
                          </article>
                        </div>
                      ) : null}
                      {isRegression ? (
                        <div className="eval-inline-warning">
                          Latest result is below the best result in the last 30 days.
                        </div>
                      ) : null}
                      <div className="eval-form-actions">
                        <select
                          className="eval-select"
                          value={assignmentSelections[testCaseId] ?? ''}
                          onChange={(event) =>
                            setAssignmentSelections((value) => ({
                              ...value,
                              [testCaseId]: event.target.value,
                            }))
                          }
                        >
                          <option value="">Assign run</option>
                          {compatibleRuns.map((run) => (
                            <option key={run.runId} value={run.runId}>
                              {run.workflowType} · {run.goal.slice(0, 56)}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          className="eval-refresh-button"
                          disabled={!assignmentSelections[testCaseId] || !testCase || submitting}
                          onClick={() => {
                            const runId = assignmentSelections[testCaseId]
                            const run = runMap.get(runId)
                            if (!run || !testCase) return
                            void onAttachRun(testCase, run)
                          }}
                        >
                          Attach Run
                        </button>
                        {suggestedRun ? (
                          <button
                            type="button"
                            className="eval-subtab"
                            onClick={() =>
                              setAssignmentSelections((value) => ({
                                ...value,
                                [testCaseId]: suggestedRun.runId,
                              }))
                            }
                          >
                            Suggest {suggestedRun.workflowType}
                          </button>
                        ) : null}
                        {suggestedRun &&
                        testCase &&
                        !assignedRunIds.includes(suggestedRun.runId) &&
                        evaluateAssignment(suggestedRun, testCase).passed ? (
                          <button
                            type="button"
                            className="eval-subtab"
                            onClick={() => void onAttachRun(testCase, suggestedRun)}
                          >
                            Auto-attach Best
                          </button>
                        ) : null}
                      </div>
                      <div className="eval-list">
                        {assignments.length === 0 ? (
                          <div className="eval-empty">No runs assigned to this test case yet.</div>
                        ) : (
                          assignments.map((assignment) => {
                            const run = runMap.get(assignment.runId)
                            const evaluation =
                              regressionMap.get(`${assignment.testCaseId}::${assignment.runId}`) ??
                              (run && testCase
                                ? {
                                    passed: evaluateAssignment(run, testCase).passed,
                                    failureReasons: evaluateAssignment(run, testCase).failures,
                                    qualityScore:
                                      evaluateAssignment(run, testCase).qualityScore ?? 0,
                                    stepCount: evaluateAssignment(run, testCase).stepCount,
                                    cost: run.estimatedCost ?? 0,
                                    durationMs:
                                      (evaluateAssignment(run, testCase).durationSec ?? 0) * 1000,
                                    outputSimilarity:
                                      evaluateAssignment(run, testCase).outputSimilarity ??
                                      undefined,
                                    outputMatched: evaluateAssignment(run, testCase).outputMatched,
                                    toolCallsMatched: evaluateAssignment(run, testCase)
                                      .toolCallsMatched,
                                    missingTools: evaluateAssignment(run, testCase).missingTools,
                                    extraTools: evaluateAssignment(run, testCase).extraTools,
                                    routerDecisionsMatched: evaluateAssignment(run, testCase)
                                      .routerDecisionsMatched,
                                    missingRouterDecisions: evaluateAssignment(run, testCase)
                                      .missingRouterDecisions,
                                    actualRouterChoices: evaluateAssignment(run, testCase)
                                      .actualRouterChoices,
                                  }
                                : null)
                            const isWinner = decision?.winnerRunId === assignment.runId
                            return (
                              <div key={assignment.assignmentId} className="eval-list-item">
                                <div>
                                  <strong>
                                    {run?.workflowType ?? 'Unknown run'}{' '}
                                    {isWinner ? '· winner' : ''}
                                  </strong>
                                  <p>
                                    {evaluation
                                      ? `quality ${formatScore(evaluation.qualityScore)} · steps ${evaluation.stepCount} · cost ${formatUsd(run?.estimatedCost)} · output ${formatScore(('outputSimilarity' in evaluation ? evaluation.outputSimilarity : null) ?? null)} · router ${'routerDecisionsMatched' in evaluation && evaluation.routerDecisionsMatched ? 'ok' : 'check'}`
                                      : assignment.runId}
                                  </p>
                                </div>
                                <div className="eval-inline-actions">
                                  <span
                                    className={`eval-pill ${evaluation?.passed ? 'ok' : 'warning'}`}
                                  >
                                    {evaluation?.passed
                                      ? 'pass'
                                      : evaluation
                                        ? `fail: ${'failureReasons' in evaluation ? (evaluation.failureReasons ?? []).join(', ') : 'thresholds'}`
                                        : 'n/a'}
                                  </span>
                                  <button
                                    type="button"
                                    className="eval-subtab"
                                    onClick={() =>
                                      void onMarkWinner(
                                        testCaseId,
                                        assignment.runId,
                                        decisionDrafts[testCaseId] ?? '',
                                        decision
                                          ? {
                                              decisionId: decision.decisionId,
                                              createdAtMs: decision.createdAtMs,
                                            }
                                          : undefined
                                      )
                                    }
                                  >
                                    {isWinner ? 'Winner Saved' : 'Mark Winner'}
                                  </button>
                                  <button
                                    type="button"
                                    className="eval-subtab"
                                    onClick={() =>
                                      run &&
                                      testCase &&
                                      void onPersistAssignmentEvaluation(run, testCase)
                                    }
                                  >
                                    Re-evaluate
                                  </button>
                                  <button
                                    type="button"
                                    className="eval-subtab"
                                    onClick={() => void onUnassignRun(assignment.assignmentId)}
                                  >
                                    Unassign
                                  </button>
                                </div>
                              </div>
                            )
                          })
                        )}
                      </div>
                      <div className="eval-history-list">
                        {testCaseHistory.slice(0, 5).map((result) => (
                          <div
                            key={`${result.testCaseId}-${result.runId}-${result.executedAtMs}`}
                            className="eval-history-item"
                          >
                            <strong>
                              {runMap.get(result.runId)?.workflowType ?? result.runId}
                            </strong>
                            <span>
                              {result.passed
                                ? 'pass'
                                : `fail: ${(result.failureReasons ?? []).join(', ')}`}
                            </span>
                          </div>
                        ))}
                      </div>
                      <textarea
                        className="eval-textarea"
                        rows={3}
                        value={decisionDrafts[testCaseId] ?? ''}
                        onChange={(event) =>
                          setDecisionDrafts((value) => ({
                            ...value,
                            [testCaseId]: event.target.value,
                          }))
                        }
                        placeholder="Reviewer notes for this test case."
                      />
                    </article>
                  )
                })}
              </div>
            )}
          </section>

          <div className="eval-list">
            {cohortRuns.length === 0 ? (
              <div className="eval-empty">No recent runs match this cohort yet.</div>
            ) : (
              cohortResults.map(({ run, score }, index) => (
                <div key={run.runId} className="eval-list-item">
                  <div>
                    <strong>
                      #{index + 1} {run.workflowType}
                    </strong>
                    <p>{run.goal.slice(0, 80)}</p>
                  </div>
                  <span>{formatScore(score)}</span>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </section>
  )
}
