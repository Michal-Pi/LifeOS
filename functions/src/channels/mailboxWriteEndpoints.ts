/**
 * Mailbox Write Endpoints
 *
 * Cloud Functions for:
 * - mailboxSend: Send a message via a channel adapter
 * - mailboxDelete: Delete/trash a message via a channel adapter
 * - mailboxSaveDraft: Save or update a composer draft
 * - mailboxDeleteDraft: Delete a saved draft
 */

import { createLogger } from '../lib/logger.js'
import type { Request, Response } from 'express'
import { getAuth } from 'firebase-admin/auth'
import { onRequest } from 'firebase-functions/v2/https'
import type { MessageSource, ChannelConnectionId } from '@lifeos/agents'
import { prioritizedMessageRef, mailboxDraftRef, mailboxDraftsCollection } from '../slack/paths.js'

const log = createLogger('MailboxWrite')

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

// ----- Channel Adapter Registry -----

async function getAdapter(source: MessageSource) {
  switch (source) {
    case 'gmail':
      return (await import('./gmailAdapter.js')).gmailAdapter
    case 'linkedin':
      return (await import('./linkedinAdapter.js')).linkedinAdapter
    case 'telegram':
      return (await import('./telegramAdapter.js')).telegramAdapter
    case 'whatsapp':
      return (await import('./whatsappAdapter.js')).whatsappAdapter
    default:
      return null
  }
}

// ----- Endpoints -----

/**
 * Send a message through a channel adapter
 * POST /mailboxSend
 * Body: { uid, source, recipientId, recipientName?, subject?, body, htmlBody?, inReplyTo?, threadId? }
 */
export const mailboxSend = onRequest(
  {
    ...FUNCTION_CONFIG.http,
    cors: true,
    secrets: ['GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_SECRET', 'GOOGLE_OAUTH_REDIRECT_URI'],
  },
  async (request, response) => {
    const {
      uid,
      source,
      connectionId,
      recipientId,
      recipientName,
      subject,
      body,
      htmlBody,
      inReplyTo,
      threadId,
    } = request.body ?? {}

    if (!uid || !source || !recipientId || !body) {
      response
        .status(400)
        .json({ error: 'Missing required fields: uid, source, recipientId, body' })
      return
    }

    if (!(await verifyAuth(request, response, uid))) return

    const adapter = await getAdapter(source as MessageSource)
    if (!adapter) {
      response.status(400).json({ error: `Channel "${source}" does not support sending yet` })
      return
    }

    try {
      const result = await adapter.sendMessage(uid, {
        source: source as MessageSource,
        connectionId: (connectionId ?? '') as ChannelConnectionId,
        recipientId,
        recipientName,
        subject,
        body,
        htmlBody,
        inReplyTo,
        threadId,
      })

      response.json({ success: true, messageId: result.messageId })
    } catch (err) {
      log.error('mailboxSend error', err)
      response.status(500).json({ error: (err as Error).message })
    }
  }
)

/**
 * Delete (trash) a message through a channel adapter
 * POST /mailboxDelete
 * Body: { uid, source, connectionId, messageId }
 */
export const mailboxDelete = onRequest(
  {
    ...FUNCTION_CONFIG.http,
    cors: true,
    secrets: ['GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_SECRET', 'GOOGLE_OAUTH_REDIRECT_URI'],
  },
  async (request, response) => {
    const { uid, source, connectionId, messageId } = request.body ?? {}

    if (!uid || !source || !messageId) {
      response.status(400).json({ error: 'Missing required fields: uid, source, messageId' })
      return
    }

    if (!(await verifyAuth(request, response, uid))) return

    const adapter = await getAdapter(source as MessageSource)
    if (!adapter) {
      response.status(400).json({ error: `Channel "${source}" does not support deletion yet` })
      return
    }

    try {
      const deleted = await adapter.deleteMessage(
        uid,
        (connectionId ?? '') as ChannelConnectionId,
        messageId
      )

      // Also mark as dismissed in our Firestore copy
      try {
        await prioritizedMessageRef(uid, messageId).update({
          isDismissed: true,
          updatedAtMs: Date.now(),
        })
      } catch {
        // Non-critical: message may not exist in our store
      }

      response.json({ success: true, deleted })
    } catch (err) {
      log.error('mailboxDelete error', err)
      response.status(500).json({ error: (err as Error).message })
    }
  }
)

/**
 * Save or update a composer draft
 * POST /mailboxSaveDraft
 * Body: { uid, draftId?, source, recipientId?, subject?, body, richContent?, inReplyTo?, threadId? }
 */
export const mailboxSaveDraft = onRequest(
  {
    ...FUNCTION_CONFIG.http,
    cors: true,
  },
  async (request, response) => {
    const {
      uid,
      draftId: providedDraftId,
      source,
      recipientId,
      recipientName,
      subject,
      body,
      richContent,
      inReplyTo,
      threadId,
    } = request.body ?? {}

    if (!uid || !source) {
      response.status(400).json({ error: 'Missing required fields: uid, source' })
      return
    }

    if (!(await verifyAuth(request, response, uid))) return

    try {
      const draftId = providedDraftId || mailboxDraftsCollection(uid).doc().id
      const now = Date.now()

      const draftData = {
        draftId,
        userId: uid,
        source,
        recipientId: recipientId || null,
        recipientName: recipientName || null,
        subject: subject || null,
        body: body || '',
        richContent: richContent || null,
        inReplyTo: inReplyTo || null,
        threadId: threadId || null,
        createdAtMs: now,
        updatedAtMs: now,
      }

      await mailboxDraftRef(uid, draftId).set(draftData, { merge: true })

      response.json({ success: true, draftId })
    } catch (err) {
      log.error('mailboxSaveDraft error', err)
      response.status(500).json({ error: (err as Error).message })
    }
  }
)

/**
 * Delete a saved draft
 * POST /mailboxDeleteDraft
 * Body: { uid, draftId }
 */
export const mailboxDeleteDraft = onRequest(
  {
    ...FUNCTION_CONFIG.http,
    cors: true,
  },
  async (request, response) => {
    const { uid, draftId } = request.body ?? {}

    if (!uid || !draftId) {
      response.status(400).json({ error: 'Missing required fields: uid, draftId' })
      return
    }

    if (!(await verifyAuth(request, response, uid))) return

    try {
      await mailboxDraftRef(uid, draftId).delete()
      response.json({ success: true })
    } catch (err) {
      log.error('mailboxDeleteDraft error', err)
      response.status(500).json({ error: (err as Error).message })
    }
  }
)
