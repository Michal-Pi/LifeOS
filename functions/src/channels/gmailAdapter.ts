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
  modifyGmailMessage,
  getOrCreateGmailLabel,
  listGmailLabels,
} from '../google/gmailApi.js'
import { mailboxSyncsCollection, messageBodyRef } from '../slack/paths.js'

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

/**
 * Parse a comma-separated RFC 2822 address list into individual email addresses.
 * Handles "Name <email>" format and bare email addresses.
 */
function parseEmailList(header: string): string[] {
  if (!header) return []
  return header
    .split(',')
    .map((addr) => {
      const email = extractEmail(addr.trim())
      return email ?? addr.trim()
    })
    .filter((addr) => addr.includes('@'))
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
      let gmailQuery = 'category:primary'

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

      if (options?.before) {
        const beforeDate = new Date(options.before)
        gmailQuery += ` before:${beforeDate.getFullYear()}/${beforeDate.getMonth() + 1}/${beforeDate.getDate()}`
      }

      const maxResults = options?.maxResults ?? 100
      log.info(`Query for account ${accountId}: "${gmailQuery}"`)

      const gmailMessages = await listGmailMessages(userId, accountId, gmailQuery, maxResults)
      log.info(`Found ${gmailMessages.length} messages for account ${accountId}`)

      // Build RawMessages from metadata only (snippet for AI, full body fetched separately)
      for (const meta of gmailMessages) {
        rawMessages.push({
          id: `gmail_${meta.messageId}`,
          source: 'gmail',
          accountId,
          sender: meta.from,
          senderEmail: extractEmail(meta.from),
          subject: meta.subject,
          body: meta.snippet, // Snippet only — cost-efficient for AI triage
          receivedAt: new Date(meta.date).toISOString(),
          originalUrl: `https://mail.google.com/mail/u/0/#inbox/${meta.messageId}`,
          toRecipients: meta.to ? parseEmailList(meta.to) : undefined,
          ccRecipients: meta.cc ? parseEmailList(meta.cc) : undefined,
        })
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

    // Combine primary recipientId with additional toRecipients
    const toList = [message.recipientId]
    if (message.toRecipients) {
      toList.push(...message.toRecipients.map((r) => r.id))
    }

    const result = await sendGmailMessage(userId, account.accountId, {
      to: toList.join(', '),
      cc: message.ccRecipients?.map((r) => r.id).join(', ') || undefined,
      bcc: message.bccRecipients?.map((r) => r.id).join(', ') || undefined,
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

/**
 * Fetch full message bodies from Gmail and store in Firestore for offline reading.
 * Called during sync after AI analysis — bodies are stored separately from metadata.
 */
export async function fetchAndStoreGmailBodies(
  userId: string,
  accountId: string,
  messageIds: string[]
): Promise<number> {
  if (messageIds.length === 0) return 0

  const db = getFirestore()
  const BATCH_SIZE = 10
  let storedCount = 0

  for (let i = 0; i < messageIds.length; i += BATCH_SIZE) {
    const batch = db.batch()
    const chunk = messageIds.slice(i, i + BATCH_SIZE)

    const results = await Promise.all(
      chunk.map(async (prefixedId) => {
        const rawId = prefixedId.startsWith('gmail_') ? prefixedId.slice(6) : prefixedId
        try {
          const fullMessage = await readGmailMessage(userId, accountId, rawId)
          return { prefixedId, fullMessage }
        } catch (err) {
          log.error(`Failed to read body for ${rawId}`, err)
          return null
        }
      })
    )

    for (const result of results) {
      if (!result) continue
      batch.set(
        messageBodyRef(userId, result.prefixedId),
        {
          messageId: result.prefixedId,
          body: result.fullMessage.body,
          attachmentCount: result.fullMessage.attachmentCount,
          storedAtMs: Date.now(),
        },
        { merge: true }
      )
      storedCount++
    }

    await batch.commit()
  }

  log.info(`Stored ${storedCount} message bodies for account ${accountId}`)
  return storedCount
}

/**
 * Fetch a single Gmail message body on demand and store in Firestore.
 * Called when the frontend opens a message whose body wasn't stored during sync.
 */
export async function fetchSingleGmailBody(
  userId: string,
  accountId: string,
  messageId: string
): Promise<{ body: string; attachmentCount: number }> {
  const rawId = messageId.startsWith('gmail_') ? messageId.slice(6) : messageId
  const fullMessage = await readGmailMessage(userId, accountId, rawId)

  const db = getFirestore()
  await db.doc(messageBodyRef(userId, messageId).path).set(
    {
      messageId,
      body: fullMessage.body,
      attachmentCount: fullMessage.attachmentCount,
      storedAtMs: Date.now(),
    },
    { merge: true }
  )

  log.info(`On-demand body fetch for ${messageId}`)
  return { body: fullMessage.body, attachmentCount: fullMessage.attachmentCount }
}

/**
 * Archive a Gmail message: apply a label and remove from INBOX.
 * Gmail's "archive" = remove INBOX label. Optionally apply a custom label.
 */
export async function archiveGmailMessage(
  userId: string,
  accountId: string,
  messageId: string,
  labelName?: string
): Promise<boolean> {
  const rawMessageId = messageId.startsWith('gmail_') ? messageId.slice(6) : messageId

  const addLabelIds: string[] = []
  if (labelName) {
    const labelId = await getOrCreateGmailLabel(userId, accountId, labelName)
    addLabelIds.push(labelId)
  }

  await modifyGmailMessage(userId, accountId, rawMessageId, addLabelIds, ['INBOX'])
  log.info(`Archived message ${rawMessageId} with label "${labelName || 'none'}"`)
  return true
}

/**
 * Get Gmail labels for label picker UI
 */
export async function getGmailLabelsForUser(
  userId: string,
  accountId: string
): Promise<Array<{ id: string; name: string }>> {
  const labels = await listGmailLabels(userId, accountId)
  // Filter to user-created labels (exclude system labels like INBOX, SPAM, etc.)
  return labels
    .filter((l) => l.type === 'user')
    .map((l) => ({ id: l.id, name: l.name }))
    .sort((a, b) => a.name.localeCompare(b.name))
}
