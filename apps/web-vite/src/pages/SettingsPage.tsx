/**
 * @fileoverview Settings Page - Quote Management Interface with Table View
 *
 * This component provides a comprehensive table-based UI for managing daily inspirational quotes.
 * Users can view, add, edit, delete quotes with pagination and sorting.
 *
 * **Key Features:**
 * - Table view with 3 columns: Quote, Author, Date Added
 * - Sortable columns (alphabetical for quote/author, chronological for date)
 * - Pagination (50 quotes per page, lazy loading)
 * - Add new quotes with validation (500 char text, 100 char author)
 * - Delete quotes with inline delete button
 * - Total quote count display
 * - Empty author support (shows as blank/empty string)
 *
 * **State Management:**
 * - `quotes`: Current page of quotes
 * - `total`: Total number of quotes
 * - `page`: Current page number (0-indexed)
 * - `sortBy`: Current sort column
 * - `sortOrder`: Current sort direction
 * - `loading`: Load state
 * - `error`: Error message
 *
 * @component SettingsPage
 * @location /settings route
 */

declare const confirm: (message: string) => boolean

import type { Quote } from '@lifeos/core'
import { getDefaultQuotes } from '@lifeos/core'
import { useState, useEffect, useCallback } from 'react'
import {
  createFirestoreQuoteRepository,
  type SortBy,
  type SortOrder,
} from '@/adapters/firestoreQuoteRepository'
import { useAuth } from '@/hooks/useAuth'
import { SystemStatus } from '@/components/SystemStatus'
import { CalendarSettingsPanel } from '@/components/CalendarSettingsPanel'

const quoteRepository = createFirestoreQuoteRepository()
const QUOTES_PER_PAGE = 50

