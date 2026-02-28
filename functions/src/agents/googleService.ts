/**
 * Google Gemini Service
 *
 * Wrapper for Google Generative AI (Gemini) API calls with token counting and cost estimation.
 * Supports tool calling with iterative execution.
 * Follows the same pattern as OpenAI/Anthropic services for consistency.
 */

import type { Tool, Schema } from '@google/generative-ai'
import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai'
import type { AgentConfig } from '@lifeos/agents'
import { asId, MODEL_PRICING } from '@lifeos/agents'

import { createLogger } from '../lib/logger.js'
import { executeWithTimeout, TIMEOUTS, wrapError } from './errorHandler.js'
import { recordMessage } from './messageStore.js'
import { checkProviderRateLimit } from './rateLimiter.js'
import { executeWithRetry, PROVIDER_RETRY_CONFIG } from './retryHelper.js'
import type { BaseToolExecutionContext } from './toolExecutor.js'
import { executeTools, getAgentToolsFromRegistry, getBuiltinToolRegistry } from './toolExecutor.js'

const log = createLogger('GoogleService')

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
 * Convert a simple property type to a Google Schema
 */
function propertyToSchema(prop: { type: string; description: string }): Schema {
  const type = prop.type.toUpperCase() as keyof typeof SchemaType
  const schemaType = SchemaType[type]

  // Create the appropriate schema based on type
  switch (schemaType) {
    case SchemaType.STRING:
      return { type: SchemaType.STRING, description: prop.description }
    case SchemaType.NUMBER:
      return { type: SchemaType.NUMBER, description: prop.description }
    case SchemaType.INTEGER:
      return { type: SchemaType.INTEGER, description: prop.description }
    case SchemaType.BOOLEAN:
      return { type: SchemaType.BOOLEAN, description: prop.description }
    case SchemaType.ARRAY:
      // For arrays, we need an items property - default to string
      return {
        type: SchemaType.ARRAY,
        description: prop.description,
        items: { type: SchemaType.STRING },
      }
    case SchemaType.OBJECT:
      // For objects, we need a properties property - default to empty
      return {
        type: SchemaType.OBJECT,
        description: prop.description,
        properties: {},
      }
    default:
      // Fallback to string
      return { type: SchemaType.STRING, description: prop.description }
  }
}

/**
 * Convert tool definitions to Google format
 */
function convertToolsToGoogleFormat(
  tools: Array<{
    type: 'function'
    function: {
      name: string
      description: string
      parameters: {
        type: string
        properties: Record<string, { type: string; description: string }>
        required?: string[]
      }
    }
  }>
): Tool[] {
  return [
    {
      functionDeclarations: tools.map((tool) => ({
        name: tool.function.name,
        description: tool.function.description,
        parameters: {
          type: SchemaType.OBJECT,
          properties: Object.fromEntries(
            Object.entries(tool.function.parameters.properties).map(([key, prop]) => [
              key,
              propertyToSchema(prop),
            ])
          ),
          required: tool.function.parameters.required ?? [],
        },
      })),
    },
  ]
}

/**
 * Execute a single-agent task using Google Gemini
 *
 * @param client Google AI client instance
 * @param agent Agent configuration
 * @param goal User's goal/task description
 * @param context Optional context object
 * @param toolContext Optional tool execution context (enables tool calling)
 * @returns Execution result with output, tokens, and cost
 */
