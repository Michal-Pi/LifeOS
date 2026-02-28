/**
 * Telegram Channel Adapter
 *
 * Implements the ChannelAdapter pattern for Telegram messaging.
 * Uses the official Telegram Bot API for reading and sending messages.
 *
 * Authentication: Bot token from BotFather, stored in `channelConnections`
 * with authMethod: 'bot_token'.
 *
 * Read: Uses getUpdates (long polling) or reads from a webhook-fed Firestore cache.
 *       In production, a webhook endpoint writes incoming messages to Firestore;
 *       this adapter reads from that cache.
 * Write: Sends messages via sendMessage API. Deletes via deleteMessage API.
 */

import { createLogger } from '../lib/logger.js'
import { getFirestore } from 'firebase-admin/firestore'
import type {
  ChannelConnectionId,
  ChannelConnection,
  MessageSource,
  OutboundMessage,
} from '@lifeos/agents'
import type { RawMessage, SendMessageResult, FetchMessagesOptions } from '@lifeos/agents'
import { channelConnectionsCollection, channelConnectionRef } from '../slack/paths.js'

const log = createLogger('Telegram')

// ----- Telegram Bot API Types -----

interface TelegramUser {
  id: number
  is_bot: boolean
  first_name: string
  last_name?: string
  username?: string
}

interface TelegramChat {
  id: number
  type: 'private' | 'group' | 'supergroup' | 'channel'
  title?: string
  username?: string
  first_name?: string
  last_name?: string
}

interface TelegramMessage {
  message_id: number
  from?: TelegramUser
  chat: TelegramChat
  date: number // Unix timestamp in seconds
  text?: string
  caption?: string
  photo?: unknown[]
  document?: unknown
  video?: unknown
  audio?: unknown
  voice?: unknown
}

interface TelegramUpdate {
  update_id: number
  message?: TelegramMessage
}

interface TelegramGetUpdatesResponse {
  ok: boolean
  result: TelegramUpdate[]
}

interface TelegramSendMessageResponse {
  ok: boolean
  result?: TelegramMessage
  description?: string
}

interface TelegramDeleteMessageResponse {
  ok: boolean
  result?: boolean
  description?: string
}

/**
 * Cached Telegram message stored in Firestore by the webhook endpoint.
 * Path: users/{userId}/telegramMessages/{messageId}
 */
interface TelegramCachedMessage {
  messageId: string
  connectionId: string
  chatId: number
  chatType: string
  chatTitle?: string
  senderId: number
  senderName: string
  senderUsername?: string
  body: string
  receivedAtMs: number
  hasMedia: boolean
  mediaType?: string
  /** The Telegram message_id (needed for deletion) */
  telegramMessageId: number
}

// ----- Constants -----

const TELEGRAM_API_BASE = 'https://api.telegram.org'

/** Telegram allows deleting messages within 48 hours for bots */
const DELETE_WINDOW_MS = 48 * 60 * 60 * 1000

// ----- Helpers -----

/**
 * Build the Telegram Bot API URL for a given method.
 */
function apiUrl(botToken: string, method: string): string {
  return `${TELEGRAM_API_BASE}/bot${botToken}/${method}`
}

/**
 * Format a sender name from Telegram user data.
 */
function formatSenderName(user: TelegramUser): string {
  if (user.last_name) {
    return `${user.first_name} ${user.last_name}`
  }
  return user.first_name
}

/**
 * Extract text content from a Telegram message, including captions.
 */
function extractTextContent(msg: TelegramMessage): string {
  if (msg.text) return msg.text
  if (msg.caption) return `[media] ${msg.caption}`
  if (msg.photo) return '[photo]'
  if (msg.document) return '[document]'
  if (msg.video) return '[video]'
  if (msg.audio) return '[audio]'
  if (msg.voice) return '[voice message]'
  return ''
}

/**
 * Firestore collection path for cached Telegram messages.
 */
function telegramMessagesCollection(userId: string) {
  return getFirestore().collection(`users/${userId}/telegramMessages`)
}

// ----- Connection Discovery -----

export interface TelegramConnection {
  connectionId: string
  displayName: string
  botToken: string
  botUsername?: string
  /** Offset for getUpdates long polling */
  lastUpdateId?: number
  lastSyncMs?: number
}

/**
 * Find all connected Telegram bot accounts for a user.
 * Reads from the unified channelConnections collection, filtering by source = 'telegram'.
 */
