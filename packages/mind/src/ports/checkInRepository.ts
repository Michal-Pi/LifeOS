/**
 * Check-In Repository Port
 *
 * Interface for storing and retrieving daily emotional check-ins.
 */

import type { DailyCheckIn, CreateCheckInInput, TimeOfDay } from '../domain/emotions'

export interface CheckInRepository {
  /**
   * Save a new check-in
   */
  saveCheckIn(checkIn: CreateCheckInInput): Promise<DailyCheckIn>

  /**
   * Get all check-ins for a specific date
   */
  getCheckInsForDate(userId: string, dateKey: string): Promise<DailyCheckIn[]>

  /**
   * Get the latest check-in for today (most recent by createdAtMs)
   */
  getLatestCheckIn(userId: string, dateKey: string): Promise<DailyCheckIn | null>

  /**
   * Get check-in for a specific time of day
   */
  getCheckInByTimeOfDay(
    userId: string,
    dateKey: string,
    timeOfDay: TimeOfDay
  ): Promise<DailyCheckIn | null>

  /**
   * Get check-ins for a date range (for trends/history)
   */
  getCheckInsForDateRange(
    userId: string,
    startDateKey: string,
    endDateKey: string
  ): Promise<DailyCheckIn[]>

  /**
   * Update an existing check-in (e.g., adding notes)
   */
  updateCheckIn(
    checkInId: string,
    updates: Partial<Pick<DailyCheckIn, 'emotionId' | 'coreEmotionId' | 'energyLevel' | 'notes'>>
  ): Promise<DailyCheckIn>

  /**
   * Delete a check-in
   */
  deleteCheckIn(checkInId: string): Promise<void>
}
