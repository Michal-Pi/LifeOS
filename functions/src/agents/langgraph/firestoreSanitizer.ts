/**
 * Firestore Sanitizer
 *
 * Recursively sanitizes objects for Firestore compatibility.
 * Firestore rejects: undefined, NaN, Infinity, functions, symbols, class instances,
 * and documents with excessive nesting depth.
 */

import { createLogger } from '../../lib/logger.js'

const log = createLogger('FirestoreSanitizer')

const MAX_DEPTH = 15
const MAX_STRING_LENGTH = 50_000

/**
 * Recursively sanitize an object for Firestore storage.
 *
 * - Converts `undefined` to `null`
 * - Converts `NaN` / `Infinity` to `null`
 * - Strips functions, symbols, and non-plain objects
 * - Caps nesting depth at MAX_DEPTH (returns "[depth limit]" beyond that)
 * - Truncates strings longer than MAX_STRING_LENGTH
 */
export function sanitizeForFirestore(obj: unknown, depth = 0): unknown {
  // Depth guard
  if (depth > MAX_DEPTH) {
    return '[depth limit exceeded]'
  }

  // Primitives
  if (obj === null || obj === undefined) return null
  if (typeof obj === 'boolean') return obj
  if (typeof obj === 'string') {
    return obj.length > MAX_STRING_LENGTH
      ? obj.slice(0, MAX_STRING_LENGTH) + '...[truncated]'
      : obj
  }
  if (typeof obj === 'number') {
    return Number.isFinite(obj) ? obj : null
  }

  // Non-serializable types
  if (typeof obj === 'function' || typeof obj === 'symbol' || typeof obj === 'bigint') {
    return null
  }

  // Date → ISO string (Firestore supports Timestamps, but ISO strings are safer for nested objects)
  if (obj instanceof Date) {
    return obj.toISOString()
  }

  // Arrays
  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeForFirestore(item, depth + 1))
  }

  // Plain objects only (reject class instances like Map, Set, RegExp, etc.)
  if (typeof obj === 'object') {
    const proto = Object.getPrototypeOf(obj)
    if (proto !== null && proto !== Object.prototype) {
      // Not a plain object — try to convert to a plain representation
      if (obj instanceof Map) {
        const plain: Record<string, unknown> = {}
        for (const [k, v] of obj) {
          if (typeof k === 'string') {
            plain[k] = sanitizeForFirestore(v, depth + 1)
          }
        }
        return plain
      }
      if (obj instanceof Set) {
        return Array.from(obj).map((item) => sanitizeForFirestore(item, depth + 1))
      }
      // Other class instances — drop them
      return null
    }

    const result: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(obj)) {
      // Skip undefined values entirely (Firestore rejects them)
      if (value !== undefined) {
        result[key] = sanitizeForFirestore(value, depth + 1)
      }
    }
    return result
  }

  return null
}

/**
 * Sanitize a top-level object and log a warning if anything was modified.
 * Returns the sanitized copy.
 */
export function sanitizeWithWarning(obj: unknown, context: string): unknown {
  const original = JSON.stringify(obj)
  const sanitized = sanitizeForFirestore(obj)
  const sanitizedStr = JSON.stringify(sanitized)

  if (original !== sanitizedStr) {
    log.warn('Object was sanitized for Firestore compatibility', {
      context,
      originalLength: original?.length ?? 0,
      sanitizedLength: sanitizedStr?.length ?? 0,
    })
  }

  return sanitized
}
