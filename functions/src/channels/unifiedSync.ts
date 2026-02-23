/**
 * Unified Mailbox Sync Pipeline
 *
 * Orchestrates message fetching across all connected channel adapters,
 * delegates to AI analysis, and stores prioritized results.
 *
 * This replaces the inline sync logic previously in slackEndpoints.ts.
 * Channel-agnostic: iterates over registered adapters without hardcoding
 * any channel-specific logic.
 */

import { createLogger } from '../lib/logger.js'
import { randomUUID } from 'node:crypto'
import { getFirestore } from 'firebase-admin/firestore'
import type { MailboxSyncTrigger, MailboxSyncStats, ChannelConnectionId } from '@lifeos/agents'
import type {
  PrioritizedMessage as AnalyzedMessage,
  RawMessage,
} from '../slack/messageAnalyzer.js'
import { NoAPIKeyConfiguredError } from '../agents/providerKeys.js'
import {
  mailboxSyncRef,
  prioritizedMessageRef,
  prioritizedMessagesCollection,
} from '../slack/paths.js'
// Adapters are loaded lazily to avoid pulling all channel modules at init time,
// which would cause Firebase function discovery to timeout.
async function loadAdapters() {
  const [gmail, slack, linkedin, whatsapp, telegram] = await Promise.all([
    import('./gmailAdapter.js'),
    import('./slackAdapter.js'),
    import('./linkedinAdapter.js'),
    import('./whatsappAdapter.js'),
    import('./telegramAdapter.js'),
  ])
  return {
    gmailAdapter: gmail.gmailAdapter,
    getGmailConnections: gmail.getGmailConnections,
    slackAdapter: slack.slackAdapter,
    getSlackConnections: slack.getSlackConnections,
    linkedinAdapter: linkedin.linkedinAdapter,
    getLinkedInConnections: linkedin.getLinkedInConnections,
    whatsappAdapter: whatsapp.whatsappAdapter,
    getWhatsAppConnections: whatsapp.getWhatsAppConnections,
    telegramAdapter: telegram.telegramAdapter,
    getTelegramConnections: telegram.getTelegramConnections,
  }
}

const log = createLogger('UnifiedSync')

// ----- Types -----

export interface UnifiedSyncResult {
  syncId: string
  stats: MailboxSyncStats
  messages: AnalyzedMessage[]
}

// ----- Main Sync Pipeline -----

/**
 * Run a unified mailbox sync across all connected channels.
 *
 * Pipeline:
 * 1. Create sync record
 * 2. Discover connections for each channel adapter
 * 3. Fetch messages from all connections
 * 4. Analyze & prioritize with AI
 * 5. Store prioritized messages (clearing stale ones)
 * 6. Update sync record with stats
 *
 * @param userId - LifeOS user ID
 * @param triggerType - What triggered this sync
 * @returns Sync result with stats and top messages
 * @throws NoAPIKeyConfiguredError if no AI provider is configured
 */
