/**
 * Tool Executor
 *
 * Framework for executing server-side tools that agents can invoke.
 * Provides built-in tools and infrastructure for custom tool registration.
 * Phase 5B: Persists tool call records to Firestore for tracking and analytics.
 * Phase 5D: Advanced built-in tools (calendar, notes, web search).
 * Phase 5E: Retry logic, timeout handling, and error management.
 */

import type {
  AgentConfig,
  RunId,
  WorkflowId,
  ToolCallStatus,
  ModelProvider,
  ToolId,
  ExpertCouncilConfig,
  ExecutionMode,
  PromptReference,
} from '@lifeos/agents'
import { asId, executeExpertCouncilUsecase } from '@lifeos/agents'
import { getFirestore } from 'firebase-admin/firestore'
import { createLogger } from '../lib/logger.js'
import { advancedTools } from './advancedTools.js'
import { loadCustomTools } from './customTools.js'
import { ERROR_MESSAGES, executeWithTimeout, getToolTimeout, wrapError } from './errorHandler.js'
import {
  buildExpertCouncilContextHash,
  createExpertCouncilPipeline,
  createExpertCouncilRepository,
} from './expertCouncil.js'
import { resolvePrompt } from './promptResolver.js'
import { loadProviderKeys } from './providerKeys.js'
import { TOOL_RETRY_CONFIG, executeWithRetry } from './retryHelper.js'
import type { RunEventWriter } from './runEvents.js'
import { Parser } from 'expr-eval'

const log = createLogger('ToolExecutor')
const mathParser = new Parser()

/**
 * Tool call request from an agent
 */
export interface ToolCall {
  toolCallId: string
  toolName: string
  parameters: Record<string, unknown>
}

/**
 * Result from tool execution
 */
export interface ToolResult {
  toolCallId: string
  toolName: string
  result: unknown
  error?: string
  executedAtMs: number
}

/**
 * Tool definition
 */
export interface ToolDefinition {
  toolId?: ToolId
  name: string
  description: string
  parameters: {
    type: 'object'
    properties: Record<
      string,
      {
        type: 'string' | 'number' | 'boolean' | 'object' | 'array'
        description: string
        required?: boolean
        properties?: Record<string, unknown>
        items?: {
          type: 'string' | 'number' | 'boolean' | 'object' | 'array'
          description: string
          required?: boolean
          properties?: Record<string, unknown>
          items?: unknown
        }
      }
    >
    required?: string[]
  }
  execute: (params: Record<string, unknown>, context: ToolExecutionContext) => Promise<unknown>
}

export type ToolRegistry = Map<string, ToolDefinition>

/**
 * Custom interrupt thrown by the ask_user tool to pause workflow execution.
 * Propagates up through the call stack to executeAgentWithEvents where it
 * is caught and converted to a waiting_for_input state return.
 */
export class AskUserInterrupt extends Error {
  public readonly question: string
  public readonly agentId: string

  constructor(question: string, agentId: string) {
    super(`AskUserInterrupt: ${question}`)
    this.name = 'AskUserInterrupt'
    this.question = question
    this.agentId = agentId
  }
}

/**
 * Base context for tool execution (provided by workflow executor)
 */
export interface BaseToolExecutionContext {
  userId: string
  agentId: string
  workflowId: string
  runId: string
  eventWriter?: RunEventWriter
  toolRegistry?: ToolRegistry
  searchToolKeys?: { serper?: string; firecrawl?: string; exa?: string; jina?: string }
  maxIterations?: number
  /** Workflow-level context passed through so tools like ask_user can check for user responses */
  workflowContext?: Record<string, unknown>
}

/**
 * Full context for tool execution (augmented by provider services)
 */
export interface ToolExecutionContext extends BaseToolExecutionContext {
  provider: ModelProvider
  modelName: string
  iteration: number
}

/**
 * Registry of available tools
 */
const BUILTIN_TOOL_REGISTRY: ToolRegistry = new Map()

export function getBuiltinToolRegistry(): ToolRegistry {
  return BUILTIN_TOOL_REGISTRY
}

/**
 * Register a tool for agent use
 */
export function registerTool(tool: ToolDefinition): void {
  const toolId = tool.toolId ?? (`tool:${tool.name}` as ToolId)
  BUILTIN_TOOL_REGISTRY.set(tool.name, { ...tool, toolId })
  log.info('Registered tool', { toolName: tool.name })
}

