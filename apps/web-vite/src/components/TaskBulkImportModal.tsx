/**
 * Task Bulk Import Modal Component
 *
 * Allows users to import multiple tasks from Markdown files or pasted text.
 */

import { useState, useRef, useCallback, useEffect } from 'react'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/useAuth'
import { useTaskMarkdownImport } from '@/hooks/useTaskMarkdownImport'
import { useTodoOperations } from '@/hooks/useTodoOperations'
import type { CanonicalProject, CanonicalChapter } from '@/types/todo'
import { TaskMarkdownPreviewPanel } from './TaskMarkdownPreviewPanel'
import { TaskFormatDocModal } from './TaskFormatDocModal'

interface TaskBulkImportModalProps {
  isOpen: boolean
  onClose: () => void
  onImportComplete?: () => void
  projects: CanonicalProject[]
  chapters: CanonicalChapter[]
}

export function TaskBulkImportModal({
  isOpen,
  onClose,
  onImportComplete,
  projects,
  chapters,
}: TaskBulkImportModalProps) {
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState<'upload' | 'paste'>('upload')
  const [isDragging, setIsDragging] = useState(false)
  const [showDocModal, setShowDocModal] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const lastTaskImportResultRef = useRef<typeof taskImportResult | null>(null)

  // Todo operations hook for createTask
  const { createTask, loadData } = useTodoOperations({
    userId: user?.uid || '',
  })

  // Load projects and chapters when modal opens and user is available
  useEffect(() => {
    if (isOpen && user?.uid) {
      loadData({ includeTasks: false })
    }
  }, [isOpen, user?.uid, loadData])

  // Task import hook
  const {
    state,
    markdown,
    parsedTasks,
    errors,
    importResult: taskImportResult,
    setMarkdown,
    parseAndValidate,
    reset,
    setState,
    createTasks,
  } = useTaskMarkdownImport()

  // Show toast notifications based on import result (only once per result)
  useEffect(() => {
    if (
      taskImportResult &&
      state === 'success' &&
      taskImportResult !== lastTaskImportResultRef.current
    ) {
      lastTaskImportResultRef.current = taskImportResult

      if (taskImportResult.failureCount > 0 && taskImportResult.successCount === 0) {
        // All failed - errors are already set in the hook
        toast.error('Failed to import tasks', {
          description: `All ${taskImportResult.failureCount} task${taskImportResult.failureCount !== 1 ? 's' : ''} failed to import.`,
        })
      } else if (taskImportResult.failureCount > 0) {
        // Partial success
        toast.warning('Tasks imported with errors', {
          description: `Created ${taskImportResult.successCount} task${taskImportResult.successCount !== 1 ? 's' : ''}, ${taskImportResult.failureCount} failed.`,
        })
        if (onImportComplete) {
          onImportComplete()
        }
      } else {
        // All succeeded
        toast.success('Tasks imported successfully', {
          description: `Created ${taskImportResult.successCount} task${taskImportResult.successCount !== 1 ? 's' : ''}`,
        })
        if (onImportComplete) {
          onImportComplete()
        }
      }
    }
  }, [taskImportResult, state, onImportComplete])

  const handleImportTasks = useCallback(async () => {
    if (!parsedTasks || parsedTasks.length === 0 || !user?.uid) return

    try {
      await createTasks(user.uid, projects, chapters, createTask)
      // Toast notifications are handled by useEffect watching taskImportResult
    } catch (error) {
      console.error('Failed to import tasks:', error)
      toast.error('Failed to import tasks', {
        description: (error as Error).message,
      })
      setState('preview') // Go back to preview so user can retry
    }
  }, [parsedTasks, user, projects, chapters, createTask, createTasks, setState])

  const handleFileSelect = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return

      const file = files[0]

      // Validate file type
      if (!file.name.endsWith('.md')) {
        setState('error')
        toast.error('Invalid file type', {
          description: 'Please select a .md file',
        })
        return
      }

      // Validate file size (1MB max)
      if (file.size > 1024 * 1024) {
        setState('error')
        toast.error('File too large', {
          description: 'File size must be less than 1MB',
        })
        return
      }

      // Read file content
      try {
        const text = await file.text()
        setMarkdown(text)
        // Auto-parse after file load
        setTimeout(() => {
          parseAndValidate()
        }, 100)
      } catch (error) {
        console.error('Failed to read file:', error)
        setState('error')
        toast.error('Failed to read file', {
          description: (error as Error).message,
        })
      }
    },
    [setMarkdown, parseAndValidate, setState]
  )

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

  const handleClose = useCallback(() => {
    reset()
    onClose()
  }, [reset, onClose])

  const handleParseClick = useCallback(() => {
    parseAndValidate()
  }, [parseAndValidate])

  const characterCount = markdown.length
  const maxCharacters = 100000
  const isOverLimit = characterCount > maxCharacters

  if (!isOpen) return null

  return (
    <div
      className="modal-overlay"
      onClick={(e) => {
        e.stopPropagation() // Prevent bubbling to parent modal overlay
        handleClose()
      }}
    >
      <div className="modal-content task-bulk-import-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2>Import Tasks from Markdown</h2>
            <button type="button" className="help-link" onClick={() => setShowDocModal(true)}>
              View format documentation
            </button>
          </div>
          <button type="button" className="close-button" onClick={handleClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="modal-body">
          {/* Tabs */}
          <div className="import-tabs">
            <button
              type="button"
              className={`tab-button ${activeTab === 'upload' ? 'active' : ''}`}
              onClick={() => setActiveTab('upload')}
            >
              Upload File
            </button>
            <button
              type="button"
              className={`tab-button ${activeTab === 'paste' ? 'active' : ''}`}
              onClick={() => setActiveTab('paste')}
            >
              Paste Text
            </button>
          </div>

          {/* Upload Tab */}
          {activeTab === 'upload' && (
            <div
              className={`upload-area ${isDragging ? 'dragging' : ''}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <div className="upload-icon">📄</div>
              <p className="upload-text">
                {isDragging ? 'Drop your .md file here' : 'Click to upload or drag and drop'}
              </p>
              <p className="upload-hint">Markdown file (.md) up to 1MB</p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".md"
                onChange={(e) => handleFileSelect(e.target.files)}
                style={{ display: 'none' }}
                aria-label="Upload markdown file"
              />
            </div>
          )}

          {/* Paste Tab */}
          {activeTab === 'paste' && (
            <div className="paste-area">
              <label htmlFor="task-markdown-textarea" className="textarea-label">
                Paste your Markdown content
              </label>
              <textarea
                id="task-markdown-textarea"
                className={`markdown-textarea ${isOverLimit ? 'error' : ''}`}
                value={markdown}
                onChange={(e) => setMarkdown(e.target.value)}
                placeholder="- Task Title [domain:work] [importance:7] [urgency:today]&#10;Description: Optional task description&#10;&#10;- Another Task [project:My Project] [chapter:Chapter Name]"
                rows={15}
                disabled={state === 'validating' || state === 'creating'}
              />
              <div className="character-counter">
                <span className={isOverLimit ? 'error' : ''}>
                  {characterCount.toLocaleString()} / {maxCharacters.toLocaleString()} characters
                </span>
              </div>
            </div>
          )}

          {/* Error Display */}
          {state === 'error' && errors.length > 0 && (
            <div className="validation-errors">
              <h3>Validation Errors</h3>
              <ul>
                {errors.map((error, index) => (
                  <li key={index}>
                    {error.line && <span className="error-line">Line {error.line}: </span>}
                    <span className="error-field">{error.field}:</span> {error.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Loading State */}
          {state === 'validating' && (
            <div className="loading-state">
              <p>Parsing and validating markdown...</p>
            </div>
          )}

          {/* Preview State */}
          {state === 'preview' && parsedTasks && parsedTasks.length > 0 && (
            <div className="preview-container">
              <p className="success-message">
                ✓ Markdown parsed successfully! Review the tasks below.
              </p>
              <TaskMarkdownPreviewPanel tasks={parsedTasks} />
            </div>
          )}

          {/* Creating State */}
          {state === 'creating' && (
            <div className="loading-state">
              <p>Creating tasks...</p>
            </div>
          )}

          {/* Success State */}
          {state === 'success' && taskImportResult && (
            <div className="success-state">
              <p className="success-message">
                ✓ Import completed successfully! Created {taskImportResult.successCount} task
                {taskImportResult.successCount !== 1 ? 's' : ''}.
                {taskImportResult.failureCount > 0 && (
                  <span>
                    {' '}
                    {taskImportResult.failureCount} task
                    {taskImportResult.failureCount !== 1 ? 's' : ''} failed.
                  </span>
                )}
              </p>
              {taskImportResult.failureCount > 0 && (
                <div className="validation-errors import-failures">
                  <h3>Failed Tasks</h3>
                  <ul>
                    {taskImportResult.errors.map((error, index) => {
                      const lineNumber = parsedTasks[error.taskIndex]?.lineNumber
                      return (
                        <li key={`${error.taskIndex}-${index}`}>
                          {lineNumber && <span className="error-line">Line {lineNumber}: </span>}
                          <span className="error-field">{error.taskTitle}:</span> {error.error}
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="modal-actions">
          {state === 'input' || state === 'error' ? (
            <>
              <button type="button" className="ghost-button" onClick={handleClose}>
                Cancel
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={handleParseClick}
                disabled={!markdown.trim() || isOverLimit}
              >
                Parse Markdown
              </button>
            </>
          ) : state === 'preview' ? (
            <>
              <button type="button" className="ghost-button" onClick={reset}>
                Edit
              </button>
              <button type="button" className="ghost-button" onClick={handleClose}>
                Cancel
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={handleImportTasks}
                disabled={!parsedTasks || parsedTasks.length === 0 || !user?.uid}
              >
                Create Tasks
              </button>
            </>
          ) : state === 'success' ? (
            <button type="button" className="primary-button" onClick={handleClose}>
              Done
            </button>
          ) : (
            <button type="button" className="ghost-button" onClick={handleClose}>
              Cancel
            </button>
          )}
        </div>

        <style>{`
          .task-bulk-import-modal {
            max-width: 42rem;
            max-height: 90vh;
          }

          .import-tabs {
            display: flex;
            gap: 0.5rem;
            margin-bottom: 1.5rem;
            border-bottom: 1px solid var(--border);
          }

          .tab-button {
            padding: 0.75rem 1rem;
            background: none;
            border: none;
            border-bottom: 2px solid transparent;
            color: var(--muted-foreground);
            cursor: pointer;
            font-size: 0.875rem;
            font-weight: 500;
            transition: all var(--motion-standard) var(--motion-ease);
          }

          .tab-button:hover {
            color: var(--foreground);
          }

          .tab-button.active {
            color: var(--accent);
            border-bottom-color: var(--accent);
          }

          .upload-area {
            border: 2px dashed var(--border);
            border-radius: 8px;
            padding: 3rem 2rem;
            text-align: center;
            cursor: pointer;
            transition: all var(--motion-standard) var(--motion-ease);
            background: var(--background-secondary);
          }

          .upload-area:hover {
            border-color: var(--accent);
            background: var(--background-tertiary);
          }

          .upload-area.dragging {
            border-color: var(--accent);
            background: var(--accent-subtle);
          }

          .upload-icon {
            font-size: 3rem;
            margin-bottom: 1rem;
          }

          .upload-text {
            margin: 0 0 0.5rem 0;
            font-size: 1rem;
            font-weight: 500;
            color: var(--foreground);
          }

          .upload-hint {
            margin: 0;
            font-size: 0.875rem;
            color: var(--muted-foreground);
          }

          .paste-area {
            margin-top: 1rem;
          }

          .textarea-label {
            display: block;
            margin-bottom: 0.5rem;
            font-size: 0.875rem;
            font-weight: 500;
            color: var(--foreground);
          }

          .markdown-textarea {
            width: 100%;
            padding: 0.75rem;
            border: 1px solid var(--border);
            border-radius: 8px;
            background: var(--background);
            color: var(--foreground);
            font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
            font-size: 0.875rem;
            line-height: 1.6;
            resize: vertical;
            transition: border-color var(--motion-standard) var(--motion-ease);
          }

          .markdown-textarea:focus {
            outline: 2px solid transparent;
            border-color: var(--accent);
            box-shadow: 0 0 0 3px var(--accent-subtle);
          }

          .markdown-textarea.error {
            border-color: var(--destructive);
          }

          .markdown-textarea:disabled {
            opacity: 0.6;
            cursor: not-allowed;
          }

          .character-counter {
            margin-top: 0.5rem;
            text-align: right;
            font-size: 0.75rem;
            color: var(--muted-foreground);
          }

          .character-counter .error {
            color: var(--destructive);
          }

          .validation-errors {
            margin-top: 1.5rem;
            padding: 1rem;
            background: var(--destructive-subtle);
            border: 1px solid var(--destructive);
            border-radius: 8px;
          }

          .validation-errors h3 {
            margin: 0 0 0.75rem 0;
            font-size: 0.875rem;
            font-weight: 600;
            color: var(--destructive-foreground);
          }

          .validation-errors ul {
            margin: 0;
            padding-left: 1.25rem;
            list-style: disc;
          }

          .validation-errors li {
            margin: 0.5rem 0;
            font-size: 0.875rem;
            color: var(--destructive-foreground);
            line-height: 1.5;
          }

          .error-line {
            font-weight: 600;
          }

          .error-field {
            font-weight: 500;
          }

          .loading-state {
            margin-top: 1.5rem;
            padding: 1.5rem;
            text-align: center;
            color: var(--muted-foreground);
          }

          .preview-container {
            margin-top: 1.5rem;
          }

          .preview-container .success-message {
            margin: 0 0 1rem 0;
            padding: 0.75rem;
            background: var(--success-subtle);
            border: 1px solid var(--success);
            border-radius: 8px;
            font-weight: 500;
            color: var(--success-foreground);
          }

          .success-state {
            margin-top: 1.5rem;
            padding: 1.5rem;
            text-align: center;
          }

          .success-state .success-message {
            font-size: 1rem;
            font-weight: 500;
            color: var(--success-foreground);
          }

          .modal-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
          }

          .modal-header > div {
            flex: 1;
          }

          .help-link {
            margin-top: 0.25rem;
            padding: 0;
            background: none;
            border: none;
            font-size: 0.875rem;
            color: var(--accent);
            cursor: pointer;
            text-decoration: underline;
            transition: color var(--motion-fast) var(--motion-ease);
          }

          .help-link:hover {
            color: var(--accent-hover);
          }
        `}</style>
      </div>

      {/* Documentation Modal */}
      <TaskFormatDocModal isOpen={showDocModal} onClose={() => setShowDocModal(false)} />
    </div>
  )
}
