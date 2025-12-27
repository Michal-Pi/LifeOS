/**
 * @fileoverview Firestore repository implementation for quote persistence.
 *
 * This module provides the data access layer for the quote management system,
 * handling all interactions with Firestore. It implements the Repository pattern
 * to abstract database operations from business logic.
 *
 * **Architecture:**
 * - Collection: `quotes`
 * - Document ID: `{userId}` (e.g., "demo-user")
 * - Document Structure: QuoteCollection (contains array of quotes)
 *
 * **Key Features:**
 * - Lazy-loaded Firebase client (prevents build-time errors)
 * - CRUD operations for quotes
 * - Automatic order management
 * - 1,000 quote limit enforcement
 * - Optimistic updates on client side
 *
 * **Design Decisions:**
 * - Single document per user (efficient for <1MB data)
 * - All quotes in array (simpler than subcollection)
 * - Order field maintained automatically
 * - Atomic updates using setDoc
 *
 * @module adapters/firestoreQuoteRepository
 */

import type { Quote, QuoteCollection } from '@lifeos/core'
import { collection, doc, getDoc, setDoc } from 'firebase/firestore'
import { getFirestoreClient as getDb } from '@/lib/firestoreClient'

/**
 * Formats an ISO date string to DD:MM:YY HH:MM format.
 *
 * @param {string} isoDate - ISO 8601 date string
 * @returns {string} Formatted date string
 *
 * @example
 * ```typescript
 * formatAddedAt('2024-12-20T15:30:00.000Z') // '20:12:24 15:30'
 * ```
 */
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
 * Repository interface for quote data access operations.
 *
 * This interface defines all database operations for the quote system.
 * It follows the Repository pattern to decouple business logic from
 * data persistence concerns.
 *
 * **Implementation Notes:**
 * - All methods are async (return Promises)
 * - Errors are thrown and should be caught by callers
 * - Order management is handled automatically
 * - 1,000 quote limit enforced in addQuote
 *
 * @interface QuoteRepository
 */
export type SortBy = 'text' | 'author' | 'addedAt'
export type SortOrder = 'asc' | 'desc'

export interface PaginatedQuotes {
  quotes: Quote[]
  total: number
  hasMore: boolean
}

export interface QuoteRepository {
  /**
   * Retrieves all quotes for a specific user from Firestore.
   *
   * @param {string} userId - The ID of the user whose quotes to retrieve
   * @returns {Promise<Quote[]>} Array of quotes, or empty array if none exist
   * @throws {Error} If Firestore read fails
   *
   * @example
   * ```typescript
   * const quotes = await repository.getQuotes('user-123')
   * console.log(quotes.length) // Number of quotes user has
   * ```
   */
  getQuotes(userId: string): Promise<Quote[]>

  /**
   * Retrieves a paginated list of quotes with sorting.
   *
   * @param {string} userId - The ID of the user whose quotes to retrieve
   * @param {number} limit - Number of quotes per page (default: 50)
   * @param {number} offset - Number of quotes to skip (default: 0)
   * @param {SortBy} sortBy - Field to sort by (default: 'addedAt')
   * @param {SortOrder} sortOrder - Sort direction (default: 'desc')
   * @returns {Promise<PaginatedQuotes>} Paginated quotes with metadata
   * @throws {Error} If Firestore read fails
   */
  getQuotesPaginated(
    userId: string,
    limit?: number,
    offset?: number,
    sortBy?: SortBy,
    sortOrder?: SortOrder
  ): Promise<PaginatedQuotes>

  /**
   * Replaces the entire quote collection for a user.
   *
   * **Warning:** This overwrites all existing quotes!
   * Used internally by other methods. Use addQuote/updateQuote/deleteQuote for single operations.
   *
   * @param {string} userId - The ID of the user
   * @param {Quote[]} quotes - Complete array of quotes to save
   * @returns {Promise<void>} Resolves when save is complete
   * @throws {Error} If Firestore write fails
   *
   * @example
   * ```typescript
   * const defaults = getDefaultQuotes()
   * await repository.saveQuotes('user-123', defaults)
   * ```
   */
  saveQuotes(userId: string, quotes: Quote[]): Promise<void>

