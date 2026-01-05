import { useState, useEffect, useMemo } from 'react'
import { createLogger } from '@lifeos/core'

const logger = createLogger('TaskFormModal')
import type {
  CanonicalTask,
  CanonicalProject,
  CanonicalMilestone,
  UrgencyLevel,
  ImportanceLevel,
  TaskStatus,
  Domain,
} from '@/types/todo'
import { calculateUrgency } from '@/lib/priority'
import {
  urgencyFromSlider,
  urgencyLabel,
  urgencyToSlider,
  importanceFromSlider,
  importanceLabel,
  importanceToSlider,
} from '@/lib/todoUi'
import { Select, type SelectOption } from './Select'

interface TaskFormModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (task: Omit<CanonicalTask, 'id' | 'userId' | 'createdAt' | 'updatedAt'>) => Promise<void>
  initialTask?: CanonicalTask | null
  projects: CanonicalProject[]
  milestones: CanonicalMilestone[]
}

const DOMAINS: Domain[] = ['work', 'projects', 'life', 'learning', 'wellbeing']
const URGENCY_SLIDER_MIN = 1
const URGENCY_SLIDER_MAX = 6
const IMPORTANCE_SLIDER_MIN = 1
const IMPORTANCE_SLIDER_MAX = 5

const DOMAIN_OPTIONS: SelectOption[] = DOMAINS.map((d) => ({ value: d, label: d }))

