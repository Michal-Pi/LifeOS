import { describe, it, expect, vi } from 'vitest'

// Mock firebase before imports
vi.mock('../../lib/firebase.js', () => ({
  firestore: {
    doc: vi.fn((path: string) => ({ path, set: vi.fn(), get: vi.fn() })),
    collection: vi.fn(() => ({ get: vi.fn() })),
    batch: vi.fn(() => ({
      set: vi.fn(),
      update: vi.fn(),
      commit: vi.fn(() => Promise.resolve()),
    })),
    getAll: vi.fn(() => Promise.resolve([])),
  },
}))

vi.mock('../../lib/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}))

vi.mock('../../google/contactsApi.js', () => ({
  fetchAllGoogleContacts: vi.fn(),
}))

import { mapGooglePersonToContact } from '../syncContacts.js'
import type { GooglePerson } from '../../google/contactsApi.js'

describe('syncContacts', () => {
  describe('mapGooglePersonToContact', () => {
    it('maps a complete Google Person correctly', () => {
      const person: GooglePerson = {
        resourceName: 'people/c123',
        names: [
          {
            displayName: 'Alice Johnson',
            givenName: 'Alice',
            familyName: 'Johnson',
            metadata: { primary: true },
          },
        ],
        emailAddresses: [
          { value: 'Alice@Example.com', type: 'work', metadata: { primary: true } },
          { value: 'alice.j@personal.com', type: 'home' },
        ],
        phoneNumbers: [{ value: '+1234567890', canonicalForm: '+1234567890' }],
        photos: [{ url: 'https://photos.google.com/abc', metadata: { primary: true } }],
        organizations: [{ name: 'Acme Corp', title: 'CTO', metadata: { primary: true } }],
        biographies: [{ value: 'Loves hiking', contentType: 'TEXT_PLAIN' }],
      }

      const result = mapGooglePersonToContact(person)

      expect(result.displayName).toBe('Alice Johnson')
      expect(result.firstName).toBe('Alice')
      expect(result.lastName).toBe('Johnson')
      expect(result.identifiers.emails).toEqual(['alice@example.com', 'alice.j@personal.com'])
      expect(result.identifiers.phones).toEqual(['+1234567890'])
      expect(result.identifiers.googleContactId).toBe('people/c123')
      expect(result.company).toBe('Acme Corp')
      expect(result.title).toBe('CTO')
      expect(result.bio).toBe('Loves hiking')
      expect(result.avatarUrl).toBe('https://photos.google.com/abc')
    })

    it('uses "(No name)" when no name provided', () => {
      const person: GooglePerson = {
        resourceName: 'people/c456',
        emailAddresses: [{ value: 'anon@example.com' }],
      }

      const result = mapGooglePersonToContact(person)
      expect(result.displayName).toBe('(No name)')
      expect(result.identifiers.emails).toEqual(['anon@example.com'])
    })

    it('skips default profile photos', () => {
      const person: GooglePerson = {
        resourceName: 'people/c789',
        names: [{ displayName: 'Bob' }],
        photos: [{ url: 'https://default.google/photo', default: true }],
      }

      const result = mapGooglePersonToContact(person)
      expect(result.avatarUrl).toBeUndefined()
    })

    it('normalizes email addresses to lowercase', () => {
      const person: GooglePerson = {
        resourceName: 'people/c999',
        names: [{ displayName: 'Test' }],
        emailAddresses: [{ value: 'UPPER@CASE.COM' }],
      }

      const result = mapGooglePersonToContact(person)
      expect(result.identifiers.emails).toEqual(['upper@case.com'])
    })

    it('filters out invalid emails without @', () => {
      const person: GooglePerson = {
        resourceName: 'people/c111',
        emailAddresses: [{ value: 'not-an-email' }, { value: 'valid@test.com' }],
      }

      const result = mapGooglePersonToContact(person)
      expect(result.identifiers.emails).toEqual(['valid@test.com'])
    })

    it('prefers canonicalForm for phone numbers', () => {
      const person: GooglePerson = {
        resourceName: 'people/c222',
        names: [{ displayName: 'Charlie' }],
        phoneNumbers: [
          { value: '(555) 123-4567', canonicalForm: '+15551234567' },
          { value: '+44 20 7946 0958' },
        ],
      }

      const result = mapGooglePersonToContact(person)
      expect(result.identifiers.phones).toEqual(['+15551234567', '+44 20 7946 0958'])
    })

    it('selects primary name over other names', () => {
      const person: GooglePerson = {
        resourceName: 'people/c333',
        names: [
          { displayName: 'Secondary Name' },
          { displayName: 'Primary Name', metadata: { primary: true } },
        ],
      }

      const result = mapGooglePersonToContact(person)
      expect(result.displayName).toBe('Primary Name')
    })

    it('builds displayName from givenName and familyName when displayName is missing', () => {
      const person: GooglePerson = {
        resourceName: 'people/c444',
        names: [{ givenName: 'Jane', familyName: 'Smith' }],
      }

      const result = mapGooglePersonToContact(person)
      expect(result.displayName).toBe('Jane Smith')
      expect(result.firstName).toBe('Jane')
      expect(result.lastName).toBe('Smith')
    })
  })
})
