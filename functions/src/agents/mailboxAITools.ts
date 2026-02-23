/**
 * Mailbox AI Tools Functions
 *
 * Cloud Functions for AI-powered mailbox tools:
 * - Response Draft: Generate reply drafts matching recipient tone
 * - Mailbox Cleanup: Recommend bulk actions (archive, snooze, unsubscribe)
 * - Sender Research: Build detailed SenderPersona profiles
 */

import type Anthropic from '@anthropic-ai/sdk'
import {
  DEFAULT_MAILBOX_AI_TOOLS,
  MODEL_PRICING,
  type MailboxAIToolSettings,
  type MailboxAIToolId,
  type ResponseDraftResult,
  type CleanupRecommendation,
  type SenderPersona,
  type MessageSource,
} from '@lifeos/agents'
import { getFirestore } from 'firebase-admin/firestore'
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { createLogger } from '../lib/logger.js'
import { loadProviderKeys } from './providerKeys.js'

const log = createLogger('MailboxAITools')

// ----- Types -----

interface MailboxAIToolRequest {
  tool: MailboxAIToolId
  // responseDraft params
  messageId?: string
  messageBody?: string
  senderName?: string
  senderPersona?: Partial<SenderPersona>
  toneOverride?: string
  messageSource?: MessageSource
  // mailboxCleanup params
  messageIds?: string[]
  messages?: Array<{
    id: string
    source: MessageSource
    sender: string
    subject?: string
    snippet: string
    priority?: string
  }>
  // senderResearch params
  senderEmail?: string
  linkedinUrl?: string
  existingMessages?: string[]
}

interface MailboxAIToolResponse {
  tool: string
  result: ResponseDraftResult | CleanupRecommendation[] | Partial<SenderPersona>
  usage?: {
    inputTokens: number
    outputTokens: number
  }
}

interface ToolResult<T> {
  data: T
  inputTokens: number
  outputTokens: number
}

// ----- Helper Functions -----

/**
 * Load user's mailbox AI tool settings from Firestore
 */
async function loadMailboxAIToolSettings(userId: string): Promise<MailboxAIToolSettings> {
  const db = getFirestore()
  const doc = await db.doc(`users/${userId}/settings/mailboxAITools`).get()

  if (!doc.exists) {
    return {
      tools: { ...DEFAULT_MAILBOX_AI_TOOLS },
      version: 1,
      updatedAtMs: Date.now(),
    }
  }

  const data = doc.data() as MailboxAIToolSettings

  // Merge with defaults to ensure all tools are present
  const mergedTools = { ...DEFAULT_MAILBOX_AI_TOOLS }
  for (const [toolId, config] of Object.entries(data.tools || {})) {
    mergedTools[toolId as MailboxAIToolId] = {
      ...DEFAULT_MAILBOX_AI_TOOLS[toolId as MailboxAIToolId],
      ...config,
    }
  }

  return {
    ...data,
    tools: mergedTools,
  }
}

const DEFAULT_MODEL = 'claude-sonnet-4-5'

function resolveModelName(modelName: string): string {
  if (MODEL_PRICING[modelName]) return modelName
  log.warn('Unknown model, falling back to default', { modelName, fallback: DEFAULT_MODEL })
  return DEFAULT_MODEL
}

/**
 * Execute a prompt with Claude
 */
async function executePrompt(
  client: Anthropic,
  systemPrompt: string,
  userPrompt: string,
  modelName = DEFAULT_MODEL,
  maxTokens = 4096
): Promise<{ content: string; inputTokens: number; outputTokens: number }> {
  const model = resolveModelName(modelName)
  const response = await client.messages.create({
    model,
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  })

  const textContent = response.content.find((c) => c.type === 'text')
  const content = textContent?.type === 'text' ? textContent.text : ''

  return {
    content,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  }
}

/**
 * Extract JSON from AI response, handling markdown code blocks
 */
function extractJson(content: string): string | null {
  // Try to extract from markdown code block first
  const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (codeBlockMatch) {
    return codeBlockMatch[1].trim()
  }

  // Try to find raw JSON array
  const arrayMatch = content.match(/\[[\s\S]*\]/)
  if (arrayMatch) {
    return arrayMatch[0]
  }

  // Try to find raw JSON object
  const objectMatch = content.match(/\{[\s\S]*\}/)
  if (objectMatch) {
    return objectMatch[0]
  }

  return null
}

// ----- Tool Implementations -----

/**
 * Generate a response draft for a message
 */
