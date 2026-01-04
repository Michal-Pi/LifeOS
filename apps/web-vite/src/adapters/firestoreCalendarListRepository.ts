import type { CalendarListRepository, CanonicalCalendar } from '@lifeos/calendar'
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  where,
  type Firestore,
} from 'firebase/firestore'
import { getFirestoreClient as getDb } from '@/lib/firestoreClient'
import { getAuthClient } from '@/lib/firebase'

/**
 * Ensures Firestore has the auth token before making queries.
 */
async function ensureFirestoreAuthReady(userId: string, maxWaitMs: number = 1000): Promise<void> {
  const startTime = Date.now()
  while (Date.now() - startTime < maxWaitMs) {
    const auth = getAuthClient()
    const currentUser = auth.currentUser
    if (currentUser && currentUser.uid === userId) {
      return
    }
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  // If we timeout, proceed anyway - the retry logic will handle permission errors
}

/**
 * Create a Firestore-backed CalendarListRepository
 */
export function createFirestoreCalendarListRepository(): CalendarListRepository {
  const getCollectionRef = (db: Firestore, userId: string) =>
    collection(db, 'users', userId, 'calendars')

  const getDocRef = (db: Firestore, userId: string, calendarId: string) =>
    doc(db, 'users', userId, 'calendars', calendarId)

  return {
    async listCalendars(userId: string): Promise<CanonicalCalendar[]> {
      await ensureFirestoreAuthReady(userId)
      const db = await getDb()
      const colRef = getCollectionRef(db, userId)
      const snapshot = await getDocs(colRef)
      return snapshot.docs.map((d) => d.data() as CanonicalCalendar)
    },

    async getCalendar(userId: string, calendarId: string): Promise<CanonicalCalendar | null> {
      const db = await getDb()
      const docRef = getDocRef(db, userId, calendarId)
      const snapshot = await getDoc(docRef)
      if (!snapshot.exists()) {
        return null
      }
      return snapshot.data() as CanonicalCalendar
    },

    async getCalendarByProviderId(
      userId: string,
      provider: string,
      providerCalendarId: string
    ): Promise<CanonicalCalendar | null> {
      const db = await getDb()
      const colRef = getCollectionRef(db, userId)
      // Query by provider meta
      const q = query(
        colRef,
        where('providerMeta.provider', '==', provider),
        where('providerMeta.providerCalendarId', '==', providerCalendarId)
      )
      const snapshot = await getDocs(q)
      if (snapshot.empty) {
        return null
      }
      return snapshot.docs[0].data() as CanonicalCalendar
    },

    async saveCalendar(userId: string, calendar: CanonicalCalendar): Promise<void> {
      const db = await getDb()
      const docRef = getDocRef(db, userId, calendar.calendarId)
      await setDoc(docRef, calendar, { merge: true })
    },

    async deleteCalendar(userId: string, calendarId: string): Promise<void> {
      const db = await getDb()
      const docRef = getDocRef(db, userId, calendarId)
      await deleteDoc(docRef)
    },

    subscribeToCalendars(
      userId: string,
      callback: (calendars: CanonicalCalendar[]) => void
    ): () => void {
      // For subscriptions, we need sync access to Firestore
      // Initialize lazily on first subscribe
      let unsubscribe: (() => void) | null = null

      void (async () => {
        await ensureFirestoreAuthReady(userId)
        const db = await getDb()
        const colRef = getCollectionRef(db, userId)
        unsubscribe = onSnapshot(
          colRef,
          (snapshot) => {
            const calendars = snapshot.docs.map((d) => d.data() as CanonicalCalendar)
            callback(calendars)
          },
          (error: Error) => {
            // Log but don't throw - onSnapshot errors are handled by the error callback
            console.error('Calendar list subscription error:', error)
          }
        )
      })()

      return () => {
        if (unsubscribe) {
          unsubscribe()
        }
      }
    },
  }
}
