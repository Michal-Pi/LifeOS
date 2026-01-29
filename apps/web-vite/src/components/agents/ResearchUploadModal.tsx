import { useEffect, useState, useRef } from 'react'
import type { DeepResearchRequest, DeepResearchSource } from '@lifeos/agents'
import { Button } from '@/components/ui/button'
import styles from './ResearchQueue.module.css'

interface ResearchUploadModalProps {
  isOpen: boolean
  request: DeepResearchRequest | null
  onClose: () => void
  onUpload: (payload: {
    source: DeepResearchSource
    model: string
    content: string
  }) => Promise<void>
}

export function ResearchUploadModal({
  isOpen,
  request,
  onClose,
  onUpload,
}: ResearchUploadModalProps) {
  const [source, setSource] = useState<DeepResearchSource>('claude')
  const [model, setModel] = useState('')
  const [content, setContent] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (!isOpen) return
    setSource('claude')
    setModel('')
    setContent('')
    setError(null)
    setIsSubmitting(false)
    setIsDragging(false)
  }, [isOpen, request?.requestId])

  if (!isOpen || !request) {
    return null
  }

  const handleFileSelect = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    const file = files[0]
    try {
      const text = await file.text()
      setContent(text)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const handleUpload = async () => {
    if (!content.trim()) {
      setError('Please paste or upload research content.')
      return
    }
    setError(null)
    setIsSubmitting(true)
    try {
      await onUpload({
        source,
        model: model.trim() || 'unknown',
        content,
      })
      onClose()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className={`modal-content ${styles['research-upload-modal']}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <h2>Upload Research Results</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            x
          </button>
        </div>

        <div className={styles['research-upload-fields']}>
          <label className={styles['research-field']}>
            <span>Source</span>
            <select
              value={source}
              onChange={(event) => setSource(event.target.value as DeepResearchSource)}
            >
              <option value="claude">Claude</option>
              <option value="chatgpt">ChatGPT</option>
              <option value="gemini">Gemini</option>
              <option value="other">Other</option>
            </select>
          </label>

          <label className={styles['research-field']}>
            <span>Model</span>
            <input
              type="text"
              value={model}
              onChange={(event) => setModel(event.target.value)}
              placeholder="e.g. gpt-4o, claude-3-opus"
            />
          </label>
        </div>

        <div
          className={`${styles['research-upload-dropzone']} ${isDragging ? styles['is-dragging'] : ''}`}
          onDragOver={(event) => {
            event.preventDefault()
            setIsDragging(true)
          }}
          onDragLeave={(event) => {
            event.preventDefault()
            setIsDragging(false)
          }}
          onDrop={(event) => {
            event.preventDefault()
            setIsDragging(false)
            void handleFileSelect(event.dataTransfer.files)
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,.md"
            onChange={(event) => void handleFileSelect(event.target.files)}
          />
          <p>Drag and drop a text file or</p>
          <Button variant="ghost" type="button" onClick={() => fileInputRef.current?.click()}>
            Choose File
          </Button>
        </div>

        <label className={styles['research-field']}>
          <span>Paste Results</span>
          <textarea
            value={content}
            onChange={(event) => setContent(event.target.value)}
            rows={8}
            placeholder="Paste the research response here..."
          />
        </label>

        {error && <div className={styles['research-upload-error']}>{error}</div>}

        <div className="modal-actions">
          <Button variant="ghost" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={handleUpload} disabled={isSubmitting}>
            {isSubmitting ? 'Uploading...' : 'Upload Results'}
          </Button>
        </div>
      </div>
    </div>
  )
}
