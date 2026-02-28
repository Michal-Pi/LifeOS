import type { CanonicalTask, Domain } from '@/types/todo'
import { calculateUrgency } from '@/lib/priority'

export interface TaskStatistics {
  tasksRemaining: number
  totalTimeMinutes: number
  domainSplit: Record<Domain, number> // percentage
  urgentCount: number
  overdueCount: number
  last7Days: {
    tasksCreated: number
    tasksCreatedTimeMinutes: number
    tasksCompleted: number
    tasksCompletedTimeMinutes: number
  }
}

export function calculateTaskStatistics(tasks: CanonicalTask[], allTasks?: CanonicalTask[]): TaskStatistics {
  const incompleteTasks = tasks.filter((t) => !t.completed && !t.archived)
  const activitySource = allTasks ?? tasks

  // Tasks remaining
  const tasksRemaining = incompleteTasks.length

  // Total time to complete
  const totalTimeMinutes = incompleteTasks.reduce((sum, task) => {
    return sum + (task.allocatedTimeMinutes || 0)
  }, 0)

  // Domain split
  const domainCounts: Record<Domain, number> = {
    work: 0,
    projects: 0,
    life: 0,
    learning: 0,
    wellbeing: 0,
  }

  incompleteTasks.forEach((task) => {
    if (task.domain in domainCounts) {
      domainCounts[task.domain]++
    }
  })

  // Convert counts to percentages
  const domainSplit: Record<Domain, number> = {
    work: tasksRemaining > 0 ? Math.round((domainCounts.work / tasksRemaining) * 100) : 0,
    projects: tasksRemaining > 0 ? Math.round((domainCounts.projects / tasksRemaining) * 100) : 0,
    life: tasksRemaining > 0 ? Math.round((domainCounts.life / tasksRemaining) * 100) : 0,
    learning: tasksRemaining > 0 ? Math.round((domainCounts.learning / tasksRemaining) * 100) : 0,
    wellbeing:
      tasksRemaining > 0 ? Math.round((domainCounts.wellbeing / tasksRemaining) * 100) : 0,
  }

  // Urgent count (today or next 3 days)
  const urgentCount = incompleteTasks.filter((task) => {
    if (!task.dueDate) return task.urgency === 'today' || task.urgency === 'next_3_days'
    const urgency = calculateUrgency(task.dueDate)
    return urgency === 'today' || urgency === 'next_3_days'
  }).length

  // Overdue count (due date in the past)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const overdueCount = incompleteTasks.filter((task) => {
    if (!task.dueDate) return false
    const dueDate = new Date(task.dueDate)
    dueDate.setHours(0, 0, 0, 0)
    return dueDate < today
  }).length

  // Last 7 days activity
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
  sevenDaysAgo.setHours(0, 0, 0, 0)

  const tasksCreatedLast7Days = activitySource.filter((task) => {
    if (!task.createdAt) return false
    const createdDate = new Date(task.createdAt)
    return createdDate >= sevenDaysAgo
  })

  const tasksCompletedLast7Days = activitySource.filter((task) => {
    if (!task.completedAt) return false
    const completedDate = new Date(task.completedAt)
    return completedDate >= sevenDaysAgo
  })

  const tasksCreatedTimeMinutes = tasksCreatedLast7Days.reduce((sum, task) => {
    return sum + (task.allocatedTimeMinutes || 0)
  }, 0)

  const tasksCompletedTimeMinutes = tasksCompletedLast7Days.reduce((sum, task) => {
    return sum + (task.allocatedTimeMinutes || 0)
  }, 0)

  return {
    tasksRemaining,
    totalTimeMinutes,
    domainSplit,
    urgentCount,
    overdueCount,
    last7Days: {
      tasksCreated: tasksCreatedLast7Days.length,
      tasksCreatedTimeMinutes,
      tasksCompleted: tasksCompletedLast7Days.length,
      tasksCompletedTimeMinutes,
    },
  }
}

export function formatTimeMinutes(minutes: number): string {
  if (minutes === 0) return '0m'

  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60

  if (hours === 0) return `${mins}m`
  if (mins === 0) return `${hours}h`
  return `${hours}h ${mins}m`
}
