export interface CalendarSyncRunRepository {
  recordRun(runId: string, payload: {
    userId: string
    accountId: string
    startedAt: string
    endedAt?: string
    status: 'pending' | 'success' | 'failed'
    mode: 'full' | 'incremental' | 'manual'
    counts: {
      calendarsFetched: number
      eventsFetched: number
      rawWritten: number
      canonicalUpserted: number
      canonicalDeleted: number
    }
    errors?: string[]
  }): Promise<void>
}





