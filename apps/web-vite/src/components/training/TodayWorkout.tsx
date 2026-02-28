/**
 * TodayWorkout Component
 *
 * Displays today's workout from the active plan on TodayPage.
 * Shows scheduled exercise category blocks with time allocations.
 */

import { useState, useEffect, useMemo } from 'react'
import { useWorkoutPlan } from '@/hooks/useWorkoutPlan'
import { useWorkoutOperations } from '@/hooks/useWorkoutOperations'
import type { DayExerciseBlock, SessionStatus } from '@lifeos/training'
import { EXERCISE_CATEGORY_LABELS } from '@/utils/defaultExercises'

interface TodayWorkoutProps {
  dateKey: string
  userId: string
  variant?: 'card' | 'embedded'
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export function TodayWorkout({ dateKey, userId, variant = 'card' }: TodayWorkoutProps) {
  const { activePlan, getActivePlan } = useWorkoutPlan()
  const { exercises, sessions, listExercises, listSessions } = useWorkoutOperations()

  const [loadError, setLoadError] = useState<string | null>(null)

  // Load plan and exercises
  useEffect(() => {
    const load = async () => {
      if (!userId) return
      try {
        await Promise.all([getActivePlan(), listExercises()])
        setLoadError(null)
      } catch (err) {
        console.error('Failed to load workout data:', err)
        setLoadError((err as Error).message)
      }
    }
    void load()
  }, [userId, getActivePlan, listExercises])

  // Load today's sessions
  useEffect(() => {
    if (!userId) return
    const loadSessions = async () => {
      try {
        await listSessions(dateKey)
        setLoadError(null)
      } catch (err) {
        console.error('Failed to load workout sessions:', err)
        setLoadError((err as Error).message)
      }
    }
    void loadSessions()
  }, [userId, dateKey, listSessions])

  // Get today's day of week (0-6)
  const dayOfWeek = useMemo(() => {
    const date = new Date(dateKey + 'T00:00:00')
    return date.getDay()
  }, [dateKey])

  // Get today's schedule from active plan
  const todaySchedule = useMemo(() => {
    if (!activePlan) return null
    return activePlan.schedule.find((s) => s.dayOfWeek === dayOfWeek)
  }, [activePlan, dayOfWeek])

  // Get exercise blocks for today
  const todayBlocks = useMemo(() => {
    if (!todaySchedule || todaySchedule.restDay) return []
    return todaySchedule.blocks || []
  }, [todaySchedule])

  // Calculate total workout time
  const totalMinutes = useMemo(() => {
    return todayBlocks.reduce((sum, block) => sum + block.timeMinutes, 0)
  }, [todayBlocks])

  // Get exercise name by ID
  const getExerciseName = (exerciseId: string) => {
    const exercise = exercises.find((e) => e.exerciseId === exerciseId)
    if (!exercise) return 'Unknown'
    return exercise.generic_name || exercise.name || 'Unknown'
  }

  // Get today's session
  const todaySession = useMemo(() => {
    return sessions.find((s) => s.dateKey === dateKey)
  }, [sessions, dateKey])

  // Render a single exercise block
  const renderBlock = (block: DayExerciseBlock, index: number) => {
    const hasExercises = block.exerciseIds && block.exerciseIds.length > 0

    return (
      <div key={index} className="today-workout-block">
        <div className="workout-block-header">
          <span className="workout-block-category">{EXERCISE_CATEGORY_LABELS[block.category]}</span>
          <span className="workout-block-time">{block.timeMinutes} min</span>
        </div>
        {hasExercises && (
          <ul className="workout-block-exercises">
            {block.exerciseIds!.map((exId) => (
              <li key={exId} className="workout-block-exercise">
                {getExerciseName(exId)}
              </li>
            ))}
          </ul>
        )}
      </div>
    )
  }

  // If no active plan
  if (!activePlan) {
    return (
      <section
        className={`today-workout-card ${variant === 'embedded' ? 'today-subsection today-workout-card--embedded' : ''}`}
      >
        <div className="today-workout-header">
          <p className="section-label">Training</p>
        </div>
        {loadError && (
          <div className="empty-state">
            <p className="empty-state-text">Workout data unavailable</p>
            <p className="empty-state-hint">{loadError}</p>
          </div>
        )}
        <div className="empty-state">
          <p className="empty-state-text">No active plan yet</p>
          <p className="empty-state-hint">Set one up to schedule workouts for the week.</p>
        </div>
      </section>
    )
  }

  // If rest day
  if (todaySchedule?.restDay) {
    return (
      <section
        className={`today-workout-card ${variant === 'embedded' ? 'today-subsection today-workout-card--embedded' : ''}`}
      >
        <div className="today-workout-header">
          <p className="section-label">Today's Workout - {DAY_NAMES[dayOfWeek]}</p>
        </div>
        <div className="rest-day-message">
          <p className="rest-day-text">Recovery day</p>
          <p className="rest-day-hint">Protect the reset and come back stronger.</p>
        </div>
      </section>
    )
  }

  // If no blocks scheduled
  if (todayBlocks.length === 0) {
    return (
      <section
        className={`today-workout-card ${variant === 'embedded' ? 'today-subsection today-workout-card--embedded' : ''}`}
      >
        <div className="today-workout-header">
          <p className="section-label">Today's Workout - {DAY_NAMES[dayOfWeek]}</p>
        </div>
        <div className="empty-state">
          <p className="empty-state-text">No workout scheduled</p>
          <p className="empty-state-hint">Add exercise categories to your plan for today.</p>
        </div>
      </section>
    )
  }

  // Get session status
  const sessionStatus: SessionStatus = todaySession?.status || 'planned'
  const isCompleted = sessionStatus === 'completed'
  const isInProgress = sessionStatus === 'in_progress'

  return (
    <section
      className={`today-workout-card ${variant === 'embedded' ? 'today-subsection today-workout-card--embedded' : ''}`}
    >
      <div className="today-workout-header">
        <div>
          <p className="section-label">Today's Workout - {DAY_NAMES[dayOfWeek]}</p>
          {isCompleted && <span className="workout-status-badge completed">Completed</span>}
          {isInProgress && <span className="workout-status-badge in-progress">In Progress</span>}
        </div>
        <span className="workout-total-time">{totalMinutes} min total</span>
      </div>

      <div className="today-workout-content">
        <div className="today-workout-blocks">
          {todayBlocks.map((block, index) => renderBlock(block, index))}
        </div>
      </div>
    </section>
  )
}
