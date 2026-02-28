/**
 * Workout Session Usecases
 *
 * Pure business logic for workout session operations.
 * Independent of UI framework (React, Vue, etc.) and data layer (Firestore, SQL, etc.)
 */

import type { WorkoutSessionRepository } from '../ports/workoutSessionRepository'
import type {
  WorkoutSession,
  SessionId,
  CreateSessionInput,
  UpdateSessionInput,
  WorkoutContext,
} from '../domain/models'

/**
 * Create a new workout session with validation
 */
export function createSessionUsecase(sessionRepo: WorkoutSessionRepository) {
  return async (
    userId: string,
    input: Omit<CreateSessionInput, 'userId'>
  ): Promise<WorkoutSession> => {
    // Business rule: dateKey must be valid YYYY-MM-DD format
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/
    if (!dateRegex.test(input.dateKey)) {
      throw new Error('Invalid date format. Expected YYYY-MM-DD')
    }

    // Business rule: If session is completed, it must have completedAtMs
    if (input.status === 'completed' && !input.completedAtMs) {
      throw new Error('Completed sessions must have completedAtMs timestamp')
    }

    // Business rule: If session has completedAtMs, status should be completed or skipped
    if (input.completedAtMs && input.status !== 'completed' && input.status !== 'skipped') {
      throw new Error('Only completed or skipped sessions can have completedAtMs')
    }

    // Create with userId
    const fullInput: CreateSessionInput = {
      ...input,
      userId,
    }

    return await sessionRepo.create(userId, fullInput)
  }
}

/**
 * Update an existing workout session with validation
 */
export function updateSessionUsecase(sessionRepo: WorkoutSessionRepository) {
  return async (
    userId: string,
    sessionId: SessionId,
    updates: UpdateSessionInput
  ): Promise<WorkoutSession> => {
    // Business rule: If updating to completed status, ensure completedAtMs exists
    if (updates.status === 'completed' && !updates.completedAtMs) {
      throw new Error('Completed sessions must have completedAtMs timestamp')
    }

    // Business rule: If updating dateKey, ensure valid format
    if (updates.dateKey) {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/
      if (!dateRegex.test(updates.dateKey)) {
        throw new Error('Invalid date format. Expected YYYY-MM-DD')
      }
    }

    return await sessionRepo.update(userId, sessionId, updates)
  }
}

/**
 * Delete a workout session
 */
export function deleteSessionUsecase(sessionRepo: WorkoutSessionRepository) {
  return async (userId: string, sessionId: SessionId): Promise<void> => {
    await sessionRepo.delete(userId, sessionId)
  }
}

/**
 * Get a single workout session
 */
export function getSessionUsecase(sessionRepo: WorkoutSessionRepository) {
  return async (userId: string, sessionId: SessionId): Promise<WorkoutSession | null> => {
    return await sessionRepo.get(userId, sessionId)
  }
}

/**
 * Get all sessions for a specific date
 */
export function getSessionsByDateUsecase(sessionRepo: WorkoutSessionRepository) {
  return async (userId: string, dateKey: string): Promise<WorkoutSession[]> => {
    // Business rule: Validate date format
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/
    if (!dateRegex.test(dateKey)) {
      throw new Error('Invalid date format. Expected YYYY-MM-DD')
    }

    return await sessionRepo.getByDate(userId, dateKey)
  }
}

/**
 * Get session for a specific date and context
 * Useful for checking if user already worked out at gym/home/road today
 */
export function getSessionByDateAndContextUsecase(sessionRepo: WorkoutSessionRepository) {
  return async (
    userId: string,
    dateKey: string,
    context: WorkoutContext
  ): Promise<WorkoutSession | null> => {
    // Business rule: Validate date format
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/
    if (!dateRegex.test(dateKey)) {
      throw new Error('Invalid date format. Expected YYYY-MM-DD')
    }

    return await sessionRepo.getByDateAndContext(userId, dateKey, context)
  }
}

/**
 * List sessions for a date range
 * Used for analytics and weekly review
 */
export function listSessionsForDateRangeUsecase(sessionRepo: WorkoutSessionRepository) {
  return async (userId: string, startDate: string, endDate: string): Promise<WorkoutSession[]> => {
    // Business rule: Validate date formats
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/
    if (!dateRegex.test(startDate)) {
      throw new Error('Invalid start date format. Expected YYYY-MM-DD')
    }
    if (!dateRegex.test(endDate)) {
      throw new Error('Invalid end date format. Expected YYYY-MM-DD')
    }

    // Business rule: Start date should be before or equal to end date
    if (startDate > endDate) {
      throw new Error('Start date must be before or equal to end date')
    }

    return await sessionRepo.listForDateRange(userId, startDate, endDate)
  }
}

/**
 * Calculate workout statistics for a date range
 * Pure business logic - no repository dependency
 */
export function calculateWorkoutStats(sessions: WorkoutSession[]): {
  totalSessions: number
  completedSessions: number
  skippedSessions: number
  plannedSessions: number
  completionRate: number
  totalDurationMinutes: number
  averageDurationMinutes: number
  sessionsByContext: Record<WorkoutContext, number>
} {
  const completed = sessions.filter((s: WorkoutSession) => s.status === 'completed')
  const skipped = sessions.filter((s: WorkoutSession) => s.status === 'skipped')
  const planned = sessions.filter((s: WorkoutSession) => s.status === 'planned')

  const totalDurationSec = completed.reduce(
    (sum: number, s: WorkoutSession) => sum + (s.durationSec || 0),
    0
  )
  const totalDurationMinutes = Math.round(totalDurationSec / 60)
  const averageDurationMinutes =
    completed.length > 0 ? Math.round(totalDurationMinutes / completed.length) : 0

  const completionRate =
    sessions.length > 0 ? Math.round((completed.length / sessions.length) * 100) : 0

  // Count by context
  const sessionsByContext: Record<WorkoutContext, number> = {
    gym: 0,
    home: 0,
    road: 0,
  }
  sessions.forEach((s: WorkoutSession) => {
    sessionsByContext[s.context] = (sessionsByContext[s.context] || 0) + 1
  })

  return {
    totalSessions: sessions.length,
    completedSessions: completed.length,
    skippedSessions: skipped.length,
    plannedSessions: planned.length,
    completionRate,
    totalDurationMinutes,
    averageDurationMinutes,
    sessionsByContext,
  }
}
