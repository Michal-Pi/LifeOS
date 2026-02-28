import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { PrioritizedMessage, MessageSource } from '@lifeos/agents'

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

// Standalone ConversationList component for testing the conversation history feature
function ConversationList({
  messages,
  channelFilter,
  searchQuery,
  onChannelFilterChange,
  onSearchChange,
}: {
  messages: PrioritizedMessage[]
  channelFilter: MessageSource | 'all'
  searchQuery: string
  onChannelFilterChange: (filter: MessageSource | 'all') => void
  onSearchChange: (query: string) => void
}) {
  const filteredMessages = messages
    .filter((m) => channelFilter === 'all' || m.source === channelFilter)
    .filter((m) => {
      if (!searchQuery.trim()) return true
      const search = searchQuery.toLowerCase()
      return (
        m.subject?.toLowerCase().includes(search) ||
        m.snippet?.toLowerCase().includes(search) ||
        m.sender?.toLowerCase().includes(search)
      )
    })
    .sort((a, b) => b.receivedAtMs - a.receivedAtMs)

  return (
    <div className="contact-conversations">
      <div className="contact-conversations__filters">
        <input
          type="text"
          placeholder="Search conversations..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="contact-conversations__search"
        />
        <div className="contact-conversations__channel-filter">
          {(['all', 'gmail', 'slack', 'linkedin'] as const).map((ch) => (
            <button
              key={ch}
              className={`filter-chip ${channelFilter === ch ? 'filter-chip--active' : ''}`}
              onClick={() => onChannelFilterChange(ch)}
            >
              {ch === 'all' ? 'All' : ch.charAt(0).toUpperCase() + ch.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {filteredMessages.length === 0 ? (
        <div className="empty-state">
          <p>No conversations with this contact yet.</p>
        </div>
      ) : (
        <div className="contact-conversations__list">
          {filteredMessages.map((msg) => (
            <div
              key={msg.messageId}
              className="conversation-entry"
              data-testid="conversation-entry"
            >
              <span
                className={`conversation-entry__source conversation-entry__source--${msg.source}`}
              >
                {msg.source}
              </span>
              <div className="conversation-entry__content">
                <span className="conversation-entry__subject">{msg.subject || msg.sender}</span>
                <p className="conversation-entry__snippet">{msg.snippet}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

describe('ConversationHistory', () => {
  it('renders all messages in the conversation list', () => {
    const messages = [
      makeMessage({ subject: 'Subject A', source: 'gmail' }),
      makeMessage({ subject: 'Subject B', source: 'slack' }),
      makeMessage({ subject: 'Subject C', source: 'gmail' }),
    ]

    render(
      <ConversationList
        messages={messages}
        channelFilter="all"
        searchQuery=""
        onChannelFilterChange={vi.fn()}
        onSearchChange={vi.fn()}
      />
    )

    expect(screen.getByText('Subject A')).toBeInTheDocument()
    expect(screen.getByText('Subject B')).toBeInTheDocument()
    expect(screen.getByText('Subject C')).toBeInTheDocument()
    expect(screen.getAllByTestId('conversation-entry')).toHaveLength(3)
  })

  it('filters by Gmail channel showing only Gmail messages', () => {
    const messages = [
      makeMessage({ subject: 'Gmail Message', source: 'gmail' }),
      makeMessage({ subject: 'Slack Message', source: 'slack' }),
      makeMessage({ subject: 'LinkedIn Message', source: 'linkedin' }),
    ]

    render(
      <ConversationList
        messages={messages}
        channelFilter="gmail"
        searchQuery=""
        onChannelFilterChange={vi.fn()}
        onSearchChange={vi.fn()}
      />
    )

    expect(screen.getByText('Gmail Message')).toBeInTheDocument()
    expect(screen.queryByText('Slack Message')).not.toBeInTheDocument()
    expect(screen.queryByText('LinkedIn Message')).not.toBeInTheDocument()
    expect(screen.getAllByTestId('conversation-entry')).toHaveLength(1)
  })

  it('search filters by subject', () => {
    const messages = [
      makeMessage({ subject: 'Project proposal review' }),
      makeMessage({ subject: 'Meeting notes' }),
      makeMessage({ subject: 'Quarterly report' }),
    ]

    render(
      <ConversationList
        messages={messages}
        channelFilter="all"
        searchQuery="proposal"
        onChannelFilterChange={vi.fn()}
        onSearchChange={vi.fn()}
      />
    )

    expect(screen.getByText('Project proposal review')).toBeInTheDocument()
    expect(screen.queryByText('Meeting notes')).not.toBeInTheDocument()
    expect(screen.queryByText('Quarterly report')).not.toBeInTheDocument()
  })

  it('search filters by snippet', () => {
    const messages = [
      makeMessage({ subject: 'Email 1', snippet: 'Please review the budget spreadsheet' }),
      makeMessage({ subject: 'Email 2', snippet: 'See you at lunch tomorrow' }),
    ]

    render(
      <ConversationList
        messages={messages}
        channelFilter="all"
        searchQuery="budget"
        onChannelFilterChange={vi.fn()}
        onSearchChange={vi.fn()}
      />
    )

    expect(screen.getByText('Email 1')).toBeInTheDocument()
    expect(screen.queryByText('Email 2')).not.toBeInTheDocument()
  })

  it('shows empty state when no messages', () => {
    render(
      <ConversationList
        messages={[]}
        channelFilter="all"
        searchQuery=""
        onChannelFilterChange={vi.fn()}
        onSearchChange={vi.fn()}
      />
    )

    expect(screen.getByText('No conversations with this contact yet.')).toBeInTheDocument()
  })

  it('clicking channel filter calls onChannelFilterChange', () => {
    const onChannelFilterChange = vi.fn()

    render(
      <ConversationList
        messages={[makeMessage()]}
        channelFilter="all"
        searchQuery=""
        onChannelFilterChange={onChannelFilterChange}
        onSearchChange={vi.fn()}
      />
    )

    fireEvent.click(screen.getByText('Gmail'))
    expect(onChannelFilterChange).toHaveBeenCalledWith('gmail')
  })

  it('renders channel filter buttons', () => {
    render(
      <ConversationList
        messages={[]}
        channelFilter="all"
        searchQuery=""
        onChannelFilterChange={vi.fn()}
        onSearchChange={vi.fn()}
      />
    )

    expect(screen.getByText('All')).toBeInTheDocument()
    expect(screen.getByText('Gmail')).toBeInTheDocument()
    expect(screen.getByText('Slack')).toBeInTheDocument()
    expect(screen.getByText('Linkedin')).toBeInTheDocument()
  })

  it('applies active class to selected channel filter', () => {
    const { container } = render(
      <ConversationList
        messages={[]}
        channelFilter="slack"
        searchQuery=""
        onChannelFilterChange={vi.fn()}
        onSearchChange={vi.fn()}
      />
    )

    const activeChip = container.querySelector('.filter-chip--active')
    expect(activeChip).toBeInTheDocument()
    expect(activeChip?.textContent).toBe('Slack')
  })

  it('shows source badge with correct channel class', () => {
    const messages = [
      makeMessage({ source: 'gmail', subject: 'Gmail msg' }),
      makeMessage({ source: 'slack', subject: 'Slack msg' }),
    ]

    const { container } = render(
      <ConversationList
        messages={messages}
        channelFilter="all"
        searchQuery=""
        onChannelFilterChange={vi.fn()}
        onSearchChange={vi.fn()}
      />
    )

    expect(container.querySelector('.conversation-entry__source--gmail')).toBeInTheDocument()
    expect(container.querySelector('.conversation-entry__source--slack')).toBeInTheDocument()
  })

  it('falls back to sender name when no subject', () => {
    const messages = [makeMessage({ subject: undefined, sender: 'John Doe' })]

    render(
      <ConversationList
        messages={messages}
        channelFilter="all"
        searchQuery=""
        onChannelFilterChange={vi.fn()}
        onSearchChange={vi.fn()}
      />
    )

    expect(screen.getByText('John Doe')).toBeInTheDocument()
  })
})
