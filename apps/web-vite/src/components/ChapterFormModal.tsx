import { useState, useEffect } from 'react'
import { createLogger } from '@lifeos/core'

const logger = createLogger('ChapterFormModal')
import type { CanonicalChapter } from '@/types/todo'
import { generateId } from '@/lib/idGenerator'

interface ChapterFormModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (
    chapter: Omit<CanonicalChapter, 'id' | 'userId' | 'createdAt' | 'updatedAt'>
  ) => Promise<void>
  projectId: string
}

export function ChapterFormModal({ isOpen, onClose, onSave, projectId }: ChapterFormModalProps) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [deadline, setDeadline] = useState('')
  const [objective, setObjective] = useState('')
  const [keyResults, setKeyResults] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (!isOpen) {
      // Reset form on close
      setTitle('')
      setDescription('')
      setDeadline('')
      setObjective('')
      setKeyResults('')
    }
  }, [isOpen])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !projectId) return

    setIsSubmitting(true)
    try {
      await onSave({
        title: title.trim(),
        description: description.trim() || undefined,
        deadline: deadline || undefined,
        objective: objective.trim() || undefined,
        keyResults: keyResults.trim()
          ? keyResults
              .split('\n')
              .filter(Boolean)
              .map((text) => ({ id: generateId(), text }))
          : undefined,
        projectId,
        archived: false,
      })
      onClose()
    } catch (error) {
      logger.error('Failed to create chapter:', error)
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content chapter-form-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>New Chapter</h2>
          <button className="close-button" onClick={onClose}>
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="chapter-title">Title</label>
            <input
              id="chapter-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Chapter Name"
              required
              autoFocus
            />
          </div>

          <div className="form-group">
            <label htmlFor="chapter-deadline">Deadline (Optional)</label>
            <input
              id="chapter-deadline"
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label htmlFor="chapter-objective">Objective (Optional)</label>
            <input
              id="chapter-objective"
              type="text"
              value={objective}
              onChange={(e) => setObjective(e.target.value)}
              placeholder="What is the goal of this chapter?"
            />
          </div>

          <div className="form-group">
            <label htmlFor="chapter-key-results">Key Results (Optional, one per line)</label>
            <textarea
              id="chapter-key-results"
              value={keyResults}
              onChange={(e) => setKeyResults(e.target.value)}
              placeholder="e.g., Launch beta to 100 users"
              rows={3}
            />
          </div>

          <div className="modal-actions">
            <button type="button" className="ghost-button" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="primary-button" disabled={isSubmitting}>
              Create Chapter
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
