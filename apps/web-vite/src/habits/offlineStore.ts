/**
 * Offline Storage for Habits
 *
 * IndexedDB schema for storing habits and check-ins locally when offline.
 * Provides full CRUD operations with sync state tracking.
 */

import { openDB, type IDBPDatabase } from 'idb'
import type { CanonicalHabit, HabitId, CanonicalHabitCheckin, CheckinId } from '@lifeos/habits'

const DB_NAME = 'lifeos-habits'
const DB_VERSION = 1

// Store names
const HABITS_STORE = 'habits'
const CHECKINS_STORE = 'checkins'

let dbPromise: Promise<IDBPDatabase> | null = null

/**
 * Open or create the habits database
 */
async function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // Habits store
        if (!db.objectStoreNames.contains(HABITS_STORE)) {
          const habitsStore = db.createObjectStore(HABITS_STORE, { keyPath: 'habitId' })
          habitsStore.createIndex('userId', 'userId')
          habitsStore.createIndex('status', 'status')
          habitsStore.createIndex('domain', 'domain')
          habitsStore.createIndex('syncState', 'syncState')
          habitsStore.createIndex('userId_status', ['userId', 'status'])
          habitsStore.createIndex('createdAtMs', 'createdAtMs')
        }

        // Checkins store
        if (!db.objectStoreNames.contains(CHECKINS_STORE)) {
          const checkinsStore = db.createObjectStore(CHECKINS_STORE, { keyPath: 'checkinId' })
          checkinsStore.createIndex('userId', 'userId')
          checkinsStore.createIndex('habitId', 'habitId')
          checkinsStore.createIndex('dateKey', 'dateKey')
          checkinsStore.createIndex('syncState', 'syncState')
          checkinsStore.createIndex('userId_dateKey', ['userId', 'dateKey'])
          checkinsStore.createIndex('userId_habitId', ['userId', 'habitId'])
          checkinsStore.createIndex('userId_habitId_dateKey', ['userId', 'habitId', 'dateKey'])
        }
      },
    })
  }
  return dbPromise
}

// ============================================================================
// Habits Operations
// ============================================================================

/**
 * Save or update a habit in local storage
 */
export async function saveHabitLocally(habit: CanonicalHabit): Promise<void> {
  const db = await getDb()
  await db.put(HABITS_STORE, habit)
}

/**
 * Get a habit from local storage
 */
export async function getHabitLocally(habitId: HabitId): Promise<CanonicalHabit | undefined> {
  const db = await getDb()
  return db.get(HABITS_STORE, habitId)
}

/**
 * Delete a habit from local storage
 */
export async function deleteHabitLocally(habitId: HabitId): Promise<void> {
  const db = await getDb()
  await db.delete(HABITS_STORE, habitId)
}

/**
 * List all habits for a user
 */
export async function listHabitsLocally(userId: string): Promise<CanonicalHabit[]> {
  const db = await getDb()
  const index = db.transaction(HABITS_STORE).store.index('userId')
  return index.getAll(userId)
}

/**
 * List active habits for a user
 */
export async function listActiveHabitsLocally(userId: string): Promise<CanonicalHabit[]> {
  const db = await getDb()
  const index = db.transaction(HABITS_STORE).store.index('userId_status')
  return index.getAll([userId, 'active'])
}

/**
 * List habits for a specific date (based on schedule)
 */
export async function listHabitsForDateLocally(
  userId: string,
  dateKey: string
): Promise<CanonicalHabit[]> {
  const habits = await listActiveHabitsLocally(userId)
  const [year, month, day] = dateKey.split('-').map((part) => Number(part))
  const date = new Date(year, month - 1, day)
  const dayOfWeek = date.getDay() // 0 = Sunday, 1 = Monday, etc.

  return habits.filter((habit) => habit.schedule.daysOfWeek.includes(dayOfWeek))
}

/**
 * Get habits that need syncing (not in 'synced' state)
 */
export async function getUnsyncedHabits(userId: string): Promise<CanonicalHabit[]> {
  const db = await getDb()
  const tx = db.transaction(HABITS_STORE, 'readonly')
  const store = tx.objectStore(HABITS_STORE)
  const index = store.index('userId')
  const habits = await index.getAll(userId)

  return habits.filter((habit) => habit.syncState !== 'synced')
}

// ============================================================================
// Checkins Operations
// ============================================================================

