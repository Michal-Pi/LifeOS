import { getFirestore } from 'firebase-admin/firestore'
import type { AgentConfig, Experiment, PromptVariant } from '@lifeos/agents'
import { EvaluationPaths } from '../shared/collectionPaths.js'
import { createLogger } from '../../lib/logger.js'

const logger = createLogger('RuntimeExperimentAllocator')

function sampleBeta(alpha: number, beta: number): number {
  const gammaA = sampleGamma(alpha)
  const gammaB = sampleGamma(beta)
  return gammaA / (gammaA + gammaB)
}

function sampleGamma(shape: number): number {
  if (shape < 1) {
    return sampleGamma(shape + 1) * Math.pow(Math.random(), 1 / shape)
  }

  const d = shape - 1 / 3
  const c = 1 / Math.sqrt(9 * d)

  while (true) {
    let x: number
    let v: number

    do {
      x = normalRandom()
      v = 1 + c * x
    } while (v <= 0)

    v = v * v * v
    const u = Math.random()

    if (u < 1 - 0.0331 * (x * x) * (x * x)) {
      return d * v
    }

    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) {
      return d * v
    }
  }
}

function normalRandom(): number {
  const u1 = Math.random()
  const u2 = Math.random()
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
}

function workflowMatches(scopeWorkflowType: string | undefined, workflowType: string | undefined) {
  if (!scopeWorkflowType) return true
  if (!workflowType) return false
  return scopeWorkflowType === workflowType
}

function rankScopedExperiment(left: Experiment, right: Experiment, workflowType?: string) {
  const leftScoped = workflowMatches(left.workflowType, workflowType) ? 1 : 0
  const rightScoped = workflowMatches(right.workflowType, workflowType) ? 1 : 0
  if (leftScoped !== rightScoped) return rightScoped - leftScoped
  return right.createdAtMs - left.createdAtMs
}

function pickVariantThompson(variants: PromptVariant[]): PromptVariant | null {
  const activeVariants = variants.filter((variant) => variant.status === 'active')
  if (activeVariants.length === 0) return null

  let bestVariant = activeVariants[0] ?? null
  let bestSample = -Infinity
  for (const variant of activeVariants) {
    const sample = sampleBeta(variant.alpha, variant.beta)
    if (sample > bestSample) {
      bestSample = sample
      bestVariant = variant
    }
  }
  return bestVariant
}

export interface RuntimeExperimentAllocation {
  experimentId: string
  variantId: string
  variantName: string
  allocationMode: 'thompson' | 'winner'
  appliedPromptTemplate?: string
  appliedSystemPrompt?: string
}

export async function allocateRuntimePromptVariant(params: {
  userId: string
  agent: AgentConfig
  workflowType?: string
}): Promise<RuntimeExperimentAllocation | null> {
  try {
    const { userId, agent, workflowType } = params
    const db = getFirestore()

    const runningExperimentsSnapshot = await db
      .collection(EvaluationPaths.experiments(userId))
      .where('status', '==', 'running')
      .get()

    const runningExperiments = runningExperimentsSnapshot.docs
      .map((doc) => doc.data() as Experiment)
      .filter(
        (experiment) =>
          (!experiment.agentId || experiment.agentId === agent.agentId) &&
          workflowMatches(experiment.workflowType, workflowType)
      )
      .sort((left, right) => rankScopedExperiment(left, right, workflowType))

    const runningExperimentIds = runningExperiments.map((experiment) => experiment.experimentId)
    const candidateVariantsSnapshot =
      runningExperimentIds.length > 0
        ? await db
            .collection(EvaluationPaths.variants(userId))
            .where('agentId', '==', agent.agentId)
            .get()
        : null
    const candidateVariants = candidateVariantsSnapshot
      ? candidateVariantsSnapshot.docs
          .map((doc) => doc.data() as PromptVariant)
          .filter(
            (variant) =>
              runningExperimentIds.includes(variant.experimentId) &&
              workflowMatches(variant.workflowType, workflowType)
          )
      : []

    for (const experiment of runningExperiments) {
      const variants = candidateVariants.filter(
        (variant) => variant.experimentId === experiment.experimentId
      )
      const selected = pickVariantThompson(variants)
      if (selected) {
        return {
          experimentId: experiment.experimentId,
          variantId: selected.variantId,
          variantName: selected.name,
          allocationMode: 'thompson',
          appliedPromptTemplate: selected.promptTemplate,
          appliedSystemPrompt: selected.systemPrompt,
        }
      }
    }

    const winnersSnapshot = await db
      .collection(EvaluationPaths.variants(userId))
      .where('agentId', '==', agent.agentId)
      .where('status', '==', 'winner')
      .get()

    const winnerVariants = winnersSnapshot.docs
      .map((doc) => doc.data() as PromptVariant)
      .filter((variant) => workflowMatches(variant.workflowType, workflowType))
      .sort((left, right) => {
        const leftScoped = workflowMatches(left.workflowType, workflowType) ? 1 : 0
        const rightScoped = workflowMatches(right.workflowType, workflowType) ? 1 : 0
        if (leftScoped !== rightScoped) return rightScoped - leftScoped
        return (right.promotedAtMs ?? right.updatedAtMs) - (left.promotedAtMs ?? left.updatedAtMs)
      })

    const winner = winnerVariants[0]
    if (!winner) return null

    return {
      experimentId: winner.experimentId,
      variantId: winner.variantId,
      variantName: winner.name,
      allocationMode: 'winner',
      appliedPromptTemplate: winner.promptTemplate,
      appliedSystemPrompt: winner.systemPrompt,
    }
  } catch (error) {
    logger.warn('Falling back to base prompt execution', {
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}
