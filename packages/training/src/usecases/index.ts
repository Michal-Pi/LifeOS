/**
 * Training Usecases
 *
 * Pure business logic for training operations.
 * Barrel export for all usecase functions.
 */

// Exercise Library Usecases
export {
  createExerciseUsecase,
  updateExerciseUsecase,
  deleteExerciseUsecase,
  getExerciseUsecase,
  listExercisesUsecase,
} from './exerciseUsecases'

// Workout Session Usecases
export {
  createSessionUsecase,
  updateSessionUsecase,
  deleteSessionUsecase,
  getSessionUsecase,
  getSessionsByDateUsecase,
  getSessionByDateAndContextUsecase,
  listSessionsForDateRangeUsecase,
  calculateWorkoutStats,
} from './sessionUsecases'
