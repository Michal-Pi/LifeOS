/**
 * useHabitOperations Hook
 *
 * React wrapper around habit usecases.
 * Manages UI state (loading, error) and delegates business logic to domain layer.
 */

import { useState, useCallback, useMemo, useRef } from 'react'
import { useAuth } from './useAuth'
import { createFirestoreHabitRepository } from '@/adapters/habits/firestoreHabitRepository'
import { createFirestoreCheckinRepository } from '@/adapters/habits/firestoreCheckinRepository'
import {
  listHabitsLocally,
  listHabitsForDateLocally,
  saveHabitLocally,
  deleteHabitLocally,
  listCheckinsForDateLocally,
  listCheckinsForHabitLocally,
  listCheckinsForDateRangeLocally,
  saveCheckinLocally,
  deleteCheckinLocally,
  getCheckinByHabitAndDateLocally,
} from '@/habits/offlineStore'
import {
  createHabitUsecase,
  updateHabitUsecase,
  deleteHabitUsecase,
  getHabitUsecase,
  listHabitsUsecase,
  listHabitsForDateUsecase,
  upsertCheckinUsecase,
  updateCheckinUsecase,
  deleteCheckinUsecase,
  getCheckinUsecase,
  getCheckinByHabitAndDateUsecase,
  listCheckinsForDateUsecase,
  listCheckinsForHabitUsecase,
  listCheckinsForDateRangeUsecase,
  getHabitStatsUsecase,
} from '@lifeos/habits'
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
  updateCheckin: (
    checkinId: CheckinId,
    updates: UpdateCheckinInput
  ) => Promise<CanonicalHabitCheckin>
  deleteCheckin: (checkinId: CheckinId) => Promise<void>
  getCheckin: (checkinId: CheckinId) => Promise<CanonicalHabitCheckin | null>
  getCheckinByHabitAndDate: (
    habitId: HabitId,
    dateKey: string
  ) => Promise<CanonicalHabitCheckin | null>
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
 * Thin wrapper around usecases - handles React state, delegates business logic to domain
 */
