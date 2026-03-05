/**
 * Deep Research Workflow Graph
 *
 * LangGraph pipeline that orchestrates budget-aware deep research:
 *
 * START
 *   → sense_making
 *   → [OUTER LOOP: gap iterations]
 *       → search_planning → search_execution → source_ingestion → claim_extraction → kg_construction
 *       → [INNER LOOP: dialectical cycles]
 *           → thesis_generation → cross_negation → contradiction → sublation → meta_reflection
 *       → gap_analysis (IF gaps AND budget → loop to search_planning, ELSE → answer)
 *   → answer_generation
 * END
 */

import { StateGraph, END, START } from '@langchain/langgraph'
import type {
  AgentConfig,
  Workflow,
  AgentExecutionStep,
  DeepResearchRunConfig,
  DeepResearchAnswer,
  RunBudget,
  SearchPlan,
  SourceRecord,
  ExtractedClaim,
  KGSnapshot,
  ThesisOutput,
  NegationOutput,
  SublationOutput,
  RewriteOperatorType,
  DialecticalSessionId,
  KGDiff,
  WorkflowExecutionMode,
  ModelTier,
  WorkflowCriticality,
  CounterclaimResult,
} from '@lifeos/agents'
import type { ProviderKeys } from '../providerService.js'
import { executeWithProvider } from '../providerService.js'
import type { RunEventWriter } from '../runEvents.js'
import type { SearchToolKeys } from '../providerKeys.js'
import type { ToolRegistry } from '../toolExecutor.js'
import { executeAgentWithEvents, type AgentExecutionContext } from './utils.js'
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
  extractClaimsFromSource,
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
} from '../deepResearch/sourceQuality.js'
import { runContradictionTrackers } from '../contradictionTrackers.js'
import type { ContradictionTrackerContext } from '../contradictionTrackers.js'
import { runCompetitiveSynthesis } from '../sublationEngine.js'
import { runMetaReflection } from '../metaReflection.js'
import type { MetaReflectionInput, CycleMetrics } from '../metaReflection.js'
import { recordMessage } from '../messageStore.js'
import { createLogger } from '../../lib/logger.js'

const log = createLogger('DeepResearchGraph')

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
      supersededNodeIds: [],
      addedEdgeKeys: [],
      removedEdgeKeys: [],
    },
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
  const fallback: ThesisOutput = {
    agentId,
    model,
    lens,
    conceptGraph: {},
    causalModel: [],
    falsificationCriteria: [],
    decisionImplications: [],
    unitOfAnalysis: '',
    temporalGrain: '',
    regimeAssumptions: [],
    confidence: 0.7,
    rawText,
  }

  try {
    const jsonMatch = rawText.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return fallback

    const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>
    return {
      agentId,
      model,
      lens,
      conceptGraph:
        parsed.conceptGraph && typeof parsed.conceptGraph === 'object'
          ? (parsed.conceptGraph as Record<string, unknown>)
          : {},
      causalModel: Array.isArray(parsed.causalModel) ? parsed.causalModel.map(String) : [],
      falsificationCriteria: Array.isArray(parsed.falsificationCriteria)
        ? parsed.falsificationCriteria.map(String)
        : [],
      decisionImplications: Array.isArray(parsed.decisionImplications)
        ? parsed.decisionImplications.map(String)
        : [],
      unitOfAnalysis: String(parsed.unitOfAnalysis ?? ''),
      temporalGrain: String(parsed.temporalGrain ?? ''),
      regimeAssumptions: Array.isArray(parsed.regimeAssumptions)
        ? parsed.regimeAssumptions.map(String)
        : [],
      confidence: Math.min(1, Math.max(0, Number(parsed.confidence) || 0.7)),
      rawText,
    }
  } catch {
    return fallback
  }
}

// ----- Helper: Parse Negation Output -----

