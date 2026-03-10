/**
 * Oracle Scenario Planning Workflow Domain Types
 *
 * Defines the types for Oracle — an AI-powered scenario planning engine with:
 * - 4-phase pipeline: Context Gathering → Decomposition → Trend Scanning → Scenario Simulation
 * - Multi-model Expert Council with selective invocation (3 gate moments)
 * - Axiom-guided reasoning via 142 mental models, 21 recipes, and 15 techniques
 * - Stage gates with rubric scoring and refinement loops
 * - Reasoning Ledger for full traceability (Claims → Assumptions → Evidence → Axiom refs)
 *
 * Reference: docs/Oracle/oracle_v3_technical_design.md
 */

// ----- Oracle Pipeline Phases -----

export const ORACLE_PHASES = [
  'context_gathering', // Phase 0
  'decomposition', // Phase 1
  'trend_scanning', // Phase 2
  'scenario_simulation', // Phase 3
] as const

export type OraclePhase = (typeof ORACLE_PHASES)[number]

export type OracleDepthMode = 'quick' | 'standard' | 'deep'

// ----- Scope -----

export interface OracleScope {
  topic: string
  domain: string
  timeHorizon: string
  geography: string
  decisionContext: string
  boundaries: {
    inScope: string[]
    outOfScope: string[]
  }
}

export type OracleSearchPlan = Record<string, string[]>

// ----- Reasoning Ledger -----

export interface OracleClaim {
  id: string // "CLM-001"
  type: 'descriptive' | 'causal' | 'forecast'
  text: string
  confidence: number // 0-1
  confidenceBasis: 'data' | 'model_consensus' | 'expert_judgment' | 'speculative'
  assumptions: string[] // ASM IDs
  evidenceIds: string[] // EVD IDs
  dependencies: string[] // Other CLM IDs
  axiomRefs: string[] // AXM IDs
  createdBy: string // Agent + model
  phase: number
}

export interface OracleAssumption {
  id: string // "ASM-001"
  type: 'economic' | 'technical' | 'behavioral' | 'regulatory' | 'structural'
  statement: string
  sensitivity: 'high' | 'medium' | 'low'
  observables: string[] // What would confirm/deny
  confidence: number // 0-1
}

export interface OracleEvidence {
  id: string // "EVD-001"
  category?: string
  query?: string
  source: string
  url: string
  date: string
  timestamp?: number
  excerpt: string
  enrichedExcerpt?: string // ~500-char LLM summary of full-page crawl content
  crawlStatus?: 'skipped' | 'success' | 'failed'
  reliability: number // 0-1
  searchTool: 'serper' | 'exa' | 'firecrawl' | 'jina' | 'serp' | 'scholar' | 'semantic'
}

// ----- Knowledge Graph (Unified: causal + logic) -----

export type OracleGraphNodeType =
  | 'principle'
  | 'constraint'
  | 'trend'
  | 'uncertainty'
  | 'variable'
  | 'scenario_state'

export interface OracleGraphNode {
  id: string
  type: OracleGraphNodeType
  label: string
  ledgerRef?: string // Links to Reasoning Ledger claim
  properties: Record<string, unknown>
}

export type OracleGraphEdgeType =
  | 'causes'
  | 'constrains'
  | 'disrupts'
  | 'reinforces'
  | 'resolves_as'
  | 'supports'
  | 'contradicts'
  | 'depends_on'

export interface OracleGraphEdge {
  source: string
  target: string
  type: OracleGraphEdgeType
  polarity?: '+' | '-' | 'conditional'
  strength: number // 0-1
  lag?: 'immediate' | 'short' | 'medium' | 'long'
}

export interface OracleFeedbackLoop {
  id: string
  type: 'reinforcing' | 'balancing'
  nodes: string[]
  description: string
}

export interface OracleKnowledgeGraph {
  nodes: OracleGraphNode[]
  edges: OracleGraphEdge[]
  loops: OracleFeedbackLoop[]
}

// ----- Phase 2: Trends & Uncertainties -----

