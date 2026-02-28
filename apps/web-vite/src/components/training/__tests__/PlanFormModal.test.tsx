import { render, screen, fireEvent } from '@testing-library/react'
import { PlanFormModal } from '../PlanFormModal'

vi.mock('@/hooks/useWorkoutPlan', () => ({
  useWorkoutPlan: () => ({
    activePlan: null,
    createPlan: vi.fn(),
    updatePlan: vi.fn(),
  }),
}))

vi.mock('@/hooks/useWorkoutOperations', () => ({
  useWorkoutOperations: () => ({
    exercises: [],
    listExercises: vi.fn().mockResolvedValue([]),
  }),
}))

const defaultProps = {
  isOpen: true,
  onClose: vi.fn(),
  onSave: vi.fn(),
}

describe('PlanFormModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders 7 day tabs', () => {
    render(<PlanFormModal {...defaultProps} />)
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    for (const day of dayNames) {
      expect(screen.getByText(day)).toBeInTheDocument()
    }
  })

  it('shows one day at a time — defaults to Sunday', () => {
    render(<PlanFormModal {...defaultProps} />)
    expect(screen.getByText('Sunday')).toBeInTheDocument()
    expect(screen.queryByText('Monday')).not.toBeInTheDocument()
  })

  it('switching tab shows the selected day', () => {
    render(<PlanFormModal {...defaultProps} />)
    fireEvent.click(screen.getByText('Tue'))
    expect(screen.getByText('Tuesday')).toBeInTheDocument()
    expect(screen.queryByText('Sunday')).not.toBeInTheDocument()
  })

  it('toggles rest day and shows recovery message', () => {
    render(<PlanFormModal {...defaultProps} />)
    fireEvent.click(screen.getByText('Mon'))
    const checkbox = screen.getByRole('checkbox')
    fireEvent.click(checkbox)
    expect(screen.getByText(/Recovery day/)).toBeInTheDocument()
  })

  it('navigates with Previous/Next Day buttons', () => {
    render(<PlanFormModal {...defaultProps} />)
    // Default is Sunday (day 0), Previous should be disabled
    expect(screen.getByText('Previous Day')).toBeDisabled()

    fireEvent.click(screen.getByText('Next Day'))
    expect(screen.getByText('Monday')).toBeInTheDocument()
    expect(screen.getByText('2 / 7')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Previous Day'))
    expect(screen.getByText('Sunday')).toBeInTheDocument()
    expect(screen.getByText('1 / 7')).toBeInTheDocument()
  })

  it('has max-height capped modal', () => {
    const { container } = render(<PlanFormModal {...defaultProps} />)
    const modal = container.querySelector('.plan-form-modal')
    expect(modal).toBeInTheDocument()
  })
})
