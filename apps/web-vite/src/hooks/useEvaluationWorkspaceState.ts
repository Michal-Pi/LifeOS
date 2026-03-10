import { useCallback, useEffect, useMemo, useState } from 'react'

export type EvalWorkspaceView =
  | 'overview'
  | 'trace'
  | 'suites'
  | 'benchmarks'
  | 'capabilities'
  | 'agents'
  | 'live_runs'

type EvaluationWorkspaceState = {
  activeView: EvalWorkspaceView
  compareLeftRunId: string | null
  compareRightRunId: string | null
  selectedCohortId: string | null
  selectedCapabilitySuiteId: string | null
  pendingCohortRunId: string | null
}

const STORAGE_KEY = 'lifeos.evaluationWorkspaceState'
const EVENT_NAME = 'lifeos:evaluation-workspace-state'

const DEFAULT_STATE: EvaluationWorkspaceState = {
  activeView: 'overview',
  compareLeftRunId: null,
  compareRightRunId: null,
  selectedCohortId: null,
  selectedCapabilitySuiteId: null,
  pendingCohortRunId: null,
}

function readState(): EvaluationWorkspaceState {
  if (typeof window === 'undefined') return DEFAULT_STATE
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_STATE
    return { ...DEFAULT_STATE, ...(JSON.parse(raw) as Partial<EvaluationWorkspaceState>) }
  } catch {
    return DEFAULT_STATE
  }
}

function writeState(next: EvaluationWorkspaceState) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: next }))
}

export function useEvaluationWorkspaceState() {
  const [state, setState] = useState<EvaluationWorkspaceState>(() => readState())

  useEffect(() => {
    const handleChange = (event: Event) => {
      const detail = (event as CustomEvent<EvaluationWorkspaceState>).detail
      setState(detail ?? readState())
    }
    window.addEventListener(EVENT_NAME, handleChange as EventListener)
    window.addEventListener('storage', handleChange as EventListener)
    return () => {
      window.removeEventListener(EVENT_NAME, handleChange as EventListener)
      window.removeEventListener('storage', handleChange as EventListener)
    }
  }, [])

  const patchState = useCallback((patch: Partial<EvaluationWorkspaceState>) => {
    const next = { ...readState(), ...patch }
    writeState(next)
    setState(next)
  }, [])

  const clearPendingCohortRun = useCallback(() => {
    patchState({ pendingCohortRunId: null })
  }, [patchState])

  return useMemo(
    () => ({
      ...state,
      setActiveView: (activeView: EvalWorkspaceView) => patchState({ activeView }),
      setCompareRuns: (leftRunId: string | null, rightRunId: string | null = null) =>
        patchState({
          activeView: 'benchmarks',
          compareLeftRunId: leftRunId,
          compareRightRunId: rightRunId,
        }),
      setSelectedCohort: (selectedCohortId: string | null) => patchState({ selectedCohortId }),
      setSelectedCapabilitySuite: (selectedCapabilitySuiteId: string | null) =>
        patchState({ selectedCapabilitySuiteId }),
      setPendingCohortRun: (pendingCohortRunId: string | null) =>
        patchState({ activeView: 'suites', pendingCohortRunId }),
      clearPendingCohortRun,
    }),
    [clearPendingCohortRun, patchState, state]
  )
}
