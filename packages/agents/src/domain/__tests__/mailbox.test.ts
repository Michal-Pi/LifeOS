import { describe, it, expect } from 'vitest'
import {
  getPriorityOrder,
  sortByPriority,
  filterFollowUpMessages,
  type PrioritizedMessage,
  type MessageSource,
  type ChannelAuthMethod,
  type ChannelConnectionStatus,
  type MailboxSyncStats,
  type ChannelConnection,
  type OutboundMessage,
  type DraftMessage,
  type SenderPersona,
  type MailboxToneSettings,
} from '../../domain/mailbox'

// ----- Test Helpers -----

function makePrioritizedMessage(overrides: Partial<PrioritizedMessage> = {}): PrioritizedMessage {
  return {
    messageId: 'msg:test' as PrioritizedMessage['messageId'],
    userId: 'user1',
    source: 'gmail',
    accountId: 'account1',
    originalMessageId: 'orig1',
    sender: 'Test Sender',
    snippet: 'Test snippet',
    receivedAtMs: Date.now(),
    priority: 'medium',
    aiSummary: 'Test summary',
    requiresFollowUp: false,
    isRead: false,
    isDismissed: false,
    createdAtMs: Date.now(),
    updatedAtMs: Date.now(),
    ...overrides,
  }
}

// ----- Tests -----

