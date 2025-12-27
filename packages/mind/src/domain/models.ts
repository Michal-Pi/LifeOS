import type { Id } from '@lifeos/core'

// ----- IDs -----

export type InterventionId = Id<'intervention'>
export type SessionId = Id<'session'>

// ----- Sync State -----

export type SyncState = 'synced' | 'pending' | 'conflict'

// ----- Intervention Types -----

export type InterventionType =
  | 'physiological_sigh'
  | 'box_breathing'
  | 'body_scan'
  | 'cbt_thought_record'
  | 'cbt_likely_outcome'
  | 'act_defusion'
  | 'act_values_action'
  | 'gestalt_now'
  | 'loving_kindness'
  | 'custom'

// ----- Feeling States -----

export type FeelingState =
  | 'anxious'
  | 'overwhelmed'
  | 'angry'
  | 'avoidant'
  | 'restless'
  | 'tired'
  | 'neutral'

// ----- Intervention Step Types -----

export interface TextStep {
  kind: 'text'
  content: string
  durationSec?: number
}

export interface TimerStep {
  kind: 'timer'
  instruction: string
  durationSec: number
  showProgress: boolean
}

export interface ChoiceStep {
  kind: 'choice'
  question: string
  options: string[]
  allowMultiple?: boolean
}

export interface InputStep {
  kind: 'input'
  prompt: string
  placeholder?: string
  multiline?: boolean
}

export type InterventionStep = TextStep | TimerStep | ChoiceStep | InputStep

// ----- Intervention Preset -----

export interface CanonicalInterventionPreset {
  interventionId: InterventionId
  userId: string // User-specific or 'system' for defaults

  type: InterventionType
  title: string
  description: string

  steps: InterventionStep[]

  // Metadata
  defaultDurationSec: number
  tags: string[]
  recommendedForFeelings: FeelingState[]

  createdAtMs: number
  updatedAtMs: number

  syncState: SyncState
  version: number
}

// ----- Intervention Session (Log) -----

export interface CanonicalInterventionSession {
  sessionId: SessionId
  userId: string
  interventionId: InterventionId

  dateKey: string // YYYY-MM-DD
  trigger: 'manual' | 'calendar_alert' | 'today_prompt'

  // Context
  feelingBefore?: FeelingState
  feelingAfter?: FeelingState

  // Responses (if intervention has input steps)
  responses?: Record<string, unknown>

  // Outcomes
  createdTodoId?: string // If user created next action
  linkedHabitCheckinIds?: string[] // If auto-created habit check-ins

  // Timing
  startedAtMs: number
  completedAtMs?: number
  durationSec?: number

  // Sync
  syncState: SyncState
  version: number
}

// ----- Create/Update Types -----

export type CreateInterventionInput = Omit<
  CanonicalInterventionPreset,
  'interventionId' | 'createdAtMs' | 'updatedAtMs' | 'syncState' | 'version'
>

export type UpdateInterventionInput = Partial<
  Omit<CanonicalInterventionPreset, 'interventionId' | 'userId' | 'createdAtMs'>
>

export type CreateSessionInput = Omit<
  CanonicalInterventionSession,
  'sessionId' | 'startedAtMs' | 'syncState' | 'version'
>

export type CompleteSessionInput = {
  sessionId: SessionId
  feelingAfter?: FeelingState
  responses?: Record<string, unknown>
  createdTodoId?: string
  linkedHabitCheckinIds?: string[]
}
