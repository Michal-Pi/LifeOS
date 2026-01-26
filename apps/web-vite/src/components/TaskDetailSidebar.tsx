import { useState, useCallback, useEffect, useRef } from 'react'
import type { CanonicalTask, TaskStatus } from '@/types/todo'
import { calculateUrgency } from '@/lib/priority'
import {
  importanceFromSlider,
  importanceLabel,
  importanceToSlider,
  urgencyFromSlider,
  urgencyLabel,
  urgencyToSlider,
} from '@/lib/todoUi'
import { Select, type SelectOption } from './Select'
import { CalendarTimePicker } from './CalendarTimePicker'
import { useEventService } from '@/hooks/useEventService'
import { useAuth } from '@/hooks/useAuth'

const STATUS_OPTIONS: SelectOption[] = [
  { value: 'inbox', label: 'Inbox' },
  { value: 'next_action', label: 'Next Action' },
  { value: 'waiting_for', label: 'Waiting For' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'someday', label: 'Someday' },
  { value: 'done', label: 'Done' },
  { value: 'cancelled', label: 'Cancelled' },
]

interface TaskDetailSidebarProps {
  task: CanonicalTask | null
  onClose: () => void
  onUpdate: (task: CanonicalTask) => void
  onDelete: (taskId: string) => void
  onSchedule: (task: CanonicalTask) => void
  onConvert: (task: CanonicalTask) => void
  telemetry?: {
    completed: number
    pending: number
    total: number
  }
}

