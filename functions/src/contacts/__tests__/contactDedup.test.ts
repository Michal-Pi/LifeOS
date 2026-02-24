import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ContactId, Contact } from '@lifeos/agents'

// --- Test data ---

const contactAlice: Contact = {
  contactId: 'contact:alice' as ContactId,
  userId: 'user1',
  displayName: 'Alice Johnson',
  firstName: 'Alice',
  lastName: 'Johnson',
  company: 'Acme Corp',
  title: 'Engineer',
  circle: 2,
  significance: 3,
  sources: ['gmail'],
  tags: ['colleague'],
  identifiers: {
    emails: ['alice@acme.com'],
    phones: ['+15551234567'],
  },
  archived: false,
  starred: false,
  createdAtMs: 1700000000000,
  updatedAtMs: 1700000000000,
  lastInteractionMs: 1700050000000,
}

const contactAliceDup: Contact = {
  contactId: 'contact:alice-dup' as ContactId,
  userId: 'user1',
  displayName: 'Alice J.',
  company: 'Acme Corp',
  circle: 4,
  significance: 1,
  sources: ['google_contacts'],
  tags: ['work'],
  identifiers: {
    emails: ['alice@acme.com', 'alice.j@gmail.com'],
    phones: [],
    linkedinSlug: 'alice-johnson',
  },
  notes: 'Met at conference',
  archived: false,
  starred: false,
  createdAtMs: 1700100000000,
  updatedAtMs: 1700100000000,
}

const contactBob: Contact = {
  contactId: 'contact:bob' as ContactId,
  userId: 'user1',
  displayName: 'Bob Williams',
  circle: 3,
  significance: 2,
  sources: ['calendar'],
  tags: [],
  identifiers: {
    emails: ['bob@other.com'],
    phones: [],
  },
  archived: false,
  starred: false,
  createdAtMs: 1700200000000,
  updatedAtMs: 1700200000000,
}

const interaction1 = {
  interactionId: 'int:1',
  contactId: 'contact:alice-dup',
  userId: 'user1',
  type: 'email',
  summary: 'Follow-up email',
  source: 'gmail',
  occurredAtMs: 1700300000000,
  createdAtMs: 1700300000000,
}

const interaction2 = {
  interactionId: 'int:2',
  contactId: 'contact:alice-dup',
  userId: 'user1',
  type: 'meeting',
  summary: 'Sprint planning',
  source: 'calendar',
  occurredAtMs: 1700400000000,
  createdAtMs: 1700400000000,
}

// --- Mocks ---

const mockBatchSet = vi.fn()
const mockBatchUpdate = vi.fn()
const mockBatchDelete = vi.fn()
const mockBatchCommit = vi.fn()

const mockBatch = {
  set: mockBatchSet,
  update: mockBatchUpdate,
  delete: mockBatchDelete,
  commit: mockBatchCommit,
}

// Map of path → snapshot
const docSnapshots: Record<
  string,
  { exists: boolean; data: () => unknown; id: string; ref: unknown }
> = {}
const collectionSnapshots: Record<string, { docs: Array<{ data: () => unknown; ref: unknown }> }> =
  {}

vi.mock('../../lib/firebase.js', () => ({
  firestore: {
    doc: vi.fn((path: string) => {
      const ref = { path, id: path.split('/').pop() }
      return {
        ...ref,
        get: vi.fn(() => {
          const snap = docSnapshots[path]
          return Promise.resolve(snap ?? { exists: false, data: () => null, id: ref.id, ref })
        }),
      }
    }),
    collection: vi.fn((path: string) => ({
      path,
      where: vi.fn(() => ({
        get: vi.fn(() => {
          const snap = collectionSnapshots[path]
          return Promise.resolve(snap ?? { docs: [] })
        }),
      })),
      doc: vi.fn((docId: string) => {
        const fullPath = `${path}/${docId}`
        return { path: fullPath, id: docId }
      }),
      get: vi.fn(() => {
        const snap = collectionSnapshots[path]
        return Promise.resolve(snap ?? { docs: [] })
      }),
    })),
    getAll: vi.fn((...refs: Array<{ path: string; id: string }>) => {
      return Promise.resolve(
        refs.map((ref) => {
          const snap = docSnapshots[ref.path]
          return snap ?? { exists: false, data: () => null, id: ref.id, ref }
        })
      )
    }),
    batch: vi.fn(() => ({ ...mockBatch })),
  },
}))

