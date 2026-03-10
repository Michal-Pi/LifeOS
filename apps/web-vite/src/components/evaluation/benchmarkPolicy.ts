import type { DerivedTestCase, EvalResult, Run } from '@lifeos/agents'
import type { AutoAttachProposalFeedback } from '@/hooks/evaluationWorkspaceTypes'

export interface BenchmarkTraceStepLike {
  toolCalls: Array<{ toolName: string }>
  routerDecisions: Array<{ chosenPath: string }>
}

export interface BenchmarkTraceLike {
  steps: BenchmarkTraceStepLike[]
}

export interface BenchmarkAssignmentEvaluation {
  passed: boolean
  failures: string[]
  qualityScore: number | null
  stepCount: number
  durationSec: number | null
  outputSimilarity: number | null
  outputMatched: boolean
  toolCallsMatched: boolean
  missingTools: string[]
  extraTools: string[]
  routerDecisionsMatched: boolean
  missingRouterDecisions: Array<{ step: number; chosenPath: string }>
  actualRouterChoices: string[]
}

export interface SuggestedCandidate {
  run: Run
  score: number
  reasons: string[]
}

function toTokenSet(value: string | undefined) {
  return new Set(
    (value ?? '')
      .toLowerCase()
      .split(/\W+/)
      .map((token) => token.trim())
      .filter((token) => token.length > 2)
  )
}

export function lexicalSimilarity(left: string | undefined, right: string | undefined) {
  const leftTokens = toTokenSet(left)
  const rightTokens = toTokenSet(right)
  if (leftTokens.size === 0 || rightTokens.size === 0) return null
  let overlap = 0
  for (const token of leftTokens) {
    if (rightTokens.has(token)) overlap += 1
  }
  return overlap / new Set([...leftTokens, ...rightTokens]).size
}

export function average(values: number[]) {
  return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : null
}

export function parseFacetNumber(value: string | undefined): number | null {
  if (!value || value === 'n/a') return null
  const cleaned = value.replace(/[$,%]/g, '').trim()
  const parsed = Number(cleaned)
  return Number.isFinite(parsed) ? parsed : null
}

export function normalizeRange(
  value: number | null,
  min: number,
  max: number,
  higherIsBetter: boolean
): number | null {
  if (value === null) return null
  if (max <= min) return 0.5
  const normalized = (value - min) / (max - min)
  const bounded = Math.max(0, Math.min(1, normalized))
  return higherIsBetter ? bounded : 1 - bounded
}

export function blend(values: Array<number | null>): number | null {
  const present = values.filter((value): value is number => typeof value === 'number')
  return present.length > 0 ? present.reduce((sum, value) => sum + value, 0) / present.length : null
}

export function evaluateBenchmarkAssignment(
  run: Run,
  testCase: DerivedTestCase,
  result: EvalResult | null | undefined,
  trace: BenchmarkTraceLike | null | undefined
): BenchmarkAssignmentEvaluation {
  const qualityScore = result?.aggregateScore ?? null
  const stepCount = trace?.steps.length ?? run.currentStep ?? 0
  const durationSec =
    run.completedAtMs && run.startedAtMs
      ? Math.round((run.completedAtMs - run.startedAtMs) / 1000)
      : null
  const outputSimilarity = lexicalSimilarity(run.output, testCase.expectedOutput)
  const failures: string[] = []
  const actualTools = trace
    ? Array.from(
        new Set(trace.steps.flatMap((step) => step.toolCalls.map((tool) => tool.toolName)))
      )
    : []
  const missingTools = (testCase.expectedToolCalls ?? []).filter(
    (tool) => !actualTools.includes(tool)
  )
  const extraTools = actualTools.filter(
    (tool) => !(testCase.expectedToolCalls ?? []).includes(tool)
  )
  const actualRouterChoices = trace
    ? trace.steps.flatMap((step) => step.routerDecisions.map((decision) => decision.chosenPath))
    : []
  const missingRouterDecisions =
    testCase.expectedRouterDecisions?.filter((decision) => {
      const step = trace?.steps[decision.step]
      return !step?.routerDecisions.some(
        (routerDecision) => routerDecision.chosenPath === decision.chosenPath
      )
    }) ?? []
  const routerMatched = !testCase.expectedRouterDecisions || missingRouterDecisions.length === 0

  if (qualityScore !== null && qualityScore < testCase.minQualityScore) failures.push('quality')
  if (stepCount > testCase.maxSteps) failures.push('steps')
  if ((run.estimatedCost ?? 0) > testCase.maxCost) failures.push('cost')
  if (
    typeof testCase.maxDurationMs === 'number' &&
    typeof durationSec === 'number' &&
    durationSec * 1000 > testCase.maxDurationMs
  ) {
    failures.push('duration')
  }
  if (testCase.expectedOutput && outputSimilarity !== null && outputSimilarity < 0.18) {
    failures.push('output')
  }
  if (testCase.expectedToolCalls?.length && missingTools.length > 0) failures.push('tools')
  if (testCase.expectedRouterDecisions?.length && !routerMatched) failures.push('routing')

  return {
    passed: failures.length === 0,
    failures,
    qualityScore,
    stepCount,
    durationSec,
    outputSimilarity,
    outputMatched: testCase.expectedOutput ? (outputSimilarity ?? 0) >= 0.18 : Boolean(run.output),
    toolCallsMatched: missingTools.length === 0,
    missingTools,
    extraTools,
    routerDecisionsMatched: routerMatched,
    missingRouterDecisions,
    actualRouterChoices,
  }
}

