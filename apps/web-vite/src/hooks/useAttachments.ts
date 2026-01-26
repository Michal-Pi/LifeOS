/**
 * useAttachments Hook
 *
 * Manages attachments for notes including:
 * - File upload to Firebase Storage
 * - Attachment CRUD operations
 * - Progress tracking
 * - Image optimization (basic)
 */

import { useState, useCallback } from 'react'
import { useAuth } from './useAuth'
import { getStorageClient } from '@/lib/firebase'
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage'
import { createFirestoreAttachmentRepository } from '@/adapters/notes/firestoreAttachmentRepository'
import type { Attachment, NoteId, AttachmentId } from '@lifeos/notes'

const attachmentRepository = createFirestoreAttachmentRepository()

export interface UseAttachmentsReturn {
  attachments: Attachment[]
  isLoading: boolean
  error: Error | null
  uploadFile: (noteId: NoteId, file: File) => Promise<Attachment>
  deleteAttachment: (attachmentId: AttachmentId) => Promise<void>
  loadAttachments: (noteId: NoteId) => Promise<void>
}

export function useAttachments(): UseAttachmentsReturn {
  const { user } = useAuth()
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const uploadFile = useCallback(
    async (noteId: NoteId, file: File): Promise<Attachment> => {
      if (!user?.uid) {
        throw new Error('User not authenticated')
      }

      setIsLoading(true)
      setError(null)

      let createdAttachment: Attachment | null = null

      try {
        createdAttachment = await attachmentRepository.create(user.uid, {
          userId: user.uid,
          noteId,
          fileName: file.name,
          fileType: file.type,
          fileSizeBytes: file.size,
        })

        const storage = getStorageClient()

        // Create storage path: users/{userId}/attachments/{attachmentId}
        const storagePath = `users/${user.uid}/attachments/${createdAttachment.attachmentId}`
        const storageRef = ref(storage, storagePath)

        // Upload file
        const uploadTask = uploadBytesResumable(storageRef, file, {
          contentType: file.type,
        })

        // Wait for upload to complete
        await new Promise<void>((resolve, reject) => {
          uploadTask.on(
            'state_changed',
            (snapshot) => {
              const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100
              console.log('Upload progress:', progress)
            },
            (error) => {
              reject(error)
            },
            () => {
              resolve()
            }
          )
        })

        // Get download URL
        const downloadURL = await getDownloadURL(storageRef)

        // Update Firestore metadata with storage URL
        await attachmentRepository.updateSyncState(
          user.uid,
          createdAttachment.attachmentId,
          'synced',
          downloadURL
        )

        const attachment: Attachment = {
          ...createdAttachment,
          storageUrl: downloadURL,
          syncState: 'synced',
        }

        // Update local state
        setAttachments((prev) => [...prev, attachment])

        return attachment
      } catch (err) {
        if (createdAttachment) {
          await attachmentRepository
            .updateSyncState(user.uid, createdAttachment.attachmentId, 'error')
            .catch(console.error)
        }
        const error = err instanceof Error ? err : new Error('Failed to upload file')
        setError(error)
        throw error
      } finally {
        setIsLoading(false)
      }
    },
    [user]
  )

  const deleteAttachment = useCallback(
    async (attachmentId: AttachmentId): Promise<void> => {
      if (!user?.uid) {
        throw new Error('User not authenticated')
      }

      setIsLoading(true)
      setError(null)

      try {
        // Find attachment
        const attachment = attachments.find((a) => a.attachmentId === attachmentId)
        if (!attachment) {
          throw new Error('Attachment not found')
        }

        // Delete from Firestore
        await attachmentRepository.delete(user.uid, attachmentId)

        // Update local state
        setAttachments((prev) => prev.filter((a) => a.attachmentId !== attachmentId))
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to delete attachment')
        setError(error)
        throw error
      } finally {
        setIsLoading(false)
      }
    },
    [user, attachments]
  )

  const loadAttachments = useCallback(
    async (noteId: NoteId): Promise<void> => {
      if (!user?.uid) return

      setIsLoading(true)
      setError(null)

      try {
        const loadedAttachments = await attachmentRepository.listByNote(user.uid, noteId)
        setAttachments(loadedAttachments)
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

  return {
    attachments,
    isLoading,
    error,
    uploadFile,
    deleteAttachment,
    loadAttachments,
  }
}
