/**
 * Gmail Channel Adapter
 *
 * Implements the ChannelAdapter pattern for Gmail.
 * Extracts Gmail-specific fetching logic from slackEndpoints.ts
 * and normalizes messages into the unified RawMessage format.
 */

import { createLogger } from '../lib/logger.js'
import { getFirestore } from 'firebase-admin/firestore'
import type { ChannelConnectionId, MessageSource, OutboundMessage } from '@lifeos/agents'
import type { RawMessage, SendMessageResult, FetchMessagesOptions } from '@lifeos/agents'
import {
  listGmailMessages,
  readGmailMessage,
  sendGmailMessage,
  trashGmailMessage,
} from '../google/gmailApi.js'
import { mailboxSyncsCollection } from '../slack/paths.js'

const log = createLogger('Gmail')

// ----- Helpers -----

/**
 * Extract email address from a "Name <email>" format string
 */
function extractEmail(fromHeader: string): string | undefined {
  const match = fromHeader.match(/<([^>]+)>/)
  if (match) return match[1]
  if (fromHeader.includes('@')) return fromHeader.trim()
  return undefined
}

// ----- Connection Discovery -----

export interface GmailConnection {
  connectionId: string
  accountId: string
  email?: string
}

/**
 * Find all connected Google accounts that can be used for Gmail fetching.
 * Uses the existing calendarAccounts collection (Google OAuth grants both calendar + gmail).
 */
export async function getGmailConnections(userId: string): Promise<GmailConnection[]> {
  const db = getFirestore()
  const snapshot = await db.collection(`users/${userId}/calendarAccounts`).get()
  const connections: GmailConnection[] = []

  for (const doc of snapshot.docs) {
    const data = doc.data() as { status: string; email?: string }
    if (data.status === 'connected') {
      connections.push({
        connectionId: doc.id,
        accountId: doc.id,
        email: data.email,
      })
    }
  }

  return connections
}

// ----- Adapter Implementation -----

export const gmailAdapter = {
  source: 'gmail' as MessageSource,

  /**
   * Fetch Gmail messages for a specific Google account.
   *
   * @param userId - LifeOS user ID
   * @param connectionId - Google account ID (from calendarAccounts)
   * @param options - Fetch options (since timestamp, max results)
   */
  async fetchMessages(
    userId: string,
    connectionId: ChannelConnectionId,
    options?: FetchMessagesOptions
  ): Promise<RawMessage[]> {
    const accountId = connectionId as string
    const rawMessages: RawMessage[] = []

    try {
      // Build Gmail query
      let gmailQuery = 'is:unread category:primary'

      if (options?.since) {
        const afterDate = new Date(options.since)
        gmailQuery += ` after:${afterDate.getFullYear()}/${afterDate.getMonth() + 1}/${afterDate.getDate()}`
      } else {
        // Fall back to last successful sync time
        const lastMailboxSync = await mailboxSyncsCollection(userId)
          .where('status', '==', 'completed')
          .orderBy('completedAtMs', 'desc')
          .limit(1)
          .get()

        if (!lastMailboxSync.empty) {
          const lastSync = lastMailboxSync.docs[0].data() as { completedAtMs: number }
          const afterDate = new Date(lastSync.completedAtMs)
          gmailQuery += ` after:${afterDate.getFullYear()}/${afterDate.getMonth() + 1}/${afterDate.getDate()}`
        } else {
          gmailQuery += ' newer_than:90d'
        }
      }

      const maxResults = options?.maxResults ?? 50
      log.info(`Query for account ${accountId}: "${gmailQuery}"`)

      const gmailMessages = await listGmailMessages(userId, accountId, gmailQuery, maxResults)
      log.info(`Found ${gmailMessages.length} messages for account ${accountId}`)

      // Fetch full body for each message
      for (const meta of gmailMessages) {
        try {
          const fullMessage = await readGmailMessage(userId, accountId, meta.messageId)

          rawMessages.push({
            id: `gmail_${meta.messageId}`,
            source: 'gmail',
            accountId,
            sender: fullMessage.from,
            senderEmail: extractEmail(fullMessage.from),
            subject: fullMessage.subject,
            body: fullMessage.body || fullMessage.snippet,
            receivedAt: new Date(fullMessage.date).toISOString(),
            originalUrl: `https://mail.google.com/mail/u/0/#inbox/${meta.messageId}`,
          })
        } catch (msgErr) {
          log.error(`Failed to read message ${meta.messageId}`, msgErr)
        }
      }
    } catch (err) {
      log.error(`Failed to fetch messages for account ${accountId}`, err)
    }

    return rawMessages
  },

  async sendMessage(userId: string, message: OutboundMessage): Promise<SendMessageResult> {
    // Determine which Gmail account to send from
    const connections = await getGmailConnections(userId)
    const connectionId = message.connectionId as string
    const account = connections.find((c) => c.connectionId === connectionId) ?? connections[0]

    if (!account) {
      throw new Error('No connected Gmail account found')
    }

    const result = await sendGmailMessage(userId, account.accountId, {
      to: message.recipientId,
      subject: message.subject ?? '',
      body: message.body,
      htmlBody: message.htmlBody,
      inReplyTo: message.inReplyTo,
      threadId: message.threadId,
    })

    return {
      messageId: result.messageId,
      threadId: result.threadId,
    }
  },

  async deleteMessage(
    userId: string,
    connectionId: ChannelConnectionId,
    messageId: string
  ): Promise<boolean> {
    // Determine which Gmail account owns this message
    const connections = await getGmailConnections(userId)
    const connId = connectionId as string
    const account = connections.find((c) => c.connectionId === connId) ?? connections[0]

    if (!account) {
      throw new Error('No connected Gmail account found')
    }

    // Strip the 'gmail_' prefix if present (our IDs are prefixed in fetch)
    const rawMessageId = messageId.startsWith('gmail_') ? messageId.slice(6) : messageId

    return trashGmailMessage(userId, account.accountId, rawMessageId)
  },
}
