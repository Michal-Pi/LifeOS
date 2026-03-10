import { useEffect, useMemo, useState } from 'react'
import type {
  BenchmarkCohort,
  DerivedTestCase,
  EvalResult,
  RegressionTestResult,
  Run,
  SharedComparisonResult,
} from '@lifeos/agents'
import { getWorkflowEvalAdapter } from '@/components/evaluation/workflowEvalAdapters'
import { BenchmarkCompareSection } from '@/components/evaluation/BenchmarkCompareSection'
import { BenchmarkCohortSection } from '@/components/evaluation/BenchmarkCohortSection'
import {
  buildApprovedPatternCounts,
  buildApprovedWorkflowCounts,
  buildCompareFacetInsights,
  buildCohortFacetProfiles,
  buildCohortFacetSummary,
  buildCohortResults,
  buildProposalFeedbackMap,
  buildSnapshotDiffs,
  buildWorkflowSummary,
  buildWorkflowTrendSummary,
  orderTestCasesByRegressionRisk,
} from '@/components/evaluation/benchmarkAnalytics'
import {
  evaluateBenchmarkAssignment as evaluateBenchmarkAssignmentPolicy,
  suggestRunForTestCase as suggestRunForTestCasePolicy,
  type SuggestedCandidate,
} from '@/components/evaluation/benchmarkPolicy'
import { useBenchmarkOperations } from '@/hooks/useBenchmarkOperations'
import { useRunTraces } from '@/hooks/useRunTrace'
import type {
  AutoAttachProposalFeedback,
  BenchmarkSnapshot,
  BenchmarkRunAssignment,
  ManualReviewNote,
  TestCaseReviewDecision,
} from '@/hooks/evaluationWorkspaceTypes'

interface BenchmarksPanelProps {
  recentRuns: Run[]
  results: EvalResult[]
  benchmarkCohorts: BenchmarkCohort[]
  sharedComparisonResults: SharedComparisonResult[]
  manualReviewNotes: ManualReviewNote[]
  benchmarkRunAssignments: BenchmarkRunAssignment[]
  testCaseReviewDecisions: TestCaseReviewDecision[]
  autoAttachProposalFeedback: AutoAttachProposalFeedback[]
  benchmarkSnapshots: BenchmarkSnapshot[]
  regressionResults: RegressionTestResult[]
  testCases: DerivedTestCase[]
  onRefresh?: () => void
  initialLeftRunId?: string | null
  initialRightRunId?: string | null
  initialSelectedCohortId?: string | null
}

function _formatScore(value?: number | null) {
  if (typeof value !== 'number') return 'n/a'
  return value.toFixed(2)
}

function _formatUsd(value?: number) {
  return typeof value === 'number' ? `$${value.toFixed(value < 1 ? 3 : 2)}` : 'n/a'
}

