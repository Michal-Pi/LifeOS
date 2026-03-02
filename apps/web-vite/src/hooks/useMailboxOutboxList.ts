/**
 * useMailboxOutboxList Hook
 *
 * Loads the full list of outbox operations from IndexedDB.
 * Provides retry and remove functionality.
 * Polls periodically to stay in sync with the worker.
 */

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { listAll, retryOp, retryAll, type MailboxSendOp } from '@/outbox/mailboxOutbox'
import { addMailboxOutboxListener, triggerDrain } from '@/outbox/mailboxOutboxWorker'

interface UseMailboxOutboxListResult {
  items: MailboxSendOp[]
  loading: boolean
  retry: (opId: string) => Promise<void>
  retryAllFailed: () => Promise<void>
  refresh: () => Promise<void>
}

export function useMailboxOutboxList(): UseMailboxOutboxListResult {
  const { user } = useAuth()
  const uid = user?.uid
  const [items, setItems] = useState<MailboxSendOp[]>([])
  const [loading, setLoading] = useState(true)

  const loadItems = useCallback(async () => {
    if (!uid) {
      setItems([])
      setLoading(false)
      return
    }
    try {
      const all = await listAll(uid)
      // Sort: pending/applying first, then failed, then applied. Within each group, newest first.
      all.sort((a, b) => {
        const statusOrder = { pending: 0, applying: 0, failed: 1, applied: 2 }
        const orderDiff = statusOrder[a.status] - statusOrder[b.status]
        if (orderDiff !== 0) return orderDiff
        return b.createdAtMs - a.createdAtMs
      })
      setItems(all)
    } catch (err) {
      console.error('Error loading outbox items:', err)
    } finally {
      setLoading(false)
    }
  }, [uid])

  // Initial load
  useEffect(() => {
    void loadItems()
  }, [loadItems])

  // Re-load when outbox worker reports changes
  useEffect(() => {
    const unsubscribe = addMailboxOutboxListener(() => {
      void loadItems()
    })
    return unsubscribe
  }, [loadItems])

  const retryOne = useCallback(
    async (opId: string) => {
      await retryOp(opId)
      triggerDrain()
      await loadItems()
    },
    [loadItems]
  )

  const retryAllFailedFn = useCallback(async () => {
    if (!uid) return
    await retryAll(uid)
    triggerDrain()
    await loadItems()
  }, [uid, loadItems])

  return {
    items,
    loading,
    retry: retryOne,
    retryAllFailed: retryAllFailedFn,
    refresh: loadItems,
  }
}
