/**
 * Batch email-to-contact lookup.
 *
 * Reads the contactEmailIndex to resolve email addresses to contact IDs
 * without requiring client-side write access to the index.
 */

import { firestore } from '../lib/firebase.js'
import { contactEmailIndexRef } from './paths.js'
import { normalizeEmail } from '@lifeos/agents'

export interface EmailLookupResult {
  email: string
  contactId: string | null
  displayName: string | null
}

/**
 * Look up contacts by email addresses.
 * Returns the contactId and displayName for each email found in the index.
 *
 * Max 50 emails per call to prevent abuse.
 */
export async function batchLookupContactEmails(
  uid: string,
  emails: string[]
): Promise<EmailLookupResult[]> {
  if (emails.length === 0) return []
  if (emails.length > 50) {
    throw new Error('Max 50 emails per lookup call')
  }

  const normalizedEmails = emails.map(normalizeEmail)
  const refs = normalizedEmails.map((e) => contactEmailIndexRef(uid, e))
  const snapshots = await firestore.getAll(...refs)

  return normalizedEmails.map((email, i) => {
    const snap = snapshots[i]
    if (snap.exists) {
      const data = snap.data() as { contactId: string; displayName?: string }
      return {
        email,
        contactId: data.contactId,
        displayName: data.displayName ?? null,
      }
    }
    return { email, contactId: null, displayName: null }
  })
}
