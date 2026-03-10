import { useEffect, useMemo, useState } from 'react'
import { collectionGroup, limit, onSnapshot, query, where } from 'firebase/firestore'
import { getFirestoreClient } from '@/lib/firebase'
import { useAuth } from '@/hooks/useAuth'
import type { Run } from '@lifeos/agents'

export function useLiveRuns() {
  const { user } = useAuth()
  const [runs, setRuns] = useState<Run[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!user) {
      queueMicrotask(() => setRuns([]))
      return
    }

    queueMicrotask(() => setLoading(true))
    const db = getFirestoreClient()
    const runsQuery = query(
      collectionGroup(db, 'runs'),
      where('userId', '==', user.uid),
      limit(120)
    )

    const unsubscribe = onSnapshot(
      runsQuery,
      (snapshot) => {
        const nextRuns = snapshot.docs
          .map((doc) => doc.data() as Run)
          .sort((left, right) => (right.startedAtMs ?? 0) - (left.startedAtMs ?? 0))
        setRuns(nextRuns)
        setLoading(false)
        setError(null)
      },
      (err) => {
        console.error('Failed to subscribe to live runs', err)
        setError(err instanceof Error ? err.message : 'Failed to subscribe to runs')
        setLoading(false)
      }
    )

    return () => unsubscribe()
  }, [user])

  return useMemo(() => {
    const activeRuns = runs.filter((run) =>
      ['pending', 'queued', 'running', 'paused', 'waiting_for_input'].includes(run.status)
    )
    const recentCompleted = runs
      .filter((run) => ['completed', 'failed'].includes(run.status))
      .slice(0, 12)

    return {
      activeRuns,
      recentCompleted,
      loading,
      error,
    }
  }, [error, loading, runs])
}