export function SettingsPage() {
  const { user } = useAuth()
  const userId = user?.uid ?? ''

  const [quotes, setQuotes] = useState<Quote[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [sortBy, setSortBy] = useState<SortBy>('addedAt')
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc')
  const [loading, setLoading] = useState(true)
  const [isAddingNew, setIsAddingNew] = useState(false)
  const [newQuoteText, setNewQuoteText] = useState('')
  const [newQuoteAuthor, setNewQuoteAuthor] = useState('')
  const [error, setError] = useState<string | null>(null)

  // Load quotes for current page
  const loadQuotes = useCallback(async () => {
    try {
      setLoading(true)
      const offset = page * QUOTES_PER_PAGE

      const result = await quoteRepository.getQuotesPaginated(
        userId,
        QUOTES_PER_PAGE,
        offset,
        sortBy,
        sortOrder
      )

      // If no custom quotes at all, use defaults
      if (result.total === 0 && page === 0) {
        const defaults = getDefaultQuotes()
        await quoteRepository.saveQuotes(userId, defaults)
        // Reload after saving defaults
        const newResult = await quoteRepository.getQuotesPaginated(
          userId,
          QUOTES_PER_PAGE,
          0,
          sortBy,
          sortOrder
        )
        setQuotes(newResult.quotes)
        setTotal(newResult.total)
      } else {
        setQuotes(result.quotes)
        setTotal(result.total)
      }

      setError(null)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [userId, page, sortBy, sortOrder])

  // Load quotes on mount and when dependencies change
  useEffect(() => {
    // Only load if we have a valid userId (not empty string)
    if (userId && userId.trim().length > 0) {
      void loadQuotes()
    }
  }, [userId, loadQuotes])

  // Handle sort column click
  const handleSort = useCallback(
    (column: SortBy) => {
      if (sortBy === column) {
        // Toggle order if same column
        setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))
      } else {
        // New column, default to ascending for text/author, descending for date
        setSortBy(column)
        setSortOrder(column === 'addedAt' ? 'desc' : 'asc')
      }
      setPage(0) // Reset to first page
    },
    [sortBy]
  )

  // Handle page change
  const handlePageChange = useCallback((newPage: number) => {
    setPage(newPage)
  }, [])

  // Handle delete
  const handleDelete = useCallback(
    async (quoteId: string) => {
      if (!confirm('Are you sure you want to delete this quote?')) return

      try {
        await quoteRepository.deleteQuote(userId, quoteId)

        // Reload current page
        await loadQuotes()

        setError(null)
      } catch (err) {
        setError((err as Error).message)
      }
    },
    [userId, loadQuotes]
  )

  // Start adding new quote
  const handleStartAdd = useCallback(() => {
    setIsAddingNew(true)
    setNewQuoteText('')
    setNewQuoteAuthor('')
  }, [])

  // Cancel adding new quote
  const handleCancelAdd = useCallback(() => {
    setIsAddingNew(false)
    setNewQuoteText('')
    setNewQuoteAuthor('')
  }, [])

  // Save new quote
  const handleSaveNew = useCallback(async () => {
    if (!newQuoteText.trim()) {
      setError('Quote text is required')
      return
    }

    if (total >= 1000) {
      setError('Maximum of 1000 quotes reached')
      return
    }

    try {
      await quoteRepository.addQuote(userId, {
        text: newQuoteText.trim(),
        author: newQuoteAuthor.trim(),
      })

      setIsAddingNew(false)
      setNewQuoteText('')
      setNewQuoteAuthor('')
      setPage(0) // Go to first page to see new quote
      await loadQuotes()
      setError(null)
    } catch (err) {
      setError((err as Error).message)
    }
  }, [newQuoteText, newQuoteAuthor, total, userId, loadQuotes])

  // Reset to defaults
  const handleResetToDefaults = useCallback(async () => {
    if (!confirm('Reset to default quotes? This will delete all your custom quotes.')) return

    try {
      const defaults = getDefaultQuotes()
      await quoteRepository.saveQuotes(userId, defaults)
      setPage(0)
      await loadQuotes()
      setError(null)
    } catch (err) {
      setError((err as Error).message)
    }
  }, [userId, loadQuotes])

  const totalPages = Math.ceil(total / QUOTES_PER_PAGE)
  const hasMore = page < totalPages - 1

  return (
    <div className="settings-page">
      <header className="settings-header">
        <div>
          <p className="section-label">Settings</p>
          <h1>Settings</h1>
          <p className="settings-meta">Configure calendar sync and manage daily quotes.</p>
        </div>
        <div className="settings-actions">
          <button className="ghost-button" onClick={handleResetToDefaults} disabled={loading}>
            Reset to Defaults
          </button>
          <button
            className="primary-button"
            onClick={handleStartAdd}
            disabled={loading || total >= 1000 || isAddingNew}
          >
            + Add Quote
          </button>
        </div>
      </header>

      {error && (
        <div className="error-banner">
          <span>⚠ {error}</span>
          <button onClick={() => setError(null)}>✕</button>
        </div>
      )}

      <SystemStatus />

      <div className="settings-content">
        <CalendarSettingsPanel />
        {loading && page === 0 ? (
          <div className="settings-loading">
            <p>Loading quotes...</p>
          </div>
        ) : (
          <>
            {/* Add new quote form */}
            {isAddingNew && (
              <div className="quote-add-form">
                <h3>Add New Quote</h3>
                <div className="form-group">
                  <label htmlFor="new-quote-text">Quote Text *</label>
                  <textarea
                    id="new-quote-text"
                    className="quote-textarea"
                    value={newQuoteText}
                    onChange={(e) => setNewQuoteText(e.target.value)}
                    placeholder="Enter quote text..."
                    rows={3}
                    maxLength={500}
                    autoFocus
                  />
                  <span className="char-count">{newQuoteText.length}/500</span>
                </div>
                <div className="form-group">
                  <label htmlFor="new-quote-author">Author (optional)</label>
                  <input
                    type="text"
                    id="new-quote-author"
                    className="quote-input"
                    value={newQuoteAuthor}
                    onChange={(e) => setNewQuoteAuthor(e.target.value)}
                    placeholder="Author name (leave blank if unknown)..."
                    maxLength={100}
                  />
                </div>
                <div className="form-actions">
                  <button className="ghost-button" onClick={handleCancelAdd}>
                    Cancel
                  </button>
                  <button
                    className="primary-button"
                    onClick={handleSaveNew}
                    disabled={!newQuoteText.trim()}
                  >
                    Save Quote
                  </button>
                </div>
              </div>
            )}

            {/* Quotes table */}
            {total === 0 ? (
              <div className="empty-state">
                <p>No quotes yet. Add your first inspirational quote!</p>
              </div>
            ) : (
              <>
                <div className="quotes-table-container">
                  <table className="quotes-table">
                    <thead>
                      <tr>
                        <th
                          className={`sortable ${sortBy === 'text' ? 'sorted-' + sortOrder : ''}`}
                          onClick={() => handleSort('text')}
                          title={`Sort by quote ${sortBy === 'text' ? (sortOrder === 'asc' ? 'Z-A' : 'A-Z') : 'A-Z'}`}
                        >
                          Quote
                          {sortBy === 'text' ? (
                            <span className="sort-indicator">
                              {sortOrder === 'asc' ? ' (A-Z)' : ' (Z-A)'}
                            </span>
                          ) : (
                            <span className="sort-indicator" style={{ opacity: 0.4 }}>
                              {' '}
                              ⇅
                            </span>
                          )}
                        </th>
                        <th
                          className={`sortable ${sortBy === 'author' ? 'sorted-' + sortOrder : ''}`}
                          onClick={() => handleSort('author')}
                          title={`Sort by author ${sortBy === 'author' ? (sortOrder === 'asc' ? 'Z-A' : 'A-Z') : 'A-Z'}`}
                        >
                          Author
                          {sortBy === 'author' ? (
                            <span className="sort-indicator">
                              {sortOrder === 'asc' ? ' (A-Z)' : ' (Z-A)'}
                            </span>
                          ) : (
                            <span className="sort-indicator" style={{ opacity: 0.4 }}>
                              {' '}
                              ⇅
                            </span>
                          )}
                        </th>
                        <th
                          className={`sortable ${sortBy === 'addedAt' ? 'sorted-' + sortOrder : ''}`}
                          onClick={() => handleSort('addedAt')}
                          title={`Sort by date ${sortBy === 'addedAt' ? (sortOrder === 'asc' ? 'oldest first' : 'newest first') : 'newest first'}`}
                        >
                          Date Added
                          {sortBy === 'addedAt' ? (
                            <span className="sort-indicator">
                              {sortOrder === 'asc' ? ' ↑' : ' ↓'}
                            </span>
                          ) : (
                            <span className="sort-indicator" style={{ opacity: 0.4 }}>
                              {' '}
                              ⇅
                            </span>
                          )}
                        </th>
                        <th className="actions-column">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {quotes.map((quote) => (
                        <tr key={quote.id}>
                          <td className="quote-text-cell">&ldquo;{quote.text}&rdquo;</td>
                          <td className="quote-author-cell">
                            {quote.author || <em className="empty-author">(empty)</em>}
                          </td>
                          <td className="quote-date-cell">{quote.addedAt}</td>
                          <td className="quote-actions-cell">
                            <button
                              className="delete-button"
                              onClick={() => handleDelete(quote.id)}
                              title="Delete quote"
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="pagination">
                    <button
                      className="ghost-button"
                      onClick={() => handlePageChange(page - 1)}
                      disabled={page === 0 || loading}
                    >
                      ← Previous
                    </button>
                    <span className="page-info">
                      Page {page + 1} of {totalPages} ({total} total quotes)
                    </span>
                    <button
                      className="ghost-button"
                      onClick={() => handlePageChange(page + 1)}
                      disabled={!hasMore || loading}
                    >
                      Next →
                    </button>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
