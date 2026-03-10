/**
 * LLM-as-Judge Evaluation System
 *
 * Provides automated quality scoring for workflow outputs using LLM evaluation.
 * Supports:
 * - Configurable rubrics per workflow type
 * - Multi-criterion scoring
 * - Judge reasoning capture
 * - Integration with telemetry
 */

import { getFirestore } from 'firebase-admin/firestore'
import type {
  EvalRubric,
  EvalRubricId,
  EvalResult,
  EvalResultId,
  EvalCriterion,
  EvaluationMode,
  JudgeEvaluationDetail,
  CouncilSynthesisDetail,
  ModelProvider,
} from '@lifeos/agents'
import { asId } from '@lifeos/agents'
import type { RunId } from '@lifeos/agents'
import { randomUUID } from 'crypto'
import { createLogger } from '../../lib/logger.js'
import { executeWithProvider } from '../providerService.js'

const log = createLogger('LLMJudge')
import type { ProviderKeys } from '../providerService.js'

// ----- Collection Paths -----

const EVALUATION_COLLECTION = 'evaluation'
const RUBRICS_SUBCOLLECTION = 'rubrics'
const RESULTS_SUBCOLLECTION = 'results'

function getRubricsPath(userId: string): string {
  return `users/${userId}/${EVALUATION_COLLECTION}/${RUBRICS_SUBCOLLECTION}`
}

function getResultsPath(userId: string): string {
  return `users/${userId}/${EVALUATION_COLLECTION}/${RESULTS_SUBCOLLECTION}`
}

// ----- Default Rubrics -----

/**
 * Default evaluation criteria for different workflow types
 */
