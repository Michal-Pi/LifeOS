/**
 * PlanFormModal Component
 *
 * Modal for creating and editing workout plans.
 * New design features:
 * - Set start date
 * - Assign exercise type categories to each day (Lower Body, Upper Body, Arms, etc.)
 * - Each category has a time allocation (minutes)
 * - Optional specific exercises per category
 * - Mark days as rest days
 * - Uses Radix Select component (design system)
 * - No icons in UI
 */

import { useState, useEffect, useCallback } from 'react'
import { useWorkoutPlan } from '@/hooks/useWorkoutPlan'
import { useWorkoutOperations } from '@/hooks/useWorkoutOperations'
import { Select, type SelectOption } from '@/components/Select'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import type {
  WorkoutDaySchedule,
  DayExerciseBlock,
  ExerciseTypeCategory,
  ExerciseId,
} from '@lifeos/training'
import { EXERCISE_CATEGORY_LABELS, EXERCISE_TYPE_CATEGORIES } from '@/utils/defaultExercises'

interface PlanFormModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: () => void
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// Convert categories to select options
const CATEGORY_SELECT_OPTIONS: SelectOption[] = EXERCISE_TYPE_CATEGORIES.map((cat) => ({
  value: cat,
  label: EXERCISE_CATEGORY_LABELS[cat],
}))

// Internal state for blocks with string time values (for editing)
interface EditableBlock {
  category: ExerciseTypeCategory
  timeValue: string // String to allow empty while editing
  exerciseIds: ExerciseId[]
}

interface EditableSchedule {
  dayOfWeek: number
  restDay: boolean
  blocks: EditableBlock[]
}

