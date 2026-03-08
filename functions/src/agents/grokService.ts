/**
 * Grok (xAI) Service
 *
 * Wrapper for xAI's Grok API calls with token counting and cost estimation.
 * Supports tool calling with iterative execution.
 * Grok uses an OpenAI-compatible API, so we use the OpenAI SDK with a custom base URL.
 */

import type { AgentConfig } from '@lifeos/agents'
import { asId, MODEL_PRICING } from '@lifeos/agents'
import OpenAI from 'openai'

import { createLogger } from '../lib/logger.js'
import { executeWithTimeout, TIMEOUTS, wrapError } from './errorHandler.js'
import { recordMessage } from './messageStore.js'
import { checkProviderRateLimit } from './rateLimiter.js'
import { executeWithRetry, PROVIDER_RETRY_CONFIG } from './retryHelper.js'
import type { BaseToolExecutionContext } from './toolExecutor.js'
import { executeTools, getAgentToolsFromRegistry, getBuiltinToolRegistry } from './toolExecutor.js'

const log = createLogger('GrokService')

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
 * Execute a single-agent task using Grok
 *
 * @param client Grok client instance (OpenAI SDK configured for xAI)
 * @param agent Agent configuration
 * @param goal User's goal/task description
 * @param context Optional context object
 * @param toolContext Optional tool execution context (enables tool calling)
 * @returns Execution result with output, tokens, and cost
 */
export async function executeWithGrok(
  client: OpenAI,
  agent: AgentConfig,
  goal: string,
  context?: Record<string, unknown>,
  toolContext?: BaseToolExecutionContext
): Promise<GrokExecutionResult> {
  const modelName = agent.modelName ?? 'grok-3-mini'

  try {
    // Build the prompt
    const systemPrompt =
      agent.systemPrompt ?? `You are ${agent.role}. Help the user accomplish their goal.`

    const contextStr = context ? `\n\nContext:\n${JSON.stringify(context, null, 2)}` : ''

    const userPrompt = `Goal: ${goal}${contextStr}`

    // Initialize message history
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
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

    // Get available tools for this agent
    const tools = toolContext
      ? getAgentToolsFromRegistry(agent, toolContext.toolRegistry ?? getBuiltinToolRegistry())
      : []

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

      // Call Grok API (OpenAI-compatible)
      const response = await executeWithRetry(
        async () => {
          if (toolContext?.userId) {
            await checkProviderRateLimit(toolContext.userId, 'xai')
          }

          return executeWithTimeout(
            client.chat.completions.create({
              model: modelName,
              messages,
              temperature: agent.temperature ?? 0.7,
              max_tokens: agent.maxTokens ?? 2048,
              tools: tools.length > 0 ? tools : undefined,
              tool_choice: tools.length > 0 ? 'auto' : undefined,
            }),
            TIMEOUTS.PROVIDER,
            'xai.chat.completions.create'
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
      totalInputTokens += response.usage?.prompt_tokens ?? 0
      totalOutputTokens += response.usage?.completion_tokens ?? 0

      const message = response.choices[0]?.message

      if (!message) {
        throw new Error('No message in Grok response')
      }

      // Add assistant's message to history
      messages.push(message)

      // Check if agent wants to call tools
      if (message.tool_calls && message.tool_calls.length > 0 && toolContext) {
        log.info('Agent requesting tool calls', { toolCallCount: message.tool_calls.length })

        // Execute all tool calls in parallel (same as OpenAI format)
        const toolCalls = message.tool_calls
          .filter((tc) => tc.type === 'function')
          .map((tc) => ({
            toolCallId: tc.id,
            toolName: tc.type === 'function' ? tc.function.name : '',
            parameters: tc.type === 'function' ? JSON.parse(tc.function.arguments) : {},
          }))

        const toolResults = await executeTools(toolCalls, {
          ...toolContext,
          provider: 'xai',
          modelName,
          iteration,
        })

        const toolCallRecords = toolCalls.map((call) => ({
          toolCallId: call.toolCallId,
          toolId: asId<'tool'>(`tool:${call.toolName}`),
          toolName: call.toolName,
          parameters: call.parameters,
        }))

        await recordMessage({
          userId: toolContext.userId,
          runId: toolContext.runId,
          agentId: toolContext.agentId,
          role: 'assistant',
          content: message.content ?? '',
          toolCalls: toolCallRecords,
        })

        // Add tool results to message history
        for (const toolResult of toolResults) {
          messages.push({
            role: 'tool',
            tool_call_id: toolResult.toolCallId,
            content: toolResult.error
              ? `Error: ${toolResult.error}`
              : JSON.stringify(toolResult.result),
          })

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
        // No tool calls, agent provided final output
        finalOutput = message.content ?? ''
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
    const hadToolCalls = iteration > 1 || messages.some((m) => m.role === 'tool')
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
          client.chat.completions.create({
            model: modelName,
            messages,
            temperature: agent.temperature ?? 0.7,
            max_tokens: agent.maxTokens ?? 2048,
          }),
          TIMEOUTS.PROVIDER,
          'xai.chat.completions.create.synthesis'
        )
        finalOutput = synthResponse.choices[0]?.message?.content ?? ''
        if (finalOutput) {
          totalInputTokens += synthResponse.usage?.prompt_tokens ?? 0
          totalOutputTokens += synthResponse.usage?.completion_tokens ?? 0
          log.info('Post-loop synthesis succeeded', { outputLength: finalOutput.length })
        }
      } catch (error) {
        log.warn('Post-loop synthesis failed', { error: (error as Error).message })
      }

      if (!finalOutput) {
        const lastContent = messages[messages.length - 2]?.content?.toString() ?? ''
        if (!lastContent || lastContent.startsWith('{') || lastContent.startsWith('[')) {
          finalOutput =
            `[PARTIAL RESULT - iteration budget exhausted after ${iteration} tool calls]\n\n` +
            `The agent gathered research data but could not complete synthesis. ` +
            `Consider increasing the iteration budget for tool-heavy agents.`
        } else {
          finalOutput = lastContent
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
    const agentError = wrapError(error, 'xai')
    agentError.details = {
      ...agentError.details,
      provider: 'xai',
      model: modelName,
    }
    throw agentError
  }
}
