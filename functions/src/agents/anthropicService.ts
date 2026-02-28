/**
 * Anthropic Service
 *
 * Wrapper for Anthropic (Claude) API calls with token counting and cost estimation.
 * Supports tool calling with iterative execution.
 * Follows the same pattern as OpenAI service for consistency.
 */

import Anthropic from '@anthropic-ai/sdk'
import type { AgentConfig } from '@lifeos/agents'
import { asId, MODEL_PRICING } from '@lifeos/agents'

import { createLogger } from '../lib/logger.js'
import { executeWithTimeout, TIMEOUTS, wrapError } from './errorHandler.js'
import { recordMessage } from './messageStore.js'
import { checkProviderRateLimit } from './rateLimiter.js'
import { executeWithRetry, PROVIDER_RETRY_CONFIG } from './retryHelper.js'
import type { StreamContext } from './streamingTypes.js'
import type { BaseToolExecutionContext } from './toolExecutor.js'
import { executeTools, getAgentToolsFromRegistry, getBuiltinToolRegistry } from './toolExecutor.js'

const log = createLogger('AnthropicService')

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
  iterationsUsed: number
}

/**
 * Calculate cost based on token usage
 */
function calculateCost(modelName: string, inputTokens: number, outputTokens: number): number {
  const pricing = MODEL_PRICING[modelName] ?? MODEL_PRICING.default
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
  toolContext?: BaseToolExecutionContext
): Promise<AnthropicExecutionResult> {
  const modelName = agent.modelName ?? 'claude-haiku-4-5'

  try {
    // Build the prompt
    const systemPrompt =
      agent.systemPrompt ?? `You are ${agent.role}. Help the user accomplish their goal.`

    const contextStr = context ? `\n\nContext:\n${JSON.stringify(context, null, 2)}` : ''

    const userPrompt = `Goal: ${goal}${contextStr}`

    // Get available tools for this agent
    const toolsOpenAIFormat = toolContext
      ? getAgentToolsFromRegistry(agent, toolContext.toolRegistry ?? getBuiltinToolRegistry())
      : []
    const tools =
      toolsOpenAIFormat.length > 0 ? convertToolsToAnthropicFormat(toolsOpenAIFormat) : undefined

    // Initialize message history
    const messages: Anthropic.MessageParam[] = [
      {
        role: 'user',
        content: userPrompt,
      },
    ]

    if (toolContext) {
      await recordMessage({
        userId: toolContext.userId,
        runId: toolContext.runId,
        agentId: toolContext.agentId,
        role: 'system',
        content: systemPrompt,
      })
      await recordMessage({
        userId: toolContext.userId,
        runId: toolContext.runId,
        agentId: toolContext.agentId,
        role: 'user',
        content: userPrompt,
      })
    }

    // Track total tokens and cost across all iterations
    let totalInputTokens = 0
    let totalOutputTokens = 0

    // Iterative execution loop (configurable, default 5)
    const MAX_ITERATIONS = toolContext?.maxIterations ?? 5
    let iteration = 0
    let finalOutput = ''

    while (iteration < MAX_ITERATIONS) {
      iteration++
      log.info('Iteration started', { iteration, maxIterations: MAX_ITERATIONS })

      // Call Anthropic API
      const response = await executeWithRetry(
        async () => {
          if (toolContext?.userId) {
            await checkProviderRateLimit(toolContext.userId, 'anthropic')
          }

          return executeWithTimeout(
            client.messages.create({
              model: modelName,
              max_tokens: agent.maxTokens ?? 2048,
              temperature: agent.temperature ?? 0.7,
              system: systemPrompt,
              messages,
              tools,
            }),
            TIMEOUTS.PROVIDER,
            'anthropic.messages.create'
          )
        },
        PROVIDER_RETRY_CONFIG,
        (attempt, error, delayMs) => {
          log.info('Retrying request', {
            attempt,
            maxRetries: PROVIDER_RETRY_CONFIG.maxRetries,
            delayMs,
            error: (error as Error).message,
          })
        }
      )

      // Track token usage
      totalInputTokens += response.usage.input_tokens
      totalOutputTokens += response.usage.output_tokens

      // Check stop reason
      if (response.stop_reason === 'tool_use' && toolContext) {
        log.info('Agent requesting tool calls')

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

          const toolResults = await executeTools(toolCalls, {
            ...toolContext,
            provider: 'anthropic',
            modelName,
            iteration,
          })

          const toolCallRecords = toolCalls.map((call) => ({
            toolCallId: call.toolCallId,
            toolId: asId<'tool'>(`tool:${call.toolName}`),
            toolName: call.toolName,
            parameters: call.parameters,
          }))

          const assistantText = response.content
            .filter((block) => block.type === 'text')
            .map((block) => (block.type === 'text' ? block.text : ''))
            .join('\n')

          await recordMessage({
            userId: toolContext.userId,
            runId: toolContext.runId,
            agentId: toolContext.agentId,
            role: 'assistant',
            content: assistantText,
            toolCalls: toolCallRecords,
          })

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

          for (const toolResult of toolResults) {
            await recordMessage({
              userId: toolContext.userId,
              runId: toolContext.runId,
              agentId: toolContext.agentId,
              role: 'tool',
              content: toolResult.error
                ? `Error: ${toolResult.error}`
                : JSON.stringify(toolResult.result),
              toolResults: [
                {
                  toolCallId: toolResult.toolCallId,
                  result: toolResult.result,
                  error: toolResult.error,
                },
              ],
            })
          }

          log.info('Tools executed, continuing iteration', { toolCount: toolResults.length })

          // Budget warning: on penultimate iteration, tell agent to synthesize
          if (iteration === MAX_ITERATIONS - 1) {
            log.info('Budget warning, injecting synthesis prompt', {
              iteration,
              maxIterations: MAX_ITERATIONS,
            })
            messages.push({
              role: 'user',
              content:
                'IMPORTANT: You are at your tool-calling budget limit. ' +
                'You MUST synthesize your findings into a complete response NOW. ' +
                'Do NOT make additional tool calls. Provide your best output with what you have gathered.',
            })
          }

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
        if (toolContext) {
          await recordMessage({
            userId: toolContext.userId,
            runId: toolContext.runId,
            agentId: toolContext.agentId,
            role: 'assistant',
            content: finalOutput,
          })
        }
        log.info('Agent completed, no more tool calls', { iterationsUsed: iteration })
        break
      }
    }

    if (iteration >= MAX_ITERATIONS && !finalOutput) {
      log.warn('Agent reached max iterations with tool calls', { maxIterations: MAX_ITERATIONS })
      const lastMessage = messages[messages.length - 1]
      let lastText = ''
      if (lastMessage && lastMessage.role === 'assistant') {
        const lastContent = Array.isArray(lastMessage.content)
          ? lastMessage.content
          : [{ type: 'text' as const, text: lastMessage.content }]
        lastText = lastContent.find((block) => block.type === 'text')?.text ?? ''
      }
      if (!lastText || lastText.startsWith('{') || lastText.startsWith('[')) {
        finalOutput =
          `[PARTIAL RESULT - iteration budget exhausted after ${iteration} tool calls]\n\n` +
          `The agent gathered research data but could not complete synthesis. ` +
          `Consider increasing the iteration budget for tool-heavy agents.`
      } else {
        finalOutput = lastText
      }
      if (toolContext) {
        await recordMessage({
          userId: toolContext.userId,
          runId: toolContext.runId,
          agentId: toolContext.agentId,
          role: 'assistant',
          content: finalOutput,
        })
      }
    }

    // Calculate totals
    const tokensUsed = totalInputTokens + totalOutputTokens
    const estimatedCost = calculateCost(modelName, totalInputTokens, totalOutputTokens)

    return {
      output: finalOutput,
      tokensUsed,
      estimatedCost,
      iterationsUsed: iteration,
    }
  } catch (error) {
    log.error('Execution error', error)
    const agentError = wrapError(error, 'anthropic')
    agentError.details = {
      ...agentError.details,
      provider: 'anthropic',
      model: modelName,
    }
    throw agentError
  }
}

