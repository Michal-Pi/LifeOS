import { useCallback, useEffect, useState } from 'react'
import { deleteField, doc, onSnapshot, setDoc } from 'firebase/firestore'

import { getFirestoreClient } from '@/lib/firestoreClient'

export type AiProviderKeyType = 'openai' | 'anthropic' | 'google' | 'xai'

export interface AiProviderKeys {
  openaiKey?: string
  anthropicKey?: string
  googleKey?: string
  xaiKey?: string
}

interface UseAiProviderKeysResult {
  keys: AiProviderKeys
  isLoading: boolean
  error: string | null
  saveKey: (provider: AiProviderKeyType, value: string) => Promise<void>
  removeKey: (provider: AiProviderKeyType) => Promise<void>
}

const providerFieldMap: Record<AiProviderKeyType, keyof AiProviderKeys> = {
  openai: 'openaiKey',
  anthropic: 'anthropicKey',
  google: 'googleKey',
  xai: 'xaiKey',
}

export function useAiProviderKeys(userId: string | null | undefined): UseAiProviderKeysResult {
  const [keys, setKeys] = useState<AiProviderKeys>({})
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
        const docRef = doc(db, `users/${userId}/settings/aiProviderKeys`)
        unsubscribe = onSnapshot(
          docRef,
          (snapshot) => {
            setKeys((snapshot.data() as AiProviderKeys) ?? {})
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
    async (provider: AiProviderKeyType, value: string) => {
      if (!userId) return
      const field = providerFieldMap[provider]
      const db = await getFirestoreClient()
      const docRef = doc(db, `users/${userId}/settings/aiProviderKeys`)
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
    async (provider: AiProviderKeyType) => {
      if (!userId) return
      const field = providerFieldMap[provider]
      const db = await getFirestoreClient()
      const docRef = doc(db, `users/${userId}/settings/aiProviderKeys`)
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
