/**
 * useDeepResearchKGState Hook
 *
 * Transforms a Deep Research Run's KG data into visualization state.
 * Mirrors the useDialecticalState pattern: reconstructs live state from
 * streamed events when running, falls back to persisted workflowState
 * for completed runs.
 */

import { useMemo } from 'react'
import type {
  Run,
  CompactGraph,
  GraphDiff,
  KGSnapshot,
  SourceRecord,
  RunBudget,
  GapItem,
} from '@lifeos/agents'
import type { RunEvent } from '@/hooks/useRunEvents'
import { mapStatus, extractLiveCosts } from '@/hooks/runEventUtils'

export interface DeepResearchKGState {
  snapshots: KGSnapshot[]
  mergedGraph: CompactGraph | null
  graphHistory: Array<{ cycle: number; diff: GraphDiff }>
  sources: SourceRecord[]
  gapAnalysis: { overallCoverageScore: number; gaps: GapItem[] } | null
  budget: RunBudget | null
  status: 'running' | 'completed' | 'failed' | 'paused'
  currentPhase: string
  tokensUsed: number
  estimatedCost: number
}

function buildStateFromEvents(run: Run, events: RunEvent[]): DeepResearchKGState | null {
  const hasDeepResearchEvents = events.some(
    (e) => e.type === 'deep_research_phase' || e.type === 'step_completed'
  )
  if (!hasDeepResearchEvents) return null

  let currentPhase = ''
  let mergedGraph: CompactGraph | null = null
  const graphHistory: Array<{ cycle: number; diff: GraphDiff }> = []
  let snapshots: KGSnapshot[] = []
  let sources: SourceRecord[] = []
  let gapAnalysis: DeepResearchKGState['gapAnalysis'] = null
  let budget: RunBudget | null = null

  for (const event of events) {
    const details = event.details as Record<string, unknown> | undefined
    if (!details) continue

    switch (event.type) {
      case 'deep_research_phase': {
        const phase = details.phase as string | undefined
        if (phase) currentPhase = phase
        // Extract mergedGraph from kg_snapshot or sublation events
        if (details.mergedGraph) {
          mergedGraph = details.mergedGraph as CompactGraph
        }
        if (details.graphDiff) {
          const cycleNum = (details.cycleNumber as number) ?? graphHistory.length + 1
          graphHistory.push({ cycle: cycleNum, diff: details.graphDiff as GraphDiff })
        }
        break
      }

      case 'step_completed': {
        // Extract KG snapshots
        if (details.kgSnapshots) {
          snapshots = details.kgSnapshots as KGSnapshot[]
        }

        // Extract sources from source_ingestion phase
        if (details.sources && Array.isArray(details.sources)) {
          sources = details.sources as SourceRecord[]
        }

        // Extract gap analysis
        if (details.gapAnalysis) {
          const ga = details.gapAnalysis as Record<string, unknown>
          gapAnalysis = {
            overallCoverageScore: (ga.overallCoverageScore as number) ?? 0,
            gaps: (ga.gaps as GapItem[]) ?? [],
          }
        }

        // Extract budget
        if (details.budget) {
          budget = details.budget as RunBudget
        }

        // Extract merged graph from KG snapshot phase
        if (details.mergedGraph) {
          mergedGraph = details.mergedGraph as CompactGraph
        }

        break
      }

      case 'dialectical_synthesis': {
        // Merged graph and graph diffs come from synthesis events
        if (details.mergedGraph) {
          mergedGraph = details.mergedGraph as CompactGraph
        }
        if (details.graphDiff) {
          const cycleNum = (details.cycleNumber as number) ?? graphHistory.length + 1
          graphHistory.push({ cycle: cycleNum, diff: details.graphDiff as GraphDiff })
        }
        break
      }
    }
  }

  const liveCosts = extractLiveCosts(events)

  return {
    snapshots,
    mergedGraph,
    graphHistory,
    sources,
    gapAnalysis,
    budget,
    status: mapStatus(run.status),
    currentPhase,
    tokensUsed: liveCosts.tokens || (run.tokensUsed ?? 0),
    estimatedCost: liveCosts.cost || (run.estimatedCost ?? 0),
  }
}

export function useDeepResearchKGState(
  run: Run | null,
  events?: RunEvent[]
): DeepResearchKGState | null {
  return useMemo(() => {
    if (!run) return null

    // For active runs with events, reconstruct state from the event stream
    const isActive = run.status === 'running' || run.status === 'waiting_for_input'
    if (isActive && events && events.length > 0) {
      const liveState = buildStateFromEvents(run, events)
      if (liveState) return liveState
    }

    // Try events for completed/failed runs (fallback if workflowState missing)
    if (!isActive && events && events.length > 0) {
      const eventState = buildStateFromEvents(run, events)
      if (eventState) return eventState
    }

    // Completed/failed runs: use persisted state
    // Executor stores deep research state flat on workflowState (not nested under .deepResearch)
    const ws = run.workflowState as Record<string, unknown> | undefined
    if (ws && (ws.mergedGraph || ws.kgSnapshots || ws.sources)) {
      const answer = ws.answer as { confidenceAssessment?: { overall?: number } } | null | undefined
      return {
        snapshots: (ws.kgSnapshots as KGSnapshot[]) ?? [],
        mergedGraph: (ws.mergedGraph as CompactGraph) ?? null,
        graphHistory: (ws.graphHistory as Array<{ cycle: number; diff: GraphDiff }>) ?? [],
        sources: (ws.sources as SourceRecord[]) ?? [],
        gapAnalysis: answer
          ? {
              overallCoverageScore: answer.confidenceAssessment?.overall ?? 0,
              gaps: [],
            }
          : null,
        budget: (ws.budget as RunBudget) ?? null,
        status: mapStatus(run.status),
        currentPhase: 'completed',
        tokensUsed: run.tokensUsed ?? 0,
        estimatedCost: run.estimatedCost ?? 0,
      }
    }

    return null
  }, [run, events])
}

export function isDeepResearchWorkflow(workflowGraph: string | undefined): boolean {
  return workflowGraph === 'deep_research'
}
