import type { CanonicalTask, Domain, UrgencyLevel } from '@/types/todo'
import { calculateUrgency, sortTasksByPriority } from '@/lib/priority'

export type PriorityBucketKey =
  | 'urgent'
  | 'next_3_days'
  | 'this_week'
  | 'this_month'
  | 'specific_deadline'
  | 'parking_lot'

export type TimelineFilter = 'today' | 'next_3_days' | 'this_week' | 'this_month' | 'later' | 'all'

export interface TaskFilters {
  domain: Domain | 'all'
  projectId?: string
  milestoneId?: string
  timeline?: TimelineFilter
  completionStatus?: 'todo' | 'completed' | 'all'
  minTimeHours?: number
  minTimeMinutes?: number
  maxTimeHours?: number
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

    // Timeline filter (merged urgency + due date)
    // Matches tasks that have EITHER a due date OR urgency matching the timeline
    if (filters.timeline && filters.timeline !== 'all') {
      const effectiveUrgency = getEffectiveUrgency(task)

      // For 'later', match tasks with no due date OR urgency=later
      if (filters.timeline === 'later') {
        const hasLaterUrgency = effectiveUrgency === 'later'
        const hasNoDueDate = !task.dueDate
        if (!hasLaterUrgency && !hasNoDueDate) return false
      } else {
        // For other timelines, match if urgency matches the filter
        if (effectiveUrgency !== filters.timeline) return false
      }
    }

    // Time estimate filter (now using hours + minutes)
    const taskTime = task.allocatedTimeMinutes || 0
    const minTimeTotal = ((filters.minTimeHours || 0) * 60) + (filters.minTimeMinutes || 0)
    const maxTimeTotal = ((filters.maxTimeHours || 0) * 60) + (filters.maxTimeMinutes || 0)

    if (minTimeTotal > 0 && taskTime < minTimeTotal) return false
    if (maxTimeTotal > 0 && taskTime > maxTimeTotal) return false

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
