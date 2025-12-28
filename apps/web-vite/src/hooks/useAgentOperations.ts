/**
 * useAgentOperations Hook
 *
 * React wrapper around agent usecases.
 * Manages UI state (loading, error) and delegates business logic to domain layer.
 */

import { useState, useCallback, useMemo } from 'react'
import { toast } from 'sonner'
import { useAuth } from './useAuth'
import { createLogger } from '@lifeos/core'
import { createFirestoreAgentRepository } from '@/adapters/agents/firestoreAgentRepository'
import {
  createAgentUsecase,
  updateAgentUsecase,
  deleteAgentUsecase,
  getAgentUsecase,
  listAgentsUsecase,
} from '@lifeos/agents'
import type {
  AgentConfig,
  AgentId,
  CreateAgentInput,
  UpdateAgentInput,
  AgentRole,
  ModelProvider,
} from '@lifeos/agents'

const logger = createLogger('useAgentOperations')

export interface UseAgentOperationsReturn {
  agents: AgentConfig[]
  isLoading: boolean
  error: Error | null

  // Agent operations
  createAgent: (input: CreateAgentInput) => Promise<AgentConfig>
  updateAgent: (agentId: AgentId, updates: UpdateAgentInput) => Promise<AgentConfig>
  deleteAgent: (agentId: AgentId) => Promise<void>
  getAgent: (agentId: AgentId) => Promise<AgentConfig | null>
  listAgents: (options?: {
    role?: AgentRole
    provider?: ModelProvider
    activeOnly?: boolean
  }) => Promise<AgentConfig[]>
  loadAgents: () => Promise<void>
}

const agentRepository = createFirestoreAgentRepository()

/**
 * Hook for managing AI agents
 * Thin wrapper around usecases - handles React state, delegates business logic to domain
 */
export function useAgentOperations(): UseAgentOperationsReturn {
  const { user } = useAuth()
  const [agents, setAgents] = useState<AgentConfig[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const userId = user?.uid

  // Initialize usecases with repository
  const usecases = useMemo(
    () => ({
      createAgent: createAgentUsecase(agentRepository),
      updateAgent: updateAgentUsecase(agentRepository),
      deleteAgent: deleteAgentUsecase(agentRepository),
      getAgent: getAgentUsecase(agentRepository),
      listAgents: listAgentsUsecase(agentRepository),
    }),
    []
  )

  // ========== Agent Operations ==========

  const createAgent = useCallback(
    async (input: CreateAgentInput): Promise<AgentConfig> => {
      if (!userId) throw new Error('User not authenticated')
      setIsLoading(true)
      setError(null)

      try {
        const agent = await usecases.createAgent(userId, input)
        setAgents((prev) => [agent, ...prev])
        toast.success('Agent created successfully')
        logger.info('Agent created', { agentId: agent.agentId })
        return agent
      } catch (err) {
        const error = err as Error
        setError(error)
        logger.error('Failed to create agent', error)
        toast.error('Failed to create agent', { description: error.message })
        throw err
      } finally {
        setIsLoading(false)
      }
    },
    [userId, usecases]
  )

  const updateAgent = useCallback(
    async (agentId: AgentId, updates: UpdateAgentInput): Promise<AgentConfig> => {
      if (!userId) throw new Error('User not authenticated')
      setIsLoading(true)
      setError(null)

      try {
        const updated = await usecases.updateAgent(userId, agentId, updates)
        setAgents((prev) =>
          prev.map((agent) => (agent.agentId === agentId ? updated : agent))
        )
        toast.success('Agent updated successfully')
        logger.info('Agent updated', { agentId })
        return updated
      } catch (err) {
        const error = err as Error
        setError(error)
        logger.error('Failed to update agent', error, { agentId })
        toast.error('Failed to update agent', { description: error.message })
        throw err
      } finally {
        setIsLoading(false)
      }
    },
    [userId, usecases]
  )

  const deleteAgent = useCallback(
    async (agentId: AgentId): Promise<void> => {
      if (!userId) throw new Error('User not authenticated')
      setIsLoading(true)
      setError(null)

      try {
        await usecases.deleteAgent(userId, agentId)
        setAgents((prev) => prev.filter((agent) => agent.agentId !== agentId))
        toast.success('Agent deleted successfully')
        logger.info('Agent deleted', { agentId })
      } catch (err) {
        const error = err as Error
        setError(error)
        logger.error('Failed to delete agent', error, { agentId })
        toast.error('Failed to delete agent', { description: error.message })
        throw err
      } finally {
        setIsLoading(false)
      }
    },
    [userId, usecases]
  )

  const getAgent = useCallback(
    async (agentId: AgentId): Promise<AgentConfig | null> => {
      if (!userId) throw new Error('User not authenticated')
      setIsLoading(true)
      setError(null)

      try {
        const agent = await usecases.getAgent(userId, agentId)
        return agent
      } catch (err) {
        const error = err as Error
        setError(error)
        logger.error('Failed to get agent', error, { agentId })
        throw err
      } finally {
        setIsLoading(false)
      }
    },
    [userId, usecases]
  )

  const listAgents = useCallback(
    async (options?: {
      role?: AgentRole
      provider?: ModelProvider
      activeOnly?: boolean
    }): Promise<AgentConfig[]> => {
      if (!userId) throw new Error('User not authenticated')
      setIsLoading(true)
      setError(null)

      try {
        const result = await usecases.listAgents(userId, options)
        setAgents(result)
        return result
      } catch (err) {
        const error = err as Error
        setError(error)
        logger.error('Failed to list agents', error)
        throw err
      } finally {
        setIsLoading(false)
      }
    },
    [userId, usecases]
  )

  const loadAgents = useCallback(async (): Promise<void> => {
    if (!userId) return
    await listAgents({ activeOnly: true })
  }, [userId, listAgents])

  return {
    agents,
    isLoading,
    error,
    createAgent,
    updateAgent,
    deleteAgent,
    getAgent,
    listAgents,
    loadAgents,
  }
}
