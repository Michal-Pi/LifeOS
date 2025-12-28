/**
 * Anthropic Service
 *
 * Wrapper for Anthropic (Claude) API calls with token counting and cost estimation.
 * Follows the same pattern as OpenAI service for consistency.
 */

import Anthropic from '@anthropic-ai/sdk'
import type { AgentConfig } from '@lifeos/agents'

/**
 * Initialize Anthropic client with API key from Firebase secrets
 */
export function createAnthropicClient(apiKey: string): Anthropic {
  return new Anthropic({
    apiKey,
  })
}

/**
 * Result from Anthropic execution
 */
export interface AnthropicExecutionResult {
  output: string
  tokensUsed: number
  estimatedCost: number
}

/**
 * Anthropic pricing per 1M tokens (as of Dec 2024)
 * Source: https://www.anthropic.com/pricing
 */
const ANTHROPIC_PRICING: Record<string, { input: number; output: number }> = {
  'claude-3-5-sonnet-20241022': { input: 3.0, output: 15.0 },
  'claude-3-5-haiku-20241022': { input: 1.0, output: 5.0 },
  'claude-3-opus-20240229': { input: 15.0, output: 75.0 },
  'claude-3-sonnet-20240229': { input: 3.0, output: 15.0 },
  'claude-3-haiku-20240307': { input: 0.25, output: 1.25 },
  // Default fallback
  default: { input: 3.0, output: 15.0 },
}

/**
 * Calculate cost based on token usage
 */
function calculateCost(modelName: string, inputTokens: number, outputTokens: number): number {
  const pricing = ANTHROPIC_PRICING[modelName] ?? ANTHROPIC_PRICING['default']
  const inputCost = (inputTokens / 1_000_000) * pricing.input
  const outputCost = (outputTokens / 1_000_000) * pricing.output
  return inputCost + outputCost
}

/**
 * Execute a single-agent task using Anthropic
 *
 * @param client Anthropic client instance
 * @param agent Agent configuration
 * @param goal User's goal/task description
 * @param context Optional context object
 * @returns Execution result with output, tokens, and cost
 */
export async function executeWithAnthropic(
  client: Anthropic,
  agent: AgentConfig,
  goal: string,
  context?: Record<string, unknown>
): Promise<AnthropicExecutionResult> {
  try {
    // Build the prompt
    const systemPrompt =
      agent.systemPrompt ?? `You are ${agent.role}. Help the user accomplish their goal.`

    const contextStr = context ? `\n\nContext:\n${JSON.stringify(context, null, 2)}` : ''

    const userPrompt = `Goal: ${goal}${contextStr}`

    // Determine model name (use agent's modelName or default to Claude 3.5 Haiku)
    const modelName = agent.modelName ?? 'claude-3-5-haiku-20241022'

    // Call Anthropic API
    const response = await client.messages.create({
      model: modelName,
      max_tokens: agent.maxTokens ?? 2048,
      temperature: agent.temperature ?? 0.7,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: userPrompt,
        },
      ],
    })

    // Extract result
    const output =
      response.content[0]?.type === 'text' ? response.content[0].text : 'No response generated'
    const inputTokens = response.usage.input_tokens
    const outputTokens = response.usage.output_tokens
    const tokensUsed = inputTokens + outputTokens

    // Calculate cost
    const estimatedCost = calculateCost(modelName, inputTokens, outputTokens)

    return {
      output,
      tokensUsed,
      estimatedCost,
    }
  } catch (error) {
    console.error('Anthropic execution error:', error)
    throw new Error(`Anthropic API error: ${(error as Error).message}`)
  }
}
