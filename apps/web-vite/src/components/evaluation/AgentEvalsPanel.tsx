import { useCallback, useEffect, useMemo, useState } from 'react'
import { newId } from '@lifeos/core'
import type { EvalResult, Experiment, PromptVariant, Run, RunId } from '@lifeos/agents'
import { evaluateAgentStep as evaluateAgentStepCallable } from '@/lib/callables'
import { useRunTrace, useRunTraces } from '@/hooks/useRunTrace'
import { useEvaluationCrud } from '@/hooks/useEvaluationCrud'
import type { AgentEvalRecord, AgentExperimentRun } from '@/hooks/evaluationWorkspaceTypes'
import {
  buildAgentPerformanceSummaries,
  computeVariantStats,
  deriveAgentStepCapture,
  findBestVariantMatch,
  getPreferredAgentRecordReviewFlag,
  getPreferredAgentRecordScore,
} from '@/components/evaluation/agentEvalPolicy'

interface AgentEvalsPanelProps {
  recentRuns: Run[]
  results: EvalResult[]
  experiments: Experiment[]
  promptVariants: PromptVariant[]
  agentEvalRecords: AgentEvalRecord[]
  agentExperimentRuns: AgentExperimentRun[]
  onRefresh?: () => void
}

function formatScore(value?: number | null) {
  if (typeof value !== 'number') return 'n/a'
  return value.toFixed(2)
}

function formatPercent(value?: number | null) {
  if (typeof value !== 'number') return 'n/a'
  return `${Math.round(value * 100)}%`
}

function shortFingerprint(value?: string) {
  return value ? value.replace(/^fp_/, '').slice(0, 14) : 'n/a'
}

function getRiskScore(record: AgentEvalRecord) {
  const effectiveScore = getPreferredAgentRecordScore(record)
  let risk = 0
  if (typeof record.stepJudgeAggregateScore !== 'number') risk += 2.2
  if (record.stepJudgeRequiresHumanReview) risk += 1.8
  else if (record.requiresReview) risk += 1.2
  if (typeof effectiveScore === 'number') {
    risk += Math.max(0, 0.8 - effectiveScore) * 3
  } else {
    risk += 0.8
  }
  if (record.contextTruncated || record.handoffTruncated || record.outputTruncated) risk += 0.6
  if ((record.tokensUsed ?? 0) > 1400 && (record.outputSnapshot?.length ?? 0) < 180) risk += 0.4
  return Number(risk.toFixed(3))
}

function buildExperimentRunId(runId: string, stepIndex: number, variantId: string) {
  return `${runId}__${stepIndex}__${variantId}`
}

type ExperimentDraft = {
  name: string
  description: string
  hypothesis: string
  minSamplesPerVariant: string
}

type VariantDraft = {
  name: string
  description: string
  promptTemplate: string
  systemPrompt: string
  isControl: boolean
}

const EMPTY_EXPERIMENT: ExperimentDraft = {
  name: '',
  description: '',
  hypothesis: '',
  minSamplesPerVariant: '12',
}

const EMPTY_VARIANT: VariantDraft = {
  name: '',
  description: '',
  promptTemplate: '',
  systemPrompt: '',
  isControl: false,
}

