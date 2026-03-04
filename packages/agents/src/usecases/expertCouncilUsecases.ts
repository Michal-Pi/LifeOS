/**
 * Expert Council Usecases
 *
 * Pipeline orchestration helpers, cost estimation, caching, and ranking metrics.
 */

import type {
  ExpertCouncilConfig,
  ExpertCouncilTurn,
  ExecutionMode,
  ModelProvider,
  RunId,
  WorkflowId,
} from '../domain/models'
import type { ExpertCouncilRepository } from '../ports/expertCouncilRepository'

type ModelLike = {
  modelId: string
  provider: ModelProvider
  modelName: string
}

export type ModelCostResolver = (models: ModelLike[]) => number

export interface ExpertCouncilPipeline {
  execute(
    userId: string,
    runId: RunId,
    prompt: string,
    config: ExpertCouncilConfig,
    mode: ExecutionMode
  ): Promise<ExpertCouncilTurn>
}

const QUICK_MODE_COST_FACTOR = 0.5
const SINGLE_MODE_COST_FACTOR = 0.3

/**
 * Estimate total cost for a council run. If a resolver isn't supplied,
 * fall back to the config's estimatedCostPerTurn with mode scaling.
 */
export function estimateCouncilCost(
  config: ExpertCouncilConfig,
  mode: ExecutionMode,
  getModelCost?: ModelCostResolver
): number {
  if (!getModelCost) {
    if (config.estimatedCostPerTurn === undefined) {
      return 0
    }
    if (mode === 'quick') {
      return config.estimatedCostPerTurn * QUICK_MODE_COST_FACTOR
    }
    if (mode === 'single') {
      return config.estimatedCostPerTurn * SINGLE_MODE_COST_FACTOR
    }
    return config.estimatedCostPerTurn
  }

  const stage1Cost = getModelCost(config.councilModels)
  const stage2Cost = mode === 'full' ? getModelCost(config.judgeModels ?? config.councilModels) : 0
  const stage3Cost = mode === 'full' || mode === 'quick' ? getModelCost([config.chairmanModel]) : 0

  return stage1Cost + stage2Cost + stage3Cost
}

function hashString(input: string): string {
  // FNV-1a for deterministic cache keys without platform-specific crypto.
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16)
}

