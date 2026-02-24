/**
 * Firestore path helpers for the Inner Circle CRM contacts domain.
 *
 * Follows the pattern established in `../google/paths.ts`.
 */

import { firestore } from '../lib/firebase.js'

/** users/{uid}/contacts/{contactId} */
export function contactRef(uid: string, contactId: string) {
  return firestore.doc(`users/${uid}/contacts/${contactId}`)
}

/** users/{uid}/contacts */
export function contactsCollection(uid: string) {
  return firestore.collection(`users/${uid}/contacts`)
}

/** users/{uid}/contacts/{contactId}/interactions/{interactionId} */
export function interactionRef(uid: string, contactId: string, interactionId: string) {
  return firestore.doc(`users/${uid}/contacts/${contactId}/interactions/${interactionId}`)
}

/** users/{uid}/contacts/{contactId}/interactions */
export function interactionsCollection(uid: string, contactId: string) {
  return firestore.collection(`users/${uid}/contacts/${contactId}/interactions`)
}

/** users/{uid}/contactEmailIndex/{normalizedEmail} */
export function contactEmailIndexRef(uid: string, normalizedEmail: string) {
  return firestore.doc(`users/${uid}/contactEmailIndex/${normalizedEmail}`)
}

/** users/{uid}/contactEmailIndex */
export function contactEmailIndexCollection(uid: string) {
  return firestore.collection(`users/${uid}/contactEmailIndex`)
}

/** users/{uid}/contactSyncState/google */
export function contactSyncStateRef(uid: string) {
  return firestore.doc(`users/${uid}/contactSyncState/google`)
}
