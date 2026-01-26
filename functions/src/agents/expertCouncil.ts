import { randomUUID } from 'crypto'
import {
  buildAggregateRanking,
  calculateAverageKendallTau,
  calculateConsensusScore,
  findControversialResponses,
} from '@lifeos/agents'
import type {
  AgentConfig,
  AgentId,
  CouncilAnalytics,
  ExpertCouncilConfig,
  ExpertCouncilPipeline,
  ExpertCouncilRepository,
  ExpertCouncilTurn,
  ExecutionMode,
  ModelProvider,
  RunId,
  WorkspaceId,
} from '@lifeos/agents'
import { getFirestore } from 'firebase-admin/firestore'

import type { ProviderKeys } from './providerService.js'
import { executeWithProvider, executeWithProviderStreaming } from './providerService.js'
import type { RunEventWriter } from './runEvents.js'

type CouncilModel = ExpertCouncilConfig['councilModels'][number]
type JudgeModel = NonNullable<ExpertCouncilConfig['judgeModels']>[number]

const LABELS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')
const STAGE1_DEFAULT_PROMPT =
  'You are an expert council member. Provide the best possible response to the user prompt.'
const STAGE2_DEFAULT_PROMPT =
  'You are an impartial judge. Critique each response objectively and provide a ranking.'
const STAGE3_DEFAULT_PROMPT =
  'You are the chairman. Synthesize the best possible final response from all inputs.'

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function stableStringify(value: unknown): string {
  if (value === undefined) return 'null'
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value)
  }
  if (value instanceof Date) {
    return JSON.stringify(value.toISOString())
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`
  }
  const record = value as Record<string, unknown>
  const keys = Object.keys(record).sort()
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(',')}}`
}

function hashString(input: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16)
}

export function buildExpertCouncilContextHash(
  context?: Record<string, unknown>
): string | undefined {
  if (!context || Object.keys(context).length === 0) {
    return undefined
  }
  try {
    const serialized = stableStringify(context)
    if (!serialized || serialized === '{}') {
      return undefined
    }
    return hashString(serialized)
  } catch (error) {
    console.warn('Unable to hash Expert Council context.', error)
    return undefined
  }
}

function generateLabels(count: number): string[] {
  return LABELS.slice(0, count)
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

function buildAgentConfig(params: {
  userId: string
  model: {
    modelId: string
    provider: ModelProvider
    modelName: string
    temperature?: number
    maxTokens?: number
    systemPrompt?: string
  }
  role: AgentConfig['role']
  systemPromptFallback: string
  nameSuffix?: string
}): AgentConfig {
  const now = Date.now()
  const nameSuffix = params.nameSuffix ? ` (${params.nameSuffix})` : ''

  const agentId = (
    params.model.modelId.startsWith('agent:')
      ? params.model.modelId
      : `agent:${params.model.modelId}`
  ) as AgentId

  return {
    agentId,
    userId: params.userId,
    name: `${params.model.modelName}${nameSuffix}`,
    role: params.role,
    systemPrompt: params.model.systemPrompt ?? params.systemPromptFallback,
    modelProvider: params.model.provider,
    modelName: params.model.modelName,
    temperature: params.model.temperature,
    maxTokens: params.model.maxTokens,
    toolIds: [],
    description: 'Expert Council',
    archived: false,
    createdAtMs: now,
    updatedAtMs: now,
    syncState: 'synced',
    version: 1,
  }
}

function formatStage1Responses(responses: ExpertCouncilTurn['stage1']['responses']): string {
  return responses
    .filter((response) => response.status === 'completed')
    .map(
      (response) =>
        `Model ${response.modelName} (${response.provider}/${response.modelId}):\n${response.answerText}`
    )
    .join('\n\n')
}

function formatAnonymizedResponses(
  labeledResponses: Array<{
    label: string
    response: ExpertCouncilTurn['stage1']['responses'][number]
  }>
): string {
  return labeledResponses
    .map(({ label, response }) => `Response ${label}:\n${response.answerText}`)
    .join('\n\n')
}

function formatStage2Reviews(reviews: ExpertCouncilTurn['stage2']['reviews']): string {
  return reviews
    .map((review, index) => {
      const critiques = Object.entries(review.critiques)
        .map(([label, critique]) => `${label}: ${critique}`)
        .join('\n')
      const confidence =
        review.confidenceScore !== undefined ? `\nConfidence: ${review.confidenceScore}` : ''
      return `Judge ${index + 1} (${review.judgeModelId}):\n${critiques}\nRanking: ${review.ranking.join(
        ', '
      )}${confidence}`
    })
    .join('\n\n')
}

function formatRankingSummary(
  aggregateRanking: ExpertCouncilTurn['stage2']['aggregateRanking'],
  consensusScore: number
): string {
  if (aggregateRanking.length === 0) {
    return 'No aggregate ranking available.'
  }

  const lines = aggregateRanking.map(
    (entry) =>
      `${entry.label} (${entry.modelId}): Borda ${entry.bordaScore}, Avg rank ${entry.averageRank.toFixed(
        2
      )}`
  )
  return `Consensus score: ${consensusScore.toFixed(1)}\n${lines.join('\n')}`
}

function parseRanking(output: string, labels: string[]): string[] {
  const match =
    output.match(/RANKING\s*:\s*\[([^\]]+)\]/i) ?? output.match(/RANKING\s*:\s*([A-Z,\s]+)/i)

  if (!match) {
    return [...labels]
  }

  const raw = match[1]
  const tokens = raw
    .split(/[,\s]+/)
    .map((token) =>
      token
        .trim()
        .replace(/[^A-Z]/gi, '')
        .toUpperCase()
    )
    .filter(Boolean)

  const ordered: string[] = []
  tokens.forEach((token) => {
    if (labels.includes(token) && !ordered.includes(token)) {
      ordered.push(token)
    }
  })

  labels.forEach((label) => {
    if (!ordered.includes(label)) {
      ordered.push(label)
    }
  })

  return ordered
}

