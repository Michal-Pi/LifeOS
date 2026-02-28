/**
 * Slack OAuth & Mailbox Sync Endpoints
 *
 * Provides Cloud Functions for:
 * - Slack OAuth flow (start, callback, disconnect)
 * - Mailbox sync (fetch + AI prioritize messages)
 * - Channel management (list, add, remove monitored channels)
 */

import { createLogger } from '../lib/logger.js'
import { randomUUID } from 'node:crypto'
import type { Request, Response } from 'express'
import { getAuth } from 'firebase-admin/auth'
import { Timestamp } from 'firebase-admin/firestore'
import { onRequest } from 'firebase-functions/v2/https'
import {
  slackAccountRef,
  privateSlackAccountRef,
  slackOAuthStateRef,
  slackAppSettingsRef,
  monitoredChannelRef,
  monitoredChannelsCollection,
  prioritizedMessageRef,
  prioritizedMessagesCollection,
} from './paths.js'
import { listAvailableChannels } from './slackApi.js'
import { NoAPIKeyConfiguredError } from '../agents/providerKeys.js'
import type { PrioritizedMessage as StoredMessage } from '@lifeos/agents'
import { runUnifiedSync } from '../channels/unifiedSync.js'

const log = createLogger('SlackEndpoints')

// ----- Configuration -----

const FUNCTION_CONFIG = {
  http: {
    timeoutSeconds: 300,
    memory: '256MiB' as const,
  },
} as const

const SLACK_OAUTH_SCOPES = [
  'channels:history',
  'channels:read',
  'groups:history',
  'groups:read',
  'im:history',
  'im:read',
  'mpim:history',
  'mpim:read',
  'users:read',
].join(',')

// ----- Auth Helper -----

async function verifyAuth(request: Request, response: Response, uid: string): Promise<boolean> {
  try {
    const authHeader = request.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      response.status(401).json({ error: 'Unauthorized: Missing or invalid Authorization header' })
      return false
    }

    const idToken = authHeader.split('Bearer ')[1]
    const decodedToken = await getAuth().verifyIdToken(idToken)

    if (decodedToken.uid !== uid) {
      response.status(403).json({ error: 'Forbidden: User ID mismatch' })
      return false
    }

    return true
  } catch (error) {
    response.status(401).json({
      error: 'Unauthorized: Invalid or expired token',
      details: (error as Error).message,
    })
    return false
  }
}

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

// ----- Helper: Get Slack Credentials -----

interface SlackAppCredentials {
  clientId: string
  clientSecret: string
}

/**
 * Gets the Slack App credentials from user settings.
 * Each user must configure their own Slack App in Settings.
 */
async function getSlackCredentials(uid: string): Promise<SlackAppCredentials | null> {
  const userSettings = await slackAppSettingsRef(uid).get()
  if (!userSettings.exists) {
    return null
  }

  const data = userSettings.data() as {
    clientId?: string
    clientSecret?: string
    isConfigured?: boolean
  }

  if (data?.isConfigured && data?.clientId && data?.clientSecret) {
    return {
      clientId: data.clientId,
      clientSecret: data.clientSecret,
    }
  }

  return null
}

// ----- OAuth Endpoints -----

/**
 * Start Slack OAuth flow
 * POST /slackAuthStart
 * Body: { uid: string }
 */
export const slackAuthStart = onRequest(
  {
    ...FUNCTION_CONFIG.http,
    cors: true,
  },
  async (request, response) => {
    const uid = String(request.query.uid ?? request.body?.uid ?? '')

    if (!uid) {
      response.status(400).json({ error: 'Missing uid parameter' })
      return
    }

    // Verify the user is authenticated
    if (!(await verifyAuth(request, response, uid))) {
      return
    }

    // Get credentials from user settings
    const credentials = await getSlackCredentials(uid)
    if (!credentials) {
      response.status(400).json({
        error: 'Slack App not configured',
        message: 'Please configure your Slack App credentials in Settings.',
      })
      return
    }

    // Generate state nonce and store in Firestore
    const nonce = randomUUID()
    await slackOAuthStateRef(nonce).set({
      uid,
      createdAt: Timestamp.now(),
      expiresAt: Timestamp.fromMillis(Date.now() + 10 * 60 * 1000), // 10 minutes
    })

    // Build OAuth URL
    // Using Add to Slack button flow
    const redirectUri = `https://us-central1-lifeos-pi.cloudfunctions.net/slackAuthCallback`
    const url = new URL('https://slack.com/oauth/v2/authorize')
    url.searchParams.set('client_id', credentials.clientId)
    url.searchParams.set('scope', SLACK_OAUTH_SCOPES)
    url.searchParams.set('redirect_uri', redirectUri)
    url.searchParams.set('state', nonce)

    response.json({ url: url.toString() })
  }
)

