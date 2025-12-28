/**
 * ExerciseLibraryPage Component
 *
 * Comprehensive UI for managing personal exercise library.
 * Users can view, add, edit, delete exercises with search and filtering.
 *
 * Features:
 * - Table view with columns: Name, Category, Equipment, Default Metrics
 * - Search by exercise name
 * - Filter by category
 * - Add/Edit/Delete exercises
 * - Auto-import default exercises on first use
 */

import { useState, useEffect, useCallback } from 'react'
import { useWorkoutOperations } from '@/hooks/useWorkoutOperations'
import { ExerciseFormModal } from '@/components/training/ExerciseFormModal'
import type { ExerciseLibraryItem, ExerciseCategory } from '@lifeos/training'
import { getDefaultExercises } from '@/utils/defaultExercises'

declare const confirm: (message: string) => boolean

const CATEGORY_LABELS: Record<ExerciseCategory, string> = {
  push: 'Push',
  pull: 'Pull',
  legs: 'Legs',
  core: 'Core',
  conditioning: 'Conditioning',
  mobility: 'Mobility',
  other: 'Other',
}

const CATEGORY_OPTIONS: ExerciseCategory[] = [
  'push',
  'pull',
  'legs',
  'core',
  'conditioning',
  'mobility',
  'other',
]

export function ExerciseLibraryPage() {
  const { isLoading, exercises, listExercises, createExercise, deleteExercise } =
    useWorkoutOperations()

  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<ExerciseCategory | 'all'>('all')
  const [showFormModal, setShowFormModal] = useState(false)
  const [editingExercise, setEditingExercise] = useState<ExerciseLibraryItem | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Load exercises on mount
  useEffect(() => {
    const load = async () => {
      try {
        await listExercises()

        // If no exercises, import defaults
        if (exercises.length === 0) {
          const defaults = getDefaultExercises()
          for (const ex of defaults) {
            await createExercise({
              name: ex.name,
              category: ex.category,
              equipment: ex.equipment,
              defaultMetrics: ex.defaultMetrics,
              archived: false,
              userId: '', // Will be set by hook
            })
          }
          // Reload after import
          await listExercises()
        }
      } catch (err) {
        setError((err as Error).message)
      }
    }

    void load()
  }, [exercises.length, listExercises, createExercise])

  // Filter exercises
  const filteredExercises = exercises.filter((exercise) => {
    const matchesSearch = exercise.name.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesCategory = selectedCategory === 'all' || exercise.category === selectedCategory
    const notArchived = !exercise.archived
    return matchesSearch && matchesCategory && notArchived
  })

  // Sort by name
  const sortedExercises = [...filteredExercises].sort((a, b) => a.name.localeCompare(b.name))

  const handleAdd = useCallback(() => {
    setEditingExercise(null)
    setShowFormModal(true)
  }, [])

  const handleEdit = useCallback((exercise: ExerciseLibraryItem) => {
    setEditingExercise(exercise)
    setShowFormModal(true)
  }, [])

  const handleDelete = useCallback(
    async (exerciseId: string) => {
      if (!confirm('Delete this exercise? This cannot be undone.')) return

      try {
        await deleteExercise(exerciseId)
        setError(null)
      } catch (err) {
        setError((err as Error).message)
      }
    },
    [deleteExercise]
  )

  const handleCloseModal = useCallback(() => {
    setShowFormModal(false)
    setEditingExercise(null)
  }, [])

  const handleSaveModal = useCallback(async () => {
    // Reload exercises after save
    await listExercises()
    setShowFormModal(false)
    setEditingExercise(null)
  }, [listExercises])

  return (
    <div className="exercise-library-page">
      <header className="exercise-library-header">
        <div>
          <p className="section-label">Training</p>
          <h1>Exercise Library</h1>
          <p className="exercise-library-meta">
            Manage your personal exercise catalog. {sortedExercises.length} exercises.
          </p>
        </div>
        <button className="primary-button" onClick={handleAdd} disabled={isLoading}>
          + Add Exercise
        </button>
      </header>

      {error && (
        <div className="error-banner">
          <span>⚠ {error}</span>
          <button onClick={() => setError(null)}>✕</button>
        </div>
      )}

      {/* Search and Filter */}
      <div className="exercise-library-filters">
        <div className="search-box">
          <input
            type="text"
            className="search-input"
            placeholder="Search exercises..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="category-filters">
          <button
            className={`category-filter-button ${selectedCategory === 'all' ? 'active' : ''}`}
            onClick={() => setSelectedCategory('all')}
          >
            All
          </button>
          {CATEGORY_OPTIONS.map((cat) => (
            <button
              key={cat}
              className={`category-filter-button ${selectedCategory === cat ? 'active' : ''}`}
              onClick={() => setSelectedCategory(cat)}
            >
              {CATEGORY_LABELS[cat]}
            </button>
          ))}
        </div>
      </div>

      {/* Exercise Table */}
      {isLoading ? (
        <div className="exercise-library-loading">
          <p>Loading exercises...</p>
        </div>
      ) : sortedExercises.length === 0 ? (
        <div className="empty-state">
          <p>
            {searchQuery || selectedCategory !== 'all'
              ? 'No exercises match your filters.'
              : 'No exercises yet. Add your first exercise!'}
          </p>
        </div>
      ) : (
        <div className="exercise-table-container">
          <table className="exercise-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Category</th>
                <th>Equipment</th>
                <th>Default Metrics</th>
                <th className="actions-column">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedExercises.map((exercise) => (
                <tr key={exercise.exerciseId}>
                  <td className="exercise-name-cell">{exercise.name}</td>
                  <td className="exercise-category-cell">
                    {exercise.category ? CATEGORY_LABELS[exercise.category] : '-'}
                  </td>
                  <td className="exercise-equipment-cell">
                    {exercise.equipment && exercise.equipment.length > 0
                      ? exercise.equipment.join(', ')
                      : '-'}
                  </td>
                  <td className="exercise-metrics-cell">
                    {exercise.defaultMetrics.join(', ').replace(/_/g, ' ')}
                  </td>
                  <td className="exercise-actions-cell">
                    <button
                      className="edit-button-small"
                      onClick={() => handleEdit(exercise)}
                      title="Edit exercise"
                    >
                      Edit
                    </button>
                    <button
                      className="delete-button-small"
                      onClick={() => handleDelete(exercise.exerciseId)}
                      title="Delete exercise"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Exercise Form Modal */}
      <ExerciseFormModal
        exercise={editingExercise}
        isOpen={showFormModal}
        onClose={handleCloseModal}
        onSave={handleSaveModal}
      />
    </div>
  )
}
