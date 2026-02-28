/**
 * Firestore trigger: link incoming mailbox messages to CRM contacts.
 *
 * When a new message lands in `mailboxMessages`, this trigger:
 * 1. Extracts the sender's email
 * 2. Looks it up in `contactEmailIndex`
 * 3. If found: creates an interaction, updates contact timestamps,
 *    and writes `contactId` back onto the message
 */

import { firestore } from '../lib/firebase.js'
import { createLogger } from '../lib/logger.js'
import {
  normalizeEmail,
  computeNextFollowUp,
  newId,
  type Contact,
  type Interaction,
  type InteractionType,
  type ContactSource,
} from '@lifeos/agents'
import { contactEmailIndexRef, contactRef, interactionsCollection } from './paths.js'
import { prioritizedMessageRef } from '../slack/paths.js'

const log = createLogger('MessageContactLink')

/**
 * Handle a newly created mailbox message.
 * Called by the `onDocumentCreated` trigger in index.ts.
 */
export async function handleMailboxMessageCreated(event: {
  data?: FirebaseFirestore.DocumentSnapshot
  params: Record<string, string>
}): Promise<void> {
  const snapshot = event.data
  if (!snapshot) return

  const message = snapshot.data()
  if (!message) return

  const uid = event.params.uid
  const messageId = event.params.messageId

  // Only process messages with a sender email (Gmail only for now)
  const senderEmail = message.senderEmail as string | undefined
  if (!senderEmail || !senderEmail.trim()) {
    return
  }

  const normalized = normalizeEmail(senderEmail)
  if (!normalized.includes('@')) {
    return
  }

  try {
    // Look up the email in the contact index
    const indexSnap = await contactEmailIndexRef(uid, normalized).get()
    if (!indexSnap.exists) {
      return // No contact found for this email — nothing to link
    }

    const indexData = indexSnap.data() as { contactId: string; displayName?: string }
    const contactId = indexData.contactId

    // Read the contact to compute follow-up
    const contactSnap = await contactRef(uid, contactId).get()
    if (!contactSnap.exists) {
      log.warn('Contact in index but not found', { uid, contactId, email: normalized })
      return
    }

    const contact = contactSnap.data() as Contact
    const now = Date.now()
    const receivedAtMs = (message.receivedAtMs as number) ?? now

    // Determine interaction type based on message source
    const source = (message.source as string) ?? 'gmail'
    const interactionType: InteractionType = source === 'gmail' ? 'email' : 'message'

    // Create an interaction on the contact
    const interactionId = newId('interaction')
    const interaction: Interaction = {
      interactionId,
      contactId: contact.contactId,
      userId: uid,
      type: interactionType,
      summary:
        (message.subject as string) ||
        (message.snippet as string) ||
        (message.aiSummary as string) ||
        'New message',
      source: source as ContactSource,
      sourceId: (message.originalMessageId as string) ?? messageId,
      direction: 'inbound',
      occurredAtMs: receivedAtMs,
      createdAtMs: now,
    }

    const interactionRef = interactionsCollection(uid, contactId).doc(interactionId)

    // Compute updated follow-up
    const nextFollowUpMs = computeNextFollowUp(contact, receivedAtMs)

    // Batch: create interaction + update contact + write contactId on message
    const batch = firestore.batch()

    batch.set(interactionRef, interaction)

    batch.update(contactRef(uid, contactId), {
      lastInteractionMs: receivedAtMs,
      nextFollowUpMs: nextFollowUpMs ?? null,
      updatedAtMs: now,
    })

    batch.update(prioritizedMessageRef(uid, messageId), {
      contactId,
      updatedAtMs: now,
    })

    await batch.commit()

    log.info('Linked message to contact', {
      uid,
      messageId,
      contactId,
      email: normalized,
      interactionType,
    })
  } catch (error) {
    log.error('Failed to link message to contact', error, {
      uid,
      messageId,
      email: normalized,
    })
  }
}
