/**
 * Error Handler
 *
 * Provides structured error handling, timeout utilities, and user-friendly error messages.
 * Phase 5E.2: Error Handling & Reliability
 */

/**
 * Error categories for classification
 */
export type ErrorCategory =
  | 'network'
  | 'auth'
  | 'rate_limit'
  | 'validation'
  | 'timeout'
  | 'internal'
  | 'quota'
  | 'config'

/**
 * Structured error for agent operations
 */
export class AgentError extends Error {
  constructor(
    message: string,
    public userMessage: string,
    public category: ErrorCategory,
    public retryable: boolean,
    public details?: Record<string, unknown>
  ) {
    super(message)
    this.name = 'AgentError'
  }

  /**
   * Convert to JSON for Firestore storage
   */
  toJSON(): Record<string, unknown> {
    return {
      message: this.message,
      userMessage: this.userMessage,
      category: this.category,
      retryable: this.retryable,
      details: this.details,
    }
  }
}

/**
 * Timeout error for operations that exceed time limits
 */
export class TimeoutError extends AgentError {
  constructor(operation: string, timeoutMs: number, details?: Record<string, unknown>) {
    super(
      `Operation '${operation}' timed out after ${timeoutMs}ms`,
      `Operation timed out after ${timeoutMs / 1000}s. Please try again.`,
      'timeout',
      true,
      { operation, timeoutMs, ...details }
    )
    this.name = 'TimeoutError'
  }
}

/**
 * Rate limit error for quota/rate limit violations
 */
export class RateLimitError extends AgentError {
  constructor(
    limitType: 'user' | 'provider',
    limit: string,
    resetInfo?: string,
    details?: Record<string, unknown>
  ) {
    const userMessage =
      limitType === 'user'
        ? `You've exceeded your ${limit}. ${resetInfo || 'Please try again later.'}`
        : `Too many requests to AI provider. ${resetInfo || 'Please wait a moment.'}`

    super(
      `Rate limit exceeded: ${limit}`,
      userMessage,
      'rate_limit',
      true, // Retryable after waiting
      { limitType, limit, resetInfo, ...details }
    )
    this.name = 'RateLimitError'
  }
}

/**
 * Error for missing API key / integration not configured
 */
export class NoAPIKeyConfiguredError extends AgentError {
  constructor(provider: string, envVarName: string, details?: Record<string, unknown>) {
    super(
      `${provider} API key not configured (${envVarName})`,
      `${provider} is not configured. Please add the API key in Settings > Integrations.`,
      'config',
      false,
      { provider, envVarName, ...details }
    )
    this.name = 'NoAPIKeyConfiguredError'
  }
}

/**
 * Throw a structured error for an HTTP API response failure
 */
export function throwApiError(toolName: string, status: number, statusText: string): never {
  throw new AgentError(
    `${toolName} API error: ${status} ${statusText}`,
    `External API returned an error (${status}). Please try again.`,
    status === 429 ? 'rate_limit' : status >= 500 ? 'network' : 'internal',
    status === 429 || status >= 500,
    { tool: toolName, httpStatus: status }
  )
}

/**
 * Wrap an unknown error into an AgentError
 *
 * @param error The error to wrap
 * @param operation Operation that failed (for context)
 * @returns AgentError
 */
export function wrapError(error: unknown, operation: string): AgentError {
  // Already an AgentError
  if (error instanceof AgentError) {
    return error
  }

  const err = error as Record<string, unknown>
  const message = error instanceof Error ? error.message : String(error)

  // Network errors
  if (
    typeof err?.code === 'string' &&
    ['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNRESET', 'EPIPE'].includes(err.code)
  ) {
    return new AgentError(
      `Network error during ${operation}: ${message}`,
      'Unable to connect to service. Please check your internet connection and try again.',
      'network',
      true,
      { operation, originalError: message, code: err.code }
    )
  }

  // Authentication errors
  if (err?.status === 401 || err?.status === 403 || message.toLowerCase().includes('auth')) {
    return new AgentError(
      `Authentication failed during ${operation}: ${message}`,
      'Authentication failed. Please check your API keys in settings.',
      'auth',
      false,
      { operation, originalError: message }
    )
  }

  // Rate limit errors
  if (
    err?.status === 429 ||
    message.toLowerCase().includes('rate limit') ||
    message.toLowerCase().includes('too many requests')
  ) {
    return new AgentError(
      `Rate limit exceeded during ${operation}: ${message}`,
      'Too many requests. Please wait a moment and try again.',
      'rate_limit',
      true,
      { operation, originalError: message }
    )
  }

  // Validation errors
  if (
    err?.status === 400 ||
    message.toLowerCase().includes('invalid') ||
    message.toLowerCase().includes('validation')
  ) {
    return new AgentError(
      `Validation error during ${operation}: ${message}`,
      `Invalid input: ${message}`,
      'validation',
      false,
      { operation, originalError: message }
    )
  }

  // Timeout errors
  if (message.toLowerCase().includes('timeout') || message.toLowerCase().includes('timed out')) {
    return new AgentError(
      `Timeout during ${operation}: ${message}`,
      'Operation timed out. Please try again.',
      'timeout',
      true,
      { operation, originalError: message }
    )
  }

  // Default: internal error
  return new AgentError(
    `Error during ${operation}: ${message}`,
    `An error occurred: ${message}`,
    'internal',
    false,
    { operation, originalError: message }
  )
}

