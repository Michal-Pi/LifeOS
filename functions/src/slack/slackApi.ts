/**
 * Slack API Integration
 *
 * Provides functions for:
 * - Fetching direct messages since last sync
 * - Fetching channel messages from monitored channels
 * - Listing available channels for configuration
 * - User profile information
 *
 * Follows the same pattern as google/gmailApi.ts
 */

import { createLogger } from '../lib/logger.js'
import { privateSlackAccountRef, monitoredChannelsCollection } from './paths.js'

const log = createLogger('SlackAPI')

const SLACK_API_BASE = 'https://slack.com/api'

// ----- Types -----

export interface SlackError {
  code: string
  message: string
}

export interface SlackUser {
  id: string
  name: string
  realName?: string
  avatar?: string
}

export interface SlackChannel {
  id: string
  name: string
  isPrivate: boolean
  isMember: boolean
  numMembers?: number
}

export interface SlackMessage {
  messageId: string
  channelId: string
  channelName: string
  workspaceId: string
  senderName: string
  senderAvatar?: string
  text: string
  timestamp: string
  threadTs?: string
  isDirectMessage: boolean
  receivedAtMs: number
}

export interface SlackCredentials {
  botToken: string
  refreshToken?: string
  expiryDate?: string
  status: 'connected' | 'disconnected' | 'error'
}

// ----- Internal Helpers -----

function formattedError(error: { error?: string; ok?: boolean }): SlackError {
  return {
    code: error.error ?? 'unknown_error',
    message: error.error ?? 'An unknown Slack API error occurred',
  }
}

