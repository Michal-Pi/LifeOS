import { useState, useEffect } from 'react'
import { createLogger } from '@lifeos/core'

const logger = createLogger('ChapterFormModal')
import type { CanonicalChapter } from '@/types/todo'
import { generateId } from '@/lib/idGenerator'
import { Modal } from '@/components/ui/Modal'
import { DateTimePicker } from './DateTimePicker'

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

  const modalFooter = (
    <div className="modal-actions">
      <button type="button" className="ghost-button" onClick={onClose}>
        Cancel
      </button>
      <button type="submit" form="chapter-form" className="primary-button" disabled={isSubmitting}>
        Create Chapter
      </button>
    </div>
  )

  // Convert YYYY-MM-DD to ISO for DateTimePicker value
  const deadlineIso = deadline ? new Date(deadline + 'T00:00:00').toISOString() : null

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title="New Chapter"
      footer={modalFooter}
      className="chapter-form-modal"
    >
      <form id="chapter-form" onSubmit={handleSubmit}>
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
          <DateTimePicker
            value={deadlineIso}
            onChange={(iso) => {
              setDeadline(iso ? new Date(iso).toISOString().split('T')[0] : '')
            }}
            showTime={false}
            placeholder="Select deadline"
            displayFormat="date"
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
      </form>
    </Modal>
  )
}
