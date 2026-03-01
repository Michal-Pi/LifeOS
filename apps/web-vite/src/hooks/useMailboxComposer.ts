/**
 * useMailboxComposer Hook
 *
 * Manages composer state for the mailbox: draft save/load/discard,
 * send via Cloud Function, and auto-save timer.
 *
 * Supports multi-recipient (To, CC, BCC) and Reply All.
 */

import { useState, useCallback, useEffect, useRef } from 'react'
import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  getDocs,
  query,
  orderBy,
  limit as firestoreLimit,
} from 'firebase/firestore'
import { getFirestoreClient as getDb } from '@/lib/firestoreClient'
import { useAuth } from '@/hooks/useAuth'
import type { MessageSource, DraftMessage, PrioritizedMessage } from '@lifeos/agents'
import type { Recipient } from '@lifeos/agents'
import type { JSONContent } from '@tiptap/core'

interface ComposerState {
  draftId: string | null
  source: MessageSource
  toRecipients: Recipient[]
  ccRecipients: Recipient[]
  bccRecipients: Recipient[]
  subject: string
  body: string
  richContent: JSONContent | null
  inReplyTo: string | null
  threadId: string | null
}

interface UseMailboxComposerOptions {
  replyTo?: PrioritizedMessage | null
  replyAll?: boolean
  autoSaveIntervalMs?: number
}

interface UseMailboxComposerResult {
  state: ComposerState
  isSaving: boolean
  isSending: boolean
  error: string | null
  lastSavedMs: number | null

  setSource: (source: MessageSource) => void
  setToRecipients: (recipients: Recipient[]) => void
  setCcRecipients: (recipients: Recipient[]) => void
  setBccRecipients: (recipients: Recipient[]) => void
  setSubject: (subject: string) => void
  setBody: (body: string) => void
  setRichContent: (content: JSONContent) => void

  saveDraft: () => Promise<void>
  discardDraft: () => Promise<void>
  send: () => Promise<boolean>
  loadDrafts: () => Promise<DraftMessage[]>
}

const EMPTY_STATE: ComposerState = {
  draftId: null,
  source: 'gmail',
  toRecipients: [],
  ccRecipients: [],
  bccRecipients: [],
  subject: '',
  body: '',
  richContent: null,
  inReplyTo: null,
  threadId: null,
}

/**
 * Build a Recipient from an email address string (for Reply All pre-fill).
 */
function recipientFromEmail(email: string, channel: MessageSource): Recipient {
  return {
    id: email,
    name: email,
    email,
    channel,
  }
}

