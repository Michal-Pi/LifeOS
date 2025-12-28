/**
 * WorkoutStats Component
 *
 * Displays workout analytics and statistics for weekly review.
 * Shows completion rate, total volume, consistency streaks, and exercise breakdown.
 */

import { useMemo } from 'react'
import type { WorkoutSession, ExercisePerformance } from '@lifeos/training'

interface WorkoutStatsProps {
  sessions: WorkoutSession[]
  weekStartDate: Date
  weekEndDate: Date
}

interface VolumeStats {
  totalVolume: number // Total volume in kg
  totalSets: number
  totalReps: number
  workoutCount: number
}

function calculateVolume(sessions: WorkoutSession[]): VolumeStats {
  let totalVolume = 0
  let totalSets = 0
  let totalReps = 0

  sessions.forEach((session) => {
    if (session.status !== 'completed') return

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

  return {
    totalVolume,
    totalSets,
    totalReps,
    workoutCount: sessions.filter((s) => s.status === 'completed').length,
  }
}

function calculateConsistency(sessions: WorkoutSession[]): number {
  const completedSessions = sessions.filter((s) => s.status === 'completed')

  // Calculate planned workout days (non-rest days)
  const daysInWeek = 7
  const plannedDays = daysInWeek - sessions.filter((s) => s.status === 'skipped').length

  if (plannedDays === 0) return 0

  return Math.round((completedSessions.length / plannedDays) * 100)
}

function getTopExercises(sessions: WorkoutSession[]): Array<{ name: string; sets: number }> {
  const exerciseMap = new Map<string, number>()

  sessions.forEach((session) => {
    if (session.status !== 'completed') return

    session.items.forEach((item: ExercisePerformance) => {
      const name = item.displayName || 'Unknown'
      const sets = item.sets?.filter((s) => !s.isWarmup).length || 0

      exerciseMap.set(name, (exerciseMap.get(name) || 0) + sets)
    })
  })

  return Array.from(exerciseMap.entries())
    .map(([name, sets]) => ({ name, sets }))
    .sort((a, b) => b.sets - a.sets)
    .slice(0, 5)
}

export function WorkoutStats({ sessions, weekStartDate, weekEndDate }: WorkoutStatsProps) {
  const volumeStats = useMemo(() => calculateVolume(sessions), [sessions])
  const consistency = useMemo(() => calculateConsistency(sessions), [sessions])
  const topExercises = useMemo(() => getTopExercises(sessions), [sessions])

  const completedWorkouts = sessions.filter((s) => s.status === 'completed').length
  const skippedWorkouts = sessions.filter((s) => s.status === 'skipped').length
  const plannedWorkouts = sessions.filter((s) => s.status === 'planned').length

  // No workouts tracked
  if (sessions.length === 0) {
    return (
      <div className="workout-stats-empty">
        <p className="empty-state-text">No workout data for this week</p>
        <p className="empty-state-hint">Start logging workouts to see your stats here</p>
      </div>
    )
  }

  return (
    <div className="workout-stats-container">
      <div className="workout-stats-header">
        <h3>Workout Statistics</h3>
        <p className="stats-period">
          {weekStartDate.toLocaleDateString()} - {weekEndDate.toLocaleDateString()}
        </p>
      </div>

      {/* Summary Cards */}
      <div className="workout-stats-grid">
        <div className="workout-stat-card">
          <div className="stat-icon">💪</div>
          <div className="stat-content">
            <p className="stat-value">{completedWorkouts}</p>
            <p className="stat-label">Workouts Completed</p>
          </div>
        </div>

        <div className="workout-stat-card">
          <div className="stat-icon">🔥</div>
          <div className="stat-content">
            <p className="stat-value">{consistency}%</p>
            <p className="stat-label">Consistency</p>
          </div>
        </div>

        <div className="workout-stat-card">
          <div className="stat-icon">📊</div>
          <div className="stat-content">
            <p className="stat-value">{(volumeStats.totalVolume / 1000).toFixed(1)}t</p>
            <p className="stat-label">Total Volume</p>
            <p className="stat-hint">{volumeStats.totalSets} sets · {volumeStats.totalReps} reps</p>
          </div>
        </div>
      </div>

      {/* Workout Breakdown */}
      {(completedWorkouts > 0 || skippedWorkouts > 0) && (
        <div className="workout-breakdown">
          <h4>This Week's Workouts</h4>
          <div className="workout-breakdown-items">
            {completedWorkouts > 0 && (
              <div className="breakdown-item completed">
                <span className="breakdown-dot"></span>
                <span className="breakdown-label">{completedWorkouts} Completed</span>
              </div>
            )}
            {skippedWorkouts > 0 && (
              <div className="breakdown-item skipped">
                <span className="breakdown-dot"></span>
                <span className="breakdown-label">{skippedWorkouts} Skipped</span>
              </div>
            )}
            {plannedWorkouts > 0 && (
              <div className="breakdown-item planned">
                <span className="breakdown-dot"></span>
                <span className="breakdown-label">{plannedWorkouts} Planned</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Top Exercises */}
      {topExercises.length > 0 && (
        <div className="top-exercises">
          <h4>Top Exercises</h4>
          <ul className="top-exercises-list">
            {topExercises.map((exercise, index) => (
              <li key={exercise.name} className="top-exercise-item">
                <span className="exercise-rank">#{index + 1}</span>
                <span className="exercise-name">{exercise.name}</span>
                <span className="exercise-sets">{exercise.sets} sets</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Insights */}
      {completedWorkouts > 0 && (
        <div className="workout-insights">
          <h4>Insights</h4>
          <ul className="insights-list">
            {consistency >= 80 && (
              <li className="insight-item positive">
                Great consistency this week! You're building a strong routine.
              </li>
            )}
            {consistency < 50 && skippedWorkouts > 0 && (
              <li className="insight-item warning">
                You missed {skippedWorkouts} {skippedWorkouts === 1 ? 'workout' : 'workouts'} this week. Try to plan ahead for next week.
              </li>
            )}
            {volumeStats.totalVolume > 0 && (
              <li className="insight-item">
                Average volume per workout: {(volumeStats.totalVolume / completedWorkouts / 1000).toFixed(1)}t
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  )
}
