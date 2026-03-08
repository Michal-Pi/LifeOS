/**
 * Message Analyzer
 *
 * AI-powered message analysis and prioritization for the mailbox system.
 * Supports multiple AI providers with automatic fallback:
 * Claude (Anthropic) → GPT (OpenAI) → Gemini (Google) → Grok (xAI)
 *
 * Uses user-provided API keys from settings only (no system secrets).
 * If no provider is configured, throws NoAPIKeyConfiguredError for frontend handling.
 */

import { createLogger } from '../lib/logger.js'
import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { getFirestore } from 'firebase-admin/firestore'
import {
  loadProviderKeys,
  getConfiguredProviders,
  NoAPIKeyConfiguredError,
  DEFAULT_MODELS,
} from '../agents/providerKeys.js'
import type { ProviderKeys } from '../agents/providerService.js'
import type {
  MessagePriority,
  MessageSource,
  MessageAnalysisRequest,
  MessageAnalysisResult,
  MailboxAIToolSettings,
  TriageCategory,
} from '@lifeos/agents'

const log = createLogger('SlackAnalyzer')
const MAX_MESSAGES_PER_ANALYSIS_BATCH = 10
const MAX_BODY_CHARS_PER_MESSAGE = 500

/**
 * Prioritized message result ready for storage
 */
export interface PrioritizedMessage {
  originalMessageId: string
  source: MessageSource
  accountId: string
  sender: string
  senderEmail?: string
  subject?: string
  snippet: string
  receivedAtMs: number
  priority: MessagePriority
  importanceScore?: number
  aiSummary: string
  requiresFollowUp: boolean
  followUpReason?: string
  originalUrl?: string
  triageCategory?: TriageCategory
  triageCategoryConfidence?: number
  /** Original To recipients (for Reply All) */
  toRecipients?: string[]
  /** Original CC recipients (for Reply All) */
  ccRecipients?: string[]
  /** Gmail label IDs (Gmail only) */
  gmailLabelIds?: string[]
}

/**
 * Raw message input for analysis
 */
export interface RawMessage {
  id: string
  source: MessageSource
  accountId: string
  sender: string
  senderEmail?: string
  subject?: string
  body: string
  receivedAt: string // ISO string
  originalUrl?: string
  /** To recipients (email channels, for Reply All) */
  toRecipients?: string[]
  /** CC recipients (email channels, for Reply All) */
  ccRecipients?: string[]
  /** Gmail label IDs (Gmail only) */
  gmailLabelIds?: string[]
}

// ----- Shared Prompts -----

const SYSTEM_PROMPT = `You are an inbox prioritization analyst for a busy professional. You analyze messages from multiple channels (Gmail, Slack, LinkedIn, WhatsApp, Telegram) and classify each by urgency, importance, and required action.

Respond with valid JSON only. No markdown formatting, no explanation text.

## Required Output Per Message
1. priority: "high" | "medium" | "low"
2. importanceScore: 0-100 integer for unified cross-channel sorting
3. requiresFollowUp: boolean
4. summary: 1-2 sentence summary
5. followUpReason: string (only when requiresFollowUp is true)
6. triageCategory: "urgent" | "important" | "fyi" | "automated"
7. triageCategoryConfidence: 0-1 float

## Priority Definitions
- HIGH: Direct asks with deadlines, revenue-impacting requests, time-sensitive decisions, escalations, messages requiring the user's specific input.
- MEDIUM: Standard work requests, questions needing answers, meeting coordination, non-urgent approvals.
- LOW: FYI messages, newsletters, automated notifications, status updates with no action needed, casual conversations.

## Channel-Specific Rules
- Gmail: Personal emails rank higher than marketing/newsletters. Thread replies where the user is directly addressed rank higher.
- Slack: DMs > @mentions in channels > channel-wide announcements without direct mention.
- LinkedIn: Direct messages from known contacts = high. Recruiter outreach = medium. Connection requests from unknowns = low. Endorsement notifications = low.
- WhatsApp: Personal messages from close contacts = high. Group messages = low unless user is mentioned by name.
- Telegram: DMs = medium-high. Group mentions = medium. Channel broadcasts/forwards = low. Bot notifications = low.

## Importance Score Bands
- 90-100: Urgent action required, time-sensitive, from key contacts.
- 70-89: Important, requires response within 24h.
- 50-69: Standard, addressable at convenience.
- 30-49: Low priority, informational or social.
- 0-29: Noise, automated, or irrelevant.

## Follow-Up Criteria
- TRUE: Asks a direct question, requests a deliverable, mentions a deadline, requires a decision, has an open thread needing input.
- FALSE: Informational only, CC'd for awareness, already resolved, no action needed.

## Triage Categories
- URGENT: Requires immediate response -- deadlines today, blocking issues, emergencies, escalations.
- IMPORTANT: Requires response but not time-critical -- standard requests, questions, coordination.
- FYI: Informational only, no response needed -- status updates, subscribed newsletters, social messages.
- AUTOMATED: Machine-generated -- receipts, shipping notifications, CI/CD alerts, marketing emails.

Respond with valid JSON only. No markdown formatting.`

