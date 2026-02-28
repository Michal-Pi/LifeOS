/**
 * Mailbox Domain Models
 *
 * Models for the unified message aggregation and prioritization system.
 * Pulls messages from Gmail, Slack, LinkedIn, WhatsApp, and Telegram,
 * analyzes them with AI, and enables bidirectional messaging (compose, reply, delete).
 */

import type { Id } from '@lifeos/core'
import type { ContactId } from './contacts'

// ----- IDs -----

export type SlackConnectionId = Id<'slack_connection'>
export type MailboxSyncId = Id<'mailbox_sync'>
export type PrioritizedMessageId = Id<'prioritized_message'>
export type DraftMessageId = Id<'draft_message'>
export type SenderPersonaId = Id<'sender_persona'>
export type ChannelConnectionId = Id<'channel_connection'>

// ----- Slack Connection -----

export interface SlackChannelConfig {
  channelId: string
  channelName: string
  isPrivate: boolean
  addedAtMs: number
}

export interface SlackConnection {
  connectionId: SlackConnectionId
  userId: string
  workspaceName: string
  workspaceId: string
  accessToken: string // Encrypted in storage
  refreshToken?: string
  monitoredChannels: SlackChannelConfig[]
  pullDirectMessages: boolean // Always true by default
  createdAtMs: number
  lastSyncMs?: number
}

export type CreateSlackConnectionInput = Omit<
  SlackConnection,
  'connectionId' | 'createdAtMs' | 'lastSyncMs'
>

export type UpdateSlackConnectionInput = Partial<
  Pick<SlackConnection, 'monitoredChannels' | 'pullDirectMessages' | 'lastSyncMs'>
>

// ----- Slack Message -----

export interface SlackMessage {
  messageId: string
  channelId: string
  channelName: string
  workspaceId: string
  senderName: string
  senderAvatar?: string
  text: string
  timestamp: string // Slack ts format
  threadTs?: string
  isDirectMessage: boolean
}

// ----- Prioritized Message -----

export type MessagePriority = 'high' | 'medium' | 'low'
export type MessageSource = 'gmail' | 'slack' | 'linkedin' | 'whatsapp' | 'telegram'

export interface PrioritizedMessage {
  messageId: PrioritizedMessageId
  userId: string
  source: MessageSource
  accountId: string // Gmail account ID or Slack workspace ID
  originalMessageId: string // Source-specific message ID
  sender: string
  senderEmail?: string // Gmail only
  subject?: string // Gmail only
  snippet: string // First ~100 chars or AI summary
  receivedAtMs: number
  priority: MessagePriority
  aiSummary: string // AI-generated 1-2 sentence summary
  requiresFollowUp: boolean
  followUpReason?: string // Why AI thinks follow-up is needed
  originalUrl?: string // Deep link to message
  importanceScore?: number // 0-100 AI-computed score for unified ranking
  isRead: boolean
  isDismissed: boolean
  /** Linked CRM contact, set by onMailboxMessageCreated trigger */
  contactId?: ContactId
  /** Thread/conversation ID for grouping related messages */
  threadId?: string
  createdAtMs: number
  updatedAtMs: number
}

export type CreatePrioritizedMessageInput = Omit<
  PrioritizedMessage,
  'messageId' | 'createdAtMs' | 'updatedAtMs' | 'isRead' | 'isDismissed'
>

// ----- Mailbox Sync -----

export type MailboxSyncStatus = 'running' | 'completed' | 'failed'
export type MailboxSyncTrigger = 'manual' | 'scheduled' | 'page_load'

export interface MailboxSync {
  syncId: MailboxSyncId
  userId: string
  triggerType: MailboxSyncTrigger
  startedAtMs: number
  completedAtMs?: number
  status: MailboxSyncStatus
  error?: string
  stats: MailboxSyncStats
}

export interface MailboxSyncStats {
  gmailAccountsProcessed: number
  slackWorkspacesProcessed: number
  linkedinAccountsProcessed: number
  whatsappAccountsProcessed: number
  telegramAccountsProcessed: number
  totalMessagesScanned: number
  newMessagesFound: number
  messagesRequiringFollowUp: number
  highPriorityCount: number
  mediumPriorityCount: number
  lowPriorityCount: number
}

