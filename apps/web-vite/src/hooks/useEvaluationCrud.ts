import { useCallback, useState } from 'react'
import { deleteDoc, doc, setDoc } from 'firebase/firestore'
import { newId } from '@lifeos/core'
import type {
  BenchmarkCohort,
  CapabilitySuite,
  DerivedTestCase,
  EvalCriterion,
  EvalRubric,
  Experiment,
  PromptVariant,
  RegressionTestResult,
} from '@lifeos/agents'
import { getFirestoreClient } from '@/lib/firebase'
import { useAuth } from '@/hooks/useAuth'
import type {
  AutoAttachProposalFeedback,
  AgentEvalRecord,
  AgentExperimentRun,
  BenchmarkSnapshot,
  BenchmarkRunAssignment,
  CapabilitySnapshot,
  CapabilityRunRecord,
  ManualReviewNote,
  TestCaseReviewDecision,
} from '@/hooks/evaluationWorkspaceTypes'
import { EvaluationPaths } from '@/lib/evaluationPaths'

function withEqualWeights(criteria: EvalCriterion[]) {
  if (criteria.length === 0) return criteria
  const weight = Number((1 / criteria.length).toFixed(3))
  return criteria.map((criterion, index) => ({
    ...criterion,
    weight:
      index === criteria.length - 1
        ? Number((1 - weight * (criteria.length - 1)).toFixed(3))
        : weight,
  }))
}

