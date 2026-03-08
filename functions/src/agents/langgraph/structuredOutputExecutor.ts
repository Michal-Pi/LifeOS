/**
 * Structured Output Executor
 *
 * Uses function/tool calling across all 4 LLM providers to get structured outputs.
 * This enables reliable JSON parsing of LLM responses for dialectical phases.
 *
 * Supported providers: OpenAI, Anthropic, Google (Gemini), xAI (Grok)
 */

import type { AgentConfig } from '@lifeos/agents'
import { MODEL_PRICING } from '@lifeos/agents'
import OpenAI from 'openai'
import Anthropic from '@anthropic-ai/sdk'
import {
  GoogleGenerativeAI,
  FunctionCallingMode,
  SchemaType,
  type FunctionDeclarationSchema,
} from '@google/generative-ai'
import { z } from 'zod'

import type { ProviderKeys } from '../providerService.js'
import { AgentError, ERROR_MESSAGES } from '../errorHandler.js'
import { DEFAULT_MODELS } from '../providerKeys.js'
import {
  ThesisOutputSchema,
  NegationOutputSchema,
  SublationOutputSchema,
  ContradictionOutputSchema,
  MetaReflectionOutputSchema,
  RetrievalPlanSchema,
  DIALECTICAL_TOOLS,
  type ThesisOutputParsed,
  type NegationOutputParsed,
  type SublationOutputParsed,
  type ContradictionOutputParsed,
  type MetaReflectionOutputParsed,
  type RetrievalPlanParsed,
} from './structuredOutputSchemas.js'

// ----- Types -----

export interface StructuredOutputResult<T> {
  data: T
  rawOutput: string
  tokensUsed: number
  estimatedCost: number
  provider: string
  model: string
}

export type DialecticalOutputType =
  | 'thesis'
  | 'negation'
  | 'sublation'
  | 'contradiction'
  | 'metaReflection'
  | 'retrievalPlan'

interface ToolDefinition {
  name: string
  description: string
  parameters: Record<string, unknown>
}

// ----- Schema Mapping -----

const OUTPUT_SCHEMAS: Record<DialecticalOutputType, z.ZodObject<z.ZodRawShape>> = {
  thesis: ThesisOutputSchema,
  negation: NegationOutputSchema,
  sublation: SublationOutputSchema,
  contradiction: ContradictionOutputSchema,
  metaReflection: MetaReflectionOutputSchema,
  retrievalPlan: RetrievalPlanSchema,
}

const OUTPUT_TOOLS: Record<DialecticalOutputType, ToolDefinition> = {
  thesis: DIALECTICAL_TOOLS.generateThesis,
  negation: DIALECTICAL_TOOLS.generateNegation,
  sublation: DIALECTICAL_TOOLS.generateSynthesis,
  contradiction: DIALECTICAL_TOOLS.detectContradiction,
  metaReflection: DIALECTICAL_TOOLS.metaReflect,
  retrievalPlan: DIALECTICAL_TOOLS.planRetrieval,
}

// ----- Main Executor -----

/**
 * Execute an agent with structured output using function calling
 *
 * This forces the LLM to respond with a specific schema by using tool_choice
 * to require calling a function with the expected output structure.
 */
export async function executeWithStructuredOutput<T>(
  agent: AgentConfig,
  goal: string,
  context: Record<string, unknown> | undefined,
  apiKeys: ProviderKeys,
  outputType: DialecticalOutputType
): Promise<StructuredOutputResult<T>> {
  const provider = agent.modelProvider
  const tool = OUTPUT_TOOLS[outputType]
  const schema = OUTPUT_SCHEMAS[outputType]

  switch (provider) {
    case 'openai':
      return executeOpenAIStructured<T>(agent, goal, context, apiKeys.openai!, tool, schema)

    case 'anthropic':
      return executeAnthropicStructured<T>(agent, goal, context, apiKeys.anthropic!, tool, schema)

    case 'google':
      return executeGoogleStructured<T>(agent, goal, context, apiKeys.google!, tool, schema)

    case 'xai':
      return executeGrokStructured<T>(agent, goal, context, apiKeys.grok!, tool, schema)

    default:
      throw new Error(`Unsupported provider for structured output: ${provider}`)
  }
}

// ----- OpenAI Structured Output -----

