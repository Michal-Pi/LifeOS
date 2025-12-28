import type {
  Workspace,
  WorkspaceId,
  CreateWorkspaceInput,
  UpdateWorkspaceInput,
} from '../domain/models'

export interface WorkspaceRepository {
  create(userId: string, input: CreateWorkspaceInput): Promise<Workspace>
  update(
    userId: string,
    workspaceId: WorkspaceId,
    updates: UpdateWorkspaceInput
  ): Promise<Workspace>
  delete(userId: string, workspaceId: WorkspaceId): Promise<void>
  get(userId: string, workspaceId: WorkspaceId): Promise<Workspace | null>
  list(userId: string, options?: { activeOnly?: boolean }): Promise<Workspace[]>
}
