import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock firebase-admin
vi.mock('firebase-admin/auth', () => ({
  getAuth: vi.fn(() => ({
    verifyIdToken: vi.fn(() => Promise.resolve({ uid: 'user1' })),
  })),
}))

vi.mock('firebase-admin/firestore', () => {
  const mockSet = vi.fn(() => Promise.resolve())
  const mockDelete = vi.fn(() => Promise.resolve())
  const mockUpdate = vi.fn(() => Promise.resolve())
  const mockDoc = vi.fn(() => ({
    set: mockSet,
    delete: mockDelete,
    update: mockUpdate,
    id: 'auto-draft-id',
  }))
  return {
    getFirestore: vi.fn(() => ({
      doc: mockDoc,
      collection: vi.fn(() => ({
        doc: vi.fn(() => ({ id: 'auto-draft-id' })),
      })),
    })),
  }
})

vi.mock('firebase-functions/v2/https', () => ({
  onRequest: vi.fn((_config: any, handler: any) => handler),
}))

vi.mock('../gmailAdapter.js', () => ({
  gmailAdapter: {
    source: 'gmail',
    sendMessage: vi.fn(() => Promise.resolve({ messageId: 'sent1' })),
    deleteMessage: vi.fn(() => Promise.resolve(true)),
  },
}))

vi.mock('../linkedinAdapter.js', () => ({
  linkedinAdapter: {
    source: 'linkedin',
    sendMessage: vi.fn(() => Promise.resolve({ messageId: 'li-sent1' })),
    deleteMessage: vi.fn(() => Promise.resolve(false)),
  },
}))

vi.mock('../telegramAdapter.js', () => ({
  telegramAdapter: {
    source: 'telegram',
    sendMessage: vi.fn(() => Promise.resolve({ messageId: 'tg-sent1' })),
    deleteMessage: vi.fn(() => Promise.resolve(true)),
  },
}))

vi.mock('../whatsappAdapter.js', () => ({
  whatsappAdapter: {
    source: 'whatsapp',
    sendMessage: vi.fn(() => Promise.resolve({ messageId: 'wa-sent1' })),
    deleteMessage: vi.fn(() => Promise.resolve(true)),
  },
}))

vi.mock('../../slack/paths.js', () => ({
  prioritizedMessageRef: vi.fn(() => ({
    update: vi.fn(() => Promise.resolve()),
  })),
  mailboxDraftRef: vi.fn(() => ({
    set: vi.fn(() => Promise.resolve()),
    delete: vi.fn(() => Promise.resolve()),
  })),
  mailboxDraftsCollection: vi.fn(() => ({
    doc: vi.fn(() => ({ id: 'auto-draft-id' })),
  })),
}))

import {
  mailboxSend,
  mailboxDelete,
  mailboxSaveDraft,
  mailboxDeleteDraft,
} from '../mailboxWriteEndpoints.js'

function createMockRequest(body: any = {}, query: any = {}): any {
  return {
    body,
    query,
    headers: { authorization: 'Bearer valid-token' },
  }
}

function createMockResponse(): any {
  const res: any = {
    statusCode: 200,
    jsonData: null,
  }
  res.status = vi.fn((code: number) => {
    res.statusCode = code
    return res
  })
  res.json = vi.fn((data: any) => {
    res.jsonData = data
    return res
  })
  return res
}

describe('mailboxWriteEndpoints', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('mailboxSend', () => {
    it('returns 400 when missing required fields', async () => {
      const req = createMockRequest({ uid: 'user1' })
      const res = createMockResponse()
      await (mailboxSend as any)(req, res)
      expect(res.status).toHaveBeenCalledWith(400)
    })

    it('sends via adapter and returns messageId', async () => {
      const req = createMockRequest({
        uid: 'user1',
        source: 'gmail',
        recipientId: 'test@example.com',
        body: 'Hello',
      })
      const res = createMockResponse()
      await (mailboxSend as any)(req, res)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, messageId: 'sent1' })
      )
    })

    it('sends via linkedin adapter', async () => {
      const req = createMockRequest({
        uid: 'user1',
        source: 'linkedin',
        recipientId: 'urn:li:member:123',
        body: 'Hello',
      })
      const res = createMockResponse()
      await (mailboxSend as any)(req, res)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, messageId: 'li-sent1' })
      )
    })

    it('sends via telegram adapter', async () => {
      const req = createMockRequest({
        uid: 'user1',
        source: 'telegram',
        recipientId: '123456789',
        body: 'Hello',
      })
      const res = createMockResponse()
      await (mailboxSend as any)(req, res)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, messageId: 'tg-sent1' })
      )
    })

    it('sends via whatsapp adapter', async () => {
      const req = createMockRequest({
        uid: 'user1',
        source: 'whatsapp',
        recipientId: '5511999999999@s.whatsapp.net',
        body: 'Hello',
      })
      const res = createMockResponse()
      await (mailboxSend as any)(req, res)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, messageId: 'wa-sent1' })
      )
    })

    it('returns 400 for unsupported channel', async () => {
      const req = createMockRequest({
        uid: 'user1',
        source: 'unknown_channel',
        recipientId: 'test',
        body: 'Hello',
      })
      const res = createMockResponse()
      await (mailboxSend as any)(req, res)
      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.jsonData.error).toContain('does not support sending')
    })
  })

  describe('mailboxDelete', () => {
    it('returns 400 when missing required fields', async () => {
      const req = createMockRequest({ uid: 'user1' })
      const res = createMockResponse()
      await (mailboxDelete as any)(req, res)
      expect(res.status).toHaveBeenCalledWith(400)
    })

    it('deletes via adapter and dismisses in Firestore', async () => {
      const req = createMockRequest({
        uid: 'user1',
        source: 'gmail',
        connectionId: 'conn1',
        messageId: 'msg1',
      })
      const res = createMockResponse()
      await (mailboxDelete as any)(req, res)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, deleted: true })
      )
    })
  })

  describe('mailboxSaveDraft', () => {
    it('returns 400 when missing uid or source', async () => {
      const req = createMockRequest({ uid: 'user1' })
      const res = createMockResponse()
      await (mailboxSaveDraft as any)(req, res)
      expect(res.status).toHaveBeenCalledWith(400)
    })

    it('saves a draft and returns draftId', async () => {
      const req = createMockRequest({
        uid: 'user1',
        source: 'gmail',
        body: 'Draft content',
      })
      const res = createMockResponse()
      await (mailboxSaveDraft as any)(req, res)
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }))
    })
  })

  describe('mailboxDeleteDraft', () => {
    it('returns 400 when missing draftId', async () => {
      const req = createMockRequest({ uid: 'user1' })
      const res = createMockResponse()
      await (mailboxDeleteDraft as any)(req, res)
      expect(res.status).toHaveBeenCalledWith(400)
    })

    it('deletes a draft successfully', async () => {
      const req = createMockRequest({ uid: 'user1', draftId: 'draft1' })
      const res = createMockResponse()
      await (mailboxDeleteDraft as any)(req, res)
      expect(res.json).toHaveBeenCalledWith({ success: true })
    })
  })
})
