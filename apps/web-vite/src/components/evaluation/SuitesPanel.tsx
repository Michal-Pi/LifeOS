import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import type {
  BenchmarkCohort,
  CapabilitySuite,
  DerivedTestCase,
  EvalCriterion,
  EvalRubric,
  EvaluationMode,
  EvaluationModeConfig,
  JudgePanelMemberConfig,
  Run,
} from '@lifeos/agents'
import { useEvaluationCrud } from '@/hooks/useEvaluationCrud'

interface SuitesPanelProps {
  rubrics: EvalRubric[]
  testCases: DerivedTestCase[]
  capabilitySuites: CapabilitySuite[]
  benchmarkCohorts: BenchmarkCohort[]
  recentRuns: Run[]
  onRefresh?: () => void
  pendingCohortRunId?: string | null
  onSelectCohort?: (cohortId: string) => void
  onSelectCapabilitySuite?: (suiteId: string) => void
  onClearPendingRun?: () => void
}

type RubricDraft = {
  rubricId?: string
  createdAtMs?: number
  name: string
  workflowType: string
  taskType?: string
  description: string
  criteriaText: string
  judgeProvider: string
  judgeModel: string
  evaluationMode: EvaluationMode
  panelMembersText: string
  reconciliationJudgeProvider: string
  reconciliationJudgeModel: string
  triggerOnDisagreementOnly: boolean
  disagreementThreshold: string
  requireHumanReviewAboveVariance: string
  systemPrompt?: string
  isDefault: boolean
  isArchived: boolean
  version: number
}

type TestCaseDraft = {
  testCaseId?: string
  createdAtMs?: number
  sourceRunId: string
  workflowType: string
  description: string
  input: string
  minQualityScore: string
  maxSteps: string
  maxCost: string
  isGolden: boolean
  isActive: boolean
  derivedFromLabel: boolean
  sourceQualityScore: number
  passCount: number
  failCount: number
}

type CohortDraft = {
  cohortId?: string
  createdAtMs?: number
  name: string
  description: string
  useCase: string
  workflowTypesText: string
  sharedRubricId: string
  comparisonMode: 'pairwise' | 'leaderboard'
  allowManualReview: boolean
  evaluationMode: EvaluationMode
  panelMembersText: string
  reconciliationJudgeProvider: string
  reconciliationJudgeModel: string
  triggerOnDisagreementOnly: boolean
  disagreementThreshold: string
  requireHumanReviewAboveVariance: string
  isActive: boolean
  testCaseIds: string[]
  workflowSpecificRubricIds?: Record<string, BenchmarkCohort['sharedRubricId']>
  acceptanceThresholds?: BenchmarkCohort['acceptanceThresholds']
  rawOutputComparisonAllowed?: boolean
  allVsAllEnabled?: boolean
}

type CapabilitySuiteDraft = {
  suiteId?: string
  createdAtMs?: number
  name: string
  description: string
  taskFamiliesText: string
  sharedRubricId: string
  isActive: boolean
  testCaseIds: string[]
}

const EMPTY_RUBRIC: RubricDraft = {
  name: '',
  workflowType: 'default',
  description: '',
  criteriaText: 'task fit, factual grounding, reasoning quality, usefulness',
  judgeProvider: 'openai',
  judgeModel: 'gpt-4o',
  evaluationMode: 'single_judge',
  panelMembersText: '',
  reconciliationJudgeProvider: 'openai',
  reconciliationJudgeModel: 'gpt-4o',
  triggerOnDisagreementOnly: false,
  disagreementThreshold: '',
  requireHumanReviewAboveVariance: '',
  isDefault: false,
  isArchived: false,
  version: 1,
}

const EMPTY_TEST_CASE: TestCaseDraft = {
  sourceRunId: '',
  workflowType: 'default',
  description: '',
  input: '',
  minQualityScore: '3.5',
  maxSteps: '8',
  maxCost: '0.5',
  isGolden: false,
  isActive: true,
  derivedFromLabel: false,
  sourceQualityScore: 0,
  passCount: 0,
  failCount: 0,
}

const EMPTY_COHORT: CohortDraft = {
  name: '',
  description: '',
  useCase: '',
  workflowTypesText: 'oracle, deep_research, dialectical',
  sharedRubricId: '',
  comparisonMode: 'leaderboard',
  allowManualReview: true,
  evaluationMode: 'single_judge',
  panelMembersText: '',
  reconciliationJudgeProvider: 'openai',
  reconciliationJudgeModel: 'gpt-4o',
  triggerOnDisagreementOnly: false,
  disagreementThreshold: '',
  requireHumanReviewAboveVariance: '',
  isActive: true,
  testCaseIds: [],
}

const EMPTY_CAPABILITY_SUITE: CapabilitySuiteDraft = {
  name: '',
  description: '',
  taskFamiliesText: 'strategic_reasoning, causal_reasoning, abstraction_and_decomposition',
  sharedRubricId: '',
  isActive: true,
  testCaseIds: [],
}

function parseCriteria(criteriaText: string): EvalCriterion[] {
  const parts = criteriaText
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
  return parts.map((name) => ({
    name,
    description: `Evaluate ${name}.`,
    weight: 1,
    prompt: `Score the output for ${name}.`,
    scoreRange: { min: 1, max: 5 },
  }))
}

function parseWorkflowTypes(text: string) {
  return text
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function parsePanelMembers(text: string): JudgePanelMemberConfig[] | undefined {
  const members = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [role, judgeProvider, judgeModel] = line.split('|').map((part) => part.trim())
      if (!role || !judgeProvider || !judgeModel) return null
      return { role, judgeProvider, judgeModel }
    })
    .filter((member): member is JudgePanelMemberConfig => Boolean(member))
  return members.length > 0 ? members : undefined
}

