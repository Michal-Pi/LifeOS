/**
 * Dialectical Workflow Domain Types
 *
 * Implements the Hegelian multi-agent dialectical architecture with a
 * 4-layer knowledge hypergraph structure:
 *
 * Layer 0: Raw Episodes (agent exchanges)
 * Layer 1: Semantic Claims, Mechanisms (hyperedges), Contradictions
 * Layer 2: Versioned Concepts, Regimes (condition sets)
 * Layer 3: Community Clusters (auto-discovered)
 *
 * All edges are bi-temporal with t_valid/t_invalid (world time) and
 * t_created/t_expired (system time).
 */

import type { Id } from '@lifeos/core'
import type { AgentId, ModelProvider, WorkflowId, RunId } from './models'
import type { RewriteOperatorType } from './workflowState'

// ----- IDs -----

export type EpisodeId = Id<'episode'>
export type ClaimId = Id<'claim'>
export type MechanismId = Id<'mechanism'>
export type ContradictionId = Id<'contradiction'>
export type ConceptId = Id<'concept'>
export type RegimeId = Id<'regime'>
export type CommunityId = Id<'community'>
export type DialecticalSessionId = Id<'dialecticalSession'>

// ----- Enums -----

/**
 * Dialectical agent roles for the 6-phase cycle
 */
export type DialecticalAgentRole =
  | 'thesis_generator'
  | 'antithesis_agent'
  | 'contradiction_tracker'
  | 'synthesis_agent'
  | 'meta_reflection'
  | 'schema_induction'

/**
 * Dialectical workflow node types for the 6 phases
 */
export type DialecticalNodeType =
  | 'retrieve_context'
  | 'generate_theses'
  | 'cross_negation'
  | 'crystallize_contradictions'
  | 'sublate'
  | 'meta_reflect'

/**
 * Thesis lens types for multi-perspective generation
 */
export type ThesisLens =
  | 'economic'
  | 'systems'
  | 'adversarial'
  | 'behavioral'
  | 'historical'
  | 'technical'
  | 'political'
  | 'ecological'
  | 'custom'

/**
 * Contradiction types for classification
 */
export type ContradictionType =
  | 'SYNCHRONIC' // Same time, incompatible claims
  | 'DIACHRONIC' // Claims incompatible across time
  | 'REGIME_SHIFT' // Claims valid under different regimes

/**
 * Contradiction severity levels
 */
export type ContradictionSeverity = 'HIGH' | 'MEDIUM' | 'LOW'

/**
 * Tracker types for specialized contradiction detection
 */
export type ContradictionTrackerType =
  | 'LOGIC' // A ∧ ¬A detection
  | 'PRAGMATIC' // Action incompatibility
  | 'SEMANTIC' // Equivocation detection
  | 'BOUNDARY' // Regime mismatch

// ----- Layer 0: Episodes -----

/**
 * Raw exchange episode from agent interaction
 */
export interface Episode {
  episodeId: EpisodeId
  sessionId: DialecticalSessionId
  userId: string

  // Source information
  agentId: AgentId
  agentName: string
  role: DialecticalAgentRole
  model: string
  provider: ModelProvider

  // Content
  input: string
  output: string
  phase: DialecticalNodeType

  // Cycle context
  cycleNumber: number

  // Timing
  startedAtMs: number
  completedAtMs: number
  durationMs: number

  // Metrics
  tokensUsed: number
  estimatedCost: number

  // Extracted claims (forward reference)
  extractedClaimIds: ClaimId[]
}

// ----- Layer 1: Claims, Mechanisms, Contradictions -----

/**
 * Semantic claim extracted from agent output
 */
export interface Claim {
  claimId: ClaimId
  sessionId: DialecticalSessionId
  userId: string

  // Content
  text: string
  normalizedText: string // Canonical form for comparison

  // Source
  sourceEpisodeId: EpisodeId
  sourceAgentId: AgentId
  sourceLens: ThesisLens

  // Classification
  claimType: 'ASSERTION' | 'PREDICTION' | 'PRESCRIPTION' | 'COUNTERFACTUAL'

