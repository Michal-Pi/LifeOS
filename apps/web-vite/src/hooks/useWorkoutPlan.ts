/**
 * useWorkoutPlan Hook
 *
 * React wrapper for workout plan operations.
 */

import { useState, useCallback, useEffect } from 'react'
import { useAuth } from './useAuth'
import { useTrainingSync } from './useTrainingSync'
import { createIndexedDbWorkoutPlanRepository } from '@/adapters/training/indexedDbWorkoutPlanRepository'
import type { WorkoutPlan, PlanId, CreatePlanInput, UpdatePlanInput } from '@lifeos/training'

const planRepository = createIndexedDbWorkoutPlanRepository()

export interface UseWorkoutPlanReturn {
  activePlan: WorkoutPlan | null
  plans: WorkoutPlan[]
  isLoading: boolean
  error: Error | null

  createPlan: (input: Omit<CreatePlanInput, 'userId'>) => Promise<WorkoutPlan>
  updatePlan: (planId: PlanId, updates: UpdatePlanInput) => Promise<WorkoutPlan>
  deletePlan: (planId: PlanId) => Promise<void>
  getPlan: (planId: PlanId) => Promise<WorkoutPlan | null>
  getActivePlan: () => Promise<WorkoutPlan | null>
  listPlans: () => Promise<WorkoutPlan[]>
  activatePlan: (planId: PlanId) => Promise<WorkoutPlan>
}

export function useWorkoutPlan(): UseWorkoutPlanReturn {
  const { user } = useAuth()
  useTrainingSync()
  const userId = user?.uid ?? ''

  const [activePlan, setActivePlan] = useState<WorkoutPlan | null>(null)
  const [plans, setPlans] = useState<WorkoutPlan[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  // Load active plan on mount
  useEffect(() => {
    const load = async () => {
      if (!userId) return

      try {
        const plan = await planRepository.getActive(userId)
        setActivePlan(plan)
      } catch (err) {
        setError(err as Error)
      }
    }

    void load()
  }, [userId])

  const createPlan = useCallback(
    async (input: Omit<CreatePlanInput, 'userId'>): Promise<WorkoutPlan> => {
      if (!userId) throw new Error('User not authenticated')

      setIsLoading(true)
      setError(null)

      try {
        const plan = await planRepository.create(userId, {
          ...input,
          userId,
        })

        setPlans((prev) => [plan, ...prev])
        if (plan.active) {
          setActivePlan(plan)
        }
        return plan
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

  const updatePlan = useCallback(
    async (planId: PlanId, updates: UpdatePlanInput): Promise<WorkoutPlan> => {
      if (!userId) throw new Error('User not authenticated')

      setIsLoading(true)
      setError(null)

      try {
        const updated = await planRepository.update(userId, planId, updates)

        setPlans((prev) => prev.map((p) => (p.planId === planId ? updated : p)))

        if (activePlan?.planId === planId) {
          setActivePlan(updated)
        }

        return updated
      } catch (err) {
        const error = err as Error
        setError(error)
        throw error
      } finally {
        setIsLoading(false)
      }
    },
    [userId, activePlan]
  )

  const deletePlan = useCallback(
    async (planId: PlanId): Promise<void> => {
      if (!userId) throw new Error('User not authenticated')

      setIsLoading(true)
      setError(null)

      try {
        await planRepository.delete(userId, planId)

        setPlans((prev) => prev.filter((p) => p.planId !== planId))

        if (activePlan?.planId === planId) {
          setActivePlan(null)
        }
      } catch (err) {
        const error = err as Error
        setError(error)
        throw error
      } finally {
        setIsLoading(false)
      }
    },
    [userId, activePlan]
  )

  const getPlan = useCallback(
    async (planId: PlanId): Promise<WorkoutPlan | null> => {
      if (!userId) throw new Error('User not authenticated')

      setIsLoading(true)
      setError(null)

      try {
        const plan = await planRepository.get(userId, planId)
        return plan
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

  const getActivePlan = useCallback(async (): Promise<WorkoutPlan | null> => {
    if (!userId) throw new Error('User not authenticated')

    setIsLoading(true)
    setError(null)

    try {
      const plan = await planRepository.getActive(userId)
      setActivePlan(plan)
      return plan
    } catch (err) {
      const error = err as Error
      setError(error)
      throw error
    } finally {
      setIsLoading(false)
    }
  }, [userId])

  const listPlans = useCallback(async (): Promise<WorkoutPlan[]> => {
    if (!userId) throw new Error('User not authenticated')

    setIsLoading(true)
    setError(null)

    try {
      const list = await planRepository.list(userId)
      setPlans(list)
      const active = list.find((p) => p.active) ?? null
      setActivePlan(active)
      return list
    } catch (err) {
      const error = err as Error
      setError(error)
      throw error
    } finally {
      setIsLoading(false)
    }
  }, [userId])

  const activatePlan = useCallback(
    async (planId: PlanId): Promise<WorkoutPlan> => {
      if (!userId) throw new Error('User not authenticated')

      setIsLoading(true)
      setError(null)

      try {
        // Deactivate current active plan
        if (activePlan) {
          await planRepository.update(userId, activePlan.planId, { active: false })
        }

        // Activate new plan
        const updated = await planRepository.update(userId, planId, { active: true })

        setActivePlan(updated)
        setPlans((prev) =>
          prev.map((p) => (p.planId === planId ? updated : { ...p, active: false }))
        )

        return updated
      } catch (err) {
        const error = err as Error
        setError(error)
        throw error
      } finally {
        setIsLoading(false)
      }
    },
    [userId, activePlan]
  )

  return {
    activePlan,
    plans,
    isLoading,
    error,
    createPlan,
    updatePlan,
    deletePlan,
    getPlan,
    getActivePlan,
    listPlans,
    activatePlan,
  }
}
