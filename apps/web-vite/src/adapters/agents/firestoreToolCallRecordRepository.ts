import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  deleteDoc,
  query,
  orderBy,
} from 'firebase/firestore'
import { getFirestoreClient as getDb } from '@/lib/firestoreClient'
import { newId } from '@lifeos/core'
import type {
  ToolCallRecordRepository,
  ToolCallRecord,
  ToolCallRecordId,
  CreateToolCallRecordInput,
  RunId,
  WorkflowId,
} from '@lifeos/agents'

export const createFirestoreToolCallRecordRepository = (): ToolCallRecordRepository => {
  return {
    async createToolCallRecord(input: CreateToolCallRecordInput): Promise<ToolCallRecord> {
      const db = await getDb()
      const toolCallRecordId = newId('toolCallRecord')

      const toolCallRecord: ToolCallRecord = {
        ...input,
        toolCallRecordId,
        status: 'pending',
        syncState: 'synced',
        version: 1,
      }

      const toolCallDoc = doc(
        db,
        `users/${input.userId}/runs/${input.runId}/toolCalls/${toolCallRecordId}`
      )
      await setDoc(toolCallDoc, toolCallRecord)

      return toolCallRecord
    },

    async updateToolCallRecord(
      id: ToolCallRecordId,
      updates: Partial<ToolCallRecord>
    ): Promise<ToolCallRecord> {
      const db = await getDb()

      // Find the tool call record across all users and runs
      // In practice, we should have userId and runId in context, but for now we search
      // This is inefficient - in production, we'd pass userId/runId to update method
      const usersCol = collection(db, 'users')
      const usersSnapshot = await getDocs(usersCol)

      for (const userDoc of usersSnapshot.docs) {
        const runsCol = collection(db, `users/${userDoc.id}/runs`)
        const runsSnapshot = await getDocs(runsCol)

        for (const runDoc of runsSnapshot.docs) {
          const toolCallDoc = doc(db, `users/${userDoc.id}/runs/${runDoc.id}/toolCalls/${id}`)
          const existing = await getDoc(toolCallDoc)

          if (existing.exists()) {
            const updated: ToolCallRecord = {
              ...(existing.data() as ToolCallRecord),
              ...updates,
              version: (existing.data()?.version ?? 0) + 1,
              syncState: 'synced',
            }

            await setDoc(toolCallDoc, updated)
            return updated
          }
        }
      }

      throw new Error(`ToolCallRecord ${id} not found`)
    },

    async getToolCallRecord(id: ToolCallRecordId): Promise<ToolCallRecord | null> {
      const db = await getDb()

      // Find the tool call record across all users and runs
      const usersCol = collection(db, 'users')
      const usersSnapshot = await getDocs(usersCol)

      for (const userDoc of usersSnapshot.docs) {
        const runsCol = collection(db, `users/${userDoc.id}/runs`)
        const runsSnapshot = await getDocs(runsCol)

        for (const runDoc of runsSnapshot.docs) {
          const toolCallDoc = doc(db, `users/${userDoc.id}/runs/${runDoc.id}/toolCalls/${id}`)
          const snapshot = await getDoc(toolCallDoc)

          if (snapshot.exists()) {
            return snapshot.data() as ToolCallRecord
          }
        }
      }

      return null
    },

    async getToolCallRecordsByRun(runId: RunId): Promise<ToolCallRecord[]> {
      const db = await getDb()
      const toolCalls: ToolCallRecord[] = []

      // Find the run across all users
      const usersCol = collection(db, 'users')
      const usersSnapshot = await getDocs(usersCol)

      for (const userDoc of usersSnapshot.docs) {
        const runDoc = doc(db, `users/${userDoc.id}/runs/${runId}`)
        const runSnapshot = await getDoc(runDoc)

        if (runSnapshot.exists()) {
          // Found the run, get all tool calls
          const toolCallsCol = collection(db, `users/${userDoc.id}/runs/${runId}/toolCalls`)
          const q = query(toolCallsCol, orderBy('startedAtMs', 'asc'))
          const snapshot = await getDocs(q)
          toolCalls.push(...snapshot.docs.map((doc) => doc.data() as ToolCallRecord))
          break
        }
      }

      return toolCalls
    },

    async getToolCallRecordsByWorkflow(workflowId: WorkflowId): Promise<ToolCallRecord[]> {
      const db = await getDb()
      const toolCalls: ToolCallRecord[] = []

      // Find all runs for this workflow across all users
      const usersCol = collection(db, 'users')
      const usersSnapshot = await getDocs(usersCol)

      for (const userDoc of usersSnapshot.docs) {
        const runsCol = collection(db, `users/${userDoc.id}/runs`)
        const runsSnapshot = await getDocs(runsCol)

        for (const runDoc of runsSnapshot.docs) {
          const runData = runDoc.data()
          if (runData.workflowId === workflowId) {
            // This run belongs to the workflow
            const toolCallsCol = collection(db, `users/${userDoc.id}/runs/${runDoc.id}/toolCalls`)
            const q = query(toolCallsCol, orderBy('startedAtMs', 'asc'))
            const snapshot = await getDocs(q)
            toolCalls.push(...snapshot.docs.map((doc) => doc.data() as ToolCallRecord))
          }
        }
      }

      // Sort all tool calls by startedAtMs
      toolCalls.sort((a, b) => a.startedAtMs - b.startedAtMs)

      return toolCalls
    },

    async getToolCallRecordsByUser(userId: string): Promise<ToolCallRecord[]> {
      const db = await getDb()
      const toolCalls: ToolCallRecord[] = []

      // Get all runs for this user
      const runsCol = collection(db, `users/${userId}/runs`)
      const runsSnapshot = await getDocs(runsCol)

      for (const runDoc of runsSnapshot.docs) {
        // Get all tool calls for this run
        const toolCallsCol = collection(db, `users/${userId}/runs/${runDoc.id}/toolCalls`)
        const q = query(toolCallsCol, orderBy('startedAtMs', 'asc'))
        const snapshot = await getDocs(q)
        toolCalls.push(...snapshot.docs.map((doc) => doc.data() as ToolCallRecord))
      }

      // Sort all tool calls by startedAtMs
      toolCalls.sort((a, b) => a.startedAtMs - b.startedAtMs)

      return toolCalls
    },

    async deleteToolCallRecord(id: ToolCallRecordId): Promise<void> {
      const db = await getDb()

      // Find and delete the tool call record across all users and runs
      const usersCol = collection(db, 'users')
      const usersSnapshot = await getDocs(usersCol)

      for (const userDoc of usersSnapshot.docs) {
        const runsCol = collection(db, `users/${userDoc.id}/runs`)
        const runsSnapshot = await getDocs(runsCol)

        for (const runDoc of runsSnapshot.docs) {
          const toolCallDoc = doc(db, `users/${userDoc.id}/runs/${runDoc.id}/toolCalls/${id}`)
          const existing = await getDoc(toolCallDoc)

          if (existing.exists()) {
            await deleteDoc(toolCallDoc)
            return
          }
        }
      }

      throw new Error(`ToolCallRecord ${id} not found`)
    },
  }
}
