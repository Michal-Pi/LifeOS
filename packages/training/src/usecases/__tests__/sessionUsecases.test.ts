import { describe, it, expect, vi } from 'vitest'
import {
  createSessionUsecase,
  updateSessionUsecase,
  deleteSessionUsecase,
  getSessionUsecase,
  getSessionsByDateUsecase,
  getSessionByDateAndContextUsecase,
  listSessionsForDateRangeUsecase,
  calculateWorkoutStats,
} from '../sessionUsecases'
import type { WorkoutSessionRepository } from '../../ports/workoutSessionRepository'
import type { CreateSessionInput, WorkoutSession } from '../../domain/models'

describe('sessionUsecases', () => {
  describe('createSessionUsecase', () => {
    it('validates dateKey format', async () => {
      const mockRepo: WorkoutSessionRepository = {
        create: vi.fn(),
      } as any

      const usecase = createSessionUsecase(mockRepo)

      const input: Omit<CreateSessionInput, 'userId'> = {
        dateKey: '2024-1-1', // Invalid format!
        context: 'gym',
        status: 'planned',
        items: [],
      }

      await expect(usecase('user123', input)).rejects.toThrow(
        'Invalid date format. Expected YYYY-MM-DD'
      )
      expect(mockRepo.create).not.toHaveBeenCalled()
    })

    it('validates completed session has completedAtMs', async () => {
      const mockRepo: WorkoutSessionRepository = {
        create: vi.fn(),
      } as any

      const usecase = createSessionUsecase(mockRepo)

      const input: Omit<CreateSessionInput, 'userId'> = {
        dateKey: '2024-01-01',
        context: 'gym',
        status: 'completed', // Completed but no completedAtMs!
        items: [],
      }

      await expect(usecase('user123', input)).rejects.toThrow(
        'Completed sessions must have completedAtMs timestamp'
      )
      expect(mockRepo.create).not.toHaveBeenCalled()
    })

    it('creates session when valid', async () => {
      const mockSession: WorkoutSession = {
        sessionId: 'session:123' as any,
        userId: 'user123',
        dateKey: '2024-01-01',
        context: 'gym',
        status: 'completed',
        completedAtMs: Date.now(),
        items: [],
        createdAtMs: Date.now(),
        updatedAtMs: Date.now(),
        syncState: 'synced',
        version: 1,
      }

      const mockRepo: WorkoutSessionRepository = {
        create: vi.fn().mockResolvedValue(mockSession),
      } as any

      const usecase = createSessionUsecase(mockRepo)

      const input: Omit<CreateSessionInput, 'userId'> = {
        dateKey: '2024-01-01',
        context: 'gym',
        status: 'completed',
        completedAtMs: Date.now(),
        items: [],
      }

      const result = await usecase('user123', input)

      expect(result).toEqual(mockSession)
      expect(mockRepo.create).toHaveBeenCalledWith('user123', {
        ...input,
        userId: 'user123',
      })
    })
  })

  describe('updateSessionUsecase', () => {
    it('validates completed status has completedAtMs', async () => {
      const mockRepo: WorkoutSessionRepository = {
        update: vi.fn(),
      } as any

      const usecase = updateSessionUsecase(mockRepo)

      await expect(
        usecase('user123', 'session:123' as any, { status: 'completed' })
      ).rejects.toThrow('Completed sessions must have completedAtMs timestamp')

      expect(mockRepo.update).not.toHaveBeenCalled()
    })

    it('validates dateKey format when updating', async () => {
      const mockRepo: WorkoutSessionRepository = {
        update: vi.fn(),
      } as any

      const usecase = updateSessionUsecase(mockRepo)

      await expect(
        usecase('user123', 'session:123' as any, { dateKey: '2024-1-1' })
      ).rejects.toThrow('Invalid date format. Expected YYYY-MM-DD')

      expect(mockRepo.update).not.toHaveBeenCalled()
    })

    it('updates session when valid', async () => {
      const mockSession: WorkoutSession = {
        sessionId: 'session:123' as any,
        userId: 'user123',
        dateKey: '2024-01-01',
        context: 'gym',
        status: 'completed',
        completedAtMs: Date.now(),
        items: [],
        createdAtMs: Date.now(),
        updatedAtMs: Date.now(),
        syncState: 'synced',
        version: 2,
      }

      const mockRepo: WorkoutSessionRepository = {
        update: vi.fn().mockResolvedValue(mockSession),
      } as any

      const usecase = updateSessionUsecase(mockRepo)

      const result = await usecase('user123', 'session:123' as any, {
        status: 'completed',
        completedAtMs: Date.now(),
      })

      expect(result).toEqual(mockSession)
    })
  })

  describe('getSessionsByDateUsecase', () => {
    it('validates date format', async () => {
      const mockRepo: WorkoutSessionRepository = {
        getByDate: vi.fn(),
      } as any

      const usecase = getSessionsByDateUsecase(mockRepo)

      await expect(usecase('user123', '2024-1-1')).rejects.toThrow(
        'Invalid date format. Expected YYYY-MM-DD'
      )

      expect(mockRepo.getByDate).not.toHaveBeenCalled()
    })

    it('returns sessions for date', async () => {
      const mockSessions: WorkoutSession[] = [
        {
          sessionId: 'session:123' as any,
          userId: 'user123',
          dateKey: '2024-01-01',
          context: 'gym',
          status: 'completed',
          completedAtMs: Date.now(),
          items: [],
          createdAtMs: Date.now(),
          updatedAtMs: Date.now(),
          syncState: 'synced',
          version: 1,
        },
      ]

      const mockRepo: WorkoutSessionRepository = {
        getByDate: vi.fn().mockResolvedValue(mockSessions),
      } as any

      const usecase = getSessionsByDateUsecase(mockRepo)

      const result = await usecase('user123', '2024-01-01')

      expect(result).toEqual(mockSessions)
      expect(mockRepo.getByDate).toHaveBeenCalledWith('user123', '2024-01-01')
    })
  })

  describe('listSessionsForDateRangeUsecase', () => {
    it('validates date formats', async () => {
      const mockRepo: WorkoutSessionRepository = {
        listForDateRange: vi.fn(),
      } as any

      const usecase = listSessionsForDateRangeUsecase(mockRepo)

      await expect(usecase('user123', '2024-1-1', '2024-01-31')).rejects.toThrow(
        'Invalid start date format. Expected YYYY-MM-DD'
      )

      expect(mockRepo.listForDateRange).not.toHaveBeenCalled()
    })

    it('validates start date before end date', async () => {
      const mockRepo: WorkoutSessionRepository = {
        listForDateRange: vi.fn(),
      } as any

      const usecase = listSessionsForDateRangeUsecase(mockRepo)

      await expect(usecase('user123', '2024-01-31', '2024-01-01')).rejects.toThrow(
        'Start date must be before or equal to end date'
      )

      expect(mockRepo.listForDateRange).not.toHaveBeenCalled()
    })

    it('returns sessions for date range', async () => {
      const mockSessions: WorkoutSession[] = [
        {
          sessionId: 'session:123' as any,
          userId: 'user123',
          dateKey: '2024-01-15',
          context: 'gym',
          status: 'completed',
          completedAtMs: Date.now(),
          items: [],
          createdAtMs: Date.now(),
          updatedAtMs: Date.now(),
          syncState: 'synced',
          version: 1,
        },
      ]

      const mockRepo: WorkoutSessionRepository = {
        listForDateRange: vi.fn().mockResolvedValue(mockSessions),
      } as any

      const usecase = listSessionsForDateRangeUsecase(mockRepo)

      const result = await usecase('user123', '2024-01-01', '2024-01-31')

      expect(result).toEqual(mockSessions)
      expect(mockRepo.listForDateRange).toHaveBeenCalledWith('user123', '2024-01-01', '2024-01-31')
    })
  })

  describe('calculateWorkoutStats', () => {
    it('calculates stats correctly', () => {
      const sessions: WorkoutSession[] = [
        {
          sessionId: 'session:1' as any,
          userId: 'user123',
          dateKey: '2024-01-01',
          context: 'gym',
          status: 'completed',
          completedAtMs: Date.now(),
          durationSec: 3600, // 60 minutes
          items: [],
          createdAtMs: Date.now(),
          updatedAtMs: Date.now(),
          syncState: 'synced',
          version: 1,
        },
        {
          sessionId: 'session:2' as any,
          userId: 'user123',
          dateKey: '2024-01-02',
          context: 'home',
          status: 'completed',
          completedAtMs: Date.now(),
          durationSec: 1800, // 30 minutes
          items: [],
          createdAtMs: Date.now(),
          updatedAtMs: Date.now(),
          syncState: 'synced',
          version: 1,
        },
        {
          sessionId: 'session:3' as any,
          userId: 'user123',
          dateKey: '2024-01-03',
          context: 'road',
          status: 'skipped',
          items: [],
          createdAtMs: Date.now(),
          updatedAtMs: Date.now(),
          syncState: 'synced',
          version: 1,
        },
        {
          sessionId: 'session:4' as any,
          userId: 'user123',
          dateKey: '2024-01-04',
          context: 'gym',
          status: 'planned',
          items: [],
          createdAtMs: Date.now(),
          updatedAtMs: Date.now(),
          syncState: 'synced',
          version: 1,
        },
      ]

      const stats = calculateWorkoutStats(sessions)

      expect(stats.totalSessions).toBe(4)
      expect(stats.completedSessions).toBe(2)
      expect(stats.skippedSessions).toBe(1)
      expect(stats.plannedSessions).toBe(1)
      expect(stats.completionRate).toBe(50) // 2/4 = 50%
      expect(stats.totalDurationMinutes).toBe(90) // 60 + 30
      expect(stats.averageDurationMinutes).toBe(45) // 90/2
      expect(stats.sessionsByContext).toEqual({
        gym: 2,
        home: 1,
        road: 1,
      })
    })

    it('handles empty sessions array', () => {
      const stats = calculateWorkoutStats([])

      expect(stats.totalSessions).toBe(0)
      expect(stats.completedSessions).toBe(0)
      expect(stats.completionRate).toBe(0)
      expect(stats.totalDurationMinutes).toBe(0)
      expect(stats.averageDurationMinutes).toBe(0)
    })
  })
})
