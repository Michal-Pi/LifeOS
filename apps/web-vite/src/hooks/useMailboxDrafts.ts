/**
 * useMailboxDrafts Hook
 *
 * Loads saved drafts from Firestore and provides delete functionality.
 * Drafts are stored at users/{uid}/mailboxDrafts.
 */

import { useState, useEffect, useCallback } from 'react'
import { collection, query, orderBy, onSnapshot, deleteDoc, doc } from 'firebase/firestore'
import { getFirestoreClient as getDb } from '@/lib/firestoreClient'
import { useAuth } from '@/hooks/useAuth'
import type { DraftMessage } from '@lifeos/agents'

interface UseMailboxDraftsResult {
  drafts: DraftMessage[]
  loading: boolean
  error: string | null
  deleteDraft: (draftId: string) => Promise<void>
}

export function useMailboxDrafts(): UseMailboxDraftsResult {
  const { user } = useAuth()
  const uid = user?.uid
  const [drafts, setDrafts] = useState<DraftMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!uid) return

    let cancelled = false

    async function subscribe() {
      try {
        const db = await getDb()
        const draftsCol = collection(db, `users/${uid}/mailboxDrafts`)
        const q = query(draftsCol, orderBy('updatedAtMs', 'desc'))

        const unsubscribe = onSnapshot(
          q,
          (snapshot) => {
            if (cancelled) return
            setDrafts(snapshot.docs.map((d) => d.data() as DraftMessage))
            setLoading(false)
            setError(null)
          },
          (err) => {
            if (cancelled) return
            console.error('Error loading drafts:', err)
            setError(err.message)
            setLoading(false)
          }
        )

        return unsubscribe
      } catch (err) {
        if (!cancelled) {
          console.error('Error subscribing to drafts:', err)
          setError((err as Error).message)
          setLoading(false)
        }
        return undefined
      }
    }

    let unsubscribe: (() => void) | undefined
    void subscribe().then((unsub) => {
      unsubscribe = unsub
    })

    return () => {
      cancelled = true
      unsubscribe?.()
    }
  }, [uid])

  const deleteDraft = useCallback(
    async (draftId: string) => {
      if (!uid) return
      try {
        const db = await getDb()
        await deleteDoc(doc(db, `users/${uid}/mailboxDrafts/${draftId}`))
      } catch (err) {
        console.error('Error deleting draft:', err)
      }
    },
    [uid]
  )

  if (!uid) {
    return { drafts: [], loading: false, error: null, deleteDraft }
  }

  return { drafts, loading, error, deleteDraft }
}
