/**
 * Hook for managing Mailbox AI tool settings
 *
 * Follows the same pattern as useAIToolSettings.ts.
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useAuth } from '@/hooks/useAuth'
import type { MailboxAIToolSettings, MailboxAIToolConfig, MailboxAIToolId } from '@lifeos/agents'
import { createDefaultMailboxAIToolSettings } from '@lifeos/agents'
import {
  subscribeToMailboxAIToolSettings,
  updateMailboxAIToolConfig,
  resetMailboxAIToolToDefault,
  resetAllMailboxAIToolsToDefault,
  updateCustomPriorityPrompt,
} from '@/adapters/agents/firestoreMailboxAIToolSettingsRepository'

interface UseMailboxAIToolSettingsResult {
  settings: MailboxAIToolSettings | null
  isLoading: boolean
  error: Error | null
  updateTool: (toolId: MailboxAIToolId, updates: Partial<MailboxAIToolConfig>) => Promise<void>
  resetTool: (toolId: MailboxAIToolId) => Promise<void>
  resetAllTools: () => Promise<void>
  updatePriorityPrompt: (prompt: string | undefined) => Promise<void>
}

// Memoize default settings to avoid recreating on every render
const defaultSettings = createDefaultMailboxAIToolSettings()

export function useMailboxAIToolSettings(): UseMailboxAIToolSettingsResult {
  const { user } = useAuth()
  const [settingsState, setSettingsState] = useState<{
    userId: string | null
    settings: MailboxAIToolSettings | null
  }>({ userId: null, settings: null })
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    if (!user) {
      return
    }

    const unsubscribe = subscribeToMailboxAIToolSettings(user.uid, (newSettings) => {
      setSettingsState({ userId: user.uid, settings: newSettings })
    })

    return () => unsubscribe()
  }, [user])

  const settings = useMemo((): MailboxAIToolSettings | null => {
    if (!user) {
      return defaultSettings
    }
    if (settingsState.userId !== user.uid) {
      return null
    }
    return settingsState.settings
  }, [user, settingsState])

  const isLoading = !!user && settingsState.userId !== user.uid

  const updateTool = useCallback(
    async (toolId: MailboxAIToolId, updates: Partial<MailboxAIToolConfig>) => {
      if (!user) return
      try {
        await updateMailboxAIToolConfig(user.uid, toolId, updates)
      } catch (err) {
        setError(err as Error)
        throw err
      }
    },
    [user]
  )

  const resetTool = useCallback(
    async (toolId: MailboxAIToolId) => {
      if (!user) return
      try {
        await resetMailboxAIToolToDefault(user.uid, toolId)
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
      await resetAllMailboxAIToolsToDefault(user.uid)
    } catch (err) {
      setError(err as Error)
      throw err
    }
  }, [user])

  const updatePriorityPrompt = useCallback(
    async (prompt: string | undefined) => {
      if (!user) return
      try {
        await updateCustomPriorityPrompt(user.uid, prompt)
      } catch (err) {
        setError(err as Error)
        throw err
      }
    },
    [user]
  )

  return {
    settings,
    isLoading,
    error,
    updateTool,
    resetTool,
    resetAllTools,
    updatePriorityPrompt,
  }
}