export function useEvaluationCrud() {
  const { user } = useAuth()
  const [submitting, setSubmitting] = useState(false)

  const saveRubric = useCallback(
    async (
      input: Omit<EvalRubric, 'userId' | 'createdAtMs' | 'updatedAtMs'> & {
        rubricId?: string
        createdAtMs?: number
      }
    ) => {
      if (!user) throw new Error('You must be signed in to save rubrics.')
      setSubmitting(true)
      try {
        const db = getFirestoreClient()
        const now = Date.now()
        const rubricId = input.rubricId ?? newId<'evalRubric'>('evalRubric')
        const payload: EvalRubric = {
          ...input,
          rubricId,
          userId: user.uid,
          criteria: withEqualWeights(input.criteria),
          createdAtMs: input.createdAtMs ?? now,
          updatedAtMs: now,
        }
        await setDoc(doc(db, EvaluationPaths.rubric(user.uid, rubricId)), payload, { merge: true })
        return payload
      } finally {
        setSubmitting(false)
      }
    },
    [user]
  )

  const saveTestCase = useCallback(
    async (
      input: Omit<DerivedTestCase, 'userId' | 'createdAtMs' | 'updatedAtMs'> & {
        testCaseId?: string
        createdAtMs?: number
      }
    ) => {
      if (!user) throw new Error('You must be signed in to save test cases.')
      setSubmitting(true)
      try {
        const db = getFirestoreClient()
        const now = Date.now()
        const testCaseId = input.testCaseId ?? newId<'derivedTestCase'>('derivedTestCase')
        const payload: DerivedTestCase = {
          ...input,
          testCaseId,
          userId: user.uid,
          createdAtMs: input.createdAtMs ?? now,
          updatedAtMs: now,
        }
        await setDoc(doc(db, EvaluationPaths.testCase(user.uid, testCaseId)), payload, {
          merge: true,
        })
        return payload
      } finally {
        setSubmitting(false)
      }
    },
    [user]
  )

  const saveBenchmarkCohort = useCallback(
    async (
      input: Omit<BenchmarkCohort, 'userId' | 'createdAtMs' | 'updatedAtMs'> & {
        cohortId?: string
        createdAtMs?: number
      }
    ) => {
      if (!user) throw new Error('You must be signed in to save benchmark cohorts.')
      setSubmitting(true)
      try {
        const db = getFirestoreClient()
        const now = Date.now()
        const cohortId = input.cohortId ?? newId<'benchmarkCohort'>('benchmarkCohort')
        const payload: BenchmarkCohort = {
          ...input,
          cohortId,
          userId: user.uid,
          createdAtMs: input.createdAtMs ?? now,
          updatedAtMs: now,
        }
        await setDoc(doc(db, EvaluationPaths.benchmarkCohort(user.uid, cohortId)), payload, {
          merge: true,
        })
        return payload
      } finally {
        setSubmitting(false)
      }
    },
    [user]
  )

  const saveCapabilitySuite = useCallback(
    async (
      input: Omit<CapabilitySuite, 'userId' | 'createdAtMs' | 'updatedAtMs'> & {
        suiteId?: string
        createdAtMs?: number
      }
    ) => {
      if (!user) throw new Error('You must be signed in to save capability suites.')
      setSubmitting(true)
      try {
        const db = getFirestoreClient()
        const now = Date.now()
        const suiteId = input.suiteId ?? newId<'capabilitySuite'>('capabilitySuite')
        const payload: CapabilitySuite = {
          ...input,
          suiteId,
          userId: user.uid,
          createdAtMs: input.createdAtMs ?? now,
          updatedAtMs: now,
        }
        await setDoc(doc(db, EvaluationPaths.capabilitySuite(user.uid, suiteId)), payload, {
          merge: true,
        })
        return payload
      } finally {
        setSubmitting(false)
      }
    },
    [user]
  )

  const saveExperiment = useCallback(
    async (
      input: Omit<Experiment, 'userId' | 'createdAtMs' | 'updatedAtMs'> & {
        experimentId?: string
        createdAtMs?: number
      }
    ) => {
      if (!user) throw new Error('You must be signed in to save experiments.')
      setSubmitting(true)
      try {
        const db = getFirestoreClient()
        const now = Date.now()
        const experimentId = input.experimentId ?? newId<'experiment'>('experiment')
        const payload: Experiment = {
          ...input,
          experimentId,
          userId: user.uid,
          createdAtMs: input.createdAtMs ?? now,
          updatedAtMs: now,
        }
        await setDoc(doc(db, EvaluationPaths.experiment(user.uid, experimentId)), payload, {
          merge: true,
        })
        return payload
      } finally {
        setSubmitting(false)
      }
    },
    [user]
  )

  const savePromptVariant = useCallback(
    async (
      input: Omit<PromptVariant, 'userId' | 'createdAtMs' | 'updatedAtMs'> & {
        variantId?: string
        createdAtMs?: number
      }
    ) => {
      if (!user) throw new Error('You must be signed in to save prompt variants.')
      setSubmitting(true)
      try {
        const db = getFirestoreClient()
        const now = Date.now()
        const variantId = input.variantId ?? newId<'promptVariant'>('promptVariant')
        const payload: PromptVariant = {
          ...input,
          variantId,
          userId: user.uid,
          createdAtMs: input.createdAtMs ?? now,
          updatedAtMs: now,
        }
        await setDoc(doc(db, EvaluationPaths.promptVariant(user.uid, variantId)), payload, {
          merge: true,
        })
        return payload
      } finally {
        setSubmitting(false)
      }
    },
    [user]
  )

  const saveManualReviewNote = useCallback(
    async (
      input: Omit<ManualReviewNote, 'noteId' | 'userId' | 'createdAtMs' | 'updatedAtMs'> & {
        noteId?: string
        createdAtMs?: number
      }
    ) => {
      if (!user) throw new Error('You must be signed in to save review notes.')
      setSubmitting(true)
      try {
        const db = getFirestoreClient()
        const now = Date.now()
        const noteId = input.noteId ?? newId<'sharedComparisonResult'>('sharedComparisonResult')
        const payload: ManualReviewNote = {
          ...input,
          noteId,
          userId: user.uid,
          createdAtMs: input.createdAtMs ?? now,
          updatedAtMs: now,
        }
        await setDoc(doc(db, EvaluationPaths.manualReviewNote(user.uid, noteId)), payload, {
          merge: true,
        })
        return payload
      } finally {
        setSubmitting(false)
      }
    },
    [user]
  )

  const saveBenchmarkRunAssignment = useCallback(
    async (
      input: Omit<
        BenchmarkRunAssignment,
        'assignmentId' | 'userId' | 'createdAtMs' | 'updatedAtMs'
      > & {
        assignmentId?: string
        createdAtMs?: number
      }
    ) => {
      if (!user) throw new Error('You must be signed in to save benchmark assignments.')
      setSubmitting(true)
      try {
        const db = getFirestoreClient()
        const now = Date.now()
        const assignmentId =
          input.assignmentId ?? newId<'sharedComparisonResult'>('sharedComparisonResult')
        const payload: BenchmarkRunAssignment = {
          ...input,
          assignmentId,
          userId: user.uid,
          createdAtMs: input.createdAtMs ?? now,
          updatedAtMs: now,
        }
        await setDoc(
          doc(db, EvaluationPaths.benchmarkRunAssignment(user.uid, assignmentId)),
          payload,
          { merge: true }
        )
        return payload
      } finally {
        setSubmitting(false)
      }
    },
    [user]
  )

  const saveTestCaseReviewDecision = useCallback(
    async (
      input: Omit<
        TestCaseReviewDecision,
        'decisionId' | 'userId' | 'createdAtMs' | 'updatedAtMs'
      > & {
        decisionId?: string
        createdAtMs?: number
      }
    ) => {
      if (!user) throw new Error('You must be signed in to save test-case decisions.')
      setSubmitting(true)
      try {
        const db = getFirestoreClient()
        const now = Date.now()
        const decisionId =
          input.decisionId ?? newId<'sharedComparisonResult'>('sharedComparisonResult')
        const payload: TestCaseReviewDecision = {
          ...input,
          decisionId,
          userId: user.uid,
          createdAtMs: input.createdAtMs ?? now,
          updatedAtMs: now,
        }
        await setDoc(
          doc(db, EvaluationPaths.testCaseReviewDecision(user.uid, decisionId)),
          payload,
          { merge: true }
        )
        return payload
      } finally {
        setSubmitting(false)
      }
    },
    [user]
  )

  const saveRegressionTestResult = useCallback(
    async (input: RegressionTestResult) => {
      if (!user) throw new Error('You must be signed in to save regression results.')
      setSubmitting(true)
      try {
        const db = getFirestoreClient()
        const documentId = `${input.testCaseId}__${input.runId}`
        await setDoc(doc(db, EvaluationPaths.regressionResult(user.uid, documentId)), input, {
          merge: true,
        })
        return input
      } finally {
        setSubmitting(false)
      }
    },
    [user]
  )

  const deleteBenchmarkRunAssignment = useCallback(
    async (assignmentId: string) => {
      if (!user) throw new Error('You must be signed in to delete benchmark assignments.')
      setSubmitting(true)
      try {
        const db = getFirestoreClient()
        await deleteDoc(doc(db, EvaluationPaths.benchmarkRunAssignment(user.uid, assignmentId)))
      } finally {
        setSubmitting(false)
      }
    },
    [user]
  )

  const saveAutoAttachProposalFeedback = useCallback(
    async (
      input: Omit<
        AutoAttachProposalFeedback,
        'feedbackId' | 'userId' | 'createdAtMs' | 'updatedAtMs'
      > & {
        feedbackId?: string
        createdAtMs?: number
      }
    ) => {
      if (!user) throw new Error('You must be signed in to save proposal feedback.')
      setSubmitting(true)
      try {
        const db = getFirestoreClient()
        const now = Date.now()
        const feedbackId =
          input.feedbackId ?? newId<'sharedComparisonResult'>('sharedComparisonResult')
        const payload: AutoAttachProposalFeedback = {
          ...input,
          feedbackId,
          userId: user.uid,
          createdAtMs: input.createdAtMs ?? now,
          updatedAtMs: now,
        }
        await setDoc(
          doc(db, EvaluationPaths.autoAttachProposalFeedbackDoc(user.uid, feedbackId)),
          payload,
          { merge: true }
        )
        return payload
      } finally {
        setSubmitting(false)
      }
    },
    [user]
  )

  const saveBenchmarkSnapshot = useCallback(
    async (
      input: Omit<BenchmarkSnapshot, 'snapshotId' | 'userId' | 'createdAtMs' | 'updatedAtMs'> & {
        snapshotId?: string
        createdAtMs?: number
      }
    ) => {
      if (!user) throw new Error('You must be signed in to save benchmark snapshots.')
      setSubmitting(true)
      try {
        const db = getFirestoreClient()
        const now = Date.now()
        const snapshotId =
          input.snapshotId ?? newId<'sharedComparisonResult'>('sharedComparisonResult')
        const payload: BenchmarkSnapshot = {
          ...input,
          snapshotId,
          userId: user.uid,
          createdAtMs: input.createdAtMs ?? now,
          updatedAtMs: now,
        }
        await setDoc(doc(db, EvaluationPaths.benchmarkSnapshot(user.uid, snapshotId)), payload, {
          merge: true,
        })
        return payload
      } finally {
        setSubmitting(false)
      }
    },
    [user]
  )

  const saveCapabilityRunRecord = useCallback(
    async (
      input: Omit<CapabilityRunRecord, 'recordId' | 'userId' | 'createdAtMs' | 'updatedAtMs'> & {
        recordId?: string
        createdAtMs?: number
      }
    ) => {
      if (!user) throw new Error('You must be signed in to save capability run records.')
      setSubmitting(true)
      try {
        const db = getFirestoreClient()
        const now = Date.now()
        const recordId = input.recordId ?? newId<'sharedComparisonResult'>('sharedComparisonResult')
        const payload: CapabilityRunRecord = {
          ...input,
          recordId,
          userId: user.uid,
          createdAtMs: input.createdAtMs ?? now,
          updatedAtMs: now,
        }
        await setDoc(doc(db, EvaluationPaths.capabilityRunRecord(user.uid, recordId)), payload, {
          merge: true,
        })
        return payload
      } finally {
        setSubmitting(false)
      }
    },
    [user]
  )

  const saveCapabilitySnapshot = useCallback(
    async (
      input: Omit<CapabilitySnapshot, 'snapshotId' | 'userId' | 'createdAtMs' | 'updatedAtMs'> & {
        snapshotId?: string
        createdAtMs?: number
      }
    ) => {
      if (!user) throw new Error('You must be signed in to save capability snapshots.')
      setSubmitting(true)
      try {
        const db = getFirestoreClient()
        const now = Date.now()
        const snapshotId =
          input.snapshotId ?? newId<'sharedComparisonResult'>('sharedComparisonResult')
        const payload: CapabilitySnapshot = {
          ...input,
          snapshotId,
          userId: user.uid,
          createdAtMs: input.createdAtMs ?? now,
          updatedAtMs: now,
        }
        await setDoc(doc(db, EvaluationPaths.capabilitySnapshot(user.uid, snapshotId)), payload, {
          merge: true,
        })
        return payload
      } finally {
        setSubmitting(false)
      }
    },
    [user]
  )

  const saveAgentEvalRecord = useCallback(
    async (
      input: Omit<AgentEvalRecord, 'recordId' | 'userId' | 'createdAtMs' | 'updatedAtMs'> & {
        recordId?: string
        createdAtMs?: number
      }
    ) => {
      if (!user) throw new Error('You must be signed in to save agent eval records.')
      setSubmitting(true)
      try {
        const db = getFirestoreClient()
        const now = Date.now()
        const recordId = input.recordId ?? newId<'sharedComparisonResult'>('sharedComparisonResult')
        const payload: AgentEvalRecord = {
          ...input,
          recordId,
          userId: user.uid,
          createdAtMs: input.createdAtMs ?? now,
          updatedAtMs: now,
        }
        await setDoc(doc(db, EvaluationPaths.agentEvalRecord(user.uid, recordId)), payload, {
          merge: true,
        })
        return payload
      } finally {
        setSubmitting(false)
      }
    },
    [user]
  )

  const saveAgentExperimentRun = useCallback(
    async (
      input: Omit<
        AgentExperimentRun,
        'experimentRunId' | 'userId' | 'createdAtMs' | 'updatedAtMs'
      > & {
        experimentRunId?: string
        createdAtMs?: number
      }
    ) => {
      if (!user) throw new Error('You must be signed in to save agent experiment runs.')
      setSubmitting(true)
      try {
        const db = getFirestoreClient()
        const now = Date.now()
        const experimentRunId =
          input.experimentRunId ?? newId<'sharedComparisonResult'>('sharedComparisonResult')
        const payload: AgentExperimentRun = {
          ...input,
          experimentRunId,
          userId: user.uid,
          createdAtMs: input.createdAtMs ?? now,
          updatedAtMs: now,
        }
        await setDoc(
          doc(db, EvaluationPaths.agentExperimentRun(user.uid, experimentRunId)),
          payload,
          { merge: true }
        )
        return payload
      } finally {
        setSubmitting(false)
      }
    },
    [user]
  )

  return {
    submitting,
    saveRubric,
    saveTestCase,
    saveBenchmarkCohort,
    saveCapabilitySuite,
    saveExperiment,
    savePromptVariant,
    saveManualReviewNote,
    saveBenchmarkRunAssignment,
    saveTestCaseReviewDecision,
    saveRegressionTestResult,
    deleteBenchmarkRunAssignment,
    saveAutoAttachProposalFeedback,
    saveBenchmarkSnapshot,
    saveCapabilityRunRecord,
    saveCapabilitySnapshot,
    saveAgentEvalRecord,
    saveAgentExperimentRun,
  }
}