function buildEvaluationModeConfig(input: {
  evaluationMode: EvaluationMode
  panelMembersText: string
  reconciliationJudgeProvider: string
  reconciliationJudgeModel: string
  triggerOnDisagreementOnly: boolean
  disagreementThreshold: string
  requireHumanReviewAboveVariance: string
}): EvaluationModeConfig | undefined {
  if (input.evaluationMode === 'single_judge') return { mode: 'single_judge' }
  return {
    mode: input.evaluationMode,
    panelMembers: parsePanelMembers(input.panelMembersText),
    reconciliationJudge:
      input.evaluationMode === 'expert_council_eval'
        ? {
            judgeProvider: input.reconciliationJudgeProvider,
            judgeModel: input.reconciliationJudgeModel,
          }
        : undefined,
    triggerOnDisagreementOnly: input.triggerOnDisagreementOnly,
    disagreementThreshold: input.disagreementThreshold
      ? Number(input.disagreementThreshold)
      : undefined,
    requireHumanReviewAboveVariance: input.requireHumanReviewAboveVariance
      ? Number(input.requireHumanReviewAboveVariance)
      : undefined,
  }
}

function formatPanelMembers(members?: JudgePanelMemberConfig[]): string {
  return (
    members
      ?.map((member) => `${member.role} | ${member.judgeProvider} | ${member.judgeModel}`)
      .join('\n') ?? ''
  )
}

