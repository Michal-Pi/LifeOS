import type { SyncStatusRepository } from '@lifeos/calendar'
import {
  doc,
  getDoc,
  onSnapshot,
  type DocumentData,
  type DocumentSnapshot,
  type Firestore,
  type Unsubscribe,
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
      try {
        await currentUser.getIdToken()
        return
      } catch {
        // Token fetch failed, continue waiting
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
}

function syncStateDoc(db: Firestore, userId: string, accountId: string, calendarId?: string) {
  const key = calendarId ? `${accountId}:${calendarId}` : accountId
  return doc(db, 'users', userId, 'calendarSyncState', key)
}

function snapshotToStatus(snapshot: DocumentSnapshot<DocumentData>) {
  if (!snapshot.exists()) {
    return {
      lastSyncAt: undefined,
      lastSuccessAt: undefined,
      lastError: undefined,
    }
  }
  const data = snapshot.data() ?? {}
  return {
    lastSyncAt: (data.lastSyncAt ?? data.updatedAt) as string | undefined,
    lastSuccessAt: (data.lastSuccessAt ?? data.lastSyncAt) as string | undefined,
    lastError: data.lastError as string | undefined,
  }
}

export function createFirestoreSyncStatusRepository(): SyncStatusRepository & {
  subscribeToStatus?: (
    userId: string,
    callback: (status: { lastSyncAt?: string; lastSuccessAt?: string; lastError?: string }) => void
  ) => Unsubscribe
} {
  return {
    async getStatus(userId) {
      await ensureFirestoreAuthReady(userId)
      const db = await getDb()
      const snapshot = await getDoc(syncStateDoc(db, userId, 'primary', 'primary'))
      return snapshotToStatus(snapshot)
    },
    subscribeToStatus(userId, callback) {
      let active = true
      let unsubscribe: Unsubscribe | null = null

      const setupListener = async () => {
        await ensureFirestoreAuthReady(userId)
        const db = await getDb()
        const docRef = syncStateDoc(db, userId, 'primary', 'primary')

        if (!active) return

        unsubscribe = onSnapshot(docRef, (snapshot) => {
          if (active) {
            callback(snapshotToStatus(snapshot))
          }
        })
      }

      void setupListener()

      return () => {
        active = false
        if (unsubscribe) {
          unsubscribe()
        }
      }
    },
  }
}
