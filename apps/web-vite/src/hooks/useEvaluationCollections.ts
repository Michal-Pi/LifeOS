import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  collection,
  collectionGroup,
  getDocs,
  limit,
  orderBy,
  query,
  where,
  type Query,
} from 'firebase/firestore'
import { getFirestoreClient } from '@/lib/firebase'
import { EvaluationPaths } from '@/lib/evaluationPaths'
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
import type {
  CapabilitySuite,
  BenchmarkCohort,
  DerivedTestCase,
  DriftAlert,
  EvalResult,
  EvalRubric,
  Experiment,
  PromptVariant,
  RegressionTestResult,
  Run,
  SharedComparisonResult,
} from '@lifeos/agents'

type EvaluationCollectionsState = {
  rubrics: EvalRubric[]
  results: EvalResult[]
  testCases: DerivedTestCase[]
  capabilitySuites: CapabilitySuite[]
  driftAlerts: DriftAlert[]
  experiments: Experiment[]
  promptVariants: PromptVariant[]
  benchmarkCohorts: BenchmarkCohort[]
  sharedComparisonResults: SharedComparisonResult[]
  manualReviewNotes: ManualReviewNote[]
  benchmarkRunAssignments: BenchmarkRunAssignment[]
  testCaseReviewDecisions: TestCaseReviewDecision[]
  autoAttachProposalFeedback: AutoAttachProposalFeedback[]
  benchmarkSnapshots: BenchmarkSnapshot[]
  capabilityRunRecords: CapabilityRunRecord[]
  capabilitySnapshots: CapabilitySnapshot[]
  agentEvalRecords: AgentEvalRecord[]
  agentExperimentRuns: AgentExperimentRun[]
  regressionResults: RegressionTestResult[]
  recentRuns: Run[]
}

const EMPTY_STATE: EvaluationCollectionsState = {
  rubrics: [],
  results: [],
  testCases: [],
  capabilitySuites: [],
  driftAlerts: [],
  experiments: [],
  promptVariants: [],
  benchmarkCohorts: [],
  sharedComparisonResults: [],
  manualReviewNotes: [],
  benchmarkRunAssignments: [],
  testCaseReviewDecisions: [],
  autoAttachProposalFeedback: [],
  benchmarkSnapshots: [],
  capabilityRunRecords: [],
  capabilitySnapshots: [],
  agentEvalRecords: [],
  agentExperimentRuns: [],
  regressionResults: [],
  recentRuns: [],
}

async function getDocsWithOrderedFallback(
  orderedQuery: Query,
  fallbackQuery: Query,
  context: string
) {
  try {
    return await getDocs(orderedQuery)
  } catch (error) {
    console.warn(`Ordered evaluation query fell back for ${context}`, error)
    return getDocs(fallbackQuery)
  }
}

