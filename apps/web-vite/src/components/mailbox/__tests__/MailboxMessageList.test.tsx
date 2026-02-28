import { render, screen, fireEvent } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PrioritizedMessage } from '@lifeos/agents'
import { MailboxMessageList } from '../MailboxMessageList'

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
    selectedMessageId: null,
    channelFilter: 'all' as const,
    followUpOnly: false,
    focusedIndex: -1,
    onChannelFilterChange: vi.fn(),
    onSelectMessage: vi.fn(),
    onDismiss: vi.fn(),
    onFocusedIndexChange: vi.fn(),
    onReply: vi.fn(),
    onMarkAsRead: vi.fn(),
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  msgCounter = 0
})

// =========================================================================
// 1. Thread group rendering
// =========================================================================

/** Helper to get the thread header button element */
function getThreadHeader(): HTMLElement {
  const header = document.querySelector('.mailbox-thread__header')
  if (!header) throw new Error('Could not find thread header')
  return header as HTMLElement
}

describe('Thread group rendering', () => {
  it('renders messages sharing a threadId as a collapsible thread group', () => {
    const messages = [
      makeMessage({ threadId: 'thread-A', sender: 'Alice', receivedAtMs: 3000 }),
      makeMessage({ threadId: 'thread-A', sender: 'Alice', receivedAtMs: 2000 }),
      makeMessage({ threadId: 'thread-A', sender: 'Alice', receivedAtMs: 1000 }),
    ]
    render(<MailboxMessageList {...defaultProps({ messages })} />)

    // Thread header should show sender name
    expect(screen.getByText('Alice')).toBeInTheDocument()

    // Thread count badge should display the number of messages
    const countBadge = document.querySelector('.mailbox-thread__count')
    expect(countBadge).toHaveTextContent('3')

    // Thread group should have a header button with aria-expanded and a chevron
    const threadHeader = getThreadHeader()
    expect(threadHeader).toHaveAttribute('aria-expanded', 'false')
    expect(threadHeader.querySelector('.mailbox-thread__chevron')).toBeInTheDocument()
  })

  it('shows a thread group with the subject from the earliest message', () => {
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

    // The thread header should use the earliest message's subject
    expect(screen.getByText('Project Update')).toBeInTheDocument()
  })
})

// =========================================================================
// 2. Single messages render individually
// =========================================================================

describe('Single messages render individually', () => {
  it('renders messages without matching threads as standalone rows', () => {
    const messages = [
      makeMessage({ threadId: 'thread-X', sender: 'Alice', subject: 'Hello from Alice' }),
      makeMessage({ threadId: 'thread-Y', sender: 'Bob', subject: 'Hello from Bob' }),
      makeMessage({ threadId: 'thread-Z', sender: 'Charlie', subject: 'Hello from Charlie' }),
    ]
    render(<MailboxMessageList {...defaultProps({ messages })} />)

    // Each message should render as an individual option row
    const options = screen.getAllByRole('option')
    expect(options).toHaveLength(3)

    // Each sender should appear
    expect(screen.getByText('Alice')).toBeInTheDocument()
    expect(screen.getByText('Bob')).toBeInTheDocument()
    expect(screen.getByText('Charlie')).toBeInTheDocument()
  })

  it('does not show a thread count badge for standalone messages', () => {
    const messages = [
      makeMessage({ threadId: 'solo-1', sender: 'Solo Sender', subject: 'Solo Subject' }),
    ]
    render(<MailboxMessageList {...defaultProps({ messages })} />)

    // No thread count element should be present (no .mailbox-thread__count)
    const threadCountElements = document.querySelectorAll('.mailbox-thread__count')
    expect(threadCountElements).toHaveLength(0)
  })
})

// =========================================================================
// 3. Thread expansion on click
// =========================================================================

