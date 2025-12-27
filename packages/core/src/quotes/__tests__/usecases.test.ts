/**
 * @fileoverview Unit tests for quote use cases
 *
 * Tests cover:
 * - Default quote generation
 * - Deterministic quote selection algorithm
 * - Edge cases (empty arrays, different dates)
 * - Day of year calculation
 */

import { describe, it, expect } from 'vitest'
import type { Quote } from '../types'
import { getDefaultQuotes, getQuoteForDate, getDayOfYear } from '../usecases'

describe('getDefaultQuotes', () => {
  it('should return exactly 5 default quotes', () => {
    const defaults = getDefaultQuotes()
    expect(defaults).toHaveLength(5)
  })

  it('should return quotes with all required fields', () => {
    const defaults = getDefaultQuotes()

    defaults.forEach((quote) => {
      expect(quote).toHaveProperty('id')
      expect(quote).toHaveProperty('text')
      expect(quote).toHaveProperty('author')
      expect(quote).toHaveProperty('createdAt')
      expect(quote).toHaveProperty('updatedAt')
      expect(quote).toHaveProperty('order')

      // Verify types
      expect(typeof quote.id).toBe('string')
      expect(typeof quote.text).toBe('string')
      expect(typeof quote.author).toBe('string')
      expect(typeof quote.createdAt).toBe('string')
      expect(typeof quote.updatedAt).toBe('string')
      expect(typeof quote.order).toBe('number')
    })
  })

  it('should have sequential order starting from 0', () => {
    const defaults = getDefaultQuotes()

    defaults.forEach((quote, index) => {
      expect(quote.order).toBe(index)
    })
  })

  it('should have IDs starting with "default-"', () => {
    const defaults = getDefaultQuotes()

    defaults.forEach((quote) => {
      expect(quote.id).toMatch(/^default-\d+$/)
    })
  })

  it('should have non-empty text and author', () => {
    const defaults = getDefaultQuotes()

    defaults.forEach((quote) => {
      expect(quote.text.length).toBeGreaterThan(0)
      expect(quote.author.length).toBeGreaterThan(0)
    })
  })

  it('should have valid ISO 8601 timestamps', () => {
    const defaults = getDefaultQuotes()

    defaults.forEach((quote) => {
      // Check if timestamp is valid
      const createdDate = new Date(quote.createdAt)
      const updatedDate = new Date(quote.updatedAt)

      expect(createdDate).toBeInstanceOf(Date)
      expect(updatedDate).toBeInstanceOf(Date)
      expect(createdDate.toString()).not.toBe('Invalid Date')
      expect(updatedDate.toString()).not.toBe('Invalid Date')
    })
  })
})

describe('getQuoteForDate', () => {
  describe('deterministic selection', () => {
    it('should return the same quote for the same date', () => {
      const quotes = getDefaultQuotes()
      const date = '2024-12-20'

      const quote1 = getQuoteForDate(quotes, date)
      const quote2 = getQuoteForDate(quotes, date)

      expect(quote1.id).toBe(quote2.id)
      expect(quote1).toEqual(quote2)
    })

    it('should return different quotes for different dates (usually)', () => {
      const quotes = getDefaultQuotes()
      const date1 = '2024-12-20'
      const date2 = '2024-12-21'

      const quote1 = getQuoteForDate(quotes, date1)
      const quote2 = getQuoteForDate(quotes, date2)

      // With 5 quotes, different consecutive dates will likely give different quotes
      // Note: This isn't guaranteed due to modulo, but very likely
      expect(quote1.id).not.toBe(quote2.id)
    })

    it('should handle year changes correctly', () => {
      const quotes = getDefaultQuotes()
      const date1 = '2024-12-31'
      const date2 = '2025-01-01'

      const quote1 = getQuoteForDate(quotes, date1)
      const quote2 = getQuoteForDate(quotes, date2)

      // Each should be deterministic
      expect(getQuoteForDate(quotes, date1).id).toBe(quote1.id)
      expect(getQuoteForDate(quotes, date2).id).toBe(quote2.id)
    })
  })

  describe('algorithm correctness', () => {
    it('should use modulo to select from array', () => {
      const quotes = getDefaultQuotes() // 5 quotes
      const date = '2024-12-20' // Becomes 20241220

      const dateSeed = parseInt(date.replace(/-/g, ''), 10)
      const expectedIndex = dateSeed % quotes.length
      const expectedQuote = quotes[expectedIndex]

      const actualQuote = getQuoteForDate(quotes, date)

      expect(actualQuote.id).toBe(expectedQuote.id)
    })

    it('should handle single quote array', () => {
      const now = new Date().toISOString()
      const singleQuote: Quote[] = [
        {
          id: 'only-1',
          text: 'The only quote',
          author: 'Test Author',
          createdAt: now,
          updatedAt: now,
          addedAt: '21:12:24 10:30',
          order: 0,
        },
      ]

      const quote1 = getQuoteForDate(singleQuote, '2024-01-01')
      const quote2 = getQuoteForDate(singleQuote, '2024-12-31')

      // Should always return the same quote
      expect(quote1.id).toBe('only-1')
      expect(quote2.id).toBe('only-1')
    })

    it('should work with large quote arrays', () => {
      // Create 1000 quotes
      const now = new Date().toISOString()
      const manyQuotes: Quote[] = Array.from({ length: 1000 }, (_, i) => ({
        id: `quote-${i}`,
        text: `Quote number ${i}`,
        author: `Author ${i}`,
        createdAt: now,
        updatedAt: now,
        addedAt: '21:12:24 10:30',
        order: i,
      }))

      const date = '2024-12-20'
      const quote = getQuoteForDate(manyQuotes, date)

      // Should return a valid quote from the array
      expect(quote).toBeDefined()
      expect(quote.id).toMatch(/^quote-\d+$/)

      // Should be deterministic
      const quote2 = getQuoteForDate(manyQuotes, date)
      expect(quote.id).toBe(quote2.id)
    })
  })

  describe('edge cases', () => {
    it('should handle empty quote array by returning first default', () => {
      const emptyQuotes: Quote[] = []
      const quote = getQuoteForDate(emptyQuotes, '2024-12-20')

      // Should fall back to first default quote
      const defaults = getDefaultQuotes()
      expect(quote.id).toBe(defaults[0].id)
      expect(quote.text).toBe(defaults[0].text)
    })

    it('should handle leap year dates', () => {
      const quotes = getDefaultQuotes()
      const leapYearDate = '2024-02-29' // 2024 is a leap year

      const quote = getQuoteForDate(quotes, leapYearDate)
      expect(quote).toBeDefined()
      expect(quote.id).toBeDefined()
    })

    it('should handle dates far in the future', () => {
      const quotes = getDefaultQuotes()
      const futureDate = '2099-12-31'

      const quote = getQuoteForDate(quotes, futureDate)
      expect(quote).toBeDefined()

      // Should still be deterministic
      const quote2 = getQuoteForDate(quotes, futureDate)
      expect(quote.id).toBe(quote2.id)
    })

    it('should handle dates far in the past', () => {
      const quotes = getDefaultQuotes()
      const pastDate = '1900-01-01'

      const quote = getQuoteForDate(quotes, pastDate)
      expect(quote).toBeDefined()

      // Should still be deterministic
      const quote2 = getQuoteForDate(quotes, pastDate)
      expect(quote.id).toBe(quote2.id)
    })
  })

  describe('date format handling', () => {
    it('should work with standard YYYY-MM-DD format', () => {
      const quotes = getDefaultQuotes()
      const quote = getQuoteForDate(quotes, '2024-12-20')

      expect(quote).toBeDefined()
      expect(quote.id).toBeDefined()
    })

    it('should handle dates with leading zeros', () => {
      const quotes = getDefaultQuotes()
      const quote1 = getQuoteForDate(quotes, '2024-01-05')
      const quote2 = getQuoteForDate(quotes, '2024-01-05')

      expect(quote1.id).toBe(quote2.id)
    })
  })
})

