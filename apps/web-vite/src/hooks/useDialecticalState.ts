/**
 * useDialecticalState Hook
 *
 * Transforms a Run's workflowState.dialectical data into the CycleState format
 * expected by DialecticalCycleVisualization.
 */

import { useMemo } from 'react'
import type { Run, RunStatus } from '@lifeos/agents'
import type { CycleState } from '@/components/agents/DialecticalCycleVisualization'

/**
 * Map RunStatus to CycleState status
 */
function mapStatus(runStatus: RunStatus): CycleState['status'] {
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
 * Hook to get dialectical cycle state from a Run
 */
export function useDialecticalState(run: Run | null): CycleState | null {
  return useMemo(() => {
    if (!run) return null

    // Get dialectical state from workflowState
    const dialectical = run.workflowState?.dialectical
    if (!dialectical) {
      // Return a minimal state for dialectical workflows without full state data
      // This handles legacy runs or runs in progress
      const workflowState = run.workflowState as Record<string, unknown> | undefined
      if (workflowState?.totalCycles !== undefined) {
        return {
          cycleNumber: (workflowState.totalCycles as number) || 0,
          phase: 'meta_reflection' as const,
          theses: [],
          negations: [],
          contradictions: [],
          synthesis: null,
          metaDecision: null,
          conceptualVelocity: (workflowState.conceptualVelocity as number) || 0,
          velocityHistory: [],
          contradictionDensity: 0,
          densityHistory: [],
          status: mapStatus(run.status),
          tokensUsed: 0,
          estimatedCost: 0,
          startedAtMs: run.startedAtMs || 0,
        }
      }
      return null
    }

    return {
      cycleNumber: dialectical.cycleNumber,
      phase: dialectical.phase,
      theses: dialectical.theses,
      negations: dialectical.negations,
      contradictions: dialectical.contradictions,
      synthesis: dialectical.synthesis,
      metaDecision: dialectical.metaDecision,
      conceptualVelocity: dialectical.conceptualVelocity,
      velocityHistory: dialectical.velocityHistory || [],
      contradictionDensity: dialectical.contradictionDensity,
      densityHistory: dialectical.densityHistory || [],
      status: mapStatus(run.status),
      tokensUsed: dialectical.tokensUsed,
      estimatedCost: dialectical.estimatedCost,
      startedAtMs: dialectical.startedAtMs || run.startedAtMs || 0,
    }
  }, [run])
}

/**
 * Check if a workflow is dialectical
 */
export function isDialecticalWorkflow(workflowType: string | undefined): boolean {
  return workflowType === 'dialectical'
}
