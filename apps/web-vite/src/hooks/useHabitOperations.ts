/**
 * useHabitOperations Hook
 *
 * Provides CRUD operations for habits and check-ins using Firestore repositories.
 * Manages habit state, loading, and error handling with offline-first support.
 */

import { useState, useCallback } from 'react'
import { useAuth } from './useAuth'
import { createFirestoreHabitRepository } from '@/adapters/habits/firestoreHabitRepository'
import { createFirestoreCheckinRepository } from '@/adapters/habits/firestoreCheckinRepository'
import type {
  CanonicalHabit,
  HabitId,
  CreateHabitInput,
  UpdateHabitInput,
  CanonicalHabitCheckin,
  CheckinId,
  UpsertCheckinInput,
  UpdateCheckinInput,
  HabitStatus,
  HabitProgressStats,
} from '@lifeos/habits'

export interface UseHabitOperationsReturn {
  habits: CanonicalHabit[]
  checkins: CanonicalHabitCheckin[]
  isLoading: boolean
  error: Error | null

  // Habit operations
  createHabit: (input: Omit<CreateHabitInput, 'userId'>) => Promise<CanonicalHabit>
  updateHabit: (habitId: HabitId, updates: UpdateHabitInput) => Promise<CanonicalHabit>
  deleteHabit: (habitId: HabitId) => Promise<void>
  getHabit: (habitId: HabitId) => Promise<CanonicalHabit | null>
  listHabits: (options?: { status?: HabitStatus }) => Promise<CanonicalHabit[]>
  listHabitsForDate: (dateKey: string) => Promise<CanonicalHabit[]>

  // Checkin operations
  upsertCheckin: (input: UpsertCheckinInput) => Promise<CanonicalHabitCheckin>
  updateCheckin: (checkinId: CheckinId, updates: UpdateCheckinInput) => Promise<CanonicalHabitCheckin>
  deleteCheckin: (checkinId: CheckinId) => Promise<void>
  getCheckin: (checkinId: CheckinId) => Promise<CanonicalHabitCheckin | null>
  getCheckinByHabitAndDate: (habitId: HabitId, dateKey: string) => Promise<CanonicalHabitCheckin | null>
  listCheckinsForDate: (dateKey: string) => Promise<CanonicalHabitCheckin[]>
  listCheckinsForHabit: (
    habitId: HabitId,
    options?: { limit?: number; startDate?: string; endDate?: string }
  ) => Promise<CanonicalHabitCheckin[]>
  listCheckinsForDateRange: (startDate: string, endDate: string) => Promise<CanonicalHabitCheckin[]>

  // Analytics
  getHabitStats: (habitId: HabitId, days: number) => Promise<HabitProgressStats>
}

const habitRepository = createFirestoreHabitRepository()
const checkinRepository = createFirestoreCheckinRepository()

/**
 * Hook for managing habit and check-in operations
 */
