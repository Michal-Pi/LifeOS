import type {
  Workflow,
  WorkflowId,
  CreateWorkflowInput,
  UpdateWorkflowInput,
} from '../domain/models'

export interface WorkflowRepository {
  create(userId: string, input: CreateWorkflowInput): Promise<Workflow>
  update(userId: string, workflowId: WorkflowId, updates: UpdateWorkflowInput): Promise<Workflow>
  delete(userId: string, workflowId: WorkflowId): Promise<void>
  get(userId: string, workflowId: WorkflowId): Promise<Workflow | null>
  list(userId: string, options?: { activeOnly?: boolean }): Promise<Workflow[]>
}
