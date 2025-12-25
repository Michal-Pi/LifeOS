/**
 * useSections Hook
 *
 * Provides CRUD operations for sections (subfolders within topics).
 * Manages section state, loading, and error handling.
 */

import { useState, useCallback, useEffect } from 'react'
import { useAuth } from './useAuth'
import { createFirestoreSectionRepository } from '@/adapters/notes/firestoreSectionRepository'
import type { Section, SectionId, TopicId, CreateSectionInput, UpdateSectionInput } from '@lifeos/notes'

export interface UseSectionsReturn {
  sections: Section[]
  isLoading: boolean
  error: Error | null
  createSection: (input: Omit<CreateSectionInput, 'userId'>) => Promise<Section>
  updateSection: (sectionId: SectionId, updates: UpdateSectionInput) => Promise<Section>
  deleteSection: (sectionId: SectionId) => Promise<void>
  getSection: (sectionId: SectionId) => Promise<Section | null>
  listSections: (topicId?: TopicId) => Promise<Section[]>
  reorderSections: (sectionIds: SectionId[]) => Promise<void>
}

const sectionRepository = createFirestoreSectionRepository()

/**
 * Hook for managing section operations
 */
export function useSections(topicId?: TopicId): UseSectionsReturn {
  const { user } = useAuth()
  const [sections, setSections] = useState<Section[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const userId = user?.uid

  // Create a new section
  const createSection = useCallback(
    async (input: Omit<CreateSectionInput, 'userId'>): Promise<Section> => {
      if (!userId) {
        throw new Error('User not authenticated')
      }

      setIsLoading(true)
      setError(null)

      try {
        const section = await sectionRepository.create(userId, input)

        setSections((prev) => [...prev, section].sort((a, b) => a.order - b.order))
        return section
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to create section')
        setError(error)
        throw error
      } finally {
        setIsLoading(false)
      }
    },
    [userId]
  )

  // Update an existing section
  const updateSection = useCallback(
    async (sectionId: SectionId, updates: UpdateSectionInput): Promise<Section> => {
      if (!userId) {
        throw new Error('User not authenticated')
      }

      setIsLoading(true)
      setError(null)

      try {
        const updatedSection = await sectionRepository.update(userId, sectionId, updates)

        setSections((prev) =>
          prev
            .map((s) => (s.sectionId === sectionId ? updatedSection : s))
            .sort((a, b) => a.order - b.order)
        )

        return updatedSection
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to update section')
        setError(error)
        throw error
      } finally {
        setIsLoading(false)
      }
    },
    [userId]
  )

  // Delete a section
  const deleteSection = useCallback(
    async (sectionId: SectionId): Promise<void> => {
      if (!userId) {
        throw new Error('User not authenticated')
      }

      setIsLoading(true)
      setError(null)

      try {
        await sectionRepository.delete(userId, sectionId)
        setSections((prev) => prev.filter((s) => s.sectionId !== sectionId))
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to delete section')
        setError(error)
        throw error
      } finally {
        setIsLoading(false)
      }
    },
    [userId]
  )

  // Get a single section
  const getSection = useCallback(
    async (sectionId: SectionId): Promise<Section | null> => {
      if (!userId) {
        throw new Error('User not authenticated')
      }

      setIsLoading(true)
      setError(null)

      try {
        const section = await sectionRepository.get(userId, sectionId)
        return section
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to get section')
        setError(error)
        throw error
      } finally {
        setIsLoading(false)
      }
    },
    [userId]
  )

  // List sections (optionally filtered by topic)
  const listSections = useCallback(
    async (filterTopicId?: TopicId): Promise<Section[]> => {
      if (!userId) {
        throw new Error('User not authenticated')
      }

      setIsLoading(true)
      setError(null)

      try {
        const fetchedSections = await sectionRepository.list(userId, filterTopicId)
        setSections(fetchedSections.sort((a, b) => a.order - b.order))
        return fetchedSections
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to list sections')
        setError(error)
        throw error
      } finally {
        setIsLoading(false)
      }
    },
    [userId]
  )

  // Reorder sections
  const reorderSections = useCallback(
    async (sectionIds: SectionId[]): Promise<void> => {
      if (!userId) {
        throw new Error('User not authenticated')
      }

      setIsLoading(true)
      setError(null)

      try {
        await sectionRepository.reorder(userId, sectionIds)

        // Update local state
        setSections((prev) => {
          const sectionMap = new Map(prev.map((s) => [s.sectionId, s]))
          return sectionIds
            .map((id, index) => {
              const section = sectionMap.get(id)
              return section ? { ...section, order: index } : null
            })
            .filter((s): s is Section => s !== null)
        })
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to reorder sections')
        setError(error)
        throw error
      } finally {
        setIsLoading(false)
      }
    },
    [userId]
  )

  // Load initial sections when user is authenticated or topicId changes
  useEffect(() => {
    if (userId) {
      listSections(topicId).catch(console.error)
    }
  }, [userId, topicId, listSections])

  return {
    sections,
    isLoading,
    error,
    createSection,
    updateSection,
    deleteSection,
    getSection,
    listSections,
    reorderSections,
  }
}
