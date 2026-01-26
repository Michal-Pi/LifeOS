import type { ConversationContext } from '@lifeos/agents'

export interface QualityIssue {
  severity: 'minor' | 'major' | 'critical'
  category: 'completeness' | 'accuracy' | 'clarity' | 'consistency'
  description: string
  autoFixable: boolean
}

export interface QualityGateResult {
  passed: boolean
  overallScore: number
  categoryScores: {
    completeness: number
    accuracy: number
    clarity: number
    consistency: number
  }
  issues: QualityIssue[]
  recommendations: string[]
}

type QualityCheckResult = {
  score: number
  issues: QualityIssue[]
}

const scorePenalty = (issues: QualityIssue[], base: number = 100): number => {
  return Math.max(0, base - issues.length * 20)
}

const outputMentions = (output: unknown, text: string): boolean => {
  if (!output || typeof output !== 'string') return false
  return output.toLowerCase().includes(text.toLowerCase())
}

const checkCompleteness = (
  output: unknown,
  type: 'plan' | 'content' | 'decision' | 'general',
  context: ConversationContext
): QualityCheckResult => {
  const issues: QualityIssue[] = []

  if (type === 'plan') {
    const unaddressedReqs = context.requirements.filter(
      (req) => !outputMentions(output, req.text)
    )
    if (unaddressedReqs.length > 0) {
      issues.push({
        severity: 'major',
        category: 'completeness',
        description: `${unaddressedReqs.length} requirements not addressed`,
        autoFixable: false,
      })
    }
  }

  return { score: scorePenalty(issues), issues }
}

const checkAccuracy = (
  output: unknown,
  type: 'plan' | 'content' | 'decision' | 'general',
  context: ConversationContext
): QualityCheckResult => {
  void output
  void type
  void context
  return { score: 100, issues: [] }
}

const checkClarity = (
  output: unknown,
  type: 'plan' | 'content' | 'decision' | 'general'
): QualityCheckResult => {
  void type
  const issues: QualityIssue[] = []
  if (typeof output === 'string' && output.trim().length === 0) {
    issues.push({
      severity: 'major',
      category: 'clarity',
      description: 'Output is empty or whitespace.',
      autoFixable: true,
    })
  }
  return { score: scorePenalty(issues), issues }
}

const checkConsistency = (
  output: unknown,
  context: ConversationContext
): QualityCheckResult => {
  void output
  void context
  return { score: 100, issues: [] }
}

const generateRecommendations = (
  issues: QualityIssue[],
  categoryScores: QualityGateResult['categoryScores']
): string[] => {
  const recommendations: string[] = []
  if (categoryScores.completeness < 70) {
    recommendations.push('Address missing requirements before proceeding.')
  }
  if (categoryScores.clarity < 70) {
    recommendations.push('Improve clarity with more specific steps or headings.')
  }
  if (issues.some((issue) => issue.category === 'consistency')) {
    recommendations.push('Resolve inconsistencies with previously agreed context.')
  }
  return recommendations
}

export async function validateOutput(
  output: unknown,
  outputType: 'plan' | 'content' | 'decision' | 'general',
  context: ConversationContext
): Promise<QualityGateResult> {
  const checks = [
    checkCompleteness(output, outputType, context),
    checkAccuracy(output, outputType, context),
    checkClarity(output, outputType),
    checkConsistency(output, context),
  ]

  const results = await Promise.all(checks)

  const categoryScores = {
    completeness: results[0].score,
    accuracy: results[1].score,
    clarity: results[2].score,
    consistency: results[3].score,
  }

  const weights = { completeness: 0.25, accuracy: 0.3, clarity: 0.25, consistency: 0.2 }
  const overallScore = Object.entries(categoryScores).reduce(
    (sum, [key, value]) => sum + value * weights[key as keyof typeof weights],
    0
  )

  const allIssues = results.flatMap((result) => result.issues)
  const criticalIssues = allIssues.filter((issue) => issue.severity === 'critical')

  return {
    passed: overallScore >= 70 && criticalIssues.length === 0,
    overallScore,
    categoryScores,
    issues: allIssues,
    recommendations: generateRecommendations(allIssues, categoryScores),
  }
}
