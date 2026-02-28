import { describe, it, expect, vi, beforeEach } from 'vitest'

// ----- Mocks -----

const mockConnectionsGet = vi.fn()
const mockDocUpdate = vi.fn(() => Promise.resolve())
const mockDocGet = vi.fn()
const mockMessagesGet = vi.fn()

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: vi.fn(() => ({
    collection: vi.fn(() => ({
      where: vi.fn(() => ({
        where: vi.fn((_field: string, _op: string, _val: unknown) => ({
          // Support chained where().where().get() for connections
          get: mockConnectionsGet,
          // Support where().where().orderBy().limit().get() for messages
          where: vi.fn(() => ({
            orderBy: vi.fn(() => ({
              limit: vi.fn(() => ({
                get: mockMessagesGet,
              })),
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

import { getWhatsAppConnections, whatsappAdapter } from '../whatsappAdapter.js'
import type { ChannelConnectionId, OutboundMessage } from '@lifeos/agents'

// ----- Test Data -----

function makeWhatsAppConnectionDoc(overrides: Record<string, unknown> = {}) {
  return {
    id: 'wa_conn_1',
    data: () => ({
      source: 'whatsapp',
      status: 'connected',
      displayName: '+1 234 567 8900',
      credentials: { phoneNumber: '+12345678900' },
      config: { companionServiceUrl: 'http://localhost:3100' },
      lastSyncMs: 1700000000000,
      ...overrides,
    }),
  }
}

function makeCachedMessage(overrides: Record<string, unknown> = {}) {
  return {
    id: 'wa_msg_1',
    data: () => ({
      messageId: 'wa_msg_1',
      connectionId: 'wa_conn_1',
      senderJid: '5511999999999@s.whatsapp.net',
      senderName: 'Maria',
      body: 'Hey, how are you?',
      receivedAtMs: 1700000010000,
      isGroup: false,
      fromMe: false,
      ...overrides,
    }),
  }
}

// ----- Tests -----

describe('whatsappAdapter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockConnectionsGet.mockResolvedValue({
      docs: [makeWhatsAppConnectionDoc()],
    })
  })

  describe('getWhatsAppConnections', () => {
    it('returns only connected WhatsApp accounts', async () => {
      const connections = await getWhatsAppConnections('user1')

      expect(connections).toHaveLength(1)
      expect(connections[0]).toEqual({
        connectionId: 'wa_conn_1',
        displayName: '+1 234 567 8900',
        phoneNumber: '+12345678900',
        companionServiceUrl: 'http://localhost:3100',
        lastSyncMs: 1700000000000,
      })
    })

    it('returns empty array when no connections exist', async () => {
      mockConnectionsGet.mockResolvedValue({ docs: [] })

      const connections = await getWhatsAppConnections('user1')
      expect(connections).toEqual([])
    })
  })

  describe('fetchMessages', () => {
    it('reads cached messages from Firestore and normalizes them', async () => {
      const groupMessage = makeCachedMessage({
        messageId: 'wa_msg_2',
        senderName: 'Carlos',
        groupJid: '120363@g.us',
        groupName: 'Team Chat',
        body: 'Meeting at 3pm',
        isGroup: true,
        receivedAtMs: 1700000015000,
      })

      mockMessagesGet.mockResolvedValue({
        empty: false,
        size: 2,
        docs: [makeCachedMessage(), groupMessage],
      })

      const messages = await whatsappAdapter.fetchMessages(
        'user1',
        'wa_conn_1' as ChannelConnectionId,
        { since: new Date(1700000000000).toISOString() }
      )

      expect(messages).toHaveLength(2)

      // First message (DM)
      expect(messages[0].id).toBe('whatsapp_wa_msg_1')
      expect(messages[0].source).toBe('whatsapp')
      expect(messages[0].sender).toBe('Maria')
      expect(messages[0].senderEmail).toBe('+5511999999999')
      expect(messages[0].body).toBe('Hey, how are you?')

      // Second message (group)
      expect(messages[1].sender).toBe('Carlos (Team Chat)')
      expect(messages[1].body).toBe('Meeting at 3pm')
    })

    it('includes media type indicator in body', async () => {
      const mediaMsg = makeCachedMessage({
        body: '',
        mediaType: 'photo',
      })

      mockMessagesGet.mockResolvedValue({
        empty: false,
        size: 1,
        docs: [mediaMsg],
      })

      const messages = await whatsappAdapter.fetchMessages(
        'user1',
        'wa_conn_1' as ChannelConnectionId,
        { since: new Date(1700000000000).toISOString() }
      )

      expect(messages[0].body).toBe('[photo] ')
    })

    it('returns empty array when no connection found', async () => {
      mockConnectionsGet.mockResolvedValue({ docs: [] })

      const messages = await whatsappAdapter.fetchMessages(
        'user1',
        'wa_conn_1' as ChannelConnectionId
      )

      expect(messages).toEqual([])
    })

    it('returns empty array on Firestore error', async () => {
      mockMessagesGet.mockRejectedValue(new Error('Firestore error'))

      const messages = await whatsappAdapter.fetchMessages(
        'user1',
        'wa_conn_1' as ChannelConnectionId
      )

      expect(messages).toEqual([])
    })
  })

  describe('sendMessage', () => {
    it('sends message via companion service and returns messageId', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            messageId: 'wa_sent_123',
          }),
      })

      const message: OutboundMessage = {
        source: 'whatsapp',
        connectionId: 'wa_conn_1' as ChannelConnectionId,
        recipientId: '5511888888888@s.whatsapp.net',
        body: 'Hello from LifeOS!',
      }

      const result = await whatsappAdapter.sendMessage('user1', message)

      expect(result.messageId).toBe('wa_sent_123')
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3100/api/send',
        expect.objectContaining({ method: 'POST' })
      )
    })

    it('throws on companion service failure', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            success: false,
            error: 'Not connected',
          }),
      })

      const message: OutboundMessage = {
        source: 'whatsapp',
        connectionId: 'wa_conn_1' as ChannelConnectionId,
        recipientId: 'test@s.whatsapp.net',
        body: 'Test',
      }

      await expect(whatsappAdapter.sendMessage('user1', message)).rejects.toThrow('Not connected')
    })

    it('throws when no connection found', async () => {
      mockConnectionsGet.mockResolvedValue({ docs: [] })

      const message: OutboundMessage = {
        source: 'whatsapp',
        connectionId: 'unknown' as ChannelConnectionId,
        recipientId: 'test',
        body: 'Test',
      }

      await expect(whatsappAdapter.sendMessage('user1', message)).rejects.toThrow(
        'No valid WhatsApp connection'
      )
    })
  })

  describe('deleteMessage', () => {
    it('deletes message within 48h window via companion service', async () => {
      // Message received 1 hour ago
      mockDocGet.mockResolvedValue({
        exists: true,
        data: () => ({
          receivedAtMs: Date.now() - 60 * 60 * 1000,
          connectionId: 'wa_conn_1',
        }),
      })

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      })

      const result = await whatsappAdapter.deleteMessage(
        'user1',
        'wa_conn_1' as ChannelConnectionId,
        'wa_msg_1'
      )

      expect(result).toBe(true)
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3100/api/delete',
        expect.objectContaining({ method: 'POST' })
      )
    })

    it('returns false for messages older than 48 hours', async () => {
      // Message received 3 days ago
      mockDocGet.mockResolvedValue({
        exists: true,
        data: () => ({
          receivedAtMs: Date.now() - 3 * 24 * 60 * 60 * 1000,
          connectionId: 'wa_conn_1',
        }),
      })

      const result = await whatsappAdapter.deleteMessage(
        'user1',
        'wa_conn_1' as ChannelConnectionId,
        'wa_msg_old'
      )

      expect(result).toBe(false)
      // Should not call the companion service
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('returns false on error', async () => {
      mockDocGet.mockRejectedValue(new Error('Firestore error'))

      const result = await whatsappAdapter.deleteMessage(
        'user1',
        'wa_conn_1' as ChannelConnectionId,
        'wa_msg_1'
      )

      expect(result).toBe(false)
    })
  })

  describe('source', () => {
    it('is whatsapp', () => {
      expect(whatsappAdapter.source).toBe('whatsapp')
    })
  })
})
