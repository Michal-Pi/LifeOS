import type { Id } from '@lifeos/core'

// ----- IDs -----

export type HabitId = Id<'habit'>
export type CheckinId = Id<'checkin'>
export type IncantationId = Id<'incantation'>

// ----- Sync State -----

export type SyncState = 'synced' | 'pending' | 'conflict'

// ----- Domain Enums -----

export type HabitDomain =
  | 'sleep'
  | 'exercise'
  | 'meditation'
  | 'nutrition'
  | 'work_focus'
  | 'social'
  | 'learning'
  | 'creativity'
  | 'custom'

export type HabitStatus = 'active' | 'paused' | 'archived'

export type CheckinStatus = 'done' | 'tiny' | 'skip'

// ----- Anchor Types -----

export interface AfterEventAnchor {
  type: 'after_event'
  eventDescription: string
}

export interface TimeWindowAnchor {
  type: 'time_window'
  startTimeHHMM: string // HH:MM format
  endTimeHHMM: string
}

export type HabitAnchor = AfterEventAnchor | TimeWindowAnchor

// ----- Habit Recipe -----

export interface HabitRecipe {
  tiny?: string
  standard: string
}

// ----- Schedule -----

export interface HabitSchedule {
  daysOfWeek: number[] // 0-6 (Sunday-Saturday)
  timezone: string // IANA timezone
}

// ----- Safety Net -----

export interface SafetyNet {
  tinyCountsAsSuccess: boolean // Tiny version preserves streak
  allowRecovery: boolean // Can bounce back after skip
}

// ----- Calendar Projection -----

export interface CalendarProjection {
  enabled: boolean
  blockMinutes: number
  timeHint?: 'morning' | 'midday' | 'evening'
}

// ----- Main Habit Entity -----

export interface CanonicalHabit {
  habitId: HabitId
  userId: string

  // Core attributes
  title: string
  domain: HabitDomain
  customDomain?: string // If domain === 'custom'
  status: HabitStatus

  // Behavior
  anchor: HabitAnchor
  recipe: HabitRecipe
  schedule: HabitSchedule
  safetyNet: SafetyNet

  // Integration
  calendarProjection?: CalendarProjection
  linkedInterventionTypes?: string[] // Mind intervention types that count
  linkedIncantationIds?: IncantationId[] // Incantations to show for this habit

  // Metadata
  createdAtMs: number
  updatedAtMs: number

  // Sync
  syncState: SyncState
  version: number
}

// ----- Habit Check-in -----

export interface CanonicalHabitCheckin {
  checkinId: CheckinId
  userId: string
  habitId: HabitId

  dateKey: string // YYYY-MM-DD in user timezone
  status: CheckinStatus

  // Optional context
  moodBefore?: number // 1-5 scale
  moodAfter?: number // 1-5 scale
  note?: string

  // Tracking
  checkedInAtMs: number

  // Link to source (if auto-created)
  sourceType?: 'manual' | 'intervention' | 'calendar'
  sourceId?: string // interventionSessionId, calendarEventId, etc.

  // Sync
  syncState: SyncState
  version: number
}

// ----- Progress Stats (Computed) -----

export interface HabitProgressStats {
  habitId?: HabitId
  currentStreak: number
  bestStreak: number
  totalCheckins: number
  doneCount: number
  tinyCount: number
  skipCount: number
  completionRate: number // (done + tiny) / total checkins
}

// ----- Create/Update Types -----

export type CreateHabitInput = Omit<
  CanonicalHabit,
  'habitId' | 'createdAtMs' | 'updatedAtMs' | 'syncState' | 'version'
>

export type UpdateHabitInput = Partial<Omit<CanonicalHabit, 'habitId' | 'userId' | 'createdAtMs'>>

export type CreateCheckinInput = Omit<
  CanonicalHabitCheckin,
  'checkinId' | 'checkedInAtMs' | 'syncState' | 'version'
>

export type UpdateCheckinInput = Partial<
  Omit<CanonicalHabitCheckin, 'checkinId' | 'userId' | 'habitId' | 'dateKey'>
>

// Alias for compatibility with existing code
export type UpsertCheckinInput = CreateCheckinInput

// ----- Incantations -----

export type IncantationType = 'identity_action' | 'values' | 'self_compassion'

export interface CanonicalIncantation {
  incantationId: IncantationId
  userId: string

  type: IncantationType
  text: string
  domains?: HabitDomain[] // Which habit domains this applies to
  active: boolean

  // Metadata
  createdAtMs: number
  updatedAtMs: number

  // Sync
  syncState: SyncState
  version: number
}

export type CreateIncantationInput = Omit<
  CanonicalIncantation,
  'incantationId' | 'createdAtMs' | 'updatedAtMs' | 'syncState' | 'version'
>

export type UpdateIncantationInput = Partial<
  Omit<CanonicalIncantation, 'incantationId' | 'userId' | 'createdAtMs'>
>
