import { newId } from '@lifeos/core'
import type {
  WorkoutTemplateRepository,
  WorkoutTemplate,
  TemplateId,
  CreateTemplateInput,
  UpdateTemplateInput,
  WorkoutContext,
} from '@lifeos/training'
import { createFirestoreWorkoutTemplateRepository } from './firestoreWorkoutTemplateRepository'
import {
  saveTemplateLocally,
  getTemplateLocally,
  listTemplatesLocally,
  listTemplatesByContextLocally,
  deleteTemplateLocally,
} from '@/training/offlineStore'
import { enqueueTrainingUpsert, enqueueTrainingDelete } from '@/training/outbox'
import { triggerTrainingSync } from '@/training/syncWorker'

const firestoreRepo = createFirestoreWorkoutTemplateRepository()

function shouldPreferLocal(template: WorkoutTemplate): boolean {
  return template.syncState !== 'synced'
}

export const createIndexedDbWorkoutTemplateRepository = (): WorkoutTemplateRepository => {
  return {
    async create(userId: string, input: CreateTemplateInput): Promise<WorkoutTemplate> {
      const now = Date.now()
      const templateId = newId('template') as TemplateId
      const template: WorkoutTemplate = {
        templateId,
        userId,
        title: input.title,
        context: input.context,
        items: input.items,
        createdAtMs: now,
        updatedAtMs: now,
        syncState: 'pending',
        version: 1,
      }

      await saveTemplateLocally(template)
      await enqueueTrainingUpsert('template', userId, templateId, template, 'create')
      triggerTrainingSync(userId)
      return template
    },

    async update(
      userId: string,
      templateId: TemplateId,
      updates: UpdateTemplateInput
    ): Promise<WorkoutTemplate> {
      let existing = await getTemplateLocally(templateId)
      if (!existing) {
        try {
          existing = await firestoreRepo.get(userId, templateId)
        } catch (error) {
          // Handle network errors gracefully - continue with local data
          const firebaseError = error as Error & { code?: string }
          if (firebaseError?.code === 'permission-denied' || 
              firebaseError?.code === 'unavailable' ||
              firebaseError?.message?.includes('Failed to fetch') ||
              firebaseError?.message?.includes('network')) {
            console.warn('Network error fetching template for update, falling back to local:', firebaseError.code || firebaseError.message)
          } else {
            console.error('Unexpected error fetching template from Firestore:', error)
          }
        }
      }
      if (!existing) {
        throw new Error(`Template ${templateId} not found`)
      }

      const updated: WorkoutTemplate = {
        ...existing,
        ...updates,
        updatedAtMs: Date.now(),
        version: existing.version + 1,
        syncState: 'pending',
      }

      await saveTemplateLocally(updated)
      await enqueueTrainingUpsert('template', userId, templateId, updated, 'update')
      triggerTrainingSync(userId)
      return updated
    },

    async delete(userId: string, templateId: TemplateId): Promise<void> {
      await deleteTemplateLocally(templateId)
      await enqueueTrainingDelete('template', userId, templateId)
      triggerTrainingSync(userId)
    },

    async get(userId: string, templateId: TemplateId): Promise<WorkoutTemplate | null> {
      const local = await getTemplateLocally(templateId)
      
      // Always try Firestore first, fall back to local on network errors
      try {
        const remote = await firestoreRepo.get(userId, templateId)
        if (!remote) return local

        if (!local || !shouldPreferLocal(local)) {
          await saveTemplateLocally(remote)
          return remote
        }

        return local
      } catch (error) {
        // Handle network errors gracefully
        const firebaseError = error as Error & { code?: string }
        if (firebaseError?.code === 'permission-denied' || 
            firebaseError?.code === 'unavailable' ||
            firebaseError?.message?.includes('Failed to fetch') ||
            firebaseError?.message?.includes('network')) {
          console.warn('Network error fetching template, falling back to local:', firebaseError.code || firebaseError.message)
        } else {
          console.error('Unexpected error fetching template from Firestore:', error)
        }
        return local
      }
    },

    async list(userId: string, options?: { context?: WorkoutContext }): Promise<WorkoutTemplate[]> {
      const localItems = options?.context
        ? await listTemplatesByContextLocally(userId, options.context)
        : await listTemplatesLocally(userId)

      // Always try Firestore first, fall back to local on network errors
      let remoteItems: WorkoutTemplate[] = []
      try {
        remoteItems = options?.context
          ? firestoreRepo.listByContext
            ? await firestoreRepo.listByContext(userId, options.context)
            : await firestoreRepo.list(userId, options)
          : await firestoreRepo.list(userId)
      } catch (error) {
        // Handle network errors gracefully - return local data
        const firebaseError = error as Error & { code?: string }
        const isNetworkError =
          firebaseError?.code === 'permission-denied' ||
          firebaseError?.code === 'PERMISSION_DENIED' ||
          firebaseError?.code === 'unavailable' ||
          firebaseError?.message?.includes('Missing or insufficient permissions') ||
          firebaseError?.message?.includes('Failed to fetch') ||
          firebaseError?.message?.includes('network')
        
        if (isNetworkError) {
          console.warn('Network error listing templates, falling back to local:', firebaseError.code || firebaseError.message)
          return sortTemplates(localItems)
        }
        // Log unexpected errors but still return local data
        console.error('Unexpected error listing templates from Firestore:', error)
        return sortTemplates(localItems)
      }

      const localMap = new Map(localItems.map((item) => [item.templateId, item]))
      const merged: WorkoutTemplate[] = []

      for (const remote of remoteItems) {
        const local = localMap.get(remote.templateId)
        if (local && shouldPreferLocal(local)) {
          merged.push(local)
        } else {
          merged.push(remote)
          await saveTemplateLocally(remote)
        }
        localMap.delete(remote.templateId)
      }

      for (const local of localMap.values()) {
        merged.push(local)
      }

      return sortTemplates(merged)
    },

    async listByContext(userId: string, context: WorkoutContext): Promise<WorkoutTemplate[]> {
      return this.list(userId, { context })
    },
  }
}

function sortTemplates(items: WorkoutTemplate[]): WorkoutTemplate[] {
  return [...items].sort((a, b) => a.title.localeCompare(b.title))
}
