/**
 * useMailboxComposer Hook
 *
 * Manages composer state for the mailbox: draft save/load/discard,
 * send via Cloud Function, and auto-save timer.
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
import type { JSONContent } from '@tiptap/core'

interface ComposerState {
  draftId: string | null
  source: MessageSource
  recipientId: string
  recipientName: string
  subject: string
  body: string
  richContent: JSONContent | null
  inReplyTo: string | null
  threadId: string | null
}

interface UseMailboxComposerOptions {
  replyTo?: PrioritizedMessage | null
  autoSaveIntervalMs?: number
}

interface UseMailboxComposerResult {
  state: ComposerState
  isSaving: boolean
  isSending: boolean
  error: string | null
  lastSavedMs: number | null

  setSource: (source: MessageSource) => void
  setRecipientId: (id: string) => void
  setRecipientName: (name: string) => void
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
  recipientId: '',
  recipientName: '',
  subject: '',
  body: '',
  richContent: null,
  inReplyTo: null,
  threadId: null,
}

export function useMailboxComposer(
  options: UseMailboxComposerOptions = {}
): UseMailboxComposerResult {
  const { replyTo, autoSaveIntervalMs = 30_000 } = options
  const { user } = useAuth()

  const [state, setState] = useState<ComposerState>(() => {
    if (replyTo) {
      return {
        ...EMPTY_STATE,
        source: replyTo.source,
        recipientId: replyTo.senderEmail ?? replyTo.sender,
        recipientName: replyTo.sender,
        subject: replyTo.subject ? `Re: ${replyTo.subject}` : '',
        inReplyTo: replyTo.originalMessageId,
        threadId: null,
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
  const setRecipientId = useCallback((id: string) => updateState('recipientId', id), [updateState])
  const setRecipientName = useCallback(
    (name: string) => updateState('recipientName', name),
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
    if (!state.body.trim() && !state.recipientId.trim()) return

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
        recipientId: state.recipientId || undefined,
        recipientName: state.recipientName || undefined,
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

  // Send message via Cloud Function
  const send = useCallback(async (): Promise<boolean> => {
    if (!user?.uid) {
      setError('Not authenticated')
      return false
    }
    if (!state.recipientId.trim()) {
      setError('Recipient is required')
      return false
    }
    if (!state.body.trim()) {
      setError('Message body is required')
      return false
    }

    setIsSending(true)
    setError(null)

    try {
      const idToken = await user.getIdToken()
      const response = await fetch(`${import.meta.env.VITE_FUNCTIONS_URL}/mailboxSend`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          uid: user.uid,
          source: state.source,
          recipientId: state.recipientId,
          recipientName: state.recipientName || undefined,
          subject: state.subject || undefined,
          body: state.body,
          htmlBody: undefined, // Rich content HTML rendering not yet implemented
          inReplyTo: state.inReplyTo || undefined,
          threadId: state.threadId || undefined,
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to send message')
      }

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
      console.error('Error sending message:', err)
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
    setRecipientId,
    setRecipientName,
    setSubject,
    setBody,
    setRichContent,
    saveDraft,
    discardDraft,
    send,
    loadDrafts,
  }
}
