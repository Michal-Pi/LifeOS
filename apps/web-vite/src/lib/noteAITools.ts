/**
 * Note AI Tools
 *
 * AI-powered tools for note analysis and content generation.
 * These tools call the backend Cloud Function for LLM processing.
 */

import type { JSONContent } from '@tiptap/core'
import type { FactCheckClaim } from '@lifeos/agents'
import { httpsCallable, getFunctions } from 'firebase/functions'
import { jsonContentToPlainText } from './noteExport'

export type { FactCheckClaim }

// ----- Types -----

export interface FactCheckSource {
  title: string
  url: string
  snippet: string
  supports: boolean
}

export interface FactCheckResult {
  claim: string
  verdict?: 'verified' | 'likely_true' | 'disputed' | 'likely_false' | 'unverifiable'
  confidence: 'high' | 'medium' | 'low' | 'uncertain'
  explanation: string
  sources?: FactCheckSource[]
  webSearchUsed?: boolean
  suggestedSources?: string[]
}

export interface LinkedInTrendingContext {
  isTrending: boolean
  trendScore: number
  relatedNews: Array<{ title: string; url: string; date?: string }>
  relatedPosts: Array<{ title: string; url: string; snippet: string }>
}

export interface LinkedInAnalysis {
  overallScore: number
  hooks: string[]
  suggestedHashtags: string[]
  quotableLines: string[]
  improvements: string[]
  trendingContext?: LinkedInTrendingContext
  timingAdvice?: string
  competitiveAnalysis?: string
  webSearchUsed?: boolean
}

export interface ParagraphTagSuggestion {
  paragraphPath: string
  paragraphText: string
  suggestedTags: string[]
  matchedTopicIds: string[]
  matchedNoteIds: string[]
  confidence: number
}

export interface AIToolRequest {
  tool:
    | 'summarize'
    | 'factCheck'
    | 'factCheckExtract'
    | 'factCheckVerify'
    | 'linkedIn'
    | 'writeWithAI'
    | 'tagWithAI'
    | 'suggestNoteTags'
  content: string
  prompt?: string
  context?: {
    availableTopics?: Array<{ id: string; name: string }>
    availableNotes?: Array<{ id: string; title: string }>
    selectedClaims?: FactCheckClaim[]
  }
}

export interface AIToolUsage {
  inputTokens: number
  outputTokens: number
}

export interface AIToolResponse {
  tool: string
  result: unknown
  usage?: AIToolUsage
}

export interface AIToolResultWithUsage<T> {
  data: T
  usage?: AIToolUsage
}

// ----- Helper Functions -----

/**
 * Extract plain text from JSONContent for AI processing
 */
export function extractTextForAI(content: JSONContent): string {
  return jsonContentToPlainText(content)
}

/**
 * Extract paragraphs with paths from JSONContent
 */
export function extractParagraphsWithPaths(
  content: JSONContent
): Array<{ path: string; text: string; type: string }> {
  const paragraphs: Array<{ path: string; text: string; type: string }> = []

  const extractText = (node: Record<string, unknown>): string => {
    if (node.type === 'text' && typeof node.text === 'string') {
      return node.text
    }
    if (node.content && Array.isArray(node.content)) {
      return node.content.map((child) => extractText(child as Record<string, unknown>)).join(' ')
    }
    return ''
  }

  const traverse = (node: unknown, path: string[] = []): void => {
    if (typeof node !== 'object' || node === null) return

    const nodeObj = node as Record<string, unknown>
    const nodeType = nodeObj.type as string

    if (nodeType === 'paragraph' || nodeType === 'heading') {
      const text = extractText(nodeObj).trim()
      if (text.length >= 30) {
        paragraphs.push({
          path: path.join('.'),
          text: text.substring(0, 300) + (text.length > 300 ? '...' : ''),
          type: nodeType,
        })
      }
    }

    if (nodeObj.content && Array.isArray(nodeObj.content)) {
      nodeObj.content.forEach((child, index) => {
        traverse(child, [...path, index.toString()])
      })
    }
  }

  traverse(content)
  return paragraphs
}

// ----- AI Tool Functions -----

/**
 * Call the AI analysis Cloud Function
 */
async function callAITool(request: AIToolRequest): Promise<AIToolResponse> {
  const functions = getFunctions()
  const analyzeNote = httpsCallable<AIToolRequest, AIToolResponse>(functions, 'analyzeNoteWithAI')

  const result = await analyzeNote(request)
  return result.data
}

