import type { Attachment, AttachmentId, NoteId, CreateAttachmentInput } from '../domain/models'

/**
 * Repository interface for Attachment persistence
 * Implementations: Firestore + Firebase Storage
 */
export interface AttachmentRepository {
  /**
   * Create a new attachment (metadata only, file upload separate)
   */
  create(userId: string, input: CreateAttachmentInput): Promise<Attachment>

  /**
   * Delete an attachment (removes metadata and file from storage)
   */
  delete(userId: string, attachmentId: AttachmentId): Promise<void>

  /**
   * Get a single attachment by ID
   */
  get(userId: string, attachmentId: AttachmentId): Promise<Attachment | null>

  /**
   * List attachments for a note
   */
  listByNote(userId: string, noteId: NoteId): Promise<Attachment[]>

  /**
   * Update attachment sync state
   */
  updateSyncState(
    userId: string,
    attachmentId: AttachmentId,
    syncState: Attachment['syncState'],
    storageUrl?: string
  ): Promise<void>

  /**
   * Upload file to storage and update attachment
   */
  uploadFile(
    userId: string,
    attachmentId: AttachmentId,
    blob: Blob,
    onProgress?: (progress: number) => void
  ): Promise<string>

  /**
   * Download file from storage
   */
  downloadFile(userId: string, attachmentId: AttachmentId): Promise<Blob>
}