function parseNegationOutput(
  rawText: string,
  agentId: string,
  targetThesisAgentId: string
): NegationOutput {
  const fallback: NegationOutput = {
    agentId,
    targetThesisAgentId,
    internalTensions: [],
    categoryAttacks: [],
    preservedValid: [],
    rivalFraming: '',
    rewriteOperator: 'SPLIT',
    operatorArgs: {},
    rawText,
  }

  try {
    const jsonMatch = rawText.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return fallback

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
  } catch {
    return fallback
  }
}

// ----- Helper: Build Dialectical Config -----

function buildDialecticalConfig(
  researchConfig: DeepResearchRunConfig,
  thesisAgents: AgentConfig[]
): Record<string, unknown> {
  return {
    maxCycles: researchConfig.maxDialecticalCycles,
    minCycles: 1,
    enabledTrackers: ['LOGIC', 'PRAGMATIC', 'SEMANTIC', 'BOUNDARY'],
    thesisLenses: researchConfig.thesisLenses,
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
      lens: a.systemPrompt?.match(/(\w+)\s+THESIS/i)?.[1]?.toLowerCase() ?? 'general',
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

    const prompt = `Analyze this research query and create an initial search plan.

QUERY: ${state.goal}

Configuration:
- Search depth: ${researchConfig.searchDepth}
- Include academic: ${researchConfig.includeAcademic}
- Include semantic: ${researchConfig.includeSemanticSearch}
- Thesis lenses: ${researchConfig.thesisLenses.join(', ')}

Tasks:
1. Disambiguate the query — identify the core question and sub-questions
2. Identify key domains and concepts to search
3. Generate search queries for SERP, academic, and semantic search

Respond with JSON:
{
  "analysis": "Brief analysis of the query and key domains",
  "serpQueries": ["query1", "query2", ...],
  "scholarQueries": ["academic query1", ...],
  "semanticQueries": ["semantic query1", ...],
  "targetSourceCount": 8-15,
  "rationale": "Why these queries"
}`

    try {
      const step = await executeAgentWithEvents(
        plannerAgent,
        prompt,
        { ...state.context, phase: 'sense_making' },
        execContext,
        { stepNumber: 1, maxIterations: 3 }
      )

      const plan = parseSenseMakingOutput(step.output, researchConfig)

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
        searchPlans: [plan],
        steps: [step],
        totalTokensUsed: step.tokensUsed,
        totalEstimatedCost: step.estimatedCost,
      }
    } catch (err) {
      log.warn('Sense making failed, using default search plan', { error: String(err) })
      const fallbackPlan: SearchPlan = {
        serpQueries: [state.goal, `${state.goal} research`, `${state.goal} analysis`],
        scholarQueries: researchConfig.includeAcademic ? [`${state.goal} study`] : [],
        semanticQueries: researchConfig.includeSemanticSearch ? [state.goal] : [],
        rationale: 'Fallback: direct query search',
        targetSourceCount: 8,
      }
      return {
        phase: 'search_execution',
        searchPlans: [fallbackPlan],
      }
    }
  }
}

function parseSenseMakingOutput(output: string, config: DeepResearchRunConfig): SearchPlan {
  try {
    const jsonMatch = output.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON found')
    const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>

    return {
      serpQueries: Array.isArray(parsed.serpQueries)
        ? parsed.serpQueries.map(String).slice(0, 5)
        : [],
      scholarQueries:
        config.includeAcademic && Array.isArray(parsed.scholarQueries)
          ? parsed.scholarQueries.map(String).slice(0, 3)
          : [],
      semanticQueries:
        config.includeSemanticSearch && Array.isArray(parsed.semanticQueries)
          ? parsed.semanticQueries.map(String).slice(0, 3)
          : [],
      rationale: String(parsed.rationale ?? 'Generated from sense-making analysis'),
      targetSourceCount: Math.min(15, Math.max(5, Number(parsed.targetSourceCount) || 8)),
    }
  } catch {
    return {
      serpQueries: [String(output).substring(0, 200)],
      scholarQueries: [],
      semanticQueries: [],
      rationale: 'Fallback from unparseable output',
      targetSourceCount: 8,
    }
  }
}

