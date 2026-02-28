import { describe, it, expect, vi, beforeEach } from 'vitest'

// ----- Mocks -----

const mockCollectionGet = vi.fn()
const mockDocUpdate = vi.fn(() => Promise.resolve())

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: vi.fn(() => ({
    collection: vi.fn(() => ({
      where: vi.fn(() => ({
        where: vi.fn(() => ({
          get: mockCollectionGet,
        })),
      })),
    })),
    doc: vi.fn(() => ({
      update: mockDocUpdate,
    })),
  })),
}))

vi.mock('../../slack/paths.js', () => ({
  channelConnectionsCollection: vi.fn(() => ({
    where: vi.fn(() => ({
      where: vi.fn(() => ({
        get: mockCollectionGet,
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

import { getLinkedInConnections, linkedinAdapter } from '../linkedinAdapter.js'
import type { ChannelConnectionId, OutboundMessage } from '@lifeos/agents'

// ----- Test Data -----

function makeLinkedInConnectionDoc(overrides: Record<string, unknown> = {}) {
  return {
    id: 'li_conn_1',
    data: () => ({
      source: 'linkedin',
      status: 'connected',
      displayName: 'John Doe',
      credentials: { liAtCookie: 'AQEtest123', csrfToken: 'csrf456' },
      lastSyncMs: 1700000000000,
      ...overrides,
    }),
  }
}

const voyagerConversation = {
  entityUrn: 'urn:li:fs_conversation:2-abc123',
  lastActivityAt: 1700000010000,
  events: [
    {
      entityUrn: 'urn:li:fs_event:(2-abc123,1700000010000)',
      createdAt: 1700000010000,
      subtype: 'MEMBER_TO_MEMBER',
      eventContent: {
        'com.linkedin.voyager.messaging.event.MessageEvent': {
          body: 'Hi, are you available for a call?',
          attributedBody: { text: 'Hi, are you available for a call?' },
        },
      },
      from: {
        'com.linkedin.voyager.messaging.MessagingMember': {
          miniProfile: {
            firstName: 'Alice',
            lastName: 'Smith',
            publicIdentifier: 'alicesmith',
            entityUrn: 'urn:li:fs_miniProfile:alice123',
          },
        },
      },
    },
    {
      entityUrn: 'urn:li:fs_event:(2-abc123,1700000005000)',
      createdAt: 1700000005000,
      subtype: 'MEMBER_TO_MEMBER',
      eventContent: {
        'com.linkedin.voyager.messaging.event.MessageEvent': {
          body: 'Following up on the project',
        },
      },
      from: {
        'com.linkedin.voyager.messaging.MessagingMember': {
          miniProfile: {
            firstName: 'Bob',
            lastName: 'Jones',
            publicIdentifier: 'bobjones',
            entityUrn: 'urn:li:fs_miniProfile:bob456',
          },
        },
      },
    },
  ],
}

// ----- Tests -----

describe('linkedinAdapter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCollectionGet.mockResolvedValue({
      docs: [makeLinkedInConnectionDoc()],
    })
  })

  describe('getLinkedInConnections', () => {
    it('returns only connected LinkedIn accounts', async () => {
      const connections = await getLinkedInConnections('user1')

      expect(connections).toHaveLength(1)
      expect(connections[0]).toEqual({
        connectionId: 'li_conn_1',
        displayName: 'John Doe',
        liAtCookie: 'AQEtest123',
        csrfToken: 'csrf456',
        lastSyncMs: 1700000000000,
      })
    })

    it('returns empty array when no connections exist', async () => {
      mockCollectionGet.mockResolvedValue({ docs: [] })

      const connections = await getLinkedInConnections('user1')
      expect(connections).toEqual([])
    })
  })

  describe('fetchMessages', () => {
    it('normalizes Voyager messages to RawMessage format', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ elements: [voyagerConversation] }),
      })

      const messages = await linkedinAdapter.fetchMessages(
        'user1',
        'li_conn_1' as ChannelConnectionId,
        { since: new Date(1700000000000).toISOString() }
      )

      expect(messages).toHaveLength(2)

      // First message (Alice)
      expect(messages[0].id).toContain('linkedin_')
      expect(messages[0].source).toBe('linkedin')
      expect(messages[0].accountId).toBe('li_conn_1')
      expect(messages[0].sender).toBe('Alice Smith')
      expect(messages[0].senderEmail).toBe('https://www.linkedin.com/in/alicesmith')
      expect(messages[0].body).toBe('Hi, are you available for a call?')
      expect(messages[0].originalUrl).toContain('abc123')

      // Second message (Bob)
      expect(messages[1].sender).toBe('Bob Jones')
      expect(messages[1].body).toBe('Following up on the project')
    })

    it('filters out non-MEMBER_TO_MEMBER events', async () => {
      const conversationWithReadReceipt = {
        ...voyagerConversation,
        events: [
          ...voyagerConversation.events,
          {
            entityUrn: 'urn:li:fs_event:(2-abc123,1700000011000)',
            createdAt: 1700000011000,
            subtype: 'PARTICIPANT_CHANGE',
            eventContent: {},
            from: {},
          },
        ],
      }

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ elements: [conversationWithReadReceipt] }),
      })

      const messages = await linkedinAdapter.fetchMessages(
        'user1',
        'li_conn_1' as ChannelConnectionId,
        { since: new Date(1700000000000).toISOString() }
      )

      // Only the 2 MEMBER_TO_MEMBER events, not the PARTICIPANT_CHANGE
      expect(messages).toHaveLength(2)
    })

    it('returns empty array when no credentials found', async () => {
      mockCollectionGet.mockResolvedValue({ docs: [] })

      const messages = await linkedinAdapter.fetchMessages(
        'user1',
        'li_conn_1' as ChannelConnectionId
      )

      expect(messages).toEqual([])
    })

    it('returns empty array on API failure', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
      })

      const messages = await linkedinAdapter.fetchMessages(
        'user1',
        'li_conn_1' as ChannelConnectionId
      )

      expect(messages).toEqual([])
    })

    it('marks connection as expired on 401', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
      })

      await linkedinAdapter.fetchMessages('user1', 'li_conn_1' as ChannelConnectionId)

      expect(mockDocUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'expired',
          errorMessage: expect.stringContaining('Authentication failed'),
        })
      )
    })

    it('updates last sync time on success', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ elements: [] }),
      })

      await linkedinAdapter.fetchMessages('user1', 'li_conn_1' as ChannelConnectionId)

      expect(mockDocUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          lastSyncMs: expect.any(Number),
          updatedAtMs: expect.any(Number),
        })
      )
    })
  })

  describe('sendMessage', () => {
    it('sends message via Voyager API and returns messageId', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            value: { eventUrn: 'urn:li:fs_event:sent_1' },
          }),
      })

      const message: OutboundMessage = {
        source: 'linkedin',
        connectionId: 'li_conn_1' as ChannelConnectionId,
        recipientId: 'urn:li:fs_miniProfile:recipient1',
        body: 'Hello from LifeOS!',
      }

      const result = await linkedinAdapter.sendMessage('user1', message)

      expect(result.messageId).toBe('urn:li:fs_event:sent_1')
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('messaging/conversations'),
        expect.objectContaining({ method: 'POST' })
      )
    })

    it('throws on API failure', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 403,
      })

      const message: OutboundMessage = {
        source: 'linkedin',
        connectionId: 'li_conn_1' as ChannelConnectionId,
        recipientId: 'urn:li:fs_miniProfile:recipient1',
        body: 'Test',
      }

      await expect(linkedinAdapter.sendMessage('user1', message)).rejects.toThrow(
        'LinkedIn send failed'
      )
    })

    it('throws when no credentials found', async () => {
      mockCollectionGet.mockResolvedValue({ docs: [] })

      const message: OutboundMessage = {
        source: 'linkedin',
        connectionId: 'unknown' as ChannelConnectionId,
        recipientId: 'test',
        body: 'Test',
      }

      await expect(linkedinAdapter.sendMessage('user1', message)).rejects.toThrow(
        'No valid LinkedIn credentials'
      )
    })
  })

  describe('deleteMessage', () => {
    it('returns false (LinkedIn does not support delete)', async () => {
      const result = await linkedinAdapter.deleteMessage(
        'user1',
        'li_conn_1' as ChannelConnectionId,
        'msg1'
      )
      expect(result).toBe(false)
    })
  })

  describe('source', () => {
    it('is linkedin', () => {
      expect(linkedinAdapter.source).toBe('linkedin')
    })
  })
})
