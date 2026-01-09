/**
 * Notification Cleanup Utility
 *
 * Cleans up old read notifications from Firestore.
 * Removes notifications older than 30 days that have been read.
 */

import { collection, query, where, getDocs, writeBatch } from 'firebase/firestore'
import { getFirestoreClient as getDb } from '@/lib/firestoreClient'

const CLEANUP_AGE_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

/**
 * Clean up old read notifications for a user
 * @param userId User ID
 * @returns Number of notifications deleted
 */
export async function cleanupOldNotifications(userId: string): Promise<number> {
  try {
    const db = await getDb()
    const thirtyDaysAgo = Date.now() - CLEANUP_AGE_MS

    const notificationsRef = collection(db, `users/${userId}/notifications`)
    const q = query(
      notificationsRef,
      where('read', '==', true),
      where('createdAtMs', '<', thirtyDaysAgo)
    )

    const snapshot = await getDocs(q)

    if (snapshot.empty) {
      return 0
    }

    // Delete in batches (Firestore limit is 500 operations per batch)
    const batch = writeBatch(db)
    let deletedCount = 0
    let batchOps = 0
    const maxBatchOps = 500

    for (const doc of snapshot.docs) {
      batch.delete(doc.ref)
      deletedCount++
      batchOps++

      if (batchOps >= maxBatchOps) {
        await batch.commit()
        batchOps = 0
      }
    }

    // Commit remaining operations
    if (batchOps > 0) {
      await batch.commit()
    }

    console.log(`Cleaned up ${deletedCount} old notifications for user ${userId}`)
    return deletedCount
  } catch (error) {
    console.error('Failed to cleanup old notifications:', error)
    return 0
  }
}
