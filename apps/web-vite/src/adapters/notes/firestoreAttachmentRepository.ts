/**
 * Firestore Attachment Repository
 *
 * Implements AttachmentRepository interface for Firestore persistence + Firebase Storage.
 * Handles CRUD operations for attachments and file upload/download.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  query,
  where,
} from 'firebase/firestore'
import { ref, uploadBytesResumable, getDownloadURL, deleteObject, getBlob } from 'firebase/storage'
import { getFirestoreClient, getStorageClient } from '@/lib/firebase'
import { newId } from '@lifeos/core'
import type {
  Attachment,
  AttachmentId,
  NoteId,
  CreateAttachmentInput,
  AttachmentRepository,
} from '@lifeos/notes'

const COLLECTION_ATTACHMENTS = 'attachments'

export const createFirestoreAttachmentRepository = (): AttachmentRepository => {
  const db = getFirestoreClient()
  const storage = getStorageClient()

  const create = async (userId: string, input: CreateAttachmentInput): Promise<Attachment> => {
    const attachmentId = newId<'attachment'>('attachment')
    const now = Date.now()

    const attachment: Attachment = {
      ...input,
      attachmentId,
      uploadedAtMs: now,
      syncState: 'local',
    }

    const ref = doc(db, `users/${userId}/${COLLECTION_ATTACHMENTS}/${attachmentId}`)
    await setDoc(ref, {
      ...attachment,
      // Don't persist Blob to Firestore
      localBlob: undefined,
    })

    return attachment
  }

  const deleteAttachment = async (userId: string, attachmentId: AttachmentId): Promise<void> => {
    // Get attachment to find storage URL
    const attachment = await get(userId, attachmentId)

    if (attachment?.storageUrl) {
      // Delete file from storage
      try {
        const storageRef = ref(storage, `users/${userId}/attachments/${attachmentId}`)
        await deleteObject(storageRef)
      } catch (error) {
        console.warn('Failed to delete attachment from storage:', error)
      }
    }

    // Delete metadata from Firestore
    const docRef = doc(db, `users/${userId}/${COLLECTION_ATTACHMENTS}/${attachmentId}`)
    await deleteDoc(docRef)
  }

  const get = async (userId: string, attachmentId: AttachmentId): Promise<Attachment | null> => {
    const ref = doc(db, `users/${userId}/${COLLECTION_ATTACHMENTS}/${attachmentId}`)
    const snapshot = await getDoc(ref)

    if (!snapshot.exists()) {
      return null
    }

    return snapshot.data() as Attachment
  }

  const listByNote = async (userId: string, noteId: NoteId): Promise<Attachment[]> => {
    const q = query(
      collection(db, `users/${userId}/${COLLECTION_ATTACHMENTS}`),
      where('noteId', '==', noteId)
    )

    const snapshot = await getDocs(q)
    return snapshot.docs.map((doc) => doc.data() as Attachment)
  }

  const updateSyncState = async (
    userId: string,
    attachmentId: AttachmentId,
    syncState: Attachment['syncState'],
    storageUrl?: string
  ): Promise<void> => {
    const ref = doc(db, `users/${userId}/${COLLECTION_ATTACHMENTS}/${attachmentId}`)
    const snapshot = await getDoc(ref)

    if (!snapshot.exists()) {
      return
    }

    const attachment = snapshot.data() as Attachment
    await setDoc(ref, {
      ...attachment,
      syncState,
      storageUrl: storageUrl ?? attachment.storageUrl,
      localBlob: undefined, // Never persist blob
    })
  }

  const uploadFile = async (
    userId: string,
    attachmentId: AttachmentId,
    blob: Blob,
    onProgress?: (progress: number) => void
  ): Promise<string> => {
    // Update state to uploading
    await updateSyncState(userId, attachmentId, 'uploading')

    try {
      // Create storage reference
      const storageRef = ref(storage, `users/${userId}/attachments/${attachmentId}`)

      // Upload with progress tracking
      const uploadTask = uploadBytesResumable(storageRef, blob)

      return new Promise((resolve, reject) => {
        uploadTask.on(
          'state_changed',
          (snapshot) => {
            const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100
            onProgress?.(progress)
          },
          (error) => {
            // Upload failed
            updateSyncState(userId, attachmentId, 'error').catch(console.error)
            reject(error)
          },
          async () => {
            // Upload successful, get download URL
            try {
              const downloadURL = await getDownloadURL(uploadTask.snapshot.ref)

              // Update attachment with storage URL and synced state
              await updateSyncState(userId, attachmentId, 'synced', downloadURL)

              resolve(downloadURL)
            } catch (error) {
              await updateSyncState(userId, attachmentId, 'error')
              reject(error)
            }
          }
        )
      })
    } catch (error) {
      await updateSyncState(userId, attachmentId, 'error')
      throw error
    }
  }

  const downloadFile = async (userId: string, attachmentId: AttachmentId): Promise<Blob> => {
    const attachment = await get(userId, attachmentId)

    if (!attachment) {
      throw new Error(`Attachment ${attachmentId} not found`)
    }

    if (!attachment.storageUrl) {
      throw new Error(`Attachment ${attachmentId} has no storage URL`)
    }

    const storageRef = ref(storage, `users/${userId}/attachments/${attachmentId}`)
    return await getBlob(storageRef)
  }

  return {
    create,
    delete: deleteAttachment,
    get,
    listByNote,
    updateSyncState,
    uploadFile,
    downloadFile,
  }
}
