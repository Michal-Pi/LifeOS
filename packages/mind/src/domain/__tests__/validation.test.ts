import { describe, it, expect } from 'vitest'
import {
  validateInterventionPreset,
  validateInterventionStep,
  validateInterventionSession,
  validateCreateSessionInput,
  isValidFeelingState,
  isValidInterventionType,
} from '../validation'
import type {
  CanonicalInterventionPreset,
  CanonicalInterventionSession,
  CreateSessionInput,
  InterventionStep,
} from '../models'
import { asId } from '@lifeos/core'

describe('validateInterventionPreset', () => {
  it('validates a valid intervention preset', () => {
    const preset: CanonicalInterventionPreset = {
      interventionId: asId('intervention:test-1'),
      userId: 'user-1',
      type: 'physiological_sigh',
      title: 'Test Intervention',
      description: 'A test intervention for validation',
      steps: [
        {
          kind: 'text',
          content: 'Take a deep breath',
          durationSec: 5,
        },
      ],
      defaultDurationSec: 60,
      tags: ['test'],
      recommendedForFeelings: ['anxious'],
      createdAtMs: Date.now(),
      updatedAtMs: Date.now(),
      syncState: 'synced',
      version: 1,
    }

    const result = validateInterventionPreset(preset)
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('rejects preset with missing required fields', () => {
    const preset = {
      userId: 'user-1',
      type: 'physiological_sigh',
      steps: [],
      defaultDurationSec: 60,
      tags: [],
      recommendedForFeelings: [],
      createdAtMs: Date.now(),
      updatedAtMs: Date.now(),
      syncState: 'synced',
      version: 1,
    } as any

    const result = validateInterventionPreset(preset)
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('Intervention ID is required')
    expect(result.errors).toContain('Intervention title is required')
    expect(result.errors).toContain('Intervention description is required')
  })

  it('rejects preset with empty steps array', () => {
    const preset: CanonicalInterventionPreset = {
      interventionId: asId('intervention:test-2'),
      userId: 'user-1',
      type: 'box_breathing',
      title: 'Test',
      description: 'Test description',
      steps: [],
      defaultDurationSec: 60,
      tags: [],
      recommendedForFeelings: [],
      createdAtMs: Date.now(),
      updatedAtMs: Date.now(),
      syncState: 'synced',
      version: 1,
    }

    const result = validateInterventionPreset(preset)
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('Intervention must have at least one step')
  })

  it('rejects preset with invalid duration', () => {
    const preset: CanonicalInterventionPreset = {
      interventionId: asId('intervention:test-3'),
      userId: 'user-1',
      type: 'body_scan',
      title: 'Test',
      description: 'Test description',
      steps: [{ kind: 'text', content: 'Test' }],
      defaultDurationSec: -10,
      tags: [],
      recommendedForFeelings: [],
      createdAtMs: Date.now(),
      updatedAtMs: Date.now(),
      syncState: 'synced',
      version: 1,
    }

    const result = validateInterventionPreset(preset)
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('Default duration must be positive')
  })
})

describe('validateInterventionStep', () => {
  it('validates text step', () => {
    const step: InterventionStep = {
      kind: 'text',
      content: 'This is a valid text step',
      durationSec: 10,
    }

    const result = validateInterventionStep(step)
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('rejects text step with empty content', () => {
    const step: InterventionStep = {
      kind: 'text',
      content: '',
    }

    const result = validateInterventionStep(step)
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('Text step content is required')
  })

  it('validates timer step', () => {
    const step: InterventionStep = {
      kind: 'timer',
      instruction: 'Breathe deeply',
      durationSec: 60,
      showProgress: true,
    }

    const result = validateInterventionStep(step)
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('rejects timer step without duration', () => {
    const step = {
      kind: 'timer',
      instruction: 'Breathe',
      showProgress: true,
    } as any

    const result = validateInterventionStep(step)
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('Timer step duration is required and must be positive')
  })

  it('validates choice step', () => {
    const step: InterventionStep = {
      kind: 'choice',
      question: 'How do you feel?',
      options: ['Good', 'Neutral', 'Bad'],
      allowMultiple: false,
    }

    const result = validateInterventionStep(step)
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('rejects choice step with no options', () => {
    const step: InterventionStep = {
      kind: 'choice',
      question: 'How do you feel?',
      options: [],
    }

    const result = validateInterventionStep(step)
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('Choice step must have at least one option')
  })

  it('validates input step', () => {
    const step: InterventionStep = {
      kind: 'input',
      prompt: 'What are you thinking?',
      placeholder: 'Type here...',
      multiline: true,
    }

    const result = validateInterventionStep(step)
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('rejects input step with empty prompt', () => {
    const step: InterventionStep = {
      kind: 'input',
      prompt: '',
    }

    const result = validateInterventionStep(step)
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('Input step prompt is required')
  })
})

describe('validateInterventionSession', () => {
  it('validates a valid session', () => {
    const session: CanonicalInterventionSession = {
      sessionId: asId('session:test-1'),
      userId: 'user-1',
      interventionId: asId('intervention:test-1'),
      dateKey: '2025-12-27',
      trigger: 'manual',
      feelingBefore: 'anxious',
      startedAtMs: Date.now(),
      syncState: 'synced',
      version: 1,
    }

    const result = validateInterventionSession(session)
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('rejects session with invalid date key', () => {
    const session: CanonicalInterventionSession = {
      sessionId: asId('session:test-2'),
      userId: 'user-1',
      interventionId: asId('intervention:test-1'),
      dateKey: '2025/12/27', // Invalid format
      trigger: 'manual',
      startedAtMs: Date.now(),
      syncState: 'synced',
      version: 1,
    }

    const result = validateInterventionSession(session)
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('Date key must be in YYYY-MM-DD format')
  })

  it('rejects session with completedAt before startedAt', () => {
    const now = Date.now()
    const session: CanonicalInterventionSession = {
      sessionId: asId('session:test-3'),
      userId: 'user-1',
      interventionId: asId('intervention:test-1'),
      dateKey: '2025-12-27',
      trigger: 'manual',
      startedAtMs: now,
      completedAtMs: now - 1000, // Before started
      syncState: 'synced',
      version: 1,
    }

    const result = validateInterventionSession(session)
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('Completed timestamp cannot be before started timestamp')
  })
})

describe('validateCreateSessionInput', () => {
  it('validates valid create session input', () => {
    const input: CreateSessionInput = {
      userId: 'user-1',
      interventionId: asId('intervention:test-1'),
      dateKey: '2025-12-27',
      trigger: 'today_prompt',
      feelingBefore: 'overwhelmed',
    }

    const result = validateCreateSessionInput(input)
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('rejects input with missing required fields', () => {
    const input = {
      dateKey: '2025-12-27',
    } as any

    const result = validateCreateSessionInput(input)
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('User ID is required')
    expect(result.errors).toContain('Intervention ID is required')
    expect(result.errors).toContain('Trigger is required')
  })
})

describe('Helper validators', () => {
  it('validates feeling states', () => {
    expect(isValidFeelingState('anxious')).toBe(true)
    expect(isValidFeelingState('overwhelmed')).toBe(true)
    expect(isValidFeelingState('neutral')).toBe(true)
    expect(isValidFeelingState('invalid')).toBe(false)
  })

  it('validates intervention types', () => {
    expect(isValidInterventionType('physiological_sigh')).toBe(true)
    expect(isValidInterventionType('box_breathing')).toBe(true)
    expect(isValidInterventionType('cbt_thought_record')).toBe(true)
    expect(isValidInterventionType('invalid_type')).toBe(false)
  })
})