  // Confidence and status
  confidence: number // 0-1
  status: 'ACTIVE' | 'SUPERSEDED' | 'REFUTED' | 'MERGED'
  supersededBy?: ClaimId

  // Regime context
  regimeId?: RegimeId // Optional scope restriction

  // Bi-temporal tracking
  temporal: BiTemporalEdge

  // Relationships
  conceptIds: ConceptId[] // Concepts this claim involves
  contradictionIds: ContradictionId[] // Contradictions involving this claim
}

/**
 * Hyperedge connecting multiple claims through a mechanism
 */
export interface Mechanism {
  mechanismId: MechanismId
  sessionId: DialecticalSessionId
  userId: string

  // Content
  description: string
  mechanismType: 'CAUSAL' | 'DEFINITIONAL' | 'CORRELATIONAL' | 'TEMPORAL'

  // Participating claims (hyperedge connects multiple nodes)
  participantClaimIds: ClaimId[]
  roles: Record<string, 'CAUSE' | 'EFFECT' | 'MEDIATOR' | 'CONDITION' | 'CONSTRAINT'>

  // Source
  sourceEpisodeId: EpisodeId
  discoveredInCycle: number

  // Confidence
  confidence: number

  // Temporal
  temporal: BiTemporalEdge
}

/**
 * Tracked contradiction between claims
 */
export interface Contradiction {
  contradictionId: ContradictionId
  sessionId: DialecticalSessionId
  userId: string

  // Classification
  type: ContradictionType
  severity: ContradictionSeverity
  trackerType: ContradictionTrackerType

  // Description
  description: string
  detailedAnalysis: string

  // Participating claims
  claimIds: ClaimId[]

  // Action distance (BFS shortest path to action node)
  actionDistance: number

  // Resolution status
  status: 'OPEN' | 'RESOLVED' | 'ACKNOWLEDGED' | 'DEFERRED'
  resolutionNote?: string
  resolvedBySublationId?: string

  // Discovery context
  discoveredInCycle: number
  discoveredByAgentId: AgentId

  // Temporal
  temporal: BiTemporalEdge
}

// ----- Layer 2: Concepts, Regimes -----

/**
 * Versioned concept in the ontology
 */
export interface Concept {
  conceptId: ConceptId
  sessionId: DialecticalSessionId
  userId: string

  // Content
  name: string
  definition: string
  alternateNames: string[] // Synonyms

  // Versioning
  version: number
  previousVersionId?: ConceptId

  // Classification
  conceptType: 'ENTITY' | 'PROCESS' | 'PROPERTY' | 'RELATION' | 'ABSTRACT'

  // Source
  introducedInCycle: number
  introducedByAgentId?: AgentId

  // Relationships (to be populated by graph queries)
  parentConceptIds: ConceptId[] // Is-a relationships
  relatedConceptIds: ConceptId[] // Non-hierarchical relationships
  claimIds: ClaimId[] // Claims involving this concept

  // Temporal
  temporal: BiTemporalEdge
}

/**
 * Regime defining a set of conditions/assumptions
 */
export interface Regime {
  regimeId: RegimeId
  sessionId: DialecticalSessionId
  userId: string

  // Content
  name: string
  description: string

  // Conditions that define this regime
  conditions: RegimeCondition[]

  // Claims valid under this regime
  scopedClaimIds: ClaimId[]

  // Temporal bounds (when is this regime applicable?)
  applicableFrom?: string // ISO date or "always"
  applicableTo?: string // ISO date or "ongoing"

  // Discovery
  discoveredInCycle: number
  discoveredReason: string

  // Temporal
  temporal: BiTemporalEdge
}

/**
 * Condition defining part of a regime
 */
export interface RegimeCondition {
  variable: string
  operator: 'equals' | 'greater_than' | 'less_than' | 'in_range' | 'in_set' | 'exists'
  value: unknown
  description: string
}

// ----- Layer 3: Communities -----

/**
 * Auto-discovered community cluster
 */
export interface Community {
  communityId: CommunityId
  sessionId: DialecticalSessionId
  userId: string

