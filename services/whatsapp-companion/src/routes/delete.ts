/**
 * Delete Message Route
 *
 * POST /api/delete
 * Body: { connectionId, userId, messageId, remoteJid }
 */

import type { Request, Response } from 'express'
import { sessionManager } from '../index.js'

export async function deleteRoute(req: Request, res: Response): Promise<void> {
  const { connectionId, messageId, remoteJid } = req.body

  if (!connectionId || !messageId || !remoteJid) {
    res.status(400).json({ error: 'Missing required fields: connectionId, messageId, remoteJid' })
    return
  }

  try {
    const deleted = await sessionManager.deleteMessage(connectionId, messageId, remoteJid)
    res.json({ success: deleted })
  } catch (err) {
    console.error('Failed to delete message:', err)
    res.status(500).json({ error: (err as Error).message })
  }
}