export function useEvaluationCollections() {
  const { user } = useAuth()
  const [state, setState] = useState<EvaluationCollectionsState>(EMPTY_STATE)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const refresh = useCallback(() => setRefreshKey((value) => value + 1), [])

  useEffect(() => {
    if (!user) {
      setState(EMPTY_STATE)
      return
    }

    const load = async () => {
      setLoading(true)
      setError(null)

      try {
        const db = getFirestoreClient()
        const [
          rubricsSnapshot,
          resultsSnapshot,
          testCasesSnapshot,
          capabilitySuitesSnapshot,
          driftSnapshot,
          experimentsSnapshot,
          promptVariantsSnapshot,
          cohortsSnapshot,
          sharedSnapshot,
          manualReviewSnapshot,
          assignmentSnapshot,
          decisionSnapshot,
          feedbackSnapshot,
          snapshotHistorySnapshot,
          capabilityRunRecordsSnapshot,
          capabilitySnapshotsSnapshot,
          agentEvalRecordsSnapshot,
          agentExperimentRunsSnapshot,
          regressionSnapshot,
          runsSnapshot,
        ] = await Promise.all([
          getDocsWithOrderedFallback(
            query(collection(db, EvaluationPaths.rubrics(user.uid)), orderBy('updatedAtMs', 'desc'), limit(50)),
            query(collection(db, EvaluationPaths.rubrics(user.uid)), limit(50)),
            'rubrics'
          ),
          getDocsWithOrderedFallback(
            query(collection(db, EvaluationPaths.results(user.uid)), orderBy('createdAtMs', 'desc'), limit(100)),
            query(collection(db, EvaluationPaths.results(user.uid)), limit(100)),
            'results'
          ),
          getDocsWithOrderedFallback(
            query(collection(db, EvaluationPaths.testCases(user.uid)), orderBy('updatedAtMs', 'desc'), limit(100)),
            query(collection(db, EvaluationPaths.testCases(user.uid)), limit(100)),
            'testCases'
          ),
          getDocsWithOrderedFallback(
            query(collection(db, EvaluationPaths.capabilitySuites(user.uid)), orderBy('updatedAtMs', 'desc'), limit(50)),
            query(collection(db, EvaluationPaths.capabilitySuites(user.uid)), limit(50)),
            'capabilitySuites'
          ),
          getDocsWithOrderedFallback(
            query(collection(db, EvaluationPaths.driftAlerts(user.uid)), orderBy('updatedAtMs', 'desc'), limit(50)),
            query(collection(db, EvaluationPaths.driftAlerts(user.uid)), limit(50)),
            'driftAlerts'
          ),
          getDocsWithOrderedFallback(
            query(collection(db, EvaluationPaths.experiments(user.uid)), orderBy('updatedAtMs', 'desc'), limit(50)),
            query(collection(db, EvaluationPaths.experiments(user.uid)), limit(50)),
            'experiments'
          ),
          getDocsWithOrderedFallback(
            query(collection(db, EvaluationPaths.promptVariants(user.uid)), orderBy('updatedAtMs', 'desc'), limit(100)),
            query(collection(db, EvaluationPaths.promptVariants(user.uid)), limit(100)),
            'promptVariants'
          ),
          getDocsWithOrderedFallback(
            query(collection(db, EvaluationPaths.benchmarkCohorts(user.uid)), orderBy('updatedAtMs', 'desc'), limit(50)),
            query(collection(db, EvaluationPaths.benchmarkCohorts(user.uid)), limit(50)),
            'benchmarkCohorts'
          ),
          getDocsWithOrderedFallback(
            query(collection(db, EvaluationPaths.sharedComparisonResults(user.uid)), orderBy('createdAtMs', 'desc'), limit(100)),
            query(collection(db, EvaluationPaths.sharedComparisonResults(user.uid)), limit(100)),
            'sharedComparisonResults'
          ),
          getDocsWithOrderedFallback(
            query(collection(db, EvaluationPaths.manualReviewNotes(user.uid)), orderBy('updatedAtMs', 'desc'), limit(100)),
            query(collection(db, EvaluationPaths.manualReviewNotes(user.uid)), limit(100)),
            'manualReviewNotes'
          ),
          getDocsWithOrderedFallback(
            query(collection(db, EvaluationPaths.benchmarkRunAssignments(user.uid)), orderBy('updatedAtMs', 'desc'), limit(200)),
            query(collection(db, EvaluationPaths.benchmarkRunAssignments(user.uid)), limit(200)),
            'benchmarkRunAssignments'
          ),
          getDocsWithOrderedFallback(
            query(collection(db, EvaluationPaths.testCaseReviewDecisions(user.uid)), orderBy('updatedAtMs', 'desc'), limit(100)),
            query(collection(db, EvaluationPaths.testCaseReviewDecisions(user.uid)), limit(100)),
            'testCaseReviewDecisions'
          ),
          getDocsWithOrderedFallback(
            query(collection(db, EvaluationPaths.autoAttachProposalFeedback(user.uid)), orderBy('updatedAtMs', 'desc'), limit(200)),
            query(collection(db, EvaluationPaths.autoAttachProposalFeedback(user.uid)), limit(200)),
            'autoAttachProposalFeedback'
          ),
          getDocsWithOrderedFallback(
            query(collection(db, EvaluationPaths.benchmarkSnapshots(user.uid)), orderBy('updatedAtMs', 'desc'), limit(200)),
            query(collection(db, EvaluationPaths.benchmarkSnapshots(user.uid)), limit(200)),
            'benchmarkSnapshots'
          ),
          getDocsWithOrderedFallback(
            query(collection(db, EvaluationPaths.capabilityRunRecords(user.uid)), orderBy('updatedAtMs', 'desc'), limit(300)),
            query(collection(db, EvaluationPaths.capabilityRunRecords(user.uid)), limit(300)),
            'capabilityRunRecords'
          ),
          getDocsWithOrderedFallback(
            query(collection(db, EvaluationPaths.capabilitySnapshots(user.uid)), orderBy('updatedAtMs', 'desc'), limit(200)),
            query(collection(db, EvaluationPaths.capabilitySnapshots(user.uid)), limit(200)),
            'capabilitySnapshots'
          ),
          getDocsWithOrderedFallback(
            query(collection(db, EvaluationPaths.agentEvalRecords(user.uid)), orderBy('updatedAtMs', 'desc'), limit(300)),
            query(collection(db, EvaluationPaths.agentEvalRecords(user.uid)), limit(300)),
            'agentEvalRecords'
          ),
          getDocsWithOrderedFallback(
            query(collection(db, EvaluationPaths.agentExperimentRuns(user.uid)), orderBy('updatedAtMs', 'desc'), limit(300)),
            query(collection(db, EvaluationPaths.agentExperimentRuns(user.uid)), limit(300)),
            'agentExperimentRuns'
          ),
          getDocsWithOrderedFallback(
            query(collection(db, EvaluationPaths.regressionResults(user.uid)), orderBy('executedAtMs', 'desc'), limit(200)),
            query(collection(db, EvaluationPaths.regressionResults(user.uid)), limit(200)),
            'regressionResults'
          ),
          getDocsWithOrderedFallback(
            query(collectionGroup(db, 'runs'), where('userId', '==', user.uid), orderBy('startedAtMs', 'desc'), limit(120)),
            query(collectionGroup(db, 'runs'), where('userId', '==', user.uid), limit(120)),
            'recentRuns'
          ),
        ])

        const recentRuns = runsSnapshot.docs
          .map((doc) => doc.data() as Run)
          .sort((left, right) => (right.startedAtMs ?? 0) - (left.startedAtMs ?? 0))

        setState({
          rubrics: rubricsSnapshot.docs.map((doc) => doc.data() as EvalRubric),
          results: resultsSnapshot.docs
            .map((doc) => doc.data() as EvalResult)
            .sort((left, right) => right.createdAtMs - left.createdAtMs),
          testCases: testCasesSnapshot.docs
            .map((doc) => doc.data() as DerivedTestCase)
            .sort((left, right) => right.updatedAtMs - left.updatedAtMs),
          capabilitySuites: capabilitySuitesSnapshot.docs
            .map((doc) => doc.data() as CapabilitySuite)
            .sort((left, right) => right.updatedAtMs - left.updatedAtMs),
          driftAlerts: driftSnapshot.docs
            .map((doc) => doc.data() as DriftAlert)
            .sort((left, right) => right.updatedAtMs - left.updatedAtMs),
          experiments: experimentsSnapshot.docs
            .map((doc) => doc.data() as Experiment)
            .sort((left, right) => right.updatedAtMs - left.updatedAtMs),
          promptVariants: promptVariantsSnapshot.docs
            .map((doc) => doc.data() as PromptVariant)
            .sort((left, right) => right.updatedAtMs - left.updatedAtMs),
          benchmarkCohorts: cohortsSnapshot.docs
            .map((doc) => doc.data() as BenchmarkCohort)
            .sort((left, right) => right.updatedAtMs - left.updatedAtMs),
          sharedComparisonResults: sharedSnapshot.docs
            .map((doc) => doc.data() as SharedComparisonResult)
            .sort((left, right) => right.createdAtMs - left.createdAtMs),
          manualReviewNotes: manualReviewSnapshot.docs
            .map((doc) => doc.data() as ManualReviewNote)
            .sort((left, right) => right.updatedAtMs - left.updatedAtMs),
          benchmarkRunAssignments: assignmentSnapshot.docs
            .map((doc) => doc.data() as BenchmarkRunAssignment)
            .sort((left, right) => right.updatedAtMs - left.updatedAtMs),
          testCaseReviewDecisions: decisionSnapshot.docs
            .map((doc) => doc.data() as TestCaseReviewDecision)
            .sort((left, right) => right.updatedAtMs - left.updatedAtMs),
          autoAttachProposalFeedback: feedbackSnapshot.docs
            .map((doc) => doc.data() as AutoAttachProposalFeedback)
            .sort((left, right) => right.updatedAtMs - left.updatedAtMs),
          benchmarkSnapshots: snapshotHistorySnapshot.docs
            .map((doc) => doc.data() as BenchmarkSnapshot)
            .sort((left, right) => right.updatedAtMs - left.updatedAtMs),
          capabilityRunRecords: capabilityRunRecordsSnapshot.docs
            .map((doc) => doc.data() as CapabilityRunRecord)
            .sort((left, right) => right.updatedAtMs - left.updatedAtMs),
          capabilitySnapshots: capabilitySnapshotsSnapshot.docs
            .map((doc) => doc.data() as CapabilitySnapshot)
            .sort((left, right) => right.updatedAtMs - left.updatedAtMs),
          agentEvalRecords: agentEvalRecordsSnapshot.docs
            .map((doc) => doc.data() as AgentEvalRecord)
            .sort((left, right) => right.updatedAtMs - left.updatedAtMs),
          agentExperimentRuns: agentExperimentRunsSnapshot.docs
            .map((doc) => doc.data() as AgentExperimentRun)
            .sort((left, right) => right.updatedAtMs - left.updatedAtMs),
          regressionResults: regressionSnapshot.docs
            .map((doc) => doc.data() as RegressionTestResult)
            .sort((left, right) => right.executedAtMs - left.executedAtMs),
          recentRuns,
        })
      } catch (err) {
        console.error('Failed to load evaluation collections', err)
        setError(err instanceof Error ? err.message : 'Failed to load evaluation collections')
      } finally {
        setLoading(false)
      }
    }

    void load()
  }, [refreshKey, user])

  return useMemo(
    () => ({
      ...state,
      loading,
      error,
      refresh,
    }),
    [error, loading, refresh, state]
  )
}
