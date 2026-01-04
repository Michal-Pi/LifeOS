/**
 * Habit Check-In Card Component
 *
 * Displays today's habits with quick check-in buttons.
 * Shows streak information and allows marking habits as done/tiny/skip.
 */

import { useState, useEffect } from 'react'
import type { CanonicalHabit, CanonicalHabitCheckin, HabitId } from '@lifeos/habits'
import { useHabitOperations } from '@/hooks/useHabitOperations'

interface HabitCheckInCardProps {
  userId: string
  dateKey: string
  variant?: 'card' | 'embedded'
}

export function HabitCheckInCard({ userId, dateKey, variant = 'card' }: HabitCheckInCardProps) {
  const { listHabitsForDate, listCheckinsForDate, upsertCheckin, getHabitStats, isLoading } =
    useHabitOperations()

  const [habits, setHabits] = useState<CanonicalHabit[]>([])
  const [checkins, setCheckins] = useState<Map<string, CanonicalHabitCheckin>>(new Map())
  const [streaks, setStreaks] = useState<Map<string, number>>(new Map())

  useEffect(() => {
    if (!userId) return

    const loadData = async () => {
      try {
        // Load habits scheduled for today
        const todayHabits = await listHabitsForDate(dateKey)
        setHabits(todayHabits)

        // Load existing check-ins
        const todayCheckins = await listCheckinsForDate(dateKey)
        const checkinMap = new Map<string, CanonicalHabitCheckin>()
        todayCheckins.forEach((checkin) => {
          checkinMap.set(checkin.habitId, checkin)
        })
        setCheckins(checkinMap)

        // Load streaks for each habit
        const streakMap = new Map<string, number>()
        await Promise.all(
          todayHabits.map(async (habit) => {
            const stats = await getHabitStats(habit.habitId, 30)
            streakMap.set(habit.habitId, stats.currentStreak)
          })
        )
        setStreaks(streakMap)
      } catch (error) {
        console.error('Failed to load habits:', error)
      }
    }

    void loadData()
  }, [userId, dateKey, listHabitsForDate, listCheckinsForDate, getHabitStats])

  const handleCheckIn = async (habitId: string, status: 'done' | 'tiny' | 'skip') => {
    try {
      const checkin = await upsertCheckin({
        habitId: habitId as HabitId,
        dateKey,
        status,
        sourceType: 'manual',
      })

      // Update local state
      setCheckins((prev) => new Map(prev).set(habitId, checkin))
    } catch (error) {
      console.error('Failed to check in habit:', error)
    }
  }

  if (isLoading && habits.length === 0) {
    return (
      <div
        className={`habit-checkin-card ${variant === 'embedded' ? 'today-subsection habit-checkin-card--embedded' : ''}`}
      >
        <p className="section-label">Habits</p>
        <div className="empty-state">
          <p className="empty-state-text">Loading habits...</p>
        </div>
      </div>
    )
  }

  if (habits.length === 0) {
    return (
      <div
        className={`habit-checkin-card ${variant === 'embedded' ? 'today-subsection habit-checkin-card--embedded' : ''}`}
      >
        <p className="section-label">Habits</p>
        <div className="empty-state">
          <p className="empty-state-text">No habits queued</p>
          <p className="empty-state-hint">Add one to build your daily rhythm.</p>
        </div>
      </div>
    )
  }

  const completedCount = Array.from(checkins.values()).filter(
    (c) => c.status === 'done' || c.status === 'tiny'
  ).length

  return (
    <div
      className={`habit-checkin-card ${variant === 'embedded' ? 'today-subsection habit-checkin-card--embedded' : ''}`}
    >
      <div className="habit-checkin-header">
        <p className="section-label">Habits</p>
        <span className="habit-progress">
          {completedCount}/{habits.length}
        </span>
      </div>

      <div className="habit-list">
        {habits.map((habit) => {
          const checkin = checkins.get(habit.habitId)
          const streak = streaks.get(habit.habitId) || 0

          return (
            <div key={habit.habitId} className="habit-item">
              <div className="habit-info">
                <div className="habit-title">{habit.title}</div>
                <div className="habit-meta">
                  {streak > 0 && <span className="habit-streak">{streak} day streak</span>}
                  {habit.recipe.tiny && (
                    <span className="habit-tiny">Tiny: {habit.recipe.tiny}</span>
                  )}
                </div>
              </div>

              <div className="habit-actions">
                <button
                  className={`habit-btn ${checkin?.status === 'done' ? 'active' : ''}`}
                  onClick={() => handleCheckIn(habit.habitId, 'done')}
                  title="Mark as done"
                >
                  ✓
                </button>
                <button
                  className={`habit-btn tiny ${checkin?.status === 'tiny' ? 'active' : ''}`}
                  onClick={() => handleCheckIn(habit.habitId, 'tiny')}
                  title="Mark as tiny version"
                >
                  ½
                </button>
                <button
                  className={`habit-btn skip ${checkin?.status === 'skip' ? 'active' : ''}`}
                  onClick={() => handleCheckIn(habit.habitId, 'skip')}
                  title="Skip today"
                >
                  ×
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