async function makeRequest<T>(
  botToken: string,
  method: 'GET' | 'POST',
  endpoint: string,
  body?: Record<string, unknown>
): Promise<T> {
  const url = `${SLACK_API_BASE}/${endpoint}`

  const options: RequestInit = {
    method,
    headers: {
      Authorization: `Bearer ${botToken}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
  }

  if (body && method === 'POST') {
    options.body = JSON.stringify(body)
  }

  const response = await fetch(url, options)
  const data = (await response.json()) as { ok: boolean; error?: string } & T

  if (!data.ok) {
    throw formattedError(data)
  }

  return data
}

/**
 * Get valid bot token for a workspace
 */
export async function getSlackBotToken(uid: string, workspaceId: string): Promise<string> {
  const credentialsSnap = await privateSlackAccountRef(uid, workspaceId).get()

  if (!credentialsSnap.exists) {
    throw { code: 'not_connected', message: 'Slack workspace not connected' } as SlackError
  }

  const credentials = credentialsSnap.data() as SlackCredentials

  if (credentials.status !== 'connected') {
    throw {
      code: 'connection_error',
      message: `Slack connection status: ${credentials.status}`,
    } as SlackError
  }

  if (!credentials.botToken) {
    throw { code: 'missing_token', message: 'Bot token not found' } as SlackError
  }

  // TODO: Implement token refresh if using rotating tokens
  // For now, bot tokens don't expire in classic OAuth

  return credentials.botToken
}

// ----- Public API Functions -----

/**
 * Test the Slack connection by calling auth.test
 */
export async function testConnection(
  uid: string,
  workspaceId: string
): Promise<{ teamId: string; teamName: string; userId: string; botId: string }> {
  const botToken = await getSlackBotToken(uid, workspaceId)

  const response = await makeRequest<{
    team_id: string
    team: string
    user_id: string
    bot_id: string
  }>(botToken, 'POST', 'auth.test')

  return {
    teamId: response.team_id,
    teamName: response.team,
    userId: response.user_id,
    botId: response.bot_id,
  }
}

/**
 * List all conversations (channels + DMs) the bot can access
 */
export async function listConversations(
  uid: string,
  workspaceId: string,
  options: {
    types?: string // 'public_channel,private_channel,mpim,im'
    limit?: number
    cursor?: string
  } = {}
): Promise<{ channels: SlackChannel[]; nextCursor?: string }> {
  const botToken = await getSlackBotToken(uid, workspaceId)

  const params = new URLSearchParams()
  params.set('types', options.types ?? 'public_channel,private_channel')
  params.set('limit', String(options.limit ?? 200))
  params.set('exclude_archived', 'true')
  if (options.cursor) {
    params.set('cursor', options.cursor)
  }

  const response = await makeRequest<{
    channels: Array<{
      id: string
      name: string
      is_private: boolean
      is_member: boolean
      num_members?: number
    }>
    response_metadata?: { next_cursor?: string }
  }>(botToken, 'GET', `conversations.list?${params.toString()}`)

  return {
    channels: response.channels.map((ch) => ({
      id: ch.id,
      name: ch.name,
      isPrivate: ch.is_private,
      isMember: ch.is_member,
      numMembers: ch.num_members,
    })),
    nextCursor: response.response_metadata?.next_cursor || undefined,
  }
}

/**
 * List all available channels for user to configure in Settings
 */
export async function listAvailableChannels(
  uid: string,
  workspaceId: string
): Promise<SlackChannel[]> {
  const allChannels: SlackChannel[] = []
  let cursor: string | undefined

  do {
    const result = await listConversations(uid, workspaceId, {
      types: 'public_channel,private_channel',
      limit: 200,
      cursor,
    })
    allChannels.push(...result.channels)
    cursor = result.nextCursor
  } while (cursor)

  // Only return channels the bot is a member of
  return allChannels.filter((ch) => ch.isMember)
}

/**
 * List direct message conversations
 */
export async function listDirectMessageConversations(
  uid: string,
  workspaceId: string
): Promise<Array<{ channelId: string; userId: string }>> {
  const botToken = await getSlackBotToken(uid, workspaceId)

  const params = new URLSearchParams()
  params.set('types', 'im')
  params.set('limit', '200')

  const response = await makeRequest<{
    channels: Array<{ id: string; user: string }>
  }>(botToken, 'GET', `conversations.list?${params.toString()}`)

  return response.channels.map((ch) => ({
    channelId: ch.id,
    userId: ch.user,
  }))
}

/**
 * Get user profile information
 */
export async function getUserInfo(
  uid: string,
  workspaceId: string,
  slackUserId: string
): Promise<SlackUser> {
  const botToken = await getSlackBotToken(uid, workspaceId)

  const response = await makeRequest<{
    user: {
      id: string
      name: string
      real_name?: string
      profile?: { image_48?: string }
    }
  }>(botToken, 'GET', `users.info?user=${slackUserId}`)

  return {
    id: response.user.id,
    name: response.user.name,
    realName: response.user.real_name,
    avatar: response.user.profile?.image_48,
  }
}

/**
 * Fetch conversation history (messages) for a channel or DM
 */
export async function getConversationHistory(
  uid: string,
  workspaceId: string,
  channelId: string,
  options: {
    oldest?: string // Unix timestamp string
    latest?: string
    limit?: number
    cursor?: string
  } = {}
): Promise<{
  messages: Array<{
    ts: string
    text: string
    user?: string
    thread_ts?: string
    subtype?: string
  }>
  nextCursor?: string
}> {
  const botToken = await getSlackBotToken(uid, workspaceId)

  const params = new URLSearchParams()
  params.set('channel', channelId)
  params.set('limit', String(options.limit ?? 100))
  if (options.oldest) params.set('oldest', options.oldest)
  if (options.latest) params.set('latest', options.latest)
  if (options.cursor) params.set('cursor', options.cursor)

  const response = await makeRequest<{
    messages: Array<{
      ts: string
      text: string
      user?: string
      thread_ts?: string
      subtype?: string
    }>
    response_metadata?: { next_cursor?: string }
  }>(botToken, 'GET', `conversations.history?${params.toString()}`)

  return {
    messages: response.messages,
    nextCursor: response.response_metadata?.next_cursor || undefined,
  }
}

/**
 * Fetch all direct messages since last sync
 */
export async function listSlackDirectMessages(
  uid: string,
  workspaceId: string,
  sinceTimestamp: number // Unix timestamp in seconds
): Promise<SlackMessage[]> {
  // Get all DM conversations
  const dmConversations = await listDirectMessageConversations(uid, workspaceId)

  const allMessages: SlackMessage[] = []
  const userCache = new Map<string, SlackUser>()

  // Fetch messages from each DM
  for (const dm of dmConversations) {
    try {
      const history = await getConversationHistory(uid, workspaceId, dm.channelId, {
        oldest: String(sinceTimestamp),
        limit: 100,
      })

      for (const msg of history.messages) {
        // Skip system messages
        if (msg.subtype) continue

        // Get sender info (with caching)
        let sender: SlackUser | undefined
        if (msg.user) {
          if (userCache.has(msg.user)) {
            sender = userCache.get(msg.user)
          } else {
            try {
              sender = await getUserInfo(uid, workspaceId, msg.user)
              userCache.set(msg.user, sender)
            } catch {
              // Continue without sender info
            }
          }
        }

        allMessages.push({
          messageId: `${workspaceId}-${dm.channelId}-${msg.ts}`,
          channelId: dm.channelId,
          channelName: sender?.realName ?? sender?.name ?? 'Direct Message',
          workspaceId,
          senderName: sender?.realName ?? sender?.name ?? 'Unknown',
          senderAvatar: sender?.avatar,
          text: msg.text,
          timestamp: msg.ts,
          threadTs: msg.thread_ts,
          isDirectMessage: true,
          receivedAtMs: parseFloat(msg.ts) * 1000,
        })
      }
    } catch (error) {
      log.error(`Failed to fetch DM history for ${dm.channelId}`, error)
      // Continue with other DMs
    }
  }

  return allMessages.sort((a, b) => b.receivedAtMs - a.receivedAtMs)
}

/**
 * Fetch messages from user-configured channels
 */
export async function listSlackChannelMessages(
  uid: string,
  workspaceId: string,
  sinceTimestamp: number // Unix timestamp in seconds
): Promise<SlackMessage[]> {
  // Get monitored channels from Firestore
  const channelsSnap = await monitoredChannelsCollection(uid, workspaceId).get()

  if (channelsSnap.empty) {
    return []
  }

  const allMessages: SlackMessage[] = []
  const userCache = new Map<string, SlackUser>()

  for (const doc of channelsSnap.docs) {
    const channelData = doc.data() as { channelId: string; channelName: string; isPrivate: boolean }

    try {
      const history = await getConversationHistory(uid, workspaceId, channelData.channelId, {
        oldest: String(sinceTimestamp),
        limit: 100,
      })

      for (const msg of history.messages) {
        // Skip system messages
        if (msg.subtype) continue

        // Get sender info (with caching)
        let sender: SlackUser | undefined
        if (msg.user) {
          if (userCache.has(msg.user)) {
            sender = userCache.get(msg.user)
          } else {
            try {
              sender = await getUserInfo(uid, workspaceId, msg.user)
              userCache.set(msg.user, sender)
            } catch {
              // Continue without sender info
            }
          }
        }

        allMessages.push({
          messageId: `${workspaceId}-${channelData.channelId}-${msg.ts}`,
          channelId: channelData.channelId,
          channelName: `#${channelData.channelName}`,
          workspaceId,
          senderName: sender?.realName ?? sender?.name ?? 'Unknown',
          senderAvatar: sender?.avatar,
          text: msg.text,
          timestamp: msg.ts,
          threadTs: msg.thread_ts,
          isDirectMessage: false,
          receivedAtMs: parseFloat(msg.ts) * 1000,
        })
      }
    } catch (error) {
      log.error(`Failed to fetch channel history for ${channelData.channelId}`, error)
      // Continue with other channels
    }
  }

  return allMessages.sort((a, b) => b.receivedAtMs - a.receivedAtMs)
}

/**
 * Fetch all Slack messages (DMs + monitored channels) since last sync
 */
export async function fetchAllSlackMessages(
  uid: string,
  workspaceId: string,
  sinceTimestamp: number
): Promise<SlackMessage[]> {
  const [dmMessages, channelMessages] = await Promise.all([
    listSlackDirectMessages(uid, workspaceId, sinceTimestamp),
    listSlackChannelMessages(uid, workspaceId, sinceTimestamp),
  ])

  return [...dmMessages, ...channelMessages].sort((a, b) => b.receivedAtMs - a.receivedAtMs)
}
