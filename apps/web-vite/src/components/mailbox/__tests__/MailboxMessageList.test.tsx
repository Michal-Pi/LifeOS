import { render, screen, fireEvent } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PrioritizedMessage } from '@lifeos/agents'
import { MailboxMessageList } from '../MailboxMessageList'

// jsdom does not implement scrollIntoView
Element.prototype.scrollIntoView = vi.fn()

// Mock the useMailboxMessageBody hook used by ThreadMessage
vi.mock('@/hooks/useMailboxMessageBody', () => ({
  useMailboxMessageBody: (messageId: string) => ({
    body: `Full body for ${messageId}`,
    loading: false,
    htmlBody: null,
    attachmentCount: 0,
    error: null,
  }),
}))

// ---- Helpers ----

let msgCounter = 0

function makeMessage(overrides: Partial<PrioritizedMessage> = {}): PrioritizedMessage {
  msgCounter++
  return {
    messageId: `msg-${msgCounter}` as PrioritizedMessage['messageId'],
    userId: 'user-1',
    source: 'gmail',
    accountId: 'acc-1',
    originalMessageId: `orig-${msgCounter}`,
    sender: 'Test User',
    senderEmail: `test${msgCounter}@example.com`,
    subject: `Subject ${msgCounter}`,
    snippet: `snippet ${msgCounter}`,
    receivedAtMs: Date.now() - msgCounter * 60_000,
    priority: 'medium',
    aiSummary: `AI summary ${msgCounter}`,
    requiresFollowUp: false,
    isRead: false,
    isDismissed: false,
    createdAtMs: Date.now(),
    updatedAtMs: Date.now(),
    ...overrides,
  } as PrioritizedMessage
}

// ---- Default props factory ----

function defaultProps(overrides: Partial<React.ComponentProps<typeof MailboxMessageList>> = {}) {
  return {
    messages: [] as PrioritizedMessage[],
    loading: false,
    error: null,
    onDismiss: vi.fn(),
    onSelectMessage: vi.fn(),
    onMarkAsRead: vi.fn(),
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  msgCounter = 0
})

// =========================================================================
// 1. Conversation rendering
// =========================================================================

describe('Conversation rendering', () => {
  it('renders messages sharing a threadId as a single conversation row', () => {
    const messages = [
      makeMessage({ threadId: 'thread-A', sender: 'Alice', receivedAtMs: 3000 }),
      makeMessage({ threadId: 'thread-A', sender: 'Alice', receivedAtMs: 2000 }),
      makeMessage({ threadId: 'thread-A', sender: 'Alice', receivedAtMs: 1000 }),
    ]
    render(<MailboxMessageList {...defaultProps({ messages })} />)

    // Should show sender name
    expect(screen.getByText('Alice')).toBeInTheDocument()

    // Thread count badge should display the number of messages
    const countBadge = document.querySelector('.conv-row__count')
    expect(countBadge).toHaveTextContent('3')
  })

  it('shows the subject from the earliest message in the thread', () => {
    const messages = [
      makeMessage({
        threadId: 'thread-B',
        sender: 'Bob',
        receivedAtMs: 3000,
        subject: 'Re: Project Update',
      }),
      makeMessage({
        threadId: 'thread-B',
        sender: 'Bob',
        receivedAtMs: 1000,
        subject: 'Project Update',
      }),
    ]
    render(<MailboxMessageList {...defaultProps({ messages })} />)

    // The thread subject should use the earliest message's subject
    expect(screen.getByText('Project Update')).toBeInTheDocument()
  })

  it('displays AI summary as the primary element', () => {
    const messages = [
      makeMessage({
        threadId: 'thread-ai',
        sender: 'Carol',
        aiSummary: 'Meeting rescheduled to Thursday',
      }),
    ]
    render(<MailboxMessageList {...defaultProps({ messages })} />)

    const summary = document.querySelector('.conv-row__summary')
    expect(summary).toHaveTextContent('Meeting rescheduled to Thursday')
  })

  it('displays last message snippet as the preview trust layer', () => {
    const messages = [
      makeMessage({
        threadId: 'thread-preview',
        sender: 'Dave',
        snippet: 'Can we reschedule the meeting?',
      }),
    ]
    render(<MailboxMessageList {...defaultProps({ messages })} />)

    expect(screen.getByText('Can we reschedule the meeting?')).toBeInTheDocument()
    // Sender should appear in the preview
    expect(screen.getByText('Dave:')).toBeInTheDocument()
  })
})

// =========================================================================
// 2. Single messages render as standalone conversation rows
// =========================================================================

