/**
 * Anthropic Service
 *
 * Wrapper for Anthropic (Claude) API calls with token counting and cost estimation.
 * Supports tool calling with iterative execution.
 * Supports prompt caching for system prompts exceeding 1024 tokens.
 * Follows the same pattern as OpenAI service for consistency.
 */

import Anthropic from '@anthropic-ai/sdk'
import type { TextBlockParam } from '@anthropic-ai/sdk/resources/messages/messages.js'
import type { AgentConfig } from '@lifeos/agents'
import { asId, MODEL_PRICING } from '@lifeos/agents'

import { createLogger } from '../lib/logger.js'
import { executeWithTimeout, getProviderTimeout, wrapError } from './errorHandler.js'
import { recordMessage } from './messageStore.js'
import { checkProviderRateLimit } from './rateLimiter.js'
import { executeWithRetry, PROVIDER_RETRY_CONFIG } from './retryHelper.js'
import type { StreamContext } from './streamingTypes.js'
import type { BaseToolExecutionContext } from './toolExecutor.js'
import { executeTools, getAgentToolsFromRegistry, getBuiltinToolRegistry } from './toolExecutor.js'

const log = createLogger('AnthropicService')

/**
 * Minimum token threshold for applying prompt caching.
 * Anthropic requires at least 1024 tokens for cache eligibility.
 */
const CACHE_TOKEN_THRESHOLD = 1024

/**
 * Initialize Anthropic client with API key from Firebase secrets
 */
export function createAnthropicClient(apiKey: string): Anthropic {
  return new Anthropic({
    apiKey,
  })
}

/**
 * Cache telemetry from an Anthropic API call
 */
export interface AnthropicCacheMetrics {
  cacheCreationInputTokens: number
  cacheReadInputTokens: number
  cacheStatus: 'hit' | 'miss' | 'creation' | 'none'
}

/**
 * Result from Anthropic execution
 */
export interface AnthropicExecutionResult {
  output: string
  tokensUsed: number
  estimatedCost: number
  iterationsUsed: number
  cacheMetrics?: AnthropicCacheMetrics
}

/**
 * Estimate token count from text using a rough heuristic.
 * ~1 token ≈ 4 characters for English text.
 */
export function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4)
}

/**
 * Build system prompt with cache_control for Anthropic prompt caching.
 * Returns TextBlockParam[] with cache_control on the last block if the
 * prompt exceeds the token threshold; otherwise returns the plain string.
 */
export function buildSystemPromptWithCaching(systemPrompt: string): string | TextBlockParam[] {
  const estimatedTokens = estimateTokenCount(systemPrompt)

  if (estimatedTokens < CACHE_TOKEN_THRESHOLD) {
    return systemPrompt
  }

  return [
    {
      type: 'text' as const,
      text: systemPrompt,
      cache_control: { type: 'ephemeral' as const },
    },
  ]
}

/**
 * Determine cache status from Anthropic usage response
 */
function determineCacheStatus(
  cacheCreationTokens: number | null | undefined,
  cacheReadTokens: number | null | undefined
): AnthropicCacheMetrics['cacheStatus'] {
  const creation = cacheCreationTokens ?? 0
  const read = cacheReadTokens ?? 0

  if (read > 0) return 'hit'
  if (creation > 0) return 'creation'
  return 'none'
}

/**
 * Calculate cost based on token usage, including prompt caching discounts.
 *
 * Anthropic cache pricing:
 * - Cache writes: 25% more than base input price
 * - Cache reads: 90% discount from base input price
 */
