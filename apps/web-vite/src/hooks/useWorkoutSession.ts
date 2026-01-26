/**
 * useWorkoutSession Hook
 *
 * Manages a single workout session with offline-first repository.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from './useAuth'
import { useTrainingSync } from './useTrainingSync'
import { createIndexedDbWorkoutSessionRepository } from '@/adapters/training/indexedDbWorkoutSessionRepository'
import { getSessionUsecase, updateSessionUsecase, deleteSessionUsecase } from '@lifeos/training'
import type { WorkoutSession, SessionId, UpdateSessionInput } from '@lifeos/training'

const sessionRepository = createIndexedDbWorkoutSessionRepository()

export interface UseWorkoutSessionReturn {
  session: WorkoutSession | null
  isLoading: boolean
  error: Error | null
  refresh: () => Promise<WorkoutSession | null>
  updateSession: (updates: UpdateSessionInput) => Promise<WorkoutSession>
  completeSession: () => Promise<WorkoutSession>
  deleteSession: () => Promise<void>
}

export function useWorkoutSession(sessionId: SessionId | null): UseWorkoutSessionReturn {
  const { user } = useAuth()
  useTrainingSync()

  const [session, setSession] = useState<WorkoutSession | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const userId = user?.uid

  const usecases = useMemo(
    () => ({
      getSession: getSessionUsecase(sessionRepository),
      updateSession: updateSessionUsecase(sessionRepository),
      deleteSession: deleteSessionUsecase(sessionRepository),
    }),
    []
  )

  const refresh = useCallback(async (): Promise<WorkoutSession | null> => {
    if (!userId || !sessionId) return null
    setIsLoading(true)
    setError(null)
    try {
      const result = await usecases.getSession(userId, sessionId)
      setSession(result)
      return result
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to load session')
      setError(error)
      throw error
    } finally {
      setIsLoading(false)
    }
  }, [userId, sessionId, usecases])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const updateSession = useCallback(
    async (updates: UpdateSessionInput): Promise<WorkoutSession> => {
      if (!userId || !sessionId) throw new Error('Session not loaded')
      setIsLoading(true)
      setError(null)
      try {
        const updated = await usecases.updateSession(userId, sessionId, updates)
        setSession(updated)
        return updated
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to update session')
        setError(error)
        throw error
      } finally {
        setIsLoading(false)
      }
    },
    [userId, sessionId, usecases]
  )

  const completeSession = useCallback(async (): Promise<WorkoutSession> => {
    if (!userId || !sessionId) throw new Error('Session not loaded')
    const now = Date.now()
    const durationSec =
      session?.startedAtMs && session.startedAtMs <= now
        ? Math.round((now - session.startedAtMs) / 1000)
        : session?.durationSec

    return updateSession({
      status: 'completed',
      completedAtMs: now,
      durationSec,
    })
  }, [userId, sessionId, session, updateSession])

  const deleteSession = useCallback(async (): Promise<void> => {
    if (!userId || !sessionId) throw new Error('Session not loaded')
    setIsLoading(true)
    setError(null)
    try {
      await usecases.deleteSession(userId, sessionId)
      setSession(null)
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to delete session')
      setError(error)
      throw error
    } finally {
      setIsLoading(false)
    }
  }, [userId, sessionId, usecases])

  return {
    session,
    isLoading,
    error,
    refresh,
    updateSession,
    completeSession,
    deleteSession,
  }
}