/**
 * Get all registered tools as OpenAI-compatible function definitions
 */
export function getToolDefinitions(registry: ToolRegistry = BUILTIN_TOOL_REGISTRY): Array<{
  type: 'function'
  function: {
    name: string
    description: string
    parameters: ToolDefinition['parameters']
  }
}> {
  return Array.from(registry.values()).map((tool) => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }))
}

/**
 * Get tools that an agent is allowed to use
 */
export function getAgentTools(agent: AgentConfig): Array<{
  type: 'function'
  function: {
    name: string
    description: string
    parameters: ToolDefinition['parameters']
  }
}> {
  // If agent has no toolIds specified, return empty array (no tools allowed)
  if (!agent.toolIds || agent.toolIds.length === 0) {
    return []
  }

  return getAgentToolsFromRegistry(agent, BUILTIN_TOOL_REGISTRY)
}

export function getAgentToolsFromRegistry(
  agent: AgentConfig,
  registry: ToolRegistry
): Array<{
  type: 'function'
  function: {
    name: string
    description: string
    parameters: ToolDefinition['parameters']
  }
}> {
  if (!agent.toolIds || agent.toolIds.length === 0) {
    return []
  }

  const toolIds = new Set(agent.toolIds)
  return Array.from(registry.values())
    .filter((tool) => tool.toolId && toolIds.has(tool.toolId))
    .map((tool) => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }))
}

/**
 * Execute a tool call and persist the record to Firestore
 * Phase 5E: Added retry logic, timeout handling, and better error messages
 */
export async function executeTool(
  toolCall: ToolCall,
  context: ToolExecutionContext
): Promise<ToolResult> {
  const startTime = Date.now()
  const db = getFirestore()

  // Create document reference with auto-generated ID
  const toolCallDocRef = db
    .collection('users')
    .doc(context.userId)
    .collection('runs')
    .doc(context.runId)
    .collection('toolCalls')
    .doc() // Auto-generate ID

  const toolCallRecordId = asId<'toolCallRecord'>(toolCallDocRef.id)

  // Track retry attempts
  let retryAttempt = 0

  const eventMeta = {
    workflowId: context.workflowId,
    agentId: context.agentId,
    provider: context.provider,
    model: context.modelName,
    toolName: toolCall.toolName,
    toolCallId: toolCall.toolCallId,
  }

  const registry = context.toolRegistry ?? BUILTIN_TOOL_REGISTRY
  const tool = registry.get(toolCall.toolName)

  // Create initial tool call record (pending)
  const toolCallRecord = {
    toolCallRecordId,
    runId: context.runId,
    workflowId: context.workflowId,
    userId: context.userId,
    agentId: context.agentId,

    toolCallId: toolCall.toolCallId,
    toolName: toolCall.toolName,
    toolId: tool?.toolId ?? asId<'tool'>(`tool:${toolCall.toolName}`),

    parameters: toolCall.parameters,

    status: 'pending' as ToolCallStatus,

    startedAtMs: startTime,

    provider: context.provider,
    modelName: context.modelName,
    iteration: context.iteration,

    retryAttempt: 0, // Phase 5E: Track retry attempts

    syncState: 'synced' as const,
    version: 1,
  }

  try {
    // Save pending record
    await toolCallDocRef.set(toolCallRecord)
    if (context.eventWriter) {
      await context.eventWriter.writeEvent({
        type: 'tool_call',
        ...eventMeta,
      })
    }

    if (!tool) {
      // Tool not found - use error message template
      const errorMsg = ERROR_MESSAGES.TOOL_NOT_FOUND(toolCall.toolName)

      await toolCallDocRef.update({
        status: 'failed',
        error: errorMsg.userMessage,
        errorCategory: 'validation',
        completedAtMs: Date.now(),
        durationMs: Date.now() - startTime,
        version: 2,
      })

      const result = {
        toolCallId: toolCall.toolCallId,
        toolName: toolCall.toolName,
        result: null,
        error: errorMsg.userMessage,
        executedAtMs: Date.now(),
      }
      if (context.eventWriter) {
        await context.eventWriter.writeEvent({
          type: 'tool_result',
          ...eventMeta,
          toolResult: { error: errorMsg.userMessage },
        })
      }
      return result
    }

    log.info('Executing tool', { toolName: toolCall.toolName, params: toolCall.parameters })

    // Update to running
    await toolCallDocRef.update({
      status: 'running',
      version: 2,
    })

    // Get timeout for this specific tool
    const timeoutMs = getToolTimeout(toolCall.toolName)

    // Execute with retry logic and timeout
    const result = await executeWithRetry(
      async () => {
        // Execute tool with timeout
        return await executeWithTimeout(
          tool.execute(toolCall.parameters, context),
          timeoutMs,
          `tool:${toolCall.toolName}`
        )
      },
      TOOL_RETRY_CONFIG,
      async (attempt, error, delayMs) => {
        retryAttempt = attempt
        log.info('Retrying tool', {
          toolName: toolCall.toolName,
          attempt,
          maxRetries: TOOL_RETRY_CONFIG.maxRetries,
          delayMs,
          error: (error as Error).message,
        })

        // Update retry attempt in Firestore so it's persisted before the next attempt
        await toolCallDocRef.update({
          retryAttempt: attempt,
        })
      }
    )

    const completedAtMs = Date.now()
    const durationMs = completedAtMs - startTime

    log.info('Tool completed', {
      toolName: toolCall.toolName,
      durationMs,
      retryAttempt,
    })

    // Update record with success
    await toolCallDocRef.update({
      status: 'completed',
      result,
      completedAtMs,
      durationMs,
      retryAttempt,
      version: 3,
    })

    const resultPayload = {
      toolCallId: toolCall.toolCallId,
      toolName: toolCall.toolName,
      result,
      executedAtMs: completedAtMs,
    }
    if (context.eventWriter) {
      await context.eventWriter.writeEvent({
        type: 'tool_result',
        ...eventMeta,
        toolResult: result,
      })
    }
    return resultPayload
  } catch (error) {
    // AskUserInterrupt must propagate to halt the LLM loop — never wrap it
    if (error instanceof AskUserInterrupt) {
      throw error
    }

    log.error('Tool failed after retries', error, { toolName: toolCall.toolName })

    // Wrap error for better user messages
    const agentError = wrapError(error, `tool:${toolCall.toolName}`)
    const completedAtMs = Date.now()
    const durationMs = completedAtMs - startTime

    // Update record with error
    await toolCallDocRef.update({
      status: 'failed',
      error: agentError.userMessage,
      errorCategory: agentError.category,
      errorDetails: agentError.details, // Include technical details
      retryAttempt,
      completedAtMs,
      durationMs,
      version: 3,
    })

    const resultPayload = {
      toolCallId: toolCall.toolCallId,
      toolName: toolCall.toolName,
      result: null,
      error: agentError.userMessage,
      executedAtMs: completedAtMs,
    }
    if (context.eventWriter) {
      await context.eventWriter.writeEvent({
        type: 'tool_result',
        ...eventMeta,
        errorMessage: agentError.userMessage,
        errorCategory: agentError.category,
      })
    }
    return resultPayload
  }
}

