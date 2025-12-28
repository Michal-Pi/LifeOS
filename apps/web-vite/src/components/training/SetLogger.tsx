/**
 * SetLogger Component
 *
 * Component for logging sets, reps, weight, and RPE for an exercise.
 * Features:
 * - Add/remove sets
 * - Input reps, weight (kg), RPE (1-10)
 * - Mark sets as warmup
 * - Exercise notes
 */

import { useState } from 'react'
import type { ExercisePerformance, SetPerformance } from '@lifeos/training'

interface SetLoggerProps {
  exercise: ExercisePerformance
  onUpdate: (updated: ExercisePerformance) => void
  onClose: () => void
}

export function SetLogger({ exercise, onUpdate, onClose }: SetLoggerProps) {
  const [sets, setSets] = useState<SetPerformance[]>(exercise.sets || [])
  const [exerciseNotes, setExerciseNotes] = useState(exercise.notes || '')

  const handleAddSet = () => {
    const newSet: SetPerformance = {
      setIndex: sets.length,
      reps: undefined,
      weightKg: undefined,
      rpe: undefined,
      isWarmup: false,
    }
    setSets([...sets, newSet])
  }

  const handleRemoveSet = (index: number) => {
    setSets(sets.filter((_, i) => i !== index).map((set, i) => ({ ...set, setIndex: i })))
  }

  const handleUpdateSet = (
    index: number,
    field: keyof SetPerformance,
    value: number | boolean | undefined
  ) => {
    setSets(
      sets.map((set, i) => {
        if (i === index) {
          return { ...set, [field]: value }
        }
        return set
      })
    )
  }

  const handleSave = () => {
    onUpdate({
      ...exercise,
      sets,
      notes: exerciseNotes,
    })
    onClose()
  }

  return (
    <div className="set-logger">
      <div className="set-logger-header">
        <h4>Log Sets</h4>
        <button className="add-set-button" onClick={handleAddSet}>
          + Add Set
        </button>
      </div>

      <div className="sets-list">
        {sets.length === 0 && (
          <div className="empty-state-small">
            <p>No sets logged yet</p>
          </div>
        )}

        {sets.map((set, index) => (
          <div key={index} className="set-row">
            <span className="set-number">#{index + 1}</span>

            <div className="set-inputs">
              <div className="input-group">
                <label htmlFor={`reps-${index}`}>Reps</label>
                <input
                  id={`reps-${index}`}
                  type="number"
                  min="0"
                  className="set-input"
                  value={set.reps ?? ''}
                  onChange={(e) =>
                    handleUpdateSet(
                      index,
                      'reps',
                      e.target.value ? parseInt(e.target.value) : undefined
                    )
                  }
                  placeholder="0"
                />
              </div>

              <div className="input-group">
                <label htmlFor={`weight-${index}`}>Weight (kg)</label>
                <input
                  id={`weight-${index}`}
                  type="number"
                  min="0"
                  step="0.5"
                  className="set-input"
                  value={set.weightKg ?? ''}
                  onChange={(e) =>
                    handleUpdateSet(
                      index,
                      'weightKg',
                      e.target.value ? parseFloat(e.target.value) : undefined
                    )
                  }
                  placeholder="0"
                />
              </div>

              <div className="input-group">
                <label htmlFor={`rpe-${index}`}>RPE (1-10)</label>
                <input
                  id={`rpe-${index}`}
                  type="number"
                  min="1"
                  max="10"
                  className="set-input"
                  value={set.rpe ?? ''}
                  onChange={(e) =>
                    handleUpdateSet(
                      index,
                      'rpe',
                      e.target.value ? parseInt(e.target.value) : undefined
                    )
                  }
                  placeholder="0"
                />
              </div>

              <div className="checkbox-group">
                <label htmlFor={`warmup-${index}`}>
                  <input
                    id={`warmup-${index}`}
                    type="checkbox"
                    checked={set.isWarmup || false}
                    onChange={(e) => handleUpdateSet(index, 'isWarmup', e.target.checked)}
                  />
                  Warmup
                </label>
              </div>
            </div>

            <button
              className="remove-set-button"
              onClick={() => handleRemoveSet(index)}
              aria-label="Remove set"
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      <div className="exercise-notes-section">
        <label htmlFor="exercise-notes">Exercise Notes</label>
        <textarea
          id="exercise-notes"
          className="exercise-notes-input"
          value={exerciseNotes}
          onChange={(e) => setExerciseNotes(e.target.value)}
          placeholder="Form notes, variations, etc."
          rows={2}
        />
      </div>

      <div className="set-logger-actions">
        <button className="cancel-button" onClick={onClose}>
          Cancel
        </button>
        <button className="save-button" onClick={handleSave}>
          Save
        </button>
      </div>
    </div>
  )
}
