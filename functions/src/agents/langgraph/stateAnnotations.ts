/**
 * Shared State Annotations for LangGraph Workflows
 *
 * Provides consistent state schemas across all workflow types:
 * - Sequential, Parallel, Supervisor, Generic, Dialectical
 *
 * Each workflow type extends the core annotation with type-specific fields.
 *
 * NOTE: LangGraph Annotation pattern:
 * - Simple value: `Annotation<T>` (no reducer, replaced on update)
 * - Accumulated value: `Annotation<T>({ reducer: (a, b) => ..., default: () => ... })`
 */

import { Annotation } from '@langchain/langgraph'
import type {
  AgentExecutionStep,
  ThesisOutput,
  NegationOutput,
  ContradictionOutput,
  SublationOutput,
  MetaDecision,
  DialecticalPhase,
  KGDiff,
  CompactGraph,
  GraphDiff,
  RunBudget,
  SearchPlan,
  SourceRecord,
  ExtractedClaim,
  GapAnalysisResult,
  DeepResearchAnswer,
  KGSnapshot,
  KGCompactSnapshot,
  CounterclaimResult,
} from '@lifeos/agents'
import type { WorkflowStatusType } from './utils.js'
import { cappedReducer } from '../shared/reducerUtils.js'
import type { Run } from '@lifeos/agents'
import type { GapType } from '../deepResearch/graphGapAnalysis.js'
import type {
  DialecticalGoalFrame,
  DeepResearchGoalFrame,
  NormalizedStartupInput,
  StartupSeedSummary,
} from '../startup/inputNormalizer.js'

/** Constraint pause info shared across all graph state types */
export type ConstraintPauseInfo = NonNullable<Run['constraintPause']>
import type { CycleMetrics } from '../metaReflection.js'

// ----- Parallel Workflow State -----

/**
 * Failed agent record for tracking partial failures
 */
export interface FailedAgentRecord {
  agentId: string
  agentName: string
  error: string
  errorCode?: string
}

/**
 * State annotation for parallel workflows.
 * All agents execute concurrently with results merged.
 */
export const ParallelStateAnnotation = Annotation.Root({
  // Identifiers
  workflowId: Annotation<string>,
  runId: Annotation<string>,
  userId: Annotation<string>,

  // Input
  goal: Annotation<string>,
  context: Annotation<Record<string, unknown>>,

  // Parallel execution tracking
  agentOutputs: Annotation<Record<string, AgentExecutionStep>>({
    reducer: (current, update) => {
      if (process.env.NODE_ENV !== 'production') {
        for (const key of Object.keys(update)) {
          if (current[key] !== undefined) {
            console.warn(`[ParallelState] agentOutputs key collision for '${key}' — last write wins`)
          }
        }
      }
      return { ...current, ...update }
    },
    default: () => ({}),
  }),
  steps: Annotation<AgentExecutionStep[]>({
    reducer: (current, update) => [...current, ...update],
    default: () => [],
  }),
  failedAgents: Annotation<FailedAgentRecord[]>({
    reducer: (current, update) => [...current, ...update],
    default: () => [],
  }),

  // Metrics
  totalTokensUsed: Annotation<number>({
    reducer: (current, update) => current + update,
    default: () => 0,
  }),
  totalEstimatedCost: Annotation<number>({
    reducer: (current, update) => current + update,
    default: () => 0,
  }),

  // Output
  mergedOutput: Annotation<string>,
  finalOutput: Annotation<string | null>,

  // Status
  status: Annotation<WorkflowStatusType>,
  error: Annotation<string | null>,

  // User input pause
  pendingInput: Annotation<{ prompt: string; nodeId: string } | null>,
})

export type ParallelState = typeof ParallelStateAnnotation.State

// ----- Sequential Workflow State -----

/**
 * State annotation for sequential workflows.
 * Agents execute one after another in a chain.
 */
export const SequentialStateAnnotation = Annotation.Root({
  // Identifiers
  workflowId: Annotation<string>,
  runId: Annotation<string>,
  userId: Annotation<string>,

  // Input
  goal: Annotation<string>,
  context: Annotation<Record<string, unknown>>,

  // Sequential-specific fields
  currentAgentIndex: Annotation<number>,
  currentGoal: Annotation<string>,
  steps: Annotation<AgentExecutionStep[]>({
    reducer: (current, update) => [...current, ...update],
    default: () => [],
  }),

  // Metrics
  totalTokensUsed: Annotation<number>({
    reducer: (current, update) => current + update,
    default: () => 0,
  }),
  totalEstimatedCost: Annotation<number>({
    reducer: (current, update) => current + update,
    default: () => 0,
  }),

  // Output
  lastOutput: Annotation<string>,
  finalOutput: Annotation<string | null>,

  // Status
  status: Annotation<WorkflowStatusType>,
  error: Annotation<string | null>,

  // User input pause
  pendingInput: Annotation<{ prompt: string; nodeId: string } | null>,
})

