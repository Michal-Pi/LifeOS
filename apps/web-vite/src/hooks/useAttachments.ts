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
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage'
import { createFirestoreAttachmentRepository } from '@/adapters/notes/firestoreAttachmentRepository'
import type { Attachment, NoteId, AttachmentId } from '@lifeos/notes'
import { generateId } from '@/lib/idGenerator'

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

      try {
        const storage = getStorageClient()
        const attachmentId = generateId() as AttachmentId

        // Create storage path: users/{userId}/notes/{noteId}/attachments/{attachmentId}/{filename}
        const storagePath = `users/${user.uid}/notes/${noteId}/attachments/${attachmentId}/${file.name}`
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

        // Delete from Storage
        if (attachment.storageUrl) {
          const storage = getStorageClient()
          const storageRef = ref(storage, attachment.storageUrl)
          await deleteObject(storageRef).catch((error) => {
            // Ignore if file doesn't exist
            if (error.code !== 'storage/object-not-found') {
              throw error
            }
          })
        }

        // Delete from Firestore
        await attachmentRepository.delete(user.uid, attachment.noteId, attachmentId)

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
