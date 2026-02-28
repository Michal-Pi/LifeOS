/**
 * Firestore Utility Functions
 *
 * Provides safe wrappers for Firestore operations with:
 * - Retry logic with exponential backoff
 * - Error classification
 * - Logging and monitoring hooks
 */

import { getFirestore } from 'firebase-admin/firestore'
import { RetryConfig, ErrorCodes, type ErrorCode } from './config.js'
import { createLogger } from '../../lib/logger.js'

const log = createLogger('FirestoreUtils')

// ----- Error Types -----

/**
 * Error thrown when a Firestore write operation fails
 */
export class FirestoreWriteError extends Error {
  readonly code: ErrorCode
  readonly collection: string
  readonly docId: string
  readonly operation: 'set' | 'update' | 'delete' | 'batch'
  readonly retryable: boolean
  readonly originalError?: Error

  constructor(params: {
    message: string
    code: ErrorCode
    collection: string
    docId: string
    operation: 'set' | 'update' | 'delete' | 'batch'
    retryable: boolean
    originalError?: Error
  }) {
    super(params.message)
    this.name = 'FirestoreWriteError'
    this.code = params.code
    this.collection = params.collection
    this.docId = params.docId
    this.operation = params.operation
    this.retryable = params.retryable
    this.originalError = params.originalError

    if (params.originalError?.stack) {
      this.stack = `${this.stack}\nCaused by: ${params.originalError.stack}`
    }
  }
}

/**
 * Error thrown when a Firestore read operation fails
 */
export class FirestoreReadError extends Error {
  readonly code: ErrorCode
  readonly collection: string
  readonly docId?: string
  readonly query?: string
  readonly originalError?: Error

  constructor(params: {
    message: string
    code: ErrorCode
    collection: string
    docId?: string
    query?: string
    originalError?: Error
  }) {
    super(params.message)
    this.name = 'FirestoreReadError'
    this.code = params.code
    this.collection = params.collection
    this.docId = params.docId
    this.query = params.query
    this.originalError = params.originalError

    if (params.originalError?.stack) {
      this.stack = `${this.stack}\nCaused by: ${params.originalError.stack}`
    }
  }
}

/**
 * Error thrown when document validation fails
 */
export class FirestoreValidationError extends Error {
  readonly code: ErrorCode
  readonly collection: string
  readonly docId: string
  readonly validationErrors: string[]

  constructor(params: { collection: string; docId: string; validationErrors: string[] }) {
    super(
      `Document validation failed for ${params.collection}/${params.docId}: ${params.validationErrors.join(', ')}`
    )
    this.name = 'FirestoreValidationError'
    this.code = ErrorCodes.FIRESTORE_VALIDATION_FAILED
    this.collection = params.collection
    this.docId = params.docId
    this.validationErrors = params.validationErrors
  }
}

// ----- Result Types -----

/**
 * Result of a safe Firestore write operation
 */
export type SafeWriteResult<T> =
  | { success: true; result: T }
  | { success: false; error: FirestoreWriteError }

/**
 * Result of a safe Firestore read operation
 */
export type SafeReadResult<T> =
  | { success: true; data: T | null }
  | { success: false; error: FirestoreReadError }

// ----- Helper Functions -----

/**
 * Determine if an error is retryable based on Firestore error codes
 */
function isRetryableError(error: unknown): boolean {
  if (!(error instanceof Error)) return false

  const message = error.message.toLowerCase()

  // Retryable conditions
  if (message.includes('deadline exceeded')) return true
  if (message.includes('unavailable')) return true
  if (message.includes('resource exhausted')) return true
  if (message.includes('aborted')) return true
  if (message.includes('internal')) return true

  // Not retryable
  if (message.includes('permission denied')) return false
  if (message.includes('not found')) return false
  if (message.includes('already exists')) return false
  if (message.includes('invalid argument')) return false

  // Default to retryable for unknown errors
  return true
}

/**
 * Calculate delay for retry attempt with exponential backoff
 */