/**
 * Execute multiple tool calls in parallel
 */
export async function executeTools(
  toolCalls: ToolCall[],
  context: ToolExecutionContext
): Promise<ToolResult[]> {
  if (toolCalls.length === 0) {
    return []
  }

  log.info('Executing tool calls in parallel', { count: toolCalls.length })

  const results = await Promise.all(toolCalls.map((call) => executeTool(call, context)))

  return results
}

export async function loadToolRegistryForUser(userId: string): Promise<ToolRegistry> {
  ensureAdvancedToolsRegistered()
  const registry: ToolRegistry = new Map(BUILTIN_TOOL_REGISTRY)
  const customTools = await loadCustomTools(userId)

  for (const tool of customTools) {
    if (registry.has(tool.name)) {
      log.warn('Skipping custom tool due to name conflict', { toolName: tool.name })
      continue
    }
    const toolId = tool.toolId ?? (`tool:${tool.name}` as ToolId)
    registry.set(tool.name, { ...tool, toolId })
  }

  return registry
}

// ==================== Built-in Tools ====================

/**
 * Built-in tool: Get current date and time
 */
registerTool({
  name: 'get_current_time',
  description: 'Get the current date and time in ISO format',
  parameters: {
    type: 'object',
    properties: {
      timezone: {
        type: 'string',
        description: 'Optional timezone (e.g., "America/New_York")',
      },
    },
  },
  execute: async (params) => {
    const timezone = (params.timezone as string) || 'UTC'
    const now = new Date()

    return {
      iso: now.toISOString(),
      unix: now.getTime(),
      timezone,
      formatted: now.toLocaleString('en-US', { timeZone: timezone }),
    }
  },
})

