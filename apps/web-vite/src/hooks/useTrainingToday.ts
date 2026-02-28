/**
 * useTrainingToday Hook
 *
 * Returns today's training variants plus session state.
 */

import { useCallback, useEffect, useState } from 'react'
import { useAuth } from './useAuth'
import { useTrainingSync } from './useTrainingSync'
import { createIndexedDbWorkoutPlanRepository } from '@/adapters/training/indexedDbWorkoutPlanRepository'
import { createIndexedDbWorkoutTemplateRepository } from '@/adapters/training/indexedDbWorkoutTemplateRepository'
import { createIndexedDbWorkoutSessionRepository } from '@/adapters/training/indexedDbWorkoutSessionRepository'
import { getDayOfWeekFromDateKey } from '@/training/utils'
import type {
  WorkoutPlan,
  WorkoutTemplate,
  WorkoutSession,
  WorkoutContext,
  CreateSessionInput,
  ExercisePerformance,
} from '@lifeos/training'

const planRepository = createIndexedDbWorkoutPlanRepository()
const templateRepository = createIndexedDbWorkoutTemplateRepository()
const sessionRepository = createIndexedDbWorkoutSessionRepository()

export interface TrainingVariant {
  context: WorkoutContext
  template: WorkoutTemplate | null
  session: WorkoutSession | null
  restDay: boolean
}

export interface UseTrainingTodayReturn {
  plan: WorkoutPlan | null
  variants: TrainingVariant[]
  isLoading: boolean
  error: Error | null
  refresh: () => Promise<void>
  startSession: (context: WorkoutContext) => Promise<WorkoutSession>
}

export function useTrainingToday(dateKey: string): UseTrainingTodayReturn {
  const { user } = useAuth()
  useTrainingSync()

  const [plan, setPlan] = useState<WorkoutPlan | null>(null)
  const [variants, setVariants] = useState<TrainingVariant[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const userId = user?.uid

  const refresh = useCallback(async (): Promise<void> => {
    if (!userId) return
    setIsLoading(true)
    setError(null)
    try {
      const activePlan = await planRepository.getActive(userId)
      setPlan(activePlan)

      const dayOfWeek = getDayOfWeekFromDateKey(dateKey)
      const schedule = activePlan?.schedule.find((entry) => entry.dayOfWeek === dayOfWeek)
      const restDay = schedule?.restDay ?? false

      const contexts: WorkoutContext[] = ['gym', 'home', 'road']
      const nextVariants: TrainingVariant[] = []

      for (const context of contexts) {
        const templateId =
          context === 'gym'
            ? schedule?.variants?.gymTemplateId
            : context === 'home'
              ? schedule?.variants?.homeTemplateId
              : schedule?.variants?.roadTemplateId

        const [template, session] = await Promise.all([
          templateId ? templateRepository.get(userId, templateId) : Promise.resolve(null),
          sessionRepository.getByDateAndContext(userId, dateKey, context),
        ])

        nextVariants.push({
          context,
          template,
          session,
          restDay,
        })
      }

      setVariants(nextVariants)
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to load training today')
      setError(error)
      throw error
    } finally {
      setIsLoading(false)
    }
  }, [userId, dateKey])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const startSession = useCallback(
    async (context: WorkoutContext): Promise<WorkoutSession> => {
      if (!userId) throw new Error('User not authenticated')

      const existing = await sessionRepository.getByDateAndContext(userId, dateKey, context)
      if (existing) return existing

      const variant = variants.find((entry) => entry.context === context)
      const template = variant?.template ?? null

      const items: ExercisePerformance[] =
        template?.items.map((item) => ({
          exerciseId: item.exerciseId,
          displayName: item.displayName,
          notes: item.notes,
        })) ?? []

      const input: CreateSessionInput = {
        userId,
        dateKey,
        context,
        templateId: template?.templateId,
        title: template?.title,
        status: 'in_progress',
        startedAtMs: Date.now(),
        items,
      }

      const session = await sessionRepository.create(userId, input)
      await refresh()
      return session
    },
    [userId, dateKey, variants, refresh]
  )

  return {
    plan,
    variants,
    isLoading,
    error,
    refresh,
    startSession,
  }
}