/**
 * Execute a single-agent task using Anthropic with streaming output.
 * Falls back to non-streaming when tools are enabled.
 */
export async function executeWithAnthropicStreaming(
  client: Anthropic,
  agent: AgentConfig,
  goal: string,
  context: Record<string, unknown> | undefined,
  toolContext: BaseToolExecutionContext | undefined,
  stream: StreamContext
): Promise<AnthropicExecutionResult> {
  const modelName = agent.modelName ?? 'claude-haiku-4-5'
  const toolsOpenAIFormat = toolContext
    ? getAgentToolsFromRegistry(agent, toolContext.toolRegistry ?? getBuiltinToolRegistry())
    : []
  const tools =
    toolsOpenAIFormat.length > 0 ? convertToolsToAnthropicFormat(toolsOpenAIFormat) : undefined

  if (tools && tools.length > 0) {
    return executeWithAnthropic(client, agent, goal, context, toolContext)
  }

  try {
    const systemPrompt =
      agent.systemPrompt ?? `You are ${agent.role}. Help the user accomplish their goal.`

    const contextStr = context ? `\n\nContext:\n${JSON.stringify(context, null, 2)}` : ''
    const userPrompt = `Goal: ${goal}${contextStr}`

    const messages: Anthropic.MessageParam[] = [
      {
        role: 'user',
        content: userPrompt,
      },
    ]

    if (toolContext) {
      await recordMessage({
        userId: toolContext.userId,
        runId: toolContext.runId,
        agentId: toolContext.agentId,
        role: 'system',
        content: systemPrompt,
      })
      await recordMessage({
        userId: toolContext.userId,
        runId: toolContext.runId,
        agentId: toolContext.agentId,
        role: 'user',
        content: userPrompt,
      })
    }

    let finalOutput = ''

    const streamResponse = await executeWithRetry(
      async () => {
        if (toolContext?.userId) {
          await checkProviderRateLimit(toolContext.userId, 'anthropic')
        }

        return client.messages.stream({
          model: modelName,
          max_tokens: agent.maxTokens ?? 2048,
          temperature: agent.temperature ?? 0.7,
          system: systemPrompt,
          messages,
        })
      },
      PROVIDER_RETRY_CONFIG,
      (attempt, error, delayMs) => {
        log.info('Retrying streaming request', {
          attempt,
          maxRetries: PROVIDER_RETRY_CONFIG.maxRetries,
          delayMs,
          error: (error as Error).message,
        })
      }
    )

    for await (const event of streamResponse) {
      if (event.type === 'content_block_delta') {
        const delta = (event.delta as { text?: string })?.text ?? ''
        if (delta) {
          finalOutput += delta
          await stream.eventWriter.appendToken(delta, {
            workflowId: toolContext?.workflowId,
            agentId: stream.agentId,
            agentName: stream.agentName,
            provider: 'anthropic',
            model: modelName,
            step: stream.step,
          })
        }
      }
    }

    await stream.eventWriter.flushTokens({
      workflowId: toolContext?.workflowId,
      agentId: stream.agentId,
      agentName: stream.agentName,
      provider: 'anthropic',
      model: modelName,
      step: stream.step,
    })

    const finalMessage = await streamResponse.finalMessage()

    if (toolContext) {
      await recordMessage({
        userId: toolContext.userId,
        runId: toolContext.runId,
        agentId: toolContext.agentId,
        role: 'assistant',
        content: finalOutput,
      })
    }

    const inputTokens = finalMessage.usage?.input_tokens ?? 0
    const outputTokens = finalMessage.usage?.output_tokens ?? 0
    const tokensUsed = inputTokens + outputTokens
    const estimatedCost = calculateCost(modelName, inputTokens, outputTokens)

    return {
      output: finalOutput,
      tokensUsed,
      estimatedCost,
      iterationsUsed: 1,
    }
  } catch (error) {
    log.error('Streaming execution error', error)
    const agentError = wrapError(error, 'anthropic')
    agentError.details = {
      ...agentError.details,
      provider: 'anthropic',
      model: modelName,
    }
    throw agentError
  }
}