export function useHabitOperations(): UseHabitOperationsReturn {
  const { user } = useAuth()
  const [habits, setHabits] = useState<CanonicalHabit[]>([])
  const [checkins, setCheckins] = useState<CanonicalHabitCheckin[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const userId = user?.uid

  // ============================================================================
  // Habit Operations
  // ============================================================================

  const createHabit = useCallback(
    async (input: Omit<CreateHabitInput, 'userId'>): Promise<CanonicalHabit> => {
      if (!userId) {
        throw new Error('User not authenticated')
      }

      setIsLoading(true)
      setError(null)

      try {
        const habit = await habitRepository.create(userId, input as CreateHabitInput)
        setHabits((prev) => [habit, ...prev])
        return habit
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to create habit')
        setError(error)
        throw error
      } finally {
        setIsLoading(false)
      }
    },
    [userId]
  )

  const updateHabit = useCallback(
    async (habitId: HabitId, updates: UpdateHabitInput): Promise<CanonicalHabit> => {
      if (!userId) {
        throw new Error('User not authenticated')
      }

      setIsLoading(true)
      setError(null)

      try {
        const updatedHabit = await habitRepository.update(userId, habitId, updates)
        setHabits((prev) => prev.map((h) => (h.habitId === habitId ? updatedHabit : h)))
        return updatedHabit
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to update habit')
        setError(error)
        throw error
      } finally {
        setIsLoading(false)
      }
    },
    [userId]
  )

  const deleteHabit = useCallback(
    async (habitId: HabitId): Promise<void> => {
      if (!userId) {
        throw new Error('User not authenticated')
      }

      setIsLoading(true)
      setError(null)

      try {
        await habitRepository.delete(userId, habitId)
        setHabits((prev) => prev.filter((h) => h.habitId !== habitId))
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to delete habit')
        setError(error)
        throw error
      } finally {
        setIsLoading(false)
      }
    },
    [userId]
  )

  const getHabit = useCallback(
    async (habitId: HabitId): Promise<CanonicalHabit | null> => {
      if (!userId) {
        throw new Error('User not authenticated')
      }

      setIsLoading(true)
      setError(null)

      try {
        const habit = await habitRepository.get(userId, habitId)
        return habit
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to get habit')
        setError(error)
        throw error
      } finally {
        setIsLoading(false)
      }
    },
    [userId]
  )

  const listHabits = useCallback(
    async (options?: { status?: HabitStatus }): Promise<CanonicalHabit[]> => {
      if (!userId) {
        throw new Error('User not authenticated')
      }

      setIsLoading(true)
      setError(null)

      try {
        const fetchedHabits = await habitRepository.list(userId, options)
        setHabits(fetchedHabits)
        return fetchedHabits
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to list habits')
        setError(error)
        throw error
      } finally {
        setIsLoading(false)
      }
    },
    [userId]
  )

  const listHabitsForDate = useCallback(
    async (dateKey: string): Promise<CanonicalHabit[]> => {
      if (!userId) {
        throw new Error('User not authenticated')
      }

      setIsLoading(true)
      setError(null)

      try {
        const fetchedHabits = await habitRepository.listForDate(userId, dateKey)
        return fetchedHabits
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to list habits for date')
        setError(error)
        throw error
      } finally {
        setIsLoading(false)
      }
    },
    [userId]
  )

  // ============================================================================
  // Checkin Operations
  // ============================================================================

  const upsertCheckin = useCallback(
    async (input: UpsertCheckinInput): Promise<CanonicalHabitCheckin> => {
      if (!userId) {
        throw new Error('User not authenticated')
      }

      setIsLoading(true)
      setError(null)

      try {
        const checkin = await checkinRepository.upsert(userId, input)

        // Update local state
        setCheckins((prev) => {
          const existingIndex = prev.findIndex((c) => c.checkinId === checkin.checkinId)
          if (existingIndex >= 0) {
            const newCheckins = [...prev]
            newCheckins[existingIndex] = checkin
            return newCheckins
          }
          return [checkin, ...prev]
        })

        return checkin
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to upsert checkin')
        setError(error)
        throw error
      } finally {
        setIsLoading(false)
      }
    },
    [userId]
  )

  const updateCheckin = useCallback(
    async (checkinId: CheckinId, updates: UpdateCheckinInput): Promise<CanonicalHabitCheckin> => {
      if (!userId) {
        throw new Error('User not authenticated')
      }

      setIsLoading(true)
      setError(null)

      try {
        const updatedCheckin = await checkinRepository.update(userId, checkinId, updates)
        setCheckins((prev) => prev.map((c) => (c.checkinId === checkinId ? updatedCheckin : c)))
        return updatedCheckin
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to update checkin')
        setError(error)
        throw error
      } finally {
        setIsLoading(false)
      }
    },
    [userId]
  )

  const deleteCheckin = useCallback(
    async (checkinId: CheckinId): Promise<void> => {
      if (!userId) {
        throw new Error('User not authenticated')
      }

      setIsLoading(true)
      setError(null)

      try {
        await checkinRepository.delete(userId, checkinId)
        setCheckins((prev) => prev.filter((c) => c.checkinId !== checkinId))
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to delete checkin')
        setError(error)
        throw error
      } finally {
        setIsLoading(false)
      }
    },
    [userId]
  )

  const getCheckin = useCallback(
    async (checkinId: CheckinId): Promise<CanonicalHabitCheckin | null> => {
      if (!userId) {
        throw new Error('User not authenticated')
      }

      setIsLoading(true)
      setError(null)

      try {
        const checkin = await checkinRepository.get(userId, checkinId)
        return checkin
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to get checkin')
        setError(error)
        throw error
      } finally {
        setIsLoading(false)
      }
    },
    [userId]
  )

  const getCheckinByHabitAndDate = useCallback(
    async (habitId: HabitId, dateKey: string): Promise<CanonicalHabitCheckin | null> => {
      if (!userId) {
        throw new Error('User not authenticated')
      }

      setIsLoading(true)
      setError(null)

      try {
        const checkin = await checkinRepository.getByHabitAndDate(userId, habitId, dateKey)
        return checkin
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to get checkin by habit and date')
        setError(error)
        throw error
      } finally {
        setIsLoading(false)
      }
    },
    [userId]
  )

  const listCheckinsForDate = useCallback(
    async (dateKey: string): Promise<CanonicalHabitCheckin[]> => {
      if (!userId) {
        throw new Error('User not authenticated')
      }

      setIsLoading(true)
      setError(null)

      try {
        const fetchedCheckins = await checkinRepository.listForDate(userId, dateKey)
        return fetchedCheckins
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to list checkins for date')
        setError(error)
        throw error
      } finally {
        setIsLoading(false)
      }
    },
    [userId]
  )

  const listCheckinsForHabit = useCallback(
    async (
      habitId: HabitId,
      options?: { limit?: number; startDate?: string; endDate?: string }
    ): Promise<CanonicalHabitCheckin[]> => {
      if (!userId) {
        throw new Error('User not authenticated')
      }

      setIsLoading(true)
      setError(null)

      try {
        const fetchedCheckins = await checkinRepository.listForHabit(userId, habitId, options)
        return fetchedCheckins
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to list checkins for habit')
        setError(error)
        throw error
      } finally {
        setIsLoading(false)
      }
    },
    [userId]
  )

  const listCheckinsForDateRange = useCallback(
    async (startDate: string, endDate: string): Promise<CanonicalHabitCheckin[]> => {
      if (!userId) {
        throw new Error('User not authenticated')
      }

      setIsLoading(true)
      setError(null)

      try {
        const fetchedCheckins = await checkinRepository.listForDateRange(userId, startDate, endDate)
        setCheckins(fetchedCheckins)
        return fetchedCheckins
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to list checkins for date range')
        setError(error)
        throw error
      } finally {
        setIsLoading(false)
      }
    },
    [userId]
  )

  // ============================================================================
  // Analytics
  // ============================================================================

  const getHabitStats = useCallback(
    async (habitId: HabitId, days: number): Promise<HabitProgressStats> => {
      if (!userId) {
        throw new Error('User not authenticated')
      }

      setIsLoading(true)
      setError(null)

      try {
        // Calculate date range
        const endDate = new Date()
        const startDate = new Date()
        startDate.setDate(startDate.getDate() - days)

        const startDateKey = startDate.toISOString().split('T')[0]
        const endDateKey = endDate.toISOString().split('T')[0]

        const checkins = await checkinRepository.listForHabit(userId, habitId, {
          startDate: startDateKey,
          endDate: endDateKey,
        })

        const totalCheckins = checkins.length
        const doneCount = checkins.filter((c) => c.status === 'done').length
        const tinyCount = checkins.filter((c) => c.status === 'tiny').length
        const skipCount = checkins.filter((c) => c.status === 'skip').length

        // Calculate current streak (consecutive days with done or tiny)
        let currentStreak = 0
        const today = new Date().toISOString().split('T')[0]
        const checkDate = new Date(today)

        while (true) {
          const dateKey = checkDate.toISOString().split('T')[0]
          const checkin = checkins.find((c) => c.dateKey === dateKey)

          if (!checkin || checkin.status === 'skip') {
            break
          }

          if (checkin.status === 'done' || checkin.status === 'tiny') {
            currentStreak++
          }

          checkDate.setDate(checkDate.getDate() - 1)
        }

        // Calculate best streak
        let bestStreak = 0
        let tempStreak = 0

        const sortedCheckins = [...checkins].sort((a, b) => a.dateKey.localeCompare(b.dateKey))

        for (const checkin of sortedCheckins) {
          if (checkin.status === 'done' || checkin.status === 'tiny') {
            tempStreak++
            bestStreak = Math.max(bestStreak, tempStreak)
          } else {
            tempStreak = 0
          }
        }

        const completionRate = totalCheckins > 0 ? (doneCount + tinyCount) / totalCheckins : 0

        return {
          totalCheckins,
          doneCount,
          tinyCount,
          skipCount,
          currentStreak,
          bestStreak,
          completionRate,
        }
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to calculate habit stats')
        setError(error)
        throw error
      } finally {
        setIsLoading(false)
      }
    },
    [userId]
  )

  return {
    habits,
    checkins,
    isLoading,
    error,
    createHabit,
    updateHabit,
    deleteHabit,
    getHabit,
    listHabits,
    listHabitsForDate,
    upsertCheckin,
    updateCheckin,
    deleteCheckin,
    getCheckin,
    getCheckinByHabitAndDate,
    listCheckinsForDate,
    listCheckinsForHabit,
    listCheckinsForDateRange,
    getHabitStats,
  }
}