/**
 * Execute a promise with a timeout
 *
 * @param promise Promise to execute
 * @param timeoutMs Timeout in milliseconds
 * @param operation Operation name (for error message)
 * @returns Result of promise
 * @throws TimeoutError if timeout is exceeded
 */
export async function executeWithTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operation: string
): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new TimeoutError(operation, timeoutMs))
    }, timeoutMs)
  })

  try {
    const result = await Promise.race([promise, timeoutPromise])
    clearTimeout(timeoutHandle!)
    return result
  } catch (error) {
    clearTimeout(timeoutHandle!)
    throw error
  }
}

/**
 * Timeout configurations for different operation types
 */
export const TIMEOUTS = {
  // Tool execution timeouts (per tool type)
  TOOL: {
    default: 30000, // 30 seconds
    serp_search: 15000, // 15 seconds (web search via Serper)
    query_firestore: 10000, // 10 seconds
    list_calendar_events: 10000,
    create_calendar_event: 10000,
    list_notes: 10000,
    create_note: 15000,
    read_note: 10000,
    calculate: 5000, // 5 seconds (simple calculations)
    get_current_time: 5000,
    parse_pdf: 60000, // 60 seconds (large PDFs)
    create_topic: 10000,
    create_todo: 10000,
    list_todos: 10000,
    search_google_drive: 15000,
    download_google_drive_file: 60000, // 60 seconds (large files)
    list_gmail_messages: 15000,
    read_gmail_message: 15000,
  },

  // Provider API call timeout (base — use getProviderTimeout for dynamic scaling)
  PROVIDER: 120000, // 120 seconds base

  // Overall run timeout (handled by Cloud Function config)
  RUN: 300000, // 5 minutes (for reference, actual limit set in runExecutor.ts)
}

/**
 * Get a dynamic provider timeout based on estimated input size.
 * Larger prompts need more time for the model to process.
 *
 * @param inputTokenEstimate Estimated input tokens (e.g. JSON.stringify(messages).length / 4)
 * @returns Timeout in milliseconds, capped at 240s
 */
export function getProviderTimeout(inputTokenEstimate: number): number {
  const base = TIMEOUTS.PROVIDER // 120s
  if (inputTokenEstimate <= 8000) return base
  if (inputTokenEstimate <= 16000) return base * 1.25 // 150s
  if (inputTokenEstimate <= 32000) return base * 1.5 // 180s
  return Math.min(base * 2, 240000) // 240s max
}

/**
 * Get timeout for a specific tool
 *
 * @param toolName Tool name
 * @returns Timeout in milliseconds
 */
export function getToolTimeout(toolName: string): number {
  return (TIMEOUTS.TOOL as Record<string, number>)[toolName] || TIMEOUTS.TOOL.default
}

/**
 * Error message templates for common scenarios
 */
export const ERROR_MESSAGES = {
  TOOL_NOT_FOUND: (toolName: string) => ({
    message: `Tool '${toolName}' not found in registry`,
    userMessage: `Tool '${toolName}' is not available. Please check tool configuration.`,
  }),

  TOOL_EXECUTION_FAILED: (toolName: string, error: string) => ({
    message: `Tool '${toolName}' execution failed: ${error}`,
    userMessage: `Tool '${toolName}' failed: ${error}`,
  }),

  PROVIDER_NOT_CONFIGURED: (provider: string) => ({
    message: `${provider} API key not configured`,
    userMessage: `${provider} is not configured. Please add API key in settings.`,
  }),

  WORKFLOW_NOT_FOUND: (workflowId: string) => ({
    message: `Workflow ${workflowId} not found`,
    userMessage: 'Workflow not found. It may have been deleted.',
  }),

  NO_AGENTS_CONFIGURED: () => ({
    message: 'No agents configured in workflow',
    userMessage: 'No agents found. Please add at least one agent to the workflow.',
  }),

  INVALID_WORKFLOW_TYPE: (workflowType: string) => ({
    message: `Unsupported workflow type: ${workflowType}`,
    userMessage: `Workflow type '${workflowType}' is not supported.`,
  }),

  RATE_LIMIT_EXCEEDED: (limitType: string, resetInfo?: string) => ({
    message: `Rate limit exceeded: ${limitType}`,
    userMessage: `You've exceeded your ${limitType}. ${resetInfo || 'Please try again later.'}`,
  }),

  QUOTA_EXCEEDED: (quotaType: string, limit: string, used: string) => ({
    message: `Quota exceeded: ${quotaType} (${used}/${limit})`,
    userMessage: `You've reached your ${quotaType} limit (${used}/${limit}). Please upgrade or wait for quota reset.`,
  }),
}
