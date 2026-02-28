/**
 * @fileoverview Firestore path helpers for scheduling collections
 */

import { firestore } from '../lib/firebase.js'

export function schedulingLinksCollection(uid: string) {
  return firestore.collection(`users/${uid}/schedulingLinks`)
}

export function schedulingLinkRef(uid: string, linkId: string) {
  return firestore.doc(`users/${uid}/schedulingLinks/${linkId}`)
}

export function bookingsCollection(uid: string, linkId: string) {
  return firestore.collection(`users/${uid}/schedulingLinks/${linkId}/bookings`)
}

export function bookingRef(uid: string, linkId: string, bookingId: string) {
  return firestore.doc(`users/${uid}/schedulingLinks/${linkId}/bookings/${bookingId}`)
}

export function slugLookupRef(slug: string) {
  return firestore.doc(`schedulingLinkSlugs/${slug}`)
}
