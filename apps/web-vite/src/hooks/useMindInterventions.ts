/**
 * useMindInterventions Hook
 *
 * Provides operations for Mind Engine interventions and sessions using Firestore repositories.
 * Manages intervention state, loading, and error handling.
 */

import { useState, useCallback } from 'react'
import { useAuth } from './useAuth'
import { createFirestoreInterventionRepository } from '@/adapters/mind/firestoreInterventionRepository'
import { createFirestoreSessionRepository } from '@/adapters/mind/firestoreSessionRepository'
import type {
  CanonicalInterventionPreset,
  InterventionId,
  CreateInterventionInput,
  UpdateInterventionInput,
  CanonicalInterventionSession,
  SessionId,
  CreateSessionInput,
  CompleteSessionInput,
  InterventionType,
  FeelingState,
} from '@lifeos/mind'

export interface UseMindInterventionsReturn {
  interventions: CanonicalInterventionPreset[]
  sessions: CanonicalInterventionSession[]
  isLoading: boolean
  error: Error | null

  // Intervention operations
  createIntervention: (input: CreateInterventionInput) => Promise<CanonicalInterventionPreset>
  updateIntervention: (
    interventionId: InterventionId,
    updates: UpdateInterventionInput
  ) => Promise<CanonicalInterventionPreset>
  deleteIntervention: (interventionId: InterventionId) => Promise<void>
  getIntervention: (interventionId: InterventionId) => Promise<CanonicalInterventionPreset | null>
  listUserInterventions: () => Promise<CanonicalInterventionPreset[]>
  listSystemInterventions: () => Promise<CanonicalInterventionPreset[]>
  listInterventionsByType: (type: InterventionType) => Promise<CanonicalInterventionPreset[]>
  listInterventionsByFeeling: (feeling: FeelingState) => Promise<CanonicalInterventionPreset[]>

  // Session operations
  startSession: (input: CreateSessionInput) => Promise<CanonicalInterventionSession>
  completeSession: (
    sessionId: SessionId,
    completion: CompleteSessionInput
  ) => Promise<CanonicalInterventionSession>
  getSession: (sessionId: SessionId) => Promise<CanonicalInterventionSession | null>
  listSessionsForDate: (dateKey: string) => Promise<CanonicalInterventionSession[]>
  listRecentSessions: (limit?: number) => Promise<CanonicalInterventionSession[]>
  listSessionsForDateRange: (
    startDate: string,
    endDate: string
  ) => Promise<CanonicalInterventionSession[]>
}

const interventionRepository = createFirestoreInterventionRepository()
const sessionRepository = createFirestoreSessionRepository()

/**
 * Hook for managing Mind Engine interventions and sessions
 */
