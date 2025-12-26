/**
 * useAttachmentsOffline Hook
 *
 * Enhanced attachment management with offline support:
 * - Queue uploads when offline
 * - Auto-upload when connection restored
 * - Progress tracking for queued uploads
 */

import { useState, useCallback, useEffect } from 'react'
import { useAuth } from './useAuth'
import { getStorageClient } from '@/lib/firebase'
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage'
import { createFirestoreAttachmentRepository } from '@/adapters/notes/firestoreAttachmentRepository'
import type { Attachment, NoteId, AttachmentId } from '@lifeos/notes'
import { generateId } from '@/lib/idGenerator'
import {
  queueAttachment,
  listPendingAttachmentsForNote,
  markAttachmentUploading,
  markAttachmentUploaded,
  markAttachmentFailed,
  type PendingAttachment,
} from '@/notes/attachmentOutbox'

const attachmentRepository = createFirestoreAttachmentRepository()

export interface UseAttachmentsOfflineReturn {
  attachments: Attachment[]
  pendingAttachments: PendingAttachment[]
  isLoading: boolean
  error: Error | null
  isOnline: boolean
  uploadFile: (noteId: NoteId, file: File) => Promise<Attachment | PendingAttachment>
  deleteAttachment: (attachmentId: AttachmentId) => Promise<void>
  loadAttachments: (noteId: NoteId) => Promise<void>
  processPendingUploads: (noteId: NoteId) => Promise<void>
}

export function useAttachmentsOffline(): UseAttachmentsOfflineReturn {
  const { user } = useAuth()
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [isOnline, setIsOnline] = useState(navigator.onLine)

  // Monitor online/offline status
  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  /**
   * Load attachments for a note
   */
  const loadAttachments = useCallback(
    async (noteId: NoteId) => {
      if (!user?.uid) return

      setIsLoading(true)
      setError(null)

      try {
        // Load synced attachments from Firestore
        const syncedAttachments = await attachmentRepository.listByNote(user.uid, noteId)
        setAttachments(syncedAttachments)

        // Load pending attachments from outbox
        const pending = await listPendingAttachmentsForNote(user.uid, noteId)
        setPendingAttachments(pending)
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to load attachments')
        setError(error)
        console.error('Failed to load attachments:', error)
      } finally {
        setIsLoading(false)
      }
    },
    [user]
  )

  /**
   * Upload a file (with offline queuing)
   */
  const uploadFile = useCallback(
    async (noteId: NoteId, file: File): Promise<Attachment | PendingAttachment> => {
      if (!user?.uid) {
        throw new Error('User not authenticated')
      }

      const attachmentId = generateId() as AttachmentId

      // If offline, queue the upload
      if (!isOnline) {
        const pending = await queueAttachment(attachmentId, noteId, user.uid, file)
        setPendingAttachments((prev) => [...prev, pending])
        return pending
      }

      // If online, upload immediately
      setIsLoading(true)
      setError(null)

      try {
        const storage = getStorageClient()
        const storagePath = `users/${user.uid}/notes/${noteId}/attachments/${attachmentId}/${file.name}`
        const storageRef = ref(storage, storagePath)

        // Upload file
        const uploadTask = uploadBytesResumable(storageRef, file, {
          contentType: file.type,
        })

        await new Promise<void>((resolve, reject) => {
          uploadTask.on('state_changed', () => {}, reject, resolve)
        })

        // Get download URL
        const downloadURL = await getDownloadURL(storageRef)

        // Create attachment record
        const attachment: Attachment = {
          attachmentId,
          userId: user.uid,
          noteId,
          fileName: file.name,
          fileType: file.type,
          fileSizeBytes: file.size,
          storageUrl: downloadURL,
          uploadedAtMs: Date.now(),
          syncState: 'synced',
        }

        // Save to Firestore
        await attachmentRepository.create(user.uid, attachment)

        // Update local state
        setAttachments((prev) => [...prev, attachment])

        return attachment
      } catch (err) {
        // If upload fails, queue it for retry
        const pending = await queueAttachment(attachmentId, noteId, user.uid, file)
        await markAttachmentFailed(attachmentId, err as Error)
        setPendingAttachments((prev) => [...prev, pending])

        const error = err instanceof Error ? err : new Error('Failed to upload file')
        setError(error)
        throw error
      } finally {
        setIsLoading(false)
      }
    },
    [user, isOnline]
  )

  /**
   * Process pending uploads for a note
   */
  const processPendingUploads = useCallback(
    async (noteId: NoteId) => {
      if (!user?.uid || !isOnline) return

      const pending = await listPendingAttachmentsForNote(user.uid, noteId)

      for (const pendingAttachment of pending) {
        if (pendingAttachment.status !== 'pending') continue

        try {
          await markAttachmentUploading(pendingAttachment.attachmentId)

          const storage = getStorageClient()
          const storagePath = `users/${user.uid}/notes/${noteId}/attachments/${pendingAttachment.attachmentId}/${pendingAttachment.fileName}`
          const storageRef = ref(storage, storagePath)

          // Upload file
          const uploadTask = uploadBytesResumable(storageRef, pendingAttachment.file, {
            contentType: pendingAttachment.fileType,
          })

          await new Promise<void>((resolve, reject) => {
            uploadTask.on('state_changed', () => {}, reject, resolve)
          })

          const downloadURL = await getDownloadURL(storageRef)

          // Create attachment record
          const attachment: Attachment = {
            attachmentId: pendingAttachment.attachmentId,
            userId: user.uid,
            noteId,
            fileName: pendingAttachment.fileName,
            fileType: pendingAttachment.fileType,
            fileSizeBytes: pendingAttachment.fileSizeBytes,
            storageUrl: downloadURL,
            uploadedAtMs: Date.now(),
            syncState: 'synced',
          }

          await attachmentRepository.create(user.uid, attachment)
          await markAttachmentUploaded(pendingAttachment.attachmentId)

          // Update state
          setAttachments((prev) => [...prev, attachment])
          setPendingAttachments((prev) =>
            prev.filter((p) => p.attachmentId !== pendingAttachment.attachmentId)
          )
        } catch (err) {
          console.error('Failed to upload pending attachment:', err)
          await markAttachmentFailed(
            pendingAttachment.attachmentId,
            err instanceof Error ? err : new Error('Upload failed')
          )
        }
      }
    },
    [user, isOnline]
  )

  /**
   * Auto-process pending uploads when coming online
   */
  useEffect(() => {
    if (isOnline && pendingAttachments.length > 0) {
      const noteIds = Array.from(new Set(pendingAttachments.map((p) => p.noteId)))

      for (const noteId of noteIds) {
        processPendingUploads(noteId).catch((error) => {
          console.error('Failed to process pending uploads:', error)
        })
      }
    }
  }, [isOnline, pendingAttachments, processPendingUploads])

  /**
   * Delete an attachment
   */
  const deleteAttachment = useCallback(
    async (attachmentId: AttachmentId) => {
      if (!user?.uid) {
        throw new Error('User not authenticated')
      }

      setIsLoading(true)
      setError(null)

      try {
        await attachmentRepository.delete(user.uid, attachmentId)
        setAttachments((prev) => prev.filter((a) => a.attachmentId !== attachmentId))
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to delete attachment')
        setError(error)
        throw error
      } finally {
        setIsLoading(false)
      }
    },
    [user]
  )

  return {
    attachments,
    pendingAttachments,
    isLoading,
    error,
    isOnline,
    uploadFile,
    deleteAttachment,
    loadAttachments,
    processPendingUploads,
  }
}
