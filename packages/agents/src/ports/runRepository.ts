import type { Run, RunId, CreateRunInput, WorkflowId, RunStatus } from '../domain/models'

export interface RunRepository {
  create(userId: string, input: CreateRunInput): Promise<Run>
  update(
    userId: string,
    runId: RunId,
    updates: Partial<Omit<Run, 'runId' | 'userId' | 'workflowId'>>
  ): Promise<Run>
  get(userId: string, runId: RunId): Promise<Run | null>
  list(
    userId: string,
    options?: {
      workflowId?: WorkflowId
      status?: RunStatus
      limit?: number
    }
  ): Promise<Run[]>
  delete(userId: string, runId: RunId): Promise<void>
}
