/**
 * Google Contacts Sync Pipeline
 *
 * Fetches contacts from Google People API, deduplicates against existing
 * contacts via the contactEmailIndex, and creates/merges as needed.
 */

import { firestore } from '../lib/firebase.js'
import { createLogger } from '../lib/logger.js'
import {
  normalizeEmail,
  CIRCLE_TO_SIGNIFICANCE,
  type Contact,
  type ContactSource,
  type DunbarCircle,
  type ContactIdentifiers,
} from '@lifeos/agents'
import { newId } from '@lifeos/agents'
import { contactRef, contactEmailIndexRef, contactSyncStateRef } from './paths.js'
import type { GooglePerson } from '../google/contactsApi.js'

const log = createLogger('ContactsSync')
const MAX_BATCH_OPS = 100

// ----------------------------------------------------------------
// Types
// ----------------------------------------------------------------

export interface ContactSyncState {
  lastSyncAt?: string
  lastSuccessAt?: string
  lastError?: string
  totalContactsSynced?: number
  updatedAt?: string
}

export interface ContactSyncResult {
  contactsCreated: number
  contactsMerged: number
  emailIndexEntriesWritten: number
  totalGoogleContacts: number
  skippedNoEmail: number
}

// ----------------------------------------------------------------
// Field Mapping
// ----------------------------------------------------------------

function getPrimaryOrFirst<T extends { metadata?: { primary?: boolean } }>(
  items: T[] | undefined
): T | undefined {
  if (!items || items.length === 0) return undefined
  return items.find((i) => i.metadata?.primary) ?? items[0]
}

function extractEmails(person: GooglePerson): string[] {
  return (person.emailAddresses ?? [])
    .map((e) => normalizeEmail(e.value))
    .filter((e) => e.length > 0 && e.includes('@'))
}

function extractPhones(person: GooglePerson): string[] {
  return (person.phoneNumbers ?? [])
    .map((p) => p.canonicalForm ?? p.value)
    .filter(Boolean)
}

/**
 * Map a GooglePerson to the subset of Contact fields we can derive.
 * Does NOT set contactId, userId, or timestamps (handled by the caller).
 */
export function mapGooglePersonToContact(person: GooglePerson): {
  displayName: string
  firstName?: string
  lastName?: string
  avatarUrl?: string
  title?: string
  company?: string
  bio?: string
  identifiers: ContactIdentifiers
} {
  const primaryName = getPrimaryOrFirst(person.names)
  const primaryOrg = getPrimaryOrFirst(person.organizations)
  const primaryPhoto = getPrimaryOrFirst(person.photos)
  const primaryBio = person.biographies?.[0]

  const displayName =
    primaryName?.displayName ??
    [primaryName?.givenName, primaryName?.familyName].filter(Boolean).join(' ') ??
    ''

  return {
    displayName: displayName || '(No name)',
    firstName: primaryName?.givenName,
    lastName: primaryName?.familyName,
    avatarUrl: primaryPhoto?.default ? undefined : primaryPhoto?.url,
    title: primaryOrg?.title,
    company: primaryOrg?.name,
    bio: primaryBio?.value,
    identifiers: {
      emails: extractEmails(person),
      phones: extractPhones(person),
      googleContactId: person.resourceName,
    },
  }
}

// ----------------------------------------------------------------
// Sync Pipeline
// ----------------------------------------------------------------

/**
 * Sync Google Contacts into the user's contact collection.
 *
 * Pipeline:
 * 1. Fetch all contacts from Google People API
 * 2. For each contact with at least one email:
 *    a. Check contactEmailIndex for existing match
 *    b. If match: merge (add googleContactId, source, update empty fields)
 *    c. If no match: create new contact at circle=4
 * 3. Write/update contactEmailIndex entries
 * 4. Save sync state
 */
