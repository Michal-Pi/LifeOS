/**
 * Demo Training Data Seeder
 *
 * Populates IndexedDB with a realistic workout plan and today's session
 * for the demo account. Called when ?demo=true is in the URL.
 *
 * Uses existing offline store functions to write to IndexedDB.
 */

import type {
  WorkoutPlan,
  WorkoutSession,
  PlanId,
  SessionId,
  WorkoutDaySchedule,
} from '@lifeos/training'
import { savePlanLocally, saveSessionLocally, getActivePlanLocally } from '@/training/offlineStore'
import { logger } from '@/lib/logger'

function randomId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}` as string
}

/**
 * Weekly schedule: maps dayOfWeek (0=Sun) to workout focus and context.
 */
const WEEKLY_SCHEDULE: WorkoutDaySchedule[] = [
  // Sunday — Rest
  { dayOfWeek: 0, restDay: true, blocks: [] },
  // Monday — Upper Body Strength (gym)
  {
    dayOfWeek: 1,
    blocks: [
      { category: 'upper_body', timeMinutes: 45 },
      { category: 'core', timeMinutes: 10 },
    ],
  },
  // Tuesday — Running + Core (road)
  {
    dayOfWeek: 2,
    blocks: [
      { category: 'cardio', timeMinutes: 35 },
      { category: 'core', timeMinutes: 15 },
    ],
  },
  // Wednesday — Lower Body Strength (gym)
  {
    dayOfWeek: 3,
    blocks: [
      { category: 'lower_body', timeMinutes: 45 },
      { category: 'mobility_stability', timeMinutes: 10 },
    ],
  },
  // Thursday — Yoga + Mobility (home)
  {
    dayOfWeek: 4,
    blocks: [
      { category: 'yoga', timeMinutes: 40 },
      { category: 'mobility_stability', timeMinutes: 15 },
    ],
  },
  // Friday — Upper Body Hypertrophy (gym)
  {
    dayOfWeek: 5,
    blocks: [
      { category: 'upper_body', timeMinutes: 50 },
      { category: 'arms', timeMinutes: 10 },
    ],
  },
  // Saturday — Long Run (road)
  {
    dayOfWeek: 6,
    blocks: [{ category: 'cardio', timeMinutes: 60 }],
  },
]

/** Map day of week to primary workout context */
const DAY_CONTEXT: Record<number, 'gym' | 'home' | 'road'> = {
  0: 'home', // Rest (unused)
  1: 'gym',
  2: 'road',
  3: 'gym',
  4: 'home',
  5: 'gym',
  6: 'road',
}

/** Map day of week to session title */
const DAY_TITLE: Record<number, string> = {
  0: 'Rest Day',
  1: 'Upper Body Strength',
  2: 'Running + Core',
  3: 'Lower Body Strength',
  4: 'Yoga + Mobility',
  5: 'Upper Body Hypertrophy',
  6: 'Long Run',
}

/**
 * Seeds demo training data into IndexedDB.
 * Idempotent — skips if an active plan already exists for this user.
 */
export async function seedDemoTrainingData(userId: string, dateKey: string): Promise<void> {
  // Check if already seeded
  const existingPlan = await getActivePlanLocally(userId)
  if (existingPlan) {
    logger.debug('[Demo] Active workout plan already exists, skipping training seed.')
    return
  }

  const now = Date.now()
  const planId = randomId('plan') as PlanId

  const plan: WorkoutPlan = {
    planId,
    userId,
    active: true,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    startDateKey: dateKey,
    schedule: WEEKLY_SCHEDULE,
    createdAtMs: now - 14 * 86400000, // "Created 2 weeks ago"
    updatedAtMs: now,
    syncState: 'synced',
    version: 1,
  }

  await savePlanLocally(plan)

  // Create today's session (if not a rest day)
  const dayOfWeek = new Date(dateKey).getDay()
  if (dayOfWeek !== 0) {
    const sessionId = randomId('session') as SessionId
    const session: WorkoutSession = {
      sessionId,
      userId,
      dateKey,
      context: DAY_CONTEXT[dayOfWeek],
      title: DAY_TITLE[dayOfWeek],
      status: 'planned',
      items: [],
      createdAtMs: now,
      updatedAtMs: now,
      syncState: 'synced',
      version: 1,
    }
    await saveSessionLocally(session)
  }

  logger.debug("[Demo] Training data seeded: workout plan + today's session.")
}
