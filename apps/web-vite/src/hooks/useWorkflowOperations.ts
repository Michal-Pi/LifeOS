/**
 * useWorkflowOperations Hook
 *
 * React wrapper around workflow usecases.
 * Manages UI state (loading, error) and delegates business logic to domain layer.
 */

import { useState, useCallback, useMemo, useRef } from 'react'
import { toast } from 'sonner'
import { useAuth } from './useAuth'
import { createLogger } from '@lifeos/core'
import { createFirestoreWorkflowRepository } from '@/adapters/agents/firestoreWorkflowRepository'
import { createFirestoreRunRepository } from '@/adapters/agents/firestoreRunRepository'
import {
  listWorkflowsLocally,
  bulkSaveWorkflowsLocally,
  saveWorkflowLocally,
  deleteWorkflowLocally,
  getWorkflowLocally,
  listRunsLocally,
  listRunsByWorkflowLocally,
  bulkSaveRunsLocally,
  saveRunLocally,
  deleteRunLocally,
} from '@/agents/offlineStore'
import {
  createWorkflowUsecase,
  updateWorkflowUsecase,
  deleteWorkflowUsecase,
  getWorkflowUsecase,
  listWorkflowsUsecase,
  createRunUsecase,
  updateRunUsecase,
  getRunUsecase,
  listRunsUsecase,
  deleteRunUsecase,
} from '@lifeos/agents'
import type {
  Workflow,
  WorkflowId,
  CreateWorkflowInput,
  UpdateWorkflowInput,
  Run,
  RunId,
  CreateRunInput,
  RunStatus,
} from '@lifeos/agents'

const logger = createLogger('useWorkflowOperations')

export interface UseWorkflowOperationsReturn {
  workflows: Workflow[]
  workflow: Workflow | null // Current workflow for detail view
  runs: Run[]
  isLoading: boolean
  error: Error | null

  // Workflow operations
  createWorkflow: (input: CreateWorkflowInput) => Promise<Workflow>
  updateWorkflow: (workflowId: WorkflowId, updates: UpdateWorkflowInput) => Promise<Workflow>
  deleteWorkflow: (workflowId: WorkflowId) => Promise<void>
  getWorkflow: (workflowId: WorkflowId) => Promise<Workflow | null>
  listWorkflows: (options?: { activeOnly?: boolean }) => Promise<Workflow[]>
  loadWorkflows: () => Promise<void>

  // Run operations
  createRun: (input: CreateRunInput) => Promise<Run>
  updateRun: (
    runId: RunId,
    updates: Partial<Omit<Run, 'runId' | 'userId' | 'workflowId'>>
  ) => Promise<Run>
  getRun: (runId: RunId) => Promise<Run | null>
  listRuns: (options?: {
    workflowId?: WorkflowId
    status?: RunStatus
    limit?: number
  }) => Promise<Run[]>
  deleteRun: (runId: RunId) => Promise<void>
  loadRuns: (workflowId?: WorkflowId) => Promise<void>
}

const workflowRepository = createFirestoreWorkflowRepository()
const runRepository = createFirestoreRunRepository()

/**
 * Hook for managing AI workflows and runs
 * Thin wrapper around usecases - handles React state, delegates business logic to domain
 */
