/**
 * Slack Channel Adapter
 *
 * Implements the ChannelAdapter pattern for Slack.
 * Extracts Slack-specific fetching logic from slackEndpoints.ts
 * and normalizes messages into the unified RawMessage format.
 */

import { createLogger } from '../lib/logger.js'
import type { ChannelConnectionId, MessageSource, OutboundMessage } from '@lifeos/agents'
import type { RawMessage, SendMessageResult, FetchMessagesOptions } from '@lifeos/agents'
import { fetchAllSlackMessages } from '../slack/slackApi.js'
import { slackAccountRef, slackAccountsCollection } from '../slack/paths.js'

const log = createLogger('Slack')

// ----- Connection Discovery -----

export interface SlackConnection {
  connectionId: string
  workspaceId: string
  workspaceName: string
  lastSyncMs?: number
}

/**
 * Find all connected Slack workspaces for a user.
 */
export async function getSlackConnections(userId: string): Promise<SlackConnection[]> {
  const snapshot = await slackAccountsCollection(userId).get()
  const connections: SlackConnection[] = []

  for (const doc of snapshot.docs) {
    const data = doc.data() as {
      status: string
      teamName?: string
      lastSyncMs?: number
    }
    if (data.status === 'connected') {
      connections.push({
        connectionId: doc.id,
        workspaceId: doc.id,
        workspaceName: data.teamName ?? 'Unknown Workspace',
        lastSyncMs: data.lastSyncMs,
      })
    }
  }

  return connections
}

// ----- Adapter Implementation -----

export const slackAdapter = {
  source: 'slack' as MessageSource,

  /**
   * Fetch Slack messages (DMs + monitored channels) for a specific workspace.
   *
   * @param userId - LifeOS user ID
   * @param connectionId - Slack workspace ID (from slackAccounts)
   * @param options - Fetch options (since timestamp, max results)
   */
  async fetchMessages(
    userId: string,
    connectionId: ChannelConnectionId,
    options?: FetchMessagesOptions
  ): Promise<RawMessage[]> {
    const workspaceId = connectionId as string

    // Determine since timestamp
    let sinceTimestamp: number
    if (options?.since) {
      sinceTimestamp = Math.floor(new Date(options.since).getTime() / 1000)
    } else {
      // Fall back to last sync time from account metadata
      const conn = (await getSlackConnections(userId)).find((c) => c.workspaceId === workspaceId)
      const lastSyncMs = conn?.lastSyncMs ?? Date.now() - 24 * 60 * 60 * 1000
      sinceTimestamp = Math.floor(lastSyncMs / 1000)
    }

    try {
      const slackMessages = await fetchAllSlackMessages(userId, workspaceId, sinceTimestamp)
      log.info(`Fetched ${slackMessages.length} messages from workspace ${workspaceId}`)

      // Update last sync time
      await slackAccountRef(userId, workspaceId).update({
        lastSyncMs: Date.now(),
      })

      // Normalize to RawMessage format
      return slackMessages.map((msg) => ({
        id: msg.messageId,
        source: 'slack' as const,
        accountId: msg.workspaceId,
        sender: msg.senderName,
        body: msg.text,
        receivedAt: new Date(msg.receivedAtMs).toISOString(),
      }))
    } catch (err) {
      log.error(`Failed to fetch messages from workspace ${workspaceId}`, err)
      return []
    }
  },

  async sendMessage(_userId: string, _message: OutboundMessage): Promise<SendMessageResult> {
    // TODO: Implement Slack write operations
    throw new Error('Slack sendMessage not yet implemented')
  },

  async deleteMessage(
    _userId: string,
    _connectionId: ChannelConnectionId,
    _messageId: string
  ): Promise<boolean> {
    // Slack doesn't support programmatic delete for bot tokens
    return false
  },
}
