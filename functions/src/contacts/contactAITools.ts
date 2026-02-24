/**
 * Contact AI Tools — Cloud Function callables for AI-powered CRM features.
 *
 * - getMeetingBriefing: pre-meeting briefing for linked contacts
 * - suggestCirclePlacement: AI-suggested Dunbar circle for a contact
 */

import type Anthropic from '@anthropic-ai/sdk'
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { getFirestore } from 'firebase-admin/firestore'
import { createLogger } from '../lib/logger.js'
import { loadProviderKeys } from '../agents/providerKeys.js'
import {
  CIRCLE_LABELS,
  CIRCLE_DESCRIPTIONS,
  type Contact,
  type Interaction,
  type DunbarCircle,
} from '@lifeos/agents'
import { contactRef, interactionsCollection } from './paths.js'

const log = createLogger('ContactAITools')

const DEFAULT_MODEL = 'claude-sonnet-4-5'

async function executePrompt(
  client: Anthropic,
  systemPrompt: string,
  userPrompt: string,
  maxTokens = 4096
): Promise<{ content: string; inputTokens: number; outputTokens: number }> {
  const response = await client.messages.create({
    model: DEFAULT_MODEL,
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

function extractJson(text: string, kind: 'array' | 'object' = 'object'): string | null {
  const open = kind === 'array' ? '[' : '{'
  const close = kind === 'array' ? ']' : '}'
  const start = text.indexOf(open)
  if (start === -1) return null

  let depth = 0
  let inString = false
  let escape = false

  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (escape) {
      escape = false
      continue
    }
    if (ch === '\\' && inString) {
      escape = true
      continue
    }
    if (ch === '"') {
      inString = !inString
      continue
    }
    if (inString) continue
    if (ch === open) depth++
    if (ch === close) depth--
    if (depth === 0) return text.substring(start, i + 1)
  }
  return null
}

// ─── Meeting Briefing ───────────────────────────────────────────────

export const getMeetingBriefing = onCall(
  { timeoutSeconds: 120, memory: '512MiB' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be logged in')
    }

    const userId = request.auth.uid
    const { eventId } = request.data as { eventId?: string }

    if (!eventId) {
      throw new HttpsError('invalid-argument', 'eventId is required')
    }

    const providerKeys = await loadProviderKeys(userId)
    if (!providerKeys.anthropic) {
      throw new HttpsError('failed-precondition', 'Anthropic API key not configured')
    }

    const db = getFirestore()

    // Read the calendar event
    const eventSnap = await db.doc(`users/${userId}/canonicalEvents/${eventId}`).get()
    if (!eventSnap.exists) {
      throw new HttpsError('not-found', 'Calendar event not found')
    }

    const eventData = eventSnap.data()!
    const linkedContactIds = (eventData.linkedContactIds as string[]) ?? []
    const eventTitle = (eventData.title as string) || 'Meeting'
    const eventStartMs = eventData.startMs as number

    if (linkedContactIds.length === 0) {
      return {
        tool: 'meetingBriefing',
        result: {
          contactBriefings: [],
          overallPrepNotes: 'No linked contacts found for this event.',
        },
        usage: { inputTokens: 0, outputTokens: 0 },
      }
    }

    // Read contacts and their recent interactions
    const contactProfiles: Array<{
      contact: Contact
      recentInteractions: Interaction[]
    }> = []

    for (const cid of linkedContactIds.slice(0, 10)) {
      const contactSnap = await contactRef(userId, cid).get()
      if (!contactSnap.exists) continue

      const contact = contactSnap.data() as Contact

      const interactionSnap = await interactionsCollection(userId, cid)
        .orderBy('occurredAtMs', 'desc')
        .limit(10)
        .get()

      const recentInteractions = interactionSnap.docs.map((d) => d.data() as Interaction)
      contactProfiles.push({ contact, recentInteractions })
    }

    if (contactProfiles.length === 0) {
      return {
        tool: 'meetingBriefing',
        result: {
          contactBriefings: [],
          overallPrepNotes: 'Linked contacts could not be found.',
        },
        usage: { inputTokens: 0, outputTokens: 0 },
      }
    }

    // Build prompt
    const systemPrompt = `You are a personal CRM assistant. You prepare concise meeting briefings by summarizing recent interactions with attendees. Be specific about dates, topics, and action items. Return JSON only.`

    const contactSections = contactProfiles.map(({ contact, recentInteractions }) => {
      const interactions = recentInteractions
        .map(
          (i) =>
            `- [${new Date(i.occurredAtMs).toLocaleDateString()}] ${i.type}: ${i.summary}${i.details ? ` — ${i.details.substring(0, 200)}` : ''}`
        )
        .join('\n')

      return `## ${contact.displayName}
Circle: ${CIRCLE_LABELS[contact.circle as DunbarCircle]}
${contact.company ? `Company: ${contact.company}` : ''}
${contact.relationship ? `Relationship: ${contact.relationship}` : ''}
${contact.notes ? `Notes: ${contact.notes}` : ''}

Recent interactions:
${interactions || '(none recorded)'}`
    })

    const userPrompt = `Prepare a briefing for this upcoming meeting:

**Event:** ${eventTitle}
**When:** ${new Date(eventStartMs).toLocaleString()}

**Attendees:**
${contactSections.join('\n\n')}

Return a JSON object with this structure:
{
  "contactBriefings": [
    {
      "contactId": "the contact ID",
      "displayName": "their name",
      "recentContext": "1-2 sentence summary of recent interactions",
      "talkingPoints": ["point 1", "point 2"]
    }
  ],
  "overallPrepNotes": "2-3 sentence overall preparation notes for this meeting"
}`

    try {
      const { default: AnthropicSDK } = await import('@anthropic-ai/sdk')
      const client = new AnthropicSDK({ apiKey: providerKeys.anthropic })

      const result = await executePrompt(client, systemPrompt, userPrompt, 2048)

      const json = extractJson(result.content, 'object')
      if (!json) {
        log.warn('Failed to extract JSON from briefing response')
        return {
          tool: 'meetingBriefing',
          result: {
            contactBriefings: contactProfiles.map(({ contact }) => ({
              contactId: contact.contactId,
              displayName: contact.displayName,
              recentContext: 'Unable to generate briefing.',
              talkingPoints: [],
            })),
            overallPrepNotes: result.content,
          },
          usage: { inputTokens: result.inputTokens, outputTokens: result.outputTokens },
        }
      }

      const parsed = JSON.parse(json)
      return {
        tool: 'meetingBriefing',
        result: parsed,
        usage: { inputTokens: result.inputTokens, outputTokens: result.outputTokens },
      }
    } catch (error) {
      log.error('Meeting briefing failed', error)
      throw new HttpsError('internal', 'Failed to generate meeting briefing')
    }
  }
)

// ─── Circle Suggestion ──────────────────────────────────────────────

export const suggestCirclePlacement = onCall(
  { timeoutSeconds: 60, memory: '256MiB' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be logged in')
    }

    const userId = request.auth.uid
    const { contactId } = request.data as { contactId?: string }

    if (!contactId) {
      throw new HttpsError('invalid-argument', 'contactId is required')
    }

    const providerKeys = await loadProviderKeys(userId)
    if (!providerKeys.anthropic) {
      throw new HttpsError('failed-precondition', 'Anthropic API key not configured')
    }

    // Read contact
    const contactSnap = await contactRef(userId, contactId).get()
    if (!contactSnap.exists) {
      throw new HttpsError('not-found', 'Contact not found')
    }

    const contact = contactSnap.data() as Contact

    // Read interactions
    const interactionSnap = await interactionsCollection(userId, contactId)
      .orderBy('occurredAtMs', 'desc')
      .limit(50)
      .get()

    const interactions = interactionSnap.docs.map((d) => d.data() as Interaction)

    // Compute interaction stats
    const now = Date.now()
    const DAY_MS = 24 * 60 * 60 * 1000
    const last30 = interactions.filter((i) => now - i.occurredAtMs < 30 * DAY_MS).length
    const last90 = interactions.filter((i) => now - i.occurredAtMs < 90 * DAY_MS).length
    const typeCounts: Record<string, number> = {}
    for (const i of interactions) {
      typeCounts[i.type] = (typeCounts[i.type] || 0) + 1
    }

    const circleDescriptions = Object.entries(CIRCLE_DESCRIPTIONS)
      .map(([c, desc]) => `  ${c} (${CIRCLE_LABELS[Number(c) as DunbarCircle]}): ${desc}`)
      .join('\n')

    const systemPrompt = `You are a personal CRM assistant that suggests Dunbar circle placement for contacts. Analyze interaction patterns and context to recommend the appropriate circle. Return JSON only.`

    const userPrompt = `Suggest a Dunbar circle placement for this contact:

**Contact:** ${contact.displayName}
${contact.company ? `**Company:** ${contact.company}` : ''}
${contact.title ? `**Title:** ${contact.title}` : ''}
${contact.relationship ? `**Relationship:** ${contact.relationship}` : ''}
**Current Circle:** ${contact.circle} (${CIRCLE_LABELS[contact.circle as DunbarCircle]})
**Sources:** ${contact.sources.join(', ')}
**Starred:** ${contact.starred}
${contact.tags.length > 0 ? `**Tags:** ${contact.tags.join(', ')}` : ''}
${contact.notes ? `**Notes:** ${contact.notes}` : ''}

**Interaction Stats:**
- Total interactions: ${interactions.length}
- Last 30 days: ${last30}
- Last 90 days: ${last90}
- By type: ${Object.entries(typeCounts).map(([t, c]) => `${t}: ${c}`).join(', ') || 'none'}
- Last interaction: ${contact.lastInteractionMs ? new Date(contact.lastInteractionMs).toLocaleDateString() : 'never'}
- Contact created: ${new Date(contact.createdAtMs).toLocaleDateString()}

**Dunbar Circles:**
${circleDescriptions}

Return a JSON object:
{
  "suggestedCircle": <number 0-4>,
  "currentCircle": ${contact.circle},
  "confidence": "high" | "medium" | "low",
  "reasoning": "1-2 sentence explanation"
}`

    try {
      const { default: AnthropicSDK } = await import('@anthropic-ai/sdk')
      const client = new AnthropicSDK({ apiKey: providerKeys.anthropic })

      const result = await executePrompt(client, systemPrompt, userPrompt, 512)

      const json = extractJson(result.content, 'object')
      if (!json) {
        log.warn('Failed to extract JSON from circle suggestion')
        return {
          tool: 'circleSuggestion',
          result: {
            suggestedCircle: contact.circle,
            currentCircle: contact.circle,
            confidence: 'low' as const,
            reasoning: 'Unable to generate suggestion.',
          },
          usage: { inputTokens: result.inputTokens, outputTokens: result.outputTokens },
        }
      }

      const parsed = JSON.parse(json)
      return {
        tool: 'circleSuggestion',
        result: parsed,
        usage: { inputTokens: result.inputTokens, outputTokens: result.outputTokens },
      }
    } catch (error) {
      log.error('Circle suggestion failed', error)
      throw new HttpsError('internal', 'Failed to generate circle suggestion')
    }
  }
)
