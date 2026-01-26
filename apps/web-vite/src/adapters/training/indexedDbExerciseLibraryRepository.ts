import { newId } from '@lifeos/core'
import type {
  ExerciseLibraryRepository,
  ExerciseLibraryItem,
  ExerciseId,
  CreateExerciseInput,
  UpdateExerciseInput,
  ExerciseCategory,
} from '@lifeos/training'
import { createFirestoreExerciseLibraryRepository } from './firestoreExerciseLibraryRepository'
import {
  saveExerciseLocally,
  getExerciseLocally,
  listExercisesLocally,
} from '@/training/offlineStore'
import { enqueueTrainingUpsert } from '@/training/outbox'
import { triggerTrainingSync } from '@/training/syncWorker'
import { isOnline } from '@/training/utils'

const firestoreRepo = createFirestoreExerciseLibraryRepository()

function shouldPreferLocal(item: ExerciseLibraryItem): boolean {
  return item.syncState !== 'synced'
}

export const createIndexedDbExerciseLibraryRepository = (): ExerciseLibraryRepository => {
  return {
    async create(userId: string, input: CreateExerciseInput): Promise<ExerciseLibraryItem> {
      const now = Date.now()
      const exerciseId = newId('exercise')
      const exercise: ExerciseLibraryItem = {
        ...input,
        exerciseId,
        userId,
        createdAtMs: now,
        updatedAtMs: now,
        syncState: 'pending',
        version: 1,
      }

      await saveExerciseLocally(exercise)
      await enqueueTrainingUpsert('exercise', userId, exerciseId, exercise, 'create')
      triggerTrainingSync(userId)
      return exercise
    },

    async update(
      userId: string,
      exerciseId: ExerciseId,
      updates: UpdateExerciseInput
    ): Promise<ExerciseLibraryItem> {
      let existing = await getExerciseLocally(exerciseId)

      if (!existing && isOnline()) {
        existing = await firestoreRepo.get(userId, exerciseId)
      }

      if (!existing) {
        throw new Error(`Exercise ${exerciseId} not found`)
      }

      const updated: ExerciseLibraryItem = {
        ...existing,
        ...updates,
        updatedAtMs: Date.now(),
        version: existing.version + 1,
        syncState: 'pending',
      }

      await saveExerciseLocally(updated)
      await enqueueTrainingUpsert('exercise', userId, exerciseId, updated, 'update')
      triggerTrainingSync(userId)
      return updated
    },

    async delete(userId: string, exerciseId: ExerciseId): Promise<void> {
      const existing = await getExerciseLocally(exerciseId)
      if (!existing) {
        throw new Error(`Exercise ${exerciseId} not found`)
      }

      const updated: ExerciseLibraryItem = {
        ...existing,
        archived: true,
        updatedAtMs: Date.now(),
        version: existing.version + 1,
        syncState: 'pending',
      }

      await saveExerciseLocally(updated)
      await enqueueTrainingUpsert('exercise', userId, exerciseId, updated, 'update')
      triggerTrainingSync(userId)
    },

    async get(userId: string, exerciseId: ExerciseId): Promise<ExerciseLibraryItem | null> {
      const local = await getExerciseLocally(exerciseId)
      if (!isOnline()) return local

      const remote = await firestoreRepo.get(userId, exerciseId)
      if (!remote) return local

      if (!local || !shouldPreferLocal(local)) {
        await saveExerciseLocally(remote)
        return remote
      }

      return local
    },

    async list(
      userId: string,
      options?: { category?: ExerciseCategory; activeOnly?: boolean }
    ): Promise<ExerciseLibraryItem[]> {
      const localItems = await listExercisesLocally(userId)
      if (!isOnline()) {
        return filterExercises(localItems, options)
      }

      const remoteItems = await firestoreRepo.list(userId, options)
      const localMap = new Map(localItems.map((item) => [item.exerciseId, item]))
      const merged: ExerciseLibraryItem[] = []

      for (const remote of remoteItems) {
        const local = localMap.get(remote.exerciseId)
        if (local && shouldPreferLocal(local)) {
          merged.push(local)
        } else {
          merged.push(remote)
          await saveExerciseLocally(remote)
        }
        localMap.delete(remote.exerciseId)
      }

      for (const local of localMap.values()) {
        merged.push(local)
      }

      return filterExercises(merged, options)
    },
  }
}

function filterExercises(
  items: ExerciseLibraryItem[],
  options?: { category?: ExerciseCategory; activeOnly?: boolean }
): ExerciseLibraryItem[] {
  let list = items
  if (options?.category) {
    list = list.filter((item) => item.category === options.category)
  }
  if (options?.activeOnly !== false) {
    list = list.filter((item) => !item.archived)
  }
  return list.sort((a, b) => a.name.localeCompare(b.name))
}