export async function runUnifiedSync(
  userId: string,
  triggerType: MailboxSyncTrigger
): Promise<UnifiedSyncResult> {
  const adapters = await loadAdapters()
  const syncId = randomUUID()
  const startedAtMs = Date.now()

  const stats: MailboxSyncStats = {
    gmailAccountsProcessed: 0,
    slackWorkspacesProcessed: 0,
    linkedinAccountsProcessed: 0,
    whatsappAccountsProcessed: 0,
    telegramAccountsProcessed: 0,
    totalMessagesScanned: 0,
    newMessagesFound: 0,
    messagesRequiringFollowUp: 0,
    highPriorityCount: 0,
    mediumPriorityCount: 0,
    lowPriorityCount: 0,
  }

  // Create sync record
  await mailboxSyncRef(userId, syncId).set({
    syncId,
    userId,
    triggerType,
    status: 'running',
    startedAtMs,
    stats,
  })

  try {
    const allRawMessages: RawMessage[] = []

    // ----- Fetch from Gmail -----
    const gmailConnections = await adapters.getGmailConnections(userId)
    stats.gmailAccountsProcessed = gmailConnections.length
    log.info(`Found ${gmailConnections.length} Gmail connections`)

    for (const conn of gmailConnections) {
      const messages = await adapters.gmailAdapter.fetchMessages(
        userId,
        conn.connectionId as ChannelConnectionId
      )
      allRawMessages.push(...messages)
    }

    // ----- Fetch from Slack -----
    const slackConnections = await adapters.getSlackConnections(userId)
    stats.slackWorkspacesProcessed = slackConnections.length
    log.info(`Found ${slackConnections.length} Slack connections`)

    for (const conn of slackConnections) {
      const messages = await adapters.slackAdapter.fetchMessages(
        userId,
        conn.connectionId as ChannelConnectionId
      )
      allRawMessages.push(...messages)
    }

    // ----- Fetch from LinkedIn -----
    const linkedinConnections = await adapters.getLinkedInConnections(userId)
    stats.linkedinAccountsProcessed = linkedinConnections.length
    log.info(`Found ${linkedinConnections.length} LinkedIn connections`)

    for (const conn of linkedinConnections) {
      const messages = await adapters.linkedinAdapter.fetchMessages(
        userId,
        conn.connectionId as ChannelConnectionId
      )
      allRawMessages.push(...messages)
    }

    // ----- Fetch from WhatsApp -----
    const whatsappConnections = await adapters.getWhatsAppConnections(userId)
    stats.whatsappAccountsProcessed = whatsappConnections.length
    log.info(`Found ${whatsappConnections.length} WhatsApp connections`)

    for (const conn of whatsappConnections) {
      const messages = await adapters.whatsappAdapter.fetchMessages(
        userId,
        conn.connectionId as ChannelConnectionId
      )
      allRawMessages.push(...messages)
    }

    // ----- Fetch from Telegram -----
    const telegramConnections = await adapters.getTelegramConnections(userId)
    stats.telegramAccountsProcessed = telegramConnections.length
    log.info(`Found ${telegramConnections.length} Telegram connections`)

    for (const conn of telegramConnections) {
      const messages = await adapters.telegramAdapter.fetchMessages(
        userId,
        conn.connectionId as ChannelConnectionId
      )
      allRawMessages.push(...messages)
    }

    stats.totalMessagesScanned = allRawMessages.length
    log.info(`Total raw messages: ${allRawMessages.length}`, {
      gmail: allRawMessages.filter((m) => m.source === 'gmail').length,
      slack: allRawMessages.filter((m) => m.source === 'slack').length,
      linkedin: allRawMessages.filter((m) => m.source === 'linkedin').length,
      whatsapp: allRawMessages.filter((m) => m.source === 'whatsapp').length,
      telegram: allRawMessages.filter((m) => m.source === 'telegram').length,
    })

    // ----- AI Analysis -----
    let prioritizedMessages: AnalyzedMessage[] = []
    if (allRawMessages.length > 0) {
      const { analyzeAndPrioritizeMessages } = await import('../slack/messageAnalyzer.js')
      prioritizedMessages = await analyzeAndPrioritizeMessages(userId, allRawMessages)
    }

    log.info(`AI returned ${prioritizedMessages.length} prioritized messages`)

    // Compute stats
    stats.newMessagesFound = prioritizedMessages.length
    stats.messagesRequiringFollowUp = prioritizedMessages.filter((m) => m.requiresFollowUp).length
    stats.highPriorityCount = prioritizedMessages.filter((m) => m.priority === 'high').length
    stats.mediumPriorityCount = prioritizedMessages.filter((m) => m.priority === 'medium').length
    stats.lowPriorityCount = prioritizedMessages.filter((m) => m.priority === 'low').length

    // ----- Store Results -----
    const db = getFirestore()
    const batch = db.batch()

    // Clear stale messages (older than 7 days)
    const oldMessagesSnap = await prioritizedMessagesCollection(userId)
      .where('receivedAtMs', '<', Date.now() - 7 * 24 * 60 * 60 * 1000)
      .get()
    oldMessagesSnap.docs.forEach((doc) => batch.delete(doc.ref))

    // Add new prioritized messages
    for (const msg of prioritizedMessages) {
      const messageId = msg.originalMessageId
      batch.set(prioritizedMessageRef(userId, messageId), {
        ...msg,
        messageId,
        userId,
        isRead: false,
        isDismissed: false,
        syncId,
        createdAtMs: Date.now(),
        updatedAtMs: Date.now(),
      })
    }

    await batch.commit()
    log.info(
      `Stored ${prioritizedMessages.length} messages, deleted ${oldMessagesSnap.size} stale messages`
    )

    // ----- Update Sync Record -----
    await mailboxSyncRef(userId, syncId).update({
      status: 'completed',
      completedAtMs: Date.now(),
      stats,
    })

    return { syncId, stats, messages: prioritizedMessages }
  } catch (err) {
    // Handle NoAPIKeyConfiguredError specially for frontend
    if (err instanceof NoAPIKeyConfiguredError) {
      await mailboxSyncRef(userId, syncId).update({
        status: 'failed',
        completedAtMs: Date.now(),
        error: 'NO_API_KEY_CONFIGURED',
      })
      throw err
    }

    // Generic error handling
    log.error('Sync error', err)
    await mailboxSyncRef(userId, syncId).update({
      status: 'failed',
      completedAtMs: Date.now(),
      error: (err as Error).message,
    })
    throw err
  }
}
