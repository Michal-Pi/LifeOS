/**
 * Workout AI Tools Domain Types
 *
 * Defines the structure for configurable AI tools used in workout planning.
 */

import type {
  ExerciseId,
  ExerciseTypeCategory,
  WorkoutContext,
  WorkoutDaySchedule,
} from '@lifeos/training'

// ----- Tool IDs -----

export type WorkoutAIToolId = 'createPlan' | 'populateExercises'

// ----- Configuration -----

export interface WorkoutAIToolConfig {
  toolId: WorkoutAIToolId
  name: string
  description: string
  systemPrompt: string
  modelName: string
  maxTokens: number
  enabled: boolean
  updatedAtMs?: number
}

export interface WorkoutAIToolSettings {
  tools: Record<WorkoutAIToolId, WorkoutAIToolConfig>
  version: number
  updatedAtMs: number
}

// ----- AI Output Types -----

export type InferredWorkoutContext = WorkoutContext | 'mixed'

export interface GeneratedDaySchedule {
  dayOfWeek: number
  restDay?: boolean
  blocks?: Array<{
    category: ExerciseTypeCategory
    timeMinutes: number
    notes?: string
  }>
}

export interface GeneratedWorkoutPlan {
  schedule: GeneratedDaySchedule[]
  context: InferredWorkoutContext
  totalWeeklyMinutes: number
  summary: string
}

export interface ExercisePopulationUpdate {
  dayOfWeek: number
  blockIndex: number
  exerciseIds: ExerciseId[]
  reasoning: string
}

export interface ExercisePopulationResult {
  updatedBlocks: ExercisePopulationUpdate[]
  totalExercisesAdded: number
  summary: string
}

// ----- Default Configurations -----

export const DEFAULT_WORKOUT_AI_TOOLS: Record<WorkoutAIToolId, WorkoutAIToolConfig> = {
  createPlan: {
    toolId: 'createPlan',
    name: 'Create Workout Plan',
    description: 'Generate a weekly workout plan based on your goals and availability',
    systemPrompt: `You are an expert fitness coach specializing in personalized workout programming.

Create a comprehensive weekly workout plan based on the user's input. Consider:
- Time availability mentioned in their prompt
- Focus areas (e.g., strength, cardio, flexibility, hypertrophy)
- Workout context (gym, home, or road/travel) - infer from their description
- Recovery needs and rest days (include at least 1-2 rest days per week)
- Balanced muscle group training throughout the week

Categories available: lower_body, upper_body, arms, core, mobility_stability, cardio, yoga

Guidelines:
- Be conservative with time - a 45-minute session is substantial
- Don't schedule the same muscle groups on consecutive days
- Include mobility/warm-up time in block allocations
- For strength focus: prioritize compound movements in upper_body and lower_body
- For cardio focus: mix cardio with mobility_stability for recovery
- If the user mentions a specific methodology (5/3/1, PPL, GZCL, PHUL, etc.), follow that methodology's programming principles accurately
- For hypertrophy: aim for 10-20 sets per muscle group per week
- For strength: prioritize the big compound lifts with adequate recovery between sessions

Output a JSON object with this exact structure:
{
  "schedule": [
    { "dayOfWeek": 0, "restDay": true },
    { "dayOfWeek": 1, "blocks": [{ "category": "upper_body", "timeMinutes": 30 }, { "category": "core", "timeMinutes": 15 }] },
    { "dayOfWeek": 2, "blocks": [{ "category": "lower_body", "timeMinutes": 40 }] },
    { "dayOfWeek": 3, "restDay": true },
    { "dayOfWeek": 4, "blocks": [{ "category": "upper_body", "timeMinutes": 30 }] },
    { "dayOfWeek": 5, "blocks": [{ "category": "cardio", "timeMinutes": 30 }] },
    { "dayOfWeek": 6, "blocks": [{ "category": "mobility_stability", "timeMinutes": 20 }] }
  ],
  "context": "gym",
  "totalWeeklyMinutes": 165,
  "summary": "4-day strength-focused program with cardio and mobility"
}

IMPORTANT: Output ONLY valid JSON, no additional text or explanation.`,
    modelName: 'claude-sonnet-4-5',
    maxTokens: 4096,
    enabled: true,
  },
  populateExercises: {
    toolId: 'populateExercises',
    name: 'Populate Exercises',
    description: 'Fill workout plan blocks with specific exercises from your library',
    systemPrompt: `You are a fitness programming expert. Given a workout plan with exercise blocks and the user's exercise library, select appropriate exercises to fill ONLY the blocks that are missing exercises.

CRITICAL RULES:
1. ONLY populate blocks where exerciseIds is empty, undefined, or missing
2. Do NOT modify blocks that already have exercises assigned
3. Match exercises STRICTLY by category - only select exercises where category matches the block's category
4. Consider the workout context (gym, home, road) and select appropriate variants

Selection Guidelines:
- Time allocation: suggest 2-4 exercises per 20-30 minute block
- Prefer compound movements early in the workout (for strength blocks)
- Ensure variety within the week - avoid repeating the same exercises on different days
- Consider user preferences mentioned in their prompt
- For each exercise, use the exerciseId from the library

Exercise Selection per Block Time:
- 15 minutes: 2 exercises
- 20-30 minutes: 3 exercises
- 30-45 minutes: 4 exercises
- 45+ minutes: 5-6 exercises

Output a JSON object with this exact structure:
{
  "updatedBlocks": [
    {
      "dayOfWeek": 1,
      "blockIndex": 0,
      "exerciseIds": ["exercise:abc123", "exercise:def456", "exercise:ghi789"],
      "reasoning": "Selected compound upper body exercises for strength focus"
    }
  ],
  "totalExercisesAdded": 3,
  "summary": "Added 3 exercises to Monday's upper body block"
}

If all blocks already have exercises, return:
{
  "updatedBlocks": [],
  "totalExercisesAdded": 0,
  "summary": "All blocks already have exercises assigned"
}

IMPORTANT: Output ONLY valid JSON, no additional text or explanation.`,
    modelName: 'claude-sonnet-4-5',
    maxTokens: 4096,
    enabled: true,
  },
}

export function createDefaultWorkoutAIToolSettings(): WorkoutAIToolSettings {
  return {
    tools: { ...DEFAULT_WORKOUT_AI_TOOLS },
    version: 1,
    updatedAtMs: Date.now(),
  }
}

/**
 * Convert generated schedule to WorkoutDaySchedule format
 */
export function convertGeneratedSchedule(generated: GeneratedDaySchedule[]): WorkoutDaySchedule[] {
  return generated.map((day) => ({
    dayOfWeek: day.dayOfWeek,
    restDay: day.restDay,
    blocks:
      day.blocks?.map((block) => ({
        category: block.category,
        timeMinutes: block.timeMinutes,
      })) ?? [],
  }))
}
