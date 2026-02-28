import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock dependencies before imports
const mockSet = vi.fn(() => Promise.resolve())
const mockUpdate = vi.fn(() => Promise.resolve())
const mockBatchSet = vi.fn()
const mockBatchDelete = vi.fn()
const mockBatchCommit = vi.fn(() => Promise.resolve())

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: vi.fn(() => ({
    batch: vi.fn(() => ({
      set: mockBatchSet,
      delete: mockBatchDelete,
      commit: mockBatchCommit,
    })),
  })),
}))

vi.mock('../../slack/paths.js', () => ({
  mailboxSyncRef: vi.fn(() => ({
    set: mockSet,
    update: mockUpdate,
  })),
  mailboxSyncsCollection: vi.fn(() => ({})),
  prioritizedMessageRef: vi.fn((_uid: string, msgId: string) => ({
    id: msgId,
    path: `users/user1/mailboxMessages/${msgId}`,
  })),
  prioritizedMessagesCollection: vi.fn(() => ({
    where: vi.fn(() => ({
      get: vi.fn(() => Promise.resolve({ docs: [], size: 0 })),
    })),
  })),
  channelConnectionsCollection: vi.fn(() => ({
    where: vi.fn(() => ({
      where: vi.fn(() => ({
        get: vi.fn(() => Promise.resolve({ docs: [] })),
      })),
    })),
  })),
  channelConnectionRef: vi.fn(() => ({
    update: vi.fn(() => Promise.resolve()),
  })),
}))

vi.mock('../gmailAdapter.js', () => ({
  gmailAdapter: {
    source: 'gmail',
    fetchMessages: vi.fn(() => Promise.resolve([])),
  },
  getGmailConnections: vi.fn(() => Promise.resolve([])),
}))

vi.mock('../slackAdapter.js', () => ({
  slackAdapter: {
    source: 'slack',
    fetchMessages: vi.fn(() => Promise.resolve([])),
  },
  getSlackConnections: vi.fn(() => Promise.resolve([])),
}))

vi.mock('../linkedinAdapter.js', () => ({
  linkedinAdapter: {
    source: 'linkedin',
    fetchMessages: vi.fn(() => Promise.resolve([])),
  },
  getLinkedInConnections: vi.fn(() => Promise.resolve([])),
}))

vi.mock('../whatsappAdapter.js', () => ({
  whatsappAdapter: {
    source: 'whatsapp',
    fetchMessages: vi.fn(() => Promise.resolve([])),
  },
  getWhatsAppConnections: vi.fn(() => Promise.resolve([])),
}))

vi.mock('../telegramAdapter.js', () => ({
  telegramAdapter: {
    source: 'telegram',
    fetchMessages: vi.fn(() => Promise.resolve([])),
  },
  getTelegramConnections: vi.fn(() => Promise.resolve([])),
}))

vi.mock('../../slack/messageAnalyzer.js', () => ({
  analyzeAndPrioritizeMessages: vi.fn(() => Promise.resolve([])),
}))

vi.mock('../../agents/providerKeys.js', () => ({
  NoAPIKeyConfiguredError: class extends Error {
    constructor() {
      super('No API key configured')
      this.name = 'NoAPIKeyConfiguredError'
    }
  },
}))

import { runUnifiedSync } from '../unifiedSync.js'
import { gmailAdapter, getGmailConnections } from '../gmailAdapter.js'
import { slackAdapter, getSlackConnections } from '../slackAdapter.js'
import { linkedinAdapter, getLinkedInConnections } from '../linkedinAdapter.js'
import { whatsappAdapter, getWhatsAppConnections } from '../whatsappAdapter.js'
import { telegramAdapter, getTelegramConnections } from '../telegramAdapter.js'
import { analyzeAndPrioritizeMessages } from '../../slack/messageAnalyzer.js'

