/**
 * useWorkoutOperations Hook
 *
 * React wrapper for workout session and exercise library operations.
 * Manages UI state (loading, error) and delegates to repositories.
 * Note: Usecases layer for training module to be added in future iteration.
 */

import { useState, useCallback } from 'react'
import { useAuth } from './useAuth'
import { createFirestoreExerciseLibraryRepository } from '@/adapters/training/firestoreExerciseLibraryRepository'
import { createFirestoreWorkoutSessionRepository } from '@/adapters/training/firestoreWorkoutSessionRepository'
import type {
  ExerciseLibraryItem,
  ExerciseId,
  CreateExerciseInput,
  UpdateExerciseInput,
  ExerciseCategory,
  WorkoutSession,
  SessionId,
  CreateSessionInput,
  UpdateSessionInput,
  WorkoutContext,
} from '@lifeos/training'

export interface UseWorkoutOperationsReturn {
  exercises: ExerciseLibraryItem[]
  sessions: WorkoutSession[]
  isLoading: boolean
  error: Error | null

  // Exercise library operations
  createExercise: (input: Omit<CreateExerciseInput, 'userId'>) => Promise<ExerciseLibraryItem>
  updateExercise: (
    exerciseId: ExerciseId,
    updates: UpdateExerciseInput
  ) => Promise<ExerciseLibraryItem>
  deleteExercise: (exerciseId: ExerciseId) => Promise<void>
  getExercise: (exerciseId: ExerciseId) => Promise<ExerciseLibraryItem | null>
  listExercises: (options?: {
    category?: ExerciseCategory
    activeOnly?: boolean
  }) => Promise<ExerciseLibraryItem[]>

  // Workout session operations
  createSession: (input: Omit<CreateSessionInput, 'userId'>) => Promise<WorkoutSession>
  updateSession: (sessionId: SessionId, updates: UpdateSessionInput) => Promise<WorkoutSession>
  deleteSession: (sessionId: SessionId) => Promise<void>
  getSession: (sessionId: SessionId) => Promise<WorkoutSession | null>
  getSessionByDate: (dateKey: string) => Promise<WorkoutSession[]>
  getSessionByDateAndContext: (
    dateKey: string,
    context: WorkoutContext
  ) => Promise<WorkoutSession | null>
  listSessionsForDateRange: (startDate: string, endDate: string) => Promise<WorkoutSession[]>
}

const exerciseRepository = createFirestoreExerciseLibraryRepository()
const sessionRepository = createFirestoreWorkoutSessionRepository()

/**
 * Hook for managing workout sessions and exercise library
 * Thin wrapper around repositories - handles React state
 */
