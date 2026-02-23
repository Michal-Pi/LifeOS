/**
 * WhatsApp Companion Service
 *
 * Cloud Run service that:
 * 1. Manages baileys WebSocket sessions for WhatsApp Web
 * 2. Generates QR codes for device pairing
 * 3. Caches incoming messages to Firestore
 * 4. Exposes send/delete HTTP APIs for the main app
 *
 * Deploy to Cloud Run with --min-instances=1 for persistent WebSocket.
 */

import express from 'express'
import { initializeApp, getApps } from 'firebase-admin/app'
import { BaileysManager } from './baileysManager.js'
import { qrRoute } from './routes/qr.js'
import { sendRoute } from './routes/send.js'
import { deleteRoute } from './routes/delete.js'
import { statusRoute } from './routes/status.js'

// Initialize Firebase Admin (uses Application Default Credentials on Cloud Run)
if (getApps().length === 0) {
  initializeApp()
}

const app = express()
app.use(express.json())

const PORT = parseInt(process.env.PORT || '8080', 10)

// Shared session manager
export const sessionManager = new BaileysManager()

/**
 * Health check
 */
app.get('/', (_req, res) => {
  res.json({ status: 'ok', service: 'whatsapp-companion' })
})

// Routes
app.get('/api/qr', qrRoute)
app.post('/api/send', sendRoute)
app.post('/api/delete', deleteRoute)
app.get('/api/status', statusRoute)

app.listen(PORT, () => {
  console.log(`WhatsApp companion service listening on port ${PORT}`)
})
