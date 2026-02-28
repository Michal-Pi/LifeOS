import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PrioritizedMessage } from '@lifeos/agents'
import { MailboxPage } from '../MailboxPage'
import { useMessageMailbox } from '@/hooks/useMessageMailbox'

// Mock child components to isolate page-level logic
vi.mock('@/components/mailbox/MailboxMessageList', () => ({
  MailboxMessageList: (props: {
    messages: PrioritizedMessage[]
    loading: boolean
    error: string | null
    selectedMessageId: string | null
    onSelectMessage: (msg: PrioritizedMessage) => void
    onDismiss: (id: string) => void
    channelFilter: string
    onChannelFilterChange: (f: string) => void
    focusedIndex: number
    onFocusedIndexChange: (i: number) => void
  }) => (
    <div data-testid="message-list">
      {props.loading && <div data-testid="list-loading">Loading...</div>}
      {props.error && <div data-testid="list-error">{props.error}</div>}
      {props.messages.map((m) => (
        <button
          key={m.messageId}
          data-testid={`msg-${m.messageId}`}
          data-selected={m.messageId === props.selectedMessageId}
          onClick={() => props.onSelectMessage(m)}
        >
          {m.sender}
        </button>
      ))}
      <div data-testid="channel-filter">{props.channelFilter}</div>
      <button data-testid="filter-gmail" onClick={() => props.onChannelFilterChange('gmail')}>
        Gmail
      </button>
      <button
        data-testid="dismiss-first"
        onClick={() => {
          if (props.messages[0]) props.onDismiss(props.messages[0].messageId)
        }}
      >
        Dismiss
      </button>
    </div>
  ),
}))

vi.mock('@/components/mailbox/MailboxMessageDetail', () => ({
  MailboxMessageDetail: ({ message }: { message: PrioritizedMessage }) => (
    <div data-testid="message-detail">
      <span data-testid="detail-sender">{message.sender}</span>
    </div>
  ),
}))

vi.mock('@/components/mailbox/MailboxComposer', () => ({
  MailboxComposer: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="composer">
      <button data-testid="close-composer" onClick={onClose}>
        Close
      </button>
    </div>
  ),
}))

vi.mock('@/components/mailbox/MailboxDashboard', () => ({
  MailboxDashboard: () => <div data-testid="dashboard">Select a message to read</div>,
}))

vi.mock('@/components/ErrorBoundary', () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock('@/hooks/useMessageMailbox', () => ({
  useMessageMailbox: vi.fn(),
}))

const createMessage = (overrides: Partial<PrioritizedMessage> = {}): PrioritizedMessage =>
  ({
    messageId: `msg-${Math.random().toString(36).slice(2)}`,
    userId: 'user-1',
    source: 'gmail',
    accountId: 'acc-1',
    originalMessageId: 'orig-1',
    sender: 'Alice',
    senderEmail: 'alice@example.com',
    subject: 'Test Subject',
    snippet: 'Test snippet',
    aiSummary: 'Test summary',
    priority: 'medium',
    requiresFollowUp: true,
    isRead: false,
    isDismissed: false,
    receivedAtMs: Date.now(),
    createdAtMs: Date.now(),
    updatedAtMs: Date.now(),
    ...overrides,
  }) as PrioritizedMessage

describe('MailboxPage', () => {
  const mockUseMessageMailbox = vi.mocked(useMessageMailbox)
  const mockSyncMailbox = vi.fn()
  const mockMarkAsRead = vi.fn()
  const mockDismissMessage = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mockSyncMailbox.mockResolvedValue(undefined)
    mockMarkAsRead.mockResolvedValue(undefined)
    mockDismissMessage.mockResolvedValue(undefined)
  })

  function setupHook(messages: PrioritizedMessage[] = [], overrides: Record<string, unknown> = {}) {
    mockUseMessageMailbox.mockReturnValue({
      messages,
      loading: false,
      error: null,
      syncStatus: { isSyncing: false },
      requiresAPIKeySetup: false,
      totalMessagesScanned: 0,
      highPriorityCount: 0,
      mediumPriorityCount: 0,
      lowPriorityCount: 0,
      followUpCount: 0,
      syncMailbox: mockSyncMailbox,
      markAsRead: mockMarkAsRead,
      dismissMessage: mockDismissMessage,
      refreshMessages: vi.fn(),
      ...overrides,
    })
  }

  function renderPage() {
    return render(
      <MemoryRouter initialEntries={['/mailbox']}>
        <MailboxPage />
      </MemoryRouter>
    )
  }

  it('renders page with empty state', () => {
    setupHook([])
    renderPage()

    expect(screen.getByText('Mailbox')).toBeInTheDocument()
    expect(screen.getByText('Compose')).toBeInTheDocument()
    expect(screen.getByText('Sync')).toBeInTheDocument()
    expect(screen.getByTestId('message-list')).toBeInTheDocument()
    expect(screen.getByText('Select a message to read')).toBeInTheDocument()
  })

  it('shows detail panel when a message is selected', async () => {
    const user = userEvent.setup()
    const msg = createMessage({ messageId: 'msg-1', sender: 'Bob' })
    setupHook([msg])
    renderPage()

    await user.click(screen.getByTestId('msg-msg-1'))

    expect(screen.getByTestId('message-detail')).toBeInTheDocument()
    expect(screen.getByTestId('detail-sender')).toHaveTextContent('Bob')
  })

  it('channel filter tabs change the filter', async () => {
    const user = userEvent.setup()
    setupHook([createMessage()])
    renderPage()

    // Initially "all"
    expect(screen.getByTestId('channel-filter')).toHaveTextContent('all')

    // Click Gmail filter
    await user.click(screen.getByTestId('filter-gmail'))
    expect(screen.getByTestId('channel-filter')).toHaveTextContent('gmail')
  })

  it('compose button opens the composer', async () => {
    const user = userEvent.setup()
    setupHook([])
    renderPage()

    expect(screen.queryByTestId('composer')).not.toBeInTheDocument()

    await user.click(screen.getByText('Compose'))

    expect(screen.getByTestId('composer')).toBeInTheDocument()
  })

  it('dismiss removes message selection when selected message is dismissed', async () => {
    const user = userEvent.setup()
    const msg = createMessage({ messageId: 'msg-1', sender: 'Carol' })
    setupHook([msg])
    renderPage()

    // Select the message first
    await user.click(screen.getByTestId('msg-msg-1'))
    expect(screen.getByTestId('message-detail')).toBeInTheDocument()

    // Dismiss it
    await user.click(screen.getByTestId('dismiss-first'))
    expect(mockDismissMessage).toHaveBeenCalledWith('msg-1')
  })

  it('shows syncing state in the sync button', () => {
    setupHook([], { syncStatus: { isSyncing: true } })
    renderPage()

    const syncButton = screen.getByText('Syncing...')
    expect(syncButton).toBeDisabled()
  })
})
