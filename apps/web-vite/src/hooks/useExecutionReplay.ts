/**
 * useExecutionReplay Hook
 *
 * Manages replay state for time-travel debugging of workflow executions.
 * Provides step-through controls, auto-advance playback, and speed control.
 */

import { useState, useCallback, useEffect, useRef } from 'react'
import type { WorkflowStep } from '@lifeos/agents'

// ----- Types -----

export type ReplaySpeed = 1 | 2 | 4

export interface UseExecutionReplayReturn {
  currentStepIndex: number
  isReplaying: boolean
  speed: ReplaySpeed
  toggleReplay: () => void
  stepForward: () => void
  stepBack: () => void
  setSpeed: (speed: ReplaySpeed) => void
  goToStep: (index: number) => void
}

// ----- Constants -----

/** Base interval (ms) between auto-advance steps at 1x speed */
const BASE_INTERVAL_MS = 1500

// ----- Hook Implementation -----

export function useExecutionReplay(steps: WorkflowStep[]): UseExecutionReplayReturn {
  const [currentStepIndex, setCurrentStepIndex] = useState(0)
  const [isReplaying, setIsReplaying] = useState(false)
  const [speed, setSpeed] = useState<ReplaySpeed>(1)

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const stepsLengthRef = useRef(steps.length)

  // Keep steps length in sync (via effect to avoid ref write during render)
  useEffect(() => {
    stepsLengthRef.current = steps.length
  }, [steps.length])

  // Derive clamped index inline — avoids setState-in-effect cascading renders
  const effectiveStepIndex = steps.length === 0 ? 0 : Math.min(currentStepIndex, steps.length - 1)
  const effectiveIsReplaying = steps.length <= 1 ? false : isReplaying

  // Auto-advance timer
  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }

    if (!isReplaying || steps.length <= 1) return

    const intervalMs = BASE_INTERVAL_MS / speed

    intervalRef.current = setInterval(() => {
      setCurrentStepIndex((prev) => {
        const next = prev + 1
        if (next >= stepsLengthRef.current) {
          // Reached the end — stop replaying
          setIsReplaying(false)
          return prev
        }
        return next
      })
    }, intervalMs)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [isReplaying, speed, steps.length])

  const toggleReplay = useCallback(() => {
    if (steps.length <= 1) return

    setIsReplaying((prev) => {
      // If we were at the end, restart from beginning
      if (!prev) {
        setCurrentStepIndex((idx) => {
          if (idx >= steps.length - 1) return 0
          return idx
        })
      }
      return !prev
    })
  }, [steps.length])

  const stepForward = useCallback(() => {
    setIsReplaying(false)
    setCurrentStepIndex((prev) => Math.min(prev + 1, steps.length - 1))
  }, [steps.length])

  const stepBack = useCallback(() => {
    setIsReplaying(false)
    setCurrentStepIndex((prev) => Math.max(prev - 1, 0))
  }, [])

  const goToStep = useCallback(
    (index: number) => {
      setIsReplaying(false)
      setCurrentStepIndex(Math.max(0, Math.min(index, steps.length - 1)))
    },
    [steps.length]
  )

  const handleSetSpeed = useCallback((newSpeed: ReplaySpeed) => {
    setSpeed(newSpeed)
  }, [])

  return {
    currentStepIndex: effectiveStepIndex,
    isReplaying: effectiveIsReplaying,
    speed,
    toggleReplay,
    stepForward,
    stepBack,
    setSpeed: handleSetSpeed,
    goToStep,
  }
}

export default useExecutionReplay
