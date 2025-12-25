/**
 * useDailyQuote Hook
 *
 * Fetches all of a user's quotes and determines the correct one for a given date.
 * Encapsulates the logic for selecting a deterministic daily quote.
 */

import { useState, useEffect } from 'react'
import type { Quote } from '@lifeos/core'
import { getDefaultQuotes, getQuoteForDate, createLogger } from '@lifeos/core'
import { createFirestoreQuoteRepository } from '@/adapters/firestoreQuoteRepository'

const logger = createLogger('useDailyQuote')
const quoteRepository = createFirestoreQuoteRepository()

interface UseDailyQuoteOptions {
  userId: string
  dateKey: string // YYYY-MM-DD
  enabled?: boolean
}

interface UseDailyQuoteResult {
  quote: Quote | null
  loading: boolean
  error: Error | null
}

export function useDailyQuote({ userId, dateKey, enabled = true }: UseDailyQuoteOptions): UseDailyQuoteResult {
  const [quote, setQuote] = useState<Quote | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    if (!userId || !enabled) {
      setLoading(false)
      return
    }

    const loadQuote = async () => {
      setLoading(true)
      setError(null)
      try {
        const userQuotes = await quoteRepository.getQuotes(userId)
        const quotesToUse = userQuotes.length > 0 ? userQuotes : getDefaultQuotes()
        const dailyQuote = getQuoteForDate(quotesToUse, dateKey)
        setQuote(dailyQuote)
      } catch (err) {
        setError(err as Error)
        logger.error('Failed to load daily quote', err, { dateKey })
        // Fallback to first default quote on error
        setQuote(getDefaultQuotes()[0])
      } finally {
        setLoading(false)
      }
    }

    void loadQuote()
  }, [userId, dateKey, enabled])

  return { quote, loading, error }
}
