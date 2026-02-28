/**
 * Retry Helper
 *
 * Provides retry logic with exponential backoff for handling transient failures.
 * Only retries on network errors, timeouts, and rate limits.
 * Phase 5E.1: Error Handling & Reliability
 */

/**
 * Configuration for retry behavior
 */
export interface RetryConfig {
  maxRetries: number
  initialDelayMs: number
  maxDelayMs: number
  backoffMultiplier: number
}

/**
 * Default retry configuration
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 1000, // 1 second
  maxDelayMs: 8000, // 8 seconds
  backoffMultiplier: 2, // Exponential: 1s, 2s, 4s, 8s
}

/**
 * Determines if an error is retryable
 *
 * Retryable errors:
 * - Network errors (ECONNREFUSED, ETIMEDOUT, ENOTFOUND, ECONNRESET)
 * - Rate limit errors (429 status or "rate limit" in message)
 * - Temporary server errors (500, 502, 503, 504)
 * - Timeout errors
 *
 * Non-retryable errors:
 * - Authentication failures (401, 403)
 * - Not found (404)
 * - Bad request / validation (400)
 * - Other client errors (4xx)
 */
export function isRetryableError(error: unknown): boolean {
  if (!error) return false

  const err = error as Record<string, unknown>

  // Network errors (Node.js error codes)
  const networkErrorCodes = ['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNRESET', 'EPIPE']
  if (typeof err.code === 'string' && networkErrorCodes.includes(err.code)) {
    return true
  }

  // HTTP status codes
  if (err.status || err.statusCode) {
    const status = (err.status || err.statusCode) as number
    // Rate limits
    if (status === 429) return true
    // Server errors (5xx)
    if (status >= 500 && status < 600) return true
    // Don't retry client errors (4xx)
    if (status >= 400 && status < 500) return false
  }

  // Error message contains rate limit indicators
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase()
  if (
    message.includes('rate limit') ||
    message.includes('too many requests') ||
    message.includes('quota exceeded')
  ) {
    return true
  }

  // Timeout errors
  if (message.includes('timeout') || message.includes('timed out') || err.name === 'TimeoutError') {
    return true
  }

  // Default: don't retry unknown errors
  return false
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Calculate delay for retry attempt with exponential backoff
 *
 * @param attempt Retry attempt number (0-indexed)
 * @param config Retry configuration
 * @returns Delay in milliseconds
 */
export function calculateBackoffDelay(attempt: number, config: RetryConfig): number {
  const delay = config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt)
  return Math.min(delay, config.maxDelayMs)
}

/**
 * Execute a function with retry logic and exponential backoff
 *
 * @param fn Function to execute
 * @param config Retry configuration (optional, uses defaults)
 * @param onRetry Optional callback invoked before each retry (for logging)
 * @returns Result from successful execution
 * @throws Last error if all retries fail
 */
export async function executeWithRetry<T>(
  fn: () => Promise<T>,
  config: RetryConfig = DEFAULT_RETRY_CONFIG,
  onRetry?: (attempt: number, error: unknown, delayMs: number) => void
): Promise<T> {
  let lastError: unknown

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      // Execute the function
      const result = await fn()
      return result
    } catch (error) {
      lastError = error

      // Check if we should retry
      const shouldRetry = isRetryableError(error)
      const hasRetriesLeft = attempt < config.maxRetries

      if (!shouldRetry || !hasRetriesLeft) {
        // Don't retry, throw the error
        throw error
      }

      // Calculate backoff delay
      const delayMs = calculateBackoffDelay(attempt, config)

      // Notify caller about retry
      if (onRetry) {
        onRetry(attempt + 1, error, delayMs)
      }

      // Wait before retrying
      await sleep(delayMs)
    }
  }

  // Should never reach here, but TypeScript requires it
  throw lastError
}

/**
 * Retry configuration specifically for tool execution
 */
export const TOOL_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 8000,
  backoffMultiplier: 2,
}

/**
 * Retry configuration for provider API calls
 */
export const PROVIDER_RETRY_CONFIG: RetryConfig = {
  maxRetries: 2, // Fewer retries for provider calls (they're more expensive)
  initialDelayMs: 2000, // Longer initial delay
  maxDelayMs: 10000,
  backoffMultiplier: 2,
}
