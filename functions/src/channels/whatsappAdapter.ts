/**
 * WhatsApp Channel Adapter
 *
 * Implements the ChannelAdapter pattern for WhatsApp messaging.
 * Uses the baileys library (WhatsApp Web multi-device protocol) for
 * reading and sending messages.
 *
 * Authentication: QR code pairing flow that stores session credentials
 * in `channelConnections` with authMethod: 'qr_code'.
 *
 * Read: Fetches recent messages from cached session store.
 * Write: Sends text messages; delete supported within WhatsApp's 2-day window.
 *
 * NOTE: Baileys operates via a persistent WebSocket connection. In a Cloud
 * Functions environment, a separate long-lived process (e.g., Cloud Run)
 * manages the WhatsApp socket and writes incoming messages to Firestore.
 * This adapter reads from that Firestore cache and sends messages
 * by calling the companion service's HTTP API.
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

const log = createLogger('WhatsApp')

// ----- WhatsApp Message Cache Types -----

/**
 * WhatsApp messages stored in Firestore by the companion WebSocket service.
 * Path: users/{userId}/whatsappMessages/{messageId}
 */
interface WhatsAppCachedMessage {
  messageId: string
  connectionId: string
  /** JID of the sender (e.g., "5511999999999@s.whatsapp.net") */
  senderJid: string
  /** Human-readable sender name (from contacts or push name) */
  senderName: string
  /** Group JID if this is a group message */
  groupJid?: string
  /** Group name */
  groupName?: string
  /** Message text body */
  body: string
  /** Unix timestamp in milliseconds */
  receivedAtMs: number
  /** Whether this is a group message */
  isGroup: boolean
  /** Media type if present (image, video, audio, document) */
  mediaType?: string
  /** Whether this message was sent by the user (outgoing) */
  fromMe: boolean
}

/**
 * Response shape from the companion WhatsApp service for send operations.
 */
interface WhatsAppSendResponse {
  success: boolean
  messageId?: string
  error?: string
}

/**
 * Response shape from the companion WhatsApp service for delete operations.
 */
interface WhatsAppDeleteResponse {
  success: boolean
  error?: string
}

// ----- Constants -----

/** WhatsApp allows deleting messages within ~2 days (48 hours + small buffer) */
const DELETE_WINDOW_MS = 48 * 60 * 60 * 1000

// ----- Helpers -----

/**
 * Get the base URL for the companion WhatsApp WebSocket service.
 * Falls back to localhost for development.
 */
function getCompanionServiceUrl(connection: ChannelConnection): string {
  return (connection.config?.companionServiceUrl as string) ?? 'http://localhost:3100'
}

/**
 * Format a WhatsApp JID to a human-readable phone number.
 * "5511999999999@s.whatsapp.net" -> "+55 11 999999999"
 */
function formatPhoneFromJid(jid: string): string {
  const number = jid.split('@')[0]
  if (number.length > 4) {
    return `+${number}`
  }
  return number
}

/**
 * Firestore collection path for cached WhatsApp messages.
 */
function whatsappMessagesCollection(userId: string) {
  return getFirestore().collection(`users/${userId}/whatsappMessages`)
}

// ----- Connection Discovery -----

export interface WhatsAppConnection {
  connectionId: string
  displayName: string
  phoneNumber?: string
  companionServiceUrl: string
  lastSyncMs?: number
}

/**
 * Find all connected WhatsApp accounts for a user.
 * Reads from the unified channelConnections collection, filtering by source = 'whatsapp'.
 */
export async function getWhatsAppConnections(userId: string): Promise<WhatsAppConnection[]> {
  const snapshot = await channelConnectionsCollection(userId)
    .where('source', '==', 'whatsapp')
    .where('status', '==', 'connected')
    .get()

  const connections: WhatsAppConnection[] = []

  for (const doc of snapshot.docs) {
    const data = doc.data() as ChannelConnection
    connections.push({
      connectionId: doc.id,
      displayName: data.displayName,
      phoneNumber: data.credentials.phoneNumber,
      companionServiceUrl: getCompanionServiceUrl(data),
      lastSyncMs: data.lastSyncMs,
    })
  }

  return connections
}

// ----- Adapter Implementation -----

