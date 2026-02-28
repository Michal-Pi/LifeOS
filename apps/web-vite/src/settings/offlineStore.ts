/**
 * Offline Storage for Settings
 *
 * Read-only IndexedDB cache for user settings documents.
 * Settings are written through Firestore onSnapshot listeners and cached locally.
 */

import { openDB, type IDBPDatabase } from 'idb'

const DB_NAME = 'lifeos-settings'
const DB_VERSION = 1
const SETTINGS_STORE = 'settings'

let dbPromise: Promise<IDBPDatabase> | null = null

async function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(SETTINGS_STORE)) {
          db.createObjectStore(SETTINGS_STORE)
        }
      },
    })
  }
  return dbPromise
}

/**
 * Compound key format: `{userId}:{settingKey}`
 */
function makeKey(userId: string, settingKey: string): string {
  return `${userId}:${settingKey}`
}

export async function saveSetting(
  userId: string,
  settingKey: string,
  data: Record<string, unknown>
): Promise<void> {
  if (!userId) return
  const db = await getDb()
  await db.put(SETTINGS_STORE, data, makeKey(userId, settingKey))
}

export async function getSetting(
  userId: string,
  settingKey: string
): Promise<Record<string, unknown> | undefined> {
  if (!userId) return undefined
  const db = await getDb()
  return db.get(SETTINGS_STORE, makeKey(userId, settingKey))
}

export async function deleteSetting(userId: string, settingKey: string): Promise<void> {
  if (!userId) return
  const db = await getDb()
  await db.delete(SETTINGS_STORE, makeKey(userId, settingKey))
}