async function executeOpenAIStructured<T>(
  agent: AgentConfig,
  goal: string,
  context: Record<string, unknown> | undefined,
  apiKey: string,
  tool: ToolDefinition,
  schema: z.ZodObject<z.ZodRawShape>
): Promise<StructuredOutputResult<T>> {
  if (!apiKey) {
    const errorMsg = ERROR_MESSAGES.PROVIDER_NOT_CONFIGURED('OpenAI')
    throw new AgentError(errorMsg.message, errorMsg.userMessage, 'auth', false, {
      provider: 'openai',
    })
  }

  const client = new OpenAI({ apiKey })
  const modelName = agent.modelName ?? DEFAULT_MODELS.openai

  const systemPrompt =
    agent.systemPrompt ?? `You are ${agent.role}. Help the user accomplish their goal.`
  const contextStr = context ? `\n\nContext:\n${JSON.stringify(context, null, 2)}` : ''
  const userPrompt = `Goal: ${goal}${contextStr}`

  // Define the tool for structured output
  const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
    {
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    },
  ]

  const response = await client.chat.completions.create({
    model: modelName,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: agent.temperature ?? 0.7,
    max_tokens: agent.maxTokens ?? 2048,
    tools,
    // Force the model to use the specific function
    tool_choice: { type: 'function' as const, function: { name: tool.name } },
  })

  const message = response.choices[0]?.message
  const toolCall = message?.tool_calls?.[0]

  if (!toolCall || toolCall.type !== 'function') {
    throw new Error(`Expected function tool call to ${tool.name}, got: ${JSON.stringify(message)}`)
  }

  const functionCall = toolCall as {
    type: 'function'
    function: { name: string; arguments: string }
    id: string
  }
  if (functionCall.function.name !== tool.name) {
    throw new Error(`Expected tool call to ${tool.name}, got: ${functionCall.function.name}`)
  }

  const rawOutput = functionCall.function.arguments
  const parsed = JSON.parse(rawOutput)

  // Validate against schema
  const validated = schema.parse(parsed) as T

  const inputTokens = response.usage?.prompt_tokens ?? 0
  const outputTokens = response.usage?.completion_tokens ?? 0
  const pricing = MODEL_PRICING[modelName] ?? MODEL_PRICING.default
  const estimatedCost =
    (inputTokens / 1_000_000) * pricing.input + (outputTokens / 1_000_000) * pricing.output

  return {
    data: validated,
    rawOutput,
    tokensUsed: inputTokens + outputTokens,
    estimatedCost,
    provider: 'openai',
    model: modelName,
  }
}

// ----- Anthropic Structured Output -----

async function executeAnthropicStructured<T>(
  agent: AgentConfig,
  goal: string,
  context: Record<string, unknown> | undefined,
  apiKey: string,
  tool: ToolDefinition,
  schema: z.ZodObject<z.ZodRawShape>
): Promise<StructuredOutputResult<T>> {
  if (!apiKey) {
    const errorMsg = ERROR_MESSAGES.PROVIDER_NOT_CONFIGURED('Anthropic')
    throw new AgentError(errorMsg.message, errorMsg.userMessage, 'auth', false, {
      provider: 'anthropic',
    })
  }

  const client = new Anthropic({ apiKey })
  const modelName = agent.modelName ?? DEFAULT_MODELS.anthropic

  const systemPrompt =
    agent.systemPrompt ?? `You are ${agent.role}. Help the user accomplish their goal.`
  const contextStr = context ? `\n\nContext:\n${JSON.stringify(context, null, 2)}` : ''
  const userPrompt = `Goal: ${goal}${contextStr}`

  // Define tool for structured output
  const tools: Anthropic.Tool[] = [
    {
      name: tool.name,
      description: tool.description,
      input_schema: tool.parameters as Anthropic.Tool['input_schema'],
    },
  ]

  const response = await client.messages.create({
    model: modelName,
    max_tokens: agent.maxTokens ?? 2048,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
    tools,
    // Force the model to use the specific tool
    tool_choice: { type: 'tool' as const, name: tool.name },
  })

  // Find the tool use block
  const toolUseBlock = response.content.find(
    (block) => block.type === 'tool_use' && block.name === tool.name
  )

  if (!toolUseBlock || toolUseBlock.type !== 'tool_use') {
    throw new Error(
      `Expected tool_use block for ${tool.name}, got: ${JSON.stringify(response.content)}`
    )
  }

  const parsed = toolUseBlock.input
  const rawOutput = JSON.stringify(parsed)

  // Validate against schema
  const validated = schema.parse(parsed) as T

  const inputTokens = response.usage?.input_tokens ?? 0
  const outputTokens = response.usage?.output_tokens ?? 0
  const pricing = MODEL_PRICING[modelName] ?? MODEL_PRICING.default
  const estimatedCost =
    (inputTokens / 1_000_000) * pricing.input + (outputTokens / 1_000_000) * pricing.output

  return {
    data: validated,
    rawOutput,
    tokensUsed: inputTokens + outputTokens,
    estimatedCost,
    provider: 'anthropic',
    model: modelName,
  }
}

// ----- Google Schema Conversion -----

/**
 * Convert JSON Schema to Google's FunctionDeclarationSchema format
 */
