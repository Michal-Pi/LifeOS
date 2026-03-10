import type { BenchmarkSnapshot, BenchmarkWorkflowSnapshot } from '@/hooks/evaluationWorkspaceTypes'
import type { AutoAttachProposalFeedback } from '@/hooks/evaluationWorkspaceTypes'
import type {
  BenchmarkCohort,
  DerivedTestCase,
  EvalResult,
  RegressionTestResult,
  Run,
  SharedComparisonResult,
} from '@lifeos/agents'
import {
  average,
  blend,
  normalizeRange,
  parseFacetNumber,
} from '@/components/evaluation/benchmarkPolicy'

export function buildCompareFacetInsights(input: {
  leftFacetMap: Map<string, string>
  rightFacetMap: Map<string, string>
  leftWorkflowType?: string | null
  rightWorkflowType?: string | null
}) {
  const { leftFacetMap, rightFacetMap, leftWorkflowType, rightWorkflowType } = input
  const metrics = {
    quality: {
      left: parseFacetNumber(leftFacetMap.get('quality')),
      right: parseFacetNumber(rightFacetMap.get('quality')),
      higherIsBetter: true,
    },
    evidence: {
      left: blend([
        parseFacetNumber(leftFacetMap.get('sources')),
        parseFacetNumber(leftFacetMap.get('claims')),
        parseFacetNumber(leftFacetMap.get('contradictions')),
        parseFacetNumber(leftFacetMap.get('scenarios')),
      ]),
      right: blend([
        parseFacetNumber(rightFacetMap.get('sources')),
        parseFacetNumber(rightFacetMap.get('claims')),
        parseFacetNumber(rightFacetMap.get('contradictions')),
        parseFacetNumber(rightFacetMap.get('scenarios')),
      ]),
      higherIsBetter: true,
    },
    efficiency: {
      left: blend([
        parseFacetNumber(leftFacetMap.get('cost')),
        parseFacetNumber(leftFacetMap.get('steps')),
        parseFacetNumber(leftFacetMap.get('tools')),
        parseFacetNumber(leftFacetMap.get('routing')),
      ]),
      right: blend([
        parseFacetNumber(rightFacetMap.get('cost')),
        parseFacetNumber(rightFacetMap.get('steps')),
        parseFacetNumber(rightFacetMap.get('tools')),
        parseFacetNumber(rightFacetMap.get('routing')),
      ]),
      higherIsBetter: false,
    },
    substance: {
      left: parseFacetNumber(leftFacetMap.get('output')),
      right: parseFacetNumber(rightFacetMap.get('output')),
      higherIsBetter: true,
    },
  }

  const profiles = Object.entries(metrics).map(([key, metric]) => {
    const values = [metric.left, metric.right].filter((value): value is number => value !== null)
    const min = values.length ? Math.min(...values) : 0
    const max = values.length ? Math.max(...values) : 1
    return {
      key,
      label:
        key === 'quality'
          ? 'Quality'
          : key === 'evidence'
            ? 'Evidence density'
            : key === 'efficiency'
              ? 'Execution efficiency'
              : 'Output substance',
      leftScore: normalizeRange(metric.left, min, max, metric.higherIsBetter),
      rightScore: normalizeRange(metric.right, min, max, metric.higherIsBetter),
    }
  })

  const warnings: string[] = []
  const leftCost = parseFacetNumber(leftFacetMap.get('cost'))
  const rightCost = parseFacetNumber(rightFacetMap.get('cost'))
  const leftSteps = parseFacetNumber(leftFacetMap.get('steps'))
  const rightSteps = parseFacetNumber(rightFacetMap.get('steps'))
  const leftEvidence = blend([
    parseFacetNumber(leftFacetMap.get('sources')),
    parseFacetNumber(leftFacetMap.get('claims')),
  ])
  const rightEvidence = blend([
    parseFacetNumber(rightFacetMap.get('sources')),
    parseFacetNumber(rightFacetMap.get('claims')),
  ])
  const leftOutput = parseFacetNumber(leftFacetMap.get('output'))
  const rightOutput = parseFacetNumber(rightFacetMap.get('output'))

  if (leftCost !== null && rightCost !== null && leftCost > rightCost * 1.5) {
    warnings.push(
      `${leftWorkflowType ?? 'Left'} is materially more expensive than ${rightWorkflowType ?? 'right'}.`
    )
  }
  if (rightCost !== null && leftCost !== null && rightCost > leftCost * 1.5) {
    warnings.push(
      `${rightWorkflowType ?? 'Right'} is materially more expensive than ${leftWorkflowType ?? 'left'}.`
    )
  }
  if (leftSteps !== null && rightSteps !== null && leftSteps > rightSteps * 1.5) {
    warnings.push(`${leftWorkflowType ?? 'Left'} is structurally heavier in step count.`)
  }
  if (rightSteps !== null && leftSteps !== null && rightSteps > leftSteps * 1.5) {
    warnings.push(`${rightWorkflowType ?? 'Right'} is structurally heavier in step count.`)
  }
  if (leftEvidence !== null && leftEvidence < 1 && (leftOutput ?? 0) > 800) {
    warnings.push(
      `${leftWorkflowType ?? 'Left'} produced substantial output with thin evidence/claim density.`
    )
  }
  if (rightEvidence !== null && rightEvidence < 1 && (rightOutput ?? 0) > 800) {
    warnings.push(
      `${rightWorkflowType ?? 'Right'} produced substantial output with thin evidence/claim density.`
    )
  }

  return { profiles, warnings }
}