/**
 * Load user's custom priority prompt from mailbox AI tool settings.
 * Returns undefined if no custom prompt is configured.
 */
async function loadCustomPriorityPrompt(userId: string): Promise<string | undefined> {
  try {
    const db = getFirestore()
    const doc = await db.doc(`users/${userId}/settings/mailboxAITools`).get()

    if (!doc.exists) {
      return undefined
    }

    const data = doc.data() as MailboxAIToolSettings
    return data.customPriorityPrompt || undefined
  } catch (error) {
    log.warn('Failed to load custom priority prompt', error as Record<string, unknown>)
    return undefined
  }
}

function buildUserPrompt(analysisRequest: MessageAnalysisRequest): string {
  return `## Messages to Analyze
${JSON.stringify(analysisRequest)}

## Task
Analyze each message and return a JSON array. Each element must match this schema exactly:
{
  "messageId": "string (the id from the input)",
  "requiresFollowUp": boolean,
  "priority": "high" | "medium" | "low",
  "importanceScore": number (0-100),
  "summary": "string (1-2 sentence summary)",
  "followUpReason": "string (only if requiresFollowUp is true, omit otherwise)",
  "triageCategory": "urgent" | "important" | "fyi" | "automated",
  "triageCategoryConfidence": number (0.0-1.0)
}

Return valid JSON only. No markdown fences, no explanation text.`
}

function summarizeBody(body: string): string {
  const normalized = body.replace(/\s+/g, ' ').trim()
  if (normalized.length <= MAX_BODY_CHARS_PER_MESSAGE) return normalized
  return `${normalized.slice(0, MAX_BODY_CHARS_PER_MESSAGE)} [truncated]`
}

function isRateLimitedError(error: unknown): boolean {
  if (!error) return false

  const err = error as Record<string, unknown>
  const status = Number(err.status ?? err.statusCode)
  if (status === 429) return true

  const message = (error instanceof Error ? error.message : String(error)).toLowerCase()
  return (
    message.includes('rate limit') ||
    message.includes('rate_limit') ||
    message.includes('too many requests') ||
    message.includes('status 429') ||
    message.includes(' 429 ')
  )
}

function parseJSONResponse(text: string): MessageAnalysisResult[] {
  let jsonText = text.trim()
  // Handle potential markdown code blocks
  if (jsonText.startsWith('```json')) {
    jsonText = jsonText.slice(7)
  }
  if (jsonText.startsWith('```')) {
    jsonText = jsonText.slice(3)
  }
  if (jsonText.endsWith('```')) {
    jsonText = jsonText.slice(0, -3)
  }
  return JSON.parse(jsonText.trim())
}

// ----- Provider-specific implementations -----

async function analyzeWithAnthropic(
  apiKey: string,
  analysisRequest: MessageAnalysisRequest,
  systemPrompt: string = SYSTEM_PROMPT
): Promise<MessageAnalysisResult[]> {
  const client = new Anthropic({ apiKey })
  const userPrompt = buildUserPrompt(analysisRequest)

  const response = await client.messages.create({
    model: DEFAULT_MODELS.anthropic,
    max_tokens: 2048,
    temperature: 0.3,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  })

  const textContent = response.content.find((block) => block.type === 'text')
  if (!textContent || textContent.type !== 'text') {
    throw new Error('No text response from Anthropic')
  }

  return parseJSONResponse(textContent.text)
}