describe('Thread expansion on click', () => {
  it('reveals individual messages when a thread group header is clicked', () => {
    const messages = [
      makeMessage({
        threadId: 'thread-expand',
        sender: 'Alice',
        receivedAtMs: 3000,
        subject: 'Re: Discussion',
        aiSummary: 'Latest reply from Alice',
      }),
      makeMessage({
        threadId: 'thread-expand',
        sender: 'Alice',
        receivedAtMs: 2000,
        subject: 'Re: Discussion',
        aiSummary: 'Middle reply from Alice',
      }),
      makeMessage({
        threadId: 'thread-expand',
        sender: 'Alice',
        receivedAtMs: 1000,
        subject: 'Discussion',
        aiSummary: 'Original message from Alice',
      }),
    ]
    render(<MailboxMessageList {...defaultProps({ messages })} />)

    // Before clicking, thread child messages should not be visible
    expect(screen.queryByText('Original message from Alice')).not.toBeInTheDocument()
    expect(screen.queryByText('Middle reply from Alice')).not.toBeInTheDocument()

    // Click the thread header to expand
    const threadHeader = getThreadHeader()
    fireEvent.click(threadHeader)

    // After clicking, the thread group should be visible
    const threadGroup = screen.getByRole('group', { name: /Thread: Discussion/i })
    expect(threadGroup).toBeInTheDocument()

    // Individual messages should now be rendered inside the group
    expect(screen.getByText('Latest reply from Alice')).toBeInTheDocument()
    expect(screen.getByText('Middle reply from Alice')).toBeInTheDocument()
    expect(screen.getByText('Original message from Alice')).toBeInTheDocument()
  })

  it('sets aria-expanded to true on the thread header after clicking', () => {
    const messages = [
      makeMessage({ threadId: 'thread-aria', sender: 'Carol', receivedAtMs: 2000 }),
      makeMessage({ threadId: 'thread-aria', sender: 'Carol', receivedAtMs: 1000 }),
    ]
    render(<MailboxMessageList {...defaultProps({ messages })} />)

    const header = getThreadHeader()
    expect(header).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(header)

    expect(header).toHaveAttribute('aria-expanded', 'true')
  })
})

// =========================================================================
// 4. Thread collapse on second click
// =========================================================================

describe('Thread collapse on second click', () => {
  it('collapses an expanded thread when the header is clicked again', () => {
    const messages = [
      makeMessage({
        threadId: 'thread-collapse',
        sender: 'Dan',
        receivedAtMs: 2000,
        aiSummary: 'Dan reply',
      }),
      makeMessage({
        threadId: 'thread-collapse',
        sender: 'Dan',
        receivedAtMs: 1000,
        aiSummary: 'Dan original',
      }),
    ]
    render(<MailboxMessageList {...defaultProps({ messages })} />)

    const header = getThreadHeader()

    // First click: expand
    fireEvent.click(header)
    expect(header).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('group')).toBeInTheDocument()
    expect(screen.getByText('Dan original')).toBeInTheDocument()

    // Second click: collapse
    fireEvent.click(header)
    expect(header).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('group')).not.toBeInTheDocument()
    expect(screen.queryByText('Dan original')).not.toBeInTheDocument()
  })
})

// =========================================================================
// 5. Hover quick-action buttons
// =========================================================================

describe('Hover quick-action buttons', () => {
  it('renders archive, mark-read, and reply action buttons on each message row', () => {
    const messages = [
      makeMessage({ threadId: 'solo', sender: 'Eve', subject: 'Quick actions test' }),
    ]
    render(<MailboxMessageList {...defaultProps({ messages })} />)

    // Quick action buttons should be present in the DOM (shown on hover via CSS)
    expect(screen.getByLabelText('Archive message from Eve')).toBeInTheDocument()
    expect(screen.getByLabelText('Mark as read')).toBeInTheDocument()
    expect(screen.getByLabelText('Reply to Eve')).toBeInTheDocument()
  })

  it('has a hover-actions container with the correct CSS class', () => {
    const messages = [makeMessage({ threadId: 'hover-test', sender: 'Frank' })]
    render(<MailboxMessageList {...defaultProps({ messages })} />)

    const hoverContainer = document.querySelector('.mailbox-list__hover-actions')
    expect(hoverContainer).toBeInTheDocument()
  })

  it('calls onDismiss when the archive button is clicked', () => {
    const onDismiss = vi.fn()
    const messages = [makeMessage({ threadId: 'dismiss-test', sender: 'Grace' })]
    render(<MailboxMessageList {...defaultProps({ messages, onDismiss })} />)

    const archiveBtn = screen.getByLabelText('Archive message from Grace')
    fireEvent.click(archiveBtn)

    expect(onDismiss).toHaveBeenCalledWith(messages[0].messageId)
  })

  it('calls onReply when the reply button is clicked', () => {
    const onReply = vi.fn()
    const messages = [makeMessage({ threadId: 'reply-test', sender: 'Hank' })]
    render(<MailboxMessageList {...defaultProps({ messages, onReply })} />)

    const replyBtn = screen.getByLabelText('Reply to Hank')
    fireEvent.click(replyBtn)

    expect(onReply).toHaveBeenCalledWith(messages[0])
  })

  it('calls onMarkAsRead when the mark-read button is clicked', () => {
    const onMarkAsRead = vi.fn()
    const messages = [makeMessage({ threadId: 'read-test', sender: 'Iris', isRead: false })]
    render(<MailboxMessageList {...defaultProps({ messages, onMarkAsRead })} />)

    const markReadBtn = screen.getByLabelText('Mark as read')
    fireEvent.click(markReadBtn)

    expect(onMarkAsRead).toHaveBeenCalledWith(messages[0].messageId)
  })

  it('shows "Mark as unread" label when message is already read', () => {
    const messages = [makeMessage({ threadId: 'unread-test', sender: 'Jack', isRead: true })]
    render(<MailboxMessageList {...defaultProps({ messages })} />)

    expect(screen.getByLabelText('Mark as unread')).toBeInTheDocument()
  })

  it('renders action buttons inside expanded thread child messages', () => {
    const messages = [
      makeMessage({
        threadId: 'thread-actions',
        sender: 'Kate',
        receivedAtMs: 2000,
      }),
      makeMessage({
        threadId: 'thread-actions',
        sender: 'Kate',
        receivedAtMs: 1000,
      }),
    ]
    render(<MailboxMessageList {...defaultProps({ messages })} />)

    // Expand the thread
    const threadHeader = getThreadHeader()
    fireEvent.click(threadHeader)

    // Each child message row should have action buttons
    const archiveButtons = screen.getAllByTitle('Archive')
    expect(archiveButtons.length).toBe(2)

    const replyButtons = screen.getAllByTitle('Reply')
    expect(replyButtons.length).toBe(2)
  })
})

