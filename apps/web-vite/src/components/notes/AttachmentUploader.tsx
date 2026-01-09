/**
 * AttachmentUploader Component
 *
 * File upload component for note attachments.
 * Supports drag-and-drop, file selection, and paste-from-clipboard.
 * Shows upload progress and manages attachment list.
 */

import { useState, useRef, useCallback } from 'react'
import type { Attachment, NoteId } from '@lifeos/notes'

export interface AttachmentUploaderProps {
  noteId: NoteId
  attachments: Attachment[]
  onUpload: (file: File) => Promise<void>
  onDelete: (attachmentId: string) => Promise<void>
  className?: string
}

export function AttachmentUploader({
  attachments,
  onUpload,
  onDelete,
  className = '',
}: AttachmentUploaderProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [uploadingFiles, setUploadingFiles] = useState<Map<string, number>>(new Map())
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return

      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        const fileId = `${file.name}-${Date.now()}-${i}`

        try {
          // Add to uploading list
          setUploadingFiles((prev) => new Map(prev).set(fileId, 0))

          // Upload file
          await onUpload(file)

          // Remove from uploading list
          setUploadingFiles((prev) => {
            const next = new Map(prev)
            next.delete(fileId)
            return next
          })
        } catch (error) {
          console.error('Failed to upload file:', error)
          // Remove from uploading list on error
          setUploadingFiles((prev) => {
            const next = new Map(prev)
            next.delete(fileId)
            return next
          })
        }
      }
    },
    [onUpload]
  )

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)
      handleFileSelect(e.dataTransfer.files)
    },
    [handleFileSelect]
  )

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const items = e.clipboardData?.items
      if (!items) return

      const files: File[] = []
      for (let i = 0; i < items.length; i++) {
        const item = items[i]
        if (item.kind === 'file') {
          const file = item.getAsFile()
          if (file) files.push(file)
        }
      }

      if (files.length > 0) {
        const fileList = {
          length: files.length,
          item: (index: number) => files[index],
          [Symbol.iterator]: function* () {
            for (const file of files) yield file
          },
        } as FileList

        handleFileSelect(fileList)
      }
    },
    [handleFileSelect]
  )

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const isImage = (fileType: string) => fileType.startsWith('image/')

  return (
    <div className={`attachment-uploader ${className}`} onPaste={handlePaste}>
      {/* Upload Area */}
      <div
        className={`upload-area ${isDragging ? 'dragging' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <div className="upload-icon">📎</div>
        <p className="upload-text">
          Click to upload or drag and drop
          <br />
          <span className="upload-hint">You can also paste images from clipboard</span>
        </p>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={(e) => handleFileSelect(e.target.files)}
          style={{ display: 'none' }}
          aria-label="Upload files"
        />
      </div>

      {/* Uploading Files */}
      {uploadingFiles.size > 0 && (
        <div className="uploading-list">
          {Array.from(uploadingFiles.entries()).map(([fileId, progress]) => (
            <div key={fileId} className="uploading-item">
              <span className="file-name">{fileId.split('-')[0]}</span>
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${progress}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Attachments List */}
      {attachments.length > 0 && (
        <div className="attachments-list">
          <h4>Attachments ({attachments.length})</h4>
          {attachments.map((attachment) => (
            <div key={attachment.attachmentId} className="attachment-item">
              <div className="attachment-info">
                {isImage(attachment.fileType) ? (
                  <div className="attachment-preview">
                    {attachment.storageUrl && (
                      <img src={attachment.storageUrl} alt={attachment.fileName} />
                    )}
                  </div>
                ) : (
                  <div className="attachment-icon">📄</div>
                )}
                <div className="attachment-details">
                  <span className="attachment-name">{attachment.fileName}</span>
                  <span className="attachment-size">
                    {formatFileSize(attachment.fileSizeBytes)}
                  </span>
                </div>
              </div>
              <button
                onClick={() => onDelete(attachment.attachmentId)}
                className="btn-delete"
                aria-label={`Delete ${attachment.fileName}`}
                title="Delete attachment"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <style>{`
        .attachment-uploader {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .upload-area {
          border: 2px dashed var(--border);
          border-radius: 16px;
          padding: 32px;
          text-align: center;
          cursor: pointer;
          background: var(--card);
          transition:
            border-color var(--motion-standard) var(--motion-ease),
            box-shadow var(--motion-standard) var(--motion-ease);
        }

        .upload-area:hover {
          border-color: var(--accent);
          box-shadow: 0 0 0 3px var(--accent-subtle);
        }

        .upload-area.dragging {
          border-color: var(--accent);
          background: var(--accent-subtle);
        }

        .upload-icon {
          font-size: 48px;
          margin-bottom: 8px;
        }

        .upload-text {
          margin: 0;
          font-size: 14px;
          color: var(--foreground);
        }

        .upload-hint {
          font-size: 12px;
          color: var(--muted-foreground);
        }

        .uploading-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .uploading-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 8px 12px;
          background: var(--background-secondary);
          border-radius: 10px;
          border: 1px solid var(--border);
        }

        .file-name {
          flex: 1;
          font-size: 14px;
          color: var(--foreground);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .progress-bar {
          flex: 1;
          height: 4px;
          background: var(--border);
          border-radius: 2px;
          overflow: hidden;
        }

        .progress-fill {
          height: 100%;
          background: var(--success);
          transition: width 0.3s;
        }

        .attachments-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .attachments-list h4 {
          margin: 0;
          font-size: 14px;
          font-weight: 600;
          color: var(--foreground);
        }

        .attachment-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px;
          background: var(--background-secondary);
          border-radius: 10px;
          border: 1px solid var(--border);
        }

        .attachment-info {
          display: flex;
          align-items: center;
          gap: 12px;
          flex: 1;
        }

        .attachment-preview {
          width: 48px;
          height: 48px;
          border-radius: 10px;
          overflow: hidden;
          background: var(--border);
        }

        .attachment-preview img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .attachment-icon {
          width: 48px;
          height: 48px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 24px;
          background: var(--background-tertiary);
          border-radius: 10px;
        }

        .attachment-details {
          display: flex;
          flex-direction: column;
          gap: 4px;
          flex: 1;
        }

        .attachment-name {
          font-size: 14px;
          font-weight: 500;
          color: var(--foreground);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .attachment-size {
          font-size: 12px;
          color: var(--muted-foreground);
        }

        .btn-delete {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          border: none;
          background: transparent;
          color: var(--foreground);
          cursor: pointer;
          font-size: 20px;
          line-height: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background var(--motion-fast) var(--motion-ease);
        }

        .btn-delete:hover {
          background: var(--error-light);
          color: var(--error);
        }
      `}</style>
    </div>
  )
}
