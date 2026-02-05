/**
 * useNoteAITools Hook
 *
 * React hook for managing AI tool state and operations.
 */

import { useState, useCallback } from 'react'
import type { JSONContent } from '@tiptap/core'
import {
  summarizeNote,
  factCheckNote,
  analyzeForLinkedIn,
  writeWithAI,
  tagParagraphsWithAI,
  suggestNoteTags,
  type FactCheckResult,
  type LinkedInAnalysis,
  type ParagraphTagSuggestion,
} from '@/lib/noteAITools'

export type AIToolType =
  | 'summarize'
  | 'factCheck'
  | 'linkedIn'
  | 'writeWithAI'
  | 'tagWithAI'
  | 'noteTags'
  | null

export interface AIToolState {
  activeTool: AIToolType
  isLoading: boolean
  error: string | null

  // Results for each tool
  summaryResult: string | null
  factCheckResults: FactCheckResult[] | null
  linkedInResult: LinkedInAnalysis | null
  writeResult: string | null
  tagSuggestions: ParagraphTagSuggestion[] | null
  noteTagSuggestions: string[] | null
}

export interface UseNoteAIToolsReturn {
  state: AIToolState
  runSummarize: (content: JSONContent) => Promise<void>
  runFactCheck: (content: JSONContent) => Promise<void>
  runLinkedIn: (content: JSONContent) => Promise<void>
  runWriteWithAI: (content: JSONContent, prompt: string) => Promise<void>
  runTagWithAI: (
    content: JSONContent,
    topics: Array<{ id: string; name: string }>,
    notes: Array<{ id: string; title: string }>
  ) => Promise<void>
  runSuggestNoteTags: (content: JSONContent, existingTags: string[]) => Promise<void>
  clearResults: () => void
  setActiveTool: (tool: AIToolType) => void
}

const initialState: AIToolState = {
  activeTool: null,
  isLoading: false,
  error: null,
  summaryResult: null,
  factCheckResults: null,
  linkedInResult: null,
  writeResult: null,
  tagSuggestions: null,
  noteTagSuggestions: null,
}

export function useNoteAITools(): UseNoteAIToolsReturn {
  const [state, setState] = useState<AIToolState>(initialState)

  const setActiveTool = useCallback((tool: AIToolType) => {
    setState((prev) => ({ ...prev, activeTool: tool, error: null }))
  }, [])

  const clearResults = useCallback(() => {
    setState(initialState)
  }, [])

  const runSummarize = useCallback(async (content: JSONContent) => {
    setState((prev) => ({
      ...prev,
      activeTool: 'summarize',
      isLoading: true,
      error: null,
      summaryResult: null,
    }))

    try {
      const result = await summarizeNote(content)
      setState((prev) => ({
        ...prev,
        isLoading: false,
        summaryResult: result,
      }))
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to summarize note'
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: errorMsg,
      }))
    }
  }, [])

  const runFactCheck = useCallback(async (content: JSONContent) => {
    setState((prev) => ({
      ...prev,
      activeTool: 'factCheck',
      isLoading: true,
      error: null,
      factCheckResults: null,
    }))

    try {
      const result = await factCheckNote(content)
      setState((prev) => ({
        ...prev,
        isLoading: false,
        factCheckResults: result,
      }))
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to fact-check note'
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: errorMsg,
      }))
    }
  }, [])

  const runLinkedIn = useCallback(async (content: JSONContent) => {
    setState((prev) => ({
      ...prev,
      activeTool: 'linkedIn',
      isLoading: true,
      error: null,
      linkedInResult: null,
    }))

    try {
      const result = await analyzeForLinkedIn(content)
      setState((prev) => ({
        ...prev,
        isLoading: false,
        linkedInResult: result,
      }))
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to analyze for LinkedIn'
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: errorMsg,
      }))
    }
  }, [])

  const runWriteWithAI = useCallback(async (content: JSONContent, prompt: string) => {
    setState((prev) => ({
      ...prev,
      activeTool: 'writeWithAI',
      isLoading: true,
      error: null,
      writeResult: null,
    }))

    try {
      const result = await writeWithAI(content, prompt)
      setState((prev) => ({
        ...prev,
        isLoading: false,
        writeResult: result,
      }))
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to generate content'
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: errorMsg,
      }))
    }
  }, [])

  const runTagWithAI = useCallback(
    async (
      content: JSONContent,
      topics: Array<{ id: string; name: string }>,
      notes: Array<{ id: string; title: string }>
    ) => {
      setState((prev) => ({
        ...prev,
        activeTool: 'tagWithAI',
        isLoading: true,
        error: null,
        tagSuggestions: null,
      }))

      try {
        const result = await tagParagraphsWithAI(content, topics, notes)
        setState((prev) => ({
          ...prev,
          isLoading: false,
          tagSuggestions: result,
        }))
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Failed to analyze paragraphs'
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: errorMsg,
        }))
      }
    },
    []
  )

  const runSuggestNoteTags = useCallback(async (content: JSONContent, existingTags: string[]) => {
    setState((prev) => ({
      ...prev,
      activeTool: 'noteTags',
      isLoading: true,
      error: null,
      noteTagSuggestions: null,
    }))

    try {
      const result = await suggestNoteTags(content, existingTags)
      setState((prev) => ({
        ...prev,
        isLoading: false,
        noteTagSuggestions: result,
      }))
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to suggest tags'
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: errorMsg,
      }))
    }
  }, [])

  return {
    state,
    runSummarize,
    runFactCheck,
    runLinkedIn,
    runWriteWithAI,
    runTagWithAI,
    runSuggestNoteTags,
    clearResults,
    setActiveTool,
  }
}
