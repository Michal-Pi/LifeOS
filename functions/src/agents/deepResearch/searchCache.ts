/**
 * Phase 45 — Search Result Caching
 *
 * Firestore-backed cache for search results with per-source TTLs.
 * Reduces API costs by avoiding redundant searches.
 */

import { createHash } from 'crypto'

export type SearchSource = 'serp' | 'scholar' | 'semantic'

/** TTL in milliseconds per search source */
const CACHE_TTL_MS: Record<SearchSource, number> = {
  serp: 24 * 60 * 60 * 1000, // 24 hours
  scholar: 72 * 60 * 60 * 1000, // 72 hours
  semantic: 48 * 60 * 60 * 1000, // 48 hours
}

/**
 * Generate a deterministic cache key from a query string.
 */
export function computeQueryHash(query: string): string {
  return createHash('sha256').update(query.trim().toLowerCase()).digest('hex').slice(0, 32)
}

export interface CachedSearchEntry {
  queryHash: string
  source: SearchSource
  results: unknown[]
  cachedAtMs: number
  expiresAtMs: number
}

/**
 * Look up cached search results for a query + source combination.
 * Returns null if not found or expired.
 */
export async function getCachedSearchResults(
  userId: string,
  queryHash: string,
  source: SearchSource,
  firestore: FirebaseFirestore.Firestore
): Promise<unknown[] | null> {
  const docId = `${queryHash}_${source}`
  const docRef = firestore.doc(`users/${userId}/searchCache/${docId}`)

  const snapshot = await docRef.get()
  if (!snapshot.exists) return null

  const data = snapshot.data() as CachedSearchEntry
  if (Date.now() > data.expiresAtMs) {
    // Expired — treat as miss (don't delete, let TTL cleanup handle it)
    return null
  }

  return data.results
}

/**
 * Store search results in the cache.
 */
export async function cacheSearchResults(
  userId: string,
  queryHash: string,
  source: SearchSource,
  results: unknown[],
  firestore: FirebaseFirestore.Firestore
): Promise<void> {
  const docId = `${queryHash}_${source}`
  const now = Date.now()

  const entry: CachedSearchEntry = {
    queryHash,
    source,
    results,
    cachedAtMs: now,
    expiresAtMs: now + CACHE_TTL_MS[source],
  }

  await firestore.doc(`users/${userId}/searchCache/${docId}`).set(entry)
}
