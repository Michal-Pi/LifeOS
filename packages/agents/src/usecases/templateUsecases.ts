import type {
  AgentTemplate,
  AgentTemplateId,
  CreateAgentTemplateInput,
  WorkspaceTemplate,
  WorkspaceTemplateId,
  CreateWorkspaceTemplateInput,
} from '../domain/models'
import type { AgentTemplateRepository } from '../ports/agentTemplateRepository'
import type { WorkspaceTemplateRepository } from '../ports/workspaceTemplateRepository'

type CreateAgentTemplatePayload = Omit<
  CreateAgentTemplateInput,
  'userId' | 'createdAtMs' | 'updatedAtMs'
>

type CreateWorkspaceTemplatePayload = Omit<
  CreateWorkspaceTemplateInput,
  'userId' | 'createdAtMs' | 'updatedAtMs'
>

export const createAgentTemplateUsecase = (repo: AgentTemplateRepository) => {
  return async (userId: string, input: CreateAgentTemplatePayload): Promise<AgentTemplate> => {
    return repo.create({
      ...input,
      userId,
    })
  }
}

export const updateAgentTemplateUsecase = (repo: AgentTemplateRepository) => {
  return async (
    userId: string,
    templateId: AgentTemplateId,
    updates: Partial<CreateAgentTemplatePayload>
  ): Promise<AgentTemplate> => {
    return repo.update(templateId, {
      ...updates,
      userId,
    })
  }
}

export const deleteAgentTemplateUsecase = (repo: AgentTemplateRepository) => {
  return async (userId: string, templateId: AgentTemplateId): Promise<void> => {
    return repo.delete(userId, templateId)
  }
}

export const getAgentTemplateUsecase = (repo: AgentTemplateRepository) => {
  return async (userId: string, templateId: AgentTemplateId): Promise<AgentTemplate | null> => {
    return repo.get(userId, templateId)
  }
}

export const listAgentTemplatesUsecase = (repo: AgentTemplateRepository) => {
  return async (userId: string): Promise<AgentTemplate[]> => {
    return repo.list(userId)
  }
}

export const createWorkspaceTemplateUsecase = (repo: WorkspaceTemplateRepository) => {
  return async (
    userId: string,
    input: CreateWorkspaceTemplatePayload
  ): Promise<WorkspaceTemplate> => {
    return repo.create({
      ...input,
      userId,
    })
  }
}

export const updateWorkspaceTemplateUsecase = (repo: WorkspaceTemplateRepository) => {
  return async (
    userId: string,
    templateId: WorkspaceTemplateId,
    updates: Partial<CreateWorkspaceTemplatePayload>
  ): Promise<WorkspaceTemplate> => {
    return repo.update(templateId, {
      ...updates,
      userId,
    })
  }
}

export const deleteWorkspaceTemplateUsecase = (repo: WorkspaceTemplateRepository) => {
  return async (userId: string, templateId: WorkspaceTemplateId): Promise<void> => {
    return repo.delete(userId, templateId)
  }
}

export const getWorkspaceTemplateUsecase = (repo: WorkspaceTemplateRepository) => {
  return async (
    userId: string,
    templateId: WorkspaceTemplateId
  ): Promise<WorkspaceTemplate | null> => {
    return repo.get(userId, templateId)
  }
}

export const listWorkspaceTemplatesUsecase = (repo: WorkspaceTemplateRepository) => {
  return async (userId: string): Promise<WorkspaceTemplate[]> => {
    return repo.list(userId)
  }
}
