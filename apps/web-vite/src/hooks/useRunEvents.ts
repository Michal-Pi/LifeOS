/**
 * Run events subscription (Phase 6B).
 */

import { useEffect, useState } from 'react'
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore'
import { getFirestoreClient } from '@/lib/firebase'
import { useAuth } from '@/hooks/useAuth'
import type { RunId } from '@lifeos/agents'

export type RunEventType =
  | 'token'
  | 'tool_call'
  | 'tool_result'
  | 'status'
  | 'error'
  | 'final'
  // Step progress events
  | 'step_started'
  | 'step_completed'
  // Deep research events
  | 'deep_research_phase'
  // Dialectical workflow events
  | 'dialectical_phase'
  | 'dialectical_thesis'
  | 'dialectical_negation'
  | 'dialectical_contradiction'
  | 'dialectical_synthesis'
  | 'dialectical_meta'
  // Oracle scenario planning events
  | 'oracle_phase'
  | 'oracle_gate_result'
  | 'oracle_council_complete'
  | 'oracle_human_gate'
  | 'oracle_consistency_check'
  // Plan management events
  | 'plan_approved'

export type RunEvent = {
  eventId: string
  type: RunEventType
  runId: string
  workflowId?: string
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
  const [eventState, setEventState] = useState<{
    runId: RunId | null
    events: RunEvent[]
  }>({
    runId: null,
    events: [],
  })

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
        setEventState({ runId, events: nextEvents })
      },
      (error) => {
        console.error('Error fetching run events:', error)
      }
    )

    return () => unsubscribe()
  }, [runId, user])

  return {
    events: user && runId && eventState.runId === runId ? eventState.events : [],
  }
}
