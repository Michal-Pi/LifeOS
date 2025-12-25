/**
 * useQuotes Hook
 *
 * Manages quote fetching, pagination, sorting, and mutations.
 * Encapsulates all business logic for quote management.
 */

import type { Quote } from '@lifeos/core'
import { getDefaultQuotes } from '@lifeos/core'
import { useState, useEffect, useCallback } from 'react'
import { createFirestoreQuoteRepository, type SortBy, type SortOrder } from '@/adapters/firestoreQuoteRepository'

const quoteRepository = createFirestoreQuoteRepository()

const QUOTES_PER_PAGE = 50

interface UseQuotesOptions {
  userId: string
  initialPage?: number
  initialSortBy?: SortBy
  initialSortOrder?: SortOrder
}

interface UseQuotesResult {
  quotes: Quote[]
  total: number
  page: number
  sortBy: SortBy
  sortOrder: SortOrder
  loading: boolean
  error: string | null
  totalPages: number
  hasMore: boolean
  setSort: (column: SortBy) => void
  setPage: (newPage: number) => void
  deleteQuote: (quoteId: string) => Promise<void>
  addQuote: (newQuote: { text: string; author: string }) => Promise<void>
  resetToDefaults: () => Promise<void>
  clearError: () => void
}

export function useQuotes({
  userId,
  initialPage = 0,
  initialSortBy = 'addedAt',
  initialSortOrder = 'desc',
}: UseQuotesOptions): UseQuotesResult {
  const [quotes, setQuotes] = useState<Quote[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(initialPage)
  const [sortBy, setSortBy] = useState<SortBy>(initialSortBy)
  const [sortOrder, setSortOrder] = useState<SortOrder>(initialSortOrder)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadQuotes = useCallback(async () => {
    if (!userId) return
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
      setError(null)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [userId, page, sortBy, sortOrder])

  useEffect(() => {
    void loadQuotes()
  }, [loadQuotes])

  const setSort = useCallback((column: SortBy) => {
    if (sortBy === column) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(column)
      setSortOrder(column === 'addedAt' ? 'desc' : 'asc')
    }
    setPage(0)
  }, [sortBy])

  const deleteQuote = useCallback(async (quoteId: string) => {
    try {
      await quoteRepository.deleteQuote(userId, quoteId)
      await loadQuotes() // Reload current page
      setError(null)
    } catch (err) {
      setError((err as Error).message)
    }
  }, [userId, loadQuotes])

  const addQuote = useCallback(async (newQuote: { text: string; author: string }) => {
    if (total >= 1000) {
      setError('Maximum of 1000 quotes reached')
      return
    }
    try {
      await quoteRepository.addQuote(userId, newQuote)
      setPage(0) // Go to first page to see new quote
      await loadQuotes()
      setError(null)
    } catch (err) {
      setError((err as Error).message)
      throw err // Re-throw to allow form to handle its own state
    }
  }, [total, userId, loadQuotes])

  const resetToDefaults = useCallback(async () => {
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

  const clearError = () => {
    setError(null)
  }

  const totalPages = Math.ceil(total / QUOTES_PER_PAGE)
  const hasMore = page < totalPages - 1

  return {
    quotes,
    total,
    page,
    sortBy,
    sortOrder,
    loading,
    error,
    totalPages,
    hasMore,
    setSort,
    setPage,
    deleteQuote,
    addQuote,
    resetToDefaults,
    clearError,
  }
}