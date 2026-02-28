/**
 * @fileoverview Quotes Settings Section
 *
 * Daily quotes CRUD with search, pinning, pagination, and reset-to-defaults.
 * All quote state is self-contained; only userId and onError are passed in.
 */

import type { Quote } from '@lifeos/core'
import { getDefaultQuotes } from '@lifeos/core'
import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  createFirestoreQuoteRepository,
  type SortBy,
  type SortOrder,
} from '@/adapters/firestoreQuoteRepository'
import { EmptyState } from '@/components/EmptyState'
import { Menu, MenuItem } from '@/components/Menu'
import { ConfirmDialog } from '@/components/ConfirmDialog'

const quoteRepository = createFirestoreQuoteRepository()
const QUOTES_PER_PAGE = 50

export interface QuotesSectionProps {
  userId: string
  onError: (message: string) => void
}

export function QuotesSection({ userId, onError }: QuotesSectionProps) {
  const [quotes, setQuotes] = useState<Quote[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const sortBy: SortBy = 'addedAt'
  const sortOrder: SortOrder = 'desc'
  const [loading, setLoading] = useState(true)
  const [isAddingNew, setIsAddingNew] = useState(false)
  const [newQuoteText, setNewQuoteText] = useState('')
  const [newQuoteAuthor, setNewQuoteAuthor] = useState('')
  const [quoteSearch, setQuoteSearch] = useState('')
  const [editingQuoteId, setEditingQuoteId] = useState<string | null>(null)
  const [editQuoteText, setEditQuoteText] = useState('')
  const [editQuoteAuthor, setEditQuoteAuthor] = useState('')
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [deleteQuoteId, setDeleteQuoteId] = useState<string | null>(null)
  const [confirmResetOpen, setConfirmResetOpen] = useState(false)
  const [pinnedQuoteIds, setPinnedQuoteIds] = useState<string[]>([])

  const pinnedStorageKey = userId ? `lifeos:quotes:pinned:${userId}` : 'lifeos:quotes:pinned:anon'

  // Load pinned quote IDs from localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return
    const stored = window.localStorage.getItem(pinnedStorageKey)
    if (!stored) {
      setPinnedQuoteIds([])
      return
    }
    try {
      const parsed = JSON.parse(stored)
      if (Array.isArray(parsed)) {
        setPinnedQuoteIds(parsed.filter((value) => typeof value === 'string'))
      } else {
        setPinnedQuoteIds([])
      }
    } catch {
      setPinnedQuoteIds([])
    }
  }, [pinnedStorageKey])

  const togglePinnedQuote = useCallback(
    (quoteId: string) => {
      setPinnedQuoteIds((prev) => {
        const nextSet = new Set(prev)
        if (nextSet.has(quoteId)) {
          nextSet.delete(quoteId)
        } else {
          nextSet.add(quoteId)
        }
        const next = Array.from(nextSet)
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(pinnedStorageKey, JSON.stringify(next))
        }
        return next
      })
      setOpenMenuId(null)
    },
    [pinnedStorageKey]
  )

  // Close menu on outside click
  useEffect(() => {
    function handleOutside(event: MouseEvent) {
      if (!openMenuId) return
      const target = event.target as HTMLElement
      if (!target.closest('.quote-card__actions')) {
        setOpenMenuId(null)
      }
    }

    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [openMenuId])

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

      if (result.total === 0 && page === 0) {
        const defaults = getDefaultQuotes()
        await quoteRepository.saveQuotes(userId, defaults)
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
    } catch (err) {
      onError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [userId, page, sortBy, sortOrder, onError])

  useEffect(() => {
    if (userId && userId.trim().length > 0) {
      void loadQuotes()
    }
  }, [userId, loadQuotes])

  const handlePageChange = useCallback((newPage: number) => {
    setPage(newPage)
  }, [])

  const handleDeleteRequest = useCallback((quoteId: string) => {
    setDeleteQuoteId(quoteId)
    setOpenMenuId(null)
  }, [])

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteQuoteId) return

    try {
      await quoteRepository.deleteQuote(userId, deleteQuoteId)
      await loadQuotes()
    } catch (err) {
      onError((err as Error).message)
    } finally {
      setDeleteQuoteId(null)
    }
  }, [deleteQuoteId, userId, loadQuotes, onError])

  const handleStartAdd = useCallback(() => {
    setIsAddingNew(true)
    setNewQuoteText('')
    setNewQuoteAuthor('')
  }, [])

  const handleCancelAdd = useCallback(() => {
    setIsAddingNew(false)
    setNewQuoteText('')
    setNewQuoteAuthor('')
  }, [])

  const handleSaveNew = useCallback(async () => {
    if (!newQuoteText.trim()) {
      onError('Quote text is required')
      return
    }

    if (total >= 1000) {
      onError('Maximum of 1000 quotes reached')
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
      setPage(0)
      await loadQuotes()
    } catch (err) {
      onError((err as Error).message)
    }
  }, [newQuoteText, newQuoteAuthor, total, userId, loadQuotes, onError])

  const handleStartEdit = useCallback((quote: Quote) => {
    setEditingQuoteId(quote.id)
    setEditQuoteText(quote.text)
    setEditQuoteAuthor(quote.author)
    setOpenMenuId(null)
  }, [])

  const handleCancelEdit = useCallback(() => {
    setEditingQuoteId(null)
    setEditQuoteText('')
    setEditQuoteAuthor('')
  }, [])

  const handleSaveEdit = useCallback(async () => {
    if (!editingQuoteId) return
    if (!editQuoteText.trim()) {
      onError('Quote text is required')
      return
    }

    try {
      await quoteRepository.updateQuote(userId, editingQuoteId, {
        text: editQuoteText.trim(),
        author: editQuoteAuthor.trim(),
      })
      await loadQuotes()
      handleCancelEdit()
    } catch (err) {
      onError((err as Error).message)
    }
  }, [
    editingQuoteId,
    editQuoteText,
    editQuoteAuthor,
    userId,
    loadQuotes,
    handleCancelEdit,
    onError,
  ])

  const handleResetToDefaults = useCallback(async () => {
    try {
      const defaults = getDefaultQuotes()
      await quoteRepository.saveQuotes(userId, defaults)
      setPage(0)
      await loadQuotes()
    } catch (err) {
      onError((err as Error).message)
    } finally {
      setConfirmResetOpen(false)
    }
  }, [userId, loadQuotes, onError])

  const totalPages = Math.ceil(total / QUOTES_PER_PAGE)
  const hasMore = page < totalPages - 1

  const pinnedSet = useMemo(() => new Set(pinnedQuoteIds), [pinnedQuoteIds])
  const filteredQuotes = useMemo(() => {
    const query = quoteSearch.trim().toLowerCase()
    if (!query) return quotes
    return quotes.filter((quote) => {
      const textMatch = quote.text.toLowerCase().includes(query)
      const authorMatch = quote.author?.toLowerCase().includes(query)
      return textMatch || authorMatch
    })
  }, [quoteSearch, quotes])

  const pinnedQuotes = filteredQuotes.filter((quote) => pinnedSet.has(quote.id))
  const unpinnedQuotes = filteredQuotes.filter((quote) => !pinnedSet.has(quote.id))

  const renderQuoteCard = (quote: Quote, isPinned: boolean) => (
    <article key={quote.id} className="quote-card" title={`Added ${quote.addedAt}`}>
      <div className="quote-card__content">
        <p className="quote-text">"{quote.text}"</p>
        <p className="quote-author">{quote.author ? quote.author : 'Anonymous'}</p>
      </div>
      <div className="quote-card__actions">
        <button
          type="button"
          className="quote-menu-button"
          onClick={() => setOpenMenuId((prev) => (prev === quote.id ? null : quote.id))}
          aria-label="Quote actions"
        >
          &#x22EF;
        </button>
        {openMenuId === quote.id && (
          <Menu>
            <MenuItem onSelect={() => handleStartEdit(quote)}>Edit</MenuItem>
            <MenuItem onSelect={() => togglePinnedQuote(quote.id)}>
              {isPinned ? 'Unpin' : 'Pin'}
            </MenuItem>
            <MenuItem onSelect={() => handleDeleteRequest(quote.id)}>Delete</MenuItem>
          </Menu>
        )}
      </div>
      {editingQuoteId === quote.id && (
        <div className="quote-edit-form">
          <div className="form-group">
            <label htmlFor={`edit-quote-text-${quote.id}`}>Quote</label>
            <textarea
              id={`edit-quote-text-${quote.id}`}
              className="quote-textarea"
              value={editQuoteText}
              onChange={(e) => setEditQuoteText(e.target.value)}
              rows={3}
            />
          </div>
          <div className="form-group">
            <label htmlFor={`edit-quote-author-${quote.id}`}>Author</label>
            <input
              type="text"
              id={`edit-quote-author-${quote.id}`}
              className="quote-input"
              value={editQuoteAuthor}
              onChange={(e) => setEditQuoteAuthor(e.target.value)}
            />
          </div>
          <div className="form-actions">
            <button className="ghost-button" onClick={handleCancelEdit}>
              Cancel
            </button>
            <button className="primary-button" onClick={handleSaveEdit}>
              Save Changes
            </button>
          </div>
        </div>
      )}
    </article>
  )

  return (
    <>
      <section id="quotes">
        <h2 className="settings-section__title">Quotes</h2>
        <p className="settings-section__description">
          Shape the tone of the system with quotes and daily prompts.
        </p>

        <div className="settings-panel">
          <header className="settings-panel__header">
            <div>
              <p className="section-label">Quotes</p>
              <h3>Daily Quotes</h3>
              <p className="settings-panel__meta">
                Keep a small set of quotes that reset focus and intention.
              </p>
            </div>
            <div className="settings-panel__actions">
              <button className="ghost-button" onClick={() => setConfirmResetOpen(true)}>
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

          <div className="quote-controls">
            <input
              type="text"
              className="quote-search"
              placeholder="Search quotes or authors..."
              value={quoteSearch}
              onChange={(e) => setQuoteSearch(e.target.value)}
            />
            <div className="quote-count">
              <span>{total} total</span>
              <span>&bull;</span>
              <span>{pinnedQuotes.length} pinned</span>
            </div>
          </div>

          {loading && page === 0 ? (
            <div className="settings-loading">
              <p>Loading quotes...</p>
            </div>
          ) : total === 0 ? (
            <EmptyState
              label="Quotes"
              title="System idle"
              description="Quotes shape the tone of your day. Add one to guide focus and reset attention."
              hint="Tip: pin the ones you want to see more often."
              actionLabel="Add Quote"
              onAction={handleStartAdd}
            />
          ) : (
            <>
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

              {filteredQuotes.length === 0 ? (
                <div className="settings-empty">
                  <h4>System idle</h4>
                  <p>No quotes match this filter. Refine the search or add a new one.</p>
                  <div className="settings-panel__actions">
                    <button className="ghost-button" onClick={() => setQuoteSearch('')}>
                      Clear Search
                    </button>
                  </div>
                </div>
              ) : (
                <div className="quote-list">
                  {pinnedQuotes.length > 0 && (
                    <div className="quote-group">
                      <p className="section-label">Pinned</p>
                      {pinnedQuotes.map((quote) => renderQuoteCard(quote, true))}
                    </div>
                  )}

                  <div className="quote-group">
                    {pinnedQuotes.length > 0 && <p className="section-label">All Quotes</p>}
                    {unpinnedQuotes.map((quote) => renderQuoteCard(quote, false))}
                  </div>
                </div>
              )}

              {totalPages > 1 && (
                <div className="pagination">
                  <button
                    className="ghost-button"
                    onClick={() => handlePageChange(page - 1)}
                    disabled={page === 0 || loading}
                  >
                    &larr; Previous
                  </button>
                  <span className="page-info">
                    Page {page + 1} of {totalPages} ({total} total quotes)
                  </span>
                  <button
                    className="ghost-button"
                    onClick={() => handlePageChange(page + 1)}
                    disabled={!hasMore || loading}
                  >
                    Next &rarr;
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </section>

      <ConfirmDialog
        isOpen={Boolean(deleteQuoteId)}
        title="Delete this quote?"
        description="This removes the quote from your daily rotation. You can re-add it later."
        confirmLabel="Delete"
        onConfirm={() => void handleDeleteConfirm()}
        onCancel={() => setDeleteQuoteId(null)}
      />

      <ConfirmDialog
        isOpen={confirmResetOpen}
        title="Reset to default quotes?"
        description="This replaces your custom quotes with the default library."
        confirmLabel="Reset"
        onConfirm={() => void handleResetToDefaults()}
        onCancel={() => setConfirmResetOpen(false)}
      />
    </>
  )
}
