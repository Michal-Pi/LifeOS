import { describe, it, expect, vi } from 'vitest'
import { createHabitUsecase, updateHabitUsecase } from '../habitUsecases'
import type { HabitRepository } from '../../ports'
import type { CreateHabitInput, CanonicalHabit } from '../../domain/models'

describe('habitUsecases', () => {
  describe('createHabitUsecase', () => {
    it('validates schedule has at least one day', async () => {
      const mockRepo: HabitRepository = {
        create: vi.fn(),
      } as any

      const usecase = createHabitUsecase(mockRepo)

      const input: Omit<CreateHabitInput, 'userId'> = {
        title: 'Morning Run',
        domain: 'exercise',
        status: 'active',
        anchor: { type: 'time_window', startTimeHHMM: '06:00', endTimeHHMM: '07:00' },
        recipe: { standard: 'Run for 30 minutes' },
        schedule: { daysOfWeek: [], timezone: 'America/New_York' }, // Empty!
        safetyNet: { tinyCountsAsSuccess: true, allowRecovery: true },
      }

      await expect(usecase('user123', input)).rejects.toThrow(
        'Habit must be scheduled for at least one day'
      )
      expect(mockRepo.create).not.toHaveBeenCalled()
    })

    it('validates standard version is not empty', async () => {
      const mockRepo: HabitRepository = {
        create: vi.fn(),
      } as any

      const usecase = createHabitUsecase(mockRepo)

      const input: Omit<CreateHabitInput, 'userId'> = {
        title: 'Morning Run',
        domain: 'exercise',
        status: 'active',
        anchor: { type: 'time_window', startTimeHHMM: '06:00', endTimeHHMM: '07:00' },
        recipe: { standard: '   ' }, // Empty!
        schedule: { daysOfWeek: [1, 2, 3], timezone: 'America/New_York' },
        safetyNet: { tinyCountsAsSuccess: true, allowRecovery: true },
      }

      await expect(usecase('user123', input)).rejects.toThrow(
        'Standard version description is required'
      )
      expect(mockRepo.create).not.toHaveBeenCalled()
    })

    it('creates habit when valid', async () => {
      const mockHabit: CanonicalHabit = {
        habitId: 'habit:123' as any,
        userId: 'user123',
        title: 'Morning Run',
        domain: 'exercise',
        status: 'active',
        anchor: { type: 'time_window', startTimeHHMM: '06:00', endTimeHHMM: '07:00' },
        recipe: { standard: 'Run for 30 minutes' },
        schedule: { daysOfWeek: [1, 2, 3], timezone: 'America/New_York' },
        safetyNet: { tinyCountsAsSuccess: true, allowRecovery: true },
        createdAtMs: Date.now(),
        updatedAtMs: Date.now(),
        syncState: 'synced',
        version: 1,
      }

      const mockRepo: HabitRepository = {
        create: vi.fn().mockResolvedValue(mockHabit),
      } as any

      const usecase = createHabitUsecase(mockRepo)

      const input: Omit<CreateHabitInput, 'userId'> = {
        title: 'Morning Run',
        domain: 'exercise',
        status: 'active',
        anchor: { type: 'time_window', startTimeHHMM: '06:00', endTimeHHMM: '07:00' },
        recipe: { standard: 'Run for 30 minutes' },
        schedule: { daysOfWeek: [1, 2, 3], timezone: 'America/New_York' },
        safetyNet: { tinyCountsAsSuccess: true, allowRecovery: true },
      }

      const result = await usecase('user123', input)

      expect(result).toEqual(mockHabit)
      expect(mockRepo.create).toHaveBeenCalledWith('user123', {
        ...input,
        userId: 'user123',
      })
    })
  })

  describe('updateHabitUsecase', () => {
    it('validates schedule when updating', async () => {
      const mockRepo: HabitRepository = {
        update: vi.fn(),
      } as any

      const usecase = updateHabitUsecase(mockRepo)

      await expect(
        usecase('user123', 'habit:123' as any, {
          schedule: { daysOfWeek: [], timezone: 'America/New_York' },
        })
      ).rejects.toThrow('Habit must be scheduled for at least one day')

      expect(mockRepo.update).not.toHaveBeenCalled()
    })

    it('validates recipe when updating', async () => {
      const mockRepo: HabitRepository = {
        update: vi.fn(),
      } as any

      const usecase = updateHabitUsecase(mockRepo)

      await expect(
        usecase('user123', 'habit:123' as any, {
          recipe: { standard: '  ' },
        })
      ).rejects.toThrow('Standard version description is required')

      expect(mockRepo.update).not.toHaveBeenCalled()
    })
  })
})