export const DEFAULT_CRITERIA: Record<string, EvalCriterion[]> = {
  deep_research: [
    {
      name: 'completeness',
      description: 'How thoroughly does the research cover the topic?',
      weight: 0.3,
      prompt:
        'Rate how completely the research covers the requested topic. Consider: Are all key aspects addressed? Are there obvious gaps? Score 1-5.',
      scoreRange: { min: 1, max: 5 },
    },
    {
      name: 'accuracy',
      description: 'How accurate and well-sourced is the information?',
      weight: 0.3,
      prompt:
        'Rate the accuracy and reliability of the information provided. Consider: Are claims supported? Are sources credible? Score 1-5.',
      scoreRange: { min: 1, max: 5 },
    },
    {
      name: 'coherence',
      description: 'How well-organized and clear is the presentation?',
      weight: 0.2,
      prompt:
        'Rate the organization and clarity of the research output. Consider: Is it well-structured? Is the logic easy to follow? Score 1-5.',
      scoreRange: { min: 1, max: 5 },
    },
    {
      name: 'actionability',
      description: 'How useful and actionable are the insights?',
      weight: 0.2,
      prompt:
        'Rate how actionable the research findings are. Consider: Can the user act on this information? Are next steps clear? Score 1-5.',
      scoreRange: { min: 1, max: 5 },
    },
  ],
  expert_council: [
    {
      name: 'perspective_diversity',
      description: 'How well do the experts provide diverse viewpoints?',
      weight: 0.25,
      prompt:
        'Rate the diversity of perspectives provided by the expert council. Consider: Are different angles covered? Are there contrasting views? Score 1-5.',
      scoreRange: { min: 1, max: 5 },
    },
    {
      name: 'synthesis_quality',
      description: 'How well is the synthesis of expert opinions?',
      weight: 0.25,
      prompt:
        'Rate the quality of the synthesis across expert opinions. Consider: Are conflicts acknowledged? Is the summary balanced? Score 1-5.',
      scoreRange: { min: 1, max: 5 },
    },
    {
      name: 'depth',
      description: 'How deep is the expertise demonstrated?',
      weight: 0.25,
      prompt:
        'Rate the depth of expertise shown in the responses. Consider: Is domain knowledge evident? Are nuances captured? Score 1-5.',
      scoreRange: { min: 1, max: 5 },
    },
    {
      name: 'actionability',
      description: 'How actionable is the council output?',
      weight: 0.25,
      prompt:
        'Rate how actionable the expert council output is. Consider: Can the user make decisions based on this? Score 1-5.',
      scoreRange: { min: 1, max: 5 },
    },
  ],
  dialectical: [
    {
      name: 'thesis_clarity',
      description: 'How clear and well-articulated are the theses?',
      weight: 0.2,
      prompt:
        'Rate the clarity and articulation of the thesis positions. Consider: Are claims precise? Are concepts well-defined? Score 1-5.',
      scoreRange: { min: 1, max: 5 },
    },
    {
      name: 'negation_quality',
      description: 'How substantive are the critiques and negations?',
      weight: 0.2,
      prompt:
        'Rate the quality of the critiques and negations. Consider: Are weaknesses identified? Are objections substantive? Score 1-5.',
      scoreRange: { min: 1, max: 5 },
    },
    {
      name: 'synthesis_novelty',
      description: 'How novel and insightful is the synthesis?',
      weight: 0.25,
      prompt:
        'Rate the novelty of the synthesis. Consider: Does it transcend the original positions? Are new insights generated? Score 1-5.',
      scoreRange: { min: 1, max: 5 },
    },
    {
      name: 'contradiction_resolution',
      description: 'How well are contradictions identified and resolved?',
      weight: 0.2,
      prompt:
        'Rate how well contradictions are handled. Consider: Are tensions made explicit? Is resolution satisfying? Score 1-5.',
      scoreRange: { min: 1, max: 5 },
    },
    {
      name: 'actionability',
      description: 'How actionable is the dialectical output?',
      weight: 0.15,
      prompt:
        'Rate how actionable the dialectical analysis is. Consider: Can the user apply these insights? Score 1-5.',
      scoreRange: { min: 1, max: 5 },
    },
  ],
  oracle: [
    {
      name: 'mechanistic_clarity',
      description: 'How clearly does the output explain causal mechanisms and system behavior?',
      weight: 1 / 6,
      prompt:
        'Rate the mechanistic clarity of the scenario planning output. Consider: Are causal mechanisms explicit, disciplined, and more than narrative summary? Score 1-5.',
      scoreRange: { min: 1, max: 5 },
    },
    {
      name: 'completeness',
      description: 'How completely does the output cover the strategic scenario space?',
      weight: 1 / 6,
      prompt:
        'Rate the completeness of the Oracle output. Consider: Are key uncertainties, scenarios, implications, and signposts adequately covered? Score 1-5.',
      scoreRange: { min: 1, max: 5 },
    },
    {
      name: 'causal_discipline',
      description: 'How rigorous is the causal reasoning and second-order thinking?',
      weight: 1 / 6,
      prompt:
        'Rate the causal discipline of the Oracle output. Consider: Are chains of cause and effect explicit, bounded, and free from shallow correlation claims? Score 1-5.',
      scoreRange: { min: 1, max: 5 },
    },
    {
      name: 'decision_usefulness',
      description: 'How useful is the output for making strategic decisions?',
      weight: 1 / 6,
      prompt:
        'Rate the decision usefulness of the Oracle output. Consider: Are strategic moves, signposts, thresholds, or no-regret actions actionable? Score 1-5.',
      scoreRange: { min: 1, max: 5 },
    },
    {
      name: 'uncertainty_hygiene',
      description: 'How well does the output distinguish confidence, uncertainty, and assumptions?',
      weight: 1 / 6,
      prompt:
        'Rate the uncertainty hygiene of the Oracle output. Consider: Are assumptions explicit, confidence calibrated, and unresolved tensions surfaced honestly? Score 1-5.',
      scoreRange: { min: 1, max: 5 },
    },
    {
      name: 'evidence_quality',
      description: 'How well grounded is the output in evidence and traceability?',
      weight: 1 / 6,
      prompt:
        'Rate the evidence quality of the Oracle output. Consider: Are claims grounded in evidence, traceable, and supported with credible sources or axioms where appropriate? Score 1-5.',
      scoreRange: { min: 1, max: 5 },
    },
  ],
  default: [
    {
      name: 'task_completion',
      description: 'How well was the task completed?',
      weight: 0.4,
      prompt:
        'Rate how completely the task was accomplished. Consider: Was the goal achieved? Are requirements met? Score 1-5.',
      scoreRange: { min: 1, max: 5 },
    },
    {
      name: 'quality',
      description: 'What is the overall quality of the output?',
      weight: 0.35,
      prompt:
        'Rate the overall quality of the output. Consider: Is it well-written? Is it accurate? Score 1-5.',
      scoreRange: { min: 1, max: 5 },
    },
    {
      name: 'usefulness',
      description: 'How useful is the output to the user?',
      weight: 0.25,
      prompt:
        'Rate how useful this output is to the user. Consider: Is it actionable? Is it relevant? Score 1-5.',
      scoreRange: { min: 1, max: 5 },
    },
  ],
}

