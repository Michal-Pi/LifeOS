/**
 * Workout AI Tools Functions
 *
 * Cloud Functions for AI-powered workout planning tools:
 * - Create Workout Plan: Generate a weekly plan from user prompt
 * - Populate Exercises: Fill empty blocks with exercises from library
 */

import type Anthropic from '@anthropic-ai/sdk'
import {
  DEFAULT_WORKOUT_AI_TOOLS,
  MODEL_PRICING,
  type WorkoutAIToolSettings,
  type WorkoutAIToolId,
  type GeneratedWorkoutPlan,
  type ExercisePopulationResult,
} from '@lifeos/agents'
import { getFirestore } from 'firebase-admin/firestore'
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { createLogger } from '../lib/logger.js'
import { loadProviderKeys } from './providerKeys.js'

const log = createLogger('WorkoutAITools')

// ----- Training Types (inlined to avoid vendor dependency) -----

type WorkoutContext = 'gym' | 'home' | 'road'

interface ExerciseVariant {
  name: string
  equipment?: string[]
  tags?: string[]
  notes?: string
}

interface ExerciseLibraryItem {
  exerciseId: string
  userId: string
  generic_name?: string
  name?: string // legacy field
  target_muscle_group?: string | string[]
  category: string
  gym?: ExerciseVariant[]
  home?: ExerciseVariant[]
  road?: ExerciseVariant[]
  archived: boolean
}

interface DayExerciseBlock {
  category: string
  timeMinutes: number
  exerciseIds?: string[]
}

interface WorkoutDaySchedule {
  dayOfWeek: number
  restDay?: boolean
  blocks: DayExerciseBlock[]
}

interface WorkoutPlan {
  planId: string
  userId: string
  active: boolean
  timezone: string
  startDateKey: string
  schedule: WorkoutDaySchedule[]
}

// ----- Types -----

interface WorkoutAIToolRequest {
  tool: 'createPlan' | 'populateExercises'
  prompt: string
  context?: {
    existingPlan?: WorkoutPlan
    exercises?: ExerciseLibraryItem[]
    preferredContext?: WorkoutContext
  }
}

interface WorkoutAIToolResponse {
  tool: string
  result: GeneratedWorkoutPlan | ExercisePopulationResult
  usage?: {
    inputTokens: number
    outputTokens: number
  }
}

interface ToolResult<T> {
  data: T
  inputTokens: number
  outputTokens: number
}

// ----- Helper Functions -----

/**
 * Load user's workout AI tool settings from Firestore
 */
async function loadWorkoutAIToolSettings(userId: string): Promise<WorkoutAIToolSettings> {
  const db = getFirestore()
  const doc = await db.doc(`users/${userId}/settings/workoutAITools`).get()

  if (!doc.exists) {
    return {
      tools: { ...DEFAULT_WORKOUT_AI_TOOLS },
      version: 1,
      updatedAtMs: Date.now(),
    }
  }

  const data = doc.data() as WorkoutAIToolSettings

  // Merge with defaults to ensure all tools are present
  const mergedTools = { ...DEFAULT_WORKOUT_AI_TOOLS }
  for (const [toolId, config] of Object.entries(data.tools || {})) {
    mergedTools[toolId as WorkoutAIToolId] = {
      ...DEFAULT_WORKOUT_AI_TOOLS[toolId as WorkoutAIToolId],
      ...config,
    }
  }

  return {
    ...data,
    tools: mergedTools,
  }
}

/**
 * Load user's exercise library from Firestore
 */
async function loadExerciseLibrary(userId: string): Promise<ExerciseLibraryItem[]> {
  const db = getFirestore()
  const snapshot = await db
    .collection(`users/${userId}/exerciseLibrary`)
    .where('archived', '==', false)
    .get()

  return snapshot.docs.map((doc) => doc.data() as ExerciseLibraryItem)
}

const DEFAULT_MODEL = 'claude-sonnet-4-6'

function resolveModelName(modelName: string): string {
  if (MODEL_PRICING[modelName]) return modelName
  log.warn('Unknown model, falling back to default', { modelName, fallback: DEFAULT_MODEL })
  return DEFAULT_MODEL
}

/**
 * Execute a prompt with Claude
 */
async function executePrompt(
  client: Anthropic,
  systemPrompt: string,
  userPrompt: string,
  modelName = DEFAULT_MODEL,
  maxTokens = 4096
): Promise<{ content: string; inputTokens: number; outputTokens: number }> {
  const model = resolveModelName(modelName)
  const response = await client.messages.create({
    model,
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  })

  const textContent = response.content.find((c) => c.type === 'text')
  const content = textContent?.type === 'text' ? textContent.text : ''

  return {
    content,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  }
}

/**
 * Extract JSON from AI response, handling markdown code blocks
 */
