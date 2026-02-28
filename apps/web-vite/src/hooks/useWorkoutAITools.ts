/**
 * useWorkoutAITools Hook
 *
 * React hook for managing workout AI tool state and operations.
 */

import { useState, useCallback } from 'react'
import type { WorkoutPlan, ExerciseLibraryItem, WorkoutDaySchedule } from '@lifeos/training'
import {
  convertGeneratedSchedule,
  type GeneratedWorkoutPlan,
  type ExercisePopulationResult,
} from '@lifeos/agents'
import { createWorkoutPlan, populateExercises, type WorkoutAIToolUsage } from '@/lib/workoutAITools'
import { useWorkoutPlan } from './useWorkoutPlan'

export type WorkoutAIToolType = 'createPlan' | 'populateExercises' | null

export interface WorkoutAIToolState {
  activeTool: WorkoutAIToolType
  isLoading: boolean
  error: string | null
  usage: WorkoutAIToolUsage | null

  // Results for each tool
  generatedPlan: GeneratedWorkoutPlan | null
  populationResult: ExercisePopulationResult | null
}

export interface UseWorkoutAIToolsReturn {
  state: WorkoutAIToolState
  runCreatePlan: (prompt: string) => Promise<void>
  runPopulateExercises: (
    prompt: string,
    existingPlan: WorkoutPlan,
    exercises?: ExerciseLibraryItem[]
  ) => Promise<void>
  clearResults: () => void
  setActiveTool: (tool: WorkoutAIToolType) => void

  // Actions to apply results
  applyGeneratedPlan: (startDateKey?: string) => Promise<WorkoutPlan | null>
  applyExercisePopulation: (existingPlan: WorkoutPlan) => Promise<WorkoutPlan | null>
}

const initialState: WorkoutAIToolState = {
  activeTool: null,
  isLoading: false,
  error: null,
  usage: null,
  generatedPlan: null,
  populationResult: null,
}

export function useWorkoutAITools(): UseWorkoutAIToolsReturn {
  const [state, setState] = useState<WorkoutAIToolState>(initialState)
  const { createPlan: savePlan, updatePlan } = useWorkoutPlan()

  const setActiveTool = useCallback((tool: WorkoutAIToolType) => {
    setState((prev) => ({ ...prev, activeTool: tool, error: null }))
  }, [])

  const clearResults = useCallback(() => {
    setState(initialState)
  }, [])

  const runCreatePlan = useCallback(async (prompt: string) => {
    setState((prev) => ({
      ...prev,
      activeTool: 'createPlan',
      isLoading: true,
      error: null,
      usage: null,
      generatedPlan: null,
    }))

    try {
      const result = await createWorkoutPlan(prompt)
      setState((prev) => ({
        ...prev,
        isLoading: false,
        generatedPlan: result.data,
        usage: result.usage ?? null,
      }))
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to create workout plan'
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: errorMsg,
      }))
    }
  }, [])

  const runPopulateExercises = useCallback(
    async (prompt: string, existingPlan: WorkoutPlan, exercises?: ExerciseLibraryItem[]) => {
      setState((prev) => ({
        ...prev,
        activeTool: 'populateExercises',
        isLoading: true,
        error: null,
        usage: null,
        populationResult: null,
      }))

      try {
        const result = await populateExercises(prompt, existingPlan, exercises)
        setState((prev) => ({
          ...prev,
          isLoading: false,
          populationResult: result.data,
          usage: result.usage ?? null,
        }))
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Failed to populate exercises'
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: errorMsg,
        }))
      }
    },
    []
  )

  const applyGeneratedPlan = useCallback(
    async (startDateKey?: string): Promise<WorkoutPlan | null> => {
      const { generatedPlan } = state
      if (!generatedPlan) {
        setState((prev) => ({
          ...prev,
          error: 'No generated plan to apply',
        }))
        return null
      }

      try {
        // Convert generated schedule to WorkoutDaySchedule format
        const schedule: WorkoutDaySchedule[] = convertGeneratedSchedule(generatedPlan.schedule)

        // Use today's date if not provided
        const today = new Date()
        const dateKey =
          startDateKey ||
          `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

        const newPlan = await savePlan({
          active: true,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          startDateKey: dateKey,
          schedule,
        })

        // Clear the generated plan after applying
        setState((prev) => ({
          ...prev,
          generatedPlan: null,
        }))

        return newPlan
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Failed to save workout plan'
        setState((prev) => ({
          ...prev,
          error: errorMsg,
        }))
        return null
      }
    },
    [state, savePlan]
  )

  const applyExercisePopulation = useCallback(
    async (existingPlan: WorkoutPlan): Promise<WorkoutPlan | null> => {
      const { populationResult } = state
      if (!populationResult || populationResult.updatedBlocks.length === 0) {
        setState((prev) => ({
          ...prev,
          error: 'No exercise updates to apply',
        }))
        return null
      }

      try {
        // Create a deep copy of the schedule to update
        const updatedSchedule: WorkoutDaySchedule[] = existingPlan.schedule.map((day) => ({
          ...day,
          blocks: day.blocks?.map((block) => ({ ...block })) ?? [],
        }))

        // Apply updates from populationResult
        for (const update of populationResult.updatedBlocks) {
          const daySchedule = updatedSchedule.find((d) => d.dayOfWeek === update.dayOfWeek)
          if (daySchedule && daySchedule.blocks && daySchedule.blocks[update.blockIndex]) {
            daySchedule.blocks[update.blockIndex].exerciseIds = update.exerciseIds
          }
        }

        const updatedPlan = await updatePlan(existingPlan.planId, {
          schedule: updatedSchedule,
        })

        // Clear the population result after applying
        setState((prev) => ({
          ...prev,
          populationResult: null,
        }))

        return updatedPlan
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Failed to update workout plan'
        setState((prev) => ({
          ...prev,
          error: errorMsg,
        }))
        return null
      }
    },
    [state, updatePlan]
  )

  return {
    state,
    runCreatePlan,
    runPopulateExercises,
    clearResults,
    setActiveTool,
    applyGeneratedPlan,
    applyExercisePopulation,
  }
}
