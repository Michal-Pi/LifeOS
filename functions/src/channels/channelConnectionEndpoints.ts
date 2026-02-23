/**
 * Channel Connection Management Endpoints
 *
 * CRUD endpoints for managing LinkedIn, Telegram, and WhatsApp
 * connections in the `channelConnections` Firestore collection.
 *
 * - channelConnectionCreate: Validate credentials, test connectivity, store connection
 * - channelConnectionDelete: Remove a connection document
 * - channelConnectionTest: Re-validate credentials and update status
 */

import { createLogger } from '../lib/logger.js'
import type { Request, Response } from 'express'
import { getAuth } from 'firebase-admin/auth'
import { onRequest } from 'firebase-functions/v2/https'
import type { MessageSource, ChannelAuthMethod } from '@lifeos/agents'
import { channelConnectionRef } from '../slack/paths.js'
import { randomUUID } from 'crypto'

const log = createLogger('ChannelConnection')

// ----- Configuration -----

const FUNCTION_CONFIG = {
  http: {
    timeoutSeconds: 300,
    memory: '256MiB' as const,
  },
} as const

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
      response.status(403).json({ error: 'Forbidden: User mismatch' })
      return false
    }

    return true
  } catch {
    response.status(401).json({ error: 'Unauthorized: Invalid or expired token' })
    return false
  }
}

// ----- Credential Validation -----

const VOYAGER_BASE = 'https://www.linkedin.com/voyager/api'
const TELEGRAM_API = 'https://api.telegram.org'

/**
 * Validate LinkedIn credentials by calling the Voyager /me endpoint.
 * Returns display name on success, throws on failure.
 */
async function validateLinkedIn(
  liAtCookie: string,
  csrfToken?: string
): Promise<{ displayName: string }> {
  const headers: Record<string, string> = {
    Cookie: `li_at=${liAtCookie}`,
    Accept: 'application/json',
  }
  if (csrfToken) {
    headers['csrf-token'] = csrfToken
  }

  const res = await fetch(`${VOYAGER_BASE}/me`, { headers })

  if (res.status === 401 || res.status === 403) {
    throw new Error(
      'LinkedIn session cookie is invalid or expired. Please re-enter your li_at cookie.'
    )
  }
  if (!res.ok) {
    throw new Error(`LinkedIn API returned status ${res.status}`)
  }

  const data = (await res.json()) as { firstName?: string; lastName?: string }
  const displayName = [data.firstName, data.lastName].filter(Boolean).join(' ') || 'LinkedIn'

  return { displayName }
}

/**
 * Validate Telegram bot token by calling the getMe endpoint.
 * Returns bot username on success, throws on failure.
 */
async function validateTelegram(
  botToken: string
): Promise<{ botUsername: string; displayName: string }> {
  const res = await fetch(`${TELEGRAM_API}/bot${botToken}/getMe`)
  const data = (await res.json()) as {
    ok: boolean
    result?: { username?: string; first_name?: string }
    description?: string
  }

  if (!data.ok) {
    throw new Error(data.description || 'Invalid Telegram bot token')
  }

  const botUsername = data.result?.username || ''
  const displayName = data.result?.first_name
    ? `@${data.result.username || data.result.first_name}`
    : 'Telegram Bot'

  return { botUsername, displayName }
}

/**
 * Validate WhatsApp companion service by calling the /api/status endpoint.
 * Returns status on success, throws on failure.
 */
