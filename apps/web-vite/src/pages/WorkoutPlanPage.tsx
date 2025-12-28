/**
 * WorkoutPlanPage Component
 *
 * Manage weekly workout plan - assign templates to specific days.
 * Users can create a weekly schedule with different templates for each day.
 */

import { useState, useEffect, useCallback } from 'react'
import { useWorkoutPlan } from '@/hooks/useWorkoutPlan'
import { useWorkoutTemplates } from '@/hooks/useWorkoutTemplates'
import { PlanFormModal } from '@/components/training/PlanFormModal'
import type { WorkoutDaySchedule, WorkoutContext } from '@lifeos/training'

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const CONTEXT_ICONS: Record<WorkoutContext, string> = {
  gym: '🏋️',
  home: '🏠',
  road: '🏃',
}

export function WorkoutPlanPage() {
  const { activePlan, listPlans } = useWorkoutPlan()
  const { templates, listTemplates } = useWorkoutTemplates()

  const [showFormModal, setShowFormModal] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load plan and templates on mount
  useEffect(() => {
    const load = async () => {
      try {
        await Promise.all([listPlans(), listTemplates()])
      } catch (err) {
        setError((err as Error).message)
      }
    }

    void load()
  }, [listPlans, listTemplates])

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

  const getTemplateById = (templateId: string | undefined) => {
    if (!templateId) return null
    return templates.find((t) => t.templateId === templateId)
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
        {!activePlan && (
          <button className="primary-button" onClick={handleCreatePlan}>
            + Create Plan
          </button>
        )}
      </header>

      {error && (
        <div className="error-banner">
          <span>⚠ {error}</span>
          <button onClick={() => setError(null)}>✕</button>
        </div>
      )}

      {/* Active Plan Display */}
      {activePlan ? (
        <div className="plan-schedule">
          <div className="plan-schedule-header">
            <h2>Weekly Schedule</h2>
            <button className="ghost-button" onClick={handleCreatePlan}>
              Edit Plan
            </button>
          </div>

          <div className="plan-days-grid">
            {activePlan.schedule.map((day: WorkoutDaySchedule, index: number) => {
              const gymTemplate = getTemplateById(day.variants.gymTemplateId)
              const homeTemplate = getTemplateById(day.variants.homeTemplateId)
              const roadTemplate = getTemplateById(day.variants.roadTemplateId)
              const hasTemplates = gymTemplate || homeTemplate || roadTemplate

              return (
                <div
                  key={index}
                  className={`plan-day-card ${day.restDay ? 'rest-day' : ''}`}
                >
                  <div className="plan-day-header">
                    <h3>{DAY_NAMES[day.dayOfWeek]}</h3>
                    {day.restDay && <span className="rest-badge">Rest</span>}
                  </div>

                  {day.restDay ? (
                    <div className="plan-day-body rest">
                      <p>😌 Recovery day</p>
                    </div>
                  ) : hasTemplates ? (
                    <div className="plan-day-body">
                      {gymTemplate && (
                        <div className="plan-variant">
                          <span className="variant-icon">{CONTEXT_ICONS.gym}</span>
                          <span className="variant-name">{gymTemplate.title}</span>
                          <span className="variant-exercises">
                            {gymTemplate.items.length} exercises
                          </span>
                        </div>
                      )}
                      {homeTemplate && (
                        <div className="plan-variant">
                          <span className="variant-icon">{CONTEXT_ICONS.home}</span>
                          <span className="variant-name">{homeTemplate.title}</span>
                          <span className="variant-exercises">
                            {homeTemplate.items.length} exercises
                          </span>
                        </div>
                      )}
                      {roadTemplate && (
                        <div className="plan-variant">
                          <span className="variant-icon">{CONTEXT_ICONS.road}</span>
                          <span className="variant-name">{roadTemplate.title}</span>
                          <span className="variant-exercises">
                            {roadTemplate.items.length} exercises
                          </span>
                        </div>
                      )}
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
