/**
 * Todo System Type Definitions
 *
 * Defines the core data models for the hierarchical to-do system:
 * - Projects (Top level)
 * - Milestones (Mid level)
 * - Tasks (Atomic level)
 */

export type UrgencyLevel =
  | 'today'
  | 'next_3_days'
  | 'this_week'
  | 'this_month'
  | 'next_month'
  | 'later'
export type ImportanceLevel = 1 | 2 | 4 | 7 | 10
export type TaskStatus =
  | 'inbox'
  | 'next_action'
  | 'waiting_for'
  | 'scheduled'
  | 'someday'
  | 'done'
  | 'cancelled'
export type Domain = 'work' | 'projects' | 'life' | 'learning' | 'wellbeing'

export interface CanonicalProject {
  id: string
  userId: string
  title: string
  description?: string
  domain: Domain
  objective?: string
  keyResults?: { id: string; text: string }[]
  createdAt: string
  updatedAt: string
  archived: boolean
}

export interface CanonicalMilestone {
  id: string
  projectId: string
  userId: string
  title: string
  description?: string
  objective?: string
  keyResults?: { id: string; text: string }[]
  deadline?: string
  createdAt: string
  updatedAt: string
  archived: boolean
}

export interface CanonicalTask {
  id: string
  userId: string
  projectId?: string
  milestoneId?: string
  keyResultId?: string
  title: string
  description?: string
  domain: Domain
  dueDate?: string
  urgency?: UrgencyLevel // Manual override or calculated
  importance: ImportanceLevel
  status: TaskStatus
  allocatedTimeMinutes?: number
  completed: boolean
  completedAt?: string
  archived: boolean
  calendarEventIds?: string[] // For time-blocking
  createdAt: string
  updatedAt: string
}
