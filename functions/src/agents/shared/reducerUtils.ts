/**
 * Shared Reducer Utilities for LangGraph State Annotations
 *
 * Provides reusable reducer helpers for common patterns like
 * capped arrays with FIFO eviction.
 */

/**
 * Creates a LangGraph-compatible additive reducer with a size cap.
 * When merged array exceeds maxSize, keeps the last maxSize items (FIFO eviction)
 * unless a custom evictionFn is provided.
 */
export function cappedReducer<T>(
  maxSize: number,
  evictionFn?: (items: T[]) => T[]
): (current: T[], update: T[]) => T[] {
  return (current: T[], update: T[]) => {
    const merged = [...current, ...update]
    if (merged.length <= maxSize) return merged
    return evictionFn ? evictionFn(merged).slice(0, maxSize) : merged.slice(-maxSize)
  }
}
