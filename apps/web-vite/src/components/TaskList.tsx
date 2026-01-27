import React, { useState, useMemo } from 'react'
import { List } from 'react-window'
import type { RowComponentProps } from 'react-window'
import type { CanonicalTask, CanonicalProject, TaskStatus } from '@/types/todo'
import { calculatePriorityScore, calculateUrgency } from '@/lib/priority'
import { getProjectColor } from '@/config/domainColors'
import { importanceLabel, urgencyLabel } from '@/lib/todoUi'
import './TaskList.css'
import { EmptyState } from '@/components/EmptyState'

interface TaskListProps {
  tasks: CanonicalTask[]
  projects: CanonicalProject[]
  onSelectTask: (task: CanonicalTask) => void
  onToggleComplete: (task: CanonicalTask) => void
  selectedTaskId?: string
  onCreateTask?: () => void
}

type SortField = 'priority' | 'urgency' | 'importance' | 'dueDate' | 'title'
type SortDirection = 'asc' | 'desc'

const STATUS_LABELS: Record<TaskStatus, string> = {
  inbox: 'Inbox',
  next_action: 'Next Action',
  waiting_for: 'Waiting',
  scheduled: 'Scheduled',
  someday: 'Someday',
  done: 'Done',
  cancelled: 'Cancelled',
}

