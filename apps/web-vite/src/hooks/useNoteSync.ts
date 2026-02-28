/**
 * useNoteSync Hook
 *
 * Manages note synchronization between local and remote storage:
 * - Starts/stops sync worker
 * - Tracks online/offline status
 * - Monitors sync operations
 * - Provides sync statistics
 */

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from './useAuth'
import { logger } from '@/lib/logger'
import {
  startNoteSyncWorker,
  stopNoteSyncWorker,
  getSyncStatus,
  triggerManualSync,
} from '@/notes/syncWorker'
import { getOutboxStats } from '@/notes/noteOutbox'
import { getStorageStats } from '@/notes/offlineStore'

export interface UseNoteSyncReturn {
  isOnline: boolean
  isSyncing: boolean
  lastSyncMs: number | null
  stats: {
    notes: { pending: number; failed: number; total: number }
    topics: { pending: number; failed: number; total: number }
    sections: { pending: number; failed: number; total: number }
  } | null
  storageStats: {
    totalNotes: number
    totalTopics: number
    totalSections: number
    unsyncedNotes: number
    unsyncedTopics: number
    unsyncedSections: number
  } | null
  triggerSync: () => Promise<void>
  refreshStats: () => Promise<void>
}

/**
 * Hook for managing note sync operations
 */
export function useNoteSync(): UseNoteSyncReturn {
  const { user } = useAuth()
  const userId = user?.uid

  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [isSyncing, setIsSyncing] = useState(false)
  const [lastSyncMs, setLastSyncMs] = useState<number | null>(null)
  const [stats, setStats] = useState<UseNoteSyncReturn['stats']>(null)
  const [storageStats, setStorageStats] = useState<UseNoteSyncReturn['storageStats']>(null)

  // Monitor online/offline status
  useEffect(() => {
    const handleOnline = () => {
      logger.debug('Connection restored - triggering sync')
      setIsOnline(true)

      // Trigger immediate sync when coming back online
      if (userId) {
        triggerManualSync(userId).catch((error) => {
          console.error('Failed to sync after coming online:', error)
        })
      }
    }

    const handleOffline = () => {
      logger.debug('Connection lost - entering offline mode')
      setIsOnline(false)
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [userId])

  // Refresh statistics
  const refreshStats = useCallback(async () => {
    if (!userId) return

    try {
      const [outboxStats, localStats] = await Promise.all([
        getOutboxStats(userId),
        getStorageStats(userId),
      ])

      setStats(outboxStats)
      setStorageStats(localStats)
    } catch (error) {
      console.error('Failed to refresh stats:', error)
    }
  }, [userId])

  // Start sync worker when user is authenticated
  useEffect(() => {
    if (!userId) return

    // Start worker with 30-second interval
    startNoteSyncWorker(userId, 30000, {
      onSyncComplete: () => {
        const status = getSyncStatus()
        setLastSyncMs(status.lastSyncMs)
        setIsSyncing(false)

        // Refresh stats after sync
        refreshStats()
      },
      onSyncError: (error) => {
        console.error('Sync error:', error)
        setIsSyncing(false)

        // Still refresh stats to show failures
        refreshStats()
      },
    })

    // Initial stats load
    refreshStats()

    return () => {
      stopNoteSyncWorker()
    }
  }, [userId, refreshStats])

  // Monitor sync status
  useEffect(() => {
    if (!userId) return

    const interval = setInterval(() => {
      const status = getSyncStatus()
      setIsSyncing(status.isRunning)
      if (status.lastSyncMs) {
        setLastSyncMs(status.lastSyncMs)
      }
      // Log if sync is paused (for debugging)
      if (status.isPaused && status.retryCount > 0) {
        console.debug(`Sync paused, retry count: ${status.retryCount}`)
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [userId])

  // Manually trigger sync
  const triggerSync = useCallback(async () => {
    if (!userId) {
      throw new Error('User not authenticated')
    }

    setIsSyncing(true)

    try {
      await triggerManualSync(userId)
      const status = getSyncStatus()
      setLastSyncMs(status.lastSyncMs)
      await refreshStats()
    } catch (error) {
      console.error('Manual sync failed:', error)
      throw error
    } finally {
      setIsSyncing(false)
    }
  }, [userId, refreshStats])

  return {
    isOnline,
    isSyncing,
    lastSyncMs,
    stats,
    storageStats,
    triggerSync,
    refreshStats,
  }
}
