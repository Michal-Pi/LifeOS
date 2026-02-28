/**
 * useRunTrace Hook
 *
 * Provides access to run telemetry and component-level trace data
 * for debugging and analysis of workflow executions.
 */

import { useEffect, useState, useCallback, useMemo } from 'react'
import { collection, getDocs, query, where, orderBy } from 'firebase/firestore'
import { getFirestoreClient } from '@/lib/firebase'
import { useAuth } from '@/hooks/useAuth'
import type { RunTelemetry, ComponentTelemetry, RunId } from '@lifeos/agents'
import type { TraceStep } from '@/components/evaluation/TraceViewer'

// ----- Types -----

export interface UseRunTraceOptions {
  runId: RunId | null
  includeComponentTelemetry?: boolean
}

export interface UseRunTraceReturn {
  // Data
  telemetry: RunTelemetry | null
  steps: TraceStep[]
  componentTelemetry: ComponentTelemetry[]

  // Loading states
  loading: boolean
  error: string | null

  // Operations
  refresh: () => void
  exportTrace: () => string
}

// ----- Collection Paths -----

function getTelemetryPath(userId: string): string {
  return `users/${userId}/telemetry/runs`
}

function getComponentTelemetryPath(userId: string): string {
  return `users/${userId}/telemetry/components`
}

// ----- Hook Implementation -----

export function useRunTrace(options: UseRunTraceOptions): UseRunTraceReturn {
  const { user } = useAuth()
  const { runId, includeComponentTelemetry = true } = options

  // State
  const [telemetry, setTelemetry] = useState<RunTelemetry | null>(null)
  const [componentTelemetry, setComponentTelemetry] = useState<ComponentTelemetry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [refreshTrigger, setRefreshTrigger] = useState(0)

  // Load telemetry data
  useEffect(() => {
    if (!user || !runId) {
      setTelemetry(null)
      setComponentTelemetry([])
      return
    }

    const loadTelemetry = async () => {
      setLoading(true)
      setError(null)

      try {
        const db = getFirestoreClient()

        // Load run telemetry
        const telemetryRef = collection(db, getTelemetryPath(user.uid))
        const telemetryQuery = query(telemetryRef, where('runId', '==', runId))
        const telemetrySnapshot = await getDocs(telemetryQuery)

        if (!telemetrySnapshot.empty) {
          setTelemetry(telemetrySnapshot.docs[0].data() as RunTelemetry)
        } else {
          setTelemetry(null)
        }

        // Load component telemetry if requested
        if (includeComponentTelemetry) {
          const componentRef = collection(db, getComponentTelemetryPath(user.uid))
          const componentQuery = query(
            componentRef,
            where('runId', '==', runId),
            orderBy('stepIndex', 'asc'),
            orderBy('startedAtMs', 'asc')
          )
          const componentSnapshot = await getDocs(componentQuery)
          setComponentTelemetry(componentSnapshot.docs.map((d) => d.data() as ComponentTelemetry))
        }
      } catch (err) {
        console.error('Error loading run trace:', err)
        setError(err instanceof Error ? err.message : 'Failed to load trace')
      } finally {
        setLoading(false)
      }
    }

    loadTelemetry()
  }, [user, runId, includeComponentTelemetry, refreshTrigger])

  // Convert telemetry to TraceSteps
  const steps = useMemo((): TraceStep[] => {
    if (!telemetry) return []

    return telemetry.steps.map((step, index) => {
      // Get component telemetry for this step
      const stepComponents = componentTelemetry.filter((c) => c.stepIndex === index)

      const toolCalls = stepComponents
        .filter((c) => c.componentType === 'tool' && c.toolExecution)
        .map((c) => c.toolExecution!)

      const routerDecisions = stepComponents
        .filter((c) => c.componentType === 'router' && c.routerDecision)
        .map((c) => c.routerDecision!)

      const memoryOperations = stepComponents
        .filter((c) => c.componentType === 'memory' && c.memoryOperation)
        .map((c) => c.memoryOperation!)

      return {
        stepIndex: index,
        agentId: step.agentId,
        agentName: step.agentName,
        startedAtMs: step.startedAtMs,
        completedAtMs: step.completedAtMs,
        durationMs: step.durationMs,
        tokensUsed: step.tokensUsed,
        estimatedCost: step.estimatedCost,
        outputLength: step.outputLength,
        status:
          telemetry.status === 'failed' && index === telemetry.steps.length - 1
            ? 'error'
            : 'success',
        errorMessage:
          telemetry.status === 'failed' && index === telemetry.steps.length - 1
            ? telemetry.errorMessage
            : undefined,
        toolCalls,
        routerDecisions,
        memoryOperations,
      }
    })
  }, [telemetry, componentTelemetry])

  // Export trace as JSON
  const exportTrace = useCallback((): string => {
    if (!telemetry) return '{}'

    const exportData = {
      runId: telemetry.runId,
      workflowId: telemetry.workflowId,
      workflowType: telemetry.workflowType,
      workflowName: telemetry.workflowName,
      status: telemetry.status,
      startedAtMs: telemetry.startedAtMs,
      completedAtMs: telemetry.completedAtMs,
      durationMs: telemetry.durationMs,
      totalTokens: telemetry.totalTokens,
      estimatedCost: telemetry.estimatedCost,
      stepCount: telemetry.stepCount,
      steps: steps.map((step) => ({
        stepIndex: step.stepIndex,
        agentId: step.agentId,
        agentName: step.agentName,
        startedAtMs: step.startedAtMs,
        completedAtMs: step.completedAtMs,
        durationMs: step.durationMs,
        tokensUsed: step.tokensUsed,
        estimatedCost: step.estimatedCost,
        status: step.status,
        errorMessage: step.errorMessage,
        toolCalls: step.toolCalls.map((tc) => ({
          toolId: tc.toolId,
          toolName: tc.toolName,
          success: tc.success,
          errorMessage: tc.errorMessage,
          latencyMs: tc.latencyMs,
          retryCount: tc.retryCount,
        })),
        routerDecisions: step.routerDecisions.map((rd) => ({
          chosenPath: rd.chosenPath,
          availableOptions: rd.availableOptions,
          confidence: rd.confidence,
        })),
        memoryOperations: step.memoryOperations.map((mo) => ({
          operationType: mo.operationType,
          query: mo.query,
          hitCount: mo.hitCount,
          relevanceScore: mo.relevanceScore,
        })),
      })),
      errorMessage: telemetry.errorMessage,
      exportedAtMs: Date.now(),
    }

    return JSON.stringify(exportData, null, 2)
  }, [telemetry, steps])

  const refresh = useCallback(() => {
    setRefreshTrigger((prev) => prev + 1)
  }, [])

  return {
    telemetry,
    steps,
    componentTelemetry,
    loading,
    error,
    refresh,
    exportTrace,
  }
}