function parseCritiques(output: string, labels: string[]): Record<string, string> {
  const critiques: Record<string, string> = {}
  const lines = output.split('\n')

  lines.forEach((line) => {
    const trimmed = line.trim()
    labels.forEach((label) => {
      const regex = new RegExp(`^(?:Response\\s*)?${label}\\s*:\\s*(.+)$`, 'i')
      const match = trimmed.match(regex)
      if (match && !critiques[label]) {
        critiques[label] = match[1].trim()
      }
    })
  })

  labels.forEach((label) => {
    if (!critiques[label]) {
      critiques[label] = ''
    }
  })

  return critiques
}

function parseConfidenceScore(output: string): number | undefined {
  const match = output.match(/confidence\s*[:-]\s*(\d{1,3})/i)
  if (!match) return undefined
  const value = Number.parseInt(match[1], 10)
  if (Number.isNaN(value) || value < 0 || value > 100) return undefined
  return value
}

function sumCosts(values: Array<number | undefined>): number {
  return values.reduce<number>((total, value) => total + (value ?? 0), 0)
}

export function createExpertCouncilPipeline(params: {
  apiKeys: ProviderKeys
  context?: Record<string, unknown>
  eventWriter?: RunEventWriter
  workspaceId?: string
}): ExpertCouncilPipeline {
  const { apiKeys, context, eventWriter, workspaceId } = params

  const writeStatus = async (status: string): Promise<void> => {
    if (!eventWriter) return
    await eventWriter.writeEvent({
      type: 'status',
      workspaceId,
      status,
    })
  }

  return {
    async execute(
      userId: string,
      runId: string,
      prompt: string,
      config: ExpertCouncilConfig,
      mode: ExecutionMode
    ): Promise<ExpertCouncilTurn> {
      const startMs = Date.now()

      await writeStatus('expert_council_stage1_start')

      const stage1Results = await Promise.all(
        config.councilModels.map(async (model) => {
          const startedAt = Date.now()
          try {
            const agent = buildAgentConfig({
              userId,
              model,
              role: 'researcher',
              systemPromptFallback: STAGE1_DEFAULT_PROMPT,
            })
            const result = await executeWithProvider(agent, prompt, context, apiKeys)
            return {
              modelId: model.modelId,
              provider: model.provider,
              modelName: model.modelName,
              answerText: result.output,
              status: 'completed' as const,
              latency: Date.now() - startedAt,
              tokensUsed: result.tokensUsed,
              estimatedCost: result.estimatedCost,
              timestampMs: Date.now(),
            }
          } catch (error) {
            return {
              modelId: model.modelId,
              provider: model.provider,
              modelName: model.modelName,
              answerText: '',
              status: 'failed' as const,
              error: error instanceof Error ? error.message : String(error),
              latency: Date.now() - startedAt,
              timestampMs: Date.now(),
            }
          }
        })
      )

      const successfulStage1 = stage1Results.filter((result) => result.status === 'completed')
      const hasMinimumStage1 = successfulStage1.length >= config.minCouncilSize

      if (!hasMinimumStage1) {
        throw new Error(
          `Expert Council requires at least ${config.minCouncilSize} successful Stage 1 responses.`
        )
      }

      await writeStatus('expert_council_stage1_complete')

      const stage2Reviews: ExpertCouncilTurn['stage2']['reviews'] = []
      let anonymizationMap: Record<string, string> = {}
      let aggregateRanking: ExpertCouncilTurn['stage2']['aggregateRanking'] = []
      let consensusMetrics: ExpertCouncilTurn['stage2']['consensusMetrics'] = {
        kendallTau: 0,
        consensusScore: 0,
        topRankedLabel: '',
        controversialResponses: [],
      }

      if (hasMinimumStage1 && (mode === 'full' || mode === 'custom')) {
        await writeStatus('expert_council_stage2_start')

        const labels = generateLabels(successfulStage1.length)
        const shuffledResponses = shuffle(successfulStage1)
        const labeledResponses = shuffledResponses.map((response, index) => ({
          label: labels[index],
          response,
        }))
        anonymizationMap = labeledResponses.reduce<Record<string, string>>((acc, entry) => {
          acc[entry.label] = entry.response.modelId
          return acc
        }, {})

        const judgeModels: Array<CouncilModel | JudgeModel> =
          config.judgeModels ?? config.councilModels

        const judgeResults = await Promise.all(
          judgeModels.map(async (judge) => {
            const excludedLabels = config.selfExclusionEnabled
              ? labeledResponses
                  .filter((entry) => entry.response.modelId === judge.modelId)
                  .map((entry) => entry.label)
              : []
            const includedResponses = labeledResponses.filter(
              (entry) => !excludedLabels.includes(entry.label)
            )

            if (includedResponses.length < 2) {
              return { status: 'failed' as const, reason: 'Not enough responses to review.' }
            }

            const reviewPrompt = [
              'You are reviewing responses from multiple AI models. Evaluate each response objectively.',
              '',
              'USER PROMPT:',
              prompt,
              '',
              'RESPONSES TO REVIEW:',
              formatAnonymizedResponses(includedResponses),
              '',
              'Please provide:',
              '1. A brief critique of each response (2-3 sentences)',
              '2. Your final ranking from best to worst (list the response labels in order)',
              '',
              'Format your ranking as:',
              'RANKING: [A, C, B]',
              'Add an optional CONFIDENCE: 0-100 line.',
            ].join('\n')

            const startedAt = Date.now()
            try {
              const agent = buildAgentConfig({
                userId,
                model: {
                  ...judge,
                  systemPrompt: STAGE2_DEFAULT_PROMPT,
                },
                role: 'critic',
                systemPromptFallback: STAGE2_DEFAULT_PROMPT,
                nameSuffix: 'Judge',
              })
              const result = await executeWithProvider(agent, reviewPrompt, undefined, apiKeys)
              const includedLabels = includedResponses.map((entry) => entry.label)
              const ranking = parseRanking(result.output, includedLabels)
              const critiques = parseCritiques(result.output, includedLabels)
              const confidenceScore = parseConfidenceScore(result.output)

              return {
                status: 'completed' as const,
                review: {
                  judgeModelId: judge.modelId,
                  critiques,
                  ranking,
                  confidenceScore,
                  timestampMs: Date.now(),
                  tokensUsed: result.tokensUsed,
                  estimatedCost: result.estimatedCost,
                },
              }
            } catch (error) {
              return {
                status: 'failed' as const,
                reason: error instanceof Error ? error.message : String(error),
                judgeModelId: judge.modelId,
                startedAt,
              }
            }
          })
        )

        const successfulReviews = judgeResults
          .filter((result) => result.status === 'completed')
          .map((result) => result.review)

        const failedCount = judgeResults.length - successfulReviews.length
        const failedRatio = judgeResults.length > 0 ? failedCount / judgeResults.length : 1

        if (failedRatio > 0.5 || successfulReviews.length < 2) {
          await writeStatus('expert_council_stage2_skipped')
        } else {
          stage2Reviews.push(...successfulReviews)

          const allLabels = labels
          const filledReviews = successfulReviews.map((review) => {
            const missingLabels = allLabels.filter((label) => !review.ranking.includes(label))
            return {
              ranking: [...review.ranking, ...missingLabels],
            }
          })

          const aggregateResult = buildAggregateRanking(filledReviews, allLabels, anonymizationMap)
          aggregateRanking = aggregateResult.ranking

          const kendallTau = calculateAverageKendallTau(filledReviews)
          const consensusScore = calculateConsensusScore(filledReviews)
          const topRankedLabel = aggregateRanking[0]?.label ?? ''
          const controversialResponses = findControversialResponses(aggregateRanking)

          consensusMetrics = {
            kendallTau,
            consensusScore,
            topRankedLabel,
            controversialResponses,
            rankingCompleteness: aggregateResult.completeness,
            excludedResponses: aggregateResult.excludedLabels,
          }

          if (
            config.requireConsensusThreshold !== undefined &&
            consensusScore < config.requireConsensusThreshold
          ) {
            stage2Reviews.splice(0, stage2Reviews.length)
            aggregateRanking = []
            consensusMetrics = {
              kendallTau,
              consensusScore,
              topRankedLabel: '',
              controversialResponses: [],
              rankingCompleteness: aggregateResult.completeness,
              excludedResponses: aggregateResult.excludedLabels,
            }
            await writeStatus('expert_council_consensus_below_threshold')
          }
        }
        await writeStatus('expert_council_stage2_complete')
      }

      const stage3Prompt = [
        'You are the chairman synthesizing expert opinions. Review all responses and peer reviews to produce the best possible answer.',
        '',
        'USER PROMPT:',
        prompt,
        '',
        'EXPERT RESPONSES:',
        formatStage1Responses(stage1Results),
        '',
        'PEER REVIEWS:',
        stage2Reviews.length > 0
          ? formatStage2Reviews(stage2Reviews)
          : 'No peer reviews available.',
        '',
        'AGGREGATE RANKING:',
        formatRankingSummary(aggregateRanking, consensusMetrics.consensusScore),
        '',
        'Synthesize a final response that:',
        '1. Incorporates the strongest insights from all responses',
        '2. Addresses any gaps or weaknesses identified in reviews',
        '3. Provides a comprehensive, accurate answer',
      ].join('\n')

      let retryCount = 0
      let stage3Response: ExpertCouncilTurn['stage3'] = {
        chairmanModelId: config.chairmanModel.modelId,
        finalResponse: '',
        timestampMs: Date.now(),
      }

      if (mode === 'single') {
        const combined = formatStage1Responses(stage1Results)
        stage3Response.finalResponse = combined || 'No expert responses available.'
      } else {
        await writeStatus('expert_council_stage3_start')

        const runChairman = async () => {
          const agent = buildAgentConfig({
            userId,
            model: {
              ...config.chairmanModel,
              systemPrompt: STAGE3_DEFAULT_PROMPT,
            },
            role: 'synthesizer',
            systemPromptFallback: STAGE3_DEFAULT_PROMPT,
            nameSuffix: 'Chairman',
          })
          const streamContext = eventWriter
            ? {
                eventWriter,
                agentId: agent.agentId,
                agentName: agent.name,
                step: 3,
              }
            : undefined

          return streamContext
            ? executeWithProviderStreaming(
                agent,
                stage3Prompt,
                context,
                apiKeys,
                undefined,
                streamContext
              )
            : executeWithProvider(agent, stage3Prompt, context, apiKeys)
        }

        try {
          const result = await runChairman()
          stage3Response = {
            chairmanModelId: config.chairmanModel.modelId,
            finalResponse: result.output,
            tokensUsed: result.tokensUsed,
            estimatedCost: result.estimatedCost,
            timestampMs: Date.now(),
          }
        } catch (error) {
          retryCount = 1
          await delay(5000)
          try {
            const retryResult = await runChairman()
            stage3Response = {
              chairmanModelId: config.chairmanModel.modelId,
              finalResponse: retryResult.output,
              tokensUsed: retryResult.tokensUsed,
              estimatedCost: retryResult.estimatedCost,
              timestampMs: Date.now(),
            }
          } catch {
            const fallback =
              aggregateRanking[0]?.label && anonymizationMap[aggregateRanking[0].label]
                ? stage1Results.find(
                    (response) => response.modelId === anonymizationMap[aggregateRanking[0].label]
                  )
                : stage1Results.find((response) => response.status === 'completed')
            stage3Response.finalResponse =
              fallback?.answerText || 'Stage 3 synthesis failed and no fallback response was found.'
          }
        }

        await writeStatus('expert_council_stage3_complete')
      }

      const totalCost =
        sumCosts(stage1Results.map((response) => response.estimatedCost)) +
        sumCosts(stage2Reviews.map((review) => review.estimatedCost)) +
        (stage3Response.estimatedCost ?? 0)

      const totalDurationMs = Date.now() - startMs
      const turnId = `council-turn:${randomUUID()}`
      const qualityScore = stage2Reviews.length > 0 ? consensusMetrics.consensusScore : undefined

      const typedRunId = runId as RunId

      return {
        turnId,
        runId: typedRunId,
        userPrompt: prompt,
        stage1: {
          responses: stage1Results,
        },
        stage2: {
          anonymizationMap,
          reviews: stage2Reviews,
          aggregateRanking,
          consensusMetrics,
        },
        stage3: stage3Response,
        totalDurationMs,
        totalCost,
        createdAtMs: Date.now(),
        executionMode: mode,
        cacheHit: false,
        retryCount,
        qualityScore,
      }
    },
  }
}