// ----- Node: Search Execution + Source Ingestion (combined for efficiency) -----

function createSearchAndIngestNode(
  extractionAgent: AgentConfig,
  execContext: AgentExecutionContext,
  apiKeys: ProviderKeys
) {
  return async (state: DeepResearchState): Promise<Partial<DeepResearchState>> => {
    log.info('Deep Research: Search Execution + Source Ingestion phase')
    await emitPhaseEvent(execContext, 'search_execution', {
      planCount: state.searchPlans.length,
      budgetPhase: state.budget.phase,
    })

    if (!execContext.toolRegistry) {
      log.warn('No tool registry available, skipping search')
      return { phase: 'claim_extraction' }
    }

    // Get the most recent search plan
    const latestPlan = state.searchPlans[state.searchPlans.length - 1]
    if (!latestPlan) {
      log.warn('No search plan available')
      return { phase: 'claim_extraction' }
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
    }

    const { results: searchResults, updatedBudget: postSearchBudget } = await executeSearchPlan(
      latestPlan,
      execContext.toolRegistry,
      toolContext,
      currentBudget
    )
    currentBudget = postSearchBudget

    await emitPhaseEvent(execContext, 'source_ingestion', {
      searchResults: searchResults.length,
      budgetPhase: currentBudget.phase,
    })

    // Relevance scoring function
    const providerFn = makeProviderFn(extractionAgent, apiKeys)
    const scoreRelevanceFn = async (snippet: string, query: string): Promise<number> => {
      const costEstimate = estimateLLMCost(extractionAgent.modelName, 200, 10)
      if (!canAffordOperation(currentBudget, costEstimate)) return 0.5

      try {
        const result = await providerFn(
          'Rate relevance 0-1 as a single number. Output ONLY the number.',
          `Query: "${query}"\nSnippet: "${snippet.substring(0, 300)}"`
        )
        currentBudget = recordSpend(currentBudget, costEstimate, 210, 'llm')
        const score = parseFloat(result.trim())
        return isNaN(score) ? 0.5 : Math.min(1, Math.max(0, score))
      } catch {
        return 0.5
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

    return {
      phase: 'claim_extraction',
      sources,
      sourceContentMap: contentMap,
      budget: currentBudget,
    }
  }
}

// ----- Node: Claim Extraction + KG Construction (combined) -----

function createClaimExtractionNode(
  extractionAgent: AgentConfig,
  execContext: AgentExecutionContext,
  apiKeys: ProviderKeys,
  sharedKg: KnowledgeHypergraph
) {
  return async (state: DeepResearchState): Promise<Partial<DeepResearchState>> => {
    log.info('Deep Research: Claim Extraction + KG Construction phase')
    await emitPhaseEvent(execContext, 'claim_extraction', {
      sourceCount: state.sources.length,
      budgetPhase: state.budget.phase,
    })

    let currentBudget = { ...state.budget }
    const providerFn = makeProviderFn(extractionAgent, apiKeys)
    const allClaims: ExtractedClaim[] = []

    const sessionId = (state.kgSessionId ?? `deepResearch:${state.runId}`) as DialecticalSessionId
    const kg = sharedKg

    // Extract claims from new sources using batch processing (Phase 21)
    const newSources = state.sources.slice(-20) // Process most recent sources

    const { claims: batchClaims, updatedBudget: postBatchBudget } =
      await extractClaimsFromSourceBatch(
        newSources,
        state.sourceContentMap,
        state.goal,
        providerFn,
        currentBudget,
        3 // batch size
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

    // Map claims into KG
    await emitPhaseEvent(execContext, 'kg_construction', {
      claimCount: allClaims.length,
    })

    const { addedClaimIds, addedConceptIds } = await mapClaimsToKG(
      allClaims,
      newSources,
      kg,
      sessionId,
      state.userId
    )

    log.info('Claim extraction complete', {
      claimsExtracted: allClaims.length,
      claimsAdded: addedClaimIds.length,
      conceptsAdded: addedConceptIds.length,
    })

    // Capture KG snapshot
    const snapshot = captureKGSnapshot(
      kg,
      state.kgSnapshots.length,
      'claim_extraction',
      state.kgSnapshots
    )

    return {
      phase: 'thesis_generation',
      extractedClaims: allClaims,
      kgSessionId: sessionId,
      budget: currentBudget,
      kgSnapshots: [snapshot],
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

    // Build thesis prompts using KG state
    const kgContext =
      state.extractedClaims.length > 0
        ? `\n\nKey claims from research:\n${state.extractedClaims
            .sort((a, b) => b.confidence - a.confidence)
            .slice(0, 15)
            .map(
              (c) => `- [${c.evidenceType}, confidence=${c.confidence.toFixed(2)}] ${c.claimText}`
            )
            .join('\n')}`
        : ''

    const thesisPromises = thesisAgents.map(async (agent, idx) => {
      const lens = agent.systemPrompt?.match(/(\w+)\s+THESIS/i)?.[1]?.toLowerCase() ?? 'general'

      const prompt = `Generate a thesis about the following topic from a ${lens} perspective.

TOPIC: ${state.goal}
${kgContext}

Generate a structured thesis with concept graph, causal model, falsification criteria, and decision implications.`

      try {
        const step = await executeAgentWithEvents(
          agent,
          prompt,
          { ...state.context, phase: 'thesis_generation', lens },
          execContext,
          { stepNumber: state.steps.length + idx + 1, maxIterations: 3 }
        )

        const thesis = parseThesisOutput(step.output, agent.agentId, step.model, lens)

        return { step, thesis }
      } catch (err) {
        log.warn(`Thesis agent ${agent.name} failed`, { error: String(err) })
        return null
      }
    })

    const results = await Promise.all(thesisPromises)
    const successful = results.filter((r) => r !== null)

    return {
      phase: 'cross_negation',
      theses: successful.map((r) => r.thesis),
      steps: successful.map((r) => r.step),
      totalTokensUsed: successful.reduce((sum, r) => sum + r.step.tokensUsed, 0),
      totalEstimatedCost: successful.reduce((sum, r) => sum + r.step.estimatedCost, 0),
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
      return { phase: 'contradiction_crystallization' }
    }

    const negationPromises: Promise<{
      step: AgentExecutionStep
      negation: NegationOutput
    } | null>[] = []

    for (let i = 0; i < Math.min(thesisAgents.length, state.theses.length); i++) {
      const agent = thesisAgents[i]
      const thesis = state.theses[state.theses.length - thesisAgents.length + i]
      if (!thesis) continue

      const targetIdx = (i + 1) % state.theses.length
      const targetThesis = state.theses[state.theses.length - thesisAgents.length + targetIdx]
      if (!targetThesis) continue

      negationPromises.push(
        (async () => {
          try {
            const prompt = `Critique this thesis using determinate negation.

YOUR THESIS (${thesis.lens}):
${thesis.rawText}

TARGET THESIS (${targetThesis.lens}):
${targetThesis.rawText}

Identify internal tensions, category attacks, preserved valid elements, and suggest a rewrite operator.`

            const step = await executeAgentWithEvents(
              agent,
              prompt,
              { ...state.context, phase: 'cross_negation' },
              execContext,
              { stepNumber: state.steps.length + i + 1, maxIterations: 2 }
            )

            const negation = parseNegationOutput(step.output, agent.agentId, targetThesis.agentId)

            return { step, negation }
          } catch (err) {
            log.warn(`Negation by ${agent.name} failed`, { error: String(err) })
            return null
          }
        })()
      )
    }

    const results = await Promise.all(negationPromises)
    const successful = results.filter((r) => r !== null)

    return {
      phase: 'contradiction_crystallization',
      negations: successful.map((r) => r.negation),
      steps: successful.map((r) => r.step),
      totalTokensUsed: successful.reduce((sum, r) => sum + r.step.tokensUsed, 0),
      totalEstimatedCost: successful.reduce((sum, r) => sum + r.step.estimatedCost, 0),
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
      return { phase: 'meta_reflection' }
    }

    const recentTheses = state.theses.slice(-thesisAgents.length)
    const recentNegations = state.negations.slice(-thesisAgents.length)
    const recentContradictions = state.contradictions.slice(-10)

    try {
      const dialecticalConfig = buildDialecticalConfig(researchConfig, thesisAgents)

      const result = await runCompetitiveSynthesis(
        recentTheses,
        recentNegations,
        recentContradictions,
        synthesisAgents,
        execContext,
        dialecticalConfig as never, // DialecticalWorkflowConfig — using duck typing
        state.dialecticalCycleCount,
        state.steps.length
      )

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

      return {
        phase: 'meta_reflection',
        synthesis,
        steps: result.steps,
        totalTokensUsed: result.totalTokensUsed,
        totalEstimatedCost: result.totalEstimatedCost,
      }
    } catch (err) {
      log.warn('Competitive synthesis failed, producing empty synthesis', { error: String(err) })
      return { phase: 'meta_reflection' }
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

    // Check hard cap first
    if (cycleCount >= maxDialecticalCycles) {
      log.info('Max dialectical cycles reached, proceeding to gap analysis')
      return {
        dialecticalMetaDecision: 'TERMINATE',
        dialecticalCycleCount: cycleCount,
      }
    }

    // Calculate cost for this cycle
    const recentSteps = state.steps.slice(-thesisAgents.length * 3) // rough heuristic
    const tokensThisCycle = recentSteps.reduce((s, step) => s + step.tokensUsed, 0)
    const costThisCycle = recentSteps.reduce((s, step) => s + step.estimatedCost, 0)

    // Build input for real meta-reflection with convergence detection
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
      previousMetrics:
        ((state as Record<string, unknown>).cycleMetricsHistory as CycleMetrics[]) ?? [],
      tokensUsedThisCycle: tokensThisCycle,
      costThisCycle,
    }

    const dialecticalConfig = buildDialecticalConfig(researchConfig, thesisAgents)

    try {
      const result = await runMetaReflection(
        input,
        metaAgent,
        execContext,
        dialecticalConfig as never, // DialecticalWorkflowConfig — duck typing
        state.steps.length
      )

      log.info('Meta reflection complete', {
        decision: result.decision,
        velocity: result.metrics.velocity,
        convergenceScore: result.metrics.convergenceScore,
        learningRate: result.metrics.learningRate,
        warnings: result.warnings,
      })

      return {
        dialecticalMetaDecision: result.decision,
        dialecticalCycleCount: cycleCount,
        cycleMetricsHistory: [result.metrics],
        steps: [result.step],
        totalTokensUsed: result.step.tokensUsed,
        totalEstimatedCost: result.step.estimatedCost,
      }
    } catch (err) {
      log.warn('Meta reflection failed, terminating', { error: String(err) })
      return {
        dialecticalMetaDecision: 'TERMINATE',
        dialecticalCycleCount: cycleCount,
      }
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
      currentBudget
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
      }
    )

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
      answer,
      budget: updatedBudget,
      finalOutput: answer.directAnswer,
      status: 'completed',
      kgSnapshots: [snapshot],
    }
  }
}

// ----- Node: Counterclaim Search (Phase 23) -----

function createCounterclaimNode(
  extractionAgent: AgentConfig,
  execContext: AgentExecutionContext,
  apiKeys: ProviderKeys
) {
  return async (state: DeepResearchState): Promise<Partial<DeepResearchState>> => {
    log.info('Deep Research: Counterclaim Search phase')
    await emitPhaseEvent(execContext, 'answer_generation', {
      phase: 'counterclaim_search',
      claimCount: state.extractedClaims.length,
    })

    const providerFn = makeProviderFn(extractionAgent, apiKeys)

    const counterclaims = await generateCounterclaims(state.extractedClaims, state.goal, providerFn)

    log.info('Counterclaim search complete', { counterclaims: counterclaims.length })

    return {
      counterclaims,
    }
  }
}

// ----- Routing Functions -----

function routeDialecticalMeta(state: DeepResearchState): 'thesis_generation' | 'gap_analysis' {
  if (state.dialecticalMetaDecision === 'CONTINUE') {
    return 'thesis_generation'
  }
  return 'gap_analysis'
}

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
  graph.addNode('sense_making', createSenseMakingNode(plannerAgent, execContext, researchConfig))

  graph.addNode(
    'search_and_ingest',
    createSearchAndIngestNode(extractionAgent, execContext, apiKeys)
  )

  graph.addNode(
    'claim_extraction',
    createClaimExtractionNode(extractionAgent, execContext, apiKeys, sharedKg)
  )

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
    createCounterclaimNode(extractionAgent, execContext, apiKeys)
  )

  graph.addNode('answer_generation', createAnswerNode(answerAgent, execContext, apiKeys, sharedKg))

  const mode = researchConfig.mode ?? 'full'

  // Linear edges
  graph.addEdge(START, 'sense_making' as typeof START)
  graph.addEdge('sense_making' as typeof START, 'search_and_ingest' as typeof START)

  // Phase 25: Quick mode skips claim extraction and dialectical phases
  graph.addConditionalEdges(
    'search_and_ingest' as typeof START,
    (state: DeepResearchState) => routeAfterSearch(state, mode),
    {
      claim_extraction: 'claim_extraction' as typeof START,
      answer_generation: 'answer_generation' as typeof START,
    }
  )

  // Full mode edges
  graph.addEdge('claim_extraction' as typeof START, 'thesis_generation' as typeof START)
  graph.addEdge('thesis_generation' as typeof START, 'cross_negation' as typeof START)
  graph.addEdge('cross_negation' as typeof START, 'contradiction' as typeof START)
  graph.addEdge('contradiction' as typeof START, 'sublation' as typeof START)
  graph.addEdge('sublation' as typeof START, 'dialectical_meta' as typeof START)

  // Dialectical inner loop: meta → thesis_generation OR gap_analysis
  graph.addConditionalEdges(
    'dialectical_meta' as typeof START,
    (state: DeepResearchState) => routeDialecticalMeta(state),
    {
      thesis_generation: 'thesis_generation' as typeof START,
      gap_analysis: 'gap_analysis' as typeof START,
    }
  )

  // Gap analysis outer loop: gap_analysis → counterclaim_search OR search_and_ingest
  graph.addConditionalEdges(
    'gap_analysis' as typeof START,
    (state: DeepResearchState) => {
      if (
        state.gapAnalysis &&
        shouldContinueGapLoop(state.budget, state.gapAnalysis, researchConfig.maxGapIterations)
      ) {
        return 'search_and_ingest'
      }
      return 'counterclaim_search'
    },
    {
      search_and_ingest: 'search_and_ingest' as typeof START,
      counterclaim_search: 'counterclaim_search' as typeof START,
    }
  )

  // Phase 23: Counterclaim search → answer generation
  graph.addEdge('counterclaim_search' as typeof START, 'answer_generation' as typeof START)

  // Answer generation → END
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
}> {
  const { workflow, researchConfig, runId, userId } = config

  const initialBudget = createRunBudget(researchConfig.maxBudgetUsd, researchConfig.searchDepth)

  // Create a single shared KG instance for the entire run
  const kgSessionId = `deepResearch:${runId}` as DialecticalSessionId
  const sharedKg = new KnowledgeHypergraph(kgSessionId, userId)
  await sharedKg.load()

  const compiledGraph = createDeepResearchGraph(config, sharedKg)

  const initialState: Partial<DeepResearchState> = {
    workflowId: workflow.workflowId,
    runId,
    userId,
    goal,
    context: context ?? {},
    phase: 'sense_making',
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
    finalOutput: null,
    status: 'running',
    error: null,
  }

  const finalState = await compiledGraph.invoke(initialState)

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
  }
}
