/**
 * Run Usecases
 *
 * Pure business logic for agent run/execution operations.
 * Independent of UI framework and data layer.
 */

import type { RunRepository } from '../ports/runRepository'
import type { Run, RunId, CreateRunInput, WorkflowId, RunStatus } from '../domain/models'

/**
 * Create a new run (execution)
 */
export function createRunUsecase(runRepo: RunRepository) {
  return async (userId: string, input: CreateRunInput): Promise<Run> => {
    // Business rule: Goal must not be empty
    if (!input.goal.trim()) {
      throw new Error('Run goal is required')
    }

    return await runRepo.create(userId, input)
  }
}

/**
 * Update run status and progress
 */
export function updateRunUsecase(runRepo: RunRepository) {
  return async (
    userId: string,
    runId: RunId,
    updates: Partial<Omit<Run, 'runId' | 'userId' | 'workflowId'>>
  ): Promise<Run> => {
    return await runRepo.update(userId, runId, updates)
  }
}

/**
 * Get a single run
 */
export function getRunUsecase(runRepo: RunRepository) {
  return async (userId: string, runId: RunId): Promise<Run | null> => {
    return await runRepo.get(userId, runId)
  }
}

/**
 * List runs with optional filtering
 */
export function listRunsUsecase(runRepo: RunRepository) {
  return async (
    userId: string,
    options?: {
      workflowId?: WorkflowId
      status?: RunStatus
      limit?: number
    }
  ): Promise<Run[]> => {
    return await runRepo.list(userId, options)
  }
}

/**
 * Delete a run
 */
export function deleteRunUsecase(runRepo: RunRepository) {
  return async (userId: string, runId: RunId): Promise<void> => {
    await runRepo.delete(userId, runId)
  }
}
