/**
 * useDeepResearchViewer Hook
 *
 * Composes run events, KG data, and KG snapshots for the DeepResearchViewer.
 * Supports timeline scrubbing to view KG state at any pipeline step.
 */

import { useMemo, useState } from 'react'
import { useRunEvents } from '@/hooks/useRunEvents'
import { useKnowledgeGraph } from '@/hooks/useKnowledgeGraph'
import type {
  DialecticalSessionId,
  KGSnapshot,
  RunBudget,
  SourceRecord,
  ExtractedClaim,
} from '@lifeos/agents'
import type { Run, Workflow } from '@lifeos/agents'

// ----- Types -----

export interface PhaseTimelineItem {
  stepIndex: number
  phase: string
  label: string
  status: 'completed' | 'active' | 'pending'
  timestamp?: number
  costUsd?: number
  durationMs?: number
}

export interface EvolutionDataPoint {
  step: number
  phase: string
  claims: number
  sources: number
  concepts: number
  contradictions: number
}

export interface KGViewerData {
  nodes: Array<{ id: string; type: string; data: Record<string, unknown>; label?: string }>
  edges: Array<{ source: string; target: string; type: string; weight?: number }>
}

export interface DeepResearchViewerData {
  // Timeline
  phases: PhaseTimelineItem[]

  // Scrubber
  selectedStep: number | null
  setSelectedStep: (step: number | null) => void
  totalSteps: number

  // Current snapshot
  currentSnapshot: KGSnapshot | null
  previousSnapshot: KGSnapshot | null

  // Highlight sets (for green pulse / fade)
  addedNodeIds: Set<string>
  supersededNodeIds: Set<string>

  // Evolution chart data
  evolutionData: EvolutionDataPoint[]

  // Budget
  budget: RunBudget | null

  // Metadata
  sources: SourceRecord[]
  extractedClaims: ExtractedClaim[]
  gapIterationsUsed: number

  // KG graph data from Firestore
  kgData: KGViewerData | null
  kgLoading: boolean
}

// ----- Pipeline phase order -----

const PHASE_ORDER = [
  'sense_making',
  'search_planning',
  'search_execution',
  'source_ingestion',
  'claim_extraction',
  'kg_construction',
  'thesis_generation',
  'cross_negation',
  'contradiction_crystallization',
  'sublation',
  'meta_reflection',
  'gap_analysis',
  'answer_generation',
]

const PHASE_LABELS: Record<string, string> = {
  sense_making: 'Sense Making',
  search_planning: 'Search Planning',
  search_execution: 'Search',
  source_ingestion: 'Ingest',
  claim_extraction: 'Extract',
  kg_construction: 'Build KG',
  thesis_generation: 'Thesis',
  cross_negation: 'Negate',
  contradiction_crystallization: 'Contradict',
  sublation: 'Sublate',
  meta_reflection: 'Reflect',
  gap_analysis: 'Gap Analysis',
  answer_generation: 'Answer',
}

// ----- Hook -----

export function useDeepResearchViewer(
  run: Run | null,
  _workflow: Workflow | null
): DeepResearchViewerData {
  const { events } = useRunEvents(run?.runId ?? '')
  const [selectedStep, setSelectedStep] = useState<number | null>(null)

  // Extract workflow state
  const workflowState = run?.workflowState as
    | {
        budget?: RunBudget
        sources?: SourceRecord[]
        extractedClaims?: ExtractedClaim[]
        kgSnapshots?: KGSnapshot[]
        kgSessionId?: string
        gapIterationsUsed?: number
      }
    | undefined

  const snapshots: KGSnapshot[] = useMemo(
    () => workflowState?.kgSnapshots ?? [],
    [workflowState?.kgSnapshots]
  )
  const budget = workflowState?.budget ?? null
  const sources = workflowState?.sources ?? []
  const extractedClaims = workflowState?.extractedClaims ?? []
  const gapIterationsUsed = workflowState?.gapIterationsUsed ?? 0
  const kgSessionId = (workflowState?.kgSessionId ?? null) as DialecticalSessionId | null

  // Load real KG data from Firestore
  const { graph: kgGraph, loading: kgLoading } = useKnowledgeGraph(kgSessionId)

  // Build timeline from events
  const phases = useMemo(() => {
    const phaseEvents = events.filter((e) => e.type === 'deep_research_phase')

    const seenPhases = new Set<string>()
    const timeline: PhaseTimelineItem[] = []

    for (const event of phaseEvents) {
      const phase = (event.details as Record<string, unknown>)?.phase as string
      if (!phase || seenPhases.has(phase)) continue
      seenPhases.add(phase)

      timeline.push({
        stepIndex: timeline.length,
        phase,
        label: PHASE_LABELS[phase] ?? phase,
        status: 'completed',
        timestamp: event.createdAtMs,
      })
    }

    // Mark the last phase as active if run is still running
    if (run?.status === 'running' && timeline.length > 0) {
      timeline[timeline.length - 1].status = 'active'
    }

    // Add pending phases
    const lastPhaseIdx =
      timeline.length > 0 ? PHASE_ORDER.indexOf(timeline[timeline.length - 1].phase) : -1

    for (let i = lastPhaseIdx + 1; i < PHASE_ORDER.length; i++) {
      const phase = PHASE_ORDER[i]
      if (!seenPhases.has(phase)) {
        timeline.push({
          stepIndex: timeline.length,
          phase,
          label: PHASE_LABELS[phase] ?? phase,
          status: 'pending',
        })
      }
    }

    return timeline
  }, [events, run?.status])

  // Current and previous snapshot
  const currentIdx = selectedStep ?? (snapshots.length > 0 ? snapshots.length - 1 : -1)
  const currentSnapshot =
    currentIdx >= 0 && currentIdx < snapshots.length ? snapshots[currentIdx] : null
  const previousSnapshot = currentIdx > 0 ? snapshots[currentIdx - 1] : null

  // Highlight sets
  const addedNodeIds = useMemo(
    () => new Set(currentSnapshot?.delta.addedNodeIds ?? []),
    [currentSnapshot]
  )
  const supersededNodeIds = useMemo(
    () => new Set(currentSnapshot?.delta.supersededNodeIds ?? []),
    [currentSnapshot]
  )

  // Evolution data
  const evolutionData = useMemo(
    () =>
      snapshots.map((s) => ({
        step: s.stepIndex,
        phase: s.phase,
        claims: s.stats.claimCount,
        sources: s.stats.sourceCount,
        concepts: s.stats.conceptCount,
        contradictions: s.stats.contradictionCount,
      })),
    [snapshots]
  )

  // Transform KG graph data into viewer-compatible format
  const kgData = useMemo((): KGViewerData | null => {
    if (!kgGraph.nodes.length) return null
    return {
      nodes: kgGraph.nodes.map((n) => ({
        id: n.id,
        type: n.type,
        data: (n.data ?? {}) as Record<string, unknown>,
        label: n.label,
      })),
      edges: kgGraph.edges.map((e) => ({
        source: e.source,
        target: e.target,
        type: e.type,
        weight: e.weight,
      })),
    }
  }, [kgGraph])

  return {
    phases,
    selectedStep,
    setSelectedStep,
    totalSteps: snapshots.length,
    currentSnapshot,
    previousSnapshot,
    addedNodeIds,
    supersededNodeIds,
    evolutionData,
    budget,
    sources,
    extractedClaims,
    gapIterationsUsed,
    kgData,
    kgLoading,
  }
}