// ----- Rubric Management -----

/**
 * Create a new evaluation rubric
 */
export async function createRubric(
  userId: string,
  input: {
    name: string
    description: string
    workflowType: string
    taskType?: string
    criteria?: EvalCriterion[]
    judgeModel?: string
    judgeProvider?: string
    systemPrompt?: string
    evaluationMode?: EvalRubric['evaluationMode']
    isDefault?: boolean
  }
): Promise<EvalRubric> {
  const db = getFirestore()
  const rubricId = randomUUID() as EvalRubricId
  const now = Date.now()

  // Use default criteria if not provided
  const criteria =
    input.criteria || DEFAULT_CRITERIA[input.workflowType] || DEFAULT_CRITERIA.default

  const rubric: EvalRubric = {
    rubricId,
    userId,
    name: input.name,
    description: input.description,
    workflowType: input.workflowType,
    taskType: input.taskType,
    criteria,
    judgeModel: input.judgeModel || 'gpt-5.2',
    judgeProvider: input.judgeProvider || 'openai',
    systemPrompt: input.systemPrompt,
    evaluationMode: input.evaluationMode ?? { mode: 'single_judge' },
    isDefault: input.isDefault || false,
    isArchived: false,
    version: 1,
    createdAtMs: now,
    updatedAtMs: now,
  }

  await db.doc(`${getRubricsPath(userId)}/${rubricId}`).set(rubric)

  return rubric
}

/**
 * Get a rubric by ID
 */
export async function getRubric(
  userId: string,
  rubricId: EvalRubricId
): Promise<EvalRubric | null> {
  const db = getFirestore()
  const doc = await db.doc(`${getRubricsPath(userId)}/${rubricId}`).get()

  if (!doc.exists) return null
  return doc.data() as EvalRubric
}

/**
 * Get the default rubric for a workflow type
 */
export async function getDefaultRubric(
  userId: string,
  workflowType: string
): Promise<EvalRubric | null> {
  const db = getFirestore()

  // First try to find a user-created default
  const snapshot = await db
    .collection(getRubricsPath(userId))
    .where('workflowType', '==', workflowType)
    .where('isDefault', '==', true)
    .where('isArchived', '==', false)
    .limit(1)
    .get()

  if (!snapshot.empty) {
    return snapshot.docs[0].data() as EvalRubric
  }

  // Create a default rubric if none exists
  return createRubric(userId, {
    name: `Default ${workflowType} Rubric`,
    description: `Auto-generated default evaluation rubric for ${workflowType} workflows`,
    workflowType,
    isDefault: true,
  })
}

/**
 * List rubrics with optional filters
 */
export async function listRubrics(
  userId: string,
  filters?: {
    workflowType?: string
    includeArchived?: boolean
  }
): Promise<EvalRubric[]> {
  const db = getFirestore()
  let query: FirebaseFirestore.Query = db.collection(getRubricsPath(userId))

  if (filters?.workflowType) {
    query = query.where('workflowType', '==', filters.workflowType)
  }

  if (!filters?.includeArchived) {
    query = query.where('isArchived', '==', false)
  }

  const snapshot = await query.orderBy('createdAtMs', 'desc').get()
  return snapshot.docs.map((doc) => doc.data() as EvalRubric)
}

// ----- Evaluation Execution -----

/**
 * Build the judge prompt for a single criterion
 */
function _buildCriterionPrompt(criterion: EvalCriterion, input: string, output: string): string {
  return `You are evaluating the quality of an AI-generated output.

## Input/Request:
${input}

## Output to Evaluate:
${output}

## Evaluation Criterion: ${criterion.name}
${criterion.description}

${criterion.prompt}

Please provide:
1. A score from ${criterion.scoreRange.min} to ${criterion.scoreRange.max}
2. A brief explanation (1-2 sentences) for your score

Respond in JSON format:
{"score": <number>, "reasoning": "<explanation>"}`
}

