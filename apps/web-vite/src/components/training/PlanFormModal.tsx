/**
 * PlanFormModal Component
 *
 * Modal for creating and editing workout plans.
 * Features:
 * - Set start date
 * - Assign templates to each day of the week
 * - Support for 3 variants per day (Gym/Home/Road)
 * - Mark days as rest days
 */

import { useState, useEffect } from 'react'
import { useWorkoutPlan } from '@/hooks/useWorkoutPlan'
import { useWorkoutTemplates } from '@/hooks/useWorkoutTemplates'
import type { WorkoutDaySchedule, WorkoutContext, TemplateId } from '@lifeos/training'

interface PlanFormModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: () => void
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export function PlanFormModal({ isOpen, onClose, onSave }: PlanFormModalProps) {
  const { activePlan, createPlan, updatePlan } = useWorkoutPlan()
  const { templates, listTemplates } = useWorkoutTemplates()

  const [startDateKey, setStartDateKey] = useState('')
  const [schedule, setSchedule] = useState<WorkoutDaySchedule[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load templates on mount
  useEffect(() => {
    const load = async () => {
      try {
        await listTemplates()
      } catch (err) {
        setError((err as Error).message)
      }
    }

    void load()
  }, [listTemplates])

  // Initialize form
  useEffect(() => {
    if (isOpen) {
      if (activePlan) {
        // Edit mode
        setStartDateKey(activePlan.startDateKey)
        setSchedule(activePlan.schedule)
      } else {
        // Create mode - initialize with today's date
        const today = new Date()
        setStartDateKey(today.toISOString().split('T')[0])

        // Initialize empty schedule for 7 days
        const emptySchedule: WorkoutDaySchedule[] = Array.from({ length: 7 }, (_, i) => ({
          dayOfWeek: i,
          variants: {},
          restDay: false,
        }))
        setSchedule(emptySchedule)
      }
      setError(null)
    }
  }, [isOpen, activePlan])

  const handleToggleRestDay = (dayIndex: number) => {
    setSchedule(
      schedule.map((day, i) =>
        i === dayIndex
          ? { ...day, restDay: !day.restDay, variants: day.restDay ? day.variants : {} }
          : day
      )
    )
  }

  const handleAssignTemplate = (
    dayIndex: number,
    context: WorkoutContext,
    templateId: TemplateId | ''
  ) => {
    setSchedule(
      schedule.map((day, i) => {
        if (i === dayIndex) {
          const variants = { ...day.variants }
          if (templateId) {
            if (context === 'gym') variants.gymTemplateId = templateId
            if (context === 'home') variants.homeTemplateId = templateId
            if (context === 'road') variants.roadTemplateId = templateId
          } else {
            // Remove template
            if (context === 'gym') delete variants.gymTemplateId
            if (context === 'home') delete variants.homeTemplateId
            if (context === 'road') delete variants.roadTemplateId
          }
          return { ...day, variants }
        }
        return day
      })
    )
  }

  const handleSave = async () => {
    // Validation
    if (!startDateKey) {
      setError('Start date is required')
      return
    }

    setIsSaving(true)
    setError(null)

    try {
      if (activePlan) {
        // Update existing
        await updatePlan(activePlan.planId, {
          startDateKey,
          schedule,
        })
      } else {
        // Create new
        await createPlan({
          active: true,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          startDateKey,
          schedule,
          userId: '', // Will be set by hook
        })
      }

      onSave()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setIsSaving(false)
    }
  }

  if (!isOpen) return null

  const templatesByContext = {
    gym: templates.filter((t) => t.context === 'gym'),
    home: templates.filter((t) => t.context === 'home'),
    road: templates.filter((t) => t.context === 'road'),
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content plan-form-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{activePlan ? 'Edit Plan' : 'Create Plan'}</h2>
          <button className="modal-close-button" onClick={onClose} aria-label="Close modal">
            ✕
          </button>
        </div>

        {error && (
          <div className="error-banner-inline">
            <span>⚠ {error}</span>
          </div>
        )}

        <div className="modal-body">
          {/* Start Date */}
          <div className="form-group">
            <label htmlFor="start-date">
              Start Date <span className="required">*</span>
            </label>
            <input
              id="start-date"
              type="date"
              className="form-input"
              value={startDateKey}
              onChange={(e) => setStartDateKey(e.target.value)}
            />
          </div>

          {/* Weekly Schedule */}
          <div className="form-group">
            <label>Weekly Schedule</label>
            <div className="plan-schedule-builder">
              {schedule.map((day, dayIndex) => (
                <div key={dayIndex} className="plan-day-builder">
                  <div className="plan-day-builder-header">
                    <h4>{DAY_NAMES[day.dayOfWeek]}</h4>
                    <label className="checkbox-label-inline">
                      <input
                        type="checkbox"
                        checked={day.restDay || false}
                        onChange={() => handleToggleRestDay(dayIndex)}
                      />
                      <span>Rest Day</span>
                    </label>
                  </div>

                  {!day.restDay && (
                    <div className="plan-day-variants">
                      {/* Gym Template */}
                      <div className="variant-selector">
                        <label htmlFor={`gym-${dayIndex}`}>🏋️ Gym</label>
                        <select
                          id={`gym-${dayIndex}`}
                          className="form-select-small"
                          value={day.variants.gymTemplateId || ''}
                          onChange={(e) =>
                            handleAssignTemplate(dayIndex, 'gym', e.target.value as TemplateId)
                          }
                        >
                          <option value="">None</option>
                          {templatesByContext.gym.map((t) => (
                            <option key={t.templateId} value={t.templateId}>
                              {t.title}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Home Template */}
                      <div className="variant-selector">
                        <label htmlFor={`home-${dayIndex}`}>🏠 Home</label>
                        <select
                          id={`home-${dayIndex}`}
                          className="form-select-small"
                          value={day.variants.homeTemplateId || ''}
                          onChange={(e) =>
                            handleAssignTemplate(dayIndex, 'home', e.target.value as TemplateId)
                          }
                        >
                          <option value="">None</option>
                          {templatesByContext.home.map((t) => (
                            <option key={t.templateId} value={t.templateId}>
                              {t.title}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Road Template */}
                      <div className="variant-selector">
                        <label htmlFor={`road-${dayIndex}`}>🏃 Road</label>
                        <select
                          id={`road-${dayIndex}`}
                          className="form-select-small"
                          value={day.variants.roadTemplateId || ''}
                          onChange={(e) =>
                            handleAssignTemplate(dayIndex, 'road', e.target.value as TemplateId)
                          }
                        >
                          <option value="">None</option>
                          {templatesByContext.road.map((t) => (
                            <option key={t.templateId} value={t.templateId}>
                              {t.title}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="cancel-button" onClick={onClose} disabled={isSaving}>
            Cancel
          </button>
          <button className="save-button" onClick={handleSave} disabled={isSaving}>
            {isSaving ? 'Saving...' : activePlan ? 'Update' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  )
}