/**
 * Handle Slack OAuth callback
 * GET /slackAuthCallback?code=xxx&state=xxx
 */
export const slackAuthCallback = onRequest(
  {
    ...FUNCTION_CONFIG.http,
  },
  async (request, response) => {
    const code = String(request.query.code ?? '')
    const state = String(request.query.state ?? '')
    const error = String(request.query.error ?? '')

    // Handle user cancellation
    if (error) {
      response.redirect('https://lifeos-pi.web.app/settings?slack=cancelled')
      return
    }

    if (!code || !state) {
      response.status(400).json({ error: 'Missing code or state parameter' })
      return
    }

    // Validate state
    const stateSnap = await slackOAuthStateRef(state).get()
    if (!stateSnap.exists) {
      response.status(400).json({ error: 'Invalid or expired state' })
      return
    }

    const stateData = stateSnap.data() as {
      uid: string
      expiresAt: Timestamp
    }
    const { uid } = stateData

    // Check expiration
    if (stateData.expiresAt.toMillis() < Date.now()) {
      await slackOAuthStateRef(state).delete()
      response.status(400).json({ error: 'OAuth state expired' })
      return
    }

    // Get credentials from user settings
    const credentials = await getSlackCredentials(uid)
    if (!credentials) {
      response.status(500).json({ error: 'Slack App credentials not found' })
      return
    }

    const redirectUri = 'https://us-central1-lifeos-pi.cloudfunctions.net/slackAuthCallback'

    try {
      const tokenResponse = await fetch('https://slack.com/api/oauth.v2.access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: credentials.clientId,
          client_secret: credentials.clientSecret,
          code,
          redirect_uri: redirectUri,
        }),
      })

      const tokenData = (await tokenResponse.json()) as {
        ok: boolean
        error?: string
        access_token?: string
        refresh_token?: string
        expires_in?: number
        team?: { id: string; name: string }
        authed_user?: { id: string }
        bot_user_id?: string
      }

      if (!tokenData.ok || !tokenData.access_token) {
        throw new Error(tokenData.error ?? 'Failed to exchange code for token')
      }

      const workspaceId = tokenData.team?.id ?? ''
      const now = new Date()

      // Store private credentials
      await privateSlackAccountRef(uid, workspaceId).set({
        botToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token ?? null,
        expiryDate: tokenData.expires_in
          ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
          : null,
        status: 'connected',
        updatedAt: now.toISOString(),
      })

      // Store public metadata
      await slackAccountRef(uid, workspaceId).set({
        provider: 'slack',
        status: 'connected',
        teamId: workspaceId,
        teamName: tokenData.team?.name ?? 'Unknown Workspace',
        botUserId: tokenData.bot_user_id ?? null,
        authedUserId: tokenData.authed_user?.id ?? null,
        lastSuccessAt: now.toISOString(),
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
        lastSyncMs: null,
      })

      // Clean up state
      await slackOAuthStateRef(state).delete()

      // Redirect to settings with success
      response.redirect(`https://lifeos-pi.web.app/settings?slack=success&workspace=${workspaceId}`)
    } catch (err) {
      log.error('Slack OAuth error', err)
      response.redirect(
        `https://lifeos-pi.web.app/settings?slack=error&message=${encodeURIComponent((err as Error).message)}`
      )
    }
  }
)

/**
 * Disconnect a Slack workspace
 * POST /slackDisconnect
 * Body: { uid: string, workspaceId: string }
 */
