/**
 * useWorkoutTemplates Hook
 *
 * React wrapper for workout template operations.
 */

import { useState, useCallback } from 'react'
import { useAuth } from './useAuth'
import { useTrainingSync } from './useTrainingSync'
import { createIndexedDbWorkoutTemplateRepository } from '@/adapters/training/indexedDbWorkoutTemplateRepository'
import type {
  WorkoutTemplate,
  TemplateId,
  CreateTemplateInput,
  UpdateTemplateInput,
  WorkoutContext,
} from '@lifeos/training'

const templateRepository = createIndexedDbWorkoutTemplateRepository()

export interface UseWorkoutTemplatesReturn {
  templates: WorkoutTemplate[]
  isLoading: boolean
  error: Error | null

  createTemplate: (input: Omit<CreateTemplateInput, 'userId'>) => Promise<WorkoutTemplate>
  updateTemplate: (templateId: TemplateId, updates: UpdateTemplateInput) => Promise<WorkoutTemplate>
  deleteTemplate: (templateId: TemplateId) => Promise<void>
  getTemplate: (templateId: TemplateId) => Promise<WorkoutTemplate | null>
  listTemplates: () => Promise<WorkoutTemplate[]>
  listTemplatesByContext: (context: WorkoutContext) => Promise<WorkoutTemplate[]>
}

export function useWorkoutTemplates(): UseWorkoutTemplatesReturn {
  const { user } = useAuth()
  useTrainingSync()
  const userId = user?.uid ?? ''

  const [templates, setTemplates] = useState<WorkoutTemplate[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const createTemplate = useCallback(
    async (input: Omit<CreateTemplateInput, 'userId'>): Promise<WorkoutTemplate> => {
      if (!userId) throw new Error('User not authenticated')

      setIsLoading(true)
      setError(null)

      try {
        const template = await templateRepository.create(userId, {
          ...input,
          userId,
        })

        setTemplates((prev) => [...prev, template])
        return template
      } catch (err) {
        const error = err as Error
        setError(error)
        throw error
      } finally {
        setIsLoading(false)
      }
    },
    [userId]
  )

  const updateTemplate = useCallback(
    async (templateId: TemplateId, updates: UpdateTemplateInput): Promise<WorkoutTemplate> => {
      if (!userId) throw new Error('User not authenticated')

      setIsLoading(true)
      setError(null)

      try {
        const updated = await templateRepository.update(userId, templateId, updates)

        setTemplates((prev) => prev.map((t) => (t.templateId === templateId ? updated : t)))
        return updated
      } catch (err) {
        const error = err as Error
        setError(error)
        throw error
      } finally {
        setIsLoading(false)
      }
    },
    [userId]
  )

  const deleteTemplate = useCallback(
    async (templateId: TemplateId): Promise<void> => {
      if (!userId) throw new Error('User not authenticated')

      setIsLoading(true)
      setError(null)

      try {
        await templateRepository.delete(userId, templateId)
        setTemplates((prev) => prev.filter((t) => t.templateId !== templateId))
      } catch (err) {
        const error = err as Error
        setError(error)
        throw error
      } finally {
        setIsLoading(false)
      }
    },
    [userId]
  )

  const getTemplate = useCallback(
    async (templateId: TemplateId): Promise<WorkoutTemplate | null> => {
      if (!userId) throw new Error('User not authenticated')

      setIsLoading(true)
      setError(null)

      try {
        const template = await templateRepository.get(userId, templateId)
        return template
      } catch (err) {
        const error = err as Error
        setError(error)
        throw error
      } finally {
        setIsLoading(false)
      }
    },
    [userId]
  )

  const listTemplates = useCallback(async (): Promise<WorkoutTemplate[]> => {
    if (!userId) throw new Error('User not authenticated')

    setIsLoading(true)
    setError(null)

    try {
      const list = await templateRepository.list(userId)
      setTemplates(list)
      return list
    } catch (err) {
      const error = err as Error
      setError(error)
      throw error
    } finally {
      setIsLoading(false)
    }
  }, [userId])

  const listTemplatesByContext = useCallback(
    async (context: WorkoutContext): Promise<WorkoutTemplate[]> => {
      if (!userId) throw new Error('User not authenticated')

      setIsLoading(true)
      setError(null)

      try {
        const list = await templateRepository.listByContext(userId, context)
        return list
      } catch (err) {
        const error = err as Error
        setError(error)
        throw error
      } finally {
        setIsLoading(false)
      }
    },
    [userId]
  )

  return {
    templates,
    isLoading,
    error,
    createTemplate,
    updateTemplate,
    deleteTemplate,
    getTemplate,
    listTemplates,
    listTemplatesByContext,
  }
}
