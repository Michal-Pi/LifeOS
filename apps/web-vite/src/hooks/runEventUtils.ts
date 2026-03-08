/**
 * Shared utilities for run event hooks.
 * Extracted from useDialecticalState and useDeepResearchKGState to avoid duplication.
 */

import type { RunStatus } from '@lifeos/agents'
import type { RunEvent } from '@/hooks/useRunEvents'

type VisualizationStatus = 'running' | 'completed' | 'failed' | 'paused'

/**
 * Map RunStatus to visualization status.
 */
export function mapStatus(runStatus: RunStatus): VisualizationStatus {
  switch (runStatus) {
    case 'running':
      return 'running'
    case 'completed':
      return 'completed'
    case 'failed':
      return 'failed'
    case 'paused':
    case 'waiting_for_input':
      return 'paused'
    default:
      return 'running'
  }
}

/**
 * Extract live cost and token data from step_completed events.
 * Takes the maximum cumulative values (not sum) since each event carries a running total.
 */
export function extractLiveCosts(events: RunEvent[]): { tokens: number; cost: number } {
  let maxTokens = 0
  let maxCost = 0
  for (const event of events) {
    if (event.type === 'step_completed') {
      const details = event.details as Record<string, unknown> | undefined
      const tokens = (details?.cumulativeTokens as number) ?? 0
      const cost = (details?.cumulativeCost as number) ?? 0
      if (tokens > maxTokens) maxTokens = tokens
      if (cost > maxCost) maxCost = cost
    }
  }
  return { tokens: maxTokens, cost: maxCost }
}