export function buildProposalFeedbackMap(
  autoAttachProposalFeedback: AutoAttachProposalFeedback[],
  cohortId?: string | null
) {
  const next = new Map<string, AutoAttachProposalFeedback>()
  for (const item of autoAttachProposalFeedback) {
    if (item.cohortId !== cohortId) continue
    const key = `${item.testCaseId}::${item.runId}`
    const existing = next.get(key)
    if (!existing || item.updatedAtMs > existing.updatedAtMs) {
      next.set(key, item)
    }
  }
  return next
}

export function buildApprovedWorkflowCounts(
  proposalFeedbackMap: Map<string, AutoAttachProposalFeedback>,
  runMap: Map<string, Run>
) {
  const next = new Map<string, number>()
  for (const feedback of proposalFeedbackMap.values()) {
    if (feedback.disposition !== 'approved') continue
    const run = runMap.get(feedback.runId)
    if (!run?.workflowType) continue
    next.set(run.workflowType, (next.get(run.workflowType) ?? 0) + 1)
  }
  return next
}

export function buildApprovedPatternCounts(
  proposalFeedbackMap: Map<string, AutoAttachProposalFeedback>,
  runMap: Map<string, Run>,
  testCaseMap: Map<string, DerivedTestCase>
) {
  const next = new Map<string, number>()
  for (const feedback of proposalFeedbackMap.values()) {
    if (feedback.disposition !== 'approved') continue
    const run = runMap.get(feedback.runId)
    const testCase = testCaseMap.get(feedback.testCaseId)
    if (!run?.workflowType || !testCase?.workflowType) continue
    const key = `${testCase.workflowType}::${run.workflowType}`
    next.set(key, (next.get(key) ?? 0) + 1)
  }
  return next
}

