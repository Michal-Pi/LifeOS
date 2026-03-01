/**
 * useCheckIn Hook
 *
 * Manages daily emotional check-ins with energy level and emotion tracking.
 * Automatically determines time of day and provides check-in CRUD operations.
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNow } from '@/hooks/useNow'
import type {
  DailyCheckIn,
  EnergyLevel,
  TimeOfDay,
  CoreEmotionId,
  DetailedEmotion,
} from '@lifeos/mind'
import { getTimeOfDay, getCheckInLabel, getDetailedEmotionById } from '@lifeos/mind'
import { useRepositories } from '@/contexts/RepositoryContext'

interface UseCheckInOptions {
  userId: string
  dateKey: string
}

interface UseCheckInResult {
  // Current state
  currentCheckIn: DailyCheckIn | null
  todayCheckIns: DailyCheckIn[]
  recentHistory: DailyCheckIn[]
  timeOfDay: TimeOfDay
  checkInLabel: string
  loading: boolean
  historyLoading: boolean
  error: string | null

  // Current emotion details (if check-in exists)
  currentEmotion: DetailedEmotion | null

  // Actions
  saveCheckIn: (
    energyLevel: EnergyLevel,
    emotionId: string,
    coreEmotionId: CoreEmotionId,
    notes?: string
  ) => Promise<void>
  updateCheckIn: (updates: {
    energyLevel?: EnergyLevel
    emotionId?: string
    coreEmotionId?: CoreEmotionId
    notes?: string
  }) => Promise<void>
  loadTodayCheckIns: () => Promise<void>
  loadRecentHistory: (days?: number) => Promise<void>

  // Check if user has checked in for current time period
  hasCheckedInForPeriod: boolean
}

// Helper to format date as YYYY-MM-DD
function formatDateKey(date: Date): string {
  return date.toISOString().split('T')[0]
}

export function useCheckIn({ userId, dateKey }: UseCheckInOptions): UseCheckInResult {
  const { checkInRepository } = useRepositories()
  const [currentCheckIn, setCurrentCheckIn] = useState<DailyCheckIn | null>(null)
  const [todayCheckIns, setTodayCheckIns] = useState<DailyCheckIn[]>([])
  const [recentHistory, setRecentHistory] = useState<DailyCheckIn[]>([])
  const [loading, setLoading] = useState(true)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Calculate time of day (updates when the hour changes)
  const now = useNow(60_000)
  const timeOfDay = useMemo(() => getTimeOfDay(now), [now])
  const checkInLabel = useMemo(() => getCheckInLabel(timeOfDay), [timeOfDay])

  // Get current emotion details
  const currentEmotion = useMemo(() => {
    if (!currentCheckIn) return null
    return getDetailedEmotionById(currentCheckIn.emotionId) || null
  }, [currentCheckIn])

  // Check if user has already checked in for this time period
  const hasCheckedInForPeriod = useMemo(() => {
    return todayCheckIns.some((c) => c.timeOfDay === timeOfDay)
  }, [todayCheckIns, timeOfDay])

  // Load today's check-ins
  const loadTodayCheckIns = useCallback(async () => {
    if (!userId || !dateKey) return

    setLoading(true)
    setError(null)

    try {
      const checkIns = await checkInRepository.getCheckInsForDate(userId, dateKey)
      setTodayCheckIns(checkIns)

      // Set current check-in to the one for the current time period, or the latest
      const periodCheckIn = checkIns.find((c) => c.timeOfDay === timeOfDay)
      if (periodCheckIn) {
        setCurrentCheckIn(periodCheckIn)
      } else if (checkIns.length > 0) {
        // Use the most recent check-in
        setCurrentCheckIn(
          checkIns.reduce((latest, current) =>
            current.createdAtMs > latest.createdAtMs ? current : latest
          )
        )
      } else {
        setCurrentCheckIn(null)
      }
    } catch (err) {
      console.error('Failed to load check-ins:', err)
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [userId, dateKey, timeOfDay, checkInRepository])

  // Load on mount and when dependencies change
  useEffect(() => {
    void loadTodayCheckIns()
  }, [loadTodayCheckIns])

  // Save a new check-in
  const saveCheckIn = useCallback(
    async (
      energyLevel: EnergyLevel,
      emotionId: string,
      coreEmotionId: CoreEmotionId,
      notes?: string
    ) => {
      if (!userId || !dateKey) {
        throw new Error('User ID and date key are required')
      }

      setError(null)

      try {
        const checkIn = await checkInRepository.saveCheckIn({
          userId,
          dateKey,
          timeOfDay,
          energyLevel,
          emotionId,
          coreEmotionId,
          notes,
        })

        setCurrentCheckIn(checkIn)
        setTodayCheckIns((prev) => {
          // Replace existing check-in for this time period, or add new
          const filtered = prev.filter((c) => c.timeOfDay !== timeOfDay)
          return [...filtered, checkIn].sort((a, b) => a.createdAtMs - b.createdAtMs)
        })
      } catch (err) {
        console.error('Failed to save check-in:', err)
        setError((err as Error).message)
        throw err
      }
    },
    [userId, dateKey, timeOfDay, checkInRepository]
  )

  // Update existing check-in
  const updateCheckIn = useCallback(
    async (updates: {
      energyLevel?: EnergyLevel
      emotionId?: string
      coreEmotionId?: CoreEmotionId
      notes?: string
    }) => {
      if (!currentCheckIn) {
        throw new Error('No check-in to update')
      }

      setError(null)

      try {
        const updated = await checkInRepository.updateCheckIn(
          currentCheckIn.checkInId as string,
          updates
        )

        setCurrentCheckIn(updated)
        setTodayCheckIns((prev) =>
          prev.map((c) => (c.checkInId === updated.checkInId ? updated : c))
        )
      } catch (err) {
        console.error('Failed to update check-in:', err)
        setError((err as Error).message)
        throw err
      }
    },
    [currentCheckIn, checkInRepository]
  )

  // Load recent history (default: last 14 days)
  const loadRecentHistory = useCallback(
    async (days: number = 14) => {
      if (!userId) return

      setHistoryLoading(true)

      try {
        const endDate = new Date()
        const startDate = new Date()
        startDate.setDate(startDate.getDate() - days)

        const startDateKey = formatDateKey(startDate)
        const endDateKey = formatDateKey(endDate)

        const history = await checkInRepository.getCheckInsForDateRange(
          userId,
          startDateKey,
          endDateKey
        )
        setRecentHistory(history)
      } catch (err) {
        console.error('Failed to load history:', err)
        setError((err as Error).message)
      } finally {
        setHistoryLoading(false)
      }
    },
    [userId, checkInRepository]
  )

  return {
    currentCheckIn,
    todayCheckIns,
    recentHistory,
    timeOfDay,
    checkInLabel,
    loading,
    historyLoading,
    error,
    currentEmotion,
    saveCheckIn,
    updateCheckIn,
    loadTodayCheckIns,
    loadRecentHistory,
    hasCheckedInForPeriod,
  }
}
