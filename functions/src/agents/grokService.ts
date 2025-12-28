/**
 * Grok (xAI) Service
 *
 * Wrapper for xAI's Grok API calls with token counting and cost estimation.
 * Grok uses an OpenAI-compatible API, so we use the OpenAI SDK with a custom base URL.
 */

import type { AgentConfig } from '@lifeos/agents'
import OpenAI from 'openai'

/**
 * Initialize Grok client with API key from Firebase secrets
 * Uses OpenAI SDK with xAI's base URL
 */
export function createGrokClient(apiKey: string): OpenAI {
  return new OpenAI({
    apiKey,
    baseURL: 'https://api.x.ai/v1',
  })
}

/**
 * Result from Grok execution
 */
export interface GrokExecutionResult {
  output: string
  tokensUsed: number
  estimatedCost: number
}

/**
 * Grok pricing per 1M tokens (as of Dec 2024)
 * Source: https://x.ai/api
 * Note: Pricing may change; verify at https://x.ai/pricing
 */
const GROK_PRICING: Record<string, { input: number; output: number }> = {
  'grok-beta': { input: 5.0, output: 15.0 },
  'grok-2-1212': { input: 2.0, output: 10.0 },
  // Default fallback
  default: { input: 5.0, output: 15.0 },
}

/**
 * Calculate cost based on token usage
 */
function calculateCost(modelName: string, inputTokens: number, outputTokens: number): number {
  const pricing = GROK_PRICING[modelName] ?? GROK_PRICING['default']
  const inputCost = (inputTokens / 1_000_000) * pricing.input
  const outputCost = (outputTokens / 1_000_000) * pricing.output
  return inputCost + outputCost
}

/**
 * Execute a single-agent task using Grok
 *
 * @param client Grok client instance (OpenAI SDK configured for xAI)
 * @param agent Agent configuration
 * @param goal User's goal/task description
 * @param context Optional context object
 * @returns Execution result with output, tokens, and cost
 */
export async function executeWithGrok(
  client: OpenAI,
  agent: AgentConfig,
  goal: string,
  context?: Record<string, unknown>
): Promise<GrokExecutionResult> {
  try {
    // Build the prompt
    const systemPrompt =
      agent.systemPrompt ?? `You are ${agent.role}. Help the user accomplish their goal.`

    const contextStr = context ? `\n\nContext:\n${JSON.stringify(context, null, 2)}` : ''

    const userPrompt = `Goal: ${goal}${contextStr}`

    // Determine model name (use agent's modelName or default to grok-2-1212)
    const modelName = agent.modelName ?? 'grok-2-1212'

    // Call Grok API (OpenAI-compatible)
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
    console.error('Grok execution error:', error)
    throw new Error(`Grok API error: ${(error as Error).message}`)
  }
}