async function analyzeWithOpenAI(
  apiKey: string,
  analysisRequest: MessageAnalysisRequest,
  systemPrompt: string = SYSTEM_PROMPT
): Promise<MessageAnalysisResult[]> {
  const client = new OpenAI({ apiKey })
  const userPrompt = buildUserPrompt(analysisRequest)

  const response = await client.chat.completions.create({
    model: DEFAULT_MODELS.openai,
    max_tokens: 2048,
    temperature: 0.3,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
  })

  const content = response.choices[0]?.message?.content
  if (!content) {
    throw new Error('No response from OpenAI')
  }

  return parseJSONResponse(content)
}

async function analyzeWithGoogle(
  apiKey: string,
  analysisRequest: MessageAnalysisRequest,
  systemPrompt: string = SYSTEM_PROMPT
): Promise<MessageAnalysisResult[]> {
  const genAI = new GoogleGenerativeAI(apiKey)
  const model = genAI.getGenerativeModel({ model: DEFAULT_MODELS.google })
  const userPrompt = buildUserPrompt(analysisRequest)

  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }],
    generationConfig: {
      maxOutputTokens: 2048,
      temperature: 0.3,
    },
  })

  const content = result.response.text()
  if (!content) {
    throw new Error('No response from Google')
  }

  return parseJSONResponse(content)
}

async function analyzeWithGrok(
  apiKey: string,
  analysisRequest: MessageAnalysisRequest,
  systemPrompt: string = SYSTEM_PROMPT
): Promise<MessageAnalysisResult[]> {
  // Grok uses OpenAI-compatible API
  const client = new OpenAI({
    apiKey,
    baseURL: 'https://api.x.ai/v1',
  })
  const userPrompt = buildUserPrompt(analysisRequest)

  const response = await client.chat.completions.create({
    model: DEFAULT_MODELS.grok,
    max_tokens: 2048,
    temperature: 0.3,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
  })

  const content = response.choices[0]?.message?.content
  if (!content) {
    throw new Error('No response from Grok')
  }

  return parseJSONResponse(content)
}

// ----- Main Analysis Function -----

/**
 * Analyze messages with the first available AI provider
 *
 * Fallback order: Anthropic → OpenAI → Google → Grok
 * Throws NoAPIKeyConfiguredError if no provider is configured
 */
async function analyzeWithFirstAvailableProvider(
  keys: ProviderKeys,
  analysisRequest: MessageAnalysisRequest,
  systemPrompt: string = SYSTEM_PROMPT
): Promise<MessageAnalysisResult[]> {
  const configuredProviders = getConfiguredProviders(keys)
  if (configuredProviders.length === 0) {
    throw new NoAPIKeyConfiguredError()
  }

  let lastError: unknown

  for (const provider of configuredProviders) {
    const apiKey = keys[provider === 'grok' ? 'grok' : provider]
    if (!apiKey) {
      continue
    }

    try {
      log.info(`Using ${provider} for message analysis`)
      switch (provider) {
        case 'anthropic':
          return await analyzeWithAnthropic(apiKey, analysisRequest, systemPrompt)
        case 'openai':
          return await analyzeWithOpenAI(apiKey, analysisRequest, systemPrompt)
        case 'google':
          return await analyzeWithGoogle(apiKey, analysisRequest, systemPrompt)
        case 'grok':
          return await analyzeWithGrok(apiKey, analysisRequest, systemPrompt)
      }
    } catch (error) {
      lastError = error

      const hasFallback = configuredProviders[configuredProviders.length - 1] !== provider
      if (isRateLimitedError(error) && hasFallback) {
        log.warn(`Provider ${provider} rate-limited, trying fallback provider`)
        continue
      }

      throw error
    }
  }

  throw lastError ?? new Error('No configured provider available')
}

/**
 * Analyze and prioritize a batch of messages using available AI provider
 *
 * Automatically falls back through providers: Claude → GPT → Gemini → Grok
 * Throws NoAPIKeyConfiguredError if no provider is configured
 *
 * @param userId - User ID to load API keys from settings
 * @param messages - Raw messages to analyze
 * @param userContext - Optional context for better analysis
 */
