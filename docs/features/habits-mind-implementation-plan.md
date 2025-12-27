# Implementation Plan: Habits & Mind Engine

**Version:** 1.0
**Created:** 2025-12-27
**Status:** Planning

## Executive Summary

This plan implements a comprehensive Habits and Mind Engine system for LifeOS, following established architectural patterns and integrating deeply with existing Calendar, Notes, Todos, and Today features.

### Key Decisions

- **Scope:** Habits first (Phase 1-3), then Mind Engine (Phase 4)
- **Naming:** Use `Canonical` prefix for all domain models
- **Journaling:** Integrate with existing Notes system using journal note type
- **Today UI:** Time-based sections (Morning/Work/Evening)
- **Check-ins:** Support retroactive logging, no auto-skip for missed habits
- **Integration:** Mind interventions auto-create habit check-ins when applicable

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Domain Models](#domain-models)
3. [Phase 1: Foundation](#phase-1-foundation)
4. [Phase 2: Habits Core](#phase-2-habits-core)
5. [Phase 3: Habits Integration](#phase-3-habits-integration)
6. [Phase 4: Mind Engine](#phase-4-mind-engine)
7. [Phase 5: Polish & Advanced Features](#phase-5-polish--advanced-features)
8. [Testing Strategy](#testing-strategy)
9. [Deployment Checklist](#deployment-checklist)
10. [Future Enhancements](#future-enhancements)

---

## Architecture Overview

### Package Structure

```
packages/
├── habits/                      # NEW: Habits domain package
│   ├── src/
│   │   ├── domain/
│   │   │   ├── models.ts
│   │   │   └── __tests__/
│   │   ├── ports/
│   │   │   ├── habitRepository.ts
│   │   │   └── checkinRepository.ts
│   │   └── usecases/
│   │       ├── habitUsecases.ts
│   │       ├── progressUsecases.ts
│   │       └── __tests__/
│   ├── package.json
│   ├── tsconfig.json
│   └── tsup.config.ts
│
└── mind/                        # NEW: Mind Engine domain package
    ├── src/
    │   ├── domain/
    │   │   ├── models.ts
    │   │   └── __tests__/
    │   ├── ports/
    │   │   ├── interventionRepository.ts
    │   │   └── sessionRepository.ts
    │   └── usecases/
    │       ├── interventionUsecases.ts
    │       └── __tests__/
    ├── package.json
    ├── tsconfig.json
    └── tsup.config.ts

apps/web-vite/
├── src/
│   ├── adapters/
│   │   ├── habits/
│   │   │   ├── firestoreHabitRepository.ts
│   │   │   └── firestoreCheckinRepository.ts
│   │   └── mind/
│   │       ├── firestoreInterventionRepository.ts
│   │       └── firestoreSessionRepository.ts
│   │
│   ├── hooks/
│   │   ├── useHabitOperations.ts
│   │   ├── useHabitProgress.ts
│   │   ├── useMindInterventions.ts
│   │   └── useMindSessions.ts
│   │
│   ├── components/
│   │   ├── habits/
│   │   │   ├── HabitFormModal.tsx
│   │   │   ├── HabitList.tsx
│   │   │   ├── HabitCheckinCard.tsx
│   │   │   ├── HabitProgressChart.tsx
│   │   │   └── HabitRecommendations.tsx
│   │   ├── mind/
│   │   │   ├── MindInterventionModal.tsx
│   │   │   ├── FeelingSelector.tsx
│   │   │   ├── InterventionRunner.tsx
│   │   │   └── InterventionHistory.tsx
│   │   └── today/
│   │       ├── MorningModule.tsx
│   │       ├── WorkModule.tsx
│   │       ├── EveningModule.tsx
│   │       └── TodayTimeline.tsx
│   │
│   ├── pages/
│   │   └── HabitsPage.tsx
│   │
│   └── habits/
│       ├── offlineStore.ts      # IndexedDB cache
│       └── habitOutbox.ts       # Offline sync queue
```

### Technology Stack (No Changes)

- **Frontend:** React 19.2 + Vite 7.2
- **State:** Custom hooks (no Redux/Zustand)
- **Persistence:** Firestore + IndexedDB
- **Offline:** idb + custom outbox pattern
- **Validation:** Zod schemas
- **Testing:** Vitest + Testing Library
- **Build:** pnpm + Turbo

---

## Domain Models

### Habits Package Models

```typescript
// packages/habits/src/domain/models.ts

import type { Id } from '@lifeos/core'

// ----- IDs -----
export type HabitId = Id<'habit'>
export type CheckinId = Id<'checkin'>

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
  event: 'wake_up' | 'breakfast' | 'lunch' | 'work_end' | 'dinner' | 'bedtime' | 'custom'
  customLabel?: string
}

export interface TimeWindowAnchor {
  type: 'time_window'
  startTimeMs: number // Milliseconds since midnight in user timezone
  endTimeMs: number
}

export type HabitAnchor = AfterEventAnchor | TimeWindowAnchor

// ----- Habit Recipe -----
export interface HabitRecipe {
  tinyVersion: {
    description: string
    durationMinutes?: number
  }
  standardVersion: {
    description: string
    durationMinutes?: number
  }
}

// ----- Schedule -----
export interface HabitSchedule {
  daysOfWeek: number[] // 0-6 (Sunday-Saturday)
  timezone: string // IANA timezone
}

// ----- Safety Net -----
export interface SafetyNet {
  tinyCounts: boolean // Tiny version preserves streak
  recoveryAllowed: boolean // Can bounce back after skip
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
  habitId: HabitId
  currentStreak: number
  longestStreak: number
  totalCheckins: number
  doneCount: number
  tinyCount: number
  skipCount: number
  consistencyPercent: number // (done + tiny) / scheduled days
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
```

### Mind Engine Package Models

```typescript
// packages/mind/src/domain/models.ts

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
```

### Notes Integration (Extension)

```typescript
// packages/notes/src/domain/models.ts (EXTEND existing)

// Add to Note interface:
export interface Note {
  // ... existing fields ...

  // NEW: Journal-specific fields
  noteType?: 'standard' | 'journal' | 'meeting' | 'learning'
  journalType?: 'morning' | 'evening' | 'weekly_review' | 'intervention_reflection'
  journalDate?: string // YYYY-MM-DD for daily journals
  journalPrompts?: JournalPrompt[]

  // ... rest of existing fields ...
}

export interface JournalPrompt {
  key: string
  question: string
  answer: string
  order: number
}

// Templates for different journal types
export interface JournalTemplate {
  type: 'morning' | 'evening' | 'weekly_review' | 'intervention_reflection'
  prompts: Array<{
    key: string
    question: string
    placeholder?: string
  }>
}

export const JOURNAL_TEMPLATES: Record<string, JournalTemplate> = {
  morning: {
    type: 'morning',
    prompts: [
      { key: 'intention', question: 'What is my intention for today?', placeholder: 'Focus on...' },
      {
        key: 'keystone',
        question: 'Which keystone habit will I prioritize?',
        placeholder: 'Morning meditation',
      },
      {
        key: 'if_then',
        question: 'My if-then plan:',
        placeholder: 'If I feel overwhelmed, then I will...',
      },
    ],
  },
  evening: {
    type: 'evening',
    prompts: [
      { key: 'wins', question: 'What went well today?', placeholder: 'I accomplished...' },
      { key: 'challenges', question: 'What was challenging?', placeholder: 'I struggled with...' },
      {
        key: 'unresolved',
        question: 'What needs attention tomorrow?',
        placeholder: 'Follow up on...',
      },
    ],
  },
  intervention_reflection: {
    type: 'intervention_reflection',
    prompts: [
      { key: 'situation', question: 'What triggered this?', placeholder: 'I noticed...' },
      { key: 'insight', question: 'What did I learn?', placeholder: 'I realized...' },
      {
        key: 'action',
        question: 'What will I do differently?',
        placeholder: 'Next time I will...',
      },
    ],
  },
}
```

---

## Phase 1: Foundation

**Duration:** 3-5 days
**Goal:** Set up infrastructure without UI

### 1.1 Package Scaffolding

**Create packages/habits/**

```bash
# In project root
mkdir -p packages/habits/src/{domain,ports,usecases}/__tests__
```

Files to create:

#### `packages/habits/package.json`

```json
{
  "name": "@lifeos/habits",
  "version": "0.1.0",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsup",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@lifeos/core": "workspace:*",
    "zod": "^4.2.1"
  },
  "devDependencies": {
    "@types/node": "^22.10.2",
    "tsup": "^8.5.1",
    "typescript": "^5.9.3",
    "vitest": "^3.2.1"
  }
}
```

#### `packages/habits/tsconfig.json`

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "**/*.test.ts"]
}
```

#### `packages/habits/tsup.config.ts`

```typescript
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  treeshake: true,
})
```

#### `packages/habits/vitest.config.ts`

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
  },
})
```

**Repeat for packages/mind/** with same structure.

### 1.2 Domain Models Implementation

**Create domain models with full TypeScript types** (see Domain Models section above)

Files:

- `packages/habits/src/domain/models.ts`
- `packages/mind/src/domain/models.ts`

### 1.3 Firestore Configuration

**Add indexes:** Create or update `firestore.indexes.json`

```json
{
  "indexes": [
    {
      "collectionGroup": "habits",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "userId", "order": "ASCENDING" },
        { "fieldPath": "status", "order": "ASCENDING" },
        { "fieldPath": "createdAtMs", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "habitCheckins",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "userId", "order": "ASCENDING" },
        { "fieldPath": "dateKey", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "habitCheckins",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "userId", "order": "ASCENDING" },
        { "fieldPath": "habitId", "order": "ASCENDING" },
        { "fieldPath": "dateKey", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "interventionPresets",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "userId", "order": "ASCENDING" },
        { "fieldPath": "type", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "interventionSessions",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "userId", "order": "ASCENDING" },
        { "fieldPath": "dateKey", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "interventionSessions",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "userId", "order": "ASCENDING" },
        { "fieldPath": "dateKey", "order": "ASCENDING" },
        { "fieldPath": "startedAtMs", "order": "DESCENDING" }
      ]
    }
  ]
}
```

**Deploy indexes:**

```bash
firebase deploy --only firestore:indexes
```

**Add security rules:** Update `firestore.rules`

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      // ... existing rules ...

      // Habits
      match /habits/{habitId} {
        allow read, write: if request.auth != null && request.auth.uid == userId;
      }

      match /habitCheckins/{checkinId} {
        allow read, write: if request.auth != null && request.auth.uid == userId;
      }

      // Mind Engine
      match /interventionPresets/{interventionId} {
        allow read, write: if request.auth != null && request.auth.uid == userId;
      }

      match /interventionSessions/{sessionId} {
        allow read, write: if request.auth != null && request.auth.uid == userId;
      }

      // System intervention presets (read-only for all users)
      match /systemInterventions/{interventionId} {
        allow read: if request.auth != null;
        allow write: if false;  // Admin only
      }
    }
  }
}
```

**Deploy rules:**

```bash
firebase deploy --only firestore:rules
```

### 1.4 Repository Ports

**Define repository interfaces**

#### `packages/habits/src/ports/habitRepository.ts`

```typescript
import type { CanonicalHabit, HabitId, CreateHabitInput, UpdateHabitInput } from '../domain/models'

export interface HabitRepository {
  create(userId: string, input: CreateHabitInput): Promise<CanonicalHabit>
  update(userId: string, habitId: HabitId, updates: UpdateHabitInput): Promise<CanonicalHabit>
  delete(userId: string, habitId: HabitId): Promise<void>
  get(userId: string, habitId: HabitId): Promise<CanonicalHabit | null>
  list(
    userId: string,
    options?: { status?: 'active' | 'paused' | 'archived' }
  ): Promise<CanonicalHabit[]>
  listForDate(userId: string, dateKey: string): Promise<CanonicalHabit[]>
}
```

#### `packages/habits/src/ports/checkinRepository.ts`

```typescript
import type {
  CanonicalHabitCheckin,
  CheckinId,
  HabitId,
  CreateCheckinInput,
  UpdateCheckinInput,
} from '../domain/models'

export interface CheckinRepository {
  upsert(userId: string, input: CreateCheckinInput): Promise<CanonicalHabitCheckin>
  update(
    userId: string,
    checkinId: CheckinId,
    updates: UpdateCheckinInput
  ): Promise<CanonicalHabitCheckin>
  delete(userId: string, checkinId: CheckinId): Promise<void>
  get(userId: string, checkinId: CheckinId): Promise<CanonicalHabitCheckin | null>
  getByHabitAndDate(
    userId: string,
    habitId: HabitId,
    dateKey: string
  ): Promise<CanonicalHabitCheckin | null>
  listForDate(userId: string, dateKey: string): Promise<CanonicalHabitCheckin[]>
  listForHabit(
    userId: string,
    habitId: HabitId,
    options?: { limit?: number }
  ): Promise<CanonicalHabitCheckin[]>
  listForDateRange(
    userId: string,
    startDate: string,
    endDate: string
  ): Promise<CanonicalHabitCheckin[]>
}
```

**Similar ports for Mind Engine** (interventionRepository.ts, sessionRepository.ts)

### 1.5 Package Exports

#### `packages/habits/src/index.ts`

```typescript
// Domain models
export * from './domain/models'

// Repository ports
export * from './ports/habitRepository'
export * from './ports/checkinRepository'

// Usecases (will add in Phase 2)
// export * from './usecases/habitUsecases'
// export * from './usecases/progressUsecases'
```

### 1.6 Update Root Package

Add to `pnpm-workspace.yaml` (if not already included):

```yaml
packages:
  - 'packages/*'
  - 'apps/*'
  - 'functions'
```

Install dependencies:

```bash
pnpm install
```

### 1.7 Build Test

```bash
pnpm turbo build
pnpm turbo typecheck
```

**Acceptance Criteria:**

- ✅ All packages build without errors
- ✅ TypeScript type checking passes
- ✅ Firestore indexes deployed
- ✅ Security rules deployed

---

## Phase 2: Habits Core

**Duration:** 5-7 days
**Goal:** Full Habits CRUD with offline support

### 2.1 Firestore Adapters

#### `apps/web-vite/src/adapters/habits/firestoreHabitRepository.ts`

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
  orderBy,
  Timestamp,
} from 'firebase/firestore'
import { newId, asId } from '@lifeos/core'
import type {
  HabitRepository,
  CanonicalHabit,
  HabitId,
  CreateHabitInput,
  UpdateHabitInput,
} from '@lifeos/habits'

export const createFirestoreHabitRepository = (): HabitRepository => {
  const getFirestoreClient = () => getFirestore()

  return {
    async create(userId: string, input: CreateHabitInput): Promise<CanonicalHabit> {
      const db = getFirestoreClient()
      const habitId = newId('habit')

      const habit: CanonicalHabit = {
        ...input,
        habitId,
        userId,
        createdAtMs: Date.now(),
        updatedAtMs: Date.now(),
        syncState: 'synced',
        version: 1,
      }

      const habitDoc = doc(db, `users/${userId}/habits/${habitId}`)
      await setDoc(habitDoc, habit)

      return habit
    },

    async update(
      userId: string,
      habitId: HabitId,
      updates: UpdateHabitInput
    ): Promise<CanonicalHabit> {
      const db = getFirestoreClient()
      const habitDoc = doc(db, `users/${userId}/habits/${habitId}`)

      const existing = await getDoc(habitDoc)
      if (!existing.exists()) {
        throw new Error(`Habit ${habitId} not found`)
      }

      const updated: CanonicalHabit = {
        ...(existing.data() as CanonicalHabit),
        ...updates,
        updatedAtMs: Date.now(),
        version: (existing.data()?.version ?? 0) + 1,
        syncState: 'synced',
      }

      await setDoc(habitDoc, updated)
      return updated
    },

    async delete(userId: string, habitId: HabitId): Promise<void> {
      const db = getFirestoreClient()
      const habitDoc = doc(db, `users/${userId}/habits/${habitId}`)
      await deleteDoc(habitDoc)
    },

    async get(userId: string, habitId: HabitId): Promise<CanonicalHabit | null> {
      const db = getFirestoreClient()
      const habitDoc = doc(db, `users/${userId}/habits/${habitId}`)
      const snapshot = await getDoc(habitDoc)

      if (!snapshot.exists()) return null
      return snapshot.data() as CanonicalHabit
    },

    async list(
      userId: string,
      options?: { status?: 'active' | 'paused' | 'archived' }
    ): Promise<CanonicalHabit[]> {
      const db = getFirestoreClient()
      const habitsCol = collection(db, `users/${userId}/habits`)

      let q = query(habitsCol, orderBy('createdAtMs', 'desc'))

      if (options?.status) {
        q = query(habitsCol, where('status', '==', options.status), orderBy('createdAtMs', 'desc'))
      }

      const snapshot = await getDocs(q)
      return snapshot.docs.map((doc) => doc.data() as CanonicalHabit)
    },

    async listForDate(userId: string, dateKey: string): Promise<CanonicalHabit[]> {
      // Get active habits and filter by schedule
      const habits = await this.list(userId, { status: 'active' })

      const dayOfWeek = new Date(dateKey).getDay()

      return habits.filter((habit) => habit.schedule.daysOfWeek.includes(dayOfWeek))
    },
  }
}
```

#### `apps/web-vite/src/adapters/habits/firestoreCheckinRepository.ts`

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
  orderBy,
  limit as firestoreLimit,
} from 'firebase/firestore'
import { newId, asId } from '@lifeos/core'
import type {
  CheckinRepository,
  CanonicalHabitCheckin,
  CheckinId,
  HabitId,
  CreateCheckinInput,
  UpdateCheckinInput,
} from '@lifeos/habits'

export const createFirestoreCheckinRepository = (): CheckinRepository => {
  const getFirestoreClient = () => getFirestore()

  return {
    async upsert(userId: string, input: CreateCheckinInput): Promise<CanonicalHabitCheckin> {
      const db = getFirestoreClient()

      // Deterministic ID based on habit + date
      const checkinId = asId<'checkin'>(`checkin:${input.habitId}_${input.dateKey}`)

      const existing = await this.get(userId, checkinId)

      const checkin: CanonicalHabitCheckin = {
        ...input,
        checkinId,
        userId,
        checkedInAtMs: existing?.checkedInAtMs ?? Date.now(),
        syncState: 'synced',
        version: existing ? existing.version + 1 : 1,
      }

      const checkinDoc = doc(db, `users/${userId}/habitCheckins/${checkinId}`)
      await setDoc(checkinDoc, checkin)

      return checkin
    },

    async update(
      userId: string,
      checkinId: CheckinId,
      updates: UpdateCheckinInput
    ): Promise<CanonicalHabitCheckin> {
      const db = getFirestoreClient()
      const checkinDoc = doc(db, `users/${userId}/habitCheckins/${checkinId}`)

      const existing = await getDoc(checkinDoc)
      if (!existing.exists()) {
        throw new Error(`Checkin ${checkinId} not found`)
      }

      const updated: CanonicalHabitCheckin = {
        ...(existing.data() as CanonicalHabitCheckin),
        ...updates,
        version: (existing.data()?.version ?? 0) + 1,
        syncState: 'synced',
      }

      await setDoc(checkinDoc, updated)
      return updated
    },

    async delete(userId: string, checkinId: CheckinId): Promise<void> {
      const db = getFirestoreClient()
      const checkinDoc = doc(db, `users/${userId}/habitCheckins/${checkinId}`)
      await deleteDoc(checkinDoc)
    },

    async get(userId: string, checkinId: CheckinId): Promise<CanonicalHabitCheckin | null> {
      const db = getFirestoreClient()
      const checkinDoc = doc(db, `users/${userId}/habitCheckins/${checkinId}`)
      const snapshot = await getDoc(checkinDoc)

      if (!snapshot.exists()) return null
      return snapshot.data() as CanonicalHabitCheckin
    },

    async getByHabitAndDate(
      userId: string,
      habitId: HabitId,
      dateKey: string
    ): Promise<CanonicalHabitCheckin | null> {
      const checkinId = asId<'checkin'>(`checkin:${habitId}_${dateKey}`)
      return this.get(userId, checkinId)
    },

    async listForDate(userId: string, dateKey: string): Promise<CanonicalHabitCheckin[]> {
      const db = getFirestoreClient()
      const checkinsCol = collection(db, `users/${userId}/habitCheckins`)
      const q = query(checkinsCol, where('dateKey', '==', dateKey))

      const snapshot = await getDocs(q)
      return snapshot.docs.map((doc) => doc.data() as CanonicalHabitCheckin)
    },

    async listForHabit(
      userId: string,
      habitId: HabitId,
      options?: { limit?: number }
    ): Promise<CanonicalHabitCheckin[]> {
      const db = getFirestoreClient()
      const checkinsCol = collection(db, `users/${userId}/habitCheckins`)

      let q = query(checkinsCol, where('habitId', '==', habitId), orderBy('dateKey', 'desc'))

      if (options?.limit) {
        q = query(q, firestoreLimit(options.limit))
      }

      const snapshot = await getDocs(q)
      return snapshot.docs.map((doc) => doc.data() as CanonicalHabitCheckin)
    },

    async listForDateRange(
      userId: string,
      startDate: string,
      endDate: string
    ): Promise<CanonicalHabitCheckin[]> {
      const db = getFirestoreClient()
      const checkinsCol = collection(db, `users/${userId}/habitCheckins`)
      const q = query(
        checkinsCol,
        where('dateKey', '>=', startDate),
        where('dateKey', '<=', endDate),
        orderBy('dateKey', 'asc')
      )

      const snapshot = await getDocs(q)
      return snapshot.docs.map((doc) => doc.data() as CanonicalHabitCheckin)
    },
  }
}
```

### 2.2 IndexedDB Offline Store

#### `apps/web-vite/src/habits/offlineStore.ts`

```typescript
import { openDB, type IDBPDatabase } from 'idb'
import type { CanonicalHabit, CanonicalHabitCheckin, HabitId } from '@lifeos/habits'

const DB_NAME = 'lifeos-habits'
const DB_VERSION = 1

interface HabitsDB {
  habits: CanonicalHabit
  habitCheckins: CanonicalHabitCheckin
}

let dbPromise: Promise<IDBPDatabase<HabitsDB>> | null = null

export const getHabitsDB = () => {
  if (!dbPromise) {
    dbPromise = openDB<HabitsDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // Habits store
        if (!db.objectStoreNames.contains('habits')) {
          const habitStore = db.createObjectStore('habits', { keyPath: 'habitId' })
          habitStore.createIndex('userId', 'userId')
          habitStore.createIndex('status', 'status')
          habitStore.createIndex('syncState', 'syncState')
        }

        // Check-ins store
        if (!db.objectStoreNames.contains('habitCheckins')) {
          const checkinStore = db.createObjectStore('habitCheckins', { keyPath: 'checkinId' })
          checkinStore.createIndex('userId', 'userId')
          checkinStore.createIndex('dateKey', 'dateKey')
          checkinStore.createIndex('habitId', 'habitId')
          checkinStore.createIndex('syncState', 'syncState')
        }
      },
    })
  }
  return dbPromise
}

// ----- Habits -----

export const saveHabitOffline = async (habit: CanonicalHabit): Promise<void> => {
  const db = await getHabitsDB()
  await db.put('habits', habit)
}

export const getHabitOffline = async (habitId: HabitId): Promise<CanonicalHabit | undefined> => {
  const db = await getHabitsDB()
  return await db.get('habits', habitId)
}

export const listHabitsOffline = async (userId: string): Promise<CanonicalHabit[]> => {
  const db = await getHabitsDB()
  const index = db.transaction('habits').store.index('userId')
  return await index.getAll(userId)
}

export const deleteHabitOffline = async (habitId: HabitId): Promise<void> => {
  const db = await getHabitsDB()
  await db.delete('habits', habitId)
}

// ----- Check-ins -----

export const saveCheckinOffline = async (checkin: CanonicalHabitCheckin): Promise<void> => {
  const db = await getHabitsDB()
  await db.put('habitCheckins', checkin)
}

export const getCheckinOffline = async (
  userId: string,
  habitId: HabitId,
  dateKey: string
): Promise<CanonicalHabitCheckin | undefined> => {
  const db = await getHabitsDB()
  const checkinId = `checkin:${habitId}_${dateKey}` as const
  return await db.get('habitCheckins', checkinId as any)
}

export const listCheckinsForDateOffline = async (
  userId: string,
  dateKey: string
): Promise<CanonicalHabitCheckin[]> => {
  const db = await getHabitsDB()
  const index = db.transaction('habitCheckins').store.index('dateKey')
  const all = await index.getAll(dateKey)
  return all.filter((c) => c.userId === userId)
}

export const listCheckinsForHabitOffline = async (
  habitId: HabitId
): Promise<CanonicalHabitCheckin[]> => {
  const db = await getHabitsDB()
  const index = db.transaction('habitCheckins').store.index('habitId')
  return await index.getAll(habitId)
}

// ----- Sync Queue -----

export const getPendingHabits = async (userId: string): Promise<CanonicalHabit[]> => {
  const db = await getHabitsDB()
  const tx = db.transaction('habits', 'readonly')
  const store = tx.objectStore('habits')
  const all = await store.getAll()
  return all.filter((h) => h.userId === userId && h.syncState === 'pending')
}

export const getPendingCheckins = async (userId: string): Promise<CanonicalHabitCheckin[]> => {
  const db = await getHabitsDB()
  const tx = db.transaction('habitCheckins', 'readonly')
  const store = tx.objectStore('habitCheckins')
  const all = await store.getAll()
  return all.filter((c) => c.userId === userId && c.syncState === 'pending')
}
```

### 2.3 Hooks Implementation

#### `apps/web-vite/src/hooks/useHabitOperations.ts`

```typescript
import { useState, useCallback, useEffect, useRef } from 'react'
import { useAuth } from './useAuth'
import { createFirestoreHabitRepository } from '@/adapters/habits/firestoreHabitRepository'
import { createFirestoreCheckinRepository } from '@/adapters/habits/firestoreCheckinRepository'
import {
  saveHabitOffline,
  listHabitsOffline,
  deleteHabitOffline,
  saveCheckinOffline,
  listCheckinsForDateOffline,
} from '@/habits/offlineStore'
import { toast } from 'sonner'
import type {
  CanonicalHabit,
  CanonicalHabitCheckin,
  HabitId,
  CreateHabitInput,
  UpdateHabitInput,
  CreateCheckinInput,
} from '@lifeos/habits'

const habitRepository = createFirestoreHabitRepository()
const checkinRepository = createFirestoreCheckinRepository()

export interface UseHabitOperationsReturn {
  habits: CanonicalHabit[]
  isLoading: boolean
  error: Error | null

  // Habit CRUD
  createHabit: (input: Omit<CreateHabitInput, 'userId'>) => Promise<CanonicalHabit>
  updateHabit: (habitId: HabitId, updates: UpdateHabitInput) => Promise<CanonicalHabit>
  deleteHabit: (habitId: HabitId) => Promise<void>
  getHabit: (habitId: HabitId) => CanonicalHabit | undefined
  loadHabits: () => Promise<void>

  // Check-in operations
  checkIn: (
    habitId: HabitId,
    dateKey: string,
    status: 'done' | 'tiny' | 'skip',
    options?: {
      moodBefore?: number
      moodAfter?: number
      note?: string
      sourceType?: 'manual' | 'intervention' | 'calendar'
      sourceId?: string
    }
  ) => Promise<CanonicalHabitCheckin>

  getCheckinsForDate: (dateKey: string) => Promise<CanonicalHabitCheckin[]>
}

export function useHabitOperations(): UseHabitOperationsReturn {
  const { user } = useAuth()
  const [habits, setHabits] = useState<CanonicalHabit[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const userId = user?.uid
  const userIdRef = useRef(userId)

  // Reload on user change
  useEffect(() => {
    if (userId && userIdRef.current !== userId) {
      userIdRef.current = userId
      loadHabits()
    }
  }, [userId])

  const loadHabits = useCallback(async () => {
    if (!userId) return

    setIsLoading(true)
    setError(null)

    try {
      // Try offline first
      const offlineHabits = await listHabitsOffline(userId)
      if (offlineHabits.length > 0) {
        setHabits(offlineHabits)
      }

      // Then fetch from Firestore
      const firestoreHabits = await habitRepository.list(userId)

      // Save to IndexedDB
      for (const habit of firestoreHabits) {
        await saveHabitOffline(habit)
      }

      setHabits(firestoreHabits)
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to load habits')
      setError(error)
      toast.error(error.message)
    } finally {
      setIsLoading(false)
    }
  }, [userId])

  const createHabit = useCallback(
    async (input: Omit<CreateHabitInput, 'userId'>): Promise<CanonicalHabit> => {
      if (!userId) throw new Error('User not authenticated')

      const habitInput: CreateHabitInput = {
        ...input,
        userId,
      }

      try {
        const habit = await habitRepository.create(userId, habitInput)

        // Save offline
        await saveHabitOffline(habit)

        // Update state
        setHabits((prev) => [habit, ...prev])

        toast.success('Habit created')
        return habit
      } catch (err) {
        toast.error('Failed to create habit')
        throw err
      }
    },
    [userId]
  )

  const updateHabit = useCallback(
    async (habitId: HabitId, updates: UpdateHabitInput): Promise<CanonicalHabit> => {
      if (!userId) throw new Error('User not authenticated')

      const existing = habits.find((h) => h.habitId === habitId)
      if (!existing) throw new Error('Habit not found')

      const optimistic = { ...existing, ...updates, updatedAtMs: Date.now() }

      // Optimistic update
      setHabits((prev) => prev.map((h) => (h.habitId === habitId ? optimistic : h)))
      await saveHabitOffline(optimistic)

      try {
        const updated = await habitRepository.update(userId, habitId, updates)

        // Sync to offline
        await saveHabitOffline(updated)

        // Update state with server version
        setHabits((prev) => prev.map((h) => (h.habitId === habitId ? updated : h)))

        toast.success('Habit updated')
        return updated
      } catch (err) {
        // Rollback
        setHabits((prev) => prev.map((h) => (h.habitId === habitId ? existing : h)))
        await saveHabitOffline(existing)

        toast.error('Failed to update habit')
        throw err
      }
    },
    [userId, habits]
  )

  const deleteHabit = useCallback(
    async (habitId: HabitId): Promise<void> => {
      if (!userId) throw new Error('User not authenticated')

      const existing = habits.find((h) => h.habitId === habitId)
      if (!existing) return

      // Optimistic delete
      setHabits((prev) => prev.filter((h) => h.habitId !== habitId))
      await deleteHabitOffline(habitId)

      try {
        await habitRepository.delete(userId, habitId)
        toast.success('Habit deleted')
      } catch (err) {
        // Rollback
        setHabits((prev) => [...prev, existing])
        await saveHabitOffline(existing)

        toast.error('Failed to delete habit')
        throw err
      }
    },
    [userId, habits]
  )

  const getHabit = useCallback(
    (habitId: HabitId): CanonicalHabit | undefined => {
      return habits.find((h) => h.habitId === habitId)
    },
    [habits]
  )

  const checkIn = useCallback(
    async (
      habitId: HabitId,
      dateKey: string,
      status: 'done' | 'tiny' | 'skip',
      options?: {
        moodBefore?: number
        moodAfter?: number
        note?: string
        sourceType?: 'manual' | 'intervention' | 'calendar'
        sourceId?: string
      }
    ): Promise<CanonicalHabitCheckin> => {
      if (!userId) throw new Error('User not authenticated')

      const input: CreateCheckinInput = {
        userId,
        habitId,
        dateKey,
        status,
        ...options,
      }

      try {
        const checkin = await checkinRepository.upsert(userId, input)

        // Save offline
        await saveCheckinOffline(checkin)

        toast.success(`Habit marked as ${status}`)
        return checkin
      } catch (err) {
        toast.error('Failed to save check-in')
        throw err
      }
    },
    [userId]
  )

  const getCheckinsForDate = useCallback(
    async (dateKey: string): Promise<CanonicalHabitCheckin[]> => {
      if (!userId) return []

      try {
        // Try offline first
        const offlineCheckins = await listCheckinsForDateOffline(userId, dateKey)

        // Fetch from Firestore in background
        const firestoreCheckins = await checkinRepository.listForDate(userId, dateKey)

        // Save to IndexedDB
        for (const checkin of firestoreCheckins) {
          await saveCheckinOffline(checkin)
        }

        return firestoreCheckins
      } catch (err) {
        console.error('Failed to get check-ins:', err)
        // Return offline data as fallback
        return await listCheckinsForDateOffline(userId, dateKey)
      }
    },
    [userId]
  )

  return {
    habits,
    isLoading,
    error,
    createHabit,
    updateHabit,
    deleteHabit,
    getHabit,
    loadHabits,
    checkIn,
    getCheckinsForDate,
  }
}
```

### 2.4 Unit Tests

#### `packages/habits/src/domain/__tests__/models.test.ts`

```typescript
import { describe, it, expect } from 'vitest'
import type { CanonicalHabit, HabitSchedule } from '../models'

describe('Habits Domain Models', () => {
  describe('HabitSchedule', () => {
    it('should validate days of week', () => {
      const validSchedule: HabitSchedule = {
        daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
        timezone: 'America/New_York',
      }

      expect(validSchedule.daysOfWeek).toHaveLength(7)
      expect(validSchedule.daysOfWeek.every((d) => d >= 0 && d <= 6)).toBe(true)
    })

    it('should support partial week schedules', () => {
      const weekdaysOnly: HabitSchedule = {
        daysOfWeek: [1, 2, 3, 4, 5], // Mon-Fri
        timezone: 'America/New_York',
      }

      expect(weekdaysOnly.daysOfWeek).toHaveLength(5)
    })
  })

  describe('CanonicalHabit', () => {
    it('should have all required fields', () => {
      const habit: Partial<CanonicalHabit> = {
        title: 'Morning meditation',
        domain: 'meditation',
        status: 'active',
      }

      expect(habit.title).toBeDefined()
      expect(habit.domain).toBeDefined()
      expect(habit.status).toBeDefined()
    })
  })
})
```

**Acceptance Criteria:**

- ✅ Habits can be created, updated, deleted via hooks
- ✅ Check-ins work with deterministic IDs
- ✅ Offline storage syncs correctly
- ✅ Optimistic updates work with rollback on error
- ✅ Unit tests pass

---

## Phase 3: Habits Integration

**Duration:** 5-7 days
**Goal:** Habits visible in Today and Weekly Review

### 3.1 Today Page Refactoring

**Current TodayPage structure:**

- Shows calendar events
- Shows tasks
- Shows daily quote

**New structure:**

- Time-based modules (Morning/Work/Evening)
- Each module conditionally visible based on time
- Preserve existing calendar + tasks view

#### `apps/web-vite/src/pages/TodayPage.tsx` (Refactored)

```typescript
import { useEffect, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { MorningModule } from '@/components/today/MorningModule'
import { WorkModule } from '@/components/today/WorkModule'
import { EveningModule } from '@/components/today/EveningModule'
import { TodayTimeline } from '@/components/today/TodayTimeline'

type TimeOfDay = 'morning' | 'work' | 'evening'

const getTimeOfDay = (): TimeOfDay => {
  const hour = new Date().getHours()

  if (hour >= 5 && hour < 12) return 'morning'
  if (hour >= 12 && hour < 17) return 'work'
  return 'evening'
}

export function TodayPage() {
  const { user } = useAuth()
  const [currentPeriod, setCurrentPeriod] = useState<TimeOfDay>(getTimeOfDay())
  const [expandedModule, setExpandedModule] = useState<TimeOfDay | null>(null)

  useEffect(() => {
    // Auto-detect time period
    const interval = setInterval(() => {
      setCurrentPeriod(getTimeOfDay())
    }, 60000) // Check every minute

    return () => clearInterval(interval)
  }, [])

  if (!user) return null

  const dateKey = new Date().toISOString().split('T')[0]

  return (
    <div className="today-page">
      <header className="today-header">
        <h1>Today</h1>
        <p className="date-display">{new Date().toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        })}</p>
      </header>

      <div className="today-modules">
        {/* Morning Module */}
        <div className={`module-card ${currentPeriod === 'morning' ? 'active' : ''}`}>
          <button
            className="module-header"
            onClick={() => setExpandedModule(expandedModule === 'morning' ? null : 'morning')}
          >
            <span className="module-icon">🌅</span>
            <span className="module-title">Morning Setup</span>
            {currentPeriod === 'morning' && <span className="badge">Now</span>}
          </button>

          {(currentPeriod === 'morning' || expandedModule === 'morning') && (
            <MorningModule userId={user.uid} dateKey={dateKey} />
          )}
        </div>

        {/* Work Module */}
        <div className={`module-card ${currentPeriod === 'work' ? 'active' : ''}`}>
          <button
            className="module-header"
            onClick={() => setExpandedModule(expandedModule === 'work' ? null : 'work')}
          >
            <span className="module-icon">💼</span>
            <span className="module-title">Work Mode</span>
            {currentPeriod === 'work' && <span className="badge">Now</span>}
          </button>

          {(currentPeriod === 'work' || expandedModule === 'work') && (
            <WorkModule userId={user.uid} />
          )}
        </div>

        {/* Evening Module */}
        <div className={`module-card ${currentPeriod === 'evening' ? 'active' : ''}`}>
          <button
            className="module-header"
            onClick={() => setExpandedModule(expandedModule === 'evening' ? null : 'evening')}
          >
            <span className="module-icon">🌙</span>
            <span className="module-title">Evening Closeout</span>
            {currentPeriod === 'evening' && <span className="badge">Now</span>}
          </button>

          {(currentPeriod === 'evening' || expandedModule === 'evening') && (
            <EveningModule userId={user.uid} dateKey={dateKey} />
          )}
        </div>
      </div>

      {/* Timeline (Calendar + Tasks) - Always visible */}
      <TodayTimeline userId={user.uid} dateKey={dateKey} />
    </div>
  )
}
```

### 3.2 Today Module Components

#### `apps/web-vite/src/components/today/MorningModule.tsx`

```typescript
import { useEffect, useState } from 'react'
import { useHabitOperations } from '@/hooks/useHabitOperations'
import { useNoteOperations } from '@/hooks/useNoteOperations'
import type { CanonicalHabit } from '@lifeos/habits'

interface MorningModuleProps {
  userId: string
  dateKey: string
}

export function MorningModule({ userId, dateKey }: MorningModuleProps) {
  const { habits } = useHabitOperations()
  const { createNote } = useNoteOperations()

  const [keystoneHabit, setKeystoneHabit] = useState<CanonicalHabit | null>(null)
  const [intention, setIntention] = useState('')
  const [ifThenPlan, setIfThenPlan] = useState('')

  // Get active habits for today
  const todayHabits = habits.filter(h => {
    const dayOfWeek = new Date(dateKey).getDay()
    return h.status === 'active' && h.schedule.daysOfWeek.includes(dayOfWeek)
  })

  const handleSaveMorningJournal = async () => {
    if (!intention && !ifThenPlan) return

    // Create journal note
    await createNote({
      title: `Morning Journal - ${dateKey}`,
      content: {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: `Intention: ${intention}` }] },
          { type: 'paragraph', content: [{ type: 'text', text: `If-then: ${ifThenPlan}` }] }
        ]
      },
      noteType: 'journal',
      journalType: 'morning',
      journalDate: dateKey,
      topicId: null, // Could create "Daily Journals" topic
      sectionId: null,
      projectIds: [],
      okrIds: [],
      tags: ['morning', 'journal']
    })

    // Clear form
    setIntention('')
    setIfThenPlan('')
  }

  return (
    <div className="morning-module">
      {/* Keystone Habit Selection */}
      <div className="keystone-selector">
        <label>Today's keystone habit:</label>
        <select
          value={keystoneHabit?.habitId ?? ''}
          onChange={(e) => {
            const habit = todayHabits.find(h => h.habitId === e.target.value)
            setKeystoneHabit(habit ?? null)
          }}
        >
          <option value="">Select a habit...</option>
          {todayHabits.map(habit => (
            <option key={habit.habitId} value={habit.habitId}>
              {habit.title}
            </option>
          ))}
        </select>
      </div>

      {/* Intention */}
      <div className="intention-input">
        <label>What is your intention for today?</label>
        <input
          type="text"
          placeholder="Focus on..."
          value={intention}
          onChange={(e) => setIntention(e.target.value)}
        />
      </div>

      {/* If-Then Plan */}
      <div className="if-then-input">
        <label>If-then plan:</label>
        <input
          type="text"
          placeholder="If I feel overwhelmed, then I will..."
          value={ifThenPlan}
          onChange={(e) => setIfThenPlan(e.target.value)}
        />
      </div>

      <button
        className="save-button"
        onClick={handleSaveMorningJournal}
        disabled={!intention && !ifThenPlan}
      >
        Save Morning Setup
      </button>
    </div>
  )
}
```

#### `apps/web-vite/src/components/today/WorkModule.tsx`

```typescript
import { useState } from 'react'
import { MindInterventionModal } from '@/components/mind/MindInterventionModal'

