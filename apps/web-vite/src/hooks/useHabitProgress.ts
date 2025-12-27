/**
 * Habit Progress Hook
 *
 * Provides analytics and progress tracking for habits:
 * - Weekly statistics (consistency, done/tiny/skip/missed counts)
 * - Streak calculation with 2-day grace period
 * - Progress trend analysis (improving/stable/declining)
 */

import { useState, useCallback } from 'react'
import { useAuth } from './useAuth'
import { createFirestoreCheckinRepository } from '@/adapters/habits/firestoreCheckinRepository'
import type { HabitId } from '@lifeos/habits'

const checkinRepo = createFirestoreCheckinRepository()

export interface HabitWeeklyStats {
  totalScheduledDays: number
  doneCount: number
  tinyCount: number
  skipCount: number
  missedCount: number
  consistencyPercent: number
}

export interface HabitProgressData {
  habitId: HabitId
  currentStreak: number
  longestStreak: number
  totalCheckins: number
  weeklyTrend: 'improving' | 'stable' | 'declining'
}

export function useHabitProgress() {
  const { user } = useAuth()
  const userId = user?.uid
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const getWeeklyStats = useCallback(
    async (habitId: HabitId, startDate: string, endDate: string): Promise<HabitWeeklyStats> => {
      if (!userId) throw new Error('User not authenticated')

      setIsLoading(true)
      setError(null)

      try {
        const checkins = await checkinRepo.listForDateRange(userId, startDate, endDate)
        const habitCheckins = checkins.filter((c) => c.habitId === habitId)

        // Calculate scheduled days in this range (7 days for a week)
        // In a real implementation, we'd check habit.schedule.daysOfWeek
        const totalScheduledDays = 7

        const doneCount = habitCheckins.filter((c) => c.status === 'done').length
        const tinyCount = habitCheckins.filter((c) => c.status === 'tiny').length
        const skipCount = habitCheckins.filter((c) => c.status === 'skip').length
        const missedCount = totalScheduledDays - habitCheckins.length

        const consistencyPercent = Math.round(((doneCount + tinyCount) / totalScheduledDays) * 100)

        return {
          totalScheduledDays,
          doneCount,
          tinyCount,
          skipCount,
          missedCount,
          consistencyPercent,
        }
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to get weekly stats')
        setError(error)
        throw error
      } finally {
        setIsLoading(false)
      }
    },
    [userId]
  )

  const calculateStreak = useCallback(
    async (habitId: HabitId): Promise<number> => {
      if (!userId) throw new Error('User not authenticated')

      setIsLoading(true)
      setError(null)

      try {
        // Get recent check-ins (last 60 days)
        const sixtyDaysAgo = new Date()
        sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60)
        const startDate = sixtyDaysAgo.toISOString().split('T')[0]
        const endDate = new Date().toISOString().split('T')[0]

        const checkins = await checkinRepo.listForDateRange(userId, startDate, endDate)
        const habitCheckins = checkins
          .filter((c) => c.habitId === habitId)
          .sort((a, b) => b.dateKey.localeCompare(a.dateKey)) // Most recent first

        let streak = 0
        let currentDate = new Date()

        for (const checkin of habitCheckins) {
          const checkinDate = new Date(checkin.dateKey)
          const daysDiff = Math.floor(
            (currentDate.getTime() - checkinDate.getTime()) / (1000 * 60 * 60 * 24)
          )

          // If there's a gap of more than 2 days (allowing for recovery), break
          if (daysDiff > 2) break

          // Count done and tiny as streak-preserving
          if (checkin.status === 'done' || checkin.status === 'tiny') {
            streak++
            currentDate = checkinDate
          } else if (checkin.status === 'skip') {
            // Skip breaks the streak
            break
          }
        }

        return streak
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to calculate streak')
        setError(error)
        throw error
      } finally {
        setIsLoading(false)
      }
    },
    [userId]
  )

  const getProgressTrend = useCallback(
    async (habitId: HabitId): Promise<'improving' | 'stable' | 'declining'> => {
      if (!userId) return 'stable'

      setIsLoading(true)
      setError(null)

      try {
        // Compare last week vs week before
        const today = new Date()
        const lastWeekStart = new Date(today)
        lastWeekStart.setDate(today.getDate() - 7)
        const lastWeekEnd = today

        const priorWeekStart = new Date(today)
        priorWeekStart.setDate(today.getDate() - 14)
        const priorWeekEnd = new Date(today)
        priorWeekEnd.setDate(today.getDate() - 7)

        const lastWeekStats = await getWeeklyStats(
          habitId,
          lastWeekStart.toISOString().split('T')[0],
          lastWeekEnd.toISOString().split('T')[0]
        )

        const priorWeekStats = await getWeeklyStats(
          habitId,
          priorWeekStart.toISOString().split('T')[0],
          priorWeekEnd.toISOString().split('T')[0]
        )

        const diff = lastWeekStats.consistencyPercent - priorWeekStats.consistencyPercent

        if (diff > 10) return 'improving'
        if (diff < -10) return 'declining'
        return 'stable'
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to get progress trend')
        setError(error)
        return 'stable'
      } finally {
        setIsLoading(false)
      }
    },
    [userId, getWeeklyStats]
  )

  return {
    getWeeklyStats,
    calculateStreak,
    getProgressTrend,
    isLoading,
    error,
  }
}