export async function analyzeAndPrioritizeMessages(
  userId: string,
  messages: RawMessage[],
  userContext?: {
    timezone?: string
    workHoursStart?: number
    workHoursEnd?: number
  }
): Promise<PrioritizedMessage[]> {
  if (messages.length === 0) {
    return []
  }

  // Load user's API keys from settings (no system fallbacks)
  const providerKeys = await loadProviderKeys(userId)

  // Load custom priority prompt if configured
  const customPrompt = await loadCustomPriorityPrompt(userId)
  const effectivePrompt = customPrompt || SYSTEM_PROMPT

  try {
    const analysisResults: MessageAnalysisResult[] = []

    for (let i = 0; i < messages.length; i += MAX_MESSAGES_PER_ANALYSIS_BATCH) {
      const batch = messages.slice(i, i + MAX_MESSAGES_PER_ANALYSIS_BATCH)

      const analysisRequest: MessageAnalysisRequest = {
        messages: batch.map((m) => ({
          id: m.id,
          source: m.source,
          sender: m.sender,
          subject: m.subject,
          body: summarizeBody(m.body),
          receivedAt: m.receivedAt,
        })),
        userContext: userContext?.timezone
          ? {
              timezone: userContext.timezone,
              workHoursStart: userContext.workHoursStart,
              workHoursEnd: userContext.workHoursEnd,
            }
          : undefined,
      }

      // Analyze in bounded batches to avoid provider token limits
      const batchResults = await analyzeWithFirstAvailableProvider(
        providerKeys,
        analysisRequest,
        effectivePrompt
      )
      analysisResults.push(...batchResults)
    }

    // Map analysis results to prioritized messages
    return messages.map((msg) => {
      const analysis = analysisResults.find((a) => a.messageId === msg.id)

      if (!analysis) {
        // Default to medium priority if analysis failed for this message
        return {
          originalMessageId: msg.id,
          source: msg.source,
          accountId: msg.accountId,
          sender: msg.sender,
          senderEmail: msg.senderEmail,
          subject: msg.subject,
          snippet: msg.body.slice(0, 100),
          receivedAtMs: new Date(msg.receivedAt).getTime(),
          priority: 'medium' as MessagePriority,
          aiSummary: 'Analysis unavailable',
          requiresFollowUp: false,
          originalUrl: msg.originalUrl,
          triageCategory: 'fyi' as TriageCategory,
          toRecipients: msg.toRecipients,
          ccRecipients: msg.ccRecipients,
          gmailLabelIds: msg.gmailLabelIds,
        }
      }

      return {
        originalMessageId: msg.id,
        source: msg.source,
        accountId: msg.accountId,
        sender: msg.sender,
        senderEmail: msg.senderEmail,
        subject: msg.subject,
        snippet: msg.body.slice(0, 100),
        receivedAtMs: new Date(msg.receivedAt).getTime(),
        priority: analysis.priority,
        importanceScore: analysis.importanceScore,
        aiSummary: analysis.summary,
        requiresFollowUp: analysis.requiresFollowUp,
        followUpReason: analysis.followUpReason,
        originalUrl: msg.originalUrl,
        triageCategory: analysis.triageCategory,
        triageCategoryConfidence: analysis.triageCategoryConfidence,
        toRecipients: msg.toRecipients,
        ccRecipients: msg.ccRecipients,
        gmailLabelIds: msg.gmailLabelIds,
      }
    })
  } catch (error) {
    // Re-throw NoAPIKeyConfiguredError as-is for frontend handling
    if (error instanceof NoAPIKeyConfiguredError) {
      throw error
    }

    log.error('Message analysis error', error)
    throw error
  }
}

/**
 * Analyze a single message (convenience wrapper)
 */
export async function analyzeMessage(
  userId: string,
  message: RawMessage,
  userContext?: {
    timezone?: string
    workHoursStart?: number
    workHoursEnd?: number
  }
): Promise<PrioritizedMessage> {
  const results = await analyzeAndPrioritizeMessages(userId, [message], userContext)
  return results[0]
}

/**
 * Batch analyze messages with chunking for large batches
 */
export async function batchAnalyzeMessages(
  userId: string,
  messages: RawMessage[],
  userContext?: {
    timezone?: string
    workHoursStart?: number
    workHoursEnd?: number
  },
  batchSize: number = 10
): Promise<PrioritizedMessage[]> {
  if (messages.length === 0) {
    return []
  }

  // Process in batches to avoid token limits
  const results: PrioritizedMessage[] = []

  for (let i = 0; i < messages.length; i += batchSize) {
    const batch = messages.slice(i, i + batchSize)
    const batchResults = await analyzeAndPrioritizeMessages(userId, batch, userContext)
    results.push(...batchResults)
  }

  return results
}
