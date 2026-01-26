import type {
  DeepResearchRequest,
  DeepResearchRequestId,
  DeepResearchStatus,
  CreateDeepResearchRequestInput,
  WorkspaceId,
  RunId,
} from '../domain/models'

export interface DeepResearchRepository {
  create(userId: string, input: CreateDeepResearchRequestInput): Promise<DeepResearchRequest>
  update(
    userId: string,
    workspaceId: WorkspaceId,
    requestId: DeepResearchRequestId,
    updates: Partial<Omit<DeepResearchRequest, 'requestId' | 'userId' | 'workspaceId'>>
  ): Promise<DeepResearchRequest>
  get(
    userId: string,
    workspaceId: WorkspaceId,
    requestId: DeepResearchRequestId
  ): Promise<DeepResearchRequest | null>
  list(
    userId: string,
    options?: {
      workspaceId?: WorkspaceId
      status?: DeepResearchStatus
      runId?: RunId
      limit?: number
    }
  ): Promise<DeepResearchRequest[]>
}
