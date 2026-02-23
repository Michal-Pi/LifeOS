/**
 * Firestore Writer
 *
 * Writes WhatsApp messages to the user's whatsappMessages collection.
 */

import { getFirestore } from 'firebase-admin/firestore'

export interface WhatsAppCachedMessage {
  messageId: string
  connectionId: string
  senderJid: string
  senderName: string
  groupJid?: string
  groupName?: string
  body: string
  receivedAtMs: number
  isGroup: boolean
  mediaType?: string
  fromMe: boolean
}

/**
 * Write a cached message to Firestore.
 */
export async function writeMessage(userId: string, message: WhatsAppCachedMessage): Promise<void> {
  const db = getFirestore()
  await db
    .collection(`users/${userId}/whatsappMessages`)
    .doc(message.messageId)
    .set(message, { merge: true })

  console.log(
    `Stored WhatsApp message ${message.messageId} for user ${userId} from ${message.senderName}`
  )
}