export const whatsappAdapter = {
  source: 'whatsapp' as MessageSource,

  /**
   * Fetch WhatsApp messages from the Firestore cache.
   *
   * The companion WebSocket service writes incoming WhatsApp messages
   * to `users/{userId}/whatsappMessages/`. This adapter reads from
   * that cache, filtering by connection and timestamp.
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
      // Look up connection to get last sync time
      const connections = await getWhatsAppConnections(userId)
      const conn = connections.find((c) => c.connectionId === connId)

      if (!conn) {
        log.warn(`No connection found for ${connId}`)
        return []
      }

      const sinceMs = options?.since
        ? new Date(options.since).getTime()
        : (conn.lastSyncMs ?? Date.now() - 24 * 60 * 60 * 1000)

      const maxResults = options?.maxResults ?? 50

      // Query cached messages from Firestore
      const snapshot = await whatsappMessagesCollection(userId)
        .where('connectionId', '==', connId)
        .where('receivedAtMs', '>', sinceMs)
        .where('fromMe', '==', false)
        .orderBy('receivedAtMs', 'desc')
        .limit(maxResults)
        .get()

      log.info(`Found ${snapshot.size} cached messages for connection ${connId}`)

      for (const doc of snapshot.docs) {
        const msg = doc.data() as WhatsAppCachedMessage

        // Build sender display
        const senderDisplay =
          msg.isGroup && msg.groupName ? `${msg.senderName} (${msg.groupName})` : msg.senderName

        // Build body with media indicator
        const bodyText = msg.mediaType ? `[${msg.mediaType}] ${msg.body || ''}` : msg.body

        rawMessages.push({
          id: `whatsapp_${msg.messageId}`,
          source: 'whatsapp',
          accountId: connId,
          sender: senderDisplay,
          senderEmail: formatPhoneFromJid(msg.senderJid),
          body: bodyText,
          receivedAt: new Date(msg.receivedAtMs).toISOString(),
          originalUrl: `https://wa.me/${msg.senderJid.split('@')[0]}`,
        })
      }

      // Update last sync time
      await channelConnectionRef(userId, connId).update({
        lastSyncMs: Date.now(),
        updatedAtMs: Date.now(),
      })
    } catch (err) {
      log.error(`Failed to fetch messages for connection ${connId}`, err)
    }

    return rawMessages
  },

  /**
   * Send a WhatsApp message via the companion WebSocket service.
   *
   * @param userId - LifeOS user ID
   * @param message - The outbound message to send
   */
  async sendMessage(userId: string, message: OutboundMessage): Promise<SendMessageResult> {
    const connId = message.connectionId as string

    // Look up connection for companion service URL
    const connections = await getWhatsAppConnections(userId)
    const conn = connections.find((c) => c.connectionId === connId)

    if (!conn) {
      throw new Error(`No valid WhatsApp connection for ${connId}`)
    }

    // Call companion service HTTP API
    const response = await fetch(`${conn.companionServiceUrl}/api/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        connectionId: connId,
        userId,
        recipientJid: message.recipientId,
        body: message.body,
      }),
    })

    if (!response.ok) {
      throw new Error(`WhatsApp send failed with HTTP ${response.status}`)
    }

    const result = (await response.json()) as WhatsAppSendResponse

    if (!result.success) {
      throw new Error(`WhatsApp send failed: ${result.error ?? 'unknown error'}`)
    }

    return {
      messageId: result.messageId ?? `whatsapp_sent_${Date.now()}`,
    }
  },

  /**
   * Delete a WhatsApp message via the companion WebSocket service.
   *
   * WhatsApp supports "Delete for Everyone" within a ~48 hour window.
   * Beyond that window, returns false (local dismiss only).
   *
   * @param userId - LifeOS user ID
   * @param connectionId - Channel connection ID
   * @param messageId - WhatsApp message ID to delete
   */
  async deleteMessage(
    userId: string,
    connectionId: ChannelConnectionId,
    messageId: string
  ): Promise<boolean> {
    const connId = connectionId as string

    try {
      // Check message age — WhatsApp only allows delete within 48 hours
      const msgDoc = await whatsappMessagesCollection(userId).doc(messageId).get()
      if (msgDoc.exists) {
        const data = msgDoc.data() as WhatsAppCachedMessage
        const age = Date.now() - data.receivedAtMs
        if (age > DELETE_WINDOW_MS) {
          log.info(`Message ${messageId} is older than 48h, cannot delete remotely`)
          return false
        }
      }

      // Look up connection for companion service URL
      const connections = await getWhatsAppConnections(userId)
      const conn = connections.find((c) => c.connectionId === connId)

      if (!conn) {
        log.warn(`No connection found for ${connId}`)
        return false
      }

      // Call companion service HTTP API
      const response = await fetch(`${conn.companionServiceUrl}/api/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connectionId: connId,
          userId,
          messageId,
        }),
      })

      if (!response.ok) {
        log.error(`Delete failed with HTTP ${response.status}`)
        return false
      }

      const result = (await response.json()) as WhatsAppDeleteResponse
      return result.success
    } catch (err) {
      log.error(`Failed to delete message ${messageId}`, err)
      return false
    }
  },
}