/**
 * Build the combined judge prompt for all criteria
 */
function buildFullJudgePrompt(rubric: EvalRubric, input: string, output: string): string {
  const criteriaList = rubric.criteria
    .map(
      (c, i) => `${i + 1}. **${c.name}** (weight: ${c.weight}): ${c.description}\n   ${c.prompt}`
    )
    .join('\n\n')

  return `You are an expert evaluator assessing the quality of an AI-generated output.

## Input/Request:
${input}

## Output to Evaluate:
${output}

## Evaluation Criteria:
${criteriaList}

Please evaluate the output on each criterion and provide:
1. A score for each criterion (on the specified scale)
2. Brief reasoning for each score
3. An overall assessment

Respond in JSON format:
{
  "scores": {
    "<criterion_name>": {"score": <number>, "reasoning": "<explanation>"},
    ...
  },
  "overall_reasoning": "<summary assessment>"
}`
}

function buildCouncilSynthesisPrompt(
  rubric: EvalRubric,
  input: string,
  output: string,
  panelResults: JudgeEvaluationDetail[]
): string {
  const panelSummary = panelResults
    .map(
      (result) =>
        `Judge ${result.role ?? result.judgeId} (${result.judgeProvider}/${result.judgeModel})
- Aggregate score: ${result.aggregateScore.toFixed(3)}
- Criterion scores: ${JSON.stringify(result.criterionScores)}
- Reasoning: ${result.reasoning ?? 'n/a'}`
    )
    .join('\n\n')

  return `You are reconciling an expert evaluation council reviewing an AI-generated output.

## Input/Request:
${input}

## Output to Evaluate:
${output}

## Rubric:
${rubric.name}
${rubric.description}

## Independent Judge Results:
${panelSummary}

Produce a reconciled evaluation summary that:
1. identifies main areas of agreement
2. identifies meaningful disagreement or dissent
3. proposes final reconciled criterion scores
4. explains the final reconciled assessment

Respond in JSON format:
{
  "reconciled_scores": {
    "<criterion_name>": <number>
  },
  "summary": "<reconciled evaluation summary>",
  "dissent_notes": ["<optional dissent 1>", "<optional dissent 2>"]
}`
}

function parseCouncilSynthesisResponse(
  response: string,
  rubric: EvalRubric
): {
  summary: string
  dissentNotes?: string[]
  reconciledCriterionScores?: Record<string, number>
  reconciledNormalizedScores?: Record<string, number>
  reconciledAggregateScore?: number
} {
  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      throw new Error('No JSON found in council response')
    }

    const parsed = JSON.parse(jsonMatch[0]) as {
      summary?: string
      dissent_notes?: string[]
      reconciled_scores?: Record<string, number>
    }

    const reconciledCriterionScores: Record<string, number> = {}
    for (const criterion of rubric.criteria) {
      const score = parsed.reconciled_scores?.[criterion.name]
      if (typeof score === 'number') {
        reconciledCriterionScores[criterion.name] = score
      }
    }

    if (Object.keys(reconciledCriterionScores).length === rubric.criteria.length) {
      const reconciledNormalizedScores = normalizeScores(reconciledCriterionScores, rubric)
      const reconciledAggregateScore = computeAggregateScore(reconciledNormalizedScores, rubric)
      return {
        summary: parsed.summary || 'Council reconciliation completed.',
        dissentNotes: parsed.dissent_notes,
        reconciledCriterionScores,
        reconciledNormalizedScores,
        reconciledAggregateScore,
      }
    }

    return {
      summary: parsed.summary || 'Council reconciliation completed.',
      dissentNotes: parsed.dissent_notes,
    }
  } catch (error) {
    log.warn('Failed to parse council synthesis response', { error })
    return {
      summary: response.slice(0, 2000) || 'Council reconciliation completed.',
    }
  }
}

/**
 * Parse the judge response to extract scores
 */
