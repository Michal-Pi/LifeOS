/**
 * Iteration Budget Calculator
 *
 * Distributes a workflow-level iteration budget across dialectical phases
 * and individual agent executions. Tool-heavy agents (thesis generators)
 * get more iterations than reasoning-only agents (synthesis, meta-reflection).
 *
 * When historical data is available (from past runs), the calculator blends
 * the heuristic with actual usage patterns using a sigmoid ramp that shifts
 * weight from heuristic to history as more samples accumulate.
 */

import { createLogger } from '../../lib/logger.js'
import type { AgentConfig, DialecticalWorkflowConfig, ThesisLens } from '@lifeos/agents'
import type { HistoricalIterationData } from './iterationHistory.js'

const log = createLogger('IterationBudget')

export interface IterationBudget {
  perThesisAgent: number
  perThesisAgentByLens: Partial<Record<ThesisLens, number>>
  perNegationAgent: number
  perSynthesisAgent: number
  perMetaAgent: number
  suggestedTotal: number
}

export interface BudgetInput {
  workflowMaxIterations: number
  thesisAgents: AgentConfig[]
  synthesisAgentCount: number
  dialecticalConfig: DialecticalWorkflowConfig
  historicalData?: HistoricalIterationData | null
}

/**
 * Blend a heuristic value with historical P75 using a sigmoid ramp.
 *
 * Weight curve:
 *   0 samples → 100% heuristic
 *   3 samples →  43% history
 *  10 samples →  71% history
 *  20 samples →  83% history
 *
 * A 20% buffer is added above P75 to avoid budget exhaustion.
 * Result is clamped between minFloor and 2× heuristic.
 */
function blendWithHistory(
  heuristic: number,
  historicalP75: number,
  sampleCount: number,
  minFloor: number
): number {
  const histWeight = 1 - 1 / (1 + sampleCount / 4)
  const blended = heuristic * (1 - histWeight) + historicalP75 * histWeight
  const buffered = blended * 1.2
  return Math.max(minFloor, Math.min(Math.ceil(buffered), heuristic * 2))
}

/**
 * Calculate per-agent iteration budgets for a dialectical workflow.
 *
 * Budget heuristic per agent:
 *   thesis (tool-heavy):  max(5, toolCount + 3)
 *   negation (may tool):  max(3, toolCount + 2)
 *   synthesis (no tools):  3
 *   meta (no tools):       3
 *
 * When historicalData is provided with >= 3 samples, the heuristic is blended
 * with observed P75 iteration usage from past runs.
 */
export function calculateIterationBudget(input: BudgetInput): IterationBudget {
  const {
    workflowMaxIterations,
    thesisAgents,
    synthesisAgentCount,
    dialecticalConfig,
    historicalData,
  } = input

  const thesisAgentCount = thesisAgents.length
  const thesisBudgetsByLens: Partial<Record<ThesisLens, number>> = {}
  const thesisHeuristics = thesisAgents.map((agent, index) => {
    const lens = dialecticalConfig.thesisAgents[index]?.lens ?? 'custom'
    const toolCount = agent.toolIds?.length ?? 0
    const hasReadUrl = agent.toolIds?.includes('tool:read_url' as never) ?? false
    let heuristic = Math.max(5, Math.ceil(toolCount) + 3)
    if (lens === 'economic' && hasReadUrl) heuristic += 1
    thesisBudgetsByLens[lens] = heuristic
    return heuristic
  })
  const avgToolCount =
    thesisAgents.reduce((sum, a) => sum + (a.toolIds?.length ?? 0), 0) /
    Math.max(1, thesisAgentCount)

  // Per-agent iteration limits based on tool count (heuristic)
  let perThesisAgent =
    thesisHeuristics.length > 0
      ? Math.max(...thesisHeuristics)
      : Math.max(5, Math.ceil(avgToolCount) + 3)
  let perNegationAgent = dialecticalConfig.enableCrossNegation
    ? Math.max(3, Math.ceil(avgToolCount) + 2)
    : 3
  let perSynthesisAgent = 3
  let perMetaAgent = 3

  // Blend with historical data if available (>= 3 samples)
  if (historicalData && historicalData.sampleCount >= 3) {
    const { aggregated, sampleCount } = historicalData

    if (aggregated.thesis.p75 > 0) {
      perThesisAgent = blendWithHistory(perThesisAgent, aggregated.thesis.p75, sampleCount, 3)
      for (const lens of Object.keys(thesisBudgetsByLens) as ThesisLens[]) {
        const current = thesisBudgetsByLens[lens]
        if (current) {
          thesisBudgetsByLens[lens] = blendWithHistory(
            current,
            aggregated.thesis.p75,
            sampleCount,
            3
          )
        }
      }
    }
    if (aggregated.negation.p75 > 0) {
      perNegationAgent = blendWithHistory(perNegationAgent, aggregated.negation.p75, sampleCount, 2)
    }
    if (aggregated.synthesis.p75 > 0) {
      perSynthesisAgent = blendWithHistory(
        perSynthesisAgent,
        aggregated.synthesis.p75,
        sampleCount,
        2
      )
    }
    if (aggregated.meta.p75 > 0) {
      perMetaAgent = blendWithHistory(perMetaAgent, aggregated.meta.p75, sampleCount, 2)
    }

    log.info('Budget blended with historical samples', {
      sampleCount,
      thesis: perThesisAgent,
      thesisP75: aggregated.thesis.p75,
      negation: perNegationAgent,
      negationP75: aggregated.negation.p75,
    })
  }

  // Calculate suggested total
  const negationCount = dialecticalConfig.enableCrossNegation ? thesisAgentCount : 0
  const perCycleCost =
    thesisAgentCount * perThesisAgent +
    negationCount * perNegationAgent +
    Math.max(1, synthesisAgentCount) * perSynthesisAgent +
    perMetaAgent

  const minCycles = dialecticalConfig.minCycles ?? 2
  const suggestedTotal = Math.max(10, Math.ceil(perCycleCost * minCycles * 1.2))

  // If the user set a lower budget, scale down proportionally but keep minimums
  if (workflowMaxIterations < suggestedTotal) {
    const scale = workflowMaxIterations / suggestedTotal
    return {
      perThesisAgent: Math.max(3, Math.round(perThesisAgent * scale)),
      perThesisAgentByLens: Object.fromEntries(
        Object.entries(thesisBudgetsByLens).map(([lens, budget]) => [
          lens,
          Math.max(3, Math.round((budget ?? perThesisAgent) * scale)),
        ])
      ) as Partial<Record<ThesisLens, number>>,
      perNegationAgent: Math.max(2, Math.round(perNegationAgent * scale)),
      perSynthesisAgent: Math.max(2, Math.round(perSynthesisAgent * scale)),
      perMetaAgent: Math.max(2, Math.round(perMetaAgent * scale)),
      suggestedTotal,
    }
  }

  return {
    perThesisAgent,
    perThesisAgentByLens: thesisBudgetsByLens,
    perNegationAgent,
    perSynthesisAgent,
    perMetaAgent,
    suggestedTotal,
  }
}