export function useMailboxComposer(
  options: UseMailboxComposerOptions = {}
): UseMailboxComposerResult {
  const { replyTo, replyAll = false, autoSaveIntervalMs = 30_000 } = options
  const { user } = useAuth()

  const [state, setState] = useState<ComposerState>(() => {
    if (replyTo) {
      const senderRecipient: Recipient = {
        id: replyTo.senderEmail ?? replyTo.sender,
        name: replyTo.sender,
        email: replyTo.senderEmail,
        channel: replyTo.source,
      }

      const toRecipients: Recipient[] = [senderRecipient]
      const ccRecipients: Recipient[] = []

      if (replyAll) {
        // Add original To recipients (excluding self and sender)
        const senderEmail = replyTo.senderEmail?.toLowerCase()
        const userEmail = user?.email?.toLowerCase()

        if (replyTo.toRecipients) {
          for (const addr of replyTo.toRecipients) {
            const addrLower = addr.toLowerCase()
            if (addrLower !== senderEmail && addrLower !== userEmail) {
              toRecipients.push(recipientFromEmail(addr, replyTo.source))
            }
          }
        }

        // Add original CC recipients (excluding self)
        if (replyTo.ccRecipients) {
          for (const addr of replyTo.ccRecipients) {
            if (addr.toLowerCase() !== userEmail) {
              ccRecipients.push(recipientFromEmail(addr, replyTo.source))
            }
          }
        }
      }

      return {
        ...EMPTY_STATE,
        source: replyTo.source,
        toRecipients,
        ccRecipients,
        subject: replyTo.subject ? `Re: ${replyTo.subject}` : '',
        inReplyTo: replyTo.originalMessageId,
        threadId: replyTo.threadId ?? null,
      }
    }
    return EMPTY_STATE
  })

  const [isSaving, setIsSaving] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastSavedMs, setLastSavedMs] = useState<number | null>(null)
  const autoSaveTimer = useRef<ReturnType<typeof setInterval>>()
  const isDirty = useRef(false)

  // Mark as dirty on any state change
  const updateState = useCallback(
    <K extends keyof ComposerState>(key: K, value: ComposerState[K]) => {
      setState((prev) => ({ ...prev, [key]: value }))
      isDirty.current = true
    },
    []
  )

  const setSource = useCallback((s: MessageSource) => updateState('source', s), [updateState])
  const setToRecipients = useCallback(
    (recipients: Recipient[]) => updateState('toRecipients', recipients),
    [updateState]
  )
  const setCcRecipients = useCallback(
    (recipients: Recipient[]) => updateState('ccRecipients', recipients),
    [updateState]
  )
  const setBccRecipients = useCallback(
    (recipients: Recipient[]) => updateState('bccRecipients', recipients),
    [updateState]
  )
  const setSubject = useCallback((s: string) => updateState('subject', s), [updateState])
  const setBody = useCallback((b: string) => updateState('body', b), [updateState])
  const setRichContent = useCallback(
    (c: JSONContent) => updateState('richContent', c),
    [updateState]
  )

  // Save draft to Firestore
  const saveDraft = useCallback(async () => {
    if (!user?.uid) return
    if (!state.body.trim() && state.toRecipients.length === 0) return

    setIsSaving(true)
    setError(null)

    try {
      const db = await getDb()
      const draftsCol = collection(db, `users/${user.uid}/mailboxDrafts`)
      const draftId = state.draftId ?? doc(draftsCol).id
      const now = Date.now()

      const draftData: Omit<DraftMessage, 'draftId'> & { draftId: string } = {
        draftId,
        userId: user.uid,
        source: state.source,
        // Backward compat: primary recipient
        recipientId: state.toRecipients[0]?.id,
        recipientName: state.toRecipients[0]?.name,
        // Multi-recipient arrays
        toRecipients: state.toRecipients.map((r) => ({
          id: r.id,
          name: r.name,
          email: r.email,
        })),
        ccRecipients: state.ccRecipients.map((r) => ({
          id: r.id,
          name: r.name,
          email: r.email,
        })),
        bccRecipients: state.bccRecipients.map((r) => ({
          id: r.id,
          name: r.name,
          email: r.email,
        })),
        subject: state.subject || undefined,
        body: state.body,
        richContent: state.richContent ?? undefined,
        inReplyTo: state.inReplyTo ?? undefined,
        threadId: state.threadId ?? undefined,
        createdAtMs: now,
        updatedAtMs: now,
      }

      await setDoc(doc(draftsCol, draftId), draftData)
      setState((prev) => ({ ...prev, draftId }))
      setLastSavedMs(now)
      isDirty.current = false
    } catch (err) {
      console.error('Error saving draft:', err)
      setError((err as Error).message)
    } finally {
      setIsSaving(false)
    }
  }, [user, state])

  // Discard draft
  const discardDraft = useCallback(async () => {
    if (!user?.uid || !state.draftId) {
      setState(EMPTY_STATE)
      return
    }

    try {
      const db = await getDb()
      await deleteDoc(doc(db, `users/${user.uid}/mailboxDrafts/${state.draftId}`))
    } catch (err) {
      console.error('Error deleting draft:', err)
    }

    setState(EMPTY_STATE)
    isDirty.current = false
  }, [user, state.draftId])

  // Send message via offline-capable outbox queue
  const send = useCallback(async (): Promise<boolean> => {
    if (!user?.uid) {
      setError('Not authenticated')
      return false
    }
    if (state.toRecipients.length === 0) {
      setError('At least one recipient is required')
      return false
    }
    if (!state.body.trim()) {
      setError('Message body is required')
      return false
    }

    setIsSending(true)
    setError(null)

    try {
      const { enqueueSend } = await import('@/outbox/mailboxOutbox')
      const { triggerDrain } = await import('@/outbox/mailboxOutboxWorker')

      const primaryRecipient = state.toRecipients[0]
      const additionalTo = state.toRecipients.slice(1)

      await enqueueSend(user.uid, {
        source: state.source,
        recipientId: primaryRecipient.id,
        recipientName: primaryRecipient.name,
        toRecipients:
          additionalTo.length > 0
            ? additionalTo.map((r) => ({ id: r.id, name: r.name }))
            : undefined,
        ccRecipients:
          state.ccRecipients.length > 0
            ? state.ccRecipients.map((r) => ({ id: r.id, name: r.name }))
            : undefined,
        bccRecipients:
          state.bccRecipients.length > 0
            ? state.bccRecipients.map((r) => ({ id: r.id, name: r.name }))
            : undefined,
        subject: state.subject || undefined,
        body: state.body,
        inReplyTo: state.inReplyTo || undefined,
        threadId: state.threadId || undefined,
      })

      // Trigger immediate send attempt
      triggerDrain()

      // Delete the draft if it exists
      if (state.draftId) {
        try {
          const db = await getDb()
          await deleteDoc(doc(db, `users/${user.uid}/mailboxDrafts/${state.draftId}`))
        } catch {
          // Non-critical: draft cleanup can fail silently
        }
      }

      setState(EMPTY_STATE)
      isDirty.current = false
      return true
    } catch (err) {
      console.error('Error queuing message:', err)
      setError((err as Error).message)
      return false
    } finally {
      setIsSending(false)
    }
  }, [user, state])

  // Load existing drafts
  const loadDrafts = useCallback(async (): Promise<DraftMessage[]> => {
    if (!user?.uid) return []

    try {
      const db = await getDb()
      const draftsCol = collection(db, `users/${user.uid}/mailboxDrafts`)
      const q = query(draftsCol, orderBy('updatedAtMs', 'desc'), firestoreLimit(20))
      const snapshot = await getDocs(q)
      return snapshot.docs.map((d) => d.data() as DraftMessage)
    } catch (err) {
      console.error('Error loading drafts:', err)
      return []
    }
  }, [user])

  // Auto-save timer
  useEffect(() => {
    if (!user?.uid || autoSaveIntervalMs <= 0) return

    autoSaveTimer.current = setInterval(() => {
      if (isDirty.current) {
        void saveDraft()
      }
    }, autoSaveIntervalMs)

    return () => {
      if (autoSaveTimer.current) clearInterval(autoSaveTimer.current)
    }
  }, [user?.uid, autoSaveIntervalMs, saveDraft])

  return {
    state,
    isSaving,
    isSending,
    error,
    lastSavedMs,
    setSource,
    setToRecipients,
    setCcRecipients,
    setBccRecipients,
    setSubject,
    setBody,
    setRichContent,
    saveDraft,
    discardDraft,
    send,
    loadDrafts,
  }
}