export function useWorkflowOperations(): UseWorkflowOperationsReturn {
  const { user } = useAuth()
  const [workflows, setWorkflows] = useState<Workflow[]>([])
  const [workflow, setWorkflow] = useState<Workflow | null>(null) // Current workflow for detail view
  const [runs, setRuns] = useState<Run[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const userId = user?.uid

  // Refs for accessing current state in catch blocks without adding state to
  // useCallback dependency arrays (which would cause infinite re-render loops).
  const workflowsRef = useRef(workflows)
  workflowsRef.current = workflows
  const runsRef = useRef(runs)
  runsRef.current = runs

  // Initialize usecases with repositories
  const usecases = useMemo(
    () => ({
      createWorkflow: createWorkflowUsecase(workflowRepository),
      updateWorkflow: updateWorkflowUsecase(workflowRepository),
      deleteWorkflow: deleteWorkflowUsecase(workflowRepository),
      getWorkflow: getWorkflowUsecase(workflowRepository),
      listWorkflows: listWorkflowsUsecase(workflowRepository),
      createRun: createRunUsecase(runRepository),
      updateRun: updateRunUsecase(runRepository),
      getRun: getRunUsecase(runRepository),
      listRuns: listRunsUsecase(runRepository),
      deleteRun: deleteRunUsecase(runRepository),
    }),
    []
  )

  // ========== Workflow Operations ==========

  const createWorkflow = useCallback(
    async (input: CreateWorkflowInput): Promise<Workflow> => {
      if (!userId) throw new Error('User not authenticated')
      setIsLoading(true)
      setError(null)

      try {
        const workflow = await usecases.createWorkflow(userId, input)
        setWorkflows((prev) => [workflow, ...prev])
        void saveWorkflowLocally(workflow)
        toast.success('Workflow created successfully')
        logger.info('Workflow created', { workflowId: workflow.workflowId })
        return workflow
      } catch (err) {
        const error = err as Error
        setError(error)
        logger.error('Failed to create workflow', error)
        toast.error('Failed to create workflow', { description: error.message })
        throw err
      } finally {
        setIsLoading(false)
      }
    },
    [userId, usecases]
  )

  const updateWorkflow = useCallback(
    async (workflowId: WorkflowId, updates: UpdateWorkflowInput): Promise<Workflow> => {
      if (!userId) throw new Error('User not authenticated')
      setIsLoading(true)
      setError(null)

      try {
        const updated = await usecases.updateWorkflow(userId, workflowId, updates)
        setWorkflows((prev) =>
          prev.map((workflow) => (workflow.workflowId === workflowId ? updated : workflow))
        )
        void saveWorkflowLocally(updated)
        toast.success('Workflow updated successfully')
        logger.info('Workflow updated', { workflowId })
        return updated
      } catch (err) {
        const error = err as Error
        setError(error)
        logger.error('Failed to update workflow', error, { workflowId })
        toast.error('Failed to update workflow', { description: error.message })
        throw err
      } finally {
        setIsLoading(false)
      }
    },
    [userId, usecases]
  )

  const deleteWorkflow = useCallback(
    async (workflowId: WorkflowId): Promise<void> => {
      if (!userId) throw new Error('User not authenticated')
      setIsLoading(true)
      setError(null)

      try {
        await usecases.deleteWorkflow(userId, workflowId)
        setWorkflows((prev) => prev.filter((workflow) => workflow.workflowId !== workflowId))
        void deleteWorkflowLocally(workflowId)
        toast.success('Workflow deleted successfully')
        logger.info('Workflow deleted', { workflowId })
      } catch (err) {
        const error = err as Error
        setError(error)
        logger.error('Failed to delete workflow', error, { workflowId })
        toast.error('Failed to delete workflow', { description: error.message })
        throw err
      } finally {
        setIsLoading(false)
      }
    },
    [userId, usecases]
  )

  const getWorkflow = useCallback(
    async (workflowId: WorkflowId): Promise<Workflow | null> => {
      if (!userId) throw new Error('User not authenticated')
      setIsLoading(true)
      setError(null)

      try {
        // Try local cache first
        const local = await getWorkflowLocally(workflowId)
        if (local) setWorkflow(local)

        const fetchedWorkflow = await usecases.getWorkflow(userId, workflowId)
        setWorkflow(fetchedWorkflow)
        if (fetchedWorkflow) void saveWorkflowLocally(fetchedWorkflow)
        return fetchedWorkflow
      } catch (err) {
        // If Firestore fails but we have local data, return it
        const local = await getWorkflowLocally(workflowId).catch(() => undefined)
        if (local) {
          setWorkflow(local)
          return local
        }
        const error = err as Error
        setError(error)
        logger.error('Failed to get workflow', error, { workflowId })
        throw err
      } finally {
        setIsLoading(false)
      }
    },
    [userId, usecases]
  )

  const listWorkflows = useCallback(
    async (options?: { activeOnly?: boolean }): Promise<Workflow[]> => {
      if (!userId) throw new Error('User not authenticated')
      setIsLoading(true)
      setError(null)

      try {
        // Read from local cache first for instant display
        const local = await listWorkflowsLocally(userId)
        if (local.length > 0) {
          const filtered = options?.activeOnly !== false ? local.filter((w) => !w.archived) : local
          setWorkflows(filtered)
        }

        // Fetch from Firestore in background and update cache
        const result = await usecases.listWorkflows(userId, options)
        setWorkflows(result)
        void bulkSaveWorkflowsLocally(result)
        return result
      } catch (err) {
        // If Firestore fails but we have local data, keep it
        if (workflowsRef.current.length > 0) {
          logger.warn('Firestore fetch failed, using cached workflows')
          return workflowsRef.current
        }
        const error = err as Error
        setError(error)
        logger.error('Failed to list workflows', error)
        throw err
      } finally {
        setIsLoading(false)
      }
    },
    [userId, usecases]
  )

  const loadWorkflows = useCallback(async (): Promise<void> => {
    if (!userId) return
    await listWorkflows({ activeOnly: true })
  }, [userId, listWorkflows])

  // ========== Run Operations ==========

  const createRun = useCallback(
    async (input: CreateRunInput): Promise<Run> => {
      if (!userId) throw new Error('User not authenticated')
      setIsLoading(true)
      setError(null)

      try {
        const run = await usecases.createRun(userId, input)
        setRuns((prev) => [run, ...prev])
        void saveRunLocally(run)
        toast.success('Run started successfully')
        logger.info('Run created', { runId: run.runId })
        return run
      } catch (err) {
        const error = err as Error
        setError(error)
        logger.error('Failed to create run', error)
        toast.error('Failed to start run', { description: error.message })
        throw err
      } finally {
        setIsLoading(false)
      }
    },
    [userId, usecases]
  )

  const updateRun = useCallback(
    async (
      runId: RunId,
      updates: Partial<Omit<Run, 'runId' | 'userId' | 'workflowId'>>
    ): Promise<Run> => {
      if (!userId) throw new Error('User not authenticated')
      setIsLoading(true)
      setError(null)

      try {
        const updated = await usecases.updateRun(userId, runId, updates)
        setRuns((prev) => prev.map((run) => (run.runId === runId ? updated : run)))
        void saveRunLocally(updated)
        logger.info('Run updated', { runId })
        return updated
      } catch (err) {
        const error = err as Error
        setError(error)
        logger.error('Failed to update run', error, { runId })
        toast.error('Failed to update run', { description: error.message })
        throw err
      } finally {
        setIsLoading(false)
      }
    },
    [userId, usecases]
  )

  const getRun = useCallback(
    async (runId: RunId): Promise<Run | null> => {
      if (!userId) throw new Error('User not authenticated')
      setIsLoading(true)
      setError(null)

      try {
        const run = await usecases.getRun(userId, runId)
        return run
      } catch (err) {
        const error = err as Error
        setError(error)
        logger.error('Failed to get run', error, { runId })
        throw err
      } finally {
        setIsLoading(false)
      }
    },
    [userId, usecases]
  )

  const listRuns = useCallback(
    async (options?: {
      workflowId?: WorkflowId
      status?: RunStatus
      limit?: number
    }): Promise<Run[]> => {
      if (!userId) throw new Error('User not authenticated')
      setIsLoading(true)
      setError(null)

      try {
        // Read from local cache first
        const local = options?.workflowId
          ? await listRunsByWorkflowLocally(options.workflowId)
          : await listRunsLocally(userId)
        if (local.length > 0) {
          setRuns(local.sort((a, b) => b.startedAtMs - a.startedAtMs))
        }

        const result = await usecases.listRuns(userId, options)
        setRuns(result)
        void bulkSaveRunsLocally(result)
        return result
      } catch (err) {
        if (runsRef.current.length > 0) {
          logger.warn('Firestore fetch failed, using cached runs')
          return runsRef.current
        }
        const error = err as Error
        setError(error)
        logger.error('Failed to list runs', error)
        throw err
      } finally {
        setIsLoading(false)
      }
    },
    [userId, usecases]
  )

  const deleteRun = useCallback(
    async (runId: RunId): Promise<void> => {
      if (!userId) throw new Error('User not authenticated')
      setIsLoading(true)
      setError(null)

      try {
        await usecases.deleteRun(userId, runId)
        setRuns((prev) => prev.filter((run) => run.runId !== runId))
        void deleteRunLocally(runId)
        toast.success('Run deleted successfully')
        logger.info('Run deleted', { runId })
      } catch (err) {
        const error = err as Error
        setError(error)
        logger.error('Failed to delete run', error, { runId })
        toast.error('Failed to delete run', { description: error.message })
        throw err
      } finally {
        setIsLoading(false)
      }
    },
    [userId, usecases]
  )

  const loadRuns = useCallback(
    async (workflowId?: WorkflowId): Promise<void> => {
      if (!userId) return
      await listRuns({ workflowId, limit: 50 })
    },
    [userId, listRuns]
  )

  return {
    workflows,
    workflow,
    runs,
    isLoading,
    error,
    createWorkflow,
    updateWorkflow,
    deleteWorkflow,
    getWorkflow,
    listWorkflows,
    loadWorkflows,
    createRun,
    updateRun,
    getRun,
    listRuns,
    deleteRun,
    loadRuns,
  }
}
