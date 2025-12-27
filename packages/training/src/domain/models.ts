import type { Id } from '@lifeos/core'

// ----- IDs -----

export type ExerciseId = Id<'exercise'>
export type TemplateId = Id<'template'>
export type PlanId = Id<'plan'>
export type SessionId = Id<'session'>

// ----- Sync State -----

export type SyncState = 'synced' | 'pending' | 'conflict'

// ----- Enums -----

export type ExerciseCategory =
  | 'push'
  | 'pull'
  | 'legs'
  | 'core'
  | 'conditioning'
  | 'mobility'
  | 'other'
export type WorkoutContext = 'gym' | 'home' | 'road'
export type SessionStatus = 'planned' | 'in_progress' | 'completed' | 'skipped'

// ----- Exercise Library -----

export interface ExerciseLibraryItem {
  exerciseId: ExerciseId
  userId: string

  name: string
  category?: ExerciseCategory
  equipment?: string[] // ["barbell", "bench"]
  defaultMetrics: Array<'sets_reps_weight' | 'time' | 'distance' | 'reps_only' | 'rpe'>

  archived: boolean
  createdAtMs: number
  updatedAtMs: number

  syncState: SyncState
  version: number
}

// ----- Workout Templates -----

export type TargetType =
  | {
      type: 'sets_reps'
      sets: number
      reps: number | { min: number; max: number }
      weightKg?: number
    }
  | { type: 'time'; seconds: number }
  | { type: 'distance'; meters: number }
  | { type: 'reps'; reps: number }
  | { type: 'rpe'; rpe: number }

export interface WorkoutTemplateItem {
  exerciseId: ExerciseId
  displayName?: string // Optional override
  target: TargetType
  notes?: string
}

export interface WorkoutTemplate {
  templateId: TemplateId
  userId: string

  title: string
  context: WorkoutContext
  items: WorkoutTemplateItem[]

  createdAtMs: number
  updatedAtMs: number

  syncState: SyncState
  version: number
}

// ----- Workout Plans -----

export interface WorkoutDaySchedule {
  dayOfWeek: number // 0-6
  variants: {
    gymTemplateId?: TemplateId
    homeTemplateId?: TemplateId
    roadTemplateId?: TemplateId
  }
  defaultContext?: WorkoutContext
  restDay?: boolean
}

export interface WorkoutPlan {
  planId: PlanId
  userId: string

  active: boolean
  timezone: string
  startDateKey: string // YYYY-MM-DD
  schedule: WorkoutDaySchedule[] // 7 entries typical

  createdAtMs: number
  updatedAtMs: number

  syncState: SyncState
  version: number
}

// ----- Workout Sessions -----

export interface SetPerformance {
  setIndex: number
  reps?: number
  weightKg?: number
  rpe?: number // Rate of Perceived Exertion (1-10)
  isWarmup?: boolean
}

export interface ExercisePerformance {
  exerciseId: ExerciseId
  displayName?: string
  sets?: SetPerformance[]
  metrics?: {
    timeSec?: number
    distanceM?: number
    reps?: number
    rpe?: number
  }
  notes?: string
}

export interface WorkoutSession {
  sessionId: SessionId
  userId: string

  dateKey: string // YYYY-MM-DD
  context: WorkoutContext
  templateId?: TemplateId // If started from template
  title?: string
  status: SessionStatus

  startedAtMs?: number
  completedAtMs?: number
  durationSec?: number

  items: ExercisePerformance[]
  notes?: string

  createdAtMs: number
  updatedAtMs: number

  syncState: SyncState
  version: number
}

// ----- Create/Update Types -----

export type CreateExerciseInput = Omit<
  ExerciseLibraryItem,
  'exerciseId' | 'createdAtMs' | 'updatedAtMs' | 'syncState' | 'version'
>

export type UpdateExerciseInput = Partial<
  Omit<ExerciseLibraryItem, 'exerciseId' | 'userId' | 'createdAtMs'>
>

export type CreateTemplateInput = Omit<
  WorkoutTemplate,
  'templateId' | 'createdAtMs' | 'updatedAtMs' | 'syncState' | 'version'
>

export type UpdateTemplateInput = Partial<
  Omit<WorkoutTemplate, 'templateId' | 'userId' | 'createdAtMs'>
>

export type CreatePlanInput = Omit<
  WorkoutPlan,
  'planId' | 'createdAtMs' | 'updatedAtMs' | 'syncState' | 'version'
>

export type UpdatePlanInput = Partial<Omit<WorkoutPlan, 'planId' | 'userId' | 'createdAtMs'>>

export type CreateSessionInput = Omit<
  WorkoutSession,
  'sessionId' | 'createdAtMs' | 'updatedAtMs' | 'syncState' | 'version'
>

export type UpdateSessionInput = Partial<
  Omit<WorkoutSession, 'sessionId' | 'userId' | 'createdAtMs'>
>