export function buildWorkflowSummary(input: {
  benchmarkRunAssignments: Array<{ cohortId: string; testCaseId: string; runId: string }>
  selectedCohortId?: string | null
  decisionsByTestCase: Map<string, { winnerRunId?: string }>
  regressionMap: Map<string, RegressionTestResult>
  runMap: Map<string, Run>
}) {
  const { benchmarkRunAssignments, selectedCohortId, decisionsByTestCase, regressionMap, runMap } =
    input
  const summary = new Map<string, { total: number; passed: number; winners: number }>()
  for (const assignment of benchmarkRunAssignments) {
    if (assignment.cohortId !== selectedCohortId) continue
    const run = runMap.get(assignment.runId)
    if (!run) continue
    const key = run.workflowType
    const current = summary.get(key) ?? { total: 0, passed: 0, winners: 0 }
    current.total += 1
    const regression = regressionMap.get(`${assignment.testCaseId}::${assignment.runId}`)
    if (regression?.passed) current.passed += 1
    if (decisionsByTestCase.get(assignment.testCaseId)?.winnerRunId === assignment.runId) {
      current.winners += 1
    }
    summary.set(key, current)
  }
  return Array.from(summary.entries()).map(([workflowType, stats]) => ({
    workflowType,
    ...stats,
    passRate: stats.total > 0 ? stats.passed / stats.total : 0,
  }))
}

export function buildWorkflowTrendSummary(input: {
  regressionResults: RegressionTestResult[]
  runMap: Map<string, Run>
  selectedCohort: BenchmarkCohort | null
}) {
  const { regressionResults, runMap, selectedCohort } = input
  const now = Date.now()
  const currentWindowStart = now - 30 * 24 * 60 * 60 * 1000
  const previousWindowStart = now - 60 * 24 * 60 * 60 * 1000
  const summary = new Map<
    string,
    {
      currentScores: number[]
      previousScores: number[]
      regressions: number
    }
  >()

  for (const result of regressionResults) {
    const run = runMap.get(result.runId)
    if (!run || !selectedCohort?.workflowTypes.includes(run.workflowType)) continue
    const bucket = summary.get(run.workflowType) ?? {
      currentScores: [],
      previousScores: [],
      regressions: 0,
    }
    if (result.executedAtMs >= currentWindowStart) {
      bucket.currentScores.push(result.qualityScore)
    } else if (result.executedAtMs >= previousWindowStart) {
      bucket.previousScores.push(result.qualityScore)
    }
    summary.set(run.workflowType, bucket)
  }

  for (const testCaseId of selectedCohort?.testCaseIds ?? []) {
    const testCaseHistory = regressionResults
      .filter((result) => result.testCaseId === testCaseId)
      .sort((left, right) => right.executedAtMs - left.executedAtMs)
    const latest = testCaseHistory[0]
    const bestThisMonth = testCaseHistory
      .filter((result) => result.executedAtMs >= currentWindowStart)
      .sort((left, right) => right.qualityScore - left.qualityScore)[0]
    if (latest && bestThisMonth && latest.qualityScore + 0.05 < bestThisMonth.qualityScore) {
      const run = runMap.get(latest.runId)
      if (!run) continue
      const bucket = summary.get(run.workflowType) ?? {
        currentScores: [],
        previousScores: [],
        regressions: 0,
      }
      bucket.regressions += 1
      summary.set(run.workflowType, bucket)
    }
  }

  return Array.from(summary.entries()).map(([workflowType, data]) => {
    const currentAverage = average(data.currentScores)
    const previousAverage = average(data.previousScores)
    return {
      workflowType,
      currentAverage,
      previousAverage,
      delta:
        currentAverage !== null && previousAverage !== null
          ? currentAverage - previousAverage
          : null,
      regressions: data.regressions,
    }
  })
}

