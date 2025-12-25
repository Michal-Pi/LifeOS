export type SyncJobId = string & { readonly __syncJobId: unique symbol }

export interface SyncJobSummary {
  id: SyncJobId
  description: string
  updatedAt: Date
}

export interface SyncJobPort {
  fetchPendingJobs(): Promise<SyncJobSummary[]>
}