export type CreateMailboxSyncInput = Omit<
  MailboxSync,
  'syncId' | 'startedAtMs' | 'completedAtMs' | 'status' | 'stats'
> & {
  triggerType: MailboxSyncTrigger
}

// ----- Gmail Account (reusing existing google account connection) -----

export interface GmailAccountConfig {
  accountId: string
  email: string
  isPrimary: boolean
  lastSyncMs?: number
}

// ----- Mailbox Settings -----

export interface MailboxSettings {
  userId: string
  gmailAccounts: GmailAccountConfig[]
  slackConnections: SlackConnectionId[]
  maxMessagesToShow: number // Default: 10
  autoSyncOnPageLoad: boolean // Default: true
  syncIntervalMinutes?: number // For scheduled sync, null = manual only
  priorityThreshold: MessagePriority // Only show messages >= this priority
  updatedAtMs: number
}

export type UpdateMailboxSettingsInput = Partial<Omit<MailboxSettings, 'userId' | 'updatedAtMs'>>

// ----- Slack App Settings -----

/**
 * User-configurable Slack App settings.
 * The Client ID is not a secret - it appears in OAuth URLs.
 * The Client Secret remains server-side only (Firebase Secret).
 */
export interface SlackAppSettings {
  userId: string
  clientId: string // Slack App Client ID (public, user-configurable)
  redirectUri?: string // Optional custom redirect URI
  isConfigured: boolean
  updatedAtMs: number
}

export type UpdateSlackAppSettingsInput = Partial<
  Pick<SlackAppSettings, 'clientId' | 'redirectUri'>
>

// ----- AI Analysis Request/Response -----

export interface MessageAnalysisRequest {
  messages: Array<{
    id: string
    source: MessageSource
    sender: string
    subject?: string
    body: string
    receivedAt: string
  }>
  userContext?: {
    timezone: string
    workHoursStart?: number
    workHoursEnd?: number
  }
}

export interface MessageAnalysisResult {
  messageId: string
  requiresFollowUp: boolean
  priority: MessagePriority
  importanceScore?: number // 0-100 for unified ranking
  summary: string
  followUpReason?: string
  suggestedAction?: string
}

// ----- Helper Functions -----

export function getPriorityOrder(priority: MessagePriority): number {
  switch (priority) {
    case 'high':
      return 3
    case 'medium':
      return 2
    case 'low':
      return 1
  }
}

export function sortByPriority(messages: PrioritizedMessage[]): PrioritizedMessage[] {
  return [...messages].sort((a, b) => {
    // First by priority (high > medium > low)
    const priorityDiff = getPriorityOrder(b.priority) - getPriorityOrder(a.priority)
    if (priorityDiff !== 0) return priorityDiff
    // Then by received time (newest first)
    return b.receivedAtMs - a.receivedAtMs
  })
}

export function filterFollowUpMessages(
  messages: PrioritizedMessage[],
  maxCount: number = 10
): PrioritizedMessage[] {
  return sortByPriority(messages.filter((m) => m.requiresFollowUp && !m.isDismissed)).slice(
    0,
    maxCount
  )
}

// ----- Channel Connection (unified across all channels) -----

/** Auth method used by a channel */
export type ChannelAuthMethod = 'oauth' | 'cookie' | 'qr_code' | 'bot_token'

/** Connection status for any channel */
export type ChannelConnectionStatus = 'connected' | 'disconnected' | 'expired' | 'error'

/**
 * Unified channel connection configuration.
 * Each channel type stores its credentials and settings here.
 */
export interface ChannelConnection {
  connectionId: ChannelConnectionId
  userId: string
  source: MessageSource
  authMethod: ChannelAuthMethod
  status: ChannelConnectionStatus
  /** Display label (e.g., email address, workspace name, phone number) */
  displayName: string
  /** Channel-specific credentials (encrypted in storage) */
  credentials: Record<string, string>
  /** Channel-specific configuration */
  config?: Record<string, unknown>
  lastSyncMs?: number
  errorMessage?: string
  createdAtMs: number
  updatedAtMs: number
}

