import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  query,
  where,
  orderBy,
  limit as firestoreLimit,
} from 'firebase/firestore'
import { getFirestoreClient as getDb } from '@/lib/firestoreClient'
import { newId } from '@lifeos/core'
import type {
  DeepResearchRepository,
  DeepResearchRequest,
  DeepResearchRequestId,
  DeepResearchStatus,
  CreateDeepResearchRequestInput,
  WorkflowId,
  RunId,
} from '@lifeos/agents'

export const createFirestoreDeepResearchRepository = (): DeepResearchRepository => {
  return {
    async create(
      userId: string,
      input: CreateDeepResearchRequestInput
    ): Promise<DeepResearchRequest> {
      const db = await getDb()
      const requestId = newId('research')

      const request: DeepResearchRequest = {
        ...input,
        requestId,
        userId,
        status: 'pending',
        createdAtMs: Date.now(),
      }

      const requestDoc = doc(
        db,
        `users/${userId}/workflows/${input.workflowId}/deepResearchRequests/${requestId}`
      )
      await setDoc(requestDoc, request)

      return request
    },

    async update(
      userId: string,
      workflowId: WorkflowId,
      requestId: DeepResearchRequestId,
      updates: Partial<Omit<DeepResearchRequest, 'requestId' | 'userId' | 'workflowId'>>
    ): Promise<DeepResearchRequest> {
      const db = await getDb()
      const requestDoc = doc(
        db,
        `users/${userId}/workflows/${workflowId}/deepResearchRequests/${requestId}`
      )

      const existing = await getDoc(requestDoc)
      if (!existing.exists()) {
        throw new Error(`Deep research request ${requestId} not found`)
      }

      const updated: DeepResearchRequest = {
        ...(existing.data() as DeepResearchRequest),
        ...updates,
      }

      await setDoc(requestDoc, updated)
      return updated
    },

    async get(
      userId: string,
      workflowId: WorkflowId,
      requestId: DeepResearchRequestId
    ): Promise<DeepResearchRequest | null> {
      const db = await getDb()
      const requestDoc = doc(
        db,
        `users/${userId}/workflows/${workflowId}/deepResearchRequests/${requestId}`
      )
      const snapshot = await getDoc(requestDoc)
      if (!snapshot.exists()) return null
      return snapshot.data() as DeepResearchRequest
    },

    async list(
      userId: string,
      options?: {
        workflowId?: WorkflowId
        status?: DeepResearchStatus
        runId?: RunId
        limit?: number
      }
    ): Promise<DeepResearchRequest[]> {
      if (!options?.workflowId) {
        return []
      }

      const db = await getDb()
      const requestsCol = collection(
        db,
        `users/${userId}/workflows/${options.workflowId}/deepResearchRequests`
      )

      let q = query(requestsCol, orderBy('createdAtMs', 'desc'))

      if (options.status) {
        q = query(q, where('status', '==', options.status))
      }

      if (options.runId) {
        q = query(q, where('runId', '==', options.runId))
      }

      if (options.limit) {
        q = query(q, firestoreLimit(options.limit))
      }

      const snapshot = await getDocs(q)
      return snapshot.docs.map((doc) => doc.data() as DeepResearchRequest)
    },
  }
}
