import { randomUUID } from 'crypto'
import {
  buildAggregateRanking,
  calculateAverageKendallTau,
  calculateConsensusScore,
  findControversialResponses,
  MODEL_TIER_MAP,
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
  JudgeRubricDomain,
  ModelProvider,
  ModelTier,
  RunId,
  WorkflowId,
} from '@lifeos/agents'
import { getFirestore } from 'firebase-admin/firestore'

import { createLogger } from '../lib/logger.js'
import type { ProviderKeys } from './providerService.js'

const log = createLogger('ExpertCouncil')
import { executeWithProvider, executeWithProviderStreaming } from './providerService.js'
import type { RunEventWriter } from './runEvents.js'

type CouncilModel = ExpertCouncilConfig['councilModels'][number]
type JudgeModel = NonNullable<ExpertCouncilConfig['judgeModels']>[number]

const LABELS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')
const STAGE1_DEFAULT_PROMPT =
  'You are a domain expert providing a thorough, well-reasoned response. Ground every claim in evidence or established reasoning. If you are uncertain about something, state your confidence level rather than guessing. Prioritize accuracy and depth over breadth.'
const STAGE2_DEFAULT_PROMPT =
  'You are an impartial judge evaluating anonymized responses. Critique each response on its merits using the provided rubric. Rank responses from best to worst based on evidence quality, reasoning, and completeness. Prioritize accuracy over validation — push back on flawed reasoning regardless of how confident the response sounds.'
const STAGE3_DEFAULT_PROMPT =
  'You are the chairman synthesizing the best possible final response from expert opinions and peer reviews. Incorporate the strongest insights from all responses. Address gaps and weaknesses identified in reviews. When experts disagree, present both positions with the evidence for each. The final response must be more accurate and complete than any individual expert response.'

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// ----- Phase 18: Domain Detection & Rubrics -----

/**
 * Classify a prompt into a rubric domain via keyword heuristics.
 */
export function detectPromptDomain(prompt: string): JudgeRubricDomain {
  const lower = prompt.toLowerCase()

  if (
    /\b(code|function|class|api|bug|implement|refactor|debug|typescript|python|javascript)\b/.test(
      lower
    )
  ) {
    return 'code'
  }

  if (/\b(research|study|analyze|evidence|literature|findings|hypothesis|data)\b/.test(lower)) {
    return 'research'
  }

  if (/\b(write|draft|creative|story|blog|article|content|poem|essay|narrative)\b/.test(lower)) {
    return 'creative'
  }

  if (
    /\b(analyze|compare|evaluate|assess|pros|cons|trade.?off|decision|strategy|framework)\b/.test(
      lower
    )
  ) {
    return 'analytical'
  }

  return 'factual'
}

/**
 * Domain-specific judge rubrics — criteria judges should use when evaluating responses.
 */
export const JUDGE_RUBRICS: Record<JudgeRubricDomain, string> = {
  research:
    'Evaluate each response on these five criteria (equal weight): ' +
    '(1) Evidence quality — are claims supported by credible, cited sources? ' +
    '(2) Methodological rigor — is the reasoning sound and the approach systematic? ' +
    '(3) Coverage — are major perspectives and relevant literature addressed? ' +
    '(4) Objectivity — are biases acknowledged and counterarguments considered? ' +
    '(5) Actionability — are conclusions specific enough to act on?',
  creative:
    'Evaluate each response on these five criteria (equal weight): ' +
    '(1) Originality — does it offer a fresh angle, voice, or perspective? ' +
    '(2) Engagement — does the opening hook and does the piece sustain attention? ' +
    '(3) Structure — does it flow logically with clear transitions? ' +
    '(4) Audience fit — is the tone and complexity appropriate for the target reader? ' +
    '(5) Emotional resonance — does it evoke the intended response?',
  analytical:
    'Evaluate each response on these five criteria (equal weight): ' +
    '(1) Logical soundness — is the reasoning valid with no logical gaps? ' +
    '(2) Completeness — are all relevant factors and edge cases considered? ' +
    '(3) Alternative consideration — are competing interpretations addressed? ' +
    '(4) Evidence use — are conclusions supported by data rather than assertion? ' +
    '(5) Actionability — are recommendations specific and implementable?',
  code:
    'Evaluate each response on these five criteria (equal weight): ' +
    '(1) Correctness — does the code solve the stated problem without bugs? ' +
    '(2) Quality — is it readable, well-structured, and maintainable? ' +
    '(3) Performance — does it handle expected data volumes efficiently? ' +
    '(4) Edge cases — are boundary conditions and error states handled? ' +
    '(5) Best practices — does it follow language idioms and security practices?',
  factual:
    'Evaluate each response on these five criteria (equal weight): ' +
    '(1) Accuracy — are all stated facts verifiably correct? ' +
    '(2) Completeness — are all important aspects of the topic covered? ' +
    '(3) Clarity — is the information presented concisely without jargon? ' +
    '(4) Recency — is the information current and not outdated? ' +
    '(5) Source reliability — are claims traceable to credible sources?',
}