export type CreateChannelConnectionInput = Omit<
  ChannelConnection,
  'connectionId' | 'createdAtMs' | 'updatedAtMs' | 'lastSyncMs'
>

export type UpdateChannelConnectionInput = Partial<
  Pick<
    ChannelConnection,
    'status' | 'credentials' | 'config' | 'lastSyncMs' | 'errorMessage' | 'displayName'
  >
>

// ----- Outbound Message (compose / reply / forward) -----

/**
 * Message to be sent through a channel adapter.
 * Used for compose, reply, and forward operations.
 */
export interface OutboundMessage {
  /** Target channel */
  source: MessageSource
  /** Channel connection to send through */
  connectionId: ChannelConnectionId
  /** Recipient identifier (email, Slack user/channel ID, phone number, chat ID) */
  recipientId: string
  /** Human-readable recipient name */
  recipientName?: string
  /** Email subject (email channels only) */
  subject?: string
  /** Plain text body */
  body: string
  /** HTML body for rich text channels (email) */
  htmlBody?: string
  /** Original message ID for replies */
  inReplyTo?: string
  /** Thread/conversation ID for threading */
  threadId?: string
}

// ----- Draft Message (auto-saved composer state) -----

/**
 * Auto-saved draft from the mailbox composer.
 * Persisted to Firestore for recovery across sessions.
 */
export interface DraftMessage {
  draftId: DraftMessageId
  userId: string
  /** Channel this draft targets */
  source: MessageSource
  connectionId?: ChannelConnectionId
  recipientId?: string
  recipientName?: string
  subject?: string
  /** Plain text content */
  body: string
  /** TipTap JSON content for rich text drafts */
  richContent?: unknown
  /** Original message ID if this is a reply draft */
  inReplyTo?: string
  threadId?: string
  createdAtMs: number
  updatedAtMs: number
}

export type CreateDraftMessageInput = Omit<DraftMessage, 'draftId' | 'createdAtMs' | 'updatedAtMs'>
export type UpdateDraftMessageInput = Partial<
  Omit<DraftMessage, 'draftId' | 'userId' | 'createdAtMs' | 'updatedAtMs'>
>

// ----- Sender Persona (AI-researched contact profile) -----

/**
 * AI-researched profile of a message sender/recipient.
 * Built from SERP results, semantic search, and AI synthesis.
 */
export interface SenderPersona {
  personaId: SenderPersonaId
  userId: string
  /** Sender's name */
  name: string
  /** Email or primary identifier */
  email?: string
  /** Professional title */
  title?: string
  /** Company/organization */
  company?: string
  /** Short bio */
  bio?: string
  /** LinkedIn profile URL */
  linkedinUrl?: string
  /** Recent public activity summary */
  recentActivity?: string
  /** Communication style description */
  communicationStyle?: string
  /** Top topics they discuss publicly */
  topTopics: string[]
  /** Notable quotes from public content */
  notableQuotes: string[]
  /** Key professional/personal interests */
  keyInterests: string[]
  /** AI-suggested talking points for conversations */
  suggestedTalkingPoints: string[]
  /** Language analysis from public speeches/posts */
  languageProfile?: {
    formalityLevel: 'very_formal' | 'formal' | 'neutral' | 'casual' | 'very_casual'
    vocabularyComplexity: 'simple' | 'moderate' | 'advanced' | 'technical'
    preferredTopics: string[]
    speakingStyle?: string
  }
  /** When this persona was last researched */
  researchedAtMs: number
  createdAtMs: number
  updatedAtMs: number
}

export type CreateSenderPersonaInput = Omit<
  SenderPersona,
  'personaId' | 'createdAtMs' | 'updatedAtMs'
>

// ----- Mailbox Tone Settings (per-channel writing tone) -----

/**
 * User-configured tone instructions for AI draft generation.
 * Each channel can have its own tone override.
 */
export interface MailboxToneSettings {
  userId: string
  /** Default tone used when no channel override exists */
  defaultTone: string
  /** Per-channel tone overrides */
  channelOverrides: Partial<Record<MessageSource, string>>
  updatedAtMs: number
}

export type UpdateMailboxToneSettingsInput = Partial<
  Omit<MailboxToneSettings, 'userId' | 'updatedAtMs'>
>
