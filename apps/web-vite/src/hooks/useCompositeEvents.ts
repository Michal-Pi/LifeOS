/**
 * useCompositeEvents Hook
 *
 * Manages fetching of composite calendar events.
 */

import { useState, useEffect, useCallback } from 'react'
import type { CompositeEvent } from '@lifeos/calendar'
import { createLogger } from '@lifeos/calendar'
import { createFirestoreCompositeRepository } from '@/adapters/firestoreCompositeRepository'

const logger = createLogger('useCompositeEvents')
const compositeRepository = createFirestoreCompositeRepository()

interface UseCompositeEventsOptions {
  userId: string
  startMs: number
  endMs: number
  enabled?: boolean
}

interface UseCompositeEventsResult {
  compositeEvents: CompositeEvent[]
  loading: boolean
  error: Error | null
  refetch: () => Promise<void>
}

export function useCompositeEvents({
  userId,
  startMs,
  endMs,
  enabled = true,
}: UseCompositeEventsOptions): UseCompositeEventsResult {
  const [compositeEvents, setCompositeEvents] = useState<CompositeEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const loadEvents = useCallback(async () => {
    if (!userId || !enabled) {
      setCompositeEvents([])
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      setError(null)
      const events = await compositeRepository.listByRange(userId, startMs, endMs)
      setCompositeEvents(events)
    } catch (err) {
      setError(err as Error)
      logger.error('Failed to load composite events', err)
    } finally {
      setLoading(false)
    }
  }, [userId, startMs, endMs, enabled])

  useEffect(() => {
    void loadEvents()
  }, [loadEvents])

  return {
    compositeEvents,
    loading,
    error,
    refetch: loadEvents,
  }
}