function extractJson(content: string): string | null {
  // Try to extract from markdown code block first
  const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (codeBlockMatch) {
    return codeBlockMatch[1].trim()
  }

  // Try to find raw JSON object
  const objectMatch = content.match(/\{[\s\S]*\}/)
  if (objectMatch) {
    return objectMatch[0]
  }

  return null
}

// ----- Tool Implementations -----

/**
 * Create a new workout plan based on user prompt
 */
async function createPlan(
  client: Anthropic,
  prompt: string,
  toolSettings: WorkoutAIToolSettings
): Promise<ToolResult<GeneratedWorkoutPlan>> {
  const config = toolSettings.tools.createPlan

  const userPrompt = `Create a weekly workout plan based on this request:

${prompt}

Remember to output ONLY valid JSON matching the specified structure.`

  const result = await executePrompt(
    client,
    config.systemPrompt,
    userPrompt,
    config.modelName,
    config.maxTokens
  )

  try {
    const jsonStr = extractJson(result.content)
    if (jsonStr) {
      const parsed = JSON.parse(jsonStr) as GeneratedWorkoutPlan

      // Validate required fields
      if (!parsed.schedule || !Array.isArray(parsed.schedule)) {
        throw new Error('Invalid schedule format')
      }

      // Ensure all 7 days are present
      const dayMap = new Map(parsed.schedule.map((d) => [d.dayOfWeek, d]))
      const completeSchedule = []
      for (let i = 0; i < 7; i++) {
        const existing = dayMap.get(i)
        if (existing) {
          completeSchedule.push(existing)
        } else {
          completeSchedule.push({ dayOfWeek: i, restDay: true })
        }
      }
      parsed.schedule = completeSchedule

      return {
        data: parsed,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
      }
    }

    throw new Error('No JSON found in response')
  } catch (error) {
    log.error('Failed to parse createPlan response', { error, content: result.content })
    // Return a default fallback
    return {
      data: {
        schedule: [
          { dayOfWeek: 0, restDay: true },
          { dayOfWeek: 1, blocks: [{ category: 'upper_body', timeMinutes: 30 }] },
          { dayOfWeek: 2, blocks: [{ category: 'lower_body', timeMinutes: 30 }] },
          { dayOfWeek: 3, restDay: true },
          { dayOfWeek: 4, blocks: [{ category: 'upper_body', timeMinutes: 30 }] },
          { dayOfWeek: 5, blocks: [{ category: 'cardio', timeMinutes: 20 }] },
          { dayOfWeek: 6, restDay: true },
        ],
        context: 'gym',
        totalWeeklyMinutes: 110,
        summary: 'Unable to parse AI response. Generated a default 3-day plan.',
      },
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
    }
  }
}

/**
 * Populate exercises in empty blocks of an existing plan
 */
async function populateExercises(
  client: Anthropic,
  prompt: string,
  existingPlan: WorkoutPlan,
  exercises: ExerciseLibraryItem[],
  toolSettings: WorkoutAIToolSettings
): Promise<ToolResult<ExercisePopulationResult>> {
  const config = toolSettings.tools.populateExercises

  // Find blocks that need exercises
  const emptyBlocks: Array<{
    dayOfWeek: number
    blockIndex: number
    category: string
    timeMinutes: number
  }> = []

  for (const day of existingPlan.schedule) {
    if (day.restDay || !day.blocks) continue

    day.blocks.forEach((block: DayExerciseBlock, blockIndex: number) => {
      if (!block.exerciseIds || block.exerciseIds.length === 0) {
        emptyBlocks.push({
          dayOfWeek: day.dayOfWeek,
          blockIndex,
          category: block.category,
          timeMinutes: block.timeMinutes,
        })
      }
    })
  }

  if (emptyBlocks.length === 0) {
    return {
      data: {
        updatedBlocks: [],
        totalExercisesAdded: 0,
        summary: 'All blocks already have exercises assigned',
      },
      inputTokens: 0,
      outputTokens: 0,
    }
  }

  // Format exercise library for context
  const exercisesByCategory = new Map<string, ExerciseLibraryItem[]>()
  for (const exercise of exercises) {
    const existing = exercisesByCategory.get(exercise.category) || []
    existing.push(exercise)
    exercisesByCategory.set(exercise.category, existing)
  }

  // Build condensed exercise library string
  const exerciseLibraryStr = Array.from(exercisesByCategory.entries())
    .map(([category, exs]) => {
      const exerciseList = exs
        .map((e) => {
          const variants = []
          if (e.gym && e.gym.length > 0)
            variants.push(`gym: ${e.gym.map((v: ExerciseVariant) => v.name).join(', ')}`)
          if (e.home && e.home.length > 0)
            variants.push(`home: ${e.home.map((v: ExerciseVariant) => v.name).join(', ')}`)
          if (e.road && e.road.length > 0)
            variants.push(`road: ${e.road.map((v: ExerciseVariant) => v.name).join(', ')}`)
          const displayName = e.generic_name || e.name || 'Unknown'
          const detail = variants.length > 0 ? `: ${variants.join(' | ')}` : ''
          return `  - ${displayName} (${e.exerciseId})${detail}`
        })
        .join('\n')
      return `${category}:\n${exerciseList}`
    })
    .join('\n\n')

  const emptyBlocksStr = emptyBlocks
    .map(
      (b) =>
        `- Day ${b.dayOfWeek} (${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][b.dayOfWeek]}), Block ${b.blockIndex}: ${b.category}, ${b.timeMinutes} minutes`
    )
    .join('\n')

  const userPrompt = `User preferences: ${prompt || 'No specific preferences'}

Blocks that need exercises:
${emptyBlocksStr}

Exercise Library:
${exerciseLibraryStr}

Select appropriate exercises from the library for each empty block. Match exercises STRICTLY by category.
Output ONLY valid JSON matching the specified structure.`

  const result = await executePrompt(
    client,
    config.systemPrompt,
    userPrompt,
    config.modelName,
    config.maxTokens
  )

  try {
    const jsonStr = extractJson(result.content)
    if (jsonStr) {
      const parsed = JSON.parse(jsonStr) as ExercisePopulationResult

      // Validate exercise IDs exist in the library
      const validExerciseIds = new Set(exercises.map((e) => e.exerciseId))
      for (const update of parsed.updatedBlocks) {
        update.exerciseIds = update.exerciseIds.filter((id) => validExerciseIds.has(id))
      }

      // Recalculate total
      parsed.totalExercisesAdded = parsed.updatedBlocks.reduce(
        (sum, b) => sum + b.exerciseIds.length,
        0
      )

      return {
        data: parsed,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
      }
    }

    throw new Error('No JSON found in response')
  } catch (error) {
    log.error('Failed to parse populateExercises response', { error, content: result.content })
    return {
      data: {
        updatedBlocks: [],
        totalExercisesAdded: 0,
        summary: 'Unable to parse AI response. Please try again.',
      },
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
    }
  }
}

