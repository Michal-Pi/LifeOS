/**
 * useWorkspaceOperations Hook
 *
 * React wrapper around workspace usecases.
 * Manages UI state (loading, error) and delegates business logic to domain layer.
 */

import { useState, useCallback, useMemo } from 'react'
import { toast } from 'sonner'
import { useAuth } from './useAuth'
import { createLogger } from '@lifeos/core'
import { createFirestoreWorkspaceRepository } from '@/adapters/agents/firestoreWorkspaceRepository'
import { createFirestoreRunRepository } from '@/adapters/agents/firestoreRunRepository'
import {
  createWorkspaceUsecase,
  updateWorkspaceUsecase,
  deleteWorkspaceUsecase,
  getWorkspaceUsecase,
  listWorkspacesUsecase,
  createRunUsecase,
  updateRunUsecase,
  getRunUsecase,
  listRunsUsecase,
  deleteRunUsecase,
} from '@lifeos/agents'
import type {
  Workspace,
  WorkspaceId,
  CreateWorkspaceInput,
  UpdateWorkspaceInput,
  Run,
  RunId,
  CreateRunInput,
  RunStatus,
} from '@lifeos/agents'

const logger = createLogger('useWorkspaceOperations')

export interface UseWorkspaceOperationsReturn {
  workspaces: Workspace[]
  runs: Run[]
  isLoading: boolean
  error: Error | null

  // Workspace operations
  createWorkspace: (input: CreateWorkspaceInput) => Promise<Workspace>
  updateWorkspace: (workspaceId: WorkspaceId, updates: UpdateWorkspaceInput) => Promise<Workspace>
  deleteWorkspace: (workspaceId: WorkspaceId) => Promise<void>
  getWorkspace: (workspaceId: WorkspaceId) => Promise<Workspace | null>
  listWorkspaces: (options?: { activeOnly?: boolean }) => Promise<Workspace[]>
  loadWorkspaces: () => Promise<void>

  // Run operations
  createRun: (input: CreateRunInput) => Promise<Run>
  updateRun: (
    runId: RunId,
    updates: Partial<Omit<Run, 'runId' | 'userId' | 'workspaceId'>>
  ) => Promise<Run>
  getRun: (runId: RunId) => Promise<Run | null>
  listRuns: (options?: {
    workspaceId?: WorkspaceId
    status?: RunStatus
    limit?: number
  }) => Promise<Run[]>
  deleteRun: (runId: RunId) => Promise<void>
  loadRuns: (workspaceId?: WorkspaceId) => Promise<void>
}

const workspaceRepository = createFirestoreWorkspaceRepository()
const runRepository = createFirestoreRunRepository()

/**
 * Hook for managing AI workspaces and runs
 * Thin wrapper around usecases - handles React state, delegates business logic to domain
 */
