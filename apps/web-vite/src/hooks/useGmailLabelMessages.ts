/**
 * useGmailLabelMessages Hook
 *
 * Fetches Gmail messages for a specific label via the mailboxFetchByLabel endpoint.
 * Returns raw Gmail message metadata (not AI-prioritized).
 */

import { useState, useCallback } from 'react'
import { useAuth } from '@/hooks/useAuth'

export interface GmailLabelMessage {
  messageId: string
  threadId: string
  subject: string
  from: string
  to?: string
  cc?: string
  date: string
  snippet: string
  labelIds: string[]
}

interface UseGmailLabelMessagesResult {
  messages: GmailLabelMessage[]
  loading: boolean
  error: string | null
  fetchByLabel: (labelName: string, maxResults?: number) => Promise<void>
}

export function useGmailLabelMessages(): UseGmailLabelMessagesResult {
  const { user } = useAuth()
  const [messages, setMessages] = useState<GmailLabelMessage[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchByLabel = useCallback(
    async (labelName: string, maxResults = 30) => {
      if (!user?.uid) return

      setLoading(true)
      setError(null)

      try {
        const idToken = await user.getIdToken()
        const response = await fetch(
          `${import.meta.env.VITE_FUNCTIONS_URL}/mailboxFetchByLabel`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${idToken}`,
            },
            body: JSON.stringify({ uid: user.uid, labelName, maxResults }),
          }
        )

        if (!response.ok) {
          const err = await response.json()
          throw new Error(err.error || 'Failed to fetch label messages')
        }

        const { messages: fetched } = await response.json()
        setMessages(fetched)
      } catch (err) {
        console.error('Error fetching label messages:', err)
        setError((err as Error).message)
      } finally {
        setLoading(false)
      }
    },
    [user]
  )

  return { messages, loading, error, fetchByLabel }
}
