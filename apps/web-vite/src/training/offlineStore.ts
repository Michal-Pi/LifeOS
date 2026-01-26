/**
 * Offline Storage for Training
 *
 * IndexedDB schema for exercise library, templates, plans, and sessions.
 * Provides CRUD operations with sync state tracking.
 */

import { openDB, type IDBPDatabase } from 'idb'
import type {
  ExerciseLibraryItem,
  ExerciseId,
  WorkoutTemplate,
  TemplateId,
  WorkoutPlan,
  PlanId,
  WorkoutSession,
  SessionId,
  WorkoutContext,
} from '@lifeos/training'

const DB_NAME = 'lifeos-training'
const DB_VERSION = 1

const EXERCISE_STORE = 'exerciseLibrary'
const TEMPLATE_STORE = 'workoutTemplates'
const PLAN_STORE = 'workoutPlans'
const SESSION_STORE = 'workoutSessions'

let dbPromise: Promise<IDBPDatabase> | null = null

async function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(EXERCISE_STORE)) {
          const store = db.createObjectStore(EXERCISE_STORE, { keyPath: 'exerciseId' })
          store.createIndex('userId', 'userId')
          store.createIndex('category', 'category')
          store.createIndex('archived', 'archived')
          store.createIndex('syncState', 'syncState')
          store.createIndex('userId_category', ['userId', 'category'])
        }

        if (!db.objectStoreNames.contains(TEMPLATE_STORE)) {
          const store = db.createObjectStore(TEMPLATE_STORE, { keyPath: 'templateId' })
          store.createIndex('userId', 'userId')
          store.createIndex('context', 'context')
          store.createIndex('syncState', 'syncState')
          store.createIndex('userId_context', ['userId', 'context'])
        }

        if (!db.objectStoreNames.contains(PLAN_STORE)) {
          const store = db.createObjectStore(PLAN_STORE, { keyPath: 'planId' })
          store.createIndex('userId', 'userId')
          store.createIndex('active', 'active')
          store.createIndex('syncState', 'syncState')
          store.createIndex('userId_active', ['userId', 'active'])
        }

        if (!db.objectStoreNames.contains(SESSION_STORE)) {
          const store = db.createObjectStore(SESSION_STORE, { keyPath: 'sessionId' })
          store.createIndex('userId', 'userId')
          store.createIndex('dateKey', 'dateKey')
          store.createIndex('context', 'context')
          store.createIndex('syncState', 'syncState')
          store.createIndex('updatedAtMs', 'updatedAtMs')
          store.createIndex('userId_dateKey', ['userId', 'dateKey'])
          store.createIndex('userId_dateKey_context', ['userId', 'dateKey', 'context'])
        }
      },
    })
  }
  return dbPromise
}

export function __resetTrainingDbForTests(): void {
  dbPromise = null
}

// ============================================================================
// Exercise Library
// ============================================================================

export async function saveExerciseLocally(item: ExerciseLibraryItem): Promise<void> {
  const db = await getDb()
  await db.put(EXERCISE_STORE, item)
}

export async function getExerciseLocally(
  exerciseId: ExerciseId
): Promise<ExerciseLibraryItem | null> {
  const db = await getDb()
  return (await db.get(EXERCISE_STORE, exerciseId)) ?? null
}

export async function deleteExerciseLocally(exerciseId: ExerciseId): Promise<void> {
  const db = await getDb()
  await db.delete(EXERCISE_STORE, exerciseId)
}

export async function listExercisesLocally(userId: string): Promise<ExerciseLibraryItem[]> {
  // Guard against invalid userId (empty string, null, undefined)
  if (!userId || userId.trim() === '') {
    return []
  }

  const db = await getDb()
  const index = db.transaction(EXERCISE_STORE).store.index('userId')
  return index.getAll(userId)
}

export async function listExercisesByCategoryLocally(
  userId: string,
  category: ExerciseLibraryItem['category']
): Promise<ExerciseLibraryItem[]> {
  // Guard against invalid userId (empty string, null, undefined)
  if (!userId || userId.trim() === '') {
    return []
  }

  const db = await getDb()
  const index = db.transaction(EXERCISE_STORE).store.index('userId_category')
  return index.getAll([userId, category])
}

// ============================================================================
// Workout Templates
// ============================================================================

export async function saveTemplateLocally(template: WorkoutTemplate): Promise<void> {
  const db = await getDb()
  await db.put(TEMPLATE_STORE, template)
}