  // Content
  name: string
  description: string
  summary: string // LLM-generated summary

  // Members
  conceptIds: ConceptId[]
  claimIds: ClaimId[]
  mechanismIds: MechanismId[]

  // Clustering metadata
  clusteringMethod: 'HDBSCAN' | 'LLM_GROUPING' | 'MANUAL'
  clusteringParams: Record<string, unknown>
  cohesionScore: number // 0-1, how tightly related are members

  // Discovery
  discoveredInCycle: number

  // Temporal
  temporal: BiTemporalEdge
}

/**
 * Stored concept for cross-run reuse (Phase 29)
 */
export interface StoredConcept {
  conceptId: string
  name: string
  definition: string
  version: number
  sourceRunId: string
  tags: string[]
  createdAt: number
  updatedAt: number
}

// ----- Bi-Temporal Edge -----

/**
 * Bi-temporal tracking for all graph elements
 *
 * World time: When is this element valid in reality?
 * System time: When did we record this element?
 */
export interface BiTemporalEdge {
  // World time (when is this true?)
  tValid: number // Start of validity (ms since epoch)
  tInvalid: number | null // End of validity (null = still valid)

  // System time (when did we record this?)
  tCreated: number // When we first recorded this
  tExpired: number | null // When we marked this as superseded (null = current)
}

/**
 * Create a new bi-temporal edge with current timestamp
 */
export function createBiTemporalEdge(): BiTemporalEdge {
  const now = Date.now()
  return {
    tValid: now,
    tInvalid: null,
    tCreated: now,
    tExpired: null,
  }
}

/**
 * Mark a bi-temporal edge as expired (superseded)
 */
export function expireBiTemporalEdge(edge: BiTemporalEdge): BiTemporalEdge {
  return {
    ...edge,
    tExpired: Date.now(),
  }
}

/**
 * Mark a bi-temporal edge as invalid (no longer true in the world)
 */
export function invalidateBiTemporalEdge(edge: BiTemporalEdge): BiTemporalEdge {
  return {
    ...edge,
    tInvalid: Date.now(),
  }
}

// ----- Dialectical Session -----

/**
 * Top-level session containing all dialectical artifacts
 */
export interface DialecticalSession {
  sessionId: DialecticalSessionId
  workflowId: WorkflowId
  runId: RunId
  userId: string

  // Goal
  topic: string
  initialGoal: string

  // Progress
  currentCycle: number
  currentPhase: DialecticalNodeType
  status: 'RUNNING' | 'PAUSED' | 'COMPLETED' | 'FAILED'

  // Configuration
  config: DialecticalWorkflowConfig

  // Metrics
  totalCycles: number
  conceptualVelocityHistory: number[] // Velocity per cycle
  contradictionDensityHistory: number[] // Contradictions per claim per cycle

  // Timing
  startedAtMs: number
  lastActivityMs: number
  completedAtMs?: number

  // Cost
  totalTokensUsed: number
  totalEstimatedCost: number
}

/**
 * Configuration for dialectical workflow execution
 */
export interface DialecticalWorkflowConfig {
  // Thesis generation
  thesisAgents: ThesisAgentConfig[]
  minTheses: number
  maxTheses: number

  // Negation
  enableCrossNegation: boolean // Each thesis agent critiques others
  negationDepth: number // How many levels of negation

  // Contradiction tracking
  enabledTrackers: ContradictionTrackerType[]
  minActionDistance: number // Only track contradictions within this distance of action

  // Sublation
  sublationStrategy: 'COMPETITIVE' | 'COLLABORATIVE' | 'HIERARCHICAL'
  maxSublationCandidates: number

  // Meta-reflection
  velocityThreshold: number // Below this, consider terminating
  /** Filter contradictions by severity for progressive deepening (Phase 27) */
  contradictionSeverityFilter?: 'all' | 'high' | 'critical'
  maxCycles: number
  minCycles: number

  // Knowledge graph
  enableKGPersistence: boolean
  enableCommunityDetection: boolean
  communityDetectionMethod: 'HDBSCAN' | 'LLM_GROUPING'