export type SequentialState = typeof SequentialStateAnnotation.State

// ----- Supervisor Workflow State -----

/**
 * State annotation for supervisor workflows.
 * A supervisor agent delegates to worker agents.
 */
export const SupervisorStateAnnotation = Annotation.Root({
  // Identifiers
  workflowId: Annotation<string>,
  runId: Annotation<string>,
  userId: Annotation<string>,

  // Input
  goal: Annotation<string>,
  context: Annotation<Record<string, unknown>>,

  // Supervisor-specific fields
  supervisorOutput: Annotation<string>,
  delegatedTo: Annotation<string | null>,
  workerOutputs: Annotation<Record<string, string>>({
    reducer: (current, update) => ({ ...current, ...update }),
    default: () => ({}),
  }),
  synthesizedOutput: Annotation<string>,
  steps: Annotation<AgentExecutionStep[]>({
    reducer: (current, update) => [...current, ...update],
    default: () => [],
  }),

  // Iteration tracking
  delegationRound: Annotation<number>,
  maxDelegationRounds: Annotation<number>,

  // Metrics
  totalTokensUsed: Annotation<number>({
    reducer: (current, update) => current + update,
    default: () => 0,
  }),
  totalEstimatedCost: Annotation<number>({
    reducer: (current, update) => current + update,
    default: () => 0,
  }),

  // Output
  finalOutput: Annotation<string | null>,

  // Status
  status: Annotation<WorkflowStatusType>,
  error: Annotation<string | null>,

  // User input pause
  pendingInput: Annotation<{ prompt: string; nodeId: string } | null>,
})

export type SupervisorState = typeof SupervisorStateAnnotation.State

// ----- Generic Graph Workflow State -----
// NOTE: The authoritative GenericGraphStateAnnotation lives in genericGraph.ts
// because it has additional fields (edgeHistory, namedOutputs, etc.) specific
// to the graph execution engine. Re-exported via index.ts from genericGraph.ts.

// ----- Dialectical Workflow State (Future) -----

/**
 * State annotation for dialectical workflows.
 * 6-phase Hegelian reasoning cycle.
 */
