import { useState, useEffect, useMemo } from 'react'
import { createLogger } from '@lifeos/core'

const logger = createLogger('TaskFormModal')
import type {
  CanonicalTask,
  CanonicalProject,
  CanonicalChapter,
  UrgencyLevel,
  ImportanceLevel,
  TaskStatus,
  Domain,
} from '@/types/todo'
import { calculateUrgency, urgencyToDueDate } from '@/lib/priority'
import {
  urgencyFromSlider,
  urgencyLabel,
  urgencyToSlider,
  importanceFromSlider,
  importanceLabel,
  importanceToSlider,
} from '@/lib/todoUi'
import { Select, type SelectOption } from './Select'
import { TaskBulkImportModal } from './TaskBulkImportModal'

interface TaskFormModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (task: Omit<CanonicalTask, 'id' | 'userId' | 'createdAt' | 'updatedAt'>) => Promise<void>
  initialTask?: CanonicalTask | null
  projects: CanonicalProject[]
  chapters: CanonicalChapter[]
  onImportTasks?: () => void
  onImportComplete?: () => void
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
  chapters,
  onImportTasks,
  onImportComplete,
}: TaskFormModalProps) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [domain, setDomain] = useState<Domain>('work')
  const [projectId, setProjectId] = useState<string>('none')
  const [chapterId, setChapterId] = useState<string>('none')
  const [keyResultId, setKeyResultId] = useState<string>('none')
  const [urgency, setUrgency] = useState<UrgencyLevel>('this_week')
  const [importance, setImportance] = useState<ImportanceLevel>(4)
  const [dueDate, setDueDate] = useState('')
  const [dueDateTime, setDueDateTime] = useState('') // For datetime-local input
  const [allocatedHours, setAllocatedHours] = useState<number | ''>('')
  const [allocatedMinutes, setAllocatedMinutes] = useState<number | ''>('')
  const [status, setStatus] = useState<TaskStatus>('inbox')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [urgencyChangedManually, setUrgencyChangedManually] = useState(false)
  const [dueDateChangedManually, setDueDateChangedManually] = useState(false)
  const [showBulkImport, setShowBulkImport] = useState(false)

  // Single import handler that calls onImportTasks when provided, otherwise opens internal modal
  const handleImportClick = () => {
    if (onImportTasks) {
      onImportTasks()
    } else {
      setShowBulkImport(true)
    }
  }

  // Reset form when opening or changing initialTask
  useEffect(() => {
    if (isOpen) {
      if (initialTask) {
        setTitle(initialTask.title)
        setDescription(initialTask.description || '')
        setDomain(initialTask.domain)
        setProjectId(initialTask.projectId || 'none')
        setChapterId(initialTask.chapterId || 'none')
        setKeyResultId(initialTask.keyResultId || 'none')
        setUrgency(initialTask.urgency || 'this_week')
        setImportance(initialTask.importance)
        const taskDueDate = initialTask.dueDate || ''
        setDueDate(taskDueDate)
        // Convert date string to datetime-local format
        if (taskDueDate) {
          const date = new Date(taskDueDate)
          if (!isNaN(date.getTime())) {
            // If it's just a date (YYYY-MM-DD), set time to midnight
            const localDateTime = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
            setDueDateTime(localDateTime.toISOString().slice(0, 16))
          } else {
            setDueDateTime('')
          }
        } else {
          setDueDateTime('')
        }
        setStatus(initialTask.status)
        setUrgencyChangedManually(false)
        setDueDateChangedManually(false)
        const totalMinutes = initialTask.allocatedTimeMinutes || 0
        const hours = Math.floor(totalMinutes / 60)
        const minutes = totalMinutes % 60
        setAllocatedHours(hours > 0 ? hours : '')
        setAllocatedMinutes(minutes > 0 ? minutes : '')
      } else {
        // Defaults for new task
        setTitle('')
        setDescription('')
        setDomain('work')
        setProjectId('none')
        setChapterId('none')
        setKeyResultId('none')
        setUrgency('this_week')
        setImportance(4)
        setDueDate('')
        setDueDateTime('')
        setStatus('inbox')
        setUrgencyChangedManually(false)
        setDueDateChangedManually(false)
        setAllocatedHours('')
        setAllocatedMinutes('')
      }
    }
  }, [isOpen, initialTask])

  // Auto-select project when chapter is selected
  useEffect(() => {
    if (chapterId && chapterId !== 'none') {
      const chapter = chapters.find((m) => m.id === chapterId)
      if (chapter) {
        setProjectId(chapter.projectId)
      }
    }
  }, [chapterId, chapters])

  useEffect(() => {
    if (!projectId || projectId === 'none') return
    const project = projects.find((p) => p.id === projectId)
    if (project) {
      setDomain(project.domain)
    }
  }, [projectId, projects])

  // Filter chapters by selected project (exclude 'none' sentinel)
  const availableChapters =
    projectId && projectId !== 'none' ? chapters.filter((m) => m.projectId === projectId) : chapters

  const availableKeyResults = useMemo(() => {
    const chapter = chapters.find((m) => m.id === chapterId)
    return chapter?.keyResults || projects.find((p) => p.id === projectId)?.keyResults || []
  }, [projectId, chapterId, projects, chapters])

  // Select options (use 'none' sentinel value instead of empty strings - Radix UI doesn't support empty strings)
  const projectOptions: SelectOption[] = useMemo(
    () => [
      { value: 'none', label: 'No Project' },
      ...projects.map((p) => ({ value: p.id, label: p.title })),
    ],
    [projects]
  )

  const chapterOptions: SelectOption[] = useMemo(
    () => [
      { value: 'none', label: 'No Chapter' },
      ...availableChapters.map((m) => ({ value: m.id, label: m.title })),
    ],
    [availableChapters]
  )

  const keyResultOptions: SelectOption[] = useMemo(
    () => [
      { value: 'none', label: 'None' },
      ...availableKeyResults.map((kr) => ({ value: kr.id, label: kr.text })),
    ],
    [availableKeyResults]
  )

  // Sync urgency to due date when urgency changes manually
  useEffect(() => {
    if (urgencyChangedManually && !dueDateChangedManually) {
      const newDueDate = urgencyToDueDate(urgency)
      if (newDueDate) {
        setDueDate(newDueDate)
        // Set datetime to midnight of that date
        const date = new Date(newDueDate)
        const localDateTime = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
        setDueDateTime(localDateTime.toISOString().slice(0, 16))
      } else {
        // If urgency is 'later', clear the due date to allow flexibility
        setDueDate('')
        setDueDateTime('')
      }
      setUrgencyChangedManually(false)
    }
  }, [urgency, urgencyChangedManually, dueDateChangedManually])

  // Sync due date to urgency when due date changes manually
  useEffect(() => {
    if (dueDateChangedManually && !urgencyChangedManually) {
      if (dueDate) {
        const calculatedUrgency = calculateUrgency(dueDate)
        setUrgency(calculatedUrgency)
      }
      setDueDateChangedManually(false)
    }
  }, [dueDate, dueDateChangedManually, urgencyChangedManually])

  const effectiveUrgency = useMemo(() => {
    if (!dueDate) return urgency
    return calculateUrgency(dueDate)
  }, [dueDate, urgency])

  const allocatedTimeMinutes = useMemo(() => {
    const hours = typeof allocatedHours === 'number' ? allocatedHours : 0
    const minutes = typeof allocatedMinutes === 'number' ? allocatedMinutes : 0
    return Math.max(hours, 0) * 60 + Math.min(Math.max(minutes, 0), 59)
  }, [allocatedHours, allocatedMinutes])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return

    setIsSubmitting(true)
    try {
      // Build task object, only including fields with actual values (Firestore doesn't accept undefined)
      const taskData: Omit<CanonicalTask, 'id' | 'userId' | 'createdAt' | 'updatedAt'> = {
        title: title.trim(),
        description: description.trim(),
        domain,
        importance,
        status,
        completed: initialTask?.completed ?? false,
        archived: initialTask?.archived ?? false,
      }

      // Only add optional fields if they have values
      if (projectId !== 'none') taskData.projectId = projectId
      if (chapterId !== 'none') taskData.chapterId = chapterId
      if (keyResultId !== 'none') taskData.keyResultId = keyResultId
      if (dueDate) taskData.dueDate = dueDate
      if (!dueDate && urgency) taskData.urgency = urgency
      if (allocatedTimeMinutes > 0) taskData.allocatedTimeMinutes = allocatedTimeMinutes
      if (initialTask?.calendarEventIds) taskData.calendarEventIds = initialTask.calendarEventIds

      await onSave(taskData)
      // Close modal on success
      onClose()
    } catch (error) {
      logger.error('Failed to save task:', error)
      // Close modal even on error - error is already shown via toast in useTodoOperations
      // This prevents the modal from staying open when offline or when there's a network error
      onClose()
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content task-form-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2>{initialTask ? 'Edit Task' : 'New Task'}</h2>
            {!initialTask && (
              <button type="button" className="import-tasks-link" onClick={handleImportClick}>
                Import Tasks
              </button>
            )}
          </div>
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
                    setChapterId('none') // Clear chapter and KR when project changes
                    setKeyResultId('none')
                  }}
                  options={projectOptions}
                  placeholder="Select project"
                />
              </div>

              <div className="form-group">
                <label htmlFor="task-chapter">Chapter</label>
                <Select
                  id="task-chapter"
                  value={chapterId}
                  onChange={(value) => {
                    setChapterId(value)
                    setKeyResultId('none') // Clear KR when chapter changes
                  }}
                  options={chapterOptions}
                  placeholder="Select chapter"
                  disabled={projectId === 'none' && availableChapters.length === 0}
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
                  disabled={projectId !== 'none'}
                />
                {projectId !== 'none' && <p className="helper-text">Inherited from project</p>}
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
                  onChange={(e) => {
                    const newUrgency = urgencyFromSlider(Number(e.target.value))
                    setUrgencyChangedManually(true)
                    setUrgency(newUrgency)
                    // If changing to 'later', clear due date to allow flexibility
                    if (newUrgency === 'later') {
                      setDueDate('')
                      setDueDateTime('')
                      setDueDateChangedManually(false)
                    }
                  }}
                />
                <p className="helper-text">
                  {dueDate
                    ? `Auto: ${urgencyLabel(effectiveUrgency)} (change urgency to override)`
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
                <label htmlFor="task-due-datetime">Due Date & Time</label>
                <div className="due-date-input-group">
                  <input
                    id="task-due-datetime"
                    type="datetime-local"
                    value={dueDateTime}
                    onChange={(e) => {
                      setDueDateChangedManually(true)
                      const newDateTime = e.target.value
                      setDueDateTime(newDateTime)
                      if (newDateTime) {
                        // Extract date part (YYYY-MM-DD) for dueDate field
                        const datePart = newDateTime.split('T')[0]
                        setDueDate(datePart)
                      } else {
                        setDueDate('')
                      }
                    }}
                  />
                  {dueDate && (
                    <button
                      type="button"
                      className="clear-due-date-button"
                      onClick={() => {
                        setDueDate('')
                        setDueDateTime('')
                        setDueDateChangedManually(true)
                      }}
                      aria-label="Clear due date"
                    >
                      ×
                    </button>
                  )}
                </div>
                <p className="helper-text">
                  {dueDate
                    ? `Auto urgency: ${urgencyLabel(effectiveUrgency)}`
                    : 'Set a due date to automatically calculate urgency, or use urgency slider'}
                </p>
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
                        const val = e.target.value
                        if (val === '') {
                          setAllocatedHours('')
                        } else {
                          const num = Math.min(40, Math.max(0, Number(val)))
                          setAllocatedHours(num)
                        }
                      }}
                      onBlur={(e) => {
                        if (e.target.value === '') {
                          setAllocatedHours('')
                        }
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
                        const val = e.target.value
                        if (val === '') {
                          setAllocatedMinutes('')
                        } else {
                          const num = Math.min(59, Math.max(0, Number(val)))
                          setAllocatedMinutes(num)
                        }
                      }}
                      onBlur={(e) => {
                        if (e.target.value === '') {
                          setAllocatedMinutes('')
                        }
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
            {!initialTask && (
              <button
                type="button"
                className="ghost-button"
                onClick={handleImportClick}
                aria-label="Import Tasks"
              >
                <span className="import-icon">📄</span>
                Import Tasks
              </button>
            )}
            <div className="modal-actions-right">
              <button type="button" className="ghost-button" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="primary-button" disabled={isSubmitting}>
                {initialTask ? 'Save Changes' : 'Create Task'}
              </button>
            </div>
          </div>
        </form>

        <style>{`
          .task-form-modal .modal-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
          }

          .task-form-modal .modal-header > div {
            flex: 1;
          }

          .import-tasks-link {
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

          .import-tasks-link:hover {
            color: var(--accent-hover);
          }

          .import-icon {
            margin-right: 0.5rem;
            font-size: 1rem;
          }

          .task-form-modal .modal-actions {
            justify-content: space-between;
          }

          .modal-actions-right {
            display: flex;
            gap: 0.75rem;
          }
        `}</style>
      </div>

      <TaskBulkImportModal
        isOpen={showBulkImport}
        onClose={() => setShowBulkImport(false)}
        onImportComplete={() => {
          setShowBulkImport(false)
          if (onImportComplete) {
            onImportComplete()
          }
        }}
        projects={projects}
        chapters={chapters}
      />
    </div>
  )
}
