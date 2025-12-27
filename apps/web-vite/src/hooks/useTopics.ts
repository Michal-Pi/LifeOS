/**
 * useTopics Hook
 *
 * Provides CRUD operations for topics (folders).
 * Manages topic state, loading, and error handling.
 */

import { useState, useCallback, useEffect } from 'react'
import { useAuth } from './useAuth'
import { createFirestoreTopicRepository } from '@/adapters/notes/firestoreTopicRepository'
import type { Topic, TopicId, CreateTopicInput, UpdateTopicInput } from '@lifeos/notes'

export interface UseTopicsReturn {
  topics: Topic[]
  isLoading: boolean
  error: Error | null
  createTopic: (input: Omit<CreateTopicInput, 'userId'>) => Promise<Topic>
  updateTopic: (topicId: TopicId, updates: UpdateTopicInput) => Promise<Topic>
  deleteTopic: (topicId: TopicId) => Promise<void>
  getTopic: (topicId: TopicId) => Promise<Topic | null>
  listTopics: () => Promise<Topic[]>
  reorderTopics: (topicIds: TopicId[]) => Promise<void>
}

const topicRepository = createFirestoreTopicRepository()

/**
 * Hook for managing topic operations
 */
export function useTopics(): UseTopicsReturn {
  const { user } = useAuth()
  const [topics, setTopics] = useState<Topic[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const userId = user?.uid

  // Create a new topic
  const createTopic = useCallback(
    async (input: Omit<CreateTopicInput, 'userId'>): Promise<Topic> => {
      if (!userId) {
        throw new Error('User not authenticated')
      }

      setIsLoading(true)
      setError(null)

      try {
        const topic = await topicRepository.create(userId, {
          ...input,
          parentTopicId: input.parentTopicId || null,
        })

        setTopics((prev) => [...prev, topic].sort((a, b) => a.order - b.order))
        return topic
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to create topic')
        setError(error)
        throw error
      } finally {
        setIsLoading(false)
      }
    },
    [userId]
  )

  // Update an existing topic
  const updateTopic = useCallback(
    async (topicId: TopicId, updates: UpdateTopicInput): Promise<Topic> => {
      if (!userId) {
        throw new Error('User not authenticated')
      }

      setIsLoading(true)
      setError(null)

      try {
        const updatedTopic = await topicRepository.update(userId, topicId, updates)

        setTopics((prev) =>
          prev
            .map((t) => (t.topicId === topicId ? updatedTopic : t))
            .sort((a, b) => a.order - b.order)
        )

        return updatedTopic
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to update topic')
        setError(error)
        throw error
      } finally {
        setIsLoading(false)
      }
    },
    [userId]
  )

  // Delete a topic
  const deleteTopic = useCallback(
    async (topicId: TopicId): Promise<void> => {
      if (!userId) {
        throw new Error('User not authenticated')
      }

      setIsLoading(true)
      setError(null)

      try {
        await topicRepository.delete(userId, topicId)
        setTopics((prev) => prev.filter((t) => t.topicId !== topicId))
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to delete topic')
        setError(error)
        throw error
      } finally {
        setIsLoading(false)
      }
    },
    [userId]
  )

  // Get a single topic
  const getTopic = useCallback(
    async (topicId: TopicId): Promise<Topic | null> => {
      if (!userId) {
        throw new Error('User not authenticated')
      }

      setIsLoading(true)
      setError(null)

      try {
        const topic = await topicRepository.get(userId, topicId)
        return topic
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to get topic')
        setError(error)
        throw error
      } finally {
        setIsLoading(false)
      }
    },
    [userId]
  )

  // List all topics
  const listTopics = useCallback(async (): Promise<Topic[]> => {
    if (!userId) {
      throw new Error('User not authenticated')
    }

    setIsLoading(true)
    setError(null)

    try {
      const fetchedTopics = await topicRepository.list(userId)
      setTopics(fetchedTopics.sort((a, b) => a.order - b.order))
      return fetchedTopics
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to list topics')
      setError(error)
      throw error
    } finally {
      setIsLoading(false)
    }
  }, [userId])

  // Reorder topics
  const reorderTopics = useCallback(
    async (topicIds: TopicId[]): Promise<void> => {
      if (!userId) {
        throw new Error('User not authenticated')
      }

      setIsLoading(true)
      setError(null)

      try {
        await topicRepository.reorder(userId, topicIds)

        // Update local state
        setTopics((prev) => {
          const topicMap = new Map(prev.map((t) => [t.topicId, t]))
          return topicIds
            .map((id, index) => {
              const topic = topicMap.get(id)
              return topic ? { ...topic, order: index } : null
            })
            .filter((t): t is Topic => t !== null)
        })
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to reorder topics')
        setError(error)
        throw error
      } finally {
        setIsLoading(false)
      }
    },
    [userId]
  )

  // Load initial topics when user is authenticated
  useEffect(() => {
    if (userId) {
      listTopics().catch(console.error)
    }
  }, [userId, listTopics])

  return {
    topics,
    isLoading,
    error,
    createTopic,
    updateTopic,
    deleteTopic,
    getTopic,
    listTopics,
    reorderTopics,
  }
}
