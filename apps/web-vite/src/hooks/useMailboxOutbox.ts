/**
 * useMailboxOutbox Hook
 *
 * React integration for the mailbox send outbox.
 * Provides queueSend, pendingCount, failedCount, and retryFailed.
 * Starts/stops the worker when the component mounts/unmounts.
 */

import { useState, useEffect, useCallback } from 'react'
import type { MessageSource } from '@lifeos/agents'
import { useAuth } from '@/hooks/useAuth'
import { enqueueSend } from '@/outbox/mailboxOutbox'
import {
  startMailboxOutboxWorker,
  stopMailboxOutboxWorker,
  addMailboxOutboxListener,
  triggerDrain,
  retryAllFailed,
} from '@/outbox/mailboxOutboxWorker'

interface UseMailboxOutboxResult {
  pendingCount: number
  failedCount: number
  queueSend: (params: {
    source: MessageSource
    connectionId?: string
    recipientId: string
    recipientName?: string
    subject?: string
    body: string
    htmlBody?: string
    inReplyTo?: string
    threadId?: string
  }) => Promise<void>
  retryFailed: () => Promise<void>
}

export function useMailboxOutbox(): UseMailboxOutboxResult {
  const { user } = useAuth()
  const uid = user?.uid
  const [pendingCount, setPendingCount] = useState(0)
  const [failedCount, setFailedCount] = useState(0)

  // Start worker and subscribe to status changes
  useEffect(() => {
    if (!uid) return

    startMailboxOutboxWorker(uid)

    const unsubscribe = addMailboxOutboxListener(({ pending, failed }) => {
      setPendingCount(pending)
      setFailedCount(failed)
    })

    return () => {
      unsubscribe()
      stopMailboxOutboxWorker()
    }
  }, [uid])

  const queueSend = useCallback(
    async (params: {
      source: MessageSource
      connectionId?: string
      recipientId: string
      recipientName?: string
      subject?: string
      body: string
      htmlBody?: string
      inReplyTo?: string
      threadId?: string
    }) => {
      if (!uid) throw new Error('User not authenticated')
      await enqueueSend(uid, params)
      setPendingCount((c) => c + 1)
      triggerDrain()
    },
    [uid]
  )

  const retryFailed = useCallback(async () => {
    if (!uid) return
    await retryAllFailed(uid)
  }, [uid])

  return { pendingCount, failedCount, queueSend, retryFailed }
}
