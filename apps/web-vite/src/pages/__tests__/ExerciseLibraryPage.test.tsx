import { render, screen, fireEvent } from '@testing-library/react'
import { ExerciseLibraryPage } from '../ExerciseLibraryPage'
import type { ExerciseLibraryItem, ExerciseTypeCategory } from '@lifeos/training'

function makeExercise(
  overrides: Partial<ExerciseLibraryItem> & { exerciseId: string; generic_name: string }
): ExerciseLibraryItem {
  return {
    userId: 'user-1',
    target_muscle_group: 'Chest',
    category: 'upper_push' as ExerciseTypeCategory,
    gym: [],
    home: [],
    road: [],
    archived: false,
    ...overrides,
  } as ExerciseLibraryItem
}

// Generate N exercises for pagination tests
function generateExercises(count: number): ExerciseLibraryItem[] {
  return Array.from({ length: count }, (_, i) =>
    makeExercise({
      exerciseId: `ex-${i + 1}`,
      generic_name: `Exercise ${String(i + 1).padStart(3, '0')}`,
      category:
        i % 2 === 0 ? ('upper_push' as ExerciseTypeCategory) : ('lower' as ExerciseTypeCategory),
      target_muscle_group: i % 2 === 0 ? 'Chest' : 'Quadriceps',
    })
  )
}

const mockListExercises = vi.fn().mockResolvedValue([])
const mockCreateExercise = vi.fn()
const mockDeleteExercise = vi.fn()

vi.mock('@/hooks/useWorkoutOperations', () => ({
  useWorkoutOperations: () => ({
    isLoading: false,
    exercises: generateExercises(25),
    listExercises: mockListExercises,
    createExercise: mockCreateExercise,
    deleteExercise: mockDeleteExercise,
  }),
}))

vi.mock('@/utils/defaultExercises', () => ({
  getDefaultExercises: () => [],
  EXERCISE_CATEGORY_LABELS: {
    upper_push: 'Upper Push',
    upper_pull: 'Upper Pull',
    lower: 'Lower Body',
    core: 'Core',
    cardio: 'Cardio',
    mobility: 'Mobility',
    sport: 'Sport',
  } as Record<string, string>,
  EXERCISE_TYPE_CATEGORIES: [
    'upper_push',
    'upper_pull',
    'lower',
    'core',
    'cardio',
    'mobility',
    'sport',
  ],
}))

vi.mock('@/contexts/useDialog', () => ({
  useDialog: () => ({ confirm: vi.fn().mockResolvedValue(true) }),
}))

vi.mock('@/components/training/ExerciseFormModal', () => ({
  ExerciseFormModal: () => null,
}))

describe('ExerciseLibraryPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders pagination with 25 exercises (2 pages)', () => {
    render(<ExerciseLibraryPage />)
    // Should show pagination controls
    expect(screen.getByText('Next')).toBeInTheDocument()
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  it('shows result summary', () => {
    render(<ExerciseLibraryPage />)
    expect(screen.getByText(/Showing 1–20 of 25 exercises/)).toBeInTheDocument()
  })

  it('navigates to page 2', () => {
    render(<ExerciseLibraryPage />)
    fireEvent.click(screen.getByText('2'))
    expect(screen.getByText(/Showing 21–25 of 25 exercises/)).toBeInTheDocument()
  })

  it('renders sortable column headers', () => {
    render(<ExerciseLibraryPage />)
    const headers = screen.getAllByRole('columnheader')
    const exerciseHeader = headers.find((h) => h.textContent?.includes('Exercise'))
    expect(exerciseHeader).toHaveClass('sortable-header')
  })

  it('toggles sort direction on column click', () => {
    render(<ExerciseLibraryPage />)
    const headers = screen.getAllByRole('columnheader')
    const exerciseHeader = headers.find((h) => h.textContent?.includes('Exercise'))!
    // Default ascending — arrow should be ↑
    expect(exerciseHeader.textContent).toContain('\u2191')

    // Click to toggle to descending
    fireEvent.click(exerciseHeader)
    expect(exerciseHeader.textContent).toContain('\u2193')
  })

  it('renders category chips with counts', () => {
    render(<ExerciseLibraryPage />)
    // 25 exercises total, 13 upper_push (even indices 0,2,...24), 12 lower (odd)
    expect(screen.getByText('All (25)')).toBeInTheDocument()
    expect(screen.getByText('Upper Push (13)')).toBeInTheDocument()
    expect(screen.getByText('Lower Body (12)')).toBeInTheDocument()
  })

  it('resets to page 1 when search query changes', () => {
    render(<ExerciseLibraryPage />)
    // Go to page 2
    fireEvent.click(screen.getByText('2'))
    expect(screen.getByText(/Showing 21–25/)).toBeInTheDocument()

    // Type a search query — should reset to page 1
    const searchInput = screen.getByPlaceholderText('Search exercises...')
    fireEvent.change(searchInput, { target: { value: 'Exercise 001' } })
    // After filtering, should show page 1 results
    expect(screen.queryByText('2')).not.toBeInTheDocument()
  })
})