export function AgentEvalsPanel({
  recentRuns,
  results,
  experiments,
  promptVariants,
  agentEvalRecords,
  agentExperimentRuns,
  onRefresh,
}: AgentEvalsPanelProps) {
  const [selectedRunId, setSelectedRunId] = useState<string>(recentRuns[0]?.runId ?? '')
  const [selectedStepIndex, setSelectedStepIndex] = useState<string>('0')
  const [selectedAgentId, setSelectedAgentId] = useState<string>('')
  const [selectedExperimentId, setSelectedExperimentId] = useState<string>('')
  const [selectedVariantId, setSelectedVariantId] = useState<string>('')
  const [manualScore, setManualScore] = useState('')
  const [notes, setNotes] = useState('')
  const [experimentDraft, setExperimentDraft] = useState<ExperimentDraft>(EMPTY_EXPERIMENT)
  const [variantDraft, setVariantDraft] = useState<VariantDraft>(EMPTY_VARIANT)
  const [selectedRecordId, setSelectedRecordId] = useState<string>('')
  const [judgingRecordId, setJudgingRecordId] = useState<string | null>(null)
  const [linkingRuntimeObservationId, setLinkingRuntimeObservationId] = useState<string | null>(
    null
  )
  const [pendingRuntimeLink, setPendingRuntimeLink] = useState<{
    experimentRunId: string
    runId: string
    stepIndex: number
    agentId: string
    experimentId: string
    variantId: string
  } | null>(null)
  const [batchJudgeState, setBatchJudgeState] = useState<{
    active: boolean
    completed: number
    total: number
    currentRecordId: string | null
  }>({
    active: false,
    completed: 0,
    total: 0,
    currentRecordId: null,
  })
  const {
    saveAgentEvalRecord,
    saveExperiment,
    savePromptVariant,
    saveAgentExperimentRun,
    submitting,
  } = useEvaluationCrud()

  const runIds = useMemo(() => recentRuns.slice(0, 30).map((run) => run.runId), [recentRuns])
  const recentTraceData = useRunTraces({ runIds, includeComponentTelemetry: false })
  const selectedRunTrace = useRunTrace({
    runId: (selectedRunId || null) as RunId | null,
    includeComponentTelemetry: true,
  })

  const runMap = useMemo(() => new Map(recentRuns.map((run) => [run.runId, run])), [recentRuns])
  const resultMap = useMemo(
    () => new Map(results.map((result) => [result.runId, result])),
    [results]
  )
  const experimentMap = useMemo(
    () => new Map(experiments.map((experiment) => [experiment.experimentId, experiment])),
    [experiments]
  )
  const selectedRun = selectedRunId ? (runMap.get(selectedRunId) ?? null) : null
  const selectedStep = selectedRunTrace.steps[Number(selectedStepIndex)] ?? null
  const selectedTelemetryStep = selectedRunTrace.telemetry?.steps[Number(selectedStepIndex)] ?? null
  const selectedCapture =
    selectedRun && selectedStep && selectedTelemetryStep
      ? deriveAgentStepCapture({
          run: selectedRun,
          result: resultMap.get(selectedRun.runId) ?? null,
          step: selectedStep,
          stepIndex: selectedStep.stepIndex,
          traceSteps: selectedRunTrace.steps,
          componentTelemetry: selectedRunTrace.componentTelemetry,
          provider: selectedTelemetryStep.provider,
          model: selectedTelemetryStep.model,
        })
      : null

  useEffect(() => {
    if (!selectedAgentId) {
      const first = agentEvalRecords[0]?.agentId
      if (first) setSelectedAgentId(first)
    }
  }, [agentEvalRecords, selectedAgentId])

  useEffect(() => {
    if (selectedStep?.agentId) {
      setSelectedAgentId(selectedStep.agentId)
    }
  }, [selectedStep?.agentId])

  const observedAgents = useMemo(() => {
    const items = new Map<string, { agentId: string; agentName: string; occurrences: number }>()
    for (const record of agentEvalRecords) {
      const current = items.get(record.agentId) ?? {
        agentId: record.agentId,
        agentName: record.agentName,
        occurrences: 0,
      }
      current.occurrences += 1
      items.set(record.agentId, current)
    }
    for (const trace of recentTraceData.traces.values()) {
      for (const step of trace.steps) {
        const current = items.get(step.agentId) ?? {
          agentId: step.agentId,
          agentName: step.agentName,
          occurrences: 0,
        }
        current.occurrences += 1
        items.set(step.agentId, current)
      }
    }
    return Array.from(items.values()).sort((left, right) =>
      left.agentName.localeCompare(right.agentName)
    )
  }, [agentEvalRecords, recentTraceData.traces])

  const filteredRecords = useMemo(
    () =>
      agentEvalRecords.filter((record) => !selectedAgentId || record.agentId === selectedAgentId),
    [agentEvalRecords, selectedAgentId]
  )
  const recordMap = useMemo(
    () => new Map(agentEvalRecords.map((record) => [record.recordId, record])),
    [agentEvalRecords]
  )
  const selectedRecord = useMemo(
    () =>
      filteredRecords.find((record) => record.recordId === selectedRecordId) ??
      filteredRecords[0] ??
      null,
    [filteredRecords, selectedRecordId]
  )

  const findMatchingRecord = useCallback(
    (runId: string, stepIndex: number, agentId: string, variantId?: string | null) =>
      agentEvalRecords.find((record) => {
        if (
          record.runId !== runId ||
          record.stepIndex !== stepIndex ||
          record.agentId !== agentId
        ) {
          return false
        }
        const recordVariantId = record.variantId ?? record.runtimeVariantId ?? null
        const targetVariantId = variantId ?? null
        return recordVariantId === targetVariantId
      }) ?? null,
    [agentEvalRecords]
  )

  const agentSummaries = useMemo(
    () =>
      buildAgentPerformanceSummaries({
        agentEvalRecords,
        experiments,
        agentExperimentRuns,
      }).filter((item) => !selectedAgentId || item.agentId === selectedAgentId),
    [agentEvalRecords, agentExperimentRuns, experiments, selectedAgentId]
  )
  const agentSummaryMap = useMemo(
    () => new Map(agentSummaries.map((summary) => [summary.agentId, summary])),
    [agentSummaries]
  )
  const prioritizedRecords = useMemo(
    () =>
      [...filteredRecords].sort((left, right) => {
        const leftDriftPenalty =
          Math.max(0, -(agentSummaryMap.get(left.agentId)?.recentScoreDelta ?? 0)) * 2
        const rightDriftPenalty =
          Math.max(0, -(agentSummaryMap.get(right.agentId)?.recentScoreDelta ?? 0)) * 2
        const riskDelta =
          getRiskScore(right) + rightDriftPenalty - getRiskScore(left) - leftDriftPenalty
        if (Math.abs(riskDelta) > 0.001) return riskDelta
        return right.updatedAtMs - left.updatedAtMs
      }),
    [agentSummaryMap, filteredRecords]
  )
  const unjudgedRecordCount = useMemo(
    () =>
      filteredRecords.filter((record) => typeof record.stepJudgeAggregateScore !== 'number').length,
    [filteredRecords]
  )

  const relevantExperiments = useMemo(
    () =>
      experiments.filter(
        (experiment) =>
          (!selectedAgentId || experiment.agentId === selectedAgentId) &&
          (!selectedRun?.workflowType || experiment.workflowType === selectedRun.workflowType)
      ),
    [experiments, selectedAgentId, selectedRun?.workflowType]
  )

  useEffect(() => {
    if (!selectedExperimentId && relevantExperiments[0]?.experimentId) {
      setSelectedExperimentId(relevantExperiments[0].experimentId)
    }
  }, [relevantExperiments, selectedExperimentId])

  const experimentVariants = useMemo(
    () => promptVariants.filter((variant) => variant.experimentId === selectedExperimentId),
    [promptVariants, selectedExperimentId]
  )

  useEffect(() => {
    if (!selectedVariantId && experimentVariants[0]?.variantId) {
      setSelectedVariantId(experimentVariants[0].variantId)
    }
  }, [experimentVariants, selectedVariantId])

  const experimentRunSummary = useMemo(() => {
    if (!selectedExperimentId) return []
    const relevantRuns = agentExperimentRuns.filter(
      (run) => run.experimentId === selectedExperimentId
    )
    return experimentVariants.map((variant) => {
      const variantRuns = relevantRuns.filter((run) => run.variantId === variant.variantId)
      const resolvedScores = variantRuns
        .map((run) => {
          const linkedRecord = run.agentEvalRecordId
            ? (recordMap.get(run.agentEvalRecordId) ?? null)
            : null
          return linkedRecord ? getPreferredAgentRecordScore(linkedRecord) : (run.score ?? null)
        })
        .filter((score): score is number => typeof score === 'number')
      const avgScore =
        resolvedScores.length > 0
          ? resolvedScores.reduce((sum, score) => sum + score, 0) / resolvedScores.length
          : null
      const reviewCount = variantRuns.filter((run) => {
        const linkedRecord = run.agentEvalRecordId
          ? (recordMap.get(run.agentEvalRecordId) ?? null)
          : null
        return linkedRecord
          ? getPreferredAgentRecordReviewFlag(linkedRecord)
          : Boolean(run.requiresReview)
      }).length
      const judgedRuns = variantRuns.filter((run) => {
        const linkedRecord = run.agentEvalRecordId
          ? (recordMap.get(run.agentEvalRecordId) ?? null)
          : null
        return typeof linkedRecord?.stepJudgeAggregateScore === 'number'
      }).length
      return {
        variant,
        runs: variantRuns.length,
        avgScore,
        judgedRuns,
        requiresReview: reviewCount,
      }
    })
  }, [agentExperimentRuns, experimentVariants, recordMap, selectedExperimentId])

  const runtimeServedRuns = useMemo(() => {
    return agentExperimentRuns
      .filter((run) => !selectedAgentId || run.agentId === selectedAgentId)
      .map((run) => {
        const linkedRecord = run.agentEvalRecordId
          ? (recordMap.get(run.agentEvalRecordId) ?? null)
          : null
        const runResult = resultMap.get(run.runId) ?? null
        const workflowRun = runMap.get(run.runId) ?? null
        const variant = promptVariants.find((item) => item.variantId === run.variantId) ?? null
        const experiment = experimentMap.get(run.experimentId) ?? null
        return {
          ...run,
          linkedRecord,
          runResult,
          workflowRun,
          variant,
          experiment,
          effectiveScore: linkedRecord
            ? getPreferredAgentRecordScore(linkedRecord)
            : (run.score ?? null),
          effectiveReview: linkedRecord
            ? getPreferredAgentRecordReviewFlag(linkedRecord)
            : Boolean(run.requiresReview),
        }
      })
      .sort((left, right) => right.updatedAtMs - left.updatedAtMs)
  }, [
    agentExperimentRuns,
    experimentMap,
    promptVariants,
    recordMap,
    resultMap,
    runMap,
    selectedAgentId,
  ])

  useEffect(() => {
    if (!pendingRuntimeLink) return
    if (selectedRunId !== pendingRuntimeLink.runId) return
    if (!selectedRun || !selectedStep || !selectedTelemetryStep || !selectedCapture) return
    if (selectedStep.stepIndex !== pendingRuntimeLink.stepIndex) return
    if (selectedStep.agentId !== pendingRuntimeLink.agentId) return

    let cancelled = false

    const persistLinkedRecord = async () => {
      setLinkingRuntimeObservationId(pendingRuntimeLink.experimentRunId)
      try {
        const existingRecord = findMatchingRecord(
          selectedRun.runId,
          selectedStep.stepIndex,
          selectedStep.agentId,
          pendingRuntimeLink.variantId
        )
        const record = existingRecord
          ? await saveAgentEvalRecord({
              ...existingRecord,
              provider: selectedTelemetryStep.provider,
              model: selectedTelemetryStep.model,
              contextFingerprint: selectedCapture.contextFingerprint,
              configFingerprint: selectedCapture.configFingerprint,
              promptFingerprint: selectedCapture.promptFingerprint,
              contextSummary: selectedCapture.contextSummary,
              handoffSummary: selectedCapture.handoffSummary,
              effectiveSystemPrompt: selectedCapture.effectiveSystemPrompt,
              userPrompt: selectedCapture.userPrompt,
              exactContextPayload: selectedCapture.exactContextPayload,
              exactUpstreamHandoffPayload: selectedCapture.exactUpstreamHandoffPayload,
              outputSnapshot: selectedCapture.outputSnapshot,
              promptTruncated: selectedCapture.promptTruncated,
              contextTruncated: selectedCapture.contextTruncated,
              handoffTruncated: selectedCapture.handoffTruncated,
              outputTruncated: selectedCapture.outputTruncated,
              upstreamAgentId: selectedCapture.upstreamAgentId,
              upstreamStepIndex: selectedCapture.upstreamStepIndex,
              runtimeExperimentId: selectedCapture.runtimeExperimentId,
              runtimeVariantId: selectedCapture.runtimeVariantId,
              runtimeVariantName: selectedCapture.runtimeVariantName,
              runtimeExperimentAllocationMode: selectedCapture.runtimeExperimentAllocationMode,
              outputHash: selectedCapture.outputHash,
              automaticScore: selectedCapture.automaticScore,
              automaticJudgeSummary: selectedCapture.automaticJudgeSummary,
              automaticJudgeBreakdown: selectedCapture.automaticJudgeBreakdown,
              requiresReview: selectedCapture.requiresReview,
              experimentId: pendingRuntimeLink.experimentId,
              variantId: pendingRuntimeLink.variantId,
              aggregateRunScore: resultMap.get(selectedRun.runId)?.aggregateScore ?? null,
              durationMs: selectedStep.durationMs,
              tokensUsed: selectedStep.tokensUsed,
              toolCallCount: selectedStep.toolCalls.length,
              routerDecisionCount: selectedStep.routerDecisions.length,
            })
          : await saveAgentEvalRecord({
              runId: selectedRun.runId,
              workflowType: selectedRun.workflowType,
              agentId: selectedStep.agentId,
              agentName: selectedStep.agentName,
              stepIndex: selectedStep.stepIndex,
              provider: selectedTelemetryStep.provider,
              model: selectedTelemetryStep.model,
              contextFingerprint: selectedCapture.contextFingerprint,
              configFingerprint: selectedCapture.configFingerprint,
              promptFingerprint: selectedCapture.promptFingerprint,
              contextSummary: selectedCapture.contextSummary,
              handoffSummary: selectedCapture.handoffSummary,
              effectiveSystemPrompt: selectedCapture.effectiveSystemPrompt,
              userPrompt: selectedCapture.userPrompt,
              exactContextPayload: selectedCapture.exactContextPayload,
              exactUpstreamHandoffPayload: selectedCapture.exactUpstreamHandoffPayload,
              outputSnapshot: selectedCapture.outputSnapshot,
              promptTruncated: selectedCapture.promptTruncated,
              contextTruncated: selectedCapture.contextTruncated,
              handoffTruncated: selectedCapture.handoffTruncated,
              outputTruncated: selectedCapture.outputTruncated,
              upstreamAgentId: selectedCapture.upstreamAgentId,
              upstreamStepIndex: selectedCapture.upstreamStepIndex,
              runtimeExperimentId: selectedCapture.runtimeExperimentId,
              runtimeVariantId: selectedCapture.runtimeVariantId,
              runtimeVariantName: selectedCapture.runtimeVariantName,
              runtimeExperimentAllocationMode: selectedCapture.runtimeExperimentAllocationMode,
              outputHash: selectedCapture.outputHash,
              automaticScore: selectedCapture.automaticScore,
              automaticJudgeSummary: selectedCapture.automaticJudgeSummary,
              automaticJudgeBreakdown: selectedCapture.automaticJudgeBreakdown,
              requiresReview: selectedCapture.requiresReview,
              experimentId: pendingRuntimeLink.experimentId,
              variantId: pendingRuntimeLink.variantId,
              aggregateRunScore: resultMap.get(selectedRun.runId)?.aggregateScore ?? null,
              durationMs: selectedStep.durationMs,
              tokensUsed: selectedStep.tokensUsed,
              toolCallCount: selectedStep.toolCalls.length,
              routerDecisionCount: selectedStep.routerDecisions.length,
            })

        const score = getPreferredAgentRecordScore(record)
        const requiresReview = getPreferredAgentRecordReviewFlag(record)
        const passed = typeof score === 'number' ? score >= 0.65 : false
        const runtimeRun = agentExperimentRuns.find(
          (run) => run.experimentRunId === pendingRuntimeLink.experimentRunId
        )
        if (runtimeRun) {
          await saveAgentExperimentRun({
            ...runtimeRun,
            agentEvalRecordId: record.recordId,
            score,
            outcome:
              requiresReview || score === null ? 'pending_review' : passed ? 'passed' : 'failed',
            requiresReview,
          })
        }

        if (!cancelled) {
          setSelectedRecordId(record.recordId)
          setPendingRuntimeLink(null)
          onRefresh?.()
        }
      } finally {
        if (!cancelled) {
          setLinkingRuntimeObservationId(null)
        }
      }
    }

    void persistLinkedRecord()

    return () => {
      cancelled = true
    }
  }, [
    agentEvalRecords,
    agentExperimentRuns,
    findMatchingRecord,
    onRefresh,
    pendingRuntimeLink,
    resultMap,
    saveAgentEvalRecord,
    saveAgentExperimentRun,
    selectedCapture,
    selectedRun,
    selectedRunId,
    selectedStep,
    selectedTelemetryStep,
  ])

  const syncLinkedExperimentRuns = async (record: AgentEvalRecord) => {
    if (!record.experimentId || !record.variantId) return
    const linkedRuns = agentExperimentRuns.filter(
      (run) => run.agentEvalRecordId === record.recordId
    )
    if (linkedRuns.length === 0) return
    const score = getPreferredAgentRecordScore(record)
    const requiresReview = getPreferredAgentRecordReviewFlag(record)
    const passed = typeof score === 'number' ? score >= 0.65 : false

    for (const linkedRun of linkedRuns) {
      await saveAgentExperimentRun({
        ...linkedRun,
        score,
        outcome: requiresReview || score === null ? 'pending_review' : passed ? 'passed' : 'failed',
        requiresReview,
      })
    }
  }

  const resolveExperimentRunRecord = (
    run: AgentExperimentRun,
    recordOverride?: AgentEvalRecord
  ): AgentEvalRecord | null => {
    if (recordOverride && run.agentEvalRecordId === recordOverride.recordId) return recordOverride
    return run.agentEvalRecordId ? (recordMap.get(run.agentEvalRecordId) ?? null) : null
  }

  const syncVariantAggregate = async (
    variantId: string,
    recordOverride?: AgentEvalRecord,
    experimentRunOverride?: AgentExperimentRun
  ) => {
    const variant = promptVariants.find((item) => item.variantId === variantId)
    if (!variant) return
    const variantRuns = [
      ...agentExperimentRuns.filter(
        (run) =>
          run.variantId === variantId &&
          run.experimentRunId !== experimentRunOverride?.experimentRunId
      ),
      ...(experimentRunOverride && experimentRunOverride.variantId === variantId
        ? [experimentRunOverride]
        : []),
    ]
    const scores = variantRuns
      .map((run) => {
        if (recordOverride && run.agentEvalRecordId === recordOverride.recordId) {
          return getPreferredAgentRecordScore(recordOverride)
        }
        const linkedRecord = run.agentEvalRecordId
          ? (recordMap.get(run.agentEvalRecordId) ?? null)
          : null
        return linkedRecord ? getPreferredAgentRecordScore(linkedRecord) : (run.score ?? null)
      })
      .filter((score): score is number => typeof score === 'number')
      .slice(-50)
    const reviewCount = variantRuns.filter((run) => {
      const linkedRecord = resolveExperimentRunRecord(run, recordOverride)
      return linkedRecord
        ? getPreferredAgentRecordReviewFlag(linkedRecord)
        : Boolean(run.requiresReview)
    }).length
    const passedCount = variantRuns.filter((run) => {
      const linkedRecord = resolveExperimentRunRecord(run, recordOverride)
      const score = linkedRecord ? getPreferredAgentRecordScore(linkedRecord) : (run.score ?? null)
      const requiresReview = linkedRecord
        ? getPreferredAgentRecordReviewFlag(linkedRecord)
        : Boolean(run.requiresReview)
      return typeof score === 'number' && score >= 0.65 && !requiresReview
    }).length
    const stats = computeVariantStats(scores)
    await savePromptVariant({
      ...variant,
      sampleCount: variantRuns.length,
      successCount: passedCount,
      failedCount: Math.max(variantRuns.length - passedCount - reviewCount, 0),
      totalScore: Number(scores.reduce((sum, score) => sum + score, 0).toFixed(3)),
      avgScore: stats.avgScore,
      scoreVariance: stats.scoreVariance,
      scores,
      alpha: 1 + passedCount,
      beta: 1 + Math.max(variantRuns.length - passedCount, 0),
    })
  }

  const handleSaveRecord = async () => {
    if (!selectedRun || !selectedStep || !selectedTelemetryStep || !selectedCapture) return

    const runtimeVariant = selectedCapture.runtimeVariantId
      ? (promptVariants.find((variant) => variant.variantId === selectedCapture.runtimeVariantId) ??
        null)
      : null
    const resolvedExperimentId =
      selectedExperimentId ||
      selectedCapture.runtimeExperimentId ||
      runtimeVariant?.experimentId ||
      ''
    const matchedVariant =
      runtimeVariant && !selectedVariantId
        ? runtimeVariant
        : resolvedExperimentId && !selectedVariantId
          ? findBestVariantMatch({
              experimentId: resolvedExperimentId,
              promptVariants,
              capture: selectedCapture,
            })
          : selectedVariantId
            ? (promptVariants.find((variant) => variant.variantId === selectedVariantId) ?? null)
            : runtimeVariant
    const existingRecord = findMatchingRecord(
      selectedRun.runId,
      selectedStep.stepIndex,
      selectedStep.agentId,
      matchedVariant?.variantId ?? selectedCapture.runtimeVariantId ?? null
    )

    const record = await saveAgentEvalRecord({
      ...(existingRecord ?? {}),
      runId: selectedRun.runId,
      workflowType: selectedRun.workflowType,
      agentId: selectedStep.agentId,
      agentName: selectedStep.agentName,
      stepIndex: selectedStep.stepIndex,
      provider: selectedTelemetryStep.provider,
      model: selectedTelemetryStep.model,
      contextFingerprint: selectedCapture.contextFingerprint,
      configFingerprint: selectedCapture.configFingerprint,
      promptFingerprint: selectedCapture.promptFingerprint,
      contextSummary: selectedCapture.contextSummary,
      handoffSummary: selectedCapture.handoffSummary,
      effectiveSystemPrompt: selectedCapture.effectiveSystemPrompt,
      userPrompt: selectedCapture.userPrompt,
      exactContextPayload: selectedCapture.exactContextPayload,
      exactUpstreamHandoffPayload: selectedCapture.exactUpstreamHandoffPayload,
      outputSnapshot: selectedCapture.outputSnapshot,
      promptTruncated: selectedCapture.promptTruncated,
      contextTruncated: selectedCapture.contextTruncated,
      handoffTruncated: selectedCapture.handoffTruncated,
      outputTruncated: selectedCapture.outputTruncated,
      upstreamAgentId: selectedCapture.upstreamAgentId,
      upstreamStepIndex: selectedCapture.upstreamStepIndex,
      runtimeExperimentId: selectedCapture.runtimeExperimentId,
      runtimeVariantId: selectedCapture.runtimeVariantId,
      runtimeVariantName: selectedCapture.runtimeVariantName,
      runtimeExperimentAllocationMode: selectedCapture.runtimeExperimentAllocationMode,
      outputHash: selectedCapture.outputHash,
      automaticScore: selectedCapture.automaticScore,
      automaticJudgeSummary: selectedCapture.automaticJudgeSummary,
      automaticJudgeBreakdown: selectedCapture.automaticJudgeBreakdown,
      requiresReview: selectedCapture.requiresReview,
      experimentId: resolvedExperimentId || undefined,
      variantId: matchedVariant?.variantId,
      notes: notes.trim() || undefined,
      manualScore: manualScore ? Number(manualScore) : undefined,
      aggregateRunScore: resultMap.get(selectedRun.runId)?.aggregateScore ?? null,
      durationMs: selectedStep.durationMs,
      tokensUsed: selectedStep.tokensUsed,
      toolCallCount: selectedStep.toolCalls.length,
      routerDecisionCount: selectedStep.routerDecisions.length,
    })

    if (resolvedExperimentId && matchedVariant) {
      const score = getPreferredAgentRecordScore(record)
      const requiresReview = getPreferredAgentRecordReviewFlag(record)
      const passed = typeof score === 'number' ? score >= 0.65 : false
      const existingRun = agentExperimentRuns.find(
        (run) =>
          run.runId === selectedRun.runId &&
          run.stepIndex === selectedStep.stepIndex &&
          run.variantId === matchedVariant.variantId
      )
      const savedExperimentRun = await saveAgentExperimentRun({
        ...(existingRun ?? {}),
        experimentRunId:
          existingRun?.experimentRunId ??
          buildExperimentRunId(selectedRun.runId, selectedStep.stepIndex, matchedVariant.variantId),
        experimentId: resolvedExperimentId,
        variantId: matchedVariant.variantId,
        runId: selectedRun.runId,
        workflowType: selectedRun.workflowType,
        agentId: selectedStep.agentId,
        agentName: selectedStep.agentName,
        stepIndex: selectedStep.stepIndex,
        agentEvalRecordId: record.recordId,
        score,
        outcome: requiresReview || score === null ? 'pending_review' : passed ? 'passed' : 'failed',
        requiresReview,
      })
      await syncVariantAggregate(matchedVariant.variantId, record, savedExperimentRun)
    }

    onRefresh?.()
    setSelectedRecordId(record.recordId)
    setNotes('')
    setManualScore('')
  }

  const handleCreateExperiment = async () => {
    if (!selectedRun || !selectedStep) return
    const experimentId = newId<'experiment'>('experiment')
    await saveExperiment({
      experimentId,
      name: experimentDraft.name || `${selectedStep.agentName} experiment`,
      description: experimentDraft.description || undefined,
      hypothesis: experimentDraft.hypothesis || undefined,
      workflowType: selectedRun.workflowType,
      agentId: selectedStep.agentId as Experiment['agentId'],
      minSamplesPerVariant: Number(experimentDraft.minSamplesPerVariant) || 12,
      significanceLevel: 0.05,
      maxDurationDays: 30,
      variantIds: [],
      controlVariantId: '' as Experiment['controlVariantId'],
      status: 'draft',
    })
    setSelectedExperimentId(experimentId)
    setExperimentDraft(EMPTY_EXPERIMENT)
    onRefresh?.()
  }

  const handleCreateVariant = async () => {
    if (!selectedExperimentId || !selectedStep || !selectedCapture) return
    const experiment = experimentMap.get(selectedExperimentId)
    if (!experiment) return
    const variant = await savePromptVariant({
      experimentId: selectedExperimentId as PromptVariant['experimentId'],
      agentId: selectedStep.agentId as PromptVariant['agentId'],
      workflowType: selectedRun?.workflowType,
      name: variantDraft.name || `${selectedStep.agentName} variant`,
      description: variantDraft.description || undefined,
      promptTemplate: variantDraft.promptTemplate || selectedCapture.contextSummary,
      systemPrompt: variantDraft.systemPrompt || undefined,
      promptFingerprint: selectedCapture.promptFingerprint,
      configFingerprint: selectedCapture.configFingerprint,
      contextFingerprint: selectedCapture.contextFingerprint,
      isControl: variantDraft.isControl || experiment.variantIds.length === 0,
      sampleCount: 0,
      successCount: 0,
      failedCount: 0,
      totalScore: 0,
      avgScore: 0,
      scoreVariance: 0,
      scores: [],
      alpha: 1,
      beta: 1,
      status: 'active',
    })
    await saveExperiment({
      ...experiment,
      variantIds: Array.from(new Set([...experiment.variantIds, variant.variantId])),
      controlVariantId:
        variant.isControl || !experiment.controlVariantId
          ? variant.variantId
          : experiment.controlVariantId,
    })
    setSelectedVariantId(variant.variantId)
    setVariantDraft(EMPTY_VARIANT)
    onRefresh?.()
  }

  const handleEvaluateSavedStep = async () => {
    if (!selectedRecord) return
    setJudgingRecordId(selectedRecord.recordId)
    try {
      const response = await evaluateAgentStepCallable({ recordId: selectedRecord.recordId })
      const refreshedRecord: AgentEvalRecord = {
        ...selectedRecord,
        stepJudgeEvalResultId: response.evalResultId,
        stepJudgeRubricId: response.rubricId,
        stepJudgeAggregateScore: response.aggregateScore,
        stepJudgeCriterionScores: response.criterionScores,
        stepJudgeReasoning: response.reasoning,
        stepJudgeRequiresHumanReview: response.requiresHumanReview,
        stepJudgeScoreVariance: response.scoreVariance,
        stepJudgeJudgeModel: response.judgeModel,
        stepJudgeJudgeProvider: response.judgeProvider,
        stepJudgeEvaluatedAtMs: response.evaluatedAtMs,
      }
      await syncLinkedExperimentRuns(refreshedRecord)
      if (selectedRecord.variantId) {
        await syncVariantAggregate(selectedRecord.variantId, refreshedRecord)
      }
      onRefresh?.()
    } finally {
      setJudgingRecordId(null)
    }
  }

  const handleBatchEvaluateSavedSteps = async (records: AgentEvalRecord[]) => {
    if (records.length === 0) return
    setBatchJudgeState({
      active: true,
      completed: 0,
      total: records.length,
      currentRecordId: records[0]?.recordId ?? null,
    })
    try {
      for (let index = 0; index < records.length; index += 1) {
        const record = records[index]
        setBatchJudgeState({
          active: true,
          completed: index,
          total: records.length,
          currentRecordId: record.recordId,
        })
        const response = await evaluateAgentStepCallable({ recordId: record.recordId })
        const refreshedRecord: AgentEvalRecord = {
          ...record,
          stepJudgeEvalResultId: response.evalResultId,
          stepJudgeRubricId: response.rubricId,
          stepJudgeAggregateScore: response.aggregateScore,
          stepJudgeCriterionScores: response.criterionScores,
          stepJudgeReasoning: response.reasoning,
          stepJudgeRequiresHumanReview: response.requiresHumanReview,
          stepJudgeScoreVariance: response.scoreVariance,
          stepJudgeJudgeModel: response.judgeModel,
          stepJudgeJudgeProvider: response.judgeProvider,
          stepJudgeEvaluatedAtMs: response.evaluatedAtMs,
        }
        await syncLinkedExperimentRuns(refreshedRecord)
        if (record.variantId) {
          await syncVariantAggregate(record.variantId, refreshedRecord)
        }
      }
      onRefresh?.()
    } finally {
      setBatchJudgeState({
        active: false,
        completed: 0,
        total: 0,
        currentRecordId: null,
      })
    }
  }

  const handleOpenRuntimeObservation = (runtimeObservation: (typeof runtimeServedRuns)[number]) => {
    setSelectedAgentId(runtimeObservation.agentId)
    setSelectedRunId(runtimeObservation.runId)
    setSelectedStepIndex(String(runtimeObservation.stepIndex))
    setSelectedExperimentId(runtimeObservation.experimentId)
    setSelectedVariantId(runtimeObservation.variantId)

    if (runtimeObservation.linkedRecord) {
      setSelectedRecordId(runtimeObservation.linkedRecord.recordId)
      setPendingRuntimeLink(null)
      return
    }

    setPendingRuntimeLink({
      experimentRunId: runtimeObservation.experimentRunId,
      runId: runtimeObservation.runId,
      stepIndex: runtimeObservation.stepIndex,
      agentId: runtimeObservation.agentId,
      experimentId: runtimeObservation.experimentId,
      variantId: runtimeObservation.variantId,
    })
  }

  return (
    <div className="eval-panel">
      <section className="eval-split-grid">
        <article className="eval-card">
          <div className="eval-section-heading">
            <h3>Capture Agent Step</h3>
            <p>Auto-capture context, config, handoff, and structural quality for one agent step.</p>
          </div>
          <div className="eval-form-grid">
            <label>
              Run
              <select
                value={selectedRunId}
                onChange={(event) => setSelectedRunId(event.target.value)}
              >
                {recentRuns.slice(0, 30).map((run) => (
                  <option key={run.runId} value={run.runId}>
                    {run.workflowType} · {run.goal.slice(0, 56)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Step
              <select
                value={selectedStepIndex}
                onChange={(event) => setSelectedStepIndex(event.target.value)}
              >
                {selectedRunTrace.steps.map((step) => (
                  <option key={`${step.agentId}-${step.stepIndex}`} value={String(step.stepIndex)}>
                    {step.stepIndex + 1} · {step.agentName}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Experiment
              <select
                value={selectedExperimentId}
                onChange={(event) => setSelectedExperimentId(event.target.value)}
              >
                <option value="">No experiment</option>
                {relevantExperiments.map((experiment) => (
                  <option key={experiment.experimentId} value={experiment.experimentId}>
                    {experiment.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Variant
              <select
                value={selectedVariantId}
                onChange={(event) => setSelectedVariantId(event.target.value)}
              >
                <option value="">Auto-match</option>
                {experimentVariants.map((variant) => (
                  <option key={variant.variantId} value={variant.variantId}>
                    {variant.name}
                  </option>
                ))}
              </select>
            </label>
            <input
              className="eval-input"
              placeholder="Optional manual score"
              value={manualScore}
              onChange={(event) => setManualScore(event.target.value)}
            />
          </div>
          {selectedStep && selectedTelemetryStep && selectedCapture ? (
            <div className="eval-list">
              <div className="eval-list-item eval-list-item--stacked">
                <div>
                  <strong>{selectedStep.agentName}</strong>
                  <p>
                    {selectedRun?.workflowType} · provider {selectedTelemetryStep.provider} · model{' '}
                    {selectedTelemetryStep.model}
                  </p>
                  <p>{selectedCapture.contextSummary}</p>
                  <p>{selectedCapture.handoffSummary}</p>
                </div>
                <div className="eval-inline-actions">
                  <span className="eval-pill neutral">
                    auto {formatScore(selectedCapture.automaticScore)}
                  </span>
                  <span
                    className={`eval-pill ${selectedCapture.requiresReview ? 'warning' : 'ok'}`}
                  >
                    {selectedCapture.requiresReview ? 'review' : 'healthy'}
                  </span>
                  {selectedCapture.runtimeVariantId ? (
                    <span className="eval-pill active">
                      live{' '}
                      {selectedCapture.runtimeVariantName ??
                        selectedCapture.runtimeVariantId.slice(0, 8)}
                    </span>
                  ) : null}
                  <span className="eval-pill neutral">
                    ctx {shortFingerprint(selectedCapture.contextFingerprint)}
                  </span>
                  <span className="eval-pill neutral">
                    cfg {shortFingerprint(selectedCapture.configFingerprint)}
                  </span>
                  <span className="eval-pill neutral">
                    prompt {shortFingerprint(selectedCapture.promptFingerprint)}
                  </span>
                </div>
                <div className="eval-inline-actions">
                  {Object.entries(selectedCapture.automaticJudgeBreakdown).map(([label, value]) => (
                    <span key={label} className="eval-pill neutral">
                      {label} {value.toFixed(2)}
                    </span>
                  ))}
                </div>
                <p className="eval-shell__small">{selectedCapture.automaticJudgeSummary}</p>
              </div>
            </div>
          ) : (
            <div className="eval-empty">
              {selectedRunTrace.loading
                ? 'Loading step trace...'
                : 'Select a run and step with available telemetry.'}
            </div>
          )}
          <textarea
            className="eval-textarea"
            rows={4}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Optional reviewer note about how context or config affected the agent response."
          />
          <div className="eval-form-actions">
            <button
              type="button"
              className="eval-refresh-button"
              disabled={!selectedStep || !selectedCapture || submitting}
              onClick={() => void handleSaveRecord()}
            >
              {submitting ? 'Saving...' : 'Save Agent Step Eval'}
            </button>
          </div>
        </article>

        <article className="eval-card">
          <div className="eval-section-heading">
            <h3>Agent Experiments</h3>
            <p>Attach saved step observations to `Experiment` and `PromptVariant` records.</p>
          </div>
          <div className="eval-form-grid">
            <input
              className="eval-input"
              placeholder="Experiment name"
              value={experimentDraft.name}
              onChange={(event) =>
                setExperimentDraft((current) => ({ ...current, name: event.target.value }))
              }
            />
            <input
              className="eval-input"
              placeholder="Hypothesis"
              value={experimentDraft.hypothesis}
              onChange={(event) =>
                setExperimentDraft((current) => ({ ...current, hypothesis: event.target.value }))
              }
            />
            <input
              className="eval-input"
              placeholder="Min samples / variant"
              value={experimentDraft.minSamplesPerVariant}
              onChange={(event) =>
                setExperimentDraft((current) => ({
                  ...current,
                  minSamplesPerVariant: event.target.value,
                }))
              }
            />
            <button
              type="button"
              className="eval-refresh-button"
              disabled={!selectedStep || submitting}
              onClick={() => void handleCreateExperiment()}
            >
              Create Experiment
            </button>
          </div>
          <textarea
            className="eval-textarea"
            rows={2}
            placeholder="Experiment description"
            value={experimentDraft.description}
            onChange={(event) =>
              setExperimentDraft((current) => ({ ...current, description: event.target.value }))
            }
          />
          <div className="eval-form-grid">
            <input
              className="eval-input"
              placeholder="Variant name"
              value={variantDraft.name}
              onChange={(event) =>
                setVariantDraft((current) => ({ ...current, name: event.target.value }))
              }
            />
            <label className="eval-shell__small">
              <input
                type="checkbox"
                checked={variantDraft.isControl}
                onChange={(event) =>
                  setVariantDraft((current) => ({ ...current, isControl: event.target.checked }))
                }
              />{' '}
              Control variant
            </label>
          </div>
          <textarea
            className="eval-textarea"
            rows={2}
            placeholder="Prompt template"
            value={variantDraft.promptTemplate}
            onChange={(event) =>
              setVariantDraft((current) => ({ ...current, promptTemplate: event.target.value }))
            }
          />
          <textarea
            className="eval-textarea"
            rows={2}
            placeholder="System prompt override"
            value={variantDraft.systemPrompt}
            onChange={(event) =>
              setVariantDraft((current) => ({ ...current, systemPrompt: event.target.value }))
            }
          />
          <div className="eval-form-actions">
            <button
              type="button"
              className="eval-refresh-button"
              disabled={!selectedExperimentId || !selectedCapture || submitting}
              onClick={() => void handleCreateVariant()}
            >
              Create Variant From Selected Step
            </button>
          </div>
          <div className="eval-list">
            {experimentRunSummary.length === 0 ? (
              <div className="eval-empty">
                No experiment variants or experiment-linked runs yet.
              </div>
            ) : (
              experimentRunSummary.map((item) => (
                <div key={item.variant.variantId} className="eval-list-item">
                  <div>
                    <strong>{item.variant.name}</strong>
                    <p>
                      samples {item.variant.sampleCount} · avg {formatScore(item.avgScore)} · review{' '}
                      {item.requiresReview}
                    </p>
                  </div>
                  <div className="eval-inline-actions">
                    <span
                      className={`eval-pill ${item.variant.status === 'winner' ? 'active' : 'neutral'}`}
                    >
                      {item.variant.status}
                    </span>
                    <span className="eval-pill neutral">{item.runs} linked runs</span>
                    <span className="eval-pill neutral">{item.judgedRuns} judged</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </article>
      </section>

      <section className="eval-split-grid">
        <article className="eval-card">
          <div className="eval-section-heading">
            <h3>Agent Comparison</h3>
            <p>Compare the same agent across workflows, fingerprints, and experiment contexts.</p>
          </div>
          <label className="eval-cohort-selector">
            Agent
            <select
              value={selectedAgentId}
              onChange={(event) => setSelectedAgentId(event.target.value)}
            >
              <option value="">All agents</option>
              {observedAgents.map((agent) => (
                <option key={agent.agentId} value={agent.agentId}>
                  {agent.agentName} · {agent.occurrences}
                </option>
              ))}
            </select>
          </label>
          {agentSummaries.length === 0 ? (
            <div className="eval-empty">No saved agent eval records yet.</div>
          ) : (
            <div className="eval-list">
              {agentSummaries.map((item) => (
                <div key={item.agentId} className="eval-list-item">
                  <div>
                    <strong>{item.agentName}</strong>
                    <p>
                      {item.observations} observations · workflows{' '}
                      {item.workflows.join(', ') || 'n/a'}
                    </p>
                  </div>
                  <div className="eval-inline-actions">
                    <span className="eval-pill active">
                      effective {formatScore(item.avgEffectiveScore)}
                    </span>
                    <span className="eval-pill neutral">
                      judged {formatScore(item.avgJudgedScore)}
                    </span>
                    <span className="eval-pill neutral">
                      auto {formatScore(item.avgAutomaticScore)}
                    </span>
                    <span className="eval-pill neutral">
                      manual {formatScore(item.avgManualScore)}
                    </span>
                    <span className="eval-pill neutral">
                      judged {item.judgedObservations}/{item.observations}
                    </span>
                    <span
                      className={`eval-pill ${item.reviewRate >= 0.35 ? 'warning' : 'neutral'}`}
                    >
                      review {formatPercent(item.reviewRate)}
                    </span>
                    {typeof item.recentScoreDelta === 'number' ? (
                      <span
                        className={`eval-pill ${item.recentScoreDelta < -0.12 ? 'warning' : 'neutral'}`}
                      >
                        delta {item.recentScoreDelta.toFixed(2)}
                      </span>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </article>

        <article className="eval-card">
          <div className="eval-section-heading">
            <h3>Runtime-Served Observations</h3>
            <p>
              Experiment allocations captured during real workflow execution, even before manual
              step review.
            </p>
          </div>
          {runtimeServedRuns.length === 0 ? (
            <div className="eval-empty">No runtime-served experiment observations yet.</div>
          ) : (
            <div className="eval-list">
              {runtimeServedRuns.slice(0, 50).map((run) => (
                <div key={run.experimentRunId} className="eval-list-item eval-list-item--stacked">
                  <div>
                    <strong>{run.agentName}</strong>
                    <p>
                      {run.workflowType} · step {run.stepIndex + 1} ·{' '}
                      {run.experiment?.name ?? run.experimentId}
                    </p>
                    <p>
                      variant {run.runtimeVariantName ?? run.variant?.name ?? run.variantId} · mode{' '}
                      {run.runtimeExperimentAllocationMode ?? 'runtime'}
                    </p>
                    <p>
                      run {run.runId.slice(0, 8)}
                      {run.workflowRun?.status ? ` · ${run.workflowRun.status}` : ''}
                      {typeof run.runResult?.aggregateScore === 'number'
                        ? ` · run score ${formatScore(run.runResult.aggregateScore)}`
                        : ''}
                    </p>
                  </div>
                  <div className="eval-inline-actions">
                    <span className="eval-pill active">
                      score {formatScore(run.effectiveScore)}
                    </span>
                    <span className={`eval-pill ${run.effectiveReview ? 'warning' : 'ok'}`}>
                      {run.effectiveReview ? 'pending review' : run.outcome}
                    </span>
                    {run.variantStatsAppliedAtMs ? (
                      <span className="eval-pill neutral">variant updated</span>
                    ) : (
                      <span className="eval-pill neutral">awaiting stats</span>
                    )}
                    {run.linkedRecord ? (
                      <span className="eval-pill neutral">linked exact capture</span>
                    ) : (
                      <span className="eval-pill neutral">no saved step record</span>
                    )}
                    <button
                      type="button"
                      className="eval-refresh-button"
                      disabled={linkingRuntimeObservationId === run.experimentRunId}
                      onClick={() => handleOpenRuntimeObservation(run)}
                    >
                      {linkingRuntimeObservationId === run.experimentRunId
                        ? 'Opening...'
                        : run.linkedRecord
                          ? 'Open Exact Capture'
                          : 'Create Exact Capture'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </article>
      </section>

      <section className="eval-split-grid">
        <article className="eval-card">
          <div className="eval-section-heading">
            <h3>Recorded Agent Evals</h3>
            <p>
              Persisted step captures with exact prompt/context/handoff payloads and experiment
              linkage.
            </p>
          </div>
          <div className="eval-inline-actions">
            <span className="eval-pill neutral">{filteredRecords.length} records</span>
            <span className="eval-pill neutral">{unjudgedRecordCount} unjudged</span>
            <button
              type="button"
              className="eval-refresh-button"
              disabled={batchJudgeState.active || prioritizedRecords.length === 0}
              onClick={() => void handleBatchEvaluateSavedSteps(prioritizedRecords.slice(0, 5))}
            >
              {batchJudgeState.active
                ? `Judging ${batchJudgeState.completed}/${batchJudgeState.total}`
                : 'Judge Top 5 High-Risk'}
            </button>
            <button
              type="button"
              className="eval-refresh-button"
              disabled={batchJudgeState.active || unjudgedRecordCount === 0}
              onClick={() =>
                void handleBatchEvaluateSavedSteps(
                  prioritizedRecords.filter(
                    (record) => typeof record.stepJudgeAggregateScore !== 'number'
                  )
                )
              }
            >
              Judge All Unjudged
            </button>
          </div>
          {batchJudgeState.active ? (
            <p className="eval-shell__small">
              judging {batchJudgeState.completed + 1} of {batchJudgeState.total}
              {batchJudgeState.currentRecordId
                ? ` · ${batchJudgeState.currentRecordId.slice(0, 8)}`
                : ''}
            </p>
          ) : null}
          <div className="eval-list">
            {filteredRecords.length === 0 ? (
              <div className="eval-empty">No agent eval records saved yet.</div>
            ) : (
              prioritizedRecords.slice(0, 50).map((record) => (
                <button
                  key={record.recordId}
                  type="button"
                  className={`eval-list-item eval-list-item--stacked ${selectedRecord?.recordId === record.recordId ? 'eval-record-item--selected' : ''}`}
                  onClick={() => setSelectedRecordId(record.recordId)}
                >
                  <div>
                    <strong>{record.agentName}</strong>
                    <p>
                      {record.workflowType} · step {record.stepIndex + 1} · effective{' '}
                      {formatScore(getPreferredAgentRecordScore(record))} · auto{' '}
                      {formatScore(record.automaticScore)} · manual{' '}
                      {formatScore(record.manualScore)}
                    </p>
                    <p>{record.contextSummary ?? 'No context summary'}</p>
                    <p>{record.handoffSummary ?? 'No handoff summary'}</p>
                    {record.notes ? <p>{record.notes}</p> : null}
                  </div>
                  <div className="eval-inline-actions">
                    <span className="eval-pill neutral">
                      risk {getRiskScore(record).toFixed(2)}
                    </span>
                    <span className="eval-pill neutral">
                      ctx {shortFingerprint(record.contextFingerprint)}
                    </span>
                    <span className="eval-pill neutral">
                      cfg {shortFingerprint(record.configFingerprint)}
                    </span>
                    <span className="eval-pill neutral">
                      prompt {shortFingerprint(record.promptFingerprint)}
                    </span>
                    {record.runtimeVariantId ? (
                      <span className="eval-pill active">
                        live {record.runtimeVariantName ?? record.runtimeVariantId.slice(0, 8)}
                      </span>
                    ) : null}
                    {record.experimentId ? (
                      <span className="eval-pill active">experiment</span>
                    ) : null}
                    {typeof record.stepJudgeAggregateScore === 'number' ? (
                      <span className="eval-pill active">judged</span>
                    ) : null}
                    {getPreferredAgentRecordReviewFlag(record) ? (
                      <span className="eval-pill warning">review</span>
                    ) : null}
                  </div>
                </button>
              ))
            )}
          </div>
        </article>
      </section>

      <section className="eval-card">
        <div className="eval-section-heading">
          <h3>Exact Capture Review</h3>
          <p>
            Inspect the exact prompt, context, upstream handoff, and output captured at runtime for
            a saved agent step.
          </p>
        </div>
        {!selectedRecord ? (
          <div className="eval-empty">
            Select a saved agent eval record to inspect its exact runtime capture.
          </div>
        ) : (
          <div className="eval-capture-grid">
            <article className="eval-capture-card">
              <h4>System Prompt</h4>
              <p className="eval-shell__small">
                fingerprint {shortFingerprint(selectedRecord.promptFingerprint)}
                {selectedRecord.promptTruncated ? ' · truncated' : ''}
              </p>
              <pre className="eval-code-block">
                {selectedRecord.effectiveSystemPrompt ?? 'No exact system prompt captured.'}
              </pre>
            </article>
            <article className="eval-capture-card">
              <h4>User Prompt</h4>
              <pre className="eval-code-block">
                {selectedRecord.userPrompt ?? 'No exact user prompt captured.'}
              </pre>
            </article>
            <article className="eval-capture-card">
              <h4>Context Payload</h4>
              <p className="eval-shell__small">
                fingerprint {shortFingerprint(selectedRecord.contextFingerprint)}
                {selectedRecord.contextTruncated ? ' · truncated' : ''}
              </p>
              <pre className="eval-code-block">
                {selectedRecord.exactContextPayload ??
                  selectedRecord.contextSummary ??
                  'No exact context payload captured.'}
              </pre>
            </article>
            <article className="eval-capture-card">
              <h4>Upstream Handoff</h4>
              <p className="eval-shell__small">
                {selectedRecord.handoffTruncated ? 'truncated · ' : ''}
                upstream {selectedRecord.upstreamAgentId ?? 'n/a'}
              </p>
              <pre className="eval-code-block">
                {selectedRecord.exactUpstreamHandoffPayload ??
                  selectedRecord.handoffSummary ??
                  'No exact upstream handoff captured.'}
              </pre>
            </article>
            <article className="eval-capture-card">
              <h4>Output Snapshot</h4>
              <p className="eval-shell__small">
                output hash {shortFingerprint(selectedRecord.outputHash)}
                {selectedRecord.outputTruncated ? ' · truncated' : ''}
              </p>
              <pre className="eval-code-block">
                {selectedRecord.outputSnapshot ?? 'No output snapshot captured.'}
              </pre>
            </article>
            <article className="eval-capture-card">
              <h4>Judgment</h4>
              <div className="eval-inline-actions">
                <span className="eval-pill neutral">
                  auto {formatScore(selectedRecord.automaticScore)}
                </span>
                <span className="eval-pill neutral">
                  manual {formatScore(selectedRecord.manualScore)}
                </span>
                {selectedRecord.runtimeVariantId ? (
                  <span className="eval-pill active">
                    {selectedRecord.runtimeExperimentAllocationMode ?? 'runtime'}{' '}
                    {selectedRecord.runtimeVariantName ??
                      selectedRecord.runtimeVariantId.slice(0, 8)}
                  </span>
                ) : null}
                {selectedRecord.requiresReview ? (
                  <span className="eval-pill warning">review</span>
                ) : (
                  <span className="eval-pill ok">ok</span>
                )}
              </div>
              <p>{selectedRecord.automaticJudgeSummary ?? 'No automatic judgment summary.'}</p>
              <div className="eval-inline-actions">
                {Object.entries(selectedRecord.automaticJudgeBreakdown ?? {}).map(
                  ([label, value]) => (
                    <span key={label} className="eval-pill neutral">
                      {label} {value.toFixed(2)}
                    </span>
                  )
                )}
              </div>
              <div className="eval-form-actions">
                <button
                  type="button"
                  className="eval-refresh-button"
                  disabled={judgingRecordId === selectedRecord.recordId || batchJudgeState.active}
                  onClick={() => void handleEvaluateSavedStep()}
                >
                  {judgingRecordId === selectedRecord.recordId
                    ? 'Judging...'
                    : 'Run Exact Step Judge'}
                </button>
              </div>
              {typeof selectedRecord.stepJudgeAggregateScore === 'number' ? (
                <>
                  <div className="eval-inline-actions">
                    <span className="eval-pill active">
                      step judge {formatScore(selectedRecord.stepJudgeAggregateScore)}
                    </span>
                    <span className="eval-pill neutral">
                      {selectedRecord.stepJudgeJudgeProvider ?? 'n/a'} /{' '}
                      {selectedRecord.stepJudgeJudgeModel ?? 'n/a'}
                    </span>
                    {selectedRecord.stepJudgeRequiresHumanReview ? (
                      <span className="eval-pill warning">human review</span>
                    ) : null}
                    {typeof selectedRecord.stepJudgeScoreVariance === 'number' ? (
                      <span className="eval-pill neutral">
                        variance {selectedRecord.stepJudgeScoreVariance.toFixed(2)}
                      </span>
                    ) : null}
                  </div>
                  <p>{selectedRecord.stepJudgeReasoning ?? 'No step-judge reasoning captured.'}</p>
                  <div className="eval-inline-actions">
                    {Object.entries(selectedRecord.stepJudgeCriterionScores ?? {}).map(
                      ([label, value]) => (
                        <span key={label} className="eval-pill neutral">
                          {label} {value.toFixed(2)}
                        </span>
                      )
                    )}
                  </div>
                </>
              ) : null}
            </article>
          </div>
        )}
      </section>
    </div>
  )
}
