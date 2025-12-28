/**
 * OpenAI Service
 *
 * Wrapper for OpenAI API calls with token counting and cost estimation.
 * Follows existing function patterns with error handling and logging.
 */

import type { AgentConfig } from '@lifeos/agents'
import OpenAI from 'openai'

/**
 * Initialize OpenAI client with API key from Firebase secrets
 */
export function createOpenAIClient(apiKey: string): OpenAI {
  return new OpenAI({
    apiKey,
  })
}

/**
 * Result from OpenAI execution
 */
export interface OpenAIExecutionResult {
  output: string
  tokensUsed: number
  estimatedCost: number
}

/**
 * OpenAI pricing per 1M tokens (as of Dec 2024)
 * Source: https://openai.com/api/pricing/
 */
const OPENAI_PRICING: Record<string, { input: number; output: number }> = {
  'gpt-4o': { input: 2.5, output: 10.0 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-4-turbo': { input: 10.0, output: 30.0 },
  'gpt-4': { input: 30.0, output: 60.0 },
  'gpt-3.5-turbo': { input: 0.5, output: 1.5 },
  // Default fallback
  default: { input: 5.0, output: 15.0 },
}

/**
 * Calculate cost based on token usage
 */
function calculateCost(modelName: string, inputTokens: number, outputTokens: number): number {
  const pricing = OPENAI_PRICING[modelName] ?? OPENAI_PRICING['default']
  const inputCost = (inputTokens / 1_000_000) * pricing.input
  const outputCost = (outputTokens / 1_000_000) * pricing.output
  return inputCost + outputCost
}

/**
 * Execute a single-agent task using OpenAI
 *
 * @param client OpenAI client instance
 * @param agent Agent configuration
 * @param goal User's goal/task description
 * @param context Optional context object
 * @returns Execution result with output, tokens, and cost
 */
export async function executeWithOpenAI(
  client: OpenAI,
  agent: AgentConfig,
  goal: string,
  context?: Record<string, unknown>
): Promise<OpenAIExecutionResult> {
  try {
    // Build the prompt
    const systemPrompt =
      agent.systemPrompt ?? `You are ${agent.role}. Help the user accomplish their goal.`

    const contextStr = context ? `\n\nContext:\n${JSON.stringify(context, null, 2)}` : ''

    const userPrompt = `Goal: ${goal}${contextStr}`

    // Determine model name (use agent's modelName or default to gpt-4o-mini)
    const modelName = agent.modelName ?? 'gpt-4o-mini'

    // Call OpenAI API
    const response = await client.chat.completions.create({
      model: modelName,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: agent.temperature ?? 0.7,
      max_tokens: agent.maxTokens ?? 2048,
    })

    // Extract result
    const output = response.choices[0]?.message?.content ?? ''
    const inputTokens = response.usage?.prompt_tokens ?? 0
    const outputTokens = response.usage?.completion_tokens ?? 0
    const tokensUsed = inputTokens + outputTokens

    // Calculate cost
    const estimatedCost = calculateCost(modelName, inputTokens, outputTokens)

    return {
      output,
      tokensUsed,
      estimatedCost,
    }
  } catch (error) {
    console.error('OpenAI execution error:', error)
    throw new Error(`OpenAI API error: ${(error as Error).message}`)
  }
}
