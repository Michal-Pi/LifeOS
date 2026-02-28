import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mocks ──

const mockDocGet = vi.fn()
const mockDocSet = vi.fn()
const mockCollectionGet = vi.fn()

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: vi.fn(() => ({
    settings: vi.fn(),
  })),
}))

vi.mock('../../lib/firebase.js', () => ({
  firestore: {
    doc: vi.fn(() => ({
      get: mockDocGet,
      set: mockDocSet,
    })),
    collection: vi.fn(() => ({
      where: vi.fn(() => ({
        get: mockCollectionGet,
      })),
    })),
  },
}))

vi.mock('../../freeBusy/freeBusy.js', () => ({
  getAttendeeFreeBusy: vi.fn(() =>
    Promise.resolve({
      attendees: [{ email: 'cal@example.com', busy: [] }],
      cached: false,
      rangeStartMs: 0,
      rangeEndMs: 0,
      timeZone: 'UTC',
    })
  ),
}))

vi.mock('../../google/calendarApi.js', () => ({
  insertEvent: vi.fn(() =>
    Promise.resolve({
      id: 'google-event-123',
      etag: '"etag"',
      updated: new Date().toISOString(),
      htmlLink: 'https://meet.google.com/test-meet',
    })
  ),
}))

vi.mock('../../lib/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}))

// ── Helpers ──

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createMockRequest(queryOrBody: Record<string, unknown> = {}, method = 'GET'): any {
  return {
    query: method === 'GET' ? queryOrBody : {},
    body: method === 'POST' ? queryOrBody : {},
    method,
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createMockResponse(): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res: any = {
    statusCode: 200,
    jsonData: null as unknown,
  }
  res.status = vi.fn((code: number) => {
    res.statusCode = code
    return res
  })
  res.json = vi.fn((data: unknown) => {
    res.jsonData = data
    return res
  })
  return res
}

const MOCK_LINK = {
  id: 'link-1',
  slug: 'test-meeting',
  title: 'Test Meeting',
  description: 'A test meeting',
  durations: [15, 30, 60],
  defaultDuration: 30,
  calendarId: 'primary',
  accountId: 'acct-1',
  timezone: 'UTC',
  availability: {
    mon: [{ start: '09:00', end: '17:00' }],
    tue: [{ start: '09:00', end: '17:00' }],
    wed: [{ start: '09:00', end: '17:00' }],
    thu: [{ start: '09:00', end: '17:00' }],
    fri: [{ start: '09:00', end: '17:00' }],
    sat: [],
    sun: [],
  },
  bufferMinutes: 0,
  maxDaysAhead: 30,
  location: 'Google Meet',
  addConferencing: true,
  active: true,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
}

// ── Tests ──

describe('handleGetSchedulingLink', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let handleGetSchedulingLink: (req: any, res: any) => Promise<void>

  beforeEach(async () => {
    vi.clearAllMocks()
    const mod = await import('../endpoints.js')
    handleGetSchedulingLink = mod.handleGetSchedulingLink
  })

  it('returns 400 if slug is missing', async () => {
    const req = createMockRequest({})
    const res = createMockResponse()
    await handleGetSchedulingLink(req, res)
    expect(res.statusCode).toBe(400)
  })

  it('returns 404 for unknown slug', async () => {
    mockDocGet.mockResolvedValueOnce({ exists: false })

    const req = createMockRequest({ slug: 'nonexistent' })
    const res = createMockResponse()
    await handleGetSchedulingLink(req, res)
    expect(res.statusCode).toBe(404)
  })

  it('returns 404 for inactive link', async () => {
    mockDocGet
      .mockResolvedValueOnce({ exists: true, data: () => ({ userId: 'u1', linkId: 'l1' }) })
      .mockResolvedValueOnce({ exists: true, data: () => ({ ...MOCK_LINK, active: false }) })

    const req = createMockRequest({ slug: 'test-meeting' })
    const res = createMockResponse()
    await handleGetSchedulingLink(req, res)
    expect(res.statusCode).toBe(404)
  })

  it('returns sanitized link data (no accountId or calendarId)', async () => {
    mockDocGet
      .mockResolvedValueOnce({ exists: true, data: () => ({ userId: 'u1', linkId: 'l1' }) })
      .mockResolvedValueOnce({ exists: true, data: () => MOCK_LINK })

    const req = createMockRequest({ slug: 'test-meeting' })
    const res = createMockResponse()
    await handleGetSchedulingLink(req, res)

    expect(res.statusCode).toBe(200)
    const data = res.jsonData
    expect(data.title).toBe('Test Meeting')
    expect(data.durations).toEqual([15, 30, 60])
    expect(data).not.toHaveProperty('accountId')
    expect(data).not.toHaveProperty('calendarId')
    expect(data).not.toHaveProperty('id')
  })
})

describe('handleGetAvailability', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let handleGetAvailability: (req: any, res: any) => Promise<void>

  beforeEach(async () => {
    vi.clearAllMocks()
    const mod = await import('../endpoints.js')
    handleGetAvailability = mod.handleGetAvailability
  })

  it('returns 400 for missing parameters', async () => {
    const req = createMockRequest({ slug: 'test' })
    const res = createMockResponse()
    await handleGetAvailability(req, res)
    expect(res.statusCode).toBe(400)
  })

  it('returns 400 for invalid duration', async () => {
    mockDocGet
      .mockResolvedValueOnce({ exists: true, data: () => ({ userId: 'u1', linkId: 'l1' }) })
      .mockResolvedValueOnce({ exists: true, data: () => MOCK_LINK })

    const req = createMockRequest({
      slug: 'test-meeting',
      duration: '45',
      startDate: '2099-03-03',
      endDate: '2099-03-03',
    })
    const res = createMockResponse()
    await handleGetAvailability(req, res)
    expect(res.statusCode).toBe(400)
    expect(res.jsonData.error).toContain('Invalid duration')
  })
})

describe('handleCreateBooking', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let handleCreateBooking: (req: any, res: any) => Promise<void>

  beforeEach(async () => {
    vi.clearAllMocks()
    const mod = await import('../endpoints.js')
    handleCreateBooking = mod.handleCreateBooking
  })

  it('returns 400 for missing required fields', async () => {
    const req = createMockRequest({ slug: 'test' }, 'POST')
    const res = createMockResponse()
    await handleCreateBooking(req, res)
    expect(res.statusCode).toBe(400)
  })

  it('returns 404 for unknown slug', async () => {
    mockDocGet.mockResolvedValueOnce({ exists: false })

    const req = createMockRequest(
      {
        slug: 'nonexistent',
        startTime: '2099-03-03T10:00:00Z',
        duration: 30,
        guestName: 'Test Guest',
        guestEmail: 'guest@example.com',
      },
      'POST'
    )
    const res = createMockResponse()
    await handleCreateBooking(req, res)
    expect(res.statusCode).toBe(404)
  })

  it('validates duration against link config', async () => {
    mockDocGet
      .mockResolvedValueOnce({ exists: true, data: () => ({ userId: 'u1', linkId: 'l1' }) })
      .mockResolvedValueOnce({ exists: true, data: () => MOCK_LINK })

    const req = createMockRequest(
      {
        slug: 'test-meeting',
        startTime: '2099-03-03T10:00:00Z',
        duration: 45, // Not in MOCK_LINK.durations
        guestName: 'Test Guest',
        guestEmail: 'guest@example.com',
      },
      'POST'
    )
    const res = createMockResponse()
    await handleCreateBooking(req, res)
    expect(res.statusCode).toBe(400)
    expect(res.jsonData.error).toContain('Invalid duration')
  })
})
