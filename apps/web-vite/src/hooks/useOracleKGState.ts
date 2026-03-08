/**
 * useOracleKGState Hook
 *
 * Transforms Oracle Run KG data into visualization state.
 * Reconstructs live state from oracle_phase events when running,
 * falls back to persisted workflowState.oracle.knowledgeGraph for completed runs.
 */

import { useMemo } from 'react'
import type { Run, OracleKnowledgeGraph, CompactGraph } from '@lifeos/agents'
import type { RunEvent } from '@/hooks/useRunEvents'
import { mapStatus } from '@/hooks/runEventUtils'
import { oracleKGToCompactGraph } from '@/lib/oracleKGAdapter'
import type { DeepResearchKGState } from '@/hooks/useDeepResearchKGState'

function buildStateFromEvents(run: Run, events: RunEvent[]): DeepResearchKGState | null {
  const oracleEvents = events.filter((e) => e.type.startsWith('oracle_'))
  if (oracleEvents.length === 0) return null

  let currentPhase = ''
  let compactGraph: CompactGraph | null = null

  for (const event of oracleEvents) {
    const details = event.details as Record<string, unknown> | undefined
    if (!details) continue

    if (event.type === 'oracle_phase') {
      const phaseName = details.phaseName as string | undefined
      if (phaseName) currentPhase = phaseName

      // Extract KG from systems_mapper completion event
      const kgData = details.knowledgeGraph as OracleKnowledgeGraph | undefined
      if (kgData && Array.isArray(kgData.nodes)) {
        compactGraph = oracleKGToCompactGraph(kgData)
      }
    }
  }

  if (!compactGraph) return null

  return {
    snapshots: [],
    mergedGraph: compactGraph,
    graphHistory: [],
    sources: [],
    gapAnalysis: null,
    budget: null,
    status: mapStatus(run.status),
    currentPhase,
    tokensUsed: run.tokensUsed ?? 0,
    estimatedCost: run.estimatedCost ?? 0,
  }
}

export function useOracleKGState(
  run: Run | null,
  events?: RunEvent[]
): DeepResearchKGState | null {
  return useMemo(() => {
    if (!run) return null

    // Live event reconstruction
    if (events && events.length > 0) {
      const liveState = buildStateFromEvents(run, events)
      if (liveState) return liveState
    }

    // Fallback: completed run workflowState (oracle nests under .oracle key)
    const ws = run.workflowState as Record<string, unknown> | undefined
    const oracle = ws?.oracle as Record<string, unknown> | undefined
    if (oracle?.knowledgeGraph) {
      const okg = oracle.knowledgeGraph as OracleKnowledgeGraph
      if (Array.isArray(okg.nodes)) {
        return {
          snapshots: [],
          mergedGraph: oracleKGToCompactGraph(okg),
          graphHistory: [],
          sources: [],
          gapAnalysis: null,
          budget: null,
          status: mapStatus(run.status),
          currentPhase: 'completed',
          tokensUsed: run.tokensUsed ?? 0,
          estimatedCost: run.estimatedCost ?? 0,
        }
      }
    }

    return null
  }, [run, events])
}
