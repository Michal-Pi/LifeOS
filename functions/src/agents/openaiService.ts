/**
 * OpenAI Service
 *
 * Wrapper for OpenAI API calls with token counting and cost estimation.
 * Supports tool calling with iterative execution.
 * Follows existing function patterns with error handling and logging.
 */

import type { AgentConfig } from '@lifeos/agents'
import OpenAI from 'openai'

import type { ToolExecutionContext } from './toolExecutor.js'
import { executeTools, getAgentTools } from './toolExecutor.js'

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
 * @param toolContext Optional tool execution context (enables tool calling)
 * @returns Execution result with output, tokens, and cost
 */
export async function executeWithOpenAI(
  client: OpenAI,
  agent: AgentConfig,
  goal: string,
  context?: Record<string, unknown>,
  toolContext?: ToolExecutionContext
): Promise<OpenAIExecutionResult> {
  try {
    // Build the prompt
    const systemPrompt =
      agent.systemPrompt ?? `You are ${agent.role}. Help the user accomplish their goal.`

    const contextStr = context ? `\n\nContext:\n${JSON.stringify(context, null, 2)}` : ''

    const userPrompt = `Goal: ${goal}${contextStr}`

    // Determine model name (use agent's modelName or default to gpt-4o-mini)
    const modelName = agent.modelName ?? 'gpt-4o-mini'

    // Initialize message history
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ]

    // Get available tools for this agent
    const tools = toolContext ? getAgentTools(agent) : []

    // Track total tokens and cost across all iterations
    let totalInputTokens = 0
    let totalOutputTokens = 0

    // Iterative execution loop (max 5 iterations to prevent infinite loops)
    const MAX_ITERATIONS = 5
    let iteration = 0
    let finalOutput = ''

    while (iteration < MAX_ITERATIONS) {
      iteration++
      console.log(`OpenAI iteration ${iteration}/${MAX_ITERATIONS}`)

      // Call OpenAI API
      const response = await client.chat.completions.create({
        model: modelName,
        messages,
        temperature: agent.temperature ?? 0.7,
        max_tokens: agent.maxTokens ?? 2048,
        tools: tools.length > 0 ? tools : undefined,
        tool_choice: tools.length > 0 ? 'auto' : undefined,
      })

      // Track token usage
      totalInputTokens += response.usage?.prompt_tokens ?? 0
      totalOutputTokens += response.usage?.completion_tokens ?? 0

      const message = response.choices[0]?.message

      if (!message) {
        throw new Error('No message in OpenAI response')
      }

      // Add assistant's message to history
      messages.push(message)

      // Check if agent wants to call tools
      if (message.tool_calls && message.tool_calls.length > 0 && toolContext) {
        console.log(`Agent requesting ${message.tool_calls.length} tool calls`)

        // Execute all tool calls in parallel
        const toolCalls = message.tool_calls
          .filter((tc) => tc.type === 'function')
          .map((tc) => ({
            toolCallId: tc.id,
            toolName: tc.type === 'function' ? tc.function.name : '',
            parameters:
              tc.type === 'function' ? JSON.parse(tc.function.arguments) : {},
          }))

        const toolResults = await executeTools(toolCalls, toolContext)

        // Add tool results to message history
        for (const toolResult of toolResults) {
          messages.push({
            role: 'tool',
            tool_call_id: toolResult.toolCallId,
            content: toolResult.error
              ? `Error: ${toolResult.error}`
              : JSON.stringify(toolResult.result),
          })
        }

        console.log(`Executed ${toolResults.length} tools, continuing agent iteration`)
        // Continue loop to get agent's response with tool results
      } else {
        // No tool calls, agent provided final output
        finalOutput = message.content ?? ''
        console.log(`Agent completed in ${iteration} iterations (no more tool calls)`)
        break
      }
    }

    if (iteration >= MAX_ITERATIONS) {
      console.warn(`Agent reached max iterations (${MAX_ITERATIONS}) with tool calls`)
      // Use last message content as final output
      finalOutput =
        messages[messages.length - 1]?.content?.toString() ??
        'Agent reached max iterations without providing final output'
    }

    // Calculate totals
    const tokensUsed = totalInputTokens + totalOutputTokens
    const estimatedCost = calculateCost(modelName, totalInputTokens, totalOutputTokens)

    return {
      output: finalOutput,
      tokensUsed,
      estimatedCost,
    }
  } catch (error) {
    console.error('OpenAI execution error:', error)
    throw new Error(`OpenAI API error: ${(error as Error).message}`)
  }
}
