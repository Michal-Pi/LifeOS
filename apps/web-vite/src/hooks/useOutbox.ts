/**
 * useOutbox Hook
 *
 * Manages outbox state for offline operations.
 */
import { useState, useEffect } from 'react'
import { createLogger } from '@lifeos/calendar'
import { listAll } from '@/outbox/store'
import type { OutboxOp } from '@/outbox/types'
import { startOutboxWorker, retryAllFailed, addOutboxListener } from '@/outbox/worker'

const logger = createLogger('useOutbox')

export function useOutbox(userId: string) {
  const [pendingOps, setPendingOps] = useState<OutboxOp[]>([])
  const [failedOps, setFailedOps] = useState<OutboxOp[]>([])
  const [isOnline, setIsOnline] = useState(() => {
    // Initialize isOnline directly based on navigator.onLine
    return typeof navigator !== 'undefined' ? navigator.onLine : true
  })

  useEffect(() => {
    if (!userId) return

    startOutboxWorker(userId)

    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)

    if (typeof window !== 'undefined') {
      window.addEventListener('online', handleOnline)
      window.addEventListener('offline', handleOffline)
    }

    const removeListener = addOutboxListener(async () => {
      const allOps = await listAll(userId)
      setPendingOps(allOps.filter((op) => op.status === 'pending' || op.status === 'applying'))
      setFailedOps(allOps.filter((op) => op.status === 'failed'))
    });

    // Initial load
    (async () => {
      const allOps = await listAll(userId)
      setPendingOps(allOps.filter((op) => op.status === 'pending' || op.status === 'applying'))
      setFailedOps(allOps.filter((op) => op.status === 'failed'))
    })()

    return () => {
      removeListener()
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', handleOnline)
        window.removeEventListener('offline', handleOffline)
      }
    }
  }, [userId])

  const handleRetryAll = async () => {
    if (!isOnline || !userId) return
    const count = await retryAllFailed(userId)
    logger.info('Retried failed ops', { count })
  }

  return { pendingOps, failedOps, isOnline, retryAll: handleRetryAll }
}