export function BenchmarksPanel({
  recentRuns,
  results,
  benchmarkCohorts,
  sharedComparisonResults,
  manualReviewNotes,
  benchmarkRunAssignments,
  testCaseReviewDecisions,
  autoAttachProposalFeedback,
  benchmarkSnapshots,
  regressionResults,
  testCases,
  onRefresh,
  initialLeftRunId,
  initialRightRunId,
  initialSelectedCohortId,
}: BenchmarksPanelProps) {
  const [leftRunId, setLeftRunId] = useState<string>(initialLeftRunId ?? recentRuns[0]?.runId ?? '')
  const [rightRunId, setRightRunId] = useState<string>(
    initialRightRunId ?? recentRuns[1]?.runId ?? ''
  )
  const [selectedCohortId, setSelectedCohortId] = useState<string>(
    initialSelectedCohortId ?? benchmarkCohorts[0]?.cohortId ?? ''
  )
  const [expandedSide, setExpandedSide] = useState<'left' | 'right' | null>(null)
  const [reviewDraft, setReviewDraft] = useState('')
  const [assignmentSelections, setAssignmentSelections] = useState<Record<string, string>>({})
  const [decisionDrafts, setDecisionDrafts] = useState<Record<string, string>>({})
  const [showAutoAttachPreview, setShowAutoAttachPreview] = useState(false)
  const [proposalReasons, setProposalReasons] = useState<Record<string, string>>({})

  useEffect(() => {
    if (initialLeftRunId && initialLeftRunId !== leftRunId) {
      setLeftRunId(initialLeftRunId)
    }
    if (typeof initialRightRunId === 'string' && initialRightRunId !== rightRunId) {
      setRightRunId(initialRightRunId)
    }
    if (
      typeof initialSelectedCohortId === 'string' &&
      initialSelectedCohortId !== selectedCohortId
    ) {
      setSelectedCohortId(initialSelectedCohortId)
    }
  }, [initialLeftRunId, initialRightRunId, initialSelectedCohortId])

  const runMap = useMemo(() => new Map(recentRuns.map((run) => [run.runId, run])), [recentRuns])
  const resultMap = useMemo(
    () => new Map(results.map((result) => [result.runId, result])),
    [results]
  )
  const sharedMap = useMemo(
    () => new Map(sharedComparisonResults.map((result) => [result.runId, result])),
    [sharedComparisonResults]
  )

  const leftRun = runMap.get(leftRunId) ?? null
  const rightRun = runMap.get(rightRunId) ?? null
  const leftResult = leftRun ? resultMap.get(leftRun.runId) : null
  const rightResult = rightRun ? resultMap.get(rightRun.runId) : null
  const leftShared = leftRun ? sharedMap.get(leftRun.runId) : null
  const rightShared = rightRun ? sharedMap.get(rightRun.runId) : null
  const selectedCohort =
    benchmarkCohorts.find((cohort) => cohort.cohortId === selectedCohortId) ?? null
  const leftHints = leftRun
    ? getWorkflowEvalAdapter(leftRun.workflowType, leftRun.workflowState).buildComparisonHints({
        run: leftRun,
        workflowState: leftRun.workflowState ?? null,
        result: leftResult ?? null,
      })
    : []
  const rightHints = rightRun
    ? getWorkflowEvalAdapter(rightRun.workflowType, rightRun.workflowState).buildComparisonHints({
        run: rightRun,
        workflowState: rightRun.workflowState ?? null,
        result: rightResult ?? null,
      })
    : []

  const canDirectlyCompare =
    !!leftResult &&
    !!rightResult &&
    leftResult.rubricId === rightResult.rubricId &&
    leftRun?.workflowType === rightRun?.workflowType

  const cohortRuns = useMemo(() => {
    if (!selectedCohort) return []
    return recentRuns.filter((run) => selectedCohort.workflowTypes.includes(run.workflowType ?? ''))
  }, [recentRuns, selectedCohort])
  const tracedRunIds = useMemo(
    () =>
      Array.from(
        new Set(
          [leftRun?.runId, rightRun?.runId, ...cohortRuns.map((run) => run.runId)].filter(
            (runId): runId is string => Boolean(runId)
          )
        )
      ),
    [cohortRuns, leftRun?.runId, rightRun?.runId]
  )
  const traceData = useRunTraces({
    runIds: tracedRunIds,
    includeComponentTelemetry: true,
  })
  const leftTrace = leftRun ? traceData.traces.get(leftRun.runId) : null
  const rightTrace = rightRun ? traceData.traces.get(rightRun.runId) : null
  const buildFacetMap = (
    run: Run | null,
    result: EvalResult | null,
    trace: typeof leftTrace | null
  ) => {
    if (!run) return new Map<string, string>()
    const adapter = getWorkflowEvalAdapter(run.workflowType, run.workflowState)
    const facets = adapter.buildBenchmarkFacets({
      run,
      workflowState: run.workflowState ?? null,
      result,
      stepCount: trace?.steps.length ?? run.currentStep ?? null,
      toolCallCount: trace?.steps.reduce((total, step) => total + step.toolCalls.length, 0) ?? null,
      routerDecisionCount:
        trace?.steps.reduce((total, step) => total + step.routerDecisions.length, 0) ?? null,
      outputLength: run.output?.length ?? 0,
    })
    return new Map(facets.map((facet) => [facet.key, facet.value]))
  }
  const leftFacetMap = useMemo(
    () => buildFacetMap(leftRun, leftResult ?? null, leftTrace ?? null),
    [leftRun, leftResult, leftTrace]
  )
  const rightFacetMap = useMemo(
    () => buildFacetMap(rightRun, rightResult ?? null, rightTrace ?? null),
    [rightRun, rightResult, rightTrace]
  )
  const {
    saveReviewNote,
    attachRunToTestCase,
    approveProposal,
    rejectProposal,
    markWinner,
    persistAssignmentEvaluation,
    unassignRun,
    saveSnapshot,
    autoAttachSuggestedRuns,
    submitting,
  } = useBenchmarkOperations({
    cohortId: selectedCohortId || null,
    onRefresh,
    evaluateAssignment: (run, testCase) =>
      evaluateBenchmarkAssignmentPolicy(
        run,
        testCase,
        resultMap.get(run.runId),
        traceData.traces.get(run.runId) ?? null
      ),
  })
  const compareFacetRows = useMemo(() => {
    const labels = new Map([
      ['quality', 'Quality'],
      ['cost', 'Cost'],
      ['steps', 'Steps'],
      ['tools', 'Tool calls'],
      ['routing', 'Router decisions'],
      ['output', 'Output chars'],
      ['sources', 'Sources / evidence'],
      ['claims', 'Claims'],
      ['contradictions', 'Contradictions'],
      ['scenarios', 'Scenarios'],
    ])

    return Array.from(labels.entries())
      .map(([key, label]) => ({
        key,
        label,
        left: leftFacetMap.get(key) ?? 'n/a',
        right: rightFacetMap.get(key) ?? 'n/a',
      }))
      .filter((row) => row.left !== 'n/a' || row.right !== 'n/a')
  }, [leftFacetMap, rightFacetMap])
  const compareFacetInsights = useMemo(
    () =>
      buildCompareFacetInsights({
        leftFacetMap,
        rightFacetMap,
        leftWorkflowType: leftRun?.workflowType,
        rightWorkflowType: rightRun?.workflowType,
      }),
    [leftFacetMap, rightFacetMap, leftRun?.workflowType, rightRun?.workflowType]
  )
  const cohortResults = useMemo(
    () => buildCohortResults(cohortRuns, sharedMap, resultMap),
    [cohortRuns, resultMap, sharedMap]
  )
  const testCaseMap = useMemo(
    () => new Map(testCases.map((testCase) => [testCase.testCaseId, testCase])),
    [testCases]
  )
  const regressionMap = useMemo(
    () =>
      new Map(regressionResults.map((result) => [`${result.testCaseId}::${result.runId}`, result])),
    [regressionResults]
  )
  const proposalFeedbackMap = useMemo(
    () => buildProposalFeedbackMap(autoAttachProposalFeedback, selectedCohort?.cohortId),
    [autoAttachProposalFeedback, selectedCohort?.cohortId]
  )
  const approvedWorkflowCounts = useMemo(
    () => buildApprovedWorkflowCounts(proposalFeedbackMap, runMap),
    [proposalFeedbackMap, runMap]
  )
  const approvedPatternCounts = useMemo(
    () => buildApprovedPatternCounts(proposalFeedbackMap, runMap, testCaseMap),
    [proposalFeedbackMap, runMap, testCaseMap]
  )
  const rejectedProposalHistory = useMemo(
    () =>
      Array.from(proposalFeedbackMap.values())
        .filter((item) => item.disposition === 'rejected')
        .sort((left, right) => right.updatedAtMs - left.updatedAtMs),
    [proposalFeedbackMap]
  )
  const assignmentsByTestCase = useMemo(() => {
    const next = new Map<string, BenchmarkRunAssignment[]>()
    for (const assignment of benchmarkRunAssignments) {
      if (assignment.cohortId !== selectedCohort?.cohortId) continue
      const list = next.get(assignment.testCaseId) ?? []
      list.push(assignment)
      next.set(assignment.testCaseId, list)
    }
    return next
  }, [benchmarkRunAssignments, selectedCohort?.cohortId])
  const decisionsByTestCase = useMemo(
    () =>
      new Map(
        testCaseReviewDecisions
          .filter((decision) => decision.cohortId === selectedCohort?.cohortId)
          .map((decision) => [decision.testCaseId, decision])
      ),
    [selectedCohort?.cohortId, testCaseReviewDecisions]
  )
  const comparisonKey = useMemo(() => {
    const runIds = [leftRun?.runId, rightRun?.runId].filter(Boolean).sort().join('::')
    return `${selectedCohort?.cohortId ?? 'no-cohort'}::${runIds || 'unpaired'}`
  }, [leftRun?.runId, rightRun?.runId, selectedCohort?.cohortId])
  const existingReview = useMemo(
    () => manualReviewNotes.find((note) => note.comparisonKey === comparisonKey) ?? null,
    [comparisonKey, manualReviewNotes]
  )

  useEffect(() => {
    setReviewDraft(existingReview?.notes ?? '')
  }, [existingReview])

  useEffect(() => {
    const next: Record<string, string> = {}
    for (const [testCaseId, decision] of decisionsByTestCase.entries()) {
      next[testCaseId] = decision.notes ?? ''
    }
    setDecisionDrafts(next)
  }, [decisionsByTestCase])

  const handleSaveReviewNote = async () => {
    if (!leftRun) return
    await saveReviewNote({
      noteId: existingReview?.noteId,
      comparisonKey,
      leftRunId: leftRun.runId,
      rightRunId: rightRun?.runId,
      cohortId: selectedCohort?.cohortId,
      notes: reviewDraft.trim(),
    })
  }

  const evaluateAssignment = (run: Run, testCase: DerivedTestCase) => {
    return evaluateBenchmarkAssignmentPolicy(
      run,
      testCase,
      resultMap.get(run.runId),
      traceData.traces.get(run.runId) ?? null
    )
  }

  const suggestRunForTestCase = (
    testCase: DerivedTestCase,
    assignedRunIds: string[],
    workflowUsage: Map<string, number> = new Map()
  ): SuggestedCandidate | null => {
    return suggestRunForTestCasePolicy({
      testCase,
      cohortRuns,
      assignedRunIds,
      resultMap,
      proposalFeedbackMap,
      approvedWorkflowCounts,
      approvedPatternCounts,
      workflowUsage,
    })
  }

  const autoAttachPreview = useMemo(() => {
    if (!selectedCohort) return []
    const workflowUsage = new Map<string, number>()
    const preview: Array<{
      testCaseId: string
      testCaseLabel: string
      suggestedRun: Run | null
      passed: boolean
      reason: string
      explanation: string[]
    }> = []

    for (const testCaseId of selectedCohort.testCaseIds) {
      const testCase = testCaseMap.get(testCaseId)
      if (!testCase) continue
      const assignedRunIds = (assignmentsByTestCase.get(testCaseId) ?? []).map(
        (assignment) => assignment.runId
      )
      const candidate = suggestRunForTestCase(testCase, assignedRunIds, workflowUsage)
      const suggestedRun = candidate?.run ?? null
      if (candidate) {
        workflowUsage.set(
          candidate.run.workflowType,
          (workflowUsage.get(candidate.run.workflowType) ?? 0) + 1
        )
      }
      const evaluation =
        suggestedRun && testCase ? evaluateAssignment(suggestedRun, testCase) : null
      preview.push({
        testCaseId,
        testCaseLabel: testCase.description ?? testCase.input.slice(0, 72) ?? testCaseId,
        suggestedRun,
        passed: Boolean(evaluation?.passed),
        reason: evaluation
          ? evaluation.passed
            ? 'Ready to attach'
            : `Blocked: ${evaluation.failures.join(', ')}`
          : 'No candidate',
        explanation: candidate?.reasons ?? [],
      })
    }

    return preview
  }, [
    assignmentsByTestCase,
    resultMap,
    selectedCohort,
    testCaseMap,
    cohortRuns,
    traceData.traces,
    proposalFeedbackMap,
    approvedWorkflowCounts,
    approvedPatternCounts,
  ])

  const workflowSummary = useMemo(
    () =>
      buildWorkflowSummary({
        benchmarkRunAssignments,
        selectedCohortId: selectedCohort?.cohortId,
        decisionsByTestCase,
        regressionMap,
        runMap,
      }),
    [benchmarkRunAssignments, decisionsByTestCase, regressionMap, runMap, selectedCohort?.cohortId]
  )

  const workflowTrendSummary = useMemo(
    () => buildWorkflowTrendSummary({ regressionResults, runMap, selectedCohort }),
    [regressionResults, runMap, selectedCohort]
  )
  const cohortFacetSummary = useMemo(
    () =>
      buildCohortFacetSummary({
        benchmarkRunAssignments,
        selectedCohortId: selectedCohort?.cohortId,
        resultMap,
        runMap,
        traceMap: traceData.traces,
      }),
    [benchmarkRunAssignments, resultMap, runMap, selectedCohort?.cohortId, traceData.traces]
  )
  const cohortFacetProfiles = useMemo(
    () => buildCohortFacetProfiles(cohortFacetSummary),
    [cohortFacetSummary]
  )
  const selectedCohortSnapshots = useMemo(
    () =>
      benchmarkSnapshots
        .filter((snapshot) => snapshot.cohortId === selectedCohort?.cohortId)
        .slice(0, 8),
    [benchmarkSnapshots, selectedCohort?.cohortId]
  )
  const snapshotDiffs = useMemo(
    () => buildSnapshotDiffs(selectedCohortSnapshots),
    [selectedCohortSnapshots]
  )

  const orderedTestCaseIds = useMemo(
    () => orderTestCasesByRegressionRisk(selectedCohort, regressionResults),
    [regressionResults, selectedCohort]
  )

  const handleAutoAttachAll = async () => {
    if (!selectedCohort) return
    await autoAttachSuggestedRuns({
      testCases: selectedCohort.testCaseIds
        .map((testCaseId) => testCaseMap.get(testCaseId))
        .filter((testCase): testCase is DerivedTestCase => Boolean(testCase)),
      assignmentsByTestCase,
      suggestRunForTestCase,
    })
  }

  const handleSaveBenchmarkSnapshot = async () => {
    if (!selectedCohort) return
    await saveSnapshot(
      cohortFacetSummary.map((item) => {
        const profile = cohortFacetProfiles.find(
          (candidate) => candidate.workflowType === item.workflowType
        )
        return {
          workflowType: item.workflowType,
          runs: item.runs,
          avgQuality: item.avgQuality,
          avgSteps: item.avgSteps,
          avgCost: item.avgCost,
          avgTools: item.avgTools,
          avgRouting: item.avgRouting,
          qualityScore: profile?.qualityScore ?? null,
          efficiencyScore: profile?.efficiencyScore ?? null,
          warnings: profile?.warnings ?? [],
        }
      })
    )
  }

  return (
    <div className="eval-panel">
      <div className="eval-compare-picker">
        <label>
          Left run
          <select value={leftRunId} onChange={(event) => setLeftRunId(event.target.value)}>
            {recentRuns.map((run) => (
              <option key={run.runId} value={run.runId}>
                {run.workflowType} · {run.goal.slice(0, 56)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Right run
          <select value={rightRunId} onChange={(event) => setRightRunId(event.target.value)}>
            {recentRuns.map((run) => (
              <option key={run.runId} value={run.runId}>
                {run.workflowType} · {run.goal.slice(0, 56)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <BenchmarkCompareSection
        leftRun={leftRun}
        rightRun={rightRun}
        leftResult={leftResult ?? null}
        rightResult={rightResult ?? null}
        leftSharedScore={leftShared?.aggregateScore ?? null}
        rightSharedScore={rightShared?.aggregateScore ?? null}
        canDirectlyCompare={canDirectlyCompare}
        compareFacetRows={compareFacetRows}
        compareFacetProfiles={compareFacetInsights.profiles}
        compareWarnings={compareFacetInsights.warnings}
        leftHints={leftHints}
        rightHints={rightHints}
        expandedSide={expandedSide}
        setExpandedSide={setExpandedSide}
        reviewDraft={reviewDraft}
        setReviewDraft={setReviewDraft}
        existingReviewUpdatedAt={existingReview?.updatedAtMs ?? null}
        submitting={submitting}
        onSaveReviewNote={handleSaveReviewNote}
      />
      <BenchmarkCohortSection
        benchmarkCohorts={benchmarkCohorts}
        selectedCohort={selectedCohort}
        selectedCohortId={selectedCohortId}
        setSelectedCohortId={setSelectedCohortId}
        showAutoAttachPreview={showAutoAttachPreview}
        setShowAutoAttachPreview={setShowAutoAttachPreview}
        submitting={submitting}
        autoAttachPreview={autoAttachPreview}
        proposalReasons={proposalReasons}
        setProposalReasons={setProposalReasons}
        testCaseMap={testCaseMap}
        runMap={runMap}
        rejectedProposalHistory={rejectedProposalHistory}
        cohortRuns={cohortRuns}
        cohortResults={cohortResults}
        workflowTrendSummary={workflowTrendSummary}
        workflowSummary={workflowSummary}
        cohortFacetSummary={cohortFacetSummary}
        cohortFacetProfiles={cohortFacetProfiles}
        selectedCohortSnapshots={selectedCohortSnapshots}
        snapshotDiffs={snapshotDiffs}
        orderedTestCaseIds={orderedTestCaseIds}
        assignmentsByTestCase={assignmentsByTestCase}
        decisionsByTestCase={decisionsByTestCase}
        assignmentSelections={assignmentSelections}
        setAssignmentSelections={setAssignmentSelections}
        decisionDrafts={decisionDrafts}
        setDecisionDrafts={setDecisionDrafts}
        regressionResults={regressionResults}
        regressionMap={regressionMap}
        evaluateAssignment={evaluateAssignment}
        suggestRunForTestCase={suggestRunForTestCase}
        onAutoAttachAll={handleAutoAttachAll}
        onSaveBenchmarkSnapshot={handleSaveBenchmarkSnapshot}
        onApproveProposal={approveProposal}
        onRejectProposal={rejectProposal}
        onAttachRun={attachRunToTestCase}
        onMarkWinner={markWinner}
        onPersistAssignmentEvaluation={persistAssignmentEvaluation}
        onUnassignRun={unassignRun}
      />
    </div>
  )
}
