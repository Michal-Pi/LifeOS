import { useCallback, useEffect, useState } from 'react'
import { doc, onSnapshot, setDoc, deleteField } from 'firebase/firestore'

import { getFirestoreClient } from '@/lib/firestoreClient'

export interface AgentMemorySettings {
  memoryMessageLimit?: number
}

interface UseAgentMemorySettingsResult {
  settings: AgentMemorySettings
  isLoading: boolean
  error: string | null
  saveMemoryLimit: (limit: number) => Promise<void>
  clearMemoryLimit: () => Promise<void>
}

export function useAgentMemorySettings(
  userId: string | null | undefined
): UseAgentMemorySettingsResult {
  const [settings, setSettings] = useState<AgentMemorySettings>({})
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!userId) {
      queueMicrotask(() => {
        setSettings({})
        setIsLoading(false)
      })
      return
    }

    let unsubscribe: (() => void) | undefined

    const setupSubscription = async () => {
      try {
        const db = await getFirestoreClient()
        const docRef = doc(db, `users/${userId}/settings/agentMemorySettings`)
        unsubscribe = onSnapshot(
          docRef,
          (snapshot) => {
            setSettings((snapshot.data() as AgentMemorySettings) ?? {})
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

  const saveMemoryLimit = useCallback(
    async (limit: number) => {
      if (!userId) return
      const db = await getFirestoreClient()
      const docRef = doc(db, `users/${userId}/settings/agentMemorySettings`)
      await setDoc(
        docRef,
        {
          memoryMessageLimit: limit,
          updatedAtMs: Date.now(),
        },
        { merge: true }
      )
    },
    [userId]
  )

  const clearMemoryLimit = useCallback(async () => {
    if (!userId) return
    const db = await getFirestoreClient()
    const docRef = doc(db, `users/${userId}/settings/agentMemorySettings`)
    await setDoc(
      docRef,
      {
        memoryMessageLimit: deleteField(),
        updatedAtMs: Date.now(),
      },
      { merge: true }
    )
  }, [userId])

  return {
    settings,
    isLoading,
    error,
    saveMemoryLimit,
    clearMemoryLimit,
  }
}
