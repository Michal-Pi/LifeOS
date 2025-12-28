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

import type { ToolExecutionContext } from './toolExecutor.js'
import { executeTools, getAgentTools } from './toolExecutor.js'

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
  toolContext?: ToolExecutionContext
): Promise<GoogleExecutionResult> {
  try {
    // Build the prompt
    const systemPrompt =
      agent.systemPrompt ?? `You are ${agent.role}. Help the user accomplish their goal.`

    const contextStr = context ? `\n\nContext:\n${JSON.stringify(context, null, 2)}` : ''

    const userPrompt = `${systemPrompt}\n\nGoal: ${goal}${contextStr}`

    // Determine model name (use agent's modelName or default to Gemini 1.5 Flash)
    const modelName = agent.modelName ?? 'gemini-1.5-flash'

    // Get available tools for this agent
    const toolsOpenAIFormat = toolContext ? getAgentTools(agent) : []
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

    // Iterative execution loop (max 5 iterations)
    const MAX_ITERATIONS = 5
    let iteration = 0
    let finalOutput = ''

    // Send initial message
    totalInputChars += userPrompt.length

    while (iteration < MAX_ITERATIONS) {
      iteration++
      console.log(`Google iteration ${iteration}/${MAX_ITERATIONS}`)

      // Send message (first iteration uses userPrompt, subsequent use empty to continue)
      const result = iteration === 1 ? await chat.sendMessage(userPrompt) : await chat.sendMessage('')
      const response = result.response

      totalOutputChars += response.text().length

      // Check if there are function calls
      const functionCalls = response.functionCalls()

      if (functionCalls && functionCalls.length > 0 && toolContext) {
        console.log(`Agent requesting ${functionCalls.length} tool calls`)

        // Execute all tool calls in parallel
        const toolCalls = functionCalls.map((fc) => ({
          toolCallId: fc.name, // Google doesn't provide IDs, use name
          toolName: fc.name,
          parameters: fc.args as Record<string, unknown>,
        }))

        const toolResults = await executeTools(toolCalls, toolContext)

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
        console.log(`Executed ${toolResults.length} tools, continuing agent iteration`)

        // Continue loop to get agent's response with tool results
        // Next iteration will send empty message to continue conversation
      } else {
        // No tool calls, agent provided final output
        finalOutput = response.text()
        console.log(`Agent completed in ${iteration} iterations (no more tool calls)`)
        break
      }
    }

    if (iteration >= MAX_ITERATIONS) {
      console.warn(`Agent reached max iterations (${MAX_ITERATIONS}) with tool calls`)
      finalOutput = 'Agent reached max iterations without providing final output'
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
    }
  } catch (error) {
    console.error('Google Gemini execution error:', error)
    throw new Error(`Google Gemini API error: ${(error as Error).message}`)
  }
}
