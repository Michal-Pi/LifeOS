/**
 * Hook for managing AI tool settings
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useAuth } from '@/hooks/useAuth'
import type { AIToolSettings, AIToolConfig, AIToolId } from '@lifeos/agents'
import { createDefaultAIToolSettings } from '@lifeos/agents'
import {
  subscribeToAIToolSettings,
  updateAIToolConfig,
  resetAIToolToDefault,
  resetAllAIToolsToDefault,
} from '@/adapters/agents/firestoreAIToolSettingsRepository'

interface UseAIToolSettingsResult {
  settings: AIToolSettings | null
  isLoading: boolean
  error: Error | null
  updateTool: (toolId: AIToolId, updates: Partial<AIToolConfig>) => Promise<void>
  resetTool: (toolId: AIToolId) => Promise<void>
  resetAllTools: () => Promise<void>
}

// Memoize default settings to avoid recreating on every render
const defaultSettings = createDefaultAIToolSettings()

export function useAIToolSettings(): UseAIToolSettingsResult {
  const { user } = useAuth()
  // Track the user ID that the current settings belong to (null = no user, undefined = not yet loaded)
  const [settingsState, setSettingsState] = useState<{
    userId: string | null
    settings: AIToolSettings | null
  }>({ userId: null, settings: null })
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    // Only subscribe when there's a user
    if (!user) {
      return
    }

    const unsubscribe = subscribeToAIToolSettings(user.uid, (newSettings) => {
      setSettingsState({ userId: user.uid, settings: newSettings })
    })

    return () => unsubscribe()
  }, [user])

  // Derive final settings based on current state
  const settings = useMemo((): AIToolSettings | null => {
    // No user - return defaults immediately
    if (!user) {
      return defaultSettings
    }
    // User exists but settings are for a different user (or not loaded) - still loading
    if (settingsState.userId !== user.uid) {
      return null
    }
    // Settings loaded for current user
    return settingsState.settings
  }, [user, settingsState])

  // Derive loading state
  const isLoading = !!user && settingsState.userId !== user.uid

  const updateTool = useCallback(
    async (toolId: AIToolId, updates: Partial<AIToolConfig>) => {
      if (!user) return
      try {
        await updateAIToolConfig(user.uid, toolId, updates)
      } catch (err) {
        setError(err as Error)
        throw err
      }
    },
    [user]
  )

  const resetTool = useCallback(
    async (toolId: AIToolId) => {
      if (!user) return
      try {
        await resetAIToolToDefault(user.uid, toolId)
      } catch (err) {
        setError(err as Error)
        throw err
      }
    },
    [user]
  )

  const resetAllTools = useCallback(async () => {
    if (!user) return
    try {
      await resetAllAIToolsToDefault(user.uid)
    } catch (err) {
      setError(err as Error)
      throw err
    }
  }, [user])

  return {
    settings,
    isLoading,
    error,
    updateTool,
    resetTool,
    resetAllTools,
  }
}