/**
 * Built-in tool: Query Firestore
 */
registerTool({
  name: 'query_firestore',
  description: 'Query Firestore database for user data',
  parameters: {
    type: 'object',
    properties: {
      collection: {
        type: 'string',
        description: 'Collection to query (e.g., "todos", "events", "notes")',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of results to return (default: 10)',
      },
    },
    required: ['collection'],
  },
  execute: async (params, context) => {
    const collection = params.collection as string
    const limit = (params.limit as number) || 10

    const db = getFirestore()

    // Only allow querying user's own data
    const collectionRef = db.collection(`users/${context.userId}/${collection}`)

    const snapshot = await collectionRef.limit(limit).get()

    const documents = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }))

    return {
      collection,
      count: documents.length,
      documents,
    }
  },
})

/**
 * Built-in tool: Calculate
 */
registerTool({
  name: 'calculate',
  description: 'Perform mathematical calculations',
  parameters: {
    type: 'object',
    properties: {
      expression: {
        type: 'string',
        description: 'Mathematical expression to evaluate (e.g., "2 + 2", "sqrt(16)")',
      },
    },
    required: ['expression'],
  },
  execute: async (params) => {
    const expression = params.expression as string

    try {
      const result = mathParser.evaluate(expression)

      return {
        expression,
        result,
      }
    } catch (error) {
      throw new Error(`Failed to evaluate expression: ${(error as Error).message}`)
    }
  },
})

/**
 * Built-in tool: Expert Council execution
 */
registerTool({
  name: 'expert_council_execute',
  description: 'Run the Expert Council multi-model consensus pipeline',
  parameters: {
    type: 'object',
    properties: {
      prompt: {
        type: 'string',
        description: 'User prompt to run through the Expert Council pipeline',
      },
      context: {
        type: 'object',
        description: 'Optional additional context to include in the council execution',
      },
      mode: {
        type: 'string',
        description: 'Execution mode: full, quick, or single (optional)',
      },
    },
    required: ['prompt'],
  },
  execute: async (params, context) => {
    const prompt = params.prompt as string
    const mode = params.mode as ExecutionMode | undefined
    const extraContext = params.context as Record<string, unknown> | undefined
    const contextHash = buildExpertCouncilContextHash(extraContext)

    if (!prompt || !prompt.trim()) {
      throw new Error('Expert Council prompt is required.')
    }

    const db = getFirestore()
    const workflowDoc = await db
      .doc(`users/${context.userId}/workflows/${context.workflowId}`)
      .get()

    if (!workflowDoc.exists) {
      throw new Error('Workflow not found.')
    }

    const workflowData = workflowDoc.data() as {
      expertCouncilConfig?: ExpertCouncilConfig
      promptConfig?: { synthesisPrompts?: Record<string, unknown> }
    }
    const councilConfig = workflowData.expertCouncilConfig

    if (!councilConfig?.enabled) {
      throw new Error('Expert Council is not enabled for this workflow.')
    }

    const apiKeys = await loadProviderKeys(context.userId)
    let resolvedCouncilConfig = councilConfig

    const synthesisPrompt = workflowData.promptConfig?.synthesisPrompts?.default
    if (synthesisPrompt) {
      try {
        const resolvedPrompt = await resolvePrompt(
          context.userId,
          synthesisPrompt as PromptReference
        )
        resolvedCouncilConfig = {
          ...councilConfig,
          chairmanModel: {
            ...councilConfig.chairmanModel,
            systemPrompt: resolvedPrompt,
          },
        }
      } catch (error) {
        log.warn('Unable to resolve synthesis prompt for Expert Council', { error })
      }
    }
    const repository = createExpertCouncilRepository()
    const pipeline = createExpertCouncilPipeline({
      apiKeys,
      context: extraContext,
      eventWriter: context.eventWriter,
      workflowId: context.workflowId,
    })

    const executeCouncil = executeExpertCouncilUsecase(repository, pipeline)
    const turn = await executeCouncil(
      context.userId,
      context.runId as RunId,
      prompt.trim(),
      resolvedCouncilConfig,
      mode,
      context.workflowId as WorkflowId,
      contextHash
    )

    return {
      finalResponse: turn.stage3.finalResponse,
      stage1Responses: turn.stage1.responses,
      stage2Reviews: turn.stage2.reviews,
      executionMode: turn.executionMode,
      cacheHit: turn.cacheHit,
      turnId: turn.turnId,
    }
  },
})

