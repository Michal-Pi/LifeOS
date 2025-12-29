/**
 * Tool Executor
 *
 * Framework for executing server-side tools that agents can invoke.
 * Provides built-in tools and infrastructure for custom tool registration.
 * Phase 5B: Persists tool call records to Firestore for tracking and analytics.
 * Phase 5D: Advanced built-in tools (calendar, notes, web search).
 */

import type { AgentConfig, ToolCallStatus, ModelProvider } from '@lifeos/agents'
import { getFirestore } from 'firebase-admin/firestore'
import { advancedTools } from './advancedTools'

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
      }
    >
    required?: string[]
  }
  execute: (params: Record<string, unknown>, context: ToolExecutionContext) => Promise<unknown>
}

/**
 * Base context for tool execution (provided by workflow executor)
 */
export interface BaseToolExecutionContext {
  userId: string
  agentId: string
  workspaceId: string
  runId: string
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
const TOOL_REGISTRY: Map<string, ToolDefinition> = new Map()

/**
 * Register a tool for agent use
 */
export function registerTool(tool: ToolDefinition): void {
  TOOL_REGISTRY.set(tool.name, tool)
  console.log(`Registered tool: ${tool.name}`)
}

/**
 * Get all registered tools as OpenAI-compatible function definitions
 */
export function getToolDefinitions(): Array<{
  type: 'function'
  function: {
    name: string
    description: string
    parameters: ToolDefinition['parameters']
  }
}> {
  return Array.from(TOOL_REGISTRY.values()).map((tool) => ({
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

  // Filter tools based on agent's toolIds
  // For now, we match by tool name (simplified - in production would use ToolId)
  return Array.from(TOOL_REGISTRY.values())
    .filter((tool) => agent.toolIds?.some((id) => id.includes(tool.name)))
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

  const toolCallRecordId = toolCallDocRef.id as any // Cast to ToolCallRecordId

  // Create initial tool call record (pending)
  const toolCallRecord = {
    toolCallRecordId,
    runId: context.runId,
    workspaceId: context.workspaceId,
    userId: context.userId,
    agentId: context.agentId,

    toolCallId: toolCall.toolCallId,
    toolName: toolCall.toolName,
    toolId: `tool:${toolCall.toolName}` as any, // Simplified - would use proper ToolId

    parameters: toolCall.parameters,

    status: 'pending' as ToolCallStatus,

    startedAtMs: startTime,

    provider: context.provider,
    modelName: context.modelName,
    iteration: context.iteration,

    syncState: 'synced' as const,
    version: 1,
  }

  try {
    // Save pending record
    await toolCallDocRef.set(toolCallRecord)

    const tool = TOOL_REGISTRY.get(toolCall.toolName)

    if (!tool) {
      // Update record with error
      await toolCallDocRef.update({
        status: 'failed',
        error: `Tool '${toolCall.toolName}' not found`,
        completedAtMs: Date.now(),
        durationMs: Date.now() - startTime,
        version: 2,
      })

      return {
        toolCallId: toolCall.toolCallId,
        toolName: toolCall.toolName,
        result: null,
        error: `Tool '${toolCall.toolName}' not found`,
        executedAtMs: Date.now(),
      }
    }

    console.log(`Executing tool: ${toolCall.toolName} with params:`, toolCall.parameters)

    // Update to running
    await toolCallDocRef.update({
      status: 'running',
      version: 2,
    })

    const result = await tool.execute(toolCall.parameters, context)

    const completedAtMs = Date.now()
    const durationMs = completedAtMs - startTime

    console.log(`Tool ${toolCall.toolName} completed in ${durationMs}ms`)

    // Update record with success
    await toolCallDocRef.update({
      status: 'completed',
      result,
      completedAtMs,
      durationMs,
      version: 3,
    })

    return {
      toolCallId: toolCall.toolCallId,
      toolName: toolCall.toolName,
      result,
      executedAtMs: completedAtMs,
    }
  } catch (error) {
    console.error(`Tool ${toolCall.toolName} failed:`, error)

    const completedAtMs = Date.now()
    const durationMs = completedAtMs - startTime

    // Update record with error
    await toolCallDocRef.update({
      status: 'failed',
      error: (error as Error).message,
      completedAtMs,
      durationMs,
      version: 3,
    })

    return {
      toolCallId: toolCall.toolCallId,
      toolName: toolCall.toolName,
      result: null,
      error: (error as Error).message,
      executedAtMs: completedAtMs,
    }
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

  console.log(`Executing ${toolCalls.length} tool calls in parallel`)

  const results = await Promise.all(toolCalls.map((call) => executeTool(call, context)))

  return results
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
 * Built-in tool: Search web (placeholder - requires external API)
 */
registerTool({
  name: 'search_web',
  description: 'Search the web for information (placeholder)',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search query',
      },
      maxResults: {
        type: 'number',
        description: 'Maximum number of results (default: 5)',
      },
    },
    required: ['query'],
  },
  execute: async (params) => {
    const query = params.query as string
    const maxResults = (params.maxResults as number) || 5

    // Placeholder - would integrate with Google Custom Search API, Bing API, etc.
    return {
      query,
      results: [
        {
          title: 'Web search not yet implemented',
          snippet:
            'This is a placeholder. Integrate with a search API (Google, Bing) to enable web search.',
          url: 'https://example.com',
        },
      ],
      note: `Would search for "${query}" and return top ${maxResults} results`,
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
      // Simple evaluation - in production would use a safer math library
      // eslint-disable-next-line no-eval
      const result = eval(expression)

      return {
        expression,
        result,
      }
    } catch (error) {
      throw new Error(`Failed to evaluate expression: ${(error as Error).message}`)
    }
  },
})

// ==================== Phase 5D: Advanced Tools ====================

/**
 * Register all advanced tools (calendar, notes, web search)
 */
advancedTools.forEach((tool) => registerTool(tool))
