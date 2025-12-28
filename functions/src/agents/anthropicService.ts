/**
 * Anthropic Service
 *
 * Wrapper for Anthropic (Claude) API calls with token counting and cost estimation.
 * Supports tool calling with iterative execution.
 * Follows the same pattern as OpenAI service for consistency.
 */

import Anthropic from '@anthropic-ai/sdk'
import type { AgentConfig } from '@lifeos/agents'

import type { ToolExecutionContext } from './toolExecutor.js'
import { executeTools, getAgentTools } from './toolExecutor.js'

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
 * Convert tool definitions to Anthropic format
 */
function convertToolsToAnthropicFormat(
  tools: Array<{
    type: 'function'
    function: {
      name: string
      description: string
      parameters: Record<string, unknown>
    }
  }>
): Anthropic.Tool[] {
  return tools.map((tool) => ({
    name: tool.function.name,
    description: tool.function.description,
    input_schema: tool.function.parameters as Anthropic.Tool.InputSchema,
  }))
}

/**
 * Execute a single-agent task using Anthropic
 *
 * @param client Anthropic client instance
 * @param agent Agent configuration
 * @param goal User's goal/task description
 * @param context Optional context object
 * @param toolContext Optional tool execution context (enables tool calling)
 * @returns Execution result with output, tokens, and cost
 */
export async function executeWithAnthropic(
  client: Anthropic,
  agent: AgentConfig,
  goal: string,
  context?: Record<string, unknown>,
  toolContext?: ToolExecutionContext
): Promise<AnthropicExecutionResult> {
  try {
    // Build the prompt
    const systemPrompt =
      agent.systemPrompt ?? `You are ${agent.role}. Help the user accomplish their goal.`

    const contextStr = context ? `\n\nContext:\n${JSON.stringify(context, null, 2)}` : ''

    const userPrompt = `Goal: ${goal}${contextStr}`

    // Determine model name (use agent's modelName or default to Claude 3.5 Haiku)
    const modelName = agent.modelName ?? 'claude-3-5-haiku-20241022'

    // Get available tools for this agent
    const toolsOpenAIFormat = toolContext ? getAgentTools(agent) : []
    const tools =
      toolsOpenAIFormat.length > 0 ? convertToolsToAnthropicFormat(toolsOpenAIFormat) : undefined

    // Initialize message history
    const messages: Anthropic.MessageParam[] = [
      {
        role: 'user',
        content: userPrompt,
      },
    ]

    // Track total tokens and cost across all iterations
    let totalInputTokens = 0
    let totalOutputTokens = 0

    // Iterative execution loop (max 5 iterations to prevent infinite loops)
    const MAX_ITERATIONS = 5
    let iteration = 0
    let finalOutput = ''

    while (iteration < MAX_ITERATIONS) {
      iteration++
      console.log(`Anthropic iteration ${iteration}/${MAX_ITERATIONS}`)

      // Call Anthropic API
      const response = await client.messages.create({
        model: modelName,
        max_tokens: agent.maxTokens ?? 2048,
        temperature: agent.temperature ?? 0.7,
        system: systemPrompt,
        messages,
        tools,
      })

      // Track token usage
      totalInputTokens += response.usage.input_tokens
      totalOutputTokens += response.usage.output_tokens

      // Check stop reason
      if (response.stop_reason === 'tool_use' && toolContext) {
        console.log(`Agent requesting tool calls`)

        // Extract tool use content blocks
        const toolUseBlocks = response.content.filter((block) => block.type === 'tool_use')

        if (toolUseBlocks.length > 0) {
          // Execute all tool calls in parallel
          const toolCalls = toolUseBlocks.map((block) => {
            if (block.type !== 'tool_use') throw new Error('Expected tool_use block')
            return {
              toolCallId: block.id,
              toolName: block.name,
              parameters: block.input as Record<string, unknown>,
            }
          })

          const toolResults = await executeTools(toolCalls, toolContext)

          // Add assistant's message to history (with tool_use blocks)
          messages.push({
            role: 'assistant',
            content: response.content,
          })

          // Add tool results to message history
          const toolResultContent: Anthropic.ToolResultBlockParam[] = toolResults.map(
            (toolResult) => ({
              type: 'tool_result',
              tool_use_id: toolResult.toolCallId,
              content: toolResult.error
                ? `Error: ${toolResult.error}`
                : JSON.stringify(toolResult.result),
            })
          )

          messages.push({
            role: 'user',
            content: toolResultContent,
          })

          console.log(`Executed ${toolResults.length} tools, continuing agent iteration`)
          // Continue loop to get agent's response with tool results
        } else {
          // No tool use blocks found (shouldn't happen with tool_use stop_reason)
          finalOutput =
            response.content.find((block) => block.type === 'text')?.text ?? 'No response generated'
          break
        }
      } else {
        // No tool calls, agent provided final output
        finalOutput =
          response.content.find((block) => block.type === 'text')?.text ?? 'No response generated'
        console.log(`Agent completed in ${iteration} iterations (no more tool calls)`)
        break
      }
    }

    if (iteration >= MAX_ITERATIONS) {
      console.warn(`Agent reached max iterations (${MAX_ITERATIONS}) with tool calls`)
      // Use last message content as final output
      const lastMessage = messages[messages.length - 1]
      if (lastMessage && lastMessage.role === 'assistant') {
        const lastContent = Array.isArray(lastMessage.content)
          ? lastMessage.content
          : [{ type: 'text' as const, text: lastMessage.content }]
        finalOutput =
          lastContent.find((block) => block.type === 'text')?.text ??
          'Agent reached max iterations without providing final output'
      } else {
        finalOutput = 'Agent reached max iterations without providing final output'
      }
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
    console.error('Anthropic execution error:', error)
    throw new Error(`Anthropic API error: ${(error as Error).message}`)
  }
}
