import { useState, useEffect, useCallback, useMemo } from 'react'
import { useAuth } from './useAuth'
import { createFirestorePromptLibraryRepository } from '@/adapters/agents/firestorePromptLibraryRepository'
import { seedPromptLibrary } from '@/services/promptLibrary/seedTemplates'
import type {
  PromptTemplate,
  PromptTemplateId,
  CreatePromptTemplateInput,
  UpdatePromptTemplateInput,
  PromptType,
  PromptCategory,
} from '@lifeos/agents'

export function usePromptLibrary(filters?: {
  type?: PromptType
  category?: PromptCategory
  tags?: string[]
}) {
  const { user } = useAuth()
  const [templateState, setTemplateState] = useState<{
    key: string | null
    templates: PromptTemplate[]
  }>({ key: null, templates: [] })

  const repository = useMemo(() => createFirestorePromptLibraryRepository(), [])
  const filterKey = useMemo(() => {
    if (!user) return null
    const tags = filters?.tags ? [...filters.tags].sort().join('|') : ''
    return `${user.uid}:${filters?.type ?? ''}:${filters?.category ?? ''}:${tags}`
  }, [filters, user])

  const loadTemplates = useCallback(async () => {
    if (!user || !filterKey) {
      return
    }

    const data = await repository.list(user.uid, filters)
    if (data.length === 0 && !filters) {
      await seedPromptLibrary(user.uid, repository)
      const seeded = await repository.list(user.uid, filters)
      setTemplateState({ key: filterKey, templates: seeded })
      return
    }
    setTemplateState({ key: filterKey, templates: data })
  }, [filterKey, filters, repository, user])

  useEffect(() => {
    if (!filterKey) return
    repository
      .list(user?.uid ?? '', filters)
      .then(async (data) => {
        if (!user) return
        if (data.length === 0 && !filters) {
          await seedPromptLibrary(user.uid, repository)
          const seeded = await repository.list(user.uid, filters)
          setTemplateState({ key: filterKey, templates: seeded })
          return
        }
        setTemplateState({ key: filterKey, templates: data })
      })
      .catch(() => {})
  }, [filterKey, filters, repository, user])

  const createTemplate = useCallback(
    async (input: CreatePromptTemplateInput) => {
      if (!user) return null
      const template = await repository.create(user.uid, input)
      setTemplateState((prev) => ({
        key: prev.key,
        templates: [template, ...prev.templates],
      }))
      return template
    },
    [user, repository]
  )

  const updateTemplate = useCallback(
    async (templateId: PromptTemplateId, updates: UpdatePromptTemplateInput) => {
      if (!user) return null
      const updated = await repository.update(user.uid, templateId, updates)
      setTemplateState((prev) => ({
        key: prev.key,
        templates: prev.templates.map((template) =>
          template.templateId === templateId ? updated : template
        ),
      }))
      return updated
    },
    [user, repository]
  )

  const deleteTemplate = useCallback(
    async (templateId: PromptTemplateId) => {
      if (!user) return
      await repository.delete(user.uid, templateId)
      setTemplateState((prev) => ({
        key: prev.key,
        templates: prev.templates.filter((template) => template.templateId !== templateId),
      }))
    },
    [user, repository]
  )

  const restoreVersion = useCallback(
    async (templateId: PromptTemplateId, version: number) => {
      if (!user) return null
      const restored = await repository.restoreVersion(user.uid, templateId, version)
      setTemplateState((prev) => ({
        key: prev.key,
        templates: prev.templates.map((template) =>
          template.templateId === templateId ? restored : template
        ),
      }))
      return restored
    },
    [user, repository]
  )

  const getVersion = useCallback(
    async (templateId: PromptTemplateId, version: number): Promise<PromptTemplate | null> => {
      if (!user) return null
      return repository.getVersion(user.uid, templateId, version)
    },
    [repository, user]
  )

  const incrementUsage = useCallback(
    async (templateId: PromptTemplateId) => {
      if (!user) return
      await repository.incrementUsage(user.uid, templateId)
    },
    [repository, user]
  )

  const getUsageStats = useCallback(async () => {
    if (!user) return []
    return repository.getUsageStats(user.uid)
  }, [repository, user])

  return {
    templates: filterKey === templateState.key ? templateState.templates : [],
    loading: Boolean(filterKey && templateState.key !== filterKey),
    loadTemplates,
    createTemplate,
    updateTemplate,
    deleteTemplate,
    restoreVersion,
    getVersion,
    incrementUsage,
    getUsageStats,
  }
}
