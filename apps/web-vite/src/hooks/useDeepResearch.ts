/**
 * useDeepResearch Hook
 *
 * Real-time deep research queue operations.
 */

import { useEffect, useState, useCallback } from 'react'
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  getDoc,
  arrayUnion,
} from 'firebase/firestore'
import { getFirestoreClient } from '@/lib/firebase'
import { useAuth } from './useAuth'
import type { DeepResearchRequest, DeepResearchSource, Run, WorkflowId } from '@lifeos/agents'
import {
  createResearchResult,
  synthesizeResearchFindings,
  synthesizeResearchFindingsWithAI,
  validateResearchCompleteness,
} from '@/services/deepResearch/resultProcessor'

type UploadPayload = {
  request: DeepResearchRequest
  source: DeepResearchSource
  model: string
  content: string
}

export type UseDeepResearchReturn = {
  requests: DeepResearchRequest[]
  isLoading: boolean
  error: Error | null
  uploadResults: (payload: UploadPayload) => Promise<void>
  synthesizeRequest: (request: DeepResearchRequest) => Promise<void>
  updateRequest: (
    request: DeepResearchRequest,
    updates: Partial<Omit<DeepResearchRequest, 'requestId' | 'workflowId' | 'userId'>>
  ) => Promise<void>
}

