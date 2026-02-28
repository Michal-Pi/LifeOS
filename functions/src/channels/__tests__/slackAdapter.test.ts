import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock dependencies before imports
vi.mock('../../slack/slackApi.js', () => ({
  fetchAllSlackMessages: vi.fn(),
}))

vi.mock('../../slack/paths.js', () => ({
  slackAccountRef: vi.fn(() => ({
    update: vi.fn(() => Promise.resolve()),
  })),
  slackAccountsCollection: vi.fn(() => ({
    get: vi.fn(() =>
      Promise.resolve({
        docs: [
          {
            id: 'workspace1',
            data: () => ({
              status: 'connected',
              teamName: 'My Team',
              lastSyncMs: 1700000000000,
            }),
          },
          {
            id: 'workspace2',
            data: () => ({
              status: 'expired',
              teamName: 'Old Team',
            }),
          },
        ],
      })
    ),
  })),
}))

import { getSlackConnections, slackAdapter } from '../slackAdapter.js'
import { fetchAllSlackMessages } from '../../slack/slackApi.js'
import type { ChannelConnectionId } from '@lifeos/agents'

describe('slackAdapter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getSlackConnections', () => {
    it('returns only connected workspaces', async () => {
      const connections = await getSlackConnections('user1')

      expect(connections).toHaveLength(1)
      expect(connections[0]).toEqual({
        connectionId: 'workspace1',
        workspaceId: 'workspace1',
        workspaceName: 'My Team',
        lastSyncMs: 1700000000000,
      })
    })
  })

  describe('fetchMessages', () => {
    it('normalizes Slack messages to RawMessage format', async () => {
      const mockFetchAll = vi.mocked(fetchAllSlackMessages)
      mockFetchAll.mockResolvedValue([
        {
          messageId: 'slack_msg1',
          channelId: 'C01',
          channelName: 'general',
          workspaceId: 'workspace1',
          senderName: 'Alice',
          text: 'Hey team, standup in 5 min',
          timestamp: '1700000001.000100',
          isDirectMessage: false,
          receivedAtMs: 1700000001000,
        },
        {
          messageId: 'slack_msg2',
          channelId: 'D01',
          channelName: 'DM',
          workspaceId: 'workspace1',
          senderName: 'Bob',
          text: 'Can you review my PR?',
          timestamp: '1700000002.000200',
          isDirectMessage: true,
          receivedAtMs: 1700000002000,
        },
      ] as any)

      const messages = await slackAdapter.fetchMessages(
        'user1',
        'workspace1' as ChannelConnectionId
      )

      expect(messages).toHaveLength(2)

      // First message
      expect(messages[0].id).toBe('slack_msg1')
      expect(messages[0].source).toBe('slack')
      expect(messages[0].accountId).toBe('workspace1')
      expect(messages[0].sender).toBe('Alice')
      expect(messages[0].body).toBe('Hey team, standup in 5 min')
      expect(messages[0].receivedAt).toBeTruthy()

      // Second message
      expect(messages[1].sender).toBe('Bob')
      expect(messages[1].body).toBe('Can you review my PR?')
    })

    it('returns empty array on fetch failure', async () => {
      const mockFetchAll = vi.mocked(fetchAllSlackMessages)
      mockFetchAll.mockRejectedValue(new Error('Slack API error'))

      const messages = await slackAdapter.fetchMessages(
        'user1',
        'workspace1' as ChannelConnectionId
      )

      expect(messages).toEqual([])
    })

    it('sets source to slack', () => {
      expect(slackAdapter.source).toBe('slack')
    })
  })

  describe('sendMessage', () => {
    it('throws not implemented error', async () => {
      await expect(slackAdapter.sendMessage('user1', {} as any)).rejects.toThrow(
        'not yet implemented'
      )
    })
  })

  describe('deleteMessage', () => {
    it('returns false (Slack does not support programmatic delete)', async () => {
      const result = await slackAdapter.deleteMessage(
        'user1',
        'conn1' as ChannelConnectionId,
        'msg1'
      )
      expect(result).toBe(false)
    })
  })
})