export function useWorkspaceOperations(): UseWorkspaceOperationsReturn {
  const { user } = useAuth()
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [runs, setRuns] = useState<Run[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const userId = user?.uid

  // Initialize usecases with repositories
  const usecases = useMemo(
    () => ({
      createWorkspace: createWorkspaceUsecase(workspaceRepository),
      updateWorkspace: updateWorkspaceUsecase(workspaceRepository),
      deleteWorkspace: deleteWorkspaceUsecase(workspaceRepository),
      getWorkspace: getWorkspaceUsecase(workspaceRepository),
      listWorkspaces: listWorkspacesUsecase(workspaceRepository),
      createRun: createRunUsecase(runRepository),
      updateRun: updateRunUsecase(runRepository),
      getRun: getRunUsecase(runRepository),
      listRuns: listRunsUsecase(runRepository),
      deleteRun: deleteRunUsecase(runRepository),
    }),
    []
  )

  // ========== Workspace Operations ==========

  const createWorkspace = useCallback(
    async (input: CreateWorkspaceInput): Promise<Workspace> => {
      if (!userId) throw new Error('User not authenticated')
      setIsLoading(true)
      setError(null)

      try {
        const workspace = await usecases.createWorkspace(userId, input)
        setWorkspaces((prev) => [workspace, ...prev])
        toast.success('Workspace created successfully')
        logger.info('Workspace created', { workspaceId: workspace.workspaceId })
        return workspace
      } catch (err) {
        const error = err as Error
        setError(error)
        logger.error('Failed to create workspace', error)
        toast.error('Failed to create workspace', { description: error.message })
        throw err
      } finally {
        setIsLoading(false)
      }
    },
    [userId, usecases]
  )

  const updateWorkspace = useCallback(
    async (workspaceId: WorkspaceId, updates: UpdateWorkspaceInput): Promise<Workspace> => {
      if (!userId) throw new Error('User not authenticated')
      setIsLoading(true)
      setError(null)

      try {
        const updated = await usecases.updateWorkspace(userId, workspaceId, updates)
        setWorkspaces((prev) =>
          prev.map((workspace) =>
            workspace.workspaceId === workspaceId ? updated : workspace
          )
        )
        toast.success('Workspace updated successfully')
        logger.info('Workspace updated', { workspaceId })
        return updated
      } catch (err) {
        const error = err as Error
        setError(error)
        logger.error('Failed to update workspace', error, { workspaceId })
        toast.error('Failed to update workspace', { description: error.message })
        throw err
      } finally {
        setIsLoading(false)
      }
    },
    [userId, usecases]
  )

  const deleteWorkspace = useCallback(
    async (workspaceId: WorkspaceId): Promise<void> => {
      if (!userId) throw new Error('User not authenticated')
      setIsLoading(true)
      setError(null)

      try {
        await usecases.deleteWorkspace(userId, workspaceId)
        setWorkspaces((prev) =>
          prev.filter((workspace) => workspace.workspaceId !== workspaceId)
        )
        toast.success('Workspace deleted successfully')
        logger.info('Workspace deleted', { workspaceId })
      } catch (err) {
        const error = err as Error
        setError(error)
        logger.error('Failed to delete workspace', error, { workspaceId })
        toast.error('Failed to delete workspace', { description: error.message })
        throw err
      } finally {
        setIsLoading(false)
      }
    },
    [userId, usecases]
  )

  const getWorkspace = useCallback(
    async (workspaceId: WorkspaceId): Promise<Workspace | null> => {
      if (!userId) throw new Error('User not authenticated')
      setIsLoading(true)
      setError(null)

      try {
        const workspace = await usecases.getWorkspace(userId, workspaceId)
        return workspace
      } catch (err) {
        const error = err as Error
        setError(error)
        logger.error('Failed to get workspace', error, { workspaceId })
        throw err
      } finally {
        setIsLoading(false)
      }
    },
    [userId, usecases]
  )

  const listWorkspaces = useCallback(
    async (options?: { activeOnly?: boolean }): Promise<Workspace[]> => {
      if (!userId) throw new Error('User not authenticated')
      setIsLoading(true)
      setError(null)

      try {
        const result = await usecases.listWorkspaces(userId, options)
        setWorkspaces(result)
        return result
      } catch (err) {
        const error = err as Error
        setError(error)
        logger.error('Failed to list workspaces', error)
        throw err
      } finally {
        setIsLoading(false)
      }
    },
    [userId, usecases]
  )

  const loadWorkspaces = useCallback(async (): Promise<void> => {
    if (!userId) return
    await listWorkspaces({ activeOnly: true })
  }, [userId, listWorkspaces])

  // ========== Run Operations ==========

  const createRun = useCallback(
    async (input: CreateRunInput): Promise<Run> => {
      if (!userId) throw new Error('User not authenticated')
      setIsLoading(true)
      setError(null)

      try {
        const run = await usecases.createRun(userId, input)
        setRuns((prev) => [run, ...prev])
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
      updates: Partial<Omit<Run, 'runId' | 'userId' | 'workspaceId'>>
    ): Promise<Run> => {
      if (!userId) throw new Error('User not authenticated')
      setIsLoading(true)
      setError(null)

      try {
        const updated = await usecases.updateRun(userId, runId, updates)
        setRuns((prev) => prev.map((run) => (run.runId === runId ? updated : run)))
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
      workspaceId?: WorkspaceId
      status?: RunStatus
      limit?: number
    }): Promise<Run[]> => {
      if (!userId) throw new Error('User not authenticated')
      setIsLoading(true)
      setError(null)

      try {
        const result = await usecases.listRuns(userId, options)
        setRuns(result)
        return result
      } catch (err) {
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
    async (workspaceId?: WorkspaceId): Promise<void> => {
      if (!userId) return
      await listRuns({ workspaceId, limit: 50 })
    },
    [userId, listRuns]
  )

  return {
    workspaces,
    runs,
    isLoading,
    error,
    createWorkspace,
    updateWorkspace,
    deleteWorkspace,
    getWorkspace,
    listWorkspaces,
    loadWorkspaces,
    createRun,
    updateRun,
    getRun,
    listRuns,
    deleteRun,
    loadRuns,
  }
}
