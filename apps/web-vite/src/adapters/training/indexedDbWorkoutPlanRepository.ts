import { newId } from '@lifeos/core'
import type {
  WorkoutPlanRepository,
  WorkoutPlan,
  PlanId,
  CreatePlanInput,
  UpdatePlanInput,
} from '@lifeos/training'
import { createFirestoreWorkoutPlanRepository } from './firestoreWorkoutPlanRepository'
import {
  savePlanLocally,
  getPlanLocally,
  listPlansLocally,
  getActivePlanLocally,
  deletePlanLocally,
} from '@/training/offlineStore'
import { enqueueTrainingUpsert, enqueueTrainingDelete } from '@/training/outbox'
import { triggerTrainingSync } from '@/training/syncWorker'
import { isOnline } from '@/training/utils'

const firestoreRepo = createFirestoreWorkoutPlanRepository()

function shouldPreferLocal(plan: WorkoutPlan): boolean {
  return plan.syncState !== 'synced'
}

export const createIndexedDbWorkoutPlanRepository = (): WorkoutPlanRepository => {
  return {
    async create(userId: string, input: CreatePlanInput): Promise<WorkoutPlan> {
      const now = Date.now()
      const planId = newId('plan') as PlanId
      const plan: WorkoutPlan = {
        planId,
        userId,
        active: input.active,
        timezone: input.timezone,
        startDateKey: input.startDateKey,
        schedule: input.schedule,
        createdAtMs: now,
        updatedAtMs: now,
        syncState: 'pending',
        version: 1,
      }

      await savePlanLocally(plan)
      await enqueueTrainingUpsert('plan', userId, planId, plan, 'create')
      triggerTrainingSync(userId)
      return plan
    },

    async update(userId: string, planId: PlanId, updates: UpdatePlanInput): Promise<WorkoutPlan> {
      let existing = await getPlanLocally(planId)
      if (!existing && isOnline()) {
        existing = await firestoreRepo.get(userId, planId)
      }
      if (!existing) {
        throw new Error(`Plan ${planId} not found`)
      }

      const updated: WorkoutPlan = {
        ...existing,
        ...updates,
        updatedAtMs: Date.now(),
        version: existing.version + 1,
        syncState: 'pending',
      }

      await savePlanLocally(updated)
      await enqueueTrainingUpsert('plan', userId, planId, updated, 'update')
      triggerTrainingSync(userId)
      return updated
    },

    async delete(userId: string, planId: PlanId): Promise<void> {
      await deletePlanLocally(planId)
      await enqueueTrainingDelete('plan', userId, planId)
      triggerTrainingSync(userId)
    },

    async get(userId: string, planId: PlanId): Promise<WorkoutPlan | null> {
      const local = await getPlanLocally(planId)
      if (!isOnline()) return local

      const remote = await firestoreRepo.get(userId, planId)
      if (!remote) return local

      if (!local || !shouldPreferLocal(local)) {
        await savePlanLocally(remote)
        return remote
      }

      return local
    },

    async getActive(userId: string): Promise<WorkoutPlan | null> {
      const local = await getActivePlanLocally(userId)
      if (!isOnline()) return local

      const remote = await firestoreRepo.getActive(userId)
      if (!remote) return local

      if (!local || !shouldPreferLocal(local)) {
        await savePlanLocally(remote)
        return remote
      }

      return local
    },

    async list(userId: string): Promise<WorkoutPlan[]> {
      const localItems = await listPlansLocally(userId)
      if (!isOnline()) return sortPlans(localItems)

      const remoteItems = await firestoreRepo.list(userId)
      const localMap = new Map(localItems.map((item) => [item.planId, item]))
      const merged: WorkoutPlan[] = []

      for (const remote of remoteItems) {
        const local = localMap.get(remote.planId)
        if (local && shouldPreferLocal(local)) {
          merged.push(local)
        } else {
          merged.push(remote)
          await savePlanLocally(remote)
        }
        localMap.delete(remote.planId)
      }

      for (const local of localMap.values()) {
        merged.push(local)
      }

      return sortPlans(merged)
    },
  }
}

function sortPlans(items: WorkoutPlan[]): WorkoutPlan[] {
  return [...items].sort((a, b) => b.startDateKey.localeCompare(a.startDateKey))
}
