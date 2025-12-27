/**
 * Habits Page
 *
 * Main page for managing habits.
 * Displays all habits, allows creating/editing/archiving them,
 * and shows progress statistics.
 */

import { useState, useEffect, useMemo } from 'react'
import type {
  CanonicalHabit,
  HabitStatus,
  HabitId,
  CreateHabitInput,
  UpdateHabitInput,
} from '@lifeos/habits'
import { useAuth } from '@/hooks/useAuth'
import { useHabitOperations } from '@/hooks/useHabitOperations'
import { HabitFormModal } from '@/components/habits/HabitFormModal'

export function HabitsPage() {
  const { user } = useAuth()
  const userId = user?.uid ?? ''

  const {
    habits,
    listHabits,
    createHabit,
    updateHabit,
    deleteHabit,
    getHabitStats,
    isLoading,
  } = useHabitOperations()

  const [filterStatus, setFilterStatus] = useState<HabitStatus>('active')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingHabit, setEditingHabit] = useState<CanonicalHabit | null>(null)
  const [stats, setStats] = useState<Map<string, { streak: number; completionRate: number }>>(
    new Map()
  )

  useEffect(() => {
    if (!userId) return

    const loadData = async () => {
      try {
        await listHabits({ status: filterStatus })
      } catch (error) {
        console.error('Failed to load habits:', error)
      }
    }

    void loadData()
  }, [userId, filterStatus, listHabits])

  // Load stats for each habit
  useEffect(() => {
    const loadStats = async () => {
      const statsMap = new Map()

      await Promise.all(
        habits.map(async (habit) => {
          try {
            const habitStats = await getHabitStats(habit.habitId, 30)
            statsMap.set(habit.habitId, {
              streak: habitStats.currentStreak,
              completionRate: habitStats.completionRate,
            })
          } catch (error) {
            console.error(`Failed to load stats for habit ${habit.habitId}:`, error)
          }
        })
      )

      setStats(statsMap)
    }

    if (habits.length > 0) {
      void loadStats()
    }
  }, [habits, getHabitStats])

  const filteredHabits = useMemo(() => {
    return habits.filter((h) => h.status === filterStatus)
  }, [habits, filterStatus])

  const handleCreateHabit = async (habitData: Partial<CanonicalHabit>) => {
    try {
      await createHabit(habitData as Omit<CreateHabitInput, 'userId'>)
      await listHabits({ status: filterStatus })
    } catch (error) {
      console.error('Failed to create habit:', error)
    }
  }

  const handleUpdateHabit = async (habitData: Partial<CanonicalHabit>) => {
    if (!editingHabit) return

    try {
      await updateHabit(editingHabit.habitId, habitData as UpdateHabitInput)
      await listHabits({ status: filterStatus })
      setEditingHabit(null)
    } catch (error) {
      console.error('Failed to update habit:', error)
    }
  }

  const handleArchiveHabit = async (habitId: string) => {
    if (!confirm('Archive this habit? You can restore it later from the Archived tab.')) return

    try {
      await updateHabit(habitId as HabitId, { status: 'archived' })
      await listHabits({ status: filterStatus })
    } catch (error) {
      console.error('Failed to archive habit:', error)
    }
  }

  const handleDeleteHabit = async (habitId: string) => {
    if (
      !confirm(
        'Permanently delete this habit? This will delete all check-in history. This cannot be undone.'
      )
    )
      return

    try {
      await deleteHabit(habitId as HabitId)
      await listHabits({ status: filterStatus })
    } catch (error) {
      console.error('Failed to delete habit:', error)
    }
  }

  const handleEditHabit = (habit: CanonicalHabit) => {
    setEditingHabit(habit)
    setIsModalOpen(true)
  }

  const handleModalClose = () => {
    setIsModalOpen(false)
    setEditingHabit(null)
  }

  return (
    <div className="habits-page">
      <div className="page-header">
        <h1>Habits</h1>
        <button className="button-primary" onClick={() => setIsModalOpen(true)}>
          + New Habit
        </button>
      </div>

      <div className="habits-filters">
        <button
          className={`filter-button ${filterStatus === 'active' ? 'active' : ''}`}
          onClick={() => setFilterStatus('active')}
        >
          Active
        </button>
        <button
          className={`filter-button ${filterStatus === 'paused' ? 'active' : ''}`}
          onClick={() => setFilterStatus('paused')}
        >
          Paused
        </button>
        <button
          className={`filter-button ${filterStatus === 'archived' ? 'active' : ''}`}
          onClick={() => setFilterStatus('archived')}
        >
          Archived
        </button>
      </div>

      {isLoading && filteredHabits.length === 0 ? (
        <div className="empty-state">
          <p>Loading habits...</p>
        </div>
      ) : filteredHabits.length === 0 ? (
        <div className="empty-state">
          <h2>No {filterStatus} habits</h2>
          <p>
            {filterStatus === 'active'
              ? 'Create your first habit to get started!'
              : `You don't have any ${filterStatus} habits.`}
          </p>
          {filterStatus === 'active' && (
            <button className="button-primary" onClick={() => setIsModalOpen(true)}>
              Create Habit
            </button>
          )}
        </div>
      ) : (
        <div className="habits-grid">
          {filteredHabits.map((habit) => {
            const habitStats = stats.get(habit.habitId)

            return (
              <div key={habit.habitId} className="habit-card">
                <div className="habit-card-header">
                  <h3>{habit.title}</h3>
                  <span className="habit-domain">{habit.domain}</span>
                </div>

                <div className="habit-card-body">
                  <div className="habit-recipe">
                    <div>
                      <strong>Standard:</strong> {habit.recipe.standard}
                    </div>
                    {habit.recipe.tiny && (
                      <div>
                        <strong>Tiny:</strong> {habit.recipe.tiny}
                      </div>
                    )}
                  </div>

                  <div className="habit-schedule">
                    <strong>Schedule:</strong>
                    <div className="days-display">
                      {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, index) => (
                        <span
                          key={index}
                          className={`day-badge ${habit.schedule.daysOfWeek.includes(index) ? 'active' : ''}`}
                        >
                          {day}
                        </span>
                      ))}
                    </div>
                  </div>

                  {habitStats && (
                    <div className="habit-stats">
                      <div className="stat">
                        <span className="stat-label">Current Streak</span>
                        <span className="stat-value">{habitStats.streak} days</span>
                      </div>
                      <div className="stat">
                        <span className="stat-label">Completion Rate</span>
                        <span className="stat-value">
                          {Math.round(habitStats.completionRate * 100)}%
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                <div className="habit-card-actions">
                  <button className="button-secondary small" onClick={() => handleEditHabit(habit)}>
                    Edit
                  </button>
                  {filterStatus === 'active' && (
                    <button
                      className="button-secondary small"
                      onClick={() => handleArchiveHabit(habit.habitId)}
                    >
                      Archive
                    </button>
                  )}
                  {filterStatus === 'archived' && (
                    <button
                      className="button-danger small"
                      onClick={() => handleDeleteHabit(habit.habitId)}
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <HabitFormModal
        isOpen={isModalOpen}
        onClose={handleModalClose}
        onSave={editingHabit ? handleUpdateHabit : handleCreateHabit}
        existingHabit={editingHabit}
      />
    </div>
  )
}