export interface TrendObject {
  id: string
  statement: string
  steepCategory: 'social' | 'technological' | 'economic' | 'environmental' | 'political' | 'values'
  direction: string
  momentum: 'accelerating' | 'steady' | 'decelerating'
  impactScore: number // 0-1
  uncertaintyScore: number // 0-1
  evidenceIds: string[]
  causalLinks: string[] // Phase 1 principle IDs affected
  secondOrderEffects: string[]
}

export interface UncertaintyObject {
  id: string
  variable: string
  states: string[] // Discrete resolution options
  drivers: string[]
  impacts: string[]
  observables: string[] // Signposts
  controllability: 'none' | 'low' | 'medium' | 'high'
  timeToResolution: string
}

export interface CrossImpactEntry {
  sourceId: string
  targetId: string
  effect: 'increases' | 'decreases' | 'enables' | 'blocks' | 'neutral'
  strength: number // 0-1
  mechanism: string
}

// ----- Phase 3: Scenarios -----

export interface OracleScenario {
  id: string
  name: string
  premise: Record<string, string> // uncertainty_id → resolved state
  narrative: string
  reinforcedPrinciples: string[]
  disruptedPrinciples: string[]
  feedbackLoops: OracleFeedbackLoop[]
  implications: string
  signposts: string[]
  tailRisks: string[]
  assumptionRegister: string[] // ASM IDs
  councilAssessment: {
    agreementRate: number
    persistentDissent: string[]
  }
  plausibilityScore: number // 0-1
  divergenceScore: number // 0-1
}

export type StrategicMoveType = 'no_regret' | 'option_to_buy' | 'hedge' | 'kill_criterion'

export interface StrategicMove {
  type: StrategicMoveType
  description: string
  worksAcross: string[] // Scenario IDs
  timing: string
  ledgerRefs: string[]
}

export interface BackcastTimeline {
  scenarioId: string
  targetYear: string
  milestones: Array<{
    year: string
    event: string
    prerequisites: string[]
  }>
  strategicMoves: StrategicMove[]
}

// ----- Phase Summaries -----

export interface OraclePhaseSummary {
  phase: OraclePhase
  executive: string[] // 5-10 bullets
  keyClaims: Array<{ id: string; summary: string; confidence: number }> // Max 15
  keyAssumptions: Array<{ id: string; statement: string; sensitivity: string }>
  unresolvedTensions: string[]
  tokenCount: number // Target: ~2K
}

// ----- Gate System -----

export type OracleGateType = 'gate_a' | 'gate_b' | 'gate_c'

export type OracleRemediationTargetNode = 'decomposer' | 'scanner' | 'equilibrium_analyst'

export type OracleSteepCategory =
  | 'social'
  | 'technological'
  | 'economic'
  | 'environmental'
  | 'political'
  | 'values'

export interface OracleRubricScores {
  mechanisticClarity: number // 1-5
  completeness: number // 1-5
  causalDiscipline: number // 1-5
  decisionUsefulness: number // 1-5
  uncertaintyHygiene: number // 1-5
  evidenceQuality: number // 1-5
}

export interface OracleGateResult {
  gateType: OracleGateType
  passed: boolean
  scores: OracleRubricScores
  averageScore: number
  feedback: string
  axiomGroundingPercent?: number // Gate A specific
  refinementAttempt: number // 0 = first try
  evaluatedAtMs: number
}

export interface OracleGateRemediationPlan {
  gateType: OracleGateType
  targetNode: OracleRemediationTargetNode
  summary: string
  requiredFixes: string[]
  requiredDeliverables: string[]
  missingSteepvCategories: OracleSteepCategory[]
  requirePrimarySources: boolean
  requireAlternativeExplanations: boolean
  requireFalsifiers: boolean
  requireQuantification: boolean
  requireAssumptionRegisterExpansion: boolean
  requireKnowledgeGraphExpansion: boolean
  requireAxiomGroundingImprovement: boolean
  minNewEvidenceCount: number
  minNewClaimCount: number
  minNewAssumptionCount: number
  minNewKgEdges: number
  minAxiomGroundingPercent: number
  searchPlan: OracleSearchPlan
}

