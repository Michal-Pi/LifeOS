import { useMemo } from 'react'
import type {
  BenchmarkCohort,
  CapabilitySuite,
  DerivedTestCase,
  DriftAlert,
  EvalResult,
  Experiment,
  PromptVariant,
  Run,
} from '@lifeos/agents'
import {
  getWorkflowEvalAdapter,
  type WorkflowMetricCard,
  type WorkflowSummarySnapshot,
} from '@/components/evaluation/workflowEvalAdapters'
import { buildAgentPerformanceSummaries } from '@/components/evaluation/agentEvalPolicy'
import type {
  AgentEvalRecord,
  AgentExperimentRun,
  CapabilityRunRecord,
} from '@/hooks/evaluationWorkspaceTypes'

export type WorkflowDashboardCard = WorkflowSummarySnapshot & {
  latestRun: Run | null
  latestResult: EvalResult | null
  metrics: WorkflowMetricCard[]
}

export interface EvaluationAttentionItem {
  id: string
  kind:
    | 'drift'
    | 'experiment'
    | 'run_failure'
    | 'score_regression'
    | 'high_disagreement'
    | 'holdout_gap'
    | 'capability_gap'
  workflowType: string
  title: string
  detail: string
  severity:
    | 'neutral'
    | 'warning'
    | 'critical'
    | 'active'
    | 'running'
    | 'completed'
    | 'draft'
    | 'archived'
}

