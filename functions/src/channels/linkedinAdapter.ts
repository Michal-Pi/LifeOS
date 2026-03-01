/**
 * LinkedIn Channel Adapter
 *
 * Implements the ChannelAdapter pattern for LinkedIn messaging.
 * Uses the unofficial Voyager API with cookie-based authentication (li_at cookie).
 *
 * Authentication: Users provide their li_at session cookie from their browser.
 * This is stored encrypted in `channelConnections` with authMethod: 'cookie'.
 *
 * Read: Fetches conversations via Voyager messaging endpoint.
 * Write: Sends messages via Voyager messaging endpoint.
 * Delete: Not supported by LinkedIn — returns false (local dismiss only).
 */

import { createLogger } from '../lib/logger.js'
import type {
  ChannelConnectionId,
  ChannelConnection,
  MessageSource,
  OutboundMessage,
} from '@lifeos/agents'
import type { RawMessage, SendMessageResult, FetchMessagesOptions } from '@lifeos/agents'
import { channelConnectionsCollection, channelConnectionRef } from '../slack/paths.js'

const log = createLogger('LinkedIn')

// ----- Voyager API Types -----

interface VoyagerConversation {
  entityUrn: string
  lastActivityAt: number
  events: VoyagerMessageEvent[]
}

interface VoyagerMessageEvent {
  entityUrn: string
  createdAt: number
  subtype: string
  eventContent?: {
    'com.linkedin.voyager.messaging.event.MessageEvent'?: {
      body: string
      subject?: string
      attributedBody?: { text: string }
    }
  }
  from?: {
    'com.linkedin.voyager.messaging.MessagingMember'?: {
      miniProfile?: {
        firstName: string
        lastName: string
        publicIdentifier: string
        entityUrn: string
      }
    }
  }
}

interface VoyagerMessagesResponse {
  elements: VoyagerConversation[]
}

interface VoyagerSendResponse {
  value?: {
    entityUrn?: string
    eventUrn?: string
  }
}

// ----- Constants -----

const VOYAGER_BASE = 'https://www.linkedin.com/voyager/api'
const VOYAGER_MESSAGES_ENDPOINT = '/messaging/conversations'
const VOYAGER_SEND_ENDPOINT = '/messaging/conversations'
const DEFAULT_HEADERS = {
  Accept: 'application/vnd.linkedin.normalized+json+2.1',
  'x-li-lang': 'en_US',
  'x-restli-protocol-version': '2.0.0',
}

// ----- Helpers -----

/**
 * Build headers with the user's li_at session cookie for Voyager API requests.
 */
function buildVoyagerHeaders(liAtCookie: string, csrfToken?: string): Record<string, string> {
  const headers: Record<string, string> = {
    ...DEFAULT_HEADERS,
    Cookie: csrfToken
      ? `li_at=${liAtCookie}; JSESSIONID=${csrfToken}`
      : `li_at=${liAtCookie}`,
  }
  if (csrfToken) {
    headers['csrf-token'] = csrfToken
  }
  return headers
}

/**
 * Extract sender name from a Voyager messaging member object.
 */
function extractSenderName(event: VoyagerMessageEvent): string {
  const member = event.from?.['com.linkedin.voyager.messaging.MessagingMember']
  if (member?.miniProfile) {
    return `${member.miniProfile.firstName} ${member.miniProfile.lastName}`
  }
  return 'Unknown'
}

/**
 * Extract sender's LinkedIn public identifier from a Voyager message event.
 */
function extractSenderProfileId(event: VoyagerMessageEvent): string | undefined {
  const member = event.from?.['com.linkedin.voyager.messaging.MessagingMember']
  return member?.miniProfile?.publicIdentifier
}

/**
 * Extract message body text from a Voyager message event.
 */
function extractMessageBody(event: VoyagerMessageEvent): string {
  const msgContent = event.eventContent?.['com.linkedin.voyager.messaging.event.MessageEvent']
  return msgContent?.attributedBody?.text ?? msgContent?.body ?? ''
}

/**
 * Extract the conversation URN ID from a full entity URN.
 * e.g., "urn:li:fs_conversation:2-..." -> "2-..."
 */
function extractConversationId(entityUrn: string): string {
  return entityUrn.replace('urn:li:fs_conversation:', '')
}

/**
 * Extract the event URN ID from a full event entity URN.
 * e.g., "urn:li:fs_event:(2-...,1234567890)" -> message ID
 */
function extractEventId(entityUrn: string): string {
  const match = entityUrn.match(/\(([^)]+)\)/)
  return match?.[1] ?? entityUrn
}

// ----- Connection Discovery -----

export interface LinkedInConnection {
  connectionId: string
  displayName: string
  liAtCookie: string
  csrfToken?: string
  lastSyncMs?: number
}

