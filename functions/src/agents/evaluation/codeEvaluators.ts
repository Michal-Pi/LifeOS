/**
 * Code-Based Evaluators
 *
 * Fast, deterministic checks that run before LLM-as-Judge.
 * These catch format/structure issues quickly and cheaply.
 */

import { getFirestore } from 'firebase-admin/firestore'
import type {
  CodeEvaluator,
  CodeEvaluatorId,
  CodeEvalResult,
  CodeEvalResultId,
  CodeCheckType,
} from '@lifeos/agents'
import type { RunId } from '@lifeos/agents'
import { randomUUID } from 'crypto'

// ----- Collection Paths -----

const EVALUATION_COLLECTION = 'evaluation'
const CODE_EVALUATORS_SUBCOLLECTION = 'codeEvaluators'
const CODE_EVAL_RESULTS_SUBCOLLECTION = 'codeEvalResults'

function getCodeEvaluatorsPath(userId: string): string {
  return `users/${userId}/${EVALUATION_COLLECTION}/${CODE_EVALUATORS_SUBCOLLECTION}`
}

function getCodeEvalResultsPath(userId: string): string {
  return `users/${userId}/${EVALUATION_COLLECTION}/${CODE_EVAL_RESULTS_SUBCOLLECTION}`
}

// ----- PII Patterns -----

const DEFAULT_PII_PATTERNS = [
  // Email
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/,
  // Phone numbers (various formats)
  /\b(?:\+?1[-.]?)?\(?[0-9]{3}\)?[-.]?[0-9]{3}[-.]?[0-9]{4}\b/,
  // SSN
  /\b[0-9]{3}[-]?[0-9]{2}[-]?[0-9]{4}\b/,
  // Credit card (basic)
  /\b[0-9]{4}[-\s]?[0-9]{4}[-\s]?[0-9]{4}[-\s]?[0-9]{4}\b/,
  // IP addresses
  /\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b/,
]

// ----- Evaluator CRUD -----

/**
 * Create a code evaluator
 */
export async function createCodeEvaluator(
  userId: string,
  input: Omit<CodeEvaluator, 'evaluatorId' | 'userId' | 'createdAtMs' | 'updatedAtMs'>
): Promise<CodeEvaluator> {
  const db = getFirestore()
  const evaluatorId = randomUUID() as CodeEvaluatorId
  const now = Date.now()

  const evaluator: CodeEvaluator = {
    ...input,
    evaluatorId,
    userId,
    createdAtMs: now,
    updatedAtMs: now,
  }

  await db.doc(`${getCodeEvaluatorsPath(userId)}/${evaluatorId}`).set(evaluator)

  return evaluator
}

/**
 * Get a code evaluator by ID
 */
export async function getCodeEvaluator(
  userId: string,
  evaluatorId: CodeEvaluatorId
): Promise<CodeEvaluator | null> {
  const db = getFirestore()
  const doc = await db.doc(`${getCodeEvaluatorsPath(userId)}/${evaluatorId}`).get()

  if (!doc.exists) return null
  return doc.data() as CodeEvaluator
}

/**
 * List code evaluators
 */
export async function listCodeEvaluators(
  userId: string,
  filters?: {
    checkType?: CodeCheckType
    workflowType?: string
    isActive?: boolean
  }
): Promise<CodeEvaluator[]> {
  const db = getFirestore()
  let query: FirebaseFirestore.Query = db.collection(getCodeEvaluatorsPath(userId))

  if (filters?.checkType) {
    query = query.where('checkType', '==', filters.checkType)
  }

  if (filters?.isActive !== undefined) {
    query = query.where('isActive', '==', filters.isActive)
  }

  const snapshot = await query.get()
  let evaluators = snapshot.docs.map((doc) => doc.data() as CodeEvaluator)

  // Filter by workflow type (array contains)
  if (filters?.workflowType) {
    evaluators = evaluators.filter(
      (e) =>
        !e.workflowTypes ||
        e.workflowTypes.length === 0 ||
        e.workflowTypes.includes(filters.workflowType!)
    )
  }

  return evaluators
}

/**
 * Update a code evaluator
 */
