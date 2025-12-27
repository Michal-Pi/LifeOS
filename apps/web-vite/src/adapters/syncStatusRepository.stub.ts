import type { SyncStatusRepository } from '@lifeos/calendar'

export function createSyncStatusRepositoryStub(): SyncStatusRepository {
  return {
    async getStatus() {
      const now = new Date()
      return {
        lastSyncAt: now.toISOString(),
        lastSuccessAt: now.toISOString(),
        lastError: undefined,
      }
    },
  }
}
