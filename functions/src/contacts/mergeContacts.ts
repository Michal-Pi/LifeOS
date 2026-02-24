/**
 * mergeContacts — Cloud Function callable.
 *
 * Atomically merges one or more secondary contacts into a primary contact.
 *
 * Steps:
 * 1. Read primary + all secondaries (validate all exist)
 * 2. Merge identifiers (union of emails, phones, etc.)
 * 3. Fill empty fields on primary from secondaries
 * 4. Copy all interactions from secondaries to primary's subcollection
 * 5. Delete interactions from secondary subcollections
 * 6. Update contactEmailIndex for all emails → primary
 * 7. Recompute lastInteractionMs/nextFollowUpMs on primary
 * 8. Delete secondary contact documents
 *
 * Uses batched writes with 100-op flush (same pattern as syncContacts.ts).
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { firestore } from '../lib/firebase.js'
import { createLogger } from '../lib/logger.js'
import {
  contactRef,
  interactionsCollection,
  contactEmailIndexRef,
} from './paths.js'
import {
  normalizeEmail,
  computeNextFollowUp,
  type Contact,
  type Interaction,
  type ContactSource,
  type MergeContactsInput,
  type MergeContactsResult,
} from '@lifeos/agents'

const log = createLogger('MergeContacts')
const MAX_BATCH_OPS = 100

export const mergeContacts = onCall(
  { timeoutSeconds: 120, memory: '512MiB' },
  async (request): Promise<MergeContactsResult> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be logged in')
    }

    const userId = request.auth.uid
    const { primaryContactId, secondaryContactIds } = request.data as MergeContactsInput

    // --- Validation ---
    if (!primaryContactId || !secondaryContactIds?.length) {
      throw new HttpsError('invalid-argument', 'primaryContactId and secondaryContactIds required')
    }

    if (secondaryContactIds.includes(primaryContactId)) {
      throw new HttpsError('invalid-argument', 'Primary cannot appear in secondaries')
    }

    if (secondaryContactIds.length > 10) {
      throw new HttpsError('invalid-argument', 'Maximum 10 secondaries per merge')
    }

    // --- 1. Read primary + all secondaries ---
    const primarySnap = await contactRef(userId, primaryContactId).get()
    if (!primarySnap.exists) {
      throw new HttpsError('not-found', 'Primary contact not found')
    }
    const primary = primarySnap.data() as Contact

    const secondarySnaps = await firestore.getAll(
      ...secondaryContactIds.map((id) => contactRef(userId, id))
    )
    const secondaries: Contact[] = []
    for (const snap of secondarySnaps) {
      if (!snap.exists) {
        throw new HttpsError('not-found', `Secondary contact ${snap.id} not found`)
      }
      secondaries.push(snap.data() as Contact)
    }

    // --- 2. Compute merged fields ---
    const mergedEmails = new Set(primary.identifiers.emails.map(normalizeEmail))
    const mergedPhones = new Set(primary.identifiers.phones)
    const mergedSources = new Set<ContactSource>(primary.sources)
    const mergedTags = new Set(primary.tags)

    let mergedLinkedin = primary.identifiers.linkedinSlug
    let mergedSlack = primary.identifiers.slackUserId
    let mergedGoogle = primary.identifiers.googleContactId
    let mergedTelegram = primary.identifiers.telegramUsername

    // Fields to fill from secondaries (only if empty on primary)
    let avatarUrl = primary.avatarUrl
    let title = primary.title
    let company = primary.company
    let bio = primary.bio
    let firstName = primary.firstName
    let lastName = primary.lastName
    let relationship = primary.relationship
    let notes = primary.notes
    let senderPersonaId = primary.senderPersonaId

    for (const sec of secondaries) {
      for (const email of sec.identifiers.emails) mergedEmails.add(normalizeEmail(email))
      for (const phone of sec.identifiers.phones) mergedPhones.add(phone)
      for (const source of sec.sources) mergedSources.add(source)
      for (const tag of sec.tags) mergedTags.add(tag)

      if (!mergedLinkedin && sec.identifiers.linkedinSlug)
        mergedLinkedin = sec.identifiers.linkedinSlug
      if (!mergedSlack && sec.identifiers.slackUserId) mergedSlack = sec.identifiers.slackUserId
      if (!mergedGoogle && sec.identifiers.googleContactId)
        mergedGoogle = sec.identifiers.googleContactId
      if (!mergedTelegram && sec.identifiers.telegramUsername)
        mergedTelegram = sec.identifiers.telegramUsername

      // Fill empty fields (same pattern as syncContacts.ts)
      if (!avatarUrl && sec.avatarUrl) avatarUrl = sec.avatarUrl
      if (!title && sec.title) title = sec.title
      if (!company && sec.company) company = sec.company
      if (!bio && sec.bio) bio = sec.bio
      if (!firstName && sec.firstName) firstName = sec.firstName
      if (!lastName && sec.lastName) lastName = sec.lastName
      if (!relationship && sec.relationship) relationship = sec.relationship
      if (!senderPersonaId && sec.senderPersonaId) senderPersonaId = sec.senderPersonaId

      // Append notes from secondaries with provenance separator
      if (sec.notes) {
        notes = notes
          ? `${notes}\n\n--- Merged from ${sec.displayName} ---\n${sec.notes}`
          : sec.notes
      }
    }

    // --- 3. Copy interactions from secondaries to primary ---
    let totalInteractionsMoved = 0
    let batch = firestore.batch()
    let pendingOps = 0

    async function flushBatch() {
      if (pendingOps > 0) {
        await batch.commit()
        batch = firestore.batch()
        pendingOps = 0
      }
    }

    let latestInteractionMs = primary.lastInteractionMs ?? 0

    for (const sec of secondaries) {
      const interSnap = await interactionsCollection(userId, sec.contactId).get()

      for (const interDoc of interSnap.docs) {
        const interaction = interDoc.data() as Interaction

        // Create in primary's subcollection (preserve interactionId)
        const targetRef = interactionsCollection(userId, primaryContactId).doc(
          interaction.interactionId
        )
        batch.set(targetRef, { ...interaction, contactId: primaryContactId })
        pendingOps++

        // Delete from secondary's subcollection
        batch.delete(interDoc.ref)
        pendingOps++

        if (interaction.occurredAtMs > latestInteractionMs) {
          latestInteractionMs = interaction.occurredAtMs
        }

        totalInteractionsMoved++

        if (pendingOps >= MAX_BATCH_OPS) {
          await flushBatch()
        }
      }
    }

    // --- 4. Update contactEmailIndex for ALL merged emails ---
    const now = Date.now()
    let emailIndexUpdates = 0

    for (const email of mergedEmails) {
      batch.set(contactEmailIndexRef(userId, email), {
        contactId: primaryContactId,
        displayName: primary.displayName,
        updatedAtMs: now,
      })
      pendingOps++
      emailIndexUpdates++

      if (pendingOps >= MAX_BATCH_OPS) {
        await flushBatch()
      }
    }

    // --- 5. Update primary contact with merged data ---
    const nextFollowUpMs =
      latestInteractionMs > 0
        ? computeNextFollowUp(primary, latestInteractionMs)
        : primary.nextFollowUpMs

    const primaryUpdate: Record<string, unknown> = {
      'identifiers.emails': Array.from(mergedEmails),
      'identifiers.phones': Array.from(mergedPhones),
      sources: Array.from(mergedSources),
      tags: Array.from(mergedTags),
      updatedAtMs: now,
    }

    // Only set optional fields if they have values
    if (mergedLinkedin) primaryUpdate['identifiers.linkedinSlug'] = mergedLinkedin
    if (mergedSlack) primaryUpdate['identifiers.slackUserId'] = mergedSlack
    if (mergedGoogle) primaryUpdate['identifiers.googleContactId'] = mergedGoogle
    if (mergedTelegram) primaryUpdate['identifiers.telegramUsername'] = mergedTelegram
    if (avatarUrl) primaryUpdate.avatarUrl = avatarUrl
    if (title) primaryUpdate.title = title
    if (company) primaryUpdate.company = company
    if (bio) primaryUpdate.bio = bio
    if (firstName) primaryUpdate.firstName = firstName
    if (lastName) primaryUpdate.lastName = lastName
    if (relationship) primaryUpdate.relationship = relationship
    if (notes) primaryUpdate.notes = notes
    if (senderPersonaId) primaryUpdate.senderPersonaId = senderPersonaId
    if (latestInteractionMs > 0) primaryUpdate.lastInteractionMs = latestInteractionMs
    if (nextFollowUpMs) primaryUpdate.nextFollowUpMs = nextFollowUpMs

    batch.update(contactRef(userId, primaryContactId), primaryUpdate)
    pendingOps++

    // --- 6. Delete secondary contacts ---
    for (const sec of secondaries) {
      batch.delete(contactRef(userId, sec.contactId))
      pendingOps++

      if (pendingOps >= MAX_BATCH_OPS) {
        await flushBatch()
      }
    }

    // Final flush
    await flushBatch()

    log.info('Contact merge completed', {
      userId,
      primaryContactId,
      secondariesMerged: secondaries.length,
      interactionsMoved: totalInteractionsMoved,
      emailIndexUpdates,
    })

    return {
      mergedContactId: primaryContactId,
      secondariesRemoved: secondaries.length,
      interactionsMoved: totalInteractionsMoved,
      emailIndexEntriesUpdated: emailIndexUpdates,
    }
  }
)