function calculateCost(
  modelName: string,
  inputTokens: number,
  outputTokens: number,
  cacheCreationTokens: number = 0,
  cacheReadTokens: number = 0
): number {
  const pricing = MODEL_PRICING[modelName] ?? MODEL_PRICING.default

  // Regular input tokens (excludes cached tokens already counted separately)
  const regularInputTokens = inputTokens - cacheCreationTokens - cacheReadTokens
  const regularInputCost = (Math.max(0, regularInputTokens) / 1_000_000) * pricing.input

  // Cache creation: 25% premium
  const cacheCreationCost = (cacheCreationTokens / 1_000_000) * pricing.input * 1.25

  // Cache read: 90% discount (pay only 10%)
  const cacheReadCost = (cacheReadTokens / 1_000_000) * pricing.input * 0.1

  const outputCost = (outputTokens / 1_000_000) * pricing.output

  return regularInputCost + cacheCreationCost + cacheReadCost + outputCost
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

    // Build system prompt with caching support
    const systemParam = buildSystemPromptWithCaching(systemPrompt)

    // Track total tokens and cost across all iterations
    let totalInputTokens = 0
    let totalOutputTokens = 0
    let totalCacheCreationTokens = 0
    let totalCacheReadTokens = 0

    // Iterative execution loop (configurable, default 5)
    const MAX_ITERATIONS = toolContext?.maxIterations ?? 5
    let iteration = 0
    let finalOutput = ''

    while (iteration < MAX_ITERATIONS) {
      iteration++
      log.info('Iteration started', { iteration, maxIterations: MAX_ITERATIONS })

      // Call Anthropic API
      const requestStartMs = Date.now()
      const inputTokenEstimate = JSON.stringify(messages).length / 4 // rough estimate
      const dynamicTimeout = getProviderTimeout(inputTokenEstimate)
      log.info('Anthropic API request starting', {
        model: modelName,
        iteration,
        maxTokens: agent.maxTokens ?? 2048,
        messageCount: messages.length,
        inputTokenEstimate: Math.round(inputTokenEstimate),
        toolCount: tools?.length ?? 0,
        timeoutMs: dynamicTimeout,
      })

      const response = await executeWithRetry(
        async () => {
          if (toolContext?.userId) {
            await checkProviderRateLimit(toolContext.userId, 'anthropic')
          }

          const callStartMs = Date.now()
          try {
            const result = await executeWithTimeout(
              client.messages.create({
                model: modelName,
                max_tokens: agent.maxTokens ?? 2048,
                temperature: agent.temperature ?? 0.7,
                system: systemParam,
                messages,
                tools,
              }),
              dynamicTimeout,
              'anthropic.messages.create'
            )
            const callDurationMs = Date.now() - callStartMs
            log.info('Anthropic API response received', {
              model: modelName,
              durationMs: callDurationMs,
              inputTokens: result.usage.input_tokens,
              outputTokens: result.usage.output_tokens,
              stopReason: result.stop_reason,
            })
            return result
          } catch (error) {
            const callDurationMs = Date.now() - callStartMs
            log.error('Anthropic API call failed', error, {
              model: modelName,
              durationMs: callDurationMs,
              timedOut: callDurationMs >= dynamicTimeout - 100,
              inputTokenEstimate: Math.round(inputTokenEstimate),
              timeoutMs: dynamicTimeout,
            })
            throw error
          }
        },
        PROVIDER_RETRY_CONFIG,
        (attempt, error, delayMs) => {
          const elapsedMs = Date.now() - requestStartMs
          log.info('Retrying request', {
            attempt,
            maxRetries: PROVIDER_RETRY_CONFIG.maxRetries,
            delayMs,
            totalElapsedMs: elapsedMs,
            error: (error as Error).message,
          })
        }
      )

      // Track token usage (including cache metrics)
      totalInputTokens += response.usage.input_tokens
      totalOutputTokens += response.usage.output_tokens
      totalCacheCreationTokens += response.usage.cache_creation_input_tokens ?? 0
      totalCacheReadTokens += response.usage.cache_read_input_tokens ?? 0

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
                'Do NOT make additional tool calls. ' +
                'Your response MUST follow the exact output format specified in your system instructions — if you were asked to output JSON, output ONLY valid JSON with no preamble or markdown.',
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

    // Detect empty output: either budget exhausted or agent returned empty within budget
    const hadToolCalls =
      iteration > 1 ||
      messages.some(
        (m) =>
          m.role === 'user' &&
          Array.isArray(m.content) &&
          m.content.some((b) => 'type' in b && b.type === 'tool_result')
      )
    if (!finalOutput && hadToolCalls) {
      if (iteration >= MAX_ITERATIONS) {
        log.warn('Agent reached max iterations with tool calls', { maxIterations: MAX_ITERATIONS })
      } else {
        log.warn('Agent returned empty output after tool calls within budget', {
          iteration,
          maxIterations: MAX_ITERATIONS,
        })
      }

      // One final attempt: ask the model to synthesize from gathered data
      try {
        messages.push({
          role: 'user',
          content:
            'You have exhausted your tool-calling budget. ' +
            'Synthesize ALL findings from your research into a final response NOW. ' +
            'Do NOT make additional tool calls. ' +
            'Your response MUST follow the exact output format specified in your system instructions — if you were asked to output JSON, output ONLY valid JSON with no preamble or markdown.',
        })
        const synthResponse = await executeWithTimeout(
          client.messages.create({
            model: modelName,
            max_tokens: agent.maxTokens ?? 2048,
            temperature: agent.temperature ?? 0.7,
            system: systemParam,
            messages,
          }),
          getProviderTimeout(JSON.stringify(messages).length / 4),
          'anthropic.messages.create.synthesis'
        )
        finalOutput = synthResponse.content.find((block) => block.type === 'text')?.text ?? ''
        if (finalOutput) {
          totalInputTokens += synthResponse.usage.input_tokens
          totalOutputTokens += synthResponse.usage.output_tokens
          log.info('Post-loop synthesis succeeded', { outputLength: finalOutput.length })
        }
      } catch (error) {
        log.warn('Post-loop synthesis failed', { error: (error as Error).message })
      }

      if (!finalOutput) {
        const lastMessage = messages[messages.length - 2]
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

    // Calculate totals with cache-aware pricing
    const tokensUsed = totalInputTokens + totalOutputTokens
    const estimatedCost = calculateCost(
      modelName,
      totalInputTokens,
      totalOutputTokens,
      totalCacheCreationTokens,
      totalCacheReadTokens
    )

    const cacheStatus = determineCacheStatus(totalCacheCreationTokens, totalCacheReadTokens)
    const cacheMetrics: AnthropicCacheMetrics = {
      cacheCreationInputTokens: totalCacheCreationTokens,
      cacheReadInputTokens: totalCacheReadTokens,
      cacheStatus,
    }

    if (cacheStatus !== 'none') {
      log.info('Prompt cache metrics', {
        cacheStatus,
        cacheCreationTokens: totalCacheCreationTokens,
        cacheReadTokens: totalCacheReadTokens,
        model: modelName,
      })
    }

    return {
      output: finalOutput,
      tokensUsed,
      estimatedCost,
      iterationsUsed: iteration,
      cacheMetrics,
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

  const streamRequestStartMs = Date.now()
  let finalOutput = ''

  try {
    const systemPrompt =
      agent.systemPrompt ?? `You are ${agent.role}. Help the user accomplish their goal.`

    const contextStr = context ? `\n\nContext:\n${JSON.stringify(context, null, 2)}` : ''
    const userPrompt = `Goal: ${goal}${contextStr}`

    // Build system prompt with caching support
    const systemParam = buildSystemPromptWithCaching(systemPrompt)

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

    const streamInputEstimate = Math.round(JSON.stringify(messages).length / 4)
    log.info('Anthropic streaming request starting', {
      model: modelName,
      maxTokens: agent.maxTokens ?? 2048,
      messageCount: messages.length,
      inputTokenEstimate: streamInputEstimate,
      agentName: agent.name,
    })

    const streamResponse = await executeWithRetry(
      async () => {
        if (toolContext?.userId) {
          await checkProviderRateLimit(toolContext.userId, 'anthropic')
        }

        return client.messages.stream({
          model: modelName,
          max_tokens: agent.maxTokens ?? 2048,
          temperature: agent.temperature ?? 0.7,
          system: systemParam,
          messages,
        })
      },
      PROVIDER_RETRY_CONFIG,
      (attempt, error, delayMs) => {
        const elapsedMs = Date.now() - streamRequestStartMs
        log.info('Retrying streaming request', {
          attempt,
          maxRetries: PROVIDER_RETRY_CONFIG.maxRetries,
          delayMs,
          totalElapsedMs: elapsedMs,
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
    const streamDurationMs = Date.now() - streamRequestStartMs
    log.info('Anthropic streaming response complete', {
      model: modelName,
      durationMs: streamDurationMs,
      inputTokens: finalMessage.usage?.input_tokens ?? 0,
      outputTokens: finalMessage.usage?.output_tokens ?? 0,
      outputLength: finalOutput.length,
      stopReason: finalMessage.stop_reason,
    })

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
    const cacheCreationTokens = finalMessage.usage?.cache_creation_input_tokens ?? 0
    const cacheReadTokens = finalMessage.usage?.cache_read_input_tokens ?? 0
    const tokensUsed = inputTokens + outputTokens
    const estimatedCost = calculateCost(
      modelName,
      inputTokens,
      outputTokens,
      cacheCreationTokens,
      cacheReadTokens
    )

    const cacheStatus = determineCacheStatus(cacheCreationTokens, cacheReadTokens)
    const cacheMetrics: AnthropicCacheMetrics = {
      cacheCreationInputTokens: cacheCreationTokens,
      cacheReadInputTokens: cacheReadTokens,
      cacheStatus,
    }

    if (cacheStatus !== 'none') {
      log.info('Streaming prompt cache metrics', {
        cacheStatus,
        cacheCreationTokens,
        cacheReadTokens,
        model: modelName,
      })
    }

    return {
      output: finalOutput,
      tokensUsed,
      estimatedCost,
      iterationsUsed: 1,
      cacheMetrics,
    }
  } catch (error) {
    const streamDurationMs = Date.now() - streamRequestStartMs
    log.error('Streaming execution error', error, {
      model: modelName,
      durationMs: streamDurationMs,
      partialOutputLength: finalOutput.length,
      receivedAnyTokens: finalOutput.length > 0,
      agentName: agent.name,
    })
    const agentError = wrapError(error, 'anthropic')
    agentError.details = {
      ...agentError.details,
      provider: 'anthropic',
      model: modelName,
    }
    throw agentError
  }
}