function parseJudgeResponse(
  response: string,
  rubric: EvalRubric
): {
  criterionScores: Record<string, number>
  reasoning: string
} {
  try {
    // Try to extract JSON from the response
    const jsonMatch = response.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      throw new Error('No JSON found in response')
    }

    const parsed = JSON.parse(jsonMatch[0])

    const criterionScores: Record<string, number> = {}

    if (parsed.scores) {
      for (const criterion of rubric.criteria) {
        const scoreData = parsed.scores[criterion.name]
        if (scoreData && typeof scoreData.score === 'number') {
          criterionScores[criterion.name] = scoreData.score
        } else if (typeof scoreData === 'number') {
          criterionScores[criterion.name] = scoreData
        }
      }
    }

    return {
      criterionScores,
      reasoning: parsed.overall_reasoning || '',
    }
  } catch (error) {
    log.error('Failed to parse judge response', { error })
    // Return default scores if parsing fails
    const criterionScores: Record<string, number> = {}
    for (const criterion of rubric.criteria) {
      criterionScores[criterion.name] = (criterion.scoreRange.min + criterion.scoreRange.max) / 2
    }
    return { criterionScores, reasoning: 'Failed to parse judge response' }
  }
}

/**
 * Normalize scores to 0-1 range
 */
function normalizeScores(
  scores: Record<string, number>,
  rubric: EvalRubric
): Record<string, number> {
  const normalized: Record<string, number> = {}

  for (const criterion of rubric.criteria) {
    const score = scores[criterion.name] || criterion.scoreRange.min
    const { min, max } = criterion.scoreRange
    normalized[criterion.name] = (score - min) / (max - min)
  }

  return normalized
}

/**
 * Compute weighted aggregate score
 */
function computeAggregateScore(
  normalizedScores: Record<string, number>,
  rubric: EvalRubric
): number {
  let aggregate = 0
  let totalWeight = 0

  for (const criterion of rubric.criteria) {
    const score = normalizedScores[criterion.name] || 0
    aggregate += score * criterion.weight
    totalWeight += criterion.weight
  }

  return totalWeight > 0 ? aggregate / totalWeight : 0
}

function buildJudgeAgent(
  userId: string,
  runId: RunId,
  input: {
    judgeProvider: string
    judgeModel: string
    role?: string
    systemPrompt?: string
  }
) {
  return {
    agentId: asId<'agent'>('agent:judge'),
    userId,
    name: input.role ? `Quality Judge (${input.role})` : 'Quality Judge',
    role: 'critic' as const,
    systemPrompt:
      input.systemPrompt ||
      'You are an expert evaluator. Be fair, consistent, and thorough in your assessments.',
    modelProvider: input.judgeProvider as ModelProvider,
    modelName: input.judgeModel,
    temperature: 0.3,
    archived: false,
    createdAtMs: Date.now(),
    updatedAtMs: Date.now(),
    syncState: 'synced' as const,
    version: 1,
  }
}

async function executeJudge(
  userId: string,
  runId: RunId,
  rubric: EvalRubric,
  judgePrompt: string,
  apiKeys: ProviderKeys,
  input: {
    judgeProvider: string
    judgeModel: string
    role?: string
    systemPrompt?: string
  }
): Promise<JudgeEvaluationDetail> {
  const judgeAgent = buildJudgeAgent(userId, runId, input)
  const result = await executeWithProvider(judgeAgent, judgePrompt, {}, apiKeys, {
    userId,
    agentId: asId<'agent'>('agent:judge'),
    workflowId: asId<'workflow'>('workflow:eval'),
    runId,
  })
  const parsed = parseJudgeResponse(result.output, rubric)
  const normalizedScores = normalizeScores(parsed.criterionScores, rubric)
  const aggregateScore = computeAggregateScore(normalizedScores, rubric)

  return {
    judgeId: `${input.role ?? 'judge'}:${input.judgeProvider}:${input.judgeModel}`,
    role: input.role,
    judgeModel: input.judgeModel,
    judgeProvider: input.judgeProvider,
    criterionScores: parsed.criterionScores,
    normalizedScores,
    aggregateScore,
    reasoning: parsed.reasoning,
    tokensUsed: result.tokensUsed,
    cost: result.estimatedCost,
  }
}

