import { useMemo } from 'react'
import type { CanonicalTask, CanonicalProject, CanonicalChapter } from '@/types/todo'
import { groupTasksByBucket, PRIORITY_BUCKETS, type TaskFilters } from '@/lib/priorityBuckets'
import { getProjectColor } from '@/config/domainColors'
import { importanceLabel } from '@/lib/todoUi'

interface PriorityViewProps {
  tasks: CanonicalTask[]
  projects: CanonicalProject[]
  chapters: CanonicalChapter[]
  filters: TaskFilters
  onSelectTask: (task: CanonicalTask) => void
  onToggleComplete: (task: CanonicalTask) => void
  selectedTaskId?: string
}

export function PriorityView({
  tasks,
  projects,
  filters,
  onSelectTask,
  onToggleComplete,
  selectedTaskId,
}: PriorityViewProps) {
  const groupedTasks = useMemo(() => {
    return groupTasksByBucket(tasks, filters)
  }, [tasks, filters])

  return (
    <div className="priority-view">
      <div className="priority-buckets">
        {PRIORITY_BUCKETS.map((bucket) => {
          const bucketTasks = groupedTasks.get(bucket.key) || []
          if (bucketTasks.length === 0) return null

          return (
            <div key={bucket.key} className="priority-bucket">
              <h3 className="bucket-header">
                {bucket.label}
                <span className="bucket-count">{bucketTasks.length}</span>
              </h3>
              <div className="bucket-tasks">
                {bucketTasks.map((task) => {
                  const project = projects.find((p) => p.id === task.projectId)
                  const taskColor = project ? getProjectColor(project.color, project.domain) : null
                  // Badge shows project name if available, otherwise domain
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
                      <div className="task-card-header">
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
                      <div className="task-card-meta">
                        <span
                          className={`meta-tag ${project ? 'task-card-badge-project' : `task-card-badge-domain-${task.domain}`}`}
                        >
                          {badgeLabel}
                        </span>
                        {task.dueDate && (
                          <span className="meta-tag due-date">Due {task.dueDate}</span>
                        )}
                        <span className="meta-tag importance">
                          Imp: {importanceLabel(task.importance)}
                        </span>
                        {task.allocatedTimeMinutes && task.allocatedTimeMinutes > 0 && (
                          <span className="meta-tag time-estimate">
                            {task.allocatedTimeMinutes}min
                          </span>
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
    </div>
  )
}
