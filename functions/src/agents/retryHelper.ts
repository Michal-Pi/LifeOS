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
 * Check if an error is specifically a rate-limit (429) error
 */
function isRateLimitError(error: unknown): boolean {
  if (!error) return false
  const err = error as Record<string, unknown>
  if (err.status === 429 || err.statusCode === 429) return true
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase()
  return message.includes('rate limit') || message.includes('too many requests')
}

/**
 * Calculate delay for retry attempt with exponential backoff.
 * Rate-limit errors use a longer floor delay (15s) so retries span
 * at least one provider rate-limit window (~60s).
 *
 * @param attempt Retry attempt number (0-indexed)
 * @param config Retry configuration
 * @param error  Optional triggering error — used to detect rate-limit 429s
 * @returns Delay in milliseconds
 */
export function calculateBackoffDelay(
  attempt: number,
  config: RetryConfig,
  error?: unknown
): number {
  const baseDelay = config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt)

  // For rate-limit errors, enforce a minimum 15 s delay so we don't burn
  // retries before the provider's per-minute window resets.
  const RATE_LIMIT_FLOOR_MS = 15_000
  const delay = isRateLimitError(error) ? Math.max(baseDelay, RATE_LIMIT_FLOOR_MS) : baseDelay

  return Math.min(delay, config.maxDelayMs)
}

/**
 * Execute a function with retry logic and exponential backoff
 *
 * @param fn Function to execute
 * @param config Retry configuration (optional, uses defaults)
 * @param onRetry Optional callback invoked before each retry (for logging); may be async
 * @returns Result from successful execution
 * @throws Last error if all retries fail
 */
export async function executeWithRetry<T>(
  fn: () => Promise<T>,
  config: RetryConfig = DEFAULT_RETRY_CONFIG,
  onRetry?: (attempt: number, error: unknown, delayMs: number) => void | Promise<void>
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

      // Calculate backoff delay (rate-limit errors get a longer floor)
      const delayMs = calculateBackoffDelay(attempt, config, error)

      // Notify caller about retry (await so async callbacks complete before next attempt)
      if (onRetry) {
        await Promise.resolve(onRetry(attempt + 1, error, delayMs))
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
 * Retry configuration for provider API calls.
 * Rate-limit (429) errors get a 15 s floor per attempt (see calculateBackoffDelay),
 * so 4 retries × 15 s ≈ 60 s — enough to span one provider rate-limit window.
 */
export const PROVIDER_RETRY_CONFIG: RetryConfig = {
  maxRetries: 4,
  initialDelayMs: 2000,
  maxDelayMs: 30000, // cap at 30 s per attempt
  backoffMultiplier: 2,
}
