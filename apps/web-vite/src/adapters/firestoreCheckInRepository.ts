/**
 * Firestore Check-In Repository
 *
 * Implements the CheckInRepository interface for storing daily emotional check-ins.
 * Uses Firestore with the following structure:
 * - Collection: `checkIns`
 * - Document ID: `{userId}_{dateKey}_{timeOfDay}` (e.g., "user123_2024-02-07_morning")
 */

import type { DailyCheckIn, CreateCheckInInput, TimeOfDay, CheckInId } from '@lifeos/mind'
import type { CheckInRepository } from '@lifeos/mind'
import {
  collection,
  doc,
  getDoc,
  setDoc,
  query,
  where,
  getDocs,
  deleteDoc,
  orderBy,
} from 'firebase/firestore'
import { getFirestoreClient as getDb } from '@/lib/firestoreClient'

const COLLECTION_NAME = 'checkIns'

/**
 * Generate a unique check-in ID
 */
function generateCheckInId(): CheckInId {
  return `checkin-${Date.now()}-${Math.random().toString(36).substring(2, 9)}` as CheckInId
}

/**
 * Generate the document ID for a check-in
 */
function getDocId(userId: string, dateKey: string, timeOfDay: TimeOfDay): string {
  return `${userId}_${dateKey}_${timeOfDay}`
}

/**
 * Creates a Firestore-backed check-in repository
 */
export function createFirestoreCheckInRepository(): CheckInRepository {
  return {
    async saveCheckIn(input: CreateCheckInInput): Promise<DailyCheckIn> {
      const db = await getDb()
      const checkInId = generateCheckInId()
      const now = Date.now()

      const checkIn: DailyCheckIn = {
        ...input,
        checkInId,
        createdAtMs: now,
      }

      const docId = getDocId(input.userId, input.dateKey, input.timeOfDay)
      const docRef = doc(collection(db, COLLECTION_NAME), docId)

      await setDoc(docRef, checkIn)

      return checkIn
    },

    async getCheckInsForDate(userId: string, dateKey: string): Promise<DailyCheckIn[]> {
      const db = await getDb()
      const checkInsRef = collection(db, COLLECTION_NAME)

      const q = query(
        checkInsRef,
        where('userId', '==', userId),
        where('dateKey', '==', dateKey),
        orderBy('createdAtMs', 'asc')
      )

      const snapshot = await getDocs(q)
      return snapshot.docs.map((doc) => doc.data() as DailyCheckIn)
    },

    async getLatestCheckIn(userId: string, dateKey: string): Promise<DailyCheckIn | null> {
      const checkIns = await this.getCheckInsForDate(userId, dateKey)
      if (checkIns.length === 0) return null

      // Return the most recent check-in by createdAtMs
      return checkIns.reduce((latest, current) =>
        current.createdAtMs > latest.createdAtMs ? current : latest
      )
    },

    async getCheckInByTimeOfDay(
      userId: string,
      dateKey: string,
      timeOfDay: TimeOfDay
    ): Promise<DailyCheckIn | null> {
      const db = await getDb()
      const docId = getDocId(userId, dateKey, timeOfDay)
      const docRef = doc(collection(db, COLLECTION_NAME), docId)

      const snapshot = await getDoc(docRef)

      if (!snapshot.exists()) {
        return null
      }

      return snapshot.data() as DailyCheckIn
    },

    async getCheckInsForDateRange(
      userId: string,
      startDateKey: string,
      endDateKey: string
    ): Promise<DailyCheckIn[]> {
      const db = await getDb()
      const checkInsRef = collection(db, COLLECTION_NAME)

      const q = query(
        checkInsRef,
        where('userId', '==', userId),
        where('dateKey', '>=', startDateKey),
        where('dateKey', '<=', endDateKey),
        orderBy('dateKey', 'asc'),
        orderBy('createdAtMs', 'asc')
      )

      const snapshot = await getDocs(q)
      return snapshot.docs.map((doc) => doc.data() as DailyCheckIn)
    },

    async updateCheckIn(
      checkInId: string,
      updates: Partial<Pick<DailyCheckIn, 'emotionId' | 'coreEmotionId' | 'energyLevel' | 'notes'>>
    ): Promise<DailyCheckIn> {
      const db = await getDb()
      const checkInsRef = collection(db, COLLECTION_NAME)

      // Find the check-in by ID
      const q = query(checkInsRef, where('checkInId', '==', checkInId))
      const snapshot = await getDocs(q)

      if (snapshot.empty) {
        throw new Error(`Check-in not found: ${checkInId}`)
      }

      const docRef = snapshot.docs[0].ref
      const existingCheckIn = snapshot.docs[0].data() as DailyCheckIn

      const updatedCheckIn: DailyCheckIn = {
        ...existingCheckIn,
        ...updates,
      }

      await setDoc(docRef, updatedCheckIn)

      return updatedCheckIn
    },

    async deleteCheckIn(checkInId: string): Promise<void> {
      const db = await getDb()
      const checkInsRef = collection(db, COLLECTION_NAME)

      // Find the check-in by ID
      const q = query(checkInsRef, where('checkInId', '==', checkInId))
      const snapshot = await getDocs(q)

      if (snapshot.empty) {
        throw new Error(`Check-in not found: ${checkInId}`)
      }

      await deleteDoc(snapshot.docs[0].ref)
    },
  }
}