function averageJudgeScores(
  panelResults: JudgeEvaluationDetail[],
  rubric: EvalRubric
): {
  criterionScores: Record<string, number>
  normalizedScores: Record<string, number>
  aggregateScore: number
  scoreVariance: number
} {
  const criterionScores: Record<string, number> = {}
  const normalizedScores: Record<string, number> = {}

  for (const criterion of rubric.criteria) {
    const scores = panelResults.map(
      (result) => result.criterionScores[criterion.name] ?? criterion.scoreRange.min
    )
    const normalized = panelResults.map((result) => result.normalizedScores[criterion.name] ?? 0)
    criterionScores[criterion.name] = scores.reduce((sum, score) => sum + score, 0) / scores.length
    normalizedScores[criterion.name] =
      normalized.reduce((sum, score) => sum + score, 0) / normalized.length
  }

  const aggregateScore =
    panelResults.reduce((sum, result) => sum + result.aggregateScore, 0) / panelResults.length
  const variance =
    panelResults.reduce((sum, result) => sum + (result.aggregateScore - aggregateScore) ** 2, 0) /
    panelResults.length

  return {
    criterionScores,
    normalizedScores,
    aggregateScore,
    scoreVariance: variance,
  }
}

function resolveEvaluationMode(rubric: EvalRubric): EvaluationMode {
  return rubric.evaluationMode?.mode ?? 'single_judge'
}

/**
 * Evaluate an output using LLM-as-Judge
 */
export async function evaluateOutput(
  userId: string,
  runId: RunId,
  rubric: EvalRubric,
  input: string,
  output: string,
  apiKeys: ProviderKeys
): Promise<EvalResult> {
  const evalResultId = randomUUID() as EvalResultId
  const evalResult = await evaluateOutputInMemory(
    userId,
    runId,
    rubric,
    input,
    output,
    apiKeys,
    evalResultId
  )
  const db = getFirestore()
  await db.doc(`${getResultsPath(userId)}/${evalResultId}`).set(evalResult)
  return evalResult
}

