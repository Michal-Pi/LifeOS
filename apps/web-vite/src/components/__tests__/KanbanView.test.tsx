import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { KanbanView } from '../KanbanView'
import type { CanonicalTask, CanonicalProject } from '@/types/todo'

function makeTask(overrides: Partial<CanonicalTask> = {}): CanonicalTask {
  return {
    id: 'task-1',
    userId: 'u1',
    title: 'Test task',
    domain: 'work',
    importance: 4,
    status: 'inbox',
    completed: false,
    archived: false,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    ...overrides,
  }
}

const mockProjects: CanonicalProject[] = [
  {
    id: 'proj-1',
    userId: 'u1',
    title: 'Project Alpha',
    domain: 'work',
    color: '#ff0000',
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    archived: false,
  },
]

describe('KanbanView', () => {
  it('renders 4 columns', () => {
    render(<KanbanView tasks={[]} projects={[]} onTaskClick={vi.fn()} onStatusChange={vi.fn()} />)
    expect(screen.getByText('Inbox')).toBeInTheDocument()
    expect(screen.getByText('Active')).toBeInTheDocument()
    expect(screen.getByText('In Progress')).toBeInTheDocument()
    expect(screen.getByText('Done')).toBeInTheDocument()
  })

  it('places tasks in correct columns based on status', () => {
    const tasks = [
      makeTask({ id: 't1', title: 'Inbox task', status: 'inbox' }),
      makeTask({ id: 't2', title: 'Active task', status: 'next_action' }),
      makeTask({ id: 't3', title: 'Scheduled task', status: 'scheduled' }),
      makeTask({ id: 't4', title: 'Done task', status: 'done', completed: true }),
    ]

    render(
      <KanbanView tasks={tasks} projects={[]} onTaskClick={vi.fn()} onStatusChange={vi.fn()} />
    )

    expect(screen.getByText('Inbox task')).toBeInTheDocument()
    expect(screen.getByText('Active task')).toBeInTheDocument()
    expect(screen.getByText('Scheduled task')).toBeInTheDocument()
    expect(screen.getByText('Done task')).toBeInTheDocument()
  })

  it('calls onTaskClick when a card is clicked', () => {
    const onTaskClick = vi.fn()
    const task = makeTask({ id: 't1', title: 'Click me' })

    render(
      <KanbanView tasks={[task]} projects={[]} onTaskClick={onTaskClick} onStatusChange={vi.fn()} />
    )

    fireEvent.click(screen.getByText('Click me'))
    expect(onTaskClick).toHaveBeenCalledWith(task)
  })

  it('shows priority badge for urgent tasks', () => {
    const task = makeTask({ id: 't1', title: 'Urgent task', urgency: 'today' })

    render(
      <KanbanView tasks={[task]} projects={[]} onTaskClick={vi.fn()} onStatusChange={vi.fn()} />
    )

    expect(screen.getByText('today')).toBeInTheDocument()
  })

  it('shows due date when task is due within 7 days', () => {
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    const dueDateStr = tomorrow.toISOString().split('T')[0]

    const task = makeTask({ id: 't1', title: 'Due soon task', dueDate: dueDateStr })

    render(
      <KanbanView tasks={[task]} projects={[]} onTaskClick={vi.fn()} onStatusChange={vi.fn()} />
    )

    expect(screen.getByText('Tomorrow')).toBeInTheDocument()
  })

  it('shows project color dot', () => {
    const task = makeTask({ id: 't1', title: 'Project task', projectId: 'proj-1' })

    const { container } = render(
      <KanbanView
        tasks={[task]}
        projects={mockProjects}
        onTaskClick={vi.fn()}
        onStatusChange={vi.fn()}
      />
    )

    const dot = container.querySelector('.kanban-card__dot')
    expect(dot).toBeInTheDocument()
  })

  it('calls onStatusChange during drag-and-drop', () => {
    const onStatusChange = vi.fn()
    const task = makeTask({ id: 't1', title: 'Drag me', status: 'inbox' })

    const { container } = render(
      <KanbanView
        tasks={[task]}
        projects={[]}
        onTaskClick={vi.fn()}
        onStatusChange={onStatusChange}
      />
    )

    const card = screen.getByText('Drag me').closest('.kanban-card')!
    const columns = container.querySelectorAll('.kanban-column')
    const activeColumn = columns[1] // Active column

    // Simulate drag start
    fireEvent.dragStart(card, {
      dataTransfer: {
        setData: vi.fn(),
        effectAllowed: '',
      },
    })

    // Simulate drop on Active column
    fireEvent.drop(activeColumn, {
      dataTransfer: {
        getData: () => 't1',
      },
    })

    expect(onStatusChange).toHaveBeenCalledWith('t1', 'next_action')
  })
})
