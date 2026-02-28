import type {
  CanonicalInterventionPreset,
  CanonicalInterventionSession,
  CreateInterventionInput,
  CreateSessionInput,
  CompleteSessionInput,
  InterventionStep,
  FeelingState,
  InterventionType,
} from './models'

// ----- Validation Result -----

export interface ValidationResult {
  valid: boolean
  errors: string[]
}

// ----- Intervention Preset Validation -----

export function validateInterventionPreset(preset: CanonicalInterventionPreset): ValidationResult {
  const errors: string[] = []

  if (!preset.interventionId) {
    errors.push('Intervention ID is required')
  }

  if (!preset.userId) {
    errors.push('User ID is required')
  }

  if (!preset.title || preset.title.trim().length === 0) {
    errors.push('Intervention title is required')
  }

  if (preset.title && preset.title.length > 200) {
    errors.push('Intervention title must be less than 200 characters')
  }

  if (!preset.description || preset.description.trim().length === 0) {
    errors.push('Intervention description is required')
  }

  if (preset.description && preset.description.length > 1000) {
    errors.push('Intervention description must be less than 1000 characters')
  }

  if (!preset.type) {
    errors.push('Intervention type is required')
  }

  if (!preset.steps || preset.steps.length === 0) {
    errors.push('Intervention must have at least one step')
  }

  if (preset.steps && preset.steps.length > 20) {
    errors.push('Intervention cannot have more than 20 steps')
  }

  // Validate each step
  if (preset.steps) {
    preset.steps.forEach((step, index) => {
      const stepErrors = validateInterventionStep(step)
      if (!stepErrors.valid) {
        stepErrors.errors.forEach((err) => {
          errors.push(`Step ${index + 1}: ${err}`)
        })
      }
    })
  }

  if (preset.defaultDurationSec <= 0) {
    errors.push('Default duration must be positive')
  }

  if (preset.defaultDurationSec > 3600) {
    errors.push('Default duration cannot exceed 1 hour (3600 seconds)')
  }

  if (preset.createdAtMs <= 0) {
    errors.push('Created timestamp must be positive')
  }

  if (preset.updatedAtMs <= 0) {
    errors.push('Updated timestamp must be positive')
  }

  if (preset.updatedAtMs < preset.createdAtMs) {
    errors.push('Updated timestamp cannot be before created timestamp')
  }

  if (preset.version < 0) {
    errors.push('Version must be non-negative')
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

export function validateCreateInterventionInput(input: CreateInterventionInput): ValidationResult {
  const errors: string[] = []

  if (!input.userId) {
    errors.push('User ID is required')
  }

  if (!input.title || input.title.trim().length === 0) {
    errors.push('Intervention title is required')
  }

  if (input.title && input.title.length > 200) {
    errors.push('Intervention title must be less than 200 characters')
  }

  if (!input.description || input.description.trim().length === 0) {
    errors.push('Intervention description is required')
  }

  if (input.description && input.description.length > 1000) {
    errors.push('Intervention description must be less than 1000 characters')
  }

  if (!input.type) {
    errors.push('Intervention type is required')
  }

  if (!input.steps || input.steps.length === 0) {
    errors.push('Intervention must have at least one step')
  }

  if (input.steps && input.steps.length > 20) {
    errors.push('Intervention cannot have more than 20 steps')
  }

  // Validate each step
  if (input.steps) {
    input.steps.forEach((step, index) => {
      const stepErrors = validateInterventionStep(step)
      if (!stepErrors.valid) {
        stepErrors.errors.forEach((err) => {
          errors.push(`Step ${index + 1}: ${err}`)
        })
      }
    })
  }

  if (input.defaultDurationSec <= 0) {
    errors.push('Default duration must be positive')
  }

  if (input.defaultDurationSec > 3600) {
    errors.push('Default duration cannot exceed 1 hour (3600 seconds)')
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

// ----- Intervention Step Validation -----

export function validateInterventionStep(step: InterventionStep): ValidationResult {
  const errors: string[] = []

  if (!step.kind) {
    errors.push('Step kind is required')
  }

  switch (step.kind) {
    case 'text':
      if (!step.content || step.content.trim().length === 0) {
        errors.push('Text step content is required')
      }
      if (step.content && step.content.length > 2000) {
        errors.push('Text step content must be less than 2000 characters')
      }
      if (step.durationSec !== undefined && step.durationSec < 0) {
        errors.push('Text step duration must be non-negative')
      }
      break

    case 'timer':
      if (!step.instruction || step.instruction.trim().length === 0) {
        errors.push('Timer step instruction is required')
      }
      if (step.instruction && step.instruction.length > 2000) {
        errors.push('Timer step instruction must be less than 2000 characters')
      }
      if (!step.durationSec || step.durationSec <= 0) {
        errors.push('Timer step duration is required and must be positive')
      }
      if (step.durationSec && step.durationSec > 600) {
        errors.push('Timer step duration cannot exceed 10 minutes (600 seconds)')
      }
      if (step.showProgress === undefined) {
        errors.push('Timer step showProgress is required')
      }
      break

    case 'choice':
      if (!step.question || step.question.trim().length === 0) {
        errors.push('Choice step question is required')
      }
      if (step.question && step.question.length > 500) {
        errors.push('Choice step question must be less than 500 characters')
      }
      if (!step.options || step.options.length === 0) {
        errors.push('Choice step must have at least one option')
      }
      if (step.options && step.options.length > 10) {
        errors.push('Choice step cannot have more than 10 options')
      }
      if (step.options) {
        step.options.forEach((option, index) => {
          if (!option || option.trim().length === 0) {
            errors.push(`Choice option ${index + 1} cannot be empty`)
          }
          if (option && option.length > 200) {
            errors.push(`Choice option ${index + 1} must be less than 200 characters`)
          }
        })
      }
      break

    case 'input':
      if (!step.prompt || step.prompt.trim().length === 0) {
        errors.push('Input step prompt is required')
      }
      if (step.prompt && step.prompt.length > 500) {
        errors.push('Input step prompt must be less than 500 characters')
      }
      if (step.placeholder && step.placeholder.length > 200) {
        errors.push('Input step placeholder must be less than 200 characters')
      }
      break

    default:
      errors.push(`Unknown step kind: ${(step as Record<string, unknown>).kind}`)
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

// ----- Intervention Session Validation -----

export function validateInterventionSession(
  session: CanonicalInterventionSession
): ValidationResult {
  const errors: string[] = []

  if (!session.sessionId) {
    errors.push('Session ID is required')
  }

  if (!session.userId) {
    errors.push('User ID is required')
  }

  if (!session.interventionId) {
    errors.push('Intervention ID is required')
  }

  if (!session.dateKey) {
    errors.push('Date key is required')
  }

  // Validate dateKey format (YYYY-MM-DD)
  if (session.dateKey && !/^\d{4}-\d{2}-\d{2}$/.test(session.dateKey)) {
    errors.push('Date key must be in YYYY-MM-DD format')
  }

  if (!session.trigger) {
    errors.push('Trigger is required')
  }

  if (session.startedAtMs <= 0) {
    errors.push('Started timestamp must be positive')
  }

  if (session.completedAtMs !== undefined) {
    if (session.completedAtMs <= 0) {
      errors.push('Completed timestamp must be positive')
    }
    if (session.completedAtMs < session.startedAtMs) {
      errors.push('Completed timestamp cannot be before started timestamp')
    }
  }

  if (session.durationSec !== undefined && session.durationSec < 0) {
    errors.push('Duration must be non-negative')
  }

  if (session.version < 0) {
    errors.push('Version must be non-negative')
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

export function validateCreateSessionInput(input: CreateSessionInput): ValidationResult {
  const errors: string[] = []

  if (!input.userId) {
    errors.push('User ID is required')
  }

  if (!input.interventionId) {
    errors.push('Intervention ID is required')
  }

  if (!input.dateKey) {
    errors.push('Date key is required')
  }

  // Validate dateKey format (YYYY-MM-DD)
  if (input.dateKey && !/^\d{4}-\d{2}-\d{2}$/.test(input.dateKey)) {
    errors.push('Date key must be in YYYY-MM-DD format')
  }

  if (!input.trigger) {
    errors.push('Trigger is required')
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

export function validateCompleteSessionInput(input: CompleteSessionInput): ValidationResult {
  const errors: string[] = []

  if (!input.sessionId) {
    errors.push('Session ID is required')
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

// ----- Helper Validators -----

const VALID_FEELING_STATES: FeelingState[] = [
  'anxious',
  'overwhelmed',
  'angry',
  'avoidant',
  'restless',
  'tired',
  'neutral',
]

export function isValidFeelingState(feeling: string): feeling is FeelingState {
  return VALID_FEELING_STATES.includes(feeling as FeelingState)
}

const VALID_INTERVENTION_TYPES: InterventionType[] = [
  'physiological_sigh',
  'box_breathing',
  'body_scan',
  'cbt_thought_record',
  'cbt_likely_outcome',
  'act_defusion',
  'act_values_action',
  'gestalt_now',
  'loving_kindness',
  'custom',
]

export function isValidInterventionType(type: string): type is InterventionType {
  return VALID_INTERVENTION_TYPES.includes(type as InterventionType)
}