export const TaskList = React.memo(function TaskList({
  tasks,
  projects,
  onSelectTask,
  onToggleComplete,
  selectedTaskId,
  onCreateTask,
}: TaskListProps) {
  const [sortField, setSortField] = useState<SortField>('priority')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [currentPage, setCurrentPage] = useState(1)
  const ROWS_PER_PAGE = 20

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDirection('desc') // Default to descending for most metrics
    }
    // Reset to first page when sorting changes
    setCurrentPage(1)
  }

  const sortedTasks = useMemo(() => {
    return [...tasks].sort((a, b) => {
      let comparison = 0

      switch (sortField) {
        case 'priority':
          comparison = calculatePriorityScore(a) - calculatePriorityScore(b)
          break
        case 'urgency':
          {
            const urgencyOrder = {
              today: 6,
              next_3_days: 5,
              this_week: 4,
              this_month: 3,
              next_month: 2,
              later: 1,
            } as const
            const urgencyA = a.urgency ?? (a.dueDate ? calculateUrgency(a.dueDate) : 'later')
            const urgencyB = b.urgency ?? (b.dueDate ? calculateUrgency(b.dueDate) : 'later')
            comparison = urgencyOrder[urgencyA] - urgencyOrder[urgencyB]
          }
          break
        case 'importance':
          comparison = a.importance - b.importance
          break
        case 'dueDate':
          if (!a.dueDate) return 1
          if (!b.dueDate) return -1
          comparison = a.dueDate.localeCompare(b.dueDate)
          break
        case 'title':
          comparison = a.title.localeCompare(b.title)
          break
      }

      return sortDirection === 'asc' ? comparison : -comparison
    })
  }, [tasks, sortField, sortDirection])

  // Pagination logic
  const totalPages = Math.ceil(sortedTasks.length / ROWS_PER_PAGE)
  const startIndex = (currentPage - 1) * ROWS_PER_PAGE
  const endIndex = Math.min(startIndex + ROWS_PER_PAGE, sortedTasks.length)
  const paginatedTasks = sortedTasks.slice(startIndex, endIndex)
  const visibleRowCount = Math.min(ROWS_PER_PAGE, sortedTasks.length - startIndex)
  
  // Calculate dynamic height: up to 20 rows, min 400px, max based on visible rows
  const listHeight = Math.max(400, Math.min(68 * visibleRowCount + 40, 68 * ROWS_PER_PAGE + 40))

  if (tasks.length === 0) {
    return (
      <EmptyState
        label="Tasks"
        title="System idle"
        description="Tasks are your execution layer. Add the next action to keep momentum."
        hint="// TASK QUEUE EMPTY"
        actionLabel={onCreateTask ? 'Create Task' : undefined}
        onAction={onCreateTask}
      >
        <div className="empty-ghost-list">
          <span>▢ Draft quarterly plan</span>
          <span>▢ Review weekly outcomes</span>
          <span>▢ Block focus time</span>
        </div>
      </EmptyState>
    )
  }

  type RowProps = {
    tasks: CanonicalTask[]
    projects: CanonicalProject[]
    onSelectTask: (task: CanonicalTask) => void
    onToggleComplete: (task: CanonicalTask) => void
    selectedTaskId?: string
  }

  const Row = ({
    index,
    style,
    tasks,
    projects,
    onSelectTask,
    onToggleComplete,
    selectedTaskId,
  }: RowComponentProps<RowProps>) => {
    const task = tasks[index]
    if (!task) return null
    const project = projects.find((p) => p.id === task.projectId)
    const taskColor = project ? getProjectColor(project.color, project.domain) : null

    // Determine effective urgency (from task or calculated from due date)
    const effectiveUrgency =
      task.urgency ?? (task.dueDate ? calculateUrgency(task.dueDate) : 'later')
    
    // Check if previous task was "this_week" or earlier and current is "later"
    const prevTask = index > 0 ? tasks[index - 1] : null
    const prevUrgency =
      prevTask?.urgency ?? (prevTask?.dueDate ? calculateUrgency(prevTask.dueDate) : 'later')
    // Show separator only when transitioning FROM "this_week" (or earlier, but not "later") TO "later"
    // This ensures separator appears only once, right after the last "this_week" task
    const isPrevThisWeekOrEarlier = prevUrgency === 'today' || prevUrgency === 'next_3_days' || prevUrgency === 'this_week'
    const isCurrentLater = effectiveUrgency === 'later'
    const showSeparator = isPrevThisWeekOrEarlier && isCurrentLater

    return (
      <div
        style={style}
        className={`task-row ${selectedTaskId === task.id ? 'selected' : ''} ${task.completed ? 'completed' : ''}`}
        onClick={() => onSelectTask(task)}
      >
        {showSeparator && (
          <div className="task-row-separator">
            <div className="task-separator-line"></div>
            <span className="task-separator-text">Later</span>
            <div className="task-separator-line"></div>
          </div>
        )}
        <div className="task-row-content">
          {taskColor && (
            <div className="task-color-indicator" style={{ backgroundColor: taskColor }} />
          )}
          <div className="task-cell checkbox-cell" onClick={(e) => e.stopPropagation()}>
            <input
              type="checkbox"
              checked={task.completed}
              onChange={() => onToggleComplete(task)}
              className="task-checkbox"
            />
          </div>
          <div className="task-cell title-cell">{task.title}</div>
          <div className="task-cell meta-cell w-24">
            <span className="priority-score">{calculatePriorityScore(task)}</span>
          </div>
          <div className="task-cell meta-cell w-32">
            {task.urgency ? (
              <span className={`urgency-badge ${effectiveUrgency}`}>
                {urgencyLabel(task.urgency)}
              </span>
            ) : task.dueDate ? (
              <span className={`urgency-badge ${effectiveUrgency}`}>{task.dueDate}</span>
            ) : (
              '-'
            )}
          </div>
          <div className="task-cell meta-cell w-24">{importanceLabel(task.importance)}</div>
          <div className="task-cell meta-cell w-24">
            <span className={`domain-badge domain-badge-${task.domain}`}>{task.domain}</span>
          </div>
          <div className="task-cell meta-cell w-24">
            <span className={`status-pill ${task.status}`}>{STATUS_LABELS[task.status]}</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="task-list-container">
      <div className="task-header-row">
        <div className="task-header-cell w-8"></div>
        <div className="task-header-cell sortable flex-1" onClick={() => handleSort('title')}>
          Title {sortField === 'title' && (sortDirection === 'asc' ? '↑' : '↓')}
        </div>
        <div className="task-header-cell sortable w-24" onClick={() => handleSort('priority')}>
          Score {sortField === 'priority' && (sortDirection === 'asc' ? '↑' : '↓')}
        </div>
        <div className="task-header-cell sortable w-32" onClick={() => handleSort('urgency')}>
          Urgency {sortField === 'urgency' && (sortDirection === 'asc' ? '↑' : '↓')}
        </div>
        <div className="task-header-cell sortable w-24" onClick={() => handleSort('importance')}>
          Imp. {sortField === 'importance' && (sortDirection === 'asc' ? '↑' : '↓')}
        </div>
        <div className="task-header-cell w-24">Domain</div>
        <div className="task-header-cell w-24">Status</div>
      </div>

      <div className="task-list-body">
        <List
          rowCount={paginatedTasks.length}
          rowHeight={68}
          rowComponent={Row}
          rowProps={{
            tasks: paginatedTasks,
            projects,
            onSelectTask,
            onToggleComplete,
            selectedTaskId,
          }}
          style={{ height: listHeight, width: '100%' }}
        />
      </div>
      
      {totalPages > 1 && (
        <div className="task-list-pagination">
          <button
            className="pagination-button"
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage === 1}
          >
            Previous
          </button>
          <span className="pagination-info">
            Page {currentPage} of {totalPages} ({sortedTasks.length} tasks)
          </span>
          <button
            className="pagination-button"
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
          >
            Next
          </button>
        </div>
      )}
    </div>
  )
})
