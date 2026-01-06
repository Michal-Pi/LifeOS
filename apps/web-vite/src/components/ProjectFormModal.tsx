import { useState } from 'react'
import { createLogger } from '@lifeos/core'

const logger = createLogger('ProjectFormModal')
import type { CanonicalProject, CanonicalMilestone, Domain } from '@/types/todo'
import { generateId } from '@/lib/idGenerator'
import { Select, type SelectOption } from '@/components/Select'

interface ProjectFormModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (
    project: Omit<CanonicalProject, 'id' | 'userId' | 'createdAt' | 'updatedAt'>
  ) => Promise<string>
  onSaveMilestone?: (
    milestone: Omit<CanonicalMilestone, 'id' | 'userId' | 'createdAt' | 'updatedAt'>
  ) => Promise<void>
}

const DOMAIN_OPTIONS: SelectOption[] = [
  { value: 'work', label: 'Work' },
  { value: 'projects', label: 'Projects' },
  { value: 'life', label: 'Life' },
  { value: 'learning', label: 'Learning' },
  { value: 'wellbeing', label: 'Wellbeing' },
]

export function ProjectFormModal({
  isOpen,
  onClose,
  onSave,
  onSaveMilestone,
}: ProjectFormModalProps) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [domain, setDomain] = useState<Domain>('projects')
  const [objective, setObjective] = useState('')
  const [keyResults, setKeyResults] = useState('')
  const [milestones, setMilestones] = useState<string[]>([''])
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return

    setIsSubmitting(true)
    try {
      // Create project first (returns project ID for milestone association)
      const projectId = await onSave({
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

      // Create milestones if any are provided
      if (onSaveMilestone && projectId) {
        const validMilestones = milestones.filter((m) => m.trim())
        for (const milestoneTitle of validMilestones) {
          await onSaveMilestone({
            title: milestoneTitle.trim(),
            projectId,
            description: '',
            archived: false,
          })
        }
      }

      onClose()
      // Reset form
      setTitle('')
      setDescription('')
      setDomain('projects')
      setObjective('')
      setKeyResults('')
      setMilestones([''])
    } catch (error) {
      logger.error('Failed to create project:', error)
    } finally {
      setIsSubmitting(false)
    }
  }

  const addMilestone = () => {
    setMilestones([...milestones, ''])
  }

  const removeMilestone = (index: number) => {
    setMilestones(milestones.filter((_, i) => i !== index))
  }

  const updateMilestone = (index: number, value: string) => {
    const updated = [...milestones]
    updated[index] = value
    setMilestones(updated)
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

          <div className="form-group">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label>Milestones (Optional)</label>
              <button
                type="button"
                className="ghost-button-small"
                onClick={addMilestone}
                style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
              >
                + Add
              </button>
            </div>
            {milestones.map((milestone, index) => (
              <div key={index} style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                <input
                  type="text"
                  value={milestone}
                  onChange={(e) => updateMilestone(index, e.target.value)}
                  placeholder={`Milestone ${index + 1}`}
                  style={{ flex: 1 }}
                />
                {milestones.length > 1 && (
                  <button
                    type="button"
                    className="ghost-button-small"
                    onClick={() => removeMilestone(index)}
                    style={{ padding: '0.5rem' }}
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
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
