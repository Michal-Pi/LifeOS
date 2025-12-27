/**
 * Intervention Usecases
 *
 * Pure business logic for mind intervention operations.
 * Simplified version that matches existing repository interfaces.
 */

import type { InterventionRepository } from '../ports/interventionRepository'
import type { SessionRepository } from '../ports/sessionRepository'
import type {
  CanonicalInterventionPreset,
  CanonicalInterventionSession,
  InterventionId,
  SessionId,
  CreateInterventionInput,
  UpdateInterventionInput,
  CreateSessionInput,
  CompleteSessionInput,
} from '../domain/models'

/**
 * Create a new intervention preset with validation
 */
export function createInterventionUsecase(interventionRepo: InterventionRepository) {
  return async (
    userId: string,
    input: Omit<CreateInterventionInput, 'userId'>
  ): Promise<CanonicalInterventionPreset> => {
    // Business rule: Must have at least one step
    if (input.steps.length === 0) {
      throw new Error('Intervention must have at least one step')
    }

    // Business rule: Title must not be empty
    if (!input.title.trim()) {
      throw new Error('Intervention title is required')
    }

    const fullInput: CreateInterventionInput = {
      ...input,
      userId,
    }

    return await interventionRepo.create(userId, fullInput)
  }
}

/**
 * Update an existing intervention preset
 */
export function updateInterventionUsecase(interventionRepo: InterventionRepository) {
  return async (
    userId: string,
    interventionId: InterventionId,
    updates: UpdateInterventionInput
  ): Promise<CanonicalInterventionPreset> => {
    return await interventionRepo.update(userId, interventionId, updates)
  }
}

/**
 * Delete an intervention preset
 */
export function deleteInterventionUsecase(interventionRepo: InterventionRepository) {
  return async (userId: string, interventionId: InterventionId): Promise<void> => {
    await interventionRepo.delete(userId, interventionId)
  }
}

/**
 * Start a new intervention session
 */
export function startSessionUsecase(sessionRepo: SessionRepository) {
  return async (
    userId: string,
    input: Omit<CreateSessionInput, 'userId'>
  ): Promise<CanonicalInterventionSession> => {
    const fullInput: CreateSessionInput = {
      ...input,
      userId,
    }

    return await sessionRepo.create(userId, fullInput)
  }
}

/**
 * Complete an intervention session
 */
export function completeSessionUsecase(sessionRepo: SessionRepository) {
  return async (
    userId: string,
    sessionId: SessionId,
    input: CompleteSessionInput
  ): Promise<CanonicalInterventionSession> => {
    return await sessionRepo.complete(userId, sessionId, input)
  }
}
