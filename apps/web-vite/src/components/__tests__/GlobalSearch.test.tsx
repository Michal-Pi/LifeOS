import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock hooks
const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { uid: 'u1' }, loading: false }),
}))

vi.mock('@/hooks/useTodoOperations', () => ({
  useTodoOperations: () => ({
    projects: [{ id: 'p1', title: 'Project Alpha' }],
    chapters: [{ id: 'c1', title: 'Chapter One' }],
    tasks: [
      { id: 't1', title: 'Fix login bug', projectId: 'p1' },
      { id: 't2', title: 'Add search feature', projectId: null },
    ],
    loadData: vi.fn(),
  }),
}))

vi.mock('@/hooks/useContacts', () => ({
  useContacts: () => ({
    contacts: [
      {
        contactId: 'ct1',
        firstName: 'John',
        lastName: 'Doe',
        emails: ['john@example.com'],
        circle: 1,
      },
    ],
  }),
}))

vi.mock('@/hooks/useNoteOperations', () => ({
  useNoteOperations: () => ({
    notes: [{ noteId: 'n1', title: 'Meeting notes about search' }],
  }),
}))

vi.mock('@/hooks/useWorkflowOperations', () => ({
  useWorkflowOperations: () => ({
    workflows: [{ workflowId: 'w1', name: 'Search workflow' }],
  }),
}))

vi.mock('@lifeos/agents', () => ({
  CIRCLE_LABELS: { 0: 'Core', 1: 'Inner', 2: 'Active', 3: 'Extended', 4: 'Acquaintance' },
}))

describe('GlobalSearch', () => {
  beforeEach(() => {
    mockNavigate.mockClear()
    localStorage.clear()
  })

  async function renderSearch() {
    const { GlobalSearch } = await import('../GlobalSearch')
    return render(
      <MemoryRouter>
        <GlobalSearch />
      </MemoryRouter>
    )
  }

  it('shows grouped results with type headers', async () => {
    await renderSearch()
    const input = screen.getByPlaceholderText('Search tasks, notes, contacts...')
    fireEvent.change(input, { target: { value: 'search' } })

    expect(screen.getByText('Tasks')).toBeInTheDocument()
    expect(screen.getByText('Notes')).toBeInTheDocument()
    expect(screen.getByText('Workflows')).toBeInTheDocument()
    expect(screen.getByText('Add search feature')).toBeInTheDocument()
    expect(screen.getByText('Meeting notes about search')).toBeInTheDocument()
    expect(screen.getByText('Search workflow')).toBeInTheDocument()
  })

  it('opens search on Cmd+K', async () => {
    await renderSearch()
    const input = screen.getByPlaceholderText('Search tasks, notes, contacts...')
    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    expect(document.activeElement).toBe(input)
  })

  it('navigates with arrow keys and highlights active result', async () => {
    const { container } = await renderSearch()
    const input = screen.getByPlaceholderText('Search tasks, notes, contacts...')
    fireEvent.change(input, { target: { value: 'search' } })

    // Arrow down once
    fireEvent.keyDown(window, { key: 'ArrowDown' })
    const activeResult = container.querySelector('.search-result--active')
    expect(activeResult).not.toBeNull()
  })

  it('selects result on Enter and navigates', async () => {
    await renderSearch()
    const input = screen.getByPlaceholderText('Search tasks, notes, contacts...')
    fireEvent.change(input, { target: { value: 'search' } })

    // Arrow down to first result, then Enter
    fireEvent.keyDown(window, { key: 'ArrowDown' })
    fireEvent.keyDown(window, { key: 'Enter' })
    expect(mockNavigate).toHaveBeenCalled()
  })

  it('closes on Escape', async () => {
    await renderSearch()
    const input = screen.getByPlaceholderText('Search tasks, notes, contacts...')
    fireEvent.change(input, { target: { value: 'search' } })

    expect(screen.getByText('Add search feature')).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByText('Add search feature')).not.toBeInTheDocument()
  })

  it('shows recent searches after selecting a result', async () => {
    await renderSearch()
    const input = screen.getByPlaceholderText('Search tasks, notes, contacts...')

    // Search and select a result
    fireEvent.change(input, { target: { value: 'search' } })
    fireEvent.keyDown(window, { key: 'ArrowDown' })
    fireEvent.keyDown(window, { key: 'Enter' })

    // Re-focus input to show recents
    fireEvent.focus(input)
    expect(screen.getByText('Recent')).toBeInTheDocument()
    expect(screen.getByText('search')).toBeInTheDocument()
  })
})
