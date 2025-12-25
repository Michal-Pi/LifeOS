import { firestore } from '../lib/firebase.js'

export function tempStateRef(nonce: string) {
  return firestore.doc(`tempOAuthStates/${nonce}`)
}

export function privateAccountRef(uid: string, accountId: string) {
  return firestore.doc(`users/${uid}/privateIntegrations/google/googleAccounts/${accountId}`)
}

export function accountRef(uid: string, accountId: string) {
  return firestore.doc(`users/${uid}/calendarAccounts/${accountId}`)
}

export function canonicalEventRef(uid: string, eventId: string) {
  return firestore.doc(`users/${uid}/calendarEvents/${eventId}`)
}

export function canonicalEventsCollection(uid: string) {
  return firestore.collection(`users/${uid}/calendarEvents`)
}

export function writebackQueueRef(uid: string, jobId: string) {
  return firestore.doc(`users/${uid}/calendarWritebackQueue/${jobId}`)
}

export function writebackQueueCollection(uid: string) {
  return firestore.collection(`users/${uid}/calendarWritebackQueue`)
}

export function syncRunRef(uid: string, runId: string) {
  return firestore.doc(`users/${uid}/calendarSyncRuns/${runId}`)
}

export function syncStateRef(uid: string, accountId: string) {
  return firestore.doc(`users/${uid}/calendarSyncState/${accountId}`)
}

/**
 * Cache for mapping canonical occurrence keys to Google instance IDs
 * Path: /users/{uid}/recurrenceInstanceMap/{seriesId}
 */
export function instanceMapRef(uid: string, seriesId: string) {
  return firestore.doc(`users/${uid}/recurrenceInstanceMap/${seriesId}`)
}

export function instanceMapCollection(uid: string) {
  return firestore.collection(`users/${uid}/recurrenceInstanceMap`)
}

/**
 * Canonical calendars collection (Phase 2.6)
 * Path: /users/{uid}/calendars/{calendarId}
 */
export function calendarRef(uid: string, calendarId: string) {
  return firestore.doc(`users/${uid}/calendars/${calendarId}`)
}

export function calendarsCollection(uid: string) {
  return firestore.collection(`users/${uid}/calendars`)
}