describe('Single messages render as standalone rows', () => {
  it('renders messages without matching threads as individual conversation rows', () => {
    const messages = [
      makeMessage({ threadId: 'thread-X', sender: 'Alice', subject: 'Hello from Alice' }),
      makeMessage({ threadId: 'thread-Y', sender: 'Bob', subject: 'Hello from Bob' }),
      makeMessage({ threadId: 'thread-Z', sender: 'Charlie', subject: 'Hello from Charlie' }),
    ]
    render(<MailboxMessageList {...defaultProps({ messages })} />)

    const rows = screen.getAllByRole('listitem')
    expect(rows).toHaveLength(3)

    expect(screen.getByText('Alice')).toBeInTheDocument()
    expect(screen.getByText('Bob')).toBeInTheDocument()
    expect(screen.getByText('Charlie')).toBeInTheDocument()
  })

  it('does not show a count badge for standalone messages', () => {
    const messages = [
      makeMessage({ threadId: 'solo-1', sender: 'Solo Sender', subject: 'Solo Subject' }),
    ]
    render(<MailboxMessageList {...defaultProps({ messages })} />)

    const countBadges = document.querySelectorAll('.conv-row__count')
    expect(countBadges).toHaveLength(0)
  })
})

// =========================================================================
// 3. Thread expansion via click
// =========================================================================

describe('Thread expansion via click', () => {
  it('reveals thread messages when the conversation row is clicked', () => {
    const messages = [
      makeMessage({
        threadId: 'thread-expand',
        sender: 'Alice',
        receivedAtMs: 3000,
        snippet: 'Latest reply from Alice',
      }),
      makeMessage({
        threadId: 'thread-expand',
        sender: 'Alice',
        receivedAtMs: 2000,
        snippet: 'Middle reply from Alice',
      }),
      makeMessage({
        threadId: 'thread-expand',
        sender: 'Alice',
        receivedAtMs: 1000,
        snippet: 'Original message from Alice',
      }),
    ]
    render(<MailboxMessageList {...defaultProps({ messages })} />)

    // Before clicking, thread view should not be visible
    expect(document.querySelector('.conv-row__thread')).not.toBeInTheDocument()

    // Click the expand button to expand the thread
    const expandBtn = screen.getByLabelText('Expand thread')
    fireEvent.click(expandBtn)

    // After clicking, thread view should be visible
    expect(document.querySelector('.conv-row__thread')).toBeInTheDocument()

    // Individual thread messages should now be rendered
    const threadMsgs = document.querySelectorAll('.thread-msg')
    expect(threadMsgs).toHaveLength(3)
  })

  it('shows expand button with message count for multi-message threads', () => {
    const messages = [
      makeMessage({ threadId: 'thread-btn', sender: 'Carol', receivedAtMs: 2000 }),
      makeMessage({ threadId: 'thread-btn', sender: 'Carol', receivedAtMs: 1000 }),
    ]
    render(<MailboxMessageList {...defaultProps({ messages })} />)

    const expandBtn = screen.getByLabelText('Expand thread')
    expect(expandBtn).toBeInTheDocument()
    expect(expandBtn).toHaveTextContent('2 messages')
  })
})

// =========================================================================
// 4. Thread collapse on second click
// =========================================================================

describe('Thread collapse on second click', () => {
  it('collapses an expanded thread when clicked again', () => {
    const messages = [
      makeMessage({
        threadId: 'thread-collapse',
        sender: 'Dan',
        receivedAtMs: 2000,
      }),
      makeMessage({
        threadId: 'thread-collapse',
        sender: 'Dan',
        receivedAtMs: 1000,
      }),
    ]
    render(<MailboxMessageList {...defaultProps({ messages })} />)

    // First click on expand button: expand
    const expandBtn = screen.getByLabelText('Expand thread')
    fireEvent.click(expandBtn)
    expect(document.querySelector('.conv-row__thread')).toBeInTheDocument()

    // Second click on collapse button: collapse
    const collapseBtn = screen.getByLabelText('Collapse thread')
    fireEvent.click(collapseBtn)
    expect(document.querySelector('.conv-row__thread')).not.toBeInTheDocument()
  })
})

// =========================================================================
// 5. Inline action buttons
// =========================================================================

describe('Inline action buttons', () => {
  it('renders reply and archive action buttons on each conversation row', () => {
    const messages = [
      makeMessage({ threadId: 'solo', sender: 'Eve', subject: 'Quick actions test' }),
    ]
    render(<MailboxMessageList {...defaultProps({ messages })} />)

    expect(screen.getByLabelText('Reply to Eve')).toBeInTheDocument()
    expect(screen.getByLabelText('Archive conversation with Eve')).toBeInTheDocument()
  })

  it('calls onDismiss when the archive button is clicked', () => {
    const onDismiss = vi.fn()
    const messages = [makeMessage({ threadId: 'dismiss-test', sender: 'Grace' })]
    render(<MailboxMessageList {...defaultProps({ messages, onDismiss })} />)

    const archiveBtn = screen.getByLabelText('Archive conversation with Grace')
    fireEvent.click(archiveBtn)

    expect(onDismiss).toHaveBeenCalledWith(messages[0].messageId)
  })

  it('calls onSelectMessage when the reply button is clicked', () => {
    const onSelectMessage = vi.fn()
    const messages = [makeMessage({ threadId: 'reply-test', sender: 'Hank' })]
    render(<MailboxMessageList {...defaultProps({ messages, onSelectMessage })} />)

    const replyBtn = screen.getByLabelText('Reply to Hank')
    fireEvent.click(replyBtn)

    expect(onSelectMessage).toHaveBeenCalledWith(messages[0])
  })
})

