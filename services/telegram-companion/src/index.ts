/**
 * Telegram Companion Service
 *
 * Cloud Run service that:
 * 1. Receives Telegram webhook updates
 * 2. Writes incoming messages to Firestore (users/{userId}/telegramMessages)
 * 3. Registers webhooks with the Telegram Bot API
 *
 * Deployed to Cloud Run and used alongside the main Firebase Functions.
 */

import express from 'express'
import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { handleWebhook } from './webhookHandler.js'
import { registerWebhook } from './webhookRegistration.js'

// Initialize Firebase Admin (uses Application Default Credentials on Cloud Run)
if (getApps().length === 0) {
  initializeApp()
}

const app = express()
app.use(express.json())

const PORT = parseInt(process.env.PORT || '8080', 10)
const SERVICE_URL = process.env.SERVICE_URL || `http://localhost:${PORT}`

/**
 * Health check
 */
app.get('/', (_req, res) => {
  res.json({ status: 'ok', service: 'telegram-companion' })
})

/**
 * Receive Telegram webhook updates for a specific connection.
 * POST /webhook/:connectionId
 *
 * Telegram sends updates here after webhook registration.
 */
app.post('/webhook/:connectionId', async (req, res) => {
  const { connectionId } = req.params
  const update = req.body

  try {
    await handleWebhook(connectionId, update)
    res.sendStatus(200)
  } catch (err) {
    console.error(`Webhook error for ${connectionId}:`, err)
    // Always return 200 to Telegram to prevent retries
    res.sendStatus(200)
  }
})

/**
 * Register a webhook for a Telegram bot connection.
 * POST /register-webhook
 * Body: { connectionId, botToken }
 *
 * Called by channelConnectionCreate after storing the connection.
 */
app.post('/register-webhook', async (req, res) => {
  const { connectionId, botToken } = req.body

  if (!connectionId || !botToken) {
    res.status(400).json({ error: 'Missing connectionId or botToken' })
    return
  }

  try {
    const webhookUrl = `${SERVICE_URL}/webhook/${connectionId}`
    await registerWebhook(botToken, webhookUrl)
    res.json({ success: true, webhookUrl })
  } catch (err) {
    console.error('Failed to register webhook:', err)
    res.status(500).json({ error: (err as Error).message })
  }
})

app.listen(PORT, () => {
  console.log(`Telegram companion service listening on port ${PORT}`)
})
