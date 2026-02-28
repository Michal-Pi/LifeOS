import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { ExtractedAction, ExtractedActionType } from '@/lib/mailboxAITools'

// Lightweight component that mirrors MailboxMessageDetail's action panel
function ActionPanel({
  actions,
  onCreateAction,
}: {
  actions: ExtractedAction[]
  onCreateAction: (action: ExtractedAction) => void
}) {
  if (actions.length === 0) return null

  return (
    <div className="action-panel">
      <h4 className="action-panel__title">Extracted Actions</h4>
      {actions.map((action, i) => (
        <div key={i} className="action-item" data-testid={`action-item-${i}`}>
          <div className="action-item__header">
            <span className={`action-item__type action-item__type--${action.type}`}>
              {action.type === 'task'
                ? 'Task'
                : action.type === 'event'
                  ? 'Event'
                  : action.type === 'contact_update'
                    ? 'Update'
                    : 'Follow-up'}
            </span>
            <span className="action-item__title">{action.title}</span>
          </div>
          {action.details && <p className="action-item__details">{action.details}</p>}
          <button
            type="button"
            className="action-item__create"
            onClick={() => onCreateAction(action)}
          >
            Create
          </button>
        </div>
      ))}
    </div>
  )
}

function makeAction(overrides: Partial<ExtractedAction> = {}): ExtractedAction {
  return {
    type: 'task',
    title: 'Review document',
    confidence: 0.9,
    ...overrides,
  }
}

describe('ActionExtraction', () => {
  it('renders the correct number of action items', () => {
    const actions = [
      makeAction({ title: 'Action 1' }),
      makeAction({ title: 'Action 2', type: 'event' }),
      makeAction({ title: 'Action 3', type: 'follow_up' }),
    ]

    render(<ActionPanel actions={actions} onCreateAction={vi.fn()} />)

    expect(screen.getByText('Action 1')).toBeInTheDocument()
    expect(screen.getByText('Action 2')).toBeInTheDocument()
    expect(screen.getByText('Action 3')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Create' })).toHaveLength(3)
  })

  it('clicking Create on a task action calls onCreateAction with the action', () => {
    const onCreateAction = vi.fn()
    const taskAction = makeAction({
      type: 'task',
      title: 'Send report',
      dueDate: '2026-03-01',
      details: 'Monthly sales report',
    })

    render(<ActionPanel actions={[taskAction]} onCreateAction={onCreateAction} />)

    fireEvent.click(screen.getByRole('button', { name: 'Create' }))

    expect(onCreateAction).toHaveBeenCalledWith(taskAction)
    expect(onCreateAction).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'task',
        title: 'Send report',
        dueDate: '2026-03-01',
      })
    )
  })

  it('renders correct badge labels for each action type', () => {
    const actions: ExtractedAction[] = [
      makeAction({ type: 'task', title: 'Task item' }),
      makeAction({ type: 'event', title: 'Event item' }),
      makeAction({ type: 'follow_up', title: 'Follow-up item' }),
      makeAction({ type: 'contact_update', title: 'Update item' }),
    ]

    const { container } = render(
      <ActionPanel actions={actions} onCreateAction={vi.fn()} />
    )

    expect(screen.getByText('Task')).toBeInTheDocument()
    expect(screen.getByText('Event')).toBeInTheDocument()
    expect(screen.getByText('Follow-up')).toBeInTheDocument()
    expect(screen.getByText('Update')).toBeInTheDocument()

    // Verify correct CSS classes for type badges
    const typeBadges = container.querySelectorAll('.action-item__type')
    const types: ExtractedActionType[] = ['task', 'event', 'follow_up', 'contact_update']
    types.forEach((type, i) => {
      expect(typeBadges[i].classList.contains(`action-item__type--${type}`)).toBe(true)
    })
  })

  it('renders details when provided', () => {
    const actions = [
      makeAction({ title: 'With details', details: 'Some extra details' }),
      makeAction({ title: 'Without details' }),
    ]

    render(<ActionPanel actions={actions} onCreateAction={vi.fn()} />)

    expect(screen.getByText('Some extra details')).toBeInTheDocument()
  })

  it('renders nothing when actions array is empty', () => {
    const { container } = render(
      <ActionPanel actions={[]} onCreateAction={vi.fn()} />
    )

    expect(container.querySelector('.action-panel')).toBeNull()
  })

  it('renders panel title', () => {
    const actions = [makeAction()]

    render(<ActionPanel actions={actions} onCreateAction={vi.fn()} />)

    expect(screen.getByText('Extracted Actions')).toBeInTheDocument()
  })
})