export async function updateCodeEvaluator(
  userId: string,
  evaluatorId: CodeEvaluatorId,
  updates: Partial<Omit<CodeEvaluator, 'evaluatorId' | 'userId' | 'createdAtMs'>>
): Promise<CodeEvaluator> {
  const db = getFirestore()
  const evaluator = await getCodeEvaluator(userId, evaluatorId)

  if (!evaluator) {
    throw new Error(`Code evaluator ${evaluatorId} not found`)
  }

  const updated = {
    ...evaluator,
    ...updates,
    updatedAtMs: Date.now(),
  }

  await db.doc(`${getCodeEvaluatorsPath(userId)}/${evaluatorId}`).set(updated)

  return updated
}

/**
 * Delete a code evaluator
 */
export async function deleteCodeEvaluator(
  userId: string,
  evaluatorId: CodeEvaluatorId
): Promise<void> {
  const db = getFirestore()
  await db.doc(`${getCodeEvaluatorsPath(userId)}/${evaluatorId}`).delete()
}

// ----- Check Implementations -----

/**
 * Check if content is valid JSON
 */
function checkJsonValid(content: string): { passed: boolean; failureReason?: string } {
  try {
    JSON.parse(content)
    return { passed: true }
  } catch {
    return { passed: false, failureReason: 'Content is not valid JSON' }
  }
}

/**
 * Check if content matches a JSON schema
 */
function checkSchemaMatch(
  content: string,
  params: { schema: Record<string, unknown> }
): { passed: boolean; failureReason?: string } {
  try {
    const parsed = JSON.parse(content)
    // Basic schema validation (required fields check)
    // For full JSON Schema validation, would need ajv or similar
    const schema = params.schema as { required?: string[]; properties?: Record<string, unknown> }

    if (schema.required) {
      for (const field of schema.required) {
        if (!(field in parsed)) {
          return { passed: false, failureReason: `Missing required field: ${field}` }
        }
      }
    }

    return { passed: true }
  } catch {
    return { passed: false, failureReason: 'Content is not valid JSON' }
  }
}

/**
 * Check if content contains required fields
 */
function checkContainsField(
  content: string,
  params: { fields: string[]; mode: 'all' | 'any' }
): { passed: boolean; failureReason?: string; matchedContent?: string } {
  try {
    const parsed = JSON.parse(content)
    const found: string[] = []
    const missing: string[] = []

    for (const field of params.fields) {
      // Support nested fields with dot notation
      const parts = field.split('.')
      let value: unknown = parsed
      let exists = true

      for (const part of parts) {
        if (value && typeof value === 'object' && part in value) {
          value = (value as Record<string, unknown>)[part]
        } else {
          exists = false
          break
        }
      }

      if (exists) {
        found.push(field)
      } else {
        missing.push(field)
      }
    }

    if (params.mode === 'all') {
      if (missing.length > 0) {
        return { passed: false, failureReason: `Missing required fields: ${missing.join(', ')}` }
      }
      return { passed: true }
    } else {
      if (found.length === 0) {
        return {
          passed: false,
          failureReason: `None of the fields found: ${params.fields.join(', ')}`,
        }
      }
      return { passed: true, matchedContent: found.join(', ') }
    }
  } catch {
    // Try as plain text
    const found: string[] = []
    for (const field of params.fields) {
      if (content.includes(field)) {
        found.push(field)
      }
    }

    if (params.mode === 'all') {
      if (found.length !== params.fields.length) {
        return { passed: false, failureReason: `Not all fields found in content` }
      }
      return { passed: true }
    } else {
      if (found.length === 0) {
        return { passed: false, failureReason: `None of the fields found` }
      }
      return { passed: true, matchedContent: found.join(', ') }
    }
  }
}

/**
 * Check if content length is within range
 */
function checkLengthRange(
  content: string,
  params: { minLength?: number; maxLength?: number }
): { passed: boolean; failureReason?: string } {
  const length = content.length

  if (params.minLength !== undefined && length < params.minLength) {
    return { passed: false, failureReason: `Content too short: ${length} < ${params.minLength}` }
  }

  if (params.maxLength !== undefined && length > params.maxLength) {
    return { passed: false, failureReason: `Content too long: ${length} > ${params.maxLength}` }
  }

  return { passed: true }
}

/**
 * Check if content matches (or doesn't match) a regex
 */
