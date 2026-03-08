/**
 * Oracle Gate Evaluator
 *
 * Evaluates phase outputs using a 6-dimension rubric (1-5 each):
 * 1. Mechanistic Clarity — are causal claims specific and testable?
 * 2. Completeness — are all relevant dimensions covered?
 * 3. Causal Discipline — does the analysis avoid unsupported causal claims?
 * 4. Decision Usefulness — can a decision-maker act on this?
 * 5. Uncertainty Hygiene — are confidence levels calibrated and explicit?
 * 6. Evidence Quality — are claims backed by credible, diverse sources?
 *
 * Gate logic:
 * - ALL dimensions >= 3.0 AND average >= 3.5 → PASS
 * - Gate A: additionally requires axiom grounding >= 80%
 * - Gate C: additionally requires decision usefulness >= 4
 * - Below thresholds → REFINE (return feedback for re-run)
 */

import type {
  OracleGateType,
  OracleRubricScores,
  OracleGateResult,
} from '@lifeos/agents'
import { createLogger } from '../../lib/logger.js'

const log = createLogger('OracleGateEvaluator')

export interface GateEvaluationInput {
  gateType: OracleGateType
  phaseOutput: string
  axiomGroundingPercent?: number // Fraction of claims with axiom refs (Gate A)
  refinementAttempt: number
  maxRefinements: number
}

export interface GateEvaluationResult {
  gateResult: OracleGateResult
  shouldRefine: boolean
  feedback: string
}

export interface ParsedRubricResult {
  scores: OracleRubricScores
  llmFeedback?: string
}

/**
 * Parse rubric scores from LLM-generated evaluation text.
 * Expected format: JSON with score fields and optional feedback.
 */
export function parseRubricScores(evaluationJson: string): ParsedRubricResult | null {
  try {
    // Try to extract JSON from the text
    const jsonMatch = evaluationJson.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return null

    const parsed = JSON.parse(jsonMatch[0])

    const scores: OracleRubricScores = {
      mechanisticClarity: clampScore(parsed.mechanisticClarity ?? parsed.mechanistic_clarity ?? 0),
      completeness: clampScore(parsed.completeness ?? 0),
      causalDiscipline: clampScore(parsed.causalDiscipline ?? parsed.causal_discipline ?? 0),
      decisionUsefulness: clampScore(parsed.decisionUsefulness ?? parsed.decision_usefulness ?? 0),
      uncertaintyHygiene: clampScore(parsed.uncertaintyHygiene ?? parsed.uncertainty_hygiene ?? 0),
      evidenceQuality: clampScore(parsed.evidenceQuality ?? parsed.evidence_quality ?? 0),
    }

    const llmFeedback = typeof parsed.feedback === 'string' ? parsed.feedback : undefined

    return { scores, llmFeedback }
  } catch {
    log.warn('Failed to parse rubric scores from evaluation', {
      textLength: evaluationJson.length,
    })
    return null
  }
}

function clampScore(value: number): number {
  return Math.max(1, Math.min(5, Math.round(value * 10) / 10))
}

function averageScore(scores: OracleRubricScores): number {
  const values = [
    scores.mechanisticClarity,
    scores.completeness,
    scores.causalDiscipline,
    scores.decisionUsefulness,
    scores.uncertaintyHygiene,
    scores.evidenceQuality,
  ]
  return values.reduce((a, b) => a + b, 0) / values.length
}

// Rubric interpretation:
// - Narrative quality: mechanisticClarity, completeness
// - Evidentiary quality: evidenceQuality, causalDiscipline
// - Decision quality: decisionUsefulness, uncertaintyHygiene
function computeQualityBreakdown(scores: OracleRubricScores): {
  narrativeAvg: number
  evidentiaryAvg: number
  decisionAvg: number
} {
  return {
    narrativeAvg: (scores.mechanisticClarity + scores.completeness) / 2,
    evidentiaryAvg: (scores.evidenceQuality + scores.causalDiscipline) / 2,
    decisionAvg: (scores.decisionUsefulness + scores.uncertaintyHygiene) / 2,
  }
}

function allAboveMinimum(scores: OracleRubricScores, minimum: number): boolean {
  return (
    scores.mechanisticClarity >= minimum &&
    scores.completeness >= minimum &&
    scores.causalDiscipline >= minimum &&
    scores.decisionUsefulness >= minimum &&
    scores.uncertaintyHygiene >= minimum &&
    scores.evidenceQuality >= minimum
  )
}

/**
 * Evaluate whether a gate passes, given rubric scores.
 * @param llmFeedback Optional feedback text from the LLM gate evaluator,
 *   prepended to the gate result feedback for richer context.
 */