export async function getTemplateLocally(templateId: TemplateId): Promise<WorkoutTemplate | null> {
  const db = await getDb()
  return (await db.get(TEMPLATE_STORE, templateId)) ?? null
}

export async function deleteTemplateLocally(templateId: TemplateId): Promise<void> {
  const db = await getDb()
  await db.delete(TEMPLATE_STORE, templateId)
}

export async function listTemplatesLocally(userId: string): Promise<WorkoutTemplate[]> {
  // Guard against invalid userId (empty string, null, undefined)
  if (!userId || userId.trim() === '') {
    return []
  }

  const db = await getDb()
  const index = db.transaction(TEMPLATE_STORE).store.index('userId')
  return index.getAll(userId)
}

export async function listTemplatesByContextLocally(
  userId: string,
  context: WorkoutContext
): Promise<WorkoutTemplate[]> {
  // Guard against invalid userId (empty string, null, undefined)
  if (!userId || userId.trim() === '') {
    return []
  }

  const db = await getDb()
  const index = db.transaction(TEMPLATE_STORE).store.index('userId_context')
  return index.getAll([userId, context])
}

// ============================================================================
// Workout Plans
// ============================================================================

export async function savePlanLocally(plan: WorkoutPlan): Promise<void> {
  const db = await getDb()
  await db.put(PLAN_STORE, plan)
}

export async function getPlanLocally(planId: PlanId): Promise<WorkoutPlan | null> {
  const db = await getDb()
  return (await db.get(PLAN_STORE, planId)) ?? null
}

export async function deletePlanLocally(planId: PlanId): Promise<void> {
  const db = await getDb()
  await db.delete(PLAN_STORE, planId)
}

export async function listPlansLocally(userId: string): Promise<WorkoutPlan[]> {
  // Guard against invalid userId (empty string, null, undefined)
  if (!userId || userId.trim() === '') {
    return []
  }

  const db = await getDb()
  const index = db.transaction(PLAN_STORE).store.index('userId')
  return index.getAll(userId)
}

export async function getActivePlanLocally(userId: string): Promise<WorkoutPlan | null> {
  // Guard against invalid userId (empty string, null, undefined)
  if (!userId || userId.trim() === '') {
    return null
  }

  const db = await getDb()
  const index = db.transaction(PLAN_STORE).store.index('userId_active')
  const plans = await index.getAll([userId, true])
  if (plans.length === 0) return null
  return plans.sort((a, b) => b.startDateKey.localeCompare(a.startDateKey))[0] ?? null
}

// ============================================================================
// Workout Sessions
// ============================================================================

export async function saveSessionLocally(session: WorkoutSession): Promise<void> {
  const db = await getDb()
  await db.put(SESSION_STORE, session)
}

export async function getSessionLocally(sessionId: SessionId): Promise<WorkoutSession | null> {
  const db = await getDb()
  return (await db.get(SESSION_STORE, sessionId)) ?? null
}

export async function deleteSessionLocally(sessionId: SessionId): Promise<void> {
  const db = await getDb()
  await db.delete(SESSION_STORE, sessionId)
}

export async function listSessionsLocally(userId: string): Promise<WorkoutSession[]> {
  // Guard against invalid userId (empty string, null, undefined)
  if (!userId || userId.trim() === '') {
    return []
  }

  const db = await getDb()
  const index = db.transaction(SESSION_STORE).store.index('userId')
  return index.getAll(userId)
}

export async function listSessionsByDateLocally(
  userId: string,
  dateKey: string
): Promise<WorkoutSession[]> {
  // Guard against invalid userId (empty string, null, undefined)
  if (!userId || userId.trim() === '') {
    return []
  }

  const db = await getDb()
  const index = db.transaction(SESSION_STORE).store.index('userId_dateKey')
  return index.getAll([userId, dateKey])
}

export async function getSessionByDateAndContextLocally(
  userId: string,
  dateKey: string,
  context: WorkoutContext
): Promise<WorkoutSession | null> {
  // Guard against invalid userId (empty string, null, undefined)
  if (!userId || userId.trim() === '') {
    return null
  }

  const db = await getDb()
  const index = db.transaction(SESSION_STORE).store.index('userId_dateKey_context')
  const sessions = await index.getAll([userId, dateKey, context])
  return sessions[0] ?? null
}

export async function listSessionsForDateRangeLocally(
  userId: string,
  startDate: string,
  endDate: string
): Promise<WorkoutSession[]> {
  const sessions = await listSessionsLocally(userId)
  return sessions.filter((s) => s.dateKey >= startDate && s.dateKey <= endDate)
}
