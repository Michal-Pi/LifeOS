# Phase 4: Mind Engine - Detailed Implementation Plan
**Version:** 1.0
**Created:** 2025-12-27
**Duration:** 7-10 days
**Prerequisites:** Phase 3 complete (Habits integrated into Today page)

## Overview

Phase 4 implements the Mind Engine - a system for quick psychological interventions based on CBT, ACT, physiological regulation, and Gestalt-inspired techniques. The goal is to provide sub-60-second tools for managing stress, anxiety, and overwhelm.

### Key Features
1. Pre-built intervention presets (breathing, CBT, ACT, Gestalt)
2. "I'm Activated" button in Today page (Work Module)
3. Intervention session logging with feeling before/after
4. Auto-linking to meditation/mindfulness habits
5. Optional task creation from interventions
6. Integration with journal notes for reflection

---

## Table of Contents
1. [Domain Package Implementation](#domain-package-implementation)
2. [System Intervention Presets](#system-intervention-presets)
3. [Firestore Adapters](#firestore-adapters)
4. [Hooks Implementation](#hooks-implementation)
5. [UI Components](#ui-components)
6. [Integration Points](#integration-points)
7. [Testing](#testing)
8. [Acceptance Criteria](#acceptance-criteria)

---

## Domain Package Implementation

### 4.1 Mind Package Structure

```
packages/mind/
├── src/
│   ├── domain/
│   │   ├── models.ts              # Types (from Phase 1)
│   │   ├── presets.ts             # Built-in intervention definitions
│   │   ├── validation.ts          # Zod schemas
│   │   └── __tests__/
│   │       ├── models.test.ts
│   │       └── presets.test.ts
│   ├── ports/
│   │   ├── interventionRepository.ts
│   │   └── sessionRepository.ts
│   ├── usecases/
│   │   ├── interventionUsecases.ts
│   │   ├── sessionUsecases.ts
│   │   └── __tests__/
│   └── index.ts
├── package.json
├── tsconfig.json
├── tsup.config.ts
└── vitest.config.ts
```

### 4.2 Domain Models (Extended)

Already defined in main plan. Key types:
- `CanonicalInterventionPreset`
- `CanonicalInterventionSession`
- `InterventionStep` (Text, Timer, Choice, Input)
- `FeelingState` enum
- `InterventionType` enum

### 4.3 Validation Schemas

#### `packages/mind/src/domain/validation.ts`

```typescript
import { z } from 'zod'

export const FeelingStateSchema = z.enum([
  'anxious',
  'overwhelmed',
  'angry',
  'avoidant',
  'restless',
  'tired',
  'neutral'
])

export const InterventionTypeSchema = z.enum([
  'physiological_sigh',
  'box_breathing',
  'body_scan',
  'cbt_thought_record',
  'cbt_likely_outcome',
  'act_defusion',
  'act_values_action',
  'gestalt_now',
  'loving_kindness',
  'custom'
])

export const TextStepSchema = z.object({
  kind: z.literal('text'),
  content: z.string(),
  durationSec: z.number().optional()
})

export const TimerStepSchema = z.object({
  kind: z.literal('timer'),
  instruction: z.string(),
  durationSec: z.number().min(1).max(300),
  showProgress: z.boolean()
})

export const ChoiceStepSchema = z.object({
  kind: z.literal('choice'),
  question: z.string(),
  options: z.array(z.string()).min(2).max(6),
  allowMultiple: z.boolean().optional()
})

export const InputStepSchema = z.object({
  kind: z.literal('input'),
  prompt: z.string(),
  placeholder: z.string().optional(),
  multiline: z.boolean().optional()
})

export const InterventionStepSchema = z.discriminatedUnion('kind', [
  TextStepSchema,
  TimerStepSchema,
  ChoiceStepSchema,
  InputStepSchema
])

export const InterventionPresetSchema = z.object({
  interventionId: z.string(),
  userId: z.string(),
  type: InterventionTypeSchema,
  title: z.string().min(1).max(100),
  description: z.string().max(500),
  steps: z.array(InterventionStepSchema).min(1).max(10),
  defaultDurationSec: z.number().min(10).max(300),
  tags: z.array(z.string()),
  recommendedForFeelings: z.array(FeelingStateSchema),
  createdAtMs: z.number(),
  updatedAtMs: z.number(),
  syncState: z.enum(['synced', 'pending', 'conflict']),
  version: z.number()
})

export const InterventionSessionSchema = z.object({
  sessionId: z.string(),
  userId: z.string(),
  interventionId: z.string(),
  dateKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  trigger: z.enum(['manual', 'calendar_alert', 'today_prompt']),
  feelingBefore: FeelingStateSchema.optional(),
  feelingAfter: FeelingStateSchema.optional(),
  responses: z.record(z.unknown()).optional(),
  createdTodoId: z.string().optional(),
  linkedHabitCheckinIds: z.array(z.string()).optional(),
  startedAtMs: z.number(),
  completedAtMs: z.number().optional(),
  durationSec: z.number().optional(),
  syncState: z.enum(['synced', 'pending', 'conflict']),
  version: z.number()
})
```

---

## System Intervention Presets

### 4.4 Built-in Interventions

#### `packages/mind/src/domain/presets.ts`

```typescript
import type { CanonicalInterventionPreset, InterventionStep } from './models'
import { asId } from '@lifeos/core'

/**
 * System-provided intervention presets
 * These are seeded into Firestore on first run
 */

// ----- Physiological Interventions -----

export const PHYSIOLOGICAL_SIGH: Omit<CanonicalInterventionPreset, 'createdAtMs' | 'updatedAtMs' | 'syncState' | 'version'> = {
  interventionId: asId('intervention:system-phys-sigh'),
  userId: 'system',
  type: 'physiological_sigh',
  title: 'Physiological Sigh',
  description: 'Two inhales through nose, one long exhale through mouth. Scientifically proven to reduce stress in real-time.',
  defaultDurationSec: 30,
  tags: ['breathing', 'quick', 'stress'],
  recommendedForFeelings: ['anxious', 'overwhelmed', 'restless'],
  steps: [
    {
      kind: 'text',
      content: 'The physiological sigh is one of the fastest ways to reduce stress.\n\nYou\'ll do 2-3 cycles of: double inhale through nose, long exhale through mouth.',
      durationSec: 5
    },
    {
      kind: 'timer',
      instruction: 'Breathe in deeply through your nose...\nThen take a quick second inhale (top up the lungs)...\nNow exhale slowly through your mouth.',
      durationSec: 10,
      showProgress: true
    },
    {
      kind: 'text',
      content: 'Great. Repeat that 2 more times at your own pace.',
      durationSec: 15
    },
    {
      kind: 'text',
      content: 'Notice how your body feels now. You\'ve just activated your parasympathetic nervous system.',
      durationSec: 5
    }
  ]
}

export const BOX_BREATHING: Omit<CanonicalInterventionPreset, 'createdAtMs' | 'updatedAtMs' | 'syncState' | 'version'> = {
  interventionId: asId('intervention:system-box-breathing'),
  userId: 'system',
  type: 'box_breathing',
  title: 'Box Breathing (4-4-4-4)',
  description: 'Inhale for 4, hold for 4, exhale for 4, hold for 4. Used by Navy SEALs for focus and calm.',
  defaultDurationSec: 45,
  tags: ['breathing', 'focus', 'calm'],
  recommendedForFeelings: ['anxious', 'restless', 'overwhelmed'],
  steps: [
    {
      kind: 'text',
      content: 'Box breathing creates calm and focus.\n\nFollow the pattern: Inhale (4s) → Hold (4s) → Exhale (4s) → Hold (4s).',
      durationSec: 5
    },
    {
      kind: 'timer',
      instruction: 'Breathe in... 2... 3... 4...\nHold... 2... 3... 4...\nBreathe out... 2... 3... 4...\nHold... 2... 3... 4...',
      durationSec: 32,
      showProgress: true
    },
    {
      kind: 'text',
      content: 'You just completed 2 full cycles. Notice the steadiness in your body and mind.',
      durationSec: 5
    }
  ]
}

export const BODY_SCAN_QUICK: Omit<CanonicalInterventionPreset, 'createdAtMs' | 'updatedAtMs' | 'syncState' | 'version'> = {
  interventionId: asId('intervention:system-body-scan'),
  userId: 'system',
  type: 'body_scan',
  title: 'Quick Body Scan',
  description: '60-second mindfulness body scan to ground yourself in the present moment.',
  defaultDurationSec: 60,
  tags: ['mindfulness', 'grounding', 'awareness'],
  recommendedForFeelings: ['anxious', 'restless', 'overwhelmed'],
  steps: [
    {
      kind: 'text',
      content: 'Let\'s do a quick body scan to bring awareness to the present moment.',
      durationSec: 3
    },
    {
      kind: 'timer',
      instruction: 'Notice your feet on the ground... your back against the chair... your hands resting... your jaw... your shoulders.\n\nJust notice, without judgment.',
      durationSec: 40,
      showProgress: true
    },
    {
      kind: 'text',
      content: 'You\'re here, in this moment. That\'s enough.',
      durationSec: 5
    }
  ]
}

// ----- CBT Interventions -----

export const CBT_THOUGHT_RECORD: Omit<CanonicalInterventionPreset, 'createdAtMs' | 'updatedAtMs' | 'syncState' | 'version'> = {
  interventionId: asId('intervention:system-cbt-thought'),
  userId: 'system',
  type: 'cbt_thought_record',
  title: 'Label the Thought Distortion',
  description: 'Identify cognitive distortions (catastrophizing, mind reading, all-or-nothing thinking).',
  defaultDurationSec: 60,
  tags: ['CBT', 'thinking', 'awareness'],
  recommendedForFeelings: ['anxious', 'overwhelmed', 'angry'],
  steps: [
    {
      kind: 'input',
      prompt: 'What thought is bothering you right now?',
      placeholder: 'e.g., "I\'m going to fail this presentation"',
      multiline: true
    },
    {
      kind: 'choice',
      question: 'Which cognitive distortion might this be?',
      options: [
        'Catastrophizing (imagining worst-case)',
        'Mind reading (assuming what others think)',
        'All-or-nothing thinking',
        'Overgeneralization',
        'Emotional reasoning',
        'None of these / Not sure'
      ],
      allowMultiple: false
    },
    {
      kind: 'input',
      prompt: 'What would be a more balanced thought?',
      placeholder: 'e.g., "I\'ve prepared well. Even if it\'s not perfect, I\'ll learn something."',
      multiline: true
    },
    {
      kind: 'text',
      content: 'Good work. You just practiced cognitive reframing - a core CBT skill.'
    }
  ]
}

export const CBT_LIKELY_OUTCOME: Omit<CanonicalInterventionPreset, 'createdAtMs' | 'updatedAtMs' | 'syncState' | 'version'> = {
  interventionId: asId('intervention:system-cbt-outcome'),
  userId: 'system',
  type: 'cbt_likely_outcome',
  title: 'Best/Worst/Likely Outcome',
  description: 'Reality-test anxious thoughts by mapping best, worst, and most likely outcomes.',
  defaultDurationSec: 90,
  tags: ['CBT', 'anxiety', 'perspective'],
  recommendedForFeelings: ['anxious', 'overwhelmed'],
  steps: [
    {
      kind: 'input',
      prompt: 'What situation are you worried about?',
      placeholder: 'e.g., "Giving feedback to my team member"'
    },
    {
      kind: 'input',
      prompt: 'What\'s the WORST that could realistically happen?',
      placeholder: 'They get defensive and the conversation is uncomfortable',
      multiline: true
    },
    {
      kind: 'input',
      prompt: 'What\'s the BEST that could happen?',
      placeholder: 'They appreciate the feedback and we build better trust',
      multiline: true
    },
    {
      kind: 'input',
      prompt: 'What\'s MOST LIKELY to happen?',
      placeholder: 'They listen, ask some questions, and we work through it',
      multiline: true
    },
    {
      kind: 'text',
      content: 'Notice how the most likely outcome is usually less extreme than what anxiety tells you.'
    },
    {
      kind: 'choice',
      question: 'What one action can you take now?',
      options: [
        'Prepare specific points for the conversation',
        'Schedule the conversation',
        'Ask a peer for advice',
        'Just move forward - I\'ve thought it through',
        'Create a reminder to revisit this later'
      ]
    }
  ]
}

// ----- ACT Interventions -----

export const ACT_DEFUSION: Omit<CanonicalInterventionPreset, 'createdAtMs' | 'updatedAtMs' | 'syncState' | 'version'> = {
  interventionId: asId('intervention:system-act-defusion'),
  userId: 'system',
  type: 'act_defusion',
  title: 'Thought Defusion',
  description: 'Create distance from unhelpful thoughts using ACT\'s "I\'m noticing..." technique.',
  defaultDurationSec: 45,
  tags: ['ACT', 'mindfulness', 'thoughts'],
  recommendedForFeelings: ['anxious', 'overwhelmed', 'angry'],
  steps: [
    {
      kind: 'input',
      prompt: 'What thought keeps showing up?',
      placeholder: 'e.g., "I\'m not good enough"'
    },
    {
      kind: 'text',
      content: 'Now, rephrase that thought:\n\n"I\'m noticing I\'m having the thought that..."'
    },
    {
      kind: 'text',
      content: 'This simple shift creates distance. You\'re not the thought - you\'re the observer of the thought.\n\nThoughts are just mental events passing through.'
    },
    {
      kind: 'text',
      content: 'Can you let it be there, like a cloud passing in the sky, without needing to fight it or fix it?'
    }
  ]
}

export const ACT_VALUES_ACTION: Omit<CanonicalInterventionPreset, 'createdAtMs' | 'updatedAtMs' | 'syncState' | 'version'> = {
  interventionId: asId('intervention:system-act-values'),
  userId: 'system',
  type: 'act_values_action',
  title: 'Values-Aligned Action',
  description: 'Reconnect with your values and choose one small action aligned with them.',
  defaultDurationSec: 60,
  tags: ['ACT', 'values', 'meaning'],
  recommendedForFeelings: ['avoidant', 'tired', 'overwhelmed'],
  steps: [
    {
      kind: 'choice',
      question: 'Which value feels most important right now?',
      options: [
        'Health & vitality',
        'Connection & relationships',
        'Growth & learning',
        'Creativity & contribution',
        'Integrity & honesty',
        'Freedom & autonomy'
      ]
    },
    {
      kind: 'input',
      prompt: 'What\'s one tiny action you could take in the next hour that aligns with that value?',
      placeholder: 'e.g., "Send a thank-you message to someone I appreciate"',
      multiline: true
    },
    {
      kind: 'text',
      content: 'Perfect. You don\'t need to feel motivated to act on your values. You can act first, and let meaning follow.'
    }
  ]
}

// ----- Gestalt-Inspired -----

export const GESTALT_PRESENT_AWARENESS: Omit<CanonicalInterventionPreset, 'createdAtMs' | 'updatedAtMs' | 'syncState' | 'version'> = {
  interventionId: asId('intervention:system-gestalt-now'),
  userId: 'system',
  type: 'gestalt_now',
  title: 'What\'s True Right Now?',
  description: 'Gestalt-inspired grounding: separate fear from present reality.',
  defaultDurationSec: 45,
  tags: ['Gestalt', 'grounding', 'awareness'],
  recommendedForFeelings: ['anxious', 'overwhelmed'],
  steps: [
    {
      kind: 'text',
      content: 'Let\'s separate the story from what\'s actually happening right now.'
    },
    {
      kind: 'input',
      prompt: 'What does your "Alarmist Voice" keep saying?',
      placeholder: 'e.g., "Everything is going to fall apart"',
      multiline: true
    },
    {
      kind: 'input',
      prompt: 'Now: What is ACTUALLY true in this exact moment?',
      placeholder: 'e.g., "I\'m sitting at my desk. I have a coffee. I\'m breathing. Nothing is on fire."',
      multiline: true
    },
    {
      kind: 'text',
      content: 'The alarmist voice is trying to protect you. But it\'s often preparing for a future that hasn\'t happened.\n\nYou\'re here. You\'re okay. You can handle the next right action.'
    }
  ]
}

// ----- Loving Kindness (Bonus) -----

export const LOVING_KINDNESS_BRIEF: Omit<CanonicalInterventionPreset, 'createdAtMs' | 'updatedAtMs' | 'syncState' | 'version'> = {
  interventionId: asId('intervention:system-loving-kindness'),
  userId: 'system',
  type: 'loving_kindness',
  title: 'Brief Self-Compassion',
  description: 'Quick loving-kindness practice for self-compassion.',
  defaultDurationSec: 45,
  tags: ['compassion', 'kindness', 'self-care'],
  recommendedForFeelings: ['tired', 'angry', 'overwhelmed'],
  steps: [
    {
      kind: 'text',
      content: 'Place one hand on your heart. Take a breath.'
    },
    {
      kind: 'timer',
      instruction: 'Silently repeat:\n\n"May I be safe."\n"May I be peaceful."\n"May I be kind to myself."\n"May I accept myself as I am."',
      durationSec: 30,
      showProgress: true
    },
    {
      kind: 'text',
      content: 'You deserve compassion - especially from yourself.'
    }
  ]
}

// ----- Export All System Presets -----

export const SYSTEM_INTERVENTION_PRESETS = [
  PHYSIOLOGICAL_SIGH,
  BOX_BREATHING,
  BODY_SCAN_QUICK,
  CBT_THOUGHT_RECORD,
  CBT_LIKELY_OUTCOME,
  ACT_DEFUSION,
  ACT_VALUES_ACTION,
  GESTALT_PRESENT_AWARENESS,
  LOVING_KINDNESS_BRIEF
]

/**
 * Helper to add timestamps and sync state to system presets
 */
export function hydrateSystemPreset(
  preset: Omit<CanonicalInterventionPreset, 'createdAtMs' | 'updatedAtMs' | 'syncState' | 'version'>
): CanonicalInterventionPreset {
  const now = Date.now()
  return {
    ...preset,
    createdAtMs: now,
    updatedAtMs: now,
    syncState: 'synced',
    version: 1
  }
}
```

---

## Firestore Adapters

### 4.5 Intervention Repository

#### `apps/web-vite/src/adapters/mind/firestoreInterventionRepository.ts`

```typescript
import {
  getFirestore,
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  deleteDoc,
  query,
  where,
  orderBy
} from 'firebase/firestore'
import { newId, asId } from '@lifeos/core'
import type {
  CanonicalInterventionPreset,
  InterventionId,
  InterventionType,
  FeelingState
} from '@lifeos/mind'

export interface InterventionRepository {
  create(userId: string, preset: Omit<CanonicalInterventionPreset, 'interventionId' | 'createdAtMs' | 'updatedAtMs' | 'syncState' | 'version'>): Promise<CanonicalInterventionPreset>
  update(userId: string, interventionId: InterventionId, updates: Partial<CanonicalInterventionPreset>): Promise<CanonicalInterventionPreset>
  delete(userId: string, interventionId: InterventionId): Promise<void>
  get(interventionId: InterventionId): Promise<CanonicalInterventionPreset | null>
  listUserPresets(userId: string): Promise<CanonicalInterventionPreset[]>
  listSystemPresets(): Promise<CanonicalInterventionPreset[]>
  listByType(type: InterventionType): Promise<CanonicalInterventionPreset[]>
  listByFeeling(feeling: FeelingState): Promise<CanonicalInterventionPreset[]>
}

export const createFirestoreInterventionRepository = (): InterventionRepository => {
  const getFirestoreClient = () => getFirestore()

  return {
    async create(userId, preset): Promise<CanonicalInterventionPreset> {
      const db = getFirestoreClient()
      const interventionId = newId('intervention')

      const intervention: CanonicalInterventionPreset = {
        ...preset,
        interventionId,
        userId,
        createdAtMs: Date.now(),
        updatedAtMs: Date.now(),
        syncState: 'synced',
        version: 1
      }

      const interventionDoc = doc(db, `users/${userId}/interventionPresets/${interventionId}`)
      await setDoc(interventionDoc, intervention)

      return intervention
    },

    async update(userId, interventionId, updates): Promise<CanonicalInterventionPreset> {
      const db = getFirestoreClient()
      const interventionDoc = doc(db, `users/${userId}/interventionPresets/${interventionId}`)

      const existing = await getDoc(interventionDoc)
      if (!existing.exists()) {
        throw new Error(`Intervention ${interventionId} not found`)
      }

      const updated: CanonicalInterventionPreset = {
        ...existing.data() as CanonicalInterventionPreset,
        ...updates,
        updatedAtMs: Date.now(),
        version: (existing.data()?.version ?? 0) + 1,
        syncState: 'synced'
      }

      await setDoc(interventionDoc, updated)
      return updated
    },

    async delete(userId, interventionId): Promise<void> {
      const db = getFirestoreClient()
      const interventionDoc = doc(db, `users/${userId}/interventionPresets/${interventionId}`)
      await deleteDoc(interventionDoc)
    },

    async get(interventionId): Promise<CanonicalInterventionPreset | null> {
      const db = getFirestoreClient()

      // Try system presets first
      const systemDoc = doc(db, `systemInterventions/${interventionId}`)
      const systemSnapshot = await getDoc(systemDoc)
      if (systemSnapshot.exists()) {
        return systemSnapshot.data() as CanonicalInterventionPreset
      }

      // Then try user presets (would need userId, but for simplicity we'll skip)
      return null
    },

    async listUserPresets(userId): Promise<CanonicalInterventionPreset[]> {
      const db = getFirestoreClient()
      const presetsCol = collection(db, `users/${userId}/interventionPresets`)
      const q = query(presetsCol, orderBy('createdAtMs', 'desc'))

      const snapshot = await getDocs(q)
      return snapshot.docs.map(doc => doc.data() as CanonicalInterventionPreset)
    },

    async listSystemPresets(): Promise<CanonicalInterventionPreset[]> {
      const db = getFirestoreClient()
      const systemCol = collection(db, 'systemInterventions')
      const snapshot = await getDocs(systemCol)

      return snapshot.docs.map(doc => doc.data() as CanonicalInterventionPreset)
    },

    async listByType(type): Promise<CanonicalInterventionPreset[]> {
      const db = getFirestoreClient()
      const systemCol = collection(db, 'systemInterventions')
      const q = query(systemCol, where('type', '==', type))

      const snapshot = await getDocs(q)
      return snapshot.docs.map(doc => doc.data() as CanonicalInterventionPreset)
    },

    async listByFeeling(feeling): Promise<CanonicalInterventionPreset[]> {
      const db = getFirestoreClient()
      const systemCol = collection(db, 'systemInterventions')
      const q = query(systemCol, where('recommendedForFeelings', 'array-contains', feeling))

      const snapshot = await getDocs(q)
      return snapshot.docs.map(doc => doc.data() as CanonicalInterventionPreset)
    }
  }
}
```

### 4.6 Session Repository

#### `apps/web-vite/src/adapters/mind/firestoreSessionRepository.ts`

```typescript
import {
  getFirestore,
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  query,
  where,
  orderBy,
  limit as firestoreLimit
} from 'firebase/firestore'
import { newId } from '@lifeos/core'
import type {
  CanonicalInterventionSession,
  SessionId,
  InterventionId,
  FeelingState
} from '@lifeos/mind'

export interface SessionRepository {
  create(userId: string, session: Omit<CanonicalInterventionSession, 'sessionId' | 'startedAtMs' | 'syncState' | 'version'>): Promise<CanonicalInterventionSession>
  complete(userId: string, sessionId: SessionId, completion: {
    feelingAfter?: FeelingState
    responses?: Record<string, unknown>
    createdTodoId?: string
    linkedHabitCheckinIds?: string[]
  }): Promise<CanonicalInterventionSession>
  get(userId: string, sessionId: SessionId): Promise<CanonicalInterventionSession | null>
  listForDate(userId: string, dateKey: string): Promise<CanonicalInterventionSession[]>
  listRecent(userId: string, limit?: number): Promise<CanonicalInterventionSession[]>
  listForDateRange(userId: string, startDate: string, endDate: string): Promise<CanonicalInterventionSession[]>
}

export const createFirestoreSessionRepository = (): SessionRepository => {
  const getFirestoreClient = () => getFirestore()

  return {
    async create(userId, session): Promise<CanonicalInterventionSession> {
      const db = getFirestoreClient()
      const sessionId = newId('session')

      const newSession: CanonicalInterventionSession = {
        ...session,
        sessionId,
        startedAtMs: Date.now(),
        syncState: 'synced',
        version: 1
      }

      const sessionDoc = doc(db, `users/${userId}/interventionSessions/${sessionId}`)
      await setDoc(sessionDoc, newSession)

      return newSession
    },

    async complete(userId, sessionId, completion): Promise<CanonicalInterventionSession> {
      const db = getFirestoreClient()
      const sessionDoc = doc(db, `users/${userId}/interventionSessions/${sessionId}`)

      const existing = await getDoc(sessionDoc)
      if (!existing.exists()) {
        throw new Error(`Session ${sessionId} not found`)
      }

      const existingSession = existing.data() as CanonicalInterventionSession

      const updated: CanonicalInterventionSession = {
        ...existingSession,
        ...completion,
        completedAtMs: Date.now(),
        durationSec: Math.floor((Date.now() - existingSession.startedAtMs) / 1000),
        version: existingSession.version + 1,
        syncState: 'synced'
      }

      await setDoc(sessionDoc, updated)
      return updated
    },

    async get(userId, sessionId): Promise<CanonicalInterventionSession | null> {
      const db = getFirestoreClient()
      const sessionDoc = doc(db, `users/${userId}/interventionSessions/${sessionId}`)
      const snapshot = await getDoc(sessionDoc)

      if (!snapshot.exists()) return null
      return snapshot.data() as CanonicalInterventionSession
    },

    async listForDate(userId, dateKey): Promise<CanonicalInterventionSession[]> {
      const db = getFirestoreClient()
      const sessionsCol = collection(db, `users/${userId}/interventionSessions`)
      const q = query(
        sessionsCol,
        where('dateKey', '==', dateKey),
        orderBy('startedAtMs', 'desc')
      )

      const snapshot = await getDocs(q)
      return snapshot.docs.map(doc => doc.data() as CanonicalInterventionSession)
    },

    async listRecent(userId, limit = 10): Promise<CanonicalInterventionSession[]> {
      const db = getFirestoreClient()
      const sessionsCol = collection(db, `users/${userId}/interventionSessions`)
      const q = query(
        sessionsCol,
        orderBy('startedAtMs', 'desc'),
        firestoreLimit(limit)
      )

      const snapshot = await getDocs(q)
      return snapshot.docs.map(doc => doc.data() as CanonicalInterventionSession)
    },

    async listForDateRange(userId, startDate, endDate): Promise<CanonicalInterventionSession[]> {
      const db = getFirestoreClient()
      const sessionsCol = collection(db, `users/${userId}/interventionSessions`)
      const q = query(
        sessionsCol,
        where('dateKey', '>=', startDate),
        where('dateKey', '<=', endDate),
        orderBy('dateKey', 'asc'),
        orderBy('startedAtMs', 'asc')
      )

      const snapshot = await getDocs(q)
      return snapshot.docs.map(doc => doc.data() as CanonicalInterventionSession)
    }
  }
}
```

---

## Hooks Implementation

### 4.7 Mind Interventions Hook

#### `apps/web-vite/src/hooks/useMindInterventions.ts`

```typescript
import { useState, useCallback, useEffect } from 'react'
import { useAuth } from './useAuth'
import { createFirestoreInterventionRepository } from '@/adapters/mind/firestoreInterventionRepository'
import { createFirestoreSessionRepository } from '@/adapters/mind/firestoreSessionRepository'
import { useHabitOperations } from './useHabitOperations'
import { toast } from 'sonner'
import type {
  CanonicalInterventionPreset,
  CanonicalInterventionSession,
  InterventionId,
  SessionId,
  FeelingState
} from '@lifeos/mind'

const interventionRepo = createFirestoreInterventionRepository()
const sessionRepo = createFirestoreSessionRepository()

export interface UseMindInterventionsReturn {
  systemPresets: CanonicalInterventionPreset[]
  userPresets: CanonicalInterventionPreset[]
  recentSessions: CanonicalInterventionSession[]
  isLoading: boolean
  error: Error | null

  // Preset operations
  loadPresets: () => Promise<void>
  getRecommendedPresets: (feeling?: FeelingState) => CanonicalInterventionPreset[]

  // Session operations
  startSession: (interventionId: InterventionId, feeling?: FeelingState) => Promise<CanonicalInterventionSession>
  completeSession: (sessionId: SessionId, options: {
    feelingAfter?: FeelingState
    responses?: Record<string, unknown>
    createTodo?: boolean
    todoTitle?: string
    linkToHabits?: boolean
  }) => Promise<CanonicalInterventionSession>
  loadRecentSessions: () => Promise<void>
}

export function useMindInterventions(): UseMindInterventionsReturn {
  const { user } = useAuth()
  const { habits, checkIn } = useHabitOperations()

  const [systemPresets, setSystemPresets] = useState<CanonicalInterventionPreset[]>([])
  const [userPresets, setUserPresets] = useState<CanonicalInterventionPreset[]>([])
  const [recentSessions, setRecentSessions] = useState<CanonicalInterventionSession[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const userId = user?.uid

  const loadPresets = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const [system, userCustom] = await Promise.all([
        interventionRepo.listSystemPresets(),
        userId ? interventionRepo.listUserPresets(userId) : Promise.resolve([])
      ])

      setSystemPresets(system)
      setUserPresets(userCustom)
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to load interventions')
      setError(error)
      toast.error(error.message)
    } finally {
      setIsLoading(false)
    }
  }, [userId])

  const loadRecentSessions = useCallback(async () => {
    if (!userId) return

    try {
      const sessions = await sessionRepo.listRecent(userId, 20)
      setRecentSessions(sessions)
    } catch (err) {
      console.error('Failed to load recent sessions:', err)
    }
  }, [userId])

  useEffect(() => {
    if (userId) {
      loadPresets()
      loadRecentSessions()
    }
  }, [userId, loadPresets, loadRecentSessions])

  const getRecommendedPresets = useCallback((feeling?: FeelingState): CanonicalInterventionPreset[] => {
    if (!feeling) return systemPresets.slice(0, 3) // Default top 3

    return systemPresets.filter(preset =>
      preset.recommendedForFeelings.includes(feeling)
    )
  }, [systemPresets])

  const startSession = useCallback(async (
    interventionId: InterventionId,
    feeling?: FeelingState
  ): Promise<CanonicalInterventionSession> => {
    if (!userId) throw new Error('User not authenticated')

    const dateKey = new Date().toISOString().split('T')[0]

    const session = await sessionRepo.create(userId, {
      userId,
      interventionId,
      dateKey,
      trigger: 'manual',
      feelingBefore: feeling
    })

    setRecentSessions(prev => [session, ...prev])
    return session
  }, [userId])

  const completeSession = useCallback(async (
    sessionId: SessionId,
    options: {
      feelingAfter?: FeelingState
      responses?: Record<string, unknown>
      createTodo?: boolean
      todoTitle?: string
      linkToHabits?: boolean
    }
  ): Promise<CanonicalInterventionSession> => {
    if (!userId) throw new Error('User not authenticated')

    const linkedHabitCheckinIds: string[] = []

    // Auto-link to meditation/mindfulness habits if requested
    if (options.linkToHabits) {
      const dateKey = new Date().toISOString().split('T')[0]

      const meditationHabits = habits.filter(h =>
        (h.domain === 'meditation' || h.customDomain?.toLowerCase().includes('mindfulness')) &&
        h.status === 'active'
      )

      for (const habit of meditationHabits) {
        try {
          const checkin = await checkIn(habit.habitId, dateKey, 'done', {
            sourceType: 'intervention',
            sourceId: sessionId,
            note: 'Auto-logged from mind intervention'
          })
          linkedHabitCheckinIds.push(checkin.checkinId)
        } catch (err) {
          console.error('Failed to create habit check-in:', err)
        }
      }

      if (linkedHabitCheckinIds.length > 0) {
        toast.success(`Marked ${linkedHabitCheckinIds.length} habit(s) as done`)
      }
    }

    // Complete the session
    const completed = await sessionRepo.complete(userId, sessionId, {
      feelingAfter: options.feelingAfter,
      responses: options.responses,
      createdTodoId: options.createTodo ? 'todo-placeholder' : undefined, // Would actually create todo
      linkedHabitCheckinIds: linkedHabitCheckinIds.length > 0 ? linkedHabitCheckinIds : undefined
    })

    // Update local state
    setRecentSessions(prev =>
      prev.map(s => s.sessionId === sessionId ? completed : s)
    )

    toast.success('Intervention complete')
    return completed
  }, [userId, habits, checkIn])

  return {
    systemPresets,
    userPresets,
    recentSessions,
    isLoading,
    error,
    loadPresets,
    getRecommendedPresets,
    startSession,
    completeSession,
    loadRecentSessions
  }
}
```

---

## UI Components

### 4.8 Mind Intervention Modal

#### `apps/web-vite/src/components/mind/MindInterventionModal.tsx`

```typescript
import { useState, useEffect } from 'react'
import { useMindInterventions } from '@/hooks/useMindInterventions'
import { FeelingSelector } from './FeelingSelector'
import { InterventionSelector } from './InterventionSelector'
import { InterventionRunner } from './InterventionRunner'
import { SessionComplete } from './SessionComplete'
import type { FeelingState, CanonicalInterventionPreset, SessionId } from '@lifeos/mind'

interface MindInterventionModalProps {
  isOpen: boolean
  onClose: () => void
  userId: string
}

type Step = 'feeling' | 'intervention' | 'running' | 'complete'

export function MindInterventionModal({ isOpen, onClose, userId }: MindInterventionModalProps) {
  const { getRecommendedPresets, startSession, completeSession } = useMindInterventions()

  const [step, setStep] = useState<Step>('feeling')
  const [feeling, setFeeling] = useState<FeelingState | undefined>()
  const [selectedPreset, setSelectedPreset] = useState<CanonicalInterventionPreset | null>(null)
  const [currentSessionId, setCurrentSessionId] = useState<SessionId | null>(null)
  const [responses, setResponses] = useState<Record<string, unknown>>({})

  useEffect(() => {
    if (isOpen) {
      // Reset on open
      setStep('feeling')
      setFeeling(undefined)
      setSelectedPreset(null)
      setCurrentSessionId(null)
      setResponses({})
    }
  }, [isOpen])

  if (!isOpen) return null

  const handleFeelingSelect = (selected: FeelingState) => {
    setFeeling(selected)
    setStep('intervention')
  }

  const handleInterventionSelect = async (preset: CanonicalInterventionPreset) => {
    setSelectedPreset(preset)

    // Start session
    const session = await startSession(preset.interventionId, feeling)
    setCurrentSessionId(session.sessionId)

    setStep('running')
  }

  const handleInterventionComplete = (sessionResponses: Record<string, unknown>) => {
    setResponses(sessionResponses)
    setStep('complete')
  }

  const handleFinish = async (options: {
    feelingAfter?: FeelingState
    createTodo?: boolean
    todoTitle?: string
    linkToHabits?: boolean
  }) => {
    if (!currentSessionId) return

    await completeSession(currentSessionId, {
      ...options,
      responses
    })

    onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content mind-modal" onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>×</button>

        <div className="modal-header">
          <h2>🧠 Mind Reset</h2>
          <p className="subtitle">Take a moment to ground yourself</p>
        </div>

        <div className="modal-body">
          {step === 'feeling' && (
            <FeelingSelector onSelect={handleFeelingSelect} />
          )}

          {step === 'intervention' && (
            <InterventionSelector
              feeling={feeling}
              recommendedPresets={getRecommendedPresets(feeling)}
              onSelect={handleInterventionSelect}
              onBack={() => setStep('feeling')}
            />
          )}

          {step === 'running' && selectedPreset && (
            <InterventionRunner
              preset={selectedPreset}
              onComplete={handleInterventionComplete}
            />
          )}

          {step === 'complete' && (
            <SessionComplete
              feeling={feeling}
              onFinish={handleFinish}
              onClose={onClose}
            />
          )}
        </div>
      </div>
    </div>
  )
}
```

### 4.9 Feeling Selector Component

#### `apps/web-vite/src/components/mind/FeelingSelector.tsx`

```typescript
import type { FeelingState } from '@lifeos/mind'

interface FeelingSelectorProps {
  onSelect: (feeling: FeelingState) => void
}

const FEELINGS: Array<{ value: FeelingState; label: string; emoji: string; description: string }> = [
  { value: 'anxious', label: 'Anxious', emoji: '😰', description: 'Worried, on edge, anticipating problems' },
  { value: 'overwhelmed', label: 'Overwhelmed', emoji: '🤯', description: 'Too much to handle, scattered' },
  { value: 'angry', label: 'Angry', emoji: '😤', description: 'Frustrated, irritated, tense' },
  { value: 'avoidant', label: 'Avoidant', emoji: '🙈', description: 'Procrastinating, escaping, avoiding' },
  { value: 'restless', label: 'Restless', emoji: '😣', description: 'Can\'t settle, agitated, jittery' },
  { value: 'tired', label: 'Tired', emoji: '😮‍💨', description: 'Drained, depleted, low energy' }
]

export function FeelingSelector({ onSelect }: FeelingSelectorProps) {
  return (
    <div className="feeling-selector">
      <h3>How are you feeling right now?</h3>
      <p className="hint">Pick what resonates most</p>

      <div className="feeling-grid">
        {FEELINGS.map(feeling => (
          <button
            key={feeling.value}
            className="feeling-card"
            onClick={() => onSelect(feeling.value)}
          >
            <span className="feeling-emoji">{feeling.emoji}</span>
            <span className="feeling-label">{feeling.label}</span>
            <span className="feeling-description">{feeling.description}</span>
          </button>
        ))}
      </div>

      <button
        className="feeling-neutral"
        onClick={() => onSelect('neutral')}
      >
        😌 Actually, I'm okay - just want a reset
      </button>
    </div>
  )
}
```

### 4.10 Intervention Runner Component

#### `apps/web-vite/src/components/mind/InterventionRunner.tsx`

```typescript
import { useState, useEffect } from 'react'
import type { CanonicalInterventionPreset, InterventionStep } from '@lifeos/mind'

interface InterventionRunnerProps {
  preset: CanonicalInterventionPreset
  onComplete: (responses: Record<string, unknown>) => void
}

export function InterventionRunner({ preset, onComplete }: InterventionRunnerProps) {
  const [currentStepIndex, setCurrentStepIndex] = useState(0)
  const [responses, setResponses] = useState<Record<string, unknown>>({})
  const [stepStartTime, setStepStartTime] = useState(Date.now())

  const currentStep = preset.steps[currentStepIndex]
  const isLastStep = currentStepIndex === preset.steps.length - 1

  useEffect(() => {
    setStepStartTime(Date.now())

    // Auto-advance for text steps with duration
    if (currentStep.kind === 'text' && currentStep.durationSec) {
      const timer = setTimeout(() => {
        handleNext()
      }, currentStep.durationSec * 1000)

      return () => clearTimeout(timer)
    }
  }, [currentStepIndex])

  const handleNext = () => {
    if (isLastStep) {
      onComplete(responses)
    } else {
      setCurrentStepIndex(prev => prev + 1)
    }
  }

  const handleResponse = (stepKey: string, value: unknown) => {
    setResponses(prev => ({ ...prev, [stepKey]: value }))
  }

  return (
    <div className="intervention-runner">
      <div className="progress-bar">
        <div
          className="progress-fill"
          style={{ width: `${((currentStepIndex + 1) / preset.steps.length) * 100}%` }}
        />
      </div>

      <div className="step-content">
        <StepRenderer
          step={currentStep}
          stepIndex={currentStepIndex}
          onResponse={handleResponse}
          onNext={handleNext}
        />
      </div>

      <div className="step-navigation">
        {!isLastStep && currentStep.kind !== 'text' && (
          <button className="btn-next" onClick={handleNext}>
            Continue →
          </button>
        )}
      </div>
    </div>
  )
}

interface StepRendererProps {
  step: InterventionStep
  stepIndex: number
  onResponse: (key: string, value: unknown) => void
  onNext: () => void
}

function StepRenderer({ step, stepIndex, onResponse, onNext }: StepRendererProps) {
  const [inputValue, setInputValue] = useState('')
  const [selectedChoice, setSelectedChoice] = useState<string | string[]>('')
  const [timerRemaining, setTimerRemaining] = useState(0)

  useEffect(() => {
    if (step.kind === 'timer') {
      setTimerRemaining(step.durationSec)

      const interval = setInterval(() => {
        setTimerRemaining(prev => {
          if (prev <= 1) {
            clearInterval(interval)
            setTimeout(onNext, 500) // Auto-advance after timer
            return 0
          }
          return prev - 1
        })
      }, 1000)

      return () => clearInterval(interval)
    }
  }, [step])

  if (step.kind === 'text') {
    return (
      <div className="step-text">
        <p>{step.content}</p>
      </div>
    )
  }

  if (step.kind === 'timer') {
    return (
      <div className="step-timer">
        <p className="timer-instruction">{step.instruction}</p>
        {step.showProgress && (
          <div className="timer-display">
            <span className="timer-seconds">{timerRemaining}s</span>
          </div>
        )}
      </div>
    )
  }

  if (step.kind === 'input') {
    return (
      <div className="step-input">
        <label>{step.prompt}</label>
        <textarea
          placeholder={step.placeholder}
          value={inputValue}
          onChange={e => {
            setInputValue(e.target.value)
            onResponse(`step_${stepIndex}`, e.target.value)
          }}
          rows={step.multiline ? 4 : 2}
          autoFocus
        />
      </div>
    )
  }

  if (step.kind === 'choice') {
    return (
      <div className="step-choice">
        <p className="choice-question">{step.question}</p>
        <div className="choice-options">
          {step.options.map((option, idx) => (
            <button
              key={idx}
              className={`choice-option ${selectedChoice === option ? 'selected' : ''}`}
              onClick={() => {
                setSelectedChoice(option)
                onResponse(`step_${stepIndex}`, option)
              }}
            >
              {option}
            </button>
          ))}
        </div>
      </div>
    )
  }

  return null
}
```

### 4.11 Session Complete Component

#### `apps/web-vite/src/components/mind/SessionComplete.tsx`

```typescript
import { useState } from 'react'
import type { FeelingState } from '@lifeos/mind'

interface SessionCompleteProps {
  feeling?: FeelingState
  onFinish: (options: {
    feelingAfter?: FeelingState
    createTodo?: boolean
    todoTitle?: string
    linkToHabits?: boolean
  }) => void
  onClose: () => void
}

export function SessionComplete({ feeling, onFinish, onClose }: SessionCompleteProps) {
  const [feelingAfter, setFeelingAfter] = useState<FeelingState | undefined>()
  const [createTodo, setCreateTodo] = useState(false)
  const [todoTitle, setTodoTitle] = useState('')
  const [linkToHabits, setLinkToHabits] = useState(true)

  const handleFinish = () => {
    onFinish({
      feelingAfter,
      createTodo,
      todoTitle: createTodo ? todoTitle : undefined,
      linkToHabits
    })
  }

  return (
    <div className="session-complete">
      <div className="complete-header">
        <span className="complete-icon">✨</span>
        <h3>Nice work</h3>
        <p>You took time to reset. That matters.</p>
      </div>

      <div className="complete-options">
        <div className="option-group">
          <label>How do you feel now?</label>
          <select
            value={feelingAfter ?? ''}
            onChange={e => setFeelingAfter(e.target.value as FeelingState)}
          >
            <option value="">Select...</option>
            <option value="neutral">😌 Better / Neutral</option>
            <option value="anxious">😰 Still anxious</option>
            <option value="overwhelmed">🤯 Still overwhelmed</option>
            <option value="tired">😮‍💨 Calmer but tired</option>
          </select>
        </div>

        <div className="option-checkbox">
          <input
            type="checkbox"
            id="link-habits"
            checked={linkToHabits}
            onChange={e => setLinkToHabits(e.target.checked)}
          />
          <label htmlFor="link-habits">
            Mark meditation/mindfulness habit as done
          </label>
        </div>

        <div className="option-checkbox">
          <input
            type="checkbox"
            id="create-todo"
            checked={createTodo}
            onChange={e => setCreateTodo(e.target.checked)}
          />
          <label htmlFor="create-todo">
            Create a next action
          </label>
        </div>

        {createTodo && (
          <div className="option-group">
            <input
              type="text"
              placeholder="What's the next action?"
              value={todoTitle}
              onChange={e => setTodoTitle(e.target.value)}
              autoFocus
            />
          </div>
        )}
      </div>

      <div className="complete-actions">
        <button className="btn-secondary" onClick={onClose}>
          Just close
        </button>
        <button className="btn-primary" onClick={handleFinish}>
          Finish
        </button>
      </div>
    </div>
  )
}
```

---

## Integration Points

### 4.12 System Intervention Seeding

Create a Cloud Function to seed system interventions on first deployment:

#### `functions/src/mind/seedInterventions.ts`

```typescript
import { onCall } from 'firebase-functions/v2/https'
import { getFirestore } from 'firebase-admin/firestore'
import { SYSTEM_INTERVENTION_PRESETS, hydrateSystemPreset } from '@lifeos/mind'

export const seedSystemInterventions = onCall(async (request) => {
  // Admin only
  if (!request.auth?.token.admin) {
    throw new Error('Unauthorized')
  }

  const db = getFirestore()
  const batch = db.batch()

  for (const preset of SYSTEM_INTERVENTION_PRESETS) {
    const hydrated = hydrateSystemPreset(preset)
    const ref = db.collection('systemInterventions').doc(hydrated.interventionId)
    batch.set(ref, hydrated)
  }

  await batch.commit()

  return { success: true, count: SYSTEM_INTERVENTION_PRESETS.length }
})
```

**Run once after deployment:**
```bash
firebase functions:call seedSystemInterventions --data '{}'
```

---

## Testing

### 4.13 Unit Tests

#### `packages/mind/src/domain/__tests__/presets.test.ts`

```typescript
import { describe, it, expect } from 'vitest'
import { SYSTEM_INTERVENTION_PRESETS, hydrateSystemPreset } from '../presets'

describe('System Intervention Presets', () => {
  it('should have valid structure', () => {
    expect(SYSTEM_INTERVENTION_PRESETS.length).toBeGreaterThan(0)

    for (const preset of SYSTEM_INTERVENTION_PRESETS) {
      expect(preset.interventionId).toBeDefined()
      expect(preset.title).toBeDefined()
      expect(preset.steps.length).toBeGreaterThan(0)
      expect(preset.defaultDurationSec).toBeGreaterThan(0)
    }
  })

  it('should hydrate presets correctly', () => {
    const preset = SYSTEM_INTERVENTION_PRESETS[0]
    const hydrated = hydrateSystemPreset(preset)

    expect(hydrated.createdAtMs).toBeGreaterThan(0)
    expect(hydrated.updatedAtMs).toBeGreaterThan(0)
    expect(hydrated.syncState).toBe('synced')
    expect(hydrated.version).toBe(1)
  })

  it('should have valid step types', () => {
    for (const preset of SYSTEM_INTERVENTION_PRESETS) {
      for (const step of preset.steps) {
        expect(['text', 'timer', 'choice', 'input']).toContain(step.kind)
      }
    }
  })

  it('should have breathing interventions under 60 seconds', () => {
    const breathingPresets = SYSTEM_INTERVENTION_PRESETS.filter(p =>
      p.tags.includes('breathing')
    )

    for (const preset of breathingPresets) {
      expect(preset.defaultDurationSec).toBeLessThanOrEqual(60)
    }
  })
})
```

### 4.14 Integration Tests

Test intervention flow:
1. Start session
2. Complete steps
3. Auto-create habit check-in
4. Verify session saved

---

## Acceptance Criteria

### Phase 4 Complete When:

- ✅ Mind package builds and exports all types
- ✅ System intervention presets seeded to Firestore
- ✅ MindInterventionModal renders and runs interventions
- ✅ Timer steps auto-advance
- ✅ Input/choice steps save responses
- ✅ Sessions auto-link to meditation habits
- ✅ "I'm Activated" button works in Work Module (Today page)
- ✅ Recent sessions display in UI
- ✅ Offline support (IndexedDB cache)
- ✅ All tests pass

---

## Next Steps

After Phase 4 completion:
- **Phase 5:** Weekly Review integration, progress charts, recommendations
- **Polish:** Performance optimization, accessibility, mobile responsiveness

---

**END OF PHASE 4 PLAN**
