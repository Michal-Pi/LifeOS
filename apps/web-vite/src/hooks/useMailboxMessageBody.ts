/**
 * useMailboxMessageBody Hook
 *
 * Fetches and caches full message body from Firestore for offline reading.
 * Bodies are stored in a separate subcollection (mailboxMessageBodies)
 * to keep the main message collection lightweight.
 *
 * If the body is not found in Firestore, fetches it on demand from the
 * source via the fetchMailboxBody callable Cloud Function.
 */

import { useState, useEffect, useCallback } from 'react'
import { doc, getDoc } from 'firebase/firestore'
import { httpsCallable, getFunctions } from 'firebase/functions'
import { getFirestoreClient as getDb } from '@/lib/firestoreClient'
import { useAuth } from '@/hooks/useAuth'
import type { MessageSource } from '@lifeos/agents'

interface MessageBodyData {
  messageId: string
  body: string
  htmlBody?: string
  attachmentCount: number
  storedAtMs: number
}

interface UseMailboxMessageBodyResult {
  body: string | null
  htmlBody: string | null
  attachmentCount: number
  loading: boolean
  error: string | null
  retry: () => void
}

// Module-level cache so bodies persist across component re-renders
const bodyCache = new Map<string, MessageBodyData>()

export function useMailboxMessageBody(
  messageId: string | null,
  accountId?: string,
  source?: MessageSource
): UseMailboxMessageBodyResult {
  const { user } = useAuth()
  const uid = user?.uid ?? null
  const [body, setBody] = useState<string | null>(null)
  const [htmlBody, setHtmlBody] = useState<string | null>(null)
  const [attachmentCount, setAttachmentCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [retryCount, setRetryCount] = useState(0)

  const fetchMessageBody = useCallback(
    async (uid: string, msgId: string, acctId: string, src: MessageSource) => {
      // Step 1: Check Firestore for cached body (non-fatal — falls through to Cloud Function)
      try {
        const db = await getDb()
        const bodyDoc = await getDoc(doc(db, `users/${uid}/mailboxMessageBodies/${msgId}`))

        if (bodyDoc.exists()) {
          const data = bodyDoc.data() as MessageBodyData
          bodyCache.set(msgId, data)
          return data
        }
      } catch {
        // Firestore read failed (e.g. missing security rules) — fall through to Cloud Function
      }

      // Step 2: Fetch on demand via callable Cloud Function
      const functions = getFunctions()
      const fetchBody = httpsCallable<
        { messageId: string; accountId: string; source: string },
        { body: string; attachmentCount: number }
      >(functions, 'fetchMailboxBody')

      const result = await fetchBody({ messageId: msgId, accountId: acctId, source: src })
      const data: MessageBodyData = {
        messageId: msgId,
        body: result.data.body,
        attachmentCount: result.data.attachmentCount,
        storedAtMs: Date.now(),
      }
      bodyCache.set(msgId, data)
      return data
    },
    []
  )

  // Handle state transitions during render when inputs change (avoids setState in effect)
  const fetchKey = `${messageId ?? ''}-${uid ?? ''}-${accountId ?? ''}-${source ?? ''}-${retryCount}`
  const [prevFetchKey, setPrevFetchKey] = useState(fetchKey)
  if (prevFetchKey !== fetchKey) {
    setPrevFetchKey(fetchKey)
    if (!messageId || !uid) {
      setBody(null)
      setHtmlBody(null)
      setAttachmentCount(0)
      setLoading(false)
      setError(null)
    } else {
      const cached = bodyCache.get(messageId)
      if (cached) {
        setBody(cached.body)
        setHtmlBody(cached.htmlBody ?? null)
        setAttachmentCount(cached.attachmentCount)
        setLoading(false)
        setError(null)
      } else if (!accountId || !source) {
        setBody(null)
        setHtmlBody(null)
        setAttachmentCount(0)
        setLoading(false)
      } else {
        setLoading(true)
        setError(null)
      }
    }
  }

  useEffect(() => {
    if (!messageId || !uid || !accountId || !source) return
    if (bodyCache.has(messageId)) return

    let cancelled = false

    fetchMessageBody(uid, messageId, accountId, source)
      .then((data) => {
        if (cancelled) return
        setBody(data.body)
        setHtmlBody(data.htmlBody ?? null)
        setAttachmentCount(data.attachmentCount)
      })
      .catch((err) => {
        if (cancelled) return
        setError((err as Error).message ?? 'Failed to load message body')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [messageId, uid, accountId, source, retryCount, fetchMessageBody])

  const retry = useCallback(() => {
    if (messageId) {
      bodyCache.delete(messageId)
      setBody(null)
      setError(null)
      setRetryCount((c) => c + 1)
    }
  }, [messageId])

  return { body, htmlBody, attachmentCount, loading, error, retry }
}
