/**
 * Phase 42 — Create todos from a structured project plan.
 *
 * After a plan is approved, this function creates LifeOS todos from
 * the structured JSON output of the Project Structure Planner.
 */

import type { StructuredPlan } from '@lifeos/agents'

/**
 * Parse raw planner output into a StructuredPlan.
 * Handles markdown-fenced JSON and raw JSON.
 */
export function parseStructuredPlan(raw: string): StructuredPlan {
  // Strip markdown code fences if present
  let cleaned = raw.trim()
  const fenceMatch = cleaned.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/)
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim()
  }

  const parsed = JSON.parse(cleaned) as Record<string, unknown>

  if (typeof parsed.projectName !== 'string') {
    throw new Error('Missing or invalid "projectName" field')
  }
  if (!Array.isArray(parsed.milestones)) {
    throw new Error('Missing or invalid "milestones" array')
  }

  return parsed as unknown as StructuredPlan
}

export interface CreateTodosResult {
  created: number
  errors: string[]
}

/**
 * Create LifeOS todos from a structured plan.
 * Each task in each milestone becomes a todo with status 'inbox'.
 *
 * @param plan - The parsed structured plan
 * @param userId - The user ID
 * @param firestore - Firestore instance
 * @returns Count of created todos and any error messages
 */
export async function createTodosFromPlan(
  plan: StructuredPlan,
  userId: string,
  firestore: FirebaseFirestore.Firestore
): Promise<CreateTodosResult> {
  const errors: string[] = []
  let created = 0

  for (const milestone of plan.milestones) {
    for (const task of milestone.tasks) {
      try {
        await firestore.collection(`users/${userId}/todos`).add({
          title: task.title,
          description: task.description || '',
          status: 'inbox',
          estimatedMinutes: Math.round((task.estimatedHours || 0) * 60),
          milestone: task.milestone || milestone.name,
          dependencies: task.dependencies || [],
          createdAtMs: Date.now(),
          updatedAtMs: Date.now(),
          source: 'plan',
        })
        created++
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        errors.push(`Failed to create todo "${task.title}": ${message}`)
      }
    }
  }

  return { created, errors }
}
