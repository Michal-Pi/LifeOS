import { getFirestore } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { asId } from '@lifeos/agents'
import type { EvalCriterion, EvalRubric, RunId } from '@lifeos/agents'
import { createLogger } from '../lib/logger.js'
import { loadProviderKeys } from './providerKeys.js'
import { EvaluationPaths } from './shared/collectionPaths.js'
import { evaluateOutputInMemory, getDefaultRubric } from './evaluation/llmJudge.js'

const log = createLogger('AgentEvalFunctions')

type AgentEvalRecordDoc = {
  recordId: string
  userId: string
  runId: string
  workflowType: string
  agentId: string
  agentName: string
  exactContextPayload?: string
  exactUpstreamHandoffPayload?: string
  effectiveSystemPrompt?: string
  userPrompt?: string
  outputSnapshot?: string
}

const AGENT_STEP_CRITERIA: EvalCriterion[] = [
  {
    name: 'context_fidelity',
    description: 'How well did the step use the provided prompt, context, and upstream handoff?',
    weight: 0.3,
    prompt:
      'Rate whether the step output faithfully uses the exact prompt, context payload, and upstream handoff. Penalize ignored constraints, dropped context, or hallucinated context. Score 1-5.',
    scoreRange: { min: 1, max: 5 },
  },
  {
    name: 'reasoning_quality',
    description: 'How strong is the reasoning quality of this step in isolation?',
    weight: 0.3,
    prompt:
      'Rate the reasoning quality of this single step. Consider coherence, discipline, and whether the step seems thoughtful rather than superficial. Score 1-5.',
    scoreRange: { min: 1, max: 5 },
  },
  {
    name: 'handoff_usefulness',
    description: 'How useful is this step for downstream workflow progress?',
    weight: 0.2,
    prompt:
      'Rate how useful this step output is for downstream progress. Consider whether it sharpens state, resolves ambiguity, or prepares the next step well. Score 1-5.',
    scoreRange: { min: 1, max: 5 },
  },
  {
    name: 'output_quality',
    description: 'What is the overall quality and usefulness of the step output?',
    weight: 0.2,
    prompt:
      'Rate the overall quality of the step output. Consider clarity, specificity, and usefulness for the workflow objective. Score 1-5.',
    scoreRange: { min: 1, max: 5 },
  },
]

function buildStepJudgeRubric(baseRubric: EvalRubric | null, userId: string): EvalRubric {
  const now = Date.now()
  return {
    rubricId: baseRubric?.rubricId ?? asId<'evalRubric'>('evalRubric:agent_step'),
    userId,
    name: 'Agent Step Exact-Capture Rubric',
    description:
      'Judges a single agent step against its exact captured prompt, context, handoff, and output.',
    workflowType: baseRubric?.workflowType ?? 'default',
    taskType: 'agent_step',
    criteria: AGENT_STEP_CRITERIA,
    judgeModel: baseRubric?.judgeModel ?? 'gpt-5.2',
    judgeProvider: baseRubric?.judgeProvider ?? 'openai',
    systemPrompt:
      'You are an expert evaluator assessing a single agent step. Judge fidelity to the exact captured prompt and context, not just surface polish.',
    evaluationMode: baseRubric?.evaluationMode ?? { mode: 'single_judge' },
    isDefault: false,
    isArchived: false,
    version: baseRubric?.version ?? 1,
    createdAtMs: baseRubric?.createdAtMs ?? now,
    updatedAtMs: now,
  }
}

function buildStepJudgeInput(record: AgentEvalRecordDoc): string {
  return [
    `Workflow type: ${record.workflowType}`,
    `Agent: ${record.agentName} (${record.agentId})`,
    '',
    'Exact system prompt:',
    record.effectiveSystemPrompt ?? 'n/a',
    '',
    'Exact user prompt:',
    record.userPrompt ?? 'n/a',
    '',
    'Exact context payload:',
    record.exactContextPayload ?? 'n/a',
    '',
    'Exact upstream handoff payload:',
    record.exactUpstreamHandoffPayload ?? 'n/a',
  ].join('\n')
}

export const evaluateAgentStep = onCall({}, async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError('unauthenticated', 'Authentication required')
  }

  const { recordId } = request.data as { recordId?: string }
  if (!recordId) {
    throw new HttpsError('invalid-argument', 'recordId is required')
  }

  const db = getFirestore()
  const recordRef = db.doc(EvaluationPaths.agentEvalRecord(request.auth.uid, recordId))
  const snapshot = await recordRef.get()
  if (!snapshot.exists) {
    throw new HttpsError('not-found', 'Agent eval record not found')
  }

  const record = snapshot.data() as AgentEvalRecordDoc
  if (!record.outputSnapshot) {
    throw new HttpsError(
      'failed-precondition',
      'Agent eval record does not contain an output snapshot to judge'
    )
  }

  const apiKeys = await loadProviderKeys(request.auth.uid)
  const baseRubric = await getDefaultRubric(request.auth.uid, record.workflowType)
  const rubric = buildStepJudgeRubric(baseRubric, request.auth.uid)
  const evalResult = await evaluateOutputInMemory(
    request.auth.uid,
    record.runId as RunId,
    rubric,
    buildStepJudgeInput(record),
    record.outputSnapshot,
    apiKeys
  )

  await recordRef.set(
    {
      stepJudgeEvalResultId: evalResult.evalResultId,
      stepJudgeRubricId: evalResult.rubricId,
      stepJudgeAggregateScore: evalResult.aggregateScore,
      stepJudgeCriterionScores: evalResult.criterionScores,
      stepJudgeReasoning: evalResult.judgeReasoning,
      stepJudgeRequiresHumanReview: evalResult.requiresHumanReview ?? false,
      stepJudgeScoreVariance: evalResult.scoreVariance ?? null,
      stepJudgeJudgeModel: evalResult.judgeModel,
      stepJudgeJudgeProvider: evalResult.judgeProvider,
      stepJudgeEvaluatedAtMs: evalResult.evaluatedAtMs,
      updatedAtMs: Date.now(),
    },
    { merge: true }
  )

  log.info('Agent step evaluated', {
    recordId,
    runId: record.runId,
    agentId: record.agentId,
    aggregateScore: evalResult.aggregateScore,
  })

  return {
    ok: true,
    recordId,
    aggregateScore: evalResult.aggregateScore,
    criterionScores: evalResult.criterionScores,
    reasoning: evalResult.judgeReasoning,
    requiresHumanReview: evalResult.requiresHumanReview ?? false,
    scoreVariance: evalResult.scoreVariance ?? null,
    judgeModel: evalResult.judgeModel,
    judgeProvider: evalResult.judgeProvider,
    evaluatedAtMs: evalResult.evaluatedAtMs,
  }
})
