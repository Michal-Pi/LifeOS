import type {
  AgentTemplate,
  AgentTemplateId,
  CreateAgentTemplateInput,
  WorkflowTemplate,
  WorkflowTemplateId,
  CreateWorkflowTemplateInput,
} from '../domain/models'
import type { AgentTemplateRepository } from '../ports/agentTemplateRepository'
import type { WorkflowTemplateRepository } from '../ports/workflowTemplateRepository'

type CreateAgentTemplatePayload = Omit<
  CreateAgentTemplateInput,
  'userId' | 'createdAtMs' | 'updatedAtMs'
>

type CreateWorkflowTemplatePayload = Omit<
  CreateWorkflowTemplateInput,
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

export const createWorkflowTemplateUsecase = (repo: WorkflowTemplateRepository) => {
  return async (
    userId: string,
    input: CreateWorkflowTemplatePayload
  ): Promise<WorkflowTemplate> => {
    return repo.create({
      ...input,
      userId,
    })
  }
}

export const updateWorkflowTemplateUsecase = (repo: WorkflowTemplateRepository) => {
  return async (
    userId: string,
    templateId: WorkflowTemplateId,
    updates: Partial<CreateWorkflowTemplatePayload>
  ): Promise<WorkflowTemplate> => {
    return repo.update(templateId, {
      ...updates,
      userId,
    })
  }
}

export const deleteWorkflowTemplateUsecase = (repo: WorkflowTemplateRepository) => {
  return async (userId: string, templateId: WorkflowTemplateId): Promise<void> => {
    return repo.delete(userId, templateId)
  }
}

export const getWorkflowTemplateUsecase = (repo: WorkflowTemplateRepository) => {
  return async (
    userId: string,
    templateId: WorkflowTemplateId
  ): Promise<WorkflowTemplate | null> => {
    return repo.get(userId, templateId)
  }
}

export const listWorkflowTemplatesUsecase = (repo: WorkflowTemplateRepository) => {
  return async (userId: string): Promise<WorkflowTemplate[]> => {
    return repo.list(userId)
  }
}
