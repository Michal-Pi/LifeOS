/**
 * Note Import Modal Component
 *
 * Allows users to import Markdown or PDF files as notes.
 * Supports creating new notes or appending to existing notes.
 */

import { useState, useRef, useCallback } from 'react'
import { toast } from 'sonner'
import type { JSONContent } from '@tiptap/core'
import { importFile, mergeJsonContent, detectFileType } from '@/lib/noteImport'
import '@/styles/components/ImportModal.css'

interface ImportModalProps {
  isOpen: boolean
  onClose: () => void
  onImportNew: (content: JSONContent, title: string, tags?: string[]) => Promise<void>
  onAppendToCurrent: (content: JSONContent) => Promise<void>
  currentNoteExists: boolean
  currentNoteContent?: JSONContent
}

type ImportState = 'idle' | 'loading' | 'preview' | 'importing' | 'success' | 'error'
type ImportMode = 'new' | 'append'

export function ImportModal({
  isOpen,
  onClose,
  onImportNew,
  onAppendToCurrent,
  currentNoteExists,
  currentNoteContent,
}: ImportModalProps) {
  const [state, setState] = useState<ImportState>('idle')
  const [importMode, setImportMode] = useState<ImportMode>('new')
  const [isDragging, setIsDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Parsed content state
  const [parsedContent, setParsedContent] = useState<JSONContent | null>(null)
  const [parsedTitle, setParsedTitle] = useState('')
  const [parsedTags, setParsedTags] = useState<string[]>([])
  const [fileInfo, setFileInfo] = useState<{ name: string; size: number; format: string } | null>(
    null
  )

  const fileInputRef = useRef<HTMLInputElement>(null)

  const resetState = useCallback(() => {
    setState('idle')
    setError(null)
    setParsedContent(null)
    setParsedTitle('')
    setParsedTags([])
    setFileInfo(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }, [])

  const handleFileSelect = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return

    const file = files[0]
    const fileType = detectFileType(file)

    if (fileType === 'unknown') {
      setError(`Unsupported file format. Please use .md, .pdf, or .txt files.`)
      setState('error')
      return
    }

    // File size limit: 10MB
    if (file.size > 10 * 1024 * 1024) {
      setError('File is too large. Maximum size is 10MB.')
      setState('error')
      return
    }

    setState('loading')
    setError(null)

    try {
      const result = await importFile(file)

      setParsedContent(result.content)
      setParsedTitle(result.title)
      setParsedTags(result.tags || [])
      setFileInfo({
        name: file.name,
        size: file.size,
        format: result.format.toUpperCase(),
      })
      setState('preview')
    } catch (err) {
      console.error('Failed to parse file:', err)
      setError(err instanceof Error ? err.message : 'Failed to parse file')
      setState('error')
    }
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragging(false)
      handleFileSelect(e.dataTransfer.files)
    },
    [handleFileSelect]
  )

  const handleImport = useCallback(async () => {
    if (!parsedContent) return

    setState('importing')

    try {
      if (importMode === 'new') {
        await onImportNew(
          parsedContent,
          parsedTitle,
          parsedTags.length > 0 ? parsedTags : undefined
        )
        toast.success('Note imported successfully', {
          description: `Created "${parsedTitle}"`,
        })
      } else {
        if (!currentNoteContent) {
          throw new Error('No current note to append to')
        }
        const mergedContent = mergeJsonContent(currentNoteContent, parsedContent)
        await onAppendToCurrent(mergedContent)
        toast.success('Content appended successfully')
      }
      setState('success')
      // Auto-close after success
      setTimeout(() => {
        resetState()
        onClose()
      }, 500)
    } catch (err) {
      console.error('Failed to import:', err)
      setError(err instanceof Error ? err.message : 'Failed to import')
      setState('error')
    }
  }, [
    parsedContent,
    parsedTitle,
    parsedTags,
    importMode,
    currentNoteContent,
    onImportNew,
    onAppendToCurrent,
    onClose,
    resetState,
  ])

  const handleClose = useCallback(() => {
    resetState()
    onClose()
  }, [resetState, onClose])

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  if (!isOpen) return null

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-content note-import-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Import Document</h2>
          <button type="button" className="close-button" onClick={handleClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="modal-body">
          {/* File Drop Zone - shown in idle and error states */}
          {(state === 'idle' || state === 'error') && (
            <div
              className={`import-drop-zone ${isDragging ? 'dragging' : ''}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <p className="drop-zone-text">
                {isDragging ? 'Drop your file here' : 'Click to upload or drag and drop'}
              </p>
              <p className="drop-zone-hint">
                Markdown (.md), PDF (.pdf), or Text (.txt) up to 10MB
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".md,.markdown,.pdf,.txt"
                onChange={(e) => handleFileSelect(e.target.files)}
                style={{ display: 'none' }}
                aria-label="Upload document"
              />
            </div>
          )}

          {/* Error Display */}
          {state === 'error' && error && (
            <div className="import-error">
              <span>{error}</span>
            </div>
          )}

          {/* Loading State */}
          {state === 'loading' && (
            <div className="import-loading">
              <div className="loading-spinner" />
              <p>Parsing document...</p>
            </div>
          )}

          {/* Preview State */}
          {state === 'preview' && parsedContent && fileInfo && (
            <div className="import-preview">
              {/* File Info */}
              <div className="import-file-info">
                <div className="file-info-details">
                  <span className="file-info-name">{fileInfo.name}</span>
                  <span className="file-info-meta">
                    {fileInfo.format} • {formatFileSize(fileInfo.size)}
                  </span>
                </div>
                <button type="button" className="file-change-button" onClick={resetState}>
                  Change
                </button>
              </div>

              {/* Title Input */}
              <div className="import-field">
                <label htmlFor="import-title">Title</label>
                <input
                  id="import-title"
                  type="text"
                  value={parsedTitle}
                  onChange={(e) => setParsedTitle(e.target.value)}
                  placeholder="Note title"
                  className="import-input"
                />
              </div>

              {/* Tags Display (if extracted) */}
              {parsedTags.length > 0 && (
                <div className="import-field">
                  <label>Extracted Tags</label>
                  <div className="import-tags">
                    {parsedTags.map((tag) => (
                      <span key={tag} className="import-tag">
                        #{tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Import Mode Selection */}
              <div className="import-field">
                <label>Import as</label>
                <div className="import-mode-options">
                  <label className={`import-mode-option ${importMode === 'new' ? 'selected' : ''}`}>
                    <input
                      type="radio"
                      name="importMode"
                      value="new"
                      checked={importMode === 'new'}
                      onChange={() => setImportMode('new')}
                    />
                    <span className="option-label">New note</span>
                    <span className="option-desc">Create a new note with this content</span>
                  </label>
                  <label
                    className={`import-mode-option ${importMode === 'append' ? 'selected' : ''} ${!currentNoteExists ? 'disabled' : ''}`}
                  >
                    <input
                      type="radio"
                      name="importMode"
                      value="append"
                      checked={importMode === 'append'}
                      onChange={() => setImportMode('append')}
                      disabled={!currentNoteExists}
                    />
                    <span className="option-label">Append to current note</span>
                    <span className="option-desc">
                      {currentNoteExists
                        ? 'Add this content to the end of your current note'
                        : 'Open a note first to use this option'}
                    </span>
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* Importing State */}
          {state === 'importing' && (
            <div className="import-loading">
              <div className="loading-spinner" />
              <p>{importMode === 'new' ? 'Creating note...' : 'Appending content...'}</p>
            </div>
          )}

          {/* Success State */}
          {state === 'success' && (
            <div className="import-success">
              <p>Import completed!</p>
            </div>
          )}
        </div>

        <div className="modal-actions">
          {(state === 'idle' || state === 'error') && (
            <button type="button" className="ghost-button" onClick={handleClose}>
              Cancel
            </button>
          )}

          {state === 'preview' && (
            <>
              <button type="button" className="ghost-button" onClick={handleClose}>
                Cancel
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={handleImport}
                disabled={!parsedTitle.trim()}
              >
                {importMode === 'new' ? 'Create Note' : 'Append to Note'}
              </button>
            </>
          )}

          {(state === 'loading' || state === 'importing') && (
            <button type="button" className="ghost-button" disabled>
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
