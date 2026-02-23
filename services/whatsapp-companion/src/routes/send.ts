/**
 * Send Message Route
 *
 * POST /api/send
 * Body: { connectionId, userId, recipientJid, body }
 */

import type { Request, Response } from 'express'
import { sessionManager } from '../index.js'

export async function sendRoute(req: Request, res: Response): Promise<void> {
  const { connectionId, recipientJid, body } = req.body

  if (!connectionId || !recipientJid || !body) {
    res.status(400).json({ error: 'Missing required fields: connectionId, recipientJid, body' })
    return
  }

  try {
    const result = await sessionManager.sendMessage(connectionId, recipientJid, body)
    res.json({ success: true, messageId: result.messageId })
  } catch (err) {
    console.error('Failed to send message:', err)
    res.status(500).json({ error: (err as Error).message })
  }
}
