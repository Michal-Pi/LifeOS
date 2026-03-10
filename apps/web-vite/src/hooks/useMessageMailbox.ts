/**
 * useMessageMailbox Hook
 *
 * Manages the AI-prioritized message mailbox for the Today page.
 * Provides message sync, filtering, and action handling.
 *
 * Handles the NO_API_KEY_CONFIGURED error specially to show setup prompts.
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  updateDoc,
  where,
  orderBy,
  limit as firestoreLimit,
  type Unsubscribe,
} from 'firebase/firestore'
import { getFirestoreClient as getDb } from '@/lib/firestoreClient'
import { useAuth } from '@/hooks/useAuth'
import type { PrioritizedMessage, TriageCategory } from '@lifeos/agents'

interface UseMessageMailboxOptions {
  maxMessages?: number
  autoSync?: boolean
  priorityThreshold?: string
  showDismissed?: boolean
}

interface MailboxSyncStats {
  slackMessagesProcessed: number
  gmailMessagesProcessed: number
  totalMessagesScanned: number
  highPriorityCount: number
}

interface MailboxSyncStatus {
  isSyncing: boolean
  lastSyncMs?: number
  error?: string
  /** True if user needs to configure API keys in Settings */
  requiresAPIKeySetup?: boolean
  /** Stats from the last sync */
  lastSyncStats?: MailboxSyncStats
}

interface MailboxSyncError extends Error {
  status?: number
  retryable?: boolean
  retryAfterSeconds?: number
}

interface UseMessageMailboxResult {
  messages: PrioritizedMessage[]
  loading: boolean
  error: string | null
  syncStatus: MailboxSyncStatus

  /** True if user needs to configure API keys in Settings */
  requiresAPIKeySetup: boolean

  /** Total messages scanned in last sync (including non-follow-up) */
  totalMessagesScanned: number

  followUpCount: number

  // Actions
  syncMailbox: () => Promise<void>
  markAsRead: (messageId: string) => Promise<void>
  dismissMessage: (
    messageId: string,
    options?: { archive?: boolean; labelName?: string }
  ) => Promise<void>
  refreshMessages: () => Promise<void>
  overrideTriageCategory: (messageId: string, category: TriageCategory) => Promise<void>
  /** Apply labels to a Gmail message (without archiving) */
  labelMessage: (messageId: string, addLabels?: string[], removeLabels?: string[]) => Promise<void>
  /** Archive a message (remove from inbox, no label change) */
  archiveMessage: (messageId: string) => Promise<void>
  /** Archive all messages in a conversation */
  archiveConversation: (messageIds: string[]) => Promise<void>
  /** Apply labels to all messages in a conversation */
  labelConversation: (
    messageIds: string[],
    addLabels?: string[],
    removeLabels?: string[]
  ) => Promise<void>
}

