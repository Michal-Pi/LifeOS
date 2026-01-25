/**
 * useExpertCouncilTurns Hook
 *
 * Real-time subscription to Expert Council turns for a run.
 */

import { useEffect, useState } from 'react'
import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore'
import { getFirestore } from 'firebase/firestore'
import type { ExpertCouncilTurn, RunId } from '@lifeos/agents'
import { useAuth } from './useAuth'

export function useExpertCouncilTurns(runId: RunId | null): {
  latestTurn: ExpertCouncilTurn | null
  isLoading: boolean
  error: Error | null
} {
  const { user } = useAuth()
  const [turnState, setTurnState] = useState<{
    key: string | null
    latestTurn: ExpertCouncilTurn | null
  }>({ key: null, latestTurn: null })
  const [error, setError] = useState<Error | null>(null)
  const activeKey = user && runId ? `${user.uid}:${runId}` : null

  useEffect(() => {
    if (!user || !runId || !activeKey) {
      return
    }

    const db = getFirestore()
    const turnsRef = collection(db, `users/${user.uid}/runs/${runId}/expertCouncilTurns`)
    const q = query(turnsRef, orderBy('createdAtMs', 'desc'), limit(1))

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const turn = snapshot.docs[0]?.data() as ExpertCouncilTurn | undefined
        setTurnState({ key: activeKey, latestTurn: turn ?? null })
        setError(null)
      },
      (err) => {
        console.error('Error fetching expert council turns:', err)
        setTurnState({ key: activeKey, latestTurn: null })
        setError(err as Error)
      }
    )

    return () => unsubscribe()
  }, [activeKey, runId, user])

  const scopedTurn = activeKey && turnState.key === activeKey ? turnState.latestTurn : null
  const scopedError = activeKey && turnState.key === activeKey ? error : null
  const isLoading = Boolean(activeKey && turnState.key !== activeKey)

  return { latestTurn: scopedTurn, isLoading, error: scopedError }
}