/**
 * Reset all mocks to their default return values between tests.
 * vi.clearAllMocks() only clears call history but doesn't reset
 * mockResolvedValue implementations, causing state leaks.
 */
function resetMocksToDefaults() {
  vi.clearAllMocks()
  // Reset adapter mocks to default empty returns
  vi.mocked(getGmailConnections).mockResolvedValue([])
  vi.mocked(getSlackConnections).mockResolvedValue([])
  vi.mocked(getLinkedInConnections).mockResolvedValue([])
  vi.mocked(getWhatsAppConnections).mockResolvedValue([])
  vi.mocked(getTelegramConnections).mockResolvedValue([])
  vi.mocked(gmailAdapter.fetchMessages).mockResolvedValue([])
  vi.mocked(slackAdapter.fetchMessages).mockResolvedValue([])
  vi.mocked(linkedinAdapter.fetchMessages).mockResolvedValue([])
  vi.mocked(whatsappAdapter.fetchMessages).mockResolvedValue([])
  vi.mocked(telegramAdapter.fetchMessages).mockResolvedValue([])
  vi.mocked(analyzeAndPrioritizeMessages).mockResolvedValue([])
}

describe('runUnifiedSync', () => {
  beforeEach(() => {
    resetMocksToDefaults()
  })

  it('creates a sync record at the start', async () => {
    await runUnifiedSync('user1', 'manual')

    expect(mockSet).toHaveBeenCalledTimes(1)
    const calls = mockSet.mock.calls as unknown as Array<[Record<string, unknown>]>
    const setCall = calls[0][0]
    expect(setCall.userId).toBe('user1')
    expect(setCall.triggerType).toBe('manual')
    expect(setCall.status).toBe('running')
  })

  it('discovers Gmail and Slack connections', async () => {
    await runUnifiedSync('user1', 'page_load')

    expect(getGmailConnections).toHaveBeenCalledWith('user1')
    expect(getSlackConnections).toHaveBeenCalledWith('user1')
  })

  it('fetches messages from each Gmail connection', async () => {
    vi.mocked(getGmailConnections).mockResolvedValue([
      { connectionId: 'gmail1', accountId: 'gmail1', email: 'a@test.com' },
      { connectionId: 'gmail2', accountId: 'gmail2', email: 'b@test.com' },
    ])

    await runUnifiedSync('user1', 'manual')

    expect(gmailAdapter.fetchMessages).toHaveBeenCalledTimes(2)
  })

  it('fetches messages from each Slack workspace', async () => {
    vi.mocked(getSlackConnections).mockResolvedValue([
      {
        connectionId: 'ws1',
        workspaceId: 'ws1',
        workspaceName: 'Team1',
      },
    ])

    await runUnifiedSync('user1', 'manual')

    expect(slackAdapter.fetchMessages).toHaveBeenCalledTimes(1)
  })

  it('passes combined messages to AI analyzer', async () => {
    vi.mocked(getGmailConnections).mockResolvedValue([
      { connectionId: 'gmail1', accountId: 'gmail1' },
    ])
    vi.mocked(getSlackConnections).mockResolvedValue([
      { connectionId: 'ws1', workspaceId: 'ws1', workspaceName: 'Team' },
    ])
    vi.mocked(gmailAdapter.fetchMessages).mockResolvedValue([
      {
        id: 'gmail_1',
        source: 'gmail',
        accountId: 'gmail1',
        sender: 'Alice',
        body: 'Hello',
        receivedAt: '2026-02-14T10:00:00Z',
      },
    ])
    vi.mocked(slackAdapter.fetchMessages).mockResolvedValue([
      {
        id: 'slack_1',
        source: 'slack',
        accountId: 'ws1',
        sender: 'Bob',
        body: 'Hey',
        receivedAt: '2026-02-14T11:00:00Z',
      },
    ])

    await runUnifiedSync('user1', 'manual')

    expect(analyzeAndPrioritizeMessages).toHaveBeenCalledTimes(1)
    const [userId, messages] = vi.mocked(analyzeAndPrioritizeMessages).mock.calls[0]
    expect(userId).toBe('user1')
    expect(messages).toHaveLength(2)
    expect(messages[0].source).toBe('gmail')
    expect(messages[1].source).toBe('slack')
  })

  it('skips AI analysis when no messages found', async () => {
    // No connections → no messages → no analysis
    await runUnifiedSync('user1', 'manual')

    expect(analyzeAndPrioritizeMessages).not.toHaveBeenCalled()
  })

  it('stores prioritized messages in Firestore', async () => {
    vi.mocked(getGmailConnections).mockResolvedValue([{ connectionId: 'g1', accountId: 'g1' }])
    vi.mocked(gmailAdapter.fetchMessages).mockResolvedValue([
      {
        id: 'gmail_1',
        source: 'gmail',
        accountId: 'g1',
        sender: 'Alice',
        body: 'Test',
        receivedAt: '2026-02-14T10:00:00Z',
      },
    ])
    vi.mocked(analyzeAndPrioritizeMessages).mockResolvedValue([
      {
        originalMessageId: 'gmail_1',
        source: 'gmail',
        accountId: 'g1',
        sender: 'Alice',
        snippet: 'Test',
        receivedAtMs: 1707900000000,
        priority: 'high',
        aiSummary: 'Important email from Alice',
        requiresFollowUp: true,
        followUpReason: 'Direct question',
      },
    ] as any)

    await runUnifiedSync('user1', 'manual')

    expect(mockBatchSet).toHaveBeenCalledTimes(1)
    const storedMsg = mockBatchSet.mock.calls[0][1]
    expect(storedMsg.userId).toBe('user1')
    expect(storedMsg.isRead).toBe(false)
    expect(storedMsg.isDismissed).toBe(false)
  })

  it('updates sync record with completed status and stats', async () => {
    vi.mocked(getGmailConnections).mockResolvedValue([{ connectionId: 'g1', accountId: 'g1' }])
    vi.mocked(gmailAdapter.fetchMessages).mockResolvedValue([
      {
        id: 'gmail_1',
        source: 'gmail',
        accountId: 'g1',
        sender: 'Alice',
        body: 'Test',
        receivedAt: '2026-02-14T10:00:00Z',
      },
    ])
    vi.mocked(analyzeAndPrioritizeMessages).mockResolvedValue([
      {
        originalMessageId: 'gmail_1',
        source: 'gmail',
        accountId: 'g1',
        sender: 'Alice',
        snippet: 'Test',
        receivedAtMs: 1707900000000,
        priority: 'high',
        aiSummary: 'Test',
        requiresFollowUp: true,
      },
    ] as any)

    const result = await runUnifiedSync('user1', 'manual')

    // Verify final update call
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'completed',
        stats: expect.objectContaining({
          gmailAccountsProcessed: 1,
          slackWorkspacesProcessed: 0,
          totalMessagesScanned: 1,
          newMessagesFound: 1,
          highPriorityCount: 1,
          messagesRequiringFollowUp: 1,
        }),
      })
    )

    expect(result.stats.gmailAccountsProcessed).toBe(1)
    expect(result.stats.highPriorityCount).toBe(1)
  })

  it('returns sync result with syncId, stats, and messages', async () => {
    // No connections → empty result
    const result = await runUnifiedSync('user1', 'scheduled')

    expect(result.syncId).toBeTruthy()
    expect(result.stats).toBeDefined()
    expect(result.stats.totalMessagesScanned).toBe(0)
    expect(result.messages).toEqual([])
  })

  it('updates sync record with failed status on error', async () => {
    vi.mocked(getGmailConnections).mockRejectedValue(new Error('Firestore error'))

    await expect(runUnifiedSync('user1', 'manual')).rejects.toThrow('Firestore error')

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'failed',
        error: 'Firestore error',
      })
    )
  })
})
