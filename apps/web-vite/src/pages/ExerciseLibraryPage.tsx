/**
 * ExerciseLibraryPage Component
 *
 * Comprehensive UI for managing personal exercise library.
 * Users can view, add, edit, delete exercises with search and filtering.
 *
 * Features:
 * - Table view with columns: Generic Name, Target Muscle, Category, Variants
 * - Search by exercise name
 * - Filter by category (new ExerciseTypeCategory)
 * - Add/Edit/Delete exercises
 * - Auto-import default exercises on first use
 */

import { useState, useEffect, useCallback, useMemo, Fragment } from 'react'
import { useWorkoutOperations } from '@/hooks/useWorkoutOperations'
import { ExerciseFormModal } from '@/components/training/ExerciseFormModal'
import type { ExerciseLibraryItem, ExerciseTypeCategory } from '@lifeos/training'
import {
  getDefaultExercises,
  EXERCISE_CATEGORY_LABELS,
  EXERCISE_TYPE_CATEGORIES,
} from '@/utils/defaultExercises'
import { useDialog } from '@/contexts/useDialog'

export function ExerciseLibraryPage() {
  const { confirm } = useDialog()
  const { isLoading, exercises, listExercises, createExercise, deleteExercise } =
    useWorkoutOperations()

  const PAGE_SIZE = 20
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<ExerciseTypeCategory | 'all'>('all')
  const [currentPage, setCurrentPage] = useState(1)
  const [sortField, setSortField] = useState<'name' | 'target' | 'category'>('name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
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
              generic_name: ex.generic_name,
              target_muscle_group: ex.target_muscle_group,
              category: ex.category,
              gym: ex.gym,
              home: ex.home,
              road: ex.road,
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

  // Helper to get display name (supports both old and new schema)
  const getExerciseName = (exercise: ExerciseLibraryItem): string => {
    return exercise.generic_name || exercise.name || 'Unnamed'
  }

  // Helper to get target muscle display
  const getTargetMuscleDisplay = (exercise: ExerciseLibraryItem): string => {
    const target = exercise.target_muscle_group
    if (!target) return '-'
    return Array.isArray(target) ? target.join(', ') : target
  }

  // Helper to get category label (supports both old and new schema)
  const getCategoryLabel = (exercise: ExerciseLibraryItem): string => {
    if (exercise.category && EXERCISE_CATEGORY_LABELS[exercise.category]) {
      return EXERCISE_CATEGORY_LABELS[exercise.category]
    }
    // Fallback for legacy category
    if (exercise.legacyCategory) {
      return exercise.legacyCategory.charAt(0).toUpperCase() + exercise.legacyCategory.slice(1)
    }
    return '-'
  }

  // Helper to count variants
  const getVariantCounts = (
    exercise: ExerciseLibraryItem
  ): { gym: number; home: number; road: number } => {
    return {
      gym: exercise.gym?.length || 0,
      home: exercise.home?.length || 0,
      road: exercise.road?.length || 0,
    }
  }

  // Filter exercises
  const filteredExercises = exercises.filter((exercise) => {
    const name = getExerciseName(exercise)
    const matchesSearch = name.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesCategory = selectedCategory === 'all' || exercise.category === selectedCategory
    const notArchived = !exercise.archived
    return matchesSearch && matchesCategory && notArchived
  })

  // Configurable sorting
  const sortedExercises = useMemo(() => {
    return [...filteredExercises].sort((a, b) => {
      let cmp = 0
      switch (sortField) {
        case 'name':
          cmp = getExerciseName(a).localeCompare(getExerciseName(b))
          break
        case 'target':
          cmp = getTargetMuscleDisplay(a).localeCompare(getTargetMuscleDisplay(b))
          break
        case 'category':
          cmp = getCategoryLabel(a).localeCompare(getCategoryLabel(b))
          break
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [filteredExercises, sortField, sortDir])

  // Pagination
  const totalPages = Math.ceil(sortedExercises.length / PAGE_SIZE)
  const paginatedExercises = sortedExercises.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  )

  const toggleSort = (field: 'name' | 'target' | 'category') => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDir('asc')
    }
  }

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
      const confirmed = await confirm({
        title: 'Delete exercise',
        description: 'Delete this exercise? This cannot be undone.',
        confirmLabel: 'Delete',
        confirmVariant: 'danger',
      })
      if (!confirmed) return

      try {
        await deleteExercise(exerciseId)
        setError(null)
      } catch (err) {
        setError((err as Error).message)
      }
    },
    [confirm, deleteExercise]
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
          <span>{error}</span>
          <button onClick={() => setError(null)}>x</button>
        </div>
      )}

      {/* Search and Filter */}
      <div className="exercise-filter-bar">
        <input
          type="text"
          className="exercise-filter-bar__search search-input"
          placeholder="Search exercises..."
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value)
            setCurrentPage(1)
          }}
        />
        <div className="exercise-filter-bar__chips">
          <button
            className={`filter-chip ${selectedCategory === 'all' ? 'filter-chip--active' : ''}`}
            onClick={() => {
              setSelectedCategory('all')
              setCurrentPage(1)
            }}
          >
            All ({exercises.filter((e) => !e.archived).length})
          </button>
          {EXERCISE_TYPE_CATEGORIES.map((cat) => {
            const count = exercises.filter((e) => e.category === cat && !e.archived).length
            return (
              <button
                key={cat}
                className={`filter-chip ${selectedCategory === cat ? 'filter-chip--active' : ''}`}
                onClick={() => {
                  setSelectedCategory(cat)
                  setCurrentPage(1)
                }}
              >
                {EXERCISE_CATEGORY_LABELS[cat]} ({count})
              </button>
            )
          })}
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
        <>
          <div className="exercise-library-summary">
            <span>
              Showing {(currentPage - 1) * PAGE_SIZE + 1}–
              {Math.min(currentPage * PAGE_SIZE, sortedExercises.length)} of{' '}
              {sortedExercises.length} exercises
            </span>
          </div>
          <div className="exercise-table-container">
            <table className="exercise-table">
              <thead>
                <tr>
                  <th className="sortable-header" onClick={() => toggleSort('name')}>
                    Exercise{' '}
                    {sortField === 'name' && (
                      <span className="sort-arrow">{sortDir === 'asc' ? '\u2191' : '\u2193'}</span>
                    )}
                  </th>
                  <th className="sortable-header" onClick={() => toggleSort('target')}>
                    Target Muscle{' '}
                    {sortField === 'target' && (
                      <span className="sort-arrow">{sortDir === 'asc' ? '\u2191' : '\u2193'}</span>
                    )}
                  </th>
                  <th className="sortable-header" onClick={() => toggleSort('category')}>
                    Category{' '}
                    {sortField === 'category' && (
                      <span className="sort-arrow">{sortDir === 'asc' ? '\u2191' : '\u2193'}</span>
                    )}
                  </th>
                  <th>Variants</th>
                  <th className="actions-column">Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedExercises.map((exercise) => {
                  const variants = getVariantCounts(exercise)
                  return (
                    <tr key={exercise.exerciseId}>
                      <td className="exercise-name-cell">{getExerciseName(exercise)}</td>
                      <td className="exercise-target-cell">{getTargetMuscleDisplay(exercise)}</td>
                      <td className="exercise-category-cell">{getCategoryLabel(exercise)}</td>
                      <td className="exercise-variants-cell">
                        <span className="variant-badge gym" title="Gym variants">
                          G:{variants.gym}
                        </span>
                        <span className="variant-badge home" title="Home variants">
                          H:{variants.home}
                        </span>
                        <span className="variant-badge road" title="Road variants">
                          R:{variants.road}
                        </span>
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
                  )
                })}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="pagination">
              <button
                className="ghost-button pagination__button"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                Previous
              </button>
              <div className="pagination__pages">
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter((page) => {
                    return page === 1 || page === totalPages || Math.abs(page - currentPage) <= 1
                  })
                  .map((page, i, arr) => (
                    <Fragment key={page}>
                      {i > 0 && arr[i - 1] !== page - 1 && (
                        <span className="pagination__ellipsis">...</span>
                      )}
                      <button
                        className={`pagination__page ${page === currentPage ? 'pagination__page--active' : ''}`}
                        onClick={() => setCurrentPage(page)}
                      >
                        {page}
                      </button>
                    </Fragment>
                  ))}
              </div>
              <button
                className="ghost-button pagination__button"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
              >
                Next
              </button>
            </div>
          )}
        </>
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
