import type { Id } from '@lifeos/core'

// ----- IDs -----

export type NoteId = Id<'note'>
export type TopicId = Id<'topic'>
export type SectionId = Id<'section'>
export type AttachmentId = Id<'attachment'>

// ----- Sync State -----

export type SyncState = 'synced' | 'pending' | 'conflict'
export type AttachmentSyncState = 'local' | 'uploading' | 'synced' | 'error'

// ----- Note Document -----

/**
 * A note document with rich content (ProseMirror JSON)
 */
export interface Note {
  noteId: NoteId
  userId: string

  // Content
  title: string
  content: object // ProseMirror JSON document
  contentHtml?: string // Cached HTML for search/preview

  // Organization
  topicId: TopicId | null // Parent topic (folder)
  sectionId: SectionId | null // Parent section (subfolder)

  // Associations
  projectIds: string[] // Linked projects
  okrIds: string[] // Linked OKRs
  tags: string[] // User tags

  // Metadata
  createdAtMs: number
  updatedAtMs: number
  lastAccessedAtMs: number

  // Offline sync
  syncState: SyncState
  version: number // For conflict resolution

  // Attachments
  attachmentIds: AttachmentId[] // References to Attachment documents
}

// ----- Topic (Folder) -----

/**
 * A topic represents a folder for organizing notes
 * Topics can be nested for hierarchical organization
 */
export interface Topic {
  topicId: TopicId
  userId: string

  name: string
  description?: string
  color?: string // UI color coding (hex or named color)
  icon?: string // Emoji or icon identifier

  parentTopicId: TopicId | null // For nested topics
  order: number // Display order

  createdAtMs: number
  updatedAtMs: number
}

// ----- Section (Subfolder) -----

/**
 * A section represents a subfolder within a topic
 * Sections provide an additional level of organization
 */
export interface Section {
  sectionId: SectionId
  userId: string
  topicId: TopicId // Parent topic

  name: string
  description?: string
  order: number

  createdAtMs: number
  updatedAtMs: number
}

// ----- Attachment -----

/**
 * An attachment linked to a note (images, files, etc.)
 * Supports offline storage with eventual sync to Firebase Storage
 */
export interface Attachment {
  attachmentId: AttachmentId
  userId: string
  noteId: NoteId

  // File info
  fileName: string
  fileType: string // MIME type (e.g., 'image/png', 'application/pdf')
  fileSizeBytes: number

  // Storage
  storageUrl?: string // Firebase Storage URL (when synced)
  localBlob?: Blob // Local-only until synced (not persisted to Firestore)

  // Metadata
  uploadedAtMs: number
  syncState: AttachmentSyncState
}

// ----- Filters for Queries -----

export interface NoteFilters {
  topicId?: TopicId
  sectionId?: SectionId
  projectIds?: string[]
  okrIds?: string[]
  tags?: string[]
  searchQuery?: string // Full-text search
}

export interface TopicFilters {
  parentTopicId?: TopicId | null
}

export interface SectionFilters {
  topicId?: TopicId
}

// ----- Create Input Types -----

export type CreateNoteInput = Omit<
  Note,
  'noteId' | 'createdAtMs' | 'updatedAtMs' | 'lastAccessedAtMs' | 'syncState' | 'version'
>

export type CreateTopicInput = Omit<Topic, 'topicId' | 'createdAtMs' | 'updatedAtMs'>

export type CreateSectionInput = Omit<Section, 'sectionId' | 'createdAtMs' | 'updatedAtMs'>

export type CreateAttachmentInput = Omit<Attachment, 'attachmentId' | 'uploadedAtMs' | 'syncState'>

// ----- Update Input Types -----

export type UpdateNoteInput = Partial<Omit<Note, 'noteId' | 'userId' | 'createdAtMs' | 'version'>>

export type UpdateTopicInput = Partial<Omit<Topic, 'topicId' | 'userId' | 'createdAtMs'>>

export type UpdateSectionInput = Partial<Omit<Section, 'sectionId' | 'userId' | 'createdAtMs'>>
