/**
 * @fileoverview Quote Management System Types
 *
 * This module defines the core data structures for LifeOS's inspirational quote system.
 * The system provides daily motivational quotes with a unique deterministic selection
 * algorithm that ensures the same quote appears for the same date across all devices.
 *
 * Core Features:
 * - User-managed quote collections (up to 1,000 quotes)
 * - Deterministic daily selection algorithm
 * - Character limits and validation
 * - Real-time sync across devices
 * - Order-based organization for consistent display
 *
 * Deterministic Selection Algorithm:
 * ```typescript
 * const dateSeed = parseInt(date.replace(/-/g, ''), 10)  // "2024-12-20" → 20241220
 * const index = dateSeed % quotes.length                     // Modulo for deterministic selection
 * return quotes[index]                                      // Same date = same quote
 * ```
 *
 * This ensures:
 * - Same quote on same date across all devices
 * - Changes at midnight (date boundary)
 * - Works with any number of quotes (1-1000)
 * - Predictable but not obvious to users
 *
 * @module quotes/types
 */

/**
 * Represents a single inspirational quote in the system.
 *
 * Each quote contains the text, author attribution, and metadata for tracking
 * when it was created, updated, and its position in the user's collection.
 * The order field is crucial for deterministic selection and UI display.
 *
 * @interface Quote
 *
 * @example
 * ```typescript
 * const quote: Quote = {
 *   id: 'quote-1234567890-abc123',
 *   text: 'The secret of getting ahead is getting started.',
 *   author: 'Mark Twain',
 *   createdAt: '2024-12-20T10:30:00.000Z',
 *   updatedAt: '2024-12-20T10:30:00.000Z',
 *   order: 0
 * }
 * ```
 */
export interface Quote {
  /**
   * Unique identifier for the quote.
   * Format: `quote-{timestamp}-{randomString}`
   * @example 'quote-1234567890-abc123'
   */
  id: string

  /**
   * The quote text content.
   * Maximum length: 500 characters
   * @example 'The secret of getting ahead is getting started.'
   */
  text: string

  /**
   * Attribution for the quote (author or source).
   * Maximum length: 100 characters
   * Can be empty string for quotes without known author
   * @example 'Mark Twain' or ''
   */
  author: string

  /**
   * ISO 8601 timestamp of when the quote was added to the collection.
   * @example '2024-12-20T10:30:00.000Z'
   */
  createdAt: string

  /**
   * ISO 8601 timestamp of when the quote was last modified.
   * Updated when text or author changes.
   * @example '2024-12-20T15:45:00.000Z'
   */
  updatedAt: string

  /**
   * Formatted date when the quote was added (DD:MM:YY HH:MM).
   * Used for display in the settings table.
   * @example '20:12:24 15:30'
   */
  addedAt: string

  /**
   * Zero-based position in the user's quote collection.
   * Used for deterministic selection and UI ordering.
   * Range: 0-999 (for max 1000 quotes)
   * @example 0
   */
  order: number
}

/**
 * Represents a user's complete collection of quotes stored in Firestore.
 *
 * This is the top-level document structure stored in the 'quotes' collection.
 * All quotes for a user are stored in a single document (identified by userId)
 * as an array, which is efficient for collections up to 1MB (~1000 quotes).
 *
 * @interface QuoteCollection
 *
 * @example
 * ```typescript
 * const collection: QuoteCollection = {
 *   userId: 'demo-user',
 *   quotes: [
 *     { id: '1', text: '...', author: '...', ... },
 *     { id: '2', text: '...', author: '...', ... }
 *   ],
 *   updatedAt: '2024-12-20T10:30:00.000Z'
 * }
 * ```
 */
export interface QuoteCollection {
  /**
   * The ID of the user who owns this quote collection.
   * Also serves as the Firestore document ID.
   * @example 'demo-user'
   */
  userId: string

  /**
   * Array of all quotes in the user's collection.
   * Maximum: 1000 quotes
   * Quotes are typically sorted by the 'order' field for display.
   * @example [{ id: '1', text: '...', author: '...', ... }]
   */
  quotes: Quote[]

  /**
   * ISO 8601 timestamp of when the collection was last modified.
   * Updated whenever quotes are added, edited, deleted, or reordered.
   * @example '2024-12-20T10:30:00.000Z'
   */
  updatedAt: string
}

/**
 * Represents a quote selected for a specific date.
 *
 * This interface is used when retrieving the daily quote to display.
 * The selection is deterministic based on the date, ensuring consistency
 * across devices and page refreshes.
 *
 * @interface DailyQuote
 *
 * @example
 * ```typescript
 * const dailyQuote: DailyQuote = {
 *   quote: {
 *     id: 'quote-123',
 *     text: 'Do the hard jobs first...',
 *     author: 'Dale Carnegie',
 *     createdAt: '2024-12-20T10:30:00.000Z',
 *     updatedAt: '2024-12-20T10:30:00.000Z',
 *     order: 2
 *   },
 *   date: '2024-12-20'
 * }
 * ```
 */
export interface DailyQuote {
  /**
   * The quote selected for this date.
   * Selected using deterministic algorithm based on date.
   */
  quote: Quote

  /**
   * The date this quote is assigned to.
   * Format: YYYY-MM-DD
   * Same date always returns the same quote.
   * @example '2024-12-20'
   */
  date: string
}
