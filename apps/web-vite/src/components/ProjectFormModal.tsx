import { useState } from 'react'
import { createLogger } from '@lifeos/core'

const logger = createLogger('ProjectFormModal')
import type { CanonicalProject, Domain } from '@/types/todo'
import { generateId } from '@/lib/idGenerator'
import { Select, type SelectOption } from '@/components/Select'

interface ProjectFormModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (
    project: Omit<CanonicalProject, 'id' | 'userId' | 'createdAt' | 'updatedAt'>
  ) => Promise<void>
}

const DOMAIN_OPTIONS: SelectOption[] = [
  { value: 'work', label: 'Work' },
  { value: 'projects', label: 'Projects' },
  { value: 'life', label: 'Life' },
  { value: 'learning', label: 'Learning' },
  { value: 'wellbeing', label: 'Wellbeing' },
]

export function ProjectFormModal({ isOpen, onClose, onSave }: ProjectFormModalProps) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [domain, setDomain] = useState<Domain>('projects')
  const [objective, setObjective] = useState('')
  const [keyResults, setKeyResults] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return

    setIsSubmitting(true)
    try {
      await onSave({
        title: title.trim(),
        description: description.trim(),
        domain,
        objective: objective.trim() || undefined,
        keyResults: keyResults.trim()
          ? keyResults
              .split('\n')
              .filter(Boolean)
              .map((text) => ({ id: generateId(), text }))
          : undefined,
        archived: false,
      })
      onClose()
      // Reset form
      setTitle('')
      setDescription('')
      setDomain('projects')
      setObjective('')
      setKeyResults('')
    } catch (error) {
      logger.error('Failed to create project:', error)
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content project-form-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>New Project</h2>
          <button className="close-button" onClick={onClose}>
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="project-title">Title</label>
            <input
              id="project-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Project Name"
              required
              autoFocus
            />
          </div>

          <div className="form-group">
            <label htmlFor="project-domain">Domain</label>
            <Select
              value={domain}
              onChange={(value) => setDomain(value as Domain)}
              options={DOMAIN_OPTIONS}
              placeholder="Select domain"
            />
          </div>

          <div className="form-group">
            <label htmlFor="project-objective">Objective (Optional)</label>
            <input
              id="project-objective"
              type="text"
              value={objective}
              onChange={(e) => setObjective(e.target.value)}
              placeholder="What is the main goal?"
            />
          </div>

          <div className="form-group">
            <label htmlFor="project-key-results">Key Results (Optional, one per line)</label>
            <textarea
              id="project-key-results"
              value={keyResults}
              onChange={(e) => setKeyResults(e.target.value)}
              placeholder="e.g., Achieve 20% user growth"
              rows={3}
            />
          </div>

          <div className="modal-actions">
            <button type="button" className="ghost-button" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="primary-button" disabled={isSubmitting}>
              Create Project
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
