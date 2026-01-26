/**
 * useExerciseLibrary Hook
 *
 * React wrapper around exercise library operations with offline-first repository.
 */

import { useState, useCallback, useMemo } from 'react'
import { useAuth } from './useAuth'
import { useTrainingSync } from './useTrainingSync'
import { createIndexedDbExerciseLibraryRepository } from '@/adapters/training/indexedDbExerciseLibraryRepository'
import {
  createExerciseUsecase,
  updateExerciseUsecase,
  deleteExerciseUsecase,
  getExerciseUsecase,
  listExercisesUsecase,
} from '@lifeos/training'
import type {
  ExerciseLibraryItem,
  ExerciseId,
  CreateExerciseInput,
  UpdateExerciseInput,
  ExerciseCategory,
} from '@lifeos/training'

const exerciseRepository = createIndexedDbExerciseLibraryRepository()

export interface UseExerciseLibraryReturn {
  exercises: ExerciseLibraryItem[]
  isLoading: boolean
  error: Error | null

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
}

export function useExerciseLibrary(): UseExerciseLibraryReturn {
  const { user } = useAuth()
  useTrainingSync()

  const [exercises, setExercises] = useState<ExerciseLibraryItem[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const userId = user?.uid

  const usecases = useMemo(
    () => ({
      createExercise: createExerciseUsecase(exerciseRepository),
      updateExercise: updateExerciseUsecase(exerciseRepository),
      deleteExercise: deleteExerciseUsecase(exerciseRepository),
      getExercise: getExerciseUsecase(exerciseRepository),
      listExercises: listExercisesUsecase(exerciseRepository),
    }),
    []
  )

  const createExercise = useCallback(
    async (input: Omit<CreateExerciseInput, 'userId'>): Promise<ExerciseLibraryItem> => {
      if (!userId) throw new Error('User not authenticated')
      setIsLoading(true)
      setError(null)

      try {
        const exercise = await usecases.createExercise(userId, input)
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
    [userId, usecases]
  )

  const updateExercise = useCallback(
    async (exerciseId: ExerciseId, updates: UpdateExerciseInput): Promise<ExerciseLibraryItem> => {
      if (!userId) throw new Error('User not authenticated')
      setIsLoading(true)
      setError(null)

      try {
        const updated = await usecases.updateExercise(userId, exerciseId, updates)
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
    [userId, usecases]
  )

  const deleteExercise = useCallback(
    async (exerciseId: ExerciseId): Promise<void> => {
      if (!userId) throw new Error('User not authenticated')
      setIsLoading(true)
      setError(null)

      try {
        await usecases.deleteExercise(userId, exerciseId)
        setExercises((prev) => prev.filter((e) => e.exerciseId !== exerciseId))
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to delete exercise')
        setError(error)
        throw error
      } finally {
        setIsLoading(false)
      }
    },
    [userId, usecases]
  )

  const getExercise = useCallback(
    async (exerciseId: ExerciseId): Promise<ExerciseLibraryItem | null> => {
      if (!userId) throw new Error('User not authenticated')
      setIsLoading(true)
      setError(null)

      try {
        return await usecases.getExercise(userId, exerciseId)
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to get exercise')
        setError(error)
        throw error
      } finally {
        setIsLoading(false)
      }
    },
    [userId, usecases]
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
        const exerciseList = await usecases.listExercises(userId, options)
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
    [userId, usecases]
  )

  return {
    exercises,
    isLoading,
    error,
    createExercise,
    updateExercise,
    deleteExercise,
    getExercise,
    listExercises,
  }
}