interface WorkModuleProps {
  userId: string
}

export function WorkModule({ userId }: WorkModuleProps) {
  const [showInterventionModal, setShowInterventionModal] = useState(false)

  return (
    <div className="work-module">
      <p className="work-description">
        Feeling activated or stressed? Take a moment to reset.
      </p>

      <button
        className="activated-button"
        onClick={() => setShowInterventionModal(true)}
      >
        🚨 I'm Activated - Help me reset
      </button>

      {showInterventionModal && (
        <MindInterventionModal
          isOpen={showInterventionModal}
          onClose={() => setShowInterventionModal(false)}
          userId={userId}
        />
      )}
    </div>
  )
}
```

#### `apps/web-vite/src/components/today/EveningModule.tsx`

```typescript
import { useEffect, useState } from 'react'
import { useHabitOperations } from '@/hooks/useHabitOperations'
import { useNoteOperations } from '@/hooks/useNoteOperations'
import { HabitCheckinCard } from '@/components/habits/HabitCheckinCard'
import type { CanonicalHabit, CanonicalHabitCheckin } from '@lifeos/habits'

interface EveningModuleProps {
  userId: string
  dateKey: string
}

export function EveningModule({ userId, dateKey }: EveningModuleProps) {
  const { habits, getCheckinsForDate, checkIn } = useHabitOperations()
  const { createNote } = useNoteOperations()

  const [checkins, setCheckins] = useState<CanonicalHabitCheckin[]>([])
  const [wins, setWins] = useState('')
  const [challenges, setChallenges] = useState('')
  const [unresolved, setUnresolved] = useState('')

  useEffect(() => {
    loadCheckins()
  }, [dateKey])

  const loadCheckins = async () => {
    const data = await getCheckinsForDate(dateKey)
    setCheckins(data)
  }

  // Get today's scheduled habits
  const dayOfWeek = new Date(dateKey).getDay()
  const todayHabits = habits.filter(h =>
    h.status === 'active' && h.schedule.daysOfWeek.includes(dayOfWeek)
  )

  const handleCheckin = async (habitId: string, status: 'done' | 'tiny' | 'skip') => {
    await checkIn(habitId as any, dateKey, status)
    await loadCheckins()
  }

  const handleSaveEveningJournal = async () => {
    if (!wins && !challenges && !unresolved) return

    await createNote({
      title: `Evening Journal - ${dateKey}`,
      content: {
        type: 'doc',
        content: [
          { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Wins' }] },
          { type: 'paragraph', content: [{ type: 'text', text: wins }] },
          { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Challenges' }] },
          { type: 'paragraph', content: [{ type: 'text', text: challenges }] },
          { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Tomorrow' }] },
          { type: 'paragraph', content: [{ type: 'text', text: unresolved }] }
        ]
      },
      noteType: 'journal',
      journalType: 'evening',
      journalDate: dateKey,
      topicId: null,
      sectionId: null,
      projectIds: [],
      okrIds: [],
      tags: ['evening', 'journal']
    })

    setWins('')
    setChallenges('')
    setUnresolved('')
  }

  return (
    <div className="evening-module">
      {/* Habit Check-ins */}
      <div className="habit-checkins">
        <h3>Today's Habits</h3>
        {todayHabits.map(habit => {
          const checkin = checkins.find(c => c.habitId === habit.habitId)

          return (
            <HabitCheckinCard
              key={habit.habitId}
              habit={habit}
              checkin={checkin}
              onCheckIn={(status) => handleCheckin(habit.habitId, status)}
            />
          )
        })}
      </div>

      {/* Evening Journal */}
      <div className="evening-journal">
        <h3>Reflection</h3>

        <div className="journal-prompt">
          <label>What went well today?</label>
          <textarea
            placeholder="I accomplished..."
            value={wins}
            onChange={(e) => setWins(e.target.value)}
            rows={3}
          />
        </div>

        <div className="journal-prompt">
          <label>What was challenging?</label>
          <textarea
            placeholder="I struggled with..."
            value={challenges}
            onChange={(e) => setChallenges(e.target.value)}
            rows={3}
          />
        </div>

        <div className="journal-prompt">
          <label>What needs attention tomorrow?</label>
          <textarea
            placeholder="Follow up on..."
            value={unresolved}
            onChange={(e) => setUnresolved(e.target.value)}
            rows={2}
          />
        </div>

        <button
          className="save-button"
          onClick={handleSaveEveningJournal}
          disabled={!wins && !challenges && !unresolved}
        >
          Save Evening Reflection
        </button>
      </div>
    </div>
  )
}
```

#### `apps/web-vite/src/components/today/TodayTimeline.tsx`

```typescript
// This preserves the existing Today view (calendar + tasks)
import { useCalendarEvents } from '@/hooks/useCalendarEvents'
import { useTodoOperations } from '@/hooks/useTodoOperations'
import { AgendaView } from '@/components/AgendaView'
import { TaskList } from '@/components/TaskList'

interface TodayTimelineProps {
  userId: string
  dateKey: string
}

export function TodayTimeline({ userId, dateKey }: TodayTimelineProps) {
  const { events } = useCalendarEvents({ userId })
  const { tasks } = useTodoOperations({ userId })

  // Filter events for today
  const todayEvents = events.filter(e => {
    const eventDate = new Date(e.startTimeMs).toISOString().split('T')[0]
    return eventDate === dateKey
  })

  // Filter tasks due today
  const todayTasks = tasks.filter(t => {
    if (!t.dueDate) return false
    const taskDate = new Date(t.dueDate).toISOString().split('T')[0]
    return taskDate === dateKey
  })

  return (
    <div className="today-timeline">
      <h2>Schedule & Tasks</h2>

      <div className="timeline-section">
        <h3>Calendar</h3>
        <AgendaView events={todayEvents} />
      </div>

      <div className="timeline-section">
        <h3>Tasks Due Today</h3>
        <TaskList tasks={todayTasks} />
      </div>
    </div>
  )
}
```

### 3.3 Habit Components

#### `apps/web-vite/src/components/habits/HabitCheckinCard.tsx`

```typescript
import type { CanonicalHabit, CanonicalHabitCheckin } from '@lifeos/habits'

interface HabitCheckinCardProps {
  habit: CanonicalHabit
  checkin?: CanonicalHabitCheckin
  onCheckIn: (status: 'done' | 'tiny' | 'skip') => void
}

export function HabitCheckinCard({ habit, checkin, onCheckIn }: HabitCheckinCardProps) {
  return (
    <div className={`habit-checkin-card ${checkin ? 'checked-in' : ''}`}>
      <div className="habit-info">
        <h4>{habit.title}</h4>
        <p className="tiny-version">{habit.recipe.tinyVersion.description}</p>
      </div>

      <div className="checkin-buttons">
        <button
          className={`checkin-btn done ${checkin?.status === 'done' ? 'active' : ''}`}
          onClick={() => onCheckIn('done')}
          title={habit.recipe.standardVersion.description}
        >
          ✓ Done
        </button>

        <button
          className={`checkin-btn tiny ${checkin?.status === 'tiny' ? 'active' : ''}`}
          onClick={() => onCheckIn('tiny')}
          title={habit.recipe.tinyVersion.description}
        >
          ~ Tiny
        </button>

        <button
          className={`checkin-btn skip ${checkin?.status === 'skip' ? 'active' : ''}`}
          onClick={() => onCheckIn('skip')}
        >
          – Skip
        </button>
      </div>

      {checkin && (
        <div className="checkin-status">
          Logged as: <strong>{checkin.status}</strong>
        </div>
      )}
    </div>
  )
}
```

### 3.4 Acceptance Criteria

- ✅ Today page shows time-based modules
- ✅ Morning module saves journal entry as Note
- ✅ Evening module shows all scheduled habits for the day
- ✅ Check-ins persist to Firestore and IndexedDB
- ✅ Existing calendar + tasks view preserved in Timeline section
- ✅ Works offline

---

## Phase 4: Mind Engine

**Duration:** 7-10 days
**Goal:** Full Mind intervention system with auto-habit-linking

_Due to length constraints, I'll provide a summary of Phase 4-5. Would you like me to create separate detailed documents for these phases?_

### Summary:

**Phase 4 includes:**

- Mind Engine package implementation
- Intervention presets (breathing, CBT, ACT, Gestalt)
- Session logging with responses
- Auto-linking to meditation/mindfulness habits
- MindInterventionModal UI with step runner
- Integration with Work Module

**Phase 5 includes:**

- Weekly Review integration
- Habit progress charts
- Recommendations engine
- Calendar projection for habits
- Performance optimization
- Polish and testing

---

## Testing Strategy

### Unit Tests

- Domain model validation
- Repository interfaces
- Progress calculation logic

### Integration Tests

- Offline-first workflow
- Sync queue processing
- Habit check-in deterministic IDs

### E2E Tests

- Complete Today flow (morning → work → evening)
- Habit creation and check-in
- Mind intervention to habit linking

---

## Deployment Checklist

- [ ] Firestore indexes deployed
- [ ] Security rules deployed
- [ ] Domain packages built and published
- [ ] Web app built without errors
- [ ] E2E tests pass
- [ ] Performance audit
- [ ] Documentation updated

---

## Future Enhancements (Post-Launch)

- Advanced streak calculations with recovery windows
- Habit templates library
- Social accountability features
- Wearable integration
- Advanced CBT/ACT interventions
- Habit stacking recommendations

---

**END OF PLAN**
