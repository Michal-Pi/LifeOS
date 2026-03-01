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
import type {
  MailboxSyncTrigger,
  MailboxSyncStats,
  ChannelConnectionId,
  MessageSource,
} from '@lifeos/agents'
import type { PrioritizedMessage as AnalyzedMessage, RawMessage } from '../slack/messageAnalyzer.js'
import { NoAPIKeyConfiguredError } from '../agents/providerKeys.js'
import {
  mailboxSyncRef,
  messageBodyRef,
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

const RETENTION_LIMITS: Record<string, number> = {
  gmail: 100,
  slack: 50,
  linkedin: 50,
  whatsapp: 50,
  telegram: 50,
}

const MAX_BACKFILL_PER_CYCLE = 20

function isRateLimitedError(error: unknown): boolean {
  if (!error) return false

  const err = error as Record<string, unknown>
  const status = Number(err.status ?? err.statusCode)
  if (status === 429) return true

  const message = (error instanceof Error ? error.message : String(error)).toLowerCase()
  return (
    message.includes('rate limit') ||
    message.includes('rate_limit') ||
    message.includes('too many requests') ||
    message.includes('status 429') ||
    message.includes(' 429 ')
  )
}

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

    // ----- Fetch & Store Full Bodies (parallel with stats/storage) -----
    const gmailRawMessages = allRawMessages.filter((m) => m.source === 'gmail')
    if (gmailRawMessages.length > 0) {
      const { fetchAndStoreGmailBodies } = await import('./gmailAdapter.js')
      // Group by accountId and fetch bodies
      const byAccount = new Map<string, string[]>()
      for (const m of gmailRawMessages) {
        const ids = byAccount.get(m.accountId) ?? []
        ids.push(m.id)
        byAccount.set(m.accountId, ids)
      }
      for (const [accountId, ids] of byAccount) {
        await fetchAndStoreGmailBodies(userId, accountId, ids)
      }
    }

    // For non-Gmail channels, store body from the raw message directly
    const nonGmailRaw = allRawMessages.filter((m) => m.source !== 'gmail')
    if (nonGmailRaw.length > 0) {
      const db2 = getFirestore()
      const bodyBatch = db2.batch()
      for (const m of nonGmailRaw) {
        bodyBatch.set(
          messageBodyRef(userId, m.id),
          { messageId: m.id, body: m.body, attachmentCount: 0, storedAtMs: Date.now() },
          { merge: true }
        )
      }
      await bodyBatch.commit()
    }

    // Compute stats
    stats.newMessagesFound = prioritizedMessages.length
    stats.messagesRequiringFollowUp = prioritizedMessages.filter((m) => m.requiresFollowUp).length
    stats.highPriorityCount = prioritizedMessages.filter((m) => m.priority === 'high').length
    stats.mediumPriorityCount = prioritizedMessages.filter((m) => m.priority === 'medium').length
    stats.lowPriorityCount = prioritizedMessages.filter((m) => m.priority === 'low').length

    // ----- Store Results -----
    const db = getFirestore()
    const batch = db.batch()

    // Fetch existing message IDs to distinguish new vs existing
    const existingSnap = await prioritizedMessagesCollection(userId).select().get()
    const existingIds = new Set(existingSnap.docs.map((d) => d.id))

    // Upsert prioritized messages (merge to preserve isRead, isDismissed, triageCategoryOverride)
    for (const msg of prioritizedMessages) {
      const messageId = msg.originalMessageId
      const isNew = !existingIds.has(messageId)
      batch.set(
        prioritizedMessageRef(userId, messageId),
        {
          ...msg,
          messageId,
          userId,
          syncId,
          updatedAtMs: Date.now(),
          ...(isNew ? { isRead: false, isDismissed: false, createdAtMs: Date.now() } : {}),
        },
        { merge: true }
      )
    }

    // Count-based retention: keep 100 Gmail + 50 per other channel
    let deletedCount = 0
    for (const [source, limit] of Object.entries(RETENTION_LIMITS)) {
      const allForSource = await prioritizedMessagesCollection(userId)
        .where('source', '==', source)
        .orderBy('receivedAtMs', 'desc')
        .get()

      if (allForSource.size > limit) {
        const toDelete = allForSource.docs.slice(limit)
        toDelete.forEach((doc) => batch.delete(doc.ref))
        deletedCount += toDelete.length
      }
    }

    await batch.commit()
    log.info(
      `Stored ${prioritizedMessages.length} messages, deleted ${deletedCount} overflow messages`
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
    await mailboxSyncRef(userId, syncId).update(
      isRateLimitedError(err)
        ? {
            status: 'failed',
            completedAtMs: Date.now(),
            error: 'RATE_LIMITED',
            retryable: true,
            retryAfterSeconds: 60,
          }
        : {
            status: 'failed',
            completedAtMs: Date.now(),
            error: (err as Error).message,
          }
    )
    throw err
  }
}

