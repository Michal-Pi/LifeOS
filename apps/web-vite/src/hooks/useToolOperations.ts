/**
 * useToolOperations Hook
 *
 * React wrapper around tool usecases.
 */

import { useState, useCallback, useMemo } from 'react'
import { toast } from 'sonner'
import { createLogger } from '@lifeos/core'
import { useAuth } from './useAuth'
import { createFirestoreToolRepository } from '@/adapters/agents/firestoreToolRepository'
import {
  createToolUsecase,
  updateToolUsecase,
  deleteToolUsecase,
  getToolUsecase,
  listToolsUsecase,
} from '@lifeos/agents'
import type { ToolDefinition, ToolId, CreateToolInput } from '@lifeos/agents'

const logger = createLogger('useToolOperations')
const toolRepository = createFirestoreToolRepository()

export interface UseToolOperationsReturn {
  tools: ToolDefinition[]
  isLoading: boolean
  error: Error | null

  createTool: (
    input: Omit<CreateToolInput, 'userId' | 'createdAtMs' | 'updatedAtMs'>
  ) => Promise<ToolDefinition>
  updateTool: (
    toolId: ToolId,
    updates: Partial<Omit<CreateToolInput, 'userId' | 'createdAtMs' | 'updatedAtMs'>>
  ) => Promise<ToolDefinition>
  deleteTool: (toolId: ToolId) => Promise<void>
  getTool: (toolId: ToolId) => Promise<ToolDefinition | null>
  loadTools: () => Promise<void>
}

export function useToolOperations(): UseToolOperationsReturn {
  const { user } = useAuth()
  const userId = user?.uid

  const [tools, setTools] = useState<ToolDefinition[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const usecases = useMemo(
    () => ({
      createTool: createToolUsecase(toolRepository),
      updateTool: updateToolUsecase(toolRepository),
      deleteTool: deleteToolUsecase(toolRepository),
      getTool: getToolUsecase(toolRepository),
      listTools: listToolsUsecase(toolRepository),
    }),
    []
  )

  const loadTools = useCallback(async () => {
    if (!userId) return
    setIsLoading(true)
    setError(null)
    try {
      const data = await usecases.listTools(userId)
      setTools(data)
    } catch (err) {
      const error = err as Error
      setError(error)
      logger.error('Failed to load tools', error)
    } finally {
      setIsLoading(false)
    }
  }, [usecases, userId])

  const createTool = useCallback(
    async (
      input: Omit<CreateToolInput, 'userId' | 'createdAtMs' | 'updatedAtMs'>
    ): Promise<ToolDefinition> => {
      if (!userId) throw new Error('User not authenticated')
      setIsLoading(true)
      setError(null)

      try {
        const tool = await usecases.createTool(userId, input)
        setTools((prev) => [tool, ...prev])
        toast.success('Tool created successfully')
        logger.info('Tool created', { toolId: tool.toolId })
        return tool
      } catch (err) {
        const error = err as Error
        setError(error)
        logger.error('Failed to create tool', error)
        toast.error('Failed to create tool', { description: error.message })
        throw err
      } finally {
        setIsLoading(false)
      }
    },
    [userId, usecases]
  )

  const updateTool = useCallback(
    async (
      toolId: ToolId,
      updates: Partial<Omit<CreateToolInput, 'userId' | 'createdAtMs' | 'updatedAtMs'>>
    ): Promise<ToolDefinition> => {
      if (!userId) throw new Error('User not authenticated')
      setIsLoading(true)
      setError(null)

      try {
        const updated = await usecases.updateTool(userId, toolId, updates)
        setTools((prev) => prev.map((tool) => (tool.toolId === toolId ? updated : tool)))
        toast.success('Tool updated successfully')
        logger.info('Tool updated', { toolId })
        return updated
      } catch (err) {
        const error = err as Error
        setError(error)
        logger.error('Failed to update tool', error)
        toast.error('Failed to update tool', { description: error.message })
        throw err
      } finally {
        setIsLoading(false)
      }
    },
    [userId, usecases]
  )

  const deleteTool = useCallback(
    async (toolId: ToolId): Promise<void> => {
      if (!userId) throw new Error('User not authenticated')
      setIsLoading(true)
      setError(null)

      try {
        await usecases.deleteTool(userId, toolId)
        setTools((prev) => prev.filter((tool) => tool.toolId !== toolId))
        toast.success('Tool deleted successfully')
        logger.info('Tool deleted', { toolId })
      } catch (err) {
        const error = err as Error
        setError(error)
        logger.error('Failed to delete tool', error)
        toast.error('Failed to delete tool', { description: error.message })
        throw err
      } finally {
        setIsLoading(false)
      }
    },
    [userId, usecases]
  )

  const getTool = useCallback(
    async (toolId: ToolId): Promise<ToolDefinition | null> => {
      if (!userId) throw new Error('User not authenticated')
      try {
        return await usecases.getTool(userId, toolId)
      } catch (err) {
        const error = err as Error
        logger.error('Failed to get tool', error, { toolId })
        throw err
      }
    },
    [userId, usecases]
  )

  return {
    tools,
    isLoading,
    error,
    createTool,
    updateTool,
    deleteTool,
    getTool,
    loadTools,
  }
}
