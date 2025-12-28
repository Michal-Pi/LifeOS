/**
 * SessionDetailModal Component
 *
 * Modal for editing workout session details:
 * - Add/remove exercises
 * - Log sets, reps, weight for each exercise
 * - Add session notes
 * - Track session duration
 */

import { useState, useEffect } from 'react'
import { useWorkoutOperations } from '@/hooks/useWorkoutOperations'
import type {
  WorkoutSession,
  ExercisePerformance,
  ExerciseLibraryItem,
  ExerciseId,
} from '@lifeos/training'
import { ExercisePicker } from './ExercisePicker'
import { SetLogger } from './SetLogger'
import { SessionTimer } from './SessionTimer'

interface SessionDetailModalProps {
  session: WorkoutSession | null
  isOpen: boolean
  onClose: () => void
  onSave: () => void
}

export function SessionDetailModal({ session, isOpen, onClose, onSave }: SessionDetailModalProps) {
  const { updateSession, listExercises } = useWorkoutOperations()
  const [exercises, setExercises] = useState<ExerciseLibraryItem[]>([])
  const [sessionItems, setSessionItems] = useState<ExercisePerformance[]>([])
  const [sessionNotes, setSessionNotes] = useState('')
  const [showExercisePicker, setShowExercisePicker] = useState(false)
  const [editingExerciseIndex, setEditingExerciseIndex] = useState<number | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  // Load exercise library on mount
  useEffect(() => {
    const loadExercises = async () => {
      try {
        const exerciseList = await listExercises({ activeOnly: true })
        setExercises(exerciseList)
      } catch (error) {
        console.error('Failed to load exercises:', error)
      }
    }

    if (isOpen) {
      loadExercises()
    }
  }, [isOpen, listExercises])

  // Initialize session data when modal opens
  useEffect(() => {
    if (session) {
      setSessionItems(session.items || [])
      setSessionNotes(session.notes || '')
    }
  }, [session])

  if (!isOpen || !session) return null

  const handleAddExercise = (exerciseId: ExerciseId) => {
    const exercise = exercises.find((e) => e.exerciseId === exerciseId)
    if (!exercise) return

    const newItem: ExercisePerformance = {
      exerciseId,
      displayName: exercise.name,
      sets: [],
      notes: '',
    }

    setSessionItems([...sessionItems, newItem])
    setShowExercisePicker(false)
  }

  const handleRemoveExercise = (index: number) => {
    setSessionItems(sessionItems.filter((_, i) => i !== index))
  }

  const handleUpdateExercise = (index: number, updated: ExercisePerformance) => {
    setSessionItems(sessionItems.map((item, i) => (i === index ? updated : item)))
  }

  const handleSave = async () => {
    if (!session) return

    setIsSaving(true)
    try {
      await updateSession(session.sessionId, {
        items: sessionItems,
        notes: sessionNotes,
        status: 'completed',
        completedAtMs: Date.now(),
      })
      onSave()
      onClose()
    } catch (error) {
      console.error('Failed to save session:', error)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content training-session-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header">
          <div className="modal-title">
            <h2>
              {session.context === 'gym' && '🏋️'}
              {session.context === 'home' && '🏠'}
              {session.context === 'road' && '🏃'} Workout Session
            </h2>
            <p className="modal-subtitle">{session.dateKey}</p>
          </div>
          <button className="modal-close-button" onClick={onClose}>
            ✕
          </button>
        </div>

        {/* Timer */}
        <SessionTimer
          startedAtMs={session.startedAtMs}
          completedAtMs={session.completedAtMs}
          status={session.status}
        />

        {/* Exercise List */}
        <div className="modal-body">
          <div className="session-exercises">
            <div className="section-header">
              <h3>Exercises</h3>
              <button
                className="add-exercise-button"
                onClick={() => setShowExercisePicker(true)}
                disabled={isSaving}
              >
                + Add Exercise
              </button>
            </div>

            {sessionItems.length === 0 && (
              <div className="empty-state">
                <p>No exercises added yet</p>
                <p className="empty-state-hint">Click &quot;+ Add Exercise&quot; to get started</p>
              </div>
            )}

            {sessionItems.map((item, index) => (
              <div key={index} className="exercise-item">
                <div className="exercise-header">
                  <h4>{item.displayName}</h4>
                  <div className="exercise-actions">
                    <button
                      className="edit-button"
                      onClick={() => setEditingExerciseIndex(index)}
                      disabled={isSaving}
                    >
                      Edit
                    </button>
                    <button
                      className="remove-button"
                      onClick={() => handleRemoveExercise(index)}
                      disabled={isSaving}
                    >
                      Remove
                    </button>
                  </div>
                </div>

                {/* Set Logger */}
                {editingExerciseIndex === index && (
                  <SetLogger
                    exercise={item}
                    onUpdate={(updated) => handleUpdateExercise(index, updated)}
                    onClose={() => setEditingExerciseIndex(null)}
                  />
                )}

                {/* Set Summary */}
                {editingExerciseIndex !== index && item.sets && item.sets.length > 0 && (
                  <div className="sets-summary">
                    {item.sets.map((set, setIndex) => (
                      <div key={setIndex} className="set-summary-item">
                        <span className="set-number">Set {setIndex + 1}</span>
                        {set.reps && <span className="set-detail">{set.reps} reps</span>}
                        {set.weightKg && <span className="set-detail">{set.weightKg} kg</span>}
                        {set.rpe && <span className="set-detail">RPE {set.rpe}</span>}
                        {set.isWarmup && <span className="set-warmup">Warmup</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Session Notes */}
          <div className="session-notes-section">
            <h3>Session Notes</h3>
            <textarea
              className="session-notes-input"
              value={sessionNotes}
              onChange={(e) => setSessionNotes(e.target.value)}
              placeholder="How did the workout go? Any observations?"
              rows={4}
              disabled={isSaving}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="modal-footer">
          <button className="cancel-button" onClick={onClose} disabled={isSaving}>
            Cancel
          </button>
          <button className="save-button" onClick={handleSave} disabled={isSaving}>
            {isSaving ? 'Saving...' : 'Save Session'}
          </button>
        </div>

        {/* Exercise Picker Modal */}
        {showExercisePicker && (
          <ExercisePicker
            exercises={exercises}
            onSelect={handleAddExercise}
            onClose={() => setShowExercisePicker(false)}
          />
        )}
      </div>
    </div>
  )
}