export const DialecticalStateAnnotation = Annotation.Root({
  // Identifiers
  workflowId: Annotation<string>,
  runId: Annotation<string>,
  userId: Annotation<string>,

  // Input
  goal: Annotation<string>,
  context: Annotation<Record<string, unknown>>,
  normalizedInput: Annotation<NormalizedStartupInput | null>,
  goalFrame: Annotation<DialecticalGoalFrame | null>,
  startupSeedSummary: Annotation<StartupSeedSummary | null>,

  // Cycle tracking
  cycleNumber: Annotation<number>,
  phase: Annotation<DialecticalPhase>,

  // Dialectical outputs (replace semantics — only current cycle's outputs)
  // Prior knowledge lives in mergedGraph, not in accumulated arrays
  theses: Annotation<ThesisOutput[]>({
    reducer: (current, update) => update.length > 0 ? update : current,
    default: () => [],
  }),
  negations: Annotation<NegationOutput[]>({
    reducer: (current, update) => update.length > 0 ? update : current,
    default: () => [],
  }),
  contradictions: Annotation<ContradictionOutput[]>({
    reducer: (current, update) => update.length > 0 ? update : current,
    default: () => [],
  }),
  synthesis: Annotation<SublationOutput | null>,
  steps: Annotation<AgentExecutionStep[]>({
    reducer: (current, update) => [...current, ...update],
    default: () => [],
  }),

  // Knowledge graph — the evolving merged graph that carries forward across cycles
  mergedGraph: Annotation<CompactGraph | null>,
  graphHistory: Annotation<Array<{ cycle: number; diff: GraphDiff }>>({
    reducer: (current, update) => {
      const merged = [...current, ...update]
      // Cap at 20 entries to prevent unbounded Firestore document growth
      return merged.length > 20 ? merged.slice(-20) : merged
    },
    default: () => [],
  }),

  // Legacy knowledge graph diff tracking
  kgDiff: Annotation<KGDiff | null>,

  // Metrics
  conceptualVelocity: Annotation<number>,
  velocityHistory: Annotation<number[]>({
    reducer: cappedReducer(20),
    default: () => [],
  }),
  contradictionDensity: Annotation<number>,
  densityHistory: Annotation<number[]>({
    reducer: cappedReducer(20),
    default: () => [],
  }),
  cycleMetricsHistory: Annotation<CycleMetrics[]>({
    reducer: cappedReducer(20),
    default: () => [],
  }),
  totalTokensUsed: Annotation<number>({
    reducer: (current, update) => current + (update ?? 0),
    default: () => 0,
  }),
  totalEstimatedCost: Annotation<number>({
    reducer: (current, update) => current + (update ?? 0),
    default: () => 0,
  }),

  // Meta decision
  metaDecision: Annotation<MetaDecision | null>,

  // Constraint pause — workflow paused at a budget/iteration limit
  constraintPause: Annotation<ConstraintPauseInfo | null>,

  // User input pause
  pendingInput: Annotation<{ prompt: string; nodeId: string } | null>,

  // Degraded tracking
  degradedPhases: Annotation<string[]>({
    reducer: (current, update) => [...current, ...update],
    default: () => [],
  }),

  // Agent-to-KG claim ID mapping — built during thesis generation
  // Maps agentId → KG claim IDs added for that agent's thesis claims
  agentClaimMapping: Annotation<Record<string, string[]>>({
    reducer: (current, update) => ({ ...current, ...update }),
    default: () => ({}),
  }),

  // Research state — external search during retrieve_context
  researchBudget: Annotation<RunBudget | null>,
  researchSources: Annotation<SourceRecord[]>({
    reducer: (current, update) => {
      const merged = [...current, ...update]
      if (merged.length > 50) {
        return merged.sort((a, b) => (b.sourceQualityScore ?? 0) - (a.sourceQualityScore ?? 0)).slice(0, 50)
      }
      return merged
    },
    default: () => [],
  }),
  researchClaims: Annotation<ExtractedClaim[]>({
    reducer: (current, update) => {
      const merged = [...current, ...update]
      if (merged.length > 50) {
        return merged.sort((a, b) => b.confidence - a.confidence).slice(0, 50)
      }
      return merged
    },
    default: () => [],
  }),

  // Research decision — set by decide_research nodes (Phase 4 reactive research)
  researchDecision: Annotation<{
    needsResearch: boolean
    searchPlan: SearchPlan | null
    gapTypes: GapType[]
    phase: string
    intensity: 'targeted' | 'verification' | 'none'
    rationale: string
  } | null>({
    reducer: (_cur, upd) => upd,
    default: () => null,
  }),

  // Output
  finalOutput: Annotation<string | null>,

  // Status
  status: Annotation<WorkflowStatusType>,
  error: Annotation<string | null>,
})

export type DialecticalState = typeof DialecticalStateAnnotation.State

// ----- Deep Research Workflow State -----

/**
 * Deep Research pipeline phase type.
 * Used to track which phase the pipeline is currently executing.
 */
export type DeepResearchPhase =
  | 'input_normalizer'
  | 'sense_making'
  | 'context_seeding'
  | 'search_planning'
  | 'search_execution'
  | 'source_ingestion'
  | 'claim_extraction'
  | 'kg_construction'
  | 'kg_snapshot'
  | 'thesis_generation'
  | 'cross_negation'
  | 'contradiction_crystallization'
  | 'sublation'
  | 'meta_reflection'
  | 'gap_analysis'
  | 'counterclaim_search'
  | 'answer_generation'

/**
 * State annotation for deep research workflows.
 * Budget-aware pipeline: search → extract → KG → dialectical → gap analysis → loop.
 */
