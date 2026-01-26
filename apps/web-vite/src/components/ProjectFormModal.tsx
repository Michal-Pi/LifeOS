import { useState } from 'react'
import { createLogger } from '@lifeos/core'

const logger = createLogger('ProjectFormModal')
import type { CanonicalProject, CanonicalChapter, Domain } from '@/types/todo'
import { generateId } from '@/lib/idGenerator'
import { Select, type SelectOption } from '@/components/Select'
import { ColorPicker } from '@/components/ColorPicker'
import { PROJECT_COLOR_PALETTE } from '@/config/domainColors'
import { MarkdownImportModal } from './MarkdownImportModal'

interface ProjectFormModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (
    project: Omit<CanonicalProject, 'id' | 'userId' | 'createdAt' | 'updatedAt'>
  ) => Promise<string>
  onSaveChapter?: (
    chapter: Omit<CanonicalChapter, 'id' | 'userId' | 'createdAt' | 'updatedAt'>
  ) => Promise<void>
  onImportProjects?: () => void
  onImportComplete?: () => void
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
  onSaveChapter,
  onImportProjects,
  onImportComplete,
}: ProjectFormModalProps) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [domain, setDomain] = useState<Domain>('projects')
  const [color, setColor] = useState<string>('')
  const [objective, setObjective] = useState('')
  const [keyResults, setKeyResults] = useState('')
  const [chapters, setChapters] = useState<string[]>([''])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showBulkImport, setShowBulkImport] = useState(false)

  // Single import handler that calls onImportProjects when provided, otherwise opens internal modal
  const handleImportClick = () => {
    if (onImportProjects) {
      onImportProjects()
    } else {
      setShowBulkImport(true)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return

    setIsSubmitting(true)
    try {
      // Create project first (returns project ID for chapter association)
      const projectId = await onSave({
        title: title.trim(),
        description: description.trim(),
        domain,
        color: color || undefined,
        objective: objective.trim() || undefined,
        keyResults: keyResults.trim()
          ? keyResults
              .split('\n')
              .filter(Boolean)
              .map((text) => ({ id: generateId(), text }))
          : undefined,
        archived: false,
      })

      // Create chapters if any are provided
      if (onSaveChapter && projectId) {
        const validChapters = chapters.filter((m) => m.trim())
        for (const chapterTitle of validChapters) {
          await onSaveChapter({
            title: chapterTitle.trim(),
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
      setColor('')
      setObjective('')
      setKeyResults('')
      setChapters([''])
    } catch (error) {
      logger.error('Failed to create project:', error)
    } finally {
      setIsSubmitting(false)
    }
  }

  const addChapter = () => {
    setChapters([...chapters, ''])
  }

  const removeChapter = (index: number) => {
    setChapters(chapters.filter((_, i) => i !== index))
  }

  const updateChapter = (index: number, value: string) => {
    const updated = [...chapters]
    updated[index] = value
    setChapters(updated)
  }

  if (!isOpen) return null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content project-form-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2>New Project</h2>
            <button type="button" className="import-projects-link" onClick={handleImportClick}>
              Import Projects
            </button>
          </div>
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
            <ColorPicker
              colors={PROJECT_COLOR_PALETTE}
              selectedColor={color}
              onChange={setColor}
              label="Project Color (Optional)"
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
              <label>Chapters (Optional)</label>
              <button
                type="button"
                className="ghost-button-small"
                onClick={addChapter}
                style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
              >
                + Add
              </button>
            </div>
            {chapters.map((chapter, index) => (
              <div key={index} style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                <input
                  type="text"
                  value={chapter}
                  onChange={(e) => updateChapter(index, e.target.value)}
                  placeholder={`Chapter ${index + 1}`}
                  style={{ flex: 1 }}
                />
                {chapters.length > 1 && (
                  <button
                    type="button"
                    className="ghost-button-small"
                    onClick={() => removeChapter(index)}
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

        <style>{`
          .project-form-modal .modal-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
          }

          .project-form-modal .modal-header > div {
            flex: 1;
          }

          .import-projects-link {
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

          .import-projects-link:hover {
            color: var(--accent-hover);
          }
        `}</style>
      </div>

      <MarkdownImportModal
        isOpen={showBulkImport}
        onClose={() => setShowBulkImport(false)}
        onImportComplete={() => {
          setShowBulkImport(false)
          if (onImportComplete) {
            onImportComplete()
          }
        }}
      />
    </div>
  )
}
