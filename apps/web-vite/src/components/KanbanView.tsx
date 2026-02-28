import React, { useMemo } from 'react'
import { formatDistanceToNow, differenceInCalendarDays, parseISO } from 'date-fns'
import type { CanonicalTask, CanonicalProject } from '@/types/todo'
import { getProjectColor } from '@/config/domainColors'
import { calculatePriorityScore } from '@/lib/priority'
import { getEffectiveUrgency } from '@/lib/priorityBuckets'
import './KanbanView.css'

interface KanbanViewProps {
  tasks: CanonicalTask[]
  projects: CanonicalProject[]
  onTaskClick: (task: CanonicalTask) => void
  onStatusChange: (taskId: string, newStatus: string) => void
}

type KanbanColumn = 'inbox' | 'active' | 'in_progress' | 'done'

const COLUMNS: { key: KanbanColumn; label: string; statuses: string[] }[] = [
  { key: 'inbox', label: 'Inbox', statuses: ['inbox', 'someday'] },
  { key: 'active', label: 'Active', statuses: ['next_action', 'waiting_for'] },
  { key: 'in_progress', label: 'In Progress', statuses: ['scheduled'] },
  { key: 'done', label: 'Done', statuses: ['done', 'cancelled'] },
]

function columnForStatus(status: string): KanbanColumn {
  for (const col of COLUMNS) {
    if (col.statuses.includes(status)) return col.key
  }
  return 'inbox'
}

function isWithin7Days(dueDate?: string): boolean {
  if (!dueDate) return false
  const diff = differenceInCalendarDays(parseISO(dueDate), new Date())
  return diff >= 0 && diff <= 7
}

function formatRelative(dueDate: string): string {
  const date = parseISO(dueDate)
  const diff = differenceInCalendarDays(date, new Date())
  if (diff < 0) return 'Overdue'
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  return formatDistanceToNow(date, { addSuffix: true })
}

export const KanbanView = React.memo(function KanbanView({
  tasks,
  projects,
  onTaskClick,
  onStatusChange,
}: KanbanViewProps) {
  const grouped = useMemo(() => {
    const groups = new Map<KanbanColumn, CanonicalTask[]>()
    for (const col of COLUMNS) groups.set(col.key, [])

    for (const task of tasks) {
      if (task.archived) continue
      const colKey = task.completed ? 'done' : columnForStatus(task.status)
      groups.get(colKey)!.push(task)
    }

    // Sort each column by priority score descending
    for (const [key, colTasks] of groups) {
      groups.set(
        key,
        [...colTasks].sort((a, b) => calculatePriorityScore(b) - calculatePriorityScore(a))
      )
    }

    return groups
  }, [tasks])

  const handleDragStart = (e: React.DragEvent, task: CanonicalTask) => {
    e.dataTransfer.setData('taskId', task.id)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDrop = (e: React.DragEvent, columnKey: KanbanColumn) => {
    e.preventDefault()
    e.currentTarget.classList.remove('kanban-column--drag-over')
    const taskId = e.dataTransfer.getData('taskId')
    if (!taskId) return
    const newStatus = COLUMNS.find((c) => c.key === columnKey)!.statuses[0]
    onStatusChange(taskId, newStatus)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.currentTarget.classList.add('kanban-column--drag-over')
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.currentTarget.classList.remove('kanban-column--drag-over')
  }

  return (
    <div className="kanban-board">
      {COLUMNS.map((col) => {
        const colTasks = grouped.get(col.key) || []
        return (
          <div
            key={col.key}
            className="kanban-column"
            onDrop={(e) => handleDrop(e, col.key)}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
          >
            <div className="kanban-column__header">
              <span>{col.label}</span>
              <span className="kanban-column__count">{colTasks.length}</span>
            </div>
            <div className="kanban-column__body">
              {colTasks.map((task) => {
                const project = projects.find((p) => p.id === task.projectId)
                const projectColor = project ? getProjectColor(project.color, project.domain) : null
                const urgency = getEffectiveUrgency(task)

                return (
                  <div
                    key={task.id}
                    className="kanban-card"
                    onClick={() => onTaskClick(task)}
                    draggable
                    onDragStart={(e) => handleDragStart(e, task)}
                  >
                    <div className="kanban-card__header">
                      {projectColor && (
                        <span className="kanban-card__dot" style={{ background: projectColor }} />
                      )}
                      <span className="kanban-card__title">{task.title}</span>
                    </div>
                    <div className="kanban-card__meta">
                      {urgency && urgency !== 'later' && (
                        <span className={`kanban-card__priority kanban-card__priority--${urgency}`}>
                          {urgency.replace(/_/g, ' ')}
                        </span>
                      )}
                      {isWithin7Days(task.dueDate) && task.dueDate && (
                        <span className="kanban-card__due">{formatRelative(task.dueDate)}</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
})