export async function executeWithGoogle(
  client: GoogleGenerativeAI,
  agent: AgentConfig,
  goal: string,
  context?: Record<string, unknown>,
  toolContext?: BaseToolExecutionContext
): Promise<GoogleExecutionResult> {
  const modelName = agent.modelName ?? 'gemini-3-flash'

  try {
    // Build the prompt
    const systemPrompt =
      agent.systemPrompt ?? `You are ${agent.role}. Help the user accomplish their goal.`

    const contextStr = context ? `\n\nContext:\n${JSON.stringify(context, null, 2)}` : ''

    const userPrompt = `${systemPrompt}\n\nGoal: ${goal}${contextStr}`

    // Get available tools for this agent
    const toolsOpenAIFormat = toolContext
      ? getAgentToolsFromRegistry(agent, toolContext.toolRegistry ?? getBuiltinToolRegistry())
      : []
    const tools =
      toolsOpenAIFormat.length > 0 ? convertToolsToGoogleFormat(toolsOpenAIFormat) : undefined

    // Get the model
    const model = client.getGenerativeModel({
      model: modelName,
      generationConfig: {
        temperature: agent.temperature ?? 0.7,
        maxOutputTokens: agent.maxTokens ?? 2048,
      },
      tools,
    })

    // Start chat for iterative tool calling
    const chat = model.startChat()

    // Track total tokens (estimated)
    let totalInputChars = 0
    let totalOutputChars = 0

    // Iterative execution loop (configurable, default 5)
    const MAX_ITERATIONS = toolContext?.maxIterations ?? 5
    let iteration = 0
    let finalOutput = ''
    let nextMessage = ''

    // Send initial message
    totalInputChars += userPrompt.length
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

    while (iteration < MAX_ITERATIONS) {
      iteration++
      log.info('Iteration started', { iteration, maxIterations: MAX_ITERATIONS })

      // Send message (first iteration uses userPrompt, subsequent use nextMessage or empty)
      const messageToSend = iteration === 1 ? userPrompt : nextMessage || ''
      nextMessage = '' // Reset for next iteration
      const result = await executeWithRetry(
        async () => {
          if (toolContext?.userId) {
            await checkProviderRateLimit(toolContext.userId, 'google')
          }

          return executeWithTimeout(
            chat.sendMessage(messageToSend),
            TIMEOUTS.PROVIDER,
            'google.chat.sendMessage'
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
      const response = result.response

      totalOutputChars += response.text().length

      // Check if there are function calls
      const functionCalls = response.functionCalls()

      if (functionCalls && functionCalls.length > 0 && toolContext) {
        log.info('Agent requesting tool calls', { toolCallCount: functionCalls.length })

        // Execute all tool calls in parallel
        const toolCalls = functionCalls.map((fc) => ({
          toolCallId: fc.name, // Google doesn't provide IDs, use name
          toolName: fc.name,
          parameters: fc.args as Record<string, unknown>,
        }))

        const toolResults = await executeTools(toolCalls, {
          ...toolContext,
          provider: 'google',
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
          content: response.text(),
          toolCalls: toolCallRecords,
        })

        // Send tool results back to model
        const functionResponses = toolResults.map((toolResult) => ({
          name: toolResult.toolName,
          response: toolResult.error
            ? { error: toolResult.error }
            : (toolResult.result as Record<string, unknown>),
        }))

        const functionResponseMessage = {
          functionResponse: {
            name: functionResponses[0].name,
            response: functionResponses[0].response,
          },
        }

        totalInputChars += JSON.stringify(functionResponseMessage).length
        log.info('Tools executed, continuing iteration', { toolCount: toolResults.length })

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

        // Budget warning: on penultimate iteration, tell agent to synthesize
        if (iteration === MAX_ITERATIONS - 1) {
          log.info('Budget warning, injecting synthesis prompt', {
            iteration,
            maxIterations: MAX_ITERATIONS,
          })
          nextMessage =
            'IMPORTANT: You are at your tool-calling budget limit. ' +
            'You MUST synthesize your findings into a complete response NOW. ' +
            'Do NOT make additional tool calls. Provide your best output with what you have gathered.'
        }

        // Continue loop to get agent's response with tool results
        // Next iteration will send nextMessage or empty to continue conversation
      } else {
        // No tool calls, agent provided final output
        finalOutput = response.text()
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
      finalOutput =
        `[PARTIAL RESULT - iteration budget exhausted after ${iteration} tool calls]\n\n` +
        `The agent gathered research data but could not complete synthesis. ` +
        `Consider increasing the iteration budget for tool-heavy agents.`
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

    // Estimate tokens (1 token ≈ 4 chars)
    const inputTokens = Math.ceil(totalInputChars / 4)
    const outputTokens = Math.ceil(totalOutputChars / 4)
    const tokensUsed = inputTokens + outputTokens

    // Calculate cost
    const estimatedCost = calculateCost(modelName, inputTokens, outputTokens)

    return {
      output: finalOutput,
      tokensUsed,
      estimatedCost,
      iterationsUsed: iteration,
    }
  } catch (error) {
    log.error('Execution error', error)
    const agentError = wrapError(error, 'google')
    agentError.details = {
      ...agentError.details,
      provider: 'google',
      model: modelName,
    }
    throw agentError
  }
}
