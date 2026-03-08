/**
 * Agent Usecases
 *
 * Pure business logic for agent configuration operations.
 * Independent of UI framework and data layer.
 */

import type { AgentRepository } from '../ports/agentRepository'
import {
  hashAgentConfig,
  type AgentConfig,
  type AgentId,
  type CreateAgentInput,
  type UpdateAgentInput,
  type AgentRole,
  type ModelProvider,
} from '../domain/models'

/**
 * Create a new agent with validation
 */
export function createAgentUsecase(agentRepo: AgentRepository) {
  return async (userId: string, input: CreateAgentInput): Promise<AgentConfig> => {
    // Business rule: Agent name must not be empty
    if (!input.name.trim()) {
      throw new Error('Agent name is required')
    }

    // Business rule: System prompt must not be empty
    if (!input.systemPrompt.trim()) {
      throw new Error('System prompt is required')
    }

    // Business rule: Model name must be specified
    if (!input.modelName.trim()) {
      throw new Error('Model name is required')
    }

    // Business rule: Temperature must be valid if provided
    if (input.temperature !== undefined && (input.temperature < 0 || input.temperature > 2)) {
      throw new Error('Temperature must be between 0 and 2')
    }

    // Business rule: Max tokens must be positive if provided
    if (input.maxTokens !== undefined && input.maxTokens <= 0) {
      throw new Error('Max tokens must be positive')
    }

    // Auto-compute configHash for deduplication
    const inputWithHash: CreateAgentInput = {
      ...input,
      configHash: input.configHash ?? hashAgentConfig(input),
    }

    return await agentRepo.create(userId, inputWithHash)
  }
}

/**
 * Update an existing agent with validation
 */
export function updateAgentUsecase(agentRepo: AgentRepository) {
  return async (
    userId: string,
    agentId: AgentId,
    updates: UpdateAgentInput
  ): Promise<AgentConfig> => {
    // Business rule: If updating name, ensure it's not empty
    if (updates.name !== undefined && !updates.name.trim()) {
      throw new Error('Agent name cannot be empty')
    }

    // Business rule: If updating system prompt, ensure it's not empty
    if (updates.systemPrompt !== undefined && !updates.systemPrompt.trim()) {
      throw new Error('System prompt cannot be empty')
    }

    // Business rule: If updating model name, ensure it's not empty
    if (updates.modelName !== undefined && !updates.modelName.trim()) {
      throw new Error('Model name cannot be empty')
    }

    // Business rule: Temperature validation
    if (updates.temperature !== undefined && (updates.temperature < 0 || updates.temperature > 2)) {
      throw new Error('Temperature must be between 0 and 2')
    }

    // Business rule: Max tokens validation
    if (updates.maxTokens !== undefined && updates.maxTokens <= 0) {
      throw new Error('Max tokens must be positive')
    }

    // Recompute configHash when config fields change
    const configFieldUpdated =
      updates.systemPrompt !== undefined ||
      updates.role !== undefined ||
      updates.toolIds !== undefined ||
      updates.modelProvider !== undefined ||
      updates.modelName !== undefined ||
      updates.temperature !== undefined ||
      updates.modelTier !== undefined

    if (configFieldUpdated) {
      // Fetch existing agent to merge fields for hash computation
      const existing = await agentRepo.get(userId, agentId)
      if (!existing) {
        throw new Error(`Agent ${agentId} not found`)
      }
      const merged = {
        systemPrompt: updates.systemPrompt ?? existing.systemPrompt,
        role: updates.role ?? existing.role,
        toolIds: updates.toolIds ?? existing.toolIds,
        modelProvider: updates.modelProvider ?? existing.modelProvider,
        modelName: updates.modelName ?? existing.modelName,
        temperature: updates.temperature ?? existing.temperature,
        modelTier: updates.modelTier ?? existing.modelTier,
      }
      updates = { ...updates, configHash: hashAgentConfig(merged) }
    }

    return await agentRepo.update(userId, agentId, updates)
  }
}

/**
 * Delete an agent (soft delete - archives it)
 */
export function deleteAgentUsecase(agentRepo: AgentRepository) {
  return async (userId: string, agentId: AgentId): Promise<void> => {
    await agentRepo.delete(userId, agentId)
  }
}

/**
 * Get a single agent
 */
export function getAgentUsecase(agentRepo: AgentRepository) {
  return async (userId: string, agentId: AgentId): Promise<AgentConfig | null> => {
    return await agentRepo.get(userId, agentId)
  }
}

/**
 * List all agents for a user with optional filtering
 */
export function listAgentsUsecase(agentRepo: AgentRepository) {
  return async (
    userId: string,
    options?: {
      role?: AgentRole
      provider?: ModelProvider
      activeOnly?: boolean
    }
  ): Promise<AgentConfig[]> => {
    return await agentRepo.list(userId, options)
  }
}