  /**
   * Adds a new quote to the user's collection.
   *
   * **Process:**
   * 1. Fetches existing quotes
   * 2. Validates count (<1000)
   * 3. Generates ID and timestamps
   * 4. Sets order to end of list
   * 5. Saves updated collection
   *
   * @param {string} userId - The ID of the user
   * @param {Omit<Quote, 'id' | 'createdAt' | 'updatedAt' | 'order' | 'addedAt'>} quote - Quote text and author only
   * @returns {Promise<Quote>} The complete quote object with generated fields
   * @throws {Error} If maximum of 1000 quotes reached or Firestore write fails
   *
   * @example
   * ```typescript
   * const newQuote = await repository.addQuote('user-123', {
   *   text: 'Stay hungry, stay foolish.',
   *   author: 'Steve Jobs'
   * })
   * console.log(newQuote.id) // 'quote-1234567890-abc123'
   * console.log(newQuote.order) // 5 (if user had 5 quotes)
   * ```
   */
  addQuote(
    userId: string,
    quote: Omit<Quote, 'id' | 'createdAt' | 'updatedAt' | 'order' | 'addedAt'>
  ): Promise<Quote>

  /**
   * Updates the text and/or author of an existing quote.
   *
   * **Process:**
   * 1. Fetches existing quotes
   * 2. Finds quote by ID
   * 3. Applies updates
   * 4. Updates timestamp
   * 5. Saves collection
   *
   * @param {string} userId - The ID of the user
   * @param {string} quoteId - The ID of the quote to update
   * @param {Partial<Pick<Quote, 'text' | 'author'>>} updates - Fields to update
   * @returns {Promise<void>} Resolves when update is complete
   * @throws {Error} If quote not found or Firestore write fails
   *
   * @example
   * ```typescript
   * await repository.updateQuote('user-123', 'quote-456', {
   *   text: 'Updated quote text',
   *   author: 'New Author'
   * })
   * ```
   */
  updateQuote(
    userId: string,
    quoteId: string,
    updates: Partial<Pick<Quote, 'text' | 'author'>>
  ): Promise<void>

  /**
   * Deletes a quote from the user's collection.
   *
   * **Process:**
   * 1. Fetches existing quotes
   * 2. Filters out the quote with matching ID
   * 3. Reorders remaining quotes (0, 1, 2, ...)
   * 4. Saves updated collection
   *
   * **Important:** Order numbers are recalculated to maintain sequential ordering.
   *
   * @param {string} userId - The ID of the user
   * @param {string} quoteId - The ID of the quote to delete
   * @returns {Promise<void>} Resolves when deletion is complete
   * @throws {Error} If Firestore write fails
   *
   * @example
   * ```typescript
   * await repository.deleteQuote('user-123', 'quote-456')
   * // Quote is removed, remaining quotes reordered: 0, 1, 2, ...
   * ```
   */
  deleteQuote(userId: string, quoteId: string): Promise<void>

  /**
   * Reorders quotes based on a new array of quote IDs.
   *
   * **Use Case:** Drag-and-drop reordering in UI (future feature)
   *
   * **Process:**
   * 1. Fetches existing quotes
   * 2. Reorders based on ID array sequence
   * 3. Updates order field for each (0, 1, 2, ...)
   * 4. Saves collection
   *
   * @param {string} userId - The ID of the user
   * @param {string[]} quoteIds - Array of quote IDs in desired order
   * @returns {Promise<void>} Resolves when reordering is complete
   * @throws {Error} If Firestore write fails
   *
   * @example
   * ```typescript
   * // Move quote-3 to first position
   * await repository.reorderQuotes('user-123', [
   *   'quote-3',
   *   'quote-1',
   *   'quote-2'
   * ])
   * ```
   */
  reorderQuotes(userId: string, quoteIds: string[]): Promise<void>
}

