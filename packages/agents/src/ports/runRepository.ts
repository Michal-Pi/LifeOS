import type { Run, RunId, CreateRunInput, WorkspaceId, RunStatus } from '../domain/models'

export interface RunRepository {
  create(userId: string, input: CreateRunInput): Promise<Run>
  update(
    userId: string,
    runId: RunId,
    updates: Partial<Omit<Run, 'runId' | 'userId' | 'workspaceId'>>
  ): Promise<Run>
  get(userId: string, runId: RunId): Promise<Run | null>
  list(
    userId: string,
    options?: {
      workspaceId?: WorkspaceId
      status?: RunStatus
      limit?: number
    }
  ): Promise<Run[]>
  delete(userId: string, runId: RunId): Promise<void>
}
