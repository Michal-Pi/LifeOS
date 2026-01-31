/**
 * Run events subscription (Phase 6B).
 */

import { useEffect, useState } from 'react'
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore'
import { getFirestoreClient } from '@/lib/firebase'
import { useAuth } from '@/hooks/useAuth'
import type { RunId } from '@lifeos/agents'

export type RunEventType = 'token' | 'tool_call' | 'tool_result' | 'status' | 'error' | 'final'

export type RunEvent = {
  eventId: string
  type: RunEventType
  runId: string
  workspaceId?: string
  agentId?: string
  agentName?: string
  provider?: string
  model?: string
  step?: number
  timestampMs: number
  delta?: string
  output?: string
  status?: string
  errorMessage?: string
  errorCategory?: string
  toolName?: string
  toolCallId?: string
  toolResult?: unknown
  details?: Record<string, unknown>
}

export function useRunEvents(runId: RunId | null) {
  const { user } = useAuth()
  const [events, setEvents] = useState<RunEvent[]>([])

  useEffect(() => {
    if (!user || !runId) {
      return
    }

    const db = getFirestoreClient()
    const eventsRef = collection(db, `users/${user.uid}/runs/${runId}/events`)
    const q = query(eventsRef, orderBy('timestampMs', 'asc'))

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const nextEvents = snapshot.docs.map(
          (doc) =>
            ({
              eventId: doc.id,
              ...(doc.data() as Omit<RunEvent, 'eventId'>),
            }) as RunEvent
        )
        setEvents(nextEvents)
      },
      (error) => {
        console.error('Error fetching run events:', error)
      }
    )

    return () => unsubscribe()
  }, [runId, user])

  return { events: user && runId ? events : [] }
}
