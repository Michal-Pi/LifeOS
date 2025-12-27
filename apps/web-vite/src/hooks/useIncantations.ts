import { useState, useCallback, useEffect, useRef } from 'react'
import { useAuth } from './useAuth'
import { createFirestoreIncantationRepository } from '@/adapters/habits/firestoreIncantationRepository'
import { toast } from 'sonner'
import type {
  CanonicalIncantation,
  IncantationId,
  CreateIncantationInput,
  UpdateIncantationInput,
  HabitDomain,
} from '@lifeos/habits'

const incantationRepository = createFirestoreIncantationRepository()

export interface UseIncantationsReturn {
  incantations: CanonicalIncantation[]
  isLoading: boolean
  error: Error | null

  // CRUD operations
  createIncantation: (
    input: Omit<CreateIncantationInput, 'userId'>
  ) => Promise<CanonicalIncantation>
  updateIncantation: (
    incantationId: IncantationId,
    updates: UpdateIncantationInput
  ) => Promise<CanonicalIncantation>
  deleteIncantation: (incantationId: IncantationId) => Promise<void>
  getIncantation: (incantationId: IncantationId) => CanonicalIncantation | undefined
  loadIncantations: (options?: { activeOnly?: boolean; domain?: HabitDomain }) => Promise<void>

  // Helper methods
  getActiveIncantations: (domain?: HabitDomain) => CanonicalIncantation[]
}

export function useIncantations(): UseIncantationsReturn {
  const { user } = useAuth()
  const [incantations, setIncantations] = useState<CanonicalIncantation[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const userId = user?.uid
  const userIdRef = useRef(userId)

  // Reload on user change
  useEffect(() => {
    if (userId && userIdRef.current !== userId) {
      userIdRef.current = userId
      loadIncantations()
    }
  }, [userId, loadIncantations])

  const loadIncantations = useCallback(
    async (options?: { activeOnly?: boolean; domain?: HabitDomain }) => {
      if (!userId) return

      setIsLoading(true)
      setError(null)

      try {
        const firestoreIncantations = await incantationRepository.list(userId, options)
        setIncantations(firestoreIncantations)
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to load incantations')
        setError(error)
        toast.error(error.message)
      } finally {
        setIsLoading(false)
      }
    },
    [userId]
  )

  const createIncantation = useCallback(
    async (input: Omit<CreateIncantationInput, 'userId'>): Promise<CanonicalIncantation> => {
      if (!userId) throw new Error('User not authenticated')

      const incantationInput: CreateIncantationInput = {
        ...input,
        userId,
      }

      try {
        const incantation = await incantationRepository.create(userId, incantationInput)

        // Update state
        setIncantations((prev) => [incantation, ...prev])

        toast.success('Incantation created')
        return incantation
      } catch (err) {
        toast.error('Failed to create incantation')
        throw err
      }
    },
    [userId]
  )

  const updateIncantation = useCallback(
    async (
      incantationId: IncantationId,
      updates: UpdateIncantationInput
    ): Promise<CanonicalIncantation> => {
      if (!userId) throw new Error('User not authenticated')

      const existing = incantations.find((i) => i.incantationId === incantationId)
      if (!existing) throw new Error('Incantation not found')

      const optimistic = { ...existing, ...updates, updatedAtMs: Date.now() }

      // Optimistic update
      setIncantations((prev) =>
        prev.map((i) => (i.incantationId === incantationId ? optimistic : i))
      )

      try {
        const updated = await incantationRepository.update(userId, incantationId, updates)

        // Update state with server version
        setIncantations((prev) =>
          prev.map((i) => (i.incantationId === incantationId ? updated : i))
        )

        toast.success('Incantation updated')
        return updated
      } catch (err) {
        // Rollback
        setIncantations((prev) =>
          prev.map((i) => (i.incantationId === incantationId ? existing : i))
        )

        toast.error('Failed to update incantation')
        throw err
      }
    },
    [userId, incantations]
  )

  const deleteIncantation = useCallback(
    async (incantationId: IncantationId): Promise<void> => {
      if (!userId) throw new Error('User not authenticated')

      const existing = incantations.find((i) => i.incantationId === incantationId)
      if (!existing) return

      // Optimistic delete
      setIncantations((prev) => prev.filter((i) => i.incantationId !== incantationId))

      try {
        await incantationRepository.delete(userId, incantationId)
        toast.success('Incantation deleted')
      } catch (err) {
        // Rollback
        setIncantations((prev) => [...prev, existing])

        toast.error('Failed to delete incantation')
        throw err
      }
    },
    [userId, incantations]
  )

  const getIncantation = useCallback(
    (incantationId: IncantationId): CanonicalIncantation | undefined => {
      return incantations.find((i) => i.incantationId === incantationId)
    },
    [incantations]
  )

  const getActiveIncantations = useCallback(
    (domain?: HabitDomain): CanonicalIncantation[] => {
      return incantations.filter((inc) => {
        if (!inc.active) return false
        if (!domain) return true
        return !inc.domains || inc.domains.length === 0 || inc.domains.includes(domain)
      })
    },
    [incantations]
  )

  return {
    incantations,
    isLoading,
    error,
    createIncantation,
    updateIncantation,
    deleteIncantation,
    getIncantation,
    loadIncantations,
    getActiveIncantations,
  }
}
