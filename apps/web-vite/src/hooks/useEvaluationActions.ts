import { useCallback, useState } from 'react'
import { doc, setDoc } from 'firebase/firestore'
import { newId } from '@lifeos/core'
import type { DerivedTestCase, Run } from '@lifeos/agents'
import { getFirestoreClient } from '@/lib/firebase'
import { EvaluationPaths } from '@/lib/evaluationPaths'
import { useAuth } from '@/hooks/useAuth'
import { useEvaluationWorkspaceState } from '@/hooks/useEvaluationWorkspaceState'

function inferTaskFamily(workflowType: string): DerivedTestCase['taskFamily'] {
  switch (workflowType) {
    case 'oracle':
      return 'strategic_reasoning'
    case 'dialectical':
      return 'synthesis_under_conflict'
    case 'deep_research':
      return 'causal_reasoning'
    default:
      return 'transfer_reasoning'
  }
}

export function useEvaluationActions() {
  const { user } = useAuth()
  const workspace = useEvaluationWorkspaceState()
  const [submitting, setSubmitting] = useState(false)

  const createTestCaseFromRun = useCallback(
    async (run: Run) => {
      if (!user) {
        throw new Error('You must be signed in to create evaluation assets.')
      }

      setSubmitting(true)
      try {
        const db = getFirestoreClient()
        const testCaseId = newId<'derivedTestCase'>('derivedTestCase')
        const now = Date.now()
        const maxDurationMs =
          run.startedAtMs && run.completedAtMs
            ? Math.round((run.completedAtMs - run.startedAtMs) * 1.5)
            : undefined

        const testCase: DerivedTestCase = {
          testCaseId,
          sourceRunId: run.runId,
          userId: user.uid,
          workflowType: run.workflowType,
          input: run.goal,
          taskFamily: inferTaskFamily(run.workflowType),
          difficulty: 'medium',
          ambiguityLevel: 'medium',
          evidenceAvailability: 'mixed',
          capabilityTags: [run.workflowType, 'derived-from-run', 'general-thinking'],
          evaluationFocus: ['quality', 'depth', 'usefulness'],
          isHoldout: false,
          context: {
            workflowId: run.workflowId,
            status: run.status,
          },
          expectedOutput: run.output,
          expectedSteps: typeof run.currentStep === 'number' ? run.currentStep : undefined,
          minQualityScore: 3.5,
          maxSteps: Math.max((run.currentStep ?? 6) + 2, 6),
          maxCost: Math.max((run.estimatedCost ?? 0.25) * 1.25, 0.25),
          maxDurationMs,
          derivedFromLabel: false,
          sourceQualityScore: 0,
          description: run.goal.slice(0, 140),
          tags: [run.workflowType, 'derived-from-run'],
          passCount: 0,
          failCount: 0,
          isActive: true,
          isGolden: run.status === 'completed',
          createdAtMs: now,
          updatedAtMs: now,
        }

        await setDoc(doc(db, EvaluationPaths.testCase(user.uid, testCaseId)), testCase)
        workspace.setActiveView('suites')
        return testCase
      } finally {
        setSubmitting(false)
      }
    },
    [user, workspace]
  )

  const openCompareFromRun = useCallback(
    (run: Run) => {
      workspace.setCompareRuns(run.runId)
    },
    [workspace]
  )

  const prepareCohortReview = useCallback(
    (run: Run) => {
      workspace.setPendingCohortRun(run.runId)
    },
    [workspace]
  )

  return {
    submitting,
    createTestCaseFromRun,
    openCompareFromRun,
    prepareCohortReview,
  }
}