export function TaskFormModal({
  isOpen,
  onClose,
  onSave,
  initialTask,
  projects,
  milestones,
}: TaskFormModalProps) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [domain, setDomain] = useState<Domain>('work')
  const [projectId, setProjectId] = useState<string>('')
  const [milestoneId, setMilestoneId] = useState<string>('')
  const [keyResultId, setKeyResultId] = useState<string>('')
  const [urgency, setUrgency] = useState<UrgencyLevel>('this_week')
  const [importance, setImportance] = useState<ImportanceLevel>(4)
  const [dueDate, setDueDate] = useState('')
  const [allocatedHours, setAllocatedHours] = useState(0)
  const [allocatedMinutes, setAllocatedMinutes] = useState(0)
  const [status, setStatus] = useState<TaskStatus>('inbox')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Reset form when opening or changing initialTask
  useEffect(() => {
    if (isOpen) {
      if (initialTask) {
        setTitle(initialTask.title)
        setDescription(initialTask.description || '')
        setDomain(initialTask.domain)
        setProjectId(initialTask.projectId || '')
        setMilestoneId(initialTask.milestoneId || '')
        setKeyResultId(initialTask.keyResultId || '')
        setUrgency(initialTask.urgency || 'this_week')
        setImportance(initialTask.importance)
        setDueDate(initialTask.dueDate || '')
        setStatus(initialTask.status)
        const totalMinutes = initialTask.allocatedTimeMinutes || 0
        setAllocatedHours(Math.floor(totalMinutes / 60))
        setAllocatedMinutes(totalMinutes % 60)
      } else {
        // Defaults for new task
        setTitle('')
        setDescription('')
        setDomain('work')
        setProjectId('')
        setMilestoneId('')
        setKeyResultId('')
        setUrgency('this_week')
        setImportance(4)
        setDueDate('')
        setStatus('inbox')
        setAllocatedHours(0)
        setAllocatedMinutes(0)
      }
    }
  }, [isOpen, initialTask])

  // Auto-select project when milestone is selected
  useEffect(() => {
    if (milestoneId) {
      const milestone = milestones.find((m) => m.id === milestoneId)
      if (milestone) {
        setProjectId(milestone.projectId)
      }
    }
  }, [milestoneId, milestones])

  useEffect(() => {
    if (!projectId) return
    const project = projects.find((p) => p.id === projectId)
    if (project) {
      setDomain(project.domain)
    }
  }, [projectId, projects])

  // Filter milestones by selected project
  const availableMilestones = projectId
    ? milestones.filter((m) => m.projectId === projectId)
    : milestones

  const availableKeyResults = useMemo(() => {
    const milestone = milestones.find((m) => m.id === milestoneId)
    return milestone?.keyResults || projects.find((p) => p.id === projectId)?.keyResults || []
  }, [projectId, milestoneId, projects, milestones])

  // Select options (no empty string values - Radix UI doesn't support them)
  const projectOptions: SelectOption[] = useMemo(
    () => projects.map((p) => ({ value: p.id, label: p.title })),
    [projects]
  )

  const milestoneOptions: SelectOption[] = useMemo(
    () => availableMilestones.map((m) => ({ value: m.id, label: m.title })),
    [availableMilestones]
  )

  const keyResultOptions: SelectOption[] = useMemo(
    () => availableKeyResults.map((kr) => ({ value: kr.id, label: kr.text })),
    [availableKeyResults]
  )

  const effectiveUrgency = useMemo(() => {
    if (!dueDate) return urgency
    return calculateUrgency(dueDate)
  }, [dueDate, urgency])

  const allocatedTimeMinutes = useMemo(() => {
    const hours = Number.isFinite(allocatedHours) ? allocatedHours : 0
    const minutes = Number.isFinite(allocatedMinutes) ? allocatedMinutes : 0
    return Math.max(hours, 0) * 60 + Math.min(Math.max(minutes, 0), 59)
  }, [allocatedHours, allocatedMinutes])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return

    setIsSubmitting(true)
    try {
      await onSave({
        title: title.trim(),
        description: description.trim(),
        domain,
        projectId: projectId || undefined,
        milestoneId: milestoneId || undefined,
        keyResultId: keyResultId || undefined,
        urgency: dueDate ? undefined : urgency,
        importance,
        dueDate: dueDate || undefined,
        status,
        completed: initialTask?.completed ?? false,
        archived: initialTask?.archived ?? false,
        calendarEventIds: initialTask?.calendarEventIds,
        allocatedTimeMinutes: allocatedTimeMinutes || undefined,
      })
      onClose()
    } catch (error) {
      logger.error('Failed to save task:', error)
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content task-form-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{initialTask ? 'Edit Task' : 'New Task'}</h2>
          <button className="close-button" onClick={onClose}>
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="task-form">
          {/* Basic Info Section */}
          <div className="form-section">
            <div className="form-group">
              <label htmlFor="task-title">Title</label>
              <input
                id="task-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="What needs to be done?"
                required
                autoFocus
              />
            </div>

            <div className="form-group">
              <label htmlFor="task-description">Description</label>
              <textarea
                id="task-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="Add more details..."
              />
            </div>
          </div>

          {/* Project & Organization Section */}
          <div className="form-section">
            <h3 className="section-label">Organization</h3>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="task-project">Project</label>
                <Select
                  id="task-project"
                  value={projectId}
                  onChange={(value) => {
                    setProjectId(value)
                    setMilestoneId('') // Clear milestone and KR when project changes
                    setKeyResultId('')
                  }}
                  options={projectOptions}
                  placeholder="Select project"
                />
              </div>

              <div className="form-group">
                <label htmlFor="task-milestone">Milestone</label>
                <Select
                  id="task-milestone"
                  value={milestoneId}
                  onChange={(value) => {
                    setMilestoneId(value)
                    setKeyResultId('') // Clear KR when milestone changes
                  }}
                  options={milestoneOptions}
                  placeholder="Select milestone"
                  disabled={!projectId && availableMilestones.length === 0}
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="task-key-result">Key Result (Optional)</label>
                <Select
                  id="task-key-result"
                  value={keyResultId}
                  onChange={(value) => setKeyResultId(value)}
                  options={keyResultOptions}
                  placeholder="Select key result"
                  disabled={availableKeyResults.length === 0}
                />
              </div>

              <div className="form-group">
                <label htmlFor="task-domain">Domain</label>
                <Select
                  id="task-domain"
                  value={domain}
                  onChange={(value) => setDomain(value as Domain)}
                  options={DOMAIN_OPTIONS}
                  placeholder="Select domain"
                  disabled={Boolean(projectId)}
                />
                {projectId && <p className="helper-text">Inherited from project</p>}
              </div>
            </div>
          </div>

          {/* Priority Section */}
          <div className="form-section">
            <h3 className="section-label">Priority</h3>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="task-urgency">Urgency</label>
                <input
                  id="task-urgency"
                  type="range"
                  min={URGENCY_SLIDER_MIN}
                  max={URGENCY_SLIDER_MAX}
                  step={1}
                  value={urgencyToSlider(effectiveUrgency)}
                  onChange={(e) => setUrgency(urgencyFromSlider(Number(e.target.value)))}
                  disabled={Boolean(dueDate)}
                />
                <p className="helper-text">
                  {dueDate
                    ? `Auto: ${urgencyLabel(effectiveUrgency)}`
                    : urgencyLabel(effectiveUrgency)}
                </p>
              </div>

              <div className="form-group">
                <label htmlFor="task-importance">Importance</label>
                <input
                  id="task-importance"
                  type="range"
                  min={IMPORTANCE_SLIDER_MIN}
                  max={IMPORTANCE_SLIDER_MAX}
                  step={1}
                  value={importanceToSlider(importance)}
                  onChange={(e) => setImportance(importanceFromSlider(Number(e.target.value)))}
                />
                <p className="helper-text">{importanceLabel(importance)}</p>
              </div>
            </div>
          </div>

          {/* Scheduling Section */}
          <div className="form-section">
            <h3 className="section-label">Scheduling</h3>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="task-due-date">Due Date</label>
                <input
                  id="task-due-date"
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label htmlFor="task-estimate-hours">Estimated Time (max 40 hours)</label>
                <div className="inline-inputs">
                  <div className="input-with-suffix">
                    <input
                      id="task-estimate-hours"
                      type="number"
                      min={0}
                      max={40}
                      value={allocatedHours}
                      onChange={(e) => {
                        const val = Math.min(40, Math.max(0, Number(e.target.value)))
                        setAllocatedHours(val)
                      }}
                      placeholder="0"
                    />
                    <span className="input-suffix">hours</span>
                  </div>
                  <div className="input-with-suffix">
                    <input
                      id="task-estimate-minutes"
                      type="number"
                      min={0}
                      max={59}
                      value={allocatedMinutes}
                      onChange={(e) => {
                        const val = Math.min(59, Math.max(0, Number(e.target.value)))
                        setAllocatedMinutes(val)
                      }}
                      placeholder="0"
                    />
                    <span className="input-suffix">mins</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="modal-actions">
            <button type="button" className="ghost-button" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="primary-button" disabled={isSubmitting}>
              {initialTask ? 'Save Changes' : 'Create Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
