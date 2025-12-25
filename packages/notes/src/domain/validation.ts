import type {
  Note,
  Topic,
  Section,
  Attachment,
  CreateNoteInput,
  CreateTopicInput,
  CreateSectionInput,
  CreateAttachmentInput,
} from './models'

// ----- Validation Result -----

export interface ValidationResult {
  valid: boolean
  errors: string[]
}

// ----- Note Validation -----

export function validateNote(note: Note): ValidationResult {
  const errors: string[] = []

  if (!note.noteId) {
    errors.push('Note ID is required')
  }

  if (!note.userId) {
    errors.push('User ID is required')
  }

  if (!note.title || note.title.trim().length === 0) {
    errors.push('Note title is required')
  }

  if (note.title && note.title.length > 500) {
    errors.push('Note title must be less than 500 characters')
  }

  if (!note.content) {
    errors.push('Note content is required')
  }

  if (note.version < 0) {
    errors.push('Note version must be non-negative')
  }

  if (note.createdAtMs <= 0) {
    errors.push('Created timestamp must be positive')
  }

  if (note.updatedAtMs <= 0) {
    errors.push('Updated timestamp must be positive')
  }

  if (note.updatedAtMs < note.createdAtMs) {
    errors.push('Updated timestamp cannot be before created timestamp')
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

export function validateCreateNoteInput(input: CreateNoteInput): ValidationResult {
  const errors: string[] = []

  if (!input.userId) {
    errors.push('User ID is required')
  }

  if (!input.title || input.title.trim().length === 0) {
    errors.push('Note title is required')
  }

  if (input.title && input.title.length > 500) {
    errors.push('Note title must be less than 500 characters')
  }

  if (!input.content) {
    errors.push('Note content is required')
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

// ----- Topic Validation -----

export function validateTopic(topic: Topic): ValidationResult {
  const errors: string[] = []

  if (!topic.topicId) {
    errors.push('Topic ID is required')
  }

  if (!topic.userId) {
    errors.push('User ID is required')
  }

  if (!topic.name || topic.name.trim().length === 0) {
    errors.push('Topic name is required')
  }

  if (topic.name && topic.name.length > 200) {
    errors.push('Topic name must be less than 200 characters')
  }

  if (topic.order < 0) {
    errors.push('Topic order must be non-negative')
  }

  if (topic.createdAtMs <= 0) {
    errors.push('Created timestamp must be positive')
  }

  if (topic.updatedAtMs <= 0) {
    errors.push('Updated timestamp must be positive')
  }

  if (topic.color && !/^#[0-9A-Fa-f]{6}$/.test(topic.color) && !/^[a-z]+$/.test(topic.color)) {
    errors.push('Topic color must be a valid hex color (#RRGGBB) or named color')
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

export function validateCreateTopicInput(input: CreateTopicInput): ValidationResult {
  const errors: string[] = []

  if (!input.userId) {
    errors.push('User ID is required')
  }

  if (!input.name || input.name.trim().length === 0) {
    errors.push('Topic name is required')
  }

  if (input.name && input.name.length > 200) {
    errors.push('Topic name must be less than 200 characters')
  }

  if (input.order < 0) {
    errors.push('Topic order must be non-negative')
  }

  if (input.color && !/^#[0-9A-Fa-f]{6}$/.test(input.color) && !/^[a-z]+$/.test(input.color)) {
    errors.push('Topic color must be a valid hex color (#RRGGBB) or named color')
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

// ----- Section Validation -----

export function validateSection(section: Section): ValidationResult {
  const errors: string[] = []

  if (!section.sectionId) {
    errors.push('Section ID is required')
  }

  if (!section.userId) {
    errors.push('User ID is required')
  }

  if (!section.topicId) {
    errors.push('Topic ID is required (section must belong to a topic)')
  }

  if (!section.name || section.name.trim().length === 0) {
    errors.push('Section name is required')
  }

  if (section.name && section.name.length > 200) {
    errors.push('Section name must be less than 200 characters')
  }

  if (section.order < 0) {
    errors.push('Section order must be non-negative')
  }

  if (section.createdAtMs <= 0) {
    errors.push('Created timestamp must be positive')
  }

  if (section.updatedAtMs <= 0) {
    errors.push('Updated timestamp must be positive')
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

export function validateCreateSectionInput(input: CreateSectionInput): ValidationResult {
  const errors: string[] = []

  if (!input.userId) {
    errors.push('User ID is required')
  }

  if (!input.topicId) {
    errors.push('Topic ID is required (section must belong to a topic)')
  }

  if (!input.name || input.name.trim().length === 0) {
    errors.push('Section name is required')
  }

  if (input.name && input.name.length > 200) {
    errors.push('Section name must be less than 200 characters')
  }

  if (input.order < 0) {
    errors.push('Section order must be non-negative')
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

// ----- Attachment Validation -----

export function validateAttachment(attachment: Attachment): ValidationResult {
  const errors: string[] = []

  if (!attachment.attachmentId) {
    errors.push('Attachment ID is required')
  }

  if (!attachment.userId) {
    errors.push('User ID is required')
  }

  if (!attachment.noteId) {
    errors.push('Note ID is required (attachment must belong to a note)')
  }

  if (!attachment.fileName || attachment.fileName.trim().length === 0) {
    errors.push('File name is required')
  }

  if (!attachment.fileType || attachment.fileType.trim().length === 0) {
    errors.push('File type (MIME type) is required')
  }

  if (attachment.fileSizeBytes <= 0) {
    errors.push('File size must be positive')
  }

  // Enforce 50MB limit per attachment
  const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB
  if (attachment.fileSizeBytes > MAX_FILE_SIZE) {
    errors.push(`File size must be less than ${MAX_FILE_SIZE / (1024 * 1024)}MB`)
  }

  if (attachment.uploadedAtMs <= 0) {
    errors.push('Upload timestamp must be positive')
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

export function validateCreateAttachmentInput(input: CreateAttachmentInput): ValidationResult {
  const errors: string[] = []

  if (!input.userId) {
    errors.push('User ID is required')
  }

  if (!input.noteId) {
    errors.push('Note ID is required (attachment must belong to a note)')
  }

  if (!input.fileName || input.fileName.trim().length === 0) {
    errors.push('File name is required')
  }

  if (!input.fileType || input.fileType.trim().length === 0) {
    errors.push('File type (MIME type) is required')
  }

  if (input.fileSizeBytes <= 0) {
    errors.push('File size must be positive')
  }

  // Enforce 50MB limit per attachment
  const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB
  if (input.fileSizeBytes > MAX_FILE_SIZE) {
    errors.push(`File size must be less than ${MAX_FILE_SIZE / (1024 * 1024)}MB`)
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}
