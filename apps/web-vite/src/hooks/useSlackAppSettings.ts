/**
 * useSlackAppSettings Hook
 *
 * Manages user-configurable Slack App settings (Client ID).
 * The Client ID is not a secret - it appears in OAuth URLs.
 */

import { useState, useEffect, useCallback } from 'react'
import type { SlackAppSettings, UpdateSlackAppSettingsInput } from '@lifeos/agents'
import { createFirestoreSlackAppSettingsRepository } from '@/adapters/mailbox/firestoreMailboxRepository'

const repository = createFirestoreSlackAppSettingsRepository()

interface UseSlackAppSettingsResult {
  settings: SlackAppSettings | null
  isLoading: boolean
  error: string | null
  isConfigured: boolean
  saveSettings: (updates: UpdateSlackAppSettingsInput) => Promise<void>
  deleteSettings: () => Promise<void>
}

export function useSlackAppSettings(userId: string | undefined): UseSlackAppSettingsResult {
  const [settings, setSettings] = useState<SlackAppSettings | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!userId) {
      setSettings(null)
      setIsLoading(false)
      return
    }

    let cancelled = false

    async function load() {
      setIsLoading(true)
      setError(null)

      try {
        const result = await repository.getSettings(userId)
        if (!cancelled) {
          setSettings(result)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load Slack app settings')
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [userId])

  const saveSettings = useCallback(
    async (updates: UpdateSlackAppSettingsInput) => {
      if (!userId) {
        throw new Error('User not authenticated')
      }

      setError(null)

      try {
        const updated = await repository.saveSettings(userId, updates)
        setSettings(updated)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to save Slack app settings'
        setError(message)
        throw err
      }
    },
    [userId]
  )

  const deleteSettings = useCallback(async () => {
    if (!userId) {
      throw new Error('User not authenticated')
    }

    setError(null)

    try {
      await repository.deleteSettings(userId)
      setSettings(null)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete Slack app settings'
      setError(message)
      throw err
    }
  }, [userId])

  return {
    settings,
    isLoading,
    error,
    isConfigured: Boolean(settings?.isConfigured),
    saveSettings,
    deleteSettings,
  }
}
