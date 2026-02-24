import { describe, it, expect } from 'vitest'
import {
  jaroSimilarity,
  jaroWinklerSimilarity,
  normalizeName,
  normalizePhone,
  compareContacts,
  type ContactForDedup,
} from '../nameSimilarity'

// ----- jaroSimilarity -----

describe('jaroSimilarity', () => {
  it('returns 1.0 for identical strings', () => {
    expect(jaroSimilarity('hello', 'hello')).toBe(1.0)
  })

  it('returns 0.0 for completely different strings', () => {
    expect(jaroSimilarity('abc', 'xyz')).toBe(0.0)
  })

  it('returns 0.0 for empty strings', () => {
    expect(jaroSimilarity('', '')).toBe(1.0) // identical empties
    expect(jaroSimilarity('hello', '')).toBe(0.0)
    expect(jaroSimilarity('', 'hello')).toBe(0.0)
  })

  it('computes MARTHA vs MARHTA correctly (~0.944)', () => {
    const result = jaroSimilarity('MARTHA', 'MARHTA')
    expect(result).toBeCloseTo(0.9444, 3)
  })

  it('computes DWAYNE vs DUANE correctly (~0.822)', () => {
    const result = jaroSimilarity('DWAYNE', 'DUANE')
    expect(result).toBeCloseTo(0.8222, 3)
  })

  it('computes DIXON vs DICKSONX correctly (~0.767)', () => {
    const result = jaroSimilarity('DIXON', 'DICKSONX')
    expect(result).toBeCloseTo(0.7667, 3)
  })
})

// ----- jaroWinklerSimilarity -----

describe('jaroWinklerSimilarity', () => {
  it('boosts Jaro for common prefixes', () => {
    const jaro = jaroSimilarity('MARTHA', 'MARHTA')
    const jw = jaroWinklerSimilarity('MARTHA', 'MARHTA')
    expect(jw).toBeGreaterThan(jaro)
  })

  it('does not boost when prefixes differ', () => {
    const jaro = jaroSimilarity('abc', 'xbc')
    const jw = jaroWinklerSimilarity('abc', 'xbc')
    // No common prefix, so JW equals Jaro
    expect(jw).toBeCloseTo(jaro, 10)
  })

  it('caps prefix bonus at 4 characters', () => {
    // "abcde_x" vs "abcde_y" — only first 4 chars of shared prefix used
    const jw4 = jaroWinklerSimilarity('abcdefx', 'abcdefy')
    // The prefix bonus should be capped at 4
    const jaro = jaroSimilarity('abcdefx', 'abcdefy')
    const expectedBonus = 4 * 0.1 * (1 - jaro)
    expect(jw4).toBeCloseTo(jaro + expectedBonus, 10)
  })

  it('returns 1.0 for identical strings', () => {
    expect(jaroWinklerSimilarity('test', 'test')).toBe(1.0)
  })
})

// ----- normalizeName -----

describe('normalizeName', () => {
  it('lowercases and trims', () => {
    expect(normalizeName('  John DOE  ')).toBe('john doe')
  })

  it('collapses multiple spaces', () => {
    expect(normalizeName('John   Michael   Doe')).toBe('john michael doe')
  })

  it('handles empty string', () => {
    expect(normalizeName('')).toBe('')
  })
})

// ----- normalizePhone -----

describe('normalizePhone', () => {
  it('strips formatting characters', () => {
    expect(normalizePhone('(555) 123-4567')).toBe('5551234567')
  })

  it('preserves leading +', () => {
    expect(normalizePhone('+1 (555) 123-4567')).toBe('+15551234567')
  })

  it('handles already clean numbers', () => {
    expect(normalizePhone('5551234567')).toBe('5551234567')
  })
})

// ----- compareContacts -----

function makeContact(overrides: Partial<ContactForDedup> & { contactId: string }): ContactForDedup {
  return {
    displayName: 'Unknown',
    identifiers: { emails: [], phones: [] },
    ...overrides,
  }
}

