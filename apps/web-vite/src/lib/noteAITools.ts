/**
 * Note AI Tools
 *
 * AI-powered tools for note analysis and content generation.
 * These tools call the backend Cloud Function for LLM processing.
 */

import type { JSONContent } from '@tiptap/core'
import { httpsCallable, getFunctions } from 'firebase/functions'
import { jsonContentToPlainText } from './noteExport'

// ----- Types -----

export interface FactCheckResult {
  claim: string
  confidence: 'high' | 'medium' | 'low' | 'uncertain'
  explanation: string
  suggestedSources?: string[]
}

export interface LinkedInAnalysis {
  overallScore: number
  hooks: string[]
  suggestedHashtags: string[]
  quotableLines: string[]
  improvements: string[]
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
  tool: 'summarize' | 'factCheck' | 'linkedIn' | 'writeWithAI' | 'tagWithAI' | 'suggestNoteTags'
  content: string
  prompt?: string
  context?: {
    availableTopics?: Array<{ id: string; name: string }>
    availableNotes?: Array<{ id: string; title: string }>
  }
}

export interface AIToolResponse {
  tool: string
  result: unknown
  usage?: {
    inputTokens: number
    outputTokens: number
  }
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
export async function summarizeNote(content: JSONContent): Promise<string> {
  const text = extractTextForAI(content)

  if (text.length < 100) {
    return 'Note is too short to summarize. Add more content first.'
  }

  const response = await callAITool({
    tool: 'summarize',
    content: text,
  })

  return response.result as string
}

/**
 * Fact-check claims in the note
 */
export async function factCheckNote(content: JSONContent): Promise<FactCheckResult[]> {
  const text = extractTextForAI(content)

  if (text.length < 50) {
    return []
  }

  const response = await callAITool({
    tool: 'factCheck',
    content: text,
  })

  return response.result as FactCheckResult[]
}

/**
 * Analyze note for LinkedIn post potential
 */
export async function analyzeForLinkedIn(content: JSONContent): Promise<LinkedInAnalysis> {
  const text = extractTextForAI(content)

  if (text.length < 50) {
    return {
      overallScore: 0,
      hooks: [],
      suggestedHashtags: [],
      quotableLines: [],
      improvements: ['Add more content to analyze'],
    }
  }

  const response = await callAITool({
    tool: 'linkedIn',
    content: text,
  })

  return response.result as LinkedInAnalysis
}

/**
 * Generate new content based on existing note and user prompt
 */
export async function writeWithAI(content: JSONContent, prompt: string): Promise<string> {
  const text = extractTextForAI(content)

  if (!prompt.trim()) {
    throw new Error('Please provide a prompt for content generation')
  }

  const response = await callAITool({
    tool: 'writeWithAI',
    content: text,
    prompt,
  })

  return response.result as string
}

/**
 * Analyze paragraphs and suggest tags (freeform + matched entities)
 */
export async function tagParagraphsWithAI(
  content: JSONContent,
  availableTopics: Array<{ id: string; name: string }>,
  availableNotes: Array<{ id: string; title: string }>
): Promise<ParagraphTagSuggestion[]> {
  const paragraphs = extractParagraphsWithPaths(content)

  if (paragraphs.length === 0) {
    return []
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

  return response.result as ParagraphTagSuggestion[]
}

/**
 * Suggest note-level tags based on content
 */
export async function suggestNoteTags(
  content: JSONContent,
  existingTags: string[]
): Promise<string[]> {
  const text = extractTextForAI(content)

  if (text.length < 50) {
    return []
  }

  const response = await callAITool({
    tool: 'suggestNoteTags',
    content: text,
    context: {
      availableTopics: existingTags.map((t) => ({ id: t, name: t })),
    },
  })

  return response.result as string[]
}
