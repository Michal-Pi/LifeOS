import type { CompositeEvent } from '../domain/composite'

/**
 * Repository for composite event operations
 */
export interface CompositeEventRepository {
  /**
   * Get a composite event by ID
   */
  getById(userId: string, compositeEventId: string): Promise<CompositeEvent | null>

  /**
   * Find composite events containing a specific canonical event
   */
  findByCanonicalEventId(userId: string, canonicalEventId: string): Promise<CompositeEvent[]>

  /**
   * Find composite events containing any of the specified canonical event IDs
   * Returns a map of canonicalEventId -> CompositeEvent[]
   * More efficient than calling findByCanonicalEventId multiple times
   */
  findByCanonicalEventIds(
    userId: string,
    canonicalEventIds: string[]
  ): Promise<Map<string, CompositeEvent[]>>

  /**
   * Find composite events by iCalUID (for deduplication during sync)
   */
  findByICalUID(userId: string, iCalUID: string): Promise<CompositeEvent[]>

  /**
   * List composite events in a time range
   */
  listByRange(userId: string, startMs: number, endMs: number): Promise<CompositeEvent[]>

  /**
   * Create a new composite event
   */
  create(userId: string, composite: CompositeEvent): Promise<void>

  /**
   * Update an existing composite event
   */
  update(userId: string, compositeEventId: string, composite: CompositeEvent): Promise<void>

  /**
   * Delete a composite event
   */
  delete(userId: string, compositeEventId: string): Promise<void>

  /**
   * Batch create composites (for sync operations)
   */
  batchCreate(userId: string, composites: CompositeEvent[]): Promise<void>
}
