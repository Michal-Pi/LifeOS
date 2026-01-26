import { newId } from '@lifeos/core'
import type {
  WorkoutSessionRepository,
  WorkoutSession,
  SessionId,
  CreateSessionInput,
  UpdateSessionInput,
  WorkoutContext,
} from '@lifeos/training'
import { createFirestoreWorkoutSessionRepository } from './firestoreWorkoutSessionRepository'
import {
  saveSessionLocally,
  getSessionLocally,
  listSessionsByDateLocally,
  getSessionByDateAndContextLocally,
  listSessionsForDateRangeLocally,
  deleteSessionLocally,
} from '@/training/offlineStore'
import { enqueueTrainingUpsert, enqueueTrainingDelete } from '@/training/outbox'
import { triggerTrainingSync } from '@/training/syncWorker'
import { isOnline } from '@/training/utils'

const firestoreRepo = createFirestoreWorkoutSessionRepository()

function shouldPreferLocal(session: WorkoutSession): boolean {
  return session.syncState !== 'synced'
}

export const createIndexedDbWorkoutSessionRepository = (): WorkoutSessionRepository => {
  return {
    async create(userId: string, input: CreateSessionInput): Promise<WorkoutSession> {
      const now = Date.now()
      const sessionId = newId('session')
      const session: WorkoutSession = {
        ...input,
        sessionId,
        userId,
        createdAtMs: now,
        updatedAtMs: now,
        syncState: 'pending',
        version: 1,
      }

      await saveSessionLocally(session)
      await enqueueTrainingUpsert('session', userId, sessionId, session, 'create')
      triggerTrainingSync(userId)
      return session
    },

    async update(
      userId: string,
      sessionId: SessionId,
      updates: UpdateSessionInput
    ): Promise<WorkoutSession> {
      let existing = await getSessionLocally(sessionId)
      if (!existing && isOnline()) {
        existing = await firestoreRepo.get(userId, sessionId)
      }
      if (!existing) {
        throw new Error(`Session ${sessionId} not found`)
      }

      const updated: WorkoutSession = {
        ...existing,
        ...updates,
        updatedAtMs: Date.now(),
        version: existing.version + 1,
        syncState: 'pending',
      }

      await saveSessionLocally(updated)
      await enqueueTrainingUpsert('session', userId, sessionId, updated, 'update')
      triggerTrainingSync(userId)
      return updated
    },

    async delete(userId: string, sessionId: SessionId): Promise<void> {
      await deleteSessionLocally(sessionId)
      await enqueueTrainingDelete('session', userId, sessionId)
      triggerTrainingSync(userId)
    },

    async get(userId: string, sessionId: SessionId): Promise<WorkoutSession | null> {
      const local = await getSessionLocally(sessionId)
      if (!isOnline()) return local

      const remote = await firestoreRepo.get(userId, sessionId)
      if (!remote) return local

      if (!local || !shouldPreferLocal(local)) {
        await saveSessionLocally(remote)
        return remote
      }

      return local
    },

    async getByDate(userId: string, dateKey: string): Promise<WorkoutSession[]> {
      const localItems = await listSessionsByDateLocally(userId, dateKey)
      if (!isOnline()) return sortSessions(localItems)

      const remoteItems = await firestoreRepo.getByDate(userId, dateKey)
      const localMap = new Map(localItems.map((item) => [item.sessionId, item]))
      const merged: WorkoutSession[] = []

      for (const remote of remoteItems) {
        const local = localMap.get(remote.sessionId)
        if (local && shouldPreferLocal(local)) {
          merged.push(local)
        } else {
          merged.push(remote)
          await saveSessionLocally(remote)
        }
        localMap.delete(remote.sessionId)
      }

      for (const local of localMap.values()) {
        merged.push(local)
      }

      return sortSessions(merged)
    },

    async getByDateAndContext(
      userId: string,
      dateKey: string,
      context: WorkoutContext
    ): Promise<WorkoutSession | null> {
      const local = await getSessionByDateAndContextLocally(userId, dateKey, context)
      if (!isOnline()) return local

      const remote = await firestoreRepo.getByDateAndContext(userId, dateKey, context)
      if (!remote) return local

      if (!local || !shouldPreferLocal(local)) {
        await saveSessionLocally(remote)
        return remote
      }

      return local
    },

    async listForDateRange(
      userId: string,
      startDate: string,
      endDate: string
    ): Promise<WorkoutSession[]> {
      const localItems = await listSessionsForDateRangeLocally(userId, startDate, endDate)
      if (!isOnline()) return sortSessions(localItems)

      const remoteItems = await firestoreRepo.listForDateRange(userId, startDate, endDate)
      const localMap = new Map(localItems.map((item) => [item.sessionId, item]))
      const merged: WorkoutSession[] = []

      for (const remote of remoteItems) {
        const local = localMap.get(remote.sessionId)
        if (local && shouldPreferLocal(local)) {
          merged.push(local)
        } else {
          merged.push(remote)
          await saveSessionLocally(remote)
        }
        localMap.delete(remote.sessionId)
      }

      for (const local of localMap.values()) {
        merged.push(local)
      }

      return sortSessions(merged)
    },
  }
}

function sortSessions(items: WorkoutSession[]): WorkoutSession[] {
  return [...items].sort((a, b) => b.updatedAtMs - a.updatedAtMs)
}