export interface OracleRemediationDelta {
  newEvidenceCount: number
  newClaimCount: number
  newAssumptionCount: number
  newKgEdges: number
  axiomGroundingBefore: number
  axiomGroundingAfter: number
  missingSteepvBefore: OracleSteepCategory[]
  missingSteepvAfter: OracleSteepCategory[]
}

export interface OracleGateEscalationContext {
  activeGate?: OracleGateType
  remediationPlan?: OracleGateRemediationPlan | null
  remediationDelta?: OracleRemediationDelta | null
  remediationRound?: number
}

// ----- Expert Council Records -----

export interface OracleCouncilRecord {
  sessionId: string
  gateType: OracleGateType
  models: Array<{
    provider: string
    model: string
    response: string
    tokensUsed: number
  }>
  convergenceRate: number // 0-1 (4/4 = 1.0, 3/4 = 0.75, 2/2 = 0.5)
  persistentDissent: string[]
  synthesis: string
  evaluatedAtMs: number
}

// ----- Cost Tracking -----

export interface OracleCostTracker {
  total: number // USD
  byPhase: Record<number, number>
  byModel: Record<string, number>
  byComponent: {
    search: number
    llm: number
    council: number
    evaluation: number
  }
}

// ----- Axiom Library & Cookbook -----

export interface AxiomSystemElevation {
  role: string
  behavior: string
}

export interface AxiomEntry {
  id: string // "AXM-001"
  name: string
  domain:
    | 'economics'
    | 'cognitive_science'
    | 'information_theory'
    | 'systems_dynamics'
    | 'game_theory'
    | 'organizational_theory'
  formalDefinition: string
  mathematicalFormulation?: string
  boundaryConditions: string[]
  canonicalCitations: string[]
  systemElevation?: AxiomSystemElevation
}

export interface AxiomRecipeStep {
  step: number
  action: string
  axioms: string[] // AXM IDs
  instruction: string
}

export interface AxiomRecipeTrap {
  trap: string
  antidote: string
}

export interface AxiomRecipe {
  id: string // "A1", "B2", etc.
  name: string
  category: string // "A", "B", "C", "D", "E"
  question: string
  whenToUse: string
  oraclePhases: string[] // "Phase 1", "Phase 2", etc.
  oracleAgents: string[] // "Decomposer", "Scanner", etc.
  axiomSequence: AxiomRecipeStep[]
  techniques: string[] // T01, T02, etc.
  traps: AxiomRecipeTrap[]
  outputTemplate: string
}

export interface AxiomTechnique {
  id: string // "T01", "T02", etc.
  name: string
  description: string
  keyAxioms: string[] // AXM IDs
  usedInRecipes: string[] // Recipe IDs
  commonErrors: string[]
  output: string
}

// ----- Run Configuration -----

export interface OracleCrawlEnrichmentConfig {
  enabled: boolean // default true
  maxUrlsToCrawl: number // default 6
  maxContentChars: number // default 8000 per page
  summarizeToChars: number // default 500
}

export interface OracleRunConfig {
  depthMode: OracleDepthMode
  maxBudgetUsd: number
  maxRefinementsPerGate: number // Default 3
  maxCouncilSessions: number // Default 3
  enableHumanGate: boolean // Pause after Phase 2 for user approval
  scenarioCount: number // Target 3-5
  timeHorizon?: string
  geography?: string
  crawlEnrichment?: OracleCrawlEnrichmentConfig
}

export function createDefaultOracleConfig(): OracleRunConfig {
  return {
    depthMode: 'standard',
    maxBudgetUsd: 25,
    maxRefinementsPerGate: 3,
    maxCouncilSessions: 3,
    enableHumanGate: true,
    scenarioCount: 4,
    crawlEnrichment: {
      enabled: true,
      maxUrlsToCrawl: 6,
      maxContentChars: 8000,
      summarizeToChars: 500,
    },
  }
}