function generateTurnId(): string {
  const cryptoRef = typeof crypto !== 'undefined' ? crypto : undefined
  if (cryptoRef?.randomUUID) {
    return `council-turn:${cryptoRef.randomUUID()}`
  }
  return `council-turn:${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export function generateCacheKey(
  userId: string,
  prompt: string,
  config: ExpertCouncilConfig,
  executionMode: ExecutionMode,
  workflowId?: WorkflowId,
  contextHash?: string
): string {
  const normalized = prompt.trim().toLowerCase()
  const scope = workflowId ? `user:${userId}:workflow:${workflowId}` : `user:${userId}`
  const councilModels = config.councilModels
    .map((model) =>
      [
        model.modelId,
        model.provider,
        model.modelName,
        model.temperature ?? '',
        model.maxTokens ?? '',
        model.systemPrompt ?? '',
      ].join('|')
    )
    .sort()
    .join(',')
  const judgeModels = (config.judgeModels ?? config.councilModels)
    .map((model) => [model.modelId, model.provider, model.modelName].join('|'))
    .sort()
    .join(',')
  const chairmanModel = [
    config.chairmanModel.modelId,
    config.chairmanModel.provider,
    config.chairmanModel.modelName,
    config.chairmanModel.temperature ?? '',
    config.chairmanModel.maxTokens ?? '',
  ].join('|')
  const consensusSettings = [
    config.selfExclusionEnabled,
    config.minCouncilSize,
    config.maxCouncilSize,
    config.requireConsensusThreshold ?? '',
  ].join('|')
  const hash = hashString(
    [
      scope,
      normalized,
      executionMode,
      contextHash ?? '',
      councilModels,
      judgeModels,
      chairmanModel,
      consensusSettings,
    ].join('::')
  )
  return `council:${hash}`
}

// ----- Phase 20: Normalized Prompt Cache -----

const FILLER_WORDS =
  /\b(please|can you|could you|i want to|i need|i'd like|help me|tell me|give me|show me|explain)\b/gi

/**
 * Normalize a prompt for cache matching.
 * Catches near-identical prompts by lowercasing, stripping filler words,
 * collapsing whitespace, and trimming to 500 chars.
 */
export function normalizePromptForCache(prompt: string): string {
  return prompt
    .toLowerCase()
    .replace(FILLER_WORDS, '')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 500)
}

export function calculateBordaScores(
  reviews: Array<{ ranking: string[] }>,
  labels: string[]
): Record<string, number> {
  const { normalizedLabels, normalizedReviews } = normalizeRankings(reviews, labels, 'borda')
  const scores: Record<string, number> = {}
  const n = normalizedLabels.length

  normalizedLabels.forEach((label) => {
    scores[label] = 0
  })

  normalizedReviews.forEach((review) => {
    review.ranking.forEach((label, position) => {
      scores[label] += n - position
    })
  })

  return scores
}

function buildIndexMap(ranking: string[]): Map<string, number> {
  const indexMap = new Map<string, number>()
  ranking.forEach((label, index) => {
    indexMap.set(label, index)
  })
  return indexMap
}

function normalizeRankings(
  reviews: Array<{ ranking: string[] }>,
  labels?: string[],
  context?: string
): {
  normalizedLabels: string[]
  normalizedReviews: Array<{ ranking: string[] }>
  normalizedIndexMaps: Array<Map<string, number>>
} {
  if (reviews.length === 0) {
    return {
      normalizedLabels: labels ?? [],
      normalizedReviews: [],
      normalizedIndexMaps: [],
    }
  }

  const indexMaps = reviews.map((review) => buildIndexMap(review.ranking))
  let normalizedLabels = labels ? [...labels] : [...reviews[0].ranking]

  if (!labels) {
    for (let i = 1; i < reviews.length; i += 1) {
      const rankingSet = new Set(reviews[i].ranking)
      normalizedLabels = normalizedLabels.filter((label) => rankingSet.has(label))
    }
  } else {
    normalizedLabels = normalizedLabels.filter((label) => indexMaps.every((map) => map.has(label)))
  }

  if (labels && normalizedLabels.length !== labels.length) {
    const missingLabelCount = labels.length - normalizedLabels.length
    console.warn(
      `ExpertCouncil rankings incomplete (${context ?? 'ranking'}): ` +
        `${missingLabelCount} label(s) missing across reviews; scoring uses intersection set.`
    )
  }

  const normalizedLabelSet = new Set(normalizedLabels)
  if (
    !labels &&
    reviews.some((review) => review.ranking.some((label) => !normalizedLabelSet.has(label)))
  ) {
    console.warn(
      `ExpertCouncil rankings incomplete (${context ?? 'ranking'}): ` +
        `rankings differ; scoring uses intersection set.`
    )
  }
  const normalizedReviews = reviews.map((review) => ({
    ranking: review.ranking.filter((label) => normalizedLabelSet.has(label)),
  }))
  const normalizedIndexMaps = normalizedReviews.map((review) => buildIndexMap(review.ranking))

  return { normalizedLabels, normalizedReviews, normalizedIndexMaps }
}

export function calculateKendallTau(ranking1: string[], ranking2: string[]): number {
  let concordant = 0
  let discordant = 0
  const ranking2Index = buildIndexMap(ranking2)

  for (let i = 0; i < ranking1.length; i += 1) {
    for (let j = i + 1; j < ranking1.length; j += 1) {
      const item1 = ranking1[i]
      const item2 = ranking1[j]

      const pos1 = ranking2Index.get(item1)
      const pos2 = ranking2Index.get(item2)

      if (pos1 === undefined || pos2 === undefined) {
        continue
      }

      if (pos1 < pos2) {
        concordant += 1
      } else {
        discordant += 1
      }
    }
  }

  const totalPairs = (ranking1.length * (ranking1.length - 1)) / 2
  return totalPairs === 0 ? 0 : (concordant - discordant) / totalPairs
}

export function calculateConsensusScore(reviews: Array<{ ranking: string[] }>): number {
  if (reviews.length < 2) return 100

  const { normalizedReviews } = normalizeRankings(reviews, undefined, 'consensus')
  if (normalizedReviews.length < 2 || normalizedReviews[0].ranking.length < 2) {
    return 0
  }

  let totalTau = 0
  let pairCount = 0

  for (let i = 0; i < normalizedReviews.length; i += 1) {
    for (let j = i + 1; j < normalizedReviews.length; j += 1) {
      totalTau += calculateKendallTau(normalizedReviews[i].ranking, normalizedReviews[j].ranking)
      pairCount += 1
    }
  }

  const avgTau = pairCount === 0 ? 0 : totalTau / pairCount
  return ((avgTau + 1) / 2) * 100
}

export function findControversialResponses(
  aggregateRanking: Array<{
    label: string
    individualRanks: number[]
    standardDeviation: number
  }>,
  threshold = 1.5
): string[] {
  return aggregateRanking
    .filter((item) => item.standardDeviation > threshold)
    .map((item) => item.label)
}

export function buildAggregateRanking(
  reviews: Array<{ ranking: string[] }>,
  labels: string[],
  labelToModelId: Record<string, string>
): {
  ranking: ExpertCouncilTurn['stage2']['aggregateRanking']
  excludedLabels: string[]
  completeness: number
} {
  const { normalizedLabels, normalizedReviews, normalizedIndexMaps } = normalizeRankings(
    reviews,
    labels,
    'aggregate'
  )
  const scores = calculateBordaScores(normalizedReviews, normalizedLabels)
  const excludedLabels = labels.filter((label) => !normalizedLabels.includes(label))
  const completeness = labels.length > 0 ? (normalizedLabels.length / labels.length) * 100 : 100

  const ranking = normalizedLabels
    .map((label) => {
      const individualRanks = normalizedIndexMaps.map((indexMap) => indexMap.get(label)! + 1)
      const averageRank =
        individualRanks.reduce((total, value) => total + value, 0) / individualRanks.length
      const variance =
        individualRanks.reduce((total, value) => total + (value - averageRank) ** 2, 0) /
        individualRanks.length
      const standardDeviation = Math.sqrt(variance)

      return {
        label,
        modelId: labelToModelId[label],
        bordaScore: scores[label] ?? 0,
        averageRank,
        individualRanks,
        standardDeviation,
      }
    })
    .sort((a, b) => b.bordaScore - a.bordaScore)

  return { ranking, excludedLabels, completeness }
}

export function calculateAverageKendallTau(reviews: Array<{ ranking: string[] }>): number {
  if (reviews.length < 2) return 1

  const { normalizedReviews } = normalizeRankings(reviews, undefined, 'kendall')
  if (normalizedReviews.length < 2 || normalizedReviews[0].ranking.length < 2) {
    return 0
  }

  let totalTau = 0
  let pairCount = 0

  for (let i = 0; i < normalizedReviews.length; i += 1) {
    for (let j = i + 1; j < normalizedReviews.length; j += 1) {
      totalTau += calculateKendallTau(normalizedReviews[i].ranking, normalizedReviews[j].ranking)
      pairCount += 1
    }
  }

  return pairCount === 0 ? 0 : totalTau / pairCount
}

export function executeExpertCouncilUsecase(
  repository: ExpertCouncilRepository,
  pipeline: ExpertCouncilPipeline,
  getModelCost?: ModelCostResolver
) {
  return async (
    userId: string,
    runId: RunId,
    prompt: string,
    config: ExpertCouncilConfig,
    mode?: ExecutionMode,
    workflowId?: WorkflowId,
    contextHash?: string
  ): Promise<ExpertCouncilTurn> => {
    const executionMode = config.allowModeOverride
      ? (mode ?? config.defaultMode)
      : config.defaultMode

    const cacheKey = generateCacheKey(
      userId,
      prompt,
      config,
      executionMode,
      workflowId,
      contextHash
    )
    if (config.enableCaching) {
      // Phase 20: Check both exact and normalized cache keys
      const normalizedKey = generateCacheKey(
        userId,
        normalizePromptForCache(prompt),
        config,
        executionMode,
        workflowId,
        contextHash
      )
      const keysToCheck = normalizedKey !== cacheKey ? [cacheKey, normalizedKey] : [cacheKey]

      for (const key of keysToCheck) {
        const cached = await repository.getCachedTurn(userId, key)
        if (cached) {
          const cachedTurnId = cached.turnId
          const turnId = generateTurnId()
          const cachedTurn = {
            ...cached,
            turnId,
            sourceTurnId: cached.sourceTurnId ?? cachedTurnId,
            runId,
            createdAtMs: Date.now(),
            cacheHit: true,
          }
          await repository.createTurn(userId, cachedTurn)
          return cachedTurn
        }
      }
    }

    const estimatedCost = estimateCouncilCost(config, executionMode, getModelCost)
    if (config.maxCostPerTurn !== undefined && estimatedCost > config.maxCostPerTurn) {
      throw new Error(
        `Estimated cost $${estimatedCost.toFixed(2)} exceeds limit $${config.maxCostPerTurn.toFixed(2)}`
      )
    }

    const turn = await pipeline.execute(userId, runId, prompt, config, executionMode)

    if (config.enableCaching) {
      // Phase 20: Store under both exact and normalized keys
      await repository.setCachedTurn(userId, cacheKey, turn, config.cacheExpirationHours)
      const normalizedKey = generateCacheKey(
        userId,
        normalizePromptForCache(prompt),
        config,
        executionMode,
        workflowId,
        contextHash
      )
      if (normalizedKey !== cacheKey) {
        await repository.setCachedTurn(userId, normalizedKey, turn, config.cacheExpirationHours)
      }
    }

    await repository.createTurn(userId, turn)

    return turn
  }
}