/**
 * Find all connected LinkedIn accounts for a user.
 * Reads from the unified channelConnections collection, filtering by source = 'linkedin'.
 */
export async function getLinkedInConnections(userId: string): Promise<LinkedInConnection[]> {
  const snapshot = await channelConnectionsCollection(userId)
    .where('source', '==', 'linkedin')
    .where('status', '==', 'connected')
    .get()

  const connections: LinkedInConnection[] = []

  for (const doc of snapshot.docs) {
    const data = doc.data() as ChannelConnection
    connections.push({
      connectionId: doc.id,
      displayName: data.displayName,
      liAtCookie: data.credentials.liAtCookie ?? '',
      csrfToken: data.credentials.csrfToken,
      lastSyncMs: data.lastSyncMs,
    })
  }

  return connections
}

// ----- Profile Search & Enrichment -----

export interface LinkedInSearchResult {
  publicIdentifier: string
  firstName: string
  lastName: string
  headline?: string
  profilePicture?: string
}

export interface LinkedInProfilePosition {
  title: string
  companyName: string
  startDate?: { month?: number; year?: number }
  endDate?: { month?: number; year?: number }
  current?: boolean
}

export interface LinkedInProfileData {
  firstName: string
  lastName: string
  headline?: string
  industry?: string
  location?: string
  profilePicture?: string
  positions?: LinkedInProfilePosition[]
}

/**
 * Search for LinkedIn profiles using the Voyager typeahead API.
 */
export async function searchLinkedInProfiles(
  liAtCookie: string,
  csrfToken: string | undefined,
  searchQuery: string,
  limit = 8
): Promise<LinkedInSearchResult[]> {
  const headers = buildVoyagerHeaders(liAtCookie, csrfToken)

  const params = new URLSearchParams({
    q: 'blended',
    query: searchQuery,
    count: String(limit),
    filters: 'List(resultType->PEOPLE)',
  })

  const response = await fetch(
    `${VOYAGER_BASE}/typeahead/dash/hitsV2?${params}`,
    { headers }
  )

  if (!response.ok) {
    log.warn(`Voyager search returned ${response.status}`)
    throw new Error(`LinkedIn search failed (HTTP ${response.status})`)
  }

  const data = (await response.json()) as Record<string, unknown>
  const results: LinkedInSearchResult[] = []

  // Voyager typeahead returns results in elements array
  const elements = (data.elements ?? data.included ?? []) as Array<Record<string, unknown>>
  for (const el of elements) {
    // Look for profile entities in the response — navigate nested Voyager structures
    const image = el.image as Record<string, unknown> | undefined
    const imageAttrs = image?.attributes as Array<Record<string, unknown>> | undefined
    const miniFromImage = imageAttrs?.[0]?.miniProfile as Record<string, unknown> | undefined
    const miniFromTarget = (el.targetUrn as Record<string, unknown> | undefined)?.miniProfile as Record<string, unknown> | undefined
    const miniFromResult = (el.entityResult as Record<string, unknown> | undefined)?.miniProfile as Record<string, unknown> | undefined
    const miniDirect = el.miniProfile as Record<string, unknown> | undefined

    const profile = miniFromImage ?? miniFromTarget ?? miniFromResult ?? miniDirect ?? el

    const publicId = (profile.publicIdentifier as string) ?? ''
    if (!publicId) continue

    const subtext = el.subtext as Record<string, unknown> | undefined
    const headlineObj = el.headline as Record<string, unknown> | undefined

    results.push({
      publicIdentifier: publicId,
      firstName: (profile.firstName as string) ?? '',
      lastName: (profile.lastName as string) ?? '',
      headline: (subtext?.text as string) ?? (headlineObj?.text as string) ?? (profile.occupation as string) ?? undefined,
      profilePicture: extractProfilePicture(profile as Record<string, unknown>),
    })
  }

  // Deduplicate by publicIdentifier
  const seen = new Set<string>()
  return results.filter((r) => {
    if (seen.has(r.publicIdentifier)) return false
    seen.add(r.publicIdentifier)
    return true
  })
}

/**
 * Fetch a full LinkedIn profile by public identifier using the Voyager API.
 */
