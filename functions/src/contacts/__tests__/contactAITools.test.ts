import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock Anthropic SDK
const mockCreate = vi.fn()
vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn(() => ({
    messages: { create: mockCreate },
  })),
}))

// Mock firebase
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: vi.fn(() => ({
    doc: vi.fn((path: string) => ({
      path,
      get: vi.fn(() => {
        // Calendar event
        if (path.includes('canonicalEvents/evt1')) {
          return Promise.resolve({
            exists: true,
            data: () => ({
              title: 'Sprint Planning',
              startMs: 1700100000000,
              linkedContactIds: ['contact:alice'],
              attendees: [{ email: 'alice@example.com' }],
            }),
          })
        }
        if (path.includes('canonicalEvents/evt-no-contacts')) {
          return Promise.resolve({
            exists: true,
            data: () => ({
              title: 'Solo Focus',
              startMs: 1700200000000,
              linkedContactIds: [],
            }),
          })
        }
        if (path.includes('canonicalEvents/evt-missing')) {
          return Promise.resolve({ exists: false, data: () => null })
        }
        return Promise.resolve({ exists: false, data: () => null })
      }),
    })),
  })),
}))

// Mock firebase lib
vi.mock('../../lib/firebase.js', () => ({
  firestore: {
    doc: vi.fn((path: string) => ({
      path,
      get: vi.fn(() => {
        if (path.includes('contacts/contact:alice')) {
          return Promise.resolve({
            exists: true,
            data: () => ({
              contactId: 'contact:alice',
              displayName: 'Alice Johnson',
              company: 'Acme Corp',
              circle: 2,
              sources: ['gmail', 'calendar'],
              starred: false,
              tags: [],
              identifiers: { emails: ['alice@example.com'], phones: [] },
              createdAtMs: 1690000000000,
              lastInteractionMs: 1700000000000,
            }),
          })
        }
        if (path.includes('contacts/contact:lonely')) {
          return Promise.resolve({
            exists: true,
            data: () => ({
              contactId: 'contact:lonely',
              displayName: 'Lonely Larry',
              circle: 4,
              sources: ['manual'],
              starred: false,
              tags: [],
              identifiers: { emails: [], phones: [] },
              createdAtMs: 1690000000000,
            }),
          })
        }
        return Promise.resolve({ exists: false, data: () => null })
      }),
    })),
    collection: vi.fn((path: string) => ({
      path,
      orderBy: vi.fn(() => ({
        limit: vi.fn(() => ({
          get: vi.fn(() => {
            if (path.includes('contact:alice/interactions')) {
              return Promise.resolve({
                docs: [
                  {
                    data: () => ({
                      interactionId: 'int1',
                      contactId: 'contact:alice',
                      type: 'email',
                      summary: 'Project update discussion',
                      source: 'gmail',
                      occurredAtMs: 1700000000000,
                      createdAtMs: 1700000000000,
                    }),
                  },
                  {
                    data: () => ({
                      interactionId: 'int2',
                      contactId: 'contact:alice',
                      type: 'meeting',
                      summary: 'Weekly sync',
                      meetingTitle: 'Weekly sync',
                      source: 'calendar',
                      occurredAtMs: 1699900000000,
                      createdAtMs: 1699900000000,
                    }),
                  },
                ],
              })
            }
            // contact:lonely has no interactions
            return Promise.resolve({ docs: [] })
          }),
        })),
      })),
    })),
  },
}))

// Mock provider keys
vi.mock('../../agents/providerKeys.js', () => ({
  loadProviderKeys: vi.fn((userId: string) => {
    if (userId === 'user-no-key') {
      return Promise.resolve({ anthropic: null })
    }
    return Promise.resolve({ anthropic: 'sk-test-key' })
  }),
}))