function checkRegexMatch(
  content: string,
  params: { pattern: string; flags?: string; shouldMatch: boolean }
): { passed: boolean; failureReason?: string; matchedContent?: string } {
  const regex = new RegExp(params.pattern, params.flags)
  const matches = content.match(regex)

  if (params.shouldMatch) {
    if (!matches) {
      return { passed: false, failureReason: `Pattern not found: ${params.pattern}` }
    }
    return { passed: true, matchedContent: matches[0] }
  } else {
    if (matches) {
      return {
        passed: false,
        failureReason: `Forbidden pattern found: ${matches[0]}`,
        matchedContent: matches[0],
      }
    }
    return { passed: true }
  }
}

/**
 * Check for PII in content
 */
function checkNoPII(
  content: string,
  params: { patterns?: string[] }
): { passed: boolean; failureReason?: string; matchedContent?: string } {
  const patterns = params.patterns
    ? params.patterns.map((p) => new RegExp(p))
    : DEFAULT_PII_PATTERNS

  for (const pattern of patterns) {
    const matches = content.match(pattern)
    if (matches) {
      return {
        passed: false,
        failureReason: 'Potential PII detected',
        matchedContent: matches[0],
      }
    }
  }

  return { passed: true }
}

/**
 * Check for URLs in content
 */
function checkNoUrls(
  content: string,
  params: { allowInternal?: boolean }
): { passed: boolean; failureReason?: string; matchedContent?: string } {
  const urlPattern = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi
  const matches = content.match(urlPattern)

  if (!matches) {
    return { passed: true }
  }

  if (params.allowInternal) {
    // Filter out internal URLs (would need to define what "internal" means for the app)
    const externalUrls = matches.filter(
      (url) => !url.includes('localhost') && !url.includes('127.0.0.1')
    )
    if (externalUrls.length === 0) {
      return { passed: true }
    }
    return { passed: false, failureReason: `External URLs found`, matchedContent: externalUrls[0] }
  }

  return { passed: false, failureReason: `URLs found`, matchedContent: matches[0] }
}

/**
 * Check format compliance
 */
