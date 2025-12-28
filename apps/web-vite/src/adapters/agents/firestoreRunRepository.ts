import {
  getFirestore,
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
import { newId } from '@lifeos/core'
import type {
  RunRepository,
  Run,
  RunId,
  CreateRunInput,
  WorkspaceId,
  RunStatus,
} from '@lifeos/agents'

export const createFirestoreRunRepository = (): RunRepository => {
  const getFirestoreClient = () => getFirestore()

  return {
    async create(userId: string, input: CreateRunInput): Promise<Run> {
      const db = getFirestoreClient()
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

      const runDoc = doc(db, `users/${userId}/workspaces/${input.workspaceId}/runs/${runId}`)
      await setDoc(runDoc, run)

      return run
    },

    async update(
      userId: string,
      runId: RunId,
      updates: Partial<Omit<Run, 'runId' | 'userId' | 'workspaceId'>>
    ): Promise<Run> {
      const db = getFirestoreClient()

      // Find the run across all workspaces
      const workspacesCol = collection(db, `users/${userId}/workspaces`)
      const workspacesSnapshot = await getDocs(workspacesCol)

      for (const workspaceDoc of workspacesSnapshot.docs) {
        const runDoc = doc(db, `users/${userId}/workspaces/${workspaceDoc.id}/runs/${runId}`)
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
      const db = getFirestoreClient()

      // Find the run across all workspaces
      const workspacesCol = collection(db, `users/${userId}/workspaces`)
      const workspacesSnapshot = await getDocs(workspacesCol)

      for (const workspaceDoc of workspacesSnapshot.docs) {
        const runDoc = doc(db, `users/${userId}/workspaces/${workspaceDoc.id}/runs/${runId}`)
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
        workspaceId?: WorkspaceId
        status?: RunStatus
        limit?: number
      }
    ): Promise<Run[]> {
      const db = getFirestoreClient()
      const runs: Run[] = []

      if (options?.workspaceId) {
        // List runs for specific workspace
        const runsCol = collection(db, `users/${userId}/workspaces/${options.workspaceId}/runs`)
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
        // List runs across all workspaces
        const workspacesCol = collection(db, `users/${userId}/workspaces`)
        const workspacesSnapshot = await getDocs(workspacesCol)

        for (const workspaceDoc of workspacesSnapshot.docs) {
          const runsCol = collection(db, `users/${userId}/workspaces/${workspaceDoc.id}/runs`)
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
      const db = getFirestoreClient()

      // Find and delete the run across all workspaces
      const workspacesCol = collection(db, `users/${userId}/workspaces`)
      const workspacesSnapshot = await getDocs(workspacesCol)

      for (const workspaceDoc of workspacesSnapshot.docs) {
        const runDoc = doc(db, `users/${userId}/workspaces/${workspaceDoc.id}/runs/${runId}`)
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