// ==================== Phase 5D: Advanced Tools ====================

/**
 * Lazily register all advanced tools (calendar, notes, web search).
 * Called on first use via loadToolRegistryForUser() rather than at module load.
 */
let advancedToolsRegistered = false

export function ensureAdvancedToolsRegistered(): void {
  if (advancedToolsRegistered) return
  advancedToolsRegistered = true
  advancedTools.forEach((tool) => registerTool(tool))
}

// ==================== Phases 31-34: New Tool Registrations ====================

registerTool({
  toolId: 'tool:update_todo' as ToolId,
  name: 'update_todo',
  description: 'Update an existing todo item (status, urgency, importance, estimatedMinutes)',
  parameters: {
    type: 'object',
    properties: {
      todoId: { type: 'string', description: 'The ID of the todo to update' },
      status: {
        type: 'string',
        description: 'New status: inbox, next_action, scheduled, waiting, someday, done',
      },
      urgency: { type: 'string', description: 'Urgency level (low, medium, high, critical)' },
      importance: { type: 'number', description: 'Importance score 1-10' },
      estimatedMinutes: { type: 'number', description: 'Estimated time in minutes' },
    },
    required: ['todoId'],
  },
  execute: async (params, context) => {
    const { getFirestore } = await import('firebase-admin/firestore')
    const firestore = getFirestore()
    const todoRef = firestore.doc(`users/${context.userId}/todos/${params.todoId}`)
    const snap = await todoRef.get()
    if (!snap.exists) return { error: `Todo ${params.todoId} not found` }
    const update: Record<string, unknown> = { updatedAt: new Date() }
    if (params.status) update.status = params.status
    if (params.urgency) update.urgency = params.urgency
    if (params.importance) update.importance = params.importance
    if (params.estimatedMinutes) update.estimatedMinutes = params.estimatedMinutes
    if (params.status === 'done') update.completedAt = new Date()
    await todoRef.update(update)
    return { success: true, todoId: params.todoId, updated: Object.keys(update) }
  },
})

registerTool({
  toolId: 'tool:delete_todo' as ToolId,
  name: 'delete_todo',
  description: 'Delete a todo item by ID',
  parameters: {
    type: 'object',
    properties: {
      todoId: { type: 'string', description: 'The ID of the todo to delete' },
    },
    required: ['todoId'],
  },
  execute: async (params, context) => {
    const { getFirestore } = await import('firebase-admin/firestore')
    const firestore = getFirestore()
    const todoRef = firestore.doc(`users/${context.userId}/todos/${params.todoId}`)
    const snap = await todoRef.get()
    if (!snap.exists) return { error: `Todo ${params.todoId} not found` }
    await todoRef.delete()
    return { success: true, todoId: params.todoId }
  },
})

registerTool({
  toolId: 'tool:memory_recall' as ToolId,
  name: 'memory_recall',
  description: 'Recall information from past conversations and stored memories',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'What to search for in memory' },
      limit: { type: 'number', description: 'Max results to return (default 10)' },
    },
    required: ['query'],
  },
  execute: async (params, context) => {
    const { getFirestore } = await import('firebase-admin/firestore')
    const firestore = getFirestore()
    const limit = (params.limit as number) ?? 10
    // Search recent messages for relevant content
    const snap = await firestore
      .collection(`users/${context.userId}/messages`)
      .orderBy('createdAt', 'desc')
      .limit(limit * 3)
      .get()
    const query = (params.query as string).toLowerCase()
    const matches = snap.docs
      .filter((d) => {
        const content = (d.data().content ?? '').toLowerCase()
        return content.includes(query)
      })
      .slice(0, limit)
      .map((d) => ({ id: d.id, content: d.data().content, role: d.data().role }))
    return { results: matches, count: matches.length }
  },
})

registerTool({
  toolId: 'tool:generate_chart' as ToolId,
  name: 'generate_chart',
  description: 'Generate a chart/visualization from data (returns chart specification)',
  parameters: {
    type: 'object',
    properties: {
      chartType: { type: 'string', description: 'Chart type: bar, line, pie, scatter, area' },
      title: { type: 'string', description: 'Chart title' },
      data: { type: 'object', description: 'Data object with labels and values arrays' },
    },
    required: ['chartType', 'data'],
  },
  execute: async (params) => {
    // Return a Vega-Lite compatible chart spec that the frontend can render
    return {
      $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
      title: params.title ?? 'Chart',
      mark: params.chartType === 'pie' ? 'arc' : (params.chartType as string),
      data: { values: params.data },
      encoding: {},
    }
  },
})

