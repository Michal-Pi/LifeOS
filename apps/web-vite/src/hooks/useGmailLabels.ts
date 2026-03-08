/**
 * useGmailLabels Hook
 *
 * Fetches and caches the user's Gmail labels for the label sidebar and label picker.
 */

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/hooks/useAuth'

export interface GmailLabel {
  id: string
  name: string
}

interface UseGmailLabelsResult {
  labels: GmailLabel[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

export function useGmailLabels(): UseGmailLabelsResult {
  const { user } = useAuth()
  const [labels, setLabels] = useState<GmailLabel[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchLabels = useCallback(async () => {
    if (!user?.uid) return

    setLoading(true)
    setError(null)

    try {
      const idToken = await user.getIdToken()
      const response = await fetch(
        `${import.meta.env.VITE_FUNCTIONS_URL}/mailboxGetLabels?uid=${user.uid}`,
        {
          headers: { Authorization: `Bearer ${idToken}` },
        }
      )

      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.error || 'Failed to fetch labels')
      }

      const { labels: fetchedLabels } = await response.json()
      setLabels(fetchedLabels)
    } catch (err) {
      console.error('Error fetching Gmail labels:', err)
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    void fetchLabels()
  }, [fetchLabels])

  return { labels, loading, error, refresh: fetchLabels }
}