export async function fetchLinkedInProfile(
  liAtCookie: string,
  csrfToken: string | undefined,
  publicIdentifier: string
): Promise<LinkedInProfileData> {
  const headers = buildVoyagerHeaders(liAtCookie, csrfToken)

  // Fetch basic profile
  const profileResponse = await fetch(
    `${VOYAGER_BASE}/identity/dash/profiles?q=memberIdentity&memberIdentity=${encodeURIComponent(publicIdentifier)}&decorationId=com.linkedin.voyager.dash.deco.identity.profile.FullProfileWithEntities-93`,
    { headers }
  )

  if (!profileResponse.ok) {
    log.warn(`Voyager profile fetch returned ${profileResponse.status} for ${publicIdentifier}`)
    throw new Error(`LinkedIn profile fetch failed (HTTP ${profileResponse.status})`)
  }

  const data = (await profileResponse.json()) as Record<string, unknown>

  // Extract profile from response
  const elements = (data.elements ?? []) as Array<Record<string, unknown>>
  const profileEl = elements[0] as Record<string, unknown> | undefined
  const included = (data.included ?? []) as Array<Record<string, unknown>>

  // Find mini profile
  const firstName = (profileEl?.firstName as string) ?? ''
  const lastName = (profileEl?.lastName as string) ?? ''
  const headline = (profileEl?.headline as string) ?? undefined
  const industry = (profileEl?.industryName as string) ?? undefined
  const locationName = ((profileEl?.locationName ?? profileEl?.geoLocationName) as string) ?? undefined
  const profilePicture = extractProfilePicture(profileEl as Record<string, unknown> | undefined)

  // Extract positions from included entities
  const positions: LinkedInProfilePosition[] = []
  for (const inc of included) {
    // Position entities have $type containing 'Position'
    const type = ((inc['$type'] ?? inc.entityUrn) as string) ?? ''
    if (
      typeof type === 'string' &&
      (type.includes('Position') || type.includes('position')) &&
      inc.title
    ) {
      const dateRange = inc.dateRange as Record<string, Record<string, number>> | undefined
      const timePeriod = inc.timePeriod as Record<string, Record<string, number>> | undefined
      const startDate = dateRange?.start ?? timePeriod?.startDate
      const endDate = dateRange?.end ?? timePeriod?.endDate
      const isCurrent = !endDate

      const companyObj = inc.company as Record<string, unknown> | undefined

      positions.push({
        title: (inc.title as string) ?? '',
        companyName: (inc.companyName as string) ?? (companyObj?.name as string) ?? '',
        startDate: startDate
          ? { month: startDate.month, year: startDate.year }
          : undefined,
        endDate: endDate
          ? { month: endDate.month, year: endDate.year }
          : undefined,
        current: isCurrent,
      })
    }
  }

  return {
    firstName,
    lastName,
    headline,
    industry,
    location: locationName,
    profilePicture,
    positions: positions.length > 0 ? positions : undefined,
  }
}

/**
 * Extract profile picture URL from a Voyager profile or miniProfile object.
 */
function extractProfilePicture(profile: Record<string, unknown> | undefined): string | undefined {
  if (!profile) return undefined

  // Try picture.rootUrl + artifact path
  const picture = profile.picture as Record<string, unknown> | undefined
  if (picture) {
    const rootUrl = picture.rootUrl as string | undefined
    const artifacts = picture.artifacts as Array<Record<string, unknown>> | undefined
    if (rootUrl && artifacts?.length) {
      // Pick the largest artifact
      const artifact = artifacts[artifacts.length - 1]
      const path = artifact?.fileIdentifyingUrlPathSegment as string | undefined
      if (path) return `${rootUrl}${path}`
    }
  }

  // Try profilePicture.displayImageReference
  const profilePicture = profile.profilePicture as Record<string, unknown> | undefined
  const displayImageRef = profilePicture?.displayImageReference as Record<string, unknown> | undefined
  const vectorImage = displayImageRef?.vectorImage as Record<string, unknown> | undefined
  if (vectorImage) {
    const rootUrl = vectorImage.rootUrl as string | undefined
    const artifacts = vectorImage.artifacts as Array<Record<string, unknown>> | undefined
    if (rootUrl && artifacts?.length) {
      const artifact = artifacts[artifacts.length - 1]
      const path = artifact?.fileIdentifyingUrlPathSegment as string | undefined
      if (path) return `${rootUrl}${path}`
    }
  }

  return undefined
}

// ----- Adapter Implementation -----