export async function evaluateOutputInMemory(
  userId: string,
  runId: RunId,
  rubric: EvalRubric,
  input: string,
  output: string,
  apiKeys: ProviderKeys,
  evalResultId: EvalResultId = randomUUID() as EvalResultId
): Promise<EvalResult> {
  const startTime = Date.now()
  const judgePrompt = buildFullJudgePrompt(rubric, input, output)
  const evaluationMode = resolveEvaluationMode(rubric)

  let criterionScores: Record<string, number>
  let normalizedScores: Record<string, number>
  let aggregateScore: number
  let panelCriterionScores: Record<string, number> | undefined
  let panelNormalizedScores: Record<string, number> | undefined
  let panelAggregateScore: number | undefined
  let finalScoreSource: EvalResult['finalScoreSource'] = 'single_judge'
  let reasoning: string
  let judgeModel: string
  let judgeProvider: string
  let judgeTokensUsed = 0
  let judgeCost = 0
  let individualJudgeResults: JudgeEvaluationDetail[] | undefined
  let scoreVariance: number | undefined
  let requiresHumanReview: boolean | undefined
  let councilSynthesis: CouncilSynthesisDetail | undefined

  if (evaluationMode === 'single_judge') {
    const detail = await executeJudge(userId, runId, rubric, judgePrompt, apiKeys, {
      judgeProvider: rubric.judgeProvider,
      judgeModel: rubric.judgeModel,
      systemPrompt: rubric.systemPrompt,
    })
    criterionScores = detail.criterionScores
    normalizedScores = detail.normalizedScores
    aggregateScore = detail.aggregateScore
    finalScoreSource = 'single_judge'
    reasoning = detail.reasoning ?? ''
    judgeModel = detail.judgeModel
    judgeProvider = detail.judgeProvider
    judgeTokensUsed = detail.tokensUsed
    judgeCost = detail.cost
  } else {
    const panelMembers = rubric.evaluationMode?.panelMembers?.length
      ? rubric.evaluationMode.panelMembers
      : [
          {
            role: 'primary_judge',
            judgeProvider: rubric.judgeProvider,
            judgeModel: rubric.judgeModel,
          },
        ]

    individualJudgeResults = []
    for (const member of panelMembers) {
      const detail = await executeJudge(userId, runId, rubric, judgePrompt, apiKeys, {
        judgeProvider: member.judgeProvider,
        judgeModel: member.judgeModel,
        role: member.role,
        systemPrompt: rubric.systemPrompt,
      })
      individualJudgeResults.push(detail)
      judgeTokensUsed += detail.tokensUsed
      judgeCost += detail.cost
    }

    const averaged = averageJudgeScores(individualJudgeResults, rubric)
    panelCriterionScores = averaged.criterionScores
    panelNormalizedScores = averaged.normalizedScores
    panelAggregateScore = averaged.aggregateScore
    criterionScores = averaged.criterionScores
    normalizedScores = averaged.normalizedScores
    aggregateScore = averaged.aggregateScore
    finalScoreSource = 'panel_average'
    scoreVariance = averaged.scoreVariance
    requiresHumanReview =
      typeof rubric.evaluationMode?.requireHumanReviewAboveVariance === 'number'
        ? averaged.scoreVariance >= rubric.evaluationMode.requireHumanReviewAboveVariance
        : false

    if (evaluationMode === 'expert_council_eval') {
      const shouldReconcile =
        !rubric.evaluationMode?.triggerOnDisagreementOnly ||
        averaged.scoreVariance >= (rubric.evaluationMode?.disagreementThreshold ?? 0.04)

      if (shouldReconcile) {
        const reconciliationJudge = rubric.evaluationMode?.reconciliationJudge ?? {
          judgeProvider: rubric.judgeProvider,
          judgeModel: rubric.judgeModel,
        }
        const councilPrompt = buildCouncilSynthesisPrompt(
          rubric,
          input,
          output,
          individualJudgeResults
        )
        const councilAgent = buildJudgeAgent(userId, runId, {
          judgeProvider: reconciliationJudge.judgeProvider,
          judgeModel: reconciliationJudge.judgeModel,
          role: 'council_reconciler',
          systemPrompt:
            'You are reconciling an expert evaluation council. Preserve disagreement when meaningful and do not flatten valid dissent.',
        })
        const councilResult = await executeWithProvider(councilAgent, councilPrompt, {}, apiKeys, {
          userId,
          agentId: asId<'agent'>('agent:judge'),
          workflowId: asId<'workflow'>('workflow:eval'),
          runId,
        })
        judgeTokensUsed += councilResult.tokensUsed
        judgeCost += councilResult.estimatedCost

        const parsedCouncil = parseCouncilSynthesisResponse(councilResult.output, rubric)
        councilSynthesis = {
          reconciledByModel: reconciliationJudge.judgeModel,
          reconciledByProvider: reconciliationJudge.judgeProvider,
          summary: parsedCouncil.summary,
          dissentNotes: parsedCouncil.dissentNotes,
          reconciledCriterionScores: parsedCouncil.reconciledCriterionScores,
          reconciledNormalizedScores: parsedCouncil.reconciledNormalizedScores,
          reconciledAggregateScore: parsedCouncil.reconciledAggregateScore,
        }

        if (
          parsedCouncil.reconciledCriterionScores &&
          parsedCouncil.reconciledNormalizedScores &&
          typeof parsedCouncil.reconciledAggregateScore === 'number'
        ) {
          criterionScores = parsedCouncil.reconciledCriterionScores
          normalizedScores = parsedCouncil.reconciledNormalizedScores
          aggregateScore = parsedCouncil.reconciledAggregateScore
          finalScoreSource = 'council_reconciled'
        }
      } else {
        councilSynthesis = {
          summary:
            'Council reconciliation skipped because judge disagreement remained below the configured threshold.',
        }
      }
    }

    reasoning =
      councilSynthesis?.summary ||
      individualJudgeResults
        .map((detail) => `${detail.role ?? detail.judgeId}: ${detail.reasoning ?? 'n/a'}`)
        .join('\n\n')
    judgeModel =
      councilSynthesis?.reconciledByModel ||
      rubric.evaluationMode?.reconciliationJudge?.judgeModel ||
      'judge_panel'
    judgeProvider =
      councilSynthesis?.reconciledByProvider ||
      rubric.evaluationMode?.reconciliationJudge?.judgeProvider ||
      'multi'
  }

  const endTime = Date.now()

  // Store the result
  return {
    evalResultId,
    rubricId: rubric.rubricId,
    runId,
    userId,
    criterionScores,
    normalizedScores,
    aggregateScore,
    panelCriterionScores,
    panelNormalizedScores,
    panelAggregateScore,
    finalScoreSource,
    judgeReasoning: reasoning,
    judgeModel,
    judgeProvider,
    judgeTokensUsed,
    judgeCost,
    evaluationMode,
    individualJudgeResults,
    scoreVariance,
    requiresHumanReview,
    councilSynthesis,
    evaluatedAtMs: endTime,
    durationMs: endTime - startTime,
    inputSnapshot: input.slice(0, 1000), // Truncate for storage
    outputSnapshot: output.slice(0, 1000),
    createdAtMs: Date.now(),
  }
}