// ----- Utility Hook for Multiple Runs -----

export interface UseRunTracesOptions {
  runIds: RunId[]
  includeComponentTelemetry?: boolean
}

export interface UseRunTracesReturn {
  traces: Map<RunId, { telemetry: RunTelemetry; steps: TraceStep[] }>
  loading: boolean
  error: string | null
}

export function useRunTraces(options: UseRunTracesOptions): UseRunTracesReturn {
  const { user } = useAuth()
  const { runIds, includeComponentTelemetry = false } = options

  const [traces, setTraces] = useState<Map<RunId, { telemetry: RunTelemetry; steps: TraceStep[] }>>(
    new Map()
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Stable key for runIds array to use in dependency array
  const runIdsKey = useMemo(() => JSON.stringify(runIds), [runIds])

  useEffect(() => {
    if (!user || runIds.length === 0) {
      setTraces(new Map())
      return
    }

    const loadTraces = async () => {
      setLoading(true)
      setError(null)

      try {
        const db = getFirestoreClient()
        const telemetryRef = collection(db, getTelemetryPath(user.uid))
        const results = new Map<RunId, { telemetry: RunTelemetry; steps: TraceStep[] }>()

        // Load in batches of 10 (Firestore 'in' query limit)
        const batches = []
        for (let i = 0; i < runIds.length; i += 10) {
          batches.push(runIds.slice(i, i + 10))
        }

        for (const batch of batches) {
          const q = query(telemetryRef, where('runId', 'in', batch))
          const snapshot = await getDocs(q)

          for (const docSnapshot of snapshot.docs) {
            const telemetry = docSnapshot.data() as RunTelemetry
            const steps: TraceStep[] = telemetry.steps.map((step, index) => ({
              stepIndex: index,
              agentId: step.agentId,
              agentName: step.agentName,
              startedAtMs: step.startedAtMs,
              completedAtMs: step.completedAtMs,
              durationMs: step.durationMs,
              tokensUsed: step.tokensUsed,
              estimatedCost: step.estimatedCost,
              outputLength: step.outputLength,
              status:
                telemetry.status === 'failed' && index === telemetry.steps.length - 1
                  ? 'error'
                  : 'success',
              errorMessage:
                telemetry.status === 'failed' && index === telemetry.steps.length - 1
                  ? telemetry.errorMessage
                  : undefined,
              toolCalls: [],
              routerDecisions: [],
              memoryOperations: [],
            }))

            results.set(telemetry.runId, { telemetry, steps })
          }
        }

        setTraces(results)
      } catch (err) {
        console.error('Error loading run traces:', err)
        setError(err instanceof Error ? err.message : 'Failed to load traces')
      } finally {
        setLoading(false)
      }
    }

    loadTraces()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Using JSON.stringify for stable array comparison
  }, [user, runIdsKey, includeComponentTelemetry])

  return {
    traces,
    loading,
    error,
  }
}

export default useRunTrace
