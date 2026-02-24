/**
 * Contact Dedup Domain Types
 *
 * Types for duplicate candidate pairs, merge input/output,
 * and find-duplicates results.
 */

import type { ContactId } from './contacts'
import type { DedupReason } from './nameSimilarity'

/** A pair of contacts suspected to be duplicates */
export interface DuplicateCandidate {
  contactIdA: ContactId
  contactIdB: ContactId
  displayNameA: string
  displayNameB: string
  score: number // 0-100
  reasons: DedupReason[]
}

/** Input for merging contacts */
export interface MergeContactsInput {
  primaryContactId: ContactId
  secondaryContactIds: ContactId[] // 1 or more contacts to merge into primary
}

/** Result of a merge operation */
export interface MergeContactsResult {
  mergedContactId: ContactId
  secondariesRemoved: number
  interactionsMoved: number
  emailIndexEntriesUpdated: number
}

/** Result of a find-duplicates scan */
export interface FindDuplicatesResult {
  candidates: DuplicateCandidate[]
  totalContactsScanned: number
  scanDurationMs: number
}
