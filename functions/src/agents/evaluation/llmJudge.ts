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
  const db = getFirestore()
  const evalResultId = randomUUID() as EvalResultId
  const startTime = Date.now()

  // Build the judge prompt
  const judgePrompt = buildFullJudgePrompt(rubric, input, output)

  // Create a minimal agent config for the judge
  const judgeAgent = {
    agentId: asId<'agent'>('agent:judge'),
    userId,
    name: 'Quality Judge',
    role: 'critic' as const,
    systemPrompt:
      rubric.systemPrompt ||
      'You are an expert evaluator. Be fair, consistent, and thorough in your assessments.',
    modelProvider: rubric.judgeProvider as ModelProvider,
    modelName: rubric.judgeModel,
    temperature: 0.3, // Low temperature for consistency
    archived: false,
    createdAtMs: Date.now(),
    updatedAtMs: Date.now(),
    syncState: 'synced' as const,
    version: 1,
  }

  // Execute the judge
  const result = await executeWithProvider(judgeAgent, judgePrompt, {}, apiKeys, {
    userId,
    agentId: asId<'agent'>('agent:judge'),
    workflowId: asId<'workflow'>('workflow:eval'),
    runId,
  })

  const endTime = Date.now()

  // Parse the response
  const { criterionScores, reasoning } = parseJudgeResponse(result.output, rubric)
  const normalizedScores = normalizeScores(criterionScores, rubric)
  const aggregateScore = computeAggregateScore(normalizedScores, rubric)

  // Store the result
  const evalResult: EvalResult = {
    evalResultId,
    rubricId: rubric.rubricId,
    runId,
    userId,
    criterionScores,
    normalizedScores,
    aggregateScore,
    judgeReasoning: reasoning,
    judgeModel: rubric.judgeModel,
    judgeProvider: rubric.judgeProvider,
    judgeTokensUsed: result.tokensUsed,
    judgeCost: result.estimatedCost,
    evaluatedAtMs: endTime,
    durationMs: endTime - startTime,
    inputSnapshot: input.slice(0, 1000), // Truncate for storage
    outputSnapshot: output.slice(0, 1000),
    createdAtMs: Date.now(),
  }

  await db.doc(`${getResultsPath(userId)}/${evalResultId}`).set(evalResult)

  return evalResult
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
