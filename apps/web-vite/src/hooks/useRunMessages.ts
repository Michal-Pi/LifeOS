/**
 * useRunMessages Hook
 *
 * Real-time subscription to messages for a run (Phase 6A).
 */

import { useEffect, useState } from 'react'
import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore'
import { getFirestoreClient } from '@/lib/firebase'
import type { Message, RunId } from '@lifeos/agents'
import { useAuth } from './useAuth'

export interface UseRunMessagesReturn {
  messages: Message[]
  isLoading: boolean
  isLoadingMore: boolean
  hasMore: boolean
  error: Error | null
  loadMore: () => void
}

const DEFAULT_PAGE_SIZE = 50

export function useRunMessages(runId: RunId | null): UseRunMessagesReturn {
  const { user } = useAuth()
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [limitCount, setLimitCount] = useState(DEFAULT_PAGE_SIZE)

  useEffect(() => {
    if (!user || !runId) {
      return
    }

    const db = getFirestoreClient()
    const messagesRef = collection(db, `users/${user.uid}/runs/${runId}/messages`)
    const q = query(messagesRef, orderBy('timestampMs', 'desc'), limit(limitCount))

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const newestFirst = snapshot.docs.map((doc) => doc.data() as Message)
        setMessages([...newestFirst].reverse())
        setIsLoading(false)
        setIsLoadingMore(false)
        setError(null)
        setHasMore(snapshot.size === limitCount)
      },
      (err) => {
        console.error('Error fetching run messages:', err)
        setMessages([])
        setIsLoading(false)
        setIsLoadingMore(false)
        setHasMore(false)
        setError(err as Error)
      }
    )

    return () => unsubscribe()
  }, [limitCount, runId, user])

  const loadMore = () => {
    if (!hasMore || isLoadingMore) {
      return
    }
    setIsLoadingMore(true)
    setLimitCount((prev) => prev + DEFAULT_PAGE_SIZE)
  }

  return { messages, isLoading, isLoadingMore, hasMore, error, loadMore }
}
