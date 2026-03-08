/**
 * Shared JSON Parser for LLM Output
 *
 * Consolidates JSON extraction logic used across multiple workflows
 * (Deep Research, Dialectical, Oracle). Handles markdown fences,
 * preamble text, and nested objects with optional Zod validation.
 */

import { type ZodType, type ZodError } from 'zod'
import { createLogger } from '../../lib/logger.js'

const log = createLogger('JsonParser')

export interface ParseResult<T> {
  data: T
  validationErrors?: ZodError
}

/**
 * Parse JSON from LLM output text with Zod schema validation.
 * Handles markdown fences, preamble text, nested objects.
 */
export function safeParseJsonWithSchema<T>(
  text: string,
  schema: ZodType<T>,
  fallback: T,
  context?: string
): ParseResult<T> {
  const raw = extractJson(text)
  if (raw === null) {
    log.warn('safeParseJsonWithSchema: no JSON found', { context, textLength: text.length })
    return { data: fallback }
  }
  const result = schema.safeParse(raw)
  if (!result.success) {
    log.warn('safeParseJsonWithSchema: schema validation failed', {
      context,
      errors: result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`),
    })
    return { data: fallback, validationErrors: result.error }
  }
  return { data: result.data }
}

/**
 * Backward-compatible wrapper. No schema validation.
 */
export function safeParseJson<T>(text: string): T | null {
  const raw = extractJson(text)
  return raw as T | null
}

/** Strip trailing commas before ] or } (common LLM JSON mistake) */
function stripTrailingCommas(json: string): string {
  return json.replace(/,\s*([}\]])/g, '$1')
}

function tryParse(json: string): unknown | null {
  try { return JSON.parse(json) } catch { /* ignore */ }
  try { return JSON.parse(stripTrailingCommas(json)) } catch { /* ignore */ }
  return null
}

function extractJson(text: string): unknown | null {
  // 1. Strip markdown fences
  const cleaned = text.replace(/```(?:json)?\s*([\s\S]*?)```/g, '$1').trim()

  // 2. Try regex extraction (object)
  const objMatch = cleaned.match(/\{[\s\S]*\}/)
  if (objMatch) {
    const result = tryParse(objMatch[0])
    if (result !== null) return result
  }

  // 3. Try regex extraction (array)
  const arrMatch = cleaned.match(/\[[\s\S]*\]/)
  if (arrMatch) {
    const result = tryParse(arrMatch[0])
    if (result !== null) return result
  }

  // 4. Try brace counting for nested objects
  const start = cleaned.indexOf('{')
  if (start >= 0) {
    let depth = 0
    for (let i = start; i < cleaned.length; i++) {
      if (cleaned[i] === '{') depth++
      else if (cleaned[i] === '}') depth--
      if (depth === 0) {
        const result = tryParse(cleaned.slice(start, i + 1))
        if (result !== null) return result
        break
      }
    }
  }

  return null
}