// =========================================================================
// 6. Conversation count and summary
// =========================================================================

describe('Conversation count and summary', () => {
  it('shows the correct message count badge for a thread with 3 messages', () => {
    const messages = [
      makeMessage({ threadId: 'count-3', sender: 'Leo', receivedAtMs: 3000 }),
      makeMessage({ threadId: 'count-3', sender: 'Leo', receivedAtMs: 2000 }),
      makeMessage({ threadId: 'count-3', sender: 'Leo', receivedAtMs: 1000 }),
    ]
    render(<MailboxMessageList {...defaultProps({ messages })} />)

    const countBadge = document.querySelector('.conv-row__count')
    expect(countBadge).toBeInTheDocument()
    expect(countBadge).toHaveTextContent('3')
  })

  it('shows correct counts for multiple threads', () => {
    const messages = [
      makeMessage({ threadId: 'multi-A', sender: 'Nina', receivedAtMs: 4000 }),
      makeMessage({ threadId: 'multi-A', sender: 'Nina', receivedAtMs: 3000 }),
      makeMessage({ threadId: 'multi-B', sender: 'Oscar', receivedAtMs: 2000 }),
      makeMessage({ threadId: 'multi-B', sender: 'Oscar', receivedAtMs: 1000 }),
      makeMessage({ threadId: 'multi-B', sender: 'Oscar', receivedAtMs: 500 }),
    ]
    render(<MailboxMessageList {...defaultProps({ messages })} />)

    const countBadges = document.querySelectorAll('.conv-row__count')
    expect(countBadges).toHaveLength(2)

    // Nina has 2 messages, Oscar has 3
    expect(countBadges[0]).toHaveTextContent('2')
    expect(countBadges[1]).toHaveTextContent('3')
  })

  it('displays conversation and message counts in the summary line', () => {
    const messages = [
      makeMessage({ threadId: 'summary-thread', sender: 'Pat', receivedAtMs: 3000 }),
      makeMessage({ threadId: 'summary-thread', sender: 'Pat', receivedAtMs: 2000 }),
      makeMessage({ threadId: 'summary-thread', sender: 'Pat', receivedAtMs: 1000 }),
    ]
    render(<MailboxMessageList {...defaultProps({ messages })} />)

    // Component shows "1 conversation (3 messages)"
    expect(screen.getByText(/1 conversation/)).toBeInTheDocument()
    const summary = document.querySelector('.conv-feed__summary')
    expect(summary).toHaveTextContent('3 messages')
  })

  it('pluralises conversation count correctly', () => {
    const messages = [
      makeMessage({ threadId: 'pl-A', sender: 'Quinn', receivedAtMs: 3000 }),
      makeMessage({ threadId: 'pl-A', sender: 'Quinn', receivedAtMs: 2000 }),
      makeMessage({ threadId: 'pl-B', sender: 'Ray', receivedAtMs: 1000 }),
      makeMessage({ threadId: 'pl-B', sender: 'Ray', receivedAtMs: 500 }),
    ]
    render(<MailboxMessageList {...defaultProps({ messages })} />)

    // "2 conversations (4 messages)"
    expect(screen.getByText(/2 conversations/)).toBeInTheDocument()
    expect(screen.getByText(/4 messages/)).toBeInTheDocument()
  })
})

// =========================================================================
// 7. Loading, error, and empty states
// =========================================================================

describe('States', () => {
  it('shows loading state when loading with no messages', () => {
    render(<MailboxMessageList {...defaultProps({ loading: true })} />)
    expect(screen.getByText('Loading messages...')).toBeInTheDocument()
  })

  it('shows error state when error occurs with no messages', () => {
    render(<MailboxMessageList {...defaultProps({ error: 'Network error' })} />)
    expect(screen.getByText('Failed to load messages')).toBeInTheDocument()
    expect(screen.getByText('Network error')).toBeInTheDocument()
  })

  it('shows empty state when no messages exist', () => {
    render(<MailboxMessageList {...defaultProps()} />)
    expect(screen.getByText('No messages to show')).toBeInTheDocument()
  })
})
