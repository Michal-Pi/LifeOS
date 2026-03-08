/**
 * Workflow Usecases
 *
 * Pure business logic for workflow operations.
 * Independent of UI framework and data layer.
 */

import type { WorkflowRepository } from '../ports/workflowRepository'
import type {
  Workflow,
  WorkflowId,
  CreateWorkflowInput,
  UpdateWorkflowInput,
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
 * Create a new workflow with validation
 */
export function createWorkflowUsecase(workflowRepo: WorkflowRepository) {
  return async (userId: string, input: CreateWorkflowInput): Promise<Workflow> => {
    // Business rule: Workflow name must not be empty
    if (!input.name.trim()) {
      throw new Error('Workflow name is required')
    }

    // Business rule: Must have at least one agent
    if (input.agentIds.length === 0) {
      throw new Error('Workflow must have at least one agent')
    }

    // Business rule: If default agent is set, it must be in the agent list
    if (input.defaultAgentId && !input.agentIds.includes(input.defaultAgentId)) {
      throw new Error('Default agent must be in the workflow agent list')
    }

    // Business rule: Max iterations must be reasonable if provided
    if (
      input.maxIterations !== undefined &&
      (input.maxIterations < 1 || input.maxIterations > 200)
    ) {
      throw new Error('Max iterations must be between 1 and 200')
    }

    if (input.expertCouncilConfig) {
      validateExpertCouncilConfig(input.expertCouncilConfig)
    }
    if (input.projectManagerConfig) {
      validateProjectManagerConfig(input.projectManagerConfig)
    }

    return await workflowRepo.create(userId, input)
  }
}

/**
 * Update an existing workflow with validation
 */
export function updateWorkflowUsecase(workflowRepo: WorkflowRepository) {
  return async (
    userId: string,
    workflowId: WorkflowId,
    updates: UpdateWorkflowInput
  ): Promise<Workflow> => {
    // Business rule: If updating name, ensure it's not empty
    if (updates.name !== undefined && !updates.name.trim()) {
      throw new Error('Workflow name cannot be empty')
    }

    // Business rule: If updating agents, must have at least one
    if (updates.agentIds !== undefined && updates.agentIds.length === 0) {
      throw new Error('Workflow must have at least one agent')
    }

    // Business rule: If updating default agent, validate it's in the effective agent list
    if (updates.defaultAgentId) {
      const effectiveAgentIds =
        updates.agentIds ?? (await workflowRepo.get(userId, workflowId))?.agentIds ?? []
      if (effectiveAgentIds.length > 0 && !effectiveAgentIds.includes(updates.defaultAgentId)) {
        throw new Error('Default agent must be in the workflow agent list')
      }
    }

    // Business rule: Max iterations validation
    if (
      updates.maxIterations !== undefined &&
      (updates.maxIterations < 1 || updates.maxIterations > 200)
    ) {
      throw new Error('Max iterations must be between 1 and 200')
    }

    if (updates.expertCouncilConfig) {
      validateExpertCouncilConfig(updates.expertCouncilConfig)
    }
    if (updates.projectManagerConfig) {
      validateProjectManagerConfig(updates.projectManagerConfig)
    }

    return await workflowRepo.update(userId, workflowId, updates)
  }
}

/**
 * Delete a workflow
 */
export function deleteWorkflowUsecase(workflowRepo: WorkflowRepository) {
  return async (userId: string, workflowId: WorkflowId): Promise<void> => {
    await workflowRepo.delete(userId, workflowId)
  }
}

/**
 * Get a single workflow
 */
export function getWorkflowUsecase(workflowRepo: WorkflowRepository) {
  return async (userId: string, workflowId: WorkflowId): Promise<Workflow | null> => {
    return await workflowRepo.get(userId, workflowId)
  }
}

/**
 * List all workflows for a user with optional filtering
 */
export function listWorkflowsUsecase(workflowRepo: WorkflowRepository) {
  return async (userId: string, options?: { activeOnly?: boolean }): Promise<Workflow[]> => {
    return await workflowRepo.list(userId, options)
  }
}