// =========================================================================
// 6. Thread count badge
// =========================================================================

describe('Thread count badge', () => {
  it('shows the correct message count for a thread with 3 messages', () => {
    const messages = [
      makeMessage({ threadId: 'count-3', sender: 'Leo', receivedAtMs: 3000 }),
      makeMessage({ threadId: 'count-3', sender: 'Leo', receivedAtMs: 2000 }),
      makeMessage({ threadId: 'count-3', sender: 'Leo', receivedAtMs: 1000 }),
    ]
    render(<MailboxMessageList {...defaultProps({ messages })} />)

    // The thread count badge should show "3"
    const countBadge = document.querySelector('.mailbox-thread__count')
    expect(countBadge).toBeInTheDocument()
    expect(countBadge).toHaveTextContent('3')
  })

  it('shows the correct message count for a thread with 5 messages', () => {
    const messages = Array.from({ length: 5 }, (_, i) =>
      makeMessage({
        threadId: 'count-5',
        sender: 'Mia',
        receivedAtMs: (5 - i) * 1000,
      })
    )
    render(<MailboxMessageList {...defaultProps({ messages })} />)

    const countBadge = document.querySelector('.mailbox-thread__count')
    expect(countBadge).toBeInTheDocument()
    expect(countBadge).toHaveTextContent('5')
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

    const countBadges = document.querySelectorAll('.mailbox-thread__count')
    expect(countBadges).toHaveLength(2)

    // First thread (Nina) has 2 messages, second (Oscar) has 3
    expect(countBadges[0]).toHaveTextContent('2')
    expect(countBadges[1]).toHaveTextContent('3')
  })

  it('displays the total message count in the summary line', () => {
    const messages = [
      makeMessage({ threadId: 'summary-thread', sender: 'Pat', receivedAtMs: 3000 }),
      makeMessage({ threadId: 'summary-thread', sender: 'Pat', receivedAtMs: 2000 }),
      makeMessage({ threadId: 'summary-thread', sender: 'Pat', receivedAtMs: 1000 }),
    ]
    render(<MailboxMessageList {...defaultProps({ messages })} />)

    // The component shows "3 messages in 1 thread"
    expect(screen.getByText(/3 messages/)).toBeInTheDocument()
    expect(screen.getByText(/1 thread/)).toBeInTheDocument()
  })

  it('shows pluralised thread count when multiple threads exist', () => {
    const messages = [
      makeMessage({ threadId: 'pl-A', sender: 'Quinn', receivedAtMs: 3000 }),
      makeMessage({ threadId: 'pl-A', sender: 'Quinn', receivedAtMs: 2000 }),
      makeMessage({ threadId: 'pl-B', sender: 'Ray', receivedAtMs: 1000 }),
      makeMessage({ threadId: 'pl-B', sender: 'Ray', receivedAtMs: 500 }),
    ]
    render(<MailboxMessageList {...defaultProps({ messages })} />)

    // "4 messages in 2 threads"
    expect(screen.getByText(/4 messages/)).toBeInTheDocument()
    expect(screen.getByText(/2 threads/)).toBeInTheDocument()
  })
})
