/**
 * Offline Storage for Quotes
 *
 * Simple IndexedDB cache for the user's quote collection.
 * Quotes are stored as a single array per user (mirrors Firestore structure).
 */

import { openDB, type IDBPDatabase } from 'idb'
import type { Quote } from '@lifeos/core'

const DB_NAME = 'lifeos-quotes'
const DB_VERSION = 1
const QUOTES_STORE = 'quotes'

let dbPromise: Promise<IDBPDatabase> | null = null

async function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(QUOTES_STORE)) {
          db.createObjectStore(QUOTES_STORE)
        }
      },
    })
  }
  return dbPromise
}

export async function saveQuotesLocally(userId: string, quotes: Quote[]): Promise<void> {
  if (!userId) return
  const db = await getDb()
  await db.put(QUOTES_STORE, quotes, userId)
}

export async function getQuotesLocally(userId: string): Promise<Quote[]> {
  if (!userId) return []
  const db = await getDb()
  const result = await db.get(QUOTES_STORE, userId)
  return (result as Quote[]) ?? []
}
