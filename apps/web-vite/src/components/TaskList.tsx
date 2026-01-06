import React, { useState, useMemo } from 'react'
import { List } from 'react-window'
import type { RowComponentProps } from 'react-window'
import type { CanonicalTask, CanonicalProject, TaskStatus } from '@/types/todo'
import { calculatePriorityScore } from '@/lib/priority'
import { getProjectColor } from '@/config/domainColors'
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

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDirection('desc') // Default to descending for most metrics
    }
  }

  const sortedTasks = useMemo(() => {
    return [...tasks].sort((a, b) => {
      let comparison = 0

      switch (sortField) {
        case 'priority':
          comparison = calculatePriorityScore(a) - calculatePriorityScore(b)
          break
        case 'urgency':
          // Simple string comparison for now, ideally map to numeric values
          comparison = (a.urgency || '').localeCompare(b.urgency || '')
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
    const project = projects.find((p) => p.id === task.projectId)
    const taskColor = project ? getProjectColor(project.color, project.domain) : null

    return (
      <div
        style={style}
        className={`task-row ${selectedTaskId === task.id ? 'selected' : ''} ${task.completed ? 'completed' : ''}`}
        onClick={() => onSelectTask(task)}
      >
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
            <span className={`urgency-badge ${task.urgency}`}>
              {task.urgency.replace(/_/g, ' ')}
            </span>
          ) : (
            '-'
          )}
        </div>
        <div className="task-cell meta-cell w-24">{task.importance}</div>
        <div className="task-cell meta-cell w-32">{task.dueDate || '-'}</div>
        <div className="task-cell meta-cell w-24">
          <span className={`status-pill ${task.status}`}>{STATUS_LABELS[task.status]}</span>
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
        <div className="task-header-cell sortable w-32" onClick={() => handleSort('dueDate')}>
          Due {sortField === 'dueDate' && (sortDirection === 'asc' ? '↑' : '↓')}
        </div>
        <div className="task-header-cell w-24">Status</div>
      </div>

      <div className="task-list-body">
        <List
          rowCount={sortedTasks.length}
          rowHeight={48}
          rowComponent={Row}
          rowProps={{
            tasks: sortedTasks,
            projects,
            onSelectTask,
            onToggleComplete,
            selectedTaskId,
          }}
          style={{ height: 600, width: '100%' }}
        />
      </div>
    </div>
  )
})
