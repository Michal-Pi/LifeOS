import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MailboxDashboard } from '../MailboxDashboard'
import type { PrioritizedMessage } from '@lifeos/agents'

function makeMessage(overrides: Partial<PrioritizedMessage> = {}): PrioritizedMessage {
  return {
    messageId: `msg-${Math.random().toString(36).slice(2)}` as PrioritizedMessage['messageId'],
    userId: 'user-1',
    source: 'gmail',
    accountId: 'acc-1',
    originalMessageId: 'orig-1',
    sender: 'Test User',
    snippet: 'test snippet',
    receivedAtMs: Date.now(),
    priority: 'medium',
    aiSummary: 'test summary',
    requiresFollowUp: false,
    isRead: false,
    isDismissed: false,
    createdAtMs: Date.now(),
    updatedAtMs: Date.now(),
    ...overrides,
  } as PrioritizedMessage
}

describe('MailboxDashboard', () => {
  const defaultProps = {
    syncStatus: { lastSyncMs: Date.now() - 300_000 },
    onFilterChannel: vi.fn(),
    onFilterFollowUp: vi.fn(),
    onSync: vi.fn(),
  }

  it('renders channel unread counts', () => {
    const messages = [
      ...Array.from({ length: 5 }, () => makeMessage({ source: 'gmail', isRead: false })),
      ...Array.from({ length: 3 }, () => makeMessage({ source: 'slack', isRead: false })),
    ]

    render(<MailboxDashboard {...defaultProps} messages={messages} />)

    expect(screen.getByText('Gmail')).toBeInTheDocument()
    expect(screen.getByText('5 unread')).toBeInTheDocument()
    expect(screen.getByText('Slack')).toBeInTheDocument()
    expect(screen.getByText('3 unread')).toBeInTheDocument()
  })

  it('renders follow-up count in suggested actions', () => {
    const messages = [
      makeMessage({ requiresFollowUp: true, isDismissed: false }),
      makeMessage({ requiresFollowUp: true, isDismissed: false }),
      makeMessage({ requiresFollowUp: false }),
    ]

    render(<MailboxDashboard {...defaultProps} messages={messages} />)

    expect(screen.getByText('2 messages need your reply')).toBeInTheDocument()
  })

  it('clicking channel row calls onFilterChannel with correct source', () => {
    const onFilterChannel = vi.fn()
    const messages = [makeMessage({ source: 'gmail' }), makeMessage({ source: 'slack' })]

    render(
      <MailboxDashboard {...defaultProps} messages={messages} onFilterChannel={onFilterChannel} />
    )

    fireEvent.click(screen.getByText('Slack'))
    expect(onFilterChannel).toHaveBeenCalledWith('slack')
  })

  it('clicking View calls onFilterFollowUp', () => {
    const onFilterFollowUp = vi.fn()
    const messages = [makeMessage({ requiresFollowUp: true, isDismissed: false })]

    render(
      <MailboxDashboard {...defaultProps} messages={messages} onFilterFollowUp={onFilterFollowUp} />
    )

    fireEvent.click(screen.getByRole('button', { name: /view/i }))
    expect(onFilterFollowUp).toHaveBeenCalled()
  })

  it('renders quick stats with correct counts', () => {
    const now = Date.now()
    const messages = [
      makeMessage({
        receivedAtMs: now,
        requiresFollowUp: true,
        isDismissed: false,
        importanceScore: 80,
      }),
      makeMessage({ receivedAtMs: now, requiresFollowUp: false, importanceScore: 90 }),
      makeMessage({ receivedAtMs: now - 86_400_000 * 2, importanceScore: 30 }), // 2 days ago
    ]

    const { container } = render(<MailboxDashboard {...defaultProps} messages={messages} />)

    // Get all stat values in order: Today, Needs reply, AI Top 10
    const statValues = container.querySelectorAll('.mailbox-dashboard__stat-value')
    expect(statValues[0].textContent).toBe('2') // Today
    expect(statValues[1].textContent).toBe('1') // Needs reply
    expect(statValues[2].textContent).toBe('2') // AI Top 10
  })
})
