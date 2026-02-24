/**
 * Contact Dedup — client-side wrappers for dedup Cloud Functions.
 */

import { httpsCallable, getFunctions } from 'firebase/functions'
import type {
  FindDuplicatesResult,
  MergeContactsInput,
  MergeContactsResult,
} from '@lifeos/agents'

export async function findDuplicateContacts(
  minScore?: number
): Promise<FindDuplicatesResult> {
  const functions = getFunctions()
  const callable = httpsCallable<{ minScore?: number }, FindDuplicatesResult>(
    functions,
    'findDuplicateContacts'
  )
  const result = await callable({ minScore })
  return result.data
}

export async function mergeContacts(input: MergeContactsInput): Promise<MergeContactsResult> {
  const functions = getFunctions()
  const callable = httpsCallable<MergeContactsInput, MergeContactsResult>(
    functions,
    'mergeContacts'
  )
  const result = await callable(input)
  return result.data
}
