/**
 * Checkin Usecases
 *
 * Pure business logic for habit check-in operations.
 */

import type { CheckinRepository } from '../ports/checkinRepository'
import type {
  CanonicalHabitCheckin,
  CheckinId,
  HabitId,
  CreateCheckinInput,
  UpdateCheckinInput,
} from '../domain/models'

/**
 * Upsert a habit check-in (create or update)
 *
 * Business rule: Only one check-in per habit per day
 */
export function upsertCheckinUsecase(checkinRepo: CheckinRepository) {
  return async (userId: string, input: CreateCheckinInput): Promise<CanonicalHabitCheckin> => {
    // Validate status is valid
    if (!['done', 'tiny', 'skip'].includes(input.status)) {
      throw new Error('Invalid checkin status')
    }

    // Validate mood values if provided
    if (input.moodBefore !== undefined && (input.moodBefore < 1 || input.moodBefore > 5)) {
      throw new Error('Mood before must be between 1 and 5')
    }
    if (input.moodAfter !== undefined && (input.moodAfter < 1 || input.moodAfter > 5)) {
      throw new Error('Mood after must be between 1 and 5')
    }

    return await checkinRepo.upsert(userId, input)
  }
}

/**
 * Update an existing check-in
 */
export function updateCheckinUsecase(checkinRepo: CheckinRepository) {
  return async (
    userId: string,
    checkinId: CheckinId,
    updates: UpdateCheckinInput
  ): Promise<CanonicalHabitCheckin> => {
    // Validate status if being updated
    if (updates.status && !['done', 'tiny', 'skip'].includes(updates.status)) {
      throw new Error('Invalid checkin status')
    }

    // Validate mood values if provided
    if (updates.moodBefore !== undefined && (updates.moodBefore < 1 || updates.moodBefore > 5)) {
      throw new Error('Mood before must be between 1 and 5')
    }
    if (updates.moodAfter !== undefined && (updates.moodAfter < 1 || updates.moodAfter > 5)) {
      throw new Error('Mood after must be between 1 and 5')
    }

    return await checkinRepo.update(userId, checkinId, updates)
  }
}

/**
 * Delete a check-in
 */
export function deleteCheckinUsecase(checkinRepo: CheckinRepository) {
  return async (userId: string, checkinId: CheckinId): Promise<void> => {
    await checkinRepo.delete(userId, checkinId)
  }
}

/**
 * Get a single check-in
 */
export function getCheckinUsecase(checkinRepo: CheckinRepository) {
  return async (userId: string, checkinId: CheckinId): Promise<CanonicalHabitCheckin | null> => {
    return await checkinRepo.get(userId, checkinId)
  }
}

/**
 * Get check-in for specific habit and date
 */
export function getCheckinByHabitAndDateUsecase(checkinRepo: CheckinRepository) {
  return async (
    userId: string,
    habitId: HabitId,
    dateKey: string
  ): Promise<CanonicalHabitCheckin | null> => {
    return await checkinRepo.getByHabitAndDate(userId, habitId, dateKey)
  }
}

/**
 * List all check-ins for a specific date
 */
export function listCheckinsForDateUsecase(checkinRepo: CheckinRepository) {
  return async (userId: string, dateKey: string): Promise<CanonicalHabitCheckin[]> => {
    return await checkinRepo.listForDate(userId, dateKey)
  }
}

/**
 * List all check-ins for a specific habit
 */
export function listCheckinsForHabitUsecase(checkinRepo: CheckinRepository) {
  return async (
    userId: string,
    habitId: HabitId,
    options?: { limit?: number; startDate?: string; endDate?: string }
  ): Promise<CanonicalHabitCheckin[]> => {
    return await checkinRepo.listForHabit(userId, habitId, options)
  }
}

/**
 * List all check-ins within a date range
 */
export function listCheckinsForDateRangeUsecase(checkinRepo: CheckinRepository) {
  return async (
    userId: string,
    startDate: string,
    endDate: string
  ): Promise<CanonicalHabitCheckin[]> => {
    return await checkinRepo.listForDateRange(userId, startDate, endDate)
  }
}
