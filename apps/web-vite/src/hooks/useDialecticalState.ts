/**
 * useDialecticalState Hook
 *
 * Transforms a Run's dialectical data into the CycleState format
 * expected by DialecticalCycleVisualization.
 *
 * When the run is still running, reconstructs live state from streamed events.
 * When completed, reads the persisted workflowState.dialectical from Firestore.
 */

import { useMemo } from 'react'
import type { Run, DialecticalPhase, CompactGraph, GraphDiff } from '@lifeos/agents'
import type { CycleState, CycleHistoryEntry } from '@/components/agents/DialecticalCycleVisualization'
import type { RunEvent } from '@/hooks/useRunEvents'
import { mapStatus, extractLiveCosts } from '@/hooks/runEventUtils'

/**
 * Reconstruct dialectical CycleState from live event stream.
 * Parses thesis, negation, contradiction, synthesis, and meta events
 * to build a progressively updating visualization state.
 */
function buildStateFromEvents(run: Run, events: RunEvent[]): CycleState | null {
  // Only build from events if there are dialectical events
  const dialecticalEvents = events.filter((e) =>
    e.type.startsWith('dialectical_')
  )
  if (dialecticalEvents.length === 0) return null

  // Track the latest cycle number from phase events
  let cycleNumber = 1
  let currentPhase: DialecticalPhase = 'retrieve_context'

  // Accumulate theses, negations, contradictions per cycle
  const theses: CycleState['theses'] = []
  const negations: CycleState['negations'] = []
  const contradictions: CycleState['contradictions'] = []
  let synthesis: CycleState['synthesis'] = null
  let mergedGraph: CompactGraph | null = null
  const graphHistory: Array<{ cycle: number; diff: GraphDiff }> = []
  let metaDecision: CycleState['metaDecision'] = null
  let conceptualVelocity = 0
  const velocityHistory: number[] = []
  const densityHistory: number[] = []
  let refinedGoal: string | undefined

  // Track per-cycle density for sparkline
  let lastDensityCycle = 0

  // Per-cycle history for data partitioning
  const cycleHistory: CycleHistoryEntry[] = []
  let pendingCycleTheses: CycleState['theses'] = []
  let pendingCycleNegations: CycleState['negations'] = []
  let pendingCycleContradictions: CycleState['contradictions'] = []
  let lastArchiveCycle = 0

  for (const event of dialecticalEvents) {
    const details = event.details as Record<string, unknown> | undefined
    const eventCycle = (details?.cycleNumber as number) ?? cycleNumber

    // Archive per-cycle data when we detect a new cycle
    if (eventCycle > lastArchiveCycle && lastArchiveCycle > 0) {
      cycleHistory.push({
        cycle: lastArchiveCycle,
        theses: [...pendingCycleTheses],
        negations: [...pendingCycleNegations],
        contradictions: [...pendingCycleContradictions],
      })
      pendingCycleTheses = []
      pendingCycleNegations = []
      pendingCycleContradictions = []
    }
    lastArchiveCycle = eventCycle

    // Update cycle number from any event
    if (eventCycle > cycleNumber) {
      cycleNumber = eventCycle
    }

    switch (event.type) {
      case 'dialectical_phase': {
        const phase = details?.phase as DialecticalPhase | undefined
        if (phase) currentPhase = phase
        break
      }

      case 'dialectical_thesis': {
        const lens = (details?.lens as string) ?? 'unknown'
        const confidence = (details?.confidence as number) ?? 0.5
        theses.push({
          agentId: event.agentId ?? '',
          model: event.model ?? '',
          lens,
          confidence,
          rawText: event.output ?? '',
          // Extract structured thesis fields from event details when available
          graph: (details?.graph as CompactGraph) ?? undefined,
          conceptGraph: (details?.conceptGraph as Record<string, unknown>) ?? {},
          causalModel: (details?.causalModel as string[]) ?? [],
          falsificationCriteria: (details?.falsificationCriteria as string[]) ?? [],
          decisionImplications: (details?.decisionImplications as string[]) ?? [],
          unitOfAnalysis: (details?.unitOfAnalysis as string) ?? '',
          temporalGrain: (details?.temporalGrain as string) ?? '',
          regimeAssumptions: (details?.regimeAssumptions as string[]) ?? [],
        })
        pendingCycleTheses.push(theses[theses.length - 1])
        currentPhase = 'thesis_generation'
        break
      }

      case 'dialectical_negation': {
        negations.push({
          agentId: event.agentId ?? '',
          targetThesisAgentId: (details?.targetThesisLens as string) ?? (details?.targetThesisAgentId as string) ?? '',
          rawText: event.output ?? '',
          internalTensions: (details?.internalTensions as string[]) ?? [],
          categoryAttacks: (details?.categoryAttacks as string[]) ?? [],
          preservedValid: (details?.preservedValid as string[]) ?? [],
          rivalFraming: (details?.rivalFraming as string) ?? '',
          rewriteOperator: (details?.rewriteOperator as string) ?? '',
          operatorArgs: (details?.operatorArgs as Record<string, unknown>) ?? {},
        })
        pendingCycleNegations.push(negations[negations.length - 1])
        currentPhase = 'cross_negation'
        break
      }

      case 'dialectical_contradiction': {
        const items = (details?.contradictions ?? []) as Array<{
          id: string
          type: string
          severity: string
          description: string
          actionDistance: number
          participatingClaims?: string[]
          trackerAgent?: string
        }>
        for (const c of items) {
          contradictions.push({
            id: c.id,
            type: c.type as 'SYNCHRONIC' | 'DIACHRONIC' | 'REGIME_SHIFT',
            severity: c.severity as 'HIGH' | 'MEDIUM' | 'LOW',
            description: c.description,
            actionDistance: c.actionDistance,
            participatingClaims: c.participatingClaims ?? [],
            trackerAgent: c.trackerAgent ?? '',
          })
        }
        pendingCycleContradictions.push(...contradictions.slice(-items.length))
        currentPhase = 'contradiction_crystallization'
        break
      }

      case 'dialectical_synthesis': {
        const velocity = (details?.conceptualVelocity as number) ?? 0
        if (velocity > 0) {
          conceptualVelocity = velocity
          velocityHistory.push(velocity)
        }
        synthesis = {
          operators: (details?.operators as CycleState['synthesis'] extends null ? never : NonNullable<CycleState['synthesis']>['operators']) ?? [],
          preservedElements: new Array((details?.preservedCount as number) ?? 0).fill(''),
          negatedElements: new Array((details?.negatedCount as number) ?? 0).fill(''),
          newConceptGraph: {},
          newClaims: [],
          newPredictions: [],
          schemaDiff: null,
          incompleteReason: (details?.incompleteReason as string | undefined) ?? undefined,
          rawText: event.output ?? '',
        }
        // Extract mergedGraph and graphDiff from event details
        if (details?.mergedGraph) {
          mergedGraph = details.mergedGraph as CompactGraph
        }
        if (details?.graphDiff) {
          const eventCycleNum = (details?.cycleNumber as number) ?? cycleNumber
          graphHistory.push({ cycle: eventCycleNum, diff: details.graphDiff as GraphDiff })
        }
        // Compute per-cycle density at synthesis boundary
        if (eventCycle > lastDensityCycle && theses.length > 0) {
          densityHistory.push(contradictions.length / theses.length)
          lastDensityCycle = eventCycle
        }
        currentPhase = 'sublation'
        break
      }

      case 'dialectical_meta': {
        metaDecision = (details?.decision as CycleState['metaDecision']) ?? null
        const vel = (details?.conceptualVelocity as number) ?? 0
        if (vel > 0) {
          conceptualVelocity = vel
          // Always push velocity — don't dedup by value (same velocity across cycles is valid)
          velocityHistory.push(vel)
        }
        // Surface refined goal from meta-reflection
        if (details?.refinedGoal) {
          refinedGoal = details.refinedGoal as string
        }
        currentPhase = 'meta_reflection'
        break
      }
    }
  }

  // Archive any remaining per-cycle data for the current cycle
  if (pendingCycleTheses.length > 0 || pendingCycleNegations.length > 0 || pendingCycleContradictions.length > 0) {
    cycleHistory.push({
      cycle: lastArchiveCycle || cycleNumber,
      theses: pendingCycleTheses,
      negations: pendingCycleNegations,
      contradictions: pendingCycleContradictions,
    })
  }

  const contradictionDensity = theses.length > 0 ? contradictions.length / theses.length : 0
  // Ensure current density is in history if not already added at synthesis boundary
  if (densityHistory.length === 0 && contradictions.length > 0) {
    densityHistory.push(contradictionDensity)
  }

  // Extract live cost from step_completed events
  const liveCosts = extractLiveCosts(events)

  return {
    cycleNumber,
    maxCycles: 10, // Default — overridden from persisted state when available
    phase: currentPhase,
    theses,
    negations,
    contradictions,
    cycleHistory: cycleHistory.length > 0 ? cycleHistory : undefined,
    synthesis,
    mergedGraph,
    graphHistory,
    metaDecision,
    conceptualVelocity,
    velocityHistory,
    contradictionDensity,
    densityHistory,
    refinedGoal,
    status: mapStatus(run.status),
    tokensUsed: liveCosts.tokens || (run.tokensUsed ?? 0),
    estimatedCost: liveCosts.cost || (run.estimatedCost ?? 0),
    startedAtMs: run.startedAtMs || 0,
  }
}

