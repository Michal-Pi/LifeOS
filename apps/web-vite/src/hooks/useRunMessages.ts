/**
 * useRunMessages Hook
 *
 * Real-time subscription to messages for a run (Phase 6A).
 */

import { useEffect, useState } from 'react'
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore'
import { getFirestore } from 'firebase/firestore'
import type { Message, RunId } from '@lifeos/agents'
import { useAuth } from './useAuth'

export interface UseRunMessagesReturn {
  messages: Message[]
  isLoading: boolean
  error: Error | null
}

export function useRunMessages(runId: RunId | null): UseRunMessagesReturn {
  const { user } = useAuth()
  const [state, setState] = useState<UseRunMessagesReturn>({
    messages: [],
    isLoading: false,
    error: null,
  })

  useEffect(() => {
    if (!user || !runId) {
      return
    }

    const db = getFirestore()
    const messagesRef = collection(db, `users/${user.uid}/runs/${runId}/messages`)
    const q = query(messagesRef, orderBy('timestampMs', 'asc'))

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const messages = snapshot.docs.map((doc) => doc.data() as Message)
        setState({ messages, isLoading: false, error: null })
      },
      (err) => {
        console.error('Error fetching run messages:', err)
        setState({ messages: [], isLoading: false, error: err as Error })
      }
    )

    return () => unsubscribe()
  }, [runId, user])

  return state
}