export async function getTelegramConnections(userId: string): Promise<TelegramConnection[]> {
  const snapshot = await channelConnectionsCollection(userId)
    .where('source', '==', 'telegram')
    .where('status', '==', 'connected')
    .get()

  const connections: TelegramConnection[] = []

  for (const doc of snapshot.docs) {
    const data = doc.data() as ChannelConnection
    connections.push({
      connectionId: doc.id,
      displayName: data.displayName,
      botToken: data.credentials.botToken ?? '',
      botUsername: data.credentials.botUsername,
      lastUpdateId: data.config?.lastUpdateId as number | undefined,
      lastSyncMs: data.lastSyncMs,
    })
  }

  return connections
}

// ----- Adapter Implementation -----

export const telegramAdapter = {
  source: 'telegram' as MessageSource,

  /**
   * Fetch Telegram messages.
   *
   * Strategy:
   * 1. If the Firestore cache (telegramMessages) has recent messages, read from it
   *    (populated by webhook endpoint in production).
   * 2. If the cache is empty, fall back to getUpdates long polling directly.
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
      const connections = await getTelegramConnections(userId)
      const conn = connections.find((c) => c.connectionId === connId)

      if (!conn || !conn.botToken) {
        log.warn(`No valid credentials for connection ${connId}`)
        return []
      }

      const sinceMs = options?.since
        ? new Date(options.since).getTime()
        : (conn.lastSyncMs ?? Date.now() - 24 * 60 * 60 * 1000)

      const maxResults = options?.maxResults ?? 50

      // Try reading from Firestore cache first (webhook-fed)
      const cachedSnapshot = await telegramMessagesCollection(userId)
        .where('connectionId', '==', connId)
        .where('receivedAtMs', '>', sinceMs)
        .orderBy('receivedAtMs', 'desc')
        .limit(maxResults)
        .get()

      if (!cachedSnapshot.empty) {
        // Use cached messages
        log.info(`Found ${cachedSnapshot.size} cached messages for connection ${connId}`)

        for (const doc of cachedSnapshot.docs) {
          const msg = doc.data() as TelegramCachedMessage

          const senderDisplay =
            msg.chatType !== 'private' && msg.chatTitle
              ? `${msg.senderName} (${msg.chatTitle})`
              : msg.senderName

          rawMessages.push({
            id: `telegram_${msg.messageId}`,
            source: 'telegram',
            accountId: connId,
            sender: senderDisplay,
            senderEmail: msg.senderUsername ? `https://t.me/${msg.senderUsername}` : undefined,
            body: msg.body,
            receivedAt: new Date(msg.receivedAtMs).toISOString(),
            originalUrl: msg.senderUsername ? `https://t.me/${msg.senderUsername}` : undefined,
          })
        }
      } else {
        // Fall back to getUpdates long polling
        log.info('No cached messages, falling back to getUpdates')
        const updates = await fetchUpdatesFromApi(conn, sinceMs, maxResults)
        rawMessages.push(...updates.map((msg) => normalizeUpdate(msg, connId)))

        // Store the last update_id for next poll
        if (updates.length > 0) {
          const maxUpdateId = Math.max(...updates.map((u) => u.updateId))
          await channelConnectionRef(userId, connId).update({
            'config.lastUpdateId': maxUpdateId + 1,
            updatedAtMs: Date.now(),
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
   * Send a message via the Telegram Bot API.
   *
   * @param userId - LifeOS user ID
   * @param message - The outbound message to send
   */
  async sendMessage(userId: string, message: OutboundMessage): Promise<SendMessageResult> {
    const connId = message.connectionId as string

    // Look up connection credentials
    const connections = await getTelegramConnections(userId)
    const conn = connections.find((c) => c.connectionId === connId)

    if (!conn || !conn.botToken) {
      throw new Error(`No valid Telegram credentials for connection ${connId}`)
    }

    const payload: Record<string, unknown> = {
      chat_id: message.recipientId,
      text: message.body,
      parse_mode: 'HTML',
    }

    // Support reply threading
    if (message.inReplyTo) {
      payload.reply_to_message_id = parseInt(message.inReplyTo, 10)
    }

    const response = await fetch(apiUrl(conn.botToken, 'sendMessage'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    const result = (await response.json()) as TelegramSendMessageResponse

    if (!result.ok || !result.result) {
      throw new Error(`Telegram sendMessage failed: ${result.description ?? 'unknown error'}`)
    }

    return {
      messageId: String(result.result.message_id),
      threadId: String(result.result.chat.id),
    }
  },

  /**
   * Delete a message via the Telegram Bot API.
   *
   * Telegram bots can delete messages within 48 hours. Beyond that, returns false.
   *
   * @param userId - LifeOS user ID
   * @param connectionId - Channel connection ID
   * @param messageId - Composite ID in the format "chatId:messageId"
   */
  async deleteMessage(
    userId: string,
    connectionId: ChannelConnectionId,
    messageId: string
  ): Promise<boolean> {
    const connId = connectionId as string

    try {
      // Look up connection credentials
      const connections = await getTelegramConnections(userId)
      const conn = connections.find((c) => c.connectionId === connId)

      if (!conn || !conn.botToken) {
        log.warn(`No valid credentials for connection ${connId}`)
        return false
      }

      // Check message age from cache
      const cachedMsg = await telegramMessagesCollection(userId).doc(messageId).get()
      if (cachedMsg.exists) {
        const data = cachedMsg.data() as TelegramCachedMessage
        const age = Date.now() - data.receivedAtMs
        if (age > DELETE_WINDOW_MS) {
          log.info(`Message ${messageId} is older than 48h, cannot delete`)
          return false
        }

        // Use cached Telegram IDs for deletion
        const response = await fetch(apiUrl(conn.botToken, 'deleteMessage'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: data.chatId,
            message_id: data.telegramMessageId,
          }),
        })

        const result = (await response.json()) as TelegramDeleteMessageResponse
        return result.ok && result.result === true
      }

      // If not in cache, try parsing messageId as "chatId:telegramMessageId"
      const parts = messageId.split(':')
      if (parts.length === 2) {
        const [chatId, telegramMsgId] = parts

        const response = await fetch(apiUrl(conn.botToken, 'deleteMessage'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            message_id: parseInt(telegramMsgId, 10),
          }),
        })

        const result = (await response.json()) as TelegramDeleteMessageResponse
        return result.ok && result.result === true
      }

      log.warn(`Cannot parse messageId format: ${messageId}`)
      return false
    } catch (err) {
      log.error(`Failed to delete message ${messageId}`, err)
      return false
    }
  },
}

