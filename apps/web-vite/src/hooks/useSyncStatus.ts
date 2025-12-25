/**
 * useSyncStatus Hook
 *
 * Manages sync status state for calendar synchronization.
 * Provides status information and sync trigger functionality.
 */

import { useState, useEffect, useCallback } from 'react'
import { createLogger } from '@lifeos/calendar'
import { createFirestoreSyncStatusRepository } from '@/adapters/firestoreSyncStatusRepository'
import { functionUrl } from '@/lib/functionsUrl'

const logger = createLogger('useSyncStatus')
const syncRepository = createFirestoreSyncStatusRepository()

interface SyncStatus {
  lastSyncAt?: string
  lastSuccessAt?: string
  lastError?: string
}

interface UseSyncStatusResult {
  status: SyncStatus | null
  syncing: boolean
  error: string | null
  syncNow: () => Promise<void>
}

export function useSyncStatus(userId: string, accountId: string): UseSyncStatusResult {
  const [status, setStatus] = useState<SyncStatus | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load initial status
  useEffect(() => {
    if (!userId) return

    const loadStatus = async () => {
      try {
        const remoteStatus = await syncRepository.getStatus(userId)
        setStatus(remoteStatus)
      } catch (err) {
        logger.error('Failed to load sync status', err)
      }
    }

    void loadStatus()
  }, [userId])

  const refreshStatus = useCallback(async () => {
    const remoteStatus = await syncRepository.getStatus(userId)
    setStatus(remoteStatus)
    return remoteStatus
  }, [userId])

  const syncNow = useCallback(async () => {
    setSyncing(true)
    setError(null)

    try {
      const response = await fetch(functionUrl(`syncNow?uid=${userId}&accountId=${accountId}`))

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload.error ?? 'Sync failed')
      }

      // Reload status after successful sync
      await refreshStatus()
    } catch (err) {
      const errorMessage = (err as Error).message
      setError(errorMessage)
      logger.error('Sync failed', err, { userId, accountId })
    } finally {
      setSyncing(false)
    }
  }, [userId, accountId, refreshStatus])

  return {
    status,
    syncing,
    error,
    syncNow
  }
}
