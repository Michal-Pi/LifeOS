/**
 * Baileys Session Manager
 *
 * Manages WhatsApp Web WebSocket sessions using @whiskeysockets/baileys.
 * Each connection gets its own session, persisted to Firestore.
 */

import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  type WASocket,
  type BaileysEventMap,
} from '@whiskeysockets/baileys'
import { getFirestore } from 'firebase-admin/firestore'
import { writeMessage } from './firestoreWriter.js'

interface Session {
  socket: WASocket | null
  qrCode: string | null
  status: 'connecting' | 'connected' | 'disconnected'
  userId: string
  connectionId: string
  phoneNumber?: string
}

export class BaileysManager {
  private sessions = new Map<string, Session>()

  /**
   * Start a new session for QR code pairing.
   * Returns the QR code as a data URL.
   */
  async startSession(connectionId: string, userId: string): Promise<string> {
    // Clean up existing session if any
    await this.closeSession(connectionId)

    const session: Session = {
      socket: null,
      qrCode: null,
      status: 'connecting',
      userId,
      connectionId,
    }
    this.sessions.set(connectionId, session)

    return new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('QR code generation timed out'))
      }, 30_000)

      void this.initSocket(connectionId, session, (qr) => {
        clearTimeout(timeout)
        resolve(qr)
      })
    })
  }

  private async initSocket(
    connectionId: string,
    session: Session,
    onQR: (qr: string) => void
  ): Promise<void> {
    const { state, saveCreds } = await useMultiFileAuthState(`/tmp/wa-sessions/${connectionId}`)

    const { version } = await fetchLatestBaileysVersion()

    const socket = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
    })

    session.socket = socket

    // Handle QR code generation
    socket.ev.on('connection.update', async (update) => {
      const { connection, qr, lastDisconnect } = update

      if (qr) {
        // Convert QR string to data URL using qrcode library
        const QRCode = await import('qrcode')
        const dataUrl = await QRCode.toDataURL(qr)
        session.qrCode = dataUrl
        session.status = 'connecting'
        onQR(dataUrl)
      }

      if (connection === 'open') {
        session.status = 'connected'
        session.qrCode = null

        // Extract phone number from socket
        const phoneNumber = socket.user?.id?.split(':')[0] || undefined
        session.phoneNumber = phoneNumber

        console.log(`WhatsApp connected for ${connectionId}: ${phoneNumber}`)
      }

      if (connection === 'close') {
        const statusCode = (lastDisconnect?.error as any)?.output?.statusCode
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut

        session.status = 'disconnected'

        if (shouldReconnect) {
          console.log(`Reconnecting session ${connectionId}...`)
          void this.initSocket(connectionId, session, () => {})
        } else {
          console.log(`Session ${connectionId} logged out`)
          this.sessions.delete(connectionId)
        }
      }
    })

    // Save credentials on update
    socket.ev.on('creds.update', saveCreds)

    // Handle incoming messages
    socket.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return

      for (const msg of messages) {
        // Skip outgoing messages
        if (msg.key.fromMe) continue

        const senderJid = msg.key.remoteJid || ''
        const isGroup = senderJid.endsWith('@g.us')
        const body = msg.message?.conversation || msg.message?.extendedTextMessage?.text || ''

        let mediaType: string | undefined
        if (msg.message?.imageMessage) mediaType = 'image'
        else if (msg.message?.videoMessage) mediaType = 'video'
        else if (msg.message?.audioMessage) mediaType = 'audio'
        else if (msg.message?.documentMessage) mediaType = 'document'

        const displayBody = body || (mediaType ? `[${mediaType}]` : '[Unknown]')

        await writeMessage(session.userId, {
          messageId: `${connectionId}_${msg.key.id}`,
          connectionId,
          senderJid,
          senderName: msg.pushName || senderJid.split('@')[0],
          groupJid: isGroup ? senderJid : undefined,
          groupName: isGroup ? (msg.key as any).participant : undefined,
          body: displayBody,
          receivedAtMs: (msg.messageTimestamp as number) * 1000 || Date.now(),
          isGroup,
          mediaType,
          fromMe: false,
        })
      }
    })
  }

  /**
   * Get session status
   */
  getStatus(connectionId: string): {
    status: string
    phoneNumber?: string
    qrCode?: string
  } {
    const session = this.sessions.get(connectionId)
    if (!session) {
      return { status: 'disconnected' }
    }
    return {
      status: session.status,
      phoneNumber: session.phoneNumber,
      qrCode: session.qrCode || undefined,
    }
  }

  /**
   * Send a message through a session
   */
  async sendMessage(
    connectionId: string,
    recipientJid: string,
    body: string
  ): Promise<{ messageId?: string }> {
    const session = this.sessions.get(connectionId)
    if (!session?.socket || session.status !== 'connected') {
      throw new Error('WhatsApp session not connected')
    }

    const result = await session.socket.sendMessage(recipientJid, { text: body })
    return { messageId: result?.key.id }
  }

  /**
   * Delete a message
   */
  async deleteMessage(
    connectionId: string,
    messageId: string,
    remoteJid: string
  ): Promise<boolean> {
    const session = this.sessions.get(connectionId)
    if (!session?.socket || session.status !== 'connected') {
      throw new Error('WhatsApp session not connected')
    }

    try {
      await session.socket.sendMessage(remoteJid, {
        delete: { remoteJid, id: messageId, fromMe: true },
      })
      return true
    } catch {
      return false
    }
  }

  /**
   * Close a session
   */
  async closeSession(connectionId: string): Promise<void> {
    const session = this.sessions.get(connectionId)
    if (session?.socket) {
      session.socket.end(undefined)
      this.sessions.delete(connectionId)
    }
  }
}