async function responseDraft(
  client: Anthropic,
  data: MailboxAIToolRequest,
  toolSettings: MailboxAIToolSettings
): Promise<ToolResult<ResponseDraftResult>> {
  const config = toolSettings.tools.responseDraft

  // Build context sections
  const contextParts: string[] = []

  if (data.senderName) {
    contextParts.push(`Sender: ${data.senderName}`)
  }

  if (data.messageSource) {
    contextParts.push(`Channel: ${data.messageSource}`)
  }

  if (data.senderPersona) {
    const persona = data.senderPersona
    const personaParts: string[] = []
    if (persona.title) personaParts.push(`Title: ${persona.title}`)
    if (persona.company) personaParts.push(`Company: ${persona.company}`)
    if (persona.communicationStyle)
      personaParts.push(`Communication style: ${persona.communicationStyle}`)
    if (persona.languageProfile) {
      const lp = persona.languageProfile
      personaParts.push(`Formality: ${lp.formalityLevel}, Vocabulary: ${lp.vocabularyComplexity}`)
      if (lp.speakingStyle) personaParts.push(`Speaking style: ${lp.speakingStyle}`)
    }
    if (personaParts.length > 0) {
      contextParts.push(`\nSender Persona:\n${personaParts.join('\n')}`)
    }
  }

  if (data.toneOverride) {
    contextParts.push(`\nUser's requested tone: ${data.toneOverride}`)
  }

  const userPrompt = `Generate a reply to the following message.

${contextParts.length > 0 ? contextParts.join('\n') + '\n' : ''}
Original message:
${data.messageBody}

Output ONLY valid JSON matching the specified structure.`

  const result = await executePrompt(
    client,
    config.systemPrompt,
    userPrompt,
    config.modelName,
    config.maxTokens
  )

  try {
    const jsonStr = extractJson(result.content)
    if (jsonStr) {
      const parsed = JSON.parse(jsonStr) as ResponseDraftResult

      // Validate required fields
      if (!parsed.body) {
        throw new Error('Missing required field: body')
      }

      return {
        data: parsed,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
      }
    }

    throw new Error('No JSON found in response')
  } catch (error) {
    log.error('Failed to parse responseDraft response', { error, content: result.content })
    // Return the raw content as the body
    return {
      data: {
        body: result.content,
        tone: 'professional',
      },
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
    }
  }
}

/**
 * Analyze messages and recommend cleanup actions
 */
async function mailboxCleanup(
  client: Anthropic,
  data: MailboxAIToolRequest,
  toolSettings: MailboxAIToolSettings
): Promise<ToolResult<CleanupRecommendation[]>> {
  const config = toolSettings.tools.mailboxCleanup

  const messageSummaries = (data.messages || [])
    .map(
      (m) =>
        `- ID: ${m.id} | Source: ${m.source} | From: ${m.sender}${m.subject ? ` | Subject: ${m.subject}` : ''} | Priority: ${m.priority || 'unknown'}\n  Snippet: ${m.snippet}`
    )
    .join('\n')

  const userPrompt = `Analyze these ${(data.messages || []).length} messages and recommend actions for each:

${messageSummaries}

Output ONLY valid JSON array matching the specified format.`

  const result = await executePrompt(
    client,
    config.systemPrompt,
    userPrompt,
    config.modelName,
    config.maxTokens
  )

  try {
    const jsonStr = extractJson(result.content)
    if (jsonStr) {
      const parsed = JSON.parse(jsonStr) as CleanupRecommendation[]

      // Validate each recommendation
      const validActions = new Set(['archive', 'snooze', 'unsubscribe', 'keep'])
      const validRecommendations = parsed.filter(
        (r) => r.messageId && validActions.has(r.action) && r.reason
      )

      return {
        data: validRecommendations,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
      }
    }

    throw new Error('No JSON found in response')
  } catch (error) {
    log.error('Failed to parse mailboxCleanup response', { error, content: result.content })
    return {
      data: [],
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
    }
  }
}

/**
 * Research a sender and build a SenderPersona
 */