export function createExpertCouncilRepository(): ExpertCouncilRepository {
  const db = getFirestore()

  const defaultAnalytics = (userId: string, workspaceId: WorkspaceId): CouncilAnalytics => ({
    userId,
    workspaceId,
    totalTurns: 0,
    turnsByMode: { full: 0, quick: 0, single: 0, custom: 0 },
    cacheHitRate: 0,
    totalCost: 0,
    averageCostPerTurn: 0,
    costByMode: { full: 0, quick: 0, single: 0, custom: 0 },
    averageConsensusScore: 0,
    averageQualityScore: 0,
    userSatisfactionRate: 0,
    averageDuration: 0,
    failureRate: 0,
    partialFailureRate: 0,
    modelStats: {},
    dailyUsage: [],
  })

  return {
    async createTurn(userId: string, turn: ExpertCouncilTurn): Promise<ExpertCouncilTurn> {
      const turnRef = db.doc(`users/${userId}/runs/${turn.runId}/expertCouncilTurns/${turn.turnId}`)
      await turnRef.set(turn)
      return turn
    },

    async getTurn(
      userId: string,
      runId: string,
      turnId: string
    ): Promise<ExpertCouncilTurn | null> {
      const turnRef = db.doc(`users/${userId}/runs/${runId}/expertCouncilTurns/${turnId}`)
      const snapshot = await turnRef.get()
      if (!snapshot.exists) {
        return null
      }
      return snapshot.data() as ExpertCouncilTurn
    },

    async listTurns(userId: string, runId: string): Promise<ExpertCouncilTurn[]> {
      const snapshot = await db
        .collection(`users/${userId}/runs/${runId}/expertCouncilTurns`)
        .orderBy('createdAtMs', 'desc')
        .get()
      return snapshot.docs.map((doc) => doc.data() as ExpertCouncilTurn)
    },

    async getCachedTurn(userId: string, cacheKey: string): Promise<ExpertCouncilTurn | null> {
      // User-scoped caching ensures isolation while enabling reuse across runs per user.
      const cacheDoc = await db.collection(`users/${userId}/councilCache`).doc(cacheKey).get()
      if (!cacheDoc.exists) {
        return null
      }
      const data = cacheDoc.data() as {
        turn: ExpertCouncilTurn
        expiresAtMs: number
      }
      if (!data || Date.now() > data.expiresAtMs) {
        await cacheDoc.ref.delete()
        return null
      }
      return data.turn
    },

    async setCachedTurn(
      userId: string,
      cacheKey: string,
      turn: ExpertCouncilTurn,
      ttlHours: number
    ): Promise<void> {
      const expiresAtMs = Date.now() + ttlHours * 60 * 60 * 1000
      await db.collection(`users/${userId}/councilCache`).doc(cacheKey).set({
        cacheKey,
        turn,
        expiresAtMs,
        createdAtMs: Date.now(),
      })
    },

    async invalidateCache(userId: string, cacheKey: string): Promise<void> {
      await db.collection(`users/${userId}/councilCache`).doc(cacheKey).delete()
    },

    async getAnalytics(userId: string, workspaceId: WorkspaceId): Promise<CouncilAnalytics> {
      const analyticsRef = db.doc(`users/${userId}/councilAnalytics/${workspaceId}`)
      const snapshot = await analyticsRef.get()
      if (!snapshot.exists) {
        return defaultAnalytics(userId, workspaceId)
      }
      return snapshot.data() as CouncilAnalytics
    },

    async recordFeedback(
      userId: string,
      runId: string,
      turnId: string,
      feedback: ExpertCouncilTurn['userFeedback']
    ): Promise<void> {
      const turnRef = db.doc(`users/${userId}/runs/${runId}/expertCouncilTurns/${turnId}`)
      const snapshot = await turnRef.get()
      if (!snapshot.exists) {
        return
      }

      await turnRef.update({ userFeedback: feedback })
    },
  }
}
