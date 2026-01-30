import { useCallback, useEffect, useState } from 'react'
import { deleteField, doc, onSnapshot, setDoc } from 'firebase/firestore'

import { getFirestoreClient } from '@/lib/firestoreClient'

export type SearchToolKeyType = 'serper' | 'firecrawl' | 'exa' | 'jina'

export interface SearchToolKeys {
  serperKey?: string
  firecrawlKey?: string
  exaKey?: string
  jinaKey?: string
}

interface UseSearchToolKeysResult {
  keys: SearchToolKeys
  isLoading: boolean
  error: string | null
  saveKey: (tool: SearchToolKeyType, value: string) => Promise<void>
  removeKey: (tool: SearchToolKeyType) => Promise<void>
}

const toolFieldMap: Record<SearchToolKeyType, keyof SearchToolKeys> = {
  serper: 'serperKey',
  firecrawl: 'firecrawlKey',
  exa: 'exaKey',
  jina: 'jinaKey',
}

export function useSearchToolKeys(userId: string | null | undefined): UseSearchToolKeysResult {
  const [keys, setKeys] = useState<SearchToolKeys>({})
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!userId) {
      queueMicrotask(() => {
        setKeys({})
        setIsLoading(false)
      })
      return
    }

    let unsubscribe: (() => void) | undefined

    const setupSubscription = async () => {
      try {
        const db = await getFirestoreClient()
        const docRef = doc(db, `users/${userId}/settings/searchToolKeys`)
        unsubscribe = onSnapshot(
          docRef,
          (snapshot) => {
            setKeys((snapshot.data() as SearchToolKeys) ?? {})
            setIsLoading(false)
          },
          (err) => {
            setError(err.message)
            setIsLoading(false)
          }
        )
      } catch (err) {
        setError((err as Error).message)
        setIsLoading(false)
      }
    }

    void setupSubscription()

    return () => {
      if (unsubscribe) {
        unsubscribe()
      }
    }
  }, [userId])

  const saveKey = useCallback(
    async (tool: SearchToolKeyType, value: string) => {
      if (!userId) return
      const field = toolFieldMap[tool]
      const db = await getFirestoreClient()
      const docRef = doc(db, `users/${userId}/settings/searchToolKeys`)
      await setDoc(
        docRef,
        {
          [field]: value,
          updatedAtMs: Date.now(),
        },
        { merge: true }
      )
    },
    [userId]
  )

  const removeKey = useCallback(
    async (tool: SearchToolKeyType) => {
      if (!userId) return
      const field = toolFieldMap[tool]
      const db = await getFirestoreClient()
      const docRef = doc(db, `users/${userId}/settings/searchToolKeys`)
      await setDoc(
        docRef,
        {
          [field]: deleteField(),
          updatedAtMs: Date.now(),
        },
        { merge: true }
      )
    },
    [userId]
  )

  return {
    keys,
    isLoading,
    error,
    saveKey,
    removeKey,
  }
}
