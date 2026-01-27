/**
 * Training Sync Worker
 *
 * Processes training outbox operations and applies them to Firestore.
 */

import { doc, setDoc, deleteDoc } from 'firebase/firestore'
import { getFirestoreClient } from '@/lib/firestoreClient'
import { isRecoverableFirestoreError } from '@/lib/firestoreErrorHandler'
import type {
  ExerciseId,
  TemplateId,
  PlanId,
  SessionId,
  ExerciseLibraryItem,
  WorkoutTemplate,
  WorkoutPlan,
  WorkoutSession,
} from '@lifeos/training'
import {
  listReadyTrainingOps,
  markTrainingOpApplying,
  markTrainingOpApplied,
  markTrainingOpFailed,
  removeTrainingOp,
  type TrainingOutboxOp,
} from './outbox'
import {
  saveExerciseLocally,
  saveTemplateLocally,
  savePlanLocally,
  saveSessionLocally,
  deleteExerciseLocally,
  deleteTemplateLocally,
  deletePlanLocally,
  deleteSessionLocally,
  getExerciseLocally,
  getTemplateLocally,
  getPlanLocally,
  getSessionLocally,
} from './offlineStore'

interface TrainingSyncState {
  isRunning: boolean
  intervalId: number | null
  userId: string | null
}

const state: TrainingSyncState = {
  isRunning: false,
  intervalId: null,
  userId: null,
}

async function upsertTrainingDoc(
  userId: string,
  entityType: TrainingOutboxOp['entityType'],
  entityId: TrainingOutboxOp['entityId'],
  item: ExerciseLibraryItem | WorkoutTemplate | WorkoutPlan | WorkoutSession
): Promise<void> {
  const db = await getFirestoreClient()
  let path = ''
  switch (entityType) {
    case 'exercise':
      path = `users/${userId}/exerciseLibrary/${entityId}`
      break
    case 'template':
      path = `users/${userId}/workoutTemplates/${entityId}`
      break
    case 'plan':
      path = `users/${userId}/workoutPlans/${entityId}`
      break
    case 'session':
      path = `users/${userId}/workoutSessions/${entityId}`
      break
  }
  const synced = { ...item, syncState: 'synced' as const }
  await setDoc(doc(db, path), synced)
}

async function deleteTrainingDoc(
  userId: string,
  entityType: TrainingOutboxOp['entityType'],
  entityId: TrainingOutboxOp['entityId']
): Promise<void> {
  const db = await getFirestoreClient()
  let path = ''
  switch (entityType) {
    case 'exercise':
      path = `users/${userId}/exerciseLibrary/${entityId}`
      break
    case 'template':
      path = `users/${userId}/workoutTemplates/${entityId}`
      break
    case 'plan':
      path = `users/${userId}/workoutPlans/${entityId}`
      break
    case 'session':
      path = `users/${userId}/workoutSessions/${entityId}`
      break
  }
  await deleteDoc(doc(db, path))
}

async function syncOp(userId: string, op: TrainingOutboxOp): Promise<void> {
  await markTrainingOpApplying(op.opId)

  const payloadItem = op.payload?.item

  switch (op.entityType) {
    case 'exercise': {
      if (op.type === 'delete') {
        await deleteTrainingDoc(userId, op.entityType, op.entityId)
        await deleteExerciseLocally(op.entityId as ExerciseId)
        break
      }

      const item =
        (payloadItem as ExerciseLibraryItem | undefined) ??
        (await getExerciseLocally(op.entityId as ExerciseId))
      if (!item) {
        await markTrainingOpApplied(op.opId)
        return
      }
      await upsertTrainingDoc(userId, op.entityType, op.entityId, item)
      await saveExerciseLocally({ ...item, syncState: 'synced' })
      break
    }
    case 'template': {
      if (op.type === 'delete') {
        await deleteTrainingDoc(userId, op.entityType, op.entityId)
        await deleteTemplateLocally(op.entityId as TemplateId)
        break
      }

      const item =
        (payloadItem as WorkoutTemplate | undefined) ??
        (await getTemplateLocally(op.entityId as TemplateId))
      if (!item) {
        await markTrainingOpApplied(op.opId)
        return
      }
      await upsertTrainingDoc(userId, op.entityType, op.entityId, item)
      await saveTemplateLocally({ ...item, syncState: 'synced' })
      break
    }
    case 'plan': {
      if (op.type === 'delete') {
        await deleteTrainingDoc(userId, op.entityType, op.entityId)
        await deletePlanLocally(op.entityId as PlanId)
        break
      }

      const item =
        (payloadItem as WorkoutPlan | undefined) ?? (await getPlanLocally(op.entityId as PlanId))
      if (!item) {
        await markTrainingOpApplied(op.opId)
        return
      }
      await upsertTrainingDoc(userId, op.entityType, op.entityId, item)
      await savePlanLocally({ ...item, syncState: 'synced' })
      break
    }
    case 'session': {
      if (op.type === 'delete') {
        await deleteTrainingDoc(userId, op.entityType, op.entityId)
        await deleteSessionLocally(op.entityId as SessionId)
        break
      }

      const item =
        (payloadItem as WorkoutSession | undefined) ??
        (await getSessionLocally(op.entityId as SessionId))
      if (!item) {
        await markTrainingOpApplied(op.opId)
        return
      }
      await upsertTrainingDoc(userId, op.entityType, op.entityId, item)
      await saveSessionLocally({ ...item, syncState: 'synced' })
      break
    }
  }

  await markTrainingOpApplied(op.opId)
  setTimeout(() => removeTrainingOp(op.opId), 24 * 60 * 60 * 1000)
}

async function drainTrainingOutbox(userId: string): Promise<void> {
  // Always attempt sync - network errors handled gracefully
  const ops = await listReadyTrainingOps(userId)
  for (const op of ops) {
    try {
      await syncOp(userId, op)
    } catch (error) {
      const err = error instanceof Error ? error : new Error('Unknown error')
      await markTrainingOpFailed(op.opId, err)
      if (!isRecoverableFirestoreError(err)) {
        throw err
      }
    }
  }
}

export function startTrainingSyncWorker(userId: string): void {
  if (!userId) return
  if (state.isRunning && state.userId === userId) return
  if (state.intervalId) {
    clearInterval(state.intervalId)
  }

  state.isRunning = true
  state.userId = userId

  void drainTrainingOutbox(userId)
  state.intervalId = window.setInterval(() => {
    void drainTrainingOutbox(userId)
  }, 5000)
}

export function stopTrainingSyncWorker(): void {
  if (state.intervalId) {
    clearInterval(state.intervalId)
  }
  state.intervalId = null
  state.userId = null
  state.isRunning = false
}

export function triggerTrainingSync(userId: string): void {
  if (!userId) return
  void drainTrainingOutbox(userId)
}
