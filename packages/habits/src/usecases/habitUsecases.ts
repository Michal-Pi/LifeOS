/**
 * Habit Usecases
 *
 * Pure business logic for habit operations.
 * Independent of UI framework (React, Vue, etc.) and data layer (Firestore, SQL, etc.)
 */

import type { HabitRepository } from '../ports/habitRepository'
import type { CheckinRepository } from '../ports/checkinRepository'
import type {
  CanonicalHabit,
  HabitId,
  CreateHabitInput,
  UpdateHabitInput,
  HabitStatus,
  HabitProgressStats,
} from '../domain/models'

/**
 * Create a new habit with validation
 */
export function createHabitUsecase(habitRepo: HabitRepository) {
  return async (
    userId: string,
    input: Omit<CreateHabitInput, 'userId'>
  ): Promise<CanonicalHabit> => {
    // Business rule: Validate schedule has at least one day
    if (input.schedule.daysOfWeek.length === 0) {
      throw new Error('Habit must be scheduled for at least one day')
    }

    // Business rule: Validate standard version is not empty
    if (!input.recipe.standard.trim()) {
      throw new Error('Standard version description is required')
    }

    // Create with userId
    const fullInput: CreateHabitInput = {
      ...input,
      userId,
    }

    return await habitRepo.create(userId, fullInput)
  }
}

/**
 * Update an existing habit with validation
 */
export function updateHabitUsecase(habitRepo: HabitRepository) {
  return async (
    userId: string,
    habitId: HabitId,
    updates: UpdateHabitInput
  ): Promise<CanonicalHabit> => {
    // Business rule: If updating schedule, ensure at least one day
    if (updates.schedule && updates.schedule.daysOfWeek.length === 0) {
      throw new Error('Habit must be scheduled for at least one day')
    }

    // Business rule: If updating recipe, ensure standard version is not empty
    if (updates.recipe && !updates.recipe.standard.trim()) {
      throw new Error('Standard version description is required')
    }

    return await habitRepo.update(userId, habitId, updates)
  }
}

/**
 * Delete a habit
 */
export function deleteHabitUsecase(habitRepo: HabitRepository) {
  return async (userId: string, habitId: HabitId): Promise<void> => {
    await habitRepo.delete(userId, habitId)
  }
}

/**
 * Get a single habit
 */
export function getHabitUsecase(habitRepo: HabitRepository) {
  return async (userId: string, habitId: HabitId): Promise<CanonicalHabit | null> => {
    return await habitRepo.get(userId, habitId)
  }
}

/**
 * List habits with optional filtering
 */
export function listHabitsUsecase(habitRepo: HabitRepository) {
  return async (userId: string, options?: { status?: HabitStatus }): Promise<CanonicalHabit[]> => {
    return await habitRepo.list(userId, options)
  }
}

/**
 * List habits scheduled for a specific date
 */
export function listHabitsForDateUsecase(habitRepo: HabitRepository) {
  return async (userId: string, dateKey: string): Promise<CanonicalHabit[]> => {
    return await habitRepo.listForDate(userId, dateKey)
  }
}

/**
 * Calculate current streak for a habit
 *
 * A streak is the number of consecutive days (from today backwards) where the habit
 * was completed with 'done' or 'tiny' status.
 */
export function calculateStreakUsecase(checkinRepo: CheckinRepository) {
  return async (userId: string, habitId: HabitId): Promise<number> => {
    const today = new Date().toISOString().split('T')[0]
    const checkDate = new Date(today)
    let currentStreak = 0

    // Check backwards from today
    while (true) {
      const dateKey = checkDate.toISOString().split('T')[0]

      // Get checkin for this date
      const checkin = await checkinRepo.getByHabitAndDate(userId, habitId, dateKey)

      // Break if no checkin or skipped
      if (!checkin || checkin.status === 'skip') {
        break
      }

      // Count if done or tiny
      if (checkin.status === 'done' || checkin.status === 'tiny') {
        currentStreak++
      }

      // Move to previous day
      checkDate.setDate(checkDate.getDate() - 1)

      // Safety: stop after 365 days
      if (currentStreak > 365) break
    }

    return currentStreak
  }
}

/**
 * Calculate best streak for a habit across all time
 *
 * Analyzes all check-ins to find the longest consecutive streak.
 */
export function calculateBestStreakUsecase(checkinRepo: CheckinRepository) {
  return async (userId: string, habitId: HabitId): Promise<number> => {
    // Get all checkins for this habit
    const checkins = await checkinRepo.listForHabit(userId, habitId)

    // Sort by date
    const sortedCheckins = [...checkins].sort((a, b) => a.dateKey.localeCompare(b.dateKey))

    let bestStreak = 0
    let tempStreak = 0
    let previousDate: Date | null = null

    for (const checkin of sortedCheckins) {
      const currentDate = new Date(checkin.dateKey)

      // Check if this is consecutive with previous
      const isConsecutive = previousDate
        ? Math.abs(currentDate.getTime() - previousDate.getTime()) === 86400000 // 1 day in ms
        : true

      if (checkin.status === 'done' || checkin.status === 'tiny') {
        if (isConsecutive) {
          tempStreak++
          bestStreak = Math.max(bestStreak, tempStreak)
        } else {
          tempStreak = 1
        }
        previousDate = currentDate
      } else if (checkin.status === 'skip') {
        tempStreak = 0
        previousDate = null
      }
    }

    return bestStreak
  }
}

/**
 * Get comprehensive habit statistics
 */
export function getHabitStatsUsecase(checkinRepo: CheckinRepository) {
  return async (userId: string, habitId: HabitId, days: number): Promise<HabitProgressStats> => {
    // Calculate date range
    const endDate = new Date()
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - days)

    const startDateKey = startDate.toISOString().split('T')[0]
    const endDateKey = endDate.toISOString().split('T')[0]

    // Get checkins for period
    const checkins = await checkinRepo.listForHabit(userId, habitId, {
      startDate: startDateKey,
      endDate: endDateKey,
    })

    // Calculate metrics
    const totalCheckins = checkins.length
    const doneCount = checkins.filter((c: any) => c.status === 'done').length
    const tinyCount = checkins.filter((c: any) => c.status === 'tiny').length
    const skipCount = checkins.filter((c: any) => c.status === 'skip').length

    // Calculate current streak
    let currentStreak = 0
    const today = new Date().toISOString().split('T')[0]
    const checkDate = new Date(today)

    while (true) {
      const dateKey = checkDate.toISOString().split('T')[0]
      const checkin = checkins.find((c: any) => c.dateKey === dateKey)

      if (!checkin || checkin.status === 'skip') {
        break
      }

      if (checkin.status === 'done' || checkin.status === 'tiny') {
        currentStreak++
      }

      checkDate.setDate(checkDate.getDate() - 1)
    }

    // Calculate best streak in period
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
      habitId,
      currentStreak,
      bestStreak,
      totalCheckins,
      doneCount,
      tinyCount,
      skipCount,
      completionRate,
    }
  }
}
