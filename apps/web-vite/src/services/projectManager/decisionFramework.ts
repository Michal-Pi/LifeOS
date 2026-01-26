export interface DecisionContext {
  complexity: 'low' | 'medium' | 'high'
  stakes: 'low' | 'medium' | 'high'
  novelty: 'routine' | 'familiar' | 'novel'
  riskLevel: 'low' | 'medium' | 'high'
  userExpertise: 'beginner' | 'intermediate' | 'expert'
}

export interface DecisionResult {
  decision: boolean | 'prompt_user'
  score: number
  reasoning: string
  factors: {
    complexity: number
    stakes: number
    novelty: number
    risk: number
  }
}

const mapToScore = (
  value: 'low' | 'medium' | 'high' | 'routine' | 'familiar' | 'novel',
  mapping: Record<string, number>
): number => {
  return mapping[value] ?? 0
}

export function shouldUseExpertCouncil(
  context: DecisionContext,
  threshold: number = 60
): DecisionResult {
  const weights = {
    complexity: 0.3,
    stakes: 0.35,
    novelty: 0.2,
    risk: 0.15,
  }

  const scores = {
    complexity: mapToScore(context.complexity, { low: 20, medium: 60, high: 90 }),
    stakes: mapToScore(context.stakes, { low: 10, medium: 50, high: 95 }),
    novelty: mapToScore(context.novelty, { routine: 15, familiar: 50, novel: 85 }),
    risk: mapToScore(context.riskLevel, { low: 10, medium: 55, high: 90 }),
  }

  const totalScore = Object.entries(scores).reduce(
    (sum, [key, value]) => sum + value * weights[key as keyof typeof weights],
    0
  )

  const expertiseAdjustment =
    {
      beginner: 0,
      intermediate: -10,
      expert: -20,
    }[context.userExpertise] ?? 0

  const adjustedScore = Math.max(0, Math.min(100, totalScore + expertiseAdjustment))

  let decision: boolean | 'prompt_user'
  let reasoning: string

  if (adjustedScore >= threshold + 15) {
    decision = true
    reasoning = `High complexity/stakes (score: ${adjustedScore.toFixed(
      0
    )}) warrants Expert Council.`
  } else if (adjustedScore <= threshold - 15) {
    decision = false
    reasoning = `Straightforward decision (score: ${adjustedScore.toFixed(
      0
    )}) can be handled without Expert Council.`
  } else {
    decision = 'prompt_user'
    reasoning = `Moderate complexity (score: ${adjustedScore.toFixed(
      0
    )}). Expert Council recommended but optional.`
  }

  return { decision, score: adjustedScore, reasoning, factors: scores }
}
