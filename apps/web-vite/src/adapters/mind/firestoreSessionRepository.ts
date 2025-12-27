/**
 * Firestore Session Repository
 *
 * Implements SessionRepository interface for Firestore persistence.
 * Handles CRUD operations for Mind Engine intervention sessions (logs).
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  query,
  where,
  orderBy,
  limit as firestoreLimit,
} from 'firebase/firestore'
import { getFirestoreClient } from '@/lib/firebase'
import { newId } from '@lifeos/core'
import type {
  CanonicalInterventionSession,
  SessionId,
  CreateSessionInput,
  CompleteSessionInput,
  SessionRepository,
} from '@lifeos/mind'

const COLLECTION_SESSIONS = 'intervention_sessions'

export const createFirestoreSessionRepository = (): SessionRepository => {
  const db = getFirestoreClient()

  const create = async (
    userId: string,
    input: CreateSessionInput
  ): Promise<CanonicalInterventionSession> => {
    const sessionId = newId<'session'>('session')
    const now = Date.now()

    const session: CanonicalInterventionSession = {
      ...input,
      sessionId,
      startedAtMs: now,
      syncState: 'synced',
      version: 1,
    }

    const ref = doc(db, `users/${userId}/${COLLECTION_SESSIONS}/${sessionId}`)
    await setDoc(ref, session)

    return session
  }

  const complete = async (
    userId: string,
    sessionId: SessionId,
    completion: CompleteSessionInput
  ): Promise<CanonicalInterventionSession> => {
    const ref = doc(db, `users/${userId}/${COLLECTION_SESSIONS}/${sessionId}`)
    const snapshot = await getDoc(ref)

    if (!snapshot.exists()) {
      throw new Error(`Session ${sessionId} not found`)
    }

    const existingSession = snapshot.data() as CanonicalInterventionSession
    const completedAtMs = Date.now()
    const durationSec = Math.floor((completedAtMs - existingSession.startedAtMs) / 1000)

    const updatedSession: CanonicalInterventionSession = {
      ...existingSession,
      completedAtMs,
      durationSec,
      feelingAfter: completion.feelingAfter,
      responses: completion.responses,
      createdTodoId: completion.createdTodoId,
      linkedHabitCheckinIds: completion.linkedHabitCheckinIds,
      version: existingSession.version + 1,
    }

    await setDoc(ref, updatedSession)
    return updatedSession
  }

  const get = async (
    userId: string,
    sessionId: SessionId
  ): Promise<CanonicalInterventionSession | null> => {
    const ref = doc(db, `users/${userId}/${COLLECTION_SESSIONS}/${sessionId}`)
    const snapshot = await getDoc(ref)

    if (!snapshot.exists()) {
      return null
    }

    return snapshot.data() as CanonicalInterventionSession
  }

  const listForDate = async (
    userId: string,
    dateKey: string
  ): Promise<CanonicalInterventionSession[]> => {
    const q = query(
      collection(db, `users/${userId}/${COLLECTION_SESSIONS}`),
      where('dateKey', '==', dateKey),
      orderBy('startedAtMs', 'desc')
    )

    const snapshot = await getDocs(q)
    return snapshot.docs.map((doc) => doc.data() as CanonicalInterventionSession)
  }

  const listRecent = async (
    userId: string,
    limit = 10
  ): Promise<CanonicalInterventionSession[]> => {
    const q = query(
      collection(db, `users/${userId}/${COLLECTION_SESSIONS}`),
      orderBy('startedAtMs', 'desc'),
      firestoreLimit(limit)
    )

    const snapshot = await getDocs(q)
    return snapshot.docs.map((doc) => doc.data() as CanonicalInterventionSession)
  }

  const listForDateRange = async (
    userId: string,
    startDate: string,
    endDate: string
  ): Promise<CanonicalInterventionSession[]> => {
    const q = query(
      collection(db, `users/${userId}/${COLLECTION_SESSIONS}`),
      where('dateKey', '>=', startDate),
      where('dateKey', '<=', endDate),
      orderBy('dateKey', 'asc'),
      orderBy('startedAtMs', 'desc')
    )

    const snapshot = await getDocs(q)
    return snapshot.docs.map((doc) => doc.data() as CanonicalInterventionSession)
  }

  return {
    create,
    complete,
    get,
    listForDate,
    listRecent,
    listForDateRange,
  }
}
