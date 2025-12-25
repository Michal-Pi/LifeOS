/**
 * Sync run status
 */
export type SyncRunStatus = 'in_progress' | 'completed' | 'failed'

/**
 * Sync mode
 */
export type SyncRunMode = 'full' | 'incremental' | 'manual'

/**
 * Error entry in a sync run
 */
export interface SyncRunError {
  code: string
  message: string
  eventId?: string
  timestamp?: string
}

/**
 * Cursor info for incremental sync
 */
export interface SyncCursorInfo {
  syncToken?: string
  pageToken?: string
}

/**
 * Counts tracked during a sync run
 */
export interface SyncRunCounts {
  calendarsFetched: number
  eventsFetched: number
  rawWritten: number
  canonicalUpserted: number
  canonicalDeleted: number
  // Composite counts (Phase 2.0E)
  compositeCreated: number
  compositeUpdated: number
  duplicatesDetected: number
}

/**
 * A sync run tracks a single execution of the sync pipeline
 */
export interface CalendarSyncRun {
  runId: string
  accountId: string
  startedAt: string
  endedAt?: string
  status: SyncRunStatus
  mode: SyncRunMode
  counts: SyncRunCounts
  errors: SyncRunError[]
  cursorInfo?: SyncCursorInfo
}

/**
 * Create a new sync run with default counts
 */
export function createSyncRun(
  runId: string,
  accountId: string,
  mode: SyncRunMode
): CalendarSyncRun {
  return {
    runId,
    accountId,
    startedAt: new Date().toISOString(),
    status: 'in_progress',
    mode,
    counts: {
      calendarsFetched: 0,
      eventsFetched: 0,
      rawWritten: 0,
      canonicalUpserted: 0,
      canonicalDeleted: 0,
      compositeCreated: 0,
      compositeUpdated: 0,
      duplicatesDetected: 0
    },
    errors: []
  }
}

/**
 * Mark a sync run as completed
 */
export function completeSyncRun(run: CalendarSyncRun): CalendarSyncRun {
  return {
    ...run,
    status: 'completed',
    endedAt: new Date().toISOString()
  }
}

/**
 * Mark a sync run as failed
 */
export function failSyncRun(run: CalendarSyncRun, error: SyncRunError): CalendarSyncRun {
  return {
    ...run,
    status: 'failed',
    endedAt: new Date().toISOString(),
    errors: [...run.errors, error]
  }
}

/**
 * Update counts in a sync run
 */
export function updateSyncRunCounts(
  run: CalendarSyncRun,
  updates: Partial<SyncRunCounts>
): CalendarSyncRun {
  return {
    ...run,
    counts: {
      ...run.counts,
      ...updates
    }
  }
}





