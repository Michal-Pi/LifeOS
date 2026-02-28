import type {
  WorkflowTemplate,
  WorkflowTemplateId,
  CreateWorkflowTemplateInput,
} from '../domain/models'

export interface WorkflowTemplateRepository {
  create(input: CreateWorkflowTemplateInput): Promise<WorkflowTemplate>
  update(
    templateId: WorkflowTemplateId,
    updates: Partial<CreateWorkflowTemplateInput>
  ): Promise<WorkflowTemplate>
  get(userId: string, templateId: WorkflowTemplateId): Promise<WorkflowTemplate | null>
  list(userId: string): Promise<WorkflowTemplate[]>
  delete(userId: string, templateId: WorkflowTemplateId): Promise<void>
}
