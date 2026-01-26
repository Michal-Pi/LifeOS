/**
 * Workspace Usecases
 *
 * Pure business logic for workspace operations.
 * Independent of UI framework and data layer.
 */

import { newId } from '@lifeos/core'
import type { WorkspaceRepository } from '../ports/workspaceRepository'
import type {
  Workspace,
  WorkspaceId,
  CreateWorkspaceInput,
  UpdateWorkspaceInput,
  ExpertCouncilConfig,
  ProjectManagerConfig,
} from '../domain/models'

const validateExpertCouncilConfig = (config: ExpertCouncilConfig): void => {
  if (!config.enabled) return

  if (config.minCouncilSize < 2) {
    throw new Error('Expert Council minimum council size must be at least 2')
  }

  if (config.maxCouncilSize < config.minCouncilSize) {
    throw new Error('Expert Council maximum council size must be >= minimum council size')
  }

  if (config.councilModels.length < config.minCouncilSize) {
    throw new Error('Expert Council must include at least the minimum number of council models')
  }

  if (config.councilModels.length > config.maxCouncilSize) {
    throw new Error('Expert Council exceeds the maximum number of council models')
  }

  if (config.cacheExpirationHours <= 0) {
    throw new Error('Expert Council cache expiration must be positive')
  }
}

const validateProjectManagerConfig = (config: ProjectManagerConfig): void => {
  if (config.expertCouncilThreshold < 0 || config.expertCouncilThreshold > 100) {
    throw new Error('Project Manager Expert Council threshold must be between 0 and 100')
  }
  if (config.qualityGateThreshold < 0 || config.qualityGateThreshold > 100) {
    throw new Error('Project Manager quality gate threshold must be between 0 and 100')
  }
}

/**
 * Create a new workspace with validation
 */
export function createWorkspaceUsecase(workspaceRepo: WorkspaceRepository) {
  return async (userId: string, input: CreateWorkspaceInput): Promise<Workspace> => {
    // Business rule: Workspace name must not be empty
    if (!input.name.trim()) {
      throw new Error('Workspace name is required')
    }

    // Business rule: Must have at least one agent
    if (input.agentIds.length === 0) {
      throw new Error('Workspace must have at least one agent')
    }

    // Business rule: If default agent is set, it must be in the agent list
    if (input.defaultAgentId && !input.agentIds.includes(input.defaultAgentId)) {
      throw new Error('Default agent must be in the workspace agent list')
    }

    // Business rule: Max iterations must be reasonable if provided
    if (
      input.maxIterations !== undefined &&
      (input.maxIterations < 1 || input.maxIterations > 50)
    ) {
      throw new Error('Max iterations must be between 1 and 50')
    }

    if (input.expertCouncilConfig) {
      validateExpertCouncilConfig(input.expertCouncilConfig)
    }
    if (input.projectManagerConfig) {
      validateProjectManagerConfig(input.projectManagerConfig)
    }

    return await workspaceRepo.create(userId, input)
  }
}

/**
 * Update an existing workspace with validation
 */
export function updateWorkspaceUsecase(workspaceRepo: WorkspaceRepository) {
  return async (
    userId: string,
    workspaceId: WorkspaceId,
    updates: UpdateWorkspaceInput
  ): Promise<Workspace> => {
    // Business rule: If updating name, ensure it's not empty
    if (updates.name !== undefined && !updates.name.trim()) {
      throw new Error('Workspace name cannot be empty')
    }

    // Business rule: If updating agents, must have at least one
    if (updates.agentIds !== undefined && updates.agentIds.length === 0) {
      throw new Error('Workspace must have at least one agent')
    }

    // Business rule: If updating default agent, validate it's in the list
    if (
      updates.defaultAgentId &&
      updates.agentIds &&
      !updates.agentIds.includes(updates.defaultAgentId)
    ) {
      throw new Error('Default agent must be in the workspace agent list')
    }

    // Business rule: Max iterations validation
    if (
      updates.maxIterations !== undefined &&
      (updates.maxIterations < 1 || updates.maxIterations > 50)
    ) {
      throw new Error('Max iterations must be between 1 and 50')
    }

    if (updates.expertCouncilConfig) {
      validateExpertCouncilConfig(updates.expertCouncilConfig)
    }
    if (updates.projectManagerConfig) {
      validateProjectManagerConfig(updates.projectManagerConfig)
    }

    return await workspaceRepo.update(userId, workspaceId, updates)
  }
}

/**
 * Delete a workspace
 */
export function deleteWorkspaceUsecase(workspaceRepo: WorkspaceRepository) {
  return async (userId: string, workspaceId: WorkspaceId): Promise<void> => {
    await workspaceRepo.delete(userId, workspaceId)
  }
}

/**
 * Get a single workspace
 */
export function getWorkspaceUsecase(workspaceRepo: WorkspaceRepository) {
  return async (userId: string, workspaceId: WorkspaceId): Promise<Workspace | null> => {
    return await workspaceRepo.get(userId, workspaceId)
  }
}

/**
 * List all workspaces for a user with optional filtering
 */
export function listWorkspacesUsecase(workspaceRepo: WorkspaceRepository) {
  return async (userId: string, options?: { activeOnly?: boolean }): Promise<Workspace[]> => {
    return await workspaceRepo.list(userId, options)
  }
}
