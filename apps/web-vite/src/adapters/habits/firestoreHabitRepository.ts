/**
 * Firestore Habit Repository
 *
 * Implements HabitRepository interface for Firestore persistence.
 * Handles CRUD operations for habits with offline-first support.
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
import { getFirestoreClient } from '@/lib/firebase'
import { newId } from '@lifeos/core'
import type {
  CanonicalHabit,
  HabitId,
  CreateHabitInput,
  UpdateHabitInput,
  HabitRepository,
  HabitStatus,
} from '@lifeos/habits'

const COLLECTION_HABITS = 'habits'

export const createFirestoreHabitRepository = (): HabitRepository => {
  const db = getFirestoreClient()

  const create = async (userId: string, input: CreateHabitInput): Promise<CanonicalHabit> => {
    const habitId = newId<'habit'>('habit')
    const now = Date.now()

    const habit: CanonicalHabit = {
      ...input,
      habitId,
      userId,
      createdAtMs: now,
      updatedAtMs: now,
      syncState: 'synced',
      version: 1,
    }

    const ref = doc(db, `users/${userId}/${COLLECTION_HABITS}/${habitId}`)
    await setDoc(ref, habit)

    return habit
  }

  const update = async (
    userId: string,
    habitId: HabitId,
    updates: UpdateHabitInput
  ): Promise<CanonicalHabit> => {
    const ref = doc(db, `users/${userId}/${COLLECTION_HABITS}/${habitId}`)
    const snapshot = await getDoc(ref)

    if (!snapshot.exists()) {
      throw new Error(`Habit ${habitId} not found`)
    }

    const existingHabit = snapshot.data() as CanonicalHabit
    const updatedHabit: CanonicalHabit = {
      ...existingHabit,
      ...updates,
      updatedAtMs: Date.now(),
      version: existingHabit.version + 1,
    }

    await setDoc(ref, updatedHabit)
    return updatedHabit
  }

  const deleteHabit = async (userId: string, habitId: HabitId): Promise<void> => {
    const ref = doc(db, `users/${userId}/${COLLECTION_HABITS}/${habitId}`)
    await deleteDoc(ref)
  }

  const get = async (userId: string, habitId: HabitId): Promise<CanonicalHabit | null> => {
    const ref = doc(db, `users/${userId}/${COLLECTION_HABITS}/${habitId}`)
    const snapshot = await getDoc(ref)

    if (!snapshot.exists()) {
      return null
    }

    return snapshot.data() as CanonicalHabit
  }

  const list = async (
    userId: string,
    options?: { status?: HabitStatus }
  ): Promise<CanonicalHabit[]> => {
    let q = query(
      collection(db, `users/${userId}/${COLLECTION_HABITS}`),
      orderBy('createdAtMs', 'desc')
    )

    if (options?.status) {
      q = query(
        collection(db, `users/${userId}/${COLLECTION_HABITS}`),
        where('status', '==', options.status),
        orderBy('createdAtMs', 'desc')
      )
    }

    const snapshot = await getDocs(q)
    return snapshot.docs.map((doc) => doc.data() as CanonicalHabit)
  }

  const listForDate = async (userId: string, dateKey: string): Promise<CanonicalHabit[]> => {
    // Get all active habits
    const q = query(
      collection(db, `users/${userId}/${COLLECTION_HABITS}`),
      where('status', '==', 'active' as HabitStatus)
    )

    const snapshot = await getDocs(q)
    const allActiveHabits = snapshot.docs.map((doc) => doc.data() as CanonicalHabit)

    // Filter by schedule (client-side for now)
    // Check if the habit is scheduled for the day of week of dateKey
    const date = new Date(dateKey)
    const dayOfWeek = date.getDay() // 0 = Sunday, 1 = Monday, etc.

    return allActiveHabits.filter((habit) => {
      // Check if habit is scheduled for this day
      return habit.schedule.daysOfWeek.includes(dayOfWeek)
    })
  }

  return {
    create,
    update,
    delete: deleteHabit,
    get,
    list,
    listForDate,
  }
}
