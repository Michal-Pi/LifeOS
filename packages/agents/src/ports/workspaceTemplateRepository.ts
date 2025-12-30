import type {
  WorkspaceTemplate,
  WorkspaceTemplateId,
  CreateWorkspaceTemplateInput,
} from '../domain/models'

export interface WorkspaceTemplateRepository {
  create(input: CreateWorkspaceTemplateInput): Promise<WorkspaceTemplate>
  update(
    templateId: WorkspaceTemplateId,
    updates: Partial<CreateWorkspaceTemplateInput>
  ): Promise<WorkspaceTemplate>
  get(userId: string, templateId: WorkspaceTemplateId): Promise<WorkspaceTemplate | null>
  list(userId: string): Promise<WorkspaceTemplate[]>
  delete(userId: string, templateId: WorkspaceTemplateId): Promise<void>
}
