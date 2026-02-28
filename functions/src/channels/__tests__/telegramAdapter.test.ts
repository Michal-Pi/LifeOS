import { describe, it, expect, vi, beforeEach } from 'vitest'

// ----- Mocks -----

const mockConnectionsGet = vi.fn()
const mockDocUpdate = vi.fn(() => Promise.resolve())
const mockDocGet = vi.fn()
const mockCacheGet = vi.fn()

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: vi.fn(() => ({
    collection: vi.fn(() => ({
      where: vi.fn(() => ({
        where: vi.fn((_field: string, _op: string, _val: unknown) => ({
          get: mockConnectionsGet,
          where: vi.fn(() => ({
            orderBy: vi.fn(() => ({
              limit: vi.fn(() => ({
                get: mockCacheGet,
              })),
            })),
          })),
          orderBy: vi.fn(() => ({
            limit: vi.fn(() => ({
              get: mockCacheGet,
            })),
          })),
        })),
      })),
      doc: vi.fn(() => ({
        get: mockDocGet,
      })),
    })),
    doc: vi.fn(() => ({
      update: mockDocUpdate,
      get: mockDocGet,
    })),
  })),
}))

vi.mock('../../slack/paths.js', () => ({
  channelConnectionsCollection: vi.fn(() => ({
    where: vi.fn(() => ({
      where: vi.fn(() => ({
        get: mockConnectionsGet,
      })),
    })),
  })),
  channelConnectionRef: vi.fn(() => ({
    update: mockDocUpdate,
  })),
}))

// Mock global fetch
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

import { getTelegramConnections, telegramAdapter } from '../telegramAdapter.js'
import type { ChannelConnectionId, OutboundMessage } from '@lifeos/agents'

// ----- Test Data -----

function makeTelegramConnectionDoc(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tg_conn_1',
    data: () => ({
      source: 'telegram',
      status: 'connected',
      displayName: 'LifeOS Bot',
      credentials: { botToken: '123456:ABC-DEF1234ghIkl-zyx', botUsername: 'lifeos_bot' },
      config: { lastUpdateId: 100 },
      lastSyncMs: 1700000000000,
      ...overrides,
    }),
  }
}

function makeCachedTelegramMessage(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tg_msg_1',
    data: () => ({
      messageId: 'tg_msg_1',
      connectionId: 'tg_conn_1',
      chatId: 12345,
      chatType: 'private',
      senderId: 67890,
      senderName: 'Alice',
      senderUsername: 'alice_user',
      body: 'Hello bot!',
      receivedAtMs: 1700000010000,
      hasMedia: false,
      telegramMessageId: 42,
      ...overrides,
    }),
  }
}

const getUpdatesResponse = {
  ok: true,
  result: [
    {
      update_id: 101,
      message: {
        message_id: 50,
        from: {
          id: 67890,
          is_bot: false,
          first_name: 'Bob',
          last_name: 'Smith',
          username: 'bobsmith',
        },
        chat: {
          id: 12345,
          type: 'private' as const,
          first_name: 'Bob',
        },
        date: 1700000015,
        text: 'Hey there!',
      },
    },
    {
      update_id: 102,
      message: {
        message_id: 51,
        from: {
          id: 11111,
          is_bot: false,
          first_name: 'Carol',
          username: 'carol_t',
        },
        chat: {
          id: -100555,
          type: 'supergroup' as const,
          title: 'Dev Team',
        },
        date: 1700000020,
        text: 'PR is ready for review',
      },
    },
  ],
}

// ----- Tests -----