export function useMessageMailbox(options: UseMessageMailboxOptions = {}): UseMessageMailboxResult {
  const {
    maxMessages = 100,
    autoSync = true,
    priorityThreshold: _priorityThreshold = 'low',
    showDismissed = false,
  } = options

  const { user } = useAuth()
  const [messages, setMessages] = useState<PrioritizedMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [syncStatus, setSyncStatus] = useState<MailboxSyncStatus>({ isSyncing: false })
  const [requiresAPIKeySetup, setRequiresAPIKeySetup] = useState(false)

  // Load last sync stats from Firestore on mount so "X scanned" isn't 0
  useEffect(() => {
    if (!user?.uid) return

    const loadLastSyncStats = async () => {
      try {
        const db = await getDb()
        const syncsCol = collection(db, `users/${user.uid}/mailboxSyncs`)
        const q = query(
          syncsCol,
          where('status', '==', 'completed'),
          orderBy('completedAtMs', 'desc'),
          firestoreLimit(1)
        )
        const snapshot = await getDocs(q)
        if (!snapshot.empty) {
          const syncData = snapshot.docs[0].data() as {
            completedAtMs?: number
            stats?: MailboxSyncStats
          }
          if (syncData.stats) {
            setSyncStatus((prev) => ({
              ...prev,
              lastSyncMs: prev.lastSyncMs ?? syncData.completedAtMs,
              lastSyncStats: prev.lastSyncStats ?? syncData.stats,
            }))
          }
        }
      } catch (err) {
        console.error('Error loading last sync stats:', err)
      }
    }

    void loadLastSyncStats()
  }, [user?.uid])

  // Subscribe to messages
  useEffect(() => {
    if (!user?.uid) {
      setMessages([])
      setLoading(false)
      return
    }

    let unsubscribe: Unsubscribe | undefined

    const setupSubscription = async () => {
      try {
        const db = await getDb()
        const messagesCol = collection(db, `users/${user.uid}/mailboxMessages`)

        // Build query constraints — show all messages sorted by importance
        const constraints = [
          orderBy('importanceScore', 'desc'),
          orderBy('receivedAtMs', 'desc'),
          firestoreLimit(maxMessages),
        ]

        if (!showDismissed) {
          constraints.unshift(where('isDismissed', '==', false))
        }

        const q = query(messagesCol, ...constraints)

        unsubscribe = onSnapshot(
          q,
          (snapshot) => {
            const msgs: PrioritizedMessage[] = snapshot.docs.map(
              (doc) => doc.data() as PrioritizedMessage
            )

            setMessages(msgs)
            setLoading(false)
          },
          (err) => {
            console.error('Error subscribing to mailbox messages:', err)
            setError(err.message)
            setLoading(false)
          }
        )
      } catch (err) {
        console.error('Error setting up mailbox subscription:', err)
        setError((err as Error).message)
        setLoading(false)
      }
    }

    void setupSubscription()

    return () => {
      if (unsubscribe) {
        unsubscribe()
      }
    }
  }, [user?.uid, maxMessages, showDismissed])

  // Auto-sync on mount with retry
  useEffect(() => {
    if (autoSync && user?.uid) {
      void syncMailboxWithRetry().catch((err) => {
        console.error('Auto mailbox sync failed:', err)
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid, autoSync])

  // Core sync implementation (single attempt)
  const syncMailboxOnce = useCallback(async () => {
    if (!user?.uid) {
      throw new Error('User not authenticated')
    }

    const idToken = await user.getIdToken()
    const response = await fetch(`${import.meta.env.VITE_FUNCTIONS_URL}/mailboxSync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({ uid: user.uid, triggerType: 'manual' }),
    })

    const result = await response.json()

    if (!response.ok) {
      // Check for NO_API_KEY_CONFIGURED error — not retryable
      if (result.error === 'NO_API_KEY_CONFIGURED' || result.requiresSetup) {
        setRequiresAPIKeySetup(true)
        setSyncStatus({
          isSyncing: false,
          requiresAPIKeySetup: true,
          error: 'API key required',
        })
        return
      }
      const syncError = new Error(
        result.message || result.error || `Failed to sync mailbox (${response.status})`
      ) as MailboxSyncError
      syncError.status = response.status
      syncError.retryAfterSeconds =
        Number(response.headers.get('Retry-After')) || Number(result.retryAfterSeconds) || undefined
      // Local retry loop should avoid hammering provider rate limits.
      syncError.retryable = response.status >= 500 && response.status !== 429
      throw syncError
    }

    setSyncStatus({
      isSyncing: false,
      lastSyncMs: Date.now(),
      lastSyncStats: result.stats,
    })
  }, [user])

  // Sync with exponential backoff retry (max 3 attempts)
  const syncMailboxWithRetry = useCallback(async () => {
    if (!user?.uid) {
      throw new Error('User not authenticated')
    }

    setSyncStatus({ isSyncing: true })
    setError(null)
    setRequiresAPIKeySetup(false)

    const MAX_RETRIES = 3
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        await syncMailboxOnce()
        return // Success
      } catch (err) {
        const syncError = err as MailboxSyncError
        const shouldRetry = syncError.retryable !== false && syncError.status !== 429
        const isLastAttempt = attempt === MAX_RETRIES - 1
        if (isLastAttempt || !shouldRetry) {
          console.error('Error syncing mailbox after retries:', err)
          const retryHint =
            syncError.status === 429 && syncError.retryAfterSeconds
              ? ` Please try again in about ${syncError.retryAfterSeconds} seconds.`
              : ''
          const errorMessage = `${(err as Error).message}${retryHint}`
          setError(errorMessage)
          setSyncStatus({
            isSyncing: false,
            error: errorMessage,
          })
          throw err
        }
        // Exponential backoff: 1s, 2s, 4s
        const delay = Math.pow(2, attempt) * 1000
        await new Promise((resolve) => setTimeout(resolve, delay))
      }
    }
  }, [user, syncMailboxOnce])

  // Public sync method (alias for retry version)
  const syncMailbox = syncMailboxWithRetry

  // Mark message as read
  const markAsRead = useCallback(
    async (messageId: string) => {
      if (!user?.uid) {
        throw new Error('User not authenticated')
      }

      try {
        const idToken = await user.getIdToken()
        const response = await fetch(`${import.meta.env.VITE_FUNCTIONS_URL}/mailboxMarkRead`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({ uid: user.uid, messageId }),
        })

        if (!response.ok) {
          const error = await response.json()
          throw new Error(error.error || 'Failed to mark as read')
        }
      } catch (err) {
        console.error('Error marking message as read:', err)
        throw err
      }
    },
    [user]
  )

  // Dismiss or archive message (archive removes from Gmail INBOX and optionally applies a label)
  const dismissMessage = useCallback(
    async (messageId: string, options?: { archive?: boolean; labelName?: string }) => {
      if (!user?.uid) {
        throw new Error('User not authenticated')
      }

      try {
        const idToken = await user.getIdToken()
        const response = await fetch(`${import.meta.env.VITE_FUNCTIONS_URL}/mailboxDismiss`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({
            uid: user.uid,
            messageId,
            archive: options?.archive,
            labelName: options?.labelName,
          }),
        })

        if (!response.ok) {
          const error = await response.json()
          throw new Error(error.error || 'Failed to dismiss message')
        }
      } catch (err) {
        console.error('Error dismissing message:', err)
        throw err
      }
    },
    [user]
  )

  // Refresh messages (re-fetch from server)
  const refreshMessages = useCallback(async () => {
    if (!user?.uid) {
      throw new Error('User not authenticated')
    }

    setLoading(true)
    setError(null)

    try {
      const idToken = await user.getIdToken()
      const response = await fetch(
        `${import.meta.env.VITE_FUNCTIONS_URL}/mailboxMessages?uid=${user.uid}&limit=${maxMessages}`,
        {
          headers: {
            Authorization: `Bearer ${idToken}`,
          },
        }
      )

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to fetch messages')
      }

      const { messages: fetchedMessages } = await response.json()
      setMessages(fetchedMessages)
    } catch (err) {
      console.error('Error refreshing messages:', err)
      setError((err as Error).message)
      throw err
    } finally {
      setLoading(false)
    }
  }, [user, maxMessages])

  // Total messages scanned (from last sync stats)
  const totalMessagesScanned = useMemo(() => {
    const stats = syncStatus.lastSyncStats
    if (!stats) return 0
    return stats.totalMessagesScanned
  }, [syncStatus.lastSyncStats])

  const followUpCount = useMemo(
    () => messages.filter((m) => m.requiresFollowUp && !m.isDismissed).length,
    [messages]
  )

  // Apply labels to a Gmail message (without archiving)
  const labelMessage = useCallback(
    async (messageId: string, addLabels?: string[], removeLabels?: string[]) => {
      if (!user?.uid) {
        throw new Error('User not authenticated')
      }

      try {
        const idToken = await user.getIdToken()
        const response = await fetch(`${import.meta.env.VITE_FUNCTIONS_URL}/mailboxLabelMessage`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({ uid: user.uid, messageId, addLabels, removeLabels }),
        })

        if (!response.ok) {
          const error = await response.json()
          throw new Error(error.error || 'Failed to label message')
        }
      } catch (err) {
        console.error('Error labeling message:', err)
        throw err
      }
    },
    [user]
  )

  // Archive a message (remove from inbox, no label change)
  const archiveMessage = useCallback(
    async (messageId: string) => {
      await dismissMessage(messageId, { archive: true })
    },
    [dismissMessage]
  )

  // Archive all messages in a conversation
  const archiveConversation = useCallback(
    async (messageIds: string[]) => {
      await Promise.all(messageIds.map((id) => dismissMessage(id, { archive: true })))
    },
    [dismissMessage]
  )

  // Apply labels to all messages in a conversation
  const labelConversation = useCallback(
    async (messageIds: string[], addLabels?: string[], removeLabels?: string[]) => {
      await Promise.all(messageIds.map((id) => labelMessage(id, addLabels, removeLabels)))
    },
    [labelMessage]
  )

  // Override triage category for a message
  const overrideTriageCategory = useCallback(
    async (messageId: string, category: TriageCategory) => {
      if (!user?.uid) {
        throw new Error('User not authenticated')
      }
      try {
        const db = await getDb()
        await updateDoc(doc(db, `users/${user.uid}/mailboxMessages/${messageId}`), {
          triageCategoryOverride: category,
          updatedAtMs: Date.now(),
        })
      } catch (err) {
        console.error('Error overriding triage category:', err)
        throw err
      }
    },
    [user]
  )

  return {
    messages,
    loading,
    error,
    syncStatus,
    requiresAPIKeySetup,
    totalMessagesScanned,
    followUpCount,
    syncMailbox,
    markAsRead,
    dismissMessage,
    refreshMessages,
    overrideTriageCategory,
    labelMessage,
    archiveMessage,
    archiveConversation,
    labelConversation,
  }
}