export function evaluateGate(
  input: GateEvaluationInput,
  scores: OracleRubricScores,
  llmFeedback?: string,
): GateEvaluationResult {
  const avg = averageScore(scores)
  const qualityBreakdown = computeQualityBreakdown(scores)
  const hasFloorViolation = !allAboveMinimum(scores, 2.0)

  let passed = !hasFloorViolation && avg >= 3.5
  const feedbackParts: string[] = []

  // Gate-specific overrides
  if (input.gateType === 'gate_a' && input.axiomGroundingPercent !== undefined) {
    if (input.axiomGroundingPercent < 0.8) {
      passed = false
      feedbackParts.push(
        `Axiom grounding is ${(input.axiomGroundingPercent * 100).toFixed(0)}% — requires >= 80%. ` +
        'Ensure more claims reference specific axioms from the library.'
      )
    }
  }

  if (input.gateType === 'gate_c' && scores.decisionUsefulness < 4) {
    passed = false
    feedbackParts.push(
      `Decision usefulness is ${scores.decisionUsefulness} — Gate C requires >= 4. ` +
      'Scenarios must include actionable signposts and strategic moves.'
    )
  }

  // Build general feedback for failing dimensions
  if (hasFloorViolation) {
    const weak = Object.entries(scores)
      .filter(([, v]) => v < 2.0)
      .map(([k, v]) => `${k}: ${v}`)
    feedbackParts.push(`Dimensions below floor (2.0): ${weak.join(', ')}`)
  }

  if (avg < 3.5) {
    feedbackParts.push(`Average score ${avg.toFixed(2)} is below 3.5 threshold.`)
  }

  const shouldRefine = !passed && input.refinementAttempt < input.maxRefinements

  if (!passed && !shouldRefine) {
    feedbackParts.push(
      `Max refinements (${input.maxRefinements}) reached. Escalating for human review.`
    )
  }

  // Incorporate LLM-generated feedback if available
  if (llmFeedback && !passed) {
    feedbackParts.unshift(llmFeedback)
  }

  const feedback = passed
    ? `Gate ${input.gateType} passed with average ${avg.toFixed(2)}.`
    : feedbackParts.join(' ')

  const gateResult: OracleGateResult = {
    gateType: input.gateType,
    passed,
    scores,
    averageScore: Math.round(avg * 100) / 100,
    feedback,
    axiomGroundingPercent: input.axiomGroundingPercent,
    refinementAttempt: input.refinementAttempt,
    evaluatedAtMs: Date.now(),
  }

  log.info('Gate evaluation', {
    gateType: input.gateType,
    passed,
    average: avg.toFixed(2),
    refinement: input.refinementAttempt,
    shouldRefine,
  })
  log.info('Gate quality breakdown', {
    gateType: input.gateType,
    narrativeAvg: qualityBreakdown.narrativeAvg.toFixed(2),
    evidentiaryAvg: qualityBreakdown.evidentiaryAvg.toFixed(2),
    decisionAvg: qualityBreakdown.decisionAvg.toFixed(2),
    overall: avg.toFixed(2),
  })

  return { gateResult, shouldRefine, feedback }
}

/**
 * Build the system prompt for the gate evaluator LLM call.
 */
export function buildGateEvaluatorPrompt(gateType: OracleGateType): string {
  const gateSpecific = gateType === 'gate_a'
    ? '\n\nGATE A NOTE: Axiom grounding (% of claims referencing axioms) is computed separately. Focus your evaluation on the 6 rubric dimensions above.'
    : gateType === 'gate_c'
    ? '\n\nGATE C ADDITIONAL REQUIREMENT: Decision usefulness must be >= 4 for this gate to pass. Scenarios must include actionable signposts, strategic moves, and clear timing.'
    : ''

  return `You are an Oracle Gate Evaluator. Score the following phase output on 6 dimensions (1-5 each):

1. **mechanisticClarity** (1-5): Are causal claims specific, testable, and mechanistically grounded? Or vague and hand-wavy?
2. **completeness** (1-5): Are all relevant STEEP+V dimensions covered? Any major blind spots?
3. **causalDiscipline** (1-5): Does the analysis distinguish correlation from causation? Are causal claims supported?
4. **decisionUsefulness** (1-5): Can a decision-maker act on this? Are there concrete implications?
5. **uncertaintyHygiene** (1-5): Are confidence levels explicit and calibrated? Or everything stated as certain?
6. **evidenceQuality** (1-5): Are claims backed by credible, diverse, recent sources? Or speculation?

PASSING CRITERIA: ALL dimensions >= 2.0 (hard floor) AND average >= 3.5.${gateSpecific}

Respond with JSON ONLY:
{
  "mechanisticClarity": <number>,
  "completeness": <number>,
  "causalDiscipline": <number>,
  "decisionUsefulness": <number>,
  "uncertaintyHygiene": <number>,
  "evidenceQuality": <number>,
  "feedback": "<specific feedback on what to improve if any dimension is weak>"
}`
}