async function validateWhatsApp(companionServiceUrl: string): Promise<{ status: string }> {
  try {
    const res = await fetch(`${companionServiceUrl}/api/status`, {
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) {
      throw new Error(`Companion service returned status ${res.status}`)
    }
    const data = (await res.json()) as { status?: string }
    return { status: data.status || 'unknown' }
  } catch (err) {
    if (err instanceof Error && err.name === 'TimeoutError') {
      throw new Error('WhatsApp companion service did not respond within 10 seconds')
    }
    throw new Error(
      `Cannot reach WhatsApp companion service at ${companionServiceUrl}: ${(err as Error).message}`
    )
  }
}

// ----- Endpoints -----

/**
 * Create a new channel connection.
 * POST /channelConnectionCreate
 * Body: { uid, source, displayName?, credentials, config? }
 */
export const channelConnectionCreate = onRequest(
  { ...FUNCTION_CONFIG.http, cors: true },
  async (request, response) => {
    const { uid, source, displayName: inputDisplayName, credentials, config } = request.body ?? {}

    if (!uid || !source || !credentials) {
      response.status(400).json({ error: 'Missing required fields: uid, source, credentials' })
      return
    }

    if (!(await verifyAuth(request, response, uid))) return

    const src = source as MessageSource

    // Validate per-source required credentials
    let authMethod: ChannelAuthMethod
    let resolvedDisplayName = inputDisplayName || ''

    try {
      switch (src) {
        case 'linkedin': {
          if (!credentials.liAtCookie) {
            response.status(400).json({ error: 'Missing required credential: liAtCookie' })
            return
          }
          authMethod = 'cookie'
          const linkedinResult = await validateLinkedIn(
            credentials.liAtCookie,
            credentials.csrfToken
          )
          resolvedDisplayName = resolvedDisplayName || linkedinResult.displayName
          break
        }

        case 'telegram': {
          if (!credentials.botToken) {
            response.status(400).json({ error: 'Missing required credential: botToken' })
            return
          }
          authMethod = 'bot_token'
          const telegramResult = await validateTelegram(credentials.botToken)
          credentials.botUsername = telegramResult.botUsername
          resolvedDisplayName = resolvedDisplayName || telegramResult.displayName
          break
        }

        case 'whatsapp': {
          const companionUrl = config?.companionServiceUrl as string | undefined
          if (!companionUrl) {
            response.status(400).json({ error: 'Missing required config: companionServiceUrl' })
            return
          }
          authMethod = 'qr_code'
          await validateWhatsApp(companionUrl)
          resolvedDisplayName = resolvedDisplayName || credentials.phoneNumber || 'WhatsApp'
          break
        }

        default:
          response
            .status(400)
            .json({ error: `Unsupported source: ${source}. Use linkedin, telegram, or whatsapp.` })
          return
      }
    } catch (err) {
      log.warn('Connection validation failed', {
        source: src,
        error: (err as Error).message,
      })
      response.status(400).json({
        error: (err as Error).message,
      })
      return
    }

    // Write to Firestore
    const connectionId = randomUUID()
    const now = Date.now()

    const connectionData = {
      connectionId,
      userId: uid,
      source: src,
      authMethod,
      status: 'connected',
      displayName: resolvedDisplayName,
      credentials,
      config: config || null,
      lastSyncMs: null,
      errorMessage: null,
      createdAtMs: now,
      updatedAtMs: now,
    }

    try {
      await channelConnectionRef(uid, connectionId).set(connectionData)

      log.info('Channel connection created', {
        userId: uid,
        source: src,
        connectionId,
      })

      response.json({
        success: true,
        connectionId,
        displayName: resolvedDisplayName,
      })
    } catch (err) {
      log.error('Failed to create channel connection', err)
      response.status(500).json({ error: (err as Error).message })
    }
  }
)

/**
 * Delete a channel connection.
 * POST /channelConnectionDelete
 * Body: { uid, connectionId }
 */
export const channelConnectionDelete = onRequest(
  { ...FUNCTION_CONFIG.http, cors: true },
  async (request, response) => {
    const { uid, connectionId } = request.body ?? {}

    if (!uid || !connectionId) {
      response.status(400).json({ error: 'Missing required fields: uid, connectionId' })
      return
    }

    if (!(await verifyAuth(request, response, uid))) return

    try {
      const docRef = channelConnectionRef(uid, connectionId)
      const doc = await docRef.get()

      if (!doc.exists) {
        response.status(404).json({ error: 'Connection not found' })
        return
      }

      await docRef.delete()

      log.info('Channel connection deleted', {
        userId: uid,
        connectionId,
        source: doc.data()?.source,
      })

      response.json({ success: true })
    } catch (err) {
      log.error('Failed to delete channel connection', err)
      response.status(500).json({ error: (err as Error).message })
    }
  }
)

/**
 * Test an existing channel connection by re-validating credentials.
 * POST /channelConnectionTest
 * Body: { uid, connectionId }
 */
export const channelConnectionTest = onRequest(
  { ...FUNCTION_CONFIG.http, cors: true },
  async (request, response) => {
    const { uid, connectionId } = request.body ?? {}

    if (!uid || !connectionId) {
      response.status(400).json({ error: 'Missing required fields: uid, connectionId' })
      return
    }

    if (!(await verifyAuth(request, response, uid))) return

    try {
      const docRef = channelConnectionRef(uid, connectionId)
      const doc = await docRef.get()

      if (!doc.exists) {
        response.status(404).json({ error: 'Connection not found' })
        return
      }

      const data = doc.data()!
      const src = data.source as MessageSource
      let newStatus = 'connected'
      let errorMessage: string | null = null

      try {
        switch (src) {
          case 'linkedin':
            await validateLinkedIn(data.credentials?.liAtCookie, data.credentials?.csrfToken)
            break

          case 'telegram':
            await validateTelegram(data.credentials?.botToken)
            break

          case 'whatsapp':
            await validateWhatsApp(data.config?.companionServiceUrl as string)
            break

          default:
            response.status(400).json({ error: `Cannot test source: ${src}` })
            return
        }
      } catch (err) {
        newStatus = src === 'linkedin' ? 'expired' : 'error'
        errorMessage = (err as Error).message
      }

      await docRef.update({
        status: newStatus,
        errorMessage,
        updatedAtMs: Date.now(),
      })

      log.info('Channel connection tested', {
        userId: uid,
        connectionId,
        source: src,
        status: newStatus,
      })

      response.json({
        success: true,
        status: newStatus,
        errorMessage,
      })
    } catch (err) {
      log.error('Failed to test channel connection', err)
      response.status(500).json({ error: (err as Error).message })
    }
  }
)