// ----- Phase 18: Provider Diversity Enforcement -----

const ALL_PROVIDERS: ModelProvider[] = ['openai', 'anthropic', 'google', 'xai']

const TIER_MAP: Record<ModelTier, Record<ModelProvider, string>> = MODEL_TIER_MAP

function inferTier(modelName: string): ModelTier {
  for (const [tier, providers] of Object.entries(TIER_MAP)) {
    for (const model of Object.values(providers)) {
      if (model === modelName) return tier as ModelTier
    }
  }
  return 'balanced'
}

/**
 * Ensure council models use distinct providers. When duplicate providers are
 * found, reassign to an unused provider at the same model tier.
 */
export function enforceProviderDiversity(
  councilModels: ExpertCouncilConfig['councilModels'],
  availableProviders: ModelProvider[] = ALL_PROVIDERS
): ExpertCouncilConfig['councilModels'] {
  const usedProviders = new Set<string>()
  const result = [...councilModels]

  for (let i = 0; i < result.length; i++) {
    if (usedProviders.has(result[i].provider)) {
      const unusedProvider = availableProviders.find((p) => !usedProviders.has(p))
      if (unusedProvider) {
        const tier = inferTier(result[i].modelName)
        const newModelName = TIER_MAP[tier][unusedProvider]
        log.warn('Provider diversity enforcement: reassigning model', {
          from: result[i].provider,
          to: unusedProvider,
          modelId: result[i].modelId,
        })
        result[i] = {
          ...result[i],
          provider: unusedProvider,
          modelName: newModelName,
          modelId: `${unusedProvider}-${newModelName}`,
        }
      }
    }
    usedProviders.add(result[i].provider)
  }

  return result
}

// ----- Phase 19: Dynamic Composition -----

/**
 * Select best-performing council models from historical analytics data.
 * Falls back to first `targetSize` models when insufficient data.
 */