/**
 * Save or update a checkin in local storage
 */
export async function saveCheckinLocally(checkin: CanonicalHabitCheckin): Promise<void> {
  const db = await getDb()
  await db.put(CHECKINS_STORE, checkin)
}

/**
 * Get a checkin from local storage
 */
export async function getCheckinLocally(
  checkinId: CheckinId
): Promise<CanonicalHabitCheckin | undefined> {
  const db = await getDb()
  return db.get(CHECKINS_STORE, checkinId)
}

/**
 * Get a checkin by habit and date
 */
export async function getCheckinByHabitAndDateLocally(
  userId: string,
  habitId: HabitId,
  dateKey: string
): Promise<CanonicalHabitCheckin | undefined> {
  const db = await getDb()
  const index = db.transaction(CHECKINS_STORE).store.index('userId_habitId_dateKey')
  const checkins = await index.getAll([userId, habitId, dateKey])
  return checkins[0]
}

/**
 * Delete a checkin from local storage
 */
export async function deleteCheckinLocally(checkinId: CheckinId): Promise<void> {
  const db = await getDb()
  await db.delete(CHECKINS_STORE, checkinId)
}

/**
 * List all checkins for a user
 */
export async function listCheckinsLocally(userId: string): Promise<CanonicalHabitCheckin[]> {
  const db = await getDb()
  const index = db.transaction(CHECKINS_STORE).store.index('userId')
  return index.getAll(userId)
}

/**
 * List checkins for a specific date
 */
export async function listCheckinsForDateLocally(
  userId: string,
  dateKey: string
): Promise<CanonicalHabitCheckin[]> {
  const db = await getDb()
  const index = db.transaction(CHECKINS_STORE).store.index('userId_dateKey')
  return index.getAll([userId, dateKey])
}

/**
 * List checkins for a specific habit
 */
export async function listCheckinsForHabitLocally(
  userId: string,
  habitId: HabitId
): Promise<CanonicalHabitCheckin[]> {
  const db = await getDb()
  const index = db.transaction(CHECKINS_STORE).store.index('userId_habitId')
  const checkins = await index.getAll([userId, habitId])
  // Sort by dateKey descending
  return checkins.sort((a, b) => b.dateKey.localeCompare(a.dateKey))
}

/**
 * List checkins for a date range
 */
export async function listCheckinsForDateRangeLocally(
  userId: string,
  startDate: string,
  endDate: string
): Promise<CanonicalHabitCheckin[]> {
  const checkins = await listCheckinsLocally(userId)
  return checkins.filter((c) => c.dateKey >= startDate && c.dateKey <= endDate)
}

/**
 * Get checkins that need syncing
 */
export async function getUnsyncedCheckins(userId: string): Promise<CanonicalHabitCheckin[]> {
  const db = await getDb()
  const tx = db.transaction(CHECKINS_STORE, 'readonly')
  const store = tx.objectStore(CHECKINS_STORE)
  const index = store.index('userId')
  const checkins = await index.getAll(userId)

  return checkins.filter((checkin) => checkin.syncState !== 'synced')
}

// ============================================================================
// Bulk Operations
// ============================================================================

/**
 * Clear all local data (use with caution!)
 */
export async function clearAllLocalData(): Promise<void> {
  const db = await getDb()
  const tx = db.transaction([HABITS_STORE, CHECKINS_STORE], 'readwrite')

  await Promise.all([tx.objectStore(HABITS_STORE).clear(), tx.objectStore(CHECKINS_STORE).clear()])

  await tx.done
}

/**
 * Get storage statistics
 */
export async function getStorageStats(userId: string): Promise<{
  totalHabits: number
  activeHabits: number
  totalCheckins: number
  unsyncedHabits: number
  unsyncedCheckins: number
}> {
  const [habits, activeHabits, checkins, unsyncedHabits, unsyncedCheckins] = await Promise.all([
    listHabitsLocally(userId),
    listActiveHabitsLocally(userId),
    listCheckinsLocally(userId),
    getUnsyncedHabits(userId),
    getUnsyncedCheckins(userId),
  ])

  return {
    totalHabits: habits.length,
    activeHabits: activeHabits.length,
    totalCheckins: checkins.length,
    unsyncedHabits: unsyncedHabits.length,
    unsyncedCheckins: unsyncedCheckins.length,
  }
}