export function PlanFormModal({ isOpen, onClose, onSave }: PlanFormModalProps) {
  const { activePlan, createPlan, updatePlan } = useWorkoutPlan()
  const { exercises, listExercises } = useWorkoutOperations()

  const [startDateKey, setStartDateKey] = useState('')
  const [schedule, setSchedule] = useState<EditableSchedule[]>([])
  const [activeDay, setActiveDay] = useState(0)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Confirmation dialog state
  const [showEmptyTimeDialog, setShowEmptyTimeDialog] = useState(false)
  const [blocksWithNoTime, setBlocksWithNoTime] = useState<
    Array<{ dayName: string; category: string }>
  >([])

  // Load exercises on mount (for exercise picker dropdown)
  useEffect(() => {
    const load = async () => {
      try {
        await listExercises()
      } catch (err) {
        setError((err as Error).message)
      }
    }

    void load()
  }, [listExercises])

  // Initialize form
  useEffect(() => {
    if (isOpen) {
      if (activePlan) {
        // Edit mode
        setStartDateKey(activePlan.startDateKey)
        // Convert to editable format
        const editableSchedule: EditableSchedule[] = activePlan.schedule.map((day) => ({
          dayOfWeek: day.dayOfWeek,
          restDay: day.restDay || false,
          blocks: (day.blocks || []).map((block) => ({
            category: block.category,
            timeValue: block.timeMinutes.toString(),
            exerciseIds: block.exerciseIds || [],
          })),
        }))
        setSchedule(editableSchedule)
      } else {
        // Create mode - initialize with today's date
        const today = new Date()
        setStartDateKey(today.toISOString().split('T')[0])

        // Initialize empty schedule for 7 days
        const emptySchedule: EditableSchedule[] = Array.from({ length: 7 }, (_, i) => ({
          dayOfWeek: i,
          blocks: [],
          restDay: false,
        }))
        setSchedule(emptySchedule)
      }
      setError(null)
    }
  }, [isOpen, activePlan])

  // Toggle rest day
  const handleToggleRestDay = useCallback((dayIndex: number) => {
    setSchedule((prev) =>
      prev.map((day, i) =>
        i === dayIndex
          ? { ...day, restDay: !day.restDay, blocks: day.restDay ? day.blocks : [] }
          : day
      )
    )
  }, [])

  // Add a category block to a day
  const handleAddBlock = useCallback((dayIndex: number, category: ExerciseTypeCategory) => {
    const newBlock: EditableBlock = {
      category,
      timeValue: '30', // Default 30 minutes
      exerciseIds: [],
    }

    setSchedule((prev) =>
      prev.map((day, i) => (i === dayIndex ? { ...day, blocks: [...day.blocks, newBlock] } : day))
    )
  }, [])

  // Remove a block from a day
  const handleRemoveBlock = useCallback((dayIndex: number, blockIndex: number) => {
    setSchedule((prev) =>
      prev.map((day, i) =>
        i === dayIndex ? { ...day, blocks: day.blocks.filter((_, bi) => bi !== blockIndex) } : day
      )
    )
  }, [])

  // Update block time - store as string to allow empty values
  const handleUpdateBlockTime = useCallback(
    (dayIndex: number, blockIndex: number, timeValue: string) => {
      setSchedule((prev) =>
        prev.map((day, i) =>
          i === dayIndex
            ? {
                ...day,
                blocks: day.blocks.map((block, bi) =>
                  bi === blockIndex ? { ...block, timeValue } : block
                ),
              }
            : day
        )
      )
    },
    []
  )

  // Add exercise to block
  const handleAddExerciseToBlock = useCallback(
    (dayIndex: number, blockIndex: number, exerciseId: ExerciseId) => {
      setSchedule((prev) =>
        prev.map((day, i) =>
          i === dayIndex
            ? {
                ...day,
                blocks: day.blocks.map((block, bi) =>
                  bi === blockIndex
                    ? {
                        ...block,
                        exerciseIds: [...block.exerciseIds, exerciseId],
                      }
                    : block
                ),
              }
            : day
        )
      )
    },
    []
  )

  // Remove exercise from block
  const handleRemoveExerciseFromBlock = useCallback(
    (dayIndex: number, blockIndex: number, exerciseId: ExerciseId) => {
      setSchedule((prev) =>
        prev.map((day, i) =>
          i === dayIndex
            ? {
                ...day,
                blocks: day.blocks.map((block, bi) =>
                  bi === blockIndex
                    ? {
                        ...block,
                        exerciseIds: block.exerciseIds.filter((id) => id !== exerciseId),
                      }
                    : block
                ),
              }
            : day
        )
      )
    },
    []
  )

  // Convert editable schedule to domain schedule
  const convertToDomainSchedule = (
    editableSchedule: EditableSchedule[],
    removeEmptyBlocks: boolean
  ): WorkoutDaySchedule[] => {
    return editableSchedule.map((day) => ({
      dayOfWeek: day.dayOfWeek,
      restDay: day.restDay,
      blocks: day.blocks
        .filter((block) => {
          if (removeEmptyBlocks) {
            const time = parseInt(block.timeValue, 10)
            return !isNaN(time) && time > 0
          }
          return true
        })
        .map((block) => ({
          category: block.category,
          timeMinutes: parseInt(block.timeValue, 10) || 0,
          exerciseIds: block.exerciseIds.length > 0 ? block.exerciseIds : undefined,
        })) as DayExerciseBlock[],
    }))
  }

  // Find blocks with no time
  const findBlocksWithNoTime = (): Array<{ dayName: string; category: string }> => {
    const result: Array<{ dayName: string; category: string }> = []
    schedule.forEach((day) => {
      if (!day.restDay) {
        day.blocks.forEach((block) => {
          const time = parseInt(block.timeValue, 10)
          if (isNaN(time) || time <= 0) {
            result.push({
              dayName: DAY_NAMES[day.dayOfWeek],
              category: EXERCISE_CATEGORY_LABELS[block.category],
            })
          }
        })
      }
    })
    return result
  }

  const handleSave = async (removeEmptyBlocks = false) => {
    // Validation
    if (!startDateKey) {
      setError('Start date is required')
      return
    }

    // Check for blocks with no time
    if (!removeEmptyBlocks) {
      const emptyBlocks = findBlocksWithNoTime()
      if (emptyBlocks.length > 0) {
        setBlocksWithNoTime(emptyBlocks)
        setShowEmptyTimeDialog(true)
        return
      }
    }

    setIsSaving(true)
    setError(null)

    try {
      const domainSchedule = convertToDomainSchedule(schedule, removeEmptyBlocks)

      if (activePlan) {
        // Update existing
        await updatePlan(activePlan.planId, {
          startDateKey,
          schedule: domainSchedule,
        })
      } else {
        // Create new
        await createPlan({
          active: true,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          startDateKey,
          schedule: domainSchedule,
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

  const handleConfirmRemoveEmpty = () => {
    setShowEmptyTimeDialog(false)
    void handleSave(true)
  }

  const handleCancelEmptyDialog = () => {
    setShowEmptyTimeDialog(false)
  }

  // Get exercises filtered by category
  const getExercisesForCategory = (category: ExerciseTypeCategory) => {
    return exercises.filter((ex) => ex.category === category && !ex.archived)
  }

  // Get exercise name for display
  const getExerciseName = (exerciseId: ExerciseId) => {
    const ex = exercises.find((e) => e.exerciseId === exerciseId)
    if (!ex) return 'Unknown'
    const name = ex.generic_name || ex.name || 'Unknown'
    const target = ex.target_muscle_group
    const targetStr = Array.isArray(target) ? target.join(', ') : target
    return targetStr ? `${name} (${targetStr})` : name
  }

  // Get available categories that haven't been added to this day yet
  const getAvailableCategories = (dayIndex: number) => {
    const usedCategories = new Set(schedule[dayIndex]?.blocks.map((b) => b.category) || [])
    return CATEGORY_SELECT_OPTIONS.filter(
      (opt) => !usedCategories.has(opt.value as ExerciseTypeCategory)
    )
  }

  if (!isOpen) return null

  return (
    <>
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content plan-form-modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h2>{activePlan ? 'Edit Plan' : 'Create Plan'}</h2>
            <button type="button" className="close-button" onClick={onClose} aria-label="Close">
              ×
            </button>
          </div>

          {error && (
            <div className="error-banner-inline">
              <span>{error}</span>
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
              <p className="form-hint">
                Add exercise categories with time allocations for each day
              </p>
              <div className="plan-day-tabs">
                {schedule.map((day, index) => {
                  const hasBlocks = day.blocks.length > 0
                  const isRest = day.restDay
                  return (
                    <button
                      key={index}
                      type="button"
                      className={`plan-day-tab ${index === activeDay ? 'plan-day-tab--active' : ''} ${isRest ? 'plan-day-tab--rest' : ''} ${hasBlocks ? 'plan-day-tab--has-content' : ''}`}
                      onClick={() => setActiveDay(index)}
                    >
                      <span className="plan-day-tab__name">{DAY_SHORT[day.dayOfWeek]}</span>
                      {isRest && (
                        <span className="plan-day-tab__badge plan-day-tab__badge--rest">R</span>
                      )}
                      {!isRest && hasBlocks && (
                        <span className="plan-day-tab__badge">{day.blocks.length}</span>
                      )}
                    </button>
                  )
                })}
              </div>

              {schedule[activeDay] && (
                <div className="plan-day-panel">
                  <div className="plan-day-panel__header">
                    <h3>{DAY_NAMES[schedule[activeDay].dayOfWeek]}</h3>
                    <label className="checkbox-label-inline">
                      <input
                        type="checkbox"
                        checked={schedule[activeDay].restDay || false}
                        onChange={() => handleToggleRestDay(activeDay)}
                      />
                      <span>Rest Day</span>
                    </label>
                  </div>

                  {schedule[activeDay].restDay ? (
                    <div className="plan-day-panel__rest">
                      <p>Recovery day — no exercises scheduled</p>
                    </div>
                  ) : (
                    <div className="plan-day-panel__blocks">
                      {schedule[activeDay].blocks.map((block, blockIndex) => (
                        <div key={blockIndex} className="exercise-block">
                          <div className="exercise-block-header">
                            <span className="exercise-block-category">
                              {EXERCISE_CATEGORY_LABELS[block.category]}
                            </span>
                            <div className="exercise-block-time">
                              <input
                                type="number"
                                className="time-input"
                                min="1"
                                max="180"
                                step="5"
                                placeholder="30"
                                value={block.timeValue}
                                onChange={(e) =>
                                  handleUpdateBlockTime(activeDay, blockIndex, e.target.value)
                                }
                              />
                              <span className="time-label">min</span>
                            </div>
                            <button
                              type="button"
                              className="ghost-button-small"
                              onClick={() => handleRemoveBlock(activeDay, blockIndex)}
                              title="Remove category"
                            >
                              ×
                            </button>
                          </div>

                          <div className="exercise-block-exercises">
                            {block.exerciseIds.map((exId) => (
                              <div key={exId} className="selected-exercise">
                                <span className="selected-exercise-name">
                                  {getExerciseName(exId)}
                                </span>
                                <button
                                  type="button"
                                  className="ghost-button-small"
                                  onClick={() =>
                                    handleRemoveExerciseFromBlock(activeDay, blockIndex, exId)
                                  }
                                >
                                  ×
                                </button>
                              </div>
                            ))}

                            {getExercisesForCategory(block.category).length > 0 && (
                              <Select
                                value=""
                                placeholder="Add exercise (optional)"
                                options={getExercisesForCategory(block.category)
                                  .filter((ex) => !block.exerciseIds.includes(ex.exerciseId))
                                  .map((ex) => ({
                                    value: ex.exerciseId,
                                    label: getExerciseName(ex.exerciseId),
                                  }))}
                                onChange={(value) => {
                                  if (value) {
                                    handleAddExerciseToBlock(
                                      activeDay,
                                      blockIndex,
                                      value as ExerciseId
                                    )
                                  }
                                }}
                                className="exercise-select"
                              />
                            )}
                          </div>
                        </div>
                      ))}

                      {getAvailableCategories(activeDay).length > 0 && (
                        <div className="add-block-row">
                          <Select
                            value=""
                            placeholder="+ Add category"
                            options={getAvailableCategories(activeDay)}
                            onChange={(value) => {
                              if (value) {
                                handleAddBlock(activeDay, value as ExerciseTypeCategory)
                              }
                            }}
                            className="add-category-select"
                          />
                        </div>
                      )}

                      {schedule[activeDay].blocks.length === 0 && (
                        <p className="no-blocks-message">
                          No exercise categories scheduled. Add a category above.
                        </p>
                      )}
                    </div>
                  )}

                  <div className="plan-day-nav">
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() => setActiveDay((d) => Math.max(0, d - 1))}
                      disabled={activeDay === 0}
                    >
                      Previous Day
                    </button>
                    <span className="plan-day-nav__indicator">{activeDay + 1} / 7</span>
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() => setActiveDay((d) => Math.min(6, d + 1))}
                      disabled={activeDay === 6}
                    >
                      Next Day
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="modal-actions">
            <button type="button" className="ghost-button" onClick={onClose} disabled={isSaving}>
              Cancel
            </button>
            <button
              type="button"
              className="primary-button"
              onClick={() => handleSave(false)}
              disabled={isSaving}
            >
              {isSaving ? 'Saving...' : activePlan ? 'Update' : 'Create'}
            </button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        isOpen={showEmptyTimeDialog}
        title="Blocks Without Time"
        description={`The following blocks have no time set:\n\n${blocksWithNoTime.map((b) => `• ${b.dayName}: ${b.category}`).join('\n')}\n\nWould you like to remove these blocks and save, or go back to add time?`}
        confirmLabel="Remove & Save"
        cancelLabel="Go Back"
        confirmVariant="primary"
        onConfirm={handleConfirmRemoveEmpty}
        onCancel={handleCancelEmptyDialog}
      />
    </>
  )
}
