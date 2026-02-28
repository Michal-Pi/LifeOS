/**
 * WorkoutPlanPage Component
 *
 * Manage weekly workout plan - assign exercise categories to specific days.
 * Users can create a weekly schedule with different exercise categories for each day.
 */

import { useState, useEffect, useCallback } from 'react'
import { useWorkoutPlan } from '@/hooks/useWorkoutPlan'
import { useWorkoutOperations } from '@/hooks/useWorkoutOperations'
import { PlanFormModal } from '@/components/training/PlanFormModal'
import { WorkoutAIToolsDropdown } from '@/components/training/WorkoutAIToolsDropdown'
import type { WorkoutDaySchedule, ExerciseId } from '@lifeos/training'
import { EXERCISE_CATEGORY_LABELS } from '@/utils/defaultExercises'
import { useDialog } from '@/contexts/useDialog'

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export function WorkoutPlanPage() {
  const { activePlan, listPlans, deletePlan } = useWorkoutPlan()
  const { exercises, listExercises } = useWorkoutOperations()
  const { confirm } = useDialog()

  const [showFormModal, setShowFormModal] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load plan and exercises on mount
  useEffect(() => {
    const load = async () => {
      try {
        await Promise.all([listPlans(), listExercises()])
      } catch (err) {
        setError((err as Error).message)
      }
    }

    void load()
  }, [listPlans, listExercises])

  const handleCreatePlan = useCallback(() => {
    setShowFormModal(true)
  }, [])

  const handleCloseModal = useCallback(() => {
    setShowFormModal(false)
  }, [])

  const handleSaveModal = useCallback(async () => {
    // Reload plan after save
    await listPlans()
    setShowFormModal(false)
  }, [listPlans])

  const handleDeletePlan = useCallback(async () => {
    if (!activePlan) return

    const confirmed = await confirm({
      title: 'Delete workout plan',
      description: 'This will permanently delete your current workout plan. This cannot be undone.',
      confirmLabel: 'Delete',
      confirmVariant: 'danger',
    })
    if (!confirmed) return

    try {
      await deletePlan(activePlan.planId)
      await listPlans()
      setError(null)
    } catch (err) {
      setError((err as Error).message)
    }
  }, [activePlan, confirm, deletePlan, listPlans])

  const getExerciseName = (exerciseId: ExerciseId | undefined): string => {
    if (!exerciseId) return 'Unknown'
    const ex = exercises.find((e) => e.exerciseId === exerciseId)
    if (!ex) return 'Unknown'
    const name = ex.generic_name || ex.name || 'Unknown'
    const target = ex.target_muscle_group
    const targetStr = Array.isArray(target) ? target.join(', ') : target
    return targetStr ? `${name} (${targetStr})` : name
  }

  // Calculate total time for a day
  const getDayTotalTime = (day: WorkoutDaySchedule): number => {
    if (day.restDay) return 0
    return (day.blocks || []).reduce((sum, block) => sum + block.timeMinutes, 0)
  }

  return (
    <div className="plan-page">
      <header className="plan-header">
        <div>
          <p className="section-label">Training</p>
          <h1>Workout Plan</h1>
          <p className="plan-meta">
            {activePlan
              ? 'Your weekly training schedule'
              : 'Create a weekly plan to schedule your workouts'}
          </p>
        </div>
        <div className="plan-header-actions">
          <WorkoutAIToolsDropdown
            activePlan={activePlan}
            exercises={exercises}
            onPlanCreated={() => void listPlans()}
            onPlanUpdated={() => void listPlans()}
          />
          {activePlan ? (
            <>
              <button className="ghost-button" onClick={handleCreatePlan}>
                Edit Plan
              </button>
              <button className="ghost-button danger" onClick={handleDeletePlan}>
                Delete Plan
              </button>
            </>
          ) : (
            <button className="primary-button" onClick={handleCreatePlan}>
              + Create Plan
            </button>
          )}
        </div>
      </header>

      {error && (
        <div className="error-banner">
          <span>{error}</span>
          <button onClick={() => setError(null)}>x</button>
        </div>
      )}

      {/* Active Plan Display */}
      {activePlan ? (
        <div className="plan-schedule">
          <div className="plan-schedule-header">
            <h2>Weekly Schedule</h2>
          </div>

          <div className="plan-days-grid">
            {activePlan.schedule.map((day: WorkoutDaySchedule, index: number) => {
              const totalTime = getDayTotalTime(day)
              const hasBlocks = (day.blocks || []).length > 0

              return (
                <div key={index} className={`plan-day-card ${day.restDay ? 'rest-day' : ''}`}>
                  <div className="plan-day-header">
                    <h3>{DAY_NAMES[day.dayOfWeek]}</h3>
                    {day.restDay && <span className="rest-badge">Rest</span>}
                    {!day.restDay && totalTime > 0 && (
                      <span className="time-badge">{totalTime} min</span>
                    )}
                  </div>

                  {day.restDay ? (
                    <div className="plan-day-body rest">
                      <p>Recovery day</p>
                    </div>
                  ) : hasBlocks ? (
                    <div className="plan-day-body">
                      {(day.blocks || []).map((block, blockIndex) => (
                        <div key={blockIndex} className="plan-block">
                          <div className="plan-block-header">
                            <span className="plan-block-category">
                              {EXERCISE_CATEGORY_LABELS[block.category] || block.category}
                            </span>
                            <span className="plan-block-time">{block.timeMinutes} min</span>
                          </div>
                          {(block.exerciseIds || []).length > 0 && (
                            <ul className="plan-block-exercises">
                              {(block.exerciseIds || []).map((exId) => (
                                <li key={exId}>{getExerciseName(exId)}</li>
                              ))}
                            </ul>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="plan-day-body empty">
                      <p>No workouts scheduled</p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        <div className="empty-state">
          <p>No active plan. Create a weekly workout plan to get started!</p>
        </div>
      )}

      {/* Plan Form Modal */}
      <PlanFormModal isOpen={showFormModal} onClose={handleCloseModal} onSave={handleSaveModal} />
    </div>
  )
}
