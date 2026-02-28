import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TodayPage } from '../TodayPage'

// Mock auth
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { uid: 'test-user' } }),
}))

// Mock auto sync
vi.mock('@/hooks/useAutoSync', () => ({
  useAutoSync: vi.fn(),
}))

// Mock calendar account status
vi.mock('@/hooks/useCalendarAccountStatus', () => ({
  useCalendarAccountStatus: () => ({ accountStatus: null }),
}))

// Mock todo operations
const mockCreateTask = vi.fn()
const mockUpdateTask = vi.fn()
vi.mock('@/hooks/useTodoOperations', () => ({
  useTodoOperations: () => ({
    tasks: [
      {
        id: 'task-1',
        userId: 'test-user',
        title: 'Most important task',
        domain: 'work',
        importance: 10,
        urgency: 'today',
        status: 'next_action',
        completed: false,
        archived: false,
        createdAt: '2026-02-27T00:00:00Z',
        updatedAt: '2026-02-27T00:00:00Z',
      },
      {
        id: 'task-2',
        userId: 'test-user',
        title: 'Second task',
        domain: 'work',
        importance: 7,
        urgency: 'today',
        status: 'next_action',
        completed: false,
        archived: false,
        createdAt: '2026-02-27T00:00:00Z',
        updatedAt: '2026-02-27T00:00:00Z',
      },
      {
        id: 'task-3',
        userId: 'test-user',
        title: 'Third task',
        domain: 'work',
        importance: 4,
        urgency: 'today',
        status: 'next_action',
        completed: false,
        archived: false,
        createdAt: '2026-02-27T00:00:00Z',
        updatedAt: '2026-02-27T00:00:00Z',
      },
    ],
    loadData: vi.fn(),
    createTask: mockCreateTask,
    updateTask: mockUpdateTask,
  }),
}))

// Mock training today
vi.mock('@/hooks/useTrainingToday', () => ({
  useTrainingToday: () => ({ variants: [] }),
}))

// Mock calendar events (8 events to test limit)
vi.mock('@lifeos/calendar', () => ({
  isDeleted: () => false,
  listEvents: () => Promise.resolve([]),
}))

vi.mock('@/adapters/firestoreCalendarEventRepository', () => ({
  createFirestoreCalendarEventRepository: () => ({}),
}))

vi.mock('@/adapters/firestoreQuoteRepository', () => ({
  createFirestoreQuoteRepository: () => ({
    getQuotes: () => Promise.resolve([]),
  }),
}))

vi.mock('@/calendar/offlineStore', () => ({
  listEventsByDayKeysLocally: () => Promise.resolve([]),
  bulkSaveEventsLocally: () => Promise.resolve(),
}))

vi.mock('@/quotes/offlineStore', () => ({
  getQuotesLocally: () => Promise.resolve([]),
  saveQuotesLocally: () => Promise.resolve(),
}))

vi.mock('@lifeos/core', () => ({
  createLogger: () => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
  getDefaultQuotes: () => [{ text: 'Test quote', author: 'Test Author' }],
  getQuoteForDate: (_quotes: unknown[], _key: string) => ({
    text: 'Test quote',
    author: 'Test Author',
  }),
}))

vi.mock('@/lib/priority', () => ({
  calculatePriorityScore: (task: { importance: number }) => task.importance * 10,
}))

vi.mock('@/utils/seedDemoTraining', () => ({
  seedDemoTrainingData: vi.fn(),
}))

// Mock child components to isolate page logic
vi.mock('@/components/mind/CheckInCard', () => ({
  CheckInCard: () => <div data-testid="check-in-card">CheckIn</div>,
}))

vi.mock('@/components/habits/IncantationDisplay', () => ({
  IncantationDisplay: () => <div data-testid="incantation-display">Incantations</div>,
}))

vi.mock('@/components/habits/HabitCheckInCard', () => ({
  HabitCheckInCard: () => <div data-testid="habit-checkin">Habits</div>,
}))

vi.mock('@/components/training/TodayWorkout', () => ({
  TodayWorkout: () => <div data-testid="today-workout">Workout</div>,
}))

vi.mock('@/components/training/WorkoutSessionCard', () => ({
  WorkoutSessionCard: () => <div data-testid="workout-session">Session</div>,
}))

vi.mock('@/components/contacts/FollowUpWidget', () => ({
  FollowUpWidget: () => <div data-testid="follow-up-widget">FollowUps</div>,
}))

vi.mock('@/components/contacts/MeetingBriefingModal', () => ({
  MeetingBriefingModal: () => null,
}))

vi.mock('@/components/mailbox/MessageMailbox', () => ({
  MessageMailbox: () => <div data-testid="message-mailbox">Mailbox</div>,
}))

vi.mock('@/components/StatusBar', () => ({
  StatusBar: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="status-bar">{children}</div>
  ),
}))

vi.mock('@/components/StatusDot', () => ({
  StatusDot: () => <span data-testid="status-dot" />,
}))

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}))

beforeEach(() => {
  vi.clearAllMocks()
})

function renderPage() {
  return render(
    <MemoryRouter>
      <TodayPage />
    </MemoryRouter>
  )
}

describe('TodayPage', () => {
  it('renders without crash', () => {
    renderPage()
    expect(screen.getByTestId('status-bar')).toBeInTheDocument()
  })

  it('renders telemetry bar with pill elements', () => {
    renderPage()
    const telemetry = screen.getByTestId('today-telemetry')
    expect(telemetry).toBeInTheDocument()
    expect(telemetry.querySelectorAll('.today-telemetry-bar__pill')).toHaveLength(4)
  })

  it('renders frog task with distinct styling', () => {
    renderPage()
    const frog = screen.getByTestId('today-frog-task')
    expect(frog).toBeInTheDocument()
    expect(frog).toHaveClass('today-frog-task')
    expect(screen.getByText('Most important task')).toBeInTheDocument()
  })

  it('renders quick-add input', () => {
    renderPage()
    expect(screen.getByPlaceholderText('+ Add a task for today...')).toBeInTheDocument()
  })

  it('renders collapsible sections with <details> elements open by default', () => {
    renderPage()
    const details = document.querySelectorAll('details.today-card-collapse')
    expect(details.length).toBeGreaterThanOrEqual(3)
    details.forEach((d) => {
      expect(d).toHaveAttribute('open')
    })
  })

  it('renders "See full calendar" link when no events', () => {
    renderPage()
    // With mocked empty calendar events, the empty state should show
    expect(screen.getByText('Calendar is open')).toBeInTheDocument()
  })
})
