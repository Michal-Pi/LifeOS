import type {
  ExerciseLibraryItem,
  ExerciseId,
  CreateExerciseInput,
  UpdateExerciseInput,
  ExerciseCategory,
} from '../domain/models'

export interface ExerciseLibraryRepository {
  create(userId: string, input: CreateExerciseInput): Promise<ExerciseLibraryItem>
  update(
    userId: string,
    exerciseId: ExerciseId,
    updates: UpdateExerciseInput
  ): Promise<ExerciseLibraryItem>
  delete(userId: string, exerciseId: ExerciseId): Promise<void>
  get(userId: string, exerciseId: ExerciseId): Promise<ExerciseLibraryItem | null>
  list(
    userId: string,
    options?: { category?: ExerciseCategory; activeOnly?: boolean }
  ): Promise<ExerciseLibraryItem[]>
}
