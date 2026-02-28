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
  ExerciseTypeCategory,
} from '../domain/models'

/**
 * Create a new exercise with validation
 */
export function createExerciseUsecase(exerciseRepo: ExerciseLibraryRepository) {
  return async (
    userId: string,
    input: Omit<CreateExerciseInput, 'userId'>
  ): Promise<ExerciseLibraryItem> => {
    // Business rule: Exercise generic_name must not be empty
    if (!input.generic_name.trim()) {
      throw new Error('Exercise name is required')
    }

    // Business rule: Must have a target muscle group
    const targetMuscle = input.target_muscle_group
    const hasTargetMuscle = Array.isArray(targetMuscle)
      ? targetMuscle.length > 0
      : typeof targetMuscle === 'string' && targetMuscle.trim().length > 0
    if (!hasTargetMuscle) {
      throw new Error('Exercise must have at least one target muscle group')
    }

    // Business rule: Must have a valid category
    if (!input.category) {
      throw new Error('Exercise category is required')
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
    // Business rule: If updating generic_name, ensure it's not empty
    if (updates.generic_name !== undefined && !updates.generic_name.trim()) {
      throw new Error('Exercise name cannot be empty')
    }

    // Business rule: If updating target_muscle_group, ensure at least one
    if (updates.target_muscle_group !== undefined) {
      const targetMuscle = updates.target_muscle_group
      const hasTargetMuscle = Array.isArray(targetMuscle)
        ? targetMuscle.length > 0
        : typeof targetMuscle === 'string' && targetMuscle.trim().length > 0
      if (!hasTargetMuscle) {
        throw new Error('Exercise must have at least one target muscle group')
      }
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
    options?: {
      category?: ExerciseTypeCategory
      legacyCategory?: ExerciseCategory // For backwards compatibility
      activeOnly?: boolean
    }
  ): Promise<ExerciseLibraryItem[]> => {
    return await exerciseRepo.list(userId, options)
  }
}