// ----- Internal: getUpdates fallback -----

interface NormalizedTelegramUpdate {
  updateId: number
  messageId: string
  senderName: string
  senderUsername?: string
  chatId: number
  chatType: string
  chatTitle?: string
  body: string
  receivedAtMs: number
}

/**
 * Fetch updates directly from the Telegram Bot API using getUpdates (long polling).
 * Used as fallback when webhook cache is empty.
 */
async function fetchUpdatesFromApi(
  conn: TelegramConnection,
  sinceMs: number,
  maxResults: number
): Promise<NormalizedTelegramUpdate[]> {
  const params: Record<string, string> = {
    limit: String(maxResults),
    allowed_updates: JSON.stringify(['message']),
  }

  if (conn.lastUpdateId) {
    params.offset = String(conn.lastUpdateId)
  }

  const queryString = new URLSearchParams(params).toString()
  const response = await fetch(`${apiUrl(conn.botToken, 'getUpdates')}?${queryString}`)

  if (!response.ok) {
    throw new Error(`Telegram getUpdates failed with HTTP ${response.status}`)
  }

  const data = (await response.json()) as TelegramGetUpdatesResponse

  if (!data.ok) {
    throw new Error('Telegram getUpdates returned ok: false')
  }

  const results: NormalizedTelegramUpdate[] = []

  for (const update of data.result) {
    const msg = update.message
    if (!msg) continue

    const receivedAtMs = msg.date * 1000
    if (receivedAtMs < sinceMs) continue

    const body = extractTextContent(msg)
    if (!body) continue

    // Skip messages from the bot itself
    if (msg.from?.is_bot) continue

    results.push({
      updateId: update.update_id,
      messageId: `${msg.chat.id}_${msg.message_id}`,
      senderName: msg.from ? formatSenderName(msg.from) : 'Unknown',
      senderUsername: msg.from?.username,
      chatId: msg.chat.id,
      chatType: msg.chat.type,
      chatTitle: msg.chat.title,
      body,
      receivedAtMs,
    })
  }

  return results
}

/**
 * Normalize a Telegram update into the common RawMessage format.
 */
function normalizeUpdate(update: NormalizedTelegramUpdate, connectionId: string): RawMessage {
  const senderDisplay =
    update.chatType !== 'private' && update.chatTitle
      ? `${update.senderName} (${update.chatTitle})`
      : update.senderName

  return {
    id: `telegram_${update.messageId}`,
    source: 'telegram',
    accountId: connectionId,
    sender: senderDisplay,
    senderEmail: update.senderUsername ? `https://t.me/${update.senderUsername}` : undefined,
    body: update.body,
    receivedAt: new Date(update.receivedAtMs).toISOString(),
    originalUrl: update.senderUsername ? `https://t.me/${update.senderUsername}` : undefined,
  }
}