  // Retrieval
  retrievalDepth: number // How many hops in the graph
  retrievalTopK: number // Top K related concepts to retrieve

  /** Enable deep research fusion with dialectical workflow (Phase 30) */
  enableResearchFusion?: boolean

  /** Quick vs full dialectic mode (Phase 28) */
  mode?: 'full' | 'quick'
}

/**
 * Configuration for a thesis generation agent
 */
export interface ThesisAgentConfig {
  agentId?: AgentId // Optional, will be created if not provided
  lens: ThesisLens
  modelProvider: ModelProvider
  modelName: string
  temperature?: number
  systemPromptOverride?: string
  /** Role-specific guidance for this lens */
  lensGuidance?: string
}

/**
 * Structured thesis output for validation
 * Agents must produce output conforming to this structure
 *
 * Note: This matches ThesisOutput in workflowState.ts - causalModel is string[]
 * containing causal statements like "X causes Y" rather than tuple pairs.
 */
export interface StructuredThesisOutput {
  /** Key concepts and their relationships as adjacency list */
  conceptGraph: Record<string, string[]>
  /** Causal statements (e.g., "Interest rates affect housing prices") */
  causalModel: string[]
  /** Conditions that would falsify this thesis */
  falsificationCriteria: string[]
  /** Actions/decisions implied by this thesis */
  decisionImplications: string[]
  /** Primary entity or phenomenon under analysis */
  unitOfAnalysis: string
  /** Time scale: 'immediate' | 'short_term' | 'medium_term' | 'long_term' | 'historical' */
  temporalGrain: 'immediate' | 'short_term' | 'medium_term' | 'long_term' | 'historical'
  /** Assumptions about the environment/context */
  regimeAssumptions: string[]
  /** Confidence score 0-1 */
  confidence: number
}

/**
 * Structured negation output for validation
 * Requires a typed rewrite operator (no free-text negation)
 */
export interface StructuredNegationOutput {
  /** Internal contradictions found in target thesis */
  internalTensions: string[]
  /** Challenges to the categories/concepts used */
  categoryAttacks: string[]
  /** Valid elements to preserve from target */
  preservedValid: string[]
  /** Alternative framing of the problem */
  rivalFraming: string
  /** Required: typed rewrite operator */
  rewriteOperator: RewriteOperatorType
  /** Arguments for the operator */
  operatorArgs: Record<string, unknown>
}

/**
 * Lens-specific system prompts for thesis generation
 * Each lens provides a distinct analytical perspective
 */
export const THESIS_LENS_PROMPTS: Record<ThesisLens, string> = {
  economic: `Analyze from an economic perspective focusing on:
- Incentives and rational actor models
- Cost-benefit tradeoffs and opportunity costs
- Market dynamics, supply/demand, price signals
- Resource allocation and scarcity
- Game theory and strategic interactions`,

  systems: `Analyze from a systems thinking perspective focusing on:
- Feedback loops (reinforcing and balancing)
- Emergent properties and non-linear dynamics
- System boundaries and environment interactions
- Delays, accumulations, and stock-flow relationships
- Leverage points and system archetypes`,

  adversarial: `Analyze from an adversarial/red team perspective focusing on:
- Attack vectors and failure modes
- Edge cases and boundary conditions
- Unintended consequences and second-order effects
- How the proposed approach could fail or be gamed
- Robustness under adversarial conditions`,

  behavioral: `Analyze from a behavioral science perspective focusing on:
- Cognitive biases and heuristics
- Emotional and social factors
- Habit formation and behavior change
- Bounded rationality and satisficing
- Nudges and choice architecture`,

  historical: `Analyze from a historical perspective focusing on:
- Precedents and analogies from past events
- Path dependencies and lock-in effects
- Cycles and patterns across time
- Contextual factors that shaped outcomes
- Lessons learned and counterfactuals`,

  technical: `Analyze from a technical/engineering perspective focusing on:
- Implementation feasibility and constraints
- System architecture and dependencies
- Scalability, performance, and reliability
- Technical debt and maintenance burden
- Security and failure handling`,

  political: `Analyze from a political economy perspective focusing on:
- Power dynamics and stakeholder interests
- Coalition building and negotiation
- Institutional constraints and incentives
- Public choice and collective action problems
- Legitimacy and governance structures`,

  ecological: `Analyze from an ecological/environmental perspective focusing on:
- Sustainability and resource limits
- Ecosystem services and dependencies
- Externalities and commons problems
- Resilience and adaptation capacity
- Intergenerational considerations`,

  custom: `Provide a thorough analysis from your assigned perspective.`,
}

