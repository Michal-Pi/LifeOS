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
    selectedMessageId?: string | null
    onSelectMessage?: (msg: PrioritizedMessage) => void
    onDismiss: (id: string) => void
    onReply?: (msg: PrioritizedMessage) => void
    onMarkAsRead?: (id: string) => Promise<void>
  }) => (
    <div data-testid="message-list">
      {props.loading && <div data-testid="list-loading">Loading...</div>}
      {props.error && <div data-testid="list-error">{props.error}</div>}
      {props.messages.map((m) => (
        <button
          key={m.messageId}
          data-testid={`msg-${m.messageId}`}
          data-selected={m.messageId === props.selectedMessageId}
          onClick={() => props.onSelectMessage?.(m)}
        >
          {m.sender}
        </button>
      ))}
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

vi.mock('@/components/mailbox/MailboxComposeInline', () => ({
  MailboxComposeInline: ({ onDiscard }: { onDiscard?: () => void }) => (
    <div data-testid="composer">
      <button data-testid="close-composer" onClick={onDiscard}>
        Close
      </button>
    </div>
  ),
}))

vi.mock('@/components/mailbox/MailboxFolderList', () => ({
  MailboxFolderList: () => <div data-testid="folder-list" />,
}))

vi.mock('@/components/mailbox/MailboxOutboxDetail', () => ({
  MailboxOutboxDetail: () => <div data-testid="outbox-detail" />,
}))

vi.mock('@/components/mailbox/MailboxStatsBar', () => ({
  MailboxStatsBar: (props: {
    onCompose: () => void
    onSync: () => void
    onFolderChange: (folder: string) => void
    isSyncing: boolean
  }) => (
    <div data-testid="stats-bar">
      <button onClick={props.onCompose}>Compose</button>
      <button onClick={props.onSync} disabled={props.isSyncing}>
        {props.isSyncing ? 'Syncing...' : 'Sync'}
      </button>
      <button onClick={() => props.onFolderChange('drafts')}>Drafts</button>
      <button onClick={() => props.onFolderChange('outbox')}>Outbox</button>
    </div>
  ),
}))

vi.mock('@/components/ErrorBoundary', () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock('@/hooks/useMessageMailbox', () => ({
  useMessageMailbox: vi.fn(),
}))

vi.mock('@/hooks/useMailboxDrafts', () => ({
  useMailboxDrafts: () => ({
    drafts: [],
    loading: false,
    error: null,
    deleteDraft: vi.fn(),
  }),
}))

vi.mock('@/hooks/useMailboxOutboxList', () => ({
  useMailboxOutboxList: () => ({
    items: [],
    loading: false,
    retry: vi.fn(),
    retryAllFailed: vi.fn(),
    refresh: vi.fn(),
  }),
}))

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { uid: 'test-user', getIdToken: vi.fn().mockResolvedValue('token') } }),
}))

vi.mock('@/lib/firestoreClient', () => ({
  getFirestoreClient: vi.fn(),
}))

vi.mock('@/lib/idGenerator', () => ({
  generateId: () => 'generated-id',
}))

vi.mock('@/todos/offlineStore', () => ({
  saveTaskLocally: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/todos/todoOutbox', () => ({
  enqueueTaskOp: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/adapters/firestoreTodoRepository', () => ({
  createFirestoreTodoRepository: () => ({
    saveTask: vi.fn().mockResolvedValue(undefined),
  }),
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
      overrideTriageCategory: vi.fn().mockResolvedValue(undefined),
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

  it('renders page with stats bar, message list, and empty detail panel', () => {
    setupHook([])
    renderPage()

    expect(screen.getByText('Compose')).toBeInTheDocument()
    expect(screen.getByText('Sync')).toBeInTheDocument()
    expect(screen.getByTestId('message-list')).toBeInTheDocument()
    expect(screen.getByTestId('stats-bar')).toBeInTheDocument()
    expect(screen.getByText('Select a conversation to view details')).toBeInTheDocument()
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

  it('compose button opens the composer', async () => {
    const user = userEvent.setup()
    setupHook([])
    renderPage()

    expect(screen.queryByTestId('composer')).not.toBeInTheDocument()

    await user.click(screen.getByText('Compose'))

    expect(screen.getByTestId('composer')).toBeInTheDocument()
  })

  it('dismiss calls dismissMessage with archive option for gmail', async () => {
    const user = userEvent.setup()
    const msg = createMessage({ messageId: 'msg-1', sender: 'Carol' })
    setupHook([msg])
    renderPage()

    await user.click(screen.getByTestId('dismiss-first'))
    expect(mockDismissMessage).toHaveBeenCalledWith('msg-1', { archive: true })
  })

  it('shows syncing state in the sync button', () => {
    setupHook([], { syncStatus: { isSyncing: true } })
    renderPage()

    const syncButton = screen.getByText('Syncing...')
    expect(syncButton).toBeDisabled()
  })

  it('switches to drafts folder when Drafts button is clicked', async () => {
    const user = userEvent.setup()
    setupHook([])
    renderPage()

    await user.click(screen.getByText('Drafts'))

    expect(screen.getByTestId('folder-list')).toBeInTheDocument()
  })

  it('switches to outbox folder when Outbox button is clicked', async () => {
    const user = userEvent.setup()
    setupHook([])
    renderPage()

    await user.click(screen.getByText('Outbox'))

    expect(screen.getByTestId('folder-list')).toBeInTheDocument()
  })
})