export const DeepResearchStateAnnotation = Annotation.Root({
  // Identifiers
  workflowId: Annotation<string>,
  runId: Annotation<string>,
  userId: Annotation<string>,

  // Input
  goal: Annotation<string>,
  context: Annotation<Record<string, unknown>>,
  normalizedInput: Annotation<NormalizedStartupInput | null>,
  goalFrame: Annotation<DeepResearchGoalFrame | null>,
  startupSeedSummary: Annotation<StartupSeedSummary | null>,

  // Pipeline phase
  phase: Annotation<DeepResearchPhase>,

  // Budget tracking
  budget: Annotation<RunBudget>,

  // Search & ingestion state (accumulated across gap iterations)
  searchPlans: Annotation<SearchPlan[]>({
    reducer: (current, update) => [...current, ...update],
    default: () => [],
  }),
  sources: Annotation<SourceRecord[]>({
    reducer: cappedReducer(100),
    default: () => [],
  }),
  extractedClaims: Annotation<ExtractedClaim[]>({
    reducer: cappedReducer(200),
    default: () => [],
  }),

  // Content map (sourceId -> content) for claim extraction
  sourceContentMap: Annotation<Record<string, string>>({
    reducer: (current, update) => ({ ...current, ...update }),
    default: () => ({}),
  }),

  // KG reference
  kgSessionId: Annotation<string | null>,

  // KG compact snapshot (transition point between research and dialectical phases)
  kgSnapshot: Annotation<KGCompactSnapshot | null>({
    reducer: (_cur, upd) => upd,
    default: () => null,
  }),

  // Knowledge graph — the evolving merged graph that carries forward across cycles
  mergedGraph: Annotation<CompactGraph | null>({
    reducer: (_cur, upd) => upd,
    default: () => null,
  }),

  // Graph evolution history (capped at 20 to prevent unbounded growth)
  graphHistory: Annotation<Array<{ cycle: number; diff: GraphDiff }>>({
    reducer: (cur, upd) => [...cur, ...upd].slice(-20),
    default: () => [],
  }),

  // Cross-iteration source dedup (string[] for LangGraph serialization — Set breaks checkpointing)
  processedSourceUrls: Annotation<string[]>({
    reducer: (cur, upd) => {
      const merged = new Set([...cur, ...upd])
      return [...merged]
    },
    default: () => [],
  }),

  // Tracks how many claims from extractedClaims have been mapped to KG already
  claimsProcessedCount: Annotation<number>({
    reducer: (_cur, upd) => upd,
    default: () => 0,
  }),

  // Gap loop tracking
  gapIterationsUsed: Annotation<number>,

  // Dialectical outputs (REPLACE semantics — only current cycle's outputs)
  // Prior knowledge lives in mergedGraph, not in accumulated arrays
  dialecticalCycleCount: Annotation<number>,
  theses: Annotation<ThesisOutput[]>({
    reducer: (cur, upd) => upd.length > 0 ? upd : cur,
    default: () => [],
  }),
  negations: Annotation<NegationOutput[]>({
    reducer: (cur, upd) => upd.length > 0 ? upd : cur,
    default: () => [],
  }),
  contradictions: Annotation<ContradictionOutput[]>({
    reducer: (cur, upd) => upd.length > 0 ? upd : cur,
    default: () => [],
  }),
  synthesis: Annotation<SublationOutput | null>,

  // Meta-reflection decision for dialectical sub-loop
  dialecticalMetaDecision: Annotation<MetaDecision | null>,

  // Gap analysis
  gapAnalysis: Annotation<GapAnalysisResult | null>,

  // KG Snapshots for visualization
  kgSnapshots: Annotation<KGSnapshot[]>({
    reducer: (current, update) => [...current, ...update],
    default: () => [],
  }),

  // Counterclaims (Phase 23)
  counterclaims: Annotation<CounterclaimResult[]>({
    reducer: (current, update) => [...current, ...update],
    default: () => [],
  }),

  // Answer
  answer: Annotation<DeepResearchAnswer | null>,

  // Execution steps (accumulated)
  steps: Annotation<AgentExecutionStep[]>({
    reducer: (current, update) => [...current, ...update],
    default: () => [],
  }),

  // Cycle metrics history (accumulated across dialectical cycles)
  cycleMetricsHistory: Annotation<CycleMetrics[]>({
    reducer: cappedReducer(20),
    default: () => [],
  }),

  // Knowledge graph diff tracking
  kgDiff: Annotation<KGDiff | null>,

  // Metrics
  totalTokensUsed: Annotation<number>({
    reducer: (current, update) => current + (update ?? 0),
    default: () => 0,
  }),
  totalEstimatedCost: Annotation<number>({
    reducer: (current, update) => current + (update ?? 0),
    default: () => 0,
  }),

  // Constraint pause — workflow paused at a budget/iteration limit
  constraintPause: Annotation<ConstraintPauseInfo | null>,

  // User input pause
  pendingInput: Annotation<{ prompt: string; nodeId: string } | null>,

  // Degraded tracking
  degradedPhases: Annotation<string[]>({
    reducer: (current, update) => [...current, ...update],
    default: () => [],
  }),

  // Output
  finalOutput: Annotation<string | null>,

  // Status
  status: Annotation<WorkflowStatusType>,
  error: Annotation<string | null>,
})

export type DeepResearchState = typeof DeepResearchStateAnnotation.State
