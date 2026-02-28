/**
 * Firestore Document Validation Utilities
 *
 * Provides type-safe document parsing with Zod validation.
 * Prevents unsafe type assertions when reading from Firestore.
 */

import type { DocumentSnapshot, DocumentData } from 'firebase-admin/firestore'
import { createLogger } from '../../lib/logger.js'

const log = createLogger('FirestoreValidation')

/**
 * Zod issue type for error reporting
 * Uses PropertyKey[] to match Zod 4.x ($ZodIssue)
 */
interface ZodIssue {
  path: PropertyKey[]
  message: string
}

/**
 * Zod-compatible schema interface for Zod 4.x
 * This provides compatibility with both ZodObject and ZodType
 */
interface ZodCompatibleSchema<T> {
  safeParse(
    data: unknown
  ): { success: true; data: T } | { success: false; error: { issues: ZodIssue[] } }
}

/**
 * Format a Zod path (PropertyKey[]) to a string for error messages
 */
function formatPath(path: PropertyKey[]): string {
  return path
    .map((p) => (typeof p === 'symbol' ? (p.description ?? '[symbol]') : String(p)))
    .join('.')
}

/**
 * Result of document validation
 */
export type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; issues?: ZodIssue[] }

/**
 * Context for validation error reporting
 */
export interface ValidationContext {
  collection: string
  docId: string
  operation?: string
}

/**
 * Validate a Firestore document against a Zod schema
 *
 * @param doc - Firestore document snapshot
 * @param schema - Zod schema to validate against
 * @param context - Context for error reporting
 * @returns Validated data or validation error
 *
 * @example
 * ```typescript
 * const result = validateDocument(doc, CheckpointDocumentSchema, {
 *   collection: 'checkpoints',
 *   docId: threadId
 * });
 *
 * if (result.success) {
 *   // result.data is fully typed
 *   console.log(result.data.checkpointId);
 * } else {
 *   console.error('Validation failed:', result.error);
 * }
 * ```
 */
export function validateDocument<T>(
  doc: DocumentSnapshot<DocumentData>,
  schema: ZodCompatibleSchema<T>,
  context: ValidationContext
): ValidationResult<T> {
  if (!doc.exists) {
    return {
      success: false,
      error: `Document not found: ${context.collection}/${context.docId}`,
    }
  }

  const data = doc.data()

  const parseResult = schema.safeParse(data)

  if (parseResult.success) {
    return { success: true, data: parseResult.data }
  }

  const issues = parseResult.error.issues
  const issueMessages = issues.map((i) => `${formatPath(i.path)}: ${i.message}`).join('; ')

  log.warn('Document validation failed', {
    collection: context.collection,
    docId: context.docId,
    issueMessages,
    issues,
    operation: context.operation,
  })

  return {
    success: false,
    error: `Invalid document structure: ${issueMessages}`,
    issues,
  }
}

/**
 * Validate raw data against a Zod schema
 *
 * Use this when you already have the document data (not a snapshot)
 */
export function validateData<T>(
  data: unknown,
  schema: ZodCompatibleSchema<T>,
  context: ValidationContext
): ValidationResult<T> {
  const parseResult = schema.safeParse(data)

  if (parseResult.success) {
    return { success: true, data: parseResult.data }
  }

  const issues = parseResult.error.issues
  const issueMessages = issues.map((i) => `${formatPath(i.path)}: ${i.message}`).join('; ')

  log.warn('Data validation failed', {
    collection: context.collection,
    docId: context.docId,
    issueMessages,
    issues,
    operation: context.operation,
  })

  return {
    success: false,
    error: `Invalid data structure: ${issueMessages}`,
    issues,
  }
}

/**
 * Validate and return data or null (for simpler error handling)
 *
 * @example
 * ```typescript
 * const checkpoint = validateOrNull(doc.data(), CheckpointSchema, context);
 * if (!checkpoint) {
 *   return undefined; // Handle gracefully
 * }
 * ```
 */
export function validateOrNull<T>(
  data: unknown,
  schema: ZodCompatibleSchema<T>,
  context: ValidationContext
): T | null {
  const result = validateData(data, schema, context)
  return result.success ? result.data : null
}

/**
 * Validate and throw on failure (for cases where invalid data is unexpected)
 *
 * @throws Error with validation details
 */
export function validateOrThrow<T>(
  data: unknown,
  schema: ZodCompatibleSchema<T>,
  context: ValidationContext
): T {
  const result = validateData(data, schema, context)
  if (!result.success) {
    throw new Error(`${context.collection}/${context.docId}: ${result.error}`)
  }
  return result.data
}

/**
 * Create a typed document reader for a specific collection and schema
 *
 * @example
 * ```typescript
 * const readCheckpoint = createDocumentReader(CheckpointDocumentSchema, 'checkpoints');
 *
 * // Later:
 * const result = await readCheckpoint(docSnapshot, 'cp_123');
 * ```
 */
export function createDocumentReader<T>(
  schema: ZodCompatibleSchema<T>,
  collection: string
): (doc: DocumentSnapshot<DocumentData>, docId: string) => ValidationResult<T> {
  return (doc, docId) => validateDocument(doc, schema, { collection, docId })
}