export const slackDisconnect = onRequest(
  {
    ...FUNCTION_CONFIG.http,
    cors: true,
  },
  async (request, response) => {
    const uid = String(request.body?.uid ?? '')
    const workspaceId = String(request.body?.workspaceId ?? '')

    if (!uid || !workspaceId) {
      response.status(400).json({ error: 'Missing uid or workspaceId' })
      return
    }

    if (!(await verifyAuth(request, response, uid))) {
      return
    }

    try {
      // Delete private credentials
      await privateSlackAccountRef(uid, workspaceId).delete()

      // Update public metadata
      await slackAccountRef(uid, workspaceId).update({
        status: 'disconnected',
        updatedAt: new Date().toISOString(),
      })

      // Delete monitored channels
      const channelsSnap = await monitoredChannelsCollection(uid, workspaceId).get()
      const batch = (await import('firebase-admin/firestore')).getFirestore().batch()
      channelsSnap.docs.forEach((doc) => batch.delete(doc.ref))
      await batch.commit()

      response.json({ success: true })
    } catch (err) {
      log.error('Slack disconnect error', err)
      response.status(500).json({ error: (err as Error).message })
    }
  }
)

// ----- Channel Management -----

/**
 * List available channels for a workspace
 * GET /slackListChannels?uid=xxx&workspaceId=xxx
 */
export const slackListChannels = onRequest(
  {
    ...FUNCTION_CONFIG.http,
    cors: true,
  },
  async (request, response) => {
    const uid = String(request.query.uid ?? '')
    const workspaceId = String(request.query.workspaceId ?? '')

    if (!uid || !workspaceId) {
      response.status(400).json({ error: 'Missing uid or workspaceId' })
      return
    }

    if (!(await verifyAuth(request, response, uid))) {
      return
    }

    try {
      const channels = await listAvailableChannels(uid, workspaceId)

      // Get currently monitored channels
      const monitoredSnap = await monitoredChannelsCollection(uid, workspaceId).get()
      const monitoredIds = new Set(monitoredSnap.docs.map((d) => d.id))

      response.json({
        channels: channels.map((ch) => ({
          ...ch,
          isMonitored: monitoredIds.has(ch.id),
        })),
      })
    } catch (err) {
      log.error('Error listing channels', err)
      response.status(500).json({ error: (err as Error).message })
    }
  }
)

/**
 * Add a channel to monitored list
 * POST /slackAddChannel
 * Body: { uid, workspaceId, channelId, channelName, isPrivate }
 */
export const slackAddChannel = onRequest(
  {
    ...FUNCTION_CONFIG.http,
    cors: true,
  },
  async (request, response) => {
    const { uid, workspaceId, channelId, channelName, isPrivate } = request.body ?? {}

    if (!uid || !workspaceId || !channelId) {
      response.status(400).json({ error: 'Missing required parameters' })
      return
    }

    if (!(await verifyAuth(request, response, uid))) {
      return
    }

    try {
      await monitoredChannelRef(uid, workspaceId, channelId).set({
        channelId,
        channelName: channelName ?? channelId,
        isPrivate: isPrivate ?? false,
        addedAtMs: Date.now(),
      })

      response.json({ success: true })
    } catch (err) {
      response.status(500).json({ error: (err as Error).message })
    }
  }
)

/**
 * Remove a channel from monitored list
 * POST /slackRemoveChannel
 * Body: { uid, workspaceId, channelId }
 */
export const slackRemoveChannel = onRequest(
  {
    ...FUNCTION_CONFIG.http,
    cors: true,
  },
  async (request, response) => {
    const { uid, workspaceId, channelId } = request.body ?? {}

    if (!uid || !workspaceId || !channelId) {
      response.status(400).json({ error: 'Missing required parameters' })
      return
    }

    if (!(await verifyAuth(request, response, uid))) {
      return
    }

    try {
      await monitoredChannelRef(uid, workspaceId, channelId).delete()
      response.json({ success: true })
    } catch (err) {
      response.status(500).json({ error: (err as Error).message })
    }
  }
)

// ----- Mailbox Sync -----

/**
 * Trigger mailbox sync - fetches messages from all connected sources and prioritizes them
 * POST /mailboxSync
 * Body: { uid: string, triggerType?: 'manual' | 'scheduled' | 'page_load' }
 *
 * Delegates to the unified sync pipeline in channels/unifiedSync.ts
 * which orchestrates all channel adapters (Gmail, Slack, and future channels).
 */