export function buildCohortFacetSummary(input: {
  benchmarkRunAssignments: Array<{ cohortId: string; runId: string }>
  selectedCohortId?: string | null
  resultMap: Map<string, EvalResult>
  runMap: Map<string, Run>
  traceMap: Map<string, { steps: Array<{ toolCalls: unknown[]; routerDecisions: unknown[] }> }>
}) {
  const { benchmarkRunAssignments, selectedCohortId, resultMap, runMap, traceMap } = input
  const summary = new Map<
    string,
    {
      runs: number
      quality: number[]
      steps: number[]
      costs: number[]
      tools: number[]
      routing: number[]
    }
  >()

  for (const assignment of benchmarkRunAssignments) {
    if (assignment.cohortId !== selectedCohortId) continue
    const run = runMap.get(assignment.runId)
    if (!run) continue
    const trace = traceMap.get(run.runId)
    const bucket = summary.get(run.workflowType) ?? {
      runs: 0,
      quality: [],
      steps: [],
      costs: [],
      tools: [],
      routing: [],
    }
    bucket.runs += 1
    const result = resultMap.get(run.runId)
    if (typeof result?.aggregateScore === 'number') bucket.quality.push(result.aggregateScore)
    bucket.steps.push(trace?.steps.length ?? run.currentStep ?? 0)
    bucket.costs.push(run.estimatedCost ?? 0)
    bucket.tools.push(trace?.steps.reduce((total, step) => total + step.toolCalls.length, 0) ?? 0)
    bucket.routing.push(
      trace?.steps.reduce((total, step) => total + step.routerDecisions.length, 0) ?? 0
    )
    summary.set(run.workflowType, bucket)
  }

  return Array.from(summary.entries()).map(([workflowType, bucket]) => ({
    workflowType,
    runs: bucket.runs,
    avgQuality: average(bucket.quality),
    avgSteps: average(bucket.steps),
    avgCost: average(bucket.costs),
    avgTools: average(bucket.tools),
    avgRouting: average(bucket.routing),
  }))
}

export function buildCohortFacetProfiles(cohortFacetSummary: BenchmarkWorkflowSnapshot[]) {
  if (cohortFacetSummary.length === 0) return []
  const ranges = {
    quality: cohortFacetSummary
      .map((item) => item.avgQuality)
      .filter((value): value is number => value !== null),
    steps: cohortFacetSummary
      .map((item) => item.avgSteps)
      .filter((value): value is number => value !== null),
    cost: cohortFacetSummary
      .map((item) => item.avgCost)
      .filter((value): value is number => value !== null),
    tools: cohortFacetSummary
      .map((item) => item.avgTools)
      .filter((value): value is number => value !== null),
    routing: cohortFacetSummary
      .map((item) => item.avgRouting)
      .filter((value): value is number => value !== null),
  }
  const minMax = (values: number[]) => ({
    min: values.length ? Math.min(...values) : 0,
    max: values.length ? Math.max(...values) : 1,
  })
  const qualityRange = minMax(ranges.quality)
  const stepsRange = minMax(ranges.steps)
  const costRange = minMax(ranges.cost)
  const toolsRange = minMax(ranges.tools)
  const routingRange = minMax(ranges.routing)

  return cohortFacetSummary.map((item) => ({
    workflowType: item.workflowType,
    runs: item.runs,
    qualityScore: normalizeRange(item.avgQuality, qualityRange.min, qualityRange.max, true),
    efficiencyScore: blend([
      normalizeRange(item.avgCost, costRange.min, costRange.max, false),
      normalizeRange(item.avgSteps, stepsRange.min, stepsRange.max, false),
      normalizeRange(item.avgTools, toolsRange.min, toolsRange.max, false),
      normalizeRange(item.avgRouting, routingRange.min, routingRange.max, false),
    ]),
    warnings: [
      item.avgCost !== null && item.avgCost === costRange.max && costRange.max > costRange.min
        ? 'Highest average cost in cohort'
        : null,
      item.avgSteps !== null && item.avgSteps === stepsRange.max && stepsRange.max > stepsRange.min
        ? 'Highest average step count in cohort'
        : null,
    ].filter((warning): warning is string => Boolean(warning)),
  }))
}

