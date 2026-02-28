import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock calendarApi for getValidAccessToken
vi.mock('../calendarApi.js', () => ({
  getValidAccessToken: vi.fn(() => Promise.resolve('mock-access-token')),
}))

// Mock global fetch
const mockFetch = vi.fn()
global.fetch = mockFetch

import { sendGmailMessage, trashGmailMessage } from '../gmailApi.js'

describe('Gmail API write operations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('sendGmailMessage', () => {
    it('calls Gmail API send endpoint with encoded email', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: 'sent-msg-1', threadId: 'thread-1' }),
      })

      const result = await sendGmailMessage('user1', 'account1', {
        to: 'recipient@example.com',
        subject: 'Test Subject',
        body: 'Hello World',
      })

      expect(result).toEqual({ messageId: 'sent-msg-1', threadId: 'thread-1' })
      expect(mockFetch).toHaveBeenCalledTimes(1)

      const [url, options] = mockFetch.mock.calls[0]
      expect(url).toContain('/users/me/messages/send')
      expect(options.method).toBe('POST')

      const body = JSON.parse(options.body)
      expect(body.raw).toBeDefined()
      // Decode the raw email and verify it contains the expected content
      const decoded = Buffer.from(
        body.raw.replace(/-/g, '+').replace(/_/g, '/'),
        'base64'
      ).toString('utf-8')
      expect(decoded).toContain('To: recipient@example.com')
      expect(decoded).toContain('Subject: Test Subject')
      expect(decoded).toContain('Hello World')
    })

    it('includes threadId when replying', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: 'reply-1', threadId: 'existing-thread' }),
      })

      await sendGmailMessage('user1', 'account1', {
        to: 'test@example.com',
        subject: 'Re: Original',
        body: 'Reply body',
        threadId: 'existing-thread',
        inReplyTo: '<original@example.com>',
      })

      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.threadId).toBe('existing-thread')
      const decoded = Buffer.from(
        body.raw.replace(/-/g, '+').replace(/_/g, '/'),
        'base64'
      ).toString('utf-8')
      expect(decoded).toContain('In-Reply-To: <original@example.com>')
    })

    it('throws on API error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: () => Promise.resolve({ error: { code: 403, message: 'Forbidden' } }),
      })

      await expect(
        sendGmailMessage('user1', 'account1', {
          to: 'test@example.com',
          subject: 'Test',
          body: 'Body',
        })
      ).rejects.toThrow('Forbidden')
    })
  })

  describe('trashGmailMessage', () => {
    it('calls Gmail API trash endpoint', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: 'msg1', labelIds: ['TRASH'] }),
      })

      const result = await trashGmailMessage('user1', 'account1', 'msg1')

      expect(result).toBe(true)
      const [url, options] = mockFetch.mock.calls[0]
      expect(url).toContain('/users/me/messages/msg1/trash')
      expect(options.method).toBe('POST')
    })

    it('throws on API error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ error: { code: 404, message: 'Not Found' } }),
      })

      await expect(trashGmailMessage('user1', 'account1', 'nonexistent')).rejects.toThrow(
        'Not Found'
      )
    })
  })
})
