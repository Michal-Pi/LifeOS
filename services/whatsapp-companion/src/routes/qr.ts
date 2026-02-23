/**
 * QR Code Route
 *
 * GET /api/qr?connectionId=...&userId=...
 * Starts a new WhatsApp session and returns the QR code for pairing.
 */

import type { Request, Response } from 'express'
import { sessionManager } from '../index.js'

export async function qrRoute(req: Request, res: Response): Promise<void> {
  const { connectionId, userId } = req.query as {
    connectionId?: string
    userId?: string
  }

  if (!connectionId || !userId) {
    res.status(400).json({ error: 'Missing connectionId or userId query parameter' })
    return
  }

  try {
    const qrCode = await sessionManager.startSession(connectionId, userId)
    res.json({ qrCode })
  } catch (err) {
    console.error('Failed to generate QR code:', err)
    res.status(500).json({ error: (err as Error).message })
  }
}
