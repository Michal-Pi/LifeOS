/**
 * useWorkflowTemplateOperations Hook
 */

import { useState, useCallback, useMemo, useRef } from 'react'
import { toast } from 'sonner'
import { createLogger } from '@lifeos/core'
import { useAuth } from './useAuth'
import { createFirestoreWorkflowTemplateRepository } from '@/adapters/agents/firestoreWorkflowTemplateRepository'
import {
  listWorkflowTemplatesLocally,
  bulkSaveWorkflowTemplatesLocally,
  saveWorkflowTemplateLocally,
  deleteWorkflowTemplateLocally,
} from '@/agents/offlineStore'
import {
  createWorkflowTemplateUsecase,
  updateWorkflowTemplateUsecase,
  deleteWorkflowTemplateUsecase,
  getWorkflowTemplateUsecase,
  listWorkflowTemplatesUsecase,
} from '@lifeos/agents'
import type {
  WorkflowTemplate,
  WorkflowTemplateId,
  CreateWorkflowTemplateInput,
} from '@lifeos/agents'

const logger = createLogger('useWorkflowTemplateOperations')
const repository = createFirestoreWorkflowTemplateRepository()

export interface UseWorkflowTemplateOperationsReturn {
  templates: WorkflowTemplate[]
  isLoading: boolean
  error: Error | null

  createTemplate: (
    input: Omit<CreateWorkflowTemplateInput, 'userId' | 'createdAtMs' | 'updatedAtMs'>
  ) => Promise<WorkflowTemplate>
  updateTemplate: (
    templateId: WorkflowTemplateId,
    updates: Partial<Omit<CreateWorkflowTemplateInput, 'userId' | 'createdAtMs' | 'updatedAtMs'>>
  ) => Promise<WorkflowTemplate>
  deleteTemplate: (templateId: WorkflowTemplateId) => Promise<void>
  getTemplate: (templateId: WorkflowTemplateId) => Promise<WorkflowTemplate | null>
  loadTemplates: () => Promise<void>
}

export function useWorkflowTemplateOperations(): UseWorkflowTemplateOperationsReturn {
  const { user } = useAuth()
  const userId = user?.uid

  const [templates, setTemplates] = useState<WorkflowTemplate[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const templatesRef = useRef(templates)
  templatesRef.current = templates

  const usecases = useMemo(
    () => ({
      create: createWorkflowTemplateUsecase(repository),
      update: updateWorkflowTemplateUsecase(repository),
      delete: deleteWorkflowTemplateUsecase(repository),
      get: getWorkflowTemplateUsecase(repository),
      list: listWorkflowTemplatesUsecase(repository),
    }),
    []
  )

  const loadTemplates = useCallback(async () => {
    if (!userId) return
    setIsLoading(true)
    setError(null)
    try {
      // Local cache first
      const local = await listWorkflowTemplatesLocally(userId)
      if (local.length > 0) setTemplates(local)

      const data = await usecases.list(userId)
      setTemplates(data)
      void bulkSaveWorkflowTemplatesLocally(data)
    } catch (err) {
      // Keep local data if Firestore fails
      if (templatesRef.current.length > 0) return
      const error = err as Error
      setError(error)
      logger.error('Failed to load workflow templates', error)
    } finally {
      setIsLoading(false)
    }
  }, [usecases, userId])

  const createTemplate = useCallback(
    async (
      input: Omit<CreateWorkflowTemplateInput, 'userId' | 'createdAtMs' | 'updatedAtMs'>
    ): Promise<WorkflowTemplate> => {
      if (!userId) throw new Error('User not authenticated')
      setIsLoading(true)
      setError(null)
      try {
        const template = await usecases.create(userId, input)
        setTemplates((prev) => [template, ...prev])
        void saveWorkflowTemplateLocally(template)
        toast.success('Workflow template saved')
        return template
      } catch (err) {
        const error = err as Error
        setError(error)
        toast.error('Failed to save template', { description: error.message })
        throw err
      } finally {
        setIsLoading(false)
      }
    },
    [usecases, userId]
  )

  const updateTemplate = useCallback(
    async (
      templateId: WorkflowTemplateId,
      updates: Partial<Omit<CreateWorkflowTemplateInput, 'userId' | 'createdAtMs' | 'updatedAtMs'>>
    ): Promise<WorkflowTemplate> => {
      if (!userId) throw new Error('User not authenticated')
      setIsLoading(true)
      setError(null)
      try {
        const updated = await usecases.update(userId, templateId, updates)
        setTemplates((prev) =>
          prev.map((template) => (template.templateId === templateId ? updated : template))
        )
        void saveWorkflowTemplateLocally(updated)
        toast.success('Workflow template updated')
        return updated
      } catch (err) {
        const error = err as Error
        setError(error)
        toast.error('Failed to update template', { description: error.message })
        throw err
      } finally {
        setIsLoading(false)
      }
    },
    [usecases, userId]
  )

  const deleteTemplate = useCallback(
    async (templateId: WorkflowTemplateId): Promise<void> => {
      if (!userId) throw new Error('User not authenticated')
      setIsLoading(true)
      setError(null)
      try {
        await usecases.delete(userId, templateId)
        setTemplates((prev) => prev.filter((template) => template.templateId !== templateId))
        void deleteWorkflowTemplateLocally(templateId)
        toast.success('Workflow template deleted')
      } catch (err) {
        const error = err as Error
        setError(error)
        toast.error('Failed to delete template', { description: error.message })
        throw err
      } finally {
        setIsLoading(false)
      }
    },
    [usecases, userId]
  )

  const getTemplate = useCallback(
    async (templateId: WorkflowTemplateId): Promise<WorkflowTemplate | null> => {
      if (!userId) throw new Error('User not authenticated')
      return usecases.get(userId, templateId)
    },
    [usecases, userId]
  )

  return {
    templates,
    isLoading,
    error,
    createTemplate,
    updateTemplate,
    deleteTemplate,
    getTemplate,
    loadTemplates,
  }
}
