/**
 * Firestore Checkin Repository
 *
 * Implements CheckinRepository interface for Firestore persistence.
 * Handles CRUD operations for habit check-ins with offline-first support.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  query,
  where,
  orderBy,
} from 'firebase/firestore'
import { getFirestoreClient as getDb } from '@/lib/firestoreClient'
import type {
  CanonicalHabitCheckin,
  CheckinId,
  HabitId,
  UpsertCheckinInput,
  UpdateCheckinInput,
  CheckinRepository,
} from '@lifeos/habits'

const COLLECTION_CHECKINS = 'habitCheckins'

/**
 * Generate deterministic checkin ID from habit ID and date key
 */
function generateCheckinId(habitId: HabitId, dateKey: string): CheckinId {
  return `checkin:${habitId}_${dateKey}` as CheckinId
}

export const createFirestoreCheckinRepository = (): CheckinRepository => {
  const upsert = async (
    userId: string,
    input: UpsertCheckinInput
  ): Promise<CanonicalHabitCheckin> => {
    const db = await getDb()
    const checkinId = generateCheckinId(input.habitId, input.dateKey)
    const now = Date.now()

    // Try to get existing checkin
    const ref = doc(db, `users/${userId}/${COLLECTION_CHECKINS}/${checkinId}`)
    const snapshot = await getDoc(ref)

    if (snapshot.exists()) {
      // Update existing
      const existingCheckin = snapshot.data() as CanonicalHabitCheckin
      const updatedCheckin: CanonicalHabitCheckin = {
        ...existingCheckin,
        ...input,
        checkinId,
        userId,
        checkedInAtMs: now,
        version: existingCheckin.version + 1,
      }
      await setDoc(ref, updatedCheckin)
      return updatedCheckin
    } else {
      // Create new
      const checkin: CanonicalHabitCheckin = {
        checkinId,
        userId,
        habitId: input.habitId,
        dateKey: input.dateKey,
        status: input.status,
        moodBefore: input.moodBefore,
        moodAfter: input.moodAfter,
        note: input.note,
        checkedInAtMs: now,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        syncState: 'synced',
        version: 1,
      }
      await setDoc(ref, checkin)
      return checkin
    }
  }

  const update = async (
    userId: string,
    checkinId: CheckinId,
    updates: UpdateCheckinInput
  ): Promise<CanonicalHabitCheckin> => {
    const db = await getDb()
    const ref = doc(db, `users/${userId}/${COLLECTION_CHECKINS}/${checkinId}`)
    const snapshot = await getDoc(ref)

    if (!snapshot.exists()) {
      throw new Error(`Checkin ${checkinId} not found`)
    }

    const existingCheckin = snapshot.data() as CanonicalHabitCheckin
    const updatedCheckin: CanonicalHabitCheckin = {
      ...existingCheckin,
      ...updates,
      version: existingCheckin.version + 1,
    }

    await setDoc(ref, updatedCheckin)
    return updatedCheckin
  }

  const deleteCheckin = async (userId: string, checkinId: CheckinId): Promise<void> => {
    const db = await getDb()
    const ref = doc(db, `users/${userId}/${COLLECTION_CHECKINS}/${checkinId}`)
    await deleteDoc(ref)
  }

  const get = async (
    userId: string,
    checkinId: CheckinId
  ): Promise<CanonicalHabitCheckin | null> => {
    const db = await getDb()
    const ref = doc(db, `users/${userId}/${COLLECTION_CHECKINS}/${checkinId}`)
    const snapshot = await getDoc(ref)

    if (!snapshot.exists()) {
      return null
    }

    return snapshot.data() as CanonicalHabitCheckin
  }

  const getByHabitAndDate = async (
    userId: string,
    habitId: HabitId,
    dateKey: string
  ): Promise<CanonicalHabitCheckin | null> => {
    const checkinId = generateCheckinId(habitId, dateKey)
    return get(userId, checkinId)
  }

  const listForDate = async (userId: string, dateKey: string): Promise<CanonicalHabitCheckin[]> => {
    const db = await getDb()
    const q = query(
      collection(db, `users/${userId}/${COLLECTION_CHECKINS}`),
      where('dateKey', '==', dateKey)
    )

    const snapshot = await getDocs(q)
    return snapshot.docs.map((doc) => doc.data() as CanonicalHabitCheckin)
  }

  const listForHabit = async (
    userId: string,
    habitId: HabitId,
    options?: { limit?: number; startDate?: string; endDate?: string }
  ): Promise<CanonicalHabitCheckin[]> => {
    const db = await getDb()
    const q = query(
      collection(db, `users/${userId}/${COLLECTION_CHECKINS}`),
      where('habitId', '==', habitId),
      orderBy('dateKey', 'desc')
    )

    const snapshot = await getDocs(q)
    let checkins = snapshot.docs.map((doc) => doc.data() as CanonicalHabitCheckin)

    // Apply date filters client-side
    if (options?.startDate) {
      checkins = checkins.filter((c) => c.dateKey >= options.startDate!)
    }
    if (options?.endDate) {
      checkins = checkins.filter((c) => c.dateKey <= options.endDate!)
    }

    // Apply limit
    if (options?.limit) {
      checkins = checkins.slice(0, options.limit)
    }

    return checkins
  }

  const listForDateRange = async (
    userId: string,
    startDate: string,
    endDate: string
  ): Promise<CanonicalHabitCheckin[]> => {
    const db = await getDb()
    // Firestore doesn't support >= and <= on same field without composite index
    // So we fetch all and filter client-side
    const q = query(collection(db, `users/${userId}/${COLLECTION_CHECKINS}`))

    const snapshot = await getDocs(q)
    const checkins = snapshot.docs.map((doc) => doc.data() as CanonicalHabitCheckin)

    return checkins.filter((c) => c.dateKey >= startDate && c.dateKey <= endDate)
  }

  return {
    upsert,
    update,
    delete: deleteCheckin,
    get,
    getByHabitAndDate,
    listForDate,
    listForHabit,
    listForDateRange,
  }
}
