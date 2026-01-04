/**
 * Habits and Mind Step Component
 *
 * Weekly review step showing:
 * - Habit consistency charts and streaks
 * - Mind intervention usage summary
 * - Personalized recommendations
 * - Reflection prompts
 */

import { useEffect, useState, useCallback } from 'react'
import { format } from 'date-fns'
import { useHabitOperations } from '@/hooks/useHabitOperations'
import { useHabitProgress } from '@/hooks/useHabitProgress'
import { useMindInterventions } from '@/hooks/useMindInterventions'
import { HabitConsistencyChart } from '@/components/habits/HabitConsistencyChart'
import { InterventionSummary } from '@/components/mind/InterventionSummary'
import { HabitRecommendations } from '@/components/habits/HabitRecommendations'

interface HabitsAndMindStepProps {
  userId: string
  weekStartDate: Date
  weekEndDate: Date
  onNext: () => void
}

interface HabitStatWithStreak {
  habit: { habitId: string; title: string }
  doneCount: number
  tinyCount: number
  skipCount: number
  missedCount: number
  consistencyPercent: number
  currentStreak: number
}

export function HabitsAndMindStep({
  userId,
  weekStartDate,
  weekEndDate,
  onNext,
}: HabitsAndMindStepProps) {
  const { habits } = useHabitOperations({ userId })
  const { getWeeklyStats, calculateStreak } = useHabitProgress()
  const { sessions } = useMindInterventions()

  const [weeklyStats, setWeeklyStats] = useState<HabitStatWithStreak[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [interventionCount, setInterventionCount] = useState(0)

  const loadWeeklyData = useCallback(async () => {
    setIsLoading(true)

    try {
      const startKey = format(weekStartDate, 'yyyy-MM-dd')
      const endKey = format(weekEndDate, 'yyyy-MM-dd')

      // Get stats for each active habit
      const activeHabits = habits.filter((h) => h.status === 'active')

      const stats = await Promise.all(
        activeHabits.map(async (habit) => {
          const weekStats = await getWeeklyStats(habit.habitId, startKey, endKey)
          const streak = await calculateStreak(habit.habitId)

          return {
            habit: { habitId: habit.habitId, title: habit.title },
            ...weekStats,
            currentStreak: streak,
          }
        })
      )

      setWeeklyStats(stats)

      // Filter interventions for this week
      const weekSessions = sessions.filter((session) => {
        const sessionDate = new Date(session.startedAtMs)
        return sessionDate >= weekStartDate && sessionDate <= weekEndDate
      })

      setInterventionCount(weekSessions.length)
    } catch (error) {
      console.error('Failed to load weekly data:', error)
    } finally {
      setIsLoading(false)
    }
  }, [weekStartDate, weekEndDate, habits, getWeeklyStats, calculateStreak, sessions])

  useEffect(() => {
    loadWeeklyData()
  }, [loadWeeklyData])

  if (isLoading) {
    return (
      <div className="weekly-review-step habits-mind-step">
        <h2>📊 Habits & Mind Review</h2>
        <p className="step-subtitle">Loading your weekly data...</p>
      </div>
    )
  }

  return (
    <div className="weekly-review-step habits-mind-step">
      <h2>📊 Habits & Mind Review</h2>
      <p className="step-subtitle">How did your habits and mindset go this week?</p>

      {/* Habit Consistency Overview */}
      {weeklyStats.length > 0 ? (
        <section className="review-section">
          <h3>Habit Consistency</h3>
          <HabitConsistencyChart stats={weeklyStats} />

          <div className="stats-summary">
            {weeklyStats.map((stat) => (
              <div key={stat.habit.habitId} className="habit-stat-card">
                <div className="habit-stat-header">
                  <h4>{stat.habit.title}</h4>
                  {stat.currentStreak > 0 && (
                    <span className="streak-badge">🔥 {stat.currentStreak} day streak</span>
                  )}
                </div>

                <div className="habit-stat-metrics">
                  <div className="metric">
                    <span className="metric-label">Consistency</span>
                    <span className="metric-value">{stat.consistencyPercent}%</span>
                  </div>
                  <div className="metric">
                    <span className="metric-label">Done</span>
                    <span className="metric-value">{stat.doneCount}</span>
                  </div>
                  <div className="metric">
                    <span className="metric-label">Tiny</span>
                    <span className="metric-value">{stat.tinyCount}</span>
                  </div>
                  <div className="metric">
                    <span className="metric-label">Skipped</span>
                    <span className="metric-value">{stat.skipCount}</span>
                  </div>
                </div>

                {/* Streak celebration */}
                {stat.currentStreak > 7 && (
                  <p className="streak-message">
                    🎉 Amazing! You've kept this habit going for over a week!
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      ) : (
        <section className="review-section">
          <h3>Habit Consistency</h3>
          <p>No active habits this week. Consider adding a tiny habit to get started!</p>
        </section>
      )}

      {/* Mind Intervention Summary */}
      <section className="review-section">
        <h3>Mind & Stress Management</h3>
        <InterventionSummary sessions={sessions} weekStart={weekStartDate} weekEnd={weekEndDate} />
      </section>

      {/* Recommendations */}
      <section className="review-section">
        <h3>💡 Recommendations for Next Week</h3>
        <HabitRecommendations stats={weeklyStats} interventionCount={interventionCount} />
      </section>

      {/* Reflection Prompts */}
      <section className="review-section">
        <h3>Reflection</h3>

        <div className="reflection-prompt">
          <label htmlFor="habit-pattern">What habit pattern worked well this week?</label>
          <textarea
            id="habit-pattern"
            placeholder="e.g., Doing my morning meditation right after waking up..."
            rows={3}
          />
        </div>

        <div className="reflection-prompt">
          <label htmlFor="habit-obstacle">What got in the way of your habits?</label>
          <textarea
            id="habit-obstacle"
            placeholder="e.g., Late nights made morning habits harder..."
            rows={3}
          />
        </div>

        <div className="reflection-prompt">
          <label htmlFor="habit-adjustment">What will you adjust for next week?</label>
          <textarea
            id="habit-adjustment"
            placeholder="e.g., Set earlier bedtime alarm to protect morning routine..."
            rows={3}
          />
        </div>
      </section>

      <div className="step-actions">
        <button type="button" className="primary-button" onClick={onNext}>
          Continue to Next Week Planning →
        </button>
      </div>
    </div>
  )
}
