/**
 * Workout Analytics Utilities
 *
 * Utility functions for calculating workout statistics and analytics.
 */

import type { WorkoutSession, ExercisePerformance } from '@lifeos/training'

export interface VolumeMetrics {
  totalVolume: number // Total volume in kg
  totalSets: number
  totalReps: number
  workoutCount: number
  averageVolumePerWorkout: number
}

export interface ConsistencyMetrics {
  completedWorkouts: number
  skippedWorkouts: number
  plannedWorkouts: number
  consistencyPercentage: number
  currentStreak: number
}

export interface ExerciseStats {
  exerciseId: string
  displayName: string
  totalSets: number
  totalReps: number
  totalVolume: number
  maxWeight: number
  averageReps: number
}

/**
 * Calculate total volume metrics from sessions
 */
export function calculateVolumeMetrics(sessions: WorkoutSession[]): VolumeMetrics {
  let totalVolume = 0
  let totalSets = 0
  let totalReps = 0

  const completedSessions = sessions.filter((s) => s.status === 'completed')

  completedSessions.forEach((session) => {
    session.items.forEach((item: ExercisePerformance) => {
      if (!item.sets) return

      item.sets.forEach((set) => {
        if (set.isWarmup) return // Skip warmup sets

        const reps = set.reps || 0
        const weight = set.weightKg || 0

        totalSets++
        totalReps += reps
        totalVolume += reps * weight
      })
    })
  })

  const workoutCount = completedSessions.length
  const averageVolumePerWorkout = workoutCount > 0 ? totalVolume / workoutCount : 0

  return {
    totalVolume,
    totalSets,
    totalReps,
    workoutCount,
    averageVolumePerWorkout,
  }
}

/**
 * Calculate consistency metrics
 */
export function calculateConsistencyMetrics(sessions: WorkoutSession[]): ConsistencyMetrics {
  const completedWorkouts = sessions.filter((s) => s.status === 'completed').length
  const skippedWorkouts = sessions.filter((s) => s.status === 'skipped').length
  const plannedWorkouts = sessions.filter((s) => s.status === 'planned').length

  const totalPlanned = completedWorkouts + skippedWorkouts + plannedWorkouts
  const consistencyPercentage = totalPlanned > 0 ? Math.round((completedWorkouts / totalPlanned) * 100) : 0

  // Calculate current streak (consecutive completed days)
  const sortedSessions = [...sessions].sort((a, b) => b.dateKey.localeCompare(a.dateKey))
  let currentStreak = 0

  for (const session of sortedSessions) {
    if (session.status === 'completed') {
      currentStreak++
    } else if (session.status === 'skipped') {
      break
    }
  }

  return {
    completedWorkouts,
    skippedWorkouts,
    plannedWorkouts,
    consistencyPercentage,
    currentStreak,
  }
}

/**
 * Get exercise-specific statistics
 */
export function calculateExerciseStats(sessions: WorkoutSession[]): ExerciseStats[] {
  const exerciseMap = new Map<
    string,
    {
      displayName: string
      totalSets: number
      totalReps: number
      totalVolume: number
      maxWeight: number
      repsArray: number[]
    }
  >()

  sessions.forEach((session) => {
    if (session.status !== 'completed') return

    session.items.forEach((item: ExercisePerformance) => {
      const key = item.exerciseId
      const existing = exerciseMap.get(key) || {
        displayName: item.displayName || 'Unknown',
        totalSets: 0,
        totalReps: 0,
        totalVolume: 0,
        maxWeight: 0,
        repsArray: [],
      }

      if (!item.sets) {
        exerciseMap.set(key, existing)
        return
      }

      item.sets.forEach((set) => {
        if (set.isWarmup) return

        const reps = set.reps || 0
        const weight = set.weightKg || 0

        existing.totalSets++
        existing.totalReps += reps
        existing.totalVolume += reps * weight
        existing.maxWeight = Math.max(existing.maxWeight, weight)
        existing.repsArray.push(reps)
      })

      exerciseMap.set(key, existing)
    })
  })

  return Array.from(exerciseMap.entries()).map(([exerciseId, data]) => ({
    exerciseId,
    displayName: data.displayName,
    totalSets: data.totalSets,
    totalReps: data.totalReps,
    totalVolume: data.totalVolume,
    maxWeight: data.maxWeight,
    averageReps: data.repsArray.length > 0 ? data.repsArray.reduce((a, b) => a + b, 0) / data.repsArray.length : 0,
  }))
}

/**
 * Get top exercises by volume
 */
export function getTopExercisesByVolume(sessions: WorkoutSession[], limit = 5): ExerciseStats[] {
  const stats = calculateExerciseStats(sessions)
  return stats.sort((a, b) => b.totalVolume - a.totalVolume).slice(0, limit)
}

/**
 * Get top exercises by frequency (total sets)
 */
export function getTopExercisesByFrequency(sessions: WorkoutSession[], limit = 5): ExerciseStats[] {
  const stats = calculateExerciseStats(sessions)
  return stats.sort((a, b) => b.totalSets - a.totalSets).slice(0, limit)
}

/**
 * Calculate volume trend (comparison with previous period)
 */
export function calculateVolumeTrend(currentSessions: WorkoutSession[], previousSessions: WorkoutSession[]): {
  currentVolume: number
  previousVolume: number
  change: number
  changePercentage: number
} {
  const currentMetrics = calculateVolumeMetrics(currentSessions)
  const previousMetrics = calculateVolumeMetrics(previousSessions)

  const change = currentMetrics.totalVolume - previousMetrics.totalVolume
  const changePercentage =
    previousMetrics.totalVolume > 0 ? (change / previousMetrics.totalVolume) * 100 : 0

  return {
    currentVolume: currentMetrics.totalVolume,
    previousVolume: previousMetrics.totalVolume,
    change,
    changePercentage,
  }
}

/**
 * Get workout duration statistics
 */
export function calculateDurationStats(sessions: WorkoutSession[]): {
  averageDuration: number
  totalDuration: number
  shortestDuration: number
  longestDuration: number
} {
  const completedSessions = sessions.filter((s) => s.status === 'completed' && s.durationSec)

  if (completedSessions.length === 0) {
    return {
      averageDuration: 0,
      totalDuration: 0,
      shortestDuration: 0,
      longestDuration: 0,
    }
  }

  const durations = completedSessions.map((s) => s.durationSec!).filter((d) => d > 0)

  const totalDuration = durations.reduce((sum, d) => sum + d, 0)
  const averageDuration = totalDuration / durations.length

  return {
    averageDuration,
    totalDuration,
    shortestDuration: Math.min(...durations),
    longestDuration: Math.max(...durations),
  }
}
