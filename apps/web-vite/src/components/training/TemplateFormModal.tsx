/**
 * TemplateFormModal Component
 *
 * Modal for creating and editing workout templates.
 * Features:
 * - Set template name and context
 * - Add exercises from library
 * - Set targets for each exercise (sets/reps/weight)
 * - Reorder exercises
 */

import { useState, useEffect } from 'react'
import { useWorkoutTemplates } from '@/hooks/useWorkoutTemplates'
import { useWorkoutOperations } from '@/hooks/useWorkoutOperations'
import { ExercisePicker } from './ExercisePicker'
import type {
  WorkoutTemplate,
  WorkoutContext,
  WorkoutTemplateItem,
  ExerciseId,
} from '@lifeos/training'

interface TemplateFormModalProps {
  template: WorkoutTemplate | null
  isOpen: boolean
  onClose: () => void
  onSave: () => void
}

const CONTEXT_OPTIONS: { value: WorkoutContext; label: string }[] = [
  { value: 'gym', label: 'Gym' },
  { value: 'home', label: 'Home' },
  { value: 'road', label: 'Road' },
]

export function TemplateFormModal({ template, isOpen, onClose, onSave }: TemplateFormModalProps) {
  const { createTemplate, updateTemplate } = useWorkoutTemplates()
  const { exercises, listExercises } = useWorkoutOperations()

  const [title, setTitle] = useState('')
  const [context, setContext] = useState<WorkoutContext>('gym')
  const [items, setItems] = useState<WorkoutTemplateItem[]>([])
  const [showExercisePicker, setShowExercisePicker] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load exercises on mount
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

  // Reset form when modal opens/closes or template changes
  useEffect(() => {
    if (isOpen) {
      if (template) {
        // Edit mode
        setTitle(template.title)
        setContext(template.context)
        setItems(template.items)
      } else {
        // Create mode
        setTitle('')
        setContext('gym')
        setItems([])
      }
      setError(null)
    }
  }, [isOpen, template])

  const handleAddExercise = (exerciseId: ExerciseId) => {
    const exercise = exercises.find((e) => e.exerciseId === exerciseId)
    if (!exercise) return

    const newItem: WorkoutTemplateItem = {
      exerciseId,
      displayName: exercise.name,
      target: {
        type: 'sets_reps',
        sets: 3,
        reps: 10,
      },
    }

    setItems([...items, newItem])
    setShowExercisePicker(false)
  }

  const handleRemoveExercise = (index: number) => {
    setItems(items.filter((_, i) => i !== index))
  }

  const handleUpdateTarget = (index: number, field: string, value: number) => {
    setItems(
      items.map((item, i) => {
        if (i === index && item.target.type === 'sets_reps') {
          return {
            ...item,
            target: {
              ...item.target,
              [field]: value,
            },
          }
        }
        return item
      })
    )
  }

  const handleSave = async () => {
    // Validation
    if (!title.trim()) {
      setError('Template name is required')
      return
    }

    if (items.length === 0) {
      setError('Add at least one exercise to the template')
      return
    }

    setIsSaving(true)
    setError(null)

    try {
      if (template) {
        // Update existing
        await updateTemplate(template.templateId, {
          title: title.trim(),
          context,
          items,
        })
      } else {
        // Create new
        await createTemplate({
          title: title.trim(),
          context,
          items,
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

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content template-form-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{template ? 'Edit Template' : 'Create Template'}</h2>
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
          {/* Template Name */}
          <div className="form-group">
            <label htmlFor="template-name">
              Template Name <span className="required">*</span>
            </label>
            <input
              id="template-name"
              type="text"
              className="form-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Push Day A"
              maxLength={100}
              autoFocus
            />
          </div>

          {/* Context */}
          <div className="form-group">
            <label htmlFor="template-context">
              Context <span className="required">*</span>
            </label>
            <select
              id="template-context"
              className="form-select"
              value={context}
              onChange={(e) => setContext(e.target.value as WorkoutContext)}
            >
              {CONTEXT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Exercises */}
          <div className="form-group">
            <div className="template-exercises-header">
              <label>
                Exercises <span className="required">*</span>
              </label>
              <button
                type="button"
                className="add-exercise-button-small"
                onClick={() => setShowExercisePicker(true)}
              >
                + Add Exercise
              </button>
            </div>

            {items.length === 0 ? (
              <div className="empty-state-small">
                <p>No exercises added yet. Click "+ Add Exercise" to get started.</p>
              </div>
            ) : (
              <div className="template-exercises-list">
                {items.map((item, index) => (
                  <div key={index} className="template-exercise-row">
                    <div className="template-exercise-info">
                      <span className="template-exercise-name">{item.displayName}</span>
                      {item.target.type === 'sets_reps' && (
                        <div className="template-target-inputs">
                          <div className="input-group-inline">
                            <label htmlFor={`sets-${index}`}>Sets</label>
                            <input
                              id={`sets-${index}`}
                              type="number"
                              min="1"
                              max="20"
                              className="target-input"
                              value={item.target.sets}
                              onChange={(e) =>
                                handleUpdateTarget(index, 'sets', parseInt(e.target.value) || 1)
                              }
                            />
                          </div>
                          <div className="input-group-inline">
                            <label htmlFor={`reps-${index}`}>Reps</label>
                            <input
                              id={`reps-${index}`}
                              type="number"
                              min="1"
                              max="100"
                              className="target-input"
                              value={
                                typeof item.target.reps === 'number'
                                  ? item.target.reps
                                  : item.target.reps.min
                              }
                              onChange={(e) =>
                                handleUpdateTarget(index, 'reps', parseInt(e.target.value) || 1)
                              }
                            />
                          </div>
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      className="remove-exercise-button"
                      onClick={() => handleRemoveExercise(index)}
                      aria-label="Remove exercise"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="modal-footer">
          <button className="cancel-button" onClick={onClose} disabled={isSaving}>
            Cancel
          </button>
          <button className="save-button" onClick={handleSave} disabled={isSaving}>
            {isSaving ? 'Saving...' : template ? 'Update' : 'Create'}
          </button>
        </div>
      </div>

      {/* Exercise Picker Modal (nested) */}
      {showExercisePicker && (
        <ExercisePicker
          exercises={exercises}
          onSelect={handleAddExercise}
          onClose={() => setShowExercisePicker(false)}
        />
      )}
    </div>
  )
}