export const mailboxSync = onRequest(
  {
    ...FUNCTION_CONFIG.http,
    cors: true,
    secrets: ['GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_SECRET', 'GOOGLE_OAUTH_REDIRECT_URI'],
  },
  async (request, response) => {
    const uid = String(request.body?.uid ?? '')
    const triggerType = (request.body?.triggerType ?? 'manual') as
      | 'manual'
      | 'scheduled'
      | 'page_load'

    if (!uid) {
      response.status(400).json({ error: 'Missing uid' })
      return
    }

    if (!(await verifyAuth(request, response, uid))) {
      return
    }

    try {
      const result = await runUnifiedSync(uid, triggerType)

      response.json({
        success: true,
        syncId: result.syncId,
        stats: result.stats,
        messages: result.messages.slice(0, 10), // Return top 10
      })
    } catch (err) {
      log.error('Mailbox sync error', err)

      if (err instanceof NoAPIKeyConfiguredError) {
        response.status(400).json({
          error: 'NO_API_KEY_CONFIGURED',
          message:
            'No AI provider API key configured. Please add your API key in Settings → Model Settings.',
          requiresSetup: true,
        })
        return
      }

      if (isRateLimitedError(err)) {
        response.status(429).json({
          error: 'RATE_LIMITED',
          message:
            'Mailbox sync is temporarily rate-limited by your AI provider. Please retry shortly.',
          retryable: true,
          retryAfterSeconds: 60,
        })
        return
      }

      response.status(500).json({ error: (err as Error).message })
    }
  }
)

/**
 * Get prioritized messages for a user
 * GET /mailboxMessages?uid=xxx&limit=10&includeRead=false
 */
export const mailboxMessages = onRequest(
  {
    ...FUNCTION_CONFIG.http,
    cors: true,
  },
  async (request, response) => {
    const uid = String(request.query.uid ?? '')
    const limit = parseInt(String(request.query.limit ?? '10'), 10)
    const includeRead = request.query.includeRead === 'true'
    const includeDismissed = request.query.includeDismissed === 'true'

    if (!uid) {
      response.status(400).json({ error: 'Missing uid' })
      return
    }

    if (!(await verifyAuth(request, response, uid))) {
      return
    }

    try {
      let query = prioritizedMessagesCollection(uid).orderBy('receivedAtMs', 'desc').limit(limit)

      if (!includeDismissed) {
        query = query.where('isDismissed', '==', false)
      }

      const snapshot = await query.get()
      const messages = snapshot.docs.map((doc) => doc.data() as StoredMessage)

      // Filter out read messages if needed (client-side since compound queries are complex)
      const filteredMessages = includeRead ? messages : messages.filter((m) => !m.isRead)

      response.json({ messages: filteredMessages })
    } catch (err) {
      response.status(500).json({ error: (err as Error).message })
    }
  }
)

/**
 * Mark a message as read
 * POST /mailboxMarkRead
 * Body: { uid, messageId }
 */
export const mailboxMarkRead = onRequest(
  {
    ...FUNCTION_CONFIG.http,
    cors: true,
  },
  async (request, response) => {
    const { uid, messageId } = request.body ?? {}

    if (!uid || !messageId) {
      response.status(400).json({ error: 'Missing uid or messageId' })
      return
    }

    if (!(await verifyAuth(request, response, uid))) {
      return
    }

    try {
      await prioritizedMessageRef(uid, messageId).update({
        isRead: true,
        updatedAtMs: Date.now(),
      })
      response.json({ success: true })
    } catch (err) {
      response.status(500).json({ error: (err as Error).message })
    }
  }
)

/**
 * Dismiss a message (remove from follow-up list)
 * POST /mailboxDismiss
 * Body: { uid, messageId }
 */
export const mailboxDismiss = onRequest(
  {
    ...FUNCTION_CONFIG.http,
    cors: true,
  },
  async (request, response) => {
    const { uid, messageId } = request.body ?? {}

    if (!uid || !messageId) {
      response.status(400).json({ error: 'Missing uid or messageId' })
      return
    }

    if (!(await verifyAuth(request, response, uid))) {
      return
    }

    try {
      await prioritizedMessageRef(uid, messageId).update({
        isDismissed: true,
        updatedAtMs: Date.now(),
      })
      response.json({ success: true })
    } catch (err) {
      response.status(500).json({ error: (err as Error).message })
    }
  }
)