// ----- Backfill Pipeline -----

/**
 * Backfill older messages for a specific channel to maintain target count.
 * Called after dismiss/archive to replenish the message pool.
 *
 * 1. Count current non-dismissed messages for the source
 * 2. If below target, find oldest message timestamp
 * 3. Fetch older messages from the adapter using the `before` option
 * 4. Analyze with AI (snippet-only) and store metadata + full bodies
 * 5. Cap at MAX_BACKFILL_PER_CYCLE messages per call
 */
export async function backfillChannel(
  userId: string,
  source: MessageSource
): Promise<{ fetched: number; stored: number }> {
  const targetCount = RETENTION_LIMITS[source]
  if (!targetCount) {
    log.info(`No retention limit defined for source "${source}", skipping backfill`)
    return { fetched: 0, stored: 0 }
  }

  // Count current non-dismissed messages for this source
  const currentSnap = await prioritizedMessagesCollection(userId)
    .where('source', '==', source)
    .where('isDismissed', '==', false)
    .select()
    .get()

  const deficit = targetCount - currentSnap.size
  if (deficit <= 0) {
    log.info(`Source "${source}" has ${currentSnap.size}/${targetCount} messages, no backfill needed`)
    return { fetched: 0, stored: 0 }
  }

  const fetchCount = Math.min(deficit, MAX_BACKFILL_PER_CYCLE)
  log.info(
    `Source "${source}" has ${currentSnap.size}/${targetCount} messages, backfilling ${fetchCount}`
  )

  // Find the oldest message timestamp for this source to use as the "before" boundary
  const oldestSnap = await prioritizedMessagesCollection(userId)
    .where('source', '==', source)
    .orderBy('receivedAtMs', 'asc')
    .limit(1)
    .get()

  let beforeTimestamp: string | undefined
  if (!oldestSnap.empty) {
    const oldestMs = (oldestSnap.docs[0].data() as { receivedAtMs: number }).receivedAtMs
    beforeTimestamp = new Date(oldestMs).toISOString()
  }

  // Load the appropriate adapter and fetch older messages
  const adapters = await loadAdapters()
  let rawMessages: RawMessage[] = []

  try {
    if (source === 'gmail') {
      const connections = await adapters.getGmailConnections(userId)
      for (const conn of connections) {
        const msgs = await adapters.gmailAdapter.fetchMessages(
          userId,
          conn.connectionId as ChannelConnectionId,
          { before: beforeTimestamp, maxResults: fetchCount }
        )
        rawMessages.push(...msgs)
      }
    } else if (source === 'slack') {
      const connections = await adapters.getSlackConnections(userId)
      for (const conn of connections) {
        const msgs = await adapters.slackAdapter.fetchMessages(
          userId,
          conn.connectionId as ChannelConnectionId,
          { before: beforeTimestamp, maxResults: fetchCount }
        )
        rawMessages.push(...msgs)
      }
    } else if (source === 'linkedin') {
      const connections = await adapters.getLinkedInConnections(userId)
      for (const conn of connections) {
        const msgs = await adapters.linkedinAdapter.fetchMessages(
          userId,
          conn.connectionId as ChannelConnectionId,
          { before: beforeTimestamp, maxResults: fetchCount }
        )
        rawMessages.push(...msgs)
      }
    } else if (source === 'whatsapp') {
      const connections = await adapters.getWhatsAppConnections(userId)
      for (const conn of connections) {
        const msgs = await adapters.whatsappAdapter.fetchMessages(
          userId,
          conn.connectionId as ChannelConnectionId,
          { before: beforeTimestamp, maxResults: fetchCount }
        )
        rawMessages.push(...msgs)
      }
    } else if (source === 'telegram') {
      const connections = await adapters.getTelegramConnections(userId)
      for (const conn of connections) {
        const msgs = await adapters.telegramAdapter.fetchMessages(
          userId,
          conn.connectionId as ChannelConnectionId,
          { before: beforeTimestamp, maxResults: fetchCount }
        )
        rawMessages.push(...msgs)
      }
    }
  } catch (err) {
    log.error(`Backfill fetch failed for source "${source}"`, err)
    return { fetched: 0, stored: 0 }
  }

  // Cap to avoid runaway
  rawMessages = rawMessages.slice(0, fetchCount)

  if (rawMessages.length === 0) {
    log.info(`No older messages found for source "${source}"`)
    return { fetched: 0, stored: 0 }
  }

  // Filter out messages we already have
  const existingSnap = await prioritizedMessagesCollection(userId).select().get()
  const existingIds = new Set(existingSnap.docs.map((d) => d.id))
  rawMessages = rawMessages.filter((m) => !existingIds.has(m.id))

  if (rawMessages.length === 0) {
    log.info(`All backfill messages already exist for source "${source}"`)
    return { fetched: 0, stored: 0 }
  }

  log.info(`Analyzing ${rawMessages.length} backfill messages for source "${source}"`)

  // AI analysis
  let prioritizedMessages: AnalyzedMessage[] = []
  try {
    const { analyzeAndPrioritizeMessages } = await import('../slack/messageAnalyzer.js')
    prioritizedMessages = await analyzeAndPrioritizeMessages(userId, rawMessages)
  } catch (err) {
    log.error(`Backfill AI analysis failed for source "${source}"`, err)
    return { fetched: rawMessages.length, stored: 0 }
  }

  // Store results
  const db = getFirestore()
  const batch = db.batch()

  for (const msg of prioritizedMessages) {
    const messageId = msg.originalMessageId
    batch.set(
      prioritizedMessageRef(userId, messageId),
      {
        ...msg,
        messageId,
        userId,
        updatedAtMs: Date.now(),
        isRead: false,
        isDismissed: false,
        createdAtMs: Date.now(),
      },
      { merge: true }
    )
  }

  await batch.commit()

  // Store full bodies for backfilled messages
  if (source === 'gmail') {
    const { fetchAndStoreGmailBodies } = await import('./gmailAdapter.js')
    const byAccount = new Map<string, string[]>()
    for (const m of rawMessages) {
      const ids = byAccount.get(m.accountId) ?? []
      ids.push(m.id)
      byAccount.set(m.accountId, ids)
    }
    for (const [accountId, ids] of byAccount) {
      await fetchAndStoreGmailBodies(userId, accountId, ids)
    }
  } else {
    // Non-Gmail: store body from raw message directly
    const bodyBatch = db.batch()
    for (const m of rawMessages) {
      bodyBatch.set(
        messageBodyRef(userId, m.id),
        { messageId: m.id, body: m.body, attachmentCount: 0, storedAtMs: Date.now() },
        { merge: true }
      )
    }
    await bodyBatch.commit()
  }

  log.info(
    `Backfill complete for "${source}": fetched=${rawMessages.length}, stored=${prioritizedMessages.length}`
  )
  return { fetched: rawMessages.length, stored: prioritizedMessages.length }
}
