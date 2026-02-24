/**
 * findDuplicateContacts — Cloud Function callable.
 *
 * Scans all non-archived contacts for a user and returns
 * duplicate candidate pairs ranked by confidence score.
 *
 * Deterministic matching only (no AI): email/phone overlap,
 * name similarity via Jaro-Winkler, name+company compound.
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { createLogger } from '../lib/logger.js'
import { contactsCollection } from './paths.js'
import {
  compareContacts,
  type ContactForDedup,
  type Contact,
  type ContactId,
  type DuplicateCandidate,
  type FindDuplicatesResult,
} from '@lifeos/agents'

const log = createLogger('FindDuplicates')

export const findDuplicateContacts = onCall(
  { timeoutSeconds: 120, memory: '512MiB' },
  async (request): Promise<FindDuplicatesResult> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be logged in')
    }

    const userId = request.auth.uid
    const { minScore = 60 } = (request.data ?? {}) as { minScore?: number }

    const startMs = Date.now()

    // 1. Load all non-archived contacts
    const snapshot = await contactsCollection(userId).where('archived', '==', false).get()

    const contacts: ContactForDedup[] = []
    for (const doc of snapshot.docs) {
      const c = doc.data() as Contact
      // Guard against corrupted docs with missing identifiers
      if (!c.contactId || !c.displayName || !c.identifiers) continue
      contacts.push({
        contactId: c.contactId,
        displayName: c.displayName,
        firstName: c.firstName,
        lastName: c.lastName,
        company: c.company,
        identifiers: {
          emails: c.identifiers.emails ?? [],
          phones: c.identifiers.phones ?? [],
          linkedinSlug: c.identifiers.linkedinSlug,
          telegramUsername: c.identifiers.telegramUsername,
        },
      })
    }

    // 2. Pairwise comparison (O(n^2/2))
    const candidates: DuplicateCandidate[] = []

    for (let i = 0; i < contacts.length; i++) {
      for (let j = i + 1; j < contacts.length; j++) {
        const result = compareContacts(contacts[i], contacts[j])
        if (result && result.score >= minScore) {
          candidates.push({
            contactIdA: contacts[i].contactId as ContactId,
            contactIdB: contacts[j].contactId as ContactId,
            displayNameA: contacts[i].displayName,
            displayNameB: contacts[j].displayName,
            score: result.score,
            reasons: result.reasons,
          })
        }
      }
    }

    // 3. Sort by score descending, cap at 100
    candidates.sort((a, b) => b.score - a.score)
    const capped = candidates.slice(0, 100)

    const durationMs = Date.now() - startMs
    log.info('Duplicate scan completed', {
      userId,
      contactsScanned: contacts.length,
      candidatesFound: candidates.length,
      returned: capped.length,
      durationMs,
    })

    return {
      candidates: capped,
      totalContactsScanned: contacts.length,
      scanDurationMs: durationMs,
    }
  }
)
