import type { SyncStatusRepository } from '@lifeos/calendar'
import { doc, getDoc, type DocumentData, type DocumentSnapshot, type Firestore } from 'firebase/firestore'
import { getFirestoreClient as getDb } from '@/lib/firestoreClient'

function syncStateDoc(db: Firestore, userId: string, accountId: string, calendarId?: string) {
  const key = calendarId ? `${accountId}:${calendarId}` : accountId
  return doc(db, 'users', userId, 'calendarSyncState', key)
}

function snapshotToStatus(snapshot: DocumentSnapshot<DocumentData>) {
  if (!snapshot.exists()) {
    return {
      lastSyncAt: undefined,
      lastSuccessAt: undefined,
      lastError: undefined
    }
  }
  const data = snapshot.data() ?? {}
  return {
    lastSyncAt: (data.lastSyncAt ?? data.updatedAt) as string | undefined,
    lastSuccessAt: (data.lastSuccessAt ?? data.lastSyncAt) as string | undefined,
    lastError: data.lastError as string | undefined
  }
}

export function createFirestoreSyncStatusRepository(): SyncStatusRepository {
  return {
    async getStatus(userId) {
      const db = await getDb()
      const snapshot = await getDoc(syncStateDoc(db, userId, 'primary', 'primary'))
      return snapshotToStatus(snapshot)
    }
  }
}
