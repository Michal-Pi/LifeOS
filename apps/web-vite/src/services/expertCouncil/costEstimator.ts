import type { ExpertCouncilConfig, ExecutionMode } from '@lifeos/agents'
import { MODEL_PRICING } from '@lifeos/agents'

export interface CostEstimate {
  mode: ExecutionMode
  stages: {
    stage1: { tokens: number; cost: number }
    stage2?: { tokens: number; cost: number }
    stage3?: { tokens: number; cost: number }
  }
  totalTokens: number
  totalCost: number
  estimatedTimeSeconds: number
  qualityScore: number
}

const getModelCost = (modelName: string) => MODEL_PRICING[modelName] ?? MODEL_PRICING.default

const getQualityScore = (mode: ExecutionMode) => {
  if (mode === 'full') return 95
  if (mode === 'quick') return 85
  if (mode === 'single') return 75
  return 90
}

export function calculateCostEstimate(
  config: ExpertCouncilConfig,
  mode: ExecutionMode,
  promptLengthTokens = 500
): CostEstimate {
  const councilModels = config.councilModels
  const avgResponseTokens = 800
  const avgReviewTokens = 400
  const avgSynthesisTokens = 1000

  const stage1Tokens = councilModels.length * (promptLengthTokens + avgResponseTokens)
  const stage1Cost = councilModels.reduce((sum, model) => {
    const costs = getModelCost(model.modelName)
    return (
      sum +
      (promptLengthTokens * costs.input) / 1_000_000 +
      (avgResponseTokens * costs.output) / 1_000_000
    )
  }, 0)

  let stage2Tokens = 0
  let stage2Cost = 0
  let stage3Tokens = 0
  let stage3Cost = 0

  if (mode === 'full' || mode === 'custom') {
    const reviewPromptTokens = promptLengthTokens + councilModels.length * avgResponseTokens
    stage2Tokens = councilModels.length * (reviewPromptTokens + avgReviewTokens)
    stage2Cost = councilModels.reduce((sum, model) => {
      const costs = getModelCost(model.modelName)
      return (
        sum +
        (reviewPromptTokens * costs.input) / 1_000_000 +
        (avgReviewTokens * costs.output) / 1_000_000
      )
    }, 0)
  }

  if (mode === 'full' || mode === 'quick' || mode === 'custom') {
    const synthesisPromptTokens =
      promptLengthTokens +
      councilModels.length * avgResponseTokens +
      (mode === 'full' || mode === 'custom' ? councilModels.length * avgReviewTokens : 0)
    stage3Tokens = synthesisPromptTokens + avgSynthesisTokens
    const chairmanCosts = getModelCost(config.chairmanModel.modelName)
    stage3Cost =
      (synthesisPromptTokens * chairmanCosts.input) / 1_000_000 +
      (avgSynthesisTokens * chairmanCosts.output) / 1_000_000
  }

  const totalTokens = stage1Tokens + stage2Tokens + stage3Tokens
  const totalCost = stage1Cost + stage2Cost + stage3Cost

  const estimatedTimeSeconds =
    15 +
    (mode === 'full' || mode === 'custom' ? 20 : 0) +
    (mode === 'full' || mode === 'quick' || mode === 'custom' ? 10 : 0)

  return {
    mode,
    stages: {
      stage1: { tokens: stage1Tokens, cost: stage1Cost },
      ...(stage2Tokens > 0 ? { stage2: { tokens: stage2Tokens, cost: stage2Cost } } : {}),
      ...(stage3Tokens > 0 ? { stage3: { tokens: stage3Tokens, cost: stage3Cost } } : {}),
    },
    totalTokens,
    totalCost,
    estimatedTimeSeconds,
    qualityScore: getQualityScore(mode),
  }
}
