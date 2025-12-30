import type { AgentTemplate, AgentTemplateId, CreateAgentTemplateInput } from '../domain/models'

export interface AgentTemplateRepository {
  create(input: CreateAgentTemplateInput): Promise<AgentTemplate>
  update(
    templateId: AgentTemplateId,
    updates: Partial<CreateAgentTemplateInput>
  ): Promise<AgentTemplate>
  get(userId: string, templateId: AgentTemplateId): Promise<AgentTemplate | null>
  list(userId: string): Promise<AgentTemplate[]>
  delete(userId: string, templateId: AgentTemplateId): Promise<void>
}
