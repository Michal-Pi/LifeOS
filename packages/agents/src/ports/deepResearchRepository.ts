import type {
  DeepResearchRequest,
  DeepResearchRequestId,
  DeepResearchStatus,
  CreateDeepResearchRequestInput,
  WorkflowId,
  RunId,
} from '../domain/models'

export interface DeepResearchRepository {
  create(userId: string, input: CreateDeepResearchRequestInput): Promise<DeepResearchRequest>
  update(
    userId: string,
    workflowId: WorkflowId,
    requestId: DeepResearchRequestId,
    updates: Partial<Omit<DeepResearchRequest, 'requestId' | 'userId' | 'workflowId'>>
  ): Promise<DeepResearchRequest>
  get(
    userId: string,
    workflowId: WorkflowId,
    requestId: DeepResearchRequestId
  ): Promise<DeepResearchRequest | null>
  list(
    userId: string,
    options?: {
      workflowId?: WorkflowId
      status?: DeepResearchStatus
      runId?: RunId
      limit?: number
    }
  ): Promise<DeepResearchRequest[]>
}
