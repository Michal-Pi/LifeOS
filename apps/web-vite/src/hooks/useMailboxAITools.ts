/**
 * useMailboxAITools Hook
 *
 * React hook for managing mailbox AI tool state and operations.
 * Follows the same pattern as useWorkoutAITools.ts.
 */

import { useState, useCallback } from 'react'
import type {
  MailboxAIToolId,
  ResponseDraftResult,
  CleanupRecommendation,
  SenderPersona,
  MessageSource,
} from '@lifeos/agents'
import {
  generateResponseDraft,
  getCleanupRecommendations,
  researchSender,
  type MailboxAIToolUsage,
} from '@/lib/mailboxAITools'

export type MailboxAIToolType = MailboxAIToolId | null

export interface MailboxAIToolState {
  activeTool: MailboxAIToolType
  isLoading: boolean
  error: string | null
  usage: MailboxAIToolUsage | null

  // Results for each tool
  draftResult: ResponseDraftResult | null
  cleanupResult: CleanupRecommendation[] | null
  researchResult: Omit<SenderPersona, 'personaId' | 'userId' | 'createdAtMs' | 'updatedAtMs'> | null
}

export interface UseMailboxAIToolsReturn {
  state: MailboxAIToolState
  runResponseDraft: (
    messageId: string,
    messageBody: string,
    senderName: string,
    options?: {
      senderPersona?: Partial<SenderPersona>
      toneOverride?: string
      messageSource?: MessageSource
    }
  ) => Promise<void>
  runMailboxCleanup: (
    messages: Array<{
      id: string
      source: MessageSource
      sender: string
      subject?: string
      snippet: string
      priority?: string
    }>
  ) => Promise<void>
  runSenderResearch: (
    senderName: string,
    senderEmail?: string,
    linkedinUrl?: string,
    existingMessages?: string[]
  ) => Promise<void>
  clearResults: () => void
  setActiveTool: (tool: MailboxAIToolType) => void
}

const initialState: MailboxAIToolState = {
  activeTool: null,
  isLoading: false,
  error: null,
  usage: null,
  draftResult: null,
  cleanupResult: null,
  researchResult: null,
}

export function useMailboxAITools(): UseMailboxAIToolsReturn {
  const [state, setState] = useState<MailboxAIToolState>(initialState)

  const setActiveTool = useCallback((tool: MailboxAIToolType) => {
    setState((prev) => ({ ...prev, activeTool: tool, error: null }))
  }, [])

  const clearResults = useCallback(() => {
    setState(initialState)
  }, [])

  const runResponseDraft = useCallback(
    async (
      messageId: string,
      messageBody: string,
      senderName: string,
      options?: {
        senderPersona?: Partial<SenderPersona>
        toneOverride?: string
        messageSource?: MessageSource
      }
    ) => {
      setState((prev) => ({
        ...prev,
        activeTool: 'responseDraft',
        isLoading: true,
        error: null,
        usage: null,
        draftResult: null,
      }))

      try {
        const result = await generateResponseDraft(messageId, messageBody, senderName, options)
        setState((prev) => ({
          ...prev,
          isLoading: false,
          draftResult: result.data,
          usage: result.usage ?? null,
        }))
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Failed to generate response draft'
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: errorMsg,
        }))
      }
    },
    []
  )

  const runMailboxCleanup = useCallback(
    async (
      messages: Array<{
        id: string
        source: MessageSource
        sender: string
        subject?: string
        snippet: string
        priority?: string
      }>
    ) => {
      setState((prev) => ({
        ...prev,
        activeTool: 'mailboxCleanup',
        isLoading: true,
        error: null,
        usage: null,
        cleanupResult: null,
      }))

      try {
        const result = await getCleanupRecommendations(messages)
        setState((prev) => ({
          ...prev,
          isLoading: false,
          cleanupResult: result.data,
          usage: result.usage ?? null,
        }))
      } catch (err) {
        const errorMsg =
          err instanceof Error ? err.message : 'Failed to get cleanup recommendations'
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: errorMsg,
        }))
      }
    },
    []
  )

  const runSenderResearch = useCallback(
    async (
      senderName: string,
      senderEmail?: string,
      linkedinUrl?: string,
      existingMessages?: string[]
    ) => {
      setState((prev) => ({
        ...prev,
        activeTool: 'senderResearch',
        isLoading: true,
        error: null,
        usage: null,
        researchResult: null,
      }))

      try {
        const result = await researchSender(senderName, {
          senderEmail,
          linkedinUrl,
          existingMessages,
        })
        setState((prev) => ({
          ...prev,
          isLoading: false,
          researchResult: result.data,
          usage: result.usage ?? null,
        }))
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Failed to research sender'
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: errorMsg,
        }))
      }
    },
    []
  )

  return {
    state,
    runResponseDraft,
    runMailboxCleanup,
    runSenderResearch,
    clearResults,
    setActiveTool,
  }
}
