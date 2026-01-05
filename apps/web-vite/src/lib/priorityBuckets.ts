import type { CanonicalTask, Domain, UrgencyLevel } from '@/types/todo'
import { calculateUrgency, sortTasksByPriority } from '@/lib/priority'

export type PriorityBucketKey =
  | 'urgent'
  | 'next_3_days'
  | 'this_week'
  | 'this_month'
  | 'specific_deadline'
  | 'parking_lot'

export interface TaskFilters {
  domain: Domain | 'all'
  projectId?: string
  milestoneId?: string
  urgency?: UrgencyLevel | 'all'
  dueDate?: 'today' | 'next_3_days' | 'this_week' | 'this_month' | 'later' | 'all'
  completionStatus?: 'todo' | 'completed' | 'all'
  minTimeMinutes?: number
  maxTimeMinutes?: number
}

export const PRIORITY_BUCKETS: { key: PriorityBucketKey; label: string }[] = [
  { key: 'urgent', label: 'Urgent / Overdue' },
  { key: 'next_3_days', label: 'Next 3 Days' },
  { key: 'this_week', label: 'This Week' },
  { key: 'this_month', label: 'This Month' },
  { key: 'specific_deadline', label: 'Specific Deadline' },
  { key: 'parking_lot', label: 'Parking Lot' }
]

export function getEffectiveUrgency(task: CanonicalTask): UrgencyLevel {
  if (task.urgency) return task.urgency
  if (task.dueDate) return calculateUrgency(task.dueDate)
  return 'later'
}

export function bucketForTask(task: CanonicalTask, urgency: UrgencyLevel): PriorityBucketKey {
  if (urgency === 'today') return 'urgent'
  if (urgency === 'next_3_days') return 'next_3_days'
  if (urgency === 'this_week') return 'this_week'
  if (urgency === 'this_month') return 'this_month'
  if (task.dueDate) return 'specific_deadline'
  return 'parking_lot'
}

export function groupTasksByBucket(tasks: CanonicalTask[], filters: TaskFilters): Map<PriorityBucketKey, CanonicalTask[]> {
  const groups = new Map<PriorityBucketKey, CanonicalTask[]>()
  PRIORITY_BUCKETS.forEach((bucket) => groups.set(bucket.key, []))

  const visibleTasks = tasks.filter((task) => {
    // Basic filters - don't show archived
    if (task.archived) return false

    // Completion status filter
    if (filters.completionStatus === 'todo' && task.completed) return false
    if (filters.completionStatus === 'completed' && !task.completed) return false

    // Domain filter
    if (filters.domain !== 'all' && task.domain !== filters.domain) return false

    // Project filter
    if (filters.projectId && task.projectId !== filters.projectId) return false

    // Milestone filter
    if (filters.milestoneId && task.milestoneId !== filters.milestoneId) return false

    // Urgency filter
    if (filters.urgency && filters.urgency !== 'all') {
      const taskUrgency = getEffectiveUrgency(task)
      if (taskUrgency !== filters.urgency) return false
    }

    // Due date filter
    if (filters.dueDate && filters.dueDate !== 'all') {
      if (!task.dueDate && filters.dueDate !== 'later') return false
      if (task.dueDate) {
        const taskUrgency = calculateUrgency(task.dueDate)
        if (filters.dueDate === 'today' && taskUrgency !== 'today') return false
        if (filters.dueDate === 'next_3_days' && taskUrgency !== 'next_3_days') return false
        if (filters.dueDate === 'this_week' && taskUrgency !== 'this_week') return false
        if (filters.dueDate === 'this_month' && taskUrgency !== 'this_month') return false
      }
    }

    // Time estimate filter
    const taskTime = task.allocatedTimeMinutes || 0
    if (filters.minTimeMinutes !== undefined && taskTime < filters.minTimeMinutes) return false
    if (filters.maxTimeMinutes !== undefined && taskTime > filters.maxTimeMinutes) return false

    return true
  })

  for (const task of visibleTasks) {
    const urgency = getEffectiveUrgency(task)
    const bucketKey = bucketForTask(task, urgency)
    const bucket = groups.get(bucketKey)
    if (bucket) {
      bucket.push(task)
    }
  }

  for (const bucket of PRIORITY_BUCKETS) {
    const items = groups.get(bucket.key)
    if (items) {
      groups.set(bucket.key, sortTasksByPriority(items))
    }
  }

  return groups
}
