import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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

vi.mock('@/contexts/RepositoryContext', () => ({
  useRepositories: () => ({
    quoteRepository: {
      getQuotes: () => Promise.resolve([]),
    },
    calendarRepository: {},
    checkInRepository: {},
    contactRepository: {},
    todoRepository: {},
    planRepository: {},
    templateRepository: {},
    sessionRepository: {},
  }),
}))

// Mock child components to isolate page logic
vi.mock('@/components/contacts/FollowUpWidget', () => ({
  FollowUpWidget: () => <div data-testid="follow-up-widget">FollowUps</div>,
}))

vi.mock('@/components/contacts/MeetingBriefingModal', () => ({
  MeetingBriefingModal: () => null,
}))

vi.mock('@/components/mailbox/MessageMailbox', () => ({
  MessageMailbox: () => <div data-testid="message-mailbox">Mailbox</div>,
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
    expect(screen.getByTestId('today-telemetry')).toBeInTheDocument()
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
    expect(screen.getByPlaceholderText('+ Create task...')).toBeInTheDocument()
  })

  it('renders collapsible sections with <details> elements open by default', () => {
    renderPage()
    const details = document.querySelectorAll('details.today-card-collapse')
    expect(details.length).toBeGreaterThanOrEqual(2)
    details.forEach((d) => {
      expect(d).toHaveAttribute('open')
    })
  })

  it('renders "See full calendar" link when no events', async () => {
    renderPage()
    // With mocked empty calendar events, loading skeleton shows first, then empty state
    expect(await screen.findByText('Calendar is open')).toBeInTheDocument()
  })

  it('creates a task via quick-add on Enter', async () => {
    const user = userEvent.setup()
    renderPage()
    const input = screen.getByPlaceholderText('+ Create task...')
    await user.type(input, 'New task{Enter}')
    expect(mockCreateTask).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'New task',
        importance: 4,
      })
    )
  })

  it('completes a task when checkbox is clicked', async () => {
    const user = userEvent.setup()
    renderPage()
    // The frog task checkbox has aria-label "Complete Most important task"
    const checkbox = screen.getByRole('button', { name: /Complete Most important task/i })
    await user.click(checkbox)
    expect(mockUpdateTask).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'task-1',
        completed: true,
      })
    )
  })

  it('snoozes a task when snooze button is clicked', async () => {
    const user = userEvent.setup()
    renderPage()
    const snoozeBtn = screen.getByRole('button', {
      name: /Snooze Most important task to tomorrow/i,
    })
    await user.click(snoozeBtn)
    expect(mockUpdateTask).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'task-1',
        urgency: 'this_week',
      })
    )
  })

  it('task checkboxes have aria-labels for accessibility', () => {
    renderPage()
    expect(screen.getByRole('button', { name: /Complete Most important task/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Complete Second task/ })).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /Snooze Most important task to tomorrow/ })
    ).toBeInTheDocument()
  })

  it('UTIL telemetry uses /10 denominator (0% with no events)', () => {
    renderPage()
    // With no events, busyHours = 0, so UTIL = 0 / 10 * 100 = 0%
    expect(screen.getByText('UTIL 0%')).toBeInTheDocument()
  })

  it('shows calendar loading skeleton while events are loading', () => {
    renderPage()
    // On initial render, eventsLoading is true and events are empty
    const skeletons = document.querySelectorAll('.today-skeleton-row')
    expect(skeletons.length).toBe(3)
  })

  it('renders child components', () => {
    renderPage()
    expect(screen.getByTestId('follow-up-widget')).toBeInTheDocument()
    expect(screen.getByTestId('message-mailbox')).toBeInTheDocument()
  })

  it('shows importance selector when typing a task', async () => {
    const user = userEvent.setup()
    renderPage()
    const input = screen.getByPlaceholderText('+ Create task...')
    await user.type(input, 'Test task')
    // Importance buttons should appear
    const importanceBtns = document.querySelectorAll('.today-quick-add__importance-btn')
    expect(importanceBtns.length).toBe(5)
  })
})
