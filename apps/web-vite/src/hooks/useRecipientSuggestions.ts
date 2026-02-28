/**
 * useRecipientSuggestions Hook
 *
 * Provides autocomplete suggestions for the mailbox composer's "To" field.
 * Sources suggestions from recent message senders and SenderPersona records,
 * deduplicates by email/ID, and sorts by recency.
 */

import { useState, useEffect, useMemo } from 'react'
import { collection, getDocs, query, orderBy, limit as firestoreLimit } from 'firebase/firestore'
import { getFirestoreClient as getDb } from '@/lib/firestoreClient'
import { useAuth } from '@/hooks/useAuth'
import type { MessageSource, PrioritizedMessage, SenderPersona } from '@lifeos/agents'

export interface RecipientSuggestion {
  id: string
  name: string
  email?: string
  source: MessageSource
  /** Most recent interaction timestamp */
  lastSeenMs: number
}

interface UseRecipientSuggestionsResult {
  suggestions: RecipientSuggestion[]
  loading: boolean
}

export function useRecipientSuggestions(queryText: string): UseRecipientSuggestionsResult {
  const { user } = useAuth()
  const [recentSenders, setRecentSenders] = useState<RecipientSuggestion[]>([])
  const [personas, setPersonas] = useState<RecipientSuggestion[]>([])
  const [loading, setLoading] = useState(true)

  // Load recent senders from mailboxMessages + senderPersonas on mount
  useEffect(() => {
    if (!user?.uid) {
      setLoading(false)
      return
    }

    let cancelled = false

    const loadSuggestions = async () => {
      try {
        const db = await getDb()

        // Fetch recent messages for sender info
        const messagesCol = collection(db, `users/${user.uid}/mailboxMessages`)
        const messagesQuery = query(
          messagesCol,
          orderBy('receivedAtMs', 'desc'),
          firestoreLimit(200)
        )
        const messagesSnapshot = await getDocs(messagesQuery)

        // Fetch sender personas
        const personasCol = collection(db, `users/${user.uid}/senderPersonas`)
        const personasQuery = query(
          personasCol,
          orderBy('researchedAtMs', 'desc'),
          firestoreLimit(100)
        )
        const personasSnapshot = await getDocs(personasQuery)

        if (cancelled) return

        // Extract unique senders from messages
        const senderMap = new Map<string, RecipientSuggestion>()
        for (const doc of messagesSnapshot.docs) {
          const msg = doc.data() as PrioritizedMessage
          const key = msg.senderEmail ?? msg.sender
          if (!senderMap.has(key)) {
            senderMap.set(key, {
              id: key,
              name: msg.sender,
              email: msg.senderEmail,
              source: msg.source,
              lastSeenMs: msg.receivedAtMs,
            })
          }
        }
        setRecentSenders(Array.from(senderMap.values()))

        // Extract personas
        const personaList: RecipientSuggestion[] = personasSnapshot.docs.map((doc) => {
          const p = doc.data() as SenderPersona
          return {
            id: p.email ?? p.name,
            name: p.name,
            email: p.email,
            source: 'gmail' as MessageSource, // personas don't have a single source; default to gmail
            lastSeenMs: p.researchedAtMs,
          }
        })
        setPersonas(personaList)
      } catch (err) {
        console.error('Error loading recipient suggestions:', err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void loadSuggestions()

    return () => {
      cancelled = true
    }
  }, [user?.uid])

  // Merge, deduplicate, filter by query, and sort
  const suggestions = useMemo(() => {
    // Merge all sources
    const allSuggestions = [...recentSenders, ...personas]

    // Deduplicate by email/id (keep the most recent)
    const deduped = new Map<string, RecipientSuggestion>()
    for (const s of allSuggestions) {
      const key = (s.email ?? s.name).toLowerCase()
      const existing = deduped.get(key)
      if (!existing || s.lastSeenMs > existing.lastSeenMs) {
        deduped.set(key, s)
      }
    }

    let results = Array.from(deduped.values())

    // Filter by query text
    if (queryText.trim()) {
      const lowerQuery = queryText.toLowerCase()
      results = results.filter(
        (s) =>
          s.name.toLowerCase().includes(lowerQuery) ||
          (s.email && s.email.toLowerCase().includes(lowerQuery))
      )
    }

    // Sort by recency
    results.sort((a, b) => b.lastSeenMs - a.lastSeenMs)

    // Limit results
    return results.slice(0, 10)
  }, [recentSenders, personas, queryText])

  return { suggestions, loading }
}