export async function syncGoogleContacts(
  uid: string,
  accountId: string
): Promise<ContactSyncResult> {
  // Lazy import to avoid deployment timeout
  const { fetchAllGoogleContacts } = await import('../google/contactsApi.js')

  const result: ContactSyncResult = {
    contactsCreated: 0,
    contactsMerged: 0,
    emailIndexEntriesWritten: 0,
    totalGoogleContacts: 0,
    skippedNoEmail: 0,
  }

  // 1. Fetch all Google Contacts
  const googleContacts = await fetchAllGoogleContacts(uid, accountId)
  result.totalGoogleContacts = googleContacts.length
  log.info('Fetched Google Contacts', { uid, count: googleContacts.length })

  // 2. Build email→existingContactId cache from contactEmailIndex (batch reads)
  const allEmails = new Set<string>()
  for (const person of googleContacts) {
    for (const ea of person.emailAddresses ?? []) {
      const norm = normalizeEmail(ea.value)
      if (norm.includes('@')) allEmails.add(norm)
    }
  }

  const emailArray = Array.from(allEmails)
  const emailToContactId = new Map<string, string>()

  for (let i = 0; i < emailArray.length; i += 100) {
    const chunk = emailArray.slice(i, i + 100)
    const refs = chunk.map((e) => contactEmailIndexRef(uid, e))
    const snapshots = await firestore.getAll(...refs)

    for (const snap of snapshots) {
      if (snap.exists) {
        const data = snap.data() as { contactId: string }
        emailToContactId.set(snap.id, data.contactId)
      }
    }
  }

  // 3. Process each Google Contact
  let batch = firestore.batch()
  let pendingOps = 0

  async function flushBatch() {
    if (pendingOps > 0) {
      await batch.commit()
      batch = firestore.batch()
      pendingOps = 0
    }
  }

  for (const person of googleContacts) {
    const mapped = mapGooglePersonToContact(person)

    // Skip contacts with no email (can't dedup them)
    if (mapped.identifiers.emails.length === 0) {
      result.skippedNoEmail++
      continue
    }

    // Check if any email already exists in the index
    let existingContactId: string | undefined
    for (const email of mapped.identifiers.emails) {
      const cid = emailToContactId.get(email)
      if (cid) {
        existingContactId = cid
        break
      }
    }

    const now = Date.now()

    if (existingContactId) {
      // ---- MERGE: update existing contact ----
      const existingRef = contactRef(uid, existingContactId)
      const existingSnap = await existingRef.get()

      if (existingSnap.exists) {
        const existing = existingSnap.data() as Contact
        const mergeUpdates: Record<string, unknown> = {
          updatedAtMs: now,
        }

        // Add googleContactId if not already set
        if (!existing.identifiers.googleContactId && mapped.identifiers.googleContactId) {
          mergeUpdates['identifiers.googleContactId'] = mapped.identifiers.googleContactId
        }

        // Add new emails not already on the contact
        const existingEmailSet = new Set(existing.identifiers.emails)
        const newEmails = mapped.identifiers.emails.filter((e) => !existingEmailSet.has(e))
        if (newEmails.length > 0) {
          mergeUpdates['identifiers.emails'] = [...existing.identifiers.emails, ...newEmails]
        }

        // Add new phones not already on the contact
        const existingPhoneSet = new Set(existing.identifiers.phones)
        const newPhones = mapped.identifiers.phones.filter((p) => !existingPhoneSet.has(p))
        if (newPhones.length > 0) {
          mergeUpdates['identifiers.phones'] = [...existing.identifiers.phones, ...newPhones]
        }

        // Fill empty fields only — never overwrite user edits
        if (!existing.avatarUrl && mapped.avatarUrl) mergeUpdates.avatarUrl = mapped.avatarUrl
        if (!existing.title && mapped.title) mergeUpdates.title = mapped.title
        if (!existing.company && mapped.company) mergeUpdates.company = mapped.company
        if (!existing.bio && mapped.bio) mergeUpdates.bio = mapped.bio
        if (!existing.firstName && mapped.firstName) mergeUpdates.firstName = mapped.firstName
        if (!existing.lastName && mapped.lastName) mergeUpdates.lastName = mapped.lastName

        // Add google_contacts to sources if not present
        if (!existing.sources.includes('google_contacts' as ContactSource)) {
          mergeUpdates.sources = [...existing.sources, 'google_contacts' as ContactSource]
        }

        batch.update(existingRef, mergeUpdates)
        pendingOps++
        result.contactsMerged++
      }
    } else {
      // ---- CREATE: new contact at circle 4 (Acquaintance) ----
      const contactId = newId('contact')
      const circle: DunbarCircle = 4

      const newContact: Contact = {
        contactId,
        userId: uid,
        displayName: mapped.displayName,
        firstName: mapped.firstName,
        lastName: mapped.lastName,
        avatarUrl: mapped.avatarUrl,
        title: mapped.title,
        company: mapped.company,
        bio: mapped.bio,
        circle,
        significance: CIRCLE_TO_SIGNIFICANCE[circle],
        identifiers: mapped.identifiers,
        tags: [],
        sources: ['google_contacts'],
        primarySource: 'google_contacts',
        archived: false,
        starred: false,
        createdAtMs: now,
        updatedAtMs: now,
      }

      batch.set(contactRef(uid, contactId), newContact)
      pendingOps++
      result.contactsCreated++

      // Update in-memory cache so subsequent contacts with the same email
      // get merged instead of duplicated within this sync run
      for (const email of mapped.identifiers.emails) {
        emailToContactId.set(email, contactId)
      }
    }

    // Write contactEmailIndex entries for ALL emails on this contact
    const resolvedContactId =
      existingContactId ?? emailToContactId.get(mapped.identifiers.emails[0])!
    for (const email of mapped.identifiers.emails) {
      batch.set(contactEmailIndexRef(uid, email), {
        contactId: resolvedContactId,
        displayName: mapped.displayName,
        updatedAtMs: now,
      })
      pendingOps++
      result.emailIndexEntriesWritten++

      if (pendingOps >= MAX_BATCH_OPS) {
        await flushBatch()
      }
    }

    if (pendingOps >= MAX_BATCH_OPS) {
      await flushBatch()
    }
  }

  // Final flush
  await flushBatch()

  // 4. Save sync state
  await contactSyncStateRef(uid).set({
    lastSyncAt: new Date().toISOString(),
    lastSuccessAt: new Date().toISOString(),
    totalContactsSynced: result.contactsCreated + result.contactsMerged,
    updatedAt: new Date().toISOString(),
  } satisfies ContactSyncState)

  log.info('Contact sync completed', {
    uid,
    created: result.contactsCreated,
    merged: result.contactsMerged,
    indexEntries: result.emailIndexEntriesWritten,
    skippedNoEmail: result.skippedNoEmail,
    total: result.totalGoogleContacts,
  })

  return result
}
