/**
 * ExercisePicker Component
 *
 * Modal for selecting exercises from the library.
 * Features:
 * - Search/filter by name
 * - Filter by category
 * - Display exercise metadata (category, equipment)
 */

import { useState } from 'react'
import type { ExerciseLibraryItem, ExerciseId, ExerciseCategory } from '@lifeos/training'

interface ExercisePickerProps {
  exercises: ExerciseLibraryItem[]
  onSelect: (exerciseId: ExerciseId) => void
  onClose: () => void
}

const CATEGORY_LABELS: Record<ExerciseCategory, string> = {
  push: 'Push',
  pull: 'Pull',
  legs: 'Legs',
  core: 'Core',
  conditioning: 'Conditioning',
  mobility: 'Mobility',
  other: 'Other',
}

export function ExercisePicker({ exercises, onSelect, onClose }: ExercisePickerProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<ExerciseCategory | 'all'>('all')

  const filteredExercises = exercises.filter((exercise) => {
    const matchesSearch = exercise.name.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesCategory = selectedCategory === 'all' || exercise.category === selectedCategory

    return matchesSearch && matchesCategory
  })

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content exercise-picker-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header">
          <h3>Select Exercise</h3>
          <button className="modal-close-button" onClick={onClose}>
            ✕
          </button>
        </div>

        {/* Search and Filters */}
        <div className="exercise-picker-filters">
          <input
            type="text"
            className="search-input"
            placeholder="Search exercises..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            autoFocus
          />

          <div className="category-filter">
            <button
              className={`category-button ${selectedCategory === 'all' ? 'active' : ''}`}
              onClick={() => setSelectedCategory('all')}
            >
              All
            </button>
            {(Object.keys(CATEGORY_LABELS) as ExerciseCategory[]).map((category) => (
              <button
                key={category}
                className={`category-button ${selectedCategory === category ? 'active' : ''}`}
                onClick={() => setSelectedCategory(category)}
              >
                {CATEGORY_LABELS[category]}
              </button>
            ))}
          </div>
        </div>

        {/* Exercise List */}
        <div className="exercise-picker-list">
          {filteredExercises.length === 0 && (
            <div className="empty-state">
              <p>No exercises found</p>
              {searchQuery && <p className="empty-state-hint">Try a different search term</p>}
            </div>
          )}

          {filteredExercises.map((exercise) => (
            <button
              key={exercise.exerciseId}
              className="exercise-picker-item"
              onClick={() => onSelect(exercise.exerciseId)}
            >
              <div className="exercise-picker-item-content">
                <div className="exercise-name">{exercise.name}</div>
                <div className="exercise-meta">
                  {exercise.category && (
                    <span className="exercise-category">{CATEGORY_LABELS[exercise.category]}</span>
                  )}
                  {exercise.equipment && exercise.equipment.length > 0 && (
                    <span className="exercise-equipment">{exercise.equipment.join(', ')}</span>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
