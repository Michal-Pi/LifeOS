/**
 * Status Route
 *
 * GET /api/status?connectionId=...
 * Returns the current session status for a connection.
 */

import type { Request, Response } from 'express'
import { sessionManager } from '../index.js'

export function statusRoute(req: Request, res: Response): void {
  const { connectionId } = req.query as { connectionId?: string }

  if (!connectionId) {
    res.status(400).json({ error: 'Missing connectionId query parameter' })
    return
  }

  const status = sessionManager.getStatus(connectionId)
  res.json(status)
}