/**
 * Summarize note content
 */
export async function summarizeNote(content: JSONContent): Promise<AIToolResultWithUsage<string>> {
  const text = extractTextForAI(content)

  if (text.length < 100) {
    return { data: 'Note is too short to summarize. Add more content first.' }
  }

  const response = await callAITool({
    tool: 'summarize',
    content: text,
  })

  return { data: response.result as string, usage: response.usage }
}

/**
 * Fact-check claims in the note
 */
export async function factCheckNote(
  content: JSONContent
): Promise<AIToolResultWithUsage<FactCheckResult[]>> {
  const text = extractTextForAI(content)

  if (text.length < 50) {
    return { data: [] }
  }

  const response = await callAITool({
    tool: 'factCheck',
    content: text,
  })

  return { data: response.result as FactCheckResult[], usage: response.usage }
}

/**
 * Phase 1: Extract claims from note for interactive fact-checking
 */
export async function factCheckExtract(
  content: JSONContent
): Promise<AIToolResultWithUsage<FactCheckClaim[]>> {
  const text = extractTextForAI(content)

  if (text.length < 50) {
    return { data: [] }
  }

  const response = await callAITool({
    tool: 'factCheckExtract',
    content: text,
  })

  return { data: response.result as FactCheckClaim[], usage: response.usage }
}

/**
 * Phase 2+3: Verify selected claims with web search and synthesize results
 */
export async function factCheckVerify(
  content: JSONContent,
  selectedClaims: FactCheckClaim[]
): Promise<AIToolResultWithUsage<FactCheckResult[]>> {
  const text = extractTextForAI(content)

  const response = await callAITool({
    tool: 'factCheckVerify',
    content: text,
    context: { selectedClaims },
  })

  return { data: response.result as FactCheckResult[], usage: response.usage }
}

/**
 * Analyze note for LinkedIn post potential
 */
export async function analyzeForLinkedIn(
  content: JSONContent
): Promise<AIToolResultWithUsage<LinkedInAnalysis>> {
  const text = extractTextForAI(content)

  if (text.length < 50) {
    return {
      data: {
        overallScore: 0,
        hooks: [],
        suggestedHashtags: [],
        quotableLines: [],
        improvements: ['Add more content to analyze'],
      },
    }
  }

  const response = await callAITool({
    tool: 'linkedIn',
    content: text,
  })

  return { data: response.result as LinkedInAnalysis, usage: response.usage }
}

/**
 * Generate new content based on existing note and user prompt
 */
export async function writeWithAI(
  content: JSONContent,
  prompt: string
): Promise<AIToolResultWithUsage<string>> {
  const text = extractTextForAI(content)

  if (!prompt.trim()) {
    throw new Error('Please provide a prompt for content generation')
  }

  const response = await callAITool({
    tool: 'writeWithAI',
    content: text,
    prompt,
  })

  return { data: response.result as string, usage: response.usage }
}

/**
 * Analyze paragraphs and suggest tags (freeform + matched entities)
 */
export async function tagParagraphsWithAI(
  content: JSONContent,
  availableTopics: Array<{ id: string; name: string }>,
  availableNotes: Array<{ id: string; title: string }>
): Promise<AIToolResultWithUsage<ParagraphTagSuggestion[]>> {
  const paragraphs = extractParagraphsWithPaths(content)

  if (paragraphs.length === 0) {
    return { data: [] }
  }

  // Format paragraphs for AI analysis
  const paragraphsText = paragraphs
    .map((p, i) => `[${i}] (${p.path}): ${p.text}`)
    .join('\n\n')

  const response = await callAITool({
    tool: 'tagWithAI',
    content: paragraphsText,
    context: {
      availableTopics,
      availableNotes,
    },
  })

  return { data: response.result as ParagraphTagSuggestion[], usage: response.usage }
}

/**
 * Suggest note-level tags based on content
 */
export async function suggestNoteTags(
  content: JSONContent,
  existingTags: string[]
): Promise<AIToolResultWithUsage<string[]>> {
  const text = extractTextForAI(content)

  if (text.length < 50) {
    return { data: [] }
  }

  const response = await callAITool({
    tool: 'suggestNoteTags',
    content: text,
    context: {
      availableTopics: existingTags.map((t) => ({ id: t, name: t })),
    },
  })

  return { data: response.result as string[], usage: response.usage }
}
