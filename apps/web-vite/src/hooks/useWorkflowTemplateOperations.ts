/**
 * useWorkspaceTemplateOperations Hook
 */

import { useState, useCallback, useMemo } from 'react'
import { toast } from 'sonner'
import { createLogger } from '@lifeos/core'
import { useAuth } from './useAuth'
import { createFirestoreWorkspaceTemplateRepository } from '@/adapters/agents/firestoreWorkspaceTemplateRepository'
import {
  createWorkspaceTemplateUsecase,
  updateWorkspaceTemplateUsecase,
  deleteWorkspaceTemplateUsecase,
  getWorkspaceTemplateUsecase,
  listWorkspaceTemplatesUsecase,
} from '@lifeos/agents'
import type {
  WorkspaceTemplate,
  WorkspaceTemplateId,
  CreateWorkspaceTemplateInput,
} from '@lifeos/agents'

const logger = createLogger('useWorkspaceTemplateOperations')
const repository = createFirestoreWorkspaceTemplateRepository()

export interface UseWorkspaceTemplateOperationsReturn {
  templates: WorkspaceTemplate[]
  isLoading: boolean
  error: Error | null

  createTemplate: (
    input: Omit<CreateWorkspaceTemplateInput, 'userId' | 'createdAtMs' | 'updatedAtMs'>
  ) => Promise<WorkspaceTemplate>
  updateTemplate: (
    templateId: WorkspaceTemplateId,
    updates: Partial<Omit<CreateWorkspaceTemplateInput, 'userId' | 'createdAtMs' | 'updatedAtMs'>>
  ) => Promise<WorkspaceTemplate>
  deleteTemplate: (templateId: WorkspaceTemplateId) => Promise<void>
  getTemplate: (templateId: WorkspaceTemplateId) => Promise<WorkspaceTemplate | null>
  loadTemplates: () => Promise<void>
}

export function useWorkspaceTemplateOperations(): UseWorkspaceTemplateOperationsReturn {
  const { user } = useAuth()
  const userId = user?.uid

  const [templates, setTemplates] = useState<WorkspaceTemplate[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const usecases = useMemo(
    () => ({
      create: createWorkspaceTemplateUsecase(repository),
      update: updateWorkspaceTemplateUsecase(repository),
      delete: deleteWorkspaceTemplateUsecase(repository),
      get: getWorkspaceTemplateUsecase(repository),
      list: listWorkspaceTemplatesUsecase(repository),
    }),
    []
  )

  const loadTemplates = useCallback(async () => {
    if (!userId) return
    setIsLoading(true)
    setError(null)
    try {
      const data = await usecases.list(userId)
      setTemplates(data)
    } catch (err) {
      const error = err as Error
      setError(error)
      logger.error('Failed to load workspace templates', error)
    } finally {
      setIsLoading(false)
    }
  }, [usecases, userId])

  const createTemplate = useCallback(
    async (
      input: Omit<CreateWorkspaceTemplateInput, 'userId' | 'createdAtMs' | 'updatedAtMs'>
    ): Promise<WorkspaceTemplate> => {
      if (!userId) throw new Error('User not authenticated')
      setIsLoading(true)
      setError(null)
      try {
        const template = await usecases.create(userId, input)
        setTemplates((prev) => [template, ...prev])
        toast.success('Workspace template saved')
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
      templateId: WorkspaceTemplateId,
      updates: Partial<Omit<CreateWorkspaceTemplateInput, 'userId' | 'createdAtMs' | 'updatedAtMs'>>
    ): Promise<WorkspaceTemplate> => {
      if (!userId) throw new Error('User not authenticated')
      setIsLoading(true)
      setError(null)
      try {
        const updated = await usecases.update(userId, templateId, updates)
        setTemplates((prev) =>
          prev.map((template) => (template.templateId === templateId ? updated : template))
        )
        toast.success('Workspace template updated')
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
    async (templateId: WorkspaceTemplateId): Promise<void> => {
      if (!userId) throw new Error('User not authenticated')
      setIsLoading(true)
      setError(null)
      try {
        await usecases.delete(userId, templateId)
        setTemplates((prev) => prev.filter((template) => template.templateId !== templateId))
        toast.success('Workspace template deleted')
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
    async (templateId: WorkspaceTemplateId): Promise<WorkspaceTemplate | null> => {
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