export function useMindInterventions(): UseMindInterventionsReturn {
  const { user } = useAuth()
  const [interventions, setInterventions] = useState<CanonicalInterventionPreset[]>([])
  const [sessions, setSessions] = useState<CanonicalInterventionSession[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const userId = user?.uid

  // ============================================================================
  // Intervention Operations
  // ============================================================================

  const createIntervention = useCallback(
    async (input: CreateInterventionInput): Promise<CanonicalInterventionPreset> => {
      if (!userId) {
        throw new Error('User not authenticated')
      }

      setIsLoading(true)
      setError(null)

      try {
        const intervention = await interventionRepository.create(userId, input)
        setInterventions((prev) => [intervention, ...prev])
        return intervention
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to create intervention')
        setError(error)
        throw error
      } finally {
        setIsLoading(false)
      }
    },
    [userId]
  )

  const updateIntervention = useCallback(
    async (
      interventionId: InterventionId,
      updates: UpdateInterventionInput
    ): Promise<CanonicalInterventionPreset> => {
      if (!userId) {
        throw new Error('User not authenticated')
      }

      setIsLoading(true)
      setError(null)

      try {
        const updatedIntervention = await interventionRepository.update(
          userId,
          interventionId,
          updates
        )
        setInterventions((prev) =>
          prev.map((i) => (i.interventionId === interventionId ? updatedIntervention : i))
        )
        return updatedIntervention
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to update intervention')
        setError(error)
        throw error
      } finally {
        setIsLoading(false)
      }
    },
    [userId]
  )

  const deleteIntervention = useCallback(
    async (interventionId: InterventionId): Promise<void> => {
      if (!userId) {
        throw new Error('User not authenticated')
      }

      setIsLoading(true)
      setError(null)

      try {
        await interventionRepository.delete(userId, interventionId)
        setInterventions((prev) => prev.filter((i) => i.interventionId !== interventionId))
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to delete intervention')
        setError(error)
        throw error
      } finally {
        setIsLoading(false)
      }
    },
    [userId]
  )

  const getIntervention = useCallback(
    async (interventionId: InterventionId): Promise<CanonicalInterventionPreset | null> => {
      setIsLoading(true)
      setError(null)

      try {
        const intervention = await interventionRepository.get(interventionId)
        return intervention
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to get intervention')
        setError(error)
        throw error
      } finally {
        setIsLoading(false)
      }
    },
    []
  )

  const listUserInterventions = useCallback(async (): Promise<CanonicalInterventionPreset[]> => {
    if (!userId) {
      throw new Error('User not authenticated')
    }

    setIsLoading(true)
    setError(null)

    try {
      const fetchedInterventions = await interventionRepository.listUserPresets(userId)
      setInterventions(fetchedInterventions)
      return fetchedInterventions
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to list user interventions')
      setError(error)
      throw error
    } finally {
      setIsLoading(false)
    }
  }, [userId])

  const listSystemInterventions = useCallback(async (): Promise<CanonicalInterventionPreset[]> => {
    setIsLoading(true)
    setError(null)

    try {
      const systemInterventions = await interventionRepository.listSystemPresets()
      return systemInterventions
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to list system interventions')
      setError(error)
      throw error
    } finally {
      setIsLoading(false)
    }
  }, [])

  const listInterventionsByType = useCallback(
    async (type: InterventionType): Promise<CanonicalInterventionPreset[]> => {
      setIsLoading(true)
      setError(null)

      try {
        const interventions = await interventionRepository.listByType(type)
        return interventions
      } catch (err) {
        const error =
          err instanceof Error ? err : new Error('Failed to list interventions by type')
        setError(error)
        throw error
      } finally {
        setIsLoading(false)
      }
    },
    []
  )

  const listInterventionsByFeeling = useCallback(
    async (feeling: FeelingState): Promise<CanonicalInterventionPreset[]> => {
      setIsLoading(true)
      setError(null)

      try {
        const interventions = await interventionRepository.listByFeeling(feeling)
        return interventions
      } catch (err) {
        const error =
          err instanceof Error ? err : new Error('Failed to list interventions by feeling')
        setError(error)
        throw error
      } finally {
        setIsLoading(false)
      }
    },
    []
  )

  // ============================================================================
  // Session Operations
  // ============================================================================

  const startSession = useCallback(
    async (input: CreateSessionInput): Promise<CanonicalInterventionSession> => {
      if (!userId) {
        throw new Error('User not authenticated')
      }

      setIsLoading(true)
      setError(null)

      try {
        const session = await sessionRepository.create(userId, input)
        setSessions((prev) => [session, ...prev])
        return session
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to start session')
        setError(error)
        throw error
      } finally {
        setIsLoading(false)
      }
    },
    [userId]
  )

  const completeSession = useCallback(
    async (
      sessionId: SessionId,
      completion: CompleteSessionInput
    ): Promise<CanonicalInterventionSession> => {
      if (!userId) {
        throw new Error('User not authenticated')
      }

      setIsLoading(true)
      setError(null)

      try {
        const updatedSession = await sessionRepository.complete(userId, sessionId, completion)
        setSessions((prev) => prev.map((s) => (s.sessionId === sessionId ? updatedSession : s)))
        return updatedSession
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to complete session')
        setError(error)
        throw error
      } finally {
        setIsLoading(false)
      }
    },
    [userId]
  )

  const getSession = useCallback(
    async (sessionId: SessionId): Promise<CanonicalInterventionSession | null> => {
      if (!userId) {
        throw new Error('User not authenticated')
      }

      setIsLoading(true)
      setError(null)

      try {
        const session = await sessionRepository.get(userId, sessionId)
        return session
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to get session')
        setError(error)
        throw error
      } finally {
        setIsLoading(false)
      }
    },
    [userId]
  )

  const listSessionsForDate = useCallback(
    async (dateKey: string): Promise<CanonicalInterventionSession[]> => {
      if (!userId) {
        throw new Error('User not authenticated')
      }

      setIsLoading(true)
      setError(null)

      try {
        const fetchedSessions = await sessionRepository.listForDate(userId, dateKey)
        return fetchedSessions
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to list sessions for date')
        setError(error)
        throw error
      } finally {
        setIsLoading(false)
      }
    },
    [userId]
  )

  const listRecentSessions = useCallback(
    async (limit = 10): Promise<CanonicalInterventionSession[]> => {
      if (!userId) {
        throw new Error('User not authenticated')
      }

      setIsLoading(true)
      setError(null)

      try {
        const fetchedSessions = await sessionRepository.listRecent(userId, limit)
        setSessions(fetchedSessions)
        return fetchedSessions
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to list recent sessions')
        setError(error)
        throw error
      } finally {
        setIsLoading(false)
      }
    },
    [userId]
  )

  const listSessionsForDateRange = useCallback(
    async (startDate: string, endDate: string): Promise<CanonicalInterventionSession[]> => {
      if (!userId) {
        throw new Error('User not authenticated')
      }

      setIsLoading(true)
      setError(null)

      try {
        const fetchedSessions = await sessionRepository.listForDateRange(userId, startDate, endDate)
        setSessions(fetchedSessions)
        return fetchedSessions
      } catch (err) {
        const error =
          err instanceof Error ? err : new Error('Failed to list sessions for date range')
        setError(error)
        throw error
      } finally {
        setIsLoading(false)
      }
    },
    [userId]
  )

  return {
    interventions,
    sessions,
    isLoading,
    error,
    createIntervention,
    updateIntervention,
    deleteIntervention,
    getIntervention,
    listUserInterventions,
    listSystemInterventions,
    listInterventionsByType,
    listInterventionsByFeeling,
    startSession,
    completeSession,
    getSession,
    listSessionsForDate,
    listRecentSessions,
    listSessionsForDateRange,
  }
}