function convertToGoogleSchema(params: Record<string, unknown>): FunctionDeclarationSchema {
  const properties = (params.properties ?? {}) as Record<string, unknown>
  const required = (params.required ?? []) as string[]

  const googleProperties: Record<
    string,
    { type: SchemaType; description?: string; enum?: string[] }
  > = {}

  for (const [key, value] of Object.entries(properties)) {
    const prop = value as { type?: string; description?: string; enum?: string[] }
    let schemaType = SchemaType.STRING

    switch (prop.type) {
      case 'string':
        schemaType = SchemaType.STRING
        break
      case 'number':
        schemaType = SchemaType.NUMBER
        break
      case 'integer':
        schemaType = SchemaType.INTEGER
        break
      case 'boolean':
        schemaType = SchemaType.BOOLEAN
        break
      case 'array':
        schemaType = SchemaType.ARRAY
        break
      case 'object':
        schemaType = SchemaType.OBJECT
        break
    }

    googleProperties[key] = {
      type: schemaType,
      description: prop.description,
      enum: prop.enum,
    }
  }

  return {
    type: SchemaType.OBJECT,
    properties: googleProperties as FunctionDeclarationSchema['properties'],
    required,
  }
}

// ----- Google (Gemini) Structured Output -----

async function executeGoogleStructured<T>(
  agent: AgentConfig,
  goal: string,
  context: Record<string, unknown> | undefined,
  apiKey: string,
  tool: ToolDefinition,
  schema: z.ZodObject<z.ZodRawShape>
): Promise<StructuredOutputResult<T>> {
  if (!apiKey) {
    const errorMsg = ERROR_MESSAGES.PROVIDER_NOT_CONFIGURED('Google')
    throw new AgentError(errorMsg.message, errorMsg.userMessage, 'auth', false, {
      provider: 'google',
    })
  }

  const genAI = new GoogleGenerativeAI(apiKey)
  const modelName = agent.modelName ?? DEFAULT_MODELS.google

  // Convert our tool parameters to Google's expected format
  const googleParams = convertToGoogleSchema(tool.parameters)

  const model = genAI.getGenerativeModel({
    model: modelName,
    systemInstruction:
      agent.systemPrompt ?? `You are ${agent.role}. Help the user accomplish their goal.`,
    tools: [
      {
        functionDeclarations: [
          {
            name: tool.name,
            description: tool.description,
            parameters: googleParams,
          },
        ],
      },
    ],
  })

  const contextStr = context ? `\n\nContext:\n${JSON.stringify(context, null, 2)}` : ''
  const userPrompt = `Goal: ${goal}${contextStr}`

  // Use function calling mode to force structured output
  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
    generationConfig: {
      temperature: agent.temperature ?? 0.7,
      maxOutputTokens: agent.maxTokens ?? 2048,
    },
    toolConfig: {
      functionCallingConfig: {
        mode: FunctionCallingMode.ANY,
        allowedFunctionNames: [tool.name],
      },
    },
  })

  const response = result.response
  const functionCall = response.functionCalls()?.[0]

  if (!functionCall || functionCall.name !== tool.name) {
    throw new Error(
      `Expected function call to ${tool.name}, got: ${JSON.stringify(response.text())}`
    )
  }

  const parsed = functionCall.args
  const rawOutput = JSON.stringify(parsed)

  // Validate against schema
  const validated = schema.parse(parsed) as T

  // Gemini doesn't provide detailed token usage in the same way
  const usageMetadata = response.usageMetadata
  const inputTokens = usageMetadata?.promptTokenCount ?? 0
  const outputTokens = usageMetadata?.candidatesTokenCount ?? 0
  const pricing = MODEL_PRICING[modelName] ?? MODEL_PRICING.default
  const estimatedCost =
    (inputTokens / 1_000_000) * pricing.input + (outputTokens / 1_000_000) * pricing.output

  return {
    data: validated,
    rawOutput,
    tokensUsed: inputTokens + outputTokens,
    estimatedCost,
    provider: 'google',
    model: modelName,
  }
}

// ----- Grok (xAI) Structured Output -----

