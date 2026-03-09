/**
 * Google Gemini Service
 *
 * Wrapper for Google Generative AI (Gemini) API calls with token counting and cost estimation.
 * Supports tool calling with iterative execution.
 * Follows the same pattern as OpenAI/Anthropic services for consistency.
 */

import type { Tool, Schema, Part } from '@google/generative-ai'
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
    let nextMessage: string | Part[] = ''
    let pendingBudgetWarning: string | null = null

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
      const messageToSend: string | Part[] = iteration === 1 ? userPrompt : nextMessage || ''
      nextMessage = '' // Reset for next iteration
      const result = await executeWithRetry(
        async () => {
          if (toolContext?.userId) {
            await checkProviderRateLimit(toolContext.userId, 'google')
          }

          const response = await executeWithTimeout(
            chat.sendMessage(messageToSend),
            TIMEOUTS.PROVIDER,
            'google.chat.sendMessage'
          )

          // If a budget warning was deferred from the previous iteration,
          // send it now as a separate text-only message so Gemini sees it
          // before generating its next response.
          if (pendingBudgetWarning) {
            const warning = pendingBudgetWarning
            pendingBudgetWarning = null
            return executeWithTimeout(
              chat.sendMessage(warning),
              TIMEOUTS.PROVIDER,
              'google.chat.sendMessage(budgetWarning)'
            )
          }

          return response
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

      // response.text() can throw when response contains only function call parts
      try {
        totalOutputChars += response.text().length
      } catch {
        // Tool-only response, no text content
      }

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

        let responseText = ''
        try {
          responseText = response.text()
        } catch {
          /* tool-only response */
        }

        await recordMessage({
          userId: toolContext.userId,
          runId: toolContext.runId,
          agentId: toolContext.agentId,
          role: 'assistant',
          content: responseText,
          toolCalls: toolCallRecords,
        })

        // Send ALL tool results back to model (not just the first)
        const functionResponseParts: Part[] = toolResults.map((toolResult) => ({
          functionResponse: {
            name: toolResult.toolName,
            response: toolResult.error
              ? { error: toolResult.error }
              : (toolResult.result as Record<string, unknown>),
          },
        }))

        totalInputChars += JSON.stringify(functionResponseParts).length
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

        // Send function response parts as next message so the model sees all tool results
        nextMessage = functionResponseParts

        // Budget warning: fire with 2 iterations remaining, include JSON schema requirement
        // Stored as a pending warning and sent as a separate message after the
        // function responses, since Gemini rejects mixed FunctionResponse + text parts.
        if (iteration >= MAX_ITERATIONS - 2) {
          log.info('Budget warning, injecting synthesis prompt', {
            iteration,
            maxIterations: MAX_ITERATIONS,
            iterationsRemaining: MAX_ITERATIONS - iteration,
          })
          pendingBudgetWarning =
            'IMPORTANT: You are approaching your tool-calling budget limit (' +
            `${MAX_ITERATIONS - iteration} iteration(s) remaining). ` +
            'You MUST synthesize your findings into a complete response NOW. ' +
            'Do NOT make additional tool calls. ' +
            'Output ONLY a valid JSON object matching the schema from the original prompt. ' +
            'No markdown, no explanation — just the JSON.'
        }

        // Continue loop to get agent's response with tool results
        // Next iteration sends function response parts so the model sees all tool results
      } else {
        // No tool calls, agent provided final output
        try {
          finalOutput = response.text()
        } catch {
          finalOutput = ''
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
        log.info('Agent completed, no more tool calls', { iterationsUsed: iteration })
        break
      }
    }

    // Detect empty output: either budget exhausted or agent returned empty within budget
    const hadToolCalls = iteration > 1
    if (!finalOutput && hadToolCalls) {
      if (iteration >= MAX_ITERATIONS) {
        log.warn('Agent reached max iterations with tool calls, attempting final synthesis', {
          maxIterations: MAX_ITERATIONS,
        })
      } else {
        log.warn(
          'Agent returned empty output after tool calls within budget, attempting synthesis',
          {
            iteration,
            maxIterations: MAX_ITERATIONS,
          }
        )
      }

      // One final attempt: ask the model to synthesize with an explicit JSON requirement
      try {
        const synthResult = await executeWithTimeout(
          chat.sendMessage(
            'You have exhausted your tool-calling budget. ' +
              'Synthesize ALL findings from your research into a final response NOW. ' +
              'Output ONLY a valid JSON object matching the schema from the original prompt. ' +
              'No markdown fences, no explanation — just the JSON object.'
          ),
          TIMEOUTS.PROVIDER,
          'google.chat.sendMessage.synthesis'
        )
        try {
          finalOutput = synthResult.response.text()
        } catch {
          /* empty */
        }
        if (finalOutput) {
          totalOutputChars += finalOutput.length
          log.info('Post-loop synthesis succeeded', { outputLength: finalOutput.length })
        }
      } catch (error) {
        log.warn('Post-loop synthesis failed', { error: (error as Error).message })
      }

      if (!finalOutput) {
        finalOutput =
          `[PARTIAL RESULT - iteration budget exhausted after ${iteration} tool calls]\n\n` +
          `The agent gathered research data but could not complete synthesis. ` +
          `Consider increasing the iteration budget for tool-heavy agents.`
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
