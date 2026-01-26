/**
 * useTodoSync Hook
 *
 * Manages todo synchronization between local and remote storage:
 * - Starts/stops sync worker
 * - Tracks online/offline status
 * - Monitors sync operations
 * - Provides sync statistics
 */

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from './useAuth'
import {
  startTodoSyncWorker,
  stopTodoSyncWorker,
  getSyncStatus,
  triggerManualSync,
} from '@/todos/syncWorker'
import { getOutboxStats } from '@/todos/todoOutbox'
import { getStorageStats } from '@/todos/offlineStore'

export interface UseTodoSyncReturn {
  isOnline: boolean
  isSyncing: boolean
  lastSyncMs: number | null
  stats: {
    projects: { pending: number; failed: number; total: number }
    chapters: { pending: number; failed: number; total: number }
    tasks: { pending: number; failed: number; total: number }
  } | null
  storageStats: {
    totalProjects: number
    totalChapters: number
    totalTasks: number
    unsyncedProjects: number
    unsyncedChapters: number
    unsyncedTasks: number
  } | null
  triggerSync: () => Promise<void>
  refreshStats: () => Promise<void>
}

/**
 * Hook for managing todo sync operations
 */
export function useTodoSync(): UseTodoSyncReturn {
  const { user } = useAuth()
  const userId = user?.uid

  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [isSyncing, setIsSyncing] = useState(false)
  const [lastSyncMs, setLastSyncMs] = useState<number | null>(null)
  const [stats, setStats] = useState<UseTodoSyncReturn['stats']>(null)
  const [storageStats, setStorageStats] = useState<UseTodoSyncReturn['storageStats']>(null)

  // Monitor online/offline status
  useEffect(() => {
    const handleOnline = () => {
      console.log('Connection restored - triggering sync')
      setIsOnline(true)

      // Trigger immediate sync when coming back online
      if (userId) {
        triggerManualSync(userId).catch((error) => {
          console.error('Failed to sync after coming online:', error)
        })
      }
    }

    const handleOffline = () => {
      console.log('Connection lost - entering offline mode')
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
    startTodoSyncWorker(userId, 30000, {
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
      stopTodoSyncWorker()
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
