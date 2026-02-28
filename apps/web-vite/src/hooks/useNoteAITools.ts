/**
 * useNoteAITools Hook
 *
 * React hook for managing AI tool state and operations.
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import type { JSONContent } from '@tiptap/core'
import {
  summarizeNote,
  factCheckNote,
  factCheckExtract,
  factCheckVerify,
  analyzeForLinkedIn,
  writeWithAI,
  tagParagraphsWithAI,
  suggestNoteTags,
  type FactCheckClaim,
  type FactCheckResult,
  type LinkedInAnalysis,
  type ParagraphTagSuggestion,
  type AIToolUsage,
} from '@/lib/noteAITools'

export type AIToolType =
  | 'summarize'
  | 'factCheck'
  | 'linkedIn'
  | 'writeWithAI'
  | 'tagWithAI'
  | 'noteTags'
  | null

export type FactCheckStep = 'idle' | 'extracting' | 'selecting' | 'verifying' | 'done'

export interface AIToolState {
  activeTool: AIToolType
  isLoading: boolean
  error: string | null
  usage: AIToolUsage | null

  // Results for each tool
  summaryResult: string | null
  factCheckResults: FactCheckResult[] | null
  linkedInResult: LinkedInAnalysis | null
  writeResult: string | null
  tagSuggestions: ParagraphTagSuggestion[] | null
  noteTagSuggestions: string[] | null

  // Interactive fact-check state
  factCheckStep: FactCheckStep
  extractedClaims: FactCheckClaim[] | null
  selectedClaimFlags: boolean[]
  extractionUsage: AIToolUsage | null
}

export interface UseNoteAIToolsReturn {
  state: AIToolState
  runSummarize: (content: JSONContent) => Promise<void>
  runFactCheck: (content: JSONContent) => Promise<void>
  runFactCheckExtract: (content: JSONContent) => Promise<void>
  toggleClaimSelection: (index: number) => void
  runFactCheckVerify: (content: JSONContent) => Promise<void>
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
  usage: null,
  summaryResult: null,
  factCheckResults: null,
  linkedInResult: null,
  writeResult: null,
  tagSuggestions: null,
  noteTagSuggestions: null,
  factCheckStep: 'idle',
  extractedClaims: null,
  selectedClaimFlags: [],
  extractionUsage: null,
}

export function useNoteAITools(): UseNoteAIToolsReturn {
  const [state, setState] = useState<AIToolState>(initialState)

  // Ref mirror for async callbacks to read current state without stale closures
  const stateRef = useRef(state)
  useEffect(() => {
    stateRef.current = state
  })

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
      usage: null,
      summaryResult: null,
    }))

    try {
      const result = await summarizeNote(content)
      setState((prev) => ({
        ...prev,
        isLoading: false,
        summaryResult: result.data,
        usage: result.usage ?? null,
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
      usage: null,
      factCheckResults: null,
    }))

    try {
      const result = await factCheckNote(content)
      setState((prev) => ({
        ...prev,
        isLoading: false,
        factCheckResults: result.data,
        usage: result.usage ?? null,
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

  // --- Interactive fact-check methods ---

  const runFactCheckExtract = useCallback(async (content: JSONContent) => {
    setState((prev) => ({
      ...prev,
      activeTool: 'factCheck',
      isLoading: true,
      error: null,
      usage: null,
      factCheckResults: null,
      factCheckStep: 'extracting',
      extractedClaims: null,
      selectedClaimFlags: [],
      extractionUsage: null,
    }))

    try {
      const result = await factCheckExtract(content)
      const claims = result.data
      if (claims.length === 0) {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          factCheckStep: 'done',
          factCheckResults: [],
          usage: result.usage ?? null,
        }))
        return
      }
      setState((prev) => ({
        ...prev,
        isLoading: false,
        factCheckStep: 'selecting',
        extractedClaims: claims,
        selectedClaimFlags: claims.map(() => true),
        extractionUsage: result.usage ?? null,
      }))
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to extract claims'
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: errorMsg,
        factCheckStep: 'idle',
      }))
    }
  }, [])

  const toggleClaimSelection = useCallback((index: number) => {
    setState((prev) => {
      const flags = [...prev.selectedClaimFlags]
      flags[index] = !flags[index]
      return { ...prev, selectedClaimFlags: flags }
    })
  }, [])

  const runFactCheckVerify = useCallback(async (content: JSONContent) => {
    const { extractedClaims, selectedClaimFlags, extractionUsage } = stateRef.current

    if (!extractedClaims) return

    const selected = extractedClaims.filter((_, i) => selectedClaimFlags[i])
    const userConfirmed = extractedClaims.filter((_, i) => !selectedClaimFlags[i])

    // If nothing selected, skip verification entirely
    if (selected.length === 0) {
      const results: FactCheckResult[] = userConfirmed.map((c) => ({
        claim: c.claim,
        confidence: c.confidence,
        explanation: c.explanation,
        suggestedSources: c.suggestedSources,
        webSearchUsed: false,
      }))
      setState((prev) => ({
        ...prev,
        factCheckStep: 'done',
        factCheckResults: results,
        usage: extractionUsage,
      }))
      return
    }

    setState((prev) => ({
      ...prev,
      isLoading: true,
      error: null,
      factCheckStep: 'verifying',
    }))

    try {
      const result = await factCheckVerify(content, selected)
      // Build user-confirmed entries
      const userConfirmedResults: FactCheckResult[] = userConfirmed.map((c) => ({
        claim: c.claim,
        confidence: c.confidence,
        explanation: c.explanation,
        suggestedSources: c.suggestedSources,
        webSearchUsed: false,
      }))

      // Accumulate tokens from both phases
      let totalUsage: AIToolUsage | null = null
      if (extractionUsage || result.usage) {
        totalUsage = {
          inputTokens: (extractionUsage?.inputTokens ?? 0) + (result.usage?.inputTokens ?? 0),
          outputTokens: (extractionUsage?.outputTokens ?? 0) + (result.usage?.outputTokens ?? 0),
        }
      }

      setState((prev) => ({
        ...prev,
        isLoading: false,
        factCheckStep: 'done',
        factCheckResults: [...(result.data ?? []), ...userConfirmedResults],
        usage: totalUsage,
      }))
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to verify claims'
      // Return to selecting so user can retry
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: errorMsg,
        factCheckStep: 'selecting',
      }))
    }
  }, [])

  const runLinkedIn = useCallback(async (content: JSONContent) => {
    setState((prev) => ({
      ...prev,
      activeTool: 'linkedIn',
      isLoading: true,
      error: null,
      usage: null,
      linkedInResult: null,
    }))

    try {
      const result = await analyzeForLinkedIn(content)
      setState((prev) => ({
        ...prev,
        isLoading: false,
        linkedInResult: result.data,
        usage: result.usage ?? null,
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
      usage: null,
      writeResult: null,
    }))

    try {
      const result = await writeWithAI(content, prompt)
      setState((prev) => ({
        ...prev,
        isLoading: false,
        writeResult: result.data,
        usage: result.usage ?? null,
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
        usage: null,
        tagSuggestions: null,
      }))

      try {
        const result = await tagParagraphsWithAI(content, topics, notes)
        setState((prev) => ({
          ...prev,
          isLoading: false,
          tagSuggestions: result.data,
          usage: result.usage ?? null,
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
      usage: null,
      noteTagSuggestions: null,
    }))

    try {
      const result = await suggestNoteTags(content, existingTags)
      setState((prev) => ({
        ...prev,
        isLoading: false,
        noteTagSuggestions: result.data,
        usage: result.usage ?? null,
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
    runFactCheckExtract,
    toggleClaimSelection,
    runFactCheckVerify,
    runLinkedIn,
    runWriteWithAI,
    runTagWithAI,
    runSuggestNoteTags,
    clearResults,
    setActiveTool,
  }
}
