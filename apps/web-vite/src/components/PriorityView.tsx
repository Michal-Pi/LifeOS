import { useMemo } from 'react'
import type { CanonicalTask, CanonicalProject, CanonicalChapter } from '@/types/todo'
import { groupTasksByBucket, type TaskFilters, getEffectiveUrgency } from '@/lib/priorityBuckets'
import { getProjectColor } from '@/config/domainColors'
import { calculatePriorityScore } from '@/lib/priority'

interface PriorityViewProps {
  tasks: CanonicalTask[]
  projects: CanonicalProject[]
  chapters: CanonicalChapter[]
  filters: TaskFilters
  onSelectTask: (task: CanonicalTask) => void
  onToggleComplete: (task: CanonicalTask) => void
  selectedTaskId?: string
}

interface UrgencyBand {
  key: string
  label: string
  color: string
  tasks: CanonicalTask[]
}

export function PriorityView({
  tasks,
  projects,
  filters,
  onSelectTask,
  onToggleComplete,
  selectedTaskId,
}: PriorityViewProps) {
  // Get filtered tasks from all buckets
  const allFilteredTasks = useMemo(() => {
    const grouped = groupTasksByBucket(tasks, filters)
    const result: CanonicalTask[] = []
    grouped.forEach((bucketTasks) => result.push(...bucketTasks))
    return result
  }, [tasks, filters])

  // Group filtered tasks into urgency bands
  const urgencyBands: UrgencyBand[] = useMemo(() => {
    const todayTasks: CanonicalTask[] = []
    const thisWeekTasks: CanonicalTask[] = []
    const thisMonthTasks: CanonicalTask[] = []
    const laterTasks: CanonicalTask[] = []

    for (const task of allFilteredTasks) {
      const urgency = getEffectiveUrgency(task)
      if (urgency === 'today') {
        todayTasks.push(task)
      } else if (urgency === 'next_3_days' || urgency === 'this_week') {
        thisWeekTasks.push(task)
      } else if (urgency === 'this_month') {
        thisMonthTasks.push(task)
      } else {
        laterTasks.push(task)
      }
    }

    const sortByPriority = (a: CanonicalTask, b: CanonicalTask) =>
      calculatePriorityScore(b) - calculatePriorityScore(a)

    return [
      {
        key: 'today',
        label: 'Today',
        color: 'var(--error-color)',
        tasks: todayTasks.sort(sortByPriority),
      },
      {
        key: 'this_week',
        label: 'This Week',
        color: 'var(--warning-color)',
        tasks: thisWeekTasks.sort(sortByPriority),
      },
      {
        key: 'this_month',
        label: 'This Month',
        color: 'var(--info-color)',
        tasks: thisMonthTasks.sort(sortByPriority),
      },
      {
        key: 'later',
        label: 'Someday',
        color: 'var(--text-tertiary)',
        tasks: laterTasks.sort(sortByPriority),
      },
    ]
  }, [allFilteredTasks])

  return (
    <div className="priority-view">
      <div className="priority-buckets">
        {urgencyBands.map((band) => (
          <details
            key={band.key}
            open={band.key === 'today' || band.key === 'this_week'}
            className="priority-band"
          >
            <summary className="priority-band__header">
              <span className="priority-band__dot" style={{ background: band.color }} />
              <span className="priority-band__label">{band.label}</span>
              <span className="priority-band__count">{band.tasks.length}</span>
            </summary>
            <div className="priority-band__tasks">
              {band.tasks.length === 0 ? (
                <div className="priority-band__empty">No tasks</div>
              ) : (
                band.tasks.map((task) => {
                  const project = projects.find((p) => p.id === task.projectId)
                  const taskColor = project ? getProjectColor(project.color, project.domain) : null
                  const badgeLabel = project ? project.title : task.domain

                  return (
                    <div
                      key={task.id}
                      className={`task-card ${selectedTaskId === task.id ? 'selected' : ''} ${task.completed ? 'completed' : ''}`}
                      onClick={() => onSelectTask(task)}
                    >
                      {taskColor && (
                        <div
                          className="task-card-color-indicator"
                          style={{ backgroundColor: taskColor }}
                        />
                      )}
                      <div className="task-card-main">
                        <input
                          type="checkbox"
                          checked={task.completed}
                          onChange={(e) => {
                            e.stopPropagation()
                            onToggleComplete(task)
                          }}
                          className="task-checkbox"
                        />
                        <span className="task-title">{task.title}</span>
                      </div>
                      {task.allocatedTimeMinutes && task.allocatedTimeMinutes > 0 ? (
                        <span className="meta-tag time-estimate">
                          {task.allocatedTimeMinutes}min
                        </span>
                      ) : (
                        <span />
                      )}
                      <span
                        className={`meta-tag ${project ? 'task-card-badge-project' : `task-card-badge-domain-${task.domain}`}`}
                      >
                        {badgeLabel}
                      </span>
                    </div>
                  )
                })
              )}
            </div>
          </details>
        ))}
      </div>
    </div>
  )
}
