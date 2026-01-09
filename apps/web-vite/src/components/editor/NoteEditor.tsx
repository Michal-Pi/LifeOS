/**
 * NoteEditor Component
 *
 * High-level wrapper for TipTap editor with:
 * - Auto-save functionality
 * - Toolbar controls
 * - Save status indicator
 * - Project linking
 * - File attachments
 */

import React from 'react'
import { createPortal } from 'react-dom'
import { TipTapEditor } from './TipTapEditor'
import { useNoteEditor } from '@/hooks/useNoteEditor'
import { useAttachments } from '@/hooks/useAttachments'
import { ProjectLinker } from '@/components/notes/ProjectLinker'
import { OKRLinker } from '@/components/notes/OKRLinker'
import { AttachmentUploader } from '@/components/notes/AttachmentUploader'
import { TagEditor } from '@/components/notes/TagEditor'
import type { Note, AttachmentId } from '@lifeos/notes'

export interface NoteEditorProps {
  note?: Note
  placeholder?: string
  editable?: boolean
  autoSaveDelay?: number
  onSave?: (content: object, html: string) => Promise<void>
  onChange?: (content: object, html: string) => void
  onProjectsChange?: (projectIds: string[]) => Promise<void>
  onOKRsChange?: (okrIds: string[]) => Promise<void>
  onAttachmentsChange?: (attachmentIds: AttachmentId[]) => Promise<void>
  onTagsChange?: (tags: string[]) => Promise<void>
  showProjectLinker?: boolean
  showOKRLinker?: boolean
  showAttachments?: boolean
  showTags?: boolean
  className?: string
  statusContainerId?: string
}

export function NoteEditor({
  note,
  placeholder = 'Start writing your note...',
  editable = true,
  autoSaveDelay = 2000,
  onSave,
  onChange,
  onProjectsChange,
  onOKRsChange,
  onAttachmentsChange,
  onTagsChange,
  showProjectLinker = true,
  showOKRLinker = true,
  showAttachments = true,
  showTags = true,
  className = '',
  statusContainerId,
}: NoteEditorProps) {
  const { content, isDirty, isSaving, lastSaved, error, handleContentChange, handleHtmlChange } =
    useNoteEditor({
      note,
      autoSaveDelay,
      onSave,
      onChange,
    })

  const {
    attachments,
    error: attachmentsError,
    uploadFile,
    deleteAttachment,
    loadAttachments,
  } = useAttachments()

  const [statusContainer, setStatusContainer] = React.useState<HTMLElement | null>(null)

  React.useEffect(() => {
    if (!statusContainerId) {
      setStatusContainer(null)
      return
    }
    setStatusContainer(document.getElementById(statusContainerId))
  }, [statusContainerId])

  // Load attachments when note changes
  React.useEffect(() => {
    if (showAttachments && note?.noteId) {
      loadAttachments(note.noteId)
    }
  }, [note?.noteId, loadAttachments, showAttachments])

  // Handle project changes
  const handleProjectsChange = async (projectIds: string[]) => {
    if (onProjectsChange) {
      await onProjectsChange(projectIds)
    }
  }

  // Handle OKR changes
  const handleOKRsChange = async (okrIds: string[]) => {
    if (onOKRsChange) {
      await onOKRsChange(okrIds)
    }
  }

  const handleTagsChange = async (tags: string[]) => {
    if (onTagsChange) {
      await onTagsChange(tags)
    }
  }

  // Handle attachment upload
  const handleUploadFile = async (file: File) => {
    if (!note?.noteId) {
      throw new Error('Cannot upload attachments without a note')
    }

    const attachment = await uploadFile(note.noteId, file)

    // Notify parent of attachment change
    if (onAttachmentsChange && note) {
      const updatedAttachmentIds = [...(note.attachmentIds || []), attachment.attachmentId]
      await onAttachmentsChange(updatedAttachmentIds)
    }
  }

  // Handle attachment deletion
  const handleDeleteAttachment = async (attachmentId: AttachmentId) => {
    await deleteAttachment(attachmentId)

    // Notify parent of attachment change
    if (onAttachmentsChange && note) {
      const updatedAttachmentIds = (note.attachmentIds || []).filter((id) => id !== attachmentId)
      await onAttachmentsChange(updatedAttachmentIds)
    }
  }

  return (
    <div className={`note-editor ${className}`}>
      {(() => {
        const statusNode = (
          <div className="save-status" aria-live="polite" aria-atomic="true">
            {isSaving && <span className="saving">Saving...</span>}
            {error && (
              <span className="error" role="alert">
                Save failed: {error.message}
              </span>
            )}
            {!isSaving && !error && isDirty && <span className="unsaved">Unsaved changes</span>}
            {!isSaving && !error && !isDirty && lastSaved && (
              <span className="saved">Saved {formatLastSaved(lastSaved)}</span>
            )}
          </div>
        )

        if (statusContainer) {
          return createPortal(statusNode, statusContainer)
        }

        return statusNode
      })()}

      {/* Editor */}
      <TipTapEditor
        content={content}
        placeholder={placeholder}
        editable={editable}
        onChange={handleContentChange}
        onUpdate={handleHtmlChange}
        className="editor-content"
      />

      {/* Project Linker */}
      {showProjectLinker && note && editable && (
        <div className="editor-section">
          <ProjectLinker
            linkedProjectIds={note.projectIds || []}
            onProjectsChange={handleProjectsChange}
            className="project-linker-section"
          />
        </div>
      )}

      {/* OKR Linker */}
      {showOKRLinker && note && editable && (
        <div className="editor-section">
          <OKRLinker
            selectedOKRIds={note.okrIds || []}
            onChange={handleOKRsChange}
            className="okr-linker-section"
          />
        </div>
      )}

      {/* Attachments */}
      {showAttachments && note && editable && (
        <div className="editor-section">
          <AttachmentUploader
            noteId={note.noteId}
            attachments={attachments}
            onUpload={handleUploadFile}
            onDelete={handleDeleteAttachment}
            className="attachments-section"
          />
          {attachmentsError && (
            <div className="error" role="alert">
              Attachment error: {attachmentsError.message}
            </div>
          )}
        </div>
      )}

      {/* Tags */}
      {showTags && note && editable && (
        <div className="editor-section">
          <TagEditor tags={note.tags || []} onChange={handleTagsChange} />
        </div>
      )}

      <style>{`
        .note-editor {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
          height: 100%;
          width: 100%;
          min-height: 0;
          position: relative;
        }

        .save-status {
          font-size: 0.7rem;
          text-align: right;
          color: var(--text-secondary);
          margin: 0;
          pointer-events: none;
        }

        .saving {
          color: var(--muted-foreground);
        }

        .saved {
          color: var(--success);
        }

        .unsaved {
          color: var(--warning);
        }

        .error {
          color: var(--error);
          font-weight: 500;
        }

        .editor-content {
          flex: 1;
          min-height: 0;
        }

        .editor-section {
          border-top: 1px solid var(--border);
          padding-top: 1.5rem;
          margin-top: 1.5rem;
        }
      `}</style>
    </div>
  )
}

/**
 * Format last saved time in a human-readable way
 */
function formatLastSaved(date: Date): string {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffSecs = Math.floor(diffMs / 1000)
  const diffMins = Math.floor(diffSecs / 60)

  if (diffSecs < 10) {
    return 'just now'
  } else if (diffSecs < 60) {
    return `${diffSecs}s ago`
  } else if (diffMins < 60) {
    return `${diffMins}m ago`
  } else {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }
}