/**
 * Get an evaluation result by ID
 */
export async function getEvalResult(
  userId: string,
  evalResultId: EvalResultId
): Promise<EvalResult | null> {
  const db = getFirestore()
  const doc = await db.doc(`${getResultsPath(userId)}/${evalResultId}`).get()

  if (!doc.exists) return null
  return doc.data() as EvalResult
}

/**
 * Get evaluation result for a run
 */
export async function getEvalResultByRunId(
  userId: string,
  runId: RunId
): Promise<EvalResult | null> {
  const db = getFirestore()
  const snapshot = await db
    .collection(getResultsPath(userId))
    .where('runId', '==', runId)
    .limit(1)
    .get()

  if (snapshot.empty) return null
  return snapshot.docs[0].data() as EvalResult
}

/**
 * List evaluation results with filters
 */
export async function listEvalResults(
  userId: string,
  filters?: {
    rubricId?: EvalRubricId
    minScore?: number
    maxScore?: number
    startAfterMs?: number
    startBeforeMs?: number
  },
  limit: number = 100
): Promise<EvalResult[]> {
  const db = getFirestore()
  let query: FirebaseFirestore.Query = db.collection(getResultsPath(userId))

  if (filters?.rubricId) {
    query = query.where('rubricId', '==', filters.rubricId)
  }

  if (filters?.startAfterMs) {
    query = query.where('createdAtMs', '>=', filters.startAfterMs)
  }

  if (filters?.startBeforeMs) {
    query = query.where('createdAtMs', '<=', filters.startBeforeMs)
  }

  query = query.orderBy('createdAtMs', 'desc').limit(limit)

  const snapshot = await query.get()
  const results: EvalResult[] = []

  for (const doc of snapshot.docs) {
    const result = doc.data() as EvalResult

    // Client-side filtering for score ranges
    if (filters?.minScore !== undefined && result.aggregateScore < filters.minScore) continue
    if (filters?.maxScore !== undefined && result.aggregateScore > filters.maxScore) continue

    results.push(result)
  }

  return results
}

/**
 * Get average scores for a workflow type
 */
export async function getAverageScores(
  userId: string,
  workflowType: string,
  windowDays: number = 30
): Promise<{
  avgScore: number
  sampleCount: number
  byCriterion: Record<string, number>
}> {
  // Get the default rubric for this workflow type
  const rubric = await getDefaultRubric(userId, workflowType)
  if (!rubric) {
    return { avgScore: 0, sampleCount: 0, byCriterion: {} }
  }

  const startMs = Date.now() - windowDays * 24 * 60 * 60 * 1000
  const results = await listEvalResults(userId, {
    rubricId: rubric.rubricId,
    startAfterMs: startMs,
  })

  if (results.length === 0) {
    return { avgScore: 0, sampleCount: 0, byCriterion: {} }
  }

  let totalScore = 0
  const criterionTotals: Record<string, number> = {}
  const criterionCounts: Record<string, number> = {}

  for (const result of results) {
    totalScore += result.aggregateScore

    for (const [criterion, score] of Object.entries(result.normalizedScores)) {
      criterionTotals[criterion] = (criterionTotals[criterion] || 0) + score
      criterionCounts[criterion] = (criterionCounts[criterion] || 0) + 1
    }
  }

  const byCriterion: Record<string, number> = {}
  for (const criterion of Object.keys(criterionTotals)) {
    byCriterion[criterion] = criterionTotals[criterion] / criterionCounts[criterion]
  }

  return {
    avgScore: totalScore / results.length,
    sampleCount: results.length,
    byCriterion,
  }
}
