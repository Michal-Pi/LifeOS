import type { EvalResult, Experiment, PromptVariant, Run } from '@lifeos/agents'
import type { ComponentTelemetry } from '@lifeos/agents'
import type { TraceStep } from '@/components/evaluation/TraceViewer'
import type { AgentEvalRecord, AgentExperimentRun } from '@/hooks/evaluationWorkspaceTypes'

type StepCaptureInput = {
  run: Run
  result?: EvalResult | null
  step: TraceStep
  stepIndex: number
  traceSteps: TraceStep[]
  componentTelemetry: ComponentTelemetry[]
  provider?: string
  model?: string
}

export type AgentStepCapture = {
  contextFingerprint: string
  configFingerprint: string
  promptFingerprint: string
  contextSummary: string
  handoffSummary: string
  effectiveSystemPrompt?: string
  userPrompt?: string
  exactContextPayload?: string
  exactUpstreamHandoffPayload?: string
  outputSnapshot?: string
  promptTruncated?: boolean
  contextTruncated?: boolean
  handoffTruncated?: boolean
  outputTruncated?: boolean
  upstreamAgentId?: string
  upstreamStepIndex?: number
  runtimeExperimentId?: string
  runtimeVariantId?: string
  runtimeVariantName?: string
  runtimeExperimentAllocationMode?: 'thompson' | 'winner'
  outputHash: string
  automaticScore: number
  automaticJudgeSummary: string
  automaticJudgeBreakdown: Record<string, number>
  requiresReview: boolean
}

export type AgentPerformanceSummary = {
  agentId: string
  agentName: string
  observations: number
  judgedObservations: number
  unjudgedObservations: number
  workflows: string[]
  avgEffectiveScore: number | null
  avgJudgedScore: number | null
  avgAutomaticScore: number | null
  avgManualScore: number | null
  recentScoreDelta: number | null
  reviewRate: number
  activeExperiments: number
}

