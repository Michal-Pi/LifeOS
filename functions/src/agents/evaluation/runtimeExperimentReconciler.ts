import { getFirestore } from 'firebase-admin/firestore'
import type { ComponentTelemetry, PromptVariant, Run, RunId } from '@lifeos/agents'
import { EvaluationPaths } from '../shared/collectionPaths.js'
import { getComponentTelemetryByType } from '../telemetry/componentTelemetry.js'

type RuntimeAllocation = {
  stepIndex: number
  agentId: string
  agentName?: string
  experimentId: string
  variantId: string
  variantName?: string
  allocationMode?: 'thompson' | 'winner'
}

type AgentExperimentRunDoc = {
  experimentRunId: string
  userId: string
  experimentId: string
  variantId: string
  runId: string
  workflowType: string
  agentId: string
  agentName: string
  stepIndex: number
  score?: number | null
  outcome: 'passed' | 'failed' | 'pending_review'
  requiresReview?: boolean
  evaluatedAtMs?: number | null
  variantStatsAppliedAtMs?: number | null
  createdAtMs: number
  updatedAtMs: number
}

function deriveRuntimeAllocations(telemetry: ComponentTelemetry[]): RuntimeAllocation[] {
  const deduped = new Map<string, RuntimeAllocation>()
  for (const entry of telemetry) {
    const metadata = (entry.metadata ?? {}) as Record<string, unknown>
    const experimentId =
      typeof metadata.runtimeExperimentId === 'string' ? metadata.runtimeExperimentId : null
    const variantId =
      typeof metadata.runtimeVariantId === 'string' ? metadata.runtimeVariantId : null
    if (!experimentId || !variantId) continue
    const allocation: RuntimeAllocation = {
      stepIndex: entry.stepIndex,
      agentId: entry.componentId,
      agentName: entry.componentName,
      experimentId,
      variantId,
      variantName:
        typeof metadata.runtimeVariantName === 'string' ? metadata.runtimeVariantName : undefined,
      allocationMode:
        metadata.runtimeExperimentAllocationMode === 'thompson' ||
        metadata.runtimeExperimentAllocationMode === 'winner'
          ? metadata.runtimeExperimentAllocationMode
          : undefined,
    }
    deduped.set(`${allocation.stepIndex}:${allocation.variantId}`, allocation)
  }
  return Array.from(deduped.values()).sort((left, right) => left.stepIndex - right.stepIndex)
}

function deriveRunScore(
  run: Run,
  allocationCount: number
): { score: number | null; requiresReview: boolean } {
  if (allocationCount > 1) {
    return {
      score: null,
      requiresReview: true,
    }
  }

  const evaluationScores = (
    run as Run & {
      evaluationScores?: { relevance?: number; completeness?: number; accuracy?: number }
    }
  ).evaluationScores
  if (
    evaluationScores &&
    typeof evaluationScores.relevance === 'number' &&
    typeof evaluationScores.completeness === 'number' &&
    typeof evaluationScores.accuracy === 'number'
  ) {
    const normalized =
      (evaluationScores.relevance + evaluationScores.completeness + evaluationScores.accuracy) / 15
    return {
      score: Number(normalized.toFixed(3)),
      requiresReview: false,
    }
  }

  if (run.status === 'failed') {
    return { score: 0, requiresReview: false }
  }

  return { score: null, requiresReview: true }
}

function computeVariantStats(scores: number[]) {
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

async function applyVariantScore(params: {
  userId: string
  variantId: string
  score: number
  passed: boolean
}) {
  const db = getFirestore()
  const variantRef = db.doc(EvaluationPaths.variant(params.userId, params.variantId))

  await db.runTransaction(async (txn) => {
    const snapshot = await txn.get(variantRef)
    if (!snapshot.exists) return
    const variant = snapshot.data() as PromptVariant
    const scores = [...variant.scores, params.score].slice(-50)
    const stats = computeVariantStats(scores)
    txn.update(variantRef, {
      sampleCount: variant.sampleCount + 1,
      successCount: variant.successCount + (params.passed ? 1 : 0),
      failedCount: variant.failedCount + (params.passed ? 0 : 1),
      totalScore: Number((variant.totalScore + params.score).toFixed(3)),
      avgScore: stats.avgScore,
      scoreVariance: stats.scoreVariance,
      scores,
      alpha: variant.alpha + (params.passed ? 1 : 0),
      beta: variant.beta + (params.passed ? 0 : 1),
      updatedAtMs: Date.now(),
    })
  })
}

export async function reconcileRuntimeExperimentsForRun(params: {
  userId: string
  runId: string
  run: Run
}): Promise<void> {
  const { userId, runId, run } = params
  const db = getFirestore()
  const workflowType =
    (run as unknown as { workflowType?: string }).workflowType ??
    (typeof (run.context as Record<string, unknown> | undefined)?.workflowType === 'string'
      ? ((run.context as Record<string, unknown>).workflowType as string)
      : 'unknown')
  const agentTelemetry = await getComponentTelemetryByType(userId, runId as RunId, 'agent')
  const allocations = deriveRuntimeAllocations(agentTelemetry)
  if (allocations.length === 0) return

  const { score, requiresReview } = deriveRunScore(run, allocations.length)
  const now = Date.now()

  for (const allocation of allocations) {
    const experimentRunId = `${runId}__${allocation.stepIndex}__${allocation.variantId}`
    const experimentRunRef = db.doc(EvaluationPaths.agentExperimentRun(userId, experimentRunId))
    const existingSnapshot = await experimentRunRef.get()
    const existing = existingSnapshot.exists
      ? (existingSnapshot.data() as AgentExperimentRunDoc)
      : null

    const outcome: AgentExperimentRunDoc['outcome'] =
      score === null ? 'pending_review' : score >= 0.65 ? 'passed' : 'failed'

    await experimentRunRef.set(
      {
        experimentRunId,
        userId,
        experimentId: allocation.experimentId,
        variantId: allocation.variantId,
        runId,
        workflowType,
        agentId: allocation.agentId,
        agentName: allocation.agentName ?? allocation.agentId,
        stepIndex: allocation.stepIndex,
        score,
        outcome,
        requiresReview,
        evaluatedAtMs: score === null ? null : now,
        runtimeVariantName: allocation.variantName,
        runtimeExperimentAllocationMode: allocation.allocationMode ?? null,
        updatedAtMs: now,
        createdAtMs: existing?.createdAtMs ?? now,
      },
      { merge: true }
    )

    if (score === null || existing?.variantStatsAppliedAtMs) {
      continue
    }

    const passed = score >= 0.65
    await applyVariantScore({
      userId,
      variantId: allocation.variantId,
      score,
      passed,
    })
    await experimentRunRef.set(
      {
        variantStatsAppliedAtMs: now,
        updatedAtMs: Date.now(),
      },
      { merge: true }
    )
  }
}
