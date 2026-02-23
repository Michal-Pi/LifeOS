import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock firebase-admin
vi.mock('firebase-admin/auth', () => ({
  getAuth: vi.fn(() => ({
    verifyIdToken: vi.fn(() => Promise.resolve({ uid: 'user1' })),
  })),
}))

const mockSet = vi.fn(() => Promise.resolve())
const mockDelete = vi.fn(() => Promise.resolve())
const mockUpdate = vi.fn(() => Promise.resolve())
const mockGet = vi.fn(() =>
  Promise.resolve({
    exists: true,
    data: () => ({
      source: 'telegram',
      credentials: { botToken: '123:ABC' },
      config: {},
    }),
  })
)
const mockDocRef = vi.fn(() => ({
  set: mockSet,
  delete: mockDelete,
  update: mockUpdate,
  get: mockGet,
}))

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: vi.fn(() => ({
    doc: mockDocRef,
    collection: vi.fn(() => ({
      doc: vi.fn(() => ({ id: 'auto-id' })),
    })),
  })),
}))

vi.mock('firebase-functions/v2/https', () => ({
  onRequest: vi.fn((_config: any, handler: any) => handler),
}))

vi.mock('../../slack/paths.js', () => ({
  channelConnectionRef: vi.fn(() => ({
    set: mockSet,
    delete: mockDelete,
    update: mockUpdate,
    get: mockGet,
  })),
  channelConnectionsCollection: vi.fn(() => ({
    doc: vi.fn(() => ({ id: 'auto-id' })),
  })),
}))

// Mock global fetch for credential validation
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

import {
  channelConnectionCreate,
  channelConnectionDelete,
  channelConnectionTest,
} from '../channelConnectionEndpoints.js'

function createMockRequest(body: any = {}): any {
  return {
    body,
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

describe('channelConnectionEndpoints', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('channelConnectionCreate', () => {
    it('returns 400 when missing required fields', async () => {
      const req = createMockRequest({ uid: 'user1' })
      const res = createMockResponse()
      await (channelConnectionCreate as any)(req, res)
      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.jsonData.error).toContain('Missing required fields')
    })

    it('returns 400 for unsupported source', async () => {
      const req = createMockRequest({
        uid: 'user1',
        source: 'twitter',
        credentials: { token: 'xyz' },
      })
      const res = createMockResponse()
      await (channelConnectionCreate as any)(req, res)
      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.jsonData.error).toContain('Unsupported source')
    })

    it('returns 400 when linkedin cookie is missing', async () => {
      const req = createMockRequest({
        uid: 'user1',
        source: 'linkedin',
        credentials: {},
      })
      const res = createMockResponse()
      await (channelConnectionCreate as any)(req, res)
      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.jsonData.error).toContain('liAtCookie')
    })

    it('returns 400 when telegram token is missing', async () => {
      const req = createMockRequest({
        uid: 'user1',
        source: 'telegram',
        credentials: {},
      })
      const res = createMockResponse()
      await (channelConnectionCreate as any)(req, res)
      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.jsonData.error).toContain('botToken')
    })

    it('returns 400 when whatsapp companion URL is missing', async () => {
      const req = createMockRequest({
        uid: 'user1',
        source: 'whatsapp',
        credentials: {},
        config: {},
      })
      const res = createMockResponse()
      await (channelConnectionCreate as any)(req, res)
      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.jsonData.error).toContain('companionServiceUrl')
    })

    it('creates a telegram connection successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            ok: true,
            result: { username: 'TestBot', first_name: 'Test Bot' },
          }),
      })

      const req = createMockRequest({
        uid: 'user1',
        source: 'telegram',
        credentials: { botToken: '123:ABC' },
      })
      const res = createMockResponse()
      await (channelConnectionCreate as any)(req, res)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          connectionId: expect.any(String),
          displayName: '@TestBot',
        })
      )
      expect(mockSet).toHaveBeenCalled()
    })

    it('returns 400 when linkedin validation fails', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
      })

      const req = createMockRequest({
        uid: 'user1',
        source: 'linkedin',
        credentials: { liAtCookie: 'expired-cookie' },
      })
      const res = createMockResponse()
      await (channelConnectionCreate as any)(req, res)
      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.jsonData.error).toContain('invalid or expired')
    })
  })

  describe('channelConnectionDelete', () => {
    it('returns 400 when missing connectionId', async () => {
      const req = createMockRequest({ uid: 'user1' })
      const res = createMockResponse()
      await (channelConnectionDelete as any)(req, res)
      expect(res.status).toHaveBeenCalledWith(400)
    })

    it('deletes a connection successfully', async () => {
      const req = createMockRequest({
        uid: 'user1',
        connectionId: 'conn-123',
      })
      const res = createMockResponse()
      await (channelConnectionDelete as any)(req, res)
      expect(res.json).toHaveBeenCalledWith({ success: true })
    })
  })

  describe('channelConnectionTest', () => {
    it('returns 400 when missing connectionId', async () => {
      const req = createMockRequest({ uid: 'user1' })
      const res = createMockResponse()
      await (channelConnectionTest as any)(req, res)
      expect(res.status).toHaveBeenCalledWith(400)
    })

    it('tests a telegram connection and returns status', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            ok: true,
            result: { username: 'TestBot', first_name: 'Test Bot' },
          }),
      })

      const req = createMockRequest({
        uid: 'user1',
        connectionId: 'conn-123',
      })
      const res = createMockResponse()
      await (channelConnectionTest as any)(req, res)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          status: 'connected',
        })
      )
    })
  })
})