async function senderResearch(
  client: Anthropic,
  data: MailboxAIToolRequest,
  toolSettings: MailboxAIToolSettings,
  userId: string
): Promise<ToolResult<Partial<SenderPersona>>> {
  const config = toolSettings.tools.senderResearch

  const contextParts: string[] = []

  if (data.senderName) {
    contextParts.push(`Name: ${data.senderName}`)
  }
  if (data.senderEmail) {
    contextParts.push(`Email: ${data.senderEmail}`)
  }
  if (data.linkedinUrl) {
    contextParts.push(`LinkedIn: ${data.linkedinUrl}`)
  }

  if (data.existingMessages && data.existingMessages.length > 0) {
    contextParts.push(
      `\nExisting messages from this sender:\n${data.existingMessages.map((m, i) => `${i + 1}. ${m}`).join('\n')}`
    )
  }

  const userPrompt = `Research this sender and build a comprehensive persona profile:

${contextParts.join('\n')}

Output ONLY valid JSON matching the specified SenderPersona structure.`

  const result = await executePrompt(
    client,
    config.systemPrompt,
    userPrompt,
    config.modelName,
    config.maxTokens
  )

  try {
    const jsonStr = extractJson(result.content)
    if (jsonStr) {
      const parsed = JSON.parse(jsonStr) as Partial<SenderPersona>

      // Ensure arrays have defaults
      const persona: Partial<SenderPersona> = {
        ...parsed,
        name: parsed.name || data.senderName || 'Unknown',
        email: parsed.email || data.senderEmail,
        linkedinUrl: parsed.linkedinUrl || data.linkedinUrl,
        topTopics: parsed.topTopics || [],
        notableQuotes: parsed.notableQuotes || [],
        keyInterests: parsed.keyInterests || [],
        suggestedTalkingPoints: parsed.suggestedTalkingPoints || [],
        researchedAtMs: Date.now(),
      }

      // Optionally persist to Firestore
      if (data.senderName || data.senderEmail) {
        try {
          const db = getFirestore()
          const personaRef = db.collection(`users/${userId}/senderPersonas`).doc()
          await personaRef.set({
            ...persona,
            personaId: `sender_persona:${personaRef.id}`,
            userId,
            createdAtMs: Date.now(),
            updatedAtMs: Date.now(),
          })
        } catch (persistError) {
          // Non-fatal: log but don't fail the tool
          log.warn('Failed to persist sender persona', { error: persistError })
        }
      }

      return {
        data: persona,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
      }
    }

    throw new Error('No JSON found in response')
  } catch (error) {
    log.error('Failed to parse senderResearch response', { error, content: result.content })
    return {
      data: {
        name: data.senderName || 'Unknown',
        email: data.senderEmail,
        topTopics: [],
        notableQuotes: [],
        keyInterests: [],
        suggestedTalkingPoints: [],
        researchedAtMs: Date.now(),
      },
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
    }
  }
}

// ----- Main Cloud Function -----

export const mailboxAITool = onCall(
  {
    timeoutSeconds: 120,
    memory: '512MiB',
  },
  async (request): Promise<MailboxAIToolResponse> => {
    // Verify authentication
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated')
    }

    const userId = request.auth.uid
    const data = request.data as MailboxAIToolRequest

    if (!data.tool) {
      throw new HttpsError('invalid-argument', 'Missing required field: tool')
    }

    // Load API keys from user settings
    const providerKeys = await loadProviderKeys(userId)

    if (!providerKeys.anthropic) {
      throw new HttpsError(
        'failed-precondition',
        'Anthropic API key not configured. Please add your API key in Settings > Model Settings.'
      )
    }

    // Initialize Anthropic client (lazy-loaded to avoid init-time SDK import)
    const { default: AnthropicSDK } = await import('@anthropic-ai/sdk')
    const client = new AnthropicSDK({
      apiKey: providerKeys.anthropic,
    })

    // Load user's mailbox AI tool settings
    const toolSettings = await loadMailboxAIToolSettings(userId)

    // Check if the requested tool is enabled
    const toolConfig = toolSettings.tools[data.tool]
    if (!toolConfig.enabled) {
      throw new HttpsError('failed-precondition', `The "${toolConfig.name}" tool is disabled`)
    }

    let result: ResponseDraftResult | CleanupRecommendation[] | Partial<SenderPersona>
    let inputTokens = 0
    let outputTokens = 0

    try {
      switch (data.tool) {
        case 'responseDraft': {
          if (!data.messageBody) {
            throw new HttpsError(
              'invalid-argument',
              'Response Draft requires the original message body'
            )
          }
          const draftResult = await responseDraft(client, data, toolSettings)
          result = draftResult.data
          inputTokens = draftResult.inputTokens
          outputTokens = draftResult.outputTokens
          break
        }

        case 'mailboxCleanup': {
          if (!data.messages || data.messages.length === 0) {
            throw new HttpsError(
              'invalid-argument',
              'Mailbox Cleanup requires at least one message'
            )
          }
          const cleanupResult = await mailboxCleanup(client, data, toolSettings)
          result = cleanupResult.data
          inputTokens = cleanupResult.inputTokens
          outputTokens = cleanupResult.outputTokens
          break
        }

        case 'senderResearch': {
          if (!data.senderName) {
            throw new HttpsError('invalid-argument', 'Sender Research requires a sender name')
          }
          const researchResult = await senderResearch(client, data, toolSettings, userId)
          result = researchResult.data
          inputTokens = researchResult.inputTokens
          outputTokens = researchResult.outputTokens
          break
        }

        default:
          throw new HttpsError('invalid-argument', `Unknown tool: ${data.tool}`)
      }

      return {
        tool: data.tool,
        result,
        usage: {
          inputTokens,
          outputTokens,
        },
      }
    } catch (error) {
      if (error instanceof HttpsError) {
        throw error
      }
      log.error('Tool execution failed', { error })
      throw new HttpsError('internal', 'Failed to process mailbox AI tool')
    }
  }
)