function hashString(input: string): string {
  let h1 = 0x811c9dc5 >>> 0
  let h2 = 0x01000193 >>> 0
  for (let index = 0; index < input.length; index += 1) {
    const charCode = input.charCodeAt(index)
    h1 = Math.imul(h1 ^ charCode, 0x01000193) >>> 0
    h2 = Math.imul(h2 ^ charCode, 0x00010001) >>> 0
  }
  return `fp_${h1.toString(36)}_${h2.toString(36)}`
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function truncate(value: string, max = 220) {
  if (value.length <= max) return value
  return `${value.slice(0, max - 1)}…`
}

function collectWorkflowStateKeys(run: Run): string[] {
  const workflowState = run.workflowState as Record<string, unknown> | null | undefined
  if (!workflowState) return []
  return Object.keys(workflowState)
    .filter((key) => !['messages', 'toolCalls', 'toolResults', 'steps'].includes(key))
    .sort()
    .slice(0, 8)
}

function summarizeComponentContext(stepComponents: ComponentTelemetry[]) {
  const toolNames = stepComponents
    .filter((component) => component.componentType === 'tool' && component.toolExecution)
    .map((component) => component.toolExecution!.toolName)
  const routerPaths = stepComponents
    .filter((component) => component.componentType === 'router' && component.routerDecision)
    .map((component) => component.routerDecision!.chosenPath)
  const memoryQueries = stepComponents
    .filter((component) => component.componentType === 'memory' && component.memoryOperation?.query)
    .map((component) => component.memoryOperation!.query!)
  const retrievedItemCount = stepComponents
    .filter(
      (component) => component.componentType === 'memory' && component.memoryOperation?.retrieved
    )
    .reduce((sum, component) => sum + (component.memoryOperation?.retrieved?.length ?? 0), 0)

  return {
    toolNames,
    routerPaths,
    memoryQueries,
    retrievedItemCount,
  }
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

export function deriveAgentStepCapture(input: StepCaptureInput): AgentStepCapture {
  const { run, result, step, stepIndex, traceSteps, componentTelemetry } = input
  const previousStep = stepIndex > 0 ? traceSteps[stepIndex - 1] : null
  const stepComponents = componentTelemetry.filter((component) => component.stepIndex === stepIndex)
  const agentCapture = stepComponents.find((component) => component.componentType === 'agent')
  const componentContext = summarizeComponentContext(stepComponents)
  const workflowStateKeys = collectWorkflowStateKeys(run)
  const runContextKeys = Object.keys(run.context ?? {}).sort()
  const agentMetadata = agentCapture?.metadata ?? {}

  const contextSeed = JSON.stringify({
    workflowType: run.workflowType,
    goal: run.goal.slice(0, 400),
    contextKeys: runContextKeys,
    workflowStateKeys,
    previousAgentId: previousStep?.agentId ?? null,
    previousOutputLength: previousStep?.outputLength ?? null,
    memoryQueries: componentContext.memoryQueries,
    retrievedItemCount: componentContext.retrievedItemCount,
    routerPaths: componentContext.routerPaths,
  })
  const configSeed = JSON.stringify({
    agentId: step.agentId,
    workflowType: run.workflowType,
    provider: input.provider ?? null,
    model: input.model ?? null,
    toolNames: [...new Set(componentContext.toolNames)].sort(),
    routerPaths: [...new Set(componentContext.routerPaths)].sort(),
    tokensUsed: step.tokensUsed,
  })
  const promptSeed = JSON.stringify({
    workflowId: run.workflowId,
    agentId: step.agentId,
    workflowType: run.workflowType,
    contextFingerprint: hashString(contextSeed),
    configFingerprint: hashString(configSeed),
  })

  const contextSummaryParts = [
    `Goal chars ${run.goal.length}`,
    asString(agentMetadata.contextPayload)
      ? `exact context captured`
      : runContextKeys.length > 0
        ? `run context keys: ${runContextKeys.join(', ')}`
        : 'no explicit run context keys',
    workflowStateKeys.length > 0
      ? `workflow state slices: ${workflowStateKeys.join(', ')}`
      : 'no workflow state slices',
    componentContext.memoryQueries.length > 0
      ? `memory queries: ${componentContext.memoryQueries.join(' | ')}`
      : 'no memory retrieval',
    componentContext.routerPaths.length > 0
      ? `router paths: ${componentContext.routerPaths.join(', ')}`
      : 'no router decisions',
  ]
  const handoffSummaryParts = [
    asString(agentMetadata.upstreamHandoffPayload)
      ? 'exact upstream handoff captured'
      : previousStep
        ? `handoff from ${previousStep.agentName} step ${previousStep.stepIndex + 1} (${previousStep.outputLength} chars)`
        : 'no upstream agent handoff',
    componentContext.toolNames.length > 0
      ? `tools used: ${componentContext.toolNames.join(', ')}`
      : 'no tool usage',
    componentContext.retrievedItemCount > 0
      ? `retrieved items: ${componentContext.retrievedItemCount}`
      : 'no retrieved items',
  ]

  const completionScore = clamp(step.outputLength / 600, 0, 1)
  const contextUseScore = clamp(
    (previousStep ? 0.3 : 0) +
      Math.min(0.3, componentContext.memoryQueries.length * 0.15) +
      Math.min(0.2, componentContext.routerPaths.length * 0.1) +
      Math.min(0.2, componentContext.toolNames.length * 0.1),
    0,
    1
  )
  const evidenceScore = clamp(
    Math.min(0.5, componentContext.toolNames.length * 0.15) +
      Math.min(0.5, componentContext.retrievedItemCount * 0.1),
    0,
    1
  )
  const efficiencyScore = clamp(
    1 - Math.max(step.tokensUsed - 1200, 0) / 3000 - Math.max(step.durationMs - 30000, 0) / 120000,
    0,
    1
  )
  const runQualityAnchor = clamp(result?.aggregateScore ?? 0.5, 0, 1)
  const automaticScore = clamp(
    completionScore * 0.25 +
      contextUseScore * 0.25 +
      evidenceScore * 0.15 +
      efficiencyScore * 0.15 +
      runQualityAnchor * 0.2,
    0,
    1
  )
  const requiresReview =
    automaticScore < 0.55 ||
    (step.tokensUsed > 1000 && step.outputLength < 180) ||
    (contextUseScore < 0.25 && step.tokensUsed > 700)

  const breakdown = {
    completion: Number(completionScore.toFixed(3)),
    contextUse: Number(contextUseScore.toFixed(3)),
    evidenceUse: Number(evidenceScore.toFixed(3)),
    efficiency: Number(efficiencyScore.toFixed(3)),
    downstreamAnchor: Number(runQualityAnchor.toFixed(3)),
  }

  const summary = requiresReview
    ? 'Low-confidence step quality. Review context use, handoff quality, or verbosity relative to output substance.'
    : 'Step looks structurally healthy with usable context uptake and adequate downstream contribution.'

  return {
    contextFingerprint: asString(agentMetadata.contextFingerprint) ?? hashString(contextSeed),
    configFingerprint: asString(agentMetadata.configFingerprint) ?? hashString(configSeed),
    promptFingerprint:
      asString(agentMetadata.userPromptFingerprint) ??
      asString(agentMetadata.effectiveSystemPromptFingerprint) ??
      hashString(promptSeed),
    contextSummary: truncate(
      asString(agentMetadata.contextPayload) ?? contextSummaryParts.join(' · '),
      420
    ),
    handoffSummary: truncate(
      asString(agentMetadata.upstreamHandoffPayload) ?? handoffSummaryParts.join(' · '),
      320
    ),
    effectiveSystemPrompt: asString(agentMetadata.effectiveSystemPrompt),
    userPrompt: asString(agentMetadata.userPrompt),
    exactContextPayload: asString(agentMetadata.contextPayload),
    exactUpstreamHandoffPayload: asString(agentMetadata.upstreamHandoffPayload),
    outputSnapshot: asString(agentMetadata.outputSnapshot),
    promptTruncated: asBoolean(agentMetadata.effectiveSystemPromptTruncated),
    contextTruncated: asBoolean(agentMetadata.contextPayloadTruncated),
    handoffTruncated: asBoolean(agentMetadata.upstreamHandoffTruncated),
    outputTruncated: asBoolean(agentMetadata.outputSnapshotTruncated),
    upstreamAgentId: previousStep?.agentId,
    upstreamStepIndex: previousStep?.stepIndex,
    runtimeExperimentId: asString(agentMetadata.runtimeExperimentId),
    runtimeVariantId: asString(agentMetadata.runtimeVariantId),
    runtimeVariantName: asString(agentMetadata.runtimeVariantName),
    runtimeExperimentAllocationMode:
      agentMetadata.runtimeExperimentAllocationMode === 'thompson' ||
      agentMetadata.runtimeExperimentAllocationMode === 'winner'
        ? agentMetadata.runtimeExperimentAllocationMode
        : undefined,
    outputHash:
      asString(agentMetadata.outputFingerprint) ??
      hashString(`${step.agentId}:${step.stepIndex}:${step.outputLength}:${step.tokensUsed}`),
    automaticScore: Number(automaticScore.toFixed(3)),
    automaticJudgeSummary: summary,
    automaticJudgeBreakdown: breakdown,
    requiresReview:
      asBoolean(agentMetadata.contextPayloadTruncated) ||
      asBoolean(agentMetadata.upstreamHandoffTruncated)
        ? true
        : requiresReview,
  }
}

export function computeVariantStats(scores: number[]) {
  if (scores.length === 0) {
    return { avgScore: 0, scoreVariance: 0 }
  }
  const avgScore = scores.reduce((sum, score) => sum + score, 0) / scores.length
  const variance =
    scores.reduce((sum, score) => sum + (score - avgScore) * (score - avgScore), 0) / scores.length
  return {
    avgScore: Number(avgScore.toFixed(3)),
    scoreVariance: Number(variance.toFixed(4)),
  }
}

export function getPreferredAgentRecordScore(record: AgentEvalRecord): number | null {
  if (typeof record.stepJudgeAggregateScore === 'number') return record.stepJudgeAggregateScore
  if (typeof record.manualScore === 'number') return record.manualScore
  if (typeof record.automaticScore === 'number') return record.automaticScore
  return null
}

export function getPreferredAgentRecordReviewFlag(record: AgentEvalRecord): boolean {
  if (typeof record.stepJudgeRequiresHumanReview === 'boolean') {
    return record.stepJudgeRequiresHumanReview
  }
  return Boolean(record.requiresReview)
}

export function findBestVariantMatch(params: {
  experimentId: string
  promptVariants: PromptVariant[]
  capture: AgentStepCapture
}): PromptVariant | null {
  const matches = params.promptVariants.filter(
    (variant) => variant.experimentId === params.experimentId
  )
  if (matches.length === 0) return null
  return (
    matches.find((variant) => variant.promptFingerprint === params.capture.promptFingerprint) ??
    matches.find((variant) => variant.configFingerprint === params.capture.configFingerprint) ??
    matches.find((variant) => variant.contextFingerprint === params.capture.contextFingerprint) ??
    matches[0] ??
    null
  )
}

export function buildAgentPerformanceSummaries(input: {
  agentEvalRecords: AgentEvalRecord[]
  experiments: Experiment[]
  agentExperimentRuns: AgentExperimentRun[]
}): AgentPerformanceSummary[] {
  const grouped = new Map<string, AgentEvalRecord[]>()
  for (const record of input.agentEvalRecords) {
    const list = grouped.get(record.agentId) ?? []
    list.push(record)
    grouped.set(record.agentId, list)
  }

  return Array.from(grouped.entries())
    .map(([agentId, records]) => {
      const sorted = [...records].sort((left, right) => right.updatedAtMs - left.updatedAtMs)
      const effectiveScores = sorted
        .map((record) => getPreferredAgentRecordScore(record))
        .filter((score): score is number => typeof score === 'number')
      const judgedScores = sorted
        .map((record) => record.stepJudgeAggregateScore)
        .filter((score): score is number => typeof score === 'number')
      const automaticScores = sorted
        .map((record) => record.automaticScore)
        .filter((score): score is number => typeof score === 'number')
      const manualScores = sorted
        .map((record) => record.manualScore)
        .filter((score): score is number => typeof score === 'number')
      const currentWindow = effectiveScores.slice(0, 5)
      const previousWindow = effectiveScores.slice(5, 10)
      const currentAverage =
        currentWindow.length > 0
          ? currentWindow.reduce((sum, score) => sum + score, 0) / currentWindow.length
          : null
      const previousAverage =
        previousWindow.length > 0
          ? previousWindow.reduce((sum, score) => sum + score, 0) / previousWindow.length
          : null

      return {
        agentId,
        agentName: sorted[0]?.agentName ?? agentId,
        observations: records.length,
        judgedObservations: judgedScores.length,
        unjudgedObservations: Math.max(records.length - judgedScores.length, 0),
        workflows: Array.from(new Set(records.map((record) => record.workflowType))).sort(),
        avgEffectiveScore:
          effectiveScores.length > 0
            ? effectiveScores.reduce((sum, score) => sum + score, 0) / effectiveScores.length
            : null,
        avgJudgedScore:
          judgedScores.length > 0
            ? judgedScores.reduce((sum, score) => sum + score, 0) / judgedScores.length
            : null,
        avgAutomaticScore:
          automaticScores.length > 0
            ? automaticScores.reduce((sum, score) => sum + score, 0) / automaticScores.length
            : null,
        avgManualScore:
          manualScores.length > 0
            ? manualScores.reduce((sum, score) => sum + score, 0) / manualScores.length
            : null,
        recentScoreDelta:
          currentAverage !== null && previousAverage !== null
            ? Number((currentAverage - previousAverage).toFixed(3))
            : null,
        reviewRate:
          records.length > 0
            ? records.filter((record) => getPreferredAgentRecordReviewFlag(record)).length /
              records.length
            : 0,
        activeExperiments: input.experiments.filter(
          (experiment) =>
            experiment.agentId === agentId &&
            ['draft', 'running', 'paused'].includes(experiment.status)
        ).length,
      }
    })
    .sort((left, right) => right.observations - left.observations)
}
