import { useState, useEffect, useCallback, useMemo } from 'react'
import { useAuth } from './useAuth'
import { createFirestoreProjectManagerRepository } from '@/adapters/agents/firestoreProjectManagerRepository'
import { createProjectManagerUsecases } from '@lifeos/agents'
import { extractContextFromTurn } from '@/services/projectManager/contextExtractor'
import { summarizeContext, shouldSummarize } from '@/services/projectManager/contextSummarizer'
import { updateProfileFromInteraction } from '@/services/projectManager/userProfiler'
import type { ConversationContext, UserProfile } from '@lifeos/agents'

export function useProjectManager(workflowId?: string, runId?: string) {
  const { user } = useAuth()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [contextState, setContextState] = useState<{
    key: string | null
    context: ConversationContext | null
  }>({ key: null, context: null })
  const activeKey = user ? `${user.uid}:${workflowId ?? ''}` : null

  const repository = useMemo(() => createFirestoreProjectManagerRepository(), [])
  const usecases = useMemo(
    () =>
      createProjectManagerUsecases(repository, {
        extractContextFromTurn,
        summarizeContext,
        shouldSummarize,
      }),
    [repository]
  )

  useEffect(() => {
    if (!user || !activeKey) {
      return
    }
    repository
      .getActiveContext(user.uid, workflowId)
      .then((ctx) => {
        setContextState({ key: activeKey, context: ctx })
      })
      .catch(() => {
        // Silently fail if context loading fails
      })
  }, [activeKey, repository, user, workflowId])

  useEffect(() => {
    if (!user) return
    repository.getProfile(user.uid).then((next) => setProfile(next))
  }, [repository, user])

  const startConversation = useCallback(async () => {
    if (!user) return null
    const ctx = await usecases.startConversation(user.uid, workflowId, runId)
    if (activeKey) {
      setContextState({ key: activeKey, context: ctx })
    }
    return ctx
  }, [activeKey, runId, usecases, user, workflowId])

  const addTurn = useCallback(
    async (userMessage: string, pmResponse: string) => {
      const currentContext = activeKey === contextState.key ? contextState.context : null
      if (!user || !currentContext) return null
      const updated = await usecases.addTurn(
        user.uid,
        currentContext.contextId,
        userMessage,
        pmResponse
      )
      if (activeKey) {
        setContextState({ key: activeKey, context: updated })
      }
      return updated
    },
    [activeKey, contextState, usecases, user]
  )

  const getRelevantContext = useCallback(async () => {
    const currentContext = activeKey === contextState.key ? contextState.context : null
    if (!user || !currentContext) return ''
    return usecases.getRelevantContext(user.uid, currentContext.contextId)
  }, [activeKey, contextState, usecases, user])

  const recordInteraction = useCallback(
    async (interaction: {
      questionsAsked: number
      questionsAnswered: number
      expertCouncilUsed: boolean
      decisionsMade: number
      satisfactionRating?: number
    }) => {
      if (!user) return null
      const updatedProfile = await updateProfileFromInteraction(user.uid, interaction, repository)
      setProfile(updatedProfile)
      return updatedProfile
    },
    [repository, user]
  )

  const loading = Boolean(activeKey && contextState.key !== activeKey)
  const context = activeKey === contextState.key ? contextState.context : null

  return {
    context,
    profile,
    loading,
    startConversation,
    addTurn,
    getRelevantContext,
    recordInteraction,
  }
}
