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
        generic_name: '   ',
        target_muscle_group: 'Quadriceps',
        category: 'lower_body',
        gym: [{ name: 'Barbell Squat' }],
        home: [],
        road: [],
        archived: false,
      }

      await expect(usecase('user123', input)).rejects.toThrow('Exercise name is required')
      expect(mockRepo.create).not.toHaveBeenCalled()
    })

    it('validates at least one target muscle group', async () => {
      const mockRepo: ExerciseLibraryRepository = {
        create: vi.fn(),
      } as any

      const usecase = createExerciseUsecase(mockRepo)

      const input: Omit<CreateExerciseInput, 'userId'> = {
        generic_name: 'Bench Press',
        target_muscle_group: '',
        category: 'upper_body',
        gym: [{ name: 'Flat Barbell Bench Press' }],
        home: [],
        road: [],
        archived: false,
      }

      await expect(usecase('user123', input)).rejects.toThrow(
        'Exercise must have at least one target muscle group'
      )
      expect(mockRepo.create).not.toHaveBeenCalled()
    })

    it('creates exercise when valid', async () => {
      const mockExercise: ExerciseLibraryItem = {
        exerciseId: 'exercise:123' as any,
        userId: 'user123',
        generic_name: 'Squat',
        target_muscle_group: ['Quadriceps', 'Glutes'],
        category: 'lower_body',
        gym: [{ name: 'Barbell Back Squat', equipment: ['barbell', 'squat rack'] }],
        home: [{ name: 'Bodyweight Squat' }],
        road: [],
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
        generic_name: 'Squat',
        target_muscle_group: ['Quadriceps', 'Glutes'],
        category: 'lower_body',
        gym: [{ name: 'Barbell Back Squat', equipment: ['barbell', 'squat rack'] }],
        home: [{ name: 'Bodyweight Squat' }],
        road: [],
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
        usecase('user123', 'exercise:123' as any, { generic_name: '  ' })
      ).rejects.toThrow('Exercise name cannot be empty')

      expect(mockRepo.update).not.toHaveBeenCalled()
    })

    it('validates target muscle group when updating', async () => {
      const mockRepo: ExerciseLibraryRepository = {
        update: vi.fn(),
      } as any

      const usecase = updateExerciseUsecase(mockRepo)

      await expect(
        usecase('user123', 'exercise:123' as any, { target_muscle_group: [] })
      ).rejects.toThrow('Exercise must have at least one target muscle group')

      expect(mockRepo.update).not.toHaveBeenCalled()
    })

    it('updates exercise when valid', async () => {
      const mockExercise: ExerciseLibraryItem = {
        exerciseId: 'exercise:123' as any,
        userId: 'user123',
        generic_name: 'Incline Press',
        target_muscle_group: 'Chest',
        category: 'upper_body',
        gym: [{ name: 'Incline Barbell Press' }],
        home: [],
        road: [],
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
        generic_name: 'Incline Press',
      })

      expect(result).toEqual(mockExercise)
      expect(mockRepo.update).toHaveBeenCalledWith('user123', 'exercise:123', {
        generic_name: 'Incline Press',
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
        generic_name: 'Squat',
        target_muscle_group: 'Quadriceps',
        category: 'lower_body',
        gym: [{ name: 'Barbell Back Squat' }],
        home: [],
        road: [],
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
          generic_name: 'Squat',
          target_muscle_group: 'Quadriceps',
          category: 'lower_body',
          gym: [{ name: 'Barbell Back Squat' }],
          home: [],
          road: [],
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

      const result = await usecase('user123', { category: 'lower_body', activeOnly: true })

      expect(result).toEqual(mockExercises)
      expect(mockRepo.list).toHaveBeenCalledWith('user123', {
        category: 'lower_body',
        activeOnly: true,
      })
    })
  })
})