describe('mailbox domain models', () => {
  describe('MessageSource type', () => {
    it('accepts all 5 channel types', () => {
      const sources: MessageSource[] = ['gmail', 'slack', 'linkedin', 'whatsapp', 'telegram']
      expect(sources).toHaveLength(5)
      // Verify each is a valid string
      for (const s of sources) {
        expect(typeof s).toBe('string')
      }
    })
  })

  describe('getPriorityOrder', () => {
    it('returns correct order for each priority', () => {
      expect(getPriorityOrder('high')).toBe(3)
      expect(getPriorityOrder('medium')).toBe(2)
      expect(getPriorityOrder('low')).toBe(1)
    })

    it('high > medium > low', () => {
      expect(getPriorityOrder('high')).toBeGreaterThan(getPriorityOrder('medium'))
      expect(getPriorityOrder('medium')).toBeGreaterThan(getPriorityOrder('low'))
    })
  })

  describe('sortByPriority', () => {
    it('sorts high priority messages first', () => {
      const messages = [
        makePrioritizedMessage({ priority: 'low', receivedAtMs: 1000 }),
        makePrioritizedMessage({ priority: 'high', receivedAtMs: 1000 }),
        makePrioritizedMessage({ priority: 'medium', receivedAtMs: 1000 }),
      ]

      const sorted = sortByPriority(messages)
      expect(sorted[0].priority).toBe('high')
      expect(sorted[1].priority).toBe('medium')
      expect(sorted[2].priority).toBe('low')
    })

    it('sorts by newest first within same priority', () => {
      const messages = [
        makePrioritizedMessage({
          priority: 'high',
          receivedAtMs: 1000,
          originalMessageId: 'older',
        }),
        makePrioritizedMessage({
          priority: 'high',
          receivedAtMs: 3000,
          originalMessageId: 'newest',
        }),
        makePrioritizedMessage({
          priority: 'high',
          receivedAtMs: 2000,
          originalMessageId: 'middle',
        }),
      ]

      const sorted = sortByPriority(messages)
      expect(sorted[0].originalMessageId).toBe('newest')
      expect(sorted[1].originalMessageId).toBe('middle')
      expect(sorted[2].originalMessageId).toBe('older')
    })

    it('does not mutate the original array', () => {
      const messages = [
        makePrioritizedMessage({ priority: 'low' }),
        makePrioritizedMessage({ priority: 'high' }),
      ]

      const sorted = sortByPriority(messages)
      expect(sorted).not.toBe(messages)
      expect(messages[0].priority).toBe('low')
    })

    it('handles empty array', () => {
      expect(sortByPriority([])).toEqual([])
    })
  })

  describe('filterFollowUpMessages', () => {
    it('returns only messages requiring follow-up', () => {
      const messages = [
        makePrioritizedMessage({ requiresFollowUp: true }),
        makePrioritizedMessage({ requiresFollowUp: false }),
        makePrioritizedMessage({ requiresFollowUp: true }),
      ]

      const filtered = filterFollowUpMessages(messages)
      expect(filtered).toHaveLength(2)
      expect(filtered.every((m) => m.requiresFollowUp)).toBe(true)
    })

    it('excludes dismissed messages', () => {
      const messages = [
        makePrioritizedMessage({
          requiresFollowUp: true,
          isDismissed: false,
        }),
        makePrioritizedMessage({
          requiresFollowUp: true,
          isDismissed: true,
        }),
      ]

      const filtered = filterFollowUpMessages(messages)
      expect(filtered).toHaveLength(1)
      expect(filtered[0].isDismissed).toBe(false)
    })

    it('respects maxCount limit', () => {
      const messages = Array.from({ length: 20 }, (_, i) =>
        makePrioritizedMessage({
          requiresFollowUp: true,
          originalMessageId: `msg${i}`,
        })
      )

      const filtered = filterFollowUpMessages(messages, 5)
      expect(filtered).toHaveLength(5)
    })

    it('defaults to maxCount of 10', () => {
      const messages = Array.from({ length: 20 }, (_, i) =>
        makePrioritizedMessage({
          requiresFollowUp: true,
          originalMessageId: `msg${i}`,
        })
      )

      const filtered = filterFollowUpMessages(messages)
      expect(filtered).toHaveLength(10)
    })

    it('returns sorted results (high priority first)', () => {
      const messages = [
        makePrioritizedMessage({
          requiresFollowUp: true,
          priority: 'low',
        }),
        makePrioritizedMessage({
          requiresFollowUp: true,
          priority: 'high',
        }),
      ]

      const filtered = filterFollowUpMessages(messages)
      expect(filtered[0].priority).toBe('high')
      expect(filtered[1].priority).toBe('low')
    })
  })

  describe('MailboxSyncStats', () => {
    it('has fields for all 5 channel types', () => {
      const stats: MailboxSyncStats = {
        gmailAccountsProcessed: 2,
        slackWorkspacesProcessed: 1,
        linkedinAccountsProcessed: 0,
        whatsappAccountsProcessed: 0,
        telegramAccountsProcessed: 0,
        totalMessagesScanned: 50,
        newMessagesFound: 10,
        messagesRequiringFollowUp: 3,
        highPriorityCount: 2,
        mediumPriorityCount: 5,
        lowPriorityCount: 3,
      }

      expect(stats.gmailAccountsProcessed).toBe(2)
      expect(stats.slackWorkspacesProcessed).toBe(1)
      expect(stats.linkedinAccountsProcessed).toBe(0)
      expect(stats.whatsappAccountsProcessed).toBe(0)
      expect(stats.telegramAccountsProcessed).toBe(0)
    })
  })

  describe('ChannelConnection', () => {
    it('supports all auth methods', () => {
      const methods: ChannelAuthMethod[] = ['oauth', 'cookie', 'qr_code', 'bot_token']
      expect(methods).toHaveLength(4)
    })

    it('supports all connection statuses', () => {
      const statuses: ChannelConnectionStatus[] = ['connected', 'disconnected', 'expired', 'error']
      expect(statuses).toHaveLength(4)
    })

    it('validates channel connection shape', () => {
      const conn: ChannelConnection = {
        connectionId: 'conn:test' as ChannelConnection['connectionId'],
        userId: 'user1',
        source: 'linkedin',
        authMethod: 'cookie',
        status: 'connected',
        displayName: 'John Doe (LinkedIn)',
        credentials: { li_at: 'encrypted_cookie_value' },
        config: { pullDirectMessages: true },
        createdAtMs: Date.now(),
        updatedAtMs: Date.now(),
      }

      expect(conn.source).toBe('linkedin')
      expect(conn.authMethod).toBe('cookie')
      expect(conn.status).toBe('connected')
    })
  })

  describe('OutboundMessage', () => {
    it('validates outbound message shape', () => {
      const msg: OutboundMessage = {
        source: 'gmail',
        connectionId: 'conn:gmail1' as OutboundMessage['connectionId'],
        recipientId: 'user@example.com',
        recipientName: 'Jane Doe',
        subject: 'Re: Meeting notes',
        body: 'Thanks for sending those over.',
        htmlBody: '<p>Thanks for sending those over.</p>',
        inReplyTo: 'original-msg-id',
        threadId: 'thread-123',
      }

      expect(msg.source).toBe('gmail')
      expect(msg.subject).toBe('Re: Meeting notes')
    })

    it('works without optional fields', () => {
      const msg: OutboundMessage = {
        source: 'whatsapp',
        connectionId: 'conn:wa1' as OutboundMessage['connectionId'],
        recipientId: '+1234567890',
        body: 'Hello!',
      }

      expect(msg.source).toBe('whatsapp')
      expect(msg.subject).toBeUndefined()
    })
  })

  describe('DraftMessage', () => {
    it('validates draft message shape', () => {
      const draft: DraftMessage = {
        draftId: 'draft:test' as DraftMessage['draftId'],
        userId: 'user1',
        source: 'slack',
        body: 'Draft reply...',
        createdAtMs: Date.now(),
        updatedAtMs: Date.now(),
      }

      expect(draft.source).toBe('slack')
      expect(draft.body).toBe('Draft reply...')
    })
  })

  describe('SenderPersona', () => {
    it('validates sender persona shape', () => {
      const persona: SenderPersona = {
        personaId: 'persona:test' as SenderPersona['personaId'],
        userId: 'user1',
        name: 'Jane Smith',
        email: 'jane@company.com',
        title: 'VP Engineering',
        company: 'TechCorp',
        bio: 'Engineering leader with 15 years experience',
        topTopics: ['distributed systems', 'team leadership'],
        notableQuotes: ['Ship fast, learn faster'],
        keyInterests: ['AI/ML', 'developer experience'],
        suggestedTalkingPoints: ['Ask about their migration to Kubernetes'],
        languageProfile: {
          formalityLevel: 'formal',
          vocabularyComplexity: 'technical',
          preferredTopics: ['engineering', 'strategy'],
        },
        researchedAtMs: Date.now(),
        createdAtMs: Date.now(),
        updatedAtMs: Date.now(),
      }

      expect(persona.name).toBe('Jane Smith')
      expect(persona.topTopics).toContain('distributed systems')
      expect(persona.languageProfile?.formalityLevel).toBe('formal')
    })
  })

  describe('MailboxToneSettings', () => {
    it('supports per-channel tone overrides', () => {
      const settings: MailboxToneSettings = {
        userId: 'user1',
        defaultTone: 'Professional but warm, direct, no fluff',
        channelOverrides: {
          slack: 'Casual and friendly, use emoji sparingly',
          linkedin: 'Professional and polished',
          whatsapp: 'Brief and conversational',
        },
        updatedAtMs: Date.now(),
      }

      expect(settings.defaultTone).toContain('Professional')
      expect(settings.channelOverrides.slack).toContain('Casual')
      expect(settings.channelOverrides.gmail).toBeUndefined()
    })
  })

  describe('PrioritizedMessage with importanceScore', () => {
    it('supports optional importanceScore', () => {
      const withScore = makePrioritizedMessage({ importanceScore: 85 })
      expect(withScore.importanceScore).toBe(85)

      const withoutScore = makePrioritizedMessage()
      expect(withoutScore.importanceScore).toBeUndefined()
    })
  })
})