function calculateRetryDelay(attempt: number): number {
  const delay = RetryConfig.INITIAL_DELAY_MS * Math.pow(RetryConfig.BACKOFF_MULTIPLIER, attempt)
  return Math.min(delay, RetryConfig.MAX_DELAY_MS)
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ----- Safe Write Operations -----

/**
 * Safely execute a Firestore write operation with retry logic
 */
export async function safeFirestoreWrite<T>(
  operation: () => Promise<T>,
  context: {
    collection: string
    docId: string
    operation: 'set' | 'update' | 'delete' | 'batch'
  }
): Promise<SafeWriteResult<T>> {
  let lastError: Error | undefined

  for (let attempt = 0; attempt <= RetryConfig.MAX_RETRIES; attempt++) {
    try {
      const result = await operation()
      return { success: true, result }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))

      const retryable = isRetryableError(error)

      if (!retryable || attempt === RetryConfig.MAX_RETRIES) {
        return {
          success: false,
          error: new FirestoreWriteError({
            message: `Firestore ${context.operation} failed for ${context.collection}/${context.docId}: ${lastError.message}`,
            code: ErrorCodes.FIRESTORE_WRITE_FAILED,
            collection: context.collection,
            docId: context.docId,
            operation: context.operation,
            retryable,
            originalError: lastError,
          }),
        }
      }

      // Wait before retry
      const delay = calculateRetryDelay(attempt)
      log.warn(`${context.operation} failed, retrying`, {
        attempt: attempt + 1,
        maxAttempts: RetryConfig.MAX_RETRIES + 1,
        retryInMs: delay,
        collection: context.collection,
        docId: context.docId,
        error: lastError.message,
      })
      await sleep(delay)
    }
  }

  // Should not reach here, but TypeScript needs this
  return {
    success: false,
    error: new FirestoreWriteError({
      message: `Firestore ${context.operation} failed for ${context.collection}/${context.docId}: ${lastError?.message ?? 'Unknown error'}`,
      code: ErrorCodes.FIRESTORE_WRITE_FAILED,
      collection: context.collection,
      docId: context.docId,
      operation: context.operation,
      retryable: false,
      originalError: lastError,
    }),
  }
}

/**
 * Safely execute a Firestore read operation
 */
export async function safeFirestoreRead<T>(
  operation: () => Promise<T | null>,
  context: {
    collection: string
    docId?: string
    query?: string
  }
): Promise<SafeReadResult<T>> {
  try {
    const data = await operation()
    return { success: true, data }
  } catch (error) {
    const originalError = error instanceof Error ? error : new Error(String(error))

    return {
      success: false,
      error: new FirestoreReadError({
        message: `Firestore read failed for ${context.collection}${context.docId ? `/${context.docId}` : ''}: ${originalError.message}`,
        code: ErrorCodes.FIRESTORE_READ_FAILED,
        collection: context.collection,
        docId: context.docId,
        query: context.query,
        originalError,
      }),
    }
  }
}

// ----- Convenience Wrappers -----

/**
 * Safely set a document with retry logic
 */
export async function safeSetDoc<T extends object>(
  docPath: string,
  data: T
): Promise<SafeWriteResult<void>> {
  const db = getFirestore()
  const parts = docPath.split('/')
  const docId = parts.pop() ?? ''
  const collection = parts.join('/')

  return safeFirestoreWrite(
    async () => {
      await db.doc(docPath).set(data)
    },
    { collection, docId, operation: 'set' }
  )
}

/**
 * Safely update a document with retry logic
 */
export async function safeUpdateDoc(
  docPath: string,
  data: Record<string, unknown>
): Promise<SafeWriteResult<void>> {
  const db = getFirestore()
  const parts = docPath.split('/')
  const docId = parts.pop() ?? ''
  const collection = parts.join('/')

  return safeFirestoreWrite(
    async () => {
      await db.doc(docPath).update(data)
    },
    { collection, docId, operation: 'update' }
  )
}

/**
 * Safely delete a document with retry logic
 */
export async function safeDeleteDoc(docPath: string): Promise<SafeWriteResult<void>> {
  const db = getFirestore()
  const parts = docPath.split('/')
  const docId = parts.pop() ?? ''
  const collection = parts.join('/')

  return safeFirestoreWrite(
    async () => {
      await db.doc(docPath).delete()
    },
    { collection, docId, operation: 'delete' }
  )
}

/**
 * Safely get a document
 */
export async function safeGetDoc<T>(
  docPath: string,
  transform?: (data: FirebaseFirestore.DocumentData) => T | null
): Promise<SafeReadResult<T>> {
  const db = getFirestore()
  const parts = docPath.split('/')
  const docId = parts.pop() ?? ''
  const collection = parts.join('/')

  return safeFirestoreRead(
    async () => {
      const doc = await db.doc(docPath).get()
      if (!doc.exists) return null
      const data = doc.data()
      if (!data) return null
      return transform ? transform(data) : (data as T)
    },
    { collection, docId }
  )
}

// ----- Error Extraction -----

/**
 * Extract a safe error message from an unknown error
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  return String(error)
}

/**
 * Check if an error is a Firestore error
 */
export function isFirestoreError(
  error: unknown
): error is FirestoreWriteError | FirestoreReadError | FirestoreValidationError {
  return (
    error instanceof FirestoreWriteError ||
    error instanceof FirestoreReadError ||
    error instanceof FirestoreValidationError
  )
}