registerTool({
  toolId: 'tool:code_interpreter' as ToolId,
  name: 'code_interpreter',
  description:
    'Execute JavaScript code in a sandboxed environment for calculations and data processing',
  parameters: {
    type: 'object',
    properties: {
      code: { type: 'string', description: 'JavaScript code to execute' },
      timeout: { type: 'number', description: 'Timeout in milliseconds (default 5000, max 30000)' },
    },
    required: ['code'],
  },
  execute: async (params) => {
    const code = params.code as string
    const timeout = Math.min((params.timeout as number) ?? 5000, 30000)
    // Use Node.js vm module for sandboxed execution
    const { createContext, runInContext } = await import('vm')
    const sandbox = { console: { log: (...args: unknown[]) => args }, result: undefined }
    const ctx = createContext(sandbox)
    try {
      const result = runInContext(`(function() { ${code} })()`, ctx, { timeout })
      return { success: true, result: result ?? sandbox.result }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  },
})

registerTool({
  toolId: 'tool:webhook_call' as ToolId,
  name: 'webhook_call',
  description:
    'Call an external webhook URL with a JSON payload (limited to user-whitelisted URLs)',
  parameters: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Webhook URL to call' },
      method: { type: 'string', description: 'HTTP method: GET, POST, PUT (default POST)' },
      payload: { type: 'object', description: 'JSON payload to send' },
    },
    required: ['url'],
  },
  execute: async (params, context) => {
    const url = params.url as string
    // SSRF protection: only allow HTTPS and reject internal IPs
    if (!url.startsWith('https://')) {
      return { error: 'Only HTTPS URLs are allowed' }
    }
    try {
      const parsedUrl = new URL(url)
      const hostname = parsedUrl.hostname
      if (
        hostname === 'localhost' ||
        hostname.startsWith('127.') ||
        hostname.startsWith('10.') ||
        hostname.startsWith('192.168.') ||
        hostname === '0.0.0.0'
      ) {
        return { error: 'Internal/private URLs are not allowed' }
      }
    } catch {
      return { error: 'Invalid URL' }
    }
    // Check user whitelist
    const { getFirestore } = await import('firebase-admin/firestore')
    const firestore = getFirestore()
    const whitelistDoc = await firestore.doc(`users/${context.userId}/preferences/webhooks`).get()
    const whitelist: string[] = whitelistDoc.exists
      ? (whitelistDoc.data()?.allowedDomains ?? [])
      : []
    const domain = new URL(url).hostname
    if (whitelist.length > 0 && !whitelist.includes(domain)) {
      return { error: `Domain ${domain} is not in your webhook whitelist` }
    }
    const method = (params.method as string)?.toUpperCase() ?? 'POST'
    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: method !== 'GET' ? JSON.stringify(params.payload ?? {}) : undefined,
    })
    return {
      success: response.ok,
      status: response.status,
      body: await response.text().catch(() => ''),
    }
  },
})

/**
 * Built-in tool: Ask User
 * Pauses the workflow and asks the user a question.
 * When resumed with a response, returns the user's answer.
 */
registerTool({
  toolId: 'tool:ask_user' as ToolId,
  name: 'ask_user',
  description:
    'Pause the workflow and ask the user a question. The workflow will wait for the user to respond before continuing. Use this when you need clarification, approval, or additional information from the user to proceed effectively.',
  parameters: {
    type: 'object',
    properties: {
      question: {
        type: 'string',
        description:
          'The question to ask the user. Be clear and specific about what information you need.',
      },
    },
    required: ['question'],
  },
  execute: async (params, context) => {
    const question = params.question as string

    if (!question || !question.trim()) {
      throw new Error('ask_user requires a non-empty question')
    }

    // Check if the user already provided a response (resume path)
    const humanInput = context.workflowContext?.humanInput as
      | { nodeId?: string; response?: string }
      | undefined

    if (humanInput?.response) {
      log.info('ask_user: returning existing user response', {
        agentId: context.agentId,
        responseLength: humanInput.response.length,
      })
      return humanInput.response
    }

    // No response yet — throw interrupt to pause the workflow
    log.info('ask_user: pausing workflow for user input', {
      agentId: context.agentId,
      question: question.substring(0, 100),
    })
    throw new AskUserInterrupt(question, context.agentId)
  },
})
