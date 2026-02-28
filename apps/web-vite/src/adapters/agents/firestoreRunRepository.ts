import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit as firestoreLimit,
} from 'firebase/firestore'
import { getFirestoreClient as getDb } from '@/lib/firestoreClient'
import { newId } from '@lifeos/core'
import type {
  RunRepository,
  Run,
  RunId,
  CreateRunInput,
  WorkflowId,
  RunStatus,
} from '@lifeos/agents'

export const createFirestoreRunRepository = (): RunRepository => {
  return {
    async create(userId: string, input: CreateRunInput): Promise<Run> {
      const db = await getDb()
      const runId = newId('run')

      const run: Run = {
        ...input,
        runId,
        userId,
        status: 'pending',
        currentStep: 0,
        startedAtMs: Date.now(),
        syncState: 'synced',
        version: 1,
      }

      const runDoc = doc(db, `users/${userId}/workflows/${input.workflowId}/runs/${runId}`)
      await setDoc(runDoc, run)

      return run
    },

    async update(
      userId: string,
      runId: RunId,
      updates: Partial<Omit<Run, 'runId' | 'userId' | 'workflowId'>>
    ): Promise<Run> {
      const db = await getDb()

      // Find the run across all workflows
      const workflowsCol = collection(db, `users/${userId}/workflows`)
      const workflowsSnapshot = await getDocs(workflowsCol)

      for (const workflowDoc of workflowsSnapshot.docs) {
        const runDoc = doc(db, `users/${userId}/workflows/${workflowDoc.id}/runs/${runId}`)
        const existing = await getDoc(runDoc)

        if (existing.exists()) {
          const updated: Run = {
            ...(existing.data() as Run),
            ...updates,
            version: (existing.data()?.version ?? 0) + 1,
            syncState: 'synced',
          }

          await setDoc(runDoc, updated)
          return updated
        }
      }

      throw new Error(`Run ${runId} not found`)
    },

    async get(userId: string, runId: RunId): Promise<Run | null> {
      const db = await getDb()

      // Find the run across all workflows
      const workflowsCol = collection(db, `users/${userId}/workflows`)
      const workflowsSnapshot = await getDocs(workflowsCol)

      for (const workflowDoc of workflowsSnapshot.docs) {
        const runDoc = doc(db, `users/${userId}/workflows/${workflowDoc.id}/runs/${runId}`)
        const snapshot = await getDoc(runDoc)

        if (snapshot.exists()) {
          return snapshot.data() as Run
        }
      }

      return null
    },

    async list(
      userId: string,
      options?: {
        workflowId?: WorkflowId
        status?: RunStatus
        limit?: number
      }
    ): Promise<Run[]> {
      const db = await getDb()
      const runs: Run[] = []

      if (options?.workflowId) {
        // List runs for specific workflow
        const runsCol = collection(db, `users/${userId}/workflows/${options.workflowId}/runs`)
        let q = query(runsCol, orderBy('startedAtMs', 'desc'))

        if (options.status) {
          q = query(runsCol, where('status', '==', options.status), orderBy('startedAtMs', 'desc'))
        }

        if (options.limit) {
          q = query(q, firestoreLimit(options.limit))
        }

        const snapshot = await getDocs(q)
        runs.push(...snapshot.docs.map((doc) => doc.data() as Run))
      } else {
        // List runs across all workflows
        const workflowsCol = collection(db, `users/${userId}/workflows`)
        const workflowsSnapshot = await getDocs(workflowsCol)

        for (const workflowDoc of workflowsSnapshot.docs) {
          const runsCol = collection(db, `users/${userId}/workflows/${workflowDoc.id}/runs`)
          let q = query(runsCol, orderBy('startedAtMs', 'desc'))

          if (options?.status) {
            q = query(
              runsCol,
              where('status', '==', options.status),
              orderBy('startedAtMs', 'desc')
            )
          }

          const snapshot = await getDocs(q)
          runs.push(...snapshot.docs.map((doc) => doc.data() as Run))
        }

        // Sort all runs by startedAtMs
        runs.sort((a, b) => b.startedAtMs - a.startedAtMs)

        // Apply limit if specified
        if (options?.limit) {
          runs.splice(options.limit)
        }
      }

      return runs
    },

    async delete(userId: string, runId: RunId): Promise<void> {
      const db = await getDb()

      // Find and delete the run across all workflows
      const workflowsCol = collection(db, `users/${userId}/workflows`)
      const workflowsSnapshot = await getDocs(workflowsCol)

      for (const workflowDoc of workflowsSnapshot.docs) {
        const runDoc = doc(db, `users/${userId}/workflows/${workflowDoc.id}/runs/${runId}`)
        const existing = await getDoc(runDoc)

        if (existing.exists()) {
          await deleteDoc(runDoc)
          return
        }
      }

      throw new Error(`Run ${runId} not found`)
    },
  }
}
