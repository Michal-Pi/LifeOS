/**
 * ExerciseFormModal Component
 *
 * Modal for creating and editing exercises in the library.
 * Features:
 * - Create new exercise or edit existing
 * - Name (required)
 * - Category (dropdown)
 * - Equipment (multi-input with chips)
 * - Default Metrics (checkboxes)
 * - Form validation
 */

import { useState, useEffect } from 'react'
import { useWorkoutOperations } from '@/hooks/useWorkoutOperations'
import type { ExerciseLibraryItem, ExerciseCategory } from '@lifeos/training'

interface ExerciseFormModalProps {
  exercise: ExerciseLibraryItem | null
  isOpen: boolean
  onClose: () => void
  onSave: () => void
}

const CATEGORY_OPTIONS: { value: ExerciseCategory; label: string }[] = [
  { value: 'push', label: 'Push' },
  { value: 'pull', label: 'Pull' },
  { value: 'legs', label: 'Legs' },
  { value: 'core', label: 'Core' },
  { value: 'conditioning', label: 'Conditioning' },
  { value: 'mobility', label: 'Mobility' },
  { value: 'other', label: 'Other' },
]

const METRIC_OPTIONS: { value: string; label: string }[] = [
  { value: 'sets_reps_weight', label: 'Sets / Reps / Weight' },
  { value: 'time', label: 'Time' },
  { value: 'distance', label: 'Distance' },
  { value: 'reps_only', label: 'Reps Only' },
  { value: 'rpe', label: 'RPE' },
]

export function ExerciseFormModal({ exercise, isOpen, onClose, onSave }: ExerciseFormModalProps) {
  const { createExercise, updateExercise } = useWorkoutOperations()

  const [name, setName] = useState('')
  const [category, setCategory] = useState<ExerciseCategory>('other')
  const [equipmentList, setEquipmentList] = useState<string[]>([])
  const [equipmentInput, setEquipmentInput] = useState('')
  const [defaultMetrics, setDefaultMetrics] = useState<string[]>(['sets_reps_weight'])
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Reset form when modal opens/closes or exercise changes
  useEffect(() => {
    if (isOpen) {
      if (exercise) {
        // Edit mode
        setName(exercise.name)
        setCategory(exercise.category || 'other')
        setEquipmentList(exercise.equipment || [])
        setDefaultMetrics(exercise.defaultMetrics as string[])
      } else {
        // Create mode
        setName('')
        setCategory('other')
        setEquipmentList([])
        setDefaultMetrics(['sets_reps_weight'])
      }
      setEquipmentInput('')
      setError(null)
    }
  }, [isOpen, exercise])

  const handleAddEquipment = () => {
    const trimmed = equipmentInput.trim()
    if (trimmed && !equipmentList.includes(trimmed)) {
      setEquipmentList([...equipmentList, trimmed])
      setEquipmentInput('')
    }
  }

  const handleRemoveEquipment = (equipment: string) => {
    setEquipmentList(equipmentList.filter((e) => e !== equipment))
  }

  const handleMetricToggle = (metric: string) => {
    if (defaultMetrics.includes(metric)) {
      setDefaultMetrics(defaultMetrics.filter((m) => m !== metric))
    } else {
      setDefaultMetrics([...defaultMetrics, metric])
    }
  }

  const handleSave = async () => {
    // Validation
    if (!name.trim()) {
      setError('Exercise name is required')
      return
    }

    if (defaultMetrics.length === 0) {
      setError('At least one default metric is required')
      return
    }

    setIsSaving(true)
    setError(null)

    try {
      if (exercise) {
        // Update existing
        await updateExercise(exercise.exerciseId, {
          name: name.trim(),
          category,
          equipment: equipmentList,
          defaultMetrics: defaultMetrics as Array<
            'sets_reps_weight' | 'time' | 'distance' | 'reps_only' | 'rpe'
          >,
        })
      } else {
        // Create new
        await createExercise({
          name: name.trim(),
          category,
          equipment: equipmentList,
          defaultMetrics: defaultMetrics as Array<
            'sets_reps_weight' | 'time' | 'distance' | 'reps_only' | 'rpe'
          >,
          archived: false,
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
      <div className="modal-content exercise-form-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{exercise ? 'Edit Exercise' : 'Add Exercise'}</h2>
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
          {/* Name */}
          <div className="form-group">
            <label htmlFor="exercise-name">
              Name <span className="required">*</span>
            </label>
            <input
              id="exercise-name"
              type="text"
              className="form-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Bench Press"
              maxLength={100}
              autoFocus
            />
          </div>

          {/* Category */}
          <div className="form-group">
            <label htmlFor="exercise-category">Category</label>
            <select
              id="exercise-category"
              className="form-select"
              value={category}
              onChange={(e) => setCategory(e.target.value as ExerciseCategory)}
            >
              {CATEGORY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Equipment */}
          <div className="form-group">
            <label htmlFor="exercise-equipment">Equipment</label>
            <div className="equipment-input-row">
              <input
                id="exercise-equipment"
                type="text"
                className="form-input"
                value={equipmentInput}
                onChange={(e) => setEquipmentInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleAddEquipment()
                  }
                }}
                placeholder="e.g., Barbell"
                maxLength={50}
              />
              <button
                type="button"
                className="add-equipment-button"
                onClick={handleAddEquipment}
                disabled={!equipmentInput.trim()}
              >
                Add
              </button>
            </div>
            {equipmentList.length > 0 && (
              <div className="equipment-chips">
                {equipmentList.map((equip) => (
                  <div key={equip} className="equipment-chip">
                    <span>{equip}</span>
                    <button
                      type="button"
                      className="chip-remove-button"
                      onClick={() => handleRemoveEquipment(equip)}
                      aria-label={`Remove ${equip}`}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Default Metrics */}
          <div className="form-group">
            <label>
              Default Metrics <span className="required">*</span>
            </label>
            <div className="metrics-checkboxes">
              {METRIC_OPTIONS.map((metric) => (
                <label key={metric.value} className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={defaultMetrics.includes(metric.value)}
                    onChange={() => handleMetricToggle(metric.value)}
                  />
                  <span>{metric.label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="cancel-button" onClick={onClose} disabled={isSaving}>
            Cancel
          </button>
          <button className="save-button" onClick={handleSave} disabled={isSaving}>
            {isSaving ? 'Saving...' : exercise ? 'Update' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  )
}