export function buildSnapshotDiffs(selectedCohortSnapshots: BenchmarkSnapshot[]) {
  return selectedCohortSnapshots.map((snapshot, index) => {
    const previous = selectedCohortSnapshots[index + 1] ?? null
    const previousMap = new Map(previous?.summary.map((item) => [item.workflowType, item]) ?? [])
    const workflowDiffs = snapshot.summary.map((current) => {
      const prior = previousMap.get(current.workflowType)
      const qualityDelta =
        typeof current.qualityScore === 'number' && typeof prior?.qualityScore === 'number'
          ? current.qualityScore - prior.qualityScore
          : null
      const efficiencyDelta =
        typeof current.efficiencyScore === 'number' && typeof prior?.efficiencyScore === 'number'
          ? current.efficiencyScore - prior.efficiencyScore
          : null
      const costDelta =
        typeof current.avgCost === 'number' && typeof prior?.avgCost === 'number'
          ? current.avgCost - prior.avgCost
          : null
      const stepsDelta =
        typeof current.avgSteps === 'number' && typeof prior?.avgSteps === 'number'
          ? current.avgSteps - prior.avgSteps
          : null
      const warnings = [
        typeof qualityDelta === 'number' && qualityDelta < -0.08 ? 'quality regressed' : null,
        typeof efficiencyDelta === 'number' && efficiencyDelta < -0.08
          ? 'efficiency regressed'
          : null,
        typeof costDelta === 'number' && costDelta > 0.05 ? 'cost increased' : null,
        typeof stepsDelta === 'number' && stepsDelta > 1 ? 'step count increased' : null,
      ].filter((warning): warning is string => Boolean(warning))

      return {
        workflowType: current.workflowType,
        qualityDelta,
        efficiencyDelta,
        costDelta,
        stepsDelta,
        warnings,
      }
    })

    return {
      snapshot,
      previous,
      workflowDiffs,
    }
  })
}

export function orderTestCasesByRegressionRisk(
  selectedCohort: BenchmarkCohort | null,
  regressionResults: RegressionTestResult[]
) {
  if (!selectedCohort) return []
  const monthAgo = Date.now() - 30 * 24 * 60 * 60 * 1000
  return [...selectedCohort.testCaseIds].sort((leftId, rightId) => {
    const leftHistory = regressionResults
      .filter((result) => result.testCaseId === leftId)
      .sort((left, right) => right.executedAtMs - left.executedAtMs)
    const rightHistory = regressionResults
      .filter((result) => result.testCaseId === rightId)
      .sort((left, right) => right.executedAtMs - left.executedAtMs)

    const leftLatest = leftHistory[0] ?? null
    const rightLatest = rightHistory[0] ?? null
    const leftBest =
      leftHistory
        .filter((result) => result.executedAtMs >= monthAgo)
        .sort((left, right) => right.qualityScore - left.qualityScore)[0] ?? null
    const rightBest =
      rightHistory
        .filter((result) => result.executedAtMs >= monthAgo)
        .sort((left, right) => right.qualityScore - left.qualityScore)[0] ?? null

    const leftRegression = Boolean(
      leftLatest && leftBest && leftLatest.qualityScore + 0.05 < leftBest.qualityScore
    )
    const rightRegression = Boolean(
      rightLatest && rightBest && rightLatest.qualityScore + 0.05 < rightBest.qualityScore
    )

    if (leftRegression !== rightRegression) return leftRegression ? -1 : 1
    return (rightLatest?.executedAtMs ?? 0) - (leftLatest?.executedAtMs ?? 0)
  })
}

export function buildCohortResults(
  cohortRuns: Run[],
  sharedMap: Map<string, SharedComparisonResult>,
  resultMap: Map<string, EvalResult>
) {
  return cohortRuns
    .map((run) => {
      const shared = sharedMap.get(run.runId)
      const native = resultMap.get(run.runId)
      return {
        run,
        score: shared?.aggregateScore ?? native?.aggregateScore ?? null,
      }
    })
    .sort((left, right) => (right.score ?? -1) - (left.score ?? -1))
}
