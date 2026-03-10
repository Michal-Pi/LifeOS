import type { CapabilitySuite, DerivedTestCase, EvalResult, Run } from '@lifeos/agents'
import type {
  CapabilityFamilySnapshot,
  CapabilityRunRecord,
} from '@/hooks/evaluationWorkspaceTypes'
import { useEvaluationCrud } from '@/hooks/useEvaluationCrud'

interface UseCapabilitySuiteOperationsInput {
  suite: CapabilitySuite | null
  onRefresh?: () => void
}

export function useCapabilitySuiteOperations({
  suite,
  onRefresh,
}: UseCapabilitySuiteOperationsInput) {
  const { saveCapabilityRunRecord, saveCapabilitySnapshot, submitting } = useEvaluationCrud()

  const saveCapabilityExecution = async (input: {
    testCase: DerivedTestCase
    run: Run
    result?: EvalResult | null
    notes?: string
    existing?: Pick<CapabilityRunRecord, 'recordId' | 'createdAtMs'>
  }) => {
    if (!suite) return
    await saveCapabilityRunRecord({
      recordId: input.existing?.recordId,
      createdAtMs: input.existing?.createdAtMs,
      suiteId: suite.suiteId,
      testCaseId: input.testCase.testCaseId,
      runId: input.run.runId,
      taskFamily: input.testCase.taskFamily,
      difficulty: input.testCase.difficulty,
      isHoldout: input.testCase.isHoldout,
      passed:
        typeof input.result?.aggregateScore === 'number'
          ? input.result.aggregateScore >= input.testCase.minQualityScore
          : false,
      qualityScore: input.result?.aggregateScore ?? null,
      scoreVariance: input.result?.scoreVariance ?? null,
      requiresHumanReview: input.result?.requiresHumanReview ?? false,
      notes: input.notes,
    })
    onRefresh?.()
  }

  const saveCapabilitySnapshotSummary = async (summary: CapabilityFamilySnapshot[]) => {
    if (!suite) return
    await saveCapabilitySnapshot({
      suiteId: suite.suiteId,
      summary,
    })
    onRefresh?.()
  }

  return {
    submitting,
    saveCapabilityExecution,
    saveCapabilitySnapshotSummary,
  }
}