describe('getDayOfYear', () => {
  it('should return 1 for January 1st', () => {
    expect(getDayOfYear('2024-01-01')).toBe(1)
    expect(getDayOfYear('2025-01-01')).toBe(1)
  })

  it('should return correct day for end of year', () => {
    expect(getDayOfYear('2024-12-31')).toBe(366) // Leap year
    expect(getDayOfYear('2025-12-31')).toBe(365) // Non-leap year
  })

  it('should handle leap years correctly', () => {
    expect(getDayOfYear('2024-02-29')).toBe(60) // 31 (Jan) + 29 (Feb)
    expect(getDayOfYear('2024-03-01')).toBe(61) // Day after leap day
  })

  it('should return consistent values for same date', () => {
    const day1 = getDayOfYear('2024-06-15')
    const day2 = getDayOfYear('2024-06-15')

    expect(day1).toBe(day2)
  })

  it('should return different values for consecutive days', () => {
    const day1 = getDayOfYear('2024-06-15')
    const day2 = getDayOfYear('2024-06-16')

    expect(day2).toBe(day1 + 1)
  })

  it('should handle mid-year dates', () => {
    // July 1 = 31(Jan) + 29(Feb, leap) + 31(Mar) + 30(Apr) + 31(May) + 30(Jun) + 1 = 183
    expect(getDayOfYear('2024-07-01')).toBe(183)
  })
})

describe('integration - deterministic selection across year', () => {
  it('should select quotes consistently throughout the year', () => {
    const quotes = getDefaultQuotes()
    const selectedQuotes: string[] = []

    // Test a full year (365 days)
    for (let month = 1; month <= 12; month++) {
      const daysInMonth = new Date(2024, month, 0).getDate()
      for (let day = 1; day <= daysInMonth; day++) {
        const date = `2024-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
        const quote = getQuoteForDate(quotes, date)
        selectedQuotes.push(quote.id)

        // Verify determinism
        const quote2 = getQuoteForDate(quotes, date)
        expect(quote.id).toBe(quote2.id)
      }
    }

    // Should have 366 selections (2024 is leap year)
    expect(selectedQuotes).toHaveLength(366)

    // All selections should be valid quote IDs
    selectedQuotes.forEach((id) => {
      expect(quotes.some((q) => q.id === id)).toBe(true)
    })
  })

  it('should distribute reasonably across available quotes', () => {
    const quotes = getDefaultQuotes() // 5 quotes
    const distribution = new Map<string, number>()

    // Test 100 different dates
    for (let i = 1; i <= 100; i++) {
      const date = `2024-${String(Math.ceil(i / 10)).padStart(2, '0')}-${String((i % 30) + 1).padStart(2, '0')}`
      const quote = getQuoteForDate(quotes, date)

      distribution.set(quote.id, (distribution.get(quote.id) || 0) + 1)
    }

    // Each quote should be selected at least once
    quotes.forEach((quote) => {
      expect(distribution.get(quote.id)).toBeGreaterThan(0)
    })

    // Distribution should be relatively even (no quote >50% of selections)
    distribution.forEach((count) => {
      expect(count).toBeLessThanOrEqual(50)
    })
  })
})