/**
 * Creates and returns a Firestore-backed quote repository instance.
 *
 * This is a factory function that creates a repository implementation
 * following the Repository pattern. It returns an object with methods
 * for all quote CRUD operations.
 *
 * **Usage Pattern:**
 * ```typescript
 * const repository = createFirestoreQuoteRepository()
 * const quotes = await repository.getQuotes('user-123')
 * ```
 *
 * **Implementation Details:**
 * - Uses lazy-loaded Firestore client (via getDb())
 * - All methods are async
 * - Errors propagate to callers
 * - Order management is automatic
 *
 * @returns {QuoteRepository} Repository instance with CRUD methods
 *
 * @example
 * ```typescript
 * const repo = createFirestoreQuoteRepository()
 *
 * // Get quotes
 * const quotes = await repo.getQuotes('user-123')
 *
 * // Add quote
 * const newQuote = await repo.addQuote('user-123', {
 *   text: 'Stay hungry',
 *   author: 'Steve Jobs'
 * })
 *
 * // Update quote
 * await repo.updateQuote('user-123', newQuote.id, {
 *   text: 'Stay hungry, stay foolish.'
 * })
 * ```
 */
export function createFirestoreQuoteRepository(): QuoteRepository {
  return {
    /**
     * Implementation of getQuotes() - fetches all quotes for a user.
     * Returns empty array if user has no quote document yet.
     */
    async getQuotes(userId: string): Promise<Quote[]> {
      const db = await getDb()
      const quotesRef = doc(collection(db, 'quotes'), userId)
      const snapshot = await getDoc(quotesRef)

      // Return empty array if document doesn't exist
      if (!snapshot.exists()) {
        return []
      }

      const data = snapshot.data() as QuoteCollection
      const quotes = data.quotes || []

      // Migrate quotes that don't have addedAt field
      let needsMigration = false
      const migratedQuotes = quotes.map((quote) => {
        if (!quote.addedAt) {
          needsMigration = true
          return {
            ...quote,
            addedAt: formatAddedAt(quote.createdAt),
            author: quote.author || '', // Ensure author is never undefined
          }
        }
        return quote
      })

      // Save migrated quotes back to Firestore
      if (needsMigration) {
        await this.saveQuotes(userId, migratedQuotes)
      }

      return migratedQuotes
    },

    /**
     * Implementation of saveQuotes() - overwrites entire quote collection.
     * Creates or replaces the user's quote document in Firestore.
     */
    async saveQuotes(userId: string, quotes: Quote[]): Promise<void> {
      const db = await getDb()
      const quotesRef = doc(collection(db, 'quotes'), userId)

      const quoteCollection: QuoteCollection = {
        userId,
        quotes,
        updatedAt: new Date().toISOString(),
      }

      // setDoc overwrites the entire document
      await setDoc(quotesRef, quoteCollection)
    },

    /**
     * Implementation of addQuote() - adds a new quote to collection.
     *
     * Process:
     * 1. Fetches existing quotes
     * 2. Validates count (throws if >= 1000)
     * 3. Generates unique ID using timestamp + random string
     * 4. Sets createdAt, updatedAt, and order fields
     * 5. Appends to array and saves
     */
    async getQuotesPaginated(
      userId: string,
      limit: number = 50,
      offset: number = 0,
      sortBy: SortBy = 'addedAt',
      sortOrder: SortOrder = 'desc'
    ): Promise<PaginatedQuotes> {
      const allQuotes = await this.getQuotes(userId)

      // Sort quotes based on criteria
      const sorted = [...allQuotes].sort((a, b) => {
        let comparison = 0

        if (sortBy === 'text') {
          comparison = a.text.localeCompare(b.text)
        } else if (sortBy === 'author') {
          comparison = a.author.localeCompare(b.author)
        } else if (sortBy === 'addedAt') {
          // Sort by createdAt timestamp (newest first by default)
          comparison = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        }

        return sortOrder === 'asc' ? comparison : -comparison
      })

      // Apply pagination
      const paginated = sorted.slice(offset, offset + limit)

      return {
        quotes: paginated,
        total: allQuotes.length,
        hasMore: offset + limit < allQuotes.length,
      }
    },

    async addQuote(
      userId: string,
      quote: Omit<Quote, 'id' | 'createdAt' | 'updatedAt' | 'order' | 'addedAt'>
    ): Promise<Quote> {
      const existingQuotes = await this.getQuotes(userId)

      // Enforce 1,000 quote maximum
      if (existingQuotes.length >= 1000) {
        throw new Error('Maximum of 1000 quotes reached')
      }

      const now = new Date().toISOString()
      const newQuote: Quote = {
        ...quote,
        // Generate unique ID: quote-{timestamp}-{random}
        id: `quote-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
        createdAt: now,
        updatedAt: now,
        addedAt: formatAddedAt(now),
        // Set order to end of list
        order: existingQuotes.length,
      }

      const updatedQuotes = [...existingQuotes, newQuote]
      await this.saveQuotes(userId, updatedQuotes)

      return newQuote
    },

    /**
     * Implementation of updateQuote() - modifies text/author of existing quote.
     *
     * Process:
     * 1. Fetches existing quotes
     * 2. Finds quote by ID (throws if not found)
     * 3. Applies partial updates
     * 4. Updates updatedAt timestamp
     * 5. Saves modified collection
     */
    async updateQuote(
      userId: string,
      quoteId: string,
      updates: Partial<Pick<Quote, 'text' | 'author'>>
    ): Promise<void> {
      const existingQuotes = await this.getQuotes(userId)
      const quoteIndex = existingQuotes.findIndex((q) => q.id === quoteId)

      if (quoteIndex === -1) {
        throw new Error('Quote not found')
      }

      // Create new array with updated quote
      const updatedQuotes = [...existingQuotes]
      updatedQuotes[quoteIndex] = {
        ...updatedQuotes[quoteIndex],
        ...updates,
        updatedAt: new Date().toISOString(),
      }

      await this.saveQuotes(userId, updatedQuotes)
    },

    /**
     * Implementation of deleteQuote() - removes quote from collection.
     *
     * Process:
     * 1. Fetches existing quotes
     * 2. Filters out quote with matching ID
     * 3. Reorders remaining quotes (0, 1, 2, ...)
     * 4. Saves updated collection
     *
     * Note: Order is recalculated to maintain sequential numbering
     */
    async deleteQuote(userId: string, quoteId: string): Promise<void> {
      const existingQuotes = await this.getQuotes(userId)
      const updatedQuotes = existingQuotes.filter((q) => q.id !== quoteId)

      // Recalculate order for remaining quotes to maintain sequence
      updatedQuotes.forEach((quote, index) => {
        quote.order = index
      })

      await this.saveQuotes(userId, updatedQuotes)
    },

    /**
     * Implementation of reorderQuotes() - changes quote ordering.
     *
     * Process:
     * 1. Fetches existing quotes
     * 2. Creates ID-to-quote map for O(1) lookup
     * 3. Reorders based on provided ID array
     * 4. Updates order field and timestamp
     * 5. Saves reordered collection
     *
     * Note: Currently not used in UI but available for future drag-and-drop
     */
    async reorderQuotes(userId: string, quoteIds: string[]): Promise<void> {
      const existingQuotes = await this.getQuotes(userId)

      // Create map for efficient lookup: { quoteId -> Quote }
      const quoteMap = new Map(existingQuotes.map((q) => [q.id, q]))

      // Reorder based on provided ID sequence
      const reorderedQuotes = quoteIds
        .map((id) => quoteMap.get(id))
        .filter((q): q is Quote => q !== undefined) // Remove any invalid IDs
        .map((quote, index) => ({
          ...quote,
          order: index, // Assign new sequential order
          updatedAt: new Date().toISOString(),
        }))

      await this.saveQuotes(userId, reorderedQuotes)
    },
  }
}
