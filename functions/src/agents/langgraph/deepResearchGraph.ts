/**
 * Deep Research Workflow Graph
 *
 * LangGraph pipeline that orchestrates budget-aware deep research:
 *
 * START
 *   → sense_making → context_seeding → search_and_ingest → claim_extraction → kg_construction
 *   → gap_analysis ──[gaps + budget]──→ search_and_ingest  (RESEARCH LOOP)
 *                  ──[converged]─────→ kg_snapshot
 *   → thesis_generation → cross_negation → contradiction → sublation → dialectical_meta
 *       ↑──[CONTINUE]──────────────────────────────────────────────────────┘
 *       └──[TERMINATE]──→ counterclaim_search → answer_generation → END
 *
 * Research completes fully before dialectical reasoning. kg_snapshot is the transition
 * point — it serializes the KG state and creates the tool registry. Dialectical agents
 * get KG tools but NO search tools.
 */

import { StateGraph, END, START } from '@langchain/langgraph'
import type {
  AgentConfig,
  Workflow,
  AgentExecutionStep,
  DeepResearchRunConfig,
  DeepResearchAnswer,
  Run,
  RunBudget,
  SearchPlan,
  SourceRecord,
  ExtractedClaim,
  KGSnapshot,
  KGCompactSnapshot,
  ThesisOutput,
  NegationOutput,
  SublationOutput,
  RewriteOperatorType,
  DialecticalSessionId,
  DialecticalWorkflowConfig,
  ThesisLens,
  KGDiff,
  CompactGraph,
  GraphDiff,
  WorkflowExecutionMode,
  ModelTier,
  WorkflowCriticality,
  AgentId,
  EpisodeId,
} from '@lifeos/agents'
import type { ProviderKeys } from '../providerService.js'
import { executeWithProvider } from '../providerService.js'
import type { RunEventWriter } from '../runEvents.js'
import type { SearchToolKeys } from '../providerKeys.js'
import type { ToolRegistry } from '../toolExecutor.js'
import { executeAgentWithEvents, handleAskUserInterrupt, type AgentExecutionContext } from './utils.js'
import {
  DeepResearchStateAnnotation,
  type DeepResearchState,
  type DeepResearchPhase,
} from './stateAnnotations.js'
import { KnowledgeHypergraph } from '../knowledgeHypergraph.js'
import {
  createRunBudget,
  recordSpend,
  canAffordOperation,
  estimateLLMCost,
  shouldContinueGapLoop,
  recordGapIteration,
} from '../deepResearch/budgetController.js'
import { executeSearchPlan, ingestSources } from '../deepResearch/sourceIngestion.js'
import {
  extractClaimsFromSourceBatch,
  mapClaimsToKG,
  type ProviderExecuteFn,
} from '../deepResearch/claimExtraction.js'
import { analyzeKnowledgeGaps } from '../deepResearch/gapAnalysis.js'
import { generateAnswer } from '../deepResearch/answerGeneration.js'
import {
  computeSourceQualityScore,
  applyQualityScoresToClaims,
  generateCounterclaims,
  type AdversarialSearchFn,
} from '../deepResearch/sourceQuality.js'
import { runContradictionTrackers } from '../contradictionTrackers.js'
import type { ContradictionTrackerContext } from '../contradictionTrackers.js'
import { runCompetitiveSynthesis } from '../sublationEngine.js'
import { runMetaReflection } from '../metaReflection.js'
import type { MetaReflectionInput, CycleMetrics } from '../metaReflection.js'
import { recordMessage } from '../messageStore.js'
import { checkQuotaSoft } from '../quotaManager.js'
import { checkRunRateLimitSoft } from '../rateLimiter.js'
import { resolveThesisLens, buildThesisPrompt, buildNegationPrompt } from './dialecticalPrompts.js'
import { serializeKGToCompactGraph } from '../deepResearch/kgSerializer.js'
import {
  createSupportsEdges,
  scanForResearchContradictions,
  mergeNearDuplicateConcepts,
  bridgeCausalChains,
} from '../deepResearch/kgEnrichment.js'
import { createKGTools } from '../kgTools.js'
import type { ToolDefinition } from '../toolExecutor.js'
import { createLogger } from '../../lib/logger.js'
import {
  buildEmptyStartupSeedSummary,
  createFallbackDeepResearchGoalFrame,
  normalizeStartupInput,
  parseDeepResearchGoalFrame,
  summarizeNormalizedStartupInput,
} from '../startup/inputNormalizer.js'
import { buildStartupSeedSummary } from '../startup/starterGraph.js'

const log = createLogger('DeepResearchGraph')

/** Normalize a URL for cross-iteration dedup */
function normalizeUrl(url: string): string {
  try {
    const u = new URL(url)
    return `${u.hostname}${u.pathname}`.replace(/\/$/, '').toLowerCase()
  } catch {
    return url.toLowerCase()
  }
}

async function applySynthesisDiffToSharedKg(
  sharedKg: KnowledgeHypergraph,
  state: DeepResearchState,
): Promise<void> {
  if (!state.kgDiff) return

  const newClaims = state.kgDiff.newClaims ?? []
  if (newClaims.length > 0) {
    const synthesisSourceId = `source:synthesis:${state.runId}`
    if (!sharedKg.getNode(synthesisSourceId)) {
      await sharedKg.addSource({
        sourceId: synthesisSourceId,
        url: `internal://deep-research/synthesis/${state.runId}`,
        title: 'Dialectical synthesis',
        domain: 'internal',
        fetchedAtMs: Date.now(),
        fetchMethod: 'read_url',
        contentLength: 0,
        contentHash: `synthesis:${state.runId}`,
        sourceType: 'web',
        relevanceScore: 1,
      })
    }

    for (const claim of newClaims) {
      if (!claim?.text?.trim()) continue
      await sharedKg.addClaim({
        sessionId: (state.kgSessionId ?? `deepResearch:${state.runId}`) as DialecticalSessionId,
        userId: state.userId,
        text: claim.text,
        normalizedText: claim.text.toLowerCase().trim().replace(/\s+/g, ' '),
        sourceEpisodeId: synthesisSourceId as EpisodeId,
        sourceAgentId: 'agent:deep_research_synthesis' as AgentId,
        sourceLens: 'systems',
        claimType: 'ASSERTION',
        confidence: 0.65,
        conceptIds: [],
      })
    }
  }

  for (const claimId of state.kgDiff.supersededClaims ?? []) {
    if (sharedKg.getNode(claimId)) {
      sharedKg.removeNode(claimId)
    }
  }
}

/**
 * Mid-loop quota/rate check helper for deep research nodes.
 * Returns a constraintPause partial state if a limit is exceeded, or null if OK.
 */
async function checkQuotaOrRateLimit(
  userId: string,
  phase: DeepResearchPhase,
  partialOutput: string
): Promise<Partial<DeepResearchState> | null> {
  const quotaHit = await checkQuotaSoft(userId)
  if (quotaHit) {
    log.info('Quota exceeded during deep research, pausing', { phase, ...quotaHit })
    return {
      phase,
      status: 'waiting_for_input',
      constraintPause: {
        constraintType: quotaHit.quotaType,
        currentValue: quotaHit.currentValue,
        limitValue: quotaHit.limitValue,
        unit: quotaHit.unit,
        partialOutput,
        suggestedIncrease: quotaHit.unit === 'USD'
          ? quotaHit.limitValue * 2
          : Math.ceil(quotaHit.limitValue * 1.5),
      },
    }
  }
  const rateHit = await checkRunRateLimitSoft(userId)
  if (rateHit) {
    log.info('Rate limit exceeded during deep research, pausing', { phase, ...rateHit })
    return {
      phase,
      status: 'waiting_for_input',
      constraintPause: {
        constraintType: rateHit.limitType,
        currentValue: rateHit.currentValue,
        limitValue: rateHit.limitValue,
        unit: rateHit.unit,
        partialOutput,
        suggestedIncrease: Math.ceil(rateHit.limitValue * 1.5),
      },
    }
  }
  return null
}

function createInputNormalizerNode(
  execContext: AgentExecutionContext,
) {
  return async (state: DeepResearchState): Promise<Partial<DeepResearchState>> => {
    log.info('Deep Research: Input Normalizer phase')
    await emitPhaseEvent(execContext, 'input_normalizer', {
      query: state.goal,
    })

    const normalizedInput = normalizeStartupInput(state.goal, state.context)

    return {
      goal: normalizedInput.normalizedGoal,
      normalizedInput,
      startupSeedSummary: buildEmptyStartupSeedSummary(normalizedInput.sources.length),
    }
  }
}

// ----- Types -----

/**
 * Configuration for deep research graph creation.
 */
export interface DeepResearchGraphConfig {
  workflow: Workflow
  researchConfig: DeepResearchRunConfig
  plannerAgent: AgentConfig
  extractionAgent: AgentConfig
  gapAnalysisAgent: AgentConfig
  answerAgent: AgentConfig
  thesisAgents: AgentConfig[]
  synthesisAgents: AgentConfig[]
  metaAgent: AgentConfig
  apiKeys: ProviderKeys
  userId: string
  runId: string
  eventWriter?: RunEventWriter
  toolRegistry?: ToolRegistry
  searchToolKeys?: SearchToolKeys
  enableCheckpointing?: boolean
  executionMode?: WorkflowExecutionMode
  tierOverride?: ModelTier | null
  workflowCriticality?: WorkflowCriticality
}

// ----- Helper: Provider Execution -----

/**
 * Create a ProviderExecuteFn from an AgentConfig and ProviderKeys.
 */
function makeProviderFn(agent: AgentConfig, apiKeys: ProviderKeys): ProviderExecuteFn {
  return async (systemPrompt: string, userPrompt: string): Promise<string> => {
    const result = await executeWithProvider(
      { ...agent, systemPrompt },
      userPrompt,
      undefined,
      apiKeys
    )
    return result.output ?? ''
  }
}

// ----- Helper: KG Snapshot -----