/**
 * Hook to get dialectical cycle state from a Run.
 * When events are provided and the run is active, builds live state from events.
 * Otherwise falls back to persisted workflowState.dialectical.
 */
export function useDialecticalState(
  run: Run | null,
  events?: RunEvent[]
): CycleState | null {
  return useMemo(() => {
    if (!run) return null

    // For active runs with events, reconstruct state from the event stream
    const isActive = run.status === 'running' || run.status === 'waiting_for_input'
    if (isActive && events && events.length > 0) {
      const liveState = buildStateFromEvents(run, events)
      if (liveState) return liveState
    }

    // Also try events for completed/failed runs (fallback if workflowState missing)
    if (!isActive && events && events.length > 0) {
      const eventState = buildStateFromEvents(run, events)
      if (eventState) return eventState
    }

    // Completed/failed runs: use persisted state
    const dialectical = run.workflowState?.dialectical
    if (dialectical) {
      return {
        cycleNumber: dialectical.cycleNumber,
        maxCycles: ((dialectical as Record<string, unknown>).maxCycles as number | undefined) ?? 10,
        phase: dialectical.phase,
        theses: dialectical.theses,
        negations: dialectical.negations,
        contradictions: dialectical.contradictions,
        synthesis: dialectical.synthesis,
        mergedGraph: ((dialectical as Record<string, unknown>).mergedGraph as CompactGraph | undefined) ?? null,
        graphHistory: ((dialectical as Record<string, unknown>).graphHistory as Array<{ cycle: number; diff: GraphDiff }> | undefined) ?? [],
        metaDecision: dialectical.metaDecision,
        conceptualVelocity: dialectical.conceptualVelocity,
        velocityHistory: dialectical.velocityHistory || [],
        contradictionDensity: dialectical.contradictionDensity,
        densityHistory: dialectical.densityHistory || [],
        refinedGoal: (dialectical as Record<string, unknown>).refinedGoal as string | undefined,
        status: mapStatus(run.status),
        tokensUsed: dialectical.tokensUsed,
        estimatedCost: dialectical.estimatedCost,
        startedAtMs: dialectical.startedAtMs || run.startedAtMs || 0,
      }
    }

    // Fallback: legacy runs with minimal workflowState
    const workflowState = run.workflowState as Record<string, unknown> | undefined
    if (workflowState?.totalCycles !== undefined) {
      return {
        cycleNumber: (workflowState.totalCycles as number) || 0,
        maxCycles: 10,
        phase: 'meta_reflection' as const,
        theses: [],
        negations: [],
        contradictions: [],
        synthesis: null,
        mergedGraph: null,
        graphHistory: [],
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

    // Final fallback: if the run has steps and output, it ran but workflowState is missing
    if (run.currentStep > 0 && run.output) {
      console.warn(
        `[useDialecticalState] Run ${run.runId} has output but no dialectical workflowState. ` +
          `workflowState keys: ${run.workflowState ? Object.keys(run.workflowState).join(', ') : 'null'}`
      )
    }

    return null
  }, [run, events])
}

/**
 * Check if a workflow is dialectical
 */
export function isDialecticalWorkflow(workflowType: string | undefined): boolean {
  return workflowType === 'dialectical'
}