export async function selectDynamicCouncil(
  userId: string,
  workflowId: WorkflowId,
  _domain: JudgeRubricDomain,
  repository: ExpertCouncilRepository,
  availableModels: ExpertCouncilConfig['councilModels'],
  targetSize: number = 3
): Promise<ExpertCouncilConfig['councilModels']> {
  const analytics = await repository.getAnalytics(userId, workflowId)

  // Insufficient data — return first targetSize models as-is
  if (analytics.totalTurns < 5) {
    return availableModels.slice(0, targetSize)
  }

  // Score each available model using modelStats
  // Score = (1 / averageRank) * (1 - failureRate) — higher is better
  const scored = availableModels.map((model) => {
    const stats = analytics.modelStats[model.modelId]
    if (!stats || stats.timesUsed === 0) {
      return { model, score: 0.5 } // Neutral score for unknown models
    }
    const rankScore = stats.averageRank > 0 ? 1 / stats.averageRank : 0.5
    const reliabilityScore = 1 - stats.failureRate
    return { model, score: rankScore * reliabilityScore }
  })

  // Sort by score descending, take top targetSize
  scored.sort((a, b) => b.score - a.score)
  const selectedModels = scored.slice(0, targetSize).map((s) => s.model)

  // Ensure provider diversity
  return enforceProviderDiversity(selectedModels)
}

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
    log.warn('Unable to hash context', { error })
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
  workflowId?: string
  repository?: ExpertCouncilRepository
}): ExpertCouncilPipeline {
  const { apiKeys, context, eventWriter, workflowId, repository } = params

  const writeStatus = async (status: string): Promise<void> => {
    if (!eventWriter) return
    await eventWriter.writeEvent({
      type: 'status',
      workflowId,
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

      // Phase 18: Enforce provider diversity before Stage 1
      let diverseModels =
        config.enforceProviderDiversity !== false
          ? enforceProviderDiversity(config.councilModels)
          : config.councilModels

      // Phase 19: Dynamic composition — auto-select best models from historical data
      if (config.enableDynamicComposition && repository && workflowId) {
        try {
          diverseModels = await selectDynamicCouncil(
            userId,
            workflowId as WorkflowId,
            config.judgeRubricDomain === 'auto' || !config.judgeRubricDomain
              ? detectPromptDomain(prompt)
              : config.judgeRubricDomain,
            repository,
            diverseModels
          )
          log.info('Dynamic composition selected models', {
            modelIds: diverseModels.map((m) => m.modelId),
          })
        } catch (err) {
          log.warn('Dynamic composition failed, using default models', { error: String(err) })
        }
      }

      // Phase 18: Resolve judge rubric domain
      const rubricDomain: JudgeRubricDomain =
        config.judgeRubricDomain === 'auto' || !config.judgeRubricDomain
          ? detectPromptDomain(prompt)
          : config.judgeRubricDomain
      const rubric = JUDGE_RUBRICS[rubricDomain]

      // Phase 19: Quick mode — use only 2 council models
      const activeModels = mode === 'quick' ? diverseModels.slice(0, 2) : diverseModels

      await writeStatus('expert_council_stage1_start')

      const stage1Results = await Promise.all(
        activeModels.map(async (model) => {
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

      if (hasMinimumStage1 && (mode === 'full' || mode === 'custom' || mode === 'quick')) {
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

        // Phase 19: Quick mode — use only 1 judge
        const allJudgeModels: Array<CouncilModel | JudgeModel> =
          config.judgeModels ?? config.councilModels
        const judgeModels = mode === 'quick' ? allJudgeModels.slice(0, 1) : allJudgeModels

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
              '## Task',
              'Evaluate the anonymized responses below against the user prompt. Provide a critique of each response and rank them from best to worst.',
              '',
              `## Evaluation Criteria`,
              rubric,
              '',
              '## User Prompt',
              prompt,
              '',
              '## Responses to Review',
              formatAnonymizedResponses(includedResponses),
              '',
              '## Required Output',
              '1. For each response label, write a 2-3 sentence critique identifying its specific strengths and weaknesses.',
              '2. Rank all responses from best to worst based on the evaluation criteria above.',
              '',
              '## Output Format',
              'RANKING: [A, C, B]',
              'CONFIDENCE: 0-100',
              '',
              '## Rules',
              '- Evaluate each response independently against the criteria before comparing.',
              '- Prioritize accuracy over eloquence — a less polished but more correct response ranks higher.',
              '- If two responses are nearly equal, break the tie on whichever is more actionable.',
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

        // Phase 19: Quick mode uses 1 judge, so relax the minimum review threshold
        const minReviewsNeeded = mode === 'quick' ? 1 : 2
        if (failedRatio > 0.5 || successfulReviews.length < minReviewsNeeded) {
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

      // Phase 20: Disagreement Deep-Dive — reasoning follow-up on low consensus
      let disagreementDeepDive: ExpertCouncilTurn['disagreementDeepDive'] = undefined
      const shouldDeepDive =
        (config.enableDisagreementDeepDive ?? mode === 'full') &&
        consensusMetrics.kendallTau < 0.4 &&
        stage2Reviews.length >= 2

      let deepDiveSection = ''
      if (shouldDeepDive) {
        await writeStatus('expert_council_disagreement_deep_dive_start')
        const deepDiveResponses: NonNullable<
          ExpertCouncilTurn['disagreementDeepDive']
        >['reasoningResponses'] = []

        // Limit to first 3 council models to control cost
        const deepDiveModels = activeModels.slice(0, 3)
        const critiquesText = formatStage2Reviews(stage2Reviews)

        await Promise.all(
          deepDiveModels.map(async (model) => {
            const originalResponse = stage1Results.find((r) => r.modelId === model.modelId)
            if (!originalResponse || originalResponse.status !== 'completed') return

            const deepDivePrompt = [
              '## Context',
              'Judges disagreed significantly on response quality (low consensus). You must defend or revise your reasoning.',
              '',
              '## Judge Critiques',
              critiquesText,
              '',
              '## Your Original Response',
              originalResponse.answerText,
              '',
              '## Task',
              'Address each criticism directed at your response. For each:',
              '1. If the criticism is valid, explain how you would revise your answer.',
              '2. If the criticism is incorrect, explain why with specific evidence.',
              'Be concise — focus on substance, not defense.',
            ].join('\n')

            try {
              const agent = buildAgentConfig({
                userId,
                model: { ...model, systemPrompt: 'You are an expert responding to peer critique. Address each criticism with specific evidence. Concede where the criticism is valid, and defend with reasoning where it is not. Be concise and intellectually honest.' },
                role: 'researcher',
                systemPromptFallback: 'You are defending your reasoning.',
                nameSuffix: 'DeepDive',
              })
              const result = await executeWithProvider(agent, deepDivePrompt, context, apiKeys)
              deepDiveResponses.push({
                modelId: model.modelId,
                reasoning: result.output,
                tokensUsed: result.tokensUsed,
                estimatedCost: result.estimatedCost,
              })
            } catch (err) {
              log.warn('Deep-dive reasoning failed', { modelId: model.modelId, error: String(err) })
            }
          })
        )

        disagreementDeepDive = { triggered: true, reasoningResponses: deepDiveResponses }

        if (deepDiveResponses.length > 0) {
          deepDiveSection = [
            '',
            'REASONING FOLLOW-UP (triggered by low consensus):',
            ...deepDiveResponses.map((r) => `Model ${r.modelId}:\n${r.reasoning}`),
          ].join('\n')
        }

        await writeStatus('expert_council_disagreement_deep_dive_complete')
      } else if (config.enableDisagreementDeepDive !== false && mode === 'full') {
        disagreementDeepDive = { triggered: false, reasoningResponses: [] }
      }

      const stage3Prompt = [
        '## Task',
        'Synthesize the expert responses and peer reviews below into the best possible final answer to the user prompt.',
        '',
        '## User Prompt',
        prompt,
        '',
        '## Expert Responses',
        formatStage1Responses(stage1Results),
        '',
        '## Peer Reviews',
        stage2Reviews.length > 0
          ? formatStage2Reviews(stage2Reviews)
          : 'No peer reviews available.',
        '',
        '## Aggregate Ranking',
        formatRankingSummary(aggregateRanking, consensusMetrics.consensusScore),
        deepDiveSection,
        '',
        '## Synthesis Rules',
        '1. Start from the highest-ranked response and enhance it with insights from lower-ranked ones.',
        '2. Address every gap and weakness identified in the peer reviews.',
        '3. When experts disagree, present both positions with the evidence for each.',
        '4. The final response must be more accurate and complete than any single expert response.',
        '5. If any expert raised a valid concern that others missed, incorporate it.',
      ].join('\n')

      let retryCount = 0
      let stage3Response: ExpertCouncilTurn['stage3'] = {
        chairmanModelId: config.chairmanModel.modelId,
        finalResponse: '',
        timestampMs: Date.now(),
      }

      // Phase 19: Quick mode — skip chairman if high consensus (Kendall Tau > 0.8)
      const quickModeSkipChairman =
        mode === 'quick' && consensusMetrics.kendallTau > 0.8 && aggregateRanking.length > 0

      if (mode === 'single') {
        const combined = formatStage1Responses(stage1Results)
        stage3Response.finalResponse = combined || 'No expert responses available.'
      } else if (quickModeSkipChairman) {
        // High consensus in quick mode — use top-ranked response directly
        const topLabel = aggregateRanking[0].label
        const topModelId = anonymizationMap[topLabel]
        const topResponse = stage1Results.find((r) => r.modelId === topModelId)
        stage3Response = {
          chairmanModelId: 'skipped-quick-consensus',
          finalResponse: topResponse?.answerText || stage1Results[0]?.answerText || '',
          timestampMs: Date.now(),
        }
        log.info('Quick mode: chairman skipped due to high consensus', {
          kendallTau: consensusMetrics.kendallTau,
          topModelId,
        })
        await writeStatus('expert_council_stage3_skipped_quick_consensus')
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
        } catch {
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

      // Include deep-dive costs in total
      const deepDiveCost = disagreementDeepDive?.triggered
        ? sumCosts(disagreementDeepDive.reasoningResponses.map((r) => r.estimatedCost))
        : 0

      const totalCost =
        sumCosts(stage1Results.map((response) => response.estimatedCost)) +
        sumCosts(stage2Reviews.map((review) => review.estimatedCost)) +
        (stage3Response.estimatedCost ?? 0) +
        deepDiveCost

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
        disagreementDeepDive,
      }
    },
  }
}

export function createExpertCouncilRepository(): ExpertCouncilRepository {
  const db = getFirestore()

  const defaultAnalytics = (userId: string, workflowId: WorkflowId): CouncilAnalytics => ({
    userId,
    workflowId,
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

    async getAnalytics(userId: string, workflowId: WorkflowId): Promise<CouncilAnalytics> {
      const analyticsRef = db.doc(`users/${userId}/councilAnalytics/${workflowId}`)
      const snapshot = await analyticsRef.get()
      if (!snapshot.exists) {
        return defaultAnalytics(userId, workflowId)
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
