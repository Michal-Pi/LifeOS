/**
 * useWorkflowSteps Hook
 *
 * Fetches workflow steps for graph workflows with real-time updates.
 */

import { useEffect, useState } from 'react'
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore'
import { getFirestoreClient } from '@/lib/firebase'
import { useAuth } from './useAuth'
import type { RunId, WorkflowStep } from '@lifeos/agents'

export interface UseWorkflowStepsReturn {
  steps: WorkflowStep[]
  isLoading: boolean
  error: Error | null
}

export function useWorkflowSteps(runId: RunId | null): UseWorkflowStepsReturn {
  const { user } = useAuth()
  const [steps, setSteps] = useState<WorkflowStep[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    if (!user || !runId) {
      return
    }

    const db = getFirestoreClient()
    const stepsRef = collection(db, `users/${user.uid}/runs/${runId}/workflowSteps`)
    const q = query(stepsRef, orderBy('startedAtMs', 'asc'))

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const steps = snapshot.docs.map((doc) => doc.data() as WorkflowStep)
        setSteps(steps)
        setIsLoading(false)
        setError(null)
      },
      (err) => {
        console.error('Error fetching workflow steps:', err)
        setSteps([])
        setIsLoading(false)
        setError(err as Error)
      }
    )

    return () => unsubscribe()
  }, [user, runId])

  return { steps, isLoading, error }
}
