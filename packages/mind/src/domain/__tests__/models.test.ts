import { describe, it, expect } from 'vitest'
import type {
  CanonicalInterventionPreset,
  CanonicalInterventionSession,
  InterventionType,
  InterventionStep,
  TextStep,
  TimerStep,
  ChoiceStep,
  InputStep,
  FeelingState,
} from '../models'

describe('CanonicalInterventionPreset', () => {
  it('creates a valid intervention preset', () => {
    const textStep: TextStep = {
      kind: 'text',
      content: 'Take a deep breath',
      durationSec: 5,
    }

    const timerStep: TimerStep = {
      kind: 'timer',
      durationSec: 60,
      instruction: 'Continue breathing deeply',
      showProgress: true,
    }

    const preset: CanonicalInterventionPreset = {
      interventionId: 'intervention:123' as any,
      userId: 'user-1',
      type: 'physiological_sigh',
      title: 'Quick Calm',
      description: 'Rapid stress reduction technique',
      steps: [textStep, timerStep],
      defaultDurationSec: 120,
      tags: ['stress', 'quick'],
      recommendedForFeelings: ['anxious'],
      createdAtMs: Date.now(),
      updatedAtMs: Date.now(),
      syncState: 'synced',
      version: 1,
    }

    expect(preset.type).toBe('physiological_sigh')
    expect(preset.steps).toHaveLength(2)
    expect(preset.steps[0].kind).toBe('text')
    expect(preset.steps[1].kind).toBe('timer')
  })

  it('supports all intervention types', () => {
    const types: InterventionType[] = [
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

    types.forEach((type) => {
      expect(type).toBeDefined()
    })
  })

  it('creates intervention with choice step', () => {
    const choiceStep: ChoiceStep = {
      kind: 'choice',
      question: 'How do you feel?',
      options: ['Calm', 'Neutral', 'Stressed'],
    }

    const preset: CanonicalInterventionPreset = {
      interventionId: 'intervention:456' as any,
      userId: 'user-1',
      type: 'cbt_thought_record',
      title: 'Thought Record',
      description: 'Track and challenge thoughts',
      steps: [choiceStep],
      defaultDurationSec: 300,
      tags: ['cbt', 'thoughts'],
      recommendedForFeelings: ['anxious'],
      createdAtMs: Date.now(),
      updatedAtMs: Date.now(),
      syncState: 'synced',
      version: 1,
    }

    expect(preset.steps[0].kind).toBe('choice')
    expect((preset.steps[0] as ChoiceStep).options).toHaveLength(3)
  })

  it('creates intervention with input step', () => {
    const inputStep: InputStep = {
      kind: 'input',
      prompt: 'What are you thinking?',
      placeholder: 'Describe your thought...',
    }

    const preset: CanonicalInterventionPreset = {
      interventionId: 'intervention:789' as any,
      userId: 'user-1',
      type: 'custom',
      title: 'Journaling',
      description: 'Free-form reflection',
      steps: [inputStep],
      defaultDurationSec: 600,
      tags: ['journaling'],
      recommendedForFeelings: ['neutral'],
      createdAtMs: Date.now(),
      updatedAtMs: Date.now(),
      syncState: 'synced',
      version: 1,
    }

    expect(preset.steps[0].kind).toBe('input')
    expect((preset.steps[0] as InputStep).prompt).toBe('What are you thinking?')
  })
})

describe('CanonicalInterventionSession', () => {
  it('creates a valid intervention session', () => {
    const session: CanonicalInterventionSession = {
      sessionId: 'session:123' as any,
      userId: 'user-1',
      interventionId: 'intervention:456' as any,
      dateKey: '2025-12-27',
      trigger: 'manual',
      feelingBefore: 'anxious',
      feelingAfter: 'neutral',
      startedAtMs: Date.now(),
      completedAtMs: Date.now() + 120000,
      durationSec: 120,
      syncState: 'synced',
      version: 1,
    }

    expect(session.trigger).toBe('manual')
    expect(session.feelingBefore).toBe('anxious')
    expect(session.feelingAfter).toBe('neutral')
    expect(session.durationSec).toBe(120)
  })

  it('supports all trigger types', () => {
    const triggers: Array<'manual' | 'calendar_alert' | 'today_prompt'> = [
      'manual',
      'calendar_alert',
      'today_prompt',
    ]

    triggers.forEach((trigger) => {
      expect(trigger).toBeDefined()
    })
  })

  it('supports session with responses', () => {
    const session: CanonicalInterventionSession = {
      sessionId: 'session:456' as any,
      userId: 'user-1',
      interventionId: 'intervention:123' as any,
      dateKey: '2025-12-27',
      trigger: 'today_prompt',
      feelingBefore: 'anxious',
      responses: {
        step1: 'I am worried about the presentation',
        step2: 'Neutral',
      },
      startedAtMs: Date.now(),
      completedAtMs: Date.now() + 300000,
      durationSec: 300,
      syncState: 'synced',
      version: 1,
    }

    expect(session.responses).toBeDefined()
    expect(session.responses?.step1).toBe('I am worried about the presentation')
  })

  it('supports session with linked habit check-ins', () => {
    const session: CanonicalInterventionSession = {
      sessionId: 'session:789' as any,
      userId: 'user-1',
      interventionId: 'intervention:123' as any,
      dateKey: '2025-12-27',
      trigger: 'manual',
      linkedHabitCheckinIds: ['checkin:habit:1_2025-12-27', 'checkin:habit:2_2025-12-27'],
      startedAtMs: Date.now(),
      completedAtMs: Date.now() + 60000,
      durationSec: 60,
      syncState: 'synced',
      version: 1,
    }

    expect(session.linkedHabitCheckinIds).toHaveLength(2)
    expect(session.linkedHabitCheckinIds?.[0]).toBe('checkin:habit:1_2025-12-27')
  })

  it('supports session with created todo', () => {
    const session: CanonicalInterventionSession = {
      sessionId: 'session:abc' as any,
      userId: 'user-1',
      interventionId: 'intervention:123' as any,
      dateKey: '2025-12-27',
      trigger: 'manual',
      feelingBefore: 'overwhelmed',
      feelingAfter: 'restless',
      createdTodoId: 'todo:xyz',
      startedAtMs: Date.now(),
      completedAtMs: Date.now() + 180000,
      durationSec: 180,
      syncState: 'synced',
      version: 1,
    }

    expect(session.createdTodoId).toBe('todo:xyz')
  })

  it('supports all feeling states', () => {
    const feelings: FeelingState[] = [
      'anxious',
      'overwhelmed',
      'angry',
      'avoidant',
      'restless',
      'tired',
      'neutral',
    ]

    feelings.forEach((feeling) => {
      expect(feeling).toBeDefined()
    })
  })
})

describe('Step Types', () => {
  it('creates all step types correctly', () => {
    const textStep: TextStep = {
      kind: 'text',
      content: 'Instructions',
      durationSec: 10,
    }

    const timerStep: TimerStep = {
      kind: 'timer',
      durationSec: 60,
      instruction: 'Breathe',
      showProgress: true,
    }

    const choiceStep: ChoiceStep = {
      kind: 'choice',
      question: 'How do you feel?',
      options: ['Good', 'Neutral', 'Bad'],
    }

    const inputStep: InputStep = {
      kind: 'input',
      prompt: 'Write your thought',
      placeholder: 'Enter here...',
    }

    const steps: InterventionStep[] = [textStep, timerStep, choiceStep, inputStep]

    expect(steps).toHaveLength(4)
    expect(steps[0].kind).toBe('text')
    expect(steps[1].kind).toBe('timer')
    expect(steps[2].kind).toBe('choice')
    expect(steps[3].kind).toBe('input')
  })
})
