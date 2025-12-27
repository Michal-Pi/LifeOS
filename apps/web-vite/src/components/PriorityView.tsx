import { useMemo } from 'react'
import type { CanonicalTask, Domain } from '@/types/todo'
import { groupTasksByBucket, PRIORITY_BUCKETS } from '@/lib/priorityBuckets'

interface PriorityViewProps {
  tasks: CanonicalTask[]
  onSelectTask: (task: CanonicalTask) => void
  onToggleComplete: (task: CanonicalTask) => void
  selectedTaskId?: string
  domainFilter: Domain | 'all'
  onDomainFilterChange: (value: Domain | 'all') => void
}

export function PriorityView({
  tasks,
  onSelectTask,
  onToggleComplete,
  selectedTaskId,
  domainFilter,
  onDomainFilterChange,
}: PriorityViewProps) {
  const groupedTasks = useMemo(() => {
    return groupTasksByBucket(tasks, domainFilter)
  }, [tasks, domainFilter])

  return (
    <div className="priority-view">
      <div className="priority-toolbar">
        <label htmlFor="priority-domain" className="section-label">
          Domain
        </label>
        <select
          id="priority-domain"
          value={domainFilter}
          onChange={(e) => onDomainFilterChange(e.target.value as Domain | 'all')}
        >
          <option value="all">All</option>
          <option value="work">Work</option>
          <option value="projects">Projects</option>
          <option value="life">Life</option>
          <option value="learning">Learning</option>
          <option value="wellbeing">Wellbeing</option>
        </select>
      </div>
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
              {bucketTasks.map((task) => (
                <div
                  key={task.id}
                  className={`task-card ${selectedTaskId === task.id ? 'selected' : ''} ${task.completed ? 'completed' : ''}`}
                  onClick={() => onSelectTask(task)}
                >
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
                    {task.dueDate && <span className="meta-tag due-date">Due {task.dueDate}</span>}
                    <span className="meta-tag importance">Imp: {task.importance}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