function captureKGSnapshot(
  kg: KnowledgeHypergraph,
  stepIndex: number,
  phase: string,
  allPreviousSnapshots: KGSnapshot[]
): KGSnapshot {
  const stats = kg.getStats()
  const currentNodeIds = new Set([
    ...kg.getNodesByType('claim').map((n) => n.id),
    ...kg.getNodesByType('concept').map((n) => n.id),
    ...kg.getNodesByType('source').map((n) => n.id),
    ...kg.getNodesByType('mechanism').map((n) => n.id),
  ])

  // Accumulate ALL known node IDs from ALL prior snapshots
  const previousNodeIds = new Set(allPreviousSnapshots.flatMap((s) => s.delta.addedNodeIds))

  // Calculate delta — only truly new nodes at this step
  const addedNodeIds = [...currentNodeIds].filter((id) => !previousNodeIds.has(id))

  // Compute superseded/refuted claim IDs newly appearing since last snapshot
  const previousSuperseded = new Set(allPreviousSnapshots.flatMap((s) => s.delta.supersededNodeIds))
  const allClaims = kg.getNodesByType('claim')
  const supersededNodeIds = allClaims
    .filter((n) => {
      const d = n.data as { status?: string }
      return (d.status === 'SUPERSEDED' || d.status === 'REFUTED') && !previousSuperseded.has(n.id)
    })
    .map((n) => n.id)

  // Compute edge key diffs (key format: "source→target:type")
  const currentEdgeKeys = new Set<string>()
  for (const nodeId of currentNodeIds) {
    for (const e of kg.getOutEdges(nodeId)) {
      currentEdgeKeys.add(`${nodeId}→${e.target}:${e.data.type}`)
    }
  }
  const prevAddedEdges = allPreviousSnapshots.flatMap((s) => s.delta.addedEdgeKeys)
  const prevRemovedEdges = new Set(allPreviousSnapshots.flatMap((s) => s.delta.removedEdgeKeys))
  const prevEdgeKeys = new Set(prevAddedEdges.filter((k) => !prevRemovedEdges.has(k)))
  const addedEdgeKeys = [...currentEdgeKeys].filter((k) => !prevEdgeKeys.has(k))
  const removedEdgeKeys = [...prevEdgeKeys].filter((k) => !currentEdgeKeys.has(k))

  return {
    stepIndex,
    phase,
    timestamp: Date.now(),
    stats: {
      claimCount: stats.nodesByType.claim,
      conceptCount: stats.nodesByType.concept,
      sourceCount: stats.nodesByType.source ?? 0,
      mechanismCount: stats.nodesByType.mechanism,
      contradictionCount: kg.getActiveContradictions().length,
      communityCount: stats.nodesByType.community,
    },
    delta: {
      addedNodeIds,
      supersededNodeIds,
      addedEdgeKeys,
      removedEdgeKeys,
    },
  }
}

// ----- Node: KG Snapshot (transition from research to dialectical) -----

function createKGSnapshotNode(
  sharedKg: KnowledgeHypergraph,
  execContext: AgentExecutionContext,
) {
  return async (state: DeepResearchState): Promise<Partial<DeepResearchState>> => {
    log.info('Deep Research: KG Snapshot phase — transitioning to dialectical engine')

    // 1. Serialize KG to CompactGraph
    const compactGraph = serializeKGToCompactGraph(sharedKg, 50)

    // 2. Build KGCompactSnapshot
    const stats = sharedKg.getStats()
    const snapshot: KGCompactSnapshot = {
      graph: compactGraph,
      claimCount: stats.nodesByType.claim ?? 0,
      conceptCount: stats.nodesByType.concept ?? 0,
      sourceCount: stats.nodesByType.source ?? 0,
      contradictionEdgeCount: compactGraph.edges.filter(e => e.rel === 'contradicts').length,
      snapshotAtMs: Date.now(),
      gapIteration: state.gapIterationsUsed,
    }

    // 3. Create KG tool registry for dialectical agents
    const kgTools = createKGTools(sharedKg)

    // 4. Emit phase event
    await emitPhaseEvent(execContext, 'kg_snapshot', {
      claimCount: snapshot.claimCount,
      conceptCount: snapshot.conceptCount,
      contradictionEdgeCount: snapshot.contradictionEdgeCount,
    })

    log.info('KG snapshot created', {
      claimCount: snapshot.claimCount,
      conceptCount: snapshot.conceptCount,
      sourceCount: snapshot.sourceCount,
      contradictionEdgeCount: snapshot.contradictionEdgeCount,
    })

    // 5. Return partial state — transition to dialectical phase
    return {
      phase: 'thesis_generation' as DeepResearchPhase,
      kgSnapshot: snapshot,
      mergedGraph: compactGraph,
      kgSnapshots: [captureKGSnapshot(sharedKg, state.kgSnapshots.length, 'kg_snapshot', state.kgSnapshots)],
      context: { ...state.context, kgTools, kgSnapshot: snapshot },
    }
  }
}

// ----- Helper: Parse Thesis Output -----

const VALID_REWRITE_OPERATORS: RewriteOperatorType[] = [
  'SPLIT',
  'MERGE',
  'REVERSE_EDGE',
  'ADD_MEDIATOR',
  'SCOPE_TO_REGIME',
  'TEMPORALIZE',
]

