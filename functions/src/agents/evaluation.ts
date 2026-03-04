/**
 * Auto-Evaluation Pipeline — Phase 8
 *
 * Scores run output quality using a cheap judge model on 3 dimensions:
 * relevance, completeness, and accuracy (each 1-5).
 * Returns null on any failure — evaluation must never block runs.
 */

import type { AgentConfig } from '@lifeos/agents'
import type { ProviderKeys } from './providerService.js'
import { executeWithProvider } from './providerService.js'
import { createLogger } from '../lib/logger.js'

const log = createLogger('Evaluation')

/** Maximum characters of output to evaluate (keeps evaluation costs low) */
const MAX_OUTPUT_CHARS = 16000

export interface EvaluationScores {
  relevance: number
  completeness: number
  accuracy: number
  evaluatedAtMs: number
}

/**
 * Build the judge agent config used for evaluation.
 * Exported for testing.
 */
export function buildJudgeAgentConfig(): AgentConfig {
  return {
    agentId: '__run_evaluator__' as AgentConfig['agentId'],
    userId: '',
    name: 'Run Evaluator',
    role: 'critic',
    systemPrompt: `You are a quality evaluation judge. Score the following agent output on 3 dimensions, each 1-5:
- Relevance: How relevant is the output to the stated goal?
- Completeness: Does the output fully address all aspects of the goal?
- Accuracy: Is the content factually sound and well-reasoned?

Respond ONLY with JSON in this exact format, no other text:
{"relevance": N, "completeness": N, "accuracy": N}`,
    modelProvider: 'openai',
    modelName: 'gpt-4o-mini',
    temperature: 0.1,
    archived: false,
    createdAtMs: 0,
    updatedAtMs: 0,
    syncState: 'synced',
    version: 0,
  }
}

/**
 * Evaluate run output quality using a cheap judge model.
 * Returns scores 1-5 on relevance, completeness, and accuracy.
 * Returns null if evaluation fails (non-critical — should never block runs).
 */
export async function evaluateRunOutput(
  output: string,
  goal: string,
  apiKeys: ProviderKeys
): Promise<EvaluationScores | null> {
  try {
    const judgeAgent = buildJudgeAgentConfig()

    // Truncate output to keep evaluation costs low
    const truncatedOutput =
      output.length > MAX_OUTPUT_CHARS ? output.substring(0, MAX_OUTPUT_CHARS) : output

    const prompt = `Goal: ${goal}\n\nOutput to evaluate:\n${truncatedOutput}`

    const result = await executeWithProvider(judgeAgent, prompt, {}, apiKeys)

    // Parse JSON response
    const parsed = JSON.parse(result.output) as Record<string, unknown>

    const relevance = parsed.relevance
    const completeness = parsed.completeness
    const accuracy = parsed.accuracy

    // Validate scores are numbers in range 1-5
    if (
      typeof relevance !== 'number' ||
      typeof completeness !== 'number' ||
      typeof accuracy !== 'number' ||
      relevance < 1 ||
      relevance > 5 ||
      completeness < 1 ||
      completeness > 5 ||
      accuracy < 1 ||
      accuracy > 5
    ) {
      log.warn('Evaluation scores out of range', { relevance, completeness, accuracy })
      return null
    }

    return {
      relevance,
      completeness,
      accuracy,
      evaluatedAtMs: Date.now(),
    }
  } catch (error) {
    log.warn('Evaluation failed (non-critical)', { error })
    return null
  }
}