export function useDeepResearch(workflowId?: WorkflowId | null): UseDeepResearchReturn {
  const { user } = useAuth()
  const [requestState, setRequestState] = useState<{
    key: string | null
    requests: DeepResearchRequest[]
  }>({ key: null, requests: [] })
  const [error, setError] = useState<Error | null>(null)
  const activeKey = user && workflowId ? `${user.uid}:${workflowId}` : null

  useEffect(() => {
    if (!user || !workflowId || !activeKey) {
      return
    }

    const db = getFirestoreClient()
    const requestsRef = collection(
      db,
      `users/${user.uid}/workflows/${workflowId}/deepResearchRequests`
    )
    const q = query(requestsRef, orderBy('createdAtMs', 'desc'))

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const next = snapshot.docs.map((doc) => doc.data() as DeepResearchRequest)
        setRequestState({ key: activeKey, requests: next })
        setError(null)
      },
      (err) => {
        console.error('Error loading deep research requests:', err)
        setRequestState({ key: activeKey, requests: [] })
        setError(err as Error)
      }
    )

    return () => unsubscribe()
  }, [activeKey, user, workflowId])

  const updateRequest = useCallback(
    async (
      request: DeepResearchRequest,
      updates: Partial<Omit<DeepResearchRequest, 'requestId' | 'workflowId' | 'userId'>>
    ) => {
      if (!user) return
      const db = getFirestoreClient()
      const docRef = doc(
        db,
        `users/${user.uid}/workflows/${request.workflowId}/deepResearchRequests/${request.requestId}`
      )
      await updateDoc(docRef, updates)
    },
    [user]
  )

  const uploadResults = useCallback(
    async ({ request, source, model, content }: UploadPayload) => {
      if (!user) return
      const trimmed = content.trim()
      if (!trimmed) {
        throw new Error('Upload content is required')
      }

      const db = getFirestoreClient()
      const result = createResearchResult({
        source,
        model,
        content: trimmed,
        uploadedBy: user.uid,
      })
      const requestDoc = doc(
        db,
        `users/${user.uid}/workflows/${request.workflowId}/deepResearchRequests/${request.requestId}`
      )

      await updateDoc(requestDoc, {
        results: arrayUnion(result),
      })

      const updatedSnap = await getDoc(requestDoc)
      if (!updatedSnap.exists()) {
        throw new Error('Research request not found after upload')
      }

      const updatedRequest = updatedSnap.data() as DeepResearchRequest
      const updatedResults = updatedRequest.results ?? []
      const combinedContent = updatedResults.map((entry) => entry.content).join('\n\n')
      const completeness = validateResearchCompleteness(updatedRequest, combinedContent)
      const shouldComplete = updatedRequest.status === 'completed' || completeness.isComplete
      const nextStatus = shouldComplete ? 'completed' : 'in_progress'
      const shouldSynthesize = updatedResults.length >= 2 && !updatedRequest.synthesizedFindings
      let synthesizedFindings = updatedRequest.synthesizedFindings

      if (shouldSynthesize) {
        synthesizedFindings = await synthesizeResearchFindingsWithAI({
          ...updatedRequest,
          results: updatedResults,
        })
      } else if (shouldComplete) {
        synthesizedFindings = synthesizeResearchFindings({
          ...updatedRequest,
          results: updatedResults,
        })
      }

      await updateDoc(requestDoc, {
        status: nextStatus,
        synthesizedFindings: synthesizedFindings ?? updatedRequest.synthesizedFindings,
        integratedAtMs: shouldComplete ? Date.now() : updatedRequest.integratedAtMs,
      })

      if (shouldComplete) {
        const runRef = doc(
          db,
          `users/${user.uid}/workflows/${request.workflowId}/runs/${request.runId}`
        )
        const runSnap = await getDoc(runRef)
        if (runSnap.exists()) {
          const run = runSnap.data() as Run
          const resumableStatuses: Run['status'][] = ['paused', 'waiting_for_input']
          if (!resumableStatuses.includes(run.status)) {
            console.warn('Run is not resumable after research completion', {
              runId: request.runId,
              status: run.status,
            })
            return
          }

          const pendingResearchRequestId = run.workflowState?.pendingResearchRequestId
          if (pendingResearchRequestId !== request.requestId) {
            console.warn('Run is not paused for this research request', {
              runId: request.runId,
              requestId: request.requestId,
              pendingResearchRequestId,
            })
            return
          }

          if (run.workflowState?.currentNodeId) {
            const namedOutputs = run.workflowState.namedOutputs ?? {}
            const matchesRequestId = (value: unknown) => {
              if (typeof value === 'string') {
                return value === request.requestId
              }
              if (value && typeof value === 'object' && 'requestId' in value) {
                return (value as DeepResearchRequest).requestId === request.requestId
              }
              return false
            }

            const pendingOutputKey = run.workflowState.pendingResearchOutputKey
            if (pendingOutputKey && !matchesRequestId(namedOutputs[pendingOutputKey])) {
              console.warn('Run workflow state does not match research request', {
                runId: request.runId,
                requestId: request.requestId,
                pendingOutputKey,
              })
              return
            }

            const currentNodeOutput = namedOutputs[run.workflowState.currentNodeId]
            const matchesCurrentNode = matchesRequestId(currentNodeOutput)

            if (currentNodeOutput !== undefined && !matchesCurrentNode) {
              console.warn('Run workflow state does not match research request', {
                runId: request.runId,
                requestId: request.requestId,
                currentNodeId: run.workflowState.currentNodeId,
              })
              return
            }
          }

          if (run.status === 'paused' || run.status === 'waiting_for_input') {
            await updateDoc(runRef, {
              status: 'pending',
              pendingInput: null,
              'context.deepResearch': {
                requestId: request.requestId,
                status: nextStatus,
                synthesizedFindings,
                integratedAtMs: Date.now(),
              },
              'workflowState.pendingResearchRequestId': null,
              'workflowState.pendingResearchOutputKey': null,
            })
          }
        }
      }
    },
    [user]
  )

  const synthesizeRequest = useCallback(
    async (request: DeepResearchRequest) => {
      if (!user) return
      const synthesizedFindings = await synthesizeResearchFindingsWithAI(request)
      const db = getFirestoreClient()
      const docRef = doc(
        db,
        `users/${user.uid}/workflows/${request.workflowId}/deepResearchRequests/${request.requestId}`
      )
      await updateDoc(docRef, {
        synthesizedFindings,
        status: 'completed',
        integratedAtMs: Date.now(),
      })
    },
    [user]
  )

  const scopedRequests = activeKey && requestState.key === activeKey ? requestState.requests : []
  const scopedError = activeKey && requestState.key === activeKey ? error : null
  const isLoading = Boolean(activeKey && requestState.key !== activeKey)

  return {
    requests: scopedRequests,
    isLoading,
    error: scopedError,
    uploadResults,
    synthesizeRequest,
    updateRequest,
  }
}