export function useWorkoutOperations(): UseWorkoutOperationsReturn {
  const { user } = useAuth()
  const [exercises, setExercises] = useState<ExerciseLibraryItem[]>([])
  const [sessions, setSessions] = useState<WorkoutSession[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const userId = user?.uid

  // ========== Exercise Library Operations ==========

  const createExercise = useCallback(
    async (
      input: Omit<CreateExerciseInput, 'userId'>
    ): Promise<ExerciseLibraryItem> => {
      if (!userId) throw new Error('User not authenticated')
      setIsLoading(true)
      setError(null)

      try {
        const exercise = await exerciseRepository.create(userId, {
          ...input,
          userId,
        })
        setExercises((prev) => [exercise, ...prev])
        return exercise
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to create exercise')
        setError(error)
        throw error
      } finally {
        setIsLoading(false)
      }
    },
    [userId]
  )

  const updateExercise = useCallback(
    async (
      exerciseId: ExerciseId,
      updates: UpdateExerciseInput
    ): Promise<ExerciseLibraryItem> => {
      if (!userId) throw new Error('User not authenticated')
      setIsLoading(true)
      setError(null)

      try {
        const updated = await exerciseRepository.update(userId, exerciseId, updates)
        setExercises((prev) => prev.map((e) => (e.exerciseId === exerciseId ? updated : e)))
        return updated
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to update exercise')
        setError(error)
        throw error
      } finally {
        setIsLoading(false)
      }
    },
    [userId]
  )

  const deleteExercise = useCallback(
    async (exerciseId: ExerciseId): Promise<void> => {
      if (!userId) throw new Error('User not authenticated')
      setIsLoading(true)
      setError(null)

      try {
        await exerciseRepository.delete(userId, exerciseId)
        setExercises((prev) => prev.filter((e) => e.exerciseId !== exerciseId))
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to delete exercise')
        setError(error)
        throw error
      } finally {
        setIsLoading(false)
      }
    },
    [userId]
  )

  const getExercise = useCallback(
    async (exerciseId: ExerciseId): Promise<ExerciseLibraryItem | null> => {
      if (!userId) throw new Error('User not authenticated')
      setIsLoading(true)
      setError(null)

      try {
        const exercise = await exerciseRepository.get(userId, exerciseId)
        return exercise
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to get exercise')
        setError(error)
        throw error
      } finally {
        setIsLoading(false)
      }
    },
    [userId]
  )

  const listExercises = useCallback(
    async (options?: {
      category?: ExerciseCategory
      activeOnly?: boolean
    }): Promise<ExerciseLibraryItem[]> => {
      if (!userId) throw new Error('User not authenticated')
      setIsLoading(true)
      setError(null)

      try {
        const exerciseList = await exerciseRepository.list(userId, options)
        setExercises(exerciseList)
        return exerciseList
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to list exercises')
        setError(error)
        throw error
      } finally {
        setIsLoading(false)
      }
    },
    [userId]
  )

  // ========== Workout Session Operations ==========

  const createSession = useCallback(
    async (input: Omit<CreateSessionInput, 'userId'>): Promise<WorkoutSession> => {
      if (!userId) throw new Error('User not authenticated')
      setIsLoading(true)
      setError(null)

      try {
        const session = await sessionRepository.create(userId, {
          ...input,
          userId,
        })
        setSessions((prev) => [session, ...prev])
        return session
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to create session')
        setError(error)
        throw error
      } finally {
        setIsLoading(false)
      }
    },
    [userId]
  )

  const updateSession = useCallback(
    async (sessionId: SessionId, updates: UpdateSessionInput): Promise<WorkoutSession> => {
      if (!userId) throw new Error('User not authenticated')
      setIsLoading(true)
      setError(null)

      try {
        const updated = await sessionRepository.update(userId, sessionId, updates)
        setSessions((prev) => prev.map((s) => (s.sessionId === sessionId ? updated : s)))
        return updated
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to update session')
        setError(error)
        throw error
      } finally {
        setIsLoading(false)
      }
    },
    [userId]
  )

  const deleteSession = useCallback(
    async (sessionId: SessionId): Promise<void> => {
      if (!userId) throw new Error('User not authenticated')
      setIsLoading(true)
      setError(null)

      try {
        await sessionRepository.delete(userId, sessionId)
        setSessions((prev) => prev.filter((s) => s.sessionId !== sessionId))
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to delete session')
        setError(error)
        throw error
      } finally {
        setIsLoading(false)
      }
    },
    [userId]
  )

  const getSession = useCallback(
    async (sessionId: SessionId): Promise<WorkoutSession | null> => {
      if (!userId) throw new Error('User not authenticated')
      setIsLoading(true)
      setError(null)

      try {
        const session = await sessionRepository.get(userId, sessionId)
        return session
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to get session')
        setError(error)
        throw error
      } finally {
        setIsLoading(false)
      }
    },
    [userId]
  )

  const getSessionByDate = useCallback(
    async (dateKey: string): Promise<WorkoutSession[]> => {
      if (!userId) throw new Error('User not authenticated')
      setIsLoading(true)
      setError(null)

      try {
        const sessionList = await sessionRepository.getByDate(userId, dateKey)
        return sessionList
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to get sessions by date')
        setError(error)
        throw error
      } finally {
        setIsLoading(false)
      }
    },
    [userId]
  )

  const getSessionByDateAndContext = useCallback(
    async (dateKey: string, context: WorkoutContext): Promise<WorkoutSession | null> => {
      if (!userId) throw new Error('User not authenticated')
      setIsLoading(true)
      setError(null)

      try {
        const session = await sessionRepository.getByDateAndContext(userId, dateKey, context)
        return session
      } catch (err) {
        const error =
          err instanceof Error ? err : new Error('Failed to get session by date and context')
        setError(error)
        throw error
      } finally {
        setIsLoading(false)
      }
    },
    [userId]
  )

  const listSessionsForDateRange = useCallback(
    async (startDate: string, endDate: string): Promise<WorkoutSession[]> => {
      if (!userId) throw new Error('User not authenticated')
      setIsLoading(true)
      setError(null)

      try {
        const sessionList = await sessionRepository.listForDateRange(userId, startDate, endDate)
        setSessions(sessionList)
        return sessionList
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to list sessions')
        setError(error)
        throw error
      } finally {
        setIsLoading(false)
      }
    },
    [userId]
  )

  return {
    exercises,
    sessions,
    isLoading,
    error,

    // Exercise library operations
    createExercise,
    updateExercise,
    deleteExercise,
    getExercise,
    listExercises,

    // Workout session operations
    createSession,
    updateSession,
    deleteSession,
    getSession,
    getSessionByDate,
    getSessionByDateAndContext,
    listSessionsForDateRange,
  }
}
