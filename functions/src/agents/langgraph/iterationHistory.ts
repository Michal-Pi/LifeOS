/**
 * Iteration History — Persistent Tracking for Budget Learning
 *
 * Stores and retrieves historical iteration usage per agent role,
 * enabling the budget calculator to learn from past runs.
 */

import { getFirestore } from 'firebase-admin/firestore'
import { createLogger } from '../../lib/logger.js'
import type { AgentExecutionStep, IterationUsageSummary } from '@lifeos/agents'
import type { IterationBudget } from './iterationBudget.js'

const log = createLogger('IterationHistory')

// ----- Types -----

export interface HistoricalIterationData {
  samples: IterationUsageSummary[]
  aggregated: {
    thesis: { mean: number; p75: number }
    negation: { mean: number; p75: number }
    synthesis: { mean: number; p75: number }
    meta: { mean: number; p75: number }
  }
  sampleCount: number
}

type RoleCategory = 'thesis' | 'negation' | 'synthesis' | 'meta'

// ----- Role Mapping -----

function mapRoleToCategory(agentRole: string | undefined): RoleCategory | null {
  if (!agentRole) return null
  switch (agentRole) {
    case 'thesis_generator':
      return 'thesis'
    case 'antithesis_generator':
    case 'negation_agent':
      return 'negation'
    case 'synthesizer':
    case 'synthesis_agent':
      return 'synthesis'
    case 'meta_reflection':
    case 'meta_agent':
      return 'meta'
    default:
      return null
  }
}

// ----- Aggregation -----

/**
 * Aggregate iteration usage from execution steps grouped by role category.
 */
export function aggregateStepsByRole(
  steps: AgentExecutionStep[]
): Record<RoleCategory, { avg: number; max: number; count: number }> {
  const buckets: Record<RoleCategory, number[]> = {
    thesis: [],
    negation: [],
    synthesis: [],
    meta: [],
  }

  for (const step of steps) {
    const category = mapRoleToCategory(step.agentRole)
    if (category && step.iterationsUsed != null) {
      buckets[category].push(step.iterationsUsed)
    }
  }

  const result = {} as Record<RoleCategory, { avg: number; max: number; count: number }>
  for (const cat of ['thesis', 'negation', 'synthesis', 'meta'] as RoleCategory[]) {
    const vals = buckets[cat]
    if (vals.length === 0) {
      result[cat] = { avg: 0, max: 0, count: 0 }
    } else {
      const sum = vals.reduce((a, b) => a + b, 0)
      result[cat] = {
        avg: Math.round((sum / vals.length) * 100) / 100,
        max: Math.max(...vals),
        count: vals.length,
      }
    }
  }
  return result
}

/**
 * Compute the 75th percentile from an array of numbers.
 */
function percentile75(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const idx = Math.ceil(sorted.length * 0.75) - 1
  return sorted[Math.max(0, idx)]
}

// ----- Firestore Operations -----

/**
 * Write an iteration usage summary after a completed dialectical run.
 */
export async function writeIterationUsageSummary(
  userId: string,
  workflowId: string,
  runId: string,
  steps: AgentExecutionStep[],
  budget: IterationBudget,
  totalCycles: number,
  avgToolCount: number
): Promise<void> {
  const perRole = aggregateStepsByRole(steps)

  const summary: IterationUsageSummary = {
    perRole,
    allocatedBudget: {
      perThesisAgent: budget.perThesisAgent,
      perNegationAgent: budget.perNegationAgent,
      perSynthesisAgent: budget.perSynthesisAgent,
      perMetaAgent: budget.perMetaAgent,
    },
    totalCycles,
    avgToolCount,
    completedAtMs: Date.now(),
    workflowId,
  }

  const db = getFirestore()
  await db
    .collection('users')
    .doc(userId)
    .collection('workflows')
    .doc(workflowId)
    .collection('iterationHistory')
    .doc(runId)
    .set(summary)

  log.info('Wrote iteration history', {
    runId,
    thesisAvg: perRole.thesis.avg,
    negationAvg: perRole.negation.avg,
  })
}

/**
 * Fetch historical iteration data for budget learning.
 * Returns null if fewer than 3 data points (insufficient for reliable blending).
 */
export async function fetchIterationHistory(
  userId: string,
  workflowId: string,
  options?: { limit?: number }
): Promise<HistoricalIterationData | null> {
  const db = getFirestore()
  const limit = options?.limit ?? 10

  const snapshot = await db
    .collection('users')
    .doc(userId)
    .collection('workflows')
    .doc(workflowId)
    .collection('iterationHistory')
    .orderBy('completedAtMs', 'desc')
    .limit(limit)
    .get()

  if (snapshot.size < 3) {
    log.info('Insufficient samples, using heuristic only', {
      sampleCount: snapshot.size,
      workflowId,
    })
    return null
  }

  const samples = snapshot.docs.map((doc) => doc.data() as IterationUsageSummary)

  // Aggregate across samples
  const aggregated = {} as HistoricalIterationData['aggregated']
  for (const cat of ['thesis', 'negation', 'synthesis', 'meta'] as RoleCategory[]) {
    const avgValues = samples.filter((s) => s.perRole[cat].count > 0).map((s) => s.perRole[cat].avg)

    const maxValues = samples.filter((s) => s.perRole[cat].count > 0).map((s) => s.perRole[cat].max)

    // Use the max per-run values for P75 (we care about peak usage, not average)
    aggregated[cat] = {
      mean: avgValues.length > 0 ? avgValues.reduce((a, b) => a + b, 0) / avgValues.length : 0,
      p75: percentile75(maxValues),
    }
  }

  log.info('Historical samples loaded', {
    sampleCount: samples.length,
    workflowId,
    thesisP75: aggregated.thesis.p75,
    negationP75: aggregated.negation.p75,
  })

  return {
    samples,
    aggregated,
    sampleCount: samples.length,
  }
}
