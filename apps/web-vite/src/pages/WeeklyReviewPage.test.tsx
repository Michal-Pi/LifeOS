import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { WeeklyReviewPage } from './WeeklyReviewPage'

// Mocks
vi.mock('@/hooks/useAuth', () => ({
  useAuth: vi.fn(() => ({ user: { uid: 'test-user' } })),
}))

vi.mock('@/hooks/useTodoOperations', () => ({
  useTodoOperations: vi.fn(() => ({
    tasks: [
      {
        id: '1',
        title: 'Completed Task',
        completed: true,
        completedAt: new Date().toISOString(),
        importance: 5,
      },
      {
        id: '2',
        title: 'Pending High Priority',
        completed: false,
        importance: 10,
        urgency: 'today',
      },
      { id: '3', title: 'Pending Low Priority', completed: false, importance: 1 },
    ],
    projects: [{ id: 'p1', title: 'Project Alpha' }],
    loading: false,
    loadData: vi.fn(),
  })),
}))

vi.mock('@/hooks/useWorkoutOperations', () => ({
  useWorkoutOperations: vi.fn(() => ({
    sessions: [],
    listSessions: vi.fn().mockResolvedValue([]),
  })),
}))

vi.mock('@/lib/priority', () => ({
  calculatePriorityScore: vi.fn((task) => task.importance * 10), // Simple mock calculation
}))

vi.mock('@/lib/progress', () => ({
  calculateWeightedProgress: vi.fn(() => ({ progress: 50, completed: 1, total: 2 })),
}))

describe('WeeklyReviewPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the first step (Completed Tasks) correctly', () => {
    render(<WeeklyReviewPage />)

    expect(screen.getByText('Weekly Review')).toBeInTheDocument()
    expect(screen.getByText('Review Completed Tasks')).toBeInTheDocument()
    expect(screen.getByText('Completed Task')).toBeInTheDocument()
    expect(screen.queryByText('Pending High Priority')).not.toBeInTheDocument()
  })

  it('renders the second step (Pending Priorities) correctly', async () => {
    render(<WeeklyReviewPage />)
    const user = userEvent.setup()

    // Click Next
    const nextButton = screen.getByText('Next')
    await user.click(nextButton)

    expect(await screen.findByText('Check Pending Priorities')).toBeInTheDocument()
    expect(await screen.findByText('Pending High Priority')).toBeInTheDocument()
  })

  it('renders the third step (Project Progress) correctly', async () => {
    render(<WeeklyReviewPage />)
    const user = userEvent.setup()

    // Click Next twice
    await user.click(screen.getByText('Next'))
    await user.click(screen.getByText('Next'))

    expect(await screen.findByText('Project Progress')).toBeInTheDocument()
    expect(await screen.findByText('Project Alpha')).toBeInTheDocument()
    expect(await screen.findByText('50% complete')).toBeInTheDocument()
  })
})
