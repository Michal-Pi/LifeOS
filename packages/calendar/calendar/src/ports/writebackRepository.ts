import type { WritebackJob } from '../domain/writeback'

/**
 * Repository for writeback queue operations
 */
export interface WritebackRepository {
  /**
   * Get a writeback job by ID
   */
  getById(uid: string, jobId: string): Promise<WritebackJob | null>

  /**
   * Find pending jobs for a user that are available for processing
   */
  findAvailablePending(uid: string, limit?: number): Promise<WritebackJob[]>

  /**
   * Find jobs for a specific canonical event
   */
  findByEventId(uid: string, eventId: string): Promise<WritebackJob[]>

  /**
   * Find pending jobs for a specific event (to prevent duplicates)
   */
  findPendingByEventId(uid: string, eventId: string): Promise<WritebackJob[]>

  /**
   * Create a new writeback job
   */
  create(uid: string, job: WritebackJob): Promise<void>

  /**
   * Update a writeback job (for status changes, retries, etc.)
   */
  update(uid: string, jobId: string, job: WritebackJob): Promise<void>

  /**
   * Delete a writeback job
   */
  delete(uid: string, jobId: string): Promise<void>

  /**
   * Claim a job for processing (atomic transition from pending to processing)
   * Returns the updated job if successful, null if already claimed
   */
  claimJob(uid: string, jobId: string): Promise<WritebackJob | null>

  /**
   * Delete succeeded jobs older than a threshold
   */
  cleanupSucceeded(uid: string, olderThanMs: number): Promise<number>
}