/**
 * Preset thesis agent configurations for common use cases
 */
export const THESIS_AGENT_PRESETS = {
  /** Balanced trio: economic efficiency, systems dynamics, adversarial robustness */
  balanced: [
    {
      lens: 'economic' as ThesisLens,
      modelProvider: 'anthropic' as ModelProvider,
      modelName: 'claude-sonnet-4-5',
    },
    {
      lens: 'systems' as ThesisLens,
      modelProvider: 'openai' as ModelProvider,
      modelName: 'gpt-5.2',
    },
    {
      lens: 'adversarial' as ThesisLens,
      modelProvider: 'google' as ModelProvider,
      modelName: 'gemini-2.5-pro',
    },
  ],

  /** Decision-focused: economic, behavioral, political */
  decision: [
    {
      lens: 'economic' as ThesisLens,
      modelProvider: 'anthropic' as ModelProvider,
      modelName: 'claude-sonnet-4-5',
    },
    {
      lens: 'behavioral' as ThesisLens,
      modelProvider: 'openai' as ModelProvider,
      modelName: 'gpt-5.2',
    },
    {
      lens: 'political' as ThesisLens,
      modelProvider: 'google' as ModelProvider,
      modelName: 'gemini-2.5-pro',
    },
  ],

  /** Technical analysis: systems, technical, adversarial */
  technical: [
    {
      lens: 'systems' as ThesisLens,
      modelProvider: 'anthropic' as ModelProvider,
      modelName: 'claude-sonnet-4-5',
    },
    {
      lens: 'technical' as ThesisLens,
      modelProvider: 'openai' as ModelProvider,
      modelName: 'gpt-5.2',
    },
    {
      lens: 'adversarial' as ThesisLens,
      modelProvider: 'google' as ModelProvider,
      modelName: 'gemini-2.5-pro',
    },
  ],

  /** Strategic planning: historical, political, systems */
  strategic: [
    {
      lens: 'historical' as ThesisLens,
      modelProvider: 'anthropic' as ModelProvider,
      modelName: 'claude-sonnet-4-5',
    },
    {
      lens: 'political' as ThesisLens,
      modelProvider: 'openai' as ModelProvider,
      modelName: 'gpt-5.2',
    },
    {
      lens: 'systems' as ThesisLens,
      modelProvider: 'google' as ModelProvider,
      modelName: 'gemini-2.5-pro',
    },
  ],

  /** Sustainability focus: ecological, economic, systems */
  sustainability: [
    {
      lens: 'ecological' as ThesisLens,
      modelProvider: 'anthropic' as ModelProvider,
      modelName: 'claude-sonnet-4-5',
    },
    {
      lens: 'economic' as ThesisLens,
      modelProvider: 'openai' as ModelProvider,
      modelName: 'gpt-5.2',
    },
    {
      lens: 'systems' as ThesisLens,
      modelProvider: 'google' as ModelProvider,
      modelName: 'gemini-2.5-pro',
    },
  ],

  /** Full heterogeneity: 5 diverse lenses across 4 providers */
  full: [
    {
      lens: 'economic' as ThesisLens,
      modelProvider: 'anthropic' as ModelProvider,
      modelName: 'claude-sonnet-4-5',
    },
    {
      lens: 'systems' as ThesisLens,
      modelProvider: 'openai' as ModelProvider,
      modelName: 'gpt-5.2',
    },
    {
      lens: 'adversarial' as ThesisLens,
      modelProvider: 'google' as ModelProvider,
      modelName: 'gemini-2.5-pro',
    },
    {
      lens: 'behavioral' as ThesisLens,
      modelProvider: 'xai' as ModelProvider,
      modelName: 'grok-4',
    },
    {
      lens: 'historical' as ThesisLens,
      modelProvider: 'anthropic' as ModelProvider,
      modelName: 'claude-opus-4-6',
    },
  ],
} as const

