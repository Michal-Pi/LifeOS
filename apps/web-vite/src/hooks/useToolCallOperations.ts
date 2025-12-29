/**
 * useToolCallOperations Hook
 *
 * React hook for fetching and displaying tool call records.
 * Provides real-time updates for tool call execution status.
 */

import { useState, useEffect } from 'react'
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore'
import { getFirestore } from 'firebase/firestore'
import { useAuth } from './useAuth'
import type { ToolCallRecord, RunId } from '@lifeos/agents'

export interface UseToolCallOperationsReturn {
  toolCalls: ToolCallRecord[]
  isLoading: boolean
  error: Error | null
}

/**
 * Hook to fetch and listen to tool calls for a specific run
 */
export function useToolCallOperations(runId: RunId | null): UseToolCallOperationsReturn {
  const { user } = useAuth()
  const [state, setState] = useState<{
    toolCalls: ToolCallRecord[]
    isLoading: boolean
    error: Error | null
  }>({
    toolCalls: [],
    isLoading: false,
    error: null,
  })

  useEffect(() => {
    if (!user || !runId) {
      return
    }

    const db = getFirestore()

    // Subscribe to tool calls for this run
    const toolCallsRef = collection(db, `users/${user.uid}/runs/${runId}/toolCalls`)
    const q = query(toolCallsRef, orderBy('startedAtMs', 'asc'))

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const calls = snapshot.docs.map((doc) => doc.data() as ToolCallRecord)
        setState({ toolCalls: calls, isLoading: false, error: null })
      },
      (err) => {
        console.error('Error fetching tool calls:', err)
        setState({ toolCalls: [], isLoading: false, error: err as Error })
      }
    )

    return () => unsubscribe()
  }, [user, runId])

  return state
}
