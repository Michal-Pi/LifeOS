/**
 * Oracle Scenario Planning State Annotation
 *
 * LangGraph state schema for the 4-phase Oracle pipeline:
 * Phase 0: Context Gathering (scope parsing + STEEP+V evidence search)
 * Phase 1: Decomposition (sub-question tree + axiom scaffolding + KG construction + verification)
 * Phase 2: Trend Scanning (STEEP+V trends + cross-impact matrix + weak signals)
 * Phase 3: Scenario Simulation (morphological field + scoring + development + backcasting)
 *
 * Accumulated arrays use reducers; replace-on-write fields are simple Annotation<T>.
 */

import { Annotation } from '@langchain/langgraph'
import type {
  AgentExecutionStep,
  OraclePhase,
  OracleScope,
  OracleSearchPlan,
  OracleClaim,
  OracleAssumption,
  OracleEvidence,
  OracleKnowledgeGraph,
  TrendObject,
  UncertaintyObject,
  CrossImpactEntry,
  OracleScenario,
  BackcastTimeline,
  StrategicMove,
  OraclePhaseSummary,
  OracleGateResult,
  OracleCouncilRecord,
  OracleCostTracker,
} from '@lifeos/agents'
import type { WorkflowStatusType } from './utils.js'
import type { ConstraintPauseInfo } from './stateAnnotations.js'
import type {
  NormalizedStartupInput,
  OracleGoalFrame,
  StartupSeedSummary,
} from '../startup/inputNormalizer.js'

export const OracleStateAnnotation = Annotation.Root({
  // ----- Identifiers -----
  workflowId: Annotation<string>,
  runId: Annotation<string>,
  userId: Annotation<string>,

  // ----- Input -----
  goal: Annotation<string>,
  context: Annotation<Record<string, unknown>>,
  normalizedInput: Annotation<NormalizedStartupInput | null>,
  goalFrame: Annotation<OracleGoalFrame | null>,
  startupSeedSummary: Annotation<StartupSeedSummary | null>,

  // ----- Phase tracking -----
  currentPhase: Annotation<OraclePhase>,

  // ----- Phase 0: Context Gathering -----
  scope: Annotation<OracleScope | null>,
  searchPlan: Annotation<OracleSearchPlan>({
    reducer: (_cur, upd) => upd,
    default: () => ({}),
  }),

  // ----- Reasoning Ledger -----
  // Claims and assumptions use replace-on-write because the verifier
  // adjusts confidences and returns the full updated set.
  claims: Annotation<OracleClaim[]>({
    reducer: (_cur, upd) => upd,
    default: () => [],
  }),
  assumptions: Annotation<OracleAssumption[]>({
    reducer: (_cur, upd) => upd,
    default: () => [],
  }),
  evidence: Annotation<OracleEvidence[]>({
    reducer: (current, update) => [...current, ...update].slice(-200),
    default: () => [],
  }),

  // ----- Knowledge Graph (replaced each phase — evolves via graph ops) -----
  knowledgeGraph: Annotation<OracleKnowledgeGraph>({
    reducer: (_cur, upd) => upd,
    default: () => ({ nodes: [], edges: [], loops: [] }),
  }),

  // ----- Phase 2: Trend Scanning -----
  // Replace-on-write: refinement loops produce a replacement set, not additive.
  trends: Annotation<TrendObject[]>({
    reducer: (_cur, upd) => upd,
    default: () => [],
  }),
  uncertainties: Annotation<UncertaintyObject[]>({
    reducer: (_cur, upd) => upd,
    default: () => [],
  }),
  crossImpactMatrix: Annotation<CrossImpactEntry[]>({
    reducer: (_cur, upd) => upd,
    default: () => [],
  }),

  // Human gate approval (end of Phase 2)
  humanGateApproved: Annotation<boolean>,
  humanGateFeedback: Annotation<string | null>,

  // ----- Phase 3: Scenario Simulation -----
  _skeletonCache: Annotation<{ hash: string; skeletons: OracleScenario[] } | null>({
    reducer: (_cur, upd) => upd,
    default: () => null,
  }),
  scenarioPortfolio: Annotation<OracleScenario[]>({
    reducer: (_cur, upd) => upd,
    default: () => [],
  }),
  backcastTimelines: Annotation<BackcastTimeline[]>({
    reducer: (_cur, upd) => upd,
    default: () => [],
  }),
  strategicMoves: Annotation<StrategicMove[]>({
    reducer: (current, update) => [...current, ...update],
    default: () => [],
  }),

  // ----- Cross-cutting: Phase Summaries -----
  phaseSummaries: Annotation<OraclePhaseSummary[]>({
    reducer: (current, update) => [...current, ...update],
    default: () => [],
  }),

  // ----- Gate System -----
  gateResults: Annotation<OracleGateResult[]>({
    reducer: (current, update) => [...current, ...update],
    default: () => [],
  }),
  // Current gate refinement count (reset per gate)
  currentGateRefinements: Annotation<number>,
  gateEscalated: Annotation<boolean>({
    reducer: (current, update) => current || update,
    default: () => false,
  }),
  gateEscalationFeedback: Annotation<string | null>,

  // ----- Expert Council -----
  councilRecords: Annotation<OracleCouncilRecord[]>({
    reducer: (current, update) => [...current, ...update],
    default: () => [],
  }),

  // ----- Cost Tracking -----
  // Replace-on-write: nodes call updateCostTracker() to read-modify-write the full tracker.
  // This is safe in serial execution (Oracle's graph is always serial).
  costTracker: Annotation<OracleCostTracker>({
    reducer: (_cur, upd) => upd,
    default: () => ({
      total: 0,
      byPhase: {},
      byModel: {},
      byComponent: { search: 0, llm: 0, council: 0, evaluation: 0 },
    }),
  }),

  // ----- Execution Steps (accumulated) -----
  steps: Annotation<AgentExecutionStep[]>({
    reducer: (current, update) => [...current, ...update],
    default: () => [],
  }),

  // ----- Metrics (additive, quick-access) -----
  // These overlap with costTracker but provide O(1) access to totals via
  // additive reducers, avoiding the need to traverse the costTracker object.
  // costTracker provides the per-phase/model/component breakdown.
  totalTokensUsed: Annotation<number>({
    reducer: (current, update) => current + (update ?? 0),
    default: () => 0,
  }),
  totalEstimatedCost: Annotation<number>({
    reducer: (current, update) => current + (update ?? 0),
    default: () => 0,
  }),

  // ----- Constraint pause -----
  constraintPause: Annotation<ConstraintPauseInfo | null>,

  // ----- User input pause -----
  pendingInput: Annotation<{ prompt: string; nodeId: string } | null>,
  resumeNodeHint: Annotation<string | null>({
    reducer: (_cur, upd) => upd,
    default: () => null,
  }),

  // ----- Output -----
  finalOutput: Annotation<string | null>,

  // ----- Status -----
  status: Annotation<WorkflowStatusType>,
  error: Annotation<string | null>,

  // Degraded tracking
  degradedPhases: Annotation<string[]>({
    reducer: (current, update) => [...current, ...update],
    default: () => [],
  }),
})

export type OracleState = typeof OracleStateAnnotation.State
