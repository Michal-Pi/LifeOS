import { useMemo, useState } from 'react'
import type {
  CanonicalTask,
  Domain,
  UrgencyLevel,
  CanonicalProject,
  CanonicalMilestone,
} from '@/types/todo'
import { groupTasksByBucket, PRIORITY_BUCKETS, type TaskFilters } from '@/lib/priorityBuckets'
import { Select, type SelectOption } from './Select'

interface PriorityViewProps {
  tasks: CanonicalTask[]
  projects: CanonicalProject[]
  milestones: CanonicalMilestone[]
  onSelectTask: (task: CanonicalTask) => void
  onToggleComplete: (task: CanonicalTask) => void
  selectedTaskId?: string
  domainFilter: Domain | 'all'
  onDomainFilterChange: (value: Domain | 'all') => void
}

export function PriorityView({
  tasks,
  projects,
  milestones,
  onSelectTask,
  onToggleComplete,
  selectedTaskId,
  domainFilter,
  onDomainFilterChange,
}: PriorityViewProps) {
  // Filter states
  const [projectFilter, setProjectFilter] = useState<string>('all')
  const [urgencyFilter, setUrgencyFilter] = useState<UrgencyLevel | 'all'>('all')
  const [dueDateFilter, setDueDateFilter] = useState<
    'today' | 'next_3_days' | 'this_week' | 'this_month' | 'later' | 'all'
  >('all')
  const [completionFilter, setCompletionFilter] = useState<'todo' | 'completed' | 'all'>('todo')
  const [minTime, setMinTime] = useState<number>(0)
  const [maxTime, setMaxTime] = useState<number>(2400) // 40 hours in minutes

  // Prepare filter options
  const domainOptions: SelectOption[] = [
    { value: 'all', label: 'All Domains' },
    { value: 'work', label: 'Work' },
    { value: 'projects', label: 'Projects' },
    { value: 'life', label: 'Life' },
    { value: 'learning', label: 'Learning' },
    { value: 'wellbeing', label: 'Wellbeing' },
  ]

  const projectOptions: SelectOption[] = useMemo(() => {
    const options: SelectOption[] = [{ value: 'all', label: 'All Projects' }]

    projects.forEach((project) => {
      options.push({ value: project.id, label: project.title })

      // Add milestones under each project
      const projectMilestones = milestones.filter((m) => m.projectId === project.id)
      projectMilestones.forEach((milestone) => {
        options.push({ value: `milestone:${milestone.id}`, label: `  → ${milestone.title}` })
      })
    })

    return options
  }, [projects, milestones])

  const urgencyOptions: SelectOption[] = [
    { value: 'all', label: 'All Urgency Levels' },
    { value: 'today', label: 'Today' },
    { value: 'next_3_days', label: 'Next 3 Days' },
    { value: 'this_week', label: 'This Week' },
    { value: 'this_month', label: 'This Month' },
    { value: 'later', label: 'Later' },
  ]

  const dueDateOptions: SelectOption[] = [
    { value: 'all', label: 'All Due Dates' },
    { value: 'today', label: 'Due Today' },
    { value: 'next_3_days', label: 'Due Next 3 Days' },
    { value: 'this_week', label: 'Due This Week' },
    { value: 'this_month', label: 'Due This Month' },
    { value: 'later', label: 'Due Later / No Date' },
  ]

  const completionOptions: SelectOption[] = [
    { value: 'todo', label: 'To-Do' },
    { value: 'completed', label: 'Completed' },
    { value: 'all', label: 'All Tasks' },
  ]

  // Build filters object
  const filters: TaskFilters = useMemo(() => {
    const projectOrMilestoneId = projectFilter.startsWith('milestone:')
      ? undefined
      : projectFilter === 'all'
        ? undefined
        : projectFilter

    const milestoneId = projectFilter.startsWith('milestone:')
      ? projectFilter.replace('milestone:', '')
      : undefined

    return {
      domain: domainFilter,
      projectId: projectOrMilestoneId,
      milestoneId,
      urgency: urgencyFilter,
      dueDate: dueDateFilter,
      completionStatus: completionFilter,
      minTimeMinutes: minTime,
      maxTimeMinutes: maxTime,
    }
  }, [domainFilter, projectFilter, urgencyFilter, dueDateFilter, completionFilter, minTime, maxTime])

  const groupedTasks = useMemo(() => {
    return groupTasksByBucket(tasks, filters)
  }, [tasks, filters])

  const handleProjectFilterChange = (value: string) => {
    setProjectFilter(value)
  }

  const handleTimeRangeChange = (min: number, max: number) => {
    setMinTime(min)
    setMaxTime(max)
  }

  return (
    <div className="priority-view">
      <div className="priority-toolbar">
        <div className="filter-group">
          <label htmlFor="filter-domain" className="filter-label">
            Domain
          </label>
          <Select
            id="filter-domain"
            value={domainFilter}
            onChange={(value) => onDomainFilterChange(value as Domain | 'all')}
            options={domainOptions}
            placeholder="Select domain"
          />
        </div>

        <div className="filter-group">
          <label htmlFor="filter-project" className="filter-label">
            Project / Milestone
          </label>
          <Select
            id="filter-project"
            value={projectFilter}
            onChange={handleProjectFilterChange}
            options={projectOptions}
            placeholder="Select project"
          />
        </div>

        <div className="filter-group">
          <label htmlFor="filter-urgency" className="filter-label">
            Urgency
          </label>
          <Select
            id="filter-urgency"
            value={urgencyFilter}
            onChange={(value) => setUrgencyFilter(value as UrgencyLevel | 'all')}
            options={urgencyOptions}
            placeholder="Select urgency"
          />
        </div>

        <div className="filter-group">
          <label htmlFor="filter-due-date" className="filter-label">
            Due Date
          </label>
          <Select
            id="filter-due-date"
            value={dueDateFilter}
            onChange={(value) =>
              setDueDateFilter(
                value as 'today' | 'next_3_days' | 'this_week' | 'this_month' | 'later' | 'all'
              )
            }
            options={dueDateOptions}
            placeholder="Select due date"
          />
        </div>

        <div className="filter-group">
          <label htmlFor="filter-completion" className="filter-label">
            Status
          </label>
          <Select
            id="filter-completion"
            value={completionFilter}
            onChange={(value) => setCompletionFilter(value as 'todo' | 'completed' | 'all')}
            options={completionOptions}
            placeholder="Select status"
          />
        </div>

        <div className="filter-group filter-group-time">
          <label htmlFor="filter-time-min" className="filter-label">
            Estimated Time
          </label>
          <div className="time-range-inputs">
            <input
              id="filter-time-min"
              type="number"
              min="0"
              max="2400"
              step="15"
              value={minTime}
              onChange={(e) => handleTimeRangeChange(Number(e.target.value), maxTime)}
              className="time-input"
              placeholder="Min"
            />
            <span className="time-separator">to</span>
            <input
              id="filter-time-max"
              type="number"
              min="0"
              max="2400"
              step="15"
              value={maxTime}
              onChange={(e) => handleTimeRangeChange(minTime, Number(e.target.value))}
              className="time-input"
              placeholder="Max"
            />
            <span className="time-unit">min</span>
          </div>
        </div>
      </div>

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
                      {task.allocatedTimeMinutes && task.allocatedTimeMinutes > 0 && (
                        <span className="meta-tag time-estimate">
                          {task.allocatedTimeMinutes}min
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
