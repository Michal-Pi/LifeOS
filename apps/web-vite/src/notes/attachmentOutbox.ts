/**
 * Attachment Upload Outbox
 *
 * Queue for offline attachment uploads.
 * Files are stored in IndexedDB and uploaded when connection is restored.
 */

import { openDB, type IDBPDatabase } from 'idb'
import type { AttachmentId, NoteId } from '@lifeos/notes'

export interface PendingAttachment {
  attachmentId: AttachmentId
  noteId: NoteId
  userId: string
  file: File
  fileName: string
  fileType: string
  fileSizeBytes: number
  createdAtMs: number
  attempts: number
  status: 'pending' | 'uploading' | 'failed' | 'uploaded'
  lastError?: { message: string; timestamp: number }
}

const DB_NAME = 'lifeos-attachment-outbox'
const DB_VERSION = 1
const STORE_NAME = 'pending-attachments'

let dbPromise: Promise<IDBPDatabase> | null = null

async function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'attachmentId' })
          store.createIndex('userId', 'userId')
          store.createIndex('noteId', 'noteId')
          store.createIndex('status', 'status')
        }
      },
    })
  }
  return dbPromise
}

/**
 * Queue an attachment for upload
 */
export async function queueAttachment(
  attachmentId: AttachmentId,
  noteId: NoteId,
  userId: string,
  file: File
): Promise<PendingAttachment> {
  const db = await getDb()

  const pending: PendingAttachment = {
    attachmentId,
    noteId,
    userId,
    file,
    fileName: file.name,
    fileType: file.type,
    fileSizeBytes: file.size,
    createdAtMs: Date.now(),
    attempts: 0,
    status: 'pending',
  }

  await db.put(STORE_NAME, pending)
  return pending
}

/**
 * Get all pending attachments for a user
 */
export async function listPendingAttachments(userId: string): Promise<PendingAttachment[]> {
  const db = await getDb()
  const index = db.transaction(STORE_NAME).store.index('userId')
  const all = (await index.getAll(userId)) as PendingAttachment[]
  return all.filter((a) => a.status === 'pending' || a.status === 'failed')
}

/**
 * Get pending attachments for a specific note
 */
export async function listPendingAttachmentsForNote(
  userId: string,
  noteId: NoteId
): Promise<PendingAttachment[]> {
  const db = await getDb()
  const index = db.transaction(STORE_NAME).store.index('noteId')
  const all = (await index.getAll(noteId)) as PendingAttachment[]
  return all.filter((a) => a.userId === userId && (a.status === 'pending' || a.status === 'failed'))
}

/**
 * Mark attachment as uploading
 */
export async function markAttachmentUploading(attachmentId: AttachmentId): Promise<void> {
  const db = await getDb()
  const attachment = (await db.get(STORE_NAME, attachmentId)) as PendingAttachment | undefined
  if (!attachment) return

  attachment.status = 'uploading'
  attachment.attempts += 1
  await db.put(STORE_NAME, attachment)
}

/**
 * Mark attachment as uploaded
 */
export async function markAttachmentUploaded(attachmentId: AttachmentId): Promise<void> {
  const db = await getDb()
  const attachment = await db.get(STORE_NAME, attachmentId)
  if (!attachment) return

  attachment.status = 'uploaded'
  await db.put(STORE_NAME, attachment)
}

/**
 * Mark attachment upload as failed
 */
export async function markAttachmentFailed(
  attachmentId: AttachmentId,
  error: Error | string
): Promise<void> {
  const db = await getDb()
  const attachment = (await db.get(STORE_NAME, attachmentId)) as PendingAttachment | undefined
  if (!attachment) return

  attachment.status = 'failed'
  attachment.lastError = {
    message: typeof error === 'string' ? error : error.message,
    timestamp: Date.now(),
  }
  await db.put(STORE_NAME, attachment)
}

/**
 * Remove an attachment from the queue
 */
export async function removeAttachment(attachmentId: AttachmentId): Promise<void> {
  const db = await getDb()
  await db.delete(STORE_NAME, attachmentId)
}

/**
 * Get statistics about pending attachments
 */
export async function getAttachmentStats(userId: string): Promise<{
  pending: number
  failed: number
  total: number
  totalSizeBytes: number
}> {
  const attachments = await listPendingAttachments(userId)

  return {
    pending: attachments.filter((a) => a.status === 'pending').length,
    failed: attachments.filter((a) => a.status === 'failed').length,
    total: attachments.length,
    totalSizeBytes: attachments.reduce((sum, a) => sum + a.fileSizeBytes, 0),
  }
}

/**
 * Clean up uploaded attachments (keep for 24 hours)
 */
export async function cleanupUploaded(): Promise<void> {
  const db = await getDb()
  const tx = db.transaction(STORE_NAME, 'readwrite')
  const store = tx.objectStore(STORE_NAME)
  const all = (await store.getAll()) as PendingAttachment[]

  const cutoff = Date.now() - 24 * 60 * 60 * 1000 // 24 hours ago

  for (const attachment of all) {
    if (attachment.status === 'uploaded' && attachment.createdAtMs < cutoff) {
      await store.delete(attachment.attachmentId)
    }
  }

  await tx.done
}
