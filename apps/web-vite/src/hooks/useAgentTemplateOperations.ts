/**
 * useAgentTemplateOperations Hook
 */

import { useState, useCallback, useMemo } from 'react'
import { toast } from 'sonner'
import { createLogger } from '@lifeos/core'
import { useAuth } from './useAuth'
import { createFirestoreAgentTemplateRepository } from '@/adapters/agents/firestoreAgentTemplateRepository'
import {
  createAgentTemplateUsecase,
  updateAgentTemplateUsecase,
  deleteAgentTemplateUsecase,
  getAgentTemplateUsecase,
  listAgentTemplatesUsecase,
} from '@lifeos/agents'
import type { AgentTemplate, AgentTemplateId, CreateAgentTemplateInput } from '@lifeos/agents'

const logger = createLogger('useAgentTemplateOperations')
const repository = createFirestoreAgentTemplateRepository()

export interface UseAgentTemplateOperationsReturn {
  templates: AgentTemplate[]
  isLoading: boolean
  error: Error | null

  createTemplate: (
    input: Omit<CreateAgentTemplateInput, 'userId' | 'createdAtMs' | 'updatedAtMs'>
  ) => Promise<AgentTemplate>
  updateTemplate: (
    templateId: AgentTemplateId,
    updates: Partial<Omit<CreateAgentTemplateInput, 'userId' | 'createdAtMs' | 'updatedAtMs'>>
  ) => Promise<AgentTemplate>
  deleteTemplate: (templateId: AgentTemplateId) => Promise<void>
  getTemplate: (templateId: AgentTemplateId) => Promise<AgentTemplate | null>
  loadTemplates: () => Promise<void>
}

export function useAgentTemplateOperations(): UseAgentTemplateOperationsReturn {
  const { user } = useAuth()
  const userId = user?.uid

  const [templates, setTemplates] = useState<AgentTemplate[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const usecases = useMemo(
    () => ({
      create: createAgentTemplateUsecase(repository),
      update: updateAgentTemplateUsecase(repository),
      delete: deleteAgentTemplateUsecase(repository),
      get: getAgentTemplateUsecase(repository),
      list: listAgentTemplatesUsecase(repository),
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
      logger.error('Failed to load agent templates', error)
    } finally {
      setIsLoading(false)
    }
  }, [usecases, userId])

  const createTemplate = useCallback(
    async (
      input: Omit<CreateAgentTemplateInput, 'userId' | 'createdAtMs' | 'updatedAtMs'>
    ): Promise<AgentTemplate> => {
      if (!userId) throw new Error('User not authenticated')
      setIsLoading(true)
      setError(null)
      try {
        const template = await usecases.create(userId, input)
        setTemplates((prev) => [template, ...prev])
        toast.success('Agent template saved')
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
      templateId: AgentTemplateId,
      updates: Partial<Omit<CreateAgentTemplateInput, 'userId' | 'createdAtMs' | 'updatedAtMs'>>
    ): Promise<AgentTemplate> => {
      if (!userId) throw new Error('User not authenticated')
      setIsLoading(true)
      setError(null)
      try {
        const updated = await usecases.update(userId, templateId, updates)
        setTemplates((prev) =>
          prev.map((template) => (template.templateId === templateId ? updated : template))
        )
        toast.success('Agent template updated')
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
    async (templateId: AgentTemplateId): Promise<void> => {
      if (!userId) throw new Error('User not authenticated')
      setIsLoading(true)
      setError(null)
      try {
        await usecases.delete(userId, templateId)
        setTemplates((prev) => prev.filter((template) => template.templateId !== templateId))
        toast.success('Agent template deleted')
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
    async (templateId: AgentTemplateId): Promise<AgentTemplate | null> => {
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
