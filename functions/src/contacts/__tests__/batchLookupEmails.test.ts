import { describe, it, expect, vi } from 'vitest'

// Mock firebase before imports
vi.mock('../../lib/firebase.js', () => ({
  firestore: {
    doc: vi.fn((path: string) => ({ path })),
    getAll: vi.fn((...refs: Array<{ path: string }>) => {
      return Promise.resolve(
        refs.map((ref) => {
          // Simulate alice@ being in the index
          if (ref.path.includes('alice@example.com')) {
            return {
              exists: true,
              id: 'alice@example.com',
              data: () => ({
                contactId: 'contact:abc',
                displayName: 'Alice Johnson',
              }),
            }
          }
          // Simulate bob@ being in the index without displayName
          if (ref.path.includes('bob@test.com')) {
            return {
              exists: true,
              id: 'bob@test.com',
              data: () => ({
                contactId: 'contact:def',
              }),
            }
          }
          return { exists: false, id: ref.path.split('/').pop() }
        })
      )
    }),
  },
}))

vi.mock('../../lib/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
  }),
}))

import { batchLookupContactEmails } from '../batchLookupEmails.js'

describe('batchLookupContactEmails', () => {
  it('returns contactId for known emails and null for unknown', async () => {
    const results = await batchLookupContactEmails('user1', [
      'alice@example.com',
      'unknown@test.com',
    ])

    expect(results).toHaveLength(2)
    expect(results[0]).toEqual({
      email: 'alice@example.com',
      contactId: 'contact:abc',
      displayName: 'Alice Johnson',
    })
    expect(results[1]).toEqual({
      email: 'unknown@test.com',
      contactId: null,
      displayName: null,
    })
  })

  it('returns null displayName when not stored in index', async () => {
    const results = await batchLookupContactEmails('user1', ['bob@test.com'])

    expect(results[0]).toEqual({
      email: 'bob@test.com',
      contactId: 'contact:def',
      displayName: null,
    })
  })

  it('returns empty array for empty input', async () => {
    const results = await batchLookupContactEmails('user1', [])
    expect(results).toEqual([])
  })

  it('throws for more than 50 emails', async () => {
    const tooManyEmails = Array.from({ length: 51 }, (_, i) => `e${i}@test.com`)
    await expect(batchLookupContactEmails('user1', tooManyEmails)).rejects.toThrow('Max 50')
  })

  it('normalizes email addresses before lookup', async () => {
    const results = await batchLookupContactEmails('user1', ['ALICE@EXAMPLE.COM'])

    expect(results[0]).toEqual({
      email: 'alice@example.com',
      contactId: 'contact:abc',
      displayName: 'Alice Johnson',
    })
  })
})