async function executeGrokStructured<T>(
  agent: AgentConfig,
  goal: string,
  context: Record<string, unknown> | undefined,
  apiKey: string,
  tool: ToolDefinition,
  schema: z.ZodObject<z.ZodRawShape>
): Promise<StructuredOutputResult<T>> {
  if (!apiKey) {
    const errorMsg = ERROR_MESSAGES.PROVIDER_NOT_CONFIGURED('xAI (Grok)')
    throw new AgentError(errorMsg.message, errorMsg.userMessage, 'auth', false, {
      provider: 'xai',
    })
  }

  // Grok uses OpenAI-compatible API
  const client = new OpenAI({
    apiKey,
    baseURL: 'https://api.x.ai/v1',
  })
  const modelName = agent.modelName ?? DEFAULT_MODELS.grok

  const systemPrompt =
    agent.systemPrompt ?? `You are ${agent.role}. Help the user accomplish their goal.`
  const contextStr = context ? `\n\nContext:\n${JSON.stringify(context, null, 2)}` : ''
  const userPrompt = `Goal: ${goal}${contextStr}`

  // Define the tool for structured output
  const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
    {
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    },
  ]

  const response = await client.chat.completions.create({
    model: modelName,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: agent.temperature ?? 0.7,
    max_tokens: agent.maxTokens ?? 2048,
    tools,
    // Force the model to use the specific function
    tool_choice: { type: 'function' as const, function: { name: tool.name } },
  })

  const message = response.choices[0]?.message
  const toolCall = message?.tool_calls?.[0]

  if (!toolCall || toolCall.type !== 'function') {
    throw new Error(`Expected function tool call to ${tool.name}, got: ${JSON.stringify(message)}`)
  }

  const functionCall = toolCall as {
    type: 'function'
    function: { name: string; arguments: string }
    id: string
  }
  if (functionCall.function.name !== tool.name) {
    throw new Error(`Expected tool call to ${tool.name}, got: ${functionCall.function.name}`)
  }

  const rawOutput = functionCall.function.arguments
  const parsed = JSON.parse(rawOutput)

  // Validate against schema
  const validated = schema.parse(parsed) as T

  const inputTokens = response.usage?.prompt_tokens ?? 0
  const outputTokens = response.usage?.completion_tokens ?? 0
  const pricing = MODEL_PRICING[modelName] ?? MODEL_PRICING.default
  const estimatedCost =
    (inputTokens / 1_000_000) * pricing.input + (outputTokens / 1_000_000) * pricing.output

  return {
    data: validated,
    rawOutput,
    tokensUsed: inputTokens + outputTokens,
    estimatedCost,
    provider: 'xai',
    model: modelName,
  }
}

// ----- Convenience Type-Safe Wrappers -----

/**
 * Execute thesis generation with structured output
 */
export async function executeThesisGeneration(
  agent: AgentConfig,
  goal: string,
  context: Record<string, unknown> | undefined,
  apiKeys: ProviderKeys
): Promise<StructuredOutputResult<ThesisOutputParsed>> {
  return executeWithStructuredOutput<ThesisOutputParsed>(agent, goal, context, apiKeys, 'thesis')
}

/**
 * Execute negation with structured output
 */
export async function executeNegation(
  agent: AgentConfig,
  goal: string,
  context: Record<string, unknown> | undefined,
  apiKeys: ProviderKeys
): Promise<StructuredOutputResult<NegationOutputParsed>> {
  return executeWithStructuredOutput<NegationOutputParsed>(
    agent,
    goal,
    context,
    apiKeys,
    'negation'
  )
}

/**
 * Execute sublation/synthesis with structured output
 */
export async function executeSublation(
  agent: AgentConfig,
  goal: string,
  context: Record<string, unknown> | undefined,
  apiKeys: ProviderKeys
): Promise<StructuredOutputResult<SublationOutputParsed>> {
  return executeWithStructuredOutput<SublationOutputParsed>(
    agent,
    goal,
    context,
    apiKeys,
    'sublation'
  )
}

/**
 * Execute contradiction detection with structured output
 */
export async function executeContradictionDetection(
  agent: AgentConfig,
  goal: string,
  context: Record<string, unknown> | undefined,
  apiKeys: ProviderKeys
): Promise<StructuredOutputResult<ContradictionOutputParsed>> {
  return executeWithStructuredOutput<ContradictionOutputParsed>(
    agent,
    goal,
    context,
    apiKeys,
    'contradiction'
  )
}

/**
 * Execute meta-reflection with structured output
 */
export async function executeMetaReflection(
  agent: AgentConfig,
  goal: string,
  context: Record<string, unknown> | undefined,
  apiKeys: ProviderKeys
): Promise<StructuredOutputResult<MetaReflectionOutputParsed>> {
  return executeWithStructuredOutput<MetaReflectionOutputParsed>(
    agent,
    goal,
    context,
    apiKeys,
    'metaReflection'
  )
}

/**
 * Execute retrieval planning with structured output
 */
export async function executeRetrievalPlan(
  agent: AgentConfig,
  goal: string,
  context: Record<string, unknown> | undefined,
  apiKeys: ProviderKeys
): Promise<StructuredOutputResult<RetrievalPlanParsed>> {
  return executeWithStructuredOutput<RetrievalPlanParsed>(
    agent,
    goal,
    context,
    apiKeys,
    'retrievalPlan'
  )
}