export function SuitesPanel({
  rubrics,
  testCases,
  capabilitySuites,
  benchmarkCohorts,
  recentRuns,
  onRefresh,
  pendingCohortRunId,
  onSelectCohort,
  onSelectCapabilitySuite,
  onClearPendingRun,
}: SuitesPanelProps) {
  const { saveRubric, saveTestCase, saveBenchmarkCohort, saveCapabilitySuite, submitting } =
    useEvaluationCrud()
  const [rubricDraft, setRubricDraft] = useState<RubricDraft>(EMPTY_RUBRIC)
  const [testCaseDraft, setTestCaseDraft] = useState<TestCaseDraft>(EMPTY_TEST_CASE)
  const [cohortDraft, setCohortDraft] = useState<CohortDraft>(EMPTY_COHORT)
  const [capabilitySuiteDraft, setCapabilitySuiteDraft] =
    useState<CapabilitySuiteDraft>(EMPTY_CAPABILITY_SUITE)
  const [compositionCohortId, setCompositionCohortId] = useState<string>(
    benchmarkCohorts[0]?.cohortId ?? ''
  )
  const [compositionSuiteId, setCompositionSuiteId] = useState<string>(
    capabilitySuites[0]?.suiteId ?? ''
  )
  const pendingRun = recentRuns.find((run) => run.runId === pendingCohortRunId) ?? null

  const activeRubrics = useMemo(() => rubrics.filter((rubric) => !rubric.isArchived), [rubrics])
  const compositionCohort =
    benchmarkCohorts.find((cohort) => cohort.cohortId === compositionCohortId) ?? null
  const compositionSuite =
    capabilitySuites.find((suite) => suite.suiteId === compositionSuiteId) ?? null
  const compositionTestCases = useMemo(
    () =>
      testCases.filter((testCase) =>
        compositionCohort?.workflowTypes.includes(testCase.workflowType)
      ),
    [compositionCohort?.workflowTypes, testCases]
  )
  const suiteTestCases = useMemo(() => {
    if (!compositionSuite) return []
    return testCases.filter(
      (testCase) =>
        Boolean(testCase.taskFamily) && compositionSuite.taskFamilies.includes(testCase.taskFamily!)
    )
  }, [compositionSuite, testCases])
  const capabilityFamilyCounts = useMemo(() => {
    const counts = new Map<string, number>()
    suiteTestCases.forEach((testCase) => {
      if (!testCase.taskFamily) return
      counts.set(testCase.taskFamily, (counts.get(testCase.taskFamily) ?? 0) + 1)
    })
    return counts
  }, [suiteTestCases])
  const suiteRuns = useMemo(() => {
    if (!compositionSuite) return []
    const suiteSourceRunIds = new Set(
      suiteTestCases
        .filter((testCase) => compositionSuite.testCaseIds.includes(testCase.testCaseId))
        .map((testCase) => testCase.sourceRunId)
    )
    return recentRuns.filter((run) => suiteSourceRunIds.has(run.runId))
  }, [compositionSuite, recentRuns, suiteTestCases])

  const handleSaveRubric = async () => {
    try {
      await saveRubric({
        rubricId: rubricDraft.rubricId,
        createdAtMs: rubricDraft.createdAtMs,
        name: rubricDraft.name,
        description: rubricDraft.description,
        workflowType: rubricDraft.workflowType,
        taskType: rubricDraft.taskType,
        criteria: parseCriteria(rubricDraft.criteriaText),
        judgeModel: rubricDraft.judgeModel,
        judgeProvider: rubricDraft.judgeProvider,
        evaluationMode: buildEvaluationModeConfig(rubricDraft),
        systemPrompt: rubricDraft.systemPrompt,
        isDefault: rubricDraft.isDefault,
        isArchived: rubricDraft.isArchived,
        version: rubricDraft.version,
      })
      onRefresh?.()
      toast.success(rubricDraft.rubricId ? 'Rubric updated' : 'Rubric created')
      setRubricDraft(EMPTY_RUBRIC)
    } catch (error) {
      toast.error((error as Error).message)
    }
  }

  const handleSaveTestCase = async () => {
    try {
      await saveTestCase({
        testCaseId: testCaseDraft.testCaseId,
        createdAtMs: testCaseDraft.createdAtMs,
        sourceRunId: testCaseDraft.sourceRunId as DerivedTestCase['sourceRunId'],
        workflowType: testCaseDraft.workflowType,
        input: testCaseDraft.input,
        expectedOutput:
          recentRuns.find((run) => run.runId === testCaseDraft.sourceRunId)?.output ?? undefined,
        minQualityScore: Number(testCaseDraft.minQualityScore),
        maxSteps: Number(testCaseDraft.maxSteps),
        maxCost: Number(testCaseDraft.maxCost),
        derivedFromLabel: testCaseDraft.derivedFromLabel,
        sourceQualityScore: testCaseDraft.sourceQualityScore,
        description: testCaseDraft.description,
        tags: [testCaseDraft.workflowType],
        passCount: testCaseDraft.passCount,
        failCount: testCaseDraft.failCount,
        isActive: testCaseDraft.isActive,
        isGolden: testCaseDraft.isGolden,
      })
      onRefresh?.()
      toast.success(testCaseDraft.testCaseId ? 'Test case updated' : 'Test case created')
      setTestCaseDraft(EMPTY_TEST_CASE)
    } catch (error) {
      toast.error((error as Error).message)
    }
  }

  const handleSaveCohort = async () => {
    try {
      await saveBenchmarkCohort({
        cohortId: cohortDraft.cohortId,
        createdAtMs: cohortDraft.createdAtMs,
        name: cohortDraft.name,
        description: cohortDraft.description,
        useCase: cohortDraft.useCase,
        workflowTypes: parseWorkflowTypes(cohortDraft.workflowTypesText),
        sharedRubricId: cohortDraft.sharedRubricId as BenchmarkCohort['sharedRubricId'],
        testCaseIds: cohortDraft.testCaseIds as BenchmarkCohort['testCaseIds'],
        comparisonMode: cohortDraft.comparisonMode,
        allowManualReview: cohortDraft.allowManualReview,
        evaluationMode: buildEvaluationModeConfig(cohortDraft),
        workflowSpecificRubricIds: cohortDraft.workflowSpecificRubricIds,
        acceptanceThresholds: cohortDraft.acceptanceThresholds,
        rawOutputComparisonAllowed: cohortDraft.rawOutputComparisonAllowed,
        allVsAllEnabled: cohortDraft.allVsAllEnabled,
        isActive: cohortDraft.isActive,
      })
      onRefresh?.()
      toast.success(cohortDraft.cohortId ? 'Benchmark cohort updated' : 'Benchmark cohort created')
      setCohortDraft({
        ...EMPTY_COHORT,
        sharedRubricId: cohortDraft.sharedRubricId,
      })
    } catch (error) {
      toast.error((error as Error).message)
    }
  }

  const handleSaveCapabilitySuite = async () => {
    try {
      await saveCapabilitySuite({
        suiteId: capabilitySuiteDraft.suiteId,
        createdAtMs: capabilitySuiteDraft.createdAtMs,
        name: capabilitySuiteDraft.name,
        description: capabilitySuiteDraft.description || undefined,
        taskFamilies: parseWorkflowTypes(capabilitySuiteDraft.taskFamiliesText) as NonNullable<
          DerivedTestCase['taskFamily']
        >[],
        sharedRubricId: capabilitySuiteDraft.sharedRubricId || undefined,
        isActive: capabilitySuiteDraft.isActive,
        testCaseIds: capabilitySuiteDraft.testCaseIds,
      })
      onRefresh?.()
      toast.success(
        capabilitySuiteDraft.suiteId ? 'Capability suite updated' : 'Capability suite created'
      )
      setCapabilitySuiteDraft(EMPTY_CAPABILITY_SUITE)
    } catch (error) {
      toast.error((error as Error).message)
    }
  }

  return (
    <div className="eval-panel">
      <section className="eval-split-grid">
        <article className="eval-card">
          <div className="eval-section-heading">
            <h3>Rubrics</h3>
            <p>Create, edit, and archive workflow-native or shared comparison rubrics.</p>
          </div>
          <div className="eval-form-grid">
            <input
              className="eval-input"
              placeholder="Rubric name"
              value={rubricDraft.name}
              onChange={(event) =>
                setRubricDraft((value) => ({ ...value, name: event.target.value }))
              }
            />
            <input
              className="eval-input"
              placeholder="Workflow type"
              value={rubricDraft.workflowType}
              onChange={(event) =>
                setRubricDraft((value) => ({ ...value, workflowType: event.target.value }))
              }
            />
            <textarea
              className="eval-textarea"
              rows={3}
              placeholder="Description"
              value={rubricDraft.description}
              onChange={(event) =>
                setRubricDraft((value) => ({ ...value, description: event.target.value }))
              }
            />
            <textarea
              className="eval-textarea"
              rows={3}
              placeholder="Criteria, comma separated"
              value={rubricDraft.criteriaText}
              onChange={(event) =>
                setRubricDraft((value) => ({ ...value, criteriaText: event.target.value }))
              }
            />
            <select
              className="eval-select"
              value={rubricDraft.evaluationMode}
              onChange={(event) =>
                setRubricDraft((value) => ({
                  ...value,
                  evaluationMode: event.target.value as EvaluationMode,
                }))
              }
            >
              <option value="single_judge">single_judge</option>
              <option value="judge_panel">judge_panel</option>
              <option value="expert_council_eval">expert_council_eval</option>
            </select>
            {rubricDraft.evaluationMode !== 'single_judge' ? (
              <>
                <textarea
                  className="eval-textarea"
                  rows={4}
                  placeholder="Panel members, one per line: role | provider | model"
                  value={rubricDraft.panelMembersText}
                  onChange={(event) =>
                    setRubricDraft((value) => ({ ...value, panelMembersText: event.target.value }))
                  }
                />
                <input
                  className="eval-input"
                  placeholder="Disagreement threshold"
                  value={rubricDraft.disagreementThreshold}
                  onChange={(event) =>
                    setRubricDraft((value) => ({
                      ...value,
                      disagreementThreshold: event.target.value,
                    }))
                  }
                />
                <input
                  className="eval-input"
                  placeholder="Human review variance threshold"
                  value={rubricDraft.requireHumanReviewAboveVariance}
                  onChange={(event) =>
                    setRubricDraft((value) => ({
                      ...value,
                      requireHumanReviewAboveVariance: event.target.value,
                    }))
                  }
                />
                <label className="eval-checkbox">
                  <input
                    type="checkbox"
                    checked={rubricDraft.triggerOnDisagreementOnly}
                    onChange={(event) =>
                      setRubricDraft((value) => ({
                        ...value,
                        triggerOnDisagreementOnly: event.target.checked,
                      }))
                    }
                  />
                  Trigger only on disagreement
                </label>
                {rubricDraft.evaluationMode === 'expert_council_eval' ? (
                  <>
                    <input
                      className="eval-input"
                      placeholder="Reconciliation provider"
                      value={rubricDraft.reconciliationJudgeProvider}
                      onChange={(event) =>
                        setRubricDraft((value) => ({
                          ...value,
                          reconciliationJudgeProvider: event.target.value,
                        }))
                      }
                    />
                    <input
                      className="eval-input"
                      placeholder="Reconciliation model"
                      value={rubricDraft.reconciliationJudgeModel}
                      onChange={(event) =>
                        setRubricDraft((value) => ({
                          ...value,
                          reconciliationJudgeModel: event.target.value,
                        }))
                      }
                    />
                  </>
                ) : null}
              </>
            ) : null}
          </div>
          <div className="eval-form-actions">
            <button
              type="button"
              className="eval-refresh-button"
              onClick={() => void handleSaveRubric()}
              disabled={submitting || !rubricDraft.name.trim()}
            >
              {submitting ? 'Saving...' : rubricDraft.rubricId ? 'Update Rubric' : 'Create Rubric'}
            </button>
            {rubricDraft.rubricId ? (
              <button
                type="button"
                className="eval-subtab"
                onClick={() => setRubricDraft(EMPTY_RUBRIC)}
              >
                Cancel Edit
              </button>
            ) : null}
          </div>
          <div className="eval-list">
            {rubrics.length === 0 ? (
              <div className="eval-empty">No rubrics found.</div>
            ) : (
              rubrics.map((rubric) => (
                <div key={rubric.rubricId} className="eval-list-item">
                  <div>
                    <strong>{rubric.name}</strong>
                    <p>
                      {rubric.workflowType} · {rubric.criteria.length} criteria ·{' '}
                      {rubric.evaluationMode?.mode ?? 'single_judge'}
                    </p>
                  </div>
                  <div className="eval-inline-actions">
                    <span
                      className={`eval-pill ${rubric.isArchived ? 'archived' : rubric.isDefault ? 'active' : 'neutral'}`}
                    >
                      {rubric.isArchived
                        ? 'archived'
                        : rubric.isDefault
                          ? 'default'
                          : `v${rubric.version}`}
                    </span>
                    <button
                      type="button"
                      className="eval-subtab"
                      onClick={() =>
                        setRubricDraft({
                          rubricId: rubric.rubricId,
                          createdAtMs: rubric.createdAtMs,
                          name: rubric.name,
                          workflowType: rubric.workflowType,
                          taskType: rubric.taskType,
                          description: rubric.description,
                          criteriaText: rubric.criteria
                            .map((criterion) => criterion.name)
                            .join(', '),
                          judgeProvider: rubric.judgeProvider,
                          judgeModel: rubric.judgeModel,
                          evaluationMode: rubric.evaluationMode?.mode ?? 'single_judge',
                          panelMembersText: formatPanelMembers(rubric.evaluationMode?.panelMembers),
                          reconciliationJudgeProvider:
                            rubric.evaluationMode?.reconciliationJudge?.judgeProvider ?? 'openai',
                          reconciliationJudgeModel:
                            rubric.evaluationMode?.reconciliationJudge?.judgeModel ?? 'gpt-4o',
                          triggerOnDisagreementOnly:
                            rubric.evaluationMode?.triggerOnDisagreementOnly ?? false,
                          disagreementThreshold: String(
                            rubric.evaluationMode?.disagreementThreshold ?? ''
                          ),
                          requireHumanReviewAboveVariance: String(
                            rubric.evaluationMode?.requireHumanReviewAboveVariance ?? ''
                          ),
                          systemPrompt: rubric.systemPrompt,
                          isDefault: rubric.isDefault,
                          isArchived: rubric.isArchived,
                          version: rubric.version,
                        })
                      }
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="eval-subtab"
                      onClick={() =>
                        void saveRubric({
                          ...rubric,
                          createdAtMs: rubric.createdAtMs,
                          isArchived: !rubric.isArchived,
                        }).then(() => {
                          onRefresh?.()
                          toast.success(rubric.isArchived ? 'Rubric restored' : 'Rubric archived')
                        })
                      }
                    >
                      {rubric.isArchived ? 'Restore' : 'Archive'}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </article>

        <article className="eval-card">
          <div className="eval-section-heading">
            <h3>Test Cases</h3>
            <p>Create, edit, and preserve benchmarkable runs as reusable test cases.</p>
          </div>
          <div className="eval-form-grid">
            <select
              className="eval-select"
              value={testCaseDraft.sourceRunId}
              onChange={(event) => {
                const run = recentRuns.find((item) => item.runId === event.target.value)
                setTestCaseDraft((value) => ({
                  ...value,
                  sourceRunId: event.target.value,
                  workflowType: run?.workflowType ?? value.workflowType,
                  input: run?.goal ?? value.input,
                  description: run?.goal.slice(0, 140) ?? value.description,
                }))
              }}
            >
              <option value="">Source run</option>
              {recentRuns.map((run) => (
                <option key={run.runId} value={run.runId}>
                  {run.workflowType} · {run.goal.slice(0, 56)}
                </option>
              ))}
            </select>
            <input
              className="eval-input"
              placeholder="Workflow type"
              value={testCaseDraft.workflowType}
              onChange={(event) =>
                setTestCaseDraft((value) => ({ ...value, workflowType: event.target.value }))
              }
            />
            <input
              className="eval-input"
              placeholder="Description"
              value={testCaseDraft.description}
              onChange={(event) =>
                setTestCaseDraft((value) => ({ ...value, description: event.target.value }))
              }
            />
            <textarea
              className="eval-textarea"
              rows={4}
              placeholder="Input / task prompt"
              value={testCaseDraft.input}
              onChange={(event) =>
                setTestCaseDraft((value) => ({ ...value, input: event.target.value }))
              }
            />
          </div>
          <div className="eval-form-grid eval-form-grid--compact">
            <input
              className="eval-input"
              placeholder="Min quality"
              value={testCaseDraft.minQualityScore}
              onChange={(event) =>
                setTestCaseDraft((value) => ({ ...value, minQualityScore: event.target.value }))
              }
            />
            <input
              className="eval-input"
              placeholder="Max steps"
              value={testCaseDraft.maxSteps}
              onChange={(event) =>
                setTestCaseDraft((value) => ({ ...value, maxSteps: event.target.value }))
              }
            />
            <input
              className="eval-input"
              placeholder="Max cost"
              value={testCaseDraft.maxCost}
              onChange={(event) =>
                setTestCaseDraft((value) => ({ ...value, maxCost: event.target.value }))
              }
            />
          </div>
          <div className="eval-form-actions">
            <label className="eval-checkbox">
              <input
                type="checkbox"
                checked={testCaseDraft.isGolden}
                onChange={(event) =>
                  setTestCaseDraft((value) => ({ ...value, isGolden: event.target.checked }))
                }
              />
              Golden test
            </label>
            <button
              type="button"
              className="eval-refresh-button"
              onClick={() => void handleSaveTestCase()}
              disabled={submitting || !testCaseDraft.input.trim() || !testCaseDraft.sourceRunId}
            >
              {submitting
                ? 'Saving...'
                : testCaseDraft.testCaseId
                  ? 'Update Test Case'
                  : 'Create Test Case'}
            </button>
          </div>
          <div className="eval-list">
            {testCases.length === 0 ? (
              <div className="eval-empty">No test cases found.</div>
            ) : (
              testCases.map((testCase) => (
                <div key={testCase.testCaseId} className="eval-list-item">
                  <div>
                    <strong>{testCase.description ?? testCase.input.slice(0, 72)}</strong>
                    <p>
                      {testCase.workflowType} · quality {testCase.minQualityScore.toFixed(2)}
                    </p>
                  </div>
                  <div className="eval-inline-actions">
                    <span
                      className={`eval-pill ${testCase.isGolden ? 'active' : testCase.isActive ? 'neutral' : 'archived'}`}
                    >
                      {testCase.isGolden ? 'golden' : testCase.isActive ? 'active' : 'archived'}
                    </span>
                    <button
                      type="button"
                      className="eval-subtab"
                      onClick={() =>
                        setTestCaseDraft({
                          testCaseId: testCase.testCaseId,
                          createdAtMs: testCase.createdAtMs,
                          sourceRunId: testCase.sourceRunId,
                          workflowType: testCase.workflowType,
                          description: testCase.description ?? '',
                          input: testCase.input,
                          minQualityScore: String(testCase.minQualityScore),
                          maxSteps: String(testCase.maxSteps),
                          maxCost: String(testCase.maxCost),
                          isGolden: testCase.isGolden,
                          isActive: testCase.isActive,
                          derivedFromLabel: testCase.derivedFromLabel,
                          sourceQualityScore: testCase.sourceQualityScore,
                          passCount: testCase.passCount,
                          failCount: testCase.failCount,
                        })
                      }
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="eval-subtab"
                      onClick={() =>
                        void saveTestCase({
                          ...testCase,
                          createdAtMs: testCase.createdAtMs,
                          isActive: !testCase.isActive,
                        }).then(() => {
                          onRefresh?.()
                          toast.success(
                            testCase.isActive ? 'Test case archived' : 'Test case restored'
                          )
                        })
                      }
                    >
                      {testCase.isActive ? 'Archive' : 'Restore'}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </article>
      </section>

      <section className="eval-card">
        <div className="eval-section-heading">
          <h3>Capability Suites</h3>
          <p>Create reusable reasoning-family evaluation sets that cut across workflows.</p>
        </div>
        <div className="eval-form-grid">
          <input
            className="eval-input"
            placeholder="Capability suite name"
            value={capabilitySuiteDraft.name}
            onChange={(event) =>
              setCapabilitySuiteDraft((value) => ({ ...value, name: event.target.value }))
            }
          />
          <select
            className="eval-select"
            value={capabilitySuiteDraft.sharedRubricId}
            onChange={(event) =>
              setCapabilitySuiteDraft((value) => ({ ...value, sharedRubricId: event.target.value }))
            }
          >
            <option value="">Optional shared rubric</option>
            {activeRubrics.map((rubric) => (
              <option key={rubric.rubricId} value={rubric.rubricId}>
                {rubric.name}
              </option>
            ))}
          </select>
          <textarea
            className="eval-textarea"
            rows={3}
            placeholder="Description"
            value={capabilitySuiteDraft.description}
            onChange={(event) =>
              setCapabilitySuiteDraft((value) => ({ ...value, description: event.target.value }))
            }
          />
          <input
            className="eval-input"
            placeholder="Task families, comma separated"
            value={capabilitySuiteDraft.taskFamiliesText}
            onChange={(event) =>
              setCapabilitySuiteDraft((value) => ({
                ...value,
                taskFamiliesText: event.target.value,
              }))
            }
          />
        </div>
        <div className="eval-form-actions">
          <label className="eval-checkbox">
            <input
              type="checkbox"
              checked={capabilitySuiteDraft.isActive}
              onChange={(event) =>
                setCapabilitySuiteDraft((value) => ({ ...value, isActive: event.target.checked }))
              }
            />
            Active capability suite
          </label>
          <button
            type="button"
            className="eval-refresh-button"
            onClick={() => void handleSaveCapabilitySuite()}
            disabled={submitting || !capabilitySuiteDraft.name.trim()}
          >
            {submitting
              ? 'Saving...'
              : capabilitySuiteDraft.suiteId
                ? 'Update Capability Suite'
                : 'Create Capability Suite'}
          </button>
        </div>
        <div className="eval-list">
          {capabilitySuites.length === 0 ? (
            <div className="eval-empty">No capability suites defined yet.</div>
          ) : (
            capabilitySuites.map((suite) => (
              <div key={suite.suiteId} className="eval-list-item">
                <div>
                  <strong>{suite.name}</strong>
                  <p>
                    {suite.taskFamilies.join(', ')} · {suite.testCaseIds.length} linked test cases
                  </p>
                </div>
                <div className="eval-inline-actions">
                  <span className={`eval-pill ${suite.isActive ? 'active' : 'archived'}`}>
                    {suite.isActive ? 'active' : 'archived'}
                  </span>
                  <button
                    type="button"
                    className="eval-subtab"
                    onClick={() =>
                      setCapabilitySuiteDraft({
                        suiteId: suite.suiteId,
                        createdAtMs: suite.createdAtMs,
                        name: suite.name,
                        description: suite.description ?? '',
                        taskFamiliesText: suite.taskFamilies.join(', '),
                        sharedRubricId: suite.sharedRubricId ?? '',
                        isActive: suite.isActive,
                        testCaseIds: suite.testCaseIds,
                      })
                    }
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="eval-subtab"
                    onClick={() => onSelectCapabilitySuite?.(suite.suiteId)}
                  >
                    Review
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="eval-card">
        <div className="eval-section-heading">
          <h3>Benchmark Cohorts</h3>
          <p>Create, edit, and route runs into shared comparison spaces.</p>
        </div>
        {pendingRun ? (
          <div className="eval-action-banner">
            <div>
              <strong>Pending cohort review</strong>
              <p>
                {pendingRun.workflowType} · {pendingRun.goal.slice(0, 120)}
              </p>
            </div>
            <button type="button" className="eval-refresh-button" onClick={onClearPendingRun}>
              Clear
            </button>
          </div>
        ) : null}
        <div className="eval-form-grid">
          <input
            className="eval-input"
            placeholder="Cohort name"
            value={cohortDraft.name}
            onChange={(event) =>
              setCohortDraft((value) => ({ ...value, name: event.target.value }))
            }
          />
          <input
            className="eval-input"
            placeholder="Use-case"
            value={cohortDraft.useCase}
            onChange={(event) =>
              setCohortDraft((value) => ({ ...value, useCase: event.target.value }))
            }
          />
          <textarea
            className="eval-textarea"
            rows={3}
            placeholder="Description"
            value={cohortDraft.description}
            onChange={(event) =>
              setCohortDraft((value) => ({ ...value, description: event.target.value }))
            }
          />
          <input
            className="eval-input"
            placeholder="Workflow types, comma separated"
            value={cohortDraft.workflowTypesText}
            onChange={(event) =>
              setCohortDraft((value) => ({ ...value, workflowTypesText: event.target.value }))
            }
          />
          <select
            className="eval-select"
            value={cohortDraft.sharedRubricId}
            onChange={(event) =>
              setCohortDraft((value) => ({ ...value, sharedRubricId: event.target.value }))
            }
          >
            <option value="">Shared rubric</option>
            {activeRubrics.map((rubric) => (
              <option key={rubric.rubricId} value={rubric.rubricId}>
                {rubric.name}
              </option>
            ))}
          </select>
          <select
            className="eval-select"
            value={cohortDraft.comparisonMode}
            onChange={(event) =>
              setCohortDraft((value) => ({
                ...value,
                comparisonMode: event.target.value as CohortDraft['comparisonMode'],
              }))
            }
          >
            <option value="leaderboard">leaderboard</option>
            <option value="pairwise">pairwise</option>
          </select>
          <select
            className="eval-select"
            value={cohortDraft.evaluationMode}
            onChange={(event) =>
              setCohortDraft((value) => ({
                ...value,
                evaluationMode: event.target.value as EvaluationMode,
              }))
            }
          >
            <option value="single_judge">single_judge</option>
            <option value="judge_panel">judge_panel</option>
            <option value="expert_council_eval">expert_council_eval</option>
          </select>
          {cohortDraft.evaluationMode !== 'single_judge' ? (
            <>
              <textarea
                className="eval-textarea"
                rows={4}
                placeholder="Panel members, one per line: role | provider | model"
                value={cohortDraft.panelMembersText}
                onChange={(event) =>
                  setCohortDraft((value) => ({ ...value, panelMembersText: event.target.value }))
                }
              />
              <input
                className="eval-input"
                placeholder="Disagreement threshold"
                value={cohortDraft.disagreementThreshold}
                onChange={(event) =>
                  setCohortDraft((value) => ({
                    ...value,
                    disagreementThreshold: event.target.value,
                  }))
                }
              />
              <input
                className="eval-input"
                placeholder="Human review variance threshold"
                value={cohortDraft.requireHumanReviewAboveVariance}
                onChange={(event) =>
                  setCohortDraft((value) => ({
                    ...value,
                    requireHumanReviewAboveVariance: event.target.value,
                  }))
                }
              />
              <label className="eval-checkbox">
                <input
                  type="checkbox"
                  checked={cohortDraft.triggerOnDisagreementOnly}
                  onChange={(event) =>
                    setCohortDraft((value) => ({
                      ...value,
                      triggerOnDisagreementOnly: event.target.checked,
                    }))
                  }
                />
                Trigger only on disagreement
              </label>
              {cohortDraft.evaluationMode === 'expert_council_eval' ? (
                <>
                  <input
                    className="eval-input"
                    placeholder="Reconciliation provider"
                    value={cohortDraft.reconciliationJudgeProvider}
                    onChange={(event) =>
                      setCohortDraft((value) => ({
                        ...value,
                        reconciliationJudgeProvider: event.target.value,
                      }))
                    }
                  />
                  <input
                    className="eval-input"
                    placeholder="Reconciliation model"
                    value={cohortDraft.reconciliationJudgeModel}
                    onChange={(event) =>
                      setCohortDraft((value) => ({
                        ...value,
                        reconciliationJudgeModel: event.target.value,
                      }))
                    }
                  />
                </>
              ) : null}
            </>
          ) : null}
        </div>
        <div className="eval-form-actions">
          <label className="eval-checkbox">
            <input
              type="checkbox"
              checked={cohortDraft.allowManualReview}
              onChange={(event) =>
                setCohortDraft((value) => ({ ...value, allowManualReview: event.target.checked }))
              }
            />
            Allow manual review
          </label>
          <button
            type="button"
            className="eval-refresh-button"
            onClick={() => void handleSaveCohort()}
            disabled={submitting || !cohortDraft.name.trim() || !cohortDraft.sharedRubricId}
          >
            {submitting ? 'Saving...' : cohortDraft.cohortId ? 'Update Cohort' : 'Create Cohort'}
          </button>
        </div>
        {benchmarkCohorts.length === 0 ? (
          <div className="eval-empty">No benchmark cohorts found.</div>
        ) : (
          <div className="eval-cohort-grid">
            {benchmarkCohorts.map((cohort) => (
              <article key={cohort.cohortId} className="eval-cohort-card">
                <div className="eval-workflow-card__header">
                  <h4>{cohort.name}</h4>
                  <span>{cohort.comparisonMode}</span>
                </div>
                <p>{cohort.description || cohort.useCase}</p>
                <dl className="eval-metric-list">
                  <div>
                    <dt>Use Case</dt>
                    <dd>{cohort.useCase}</dd>
                  </div>
                  <div>
                    <dt>Workflows</dt>
                    <dd>{cohort.workflowTypes.length}</dd>
                  </div>
                  <div>
                    <dt>Test Cases</dt>
                    <dd>{cohort.testCaseIds.length}</dd>
                  </div>
                  <div>
                    <dt>Manual Review</dt>
                    <dd>{cohort.allowManualReview ? 'on' : 'off'}</dd>
                  </div>
                  <div>
                    <dt>Eval Mode</dt>
                    <dd>{cohort.evaluationMode?.mode ?? 'single_judge'}</dd>
                  </div>
                </dl>
                <div className="eval-inline-actions">
                  {pendingRun ? (
                    <button
                      type="button"
                      className="eval-refresh-button"
                      onClick={() => onSelectCohort?.(cohort.cohortId)}
                    >
                      Open cohort review for this run
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="eval-subtab"
                    onClick={() =>
                      setCohortDraft({
                        cohortId: cohort.cohortId,
                        createdAtMs: cohort.createdAtMs,
                        name: cohort.name,
                        description: cohort.description ?? '',
                        useCase: cohort.useCase,
                        workflowTypesText: cohort.workflowTypes.join(', '),
                        sharedRubricId: cohort.sharedRubricId,
                        comparisonMode: cohort.comparisonMode,
                        allowManualReview: cohort.allowManualReview,
                        evaluationMode: cohort.evaluationMode?.mode ?? 'single_judge',
                        panelMembersText: formatPanelMembers(cohort.evaluationMode?.panelMembers),
                        reconciliationJudgeProvider:
                          cohort.evaluationMode?.reconciliationJudge?.judgeProvider ?? 'openai',
                        reconciliationJudgeModel:
                          cohort.evaluationMode?.reconciliationJudge?.judgeModel ?? 'gpt-4o',
                        triggerOnDisagreementOnly:
                          cohort.evaluationMode?.triggerOnDisagreementOnly ?? false,
                        disagreementThreshold: String(
                          cohort.evaluationMode?.disagreementThreshold ?? ''
                        ),
                        requireHumanReviewAboveVariance: String(
                          cohort.evaluationMode?.requireHumanReviewAboveVariance ?? ''
                        ),
                        isActive: cohort.isActive,
                        testCaseIds: cohort.testCaseIds,
                        workflowSpecificRubricIds: cohort.workflowSpecificRubricIds,
                        acceptanceThresholds: cohort.acceptanceThresholds,
                        rawOutputComparisonAllowed: cohort.rawOutputComparisonAllowed,
                        allVsAllEnabled: cohort.allVsAllEnabled,
                      })
                    }
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="eval-subtab"
                    onClick={() =>
                      void saveBenchmarkCohort({
                        ...cohort,
                        createdAtMs: cohort.createdAtMs,
                        isActive: !cohort.isActive,
                      }).then(() => {
                        onRefresh?.()
                        toast.success(cohort.isActive ? 'Cohort archived' : 'Cohort restored')
                      })
                    }
                  >
                    {cohort.isActive ? 'Archive' : 'Restore'}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="eval-card">
        <div className="eval-section-heading">
          <h3>Cohort Composition</h3>
          <p>Attach and remove test cases from a benchmark cohort.</p>
        </div>
        <div className="eval-form-grid eval-form-grid--compact">
          <select
            className="eval-select"
            value={compositionCohortId}
            onChange={(event) => setCompositionCohortId(event.target.value)}
          >
            <option value="">Select cohort</option>
            {benchmarkCohorts.map((cohort) => (
              <option key={cohort.cohortId} value={cohort.cohortId}>
                {cohort.name}
              </option>
            ))}
          </select>
        </div>
        {!compositionCohort ? (
          <div className="eval-empty">Select a cohort to manage its test-case membership.</div>
        ) : (
          <>
            <div className="eval-action-banner">
              <div>
                <strong>{compositionCohort.name}</strong>
                <p>
                  {compositionCohort.useCase} · {compositionCohort.testCaseIds.length} linked test
                  cases
                </p>
              </div>
              <button
                type="button"
                className="eval-refresh-button"
                onClick={() => onSelectCohort?.(compositionCohort.cohortId)}
              >
                Open in Benchmarks
              </button>
            </div>
            <div className="eval-list">
              {compositionTestCases.length === 0 ? (
                <div className="eval-empty">
                  No compatible test cases yet. Create one for one of this cohort&apos;s workflows
                  first.
                </div>
              ) : (
                compositionTestCases.map((testCase) => {
                  const attached = compositionCohort.testCaseIds.includes(testCase.testCaseId)
                  return (
                    <div key={testCase.testCaseId} className="eval-list-item">
                      <div>
                        <strong>{testCase.description ?? testCase.input.slice(0, 72)}</strong>
                        <p>
                          {testCase.workflowType} · min quality{' '}
                          {testCase.minQualityScore.toFixed(2)}
                        </p>
                      </div>
                      <div className="eval-inline-actions">
                        <span className={`eval-pill ${attached ? 'active' : 'neutral'}`}>
                          {attached ? 'attached' : 'available'}
                        </span>
                        <button
                          type="button"
                          className="eval-subtab"
                          onClick={() =>
                            void saveBenchmarkCohort({
                              ...compositionCohort,
                              createdAtMs: compositionCohort.createdAtMs,
                              testCaseIds: attached
                                ? compositionCohort.testCaseIds.filter(
                                    (id) => id !== testCase.testCaseId
                                  )
                                : [...compositionCohort.testCaseIds, testCase.testCaseId],
                            }).then(() => {
                              onRefresh?.()
                              toast.success(
                                attached
                                  ? 'Test case removed from cohort'
                                  : 'Test case added to cohort'
                              )
                            })
                          }
                        >
                          {attached ? 'Remove' : 'Attach'}
                        </button>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </>
        )}
      </section>

      <section className="eval-card">
        <div className="eval-section-heading">
          <h3>Capability Suite Review</h3>
          <p>
            Compose and review capability suites by task family, difficulty, and holdout coverage.
          </p>
        </div>
        <div className="eval-form-grid eval-form-grid--compact">
          <select
            className="eval-select"
            value={compositionSuiteId}
            onChange={(event) => setCompositionSuiteId(event.target.value)}
          >
            <option value="">Select capability suite</option>
            {capabilitySuites.map((suite) => (
              <option key={suite.suiteId} value={suite.suiteId}>
                {suite.name}
              </option>
            ))}
          </select>
        </div>
        {!compositionSuite ? (
          <div className="eval-empty">
            Select a capability suite to manage reasoning-family membership.
          </div>
        ) : (
          <>
            <div className="eval-card-grid">
              <article className="eval-stat-card">
                <span className="eval-stat-label">Linked test cases</span>
                <strong>{compositionSuite.testCaseIds.length}</strong>
              </article>
              <article className="eval-stat-card">
                <span className="eval-stat-label">Holdout cases</span>
                <strong>
                  {
                    suiteTestCases.filter(
                      (testCase) =>
                        compositionSuite.testCaseIds.includes(testCase.testCaseId) &&
                        testCase.isHoldout
                    ).length
                  }
                </strong>
              </article>
              <article className="eval-stat-card">
                <span className="eval-stat-label">Hard / frontier</span>
                <strong>
                  {
                    suiteTestCases.filter(
                      (testCase) =>
                        compositionSuite.testCaseIds.includes(testCase.testCaseId) &&
                        (testCase.difficulty === 'hard' || testCase.difficulty === 'frontier')
                    ).length
                  }
                </strong>
              </article>
              <article className="eval-stat-card">
                <span className="eval-stat-label">Candidate runs</span>
                <strong>{suiteRuns.length}</strong>
              </article>
            </div>
            <div className="eval-list">
              {suiteTestCases.length === 0 ? (
                <div className="eval-empty">No compatible capability-tagged test cases found.</div>
              ) : (
                suiteTestCases.map((testCase) => {
                  const attached = compositionSuite.testCaseIds.includes(testCase.testCaseId)
                  return (
                    <div key={testCase.testCaseId} className="eval-list-item">
                      <div>
                        <strong>{testCase.description ?? testCase.input.slice(0, 72)}</strong>
                        <p>
                          {testCase.taskFamily ?? 'unassigned'} · {testCase.difficulty ?? 'n/a'} ·{' '}
                          {testCase.isHoldout ? 'holdout' : 'in-sample'}
                        </p>
                      </div>
                      <div className="eval-inline-actions">
                        <span className={`eval-pill ${attached ? 'active' : 'neutral'}`}>
                          {attached ? 'attached' : 'available'}
                        </span>
                        <span className="eval-pill neutral">
                          family count {capabilityFamilyCounts.get(testCase.taskFamily ?? '') ?? 0}
                        </span>
                        <button
                          type="button"
                          className="eval-subtab"
                          onClick={() =>
                            setCapabilitySuiteDraft({
                              suiteId: compositionSuite.suiteId,
                              createdAtMs: compositionSuite.createdAtMs,
                              name: compositionSuite.name,
                              description: compositionSuite.description ?? '',
                              taskFamiliesText: compositionSuite.taskFamilies.join(', '),
                              sharedRubricId: compositionSuite.sharedRubricId ?? '',
                              isActive: compositionSuite.isActive,
                              testCaseIds: attached
                                ? compositionSuite.testCaseIds.filter(
                                    (id) => id !== testCase.testCaseId
                                  )
                                : [...compositionSuite.testCaseIds, testCase.testCaseId],
                            })
                          }
                        >
                          {attached ? 'Stage Remove' : 'Stage Add'}
                        </button>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
            <div className="eval-form-actions">
              <button
                type="button"
                className="eval-refresh-button"
                disabled={
                  submitting ||
                  !capabilitySuiteDraft.suiteId ||
                  capabilitySuiteDraft.suiteId !== compositionSuite.suiteId
                }
                onClick={() => void handleSaveCapabilitySuite()}
              >
                {submitting ? 'Saving...' : 'Save Suite Composition'}
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  )
}
