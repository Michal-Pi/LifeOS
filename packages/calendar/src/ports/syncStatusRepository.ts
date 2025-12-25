export interface SyncStatusRepository {
  getStatus(userId: string): Promise<{
    lastSyncAt?: string
    lastSuccessAt?: string
    lastError?: string
  }>
}