/**
 * Best model per lens for provider diversity (Phase 26)
 */
export const LENS_MODEL_PRESETS: Record<ThesisLens, { provider: string; modelName: string }> = {
  adversarial: { provider: 'anthropic', modelName: 'claude-sonnet-4-5' },
  systems:     { provider: 'anthropic', modelName: 'claude-sonnet-4-5' },
  economic:    { provider: 'openai',    modelName: 'o1' },
  technical:   { provider: 'openai',    modelName: 'o1' },
  behavioral:  { provider: 'google',    modelName: 'gemini-2.5-pro' },
  historical:  { provider: 'google',    modelName: 'gemini-2.5-pro' },
  political:   { provider: 'xai',       modelName: 'grok-4' },
  ecological:  { provider: 'xai',       modelName: 'grok-4' },
  custom:      { provider: 'openai',    modelName: 'gpt-5.2' },
}

export type ThesisAgentPreset = keyof typeof THESIS_AGENT_PRESETS

// ----- Rewrite Operators (moved from workflowState for completeness) -----

// Note: RewriteOperatorType and RewriteOperator are already defined in workflowState.ts
// Re-export them here for convenience
export type { RewriteOperatorType, RewriteOperator, KGDiff } from './workflowState'

// ----- Input Types -----

export type CreateEpisodeInput = Omit<
  Episode,
  'episodeId' | 'completedAtMs' | 'durationMs' | 'extractedClaimIds'
>

export type CreateClaimInput = Omit<Claim, 'claimId' | 'status' | 'temporal' | 'contradictionIds'>

export type CreateMechanismInput = Omit<Mechanism, 'mechanismId' | 'temporal'>

export type CreateContradictionInput = Omit<
  Contradiction,
  'contradictionId' | 'status' | 'temporal'
>

export type CreateConceptInput = Omit<Concept, 'conceptId' | 'version' | 'temporal' | 'claimIds'>

export type CreateRegimeInput = Omit<Regime, 'regimeId' | 'temporal' | 'scopedClaimIds'>

export type CreateCommunityInput = Omit<Community, 'communityId' | 'temporal'>

export type CreateDialecticalSessionInput = Omit<
  DialecticalSession,
  | 'sessionId'
  | 'currentCycle'
  | 'currentPhase'
  | 'status'
  | 'totalCycles'
  | 'conceptualVelocityHistory'
  | 'contradictionDensityHistory'
  | 'startedAtMs'
  | 'lastActivityMs'
  | 'totalTokensUsed'
  | 'totalEstimatedCost'
>

/**
 * Default configuration for dialectical workflows
 */
export function createDefaultDialecticalConfig(): DialecticalWorkflowConfig {
  return {
    thesisAgents: [
      { lens: 'economic', modelProvider: 'anthropic', modelName: 'claude-sonnet-4-5' },
      { lens: 'systems', modelProvider: 'openai', modelName: 'gpt-5.2' },
      { lens: 'adversarial', modelProvider: 'google', modelName: 'gemini-2.5-pro' },
    ],
    minTheses: 2,
    maxTheses: 5,
    enableCrossNegation: true,
    negationDepth: 1,
    enabledTrackers: ['LOGIC', 'PRAGMATIC', 'SEMANTIC', 'BOUNDARY'],
    minActionDistance: 3,
    sublationStrategy: 'COMPETITIVE',
    maxSublationCandidates: 3,
    velocityThreshold: 0.1,
    maxCycles: 10,
    minCycles: 2,
    enableKGPersistence: true,
    enableCommunityDetection: true,
    communityDetectionMethod: 'LLM_GROUPING',
    retrievalDepth: 3,
    retrievalTopK: 10,
  }
}
