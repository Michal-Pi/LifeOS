/**
 * useFollowUpDue Hook
 *
 * Fetches contacts that are due or overdue for follow-up.
 * Wraps the existing getFollowUpDue repository method.
 */

import { useState, useEffect, useCallback } from 'react'
import type { Contact } from '@lifeos/agents'
import { useAuth } from '@/hooks/useAuth'
import { useRepositories } from '@/contexts/RepositoryContext'

interface UseFollowUpDueResult {
  contacts: Contact[]
  loading: boolean
  error: string | null
  refresh: () => void
}

export function useFollowUpDue(limit = 10): UseFollowUpDueResult {
  const { user } = useAuth()
  const { contactRepository: contactRepo } = useRepositories()
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const refresh = useCallback(() => {
    setRefreshKey((k) => k + 1)
  }, [])

  useEffect(() => {
    if (!user?.uid) {
      setLoading(false)
      return
    }

    let cancelled = false

    const fetchFollowUps = async () => {
      try {
        setLoading(true)
        const results = await contactRepo.getFollowUpDue(user.uid, Date.now(), limit)
        if (!cancelled) {
          setContacts(results)
          setError(null)
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Error fetching follow-up contacts:', err)
          setError((err as Error).message)
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void fetchFollowUps()

    return () => {
      cancelled = true
    }
  }, [user?.uid, limit, refreshKey, contactRepo])

  return { contacts, loading, error, refresh }
}