function parseThesisOutput(
  rawText: string,
  agentId: string,
  model: string,
  lens: string
): ThesisOutput {
  const jsonMatch = rawText.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    throw new Error(`Thesis output from ${agentId} did not contain JSON`)
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>

    // Detect graph-format output (nodes/edges) vs legacy format (conceptGraph/causalModel)
    const hasGraphFormat = Array.isArray(parsed.nodes) && Array.isArray(parsed.edges)

    // Build CompactGraph if graph-format output detected
    let graph: CompactGraph | undefined
    if (hasGraphFormat) {
      graph = {
        nodes: (parsed.nodes as Array<Record<string, unknown>>).map(n => ({
          id: String(n.id ?? ''),
          label: String(n.label ?? ''),
          type: (n.type ?? 'claim') as 'claim' | 'concept' | 'mechanism' | 'prediction',
          note: typeof n.note === 'string' ? n.note : undefined,
          sourceId: typeof n.sourceId === 'string' ? n.sourceId : undefined,
          sourceUrl: typeof n.sourceUrl === 'string' ? n.sourceUrl : undefined,
          sourceConfidence: typeof n.sourceConfidence === 'number' ? n.sourceConfidence : undefined,
        })),
        edges: (parsed.edges as Array<Record<string, unknown>>).map(e => ({
          from: String(e.from ?? ''),
          to: String(e.to ?? ''),
          rel: (e.rel ?? 'supports') as CompactGraph['edges'][number]['rel'],
          weight: typeof e.weight === 'number' ? e.weight : undefined,
        })),
        summary: String(parsed.summary ?? ''),
        reasoning: String(parsed.reasoning ?? ''),
        confidence: Number(parsed.confidence) || 0.7,
        regime: String(parsed.regime ?? ''),
        temporalGrain: String(parsed.temporalGrain ?? ''),
      }
    }

    // Bridge graph format to legacy fields for contradiction trackers
    let conceptGraph: Record<string, unknown> = {}
    let causalModel: string[] = []
    let falsificationCriteria: string[] = []
    let decisionImplications: string[] = []

    if (hasGraphFormat && graph) {
      // Build conceptGraph as adjacency list from graph edges
      const adj: Record<string, string[]> = {}
      for (const edge of graph.edges) {
        const fromNode = graph.nodes.find(n => n.id === edge.from)
        const toNode = graph.nodes.find(n => n.id === edge.to)
        if (fromNode && toNode) {
          const key = fromNode.label
          if (!adj[key]) adj[key] = []
          adj[key].push(toNode.label)
        }
      }
      conceptGraph = adj

      // Extract causal model from 'causes' edges
      causalModel = graph.edges
        .filter(e => e.rel === 'causes')
        .map(e => {
          const from = graph!.nodes.find(n => n.id === e.from)
          const to = graph!.nodes.find(n => n.id === e.to)
          return `${from?.label ?? e.from} causes ${to?.label ?? e.to}`
        })

      // Extract falsification criteria from prediction nodes
      falsificationCriteria = graph.nodes
        .filter(n => n.type === 'prediction')
        .map(n => n.note || n.label)

      // Extract decision implications from mechanism nodes
      decisionImplications = graph.nodes
        .filter(n => n.type === 'mechanism')
        .map(n => n.note || n.label)
    } else {
      conceptGraph = parsed.conceptGraph && typeof parsed.conceptGraph === 'object'
        ? (parsed.conceptGraph as Record<string, unknown>)
        : {}
      causalModel = Array.isArray(parsed.causalModel) ? parsed.causalModel.map(String) : []
      falsificationCriteria = Array.isArray(parsed.falsificationCriteria)
        ? parsed.falsificationCriteria.map(String)
        : []
      decisionImplications = Array.isArray(parsed.decisionImplications)
        ? parsed.decisionImplications.map(String)
        : []
    }

    return {
      agentId,
      model,
      lens,
      conceptGraph,
      causalModel,
      falsificationCriteria,
      decisionImplications,
      unitOfAnalysis: String(parsed.unitOfAnalysis ?? ''),
      temporalGrain: String(parsed.temporalGrain ?? ''),
      regimeAssumptions: Array.isArray(parsed.regimeAssumptions)
        ? parsed.regimeAssumptions.map(String)
        : [],
      confidence: Math.min(1, Math.max(0, Number(parsed.confidence) || 0.7)),
      rawText,
      graph,
    }
  } catch (error) {
    throw new Error(
      `Failed to parse thesis output from ${agentId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

// ----- Helper: Parse Negation Output -----

function parseNegationOutput(
  rawText: string,
  agentId: string,
  targetThesisAgentId: string
): NegationOutput {
  const jsonMatch = rawText.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    throw new Error(`Negation output from ${agentId} did not contain JSON`)
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>
    const rawOperator = String(parsed.rewriteOperator ?? 'SPLIT')
    const operator = VALID_REWRITE_OPERATORS.includes(rawOperator as RewriteOperatorType)
      ? (rawOperator as RewriteOperatorType)
      : 'SPLIT'

    return {
      agentId,
      targetThesisAgentId,
      internalTensions: Array.isArray(parsed.internalTensions)
        ? parsed.internalTensions.map(String)
        : [],
      categoryAttacks: Array.isArray(parsed.categoryAttacks)
        ? parsed.categoryAttacks.map(String)
        : [],
      preservedValid: Array.isArray(parsed.preservedValid) ? parsed.preservedValid.map(String) : [],
      rivalFraming: String(parsed.rivalFraming ?? ''),
      rewriteOperator: operator,
      operatorArgs:
        parsed.operatorArgs && typeof parsed.operatorArgs === 'object'
          ? (parsed.operatorArgs as Record<string, unknown>)
          : {},
      rawText,
    }
  } catch (error) {
    throw new Error(
      `Failed to parse negation output from ${agentId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

// ----- Helper: Build Dialectical Config -----

function buildDialecticalConfig(
  researchConfig: DeepResearchRunConfig,
  thesisAgents: AgentConfig[]
): DialecticalWorkflowConfig {
  return {
    maxCycles: researchConfig.maxDialecticalCycles,
    minCycles: 1,
    enabledTrackers: ['LOGIC', 'PRAGMATIC', 'SEMANTIC', 'BOUNDARY'],
    velocityThreshold: 0.1,
    sublationStrategy: 'COMPETITIVE',
    maxSublationCandidates: 3,
    enableCrossNegation: true,
    negationDepth: 1,
    minActionDistance: 0,
    enableKGPersistence: true,
    enableCommunityDetection: false,
    communityDetectionMethod: 'LLM_GROUPING',
    retrievalDepth: 2,
    retrievalTopK: 5,
    minTheses: Math.min(2, thesisAgents.length),
    maxTheses: thesisAgents.length,
    thesisAgents: thesisAgents.map((a) => ({
      agentId: a.agentId,
      lens: resolveThesisLens(a) as ThesisLens,
      modelProvider: a.modelProvider,
      modelName: a.modelName,
      temperature: a.temperature,
    })),
  }
}

// ----- Helper: Emit Event -----

async function emitPhaseEvent(
  execContext: AgentExecutionContext,
  phase: DeepResearchPhase,
  details?: Record<string, unknown>
): Promise<void> {
  if (!execContext.eventWriter) return
  await execContext.eventWriter.writeEvent({
    type: 'deep_research_phase',
    workflowId: execContext.workflowId,
    status: `phase:${phase}`,
    details: { phase, ...details },
  })
}

// ----- Node: Sense Making -----

function createSenseMakingNode(
  plannerAgent: AgentConfig,
  execContext: AgentExecutionContext,
  researchConfig: DeepResearchRunConfig
) {
  return async (state: DeepResearchState): Promise<Partial<DeepResearchState>> => {
    log.info('Deep Research: Sense Making phase')
    await emitPhaseEvent(execContext, 'sense_making', { query: state.goal })

    const normalizedInput = state.normalizedInput ?? normalizeStartupInput(state.goal, state.context)
    const contextSection = normalizedInput.contextSummary
      ? `\n${normalizedInput.contextSummary}\n\nUse the above context to inform your search planning — identify claims, concepts, and gaps worth investigating further.\n`
      : ''

    if (normalizedInput.hasContext) {
      log.info('User context injected into sense making', {
        noteCount: normalizedInput.noteCount,
        fileCount: normalizedInput.fileCount,
      })
    }

    const prompt = `Analyze this research query and create an initial search plan.

QUERY: ${state.goal}
${contextSection}
Configuration:
- Search depth: ${researchConfig.searchDepth}
- Include academic: ${researchConfig.includeAcademic}
- Include semantic: ${researchConfig.includeSemanticSearch}
- Thesis lenses: ${researchConfig.thesisLenses.join(', ')}

Tasks:
1. Disambiguate the query — identify the core question and sub-questions
2. Identify key domains and concepts to search
3. Identify concrete verification targets the workflow should test or falsify
4. Generate search queries for SERP, academic, and semantic search${normalizedInput.hasContext ? '\n5. Incorporate claims and concepts from the user-provided context into your search plan' : ''}

Respond with JSON:
{
  "canonicalGoal": "<normalized restatement of the goal>",
  "coreQuestion": "<single core question>",
  "subquestions": ["subquestion 1", "subquestion 2"],
  "keyConcepts": ["concept 1", "concept 2"],
  "verificationTargets": ["target 1", "target 2"],
  "plannerRationale": "Why this framing and search plan",
  "searchPlan": {
    "serpQueries": ["query1", "query2", ...],
    "scholarQueries": ["academic query1", ...],
    "semanticQueries": ["semantic query1", ...],
    "rationale": "Why these queries",
    "targetSourceCount": 8-15
  }
}`

    try {
      const step = await executeAgentWithEvents(
        plannerAgent,
        prompt,
        { ...state.context, phase: 'sense_making' },
        execContext,
        { stepNumber: 1, maxIterations: 3 }
      )

      // Check if agent requested user input
      const interrupt = handleAskUserInterrupt(step, 'sense_making')
      if (interrupt) {
        return { steps: [step], ...interrupt }
      }

      const plan = parseSenseMakingOutput(step.output, state, researchConfig)

      await recordMessage(
        {
          userId: execContext.userId,
          runId: execContext.runId,
          agentId: plannerAgent.agentId,
          role: 'assistant',
          content: `**[SENSE MAKING] ${plannerAgent.name}**\n\n${step.output}`,
        },
        { skipPrune: true }
      )

      return {
        phase: 'search_execution',
        goalFrame: plan,
        searchPlans: [plan.searchPlan],
        steps: [step],
        totalTokensUsed: step.tokensUsed,
        totalEstimatedCost: step.estimatedCost,
      }
    } catch (err) {
      log.error('Sense making failed', { error: String(err) })
      const fallbackPlan: SearchPlan = {
        serpQueries: [state.goal],
        scholarQueries: researchConfig.includeAcademic ? [`${state.goal} research`] : [],
        semanticQueries: researchConfig.includeSemanticSearch ? [state.goal] : [],
        rationale: 'Fallback plan generated after sense-making failure',
        targetSourceCount: researchConfig.mode === 'quick' ? 5 : 8,
      }
      const fallbackFrame = createFallbackDeepResearchGoalFrame(state.goal, fallbackPlan)

      return {
        phase: 'search_execution',
        goalFrame: fallbackFrame,
        searchPlans: [fallbackPlan],
        degradedPhases: ['sense_making'],
      }
    }
  }
}

function parseSenseMakingOutput(output: string, state: DeepResearchState, config: DeepResearchRunConfig) {
  const fallbackPlan: SearchPlan = {
    serpQueries: [state.goal],
    scholarQueries: config.includeAcademic ? [`${state.goal} research`] : [],
    semanticQueries: config.includeSemanticSearch ? [state.goal] : [],
    rationale: 'Fallback plan generated after sense-making validation failure',
    targetSourceCount: config.mode === 'quick' ? 5 : 8,
  }

  return parseDeepResearchGoalFrame(
    output,
    createFallbackDeepResearchGoalFrame(state.goal, fallbackPlan),
  )
}

// ----- Node: Context Seeding -----

/**
 * Seeds the KG with claims extracted from user-provided context (notes/files).
 * No-op when no context is attached — adds zero overhead for context-free runs.
 */
function createContextSeedingNode(
  extractionAgent: AgentConfig,
  sharedKg: KnowledgeHypergraph,
  execContext: AgentExecutionContext,
  apiKeys: ProviderKeys
) {
  return async (state: DeepResearchState): Promise<Partial<DeepResearchState>> => {
    const normalizedInput = state.normalizedInput ?? normalizeStartupInput(state.goal, state.context)
    const contextSources = normalizedInput.sources
    const contextContentMap = normalizedInput.contentMap

    if (contextSources.length === 0) {
      log.info('No user context to seed, skipping context_seeding')
      return {
        startupSeedSummary: buildEmptyStartupSeedSummary(0),
      }
    }

    log.info('Deep Research: Context Seeding phase', {
      sourceCount: contextSources.length,
    })

    await emitPhaseEvent(execContext, 'context_seeding', {
      sourceCount: contextSources.length,
    })

    let currentBudget = { ...state.budget }

    const providerFn: ProviderExecuteFn = async (systemPrompt, userPrompt) => {
      const result = await executeWithProvider(
        {
          ...extractionAgent,
          systemPrompt,
        },
        userPrompt,
        undefined,
        apiKeys
      )
      return result.output ?? ''
    }

    try {
      // Extract claims from user context using existing pipeline
      const { claims, updatedBudget } = await extractClaimsFromSourceBatch(
        contextSources,
        contextContentMap,
        state.goal,
        providerFn,
        currentBudget,
        contextSources.length,
        extractionAgent.modelName,
      )
      currentBudget = updatedBudget

      // Apply confidence multiplier for user-provided context
      const contextClaims = claims.map(c => ({
        ...c,
        confidence: Math.min(1.0, c.confidence * 0.85),
      }))

      // Seed KG
      const sessionId = (state.kgSessionId ?? `deepResearch:${state.runId}`) as DialecticalSessionId
      const { addedClaimIds, addedConceptIds } = await mapClaimsToKG(
        contextClaims,
        contextSources,
        sharedKg,
        sessionId,
        state.userId
      )

      log.info('Context seeding complete', {
        claimsAdded: addedClaimIds.length,
        conceptsAdded: addedConceptIds.length,
      })

      const costDelta = currentBudget.spentUsd - state.budget.spentUsd

      return {
        sources: contextSources,
        extractedClaims: contextClaims,
        claimsProcessedCount: contextClaims.length,
        sourceContentMap: contextContentMap,
        budget: currentBudget,
        kgSessionId: sessionId,
        totalEstimatedCost: costDelta,
        startupSeedSummary: buildStartupSeedSummary(
          contextSources.length,
          contextClaims.length,
          addedClaimIds.length + addedConceptIds.length,
          0,
          0,
        ),
      }
    } catch (err) {
      log.error('Context seeding failed', { error: String(err) })
      return {
        budget: currentBudget,
        degradedPhases: ['context_seeding'],
        startupSeedSummary: buildEmptyStartupSeedSummary(contextSources.length),
      }
    }
  }
}

// ----- Node: Search Execution + Source Ingestion (combined for efficiency) -----

function createSearchAndIngestNode(
  extractionAgent: AgentConfig,
  execContext: AgentExecutionContext,
  apiKeys: ProviderKeys,
  searchToolKeys?: SearchToolKeys
) {
  return async (state: DeepResearchState): Promise<Partial<DeepResearchState>> => {
    // Mid-loop quota/rate check before search + ingestion
    if (state.gapIterationsUsed > 0) {
      const pauseState = await checkQuotaOrRateLimit(
        execContext.userId,
        'search_execution',
        `${state.sources.length} sources ingested. ${state.gapIterationsUsed} gap iterations completed.`
      )
      if (pauseState) return pauseState
    }

    log.info('Deep Research: Search Execution + Source Ingestion phase')
    await emitPhaseEvent(execContext, 'search_execution', {
      planCount: state.searchPlans.length,
      budgetPhase: state.budget.phase,
    })

    if (!execContext.toolRegistry) {
      throw new Error('Search execution requires a tool registry')
    }

    // Get the most recent search plan
    const latestPlan = state.searchPlans[state.searchPlans.length - 1]
    if (!latestPlan) {
      throw new Error('Search execution requires a search plan')
    }

    let currentBudget = { ...state.budget }

    // Execute search plan
    const toolContext = {
      userId: execContext.userId,
      runId: execContext.runId,
      workflowId: execContext.workflowId,
      agentId: extractionAgent.agentId,
      agentName: extractionAgent.name,
      provider: extractionAgent.modelProvider,
      modelName: extractionAgent.modelName,
      iteration: 0,
      searchToolKeys,
    }

    const { results: rawSearchResults, updatedBudget: postSearchBudget } = await executeSearchPlan(
      latestPlan,
      execContext.toolRegistry,
      toolContext,
      currentBudget
    )
    currentBudget = postSearchBudget

    // Cross-iteration source dedup: filter out URLs already processed
    const previousUrls = new Set(state.processedSourceUrls ?? [])
    const searchResults = rawSearchResults.filter(r => {
      if (!r.url) return true
      return !previousUrls.has(normalizeUrl(r.url))
    })

    if (searchResults.length < rawSearchResults.length) {
      log.info('Cross-iteration dedup filtered sources', {
        before: rawSearchResults.length,
        after: searchResults.length,
        filtered: rawSearchResults.length - searchResults.length,
      })
    }

    await emitPhaseEvent(execContext, 'source_ingestion', {
      searchResults: searchResults.length,
      budgetPhase: currentBudget.phase,
    })

    // Relevance scoring function
    const providerFn = makeProviderFn(extractionAgent, apiKeys)
    const scoreRelevanceFn = async (snippet: string, query: string): Promise<number> => {
      const costEstimate = estimateLLMCost(extractionAgent.modelName, 200, 10)
      if (!canAffordOperation(currentBudget, costEstimate)) {
        throw new Error('Budget insufficient for relevance scoring during source ingestion')
      }

      try {
        const result = await providerFn(
          'Rate relevance 0-1 as a single number. Output ONLY the number.',
          `Query: "${query}"\nSnippet: "${snippet.substring(0, 300)}"`
        )
        currentBudget = recordSpend(currentBudget, costEstimate, 210, 'llm')
        const score = parseFloat(result.trim())
        if (isNaN(score)) {
          throw new Error(`Relevance scoring returned a non-numeric response: ${result.trim()}`)
        }
        return Math.min(1, Math.max(0, score))
      } catch (error) {
        throw new Error(
          `Relevance scoring failed for query "${query}": ${error instanceof Error ? error.message : String(error)}`
        )
      }
    }

    // Ingest sources (relevance-first)
    const {
      sources,
      contentMap,
      updatedBudget: postIngestBudget,
    } = await ingestSources(
      searchResults,
      state.goal,
      execContext.toolRegistry,
      toolContext,
      currentBudget,
      scoreRelevanceFn
    )
    currentBudget = postIngestBudget

    log.info('Search and ingestion complete', {
      searchResults: searchResults.length,
      sourcesIngested: sources.length,
      contentMapEntries: Object.keys(contentMap).length,
      budgetPhase: currentBudget.phase,
      spentUsd: currentBudget.spentUsd.toFixed(3),
    })

    // Track newly processed URLs for cross-iteration dedup
    const newProcessedUrls = sources.map(s => normalizeUrl(s.url))

    return {
      phase: 'claim_extraction',
      sources,
      sourceContentMap: contentMap,
      budget: currentBudget,
      processedSourceUrls: newProcessedUrls,
    }
  }
}

// ----- Node: Claim Extraction -----

function createClaimExtractionNode(
  extractionAgent: AgentConfig,
  execContext: AgentExecutionContext,
  apiKeys: ProviderKeys,
) {
  return async (state: DeepResearchState): Promise<Partial<DeepResearchState>> => {
    log.info('Deep Research: Claim Extraction phase')
    await emitPhaseEvent(execContext, 'claim_extraction', {
      sourceCount: state.sources.length,
      budgetPhase: state.budget.phase,
    })

    let currentBudget = { ...state.budget }
    const providerFn = makeProviderFn(extractionAgent, apiKeys)
    const allClaims: ExtractedClaim[] = []

    // Extract claims from new sources using batch processing (Phase 21)
    const newSources = state.sources.slice(-20) // Process most recent sources

    const { claims: batchClaims, updatedBudget: postBatchBudget } =
      await extractClaimsFromSourceBatch(
        newSources,
        state.sourceContentMap,
        state.goal,
        providerFn,
        currentBudget,
        3, // batch size
        extractionAgent.modelName,
      )
    currentBudget = postBatchBudget
    allClaims.push(...batchClaims)

    // Phase 23: Apply source quality scores to claims
    for (const source of newSources) {
      source.sourceQualityScore = computeSourceQualityScore(source)
    }
    const qualityAdjustedClaims = applyQualityScoresToClaims(allClaims, newSources)
    allClaims.length = 0
    allClaims.push(...qualityAdjustedClaims)

    log.info('Claim extraction complete', {
      claimsExtracted: allClaims.length,
    })

    return {
      phase: 'kg_construction' as DeepResearchPhase,
      extractedClaims: allClaims,
      budget: currentBudget,
    }
  }
}

// ----- Node: KG Construction -----

function createKGConstructionNode(
  sharedKg: KnowledgeHypergraph,
  execContext: AgentExecutionContext,
  researchConfig: DeepResearchRunConfig,
) {
  return async (state: DeepResearchState): Promise<Partial<DeepResearchState>> => {
    // Only process claims that haven't been mapped to the KG yet
    const alreadyProcessed = state.claimsProcessedCount ?? 0
    const newClaims = state.extractedClaims.slice(alreadyProcessed)

    log.info('Deep Research: KG Construction phase', {
      totalClaims: state.extractedClaims.length,
      alreadyProcessed,
      newClaims: newClaims.length,
    })
    await emitPhaseEvent(execContext, 'kg_construction', {
      claimCount: newClaims.length,
      totalClaims: state.extractedClaims.length,
    })

    const sessionId = (state.kgSessionId ?? `deepResearch:${state.runId}`) as DialecticalSessionId
    const newSources = state.sources.slice(-20)

    // Step 1: Map claims to KG (corroboration boost happens inside addClaim)
    const { addedClaimIds, addedConceptIds } = await mapClaimsToKG(
      newClaims,
      newSources,
      sharedKg,
      sessionId,
      state.userId
    )

    // Step 2-5: KG enrichment passes (all zero-LLM-cost)
    const enrichment = researchConfig.kgEnrichment
    let supportsEdges = 0
    let contradictionEdges = 0
    let conceptMerges = 0
    let bridgedEdges = 0

    if (addedClaimIds.length > 0) {
      if (enrichment?.enableSupportsEdges !== false) {
        const result = createSupportsEdges(addedClaimIds, sharedKg)
        supportsEdges = result.edgesCreated
      }

      if (enrichment?.enableEarlyContradictions !== false) {
        const result = scanForResearchContradictions(addedClaimIds, sharedKg)
        contradictionEdges = result.contradictionEdgesCreated
      }
    }

    if (addedConceptIds.length > 0 && enrichment?.enableFuzzyConceptMerge !== false) {
      const result = await mergeNearDuplicateConcepts(addedConceptIds, sharedKg)
      conceptMerges = result.mergesPerformed
    }

    if (enrichment?.enableCausalBridging !== false) {
      const result = bridgeCausalChains(sharedKg)
      bridgedEdges = result.edgesCreated
    }

    log.info('KG construction complete', {
      claimsAdded: addedClaimIds.length,
      conceptsAdded: addedConceptIds.length,
      supportsEdges,
      contradictionEdges,
      conceptMerges,
      bridgedEdges,
    })

    // Capture KG snapshot
    const snapshot = captureKGSnapshot(
      sharedKg,
      state.kgSnapshots.length,
      'kg_construction',
      state.kgSnapshots
    )

    return {
      phase: 'gap_analysis' as DeepResearchPhase,
      kgSessionId: sessionId,
      kgSnapshots: [snapshot],
      claimsProcessedCount: state.extractedClaims.length,
    }
  }
}

// ----- Node: Thesis Generation -----

function createThesisNode(thesisAgents: AgentConfig[], execContext: AgentExecutionContext) {
  return async (state: DeepResearchState): Promise<Partial<DeepResearchState>> => {
    log.info('Deep Research: Thesis Generation phase')
    await emitPhaseEvent(execContext, 'thesis_generation', {
      agentCount: thesisAgents.length,
      dialecticalCycle: state.dialecticalCycleCount,
    })

    let currentBudget = { ...state.budget }

    // Get KG tools from context (set by kg_snapshot node)
    const kgTools = (state.context?.kgTools ?? []) as ToolDefinition[]

    // Build KG-only tool registry for thesis agents (no search tools)
    const kgToolRegistry: ToolRegistry = new Map()
    for (const tool of kgTools) {
      kgToolRegistry.set(tool.name, tool)
    }

    const kgToolInstructions = `

You have access to knowledge graph query tools. Use them to ground your analysis:
1. Start with kg_summary to understand the graph landscape
2. Use kg_get_claims or kg_get_neighborhood for targeted exploration
3. Use kg_get_contradictions to identify unresolved tensions

Base your thesis on evidence from the knowledge graph. Cite node IDs when referencing KG data.`

    const thesisPromises = thesisAgents.map(async (agent, idx) => {
      const lens = resolveThesisLens(agent)

      // Use shared prompt builder + KG tool instructions
      const prompt = buildThesisPrompt(
        state.goal,
        lens,
        state.mergedGraph,
        null, // no researchEvidence — agents query KG via tools
      ) + kgToolInstructions

      // Create KG-only exec context (strip search tools)
      const kgOnlyExecContext: AgentExecutionContext = {
        ...execContext,
        toolRegistry: kgToolRegistry.size > 0 ? kgToolRegistry : undefined,
        searchToolKeys: undefined,
      }

      try {
        const step = await executeAgentWithEvents(
          agent,
          prompt,
          { ...state.context, phase: 'thesis_generation', lens },
          kgOnlyExecContext,
          { stepNumber: state.steps.length + idx + 1, maxIterations: 4 }
        )

        const thesis = parseThesisOutput(step.output, agent.agentId, step.model, lens)

        // Track budget for this thesis agent
        currentBudget = recordSpend(currentBudget, step.estimatedCost, step.tokensUsed, 'llm')

        return { step, thesis }
      } catch (err) {
        throw new Error(`Thesis agent ${agent.name} failed: ${err instanceof Error ? err.message : String(err)}`)
      }
    })

    const results = await Promise.all(thesisPromises)

    // Check if any thesis agent requested user input
    const interruptedThesisStep = results.find((r) => r.step.askUserInterrupt)
    if (interruptedThesisStep) {
      const interrupt = handleAskUserInterrupt(interruptedThesisStep.step, 'thesis_generation')
      if (interrupt) {
        return { steps: results.map((r) => r.step), ...interrupt }
      }
    }

    return {
      phase: 'cross_negation',
      theses: results.map((r) => r.thesis),
      steps: results.map((r) => r.step),
      budget: currentBudget,
      totalTokensUsed: results.reduce((sum, r) => sum + r.step.tokensUsed, 0),
      totalEstimatedCost: results.reduce((sum, r) => sum + r.step.estimatedCost, 0),
    }
  }
}

// ----- Node: Cross Negation -----

function createCrossNegationNode(thesisAgents: AgentConfig[], execContext: AgentExecutionContext) {
  return async (state: DeepResearchState): Promise<Partial<DeepResearchState>> => {
    log.info('Deep Research: Cross Negation phase')
    await emitPhaseEvent(execContext, 'cross_negation', {
      thesisCount: state.theses.length,
    })

    if (state.theses.length < 2) {
      throw new Error(`Cross-negation requires at least 2 theses, got ${state.theses.length}`)
    }

    let currentBudget = { ...state.budget }

    const negationPromises: Promise<{
      step: AgentExecutionStep
      negation: NegationOutput
    }>[] = []

    // With REPLACE semantics, theses array contains only current cycle's theses
    for (let i = 0; i < Math.min(thesisAgents.length, state.theses.length); i++) {
      const agent = thesisAgents[i]
      const thesis = state.theses[i]
      if (!thesis) continue

      const targetIdx = (i + 1) % state.theses.length
      const targetThesis = state.theses[targetIdx]
      if (!targetThesis) continue

      negationPromises.push(
        (async () => {
          try {
            // Use shared prompt builder
            const prompt = buildNegationPrompt(thesis, targetThesis)

            const step = await executeAgentWithEvents(
              agent,
              prompt,
              { ...state.context, phase: 'cross_negation' },
              execContext,
              { stepNumber: state.steps.length + i + 1, maxIterations: 2 }
            )

            const negation = parseNegationOutput(step.output, agent.agentId, targetThesis.agentId)

            // Track budget
            currentBudget = recordSpend(currentBudget, step.estimatedCost, step.tokensUsed, 'llm')

            return { step, negation }
          } catch (err) {
            throw new Error(`Negation by ${agent.name} failed: ${err instanceof Error ? err.message : String(err)}`)
          }
        })()
      )
    }

    const results = await Promise.all(negationPromises)

    // Check if any negation agent requested user input
    const interruptedNegStep = results.find((r) => r.step.askUserInterrupt)
    if (interruptedNegStep) {
      const interrupt = handleAskUserInterrupt(interruptedNegStep.step, 'cross_negation')
      if (interrupt) {
        return { steps: results.map((r) => r.step), ...interrupt }
      }
    }

    return {
      phase: 'contradiction_crystallization',
      negations: results.map((r) => r.negation),
      steps: results.map((r) => r.step),
      budget: currentBudget,
      totalTokensUsed: results.reduce((sum, r) => sum + r.step.tokensUsed, 0),
      totalEstimatedCost: results.reduce((sum, r) => sum + r.step.estimatedCost, 0),
    }
  }
}

// ----- Node: Contradiction Crystallization -----

function createContradictionNode(execContext: AgentExecutionContext, apiKeys: ProviderKeys) {
  return async (state: DeepResearchState): Promise<Partial<DeepResearchState>> => {
    log.info('Deep Research: Contradiction Crystallization phase')
    await emitPhaseEvent(execContext, 'contradiction_crystallization', {
      thesisCount: state.theses.length,
      negationCount: state.negations.length,
    })

    // Get the latest theses and negations for this dialectical cycle
    const latestTheses = state.theses.slice(-3)
    const latestNegations = state.negations.slice(-latestTheses.length)

    // Use the production 4-tracker pipeline (synchronous, no LLM cost)
    const trackerContext: ContradictionTrackerContext = {
      sessionId: state.kgSessionId ?? `deepResearch:${state.runId}`,
      userId: state.userId,
      cycleNumber: state.dialecticalCycleCount,
      apiKeys,
    }

    try {
      const result = runContradictionTrackers(
        latestTheses,
        latestNegations,
        ['LOGIC', 'PRAGMATIC', 'SEMANTIC', 'BOUNDARY'],
        trackerContext
      )

      log.info('Contradiction trackers complete', {
        total: result.allContradictions.length,
        byTracker: result.trackerResults.map((r) => `${r.trackerType}:${r.contradictions.length}`),
        processingTimeMs: result.totalProcessingTimeMs,
      })

      return {
        phase: 'sublation',
        contradictions: result.allContradictions,
      }
    } catch (err) {
      log.warn('Contradiction tracker pipeline failed, continuing with empty contradictions', {
        error: String(err),
        runId: state.runId,
      })

      return {
        phase: 'sublation',
        contradictions: [],
        degradedPhases: ['contradiction_detection'],
      }
    }
  }
}

// ----- Node: Sublation -----

function createSublationNode(
  synthesisAgents: AgentConfig[],
  execContext: AgentExecutionContext,
  researchConfig: DeepResearchRunConfig,
  thesisAgents: AgentConfig[]
) {
  return async (state: DeepResearchState): Promise<Partial<DeepResearchState>> => {
    log.info('Deep Research: Sublation phase')
    await emitPhaseEvent(execContext, 'sublation', {
      contradictionCount: state.contradictions.length,
    })

    if (synthesisAgents.length === 0) {
      throw new Error('Sublation requires at least one synthesis agent')
    }

    const recentTheses = state.theses.slice(-thesisAgents.length)
    const recentNegations = state.negations.slice(-thesisAgents.length)
    const recentContradictions = state.contradictions.slice(-10)

    const dialecticalConfig = buildDialecticalConfig(researchConfig, thesisAgents)

    try {
      const result = await runCompetitiveSynthesis(
        recentTheses,
        recentNegations,
        recentContradictions,
        synthesisAgents,
        execContext,
        dialecticalConfig,
        state.dialecticalCycleCount,
        state.steps.length
      )

      // Check if any synthesis agent requested user input
      const interruptedSynthStep = result.steps.find((s: AgentExecutionStep) => s.askUserInterrupt)
      if (interruptedSynthStep) {
        const interrupt = handleAskUserInterrupt(interruptedSynthStep, 'sublation')
        if (interrupt) {
          return { steps: result.steps, ...interrupt }
        }
      }

      log.info('Competitive synthesis complete', {
        candidates: result.candidates.length,
        winnerScore: result.winner.scores.total,
        preservedClaims: result.winner.claimsPreserved,
        negatedClaims: result.winner.claimsNegated,
      })

      // Extract SublationOutput from the winner
      const synthesis: SublationOutput = {
        operators: result.winner.synthesis?.operators ?? [],
        preservedElements: result.winner.synthesis?.preservedElements ?? [],
        negatedElements: result.winner.synthesis?.negatedElements ?? [],
        newConceptGraph: result.winner.synthesis?.newConceptGraph ?? {},
        newClaims: result.winner.synthesis?.newClaims ?? [],
        newPredictions: result.winner.synthesis?.newPredictions ?? [],
        schemaDiff: result.winner.synthesis?.schemaDiff ?? null,
      }

      // Extract evolved mergedGraph from winner's raw output
      let evolvedGraph: CompactGraph | null = null
      let graphDiff: GraphDiff | null = null
      const codeBlockMatch = result.winner.rawText.match(/```(?:json)?\s*([\s\S]*?)```/)
      const jsonStr = codeBlockMatch
        ? codeBlockMatch[1].trim()
        : result.winner.rawText.match(/\{[\s\S]*\}/)?.[0]
      if (jsonStr) {
        const parsed = JSON.parse(jsonStr)
        if (parsed.mergedGraph?.nodes && Array.isArray(parsed.mergedGraph.nodes)) {
          evolvedGraph = {
            nodes: parsed.mergedGraph.nodes,
            edges: parsed.mergedGraph.edges ?? [],
            summary: parsed.mergedGraph.summary ?? '',
            reasoning: parsed.mergedGraph.reasoning ?? '',
            confidence: parsed.mergedGraph.confidence ?? 0.5,
            regime: parsed.mergedGraph.regime ?? 'multi-regime',
            temporalGrain: parsed.mergedGraph.temporalGrain ?? 'mixed',
          }
        }
        if (parsed.diff) {
          graphDiff = {
            addedNodes: parsed.diff.addedNodes ?? [],
            removedNodes: parsed.diff.removedNodes ?? [],
            modifiedNodes: (parsed.diff.modifiedNodes ?? []).map((m: Record<string, string>) => ({
              id: m.id ?? '',
              oldLabel: m.oldLabel ?? '',
              newLabel: m.newLabel ?? '',
            })),
            addedEdges: parsed.diff.addedEdges ?? [],
            removedEdges: parsed.diff.removedEdges ?? [],
            newContradictions: parsed.diff.newContradictions ?? parsed.newContradictions ?? [],
            resolvedContradictions: parsed.diff.resolvedContradictions ?? parsed.resolvedContradictions ?? [],
          }
        }
      }

      // Track budget for sublation
      let currentBudget = { ...state.budget }
      currentBudget = recordSpend(currentBudget, result.totalEstimatedCost, result.totalTokensUsed, 'llm')

      // Construct KGDiff from synthesis output for meta-reflection metrics
      const synthesisKgDiff: KGDiff = {
        conceptSplits: [],
        conceptMerges: [],
        newMediators: [],
        edgeReversals: [],
        regimeScopings: [],
        temporalizations: [],
        newClaims: (synthesis.newClaims ?? []).map(c => ({
          id: typeof c === 'object' && 'id' in c ? String(c.id) : '',
          text: typeof c === 'object' && 'text' in c ? String(c.text) : String(c),
        })),
        supersededClaims: synthesis.negatedElements ?? [],
        newContradictions: [],
        resolvedContradictions: Array.isArray(synthesis.schemaDiff?.resolvedContradictions)
          ? (synthesis.schemaDiff!.resolvedContradictions as string[])
          : [],
        newPredictions: (synthesis.newPredictions ?? []).map(p => ({
          id: typeof p === 'object' && 'id' in p ? String(p.id) : '',
          text: typeof p === 'object' && 'text' in p ? String(p.text) : String(p),
        })),
      }

      const stateUpdate: Partial<DeepResearchState> = {
        phase: 'meta_reflection',
        synthesis,
        kgDiff: synthesisKgDiff,
        steps: result.steps,
        budget: currentBudget,
        totalTokensUsed: result.totalTokensUsed,
        totalEstimatedCost: result.totalEstimatedCost,
      }

      if (evolvedGraph) {
        stateUpdate.mergedGraph = evolvedGraph
        log.info('Updated mergedGraph from sublation output', {
          nodes: evolvedGraph.nodes.length,
          edges: evolvedGraph.edges.length,
        })
      }

      if (graphDiff) {
        stateUpdate.graphHistory = [{
          cycle: state.dialecticalCycleCount,
          diff: graphDiff,
        }]
      }

      return stateUpdate
    } catch (err) {
      const incompleteReason = err instanceof Error ? err.message : String(err)
      log.warn('Sublation failed, continuing with degraded synthesis', {
        error: incompleteReason,
        runId: state.runId,
      })

      return {
        phase: 'meta_reflection',
        synthesis: {
          operators: [],
          preservedElements: [],
          negatedElements: [],
          newConceptGraph: {},
          newClaims: [],
          newPredictions: [],
          schemaDiff: null,
          incompleteReason: `Sublation degraded: ${incompleteReason}`,
        },
        kgDiff: null,
        mergedGraph: state.mergedGraph,
        budget: state.budget,
        degradedPhases: ['sublation'],
      }
    }
  }
}

// ----- Node: Meta Reflection (Dialectical Sub-Loop) -----

function createDialecticalMetaNode(
  metaAgent: AgentConfig,
  execContext: AgentExecutionContext,
  researchConfig: DeepResearchRunConfig,
  thesisAgents: AgentConfig[]
) {
  return async (state: DeepResearchState): Promise<Partial<DeepResearchState>> => {
    const maxDialecticalCycles = researchConfig.maxDialecticalCycles
    log.info('Deep Research: Meta Reflection phase', {
      dialecticalCycle: state.dialecticalCycleCount,
      maxDialecticalCycles,
    })
    await emitPhaseEvent(execContext, 'meta_reflection', {
      dialecticalCycle: state.dialecticalCycleCount,
      maxDialecticalCycles,
    })

    const cycleCount = state.dialecticalCycleCount + 1

    // Check hard cap first — pause instead of terminating
    if (cycleCount >= maxDialecticalCycles) {
      const constraintOverride = state.context.constraintOverride as
        | { type: string; newLimit?: number }
        | undefined
      const effectiveMax =
        constraintOverride?.type === 'max_dialectical_cycles' && constraintOverride.newLimit
          ? constraintOverride.newLimit
          : maxDialecticalCycles

      if (cycleCount >= effectiveMax) {
        log.info('Max dialectical cycles reached, pausing for user decision', {
          cycles: cycleCount,
          maxDialecticalCycles: effectiveMax,
        })
        return {
          dialecticalMetaDecision: 'TERMINATE',
          dialecticalCycleCount: cycleCount,
          status: 'waiting_for_input',
          constraintPause: {
            constraintType: 'max_dialectical_cycles',
            currentValue: cycleCount,
            limitValue: effectiveMax,
            unit: 'dialectical cycles',
            partialOutput: `Completed ${cycleCount} dialectical cycles with ${state.theses.length} theses and ${state.contradictions.length} contradictions.`,
            suggestedIncrease: effectiveMax + 2,
          },
        }
      }
      // User increased limit — continue
      log.info('Continuing with increased dialectical cycle limit', {
        cycles: cycleCount,
        newMax: effectiveMax,
      })
    }

    // Calculate cost for this cycle
    const recentSteps = state.steps.slice(-thesisAgents.length * 3) // rough heuristic
    const tokensThisCycle = recentSteps.reduce((s, step) => s + step.tokensUsed, 0)
    const costThisCycle = recentSteps.reduce((s, step) => s + step.estimatedCost, 0)

    // Build input for real meta-reflection with convergence detection
    // Get latest graph diff from graphHistory for this cycle
    const latestGraphDiff = state.graphHistory.length > 0
      ? state.graphHistory[state.graphHistory.length - 1].diff
      : null

    const input: MetaReflectionInput = {
      cycleNumber: cycleCount,
      goal: state.goal,
      context: state.context,
      theses: state.theses.slice(-thesisAgents.length),
      negations: state.negations.slice(-thesisAgents.length),
      contradictions: state.contradictions.slice(-10),
      synthesis: state.synthesis,
      communities: [],
      kgDiff: ((state as Record<string, unknown>).kgDiff as KGDiff | null) ?? null,
      mergedGraph: state.mergedGraph,
      latestGraphDiff,
      previousMetrics:
        ((state as Record<string, unknown>).cycleMetricsHistory as CycleMetrics[]) ?? [],
      tokensUsedThisCycle: tokensThisCycle,
      costThisCycle,
    }

    const dialecticalConfig = buildDialecticalConfig(researchConfig, thesisAgents)

    const result = await runMetaReflection(
      input,
      metaAgent,
      execContext,
      dialecticalConfig,
      state.steps.length
    )

      // Check if meta agent requested user input
      const metaInterrupt = handleAskUserInterrupt(result.step, 'dialectical_meta')
      if (metaInterrupt) {
        return { steps: [result.step], dialecticalCycleCount: cycleCount, ...metaInterrupt }
      }

      log.info('Meta reflection complete', {
        decision: result.decision,
        velocity: result.metrics.velocity,
        convergenceScore: result.metrics.convergenceScore,
        learningRate: result.metrics.learningRate,
        warnings: result.warnings,
      })

      // Track budget for meta reflection
      let currentBudget = { ...state.budget }
      currentBudget = recordSpend(currentBudget, result.step.estimatedCost, result.step.tokensUsed, 'llm')

    return {
      dialecticalMetaDecision: result.decision,
      dialecticalCycleCount: cycleCount,
      cycleMetricsHistory: [result.metrics],
      steps: [result.step],
      budget: currentBudget,
      totalTokensUsed: result.step.tokensUsed,
      totalEstimatedCost: result.step.estimatedCost,
    }
  }
}

// ----- Node: Gap Analysis -----

function createGapAnalysisNode(
  gapAnalysisAgent: AgentConfig,
  execContext: AgentExecutionContext,
  apiKeys: ProviderKeys,
  maxGapIterations: number,
  sharedKg: KnowledgeHypergraph
) {
  return async (state: DeepResearchState): Promise<Partial<DeepResearchState>> => {
    // Mid-loop quota/rate check before expensive gap analysis
    if (state.gapIterationsUsed > 0) {
      const pauseState = await checkQuotaOrRateLimit(
        execContext.userId,
        'gap_analysis',
        `Coverage: ${state.gapAnalysis ? `${(state.gapAnalysis.overallCoverageScore * 100).toFixed(0)}%` : 'unknown'}. ${state.gapIterationsUsed} gap iterations completed.`
      )
      if (pauseState) return pauseState
    }

    log.info('Deep Research: Gap Analysis phase', {
      iteration: state.gapIterationsUsed,
      maxIterations: maxGapIterations,
    })
    await emitPhaseEvent(execContext, 'gap_analysis', {
      iteration: state.gapIterationsUsed,
      maxIterations: maxGapIterations,
      budgetPhase: state.budget.phase,
    })

    let currentBudget = { ...state.budget }
    const providerFn = makeProviderFn(gapAnalysisAgent, apiKeys)
    const kg = sharedKg

    const { result: gapResult, updatedBudget } = await analyzeKnowledgeGaps(
      kg,
      state.goal,
      providerFn,
      currentBudget,
      2,
      gapAnalysisAgent.modelName,
    )
    currentBudget = recordGapIteration(updatedBudget)

    // Capture KG snapshot after gap analysis
    const snapshot = captureKGSnapshot(
      kg,
      state.kgSnapshots.length,
      'gap_analysis',
      state.kgSnapshots
    )

    log.info('Gap analysis complete', {
      gaps: gapResult.gaps.length,
      coverageScore: gapResult.overallCoverageScore,
      shouldContinue: gapResult.shouldContinue,
      budgetPhase: currentBudget.phase,
    })

    // If gap analysis produced a new search plan, add it
    const newSearchPlans: SearchPlan[] = gapResult.newSearchPlan ? [gapResult.newSearchPlan] : []

    // Check if we're about to be stopped by a constraint but gaps remain
    const willContinue = shouldContinueGapLoop(currentBudget, gapResult, maxGapIterations)
    if (
      !willContinue &&
      gapResult.shouldContinue &&
      gapResult.overallCoverageScore < 0.85
    ) {
      const constraintOverride = state.context.constraintOverride as
        | { type: string; newLimit?: number }
        | undefined

      // Budget exhausted
      if (currentBudget.phase === 'exhausted') {
        const effectiveBudget =
          constraintOverride?.type === 'budget' && constraintOverride.newLimit
            ? constraintOverride.newLimit
            : currentBudget.maxBudgetUsd
        if (currentBudget.spentUsd >= effectiveBudget * 0.95) {
          log.info('Budget exhausted during gap analysis, pausing for user decision', {
            spent: currentBudget.spentUsd,
            max: effectiveBudget,
            coverage: gapResult.overallCoverageScore,
          })
          return {
            phase: 'gap_analysis',
            gapAnalysis: gapResult,
            gapIterationsUsed: currentBudget.gapIterationsUsed,
            budget: currentBudget,
            searchPlans: newSearchPlans,
            kgSnapshots: [snapshot],
            status: 'waiting_for_input',
            constraintPause: {
              constraintType: 'budget',
              currentValue: parseFloat(currentBudget.spentUsd.toFixed(4)),
              limitValue: effectiveBudget,
              unit: 'USD',
              partialOutput: `Coverage: ${(gapResult.overallCoverageScore * 100).toFixed(0)}%. ${gapResult.gaps.length} gaps remain.`,
              suggestedIncrease: effectiveBudget * 2,
            },
          }
        }
      }

      // Gap iterations exhausted
      if (currentBudget.gapIterationsUsed >= maxGapIterations) {
        const effectiveMax =
          constraintOverride?.type === 'max_gap_iterations' && constraintOverride.newLimit
            ? constraintOverride.newLimit
            : maxGapIterations
        if (currentBudget.gapIterationsUsed >= effectiveMax) {
          log.info('Gap iterations exhausted, pausing for user decision', {
            iterations: currentBudget.gapIterationsUsed,
            max: effectiveMax,
            coverage: gapResult.overallCoverageScore,
          })
          return {
            phase: 'gap_analysis',
            gapAnalysis: gapResult,
            gapIterationsUsed: currentBudget.gapIterationsUsed,
            budget: currentBudget,
            searchPlans: newSearchPlans,
            kgSnapshots: [snapshot],
            status: 'waiting_for_input',
            constraintPause: {
              constraintType: 'max_gap_iterations',
              currentValue: currentBudget.gapIterationsUsed,
              limitValue: effectiveMax,
              unit: 'iterations',
              partialOutput: `Coverage: ${(gapResult.overallCoverageScore * 100).toFixed(0)}%. ${gapResult.gaps.length} gaps remain.`,
              suggestedIncrease: effectiveMax + 2,
            },
          }
        }
      }
    }

    return {
      phase: 'gap_analysis',
      gapAnalysis: gapResult,
      gapIterationsUsed: currentBudget.gapIterationsUsed,
      budget: currentBudget,
      searchPlans: newSearchPlans,
      kgSnapshots: [snapshot],
    }
  }
}

// ----- Node: Answer Generation -----

function createAnswerNode(
  answerAgent: AgentConfig,
  execContext: AgentExecutionContext,
  apiKeys: ProviderKeys,
  sharedKg: KnowledgeHypergraph
) {
  return async (state: DeepResearchState): Promise<Partial<DeepResearchState>> => {
    log.info('Deep Research: Answer Generation phase')
    await emitPhaseEvent(execContext, 'answer_generation', {
      sourceCount: state.sources.length,
      claimCount: state.extractedClaims.length,
      budgetPhase: state.budget.phase,
    })

    const providerFn = makeProviderFn(answerAgent, apiKeys)
    await applySynthesisDiffToSharedKg(sharedKg, state)
    const kg = sharedKg

    const { answer, updatedBudget } = await generateAnswer(
      kg,
      state.goal,
      providerFn,
      state.budget,
      state.synthesis,
      state.contradictions,
      {
        counterclaims: state.counterclaims,
        rawSources: state.sources,
        rawSourceContentMap: state.sourceContentMap,
        mergedGraph: state.mergedGraph,
        theses: state.theses,
        negations: state.negations,
        modelName: answerAgent.modelName,
      }
    )
    const answerWithMetadata: DeepResearchAnswer = {
      ...answer,
      metadata: {
        degradedPhases: [...new Set(state.degradedPhases ?? [])],
      },
    }

    // Record final answer as message
    await recordMessage(
      {
        userId: execContext.userId,
        runId: execContext.runId,
        agentId: answerAgent.agentId,
        role: 'assistant',
        content: `**[DEEP RESEARCH ANSWER]**\n\n${answer.directAnswer}`,
      },
      { skipPrune: true }
    )

    // Final KG snapshot
    const snapshot = captureKGSnapshot(
      kg,
      state.kgSnapshots.length,
      'answer_generation',
      state.kgSnapshots
    )

    return {
      answer: answerWithMetadata,
      budget: updatedBudget,
      finalOutput: answerWithMetadata.directAnswer,
      status: 'completed',
      kgSnapshots: [snapshot],
    }
  }
}

// ----- Node: Counterclaim Search (Phase 23) -----

function createCounterclaimNode(
  extractionAgent: AgentConfig,
  execContext: AgentExecutionContext,
  apiKeys: ProviderKeys,
  searchToolKeys?: SearchToolKeys
) {
  return async (state: DeepResearchState): Promise<Partial<DeepResearchState>> => {
    log.info('Deep Research: Counterclaim Search phase')
    await emitPhaseEvent(execContext, 'counterclaim_search', {
      claimCount: state.extractedClaims.length,
    })

    const providerFn = makeProviderFn(extractionAgent, apiKeys)

    // Build adversarial search function using existing search infrastructure
    const adversarialSearchFn: AdversarialSearchFn | undefined =
      execContext.toolRegistry
        ? async (queries: string[]) => {
            const searchPlan: SearchPlan = {
              serpQueries: queries,
              scholarQueries: [],
              semanticQueries: [],
              rationale: 'Adversarial counterclaim search',
              targetSourceCount: Math.min(queries.length * 2, 6),
            }
            const toolContext = {
              userId: execContext.userId,
              runId: execContext.runId,
              workflowId: execContext.workflowId,
              agentId: extractionAgent.agentId,
              agentName: extractionAgent.name,
              provider: extractionAgent.modelProvider,
              modelName: extractionAgent.modelName,
              iteration: 0,
              searchToolKeys,
            }

            const { results } = await executeSearchPlan(
              searchPlan,
              execContext.toolRegistry!,
              toolContext,
              state.budget
            )

            // Skip relevance scoring for adversarial sources — we want diverse results
            const scoreRelevanceFn = async () => 0.7 // Accept most results

            const { sources, contentMap } = await ingestSources(
              results,
              state.goal,
              execContext.toolRegistry!,
              toolContext,
              state.budget,
              scoreRelevanceFn
            )

            return { sources, contentMap }
          }
        : undefined

    const counterclaims = await generateCounterclaims(
      state.extractedClaims,
      state.goal,
      providerFn,
      adversarialSearchFn,
    )

    log.info('Counterclaim search complete', { counterclaims: counterclaims.length })

    return {
      counterclaims,
    }
  }
}

// ----- Routing Functions -----

/**
 * Route after search_and_ingest based on mode (Phase 25).
 * Quick mode skips directly to answer_generation.
 */
export function routeAfterSearch(
  state: DeepResearchState,
  mode: 'full' | 'quick'
): 'claim_extraction' | 'answer_generation' {
  if (mode === 'quick') {
    return 'answer_generation'
  }
  return 'claim_extraction'
}

// ----- Graph Creation -----

/**
 * Create a deep research workflow graph.
 */
export function createDeepResearchGraph(
  config: DeepResearchGraphConfig,
  sharedKg: KnowledgeHypergraph
) {
  const {
    workflow,
    researchConfig,
    plannerAgent,
    extractionAgent,
    gapAnalysisAgent,
    answerAgent,
    thesisAgents,
    synthesisAgents,
    metaAgent,
    apiKeys,
    userId,
    runId,
    eventWriter,
    toolRegistry,
    searchToolKeys,
    executionMode,
    tierOverride,
    workflowCriticality,
  } = config

  const graph = new StateGraph(DeepResearchStateAnnotation)

  const execContext: AgentExecutionContext = {
    userId,
    workflowId: workflow.workflowId,
    runId,
    apiKeys,
    eventWriter,
    toolRegistry,
    searchToolKeys,
    executionMode,
    tierOverride,
    workflowCriticality,
  }

  // Add nodes — shared KG instance passed to nodes that need it
  graph.addNode('input_normalizer', createInputNormalizerNode(execContext))

  graph.addNode('sense_making', createSenseMakingNode(plannerAgent, execContext, researchConfig))

  graph.addNode(
    'context_seeding',
    createContextSeedingNode(extractionAgent, sharedKg, execContext, apiKeys)
  )

  graph.addNode(
    'search_and_ingest',
    createSearchAndIngestNode(extractionAgent, execContext, apiKeys, searchToolKeys)
  )

  graph.addNode(
    'claim_extraction',
    createClaimExtractionNode(extractionAgent, execContext, apiKeys)
  )

  graph.addNode('kg_construction', createKGConstructionNode(sharedKg, execContext, researchConfig))

  graph.addNode('kg_snapshot', createKGSnapshotNode(sharedKg, execContext))

  graph.addNode('thesis_generation', createThesisNode(thesisAgents, execContext))

  graph.addNode('cross_negation', createCrossNegationNode(thesisAgents, execContext))

  graph.addNode('contradiction', createContradictionNode(execContext, apiKeys))

  graph.addNode(
    'sublation',
    createSublationNode(synthesisAgents, execContext, researchConfig, thesisAgents)
  )

  graph.addNode(
    'dialectical_meta',
    createDialecticalMetaNode(metaAgent, execContext, researchConfig, thesisAgents)
  )

  graph.addNode(
    'gap_analysis',
    createGapAnalysisNode(
      gapAnalysisAgent,
      execContext,
      apiKeys,
      researchConfig.maxGapIterations,
      sharedKg
    )
  )

  graph.addNode(
    'counterclaim_search',
    createCounterclaimNode(extractionAgent, execContext, apiKeys, searchToolKeys)
  )

  graph.addNode('answer_generation', createAnswerNode(answerAgent, execContext, apiKeys, sharedKg))

  const mode = researchConfig.mode ?? 'full'
  const maxGapIterations = researchConfig.maxGapIterations

  // Helper: route to next node unless paused for user input
  const edgeOrEnd = (target: string) => (state: DeepResearchState) =>
    state.status === 'waiting_for_input' ? END : target

  // ----- Research Phase Edges -----

  graph.addEdge(START, 'input_normalizer' as typeof START)
  graph.addEdge('input_normalizer' as typeof START, 'sense_making' as typeof START)
  graph.addConditionalEdges(
    'sense_making' as typeof START,
    edgeOrEnd('context_seeding'),
    { context_seeding: 'context_seeding' as typeof START, [END]: END }
  )
  graph.addEdge('context_seeding' as typeof START, 'search_and_ingest' as typeof START)

  // Quick mode skips claim extraction and dialectical phases
  graph.addConditionalEdges(
    'search_and_ingest' as typeof START,
    (state: DeepResearchState) => routeAfterSearch(state, mode),
    {
      claim_extraction: 'claim_extraction' as typeof START,
      answer_generation: 'answer_generation' as typeof START,
    }
  )

  // Research loop: claim_extraction → kg_construction → gap_analysis
  graph.addEdge('claim_extraction' as typeof START, 'kg_construction' as typeof START)
  graph.addEdge('kg_construction' as typeof START, 'gap_analysis' as typeof START)

  // Gap analysis routes to search (continue research) or kg_snapshot (converged)
  graph.addConditionalEdges(
    'gap_analysis' as typeof START,
    (state: DeepResearchState) => {
      if (state.status === 'waiting_for_input') {
        return END // Constraint pause — exit graph so executor can handle
      }
      if (
        state.gapAnalysis &&
        shouldContinueGapLoop(state.budget, state.gapAnalysis, maxGapIterations)
      ) {
        return 'search_and_ingest'
      }
      return 'kg_snapshot'
    },
    {
      search_and_ingest: 'search_and_ingest' as typeof START,
      kg_snapshot: 'kg_snapshot' as typeof START,
      [END]: END,
    }
  )

  // ----- Dialectical Phase Edges -----

  // kg_snapshot → dialectical engine
  graph.addEdge('kg_snapshot' as typeof START, 'thesis_generation' as typeof START)
  graph.addConditionalEdges(
    'thesis_generation' as typeof START,
    edgeOrEnd('cross_negation'),
    { cross_negation: 'cross_negation' as typeof START, [END]: END }
  )
  graph.addConditionalEdges(
    'cross_negation' as typeof START,
    edgeOrEnd('contradiction'),
    { contradiction: 'contradiction' as typeof START, [END]: END }
  )
  graph.addEdge('contradiction' as typeof START, 'sublation' as typeof START)
  graph.addConditionalEdges(
    'sublation' as typeof START,
    edgeOrEnd('dialectical_meta'),
    { dialectical_meta: 'dialectical_meta' as typeof START, [END]: END }
  )

  // Dialectical loop or exit: meta → thesis_generation (CONTINUE) or counterclaim_search (TERMINATE)
  graph.addConditionalEdges(
    'dialectical_meta' as typeof START,
    (state: DeepResearchState) => {
      if (state.status === 'waiting_for_input') {
        return END
      }
      if (state.dialecticalMetaDecision === 'CONTINUE') {
        return 'thesis_generation'
      }
      return 'counterclaim_search'
    },
    {
      thesis_generation: 'thesis_generation' as typeof START,
      counterclaim_search: 'counterclaim_search' as typeof START,
      [END]: END,
    }
  )

  // Counterclaim search → answer generation → END
  graph.addEdge('counterclaim_search' as typeof START, 'answer_generation' as typeof START)
  graph.addEdge('answer_generation' as typeof START, END)

  return graph.compile()
}

// ----- Execution -----

/**
 * Execute a deep research workflow using LangGraph.
 */
export async function executeDeepResearchWorkflowLangGraph(
  config: DeepResearchGraphConfig,
  goal: string,
  context?: Record<string, unknown>
): Promise<{
  output: string
  steps: AgentExecutionStep[]
  totalTokensUsed: number
  totalEstimatedCost: number
  status: 'running' | 'completed' | 'failed' | 'paused' | 'waiting_for_input'
  answer: DeepResearchAnswer | null
  budget: RunBudget
  kgSnapshots: KGSnapshot[]
  sources: SourceRecord[]
  extractedClaims: ExtractedClaim[]
  gapIterationsUsed: number
  degradedPhases: string[]
  startup?: {
    normalizedInput: Record<string, unknown> | null
    goalFrame: Record<string, unknown> | null
    startupSeedSummary: Record<string, unknown> | null
  }
  constraintPause?: Run['constraintPause']
  pendingInput?: { prompt: string; nodeId: string }
}> {
  const { workflow, researchConfig, runId, userId } = config
  const trimmedGoal = goal.trim()

  if (trimmedGoal.length === 0) {
    return {
      output: 'Deep research failed: Goal is required',
      steps: [],
      totalTokensUsed: 0,
      totalEstimatedCost: 0,
      status: 'failed' as const,
      answer: null,
      budget: { maxBudgetUsd: researchConfig.maxBudgetUsd, spentUsd: 0, spentTokens: 0, searchCallsUsed: 0, maxSearchCalls: 0, llmCallsUsed: 0, phase: 'full' as const, maxRecursiveDepth: 3, gapIterationsUsed: 0 },
      kgSnapshots: [],
      sources: [],
      extractedClaims: [],
      gapIterationsUsed: 0,
      degradedPhases: [],
    }
  }

  let initialBudget: RunBudget
  let compiledGraph: ReturnType<typeof createDeepResearchGraph>
  let kgSessionId: DialecticalSessionId

  try {
    initialBudget = createRunBudget(researchConfig.maxBudgetUsd, researchConfig.searchDepth)

    // Create a single shared KG instance for the entire run
    kgSessionId = `deepResearch:${runId}` as DialecticalSessionId
    const sharedKg = new KnowledgeHypergraph(kgSessionId, userId)
    await sharedKg.load()

    compiledGraph = createDeepResearchGraph(config, sharedKg)
  } catch (initError) {
    const msg = initError instanceof Error ? initError.message : String(initError)
    const stack = initError instanceof Error ? initError.stack : undefined
    log.error('Deep research initialization failed', { error: msg, stack, runId })
    return {
      output: `Deep research initialization failed: ${msg}`,
      steps: [],
      totalTokensUsed: 0,
      totalEstimatedCost: 0,
      status: 'failed' as const,
      answer: null,
      budget: { maxBudgetUsd: researchConfig.maxBudgetUsd, spentUsd: 0, spentTokens: 0, searchCallsUsed: 0, maxSearchCalls: 0, llmCallsUsed: 0, phase: 'full' as const, maxRecursiveDepth: 3, gapIterationsUsed: 0 },
      kgSnapshots: [],
      sources: [],
      extractedClaims: [],
      gapIterationsUsed: 0,
      degradedPhases: [],
    }
  }

  const initialState: Partial<DeepResearchState> = {
    workflowId: workflow.workflowId,
    runId,
    userId,
    goal: trimmedGoal,
    context: context ?? {},
    phase: 'sense_making',
    normalizedInput: null,
    goalFrame: null,
    startupSeedSummary: null,
    budget: initialBudget,
    searchPlans: [],
    sources: [],
    extractedClaims: [],
    sourceContentMap: {},
    kgSessionId,
    gapIterationsUsed: 0,
    dialecticalCycleCount: 0,
    theses: [],
    negations: [],
    contradictions: [],
    synthesis: null,
    dialecticalMetaDecision: null,
    gapAnalysis: null,
    kgSnapshots: [],
    cycleMetricsHistory: [],
    kgDiff: null,
    answer: null,
    steps: [],
    totalTokensUsed: 0,
    totalEstimatedCost: 0,
    degradedPhases: [],
    finalOutput: null,
    status: 'running',
    error: null,
  }

  let finalState: DeepResearchState
  try {
    finalState = await compiledGraph.invoke(initialState) as DeepResearchState
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e)
    const errorStack = e instanceof Error ? e.stack : undefined
    log.error('Deep research graph execution failed', {
      error: errorMessage,
      stack: errorStack,
      workflowId: workflow.workflowId,
      runId,
      goal: trimmedGoal.slice(0, 200),
    })
    return {
      output: `Deep research failed: ${errorMessage}`,
      steps: [],
      totalTokensUsed: 0,
      totalEstimatedCost: 0,
      status: 'failed' as const,
      answer: null,
      budget: initialBudget,
      kgSnapshots: [],
      sources: [],
      extractedClaims: [],
      gapIterationsUsed: 0,
      degradedPhases: [],
    }
  }

  return {
    output: finalState.finalOutput ?? '',
    steps: finalState.steps ?? [],
    totalTokensUsed: finalState.totalTokensUsed ?? 0,
    totalEstimatedCost: finalState.totalEstimatedCost ?? 0,
    status: finalState.status ?? 'completed',
    answer: finalState.answer ?? null,
    budget: finalState.budget ?? initialBudget,
    kgSnapshots: finalState.kgSnapshots ?? [],
    sources: finalState.sources ?? [],
    extractedClaims: finalState.extractedClaims ?? [],
    gapIterationsUsed: finalState.gapIterationsUsed ?? 0,
    degradedPhases: finalState.degradedPhases ?? [],
    startup: {
      normalizedInput: finalState.normalizedInput
        ? summarizeNormalizedStartupInput(finalState.normalizedInput)
        : null,
      goalFrame: (finalState.goalFrame as Record<string, unknown> | null) ?? null,
      startupSeedSummary: (finalState.startupSeedSummary as Record<string, unknown> | null) ?? null,
    },
    constraintPause: finalState.constraintPause ?? undefined,
    pendingInput: finalState.pendingInput ?? undefined,
  }
}