vi.mock('../../lib/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

vi.mock('firebase-functions/v2/https', () => ({
  onCall: (_opts: unknown, handler: unknown) => handler,
  HttpsError: class HttpsError extends Error {
    code: string
    constructor(code: string, message: string) {
      super(message)
      this.code = code
    }
  },
}))

// --- Tests ---

describe('findDuplicateContacts', () => {
  let findDuplicateContacts: (request: unknown) => Promise<unknown>

  beforeEach(async () => {
    vi.clearAllMocks()
    // Clear snapshot maps
    for (const key of Object.keys(docSnapshots)) delete docSnapshots[key]
    for (const key of Object.keys(collectionSnapshots)) delete collectionSnapshots[key]

    const mod = await import('../findDuplicates.js')
    findDuplicateContacts = mod.findDuplicateContacts as unknown as (
      request: unknown
    ) => Promise<unknown>
  })

  it('returns candidates for contacts with matching emails', async () => {
    collectionSnapshots['users/user1/contacts'] = {
      docs: [
        { data: () => contactAlice, ref: { path: 'users/user1/contacts/contact:alice' } },
        { data: () => contactAliceDup, ref: { path: 'users/user1/contacts/contact:alice-dup' } },
        { data: () => contactBob, ref: { path: 'users/user1/contacts/contact:bob' } },
      ],
    }

    const result = (await findDuplicateContacts({
      auth: { uid: 'user1' },
      data: {},
    })) as { candidates: unknown[]; totalContactsScanned: number }

    expect(result.totalContactsScanned).toBe(3)
    expect(result.candidates.length).toBe(1)
    expect((result.candidates[0] as { score: number }).score).toBeGreaterThanOrEqual(90)
  })

  it('returns empty for unique contacts', async () => {
    collectionSnapshots['users/user1/contacts'] = {
      docs: [
        { data: () => contactAlice, ref: { path: 'users/user1/contacts/contact:alice' } },
        { data: () => contactBob, ref: { path: 'users/user1/contacts/contact:bob' } },
      ],
    }

    const result = (await findDuplicateContacts({
      auth: { uid: 'user1' },
      data: {},
    })) as { candidates: unknown[] }

    expect(result.candidates.length).toBe(0)
  })

  it('throws unauthenticated when no auth', async () => {
    await expect(findDuplicateContacts({ auth: null, data: {} })).rejects.toThrow(
      'Must be logged in'
    )
  })
})

describe('mergeContacts', () => {
  let mergeContacts: (request: unknown) => Promise<unknown>

  beforeEach(async () => {
    vi.clearAllMocks()
    for (const key of Object.keys(docSnapshots)) delete docSnapshots[key]
    for (const key of Object.keys(collectionSnapshots)) delete collectionSnapshots[key]

    const mod = await import('../mergeContacts.js')
    mergeContacts = mod.mergeContacts as unknown as (request: unknown) => Promise<unknown>
  })

  it('merges identifiers, moves interactions, updates index, deletes secondary', async () => {
    docSnapshots['users/user1/contacts/contact:alice'] = {
      exists: true,
      data: () => contactAlice,
      id: 'contact:alice',
      ref: { path: 'users/user1/contacts/contact:alice' },
    }
    docSnapshots['users/user1/contacts/contact:alice-dup'] = {
      exists: true,
      data: () => contactAliceDup,
      id: 'contact:alice-dup',
      ref: { path: 'users/user1/contacts/contact:alice-dup' },
    }

    collectionSnapshots['users/user1/contacts/contact:alice-dup/interactions'] = {
      docs: [
        {
          data: () => interaction1,
          ref: { path: 'users/user1/contacts/contact:alice-dup/interactions/int:1' },
        },
        {
          data: () => interaction2,
          ref: { path: 'users/user1/contacts/contact:alice-dup/interactions/int:2' },
        },
      ],
    }

    const result = (await mergeContacts({
      auth: { uid: 'user1' },
      data: {
        primaryContactId: 'contact:alice',
        secondaryContactIds: ['contact:alice-dup'],
      },
    })) as {
      mergedContactId: string
      secondariesRemoved: number
      interactionsMoved: number
      emailIndexEntriesUpdated: number
    }

    expect(result.mergedContactId).toBe('contact:alice')
    expect(result.secondariesRemoved).toBe(1)
    expect(result.interactionsMoved).toBe(2)
    // alice@acme.com + alice.j@gmail.com = 2 index entries
    expect(result.emailIndexEntriesUpdated).toBe(2)
    expect(mockBatchCommit).toHaveBeenCalled()
  })

  it('appends notes from secondary', async () => {
    const aliceWithNotes = { ...contactAlice, notes: 'Primary notes' }
    docSnapshots['users/user1/contacts/contact:alice'] = {
      exists: true,
      data: () => aliceWithNotes,
      id: 'contact:alice',
      ref: { path: 'users/user1/contacts/contact:alice' },
    }
    docSnapshots['users/user1/contacts/contact:alice-dup'] = {
      exists: true,
      data: () => contactAliceDup,
      id: 'contact:alice-dup',
      ref: { path: 'users/user1/contacts/contact:alice-dup' },
    }
    collectionSnapshots['users/user1/contacts/contact:alice-dup/interactions'] = { docs: [] }

    await mergeContacts({
      auth: { uid: 'user1' },
      data: {
        primaryContactId: 'contact:alice',
        secondaryContactIds: ['contact:alice-dup'],
      },
    })

    // Check that batch.update was called with notes containing both
    const updateCalls = mockBatchUpdate.mock.calls
    expect(updateCalls.length).toBeGreaterThan(0)
    const lastUpdateData = updateCalls[updateCalls.length - 1][1] as Record<string, unknown>
    expect(lastUpdateData.notes).toContain('Primary notes')
    expect(lastUpdateData.notes).toContain('Met at conference')
    expect(lastUpdateData.notes).toContain('Merged from Alice J.')
  })

  it('throws not-found when primary does not exist', async () => {
    // No docSnapshots set → not found
    await expect(
      mergeContacts({
        auth: { uid: 'user1' },
        data: {
          primaryContactId: 'contact:missing',
          secondaryContactIds: ['contact:alice-dup'],
        },
      })
    ).rejects.toThrow('Primary contact not found')
  })

  it('throws invalid-argument when primary in secondaries', async () => {
    await expect(
      mergeContacts({
        auth: { uid: 'user1' },
        data: {
          primaryContactId: 'contact:alice',
          secondaryContactIds: ['contact:alice'],
        },
      })
    ).rejects.toThrow('Primary cannot appear in secondaries')
  })

  it('throws unauthenticated when no auth', async () => {
    await expect(
      mergeContacts({
        auth: null,
        data: {
          primaryContactId: 'contact:alice',
          secondaryContactIds: ['contact:alice-dup'],
        },
      })
    ).rejects.toThrow('Must be logged in')
  })

  it('throws invalid-argument when missing required fields', async () => {
    await expect(
      mergeContacts({
        auth: { uid: 'user1' },
        data: {},
      })
    ).rejects.toThrow('primaryContactId and secondaryContactIds required')
  })
})
