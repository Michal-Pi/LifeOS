/**
 * Tool Executor
 *
 * Framework for executing server-side tools that agents can invoke.
 * Provides built-in tools and infrastructure for custom tool registration.
 */

import type { AgentConfig } from '@lifeos/agents'
import { getFirestore } from 'firebase-admin/firestore'

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
 * Context available during tool execution
 */
export interface ToolExecutionContext {
  userId: string
  agentId: string
  workspaceId: string
  runId: string
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
 * Execute a tool call
 */
export async function executeTool(
  toolCall: ToolCall,
  context: ToolExecutionContext
): Promise<ToolResult> {
  const startTime = Date.now()

  try {
    const tool = TOOL_REGISTRY.get(toolCall.toolName)

    if (!tool) {
      return {
        toolCallId: toolCall.toolCallId,
        toolName: toolCall.toolName,
        result: null,
        error: `Tool '${toolCall.toolName}' not found`,
        executedAtMs: Date.now(),
      }
    }

    console.log(`Executing tool: ${toolCall.toolName} with params:`, toolCall.parameters)

    const result = await tool.execute(toolCall.parameters, context)

    console.log(`Tool ${toolCall.toolName} completed in ${Date.now() - startTime}ms`)

    return {
      toolCallId: toolCall.toolCallId,
      toolName: toolCall.toolName,
      result,
      executedAtMs: Date.now(),
    }
  } catch (error) {
    console.error(`Tool ${toolCall.toolName} failed:`, error)

    return {
      toolCallId: toolCall.toolCallId,
      toolName: toolCall.toolName,
      result: null,
      error: (error as Error).message,
      executedAtMs: Date.now(),
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
