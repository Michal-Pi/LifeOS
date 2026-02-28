/**
 * Input Parameter Validation Utilities
 *
 * Provides validation for function parameters at entry points.
 * Ensures invalid data doesn't propagate through the system.
 */

import { z } from 'zod'

// ----- Common Parameter Schemas -----

/**
 * User ID validation (Firestore document ID constraints)
 */
export const UserIdSchema = z
  .string()
  .min(1, 'User ID cannot be empty')
  .max(128, 'User ID too long')
  .regex(/^[a-zA-Z0-9_-]+$/, 'User ID contains invalid characters')

/**
 * UUID validation for run IDs, workflow IDs, etc.
 */
export const UuidSchema = z.string().uuid('Invalid UUID format')

/**
 * Run ID validation
 */
export const RunIdSchema = UuidSchema

/**
 * Workflow ID validation
 */
export const WorkflowIdSchema = UuidSchema

/**
 * Agent ID validation
 */
export const AgentIdSchema = UuidSchema

/**
 * Thread ID validation (for LangGraph checkpointing)
 */
export const ThreadIdSchema = z
  .string()
  .min(1, 'Thread ID cannot be empty')
  .max(256, 'Thread ID too long')

// ----- Validation Error -----

/**
 * Custom error for parameter validation failures
 */
export class ParameterValidationError extends Error {
  readonly functionName: string
  readonly parameterName: string
  readonly issues: z.ZodIssue[]

  constructor(functionName: string, parameterName: string, issues: z.ZodIssue[]) {
    const messages = issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
    super(`${functionName}: Invalid parameter '${parameterName}': ${messages}`)
    this.name = 'ParameterValidationError'
    this.functionName = functionName
    this.parameterName = parameterName
    this.issues = issues
  }
}

// ----- Validation Functions -----

/**
 * Validate a single parameter against a Zod schema
 *
 * @throws ParameterValidationError if validation fails
 *
 * @example
 * ```typescript
 * function executeWorkflow(userId: string, workflowId: string) {
 *   const validUserId = validateParam(userId, UserIdSchema, 'executeWorkflow', 'userId');
 *   const validWorkflowId = validateParam(workflowId, WorkflowIdSchema, 'executeWorkflow', 'workflowId');
 *   // ...
 * }
 * ```
 */
export function validateParam<T>(
  value: unknown,
  schema: z.ZodSchema<T>,
  functionName: string,
  parameterName: string
): T {
  const result = schema.safeParse(value)
  if (!result.success) {
    throw new ParameterValidationError(functionName, parameterName, result.error.issues)
  }
  return result.data
}

/**
 * Validate multiple parameters at once
 *
 * @example
 * ```typescript
 * function executeRun(userId: string, workflowId: string, runId: string) {
 *   const params = validateParams(
 *     { userId, workflowId, runId },
 *     z.object({
 *       userId: UserIdSchema,
 *       workflowId: WorkflowIdSchema,
 *       runId: RunIdSchema,
 *     }),
 *     'executeRun'
 *   );
 *   // params is fully typed
 * }
 * ```
 */
export function validateParams<T>(
  params: unknown,
  schema: z.ZodSchema<T>,
  functionName: string
): T {
  const result = schema.safeParse(params)
  if (!result.success) {
    throw new ParameterValidationError(functionName, 'params', result.error.issues)
  }
  return result.data
}

/**
 * Validate and return result or null (non-throwing variant)
 */
export function validateParamOrNull<T>(value: unknown, schema: z.ZodSchema<T>): T | null {
  const result = schema.safeParse(value)
  return result.success ? result.data : null
}

// ----- Composite Schemas -----

/**
 * Schema for workflow execution context IDs
 */
export const WorkflowContextIdsSchema = z.object({
  userId: UserIdSchema,
  workflowId: WorkflowIdSchema,
  runId: RunIdSchema,
})

/**
 * Schema for graph config (used in LangGraph)
 */
export const GraphConfigSchema = z.object({
  userId: UserIdSchema,
  workflowId: WorkflowIdSchema,
  runId: RunIdSchema,
  enableCheckpointing: z.boolean().optional(),
  maxIterations: z.number().int().positive().max(100).optional(),
})

/**
 * Schema for telemetry parameters
 */
export const TelemetryParamsSchema = z.object({
  userId: UserIdSchema,
  runId: RunIdSchema.optional(),
  workflowId: WorkflowIdSchema.optional(),
  limit: z.number().int().positive().max(1000).optional(),
})

/**
 * Schema for evaluation parameters
 */
export const EvaluationParamsSchema = z.object({
  userId: UserIdSchema,
  runId: RunIdSchema,
  rubricId: z.string().min(1).optional(),
})
