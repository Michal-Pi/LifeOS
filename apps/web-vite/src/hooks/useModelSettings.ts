import { useState, useEffect, useCallback } from 'react'
import type { ModelSettings, ModelProvider, ProviderModelConfig } from '@lifeos/agents'
import { FirestoreModelSettingsRepository } from '@/adapters/agents/firestoreModelSettingsRepository'
import { useAuth } from '@/hooks/useAuth'

const repository = new FirestoreModelSettingsRepository()

export function useModelSettings() {
  const { user } = useAuth()
  const [settings, setSettings] = useState<ModelSettings | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  // Load settings
  const loadSettings = useCallback(async () => {
    if (!user) {
      setIsLoading(false)
      return
    }

    try {
      setIsLoading(true)
      setError(null)
      const loadedSettings = await repository.getSettings(user.uid)
      setSettings(loadedSettings)
    } catch (err) {
      console.error('Failed to load model settings:', err)
      setError(err instanceof Error ? err : new Error('Failed to load settings'))
    } finally {
      setIsLoading(false)
    }
  }, [user])

  // Update provider configuration
  const updateProviderConfig = useCallback(
    async (provider: ModelProvider, config: ProviderModelConfig) => {
      if (!user || !settings) return

      try {
        setError(null)
        await repository.updateProviderConfig(user.uid, provider, config)
        // Update local state
        setSettings((prev) =>
          prev
            ? {
                ...prev,
                providers: {
                  ...prev.providers,
                  [provider]: { ...config, lastUpdatedMs: Date.now() },
                },
                updatedAtMs: Date.now(),
              }
            : null
        )
      } catch (err) {
        console.error('Failed to update provider config:', err)
        setError(err instanceof Error ? err : new Error('Failed to update provider config'))
        throw err
      }
    },
    [user, settings]
  )

  // Reset to defaults
  const resetToDefaults = useCallback(async () => {
    if (!user) return

    try {
      setError(null)
      await repository.resetToDefaults(user.uid)
      await loadSettings()
    } catch (err) {
      console.error('Failed to reset settings:', err)
      setError(err instanceof Error ? err : new Error('Failed to reset settings'))
      throw err
    }
  }, [user, loadSettings])

  // Load settings on mount
  useEffect(() => {
    void loadSettings()
  }, [loadSettings])

  return {
    settings,
    isLoading,
    error,
    updateProviderConfig,
    resetToDefaults,
    reload: loadSettings,
  }
}
