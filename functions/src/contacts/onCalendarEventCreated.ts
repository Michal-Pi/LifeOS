/**
 * Firestore trigger: link calendar event attendees to CRM contacts.
 *
 * When a new canonical event is created, this trigger:
 * 1. Extracts non-self, non-resource attendee emails
 * 2. Batch-looks them up in `contactEmailIndex`
 * 3. For each matched contact: creates a meeting interaction,
 *    updates timestamps, and writes `linkedContactIds` back onto the event
 */

import { firestore } from '../lib/firebase.js'
import { createLogger } from '../lib/logger.js'
import {
  normalizeEmail,
  computeNextFollowUp,
  newId,
  type Contact,
  type Interaction,
} from '@lifeos/agents'
import { contactEmailIndexRef, contactRef, interactionsCollection } from './paths.js'

const log = createLogger('CalendarContactLink')

/**
 * Handle a newly created canonical calendar event.
 * Called by the `onDocumentCreated` trigger in index.ts.
 */
export async function handleCalendarEventCreated(event: {
  data?: FirebaseFirestore.DocumentSnapshot
  params: Record<string, string>
}): Promise<void> {
  const snapshot = event.data
  if (!snapshot) return

  const eventData = snapshot.data()
  if (!eventData) return

  const uid = event.params.uid
  const eventId = event.params.eventId

  // Extract attendees — skip events without them
  const attendees = eventData.attendees as
    | Array<{
        email?: string
        self?: boolean
        resource?: boolean
        displayName?: string
      }>
    | undefined

  if (!attendees || attendees.length === 0) return

  // Filter to real, non-self attendees with email addresses
  const candidateEmails: string[] = []
  for (const att of attendees) {
    if (att.self || att.resource || !att.email) continue
    const normalized = normalizeEmail(att.email)
    if (normalized.includes('@') && !candidateEmails.includes(normalized)) {
      candidateEmails.push(normalized)
    }
  }

  if (candidateEmails.length === 0) return

  // Cap at 50 to stay within Firestore getAll() limits
  const lookupEmails = candidateEmails.slice(0, 50)

  try {
    // Batch-lookup in contactEmailIndex
    const refs = lookupEmails.map((e) => contactEmailIndexRef(uid, e))
    const snapshots = await firestore.getAll(...refs)

    // Collect matched contacts
    const matches: Array<{ email: string; contactId: string }> = []
    for (let i = 0; i < snapshots.length; i++) {
      const snap = snapshots[i]
      if (snap.exists) {
        const data = snap.data() as { contactId: string }
        matches.push({ email: lookupEmails[i], contactId: data.contactId })
      }
    }

    if (matches.length === 0) return

    // Read all matched contacts to compute follow-ups
    const contactRefs = matches.map((m) => contactRef(uid, m.contactId))
    const contactSnaps = await firestore.getAll(...contactRefs)

    const now = Date.now()
    const eventStartMs = (eventData.startMs as number) ?? now
    const eventTitle = (eventData.title as string) || 'Meeting'
    const canonicalEventId = (eventData.canonicalEventId as string) ?? eventId

    const batch = firestore.batch()
    const linkedContactIds: string[] = []

    for (let i = 0; i < matches.length; i++) {
      const { contactId } = matches[i]
      const contactSnap = contactSnaps[i]

      if (!contactSnap.exists) {
        log.warn('Contact in index but not found', { uid, contactId })
        continue
      }

      const contact = contactSnap.data() as Contact
      linkedContactIds.push(contactId)

      // Create meeting interaction
      const interactionId = newId('interaction')
      const interaction: Interaction = {
        interactionId,
        contactId: contact.contactId,
        userId: uid,
        type: 'meeting',
        summary: eventTitle,
        meetingTitle: eventTitle,
        source: 'calendar',
        sourceId: canonicalEventId,
        direction: 'bilateral',
        occurredAtMs: eventStartMs,
        createdAtMs: now,
      }

      batch.set(interactionsCollection(uid, contactId).doc(interactionId), interaction)

      // Update contact timestamps
      const nextFollowUpMs = computeNextFollowUp(contact, eventStartMs)
      batch.update(contactRef(uid, contactId), {
        lastInteractionMs: eventStartMs,
        nextFollowUpMs: nextFollowUpMs ?? null,
        updatedAtMs: now,
      })
    }

    // Write linkedContactIds back onto the event
    batch.update(firestore.doc(`users/${uid}/canonicalEvents/${eventId}`), {
      linkedContactIds,
      updatedAtMs: now,
    })

    await batch.commit()

    log.info('Linked calendar event to contacts', {
      uid,
      eventId,
      eventTitle,
      linkedCount: linkedContactIds.length,
    })
  } catch (error) {
    log.error('Failed to link calendar event to contacts', error, {
      uid,
      eventId,
      attendeeCount: candidateEmails.length,
    })
  }
}