export function useEvaluationDashboard(input: {
  results: EvalResult[]
  recentRuns: Run[]
  testCases: DerivedTestCase[]
  capabilitySuites: CapabilitySuite[]
  capabilityRunRecords: CapabilityRunRecord[]
  driftAlerts: DriftAlert[]
  experiments: Experiment[]
  promptVariants: PromptVariant[]
  benchmarkCohorts: BenchmarkCohort[]
  agentEvalRecords: AgentEvalRecord[]
  agentExperimentRuns: AgentExperimentRun[]
}) {
  return useMemo(() => {
    const {
      results,
      recentRuns,
      testCases,
      capabilitySuites,
      capabilityRunRecords,
      driftAlerts,
      experiments,
      promptVariants,
      benchmarkCohorts,
      agentEvalRecords,
      agentExperimentRuns,
    } = input
    const activeRuns = recentRuns.filter((run) =>
      ['pending', 'queued', 'running', 'paused', 'waiting_for_input'].includes(run.status)
    )
    const completedRuns = recentRuns.filter((run) => run.status === 'completed')
    const successfulRuns = recentRuns.filter((run) => run.status === 'completed')
    const highVarianceResults = results.filter(
      (result) => typeof result.scoreVariance === 'number' && result.scoreVariance >= 0.15
    )
    const requiresHumanReviewResults = results.filter((result) => result.requiresHumanReview)
    const _holdoutCases = testCases.filter((testCase) => testCase.isHoldout)
    const _hardCases = testCases.filter(
      (testCase) => testCase.difficulty === 'hard' || testCase.difficulty === 'frontier'
    )
    const capabilityFamilyCounts = new Map<string, number>()
    capabilityRunRecords.forEach((record) => {
      if (record.taskFamily) {
        capabilityFamilyCounts.set(
          record.taskFamily,
          (capabilityFamilyCounts.get(record.taskFamily) ?? 0) + 1
        )
      }
    })
    const averageJudgedQuality =
      results.length > 0
        ? results.reduce((sum, result) => sum + result.aggregateScore, 0) / results.length
        : null
    const agentCards = buildAgentPerformanceSummaries({
      agentEvalRecords,
      experiments,
      agentExperimentRuns,
    })

    const workflowMap = new Map<string, WorkflowSummarySnapshot>()
    recentRuns.forEach((run) => {
      const key = run.workflowType ?? 'unknown'
      const current = workflowMap.get(key) ?? {
        workflowType: key,
        runCount: 0,
        activeRuns: 0,
        successRate: 0,
        averageCost: 0,
        averageScore: null,
        averageVariance: null,
        humanReviewRate: 0,
        holdoutRunCount: 0,
        hardRunCount: 0,
        capabilityFamilies: [],
      }
      current.runCount += 1
      if (['pending', 'queued', 'running', 'paused', 'waiting_for_input'].includes(run.status)) {
        current.activeRuns += 1
      }
      current.averageCost += run.estimatedCost ?? 0
      workflowMap.set(key, current)
    })

    const resultsByRun = new Map(results.map((result) => [result.runId, result.aggregateScore]))
    const resultDetailsByRun = new Map(results.map((result) => [result.runId, result]))
    const latestResultsByWorkflow = new Map<string, EvalResult>()
    const workflowTestCases = new Map<string, DerivedTestCase[]>()
    testCases.forEach((testCase) => {
      const key = testCase.workflowType ?? 'unknown'
      const list = workflowTestCases.get(key) ?? []
      list.push(testCase)
      workflowTestCases.set(key, list)
    })
    for (const result of results) {
      const run = recentRuns.find((candidate) => candidate.runId === result.runId)
      const workflowType = run?.workflowType ?? 'unknown'
      const existing = latestResultsByWorkflow.get(workflowType)
      if (!existing || result.createdAtMs > existing.createdAtMs) {
        latestResultsByWorkflow.set(workflowType, result)
      }
    }

    workflowMap.forEach((summary, workflowType) => {
      const workflowRuns = recentRuns.filter(
        (run) => (run.workflowType ?? 'unknown') === workflowType
      )
      const completed = workflowRuns.filter((run) => run.status === 'completed')
      const scoredRuns = workflowRuns
        .map((run) => resultsByRun.get(run.runId))
        .filter((score): score is number => typeof score === 'number')
      const workflowResults = workflowRuns
        .map((run) => resultDetailsByRun.get(run.runId))
        .filter((result): result is EvalResult => Boolean(result))
      const _workflowCases = workflowTestCases.get(workflowType) ?? []
      const workflowCapabilityRecords = capabilityRunRecords.filter((record) => {
        const run = recentRuns.find((candidate) => candidate.runId === record.runId)
        return (run?.workflowType ?? 'unknown') === workflowType
      })
      const capabilityFamilies = new Set(
        workflowCapabilityRecords
          .map((record) => record.taskFamily)
          .filter((family): family is string => Boolean(family))
      )

      summary.successRate = workflowRuns.length > 0 ? completed.length / workflowRuns.length : 0
      summary.averageCost = workflowRuns.length > 0 ? summary.averageCost / workflowRuns.length : 0
      summary.averageScore =
        scoredRuns.length > 0
          ? scoredRuns.reduce((sum, score) => sum + score, 0) / scoredRuns.length
          : null
      summary.averageVariance =
        workflowResults.length > 0
          ? workflowResults.reduce((sum, result) => sum + (result.scoreVariance ?? 0), 0) /
            workflowResults.length
          : null
      summary.humanReviewRate =
        workflowResults.length > 0
          ? workflowResults.filter((result) => result.requiresHumanReview).length /
            workflowResults.length
          : 0
      summary.holdoutRunCount = workflowCapabilityRecords.filter(
        (record) => record.isHoldout
      ).length
      summary.hardRunCount = workflowCapabilityRecords.filter(
        (record) => record.difficulty === 'hard' || record.difficulty === 'frontier'
      ).length
      summary.capabilityFamilies = Array.from(capabilityFamilies).sort()
    })

    const workflowCards: WorkflowDashboardCard[] = [...workflowMap.values()]
      .sort((left, right) => left.workflowType.localeCompare(right.workflowType))
      .map((summary) => {
        const workflowRuns = recentRuns.filter(
          (run) => (run.workflowType ?? 'unknown') === summary.workflowType
        )
        const latestRun = workflowRuns[0] ?? null
        const latestResult = latestResultsByWorkflow.get(summary.workflowType) ?? null
        const adapter = getWorkflowEvalAdapter(
          summary.workflowType,
          latestRun?.workflowState ?? null
        )
        return {
          ...summary,
          latestRun,
          latestResult,
          metrics: adapter.buildOverviewMetrics({
            workflowType: summary.workflowType,
            summary,
            recentRuns: workflowRuns,
            run: latestRun,
            workflowState: latestRun?.workflowState ?? null,
            result: latestResult,
          }),
        }
      })

    const attentionItems: EvaluationAttentionItem[] = [
      ...driftAlerts.slice(0, 4).map((alert) => ({
        id: `drift:${alert.alertId}`,
        kind: 'drift' as const,
        workflowType: alert.workflowType,
        title: `${alert.workflowType} drift alert`,
        detail:
          alert.metricDescription ??
          `${alert.metric} ${alert.direction} ${Math.abs(alert.percentChange).toFixed(1)}%`,
        severity: alert.severity,
      })),
      ...experiments.slice(0, 2).map((experiment) => ({
        id: `experiment:${experiment.experimentId}`,
        kind: 'experiment' as const,
        workflowType: experiment.workflowType ?? 'unknown',
        title: experiment.name,
        detail: `Experiment ${experiment.status} for ${experiment.workflowType ?? 'unknown'}`,
        severity: experiment.status === 'running' ? 'running' : 'neutral',
      })),
      ...recentRuns
        .filter((run) => run.status === 'failed')
        .slice(0, 3)
        .map((run) => ({
          id: `run_failure:${run.runId}`,
          kind: 'run_failure' as const,
          workflowType: run.workflowType ?? 'unknown',
          title: `${run.workflowType ?? 'unknown'} run failed`,
          detail: run.error ?? 'Run failed',
          severity: 'critical' as const,
        })),
      ...workflowCards
        .filter((card) => card.averageScore !== null && card.averageScore < 0.65)
        .slice(0, 3)
        .map((card) => ({
          id: `score_regression:${card.workflowType}`,
          kind: 'score_regression' as const,
          workflowType: card.workflowType,
          title: `${card.workflowType} quality below target`,
          detail: `Average judged quality is ${card.averageScore?.toFixed(2)} across ${card.runCount} runs.`,
          severity: 'warning' as const,
        })),
      ...highVarianceResults.slice(0, 3).map((result) => ({
        id: `variance:${result.evalResultId}`,
        kind: 'high_disagreement' as const,
        workflowType:
          recentRuns.find((run) => run.runId === result.runId)?.workflowType ?? 'unknown',
        title: 'Judge disagreement requires review',
        detail: `Variance ${result.scoreVariance?.toFixed(2) ?? 'n/a'} on run ${result.runId.slice(0, 8)}.`,
        severity: 'warning' as const,
      })),
      ...(capabilityRunRecords.filter((record) => record.isHoldout).length === 0
        ? [
            {
              id: 'holdout:missing',
              kind: 'holdout_gap' as const,
              workflowType: 'shared',
              title: 'No holdout evaluation cases',
              detail:
                'Record holdout capability executions to measure generalization instead of only replay quality.',
              severity: 'warning' as const,
            },
          ]
        : []),
      ...(capabilitySuites.length === 0
        ? [
            {
              id: 'capability:missing',
              kind: 'capability_gap' as const,
              workflowType: 'shared',
              title: 'No capability suites defined',
              detail:
                'Create capability suites to evaluate reasoning families beyond workflow-specific regressions.',
              severity: 'warning' as const,
            },
          ]
        : []),
      ...agentCards
        .filter(
          (card) => typeof card.recentScoreDelta === 'number' && card.recentScoreDelta <= -0.12
        )
        .slice(0, 3)
        .map((card) => ({
          id: `agent_drift:${card.agentId}`,
          kind: 'score_regression' as const,
          workflowType: card.workflows[0] ?? 'shared',
          title: `${card.agentName} regressed`,
          detail: `Recent automatic step score delta ${card.recentScoreDelta?.toFixed(2)} across ${card.observations} observations.`,
          severity: 'warning' as const,
        })),
      ...agentCards
        .filter((card) => card.reviewRate >= 0.35)
        .slice(0, 2)
        .map((card) => ({
          id: `agent_review:${card.agentId}`,
          kind: 'high_disagreement' as const,
          workflowType: card.workflows[0] ?? 'shared',
          title: `${card.agentName} needs review`,
          detail: `${Math.round(card.reviewRate * 100)}% of saved step evals are flagged for review.`,
          severity: 'warning' as const,
        })),
    ]

    return {
      global: {
        completedRuns: completedRuns.length,
        activeRuns: activeRuns.length,
        averageJudgedQuality,
        successRate: recentRuns.length > 0 ? successfulRuns.length / recentRuns.length : 0,
        averageCost:
          recentRuns.length > 0
            ? recentRuns.reduce((sum, run) => sum + (run.estimatedCost ?? 0), 0) / recentRuns.length
            : 0,
        activeDriftAlerts: driftAlerts.filter((alert) => alert.status === 'active').length,
        requiresHumanReview: requiresHumanReviewResults.length,
        highDisagreementResults: highVarianceResults.length,
        holdoutCases: capabilityRunRecords.filter((record) => record.isHoldout).length,
        hardCases: capabilityRunRecords.filter(
          (record) => record.difficulty === 'hard' || record.difficulty === 'frontier'
        ).length,
        activeCapabilitySuites: capabilitySuites.filter((suite) => suite.isActive).length,
        capabilityFamilyCoverage: capabilityFamilyCounts.size,
        trackedAgents: agentCards.length,
      },
      workflowCards,
      agentCards: agentCards.slice(0, 8),
      recentResults: results.slice(0, 10),
      driftAlerts: driftAlerts.slice(0, 8),
      experiments: experiments.slice(0, 8),
      promptVariants: promptVariants.slice(0, 20),
      benchmarkCohorts: benchmarkCohorts.slice(0, 8),
      capabilitySuites: capabilitySuites.slice(0, 8),
      capabilityFamilyCoverage: Array.from(capabilityFamilyCounts.entries())
        .sort((left, right) => right[1] - left[1])
        .slice(0, 8),
      attentionItems,
    }
  }, [input])
}
