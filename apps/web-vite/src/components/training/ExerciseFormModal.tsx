/**
 * ExerciseFormModal Component
 *
 * Modal for creating and editing exercises in the library.
 * Features:
 * - Create new exercise or edit existing
 * - Generic Name (required)
 * - Target Muscle Group (required)
 * - Category (dropdown - ExerciseTypeCategory)
 * - Context-specific variants (Gym/Home/Road)
 * - Each variant has name and optional equipment
 */

import { useState, useEffect } from 'react'
import { Modal } from '@/components/ui/Modal'
import { useWorkoutOperations } from '@/hooks/useWorkoutOperations'
import type { ExerciseLibraryItem, ExerciseTypeCategory, ExerciseVariant } from '@lifeos/training'
import { EXERCISE_CATEGORY_LABELS, EXERCISE_TYPE_CATEGORIES } from '@/utils/defaultExercises'

interface ExerciseFormModalProps {
  exercise: ExerciseLibraryItem | null
  isOpen: boolean
  onClose: () => void
  onSave: () => void
}

interface VariantFormState {
  name: string
  equipment: string[]
}

const CONTEXT_LABELS: Record<'gym' | 'home' | 'road', string> = {
  gym: 'Gym',
  home: 'Home',
  road: 'Road',
}

export function ExerciseFormModal({ exercise, isOpen, onClose, onSave }: ExerciseFormModalProps) {
  const { createExercise, updateExercise } = useWorkoutOperations()

  const [genericName, setGenericName] = useState('')
  const [targetMuscle, setTargetMuscle] = useState('')
  const [category, setCategory] = useState<ExerciseTypeCategory>('lower_body')
  const [gymVariants, setGymVariants] = useState<VariantFormState[]>([])
  const [homeVariants, setHomeVariants] = useState<VariantFormState[]>([])
  const [roadVariants, setRoadVariants] = useState<VariantFormState[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Track which variant section is expanded
  const [expandedContext, setExpandedContext] = useState<'gym' | 'home' | 'road' | null>('gym')

  // Reset form when modal opens/closes or exercise changes
  useEffect(() => {
    if (isOpen) {
      if (exercise) {
        // Edit mode - populate from existing exercise
        setGenericName(exercise.generic_name || exercise.name || '')
        const target = exercise.target_muscle_group
        setTargetMuscle(Array.isArray(target) ? target.join(', ') : target || '')
        setCategory(exercise.category || 'lower_body')

        // Convert ExerciseVariant[] to VariantFormState[]
        setGymVariants(
          (exercise.gym || []).map((v) => ({
            name: v.name,
            equipment: v.equipment || [],
          }))
        )
        setHomeVariants(
          (exercise.home || []).map((v) => ({
            name: v.name,
            equipment: v.equipment || [],
          }))
        )
        setRoadVariants(
          (exercise.road || []).map((v) => ({
            name: v.name,
            equipment: v.equipment || [],
          }))
        )
      } else {
        // Create mode - reset to defaults
        setGenericName('')
        setTargetMuscle('')
        setCategory('lower_body')
        setGymVariants([])
        setHomeVariants([])
        setRoadVariants([])
      }
      setError(null)
      setExpandedContext('gym')
    }
  }, [isOpen, exercise])

  // Helper to add a variant to a context
  const addVariant = (context: 'gym' | 'home' | 'road') => {
    const newVariant: VariantFormState = { name: '', equipment: [] }
    if (context === 'gym') setGymVariants([...gymVariants, newVariant])
    if (context === 'home') setHomeVariants([...homeVariants, newVariant])
    if (context === 'road') setRoadVariants([...roadVariants, newVariant])
  }

  // Helper to remove a variant
  const removeVariant = (context: 'gym' | 'home' | 'road', index: number) => {
    if (context === 'gym') setGymVariants(gymVariants.filter((_, i) => i !== index))
    if (context === 'home') setHomeVariants(homeVariants.filter((_, i) => i !== index))
    if (context === 'road') setRoadVariants(roadVariants.filter((_, i) => i !== index))
  }

  // Helper to update a variant
  const updateVariant = (
    context: 'gym' | 'home' | 'road',
    index: number,
    field: 'name' | 'equipment',
    value: string | string[]
  ) => {
    const update = (variants: VariantFormState[]) =>
      variants.map((v, i) => (i === index ? { ...v, [field]: value } : v))

    if (context === 'gym') setGymVariants(update(gymVariants))
    if (context === 'home') setHomeVariants(update(homeVariants))
    if (context === 'road') setRoadVariants(update(roadVariants))
  }

  // Convert VariantFormState[] to ExerciseVariant[]
  const toExerciseVariants = (variants: VariantFormState[]): ExerciseVariant[] =>
    variants
      .filter((v) => v.name.trim()) // Only include variants with names
      .map((v) => ({
        name: v.name.trim(),
        equipment: v.equipment.length > 0 ? v.equipment : undefined,
      }))

  const handleSave = async () => {
    // Validation
    if (!genericName.trim()) {
      setError('Exercise name is required')
      return
    }

    if (!targetMuscle.trim()) {
      setError('Target muscle group is required')
      return
    }

    setIsSaving(true)
    setError(null)

    try {
      // Parse target muscle - support comma-separated values
      const targetMuscleGroup = targetMuscle.includes(',')
        ? targetMuscle.split(',').map((m) => m.trim())
        : targetMuscle.trim()

      const exerciseData = {
        generic_name: genericName.trim(),
        target_muscle_group: targetMuscleGroup,
        category,
        gym: toExerciseVariants(gymVariants),
        home: toExerciseVariants(homeVariants),
        road: toExerciseVariants(roadVariants),
        archived: false,
      }

      if (exercise) {
        // Update existing
        await updateExercise(exercise.exerciseId, exerciseData)
      } else {
        // Create new
        await createExercise({
          ...exerciseData,
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

  // Render variant editor for a context
  const renderVariantEditor = (context: 'gym' | 'home' | 'road', variants: VariantFormState[]) => {
    const isExpanded = expandedContext === context

    return (
      <div className="variant-section" key={context}>
        <button
          type="button"
          className={`variant-section-header ${isExpanded ? 'expanded' : ''}`}
          onClick={() => setExpandedContext(isExpanded ? null : context)}
        >
          <span className="variant-section-title">
            {CONTEXT_LABELS[context]} ({variants.length})
          </span>
          <span className="expand-icon">{isExpanded ? '-' : '+'}</span>
        </button>

        {isExpanded && (
          <div className="variant-section-content">
            {variants.length === 0 ? (
              <p className="no-variants-message">No {context} variants yet.</p>
            ) : (
              <div className="variants-list">
                {variants.map((variant, index) => (
                  <div key={index} className="variant-item">
                    <div className="variant-item-row">
                      <input
                        type="text"
                        className="form-input variant-name-input"
                        placeholder={`e.g., Barbell ${genericName || 'Exercise'}`}
                        value={variant.name}
                        onChange={(e) => updateVariant(context, index, 'name', e.target.value)}
                      />
                      <button
                        type="button"
                        className="remove-variant-button"
                        onClick={() => removeVariant(context, index)}
                        title="Remove variant"
                      >
                        x
                      </button>
                    </div>
                    <input
                      type="text"
                      className="form-input variant-equipment-input"
                      placeholder="Equipment (comma-separated)"
                      value={variant.equipment.join(', ')}
                      onChange={(e) =>
                        updateVariant(
                          context,
                          index,
                          'equipment',
                          e.target.value
                            .split(',')
                            .map((s) => s.trim())
                            .filter(Boolean)
                        )
                      }
                    />
                  </div>
                ))}
              </div>
            )}
            <button
              type="button"
              className="add-variant-button"
              onClick={() => addVariant(context)}
            >
              + Add {CONTEXT_LABELS[context]} Variant
            </button>
          </div>
        )}
      </div>
    )
  }

  const modalFooter = (
    <>
      <button className="cancel-button" onClick={onClose} disabled={isSaving}>
        Cancel
      </button>
      <button className="save-button" onClick={handleSave} disabled={isSaving}>
        {isSaving ? 'Saving...' : exercise ? 'Update' : 'Create'}
      </button>
    </>
  )

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      size="md"
      title={exercise ? 'Edit Exercise' : 'Add Exercise'}
      footer={modalFooter}
      className="exercise-form-modal"
    >
      {error && (
        <div className="error-banner-inline">
          <span>{error}</span>
        </div>
      )}

      <div className="modal-body">
        {/* Generic Name */}
        <div className="form-group">
          <label htmlFor="exercise-generic-name">
            Generic Name <span className="required">*</span>
          </label>
          <input
            id="exercise-generic-name"
            type="text"
            className="form-input"
            value={genericName}
            onChange={(e) => setGenericName(e.target.value)}
            placeholder="e.g., Squat, Bench Press, Plank"
            maxLength={100}
            autoFocus
          />
          <p className="form-hint">
            The general name for this exercise type (e.g., "Squat" covers all squat variations)
          </p>
        </div>

        {/* Target Muscle Group */}
        <div className="form-group">
          <label htmlFor="exercise-target-muscle">
            Target Muscle Group <span className="required">*</span>
          </label>
          <input
            id="exercise-target-muscle"
            type="text"
            className="form-input"
            value={targetMuscle}
            onChange={(e) => setTargetMuscle(e.target.value)}
            placeholder="e.g., Quadriceps, Glutes or Chest, Triceps"
            maxLength={200}
          />
          <p className="form-hint">Separate multiple muscle groups with commas</p>
        </div>

        {/* Category */}
        <div className="form-group">
          <label htmlFor="exercise-category">Category</label>
          <select
            id="exercise-category"
            className="form-select"
            value={category}
            onChange={(e) => setCategory(e.target.value as ExerciseTypeCategory)}
          >
            {EXERCISE_TYPE_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {EXERCISE_CATEGORY_LABELS[cat]}
              </option>
            ))}
          </select>
        </div>

        {/* Context-Specific Variants */}
        <div className="form-group">
          <label>Exercise Variants</label>
          <p className="form-hint">
            Add specific variations for each context (gym equipment, home workout, on-the-road)
          </p>
          <div className="variants-container">
            {renderVariantEditor('gym', gymVariants)}
            {renderVariantEditor('home', homeVariants)}
            {renderVariantEditor('road', roadVariants)}
          </div>
        </div>
      </div>
    </Modal>
  )
}
