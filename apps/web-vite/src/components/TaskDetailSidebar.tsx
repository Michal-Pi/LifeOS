import type { CanonicalTask, TaskStatus } from '@/types/todo'
import { calculateUrgency } from '@/lib/priority'
import {
  importanceFromSlider,
  importanceLabel,
  importanceToSlider,
  urgencyFromSlider,
  urgencyLabel,
  urgencyToSlider
} from '@/lib/todoUi'

interface TaskDetailSidebarProps {
  task: CanonicalTask | null
  onClose: () => void
  onUpdate: (task: CanonicalTask) => void
  onDelete: (taskId: string) => void
  onSchedule: (task: CanonicalTask) => void
  onConvert: (task: CanonicalTask) => void
}

export function TaskDetailSidebar({
  task,
  onClose,
  onUpdate,
  onDelete,
  onSchedule,
  onConvert
}: TaskDetailSidebarProps) {
  const totalMinutes = task?.allocatedTimeMinutes || 0
  const estimatedHours = Math.floor(totalMinutes / 60)
  const estimatedMinutes = totalMinutes % 60

  const effectiveUrgency = task?.dueDate
    ? calculateUrgency(task.dueDate)
    : task?.urgency ?? 'later'

  if (!task) {
    return (
      <aside className="task-detail-sidebar placeholder">
        <p>Select a task to see details</p>
      </aside>
    )
  }

  const handleStatusChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onUpdate({ ...task, status: e.target.value as TaskStatus })
  }

  const handleUrgencyChange = (value: number) => {
    const nextUrgency = urgencyFromSlider(value)
    onUpdate({ ...task, urgency: nextUrgency })
  }

  const handleImportanceSliderChange = (value: number) => {
    const nextImportance = importanceFromSlider(value)
    onUpdate({ ...task, importance: nextImportance })
  }

  const updateEstimatedTime = (hours: number, minutes: number) => {
    const safeHours = Number.isFinite(hours) ? hours : 0
    const safeMinutes = Number.isFinite(minutes) ? minutes : 0
    const totalMinutes = Math.max(safeHours, 0) * 60 + Math.min(Math.max(safeMinutes, 0), 59)
    onUpdate({ ...task, allocatedTimeMinutes: totalMinutes || undefined })
  }

  return (
    <aside className="task-detail-sidebar">
      <div className="sidebar-header">
        <h3>Task Details</h3>
        <button className="close-button" onClick={onClose}>×</button>
      </div>
      <div className="sidebar-content">
        <h4>{task.title}</h4>
        <p className="task-description">{task.description || 'No description.'}</p>

        <div className="form-group">
          <label>Status</label>
          <select value={task.status} onChange={handleStatusChange}>
            <option value="inbox">Inbox</option>
            <option value="next_action">Next Action</option>
            <option value="waiting_for">Waiting For</option>
            <option value="scheduled">Scheduled</option>
            <option value="someday">Someday</option>
            <option value="done">Done</option>
            <option value="cancelled">Cancelled</option>
          </select>
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
            disabled={Boolean(task.dueDate)}
          />
          <p className="helper-text">
            {task.dueDate
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
            value={importanceToSlider(task.importance)}
            onChange={(e) => handleImportanceSliderChange(Number(e.target.value))}
          />
          <p className="helper-text">
            {importanceLabel(task.importance)} ({task.importance})
          </p>
        </div>

        <div className="form-group">
          <label>Due Date</label>
          <input type="date" value={task.dueDate || ''} onChange={(e) => onUpdate({ ...task, dueDate: e.target.value })} />
        </div>

        <div className="form-group">
          <label>Estimated Time</label>
          <div className="inline-inputs">
            <input
              type="number"
              min={0}
              value={estimatedHours}
              onChange={(e) => {
                const next = Number(e.target.value)
                updateEstimatedTime(next, estimatedMinutes)
              }}
              placeholder="Hours"
            />
            <input
              type="number"
              min={0}
              max={59}
              value={estimatedMinutes}
              onChange={(e) => {
                const next = Number(e.target.value)
                updateEstimatedTime(estimatedHours, next)
              }}
              placeholder="Minutes"
            />
          </div>
        </div>

        <div className="form-group">
          <label>Scheduled Events</label>
          {task.calendarEventIds && task.calendarEventIds.length > 0 ? (
            <ul className="linked-events-list">
              {task.calendarEventIds.map(id => <li key={id}>🔗 {id.substring(0, 12)}...</li>)}
            </ul>
          ) : (
            <p className="empty-state-text small">Not scheduled</p>
          )}
        </div>

        <div className="sidebar-actions">
          <button
            className="ghost-button"
            onClick={() => onSchedule(task)}
          >
            {task.calendarEventIds && task.calendarEventIds.length > 0
              ? `Add Time Block (${task.calendarEventIds.length} scheduled)`
              : 'Schedule on Calendar'}
          </button>
          <button 
            className="ghost-button"
            onClick={() => onConvert(task)}
            title="Convert this task into a new project"
          >
            Convert to Project
          </button>
          <button className="ghost-button danger" onClick={() => onDelete(task.id)}>Delete Task</button>
        </div>
      </div>
    </aside>
  )
}