function checkFormatCompliance(
  content: string,
  params: { format: 'markdown' | 'json' | 'yaml' }
): { passed: boolean; failureReason?: string } {
  switch (params.format) {
    case 'json':
      return checkJsonValid(content)

    case 'markdown': {
      // Basic markdown checks - has some structure
      const hasHeaders = /^#+\s/m.test(content)
      const hasLists = /^[-*]\s/m.test(content) || /^\d+\.\s/m.test(content)
      const hasFormatting = /[*_`[\]]/.test(content)

      if (!hasHeaders && !hasLists && !hasFormatting) {
        return { passed: false, failureReason: 'Content does not appear to be formatted markdown' }
      }
      return { passed: true }
    }

    case 'yaml': {
      // Basic YAML check - has key: value structure
      const hasKeyValue = /^[a-zA-Z_][a-zA-Z0-9_]*:\s/m.test(content)
      if (!hasKeyValue) {
        return { passed: false, failureReason: 'Content does not appear to be valid YAML' }
      }
      return { passed: true }
    }

    default:
      return { passed: true }
  }
}

// ----- Run Evaluator -----

/**
 * Run a single code evaluator on content
 */
export function runCodeEvaluator(
  evaluator: CodeEvaluator,
  content: string
): { passed: boolean; failureReason?: string; matchedContent?: string } {
  switch (evaluator.checkType) {
    case 'json_valid':
      return checkJsonValid(content)

    case 'schema_match':
      return checkSchemaMatch(content, evaluator.params as { schema: Record<string, unknown> })

    case 'contains_field':
      return checkContainsField(
        content,
        evaluator.params as { fields: string[]; mode: 'all' | 'any' }
      )

    case 'length_range':
      return checkLengthRange(
        content,
        evaluator.params as { minLength?: number; maxLength?: number }
      )

    case 'regex_match':
      return checkRegexMatch(
        content,
        evaluator.params as { pattern: string; flags?: string; shouldMatch: boolean }
      )

    case 'no_pii':
      return checkNoPII(content, evaluator.params as { patterns?: string[] })

    case 'no_urls':
      return checkNoUrls(content, evaluator.params as { allowInternal?: boolean })

    case 'format_compliance':
      return checkFormatCompliance(
        content,
        evaluator.params as { format: 'markdown' | 'json' | 'yaml' }
      )

    case 'custom':
      // Custom evaluators would need sandboxed execution
      // For safety, we skip them here
      return { passed: true }

    default:
      return { passed: true }
  }
}

/**
 * Run multiple code evaluators on content and record results
 */
export async function runCodeEvaluators(
  userId: string,
  runId: RunId,
  content: string,
  workflowType: string
): Promise<CodeEvalResult[]> {
  const db = getFirestore()
  const evaluators = await listCodeEvaluators(userId, { workflowType, isActive: true })
  const results: CodeEvalResult[] = []

  for (const evaluator of evaluators) {
    const startMs = Date.now()
    const evalResult = runCodeEvaluator(evaluator, content)
    const executionMs = Date.now() - startMs

    const resultId = randomUUID() as CodeEvalResultId

    const result: CodeEvalResult = {
      codeEvalResultId: resultId,
      evaluatorId: evaluator.evaluatorId,
      runId,
      userId,
      passed: evalResult.passed,
      failureReason: evalResult.failureReason,
      matchedContent: evalResult.matchedContent,
      executionMs,
      createdAtMs: Date.now(),
    }

    await db.doc(`${getCodeEvalResultsPath(userId)}/${resultId}`).set(result)
    results.push(result)
  }

  return results
}

/**
 * Get code eval results for a run
 */
export async function getCodeEvalResultsByRun(
  userId: string,
  runId: RunId
): Promise<CodeEvalResult[]> {
  const db = getFirestore()
  const snapshot = await db
    .collection(getCodeEvalResultsPath(userId))
    .where('runId', '==', runId)
    .get()

  return snapshot.docs.map((doc) => doc.data() as CodeEvalResult)
}

/**
 * Check if all code evals passed for a run
 */
export async function allCodeEvalsPassed(
  userId: string,
  runId: RunId
): Promise<{ passed: boolean; failures: CodeEvalResult[] }> {
  const results = await getCodeEvalResultsByRun(userId, runId)
  const failures = results.filter((r) => !r.passed)

  return {
    passed: failures.length === 0,
    failures,
  }
}

// ----- Default Evaluators -----

/**
 * Create default code evaluators for a user
 */
export async function createDefaultCodeEvaluators(userId: string): Promise<CodeEvaluator[]> {
  const defaults: Array<
    Omit<CodeEvaluator, 'evaluatorId' | 'userId' | 'createdAtMs' | 'updatedAtMs'>
  > = [
    {
      name: 'JSON Valid',
      description: 'Checks if output is valid JSON',
      checkType: 'json_valid',
      params: {},
      failureMessage: 'Output is not valid JSON',
      severity: 'error',
      isActive: true,
    },
    {
      name: 'Has Sources',
      description: 'Checks if research output contains sources',
      checkType: 'contains_field',
      params: { fields: ['sources', 'references', 'citations'], mode: 'any' },
      failureMessage: 'Research output missing sources',
      severity: 'warning',
      workflowTypes: ['deep_research'],
      isActive: true,
    },
    {
      name: 'Has Synthesis',
      description: 'Checks if dialectical output contains synthesis',
      checkType: 'contains_field',
      params: { fields: ['synthesis', 'sublation', 'resolution'], mode: 'any' },
      failureMessage: 'Dialectical output missing synthesis',
      severity: 'warning',
      workflowTypes: ['dialectical'],
      isActive: true,
    },
    {
      name: 'No PII',
      description: 'Checks for potential PII in output',
      checkType: 'no_pii',
      params: {},
      failureMessage: 'Potential PII detected in output',
      severity: 'error',
      isActive: true,
    },
    {
      name: 'Length Check',
      description: 'Ensures output has reasonable length',
      checkType: 'length_range',
      params: { minLength: 50, maxLength: 50000 },
      failureMessage: 'Output length out of acceptable range',
      severity: 'warning',
      isActive: true,
    },
  ]

  const evaluators: CodeEvaluator[] = []
  for (const def of defaults) {
    const evaluator = await createCodeEvaluator(userId, def)
    evaluators.push(evaluator)
  }

  return evaluators
}
