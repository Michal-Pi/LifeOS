/**
 * Exercise Library Usecases
 *
 * Pure business logic for exercise library operations.
 * Independent of UI framework (React, Vue, etc.) and data layer (Firestore, SQL, etc.)
 */

import type { ExerciseLibraryRepository } from '../ports/exerciseLibraryRepository'
import type {
  ExerciseLibraryItem,
  ExerciseId,
  CreateExerciseInput,
  UpdateExerciseInput,
  ExerciseCategory,
} from '../domain/models'

/**
 * Create a new exercise with validation
 */
export function createExerciseUsecase(exerciseRepo: ExerciseLibraryRepository) {
  return async (
    userId: string,
    input: Omit<CreateExerciseInput, 'userId'>
  ): Promise<ExerciseLibraryItem> => {
    // Business rule: Exercise name must not be empty
    if (!input.name.trim()) {
      throw new Error('Exercise name is required')
    }

    // Business rule: Must have at least one default metric
    if (input.defaultMetrics.length === 0) {
      throw new Error('Exercise must have at least one default metric')
    }

    // Create with userId
    const fullInput: CreateExerciseInput = {
      ...input,
      userId,
    }

    return await exerciseRepo.create(userId, fullInput)
  }
}

/**
 * Update an existing exercise with validation
 */
export function updateExerciseUsecase(exerciseRepo: ExerciseLibraryRepository) {
  return async (
    userId: string,
    exerciseId: ExerciseId,
    updates: UpdateExerciseInput
  ): Promise<ExerciseLibraryItem> => {
    // Business rule: If updating name, ensure it's not empty
    if (updates.name !== undefined && !updates.name.trim()) {
      throw new Error('Exercise name cannot be empty')
    }

    // Business rule: If updating metrics, ensure at least one
    if (updates.defaultMetrics !== undefined && updates.defaultMetrics.length === 0) {
      throw new Error('Exercise must have at least one default metric')
    }

    return await exerciseRepo.update(userId, exerciseId, updates)
  }
}

/**
 * Delete an exercise (soft delete - archives it)
 */
export function deleteExerciseUsecase(exerciseRepo: ExerciseLibraryRepository) {
  return async (userId: string, exerciseId: ExerciseId): Promise<void> => {
    await exerciseRepo.delete(userId, exerciseId)
  }
}

/**
 * Get a single exercise
 */
export function getExerciseUsecase(exerciseRepo: ExerciseLibraryRepository) {
  return async (userId: string, exerciseId: ExerciseId): Promise<ExerciseLibraryItem | null> => {
    return await exerciseRepo.get(userId, exerciseId)
  }
}

/**
 * List exercises with optional filtering
 */
export function listExercisesUsecase(exerciseRepo: ExerciseLibraryRepository) {
  return async (
    userId: string,
    options?: { category?: ExerciseCategory; activeOnly?: boolean }
  ): Promise<ExerciseLibraryItem[]> => {
    return await exerciseRepo.list(userId, options)
  }
}
