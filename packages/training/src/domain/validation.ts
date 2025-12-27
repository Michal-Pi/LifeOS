import { z } from 'zod'

// ----- Enums -----

export const ExerciseCategorySchema = z.enum([
  'push',
  'pull',
  'legs',
  'core',
  'conditioning',
  'mobility',
  'other',
])

export const WorkoutContextSchema = z.enum(['gym', 'home', 'road'])

export const SessionStatusSchema = z.enum(['planned', 'in_progress', 'completed', 'skipped'])

export const SyncStateSchema = z.enum(['synced', 'pending', 'conflict'])

// ----- Target Types -----

const SetsRepsTargetSchema = z.object({
  type: z.literal('sets_reps'),
  sets: z.number().int().positive(),
  reps: z.union([
    z.number().int().positive(),
    z.object({
      min: z.number().int().positive(),
      max: z.number().int().positive(),
    }),
  ]),
  weightKg: z.number().positive().optional(),
})

const TimeTargetSchema = z.object({
  type: z.literal('time'),
  seconds: z.number().int().positive(),
})

const DistanceTargetSchema = z.object({
  type: z.literal('distance'),
  meters: z.number().positive(),
})

const RepsTargetSchema = z.object({
  type: z.literal('reps'),
  reps: z.number().int().positive(),
})

const RpeTargetSchema = z.object({
  type: z.literal('rpe'),
  rpe: z.number().int().min(1).max(10),
})

export const TargetTypeSchema = z.discriminatedUnion('type', [
  SetsRepsTargetSchema,
  TimeTargetSchema,
  DistanceTargetSchema,
  RepsTargetSchema,
  RpeTargetSchema,
])

// ----- Exercise Library -----

export const ExerciseLibraryItemSchema = z.object({
  exerciseId: z.string(),
  userId: z.string(),
  name: z.string().min(1),
  category: ExerciseCategorySchema.optional(),
  equipment: z.array(z.string()).optional(),
  defaultMetrics: z.array(z.enum(['sets_reps_weight', 'time', 'distance', 'reps_only', 'rpe'])),
  archived: z.boolean(),
  createdAtMs: z.number(),
  updatedAtMs: z.number(),
  syncState: SyncStateSchema,
  version: z.number().int().positive(),
})

// ----- Workout Templates -----

export const WorkoutTemplateItemSchema = z.object({
  exerciseId: z.string(),
  displayName: z.string().optional(),
  target: TargetTypeSchema,
  notes: z.string().optional(),
})

export const WorkoutTemplateSchema = z.object({
  templateId: z.string(),
  userId: z.string(),
  title: z.string().min(1),
  context: WorkoutContextSchema,
  items: z.array(WorkoutTemplateItemSchema),
  createdAtMs: z.number(),
  updatedAtMs: z.number(),
  syncState: SyncStateSchema,
  version: z.number().int().positive(),
})

// ----- Workout Plans -----

export const WorkoutDayScheduleSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  variants: z.object({
    gymTemplateId: z.string().optional(),
    homeTemplateId: z.string().optional(),
    roadTemplateId: z.string().optional(),
  }),
  defaultContext: WorkoutContextSchema.optional(),
  restDay: z.boolean().optional(),
})

export const WorkoutPlanSchema = z.object({
  planId: z.string(),
  userId: z.string(),
  active: z.boolean(),
  timezone: z.string(),
  startDateKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  schedule: z.array(WorkoutDayScheduleSchema),
  createdAtMs: z.number(),
  updatedAtMs: z.number(),
  syncState: SyncStateSchema,
  version: z.number().int().positive(),
})

// ----- Workout Sessions -----

export const SetPerformanceSchema = z.object({
  setIndex: z.number().int().nonnegative(),
  reps: z.number().int().positive().optional(),
  weightKg: z.number().positive().optional(),
  rpe: z.number().int().min(1).max(10).optional(),
  isWarmup: z.boolean().optional(),
})

export const ExercisePerformanceSchema = z.object({
  exerciseId: z.string(),
  displayName: z.string().optional(),
  sets: z.array(SetPerformanceSchema).optional(),
  metrics: z
    .object({
      timeSec: z.number().int().positive().optional(),
      distanceM: z.number().positive().optional(),
      reps: z.number().int().positive().optional(),
      rpe: z.number().int().min(1).max(10).optional(),
    })
    .optional(),
  notes: z.string().optional(),
})

export const WorkoutSessionSchema = z.object({
  sessionId: z.string(),
  userId: z.string(),
  dateKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  context: WorkoutContextSchema,
  templateId: z.string().optional(),
  title: z.string().optional(),
  status: SessionStatusSchema,
  startedAtMs: z.number().optional(),
  completedAtMs: z.number().optional(),
  durationSec: z.number().int().positive().optional(),
  items: z.array(ExercisePerformanceSchema),
  notes: z.string().optional(),
  createdAtMs: z.number(),
  updatedAtMs: z.number(),
  syncState: SyncStateSchema,
  version: z.number().int().positive(),
})
