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
} from 'firebase/firestore'
import { newId } from '@lifeos/core'
import { getFirestoreClient } from '@/lib/firestoreClient'
import type {
  WorkoutSessionRepository,
  WorkoutSession,
  SessionId,
  CreateSessionInput,
  UpdateSessionInput,
  WorkoutContext,
} from '@lifeos/training'

export const createFirestoreWorkoutSessionRepository = (): WorkoutSessionRepository => {
  return {
    async create(userId: string, input: CreateSessionInput): Promise<WorkoutSession> {
      const db = await getFirestoreClient()
      const sessionId = newId('session')

      const session: WorkoutSession = {
        ...input,
        sessionId,
        userId,
        createdAtMs: Date.now(),
        updatedAtMs: Date.now(),
        syncState: 'synced',
        version: 1,
      }

      const sessionDoc = doc(db, `users/${userId}/workoutSessions/${sessionId}`)
      await setDoc(sessionDoc, session)

      return session
    },

    async update(
      userId: string,
      sessionId: SessionId,
      updates: UpdateSessionInput
    ): Promise<WorkoutSession> {
      const db = await getFirestoreClient()
      const sessionDoc = doc(db, `users/${userId}/workoutSessions/${sessionId}`)

      const existing = await getDoc(sessionDoc)
      if (!existing.exists()) {
        throw new Error(`Session ${sessionId} not found`)
      }

      const updated: WorkoutSession = {
        ...(existing.data() as WorkoutSession),
        ...updates,
        updatedAtMs: Date.now(),
        version: (existing.data()?.version ?? 0) + 1,
        syncState: 'synced',
      }

      await setDoc(sessionDoc, updated)
      return updated
    },

    async delete(userId: string, sessionId: SessionId): Promise<void> {
      const db = await getFirestoreClient()
      const sessionDoc = doc(db, `users/${userId}/workoutSessions/${sessionId}`)
      await deleteDoc(sessionDoc)
    },

    async get(userId: string, sessionId: SessionId): Promise<WorkoutSession | null> {
      const db = await getFirestoreClient()
      const sessionDoc = doc(db, `users/${userId}/workoutSessions/${sessionId}`)
      const snapshot = await getDoc(sessionDoc)

      if (!snapshot.exists()) return null
      return snapshot.data() as WorkoutSession
    },

    async getByDate(userId: string, dateKey: string): Promise<WorkoutSession[]> {
      const db = await getFirestoreClient()
      const sessionsCol = collection(db, `users/${userId}/workoutSessions`)
      const q = query(sessionsCol, where('dateKey', '==', dateKey), orderBy('createdAtMs', 'desc'))

      const snapshot = await getDocs(q)
      return snapshot.docs.map((doc) => doc.data() as WorkoutSession)
    },

    async getByDateAndContext(
      userId: string,
      dateKey: string,
      context: WorkoutContext
    ): Promise<WorkoutSession | null> {
      const db = await getFirestoreClient()
      const sessionsCol = collection(db, `users/${userId}/workoutSessions`)
      const q = query(sessionsCol, where('dateKey', '==', dateKey), where('context', '==', context))

      const snapshot = await getDocs(q)
      if (snapshot.empty) return null
      return snapshot.docs[0].data() as WorkoutSession
    },

    async listForDateRange(
      userId: string,
      startDate: string,
      endDate: string
    ): Promise<WorkoutSession[]> {
      const db = await getFirestoreClient()
      const sessionsCol = collection(db, `users/${userId}/workoutSessions`)
      const q = query(
        sessionsCol,
        where('dateKey', '>=', startDate),
        where('dateKey', '<=', endDate),
        orderBy('dateKey', 'desc')
      )

      const snapshot = await getDocs(q)
      return snapshot.docs.map((doc) => doc.data() as WorkoutSession)
    },
  }
}