// ----- Main Cloud Function -----

export const analyzeWorkoutWithAI = onCall(
  {
    timeoutSeconds: 120,
    memory: '512MiB',
  },
  async (request): Promise<WorkoutAIToolResponse> => {
    // Verify authentication
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated')
    }

    const userId = request.auth.uid
    const data = request.data as WorkoutAIToolRequest

    if (!data.tool) {
      throw new HttpsError('invalid-argument', 'Missing required field: tool')
    }

    // Load API keys from user settings (with fallback to secrets)
    const providerKeys = await loadProviderKeys(userId)

    if (!providerKeys.anthropic) {
      throw new HttpsError(
        'failed-precondition',
        'Anthropic API key not configured. Please add your API key in Settings → Model Settings.'
      )
    }

    // Initialize Anthropic client (lazy-loaded to avoid init-time SDK import)
    const { default: AnthropicSDK } = await import('@anthropic-ai/sdk')
    const client = new AnthropicSDK({
      apiKey: providerKeys.anthropic,
    })

    // Load user's workout AI tool settings
    const toolSettings = await loadWorkoutAIToolSettings(userId)

    // Check if the requested tool is enabled
    const toolConfig = toolSettings.tools[data.tool]
    if (!toolConfig.enabled) {
      throw new HttpsError('failed-precondition', `The "${toolConfig.name}" tool is disabled`)
    }

    let result: GeneratedWorkoutPlan | ExercisePopulationResult
    let inputTokens = 0
    let outputTokens = 0

    try {
      switch (data.tool) {
        case 'createPlan': {
          if (!data.prompt) {
            throw new HttpsError(
              'invalid-argument',
              'Create Plan requires a prompt describing your workout goals'
            )
          }
          const planResult = await createPlan(client, data.prompt, toolSettings)
          result = planResult.data
          inputTokens = planResult.inputTokens
          outputTokens = planResult.outputTokens
          break
        }

        case 'populateExercises': {
          if (!data.context?.existingPlan) {
            throw new HttpsError(
              'invalid-argument',
              'Populate Exercises requires an existing workout plan'
            )
          }

          // Load exercises if not provided
          const exercises = data.context.exercises || (await loadExerciseLibrary(userId))

          if (exercises.length === 0) {
            throw new HttpsError(
              'failed-precondition',
              'No exercises found in your library. Please add exercises first.'
            )
          }

          const populateResult = await populateExercises(
            client,
            data.prompt || '',
            data.context.existingPlan,
            exercises,
            toolSettings
          )
          result = populateResult.data
          inputTokens = populateResult.inputTokens
          outputTokens = populateResult.outputTokens
          break
        }

        default:
          throw new HttpsError('invalid-argument', `Unknown tool: ${data.tool}`)
      }

      return {
        tool: data.tool,
        result,
        usage: {
          inputTokens,
          outputTokens,
        },
      }
    } catch (error) {
      if (error instanceof HttpsError) {
        throw error
      }
      log.error('Tool execution failed', { error })
      throw new HttpsError('internal', 'Failed to process workout AI analysis')
    }
  }
)