describe('telegramAdapter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockConnectionsGet.mockResolvedValue({
      docs: [makeTelegramConnectionDoc()],
    })
  })

  describe('getTelegramConnections', () => {
    it('returns only connected Telegram bots', async () => {
      const connections = await getTelegramConnections('user1')

      expect(connections).toHaveLength(1)
      expect(connections[0]).toEqual({
        connectionId: 'tg_conn_1',
        displayName: 'LifeOS Bot',
        botToken: '123456:ABC-DEF1234ghIkl-zyx',
        botUsername: 'lifeos_bot',
        lastUpdateId: 100,
        lastSyncMs: 1700000000000,
      })
    })

    it('returns empty array when no connections exist', async () => {
      mockConnectionsGet.mockResolvedValue({ docs: [] })

      const connections = await getTelegramConnections('user1')
      expect(connections).toEqual([])
    })
  })

  describe('fetchMessages — cached path', () => {
    it('reads cached messages from Firestore', async () => {
      const groupMsg = makeCachedTelegramMessage({
        messageId: 'tg_msg_2',
        chatType: 'supergroup',
        chatTitle: 'Dev Team',
        senderName: 'Bob',
        senderUsername: 'bobsmith',
        body: 'Deploy is done',
        receivedAtMs: 1700000015000,
      })

      mockCacheGet.mockResolvedValue({
        empty: false,
        size: 2,
        docs: [makeCachedTelegramMessage(), groupMsg],
      })

      const messages = await telegramAdapter.fetchMessages(
        'user1',
        'tg_conn_1' as ChannelConnectionId,
        { since: new Date(1700000000000).toISOString() }
      )

      expect(messages).toHaveLength(2)

      // Private message
      expect(messages[0].id).toBe('telegram_tg_msg_1')
      expect(messages[0].source).toBe('telegram')
      expect(messages[0].sender).toBe('Alice')
      expect(messages[0].senderEmail).toBe('https://t.me/alice_user')
      expect(messages[0].body).toBe('Hello bot!')

      // Group message
      expect(messages[1].sender).toBe('Bob (Dev Team)')
      expect(messages[1].body).toBe('Deploy is done')
    })
  })

  describe('fetchMessages — getUpdates fallback', () => {
    it('falls back to getUpdates when cache is empty', async () => {
      mockCacheGet.mockResolvedValue({
        empty: true,
        size: 0,
        docs: [],
      })

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(getUpdatesResponse),
      })

      const messages = await telegramAdapter.fetchMessages(
        'user1',
        'tg_conn_1' as ChannelConnectionId,
        { since: new Date(1700000000000).toISOString() }
      )

      expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('getUpdates'))

      expect(messages).toHaveLength(2)

      // Private message from Bob
      expect(messages[0].sender).toBe('Bob Smith')
      expect(messages[0].body).toBe('Hey there!')

      // Group message from Carol
      expect(messages[1].sender).toBe('Carol (Dev Team)')
      expect(messages[1].body).toBe('PR is ready for review')
    })

    it('skips bot messages in getUpdates', async () => {
      const responseWithBot = {
        ok: true,
        result: [
          {
            update_id: 101,
            message: {
              message_id: 50,
              from: { id: 99, is_bot: true, first_name: 'OtherBot' },
              chat: { id: 12345, type: 'private' },
              date: 1700000015,
              text: 'Bot reply',
            },
          },
        ],
      }

      mockCacheGet.mockResolvedValue({ empty: true, size: 0, docs: [] })
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(responseWithBot),
      })

      const messages = await telegramAdapter.fetchMessages(
        'user1',
        'tg_conn_1' as ChannelConnectionId,
        { since: new Date(1700000000000).toISOString() }
      )

      expect(messages).toHaveLength(0)
    })
  })

  describe('fetchMessages — error handling', () => {
    it('returns empty array when no credentials found', async () => {
      mockConnectionsGet.mockResolvedValue({ docs: [] })

      const messages = await telegramAdapter.fetchMessages(
        'user1',
        'tg_conn_1' as ChannelConnectionId
      )

      expect(messages).toEqual([])
    })

    it('returns empty array on getUpdates API failure', async () => {
      mockCacheGet.mockResolvedValue({ empty: true, size: 0, docs: [] })
      mockFetch.mockResolvedValue({ ok: false, status: 401 })

      const messages = await telegramAdapter.fetchMessages(
        'user1',
        'tg_conn_1' as ChannelConnectionId
      )

      expect(messages).toEqual([])
    })
  })

  describe('sendMessage', () => {
    it('sends message via Bot API and returns messageId', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            ok: true,
            result: {
              message_id: 100,
              chat: { id: 12345, type: 'private' },
              date: 1700000030,
              text: 'Reply from LifeOS',
            },
          }),
      })

      const message: OutboundMessage = {
        source: 'telegram',
        connectionId: 'tg_conn_1' as ChannelConnectionId,
        recipientId: '12345',
        body: 'Reply from LifeOS',
      }

      const result = await telegramAdapter.sendMessage('user1', message)

      expect(result.messageId).toBe('100')
      expect(result.threadId).toBe('12345')
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('sendMessage'),
        expect.objectContaining({ method: 'POST' })
      )
    })

    it('supports reply threading via inReplyTo', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            ok: true,
            result: {
              message_id: 101,
              chat: { id: 12345, type: 'private' },
              date: 1700000031,
              text: 'Threaded reply',
            },
          }),
      })

      const message: OutboundMessage = {
        source: 'telegram',
        connectionId: 'tg_conn_1' as ChannelConnectionId,
        recipientId: '12345',
        body: 'Threaded reply',
        inReplyTo: '50',
      }

      await telegramAdapter.sendMessage('user1', message)

      const callBody = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string)
      expect(callBody.reply_to_message_id).toBe(50)
    })

    it('throws on Bot API failure', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            ok: false,
            description: 'Bad Request: chat not found',
          }),
      })

      const message: OutboundMessage = {
        source: 'telegram',
        connectionId: 'tg_conn_1' as ChannelConnectionId,
        recipientId: '99999',
        body: 'Test',
      }

      await expect(telegramAdapter.sendMessage('user1', message)).rejects.toThrow('chat not found')
    })

    it('throws when no credentials found', async () => {
      mockConnectionsGet.mockResolvedValue({ docs: [] })

      const message: OutboundMessage = {
        source: 'telegram',
        connectionId: 'unknown' as ChannelConnectionId,
        recipientId: 'test',
        body: 'Test',
      }

      await expect(telegramAdapter.sendMessage('user1', message)).rejects.toThrow(
        'No valid Telegram credentials'
      )
    })
  })

  describe('deleteMessage', () => {
    it('deletes message within 48h via Bot API', async () => {
      // Message received 1 hour ago
      mockDocGet.mockResolvedValue({
        exists: true,
        data: () => ({
          receivedAtMs: Date.now() - 60 * 60 * 1000,
          chatId: 12345,
          telegramMessageId: 42,
          connectionId: 'tg_conn_1',
        }),
      })

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ ok: true, result: true }),
      })

      const result = await telegramAdapter.deleteMessage(
        'user1',
        'tg_conn_1' as ChannelConnectionId,
        'tg_msg_1'
      )

      expect(result).toBe(true)
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('deleteMessage'),
        expect.objectContaining({ method: 'POST' })
      )
    })

    it('returns false for messages older than 48 hours', async () => {
      mockDocGet.mockResolvedValue({
        exists: true,
        data: () => ({
          receivedAtMs: Date.now() - 3 * 24 * 60 * 60 * 1000,
          chatId: 12345,
          telegramMessageId: 42,
        }),
      })

      const result = await telegramAdapter.deleteMessage(
        'user1',
        'tg_conn_1' as ChannelConnectionId,
        'tg_msg_old'
      )

      expect(result).toBe(false)
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('supports composite chatId:messageId format for uncached messages', async () => {
      mockDocGet.mockResolvedValue({ exists: false })

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ ok: true, result: true }),
      })

      const result = await telegramAdapter.deleteMessage(
        'user1',
        'tg_conn_1' as ChannelConnectionId,
        '12345:42'
      )

      expect(result).toBe(true)
      const callBody = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string)
      expect(callBody.chat_id).toBe('12345')
      expect(callBody.message_id).toBe(42)
    })

    it('returns false on error', async () => {
      mockDocGet.mockRejectedValue(new Error('Firestore error'))

      const result = await telegramAdapter.deleteMessage(
        'user1',
        'tg_conn_1' as ChannelConnectionId,
        'tg_msg_1'
      )

      expect(result).toBe(false)
    })

    it('returns false when no credentials found', async () => {
      mockConnectionsGet.mockResolvedValue({ docs: [] })
      mockDocGet.mockResolvedValue({
        exists: true,
        data: () => ({
          receivedAtMs: Date.now() - 60 * 60 * 1000,
          chatId: 12345,
          telegramMessageId: 42,
        }),
      })

      const result = await telegramAdapter.deleteMessage(
        'user1',
        'tg_conn_1' as ChannelConnectionId,
        'tg_msg_1'
      )

      expect(result).toBe(false)
    })
  })

  describe('source', () => {
    it('is telegram', () => {
      expect(telegramAdapter.source).toBe('telegram')
    })
  })
})
