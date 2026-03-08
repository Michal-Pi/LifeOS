/**
 * Channel Adapter Port
 *
 * Unified interface for message channel integrations (Gmail, Slack, LinkedIn, WhatsApp, Telegram).
 * Each channel implements this interface to normalize messages into the common RawMessage format
 * and support bidirectional messaging (fetch, send, delete).
 */

import type { MessageSource, OutboundMessage, ChannelConnectionId } from '../domain/mailbox'

/**
 * Raw message from any channel, normalized into a common format
 * for AI analysis and storage. This is the input to the message analyzer.
 */
export interface RawMessage {
  /** Unique identifier within the source channel */
  id: string
  /** Which channel this message came from */
  source: MessageSource
  /** Account/connection identifier (e.g., Gmail account ID, Slack workspace ID) */
  accountId: string
  /** Sender display name */
  sender: string
  /** Sender email (email channels only) */
  senderEmail?: string
  /** Message subject (email channels only) */
  subject?: string
  /** Full message body text */
  body: string
  /** ISO 8601 timestamp when the message was received */
  receivedAt: string
  /** Deep link URL to open the message in its source app */
  originalUrl?: string
  /** To recipients (email channels, for Reply All) */
  toRecipients?: string[]
  /** CC recipients (email channels, for Reply All) */
  ccRecipients?: string[]
  /** Gmail label IDs (Gmail only) */
  gmailLabelIds?: string[]
}

/**
 * Result of sending a message through a channel adapter.
 */
export interface SendMessageResult {
  /** The message ID assigned by the channel */
  messageId: string
  /** Optional thread ID for conversation threading */
  threadId?: string
}

/**
 * Options for fetching messages from a channel.
 */
export interface FetchMessagesOptions {
  /** Only fetch messages received after this timestamp (ISO 8601) */
  since?: string
  /** Only fetch messages received before this timestamp (ISO 8601) — for backfill */
  before?: string
  /** Maximum number of messages to fetch */
  maxResults?: number
}

/**
 * Unified interface that every channel adapter must implement.
 * Adapters normalize channel-specific APIs into this common interface.
 */
export interface ChannelAdapter {
  /** Which channel this adapter handles */
  readonly source: MessageSource

  /**
   * Fetch messages from the channel, normalized to RawMessage format.
   *
   * @param userId - The LifeOS user ID
   * @param connectionId - The specific channel connection to fetch from
   * @param options - Fetch options (since timestamp, max results)
   * @returns Normalized messages ready for AI analysis
   */
  fetchMessages(
    userId: string,
    connectionId: ChannelConnectionId,
    options?: FetchMessagesOptions
  ): Promise<RawMessage[]>

  /**
   * Send a message through this channel.
   *
   * @param userId - The LifeOS user ID
   * @param message - The outbound message to send
   * @returns The channel-assigned message ID
   */
  sendMessage(userId: string, message: OutboundMessage): Promise<SendMessageResult>

  /**
   * Delete a message from the channel.
   * Some channels may not support deletion — they should dismiss locally instead.
   *
   * @param userId - The LifeOS user ID
   * @param connectionId - The channel connection
   * @param messageId - The channel-specific message ID to delete
   * @returns true if deleted, false if deletion not supported (local dismiss only)
   */
  deleteMessage(
    userId: string,
    connectionId: ChannelConnectionId,
    messageId: string
  ): Promise<boolean>
}

/**
 * Registry of all available channel adapters.
 * Used by the unified sync pipeline to iterate over enabled channels.
 */
export type ChannelAdapterRegistry = Map<MessageSource, ChannelAdapter>
