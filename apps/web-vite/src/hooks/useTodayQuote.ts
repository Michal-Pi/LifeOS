import { createLogger, getDefaultQuotes, getQuoteForDate } from '@lifeos/core'
import type { Quote } from '@lifeos/core'
import { useEffect, useState } from 'react'
import { getQuotesLocally, saveQuotesLocally } from '@/quotes/offlineStore'

const logger = createLogger('useTodayQuote')

interface UseTodayQuoteOptions {
  userId: string
  todayKey: string
  quoteRepository: {
    getQuotes: (userId: string) => Promise<Quote[]>
  }
}

export function useTodayQuote({ userId, todayKey, quoteRepository }: UseTodayQuoteOptions) {
  const [quote, setQuote] = useState<Quote | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!userId) return

    getQuotesLocally(userId)
      .then((localQuotes) => {
        if (localQuotes.length > 0) {
          setQuote(getQuoteForDate(localQuotes, todayKey))
          setLoading(false)
        }
      })
      .catch(() => {
        // ignore local read failure
      })

    quoteRepository
      .getQuotes(userId)
      .then((userQuotes) => {
        const quotesToUse = userQuotes.length > 0 ? userQuotes : getDefaultQuotes()
        setQuote(getQuoteForDate(quotesToUse, todayKey))
        if (userQuotes.length > 0) {
          void saveQuotesLocally(userId, userQuotes)
        }
      })
      .catch((error) => {
        logger.error('Failed to load quotes from Firestore:', error)
        setQuote((prev) => prev ?? getDefaultQuotes()[0])
      })
      .finally(() => setLoading(false))
  }, [quoteRepository, todayKey, userId])

  return { quote, loading }
}
