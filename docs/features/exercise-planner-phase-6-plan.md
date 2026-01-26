# Phase 6: Exercise Planner - Implementation Plan

**Version:** 1.0
**Created:** 2025-12-27
**Status:** Planning → Implementation

## Executive Summary

Implement a structured exercise planning and logging system integrated with LifeOS Today, Calendar, and Weekly Review. Users can define weekly workout plans with three variants per day (Gym/Home/Road) and log actual performance with sets/reps/weight tracking.

## Scope

Based on PRD Addendum (lines 512-853), this phase implements:

1. **Training domain package** (`packages/training`)
2. **Exercise library** - User-specific exercise catalog
3. **Workout templates** - Pre-planned workouts for each context
4. **Workout plans** - Weekly schedule mapping days to templates
5. **Session logging** - Actual performance tracking
6. **Today integration** - Training module with variant selection
7. **Weekly Review** - Training consistency and volume summary
8. **Habit auto-linking** - Completed sessions auto-check exercise habit

## Implementation Phases

### Chapter T1: Training Domain Package (Steps 1-6)

### Chapter T2: Firestore Adapters & Hooks (Steps 7-12)

### Chapter T3: UI Components (Steps 13-18)

### Chapter T4: Integration & Polish (Steps 19-22)

---

## Step-by-Step Implementation

### STEP 1: Create training package scaffold

**Files to create:**

- `packages/training/package.json`
- `packages/training/tsconfig.json`
- `packages/training/tsup.config.ts`
- `packages/training/vitest.config.ts`
- `packages/training/src/index.ts`

**package.json:**

```json
{
  "name": "@lifeos/training",
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

### STEP 2: Define domain models

**File:** `packages/training/src/domain/models.ts`

```typescript
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
```

### STEP 3: Create repository ports

**Files:**

- `packages/training/src/ports/exerciseLibraryRepository.ts`
- `packages/training/src/ports/workoutTemplateRepository.ts`
- `packages/training/src/ports/workoutPlanRepository.ts`
- `packages/training/src/ports/workoutSessionRepository.ts`

### STEP 4: Add Zod validation schemas

**File:** `packages/training/src/domain/validation.ts`

Validation for all domain models using Zod.

### STEP 5: Create package index

**File:** `packages/training/src/index.ts`

Export all models, ports, and validation schemas.

### STEP 6: Build training package

Run `pnpm turbo build --filter=@lifeos/training`

---

### STEP 7: Create Firestore adapters

**Files:**

- `apps/web-vite/src/adapters/training/firestoreExerciseLibraryRepository.ts`
- `apps/web-vite/src/adapters/training/firestoreWorkoutTemplateRepository.ts`
- `apps/web-vite/src/adapters/training/firestoreWorkoutPlanRepository.ts`
- `apps/web-vite/src/adapters/training/firestoreWorkoutSessionRepository.ts`

### STEP 8: Add Firestore indexes

**File:** Update `firestore.indexes.json` (or create if doesn't exist)

```json
{
  "indexes": [
    {
      "collectionGroup": "workoutSessions",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "userId", "order": "ASCENDING" },
        { "fieldPath": "dateKey", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "workoutSessions",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "userId", "order": "ASCENDING" },
        { "fieldPath": "dateKey", "order": "ASCENDING" },
        { "fieldPath": "context", "order": "ASCENDING" }
      ]
    }
  ]
}
```

### STEP 9: Create React hooks

**Files:**

- `apps/web-vite/src/hooks/useExerciseLibrary.ts`
- `apps/web-vite/src/hooks/useWorkoutTemplates.ts`
- `apps/web-vite/src/hooks/useWorkoutPlan.ts`
- `apps/web-vite/src/hooks/useWorkoutSession.ts`
- `apps/web-vite/src/hooks/useTrainingToday.ts` (composite hook)

### STEP 10: Add IndexedDB offline support

**File:** `apps/web-vite/src/training/offlineStore.ts`

Similar pattern to habits offline store.

### STEP 11: Create default exercises

**File:** `apps/web-vite/src/utils/defaultExercises.ts`

Seed library with common exercises (bench press, squat, etc.)

### STEP 12: Build and test infrastructure

Run typecheck and build for web-vite.

---

### STEP 13: Create Today Training Module

**File:** `apps/web-vite/src/components/training/TodayTrainingModule.tsx`

Shows 3 variant cards (Gym/Home/Road) with "Start" buttons.

### STEP 14: Create Workout Session Screen

**File:** `apps/web-vite/src/components/training/WorkoutSessionScreen.tsx`

Exercise list with set logging UI, bulk set creator, complete button.

### STEP 15: Create Set Logging Components

**Files:**

- `apps/web-vite/src/components/training/ExerciseRow.tsx`
- `apps/web-vite/src/components/training/SetRow.tsx`
- `apps/web-vite/src/components/training/BulkSetCreator.tsx`

### STEP 16: Create Template Editor

**File:** `apps/web-vite/src/components/training/TemplateEditor.tsx`

Basic UI to create/edit templates and plan schedule.

### STEP 17: Add CSS styling

**File:** `apps/web-vite/src/styles/training.css`

All training-related styles with mobile responsiveness.

### STEP 18: Import CSS in main

Update `apps/web-vite/src/main.tsx` to import training.css

---

### STEP 19: Integrate with Today Page

Update `apps/web-vite/src/pages/TodayPage.tsx` to include TodayTrainingModule.

### STEP 20: Add Weekly Review training summary

**File:** `apps/web-vite/src/components/weeklyReview/TrainingStep.tsx`

Shows sessions completed, total minutes, consistency by context.

### STEP 21: Integrate Weekly Review

Update `apps/web-vite/src/pages/WeeklyReviewPage.tsx` to include TrainingStep.

### STEP 22: Auto-link to exercise habit

Update workout session completion to auto-upsert exercise habit check-in.

---

## Acceptance Criteria

- ✅ User can create exercise library items
- ✅ User can define workout templates for gym/home/road
- ✅ User can create weekly workout plan
- ✅ Today shows 3 variant cards with start buttons
- ✅ User can start session and log: bench press 5x8x50kg
- ✅ Session works offline and syncs
- ✅ Weekly Review shows training consistency
- ✅ Completing workout auto-checks exercise habit

## Testing Strategy

- Unit tests for domain models
- Integration tests for repositories
- E2E test: Create template → Start session → Log sets → Complete → Verify habit check-in

---

**Ready to implement. Let's go!**
