import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock firebase-admin before imports
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: vi.fn(() => ({
    collection: vi.fn(() => ({
      get: vi.fn(() =>
        Promise.resolve({
          docs: [
            {
              id: 'account1',
              data: () => ({ status: 'connected', email: 'user@gmail.com' }),
            },
            {
              id: 'account2',
              data: () => ({ status: 'disconnected', email: 'old@gmail.com' }),
            },
          ],
        })
      ),
    })),
  })),
}))

vi.mock('../../google/gmailApi.js', () => ({
  listGmailMessages: vi.fn(),
  readGmailMessage: vi.fn(),
  sendGmailMessage: vi.fn(),
  trashGmailMessage: vi.fn(),
}))

vi.mock('../../slack/paths.js', () => ({
  mailboxSyncsCollection: vi.fn(() => ({
    where: vi.fn(() => ({
      orderBy: vi.fn(() => ({
        limit: vi.fn(() => ({
          get: vi.fn(() => Promise.resolve({ empty: true, docs: [] })),
        })),
      })),
    })),
  })),
}))

import { getGmailConnections, gmailAdapter } from '../gmailAdapter.js'
import {
  listGmailMessages,
  readGmailMessage,
  sendGmailMessage,
  trashGmailMessage,
} from '../../google/gmailApi.js'
import type { ChannelConnectionId } from '@lifeos/agents'

describe('gmailAdapter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getGmailConnections', () => {
    it('returns only connected accounts', async () => {
      const connections = await getGmailConnections('user1')

      expect(connections).toHaveLength(1)
      expect(connections[0]).toEqual({
        connectionId: 'account1',
        accountId: 'account1',
        email: 'user@gmail.com',
      })
    })
  })

  describe('fetchMessages', () => {
    it('normalizes Gmail messages to RawMessage format', async () => {
      const mockListGmailMessages = vi.mocked(listGmailMessages)
      const mockReadGmailMessage = vi.mocked(readGmailMessage)

      mockListGmailMessages.mockResolvedValue([
        { messageId: 'msg1', threadId: 'thread1', snippet: 'Preview...' },
        { messageId: 'msg2', threadId: 'thread2', snippet: 'Another...' },
      ] as any)

      mockReadGmailMessage
        .mockResolvedValueOnce({
          from: 'Alice <alice@example.com>',
          subject: 'Meeting Tomorrow',
          body: 'Can we meet at 3pm?',
          snippet: 'Can we meet...',
          date: '2026-02-14T10:00:00Z',
        } as any)
        .mockResolvedValueOnce({
          from: 'bob@example.com',
          subject: 'FYI: Report',
          body: 'See attached.',
          snippet: 'See attached.',
          date: '2026-02-14T11:00:00Z',
        } as any)

      const messages = await gmailAdapter.fetchMessages('user1', 'account1' as ChannelConnectionId)

      expect(messages).toHaveLength(2)

      // First message
      expect(messages[0].id).toBe('gmail_msg1')
      expect(messages[0].source).toBe('gmail')
      expect(messages[0].accountId).toBe('account1')
      expect(messages[0].sender).toBe('Alice <alice@example.com>')
      expect(messages[0].senderEmail).toBe('alice@example.com')
      expect(messages[0].subject).toBe('Meeting Tomorrow')
      expect(messages[0].body).toBe('Can we meet at 3pm?')
      expect(messages[0].originalUrl).toContain('msg1')

      // Second message - plain email without angle brackets
      expect(messages[1].senderEmail).toBe('bob@example.com')
    })

    it('handles individual message read failures gracefully', async () => {
      const mockListGmailMessages = vi.mocked(listGmailMessages)
      const mockReadGmailMessage = vi.mocked(readGmailMessage)

      mockListGmailMessages.mockResolvedValue([
        { messageId: 'msg1', threadId: 'thread1', snippet: 'test' },
        { messageId: 'msg_bad', threadId: 'thread2', snippet: 'fail' },
      ] as any)

      mockReadGmailMessage
        .mockResolvedValueOnce({
          from: 'alice@test.com',
          subject: 'Good',
          body: 'Works',
          snippet: 'Works',
          date: '2026-02-14T10:00:00Z',
        } as any)
        .mockRejectedValueOnce(new Error('API error'))

      const messages = await gmailAdapter.fetchMessages('user1', 'account1' as ChannelConnectionId)

      // Should return the successful message only
      expect(messages).toHaveLength(1)
      expect(messages[0].id).toBe('gmail_msg1')
    })

    it('returns empty array on complete fetch failure', async () => {
      const mockListGmailMessages = vi.mocked(listGmailMessages)
      mockListGmailMessages.mockRejectedValue(new Error('Network error'))

      const messages = await gmailAdapter.fetchMessages('user1', 'account1' as ChannelConnectionId)

      expect(messages).toEqual([])
    })

    it('sets source to gmail', () => {
      expect(gmailAdapter.source).toBe('gmail')
    })
  })

  describe('sendMessage', () => {
    it('sends via sendGmailMessage and returns result', async () => {
      const mockSendGmailMessage = vi.mocked(sendGmailMessage)
      mockSendGmailMessage.mockResolvedValue({ messageId: 'sent1', threadId: 'thread1' })

      const result = await gmailAdapter.sendMessage('user1', {
        source: 'gmail',
        connectionId: 'account1' as any,
        recipientId: 'recipient@example.com',
        subject: 'Test Subject',
        body: 'Hello world',
      })

      expect(result.messageId).toBe('sent1')
      expect(result.threadId).toBe('thread1')
      expect(mockSendGmailMessage).toHaveBeenCalledWith('user1', 'account1', {
        to: 'recipient@example.com',
        subject: 'Test Subject',
        body: 'Hello world',
        htmlBody: undefined,
        inReplyTo: undefined,
        threadId: undefined,
      })
    })

    it('throws when no Gmail account connected', async () => {
      // Override the mock to return empty connections
      const { getFirestore } = await import('firebase-admin/firestore')
      vi.mocked(getFirestore).mockReturnValueOnce({
        collection: vi.fn(() => ({
          get: vi.fn(() => Promise.resolve({ docs: [] })),
        })),
      } as any)

      await expect(
        gmailAdapter.sendMessage('user1', {
          source: 'gmail',
          connectionId: '' as any,
          recipientId: 'test@example.com',
          body: 'test',
        })
      ).rejects.toThrow('No connected Gmail account')
    })
  })

  describe('deleteMessage', () => {
    it('trashes the message via trashGmailMessage', async () => {
      const mockTrashGmailMessage = vi.mocked(trashGmailMessage)
      mockTrashGmailMessage.mockResolvedValue(true)

      const result = await gmailAdapter.deleteMessage('user1', 'account1' as any, 'gmail_msg123')

      expect(result).toBe(true)
      // Should strip the gmail_ prefix
      expect(mockTrashGmailMessage).toHaveBeenCalledWith('user1', 'account1', 'msg123')
    })

    it('passes through messageId without gmail_ prefix', async () => {
      const mockTrashGmailMessage = vi.mocked(trashGmailMessage)
      mockTrashGmailMessage.mockResolvedValue(true)

      await gmailAdapter.deleteMessage('user1', 'account1' as any, 'rawmsgid')

      expect(mockTrashGmailMessage).toHaveBeenCalledWith('user1', 'account1', 'rawmsgid')
    })
  })
})