export function TaskDetailSidebar({
  task,
  onClose,
  onUpdate,
  onDelete,
  onSchedule,
  onConvert,
  telemetry,
}: TaskDetailSidebarProps) {
  const { user } = useAuth()
  const eventService = useEventService({ userId: user?.uid || '' })
  const [showTimePicker, setShowTimePicker] = useState(false)
  const [draftTask, setDraftTask] = useState<CanonicalTask | null>(task)
  const [isSaving, setIsSaving] = useState(false)
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null)
  const updateTimerRef = useRef<number | null>(null)
  const savingTimerRef = useRef<number | null>(null)
  const latestTaskRef = useRef<CanonicalTask | null>(task)

  useEffect(() => {
    return () => {
      if (updateTimerRef.current) {
        window.clearTimeout(updateTimerRef.current)
      }
      if (savingTimerRef.current) {
        window.clearTimeout(savingTimerRef.current)
      }
    }
  }, [])

  const scheduleUpdate = useCallback(
    (nextTask: CanonicalTask, immediate: boolean = false) => {
      setDraftTask(nextTask)
      latestTaskRef.current = nextTask

      if (updateTimerRef.current) {
        window.clearTimeout(updateTimerRef.current)
      }
      if (savingTimerRef.current) {
        window.clearTimeout(savingTimerRef.current)
      }

      if (immediate) {
        setIsSaving(true)
        onUpdate(nextTask)
        setLastSavedAt(Date.now())
        savingTimerRef.current = window.setTimeout(() => setIsSaving(false), 300)
        return
      }

      updateTimerRef.current = window.setTimeout(() => {
        if (latestTaskRef.current) {
          onUpdate(latestTaskRef.current)
        }
        setLastSavedAt(Date.now())
        setIsSaving(false)
        updateTimerRef.current = null
      }, 400)

      setIsSaving(true)
    },
    [onUpdate]
  )

  const activeTask = draftTask ?? task
  const totalMinutes = activeTask?.allocatedTimeMinutes || 0
  const estimatedHours = Math.floor(totalMinutes / 60)
  const estimatedMinutes = totalMinutes % 60

  const effectiveUrgency = activeTask?.dueDate
    ? calculateUrgency(activeTask.dueDate)
    : (activeTask?.urgency ?? 'later')

  const saveStatusLabel = (() => {
    if (isSaving) return 'Saving…'
    if (lastSavedAt) {
      const formattedTime = new Intl.DateTimeFormat(undefined, {
        hour: 'numeric',
        minute: '2-digit',
      }).format(new Date(lastSavedAt))
      return `Saved ${formattedTime}`
    }
    return 'Idle'
  })()

  if (!task || !activeTask) {
    return (
      <aside className="task-detail-sidebar placeholder">
        <p className="section-label">Task Details</p>
        <p>Select a task to see details.</p>
        {telemetry && (
          <div className="task-telemetry">
            <p className="section-label">Telemetry</p>
            <div className="task-telemetry-row">
              <span>Completed</span>
              <strong>{telemetry.completed}</strong>
            </div>
            <div className="task-telemetry-row">
              <span>Pending</span>
              <strong>{telemetry.pending}</strong>
            </div>
            <div className="task-telemetry-row">
              <span>Total</span>
              <strong>{telemetry.total}</strong>
            </div>
          </div>
        )}
      </aside>
    )
  }

  const handleStatusChange = (value: string) => {
    scheduleUpdate({ ...activeTask, status: value as TaskStatus })
  }

  const handleUrgencyChange = (value: number) => {
    const nextUrgency = urgencyFromSlider(value)
    scheduleUpdate({ ...activeTask, urgency: nextUrgency })
  }

  const handleImportanceSliderChange = (value: number) => {
    const nextImportance = importanceFromSlider(value)
    scheduleUpdate({ ...activeTask, importance: nextImportance })
  }

  const updateEstimatedTime = (hours: number, minutes: number) => {
    const safeHours = Number.isFinite(hours) ? hours : 0
    const safeMinutes = Number.isFinite(minutes) ? minutes : 0
    const totalMinutes = Math.max(safeHours, 0) * 60 + Math.min(Math.max(safeMinutes, 0), 59)
    scheduleUpdate({ ...activeTask, allocatedTimeMinutes: totalMinutes || undefined })
  }

  const handleTimeBlockSelect = async (startMs: number, endMs: number) => {
    if (!activeTask) return

    try {
      const startDate = new Date(startMs)
      const endDate = new Date(endMs)
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone

      const formData = {
        title: activeTask.title,
        description: activeTask.description,
        allDay: false,
        startDate: startDate.toISOString().split('T')[0],
        startTime: startDate.toTimeString().slice(0, 5),
        endDate: endDate.toISOString().split('T')[0],
        endTime: endDate.toTimeString().slice(0, 5),
        timezone,
      }

      const newEvent = await eventService.createEvent(formData, { taskId: activeTask.id })

      // Update task with new calendar event ID
      const updatedTask: CanonicalTask = {
        ...activeTask,
        status: 'scheduled',
        calendarEventIds: [...(activeTask.calendarEventIds || []), newEvent.canonicalEventId],
      }
      scheduleUpdate(updatedTask, true)
      setShowTimePicker(false)
    } catch (error) {
      console.error('Failed to create calendar event:', error)
    }
  }

  return (
    <aside className="task-detail-sidebar">
      <div className="sidebar-header">
        <h3>Task Details</h3>
        <div className="task-header-actions">
          <span className="task-save-status">{saveStatusLabel}</span>
          <button className="close-button" onClick={onClose}>
            ×
          </button>
        </div>
      </div>
      <div className="sidebar-content">
        <h3 className="task-title">{activeTask.title}</h3>
        <p className="task-description">{activeTask.description || 'No description.'}</p>

        <div className="form-group">
          <label>Status</label>
          <Select
            value={activeTask.status}
            onChange={handleStatusChange}
            options={STATUS_OPTIONS}
            placeholder="Select status"
          />
        </div>

        <div className="form-group">
          <label>Urgency</label>
          <input
            type="range"
            min={1}
            max={6}
            step={1}
            value={urgencyToSlider(effectiveUrgency)}
            onChange={(e) => handleUrgencyChange(Number(e.target.value))}
            disabled={Boolean(activeTask.dueDate)}
          />
          <p className="helper-text">
            {activeTask.dueDate
              ? `Auto: ${urgencyLabel(effectiveUrgency)}`
              : `Selected: ${urgencyLabel(effectiveUrgency)}`}
          </p>
        </div>

        <div className="form-group">
          <label>Importance</label>
          <input
            type="range"
            min={1}
            max={5}
            step={1}
            value={importanceToSlider(activeTask.importance)}
            onChange={(e) => handleImportanceSliderChange(Number(e.target.value))}
          />
          <p className="helper-text">
            {importanceLabel(activeTask.importance)} ({activeTask.importance})
          </p>
        </div>

        <div className="form-group">
          <label>Due Date</label>
          <input
            type="date"
            value={activeTask.dueDate || ''}
            onChange={(e) => scheduleUpdate({ ...activeTask, dueDate: e.target.value })}
          />
        </div>

        <div className="form-group">
          <label>Estimated Time (max 40 hours)</label>
          <div className="inline-inputs">
            <div className="input-with-suffix">
              <input
                type="number"
                min={0}
                max={40}
                value={estimatedHours}
                onChange={(e) => {
                  const val = Math.min(40, Math.max(0, Number(e.target.value)))
                  updateEstimatedTime(val, estimatedMinutes)
                }}
                placeholder="0"
              />
              <span className="input-suffix">hours</span>
            </div>
            <div className="input-with-suffix">
              <input
                type="number"
                min={0}
                max={59}
                value={estimatedMinutes}
                onChange={(e) => {
                  const val = Math.min(59, Math.max(0, Number(e.target.value)))
                  updateEstimatedTime(estimatedHours, val)
                }}
                placeholder="0"
              />
              <span className="input-suffix">mins</span>
            </div>
          </div>
        </div>

        <div className="form-group">
          <label>Scheduled Events</label>
          {activeTask.calendarEventIds && activeTask.calendarEventIds.length > 0 ? (
            <ul className="linked-events-list">
              {activeTask.calendarEventIds.map((id) => (
                <li key={id}>🔗 {id.substring(0, 12)}...</li>
              ))}
            </ul>
          ) : (
            <p className="empty-state-text small">Not scheduled</p>
          )}
        </div>

        <div className="sidebar-actions">
          <button className="ghost-button" onClick={() => onSchedule(activeTask)}>
            {activeTask.calendarEventIds && activeTask.calendarEventIds.length > 0
              ? `Add Time Block (${activeTask.calendarEventIds.length} scheduled)`
              : 'Schedule on Calendar'}
          </button>
          <button
            className="ghost-button"
            onClick={() => setShowTimePicker(true)}
            title="Manually select a time block from calendar"
          >
            Pick Time Block
          </button>
          <button
            className="ghost-button"
            onClick={() => onConvert(activeTask)}
            title="Convert this task into a new project"
          >
            Convert to Project
          </button>
          <button className="ghost-button danger" onClick={() => onDelete(activeTask.id)}>
            Delete Task
          </button>
        </div>
      </div>

      {/* Calendar Time Picker Modal */}
      <CalendarTimePicker
        isOpen={showTimePicker}
        onClose={() => setShowTimePicker(false)}
        onSelect={handleTimeBlockSelect}
        defaultDurationMinutes={activeTask.allocatedTimeMinutes || 60}
        selectedDate={activeTask.dueDate ? new Date(activeTask.dueDate) : undefined}
      />
    </aside>
  )
}