export function useHabitOperations(options?: { userId?: string }): UseHabitOperationsReturn {
  const { user } = useAuth()
  const [habits, setHabits] = useState<CanonicalHabit[]>([])
  const [checkins, setCheckins] = useState<CanonicalHabitCheckin[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const userId = options?.userId ?? user?.uid

  // Ref for accessing current state in catch blocks without adding state to
  // useCallback dependency arrays (which would cause infinite re-render loops).
  const habitsRef = useRef(habits)
  habitsRef.current = habits

  // Initialize usecases with repositories
  const usecases = useMemo(
    () => ({
      createHabit: createHabitUsecase(habitRepository),
      updateHabit: updateHabitUsecase(habitRepository),
      deleteHabit: deleteHabitUsecase(habitRepository),
      getHabit: getHabitUsecase(habitRepository),
      listHabits: listHabitsUsecase(habitRepository),
      listHabitsForDate: listHabitsForDateUsecase(habitRepository),
      upsertCheckin: upsertCheckinUsecase(checkinRepository),
      updateCheckin: updateCheckinUsecase(checkinRepository),
      deleteCheckin: deleteCheckinUsecase(checkinRepository),
      getCheckin: getCheckinUsecase(checkinRepository),
      getCheckinByHabitAndDate: getCheckinByHabitAndDateUsecase(checkinRepository),
      listCheckinsForDate: listCheckinsForDateUsecase(checkinRepository),
      listCheckinsForHabit: listCheckinsForHabitUsecase(checkinRepository),
      listCheckinsForDateRange: listCheckinsForDateRangeUsecase(checkinRepository),
      getHabitStats: getHabitStatsUsecase(checkinRepository),
    }),
    []
  )

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
        const habit = await usecases.createHabit(userId, input)
        setHabits((prev) => [habit, ...prev])
        void saveHabitLocally({ ...habit, syncState: 'synced' })
        return habit
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to create habit')
        setError(error)
        throw error
      } finally {
        setIsLoading(false)
      }
    },
    [userId, usecases]
  )

  const updateHabit = useCallback(
    async (habitId: HabitId, updates: UpdateHabitInput): Promise<CanonicalHabit> => {
      if (!userId) {
        throw new Error('User not authenticated')
      }

      setIsLoading(true)
      setError(null)

      try {
        const updatedHabit = await usecases.updateHabit(userId, habitId, updates)
        setHabits((prev) => prev.map((h) => (h.habitId === habitId ? updatedHabit : h)))
        void saveHabitLocally({ ...updatedHabit, syncState: 'synced' })
        return updatedHabit
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to update habit')
        setError(error)
        throw error
      } finally {
        setIsLoading(false)
      }
    },
    [userId, usecases]
  )

  const deleteHabit = useCallback(
    async (habitId: HabitId): Promise<void> => {
      if (!userId) {
        throw new Error('User not authenticated')
      }

      setIsLoading(true)
      setError(null)

      try {
        await usecases.deleteHabit(userId, habitId)
        setHabits((prev) => prev.filter((h) => h.habitId !== habitId))
        void deleteHabitLocally(habitId)
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to delete habit')
        setError(error)
        throw error
      } finally {
        setIsLoading(false)
      }
    },
    [userId, usecases]
  )

  const getHabit = useCallback(
    async (habitId: HabitId): Promise<CanonicalHabit | null> => {
      if (!userId) {
        throw new Error('User not authenticated')
      }

      setIsLoading(true)
      setError(null)

      try {
        const habit = await usecases.getHabit(userId, habitId)
        return habit
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to get habit')
        setError(error)
        throw error
      } finally {
        setIsLoading(false)
      }
    },
    [userId, usecases]
  )

  const listHabits = useCallback(
    async (options?: { status?: HabitStatus }): Promise<CanonicalHabit[]> => {
      if (!userId) {
        throw new Error('User not authenticated')
      }

      setIsLoading(true)
      setError(null)

      try {
        // Local cache first
        const local = await listHabitsLocally(userId)
        if (local.length > 0) {
          const filtered = options?.status
            ? local.filter((h) => h.status === options.status)
            : local
          setHabits(filtered)
        }

        // Firestore in background, cache results
        const fetchedHabits = await usecases.listHabits(userId, options)
        setHabits(fetchedHabits)
        for (const h of fetchedHabits) {
          void saveHabitLocally({ ...h, syncState: 'synced' })
        }
        return fetchedHabits
      } catch (err) {
        if (habitsRef.current.length > 0) return habitsRef.current
        const error = err instanceof Error ? err : new Error('Failed to list habits')
        setError(error)
        throw error
      } finally {
        setIsLoading(false)
      }
    },
    [userId, usecases]
  )

  const listHabitsForDate = useCallback(
    async (dateKey: string): Promise<CanonicalHabit[]> => {
      if (!userId) {
        throw new Error('User not authenticated')
      }

      setIsLoading(true)
      setError(null)

      try {
        // Try local first
        const local = await listHabitsForDateLocally(userId, dateKey)
        if (local.length > 0) {
          setIsLoading(false)
        }

        const fetchedHabits = await usecases.listHabitsForDate(userId, dateKey)
        return fetchedHabits.length > 0 ? fetchedHabits : local
      } catch (err) {
        // Fall back to local
        const local = await listHabitsForDateLocally(userId, dateKey).catch(() => [])
        if (local.length > 0) return local
        const error = err instanceof Error ? err : new Error('Failed to list habits for date')
        setError(error)
        throw error
      } finally {
        setIsLoading(false)
      }
    },
    [userId, usecases]
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
        const checkin = await usecases.upsertCheckin(userId, input)

        setCheckins((prev) => {
          const existingIndex = prev.findIndex((c) => c.checkinId === checkin.checkinId)
          if (existingIndex >= 0) {
            const newCheckins = [...prev]
            newCheckins[existingIndex] = checkin
            return newCheckins
          }
          return [checkin, ...prev]
        })
        void saveCheckinLocally({ ...checkin, syncState: 'synced' })

        return checkin
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to upsert checkin')
        setError(error)
        throw error
      } finally {
        setIsLoading(false)
      }
    },
    [userId, usecases]
  )

  const updateCheckin = useCallback(
    async (checkinId: CheckinId, updates: UpdateCheckinInput): Promise<CanonicalHabitCheckin> => {
      if (!userId) {
        throw new Error('User not authenticated')
      }

      setIsLoading(true)
      setError(null)

      try {
        const updatedCheckin = await usecases.updateCheckin(userId, checkinId, updates)
        setCheckins((prev) => prev.map((c) => (c.checkinId === checkinId ? updatedCheckin : c)))
        void saveCheckinLocally({ ...updatedCheckin, syncState: 'synced' })
        return updatedCheckin
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to update checkin')
        setError(error)
        throw error
      } finally {
        setIsLoading(false)
      }
    },
    [userId, usecases]
  )

  const deleteCheckin = useCallback(
    async (checkinId: CheckinId): Promise<void> => {
      if (!userId) {
        throw new Error('User not authenticated')
      }

      setIsLoading(true)
      setError(null)

      try {
        await usecases.deleteCheckin(userId, checkinId)
        setCheckins((prev) => prev.filter((c) => c.checkinId !== checkinId))
        void deleteCheckinLocally(checkinId)
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to delete checkin')
        setError(error)
        throw error
      } finally {
        setIsLoading(false)
      }
    },
    [userId, usecases]
  )

  const getCheckin = useCallback(
    async (checkinId: CheckinId): Promise<CanonicalHabitCheckin | null> => {
      if (!userId) {
        throw new Error('User not authenticated')
      }

      setIsLoading(true)
      setError(null)

      try {
        const checkin = await usecases.getCheckin(userId, checkinId)
        return checkin
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to get checkin')
        setError(error)
        throw error
      } finally {
        setIsLoading(false)
      }
    },
    [userId, usecases]
  )

  const getCheckinByHabitAndDate = useCallback(
    async (habitId: HabitId, dateKey: string): Promise<CanonicalHabitCheckin | null> => {
      if (!userId) {
        throw new Error('User not authenticated')
      }

      setIsLoading(true)
      setError(null)

      try {
        const checkin = await usecases.getCheckinByHabitAndDate(userId, habitId, dateKey)
        if (checkin) void saveCheckinLocally({ ...checkin, syncState: 'synced' })
        return checkin
      } catch (err) {
        // Fall back to local
        const local = await getCheckinByHabitAndDateLocally(userId, habitId, dateKey).catch(
          () => undefined
        )
        if (local) return local
        const error =
          err instanceof Error ? err : new Error('Failed to get checkin by habit and date')
        setError(error)
        throw error
      } finally {
        setIsLoading(false)
      }
    },
    [userId, usecases]
  )

  const listCheckinsForDate = useCallback(
    async (dateKey: string): Promise<CanonicalHabitCheckin[]> => {
      if (!userId) {
        throw new Error('User not authenticated')
      }

      setIsLoading(true)
      setError(null)

      try {
        const fetchedCheckins = await usecases.listCheckinsForDate(userId, dateKey)
        for (const c of fetchedCheckins) void saveCheckinLocally({ ...c, syncState: 'synced' })
        return fetchedCheckins
      } catch (err) {
        const local = await listCheckinsForDateLocally(userId, dateKey).catch(() => [])
        if (local.length > 0) return local
        const error = err instanceof Error ? err : new Error('Failed to list checkins for date')
        setError(error)
        throw error
      } finally {
        setIsLoading(false)
      }
    },
    [userId, usecases]
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
        const fetchedCheckins = await usecases.listCheckinsForHabit(userId, habitId, options)
        for (const c of fetchedCheckins) void saveCheckinLocally({ ...c, syncState: 'synced' })
        return fetchedCheckins
      } catch (err) {
        const local = await listCheckinsForHabitLocally(userId, habitId).catch(() => [])
        if (local.length > 0) return local
        const error = err instanceof Error ? err : new Error('Failed to list checkins for habit')
        setError(error)
        throw error
      } finally {
        setIsLoading(false)
      }
    },
    [userId, usecases]
  )

  const listCheckinsForDateRange = useCallback(
    async (startDate: string, endDate: string): Promise<CanonicalHabitCheckin[]> => {
      if (!userId) {
        throw new Error('User not authenticated')
      }

      setIsLoading(true)
      setError(null)

      try {
        const fetchedCheckins = await usecases.listCheckinsForDateRange(userId, startDate, endDate)
        setCheckins(fetchedCheckins)
        for (const c of fetchedCheckins) void saveCheckinLocally({ ...c, syncState: 'synced' })
        return fetchedCheckins
      } catch (err) {
        const local = await listCheckinsForDateRangeLocally(userId, startDate, endDate).catch(
          () => []
        )
        if (local.length > 0) {
          setCheckins(local)
          return local
        }
        const error =
          err instanceof Error ? err : new Error('Failed to list checkins for date range')
        setError(error)
        throw error
      } finally {
        setIsLoading(false)
      }
    },
    [userId, usecases]
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
        // Delegate to usecase (all calculation logic lives in domain layer)
        return await usecases.getHabitStats(userId, habitId, days)
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to calculate habit stats')
        setError(error)
        throw error
      } finally {
        setIsLoading(false)
      }
    },
    [userId, usecases]
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