export function suggestRunForTestCase(input: {
  testCase: DerivedTestCase
  cohortRuns: Run[]
  assignedRunIds: string[]
  resultMap: Map<string, EvalResult>
  proposalFeedbackMap: Map<string, AutoAttachProposalFeedback>
  approvedWorkflowCounts: Map<string, number>
  approvedPatternCounts: Map<string, number>
  workflowUsage?: Map<string, number>
}): SuggestedCandidate | null {
  const {
    testCase,
    cohortRuns,
    assignedRunIds,
    resultMap,
    proposalFeedbackMap,
    approvedWorkflowCounts,
    approvedPatternCounts,
    workflowUsage = new Map(),
  } = input

  const queryWords = new Set(
    `${testCase.description ?? ''} ${testCase.input}`
      .toLowerCase()
      .split(/\W+/)
      .filter((word) => word.length > 3)
  )

  const candidates = cohortRuns
    .filter((run) => !assignedRunIds.includes(run.runId))
    .filter((run) => {
      const feedback = proposalFeedbackMap.get(`${testCase.testCaseId}::${run.runId}`)
      return feedback?.disposition !== 'rejected'
    })
    .map((run) => {
      const runWords = new Set(
        run.goal
          .toLowerCase()
          .split(/\W+/)
          .filter((word) => word.length > 3)
      )
      const reasons: string[] = []
      let overlap = 0
      for (const word of queryWords) {
        if (runWords.has(word)) overlap += 1
      }
      if (overlap > 0) reasons.push(`goal overlap ${overlap}`)
      if (run.runId === testCase.sourceRunId) {
        overlap += 4
        reasons.push('source-run match')
      }
      if (run.workflowType === testCase.workflowType) {
        overlap += 2
        reasons.push('workflow-type match')
      }
      const recencyBoost = run.startedAtMs
        ? Math.max(0, 2 - (Date.now() - run.startedAtMs) / (14 * 24 * 60 * 60 * 1000))
        : 0
      if (recencyBoost > 0.2) reasons.push('recent run')
      const resultScore = resultMap.get(run.runId)?.aggregateScore ?? 0
      if (resultScore > 0) reasons.push(`judged quality ${resultScore.toFixed(2)}`)
      const approvalBias = (approvedWorkflowCounts.get(run.workflowType) ?? 0) * 1.25
      if (approvalBias > 0) {
        reasons.push(`approved workflow prior x${approvedWorkflowCounts.get(run.workflowType)}`)
      }
      const patternKey = `${testCase.workflowType}::${run.workflowType}`
      const patternBias = (approvedPatternCounts.get(patternKey) ?? 0) * 1.5
      if (patternBias > 0) {
        reasons.push(`approved pattern prior x${approvedPatternCounts.get(patternKey)}`)
      }
      const diversityPenalty = (workflowUsage.get(run.workflowType) ?? 0) * 1.5
      if (diversityPenalty > 0) reasons.push(`diversity penalty -${diversityPenalty.toFixed(1)}`)
      const score =
        overlap + recencyBoost + resultScore * 3 + approvalBias + patternBias - diversityPenalty
      return { run, score, reasons }
    })
    .sort((left, right) => right.score - left.score)

  return candidates[0] ?? null
}