vi.mock('../../lib/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

// firebase-functions mocks
vi.mock('firebase-functions/v2/https', () => ({
  onCall: vi.fn((_opts: unknown, handler: (req: unknown) => Promise<unknown>) => handler),
  HttpsError: class HttpsError extends Error {
    code: string
    constructor(code: string, message: string) {
      super(message)
      this.code = code
    }
  },
}))

import { getMeetingBriefing, suggestCirclePlacement } from '../contactAITools.js'

function makeRequest(data: Record<string, unknown>, uid = 'user1') {
  return { auth: { uid }, data } as unknown as Parameters<typeof getMeetingBriefing>[0]
}

function makeUnauthRequest(data: Record<string, unknown>) {
  return { auth: null, data } as unknown as Parameters<typeof getMeetingBriefing>[0]
}

describe('getMeetingBriefing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns structured briefing for event with linked contacts', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            contactBriefings: [
              {
                contactId: 'contact:alice',
                displayName: 'Alice Johnson',
                recentContext: 'Recently discussed project updates via email.',
                talkingPoints: ['Follow up on sprint progress', 'Discuss timeline'],
              },
            ],
            overallPrepNotes: 'Focus on sprint velocity and blockers.',
          }),
        },
      ],
      usage: { input_tokens: 500, output_tokens: 200 },
    })

    const handler = getMeetingBriefing as unknown as (req: unknown) => Promise<unknown>
    const result = (await handler(makeRequest({ eventId: 'evt1' }))) as {
      tool: string
      result: { contactBriefings: Array<{ contactId: string }>; overallPrepNotes: string }
    }

    expect(result.tool).toBe('meetingBriefing')
    expect(result.result.contactBriefings).toHaveLength(1)
    expect(result.result.contactBriefings[0].contactId).toBe('contact:alice')
    expect(result.result.overallPrepNotes).toBeTruthy()
  })

  it('returns empty briefings for event with no linked contacts', async () => {
    const handler = getMeetingBriefing as unknown as (req: unknown) => Promise<unknown>
    const result = (await handler(makeRequest({ eventId: 'evt-no-contacts' }))) as {
      result: { contactBriefings: unknown[] }
    }

    expect(result.result.contactBriefings).toHaveLength(0)
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('throws not-found for missing event', async () => {
    const handler = getMeetingBriefing as unknown as (req: unknown) => Promise<unknown>
    await expect(handler(makeRequest({ eventId: 'evt-missing' }))).rejects.toThrow(
      'Calendar event not found'
    )
  })

  it('throws unauthenticated when not logged in', async () => {
    const handler = getMeetingBriefing as unknown as (req: unknown) => Promise<unknown>
    await expect(handler(makeUnauthRequest({ eventId: 'evt1' }))).rejects.toThrow(
      'Must be logged in'
    )
  })

  it('throws failed-precondition when no API key', async () => {
    const handler = getMeetingBriefing as unknown as (req: unknown) => Promise<unknown>
    await expect(handler(makeRequest({ eventId: 'evt1' }, 'user-no-key'))).rejects.toThrow(
      'Anthropic API key not configured'
    )
  })
})

describe('suggestCirclePlacement', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns suggestion for contact with interactions', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            suggestedCircle: 1,
            currentCircle: 2,
            confidence: 'high',
            reasoning: 'Frequent email and meeting interactions suggest closer relationship.',
          }),
        },
      ],
      usage: { input_tokens: 300, output_tokens: 100 },
    })

    const handler = suggestCirclePlacement as unknown as (req: unknown) => Promise<unknown>
    const result = (await handler(makeRequest({ contactId: 'contact:alice' }))) as {
      tool: string
      result: { suggestedCircle: number; confidence: string }
    }

    expect(result.tool).toBe('circleSuggestion')
    expect(result.result.suggestedCircle).toBe(1)
    expect(result.result.confidence).toBe('high')
  })

  it('returns low confidence for contact with no interactions', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            suggestedCircle: 4,
            currentCircle: 4,
            confidence: 'low',
            reasoning: 'No recorded interactions. Keep as acquaintance.',
          }),
        },
      ],
      usage: { input_tokens: 200, output_tokens: 80 },
    })

    const handler = suggestCirclePlacement as unknown as (req: unknown) => Promise<unknown>
    const result = (await handler(makeRequest({ contactId: 'contact:lonely' }))) as {
      result: { confidence: string; suggestedCircle: number }
    }

    expect(result.result.confidence).toBe('low')
    expect(result.result.suggestedCircle).toBe(4)
  })

  it('throws unauthenticated when not logged in', async () => {
    const handler = suggestCirclePlacement as unknown as (req: unknown) => Promise<unknown>
    await expect(handler(makeUnauthRequest({ contactId: 'contact:alice' }))).rejects.toThrow(
      'Must be logged in'
    )
  })

  it('throws failed-precondition when no API key', async () => {
    const handler = suggestCirclePlacement as unknown as (req: unknown) => Promise<unknown>
    await expect(
      handler(makeRequest({ contactId: 'contact:alice' }, 'user-no-key'))
    ).rejects.toThrow('Anthropic API key not configured')
  })

  it('throws not-found for missing contact', async () => {
    const handler = suggestCirclePlacement as unknown as (req: unknown) => Promise<unknown>
    await expect(handler(makeRequest({ contactId: 'contact:unknown' }))).rejects.toThrow(
      'Contact not found'
    )
  })
})
