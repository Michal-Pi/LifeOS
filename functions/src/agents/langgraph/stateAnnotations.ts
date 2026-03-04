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
  RunBudget,
  SearchPlan,
  SourceRecord,
  ExtractedClaim,
  GapAnalysisResult,
  DeepResearchAnswer,
  KGSnapshot,
  CounterclaimResult,
} from '@lifeos/agents'
import type { WorkflowStatusType } from './utils.js'
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
    reducer: (current, update) => ({ ...current, ...update }),
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
})

export type SupervisorState = typeof SupervisorStateAnnotation.State

// ----- Generic Graph Workflow State -----

/**
 * State annotation for generic graph workflows.
 * User-defined topology with conditional edges.
 */
export const GenericGraphStateAnnotation = Annotation.Root({
  // Identifiers
  workflowId: Annotation<string>,
  runId: Annotation<string>,
  userId: Annotation<string>,

  // Input
  goal: Annotation<string>,
  context: Annotation<Record<string, unknown>>,

  // Graph-specific fields
  currentNodeId: Annotation<string | null>,
  visitedNodes: Annotation<string[]>({
    reducer: (current, update) => [...current, ...update],
    default: () => [],
  }),
  visitedCount: Annotation<Record<string, number>>({
    reducer: (current, update) => {
      const result = { ...current }
      for (const [nodeId, count] of Object.entries(update)) {
        result[nodeId] = (result[nodeId] || 0) + count
      }
      return result
    },
    default: () => ({}),
  }),
  nodeOutputs: Annotation<Record<string, string>>({
    reducer: (current, update) => ({ ...current, ...update }),
    default: () => ({}),
  }),
  lastNodeOutput: Annotation<string>,
  steps: Annotation<AgentExecutionStep[]>({
    reducer: (current, update) => [...current, ...update],
    default: () => [],
  }),

  // Join node support
  joinBuffers: Annotation<
    Record<
      string,
      Array<{
        agentId?: string
        agentName?: string
        role?: string
        output: string
      }>
    >
  >({
    reducer: (current, update) => {
      const result = { ...current }
      for (const [nodeId, entries] of Object.entries(update)) {
        result[nodeId] = [...(result[nodeId] || []), ...entries]
      }
      return result
    },
    default: () => ({}),
  }),

  // Human-in-the-loop support
  pendingInput: Annotation<{
    prompt: string
    nodeId: string
  } | null>,

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
})

export type GenericGraphState = typeof GenericGraphStateAnnotation.State

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

  // Cycle tracking
  cycleNumber: Annotation<number>,
  phase: Annotation<DialecticalPhase>,

  // Dialectical outputs (accumulated across cycles)
  theses: Annotation<ThesisOutput[]>({
    reducer: (current, update) => [...current, ...update],
    default: () => [],
  }),
  negations: Annotation<NegationOutput[]>({
    reducer: (current, update) => [...current, ...update],
    default: () => [],
  }),
  contradictions: Annotation<ContradictionOutput[]>({
    reducer: (current, update) => [...current, ...update],
    default: () => [],
  }),
  synthesis: Annotation<SublationOutput | null>,
  steps: Annotation<AgentExecutionStep[]>({
    reducer: (current, update) => [...current, ...update],
    default: () => [],
  }),

  // Knowledge graph diff tracking
  kgDiff: Annotation<KGDiff | null>,

  // Metrics
  conceptualVelocity: Annotation<number>,
  velocityHistory: Annotation<number[]>({
    reducer: (current, update) => [...current, ...update],
    default: () => [],
  }),
  contradictionDensity: Annotation<number>,
  densityHistory: Annotation<number[]>({
    reducer: (current, update) => [...current, ...update],
    default: () => [],
  }),
  cycleMetricsHistory: Annotation<CycleMetrics[]>({
    reducer: (current, update) => [...current, ...update],
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
  | 'sense_making'
  | 'search_planning'
  | 'search_execution'
  | 'source_ingestion'
  | 'claim_extraction'
  | 'kg_construction'
  | 'thesis_generation'
  | 'cross_negation'
  | 'contradiction_crystallization'
  | 'sublation'
  | 'meta_reflection'
  | 'gap_analysis'
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
    reducer: (current, update) => [...current, ...update],
    default: () => [],
  }),
  extractedClaims: Annotation<ExtractedClaim[]>({
    reducer: (current, update) => [...current, ...update],
    default: () => [],
  }),

  // Content map (sourceId -> content) for claim extraction
  sourceContentMap: Annotation<Record<string, string>>({
    reducer: (current, update) => ({ ...current, ...update }),
    default: () => ({}),
  }),

  // KG reference
  kgSessionId: Annotation<string | null>,

  // Gap loop tracking
  gapIterationsUsed: Annotation<number>,

  // Dialectical outputs (accumulated within each gap iteration)
  dialecticalCycleCount: Annotation<number>,
  theses: Annotation<ThesisOutput[]>({
    reducer: (current, update) => [...current, ...update],
    default: () => [],
  }),
  negations: Annotation<NegationOutput[]>({
    reducer: (current, update) => [...current, ...update],
    default: () => [],
  }),
  contradictions: Annotation<ContradictionOutput[]>({
    reducer: (current, update) => [...current, ...update],
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
    reducer: (current, update) => [...current, ...update],
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

  // Output
  finalOutput: Annotation<string | null>,

  // Status
  status: Annotation<WorkflowStatusType>,
  error: Annotation<string | null>,
})

export type DeepResearchState = typeof DeepResearchStateAnnotation.State
