/**
 * Telegram Webhook Handler
 *
 * Processes incoming Telegram updates and writes messages
 * to the user's telegramMessages collection in Firestore.
 */

import { getFirestore } from 'firebase-admin/firestore'

interface TelegramUpdate {
  update_id: number
  message?: TelegramMessage
}

interface TelegramMessage {
  message_id: number
  from?: {
    id: number
    first_name: string
    last_name?: string
    username?: string
    is_bot: boolean
  }
  chat: {
    id: number
    type: 'private' | 'group' | 'supergroup' | 'channel'
    title?: string
  }
  date: number
  text?: string
  photo?: unknown[]
  document?: unknown
  video?: unknown
  voice?: unknown
  audio?: unknown
  sticker?: unknown
}

/**
 * Process a Telegram webhook update.
 * Looks up the connection to find the userId, then writes the message to Firestore.
 */
export async function handleWebhook(connectionId: string, update: TelegramUpdate): Promise<void> {
  const message = update.message
  if (!message) {
    // Non-message updates (edited messages, callbacks, etc.) — skip
    return
  }

  // Skip bot messages
  if (message.from?.is_bot) {
    return
  }

  const db = getFirestore()

  // Look up the connection to find the userId
  // We need to query across all users' channelConnections
  const connectionsSnapshot = await db
    .collectionGroup('channelConnections')
    .where('connectionId', '==', connectionId)
    .where('source', '==', 'telegram')
    .limit(1)
    .get()

  if (connectionsSnapshot.empty) {
    console.warn(`No connection found for connectionId: ${connectionId}`)
    return
  }

  const connectionDoc = connectionsSnapshot.docs[0]
  const connectionData = connectionDoc.data()
  const userId = connectionData.userId

  // Determine message body
  let body = message.text || ''
  let mediaType: string | undefined

  if (message.photo) {
    mediaType = 'photo'
    body = body || '[Photo]'
  } else if (message.document) {
    mediaType = 'document'
    body = body || '[Document]'
  } else if (message.video) {
    mediaType = 'video'
    body = body || '[Video]'
  } else if (message.voice) {
    mediaType = 'voice'
    body = body || '[Voice message]'
  } else if (message.audio) {
    mediaType = 'audio'
    body = body || '[Audio]'
  } else if (message.sticker) {
    mediaType = 'sticker'
    body = body || '[Sticker]'
  }

  // Build the cached message document
  const senderName = [message.from?.first_name, message.from?.last_name].filter(Boolean).join(' ')

  const messageId = `${connectionId}_${message.message_id}`

  const cachedMessage = {
    messageId,
    connectionId,
    chatId: message.chat.id,
    chatType: message.chat.type,
    chatTitle: message.chat.title || undefined,
    senderId: message.from?.id || 0,
    senderName: senderName || 'Unknown',
    senderUsername: message.from?.username || undefined,
    body,
    receivedAtMs: message.date * 1000,
    hasMedia: !!mediaType,
    mediaType: mediaType || undefined,
    telegramMessageId: message.message_id,
  }

  // Write to Firestore
  await db
    .collection(`users/${userId}/telegramMessages`)
    .doc(messageId)
    .set(cachedMessage, { merge: true })

  console.log(`Stored Telegram message ${messageId} for user ${userId} from ${senderName}`)
}
