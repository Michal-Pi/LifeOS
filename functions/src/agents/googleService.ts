/**
 * Google Gemini Service
 *
 * Wrapper for Google Generative AI (Gemini) API calls with token counting and cost estimation.
 * Follows the same pattern as OpenAI/Anthropic services for consistency.
 */

import { GoogleGenerativeAI } from '@google/generative-ai'
import type { AgentConfig } from '@lifeos/agents'

/**
 * Initialize Google AI client with API key from Firebase secrets
 */
export function createGoogleAIClient(apiKey: string): GoogleGenerativeAI {
  return new GoogleGenerativeAI(apiKey)
}

/**
 * Result from Google Gemini execution
 */
export interface GoogleExecutionResult {
  output: string
  tokensUsed: number
  estimatedCost: number
}

/**
 * Google Gemini pricing per 1M tokens (as of Dec 2024)
 * Source: https://ai.google.dev/pricing
 */
const GOOGLE_PRICING: Record<string, { input: number; output: number }> = {
  'gemini-1.5-pro': { input: 1.25, output: 5.0 },
  'gemini-1.5-flash': { input: 0.075, output: 0.3 },
  'gemini-1.0-pro': { input: 0.5, output: 1.5 },
  // Default fallback
  default: { input: 0.5, output: 1.5 },
}

/**
 * Calculate cost based on token usage
 */
function calculateCost(modelName: string, inputTokens: number, outputTokens: number): number {
  const pricing = GOOGLE_PRICING[modelName] ?? GOOGLE_PRICING['default']
  const inputCost = (inputTokens / 1_000_000) * pricing.input
  const outputCost = (outputTokens / 1_000_000) * pricing.output
  return inputCost + outputCost
}

/**
 * Execute a single-agent task using Google Gemini
 *
 * @param client Google AI client instance
 * @param agent Agent configuration
 * @param goal User's goal/task description
 * @param context Optional context object
 * @returns Execution result with output, tokens, and cost
 */
export async function executeWithGoogle(
  client: GoogleGenerativeAI,
  agent: AgentConfig,
  goal: string,
  context?: Record<string, unknown>
): Promise<GoogleExecutionResult> {
  try {
    // Build the prompt
    const systemPrompt =
      agent.systemPrompt ?? `You are ${agent.role}. Help the user accomplish their goal.`

    const contextStr = context ? `\n\nContext:\n${JSON.stringify(context, null, 2)}` : ''

    const userPrompt = `${systemPrompt}\n\nGoal: ${goal}${contextStr}`

    // Determine model name (use agent's modelName or default to Gemini 1.5 Flash)
    const modelName = agent.modelName ?? 'gemini-1.5-flash'

    // Get the model
    const model = client.getGenerativeModel({
      model: modelName,
      generationConfig: {
        temperature: agent.temperature ?? 0.7,
        maxOutputTokens: agent.maxTokens ?? 2048,
      },
    })

    // Call Google Gemini API
    const result = await model.generateContent(userPrompt)
    const response = result.response

    // Extract result
    const output = response.text()

    // Note: Google's API doesn't always provide token counts in the response
    // For now, we'll estimate based on the response
    const inputTokens = Math.ceil(userPrompt.length / 4) // Rough estimate: 1 token ≈ 4 chars
    const outputTokens = Math.ceil(output.length / 4)
    const tokensUsed = inputTokens + outputTokens

    // Calculate cost
    const estimatedCost = calculateCost(modelName, inputTokens, outputTokens)

    return {
      output,
      tokensUsed,
      estimatedCost,
    }
  } catch (error) {
    console.error('Google Gemini execution error:', error)
    throw new Error(`Google Gemini API error: ${(error as Error).message}`)
  }
}
