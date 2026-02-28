/**
 * Mailbox Repository Port
 *
 * Interface for storing and retrieving mailbox-related data:
 * - Slack connections
 * - Prioritized messages
 * - Sync history
 * - Mailbox settings
 */

import type {
  SlackConnection,
  SlackConnectionId,
  CreateSlackConnectionInput,
  UpdateSlackConnectionInput,
  PrioritizedMessage,
  PrioritizedMessageId,
  CreatePrioritizedMessageInput,
  MailboxSync,
  MailboxSyncId,
  MailboxSettings,
  UpdateMailboxSettingsInput,
  SlackAppSettings,
  UpdateSlackAppSettingsInput,
  MessagePriority,
} from '../domain/mailbox'

// ----- Slack Connection Repository -----

export interface SlackConnectionRepository {
  /**
   * Create a new Slack connection after OAuth
   */
  createConnection(input: CreateSlackConnectionInput): Promise<SlackConnection>

  /**
   * Get a connection by ID
   */
  getConnection(connectionId: SlackConnectionId): Promise<SlackConnection | null>

  /**
   * Get all connections for a user
   */
  getConnectionsForUser(userId: string): Promise<SlackConnection[]>

  /**
   * Update connection (add/remove channels, update sync time)
   */
  updateConnection(
    connectionId: SlackConnectionId,
    updates: UpdateSlackConnectionInput
  ): Promise<SlackConnection>

  /**
   * Delete a connection (disconnect workspace)
   */
  deleteConnection(connectionId: SlackConnectionId): Promise<void>
}

// ----- Prioritized Message Repository -----

export interface PrioritizedMessageRepository {
  /**
   * Create or update a prioritized message
   */
  upsertMessage(input: CreatePrioritizedMessageInput): Promise<PrioritizedMessage>

  /**
   * Get a message by ID
   */
  getMessage(messageId: PrioritizedMessageId): Promise<PrioritizedMessage | null>

  /**
   * Get messages for a user, filtered by options
   */
  getMessagesForUser(
    userId: string,
    options?: {
      requiresFollowUp?: boolean
      minPriority?: MessagePriority
      includeDismissed?: boolean
      limit?: number
    }
  ): Promise<PrioritizedMessage[]>

  /**
   * Mark a message as read
   */
  markAsRead(messageId: PrioritizedMessageId): Promise<void>

  /**
   * Dismiss a message (remove from follow-up list)
   */
  dismissMessage(messageId: PrioritizedMessageId): Promise<void>

  /**
   * Delete old messages (cleanup)
   */
  deleteOldMessages(userId: string, olderThanMs: number): Promise<number>
}

// ----- Mailbox Sync Repository -----

export interface MailboxSyncRepository {
  /**
   * Create a new sync record
   */
  createSync(
    userId: string,
    triggerType: 'manual' | 'scheduled' | 'page_load'
  ): Promise<MailboxSync>

  /**
   * Get a sync by ID
   */
  getSync(syncId: MailboxSyncId): Promise<MailboxSync | null>

  /**
   * Update sync status and stats
   */
  updateSync(
    syncId: MailboxSyncId,
    updates: Partial<Pick<MailboxSync, 'status' | 'completedAtMs' | 'error' | 'stats'>>
  ): Promise<MailboxSync>

  /**
   * Get the latest sync for a user
   */
  getLatestSync(userId: string): Promise<MailboxSync | null>

  /**
   * Get sync history for a user
   */
  getSyncHistory(userId: string, limit?: number): Promise<MailboxSync[]>
}

// ----- Mailbox Settings Repository -----

export interface MailboxSettingsRepository {
  /**
   * Get settings for a user (creates default if not exists)
   */
  getSettings(userId: string): Promise<MailboxSettings>

  /**
   * Update settings
   */
  updateSettings(userId: string, updates: UpdateMailboxSettingsInput): Promise<MailboxSettings>
}

// ----- Slack App Settings Repository -----

export interface SlackAppSettingsRepository {
  /**
   * Get Slack app settings for a user (returns null if not configured)
   */
  getSettings(userId: string): Promise<SlackAppSettings | null>

  /**
   * Save or update Slack app settings
   */
  saveSettings(userId: string, updates: UpdateSlackAppSettingsInput): Promise<SlackAppSettings>

  /**
   * Delete Slack app settings
   */
  deleteSettings(userId: string): Promise<void>
}
