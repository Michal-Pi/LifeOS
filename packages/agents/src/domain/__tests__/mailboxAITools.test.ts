import { describe, it, expect } from 'vitest'
import {
  DEFAULT_MAILBOX_AI_TOOLS,
  createDefaultMailboxAIToolSettings,
  type MailboxAIToolId,
  type MailboxAIToolConfig,
  type MailboxAIToolSettings,
  type ResponseDraftResult,
  type CleanupAction,
  type CleanupRecommendation,
} from '../mailboxAITools'

// ----- Tests -----

describe('mailboxAITools domain', () => {
  describe('MailboxAIToolId', () => {
    it('covers all 4 tool IDs', () => {
      const ids: MailboxAIToolId[] = [
        'responseDraft',
        'mailboxCleanup',
        'senderResearch',
        'extractActions',
      ]
      expect(ids).toHaveLength(4)
      for (const id of ids) {
        expect(typeof id).toBe('string')
      }
    })
  })

  describe('DEFAULT_MAILBOX_AI_TOOLS', () => {
    it('has all 4 tool configs', () => {
      const keys = Object.keys(DEFAULT_MAILBOX_AI_TOOLS)
      expect(keys).toContain('responseDraft')
      expect(keys).toContain('mailboxCleanup')
      expect(keys).toContain('senderResearch')
      expect(keys).toContain('extractActions')
      expect(keys).toHaveLength(4)
    })

    it.each([
      'responseDraft',
      'mailboxCleanup',
      'senderResearch',
      'extractActions',
    ] as MailboxAIToolId[])('%s has required MailboxAIToolConfig fields', (toolId) => {
      const config: MailboxAIToolConfig = DEFAULT_MAILBOX_AI_TOOLS[toolId]
      expect(config.toolId).toBe(toolId)
      expect(typeof config.name).toBe('string')
      expect(config.name.length).toBeGreaterThan(0)
      expect(typeof config.description).toBe('string')
      expect(config.description.length).toBeGreaterThan(0)
      expect(typeof config.systemPrompt).toBe('string')
      expect(config.systemPrompt.length).toBeGreaterThan(0)
      expect(typeof config.modelName).toBe('string')
      expect(config.maxTokens).toBeGreaterThan(0)
      expect(config.enabled).toBe(true)
    })

    it('responseDraft uses claude-sonnet-4-5', () => {
      expect(DEFAULT_MAILBOX_AI_TOOLS.responseDraft.modelName).toBe('claude-sonnet-4-5')
    })

    it('senderResearch systemPrompt mentions SenderPersona', () => {
      expect(DEFAULT_MAILBOX_AI_TOOLS.senderResearch.systemPrompt).toContain('SenderPersona')
    })

    it('mailboxCleanup systemPrompt mentions all 4 actions', () => {
      const prompt = DEFAULT_MAILBOX_AI_TOOLS.mailboxCleanup.systemPrompt
      expect(prompt).toContain('archive')
      expect(prompt).toContain('snooze')
      expect(prompt).toContain('unsubscribe')
      expect(prompt).toContain('keep')
    })
  })

  describe('createDefaultMailboxAIToolSettings', () => {
    it('returns a valid MailboxAIToolSettings object', () => {
      const settings = createDefaultMailboxAIToolSettings()
      expect(settings.version).toBe(1)
      expect(typeof settings.updatedAtMs).toBe('number')
      expect(settings.updatedAtMs).toBeGreaterThan(0)
      expect(settings.tools).toBeDefined()
    })

    it('has all 4 tools with correct IDs', () => {
      const settings = createDefaultMailboxAIToolSettings()
      const toolIds = Object.keys(settings.tools)
      expect(toolIds).toHaveLength(4)
      expect(settings.tools.responseDraft.toolId).toBe('responseDraft')
      expect(settings.tools.mailboxCleanup.toolId).toBe('mailboxCleanup')
      expect(settings.tools.senderResearch.toolId).toBe('senderResearch')
      expect(settings.tools.extractActions.toolId).toBe('extractActions')
    })

    it('does not include customPriorityPrompt by default', () => {
      const settings = createDefaultMailboxAIToolSettings()
      expect(settings.customPriorityPrompt).toBeUndefined()
    })

    it('returns a new object each call (no shared reference)', () => {
      const a = createDefaultMailboxAIToolSettings()
      const b = createDefaultMailboxAIToolSettings()
      expect(a).not.toBe(b)
      expect(a.tools).not.toBe(b.tools)
    })
  })

  describe('ResponseDraftResult type', () => {
    it('requires body and tone', () => {
      const result: ResponseDraftResult = {
        body: 'Thank you for the update.',
        tone: 'professional',
      }
      expect(result.body).toBe('Thank you for the update.')
      expect(result.tone).toBe('professional')
      expect(result.subject).toBeUndefined()
      expect(result.alternateVersions).toBeUndefined()
    })

    it('supports optional subject and alternateVersions', () => {
      const result: ResponseDraftResult = {
        subject: 'Re: Meeting notes',
        body: 'Thanks for sharing.',
        tone: 'friendly',
        alternateVersions: ['More formal version', 'More casual version'],
      }
      expect(result.subject).toBe('Re: Meeting notes')
      expect(result.alternateVersions).toHaveLength(2)
    })
  })

  describe('CleanupAction type', () => {
    it('accepts all 4 action types', () => {
      const actions: CleanupAction[] = ['archive', 'snooze', 'unsubscribe', 'keep']
      expect(actions).toHaveLength(4)
    })
  })

  describe('CleanupRecommendation type', () => {
    it('validates shape', () => {
      const rec: CleanupRecommendation = {
        messageId: 'msg:123',
        action: 'archive',
        reason: 'Informational-only message, no action needed',
      }
      expect(rec.messageId).toBe('msg:123')
      expect(rec.action).toBe('archive')
      expect(rec.reason).toContain('Informational')
    })
  })

  describe('MailboxAIToolSettings type', () => {
    it('supports customPriorityPrompt', () => {
      const settings: MailboxAIToolSettings = {
        tools: { ...DEFAULT_MAILBOX_AI_TOOLS },
        customPriorityPrompt: 'Prioritize emails from my boss.',
        version: 1,
        updatedAtMs: Date.now(),
      }
      expect(settings.customPriorityPrompt).toBe('Prioritize emails from my boss.')
    })
  })
})