describe('compareContacts', () => {
  it('detects email overlap', () => {
    const a = makeContact({
      contactId: 'a',
      displayName: 'John Doe',
      identifiers: { emails: ['john@example.com'], phones: [] },
    })
    const b = makeContact({
      contactId: 'b',
      displayName: 'J. Doe',
      identifiers: { emails: ['JOHN@EXAMPLE.COM'], phones: [] },
    })
    const result = compareContacts(a, b)
    expect(result).not.toBeNull()
    expect(result!.score).toBe(95)
    expect(result!.reasons).toHaveLength(1)
    expect(result!.reasons[0].type).toBe('email_exact')
  })

  it('detects phone overlap', () => {
    const a = makeContact({
      contactId: 'a',
      displayName: 'Alice',
      identifiers: { emails: [], phones: ['+1 (555) 123-4567'] },
    })
    const b = makeContact({
      contactId: 'b',
      displayName: 'Bob',
      identifiers: { emails: [], phones: ['+15551234567'] },
    })
    const result = compareContacts(a, b)
    expect(result).not.toBeNull()
    expect(result!.score).toBe(90)
    expect(result!.reasons[0].type).toBe('phone_exact')
  })

  it('detects LinkedIn match', () => {
    const a = makeContact({
      contactId: 'a',
      displayName: 'Alice',
      identifiers: { emails: [], phones: [], linkedinSlug: 'alice-smith' },
    })
    const b = makeContact({
      contactId: 'b',
      displayName: 'A. Smith',
      identifiers: { emails: [], phones: [], linkedinSlug: 'alice-smith' },
    })
    const result = compareContacts(a, b)
    expect(result).not.toBeNull()
    expect(result!.score).toBe(95)
    expect(result!.reasons[0].type).toBe('linkedin_match')
  })

  it('detects Telegram match (case-insensitive)', () => {
    const a = makeContact({
      contactId: 'a',
      displayName: 'Alice',
      identifiers: { emails: [], phones: [], telegramUsername: 'AliceBot' },
    })
    const b = makeContact({
      contactId: 'b',
      displayName: 'A. Smith',
      identifiers: { emails: [], phones: [], telegramUsername: 'alicebot' },
    })
    const result = compareContacts(a, b)
    expect(result).not.toBeNull()
    expect(result!.reasons[0].type).toBe('telegram_match')
  })

  it('detects high name similarity', () => {
    const a = makeContact({
      contactId: 'a',
      displayName: 'Jonathan Smith',
      identifiers: { emails: [], phones: [] },
    })
    const b = makeContact({
      contactId: 'b',
      displayName: 'Jonathan Smyth',
      identifiers: { emails: [], phones: [] },
    })
    const result = compareContacts(a, b)
    expect(result).not.toBeNull()
    expect(result!.reasons.some((r) => r.type === 'name_similar')).toBe(true)
  })

  it('detects name+company compound match', () => {
    const a = makeContact({
      contactId: 'a',
      displayName: 'John Smith',
      company: 'Acme Corp',
      identifiers: { emails: [], phones: [] },
    })
    const b = makeContact({
      contactId: 'b',
      displayName: 'Jon Smith',
      company: 'Acme Corp',
      identifiers: { emails: [], phones: [] },
    })
    const result = compareContacts(a, b)
    expect(result).not.toBeNull()
    expect(result!.reasons.some((r) => r.type === 'name_and_company')).toBe(true)
  })

  it('detects first+last name match when displayName differs', () => {
    const a = makeContact({
      contactId: 'a',
      displayName: 'Dr. Jonathan Smith',
      firstName: 'Jonathan',
      lastName: 'Smith',
      identifiers: { emails: [], phones: [] },
    })
    const b = makeContact({
      contactId: 'b',
      displayName: 'Jonathan B. Smith',
      firstName: 'Jonathan',
      lastName: 'Smith',
      identifiers: { emails: [], phones: [] },
    })
    const result = compareContacts(a, b)
    expect(result).not.toBeNull()
    expect(result!.reasons.some((r) => r.type === 'name_similar')).toBe(true)
  })

  it('returns null for dissimilar contacts', () => {
    const a = makeContact({
      contactId: 'a',
      displayName: 'Alice Johnson',
      identifiers: { emails: ['alice@example.com'], phones: [] },
    })
    const b = makeContact({
      contactId: 'b',
      displayName: 'Bob Williams',
      identifiers: { emails: ['bob@other.com'], phones: [] },
    })
    const result = compareContacts(a, b)
    expect(result).toBeNull()
  })

  it('does not match a contact with itself', () => {
    const a = makeContact({
      contactId: 'same-id',
      displayName: 'Alice',
      identifiers: { emails: ['alice@example.com'], phones: [] },
    })
    const result = compareContacts(a, a)
    expect(result).toBeNull()
  })

  it('stacks scores for multiple matching reasons', () => {
    const a = makeContact({
      contactId: 'a',
      displayName: 'Alice Smith',
      identifiers: {
        emails: ['alice@example.com'],
        phones: ['+15551234567'],
        linkedinSlug: 'alice-smith',
      },
    })
    const b = makeContact({
      contactId: 'b',
      displayName: 'Alice Smith',
      identifiers: {
        emails: ['alice@example.com'],
        phones: ['+15551234567'],
        linkedinSlug: 'alice-smith',
      },
    })
    const result = compareContacts(a, b)
    expect(result).not.toBeNull()
    // 95 (email) + 5 (phone bonus) + 5 (linkedin bonus) + 5 (name bonus) = capped at 100
    expect(result!.score).toBe(100)
    expect(result!.reasons.length).toBeGreaterThanOrEqual(3)
  })
})
