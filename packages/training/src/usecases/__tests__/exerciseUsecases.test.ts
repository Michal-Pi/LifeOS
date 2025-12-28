import { describe, it, expect, vi } from 'vitest'
import {
  createExerciseUsecase,
  updateExerciseUsecase,
  deleteExerciseUsecase,
  getExerciseUsecase,
  listExercisesUsecase,
} from '../exerciseUsecases'
import type { ExerciseLibraryRepository } from '../../ports/exerciseLibraryRepository'
import type { CreateExerciseInput, ExerciseLibraryItem } from '../../domain/models'

describe('exerciseUsecases', () => {
  describe('createExerciseUsecase', () => {
    it('validates exercise name is not empty', async () => {
      const mockRepo: ExerciseLibraryRepository = {
        create: vi.fn(),
      } as any

      const usecase = createExerciseUsecase(mockRepo)

      const input: Omit<CreateExerciseInput, 'userId'> = {
        name: '   ', // Empty!
        category: 'push',
        equipment: ['barbell', 'bench'],
        defaultMetrics: ['sets_reps_weight'],
        archived: false,
      }

      await expect(usecase('user123', input)).rejects.toThrow('Exercise name is required')
      expect(mockRepo.create).not.toHaveBeenCalled()
    })

    it('validates at least one default metric', async () => {
      const mockRepo: ExerciseLibraryRepository = {
        create: vi.fn(),
      } as any

      const usecase = createExerciseUsecase(mockRepo)

      const input: Omit<CreateExerciseInput, 'userId'> = {
        name: 'Bench Press',
        category: 'push',
        equipment: ['barbell', 'bench'],
        defaultMetrics: [], // Empty!
        archived: false,
      }

      await expect(usecase('user123', input)).rejects.toThrow(
        'Exercise must have at least one default metric'
      )
      expect(mockRepo.create).not.toHaveBeenCalled()
    })

    it('creates exercise when valid', async () => {
      const mockExercise: ExerciseLibraryItem = {
        exerciseId: 'exercise:123' as any,
        userId: 'user123',
        name: 'Bench Press',
        category: 'push',
        equipment: ['barbell', 'bench'],
        defaultMetrics: ['sets_reps_weight'],
        archived: false,
        createdAtMs: Date.now(),
        updatedAtMs: Date.now(),
        syncState: 'synced',
        version: 1,
      }

      const mockRepo: ExerciseLibraryRepository = {
        create: vi.fn().mockResolvedValue(mockExercise),
      } as any

      const usecase = createExerciseUsecase(mockRepo)

      const input: Omit<CreateExerciseInput, 'userId'> = {
        name: 'Bench Press',
        category: 'push',
        equipment: ['barbell', 'bench'],
        defaultMetrics: ['sets_reps_weight'],
        archived: false,
      }

      const result = await usecase('user123', input)

      expect(result).toEqual(mockExercise)
      expect(mockRepo.create).toHaveBeenCalledWith('user123', {
        ...input,
        userId: 'user123',
      })
    })
  })

  describe('updateExerciseUsecase', () => {
    it('validates name when updating', async () => {
      const mockRepo: ExerciseLibraryRepository = {
        update: vi.fn(),
      } as any

      const usecase = updateExerciseUsecase(mockRepo)

      await expect(
        usecase('user123', 'exercise:123' as any, { name: '  ' })
      ).rejects.toThrow('Exercise name cannot be empty')

      expect(mockRepo.update).not.toHaveBeenCalled()
    })

    it('validates metrics when updating', async () => {
      const mockRepo: ExerciseLibraryRepository = {
        update: vi.fn(),
      } as any

      const usecase = updateExerciseUsecase(mockRepo)

      await expect(
        usecase('user123', 'exercise:123' as any, { defaultMetrics: [] })
      ).rejects.toThrow('Exercise must have at least one default metric')

      expect(mockRepo.update).not.toHaveBeenCalled()
    })

    it('updates exercise when valid', async () => {
      const mockExercise: ExerciseLibraryItem = {
        exerciseId: 'exercise:123' as any,
        userId: 'user123',
        name: 'Incline Bench Press',
        category: 'push',
        equipment: ['barbell', 'bench'],
        defaultMetrics: ['sets_reps_weight'],
        archived: false,
        createdAtMs: Date.now(),
        updatedAtMs: Date.now(),
        syncState: 'synced',
        version: 2,
      }

      const mockRepo: ExerciseLibraryRepository = {
        update: vi.fn().mockResolvedValue(mockExercise),
      } as any

      const usecase = updateExerciseUsecase(mockRepo)

      const result = await usecase('user123', 'exercise:123' as any, {
        name: 'Incline Bench Press',
      })

      expect(result).toEqual(mockExercise)
      expect(mockRepo.update).toHaveBeenCalledWith('user123', 'exercise:123', {
        name: 'Incline Bench Press',
      })
    })
  })

  describe('deleteExerciseUsecase', () => {
    it('calls repository delete', async () => {
      const mockRepo: ExerciseLibraryRepository = {
        delete: vi.fn().mockResolvedValue(undefined),
      } as any

      const usecase = deleteExerciseUsecase(mockRepo)

      await usecase('user123', 'exercise:123' as any)

      expect(mockRepo.delete).toHaveBeenCalledWith('user123', 'exercise:123')
    })
  })

  describe('getExerciseUsecase', () => {
    it('returns exercise from repository', async () => {
      const mockExercise: ExerciseLibraryItem = {
        exerciseId: 'exercise:123' as any,
        userId: 'user123',
        name: 'Bench Press',
        category: 'push',
        equipment: ['barbell', 'bench'],
        defaultMetrics: ['sets_reps_weight'],
        archived: false,
        createdAtMs: Date.now(),
        updatedAtMs: Date.now(),
        syncState: 'synced',
        version: 1,
      }

      const mockRepo: ExerciseLibraryRepository = {
        get: vi.fn().mockResolvedValue(mockExercise),
      } as any

      const usecase = getExerciseUsecase(mockRepo)

      const result = await usecase('user123', 'exercise:123' as any)

      expect(result).toEqual(mockExercise)
      expect(mockRepo.get).toHaveBeenCalledWith('user123', 'exercise:123')
    })
  })

  describe('listExercisesUsecase', () => {
    it('returns exercises from repository', async () => {
      const mockExercises: ExerciseLibraryItem[] = [
        {
          exerciseId: 'exercise:123' as any,
          userId: 'user123',
          name: 'Bench Press',
          category: 'push',
          equipment: ['barbell', 'bench'],
          defaultMetrics: ['sets_reps_weight'],
          archived: false,
          createdAtMs: Date.now(),
          updatedAtMs: Date.now(),
          syncState: 'synced',
          version: 1,
        },
      ]

      const mockRepo: ExerciseLibraryRepository = {
        list: vi.fn().mockResolvedValue(mockExercises),
      } as any

      const usecase = listExercisesUsecase(mockRepo)

      const result = await usecase('user123', { category: 'push', activeOnly: true })

      expect(result).toEqual(mockExercises)
      expect(mockRepo.list).toHaveBeenCalledWith('user123', { category: 'push', activeOnly: true })
    })
  })
})
