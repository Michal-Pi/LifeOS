import type { ToolRepository } from '../ports/toolRepository'
import type { CreateToolInput, ToolDefinition, ToolId } from '../domain/models'

type CreateToolPayload = Omit<CreateToolInput, 'userId' | 'createdAtMs' | 'updatedAtMs'>

export const createToolUsecase = (repo: ToolRepository) => {
  return async (userId: string, input: CreateToolPayload): Promise<ToolDefinition> => {
    return repo.create({
      ...input,
      userId,
    })
  }
}

export const updateToolUsecase = (repo: ToolRepository) => {
  return async (
    userId: string,
    toolId: ToolId,
    updates: Partial<CreateToolPayload>
  ): Promise<ToolDefinition> => {
    return repo.update(toolId, {
      ...updates,
      userId,
    })
  }
}

export const deleteToolUsecase = (repo: ToolRepository) => {
  return async (userId: string, toolId: ToolId): Promise<void> => {
    return repo.delete(userId, toolId)
  }
}

export const getToolUsecase = (repo: ToolRepository) => {
  return async (userId: string, toolId: ToolId): Promise<ToolDefinition | null> => {
    return repo.get(userId, toolId)
  }
}

export const listToolsUsecase = (repo: ToolRepository) => {
  return async (userId: string, options?: { module?: string }): Promise<ToolDefinition[]> => {
    return repo.list({ userId, module: options?.module })
  }
}
