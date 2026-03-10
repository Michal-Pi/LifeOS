import type { DerivedTestCase, Run } from '@lifeos/agents'
import type {
  BenchmarkRunAssignment,
  BenchmarkSnapshot,
  ManualReviewNote,
  TestCaseReviewDecision,
} from '@/hooks/evaluationWorkspaceTypes'
import { useEvaluationCrud } from '@/hooks/useEvaluationCrud'
import type {
  BenchmarkAssignmentEvaluation,
  SuggestedCandidate,
} from '@/components/evaluation/benchmarkPolicy'

interface UseBenchmarkOperationsInput {
  cohortId?: string | null
  onRefresh?: () => void
  evaluateAssignment: (run: Run, testCase: DerivedTestCase) => BenchmarkAssignmentEvaluation
}

export function useBenchmarkOperations({
  cohortId,
  onRefresh,
  evaluateAssignment,
}: UseBenchmarkOperationsInput) {
  const {
    saveManualReviewNote,
    saveAutoAttachProposalFeedback,
    saveBenchmarkRunAssignment,
    saveRegressionTestResult,
    saveTestCaseReviewDecision,
    deleteBenchmarkRunAssignment,
    saveBenchmarkSnapshot,
    submitting,
  } = useEvaluationCrud()

  const saveReviewNote = async (
    input: Omit<ManualReviewNote, 'noteId' | 'userId' | 'createdAtMs' | 'updatedAtMs'> & {
      noteId?: string
      createdAtMs?: number
    }
  ) => {
    await saveManualReviewNote(input)
    onRefresh?.()
  }

  const persistAssignmentEvaluation = async (run: Run, testCase: DerivedTestCase) => {
    const evaluation = evaluateAssignment(run, testCase)
    await saveRegressionTestResult({
      testCaseId: testCase.testCaseId,
      runId: run.runId,
      userId: run.userId,
      passed: evaluation.passed,
      failureReasons: evaluation.failures,
      qualityScore: evaluation.qualityScore ?? 0,
      qualityPassed:
        evaluation.qualityScore !== null
          ? evaluation.qualityScore >= testCase.minQualityScore
          : false,
      stepCount: evaluation.stepCount,
      stepsPassed: evaluation.stepCount <= testCase.maxSteps,
      cost: run.estimatedCost ?? 0,
      costPassed: (run.estimatedCost ?? 0) <= testCase.maxCost,
      durationMs: (evaluation.durationSec ?? 0) * 1000,
      durationPassed:
        typeof testCase.maxDurationMs === 'number'
          ? (evaluation.durationSec ?? 0) * 1000 <= testCase.maxDurationMs
          : undefined,
      outputSimilarity: evaluation.outputSimilarity ?? undefined,
      outputMatched: evaluation.outputMatched,
      toolCallsMatched: evaluation.toolCallsMatched,
      missingTools: evaluation.missingTools,
      extraTools: evaluation.extraTools,
      routerDecisionsMatched: evaluation.routerDecisionsMatched,
      missingRouterDecisions: evaluation.missingRouterDecisions,
      actualRouterChoices: evaluation.actualRouterChoices,
      workflowVersion: 'current',
      executedAtMs: Date.now(),
    })
  }

  const attachRunToTestCase = async (testCase: DerivedTestCase, run: Run) => {
    if (!cohortId) return
    await saveBenchmarkRunAssignment({
      cohortId,
      testCaseId: testCase.testCaseId,
      runId: run.runId,
    })
    await persistAssignmentEvaluation(run, testCase)
    onRefresh?.()
  }

  const approveProposal = async (testCase: DerivedTestCase, run: Run) => {
    if (!cohortId) return
    await saveAutoAttachProposalFeedback({
      cohortId,
      testCaseId: testCase.testCaseId,
      runId: run.runId,
      disposition: 'approved',
    })
    await attachRunToTestCase(testCase, run)
  }

  const rejectProposal = async (testCaseId: string, runId: string, reason?: string) => {
    if (!cohortId) return
    await saveAutoAttachProposalFeedback({
      cohortId,
      testCaseId,
      runId,
      disposition: 'rejected',
      reason,
    })
    onRefresh?.()
  }

  const markWinner = async (
    testCaseId: string,
    winnerRunId: string,
    notes?: string,
    existing?: Pick<TestCaseReviewDecision, 'decisionId' | 'createdAtMs'>
  ) => {
    if (!cohortId) return
    await saveTestCaseReviewDecision({
      decisionId: existing?.decisionId,
      createdAtMs: existing?.createdAtMs,
      cohortId,
      testCaseId,
      winnerRunId,
      notes,
    })
    onRefresh?.()
  }

  const unassignRun = async (assignmentId: string) => {
    await deleteBenchmarkRunAssignment(assignmentId)
    onRefresh?.()
  }

  const saveSnapshot = async (summary: BenchmarkSnapshot['summary']) => {
    if (!cohortId) return
    await saveBenchmarkSnapshot({ cohortId, summary })
    onRefresh?.()
  }

  const autoAttachSuggestedRuns = async (input: {
    testCases: DerivedTestCase[]
    assignmentsByTestCase: Map<string, BenchmarkRunAssignment[]>
    suggestRunForTestCase: (
      testCase: DerivedTestCase,
      assignedRunIds: string[],
      workflowUsage?: Map<string, number>
    ) => SuggestedCandidate | null
  }) => {
    if (!cohortId) return
    const workflowUsage = new Map<string, number>()
    for (const testCase of input.testCases) {
      const assignedRunIds = (input.assignmentsByTestCase.get(testCase.testCaseId) ?? []).map(
        (assignment) => assignment.runId
      )
      const candidate = input.suggestRunForTestCase(testCase, assignedRunIds, workflowUsage)
      const suggestedRun = candidate?.run
      if (!suggestedRun) continue
      const evaluation = evaluateAssignment(suggestedRun, testCase)
      if (assignedRunIds.includes(suggestedRun.runId)) continue
      if (!evaluation.passed) continue
      workflowUsage.set(
        suggestedRun.workflowType,
        (workflowUsage.get(suggestedRun.workflowType) ?? 0) + 1
      )
      await approveProposal(testCase, suggestedRun)
    }
  }

  return {
    submitting,
    saveReviewNote,
    attachRunToTestCase,
    approveProposal,
    rejectProposal,
    markWinner,
    persistAssignmentEvaluation,
    unassignRun,
    saveSnapshot,
    autoAttachSuggestedRuns,
  }
}