export const linkedinAdapter = {
  source: 'linkedin' as MessageSource,

  /**
   * Fetch LinkedIn messages for a specific account via the Voyager API.
   *
   * @param userId - LifeOS user ID
   * @param connectionId - Channel connection ID (from channelConnections)
   * @param options - Fetch options (since timestamp, max results)
   */
  async fetchMessages(
    userId: string,
    connectionId: ChannelConnectionId,
    options?: FetchMessagesOptions
  ): Promise<RawMessage[]> {
    const connId = connectionId as string
    const rawMessages: RawMessage[] = []

    try {
      // Look up connection credentials
      const connections = await getLinkedInConnections(userId)
      const conn = connections.find((c) => c.connectionId === connId)

      if (!conn || !conn.liAtCookie) {
        log.warn(`No valid credentials for connection ${connId}`)
        return []
      }

      const headers = buildVoyagerHeaders(conn.liAtCookie, conn.csrfToken)

      // Determine since timestamp for filtering
      const sinceMs = options?.since
        ? new Date(options.since).getTime()
        : (conn.lastSyncMs ?? Date.now() - 24 * 60 * 60 * 1000)

      const maxResults = options?.maxResults ?? 40

      // Fetch recent conversations from Voyager API
      const queryParams = new URLSearchParams({
        keyVersion: 'LEGACY_INBOX',
        count: String(maxResults),
      })

      const response = await fetch(`${VOYAGER_BASE}${VOYAGER_MESSAGES_ENDPOINT}?${queryParams}`, {
        headers,
      })

      if (!response.ok) {
        const status = response.status
        log.error(`Voyager API returned ${status} for connection ${connId}`)

        // Mark connection as expired if auth failed
        if (status === 401 || status === 403) {
          await channelConnectionRef(userId, connId).update({
            status: 'expired',
            errorMessage: `Authentication failed (HTTP ${status}). Please re-enter your li_at cookie.`,
            updatedAtMs: Date.now(),
          })
        }

        return []
      }

      const data = (await response.json()) as VoyagerMessagesResponse

      // Process conversations and extract individual messages
      for (const conversation of data.elements ?? []) {
        const conversationId = extractConversationId(conversation.entityUrn)

        for (const event of conversation.events ?? []) {
          // Only process actual messages (not reads, typing indicators, etc.)
          if (event.subtype !== 'MEMBER_TO_MEMBER') continue

          // Filter by timestamp
          if (event.createdAt < sinceMs) continue

          const body = extractMessageBody(event)
          if (!body) continue

          const senderName = extractSenderName(event)
          const senderProfileId = extractSenderProfileId(event)
          const eventId = extractEventId(event.entityUrn)

          rawMessages.push({
            id: `linkedin_${eventId}`,
            source: 'linkedin',
            accountId: connId,
            sender: senderName,
            senderEmail: senderProfileId
              ? `https://www.linkedin.com/in/${senderProfileId}`
              : undefined,
            body,
            receivedAt: new Date(event.createdAt).toISOString(),
            originalUrl: `https://www.linkedin.com/messaging/thread/${conversationId}/`,
          })
        }
      }

      // Update last sync time
      await channelConnectionRef(userId, connId).update({
        lastSyncMs: Date.now(),
        updatedAtMs: Date.now(),
      })

      log.info(`Fetched ${rawMessages.length} messages from connection ${connId}`)
    } catch (err) {
      log.error(`Failed to fetch messages for connection ${connId}`, err)
    }

    return rawMessages
  },

  /**
   * Send a message via LinkedIn Voyager messaging API.
   *
   * @param userId - LifeOS user ID
   * @param message - The outbound message to send
   */
  async sendMessage(userId: string, message: OutboundMessage): Promise<SendMessageResult> {
    const connId = message.connectionId as string

    // Look up connection credentials
    const connections = await getLinkedInConnections(userId)
    const conn = connections.find((c) => c.connectionId === connId)

    if (!conn || !conn.liAtCookie) {
      throw new Error(`No valid LinkedIn credentials for connection ${connId}`)
    }

    const headers = {
      ...buildVoyagerHeaders(conn.liAtCookie, conn.csrfToken),
      'Content-Type': 'application/json',
    }

    // Construct send payload
    // recipientId should be a LinkedIn member URN or conversation thread ID
    const payload = {
      keyVersion: 'LEGACY_INBOX',
      conversationCreate: message.threadId
        ? undefined
        : {
            recipients: [message.recipientId],
            subtype: 'MEMBER_TO_MEMBER',
          },
      body: message.body,
      ...(message.threadId ? { conversationId: message.threadId } : {}),
    }

    const endpoint = message.threadId
      ? `${VOYAGER_BASE}${VOYAGER_SEND_ENDPOINT}/${message.threadId}/events`
      : `${VOYAGER_BASE}${VOYAGER_SEND_ENDPOINT}`

    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      const status = response.status
      throw new Error(`LinkedIn send failed with HTTP ${status}`)
    }

    const result = (await response.json()) as VoyagerSendResponse
    const messageId =
      result.value?.eventUrn ?? result.value?.entityUrn ?? `linkedin_sent_${Date.now()}`

    return {
      messageId,
      threadId: message.threadId,
    }
  },

  /**
   * LinkedIn does not support programmatic message deletion.
   * Returns false to signal that only local dismissal should occur.
   */
  async deleteMessage(
    _userId: string,
    _connectionId: ChannelConnectionId,
    _messageId: string
  ): Promise<boolean> {
    return false
  },
}
