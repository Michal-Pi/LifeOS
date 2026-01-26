/**
 * @fileoverview Business logic and use cases for quote management.
 *
 * This module contains the core business logic for the quote system, including:
 * - Default quote generation
 * - Deterministic quote selection algorithm
 * - Date-based seeding for consistent daily quotes
 *
 * The key innovation here is the deterministic selection algorithm that ensures
 * the same date always produces the same quote, providing consistency across
 * devices, sessions, and page refreshes.
 *
 * @module quotes/usecases
 */

import type { Quote } from './types.js'

function formatAddedAt(isoDate: string): string {
  const date = new Date(isoDate)
  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const year = String(date.getFullYear()).slice(-2)
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${day}:${month}:${year} ${hours}:${minutes}`
}

/**
 * Returns the default collection of 5 starter quotes.
 *
 * These quotes are used as initial data for new accounts only.
 * They can be removed and replaced by the user through the Settings page.
 * The quotes are Zen/mindfulness themed to align with LifeOS's philosophy.
 *
 * @returns {Quote[]} Array of 5 starter quotes with full metadata
 *
 * @example
 * ```typescript
 * const defaults = getDefaultQuotes()
 * console.log(defaults.length) // 5
 * console.log(defaults[0].author) // 'Shunryu Suzuki'
 * ```
 */
export function getDefaultQuotes(): Quote[] {
  const now = new Date().toISOString()
  return [
    {
      id: 'default-1',
      text: "In the beginner's mind there are many possibilities, but in the expert's there are few.",
      author: 'Shunryu Suzuki',
      createdAt: now,
      updatedAt: now,
      addedAt: formatAddedAt(now),
      order: 0,
    },
    {
      id: 'default-2',
      text: 'Let go of your notions and ideas, and the truth will arise.',
      author: 'Thich Nhat Hanh',
      createdAt: now,
      updatedAt: now,
      addedAt: formatAddedAt(now),
      order: 1,
    },
    {
      id: 'default-3',
      text: 'When I let go of what I am, I become what I might be.',
      author: 'Lao Tzu',
      createdAt: now,
      updatedAt: now,
      addedAt: formatAddedAt(now),
      order: 2,
    },
    {
      id: 'default-4',
      text: 'Flow with whatever may happen, and let your mind be free.',
      author: 'Zhuangzi',
      createdAt: now,
      updatedAt: now,
      addedAt: formatAddedAt(now),
      order: 3,
    },
    {
      id: 'default-5',
      text: "You are the sky. Everything else—it's just the weather.",
      author: 'Pema Chödrön',
      createdAt: now,
      updatedAt: now,
      addedAt: formatAddedAt(now),
      order: 4,
    },
  ]
}

/**
 * Selects a quote for a specific date using deterministic algorithm.
 *
 * **Core Algorithm:**
 * This function implements a deterministic pseudo-random selection that ensures
 * the same date always produces the same quote. It works by:
 * 1. Converting the date string to a numeric seed
 * 2. Using modulo operation to map seed to valid array index
 * 3. Returning the quote at that index
 *
 * **Why Deterministic?**
 * - Consistency: Same quote shows all day, across devices
 * - Predictability: Users see the same quote when revisiting same date
 * - Simplicity: No need to store which quote was shown on which date
 *
 * **Algorithm Explanation:**
 * ```
 * Date: "2024-12-20"
 * Step 1: Remove hyphens → "20241220"
 * Step 2: Parse to integer → 20241220
 * Step 3: Modulo by array length → 20241220 % 10 = 0
 * Step 4: Return quote at index 0
 * ```
 *
 * This ensures:
 * - Different dates get different indices (usually)
 * - Same date always gets same index
 * - Index is always within valid range (0 to length-1)
 *
 * @param {Quote[]} quotes - Array of available quotes to select from
 * @param {string} date - Date in YYYY-MM-DD format (e.g., '2024-12-20')
 * @returns {Quote} The quote selected for this date
 *
 * @example
 * ```typescript
 * const quotes = getDefaultQuotes() // 5 quotes
 * const quote1 = getQuoteForDate(quotes, '2024-12-20')
 * const quote2 = getQuoteForDate(quotes, '2024-12-20')
 * console.log(quote1.id === quote2.id) // true - deterministic!
 *
 * const quote3 = getQuoteForDate(quotes, '2024-12-21')
 * console.log(quote1.id === quote3.id) // false (probably) - different day
 * ```
 *
 * @example
 * ```typescript
 * // Empty array fallback
 * const emptyQuote = getQuoteForDate([], '2024-12-20')
 * console.log(emptyQuote.author) // 'Mark Twain' (first default)
 * ```
 */
export function getQuoteForDate(quotes: Quote[], date: string): Quote {
  // Fallback to defaults if no quotes available
  if (quotes.length === 0) {
    const defaults = getDefaultQuotes()
    return defaults[0]
  }

  // Convert date to numeric seed
  // Example: "2024-12-20" → "20241220" → 20241220
  const dateSeed = parseInt(date.replace(/-/g, ''), 10)

  // Deterministic selection using modulo operation
  // This ensures the same date always returns the same index
  // Example: 20241220 % 10 = 0 (for 10 quotes)
  const index = dateSeed % quotes.length

  return quotes[index]
}

/**
 * Calculates the day of year (1-366) from a date string.
 *
 * **Purpose:**
 * This is an alternative method for generating a seed for quote selection.
 * While currently not used in production, it provides a different distribution
 * pattern that may be useful for future enhancements.
 *
 * **Difference from main algorithm:**
 * - Main algorithm: Uses full date as seed (e.g., 20241220)
 * - This function: Returns day number in year (e.g., 355 for Dec 20)
 *
 * **Trade-offs:**
 * - Main algorithm: Better distribution, won't cycle yearly
 * - Day of year: Simpler, but same day each year gets same quote
 *
 * @param {string} date - Date string in YYYY-MM-DD format
 * @returns {number} Day of year (1-366), where Jan 1 = 1
 *
 * @example
 * ```typescript
 * getDayOfYear('2024-01-01') // Returns: 1
 * getDayOfYear('2024-12-31') // Returns: 366 (leap year)
 * getDayOfYear('2024-12-20') // Returns: 355
 * ```
 *
 * @example
 * ```typescript
 * // Alternative usage for quote selection
 * const quotes = getDefaultQuotes()
 * const dayNum = getDayOfYear('2024-12-20')
 * const quote = quotes[dayNum % quotes.length]
 * ```
 */
export function getDayOfYear(date: string): number {
  const dateObj = new Date(date)
  const start = new Date(dateObj.getFullYear(), 0, 0)
  const diff = dateObj.getTime() - start.getTime()
  const oneDay = 1000 * 60 * 60 * 24
  return Math.floor(diff / oneDay)
}
