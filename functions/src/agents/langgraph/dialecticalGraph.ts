/**
 * Dialectical Workflow Graph
 *
 * Implements the 6-phase Hegelian dialectical reasoning cycle using LangGraph.
 *
 * Phases:
 * 1. Retrieve Context - Query knowledge graph for relevant concepts
 * 2. Generate Theses - Multiple agents generate theses from different lenses
 * 3. Cross Negation - Each thesis is critiqued by other agents
 * 4. Crystallize Contradictions - Identify and classify contradictions
 * 5. Sublate - Generate synthesis that preserves valid elements
 * 6. Meta Reflection - Decide whether to continue, terminate, or respecify
 *
 * The cycle can loop back to retrieve_context based on meta-reflection decision.
 */

import { StateGraph, END, START } from '@langchain/langgraph'
import type { ZodError, ZodTypeAny } from 'zod'
import type {
  AgentConfig,
  Workflow,
  AgentExecutionStep,
  DialecticalWorkflowConfig,
  ThesisOutput,
  NegationOutput,
  ContradictionOutput,
  SublationOutput,
  KGDiff,
  CompactGraph,
  GraphDiff,
  MetaDecision,
  Community,
  Run,
  DialecticalSessionId,
  ClaimId,
  ConceptId,
  EpisodeId,
  ThesisLens,
  WorkflowExecutionMode,
  ModelTier,
  WorkflowCriticality,
} from '@lifeos/agents'
import { asId } from '@lifeos/agents'
import { createFirestoreCheckpointer } from './firestoreCheckpointer.js'
import type { ProviderKeys } from '../providerService.js'
import type { RunEventWriter } from '../runEvents.js'
import type { SearchToolKeys } from '../providerKeys.js'
import { DEFAULT_MODELS } from '../providerKeys.js'
import type { ToolRegistry } from '../toolExecutor.js'
import {
  executeAgentWithEvents,
  handleAskUserInterrupt,
  type AgentExecutionContext,
} from './utils.js'
import { DialecticalStateAnnotation, type DialecticalState } from './stateAnnotations.js'
import { runCompetitiveSynthesis, runSynthesisCrossNegation } from '../sublationEngine.js'
import { runMetaReflection, calculateConceptualVelocity } from '../metaReflection.js'
import { recordMessage } from '../messageStore.js'
import { runSchemaInduction, type SchemaInductionInput } from '../schemaInduction.js'
import { executeRetrievalAgent, type RetrievalContext } from '../retrievalAgent.js'
import { safeParseJson } from '../shared/jsonParser.js'
import { selectBestTemplate, getAttenuatedSteps } from '../optimization/retrievalTemplates.js'
import { KnowledgeHypergraph } from '../knowledgeHypergraph.js'
import {
  ThesisOutputSchema,
  NegationOutputSchema,
  SublationOutputSchema,
  CompactGraphSchema,
  GraphSublationOutputSchema,
  normalizeCompactGraphCandidate,
} from './structuredOutputSchemas.js'
import {
  runContradictionTrackers,
  type ContradictionTrackerContext,
} from '../contradictionTrackers.js'
import { calculateIterationBudget, type IterationBudget } from './iterationBudget.js'
import {
  fetchIterationHistory,
  writeIterationUsageSummary,
  type HistoricalIterationData,
} from './iterationHistory.js'
import {
  analyzeGraphGaps,
  evaluateResearchNeed,
  type GraphGapDirectives,
} from '../deepResearch/graphGapAnalysis.js'
import { executeSearchPlan, ingestSources } from '../deepResearch/sourceIngestion.js'
import {
  extractClaimsFromSourceBatch,
  mapClaimsToKG,
  type ProviderExecuteFn,
} from '../deepResearch/claimExtraction.js'
import {
  createSupportsEdges,
  scanForResearchContradictions,
  mergeNearDuplicateConcepts,
  bridgeCausalChains,
  applyKGDiffToGraph,
} from '../deepResearch/kgEnrichment.js'
import {
  computeSourceQualityScore,
  applyQualityScoresToClaims,
} from '../deepResearch/sourceQuality.js'
import { createRunBudget } from '../deepResearch/budgetController.js'
import { executeWithProvider } from '../providerService.js'
import type { ToolExecutionContext } from '../toolExecutor.js'
import type { RunBudget, SourceRecord, ExtractedClaim } from '@lifeos/agents'
import { checkQuotaSoft } from '../quotaManager.js'
import { checkRunRateLimitSoft } from '../rateLimiter.js'
import { createLogger } from '../../lib/logger.js'
import {
  buildThesisPrompt,
  buildNegationPrompt,
  buildSublationPrompt,
  buildFinalMemoPrompt,
  repairJsonOutput,
  type ResearchEvidence,
} from './dialecticalPrompts.js'
import {
  buildEmptyStartupSeedSummary,
  createFallbackDialecticalGoalFrame,
  normalizeStartupInput,
  parseDialecticalGoalFrame,
} from '../startup/inputNormalizer.js'
import {
  buildStarterCompactGraphFromClaims,
  buildStartupSeedSummary,
} from '../startup/starterGraph.js'

const log = createLogger('DialecticalGraph')

// ----- Types -----

/**
 * Configuration for dialectical graph creation
 */
export interface DialecticalGraphConfig {
  workflow: Workflow
  dialecticalConfig: DialecticalWorkflowConfig
  goalFramer?: AgentConfig
  thesisAgents: AgentConfig[]
  synthesisAgents: AgentConfig[] // Multiple synthesis agents for competitive synthesis
  metaAgent: AgentConfig
  schemaAgent?: AgentConfig // Optional schema induction agent
  apiKeys: ProviderKeys
  userId: string
  runId: string
  eventWriter?: RunEventWriter
  toolRegistry?: ToolRegistry
  searchToolKeys?: SearchToolKeys
  enableCheckpointing?: boolean
  enableCompetitiveSynthesis?: boolean // Enable competitive synthesis with cross-negation
  enableSchemaInduction?: boolean // Enable auto-clustering of concepts
  knowledgeHypergraph?: KnowledgeHypergraph // Optional knowledge graph for retrieval
  sessionId?: DialecticalSessionId // Session ID for KG if not provided
  historicalData?: HistoricalIterationData | null // Historical iteration data for budget learning
  executionMode?: WorkflowExecutionMode
  tierOverride?: ModelTier | null
  workflowCriticality?: WorkflowCriticality
}

// ----- Event and Message Helpers -----

/**
 * Emit a dialectical phase transition event
 */
async function emitPhaseEvent(
  execContext: AgentExecutionContext,
  phase: string,
  cycleNumber: number,
  details?: Record<string, unknown>
): Promise<void> {
  if (!execContext.eventWriter) return

  await execContext.eventWriter.writeEvent({
    type: 'dialectical_phase',
    workflowId: execContext.workflowId,
    status: `phase:${phase}`,
    details: {
      phase,
      cycleNumber,
      ...details,
    },
  })
}

/**
 * Emit a dialectical agent output event and record as a message
 */
async function emitAgentOutput(
  execContext: AgentExecutionContext,
  eventType:
    | 'dialectical_thesis'
    | 'dialectical_negation'
    | 'dialectical_contradiction'
    | 'dialectical_synthesis'
    | 'dialectical_meta'
    | 'dialectical_final_memo',
  agent: AgentConfig,
  output: string,
  details?: Record<string, unknown>
): Promise<void> {
  // Emit event for real-time streaming
  if (execContext.eventWriter) {
    await execContext.eventWriter.writeEvent({
      type: eventType,
      workflowId: execContext.workflowId,
      agentId: agent.agentId,
      agentName: agent.name,
      output,
      details,
    })
  }

  // Record as a message for conversation history
  await recordMessage(
    {
      userId: execContext.userId,
      runId: execContext.runId,
      agentId: agent.agentId,
      role: 'assistant',
      content: formatAgentMessage(eventType, agent.name, output, details),
    },
    { skipPrune: true } // Don't prune during dialectical cycles
  )
}

/**
 * Format an agent message for the conversation view
 */
function formatAgentMessage(
  eventType: string,
  agentName: string,
  output: string,
  details?: Record<string, unknown>
): string {
  const phaseLabel = eventType.replace('dialectical_', '').toUpperCase()
  const lens = details?.lens ? ` (${details.lens})` : ''
  const header = `**[${phaseLabel}] ${agentName}${lens}**\n\n`

  return header + output
}

// ----- Phase Implementations -----

function createInputNormalizerNode(execContext: AgentExecutionContext) {
  return async (state: DialecticalState): Promise<Partial<DialecticalState>> => {
    log.info('Dialectical: Input Normalizer phase')
    await emitPhaseEvent(execContext, 'input_normalizer', state.cycleNumber, { goal: state.goal })

    const normalizedInput = normalizeStartupInput(state.goal, state.context)
    return {
      goal: normalizedInput.normalizedGoal,
      normalizedInput,
      startupSeedSummary: buildEmptyStartupSeedSummary(normalizedInput.sources.length),
    }
  }
}

function createGoalFramingNode(
  framingAgent: AgentConfig,
  execContext: AgentExecutionContext,
  config: DialecticalWorkflowConfig,
  kg: KnowledgeHypergraph | null
) {
  return async (state: DialecticalState): Promise<Partial<DialecticalState>> => {
    const normalizedInput =
      state.normalizedInput ?? normalizeStartupInput(state.goal, state.context)
    log.info('Dialectical: Goal Framing phase', {
      hasContext: normalizedInput.hasContext,
      hasKnowledgeGraph: !!kg,
    })
    await emitPhaseEvent(execContext, 'goal_framing', state.cycleNumber, {
      hasContext: normalizedInput.hasContext,
      hasKnowledgeGraph: !!kg,
    })

    const contextSection = normalizedInput.contextSummary
      ? `\n${normalizedInput.contextSummary}\n`
      : ''

    const prompt = `Frame this dialectical reasoning run and return JSON only.

GOAL: ${state.goal}
${contextSection}
You are preparing a multi-lens dialectical analysis.

Return JSON:
{
  "canonicalGoal": "<normalized goal>",
  "coreQuestion": "<single core question>",
  "subquestions": ["subquestion 1", "subquestion 2"],
  "keyConcepts": ["concept 1", "concept 2"],
  "verificationTargets": ["what must be tested", "what could falsify a thesis"],
  "plannerRationale": "<why this framing is appropriate>",
  "focusAreas": ["areas to prioritize in analysis"],
  "candidateTensions": ["likely contradictions or tensions"],
  "retrievalIntent": {
    "useKnowledgeGraph": ${kg ? 'true' : 'false'},
    "useExternalResearch": ${config.enableExternalResearch ? 'true' : 'false'}
  }
}`

    const step = await executeAgentWithEvents(
      framingAgent,
      prompt,
      {
        goal: state.goal,
        contextSummary: normalizedInput.contextSummary,
        phase: 'goal_framing',
      },
      execContext,
      { stepNumber: state.steps.length + 1, maxIterations: 2 }
    )

    const goalFrame = parseDialecticalGoalFrame(
      step.output,
      createFallbackDialecticalGoalFrame(state.goal, !!kg, !!config.enableExternalResearch)
    )

    return {
      goalFrame,
      context: {
        ...state.context,
        refinedGoal: goalFrame.canonicalGoal,
        focusAreas: goalFrame.focusAreas,
        candidateTensions: goalFrame.candidateTensions,
        verificationTargets: goalFrame.verificationTargets,
        keyConcepts: goalFrame.keyConcepts,
      },
      steps: [step],
      totalTokensUsed: step.tokensUsed,
      totalEstimatedCost: step.estimatedCost,
    }
  }
}

function createContextSeedingNode(
  seedingAgent: AgentConfig,
  execContext: AgentExecutionContext,
  kg: KnowledgeHypergraph | null
) {
  return async (state: DialecticalState): Promise<Partial<DialecticalState>> => {
    const normalizedInput =
      state.normalizedInput ?? normalizeStartupInput(state.goal, state.context)
    const contextSources = normalizedInput.sources
    const contentMap = normalizedInput.contentMap

    if (contextSources.length === 0) {
      log.info('Dialectical: no attached context to seed')
      return {
        startupSeedSummary: buildEmptyStartupSeedSummary(0),
      }
    }

    await emitPhaseEvent(execContext, 'context_seeding', state.cycleNumber, {
      sourceCount: contextSources.length,
    })

    const researchBudget = state.researchBudget ?? createRunBudget(1.0, 'standard')
    const providerFn: ProviderExecuteFn = async (systemPrompt, userPrompt) => {
      const result = await executeWithProvider(
        {
          ...seedingAgent,
          systemPrompt,
        },
        userPrompt,
        undefined,
        execContext.apiKeys
      )
      return result.output ?? ''
    }

    try {
      const effectiveGoal = state.goalFrame?.canonicalGoal ?? state.goal
      const { claims } = await extractClaimsFromSourceBatch(
        contextSources,
        contentMap,
        effectiveGoal,
        providerFn,
        researchBudget,
        Math.min(contextSources.length, 4),
        seedingAgent.modelName
      )

      const seededGraph = buildStarterCompactGraphFromClaims(claims)
      if (kg && claims.length > 0) {
        await mapClaimsToKG(
          claims,
          contextSources,
          kg,
          `dialectical:${state.runId}` as DialecticalSessionId,
          execContext.userId
        )
      }

      return {
        mergedGraph: seededGraph,
        startupSeedSummary: buildStartupSeedSummary(
          contextSources.length,
          claims.length,
          seededGraph.nodes.length,
          seededGraph.edges.length,
          0
        ),
      }
    } catch (error) {
      log.warn('Dialectical context seeding failed; continuing without starter graph', {
        error: error instanceof Error ? error.message : String(error),
      })
      return {
        degradedPhases: ['context_seeding'],
        startupSeedSummary: buildEmptyStartupSeedSummary(contextSources.length),
      }
    }
  }
}

// ----- Reactive Research Nodes (Phase 4) -----

/**
 * Decide whether targeted research is needed at the given position in the cycle.
 * When `enableReactiveResearch` is false, always returns needsResearch: false.
 */
function createDecideResearchNode(
  execContext: AgentExecutionContext,
  config: DialecticalWorkflowConfig,
  position: 'pre_cycle' | 'post_synthesis'
) {
  return async (state: DialecticalState): Promise<Partial<DialecticalState>> => {
    if (!config.enableReactiveResearch) {
      return {
        researchDecision: {
          needsResearch: false,
          searchPlan: null,
          gapTypes: [],
          phase: position,
          intensity: 'none' as const,
          rationale: 'Reactive research disabled',
        },
      }
    }

    const effectiveGoal = (state.context.refinedGoal as string) || state.goal

    const directives: GraphGapDirectives = {
      cycleNumber: state.cycleNumber,
      budget:
        state.researchBudget ??
        createRunBudget(config.researchBudgetUsd ?? 5, config.researchSearchDepth ?? 'standard'),
      focusAreas:
        position === 'pre_cycle' ? (state.context.focusAreas as string[] | undefined) : undefined,
      refinedGoal: effectiveGoal !== state.goal ? effectiveGoal : undefined,
      contradictions: position === 'post_synthesis' ? state.contradictions : undefined,
    }

    const result = evaluateResearchNeed(state.mergedGraph, state.goal, directives, position)

    const decision = result.needsResearch ? 'Research needed' : 'No research needed'
    await recordMessage(
      {
        userId: execContext.userId,
        runId: execContext.runId,
        role: 'system',
        content: `[RESEARCH DECISION] ${decision} (${position}): ${result.rationale}`,
      },
      { skipPrune: true }
    )

    if (execContext.eventWriter) {
      await emitPhaseEvent(execContext, `decide_research_${position}`, state.cycleNumber, {
        needsResearch: result.needsResearch,
        gapTypes: result.gapTypes,
        intensity: result.researchIntensity,
        rationale: result.rationale,
      })
    }

    return {
      researchDecision: {
        needsResearch: result.needsResearch,
        searchPlan: result.searchPlan,
        gapTypes: result.gapTypes,
        phase: position,
        intensity: result.researchIntensity as 'targeted' | 'verification' | 'none',
        rationale: result.rationale,
      },
    }
  }
}

/**
 * Execute targeted research based on the decision from decide_research.
 * No-op if researchDecision.needsResearch is false.
 */
function createExecuteResearchNode(
  execContext: AgentExecutionContext,
  config: DialecticalWorkflowConfig,
  kg: KnowledgeHypergraph | null
) {
  return async (state: DialecticalState): Promise<Partial<DialecticalState>> => {
    if (!state.researchDecision?.needsResearch || !state.researchDecision.searchPlan) {
      return {}
    }

    const searchPlan = state.researchDecision.searchPlan
    const effectiveGoal = (state.context.refinedGoal as string) || state.goal

    if (!execContext.toolRegistry || !execContext.searchToolKeys) {
      throw new Error('Reactive research requires toolRegistry and searchToolKeys')
    }

    let currentBudget =
      state.researchBudget ??
      createRunBudget(config.researchBudgetUsd ?? 5, config.researchSearchDepth ?? 'standard')

    try {
      // Build tool execution context
      const toolContext: ToolExecutionContext = {
        userId: execContext.userId,
        agentId: 'system:dialectical_research',
        workflowId: execContext.workflowId,
        runId: execContext.runId,
        eventWriter: execContext.eventWriter,
        toolRegistry: execContext.toolRegistry,
        searchToolKeys: execContext.searchToolKeys,
        provider: 'openai',
        modelName: 'gpt-4o-mini',
        iteration: 0,
      }

      // Execute search plan
      const { results: searchResults, updatedBudget: budgetAfterSearch } = await executeSearchPlan(
        searchPlan,
        execContext.toolRegistry,
        toolContext,
        currentBudget
      )
      currentBudget = budgetAfterSearch

      log.info(`[ReactiveResearch] Search returned ${searchResults.length} results`)

      let newSources: SourceRecord[] = []
      let newClaims: ExtractedClaim[] = []
      let researchEvidence: ResearchEvidence | null = null

      if (searchResults.length > 0) {
        // Ingest sources
        const keywordRelevanceScorer = async (snippet: string, query: string): Promise<number> => {
          const queryWords = query
            .toLowerCase()
            .split(/\s+/)
            .filter((w) => w.length > 3)
          const snippetLower = snippet.toLowerCase()
          const matches = queryWords.filter((w) => snippetLower.includes(w))
          return queryWords.length > 0 ? matches.length / queryWords.length : 0.5
        }

        const {
          sources,
          contentMap,
          updatedBudget: budgetAfterIngest,
        } = await ingestSources(
          searchResults,
          effectiveGoal,
          execContext.toolRegistry,
          toolContext,
          currentBudget,
          keywordRelevanceScorer
        )
        currentBudget = budgetAfterIngest

        // Apply source quality scores
        for (const source of sources) {
          source.sourceQualityScore = computeSourceQualityScore(source)
        }
        newSources = sources

        // Extract claims
        if (Object.keys(contentMap).length > 0) {
          const providerFn: ProviderExecuteFn = async (systemPrompt, userPrompt) => {
            const result = await executeWithProvider(
              {
                agentId: asId('agent:dialectical_research_extractor'),
                userId: execContext.userId,
                name: 'Research Extractor',
                role: 'researcher',
                systemPrompt,
                modelProvider: 'openai',
                modelName: 'gpt-4o-mini',
                temperature: 0.1,
                archived: false,
                createdAtMs: Date.now(),
                updatedAtMs: Date.now(),
                syncState: 'synced',
                version: 1,
              },
              userPrompt,
              undefined,
              execContext.apiKeys
            )
            return result.output ?? ''
          }

          const { claims, updatedBudget: budgetAfterExtraction } =
            await extractClaimsFromSourceBatch(
              newSources,
              contentMap,
              effectiveGoal,
              providerFn,
              currentBudget,
              3,
              'gpt-4o-mini'
            )
          currentBudget = budgetAfterExtraction

          newClaims = applyQualityScoresToClaims(claims, newSources)
          log.info(
            `[ReactiveResearch] Extracted ${newClaims.length} claims from ${newSources.length} sources`
          )
        }

        // Map reactive research claims to the actual KG
        if (kg && newClaims.length > 0) {
          const sessionId = `dialectical:${state.runId}` as DialecticalSessionId
          const { addedClaimIds, addedConceptIds } = await mapClaimsToKG(
            newClaims,
            newSources,
            kg,
            sessionId,
            execContext.userId
          )
          // Run enrichment passes on newly mapped claims
          const enrichment = config.kgEnrichment
          if (addedClaimIds.length > 0) {
            if (enrichment?.enableSupportsEdges !== false) {
              createSupportsEdges(addedClaimIds, kg)
            }
            if (enrichment?.enableEarlyContradictions !== false) {
              scanForResearchContradictions(addedClaimIds, kg)
            }
          }
          if (addedConceptIds.length > 0 && enrichment?.enableFuzzyConceptMerge !== false) {
            await mergeNearDuplicateConcepts(addedConceptIds, kg)
          }
          if (enrichment?.enableCausalBridging !== false) {
            bridgeCausalChains(kg)
          }
          log.info('[ReactiveResearch] Mapped claims to KG', {
            claimsAdded: addedClaimIds.length,
            conceptsAdded: addedConceptIds.length,
          })
        }

        // Build research evidence
        if (newClaims.length > 0 || newSources.length > 0) {
          researchEvidence = {
            claims: newClaims.slice(0, 15),
            sources: newSources.map((s) => ({
              sourceId: s.sourceId,
              title: s.title,
              url: s.url,
              domain: s.domain,
              qualityScore: s.sourceQualityScore ?? 0.5,
            })),
            gapTypes: state.researchDecision?.gapTypes ?? [],
            searchRationale: state.researchDecision?.rationale ?? '',
          }
        }
      }

      return {
        researchBudget: currentBudget,
        researchSources: newSources,
        researchClaims: newClaims,
        context: { ...state.context, researchEvidence },
      }
    } catch (error) {
      throw new Error(
        `[ReactiveResearch] Execute research failed: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }
}

/**
 * Phase 1: Retrieve Context
 * Query the knowledge graph for relevant concepts, claims, and contradictions.
 * Uses the heuristic retrieval agent with template-based optimization.
 */
function createResearchEnrichmentNode(
  execContext: AgentExecutionContext,
  config: DialecticalWorkflowConfig,
  kg: KnowledgeHypergraph | null
) {
  return async (state: DialecticalState): Promise<Partial<DialecticalState>> => {
    const cycleNumber = state.cycleNumber + 1
    const degradedPhases: string[] = []
    log.info(`Dialectical cycle ${cycleNumber}: Research Enrichment phase`)

    // Mid-cycle quota/rate check — pause instead of crashing
    if (cycleNumber > 1) {
      const quotaHit = await checkQuotaSoft(execContext.userId)
      if (quotaHit) {
        log.info('Quota exceeded mid-cycle, pausing for user decision', {
          cycleNumber,
          ...quotaHit,
        })
        return {
          cycleNumber,
          status: 'waiting_for_input',
          resumeNodeHint: 'research_enrichment',
          constraintPause: {
            constraintType: quotaHit.quotaType,
            currentValue: quotaHit.currentValue,
            limitValue: quotaHit.limitValue,
            unit: quotaHit.unit,
            partialOutput: state.synthesis
              ? `Completed ${cycleNumber - 1} dialectical cycles. Current synthesis has ${state.synthesis.preservedElements?.length ?? 0} preserved elements and ${state.synthesis.newClaims?.length ?? 0} new claims.`
              : `Completed ${cycleNumber - 1} dialectical cycles.`,
            suggestedIncrease:
              quotaHit.unit === 'USD'
                ? quotaHit.limitValue * 2
                : Math.ceil(quotaHit.limitValue * 1.5),
          },
        } as Partial<DialecticalState>
      }
      const rateHit = await checkRunRateLimitSoft(execContext.userId)
      if (rateHit) {
        log.info('Rate limit exceeded mid-cycle, pausing for user decision', {
          cycleNumber,
          ...rateHit,
        })
        return {
          cycleNumber,
          status: 'waiting_for_input',
          resumeNodeHint: 'research_enrichment',
          constraintPause: {
            constraintType: rateHit.limitType,
            currentValue: rateHit.currentValue,
            limitValue: rateHit.limitValue,
            unit: rateHit.unit,
            partialOutput: state.synthesis
              ? `Completed ${cycleNumber - 1} dialectical cycles. Current synthesis has ${state.synthesis.preservedElements?.length ?? 0} preserved elements and ${state.synthesis.newClaims?.length ?? 0} new claims.`
              : `Completed ${cycleNumber - 1} dialectical cycles.`,
            suggestedIncrease: Math.ceil(rateHit.limitValue * 1.5),
          },
        } as Partial<DialecticalState>
      }
    }

    await emitPhaseEvent(execContext, 'research_enrichment', cycleNumber, {
      hasKnowledgeGraph: !!kg,
      hasResearch: !!config.enableExternalResearch,
    })

    const effectiveGoal =
      state.goalFrame?.canonicalGoal || (state.context.refinedGoal as string) || state.goal
    const focusAreas =
      state.goalFrame?.focusAreas || (state.context.focusAreas as string[] | undefined) || []
    const normalizedInput =
      state.normalizedInput ?? normalizeStartupInput(state.goal, state.context)
    const userContextText = normalizedInput.contextSummary

    // === Phase A: Internal KG retrieval (existing behavior, preserved) ===
    let retrievedContext: Record<string, unknown> = {}
    if (kg) {
      try {
        const template = await selectBestTemplate(execContext.userId, {
          workflowType: 'dialectical',
          preferValidated: true,
        })

        let templateConfig: { maxSteps?: number } = {}
        if (template) {
          const attenuatedSteps = getAttenuatedSteps(template, {
            currentCycle: state.cycleNumber,
            maxCycles: config.maxCycles,
            attenuationFactor: 0.3,
          })
          templateConfig = { maxSteps: attenuatedSteps.length }
        }

        const retrievalResult = await executeRetrievalAgent(
          effectiveGoal,
          kg,
          execContext.apiKeys,
          {
            maxSteps: templateConfig.maxSteps ?? 10,
            maxDepth: 3,
            topK: 10,
          }
        )

        retrievedContext = formatRetrievalContext(retrievalResult.context)

        log.info(
          `KG retrieval: ${retrievalResult.context.claims.length} claims, ` +
            `${retrievalResult.context.concepts.length} concepts`
        )
      } catch (error) {
        log.warn('KG retrieval failed; continuing without retrieved context', {
          cycleNumber,
          error: error instanceof Error ? error.message : String(error),
        })
        degradedPhases.push('kg_retrieval')
      }
    }

    // === Phase B: External research (FIX #3, #5, #6) ===
    let researchEvidence: ResearchEvidence | null = null
    let updatedBudget: RunBudget | null = state.researchBudget ?? null
    let newSources: SourceRecord[] = []
    let newClaims: ExtractedClaim[] = []

    if (
      config.enableExternalResearch &&
      !config.enableReactiveResearch &&
      execContext.toolRegistry &&
      execContext.searchToolKeys
    ) {
      // Initialize budget on first cycle
      if (!updatedBudget) {
        updatedBudget = createRunBudget(
          config.researchBudgetUsd ?? 1.0,
          config.researchSearchDepth ?? 'standard'
        )
      }

      // FIX #5: Analyze mergedGraph for research needs (uses contradictions, thin areas, etc.)
      const gapResult = analyzeGraphGaps(state.mergedGraph, state.goal, {
        focusAreas,
        refinedGoal: effectiveGoal !== state.goal ? effectiveGoal : undefined,
        contradictions: state.contradictions,
        cycleNumber,
        budget: updatedBudget,
        contextSummary: userContextText ?? undefined,
      })

      log.info('Graph gap analysis', {
        needsResearch: gapResult.needsResearch,
        gapTypes: gapResult.gapTypes,
        intensity: gapResult.researchIntensity,
      })

      if (gapResult.needsResearch && gapResult.searchPlan) {
        await emitPhaseEvent(execContext, 'research_enrichment', cycleNumber, {
          researchTriggered: true,
          gapTypes: gapResult.gapTypes,
          intensity: gapResult.researchIntensity,
        })

        try {
          // Build tool execution context for search tools
          const toolContext: ToolExecutionContext = {
            userId: execContext.userId,
            agentId: 'system:dialectical_research',
            workflowId: execContext.workflowId,
            runId: execContext.runId,
            eventWriter: execContext.eventWriter,
            toolRegistry: execContext.toolRegistry,
            searchToolKeys: execContext.searchToolKeys,
            provider: 'openai',
            modelName: 'gpt-4o-mini',
            iteration: 0,
          }

          // FIX #3, #6: Execute search using existing infrastructure
          const { results: searchResults, updatedBudget: budgetAfterSearch } =
            await executeSearchPlan(
              gapResult.searchPlan,
              execContext.toolRegistry,
              toolContext,
              updatedBudget
            )
          updatedBudget = budgetAfterSearch

          log.info(`Search returned ${searchResults.length} results`)

          // Ingest top sources (relevance-first)
          if (searchResults.length > 0) {
            const keywordRelevanceScorer = async (
              snippet: string,
              query: string
            ): Promise<number> => {
              const queryWords = query
                .toLowerCase()
                .split(/\s+/)
                .filter((w) => w.length > 3)
              const snippetLower = snippet.toLowerCase()
              const matches = queryWords.filter((w) => snippetLower.includes(w))
              return queryWords.length > 0 ? matches.length / queryWords.length : 0.5
            }

            const {
              sources,
              contentMap,
              updatedBudget: budgetAfterIngest,
            } = await ingestSources(
              searchResults,
              effectiveGoal,
              execContext.toolRegistry,
              toolContext,
              updatedBudget,
              keywordRelevanceScorer
            )
            updatedBudget = budgetAfterIngest

            // Apply source quality scores
            for (const source of sources) {
              source.sourceQualityScore = computeSourceQualityScore(source)
            }
            newSources = sources

            // Extract claims from fetched content
            if (Object.keys(contentMap).length > 0) {
              const providerFn: ProviderExecuteFn = async (systemPrompt, userPrompt) => {
                const result = await executeWithProvider(
                  {
                    agentId: asId('agent:dialectical_research_extractor'),
                    userId: execContext.userId,
                    name: 'Research Extractor',
                    role: 'researcher',
                    systemPrompt,
                    modelProvider: 'openai',
                    modelName: 'gpt-4o-mini',
                    temperature: 0.1,
                    archived: false,
                    createdAtMs: Date.now(),
                    updatedAtMs: Date.now(),
                    syncState: 'synced',
                    version: 1,
                  },
                  userPrompt,
                  undefined,
                  execContext.apiKeys
                )
                return result.output ?? ''
              }

              const { claims, updatedBudget: budgetAfterExtraction } =
                await extractClaimsFromSourceBatch(
                  sources,
                  contentMap,
                  effectiveGoal,
                  providerFn,
                  updatedBudget,
                  3,
                  'gpt-4o-mini'
                )
              updatedBudget = budgetAfterExtraction

              // Quality-weight claims by source authority
              newClaims = applyQualityScoresToClaims(claims, sources)

              log.info(
                `Extracted ${newClaims.length} quality-scored claims from ${sources.length} sources`
              )
            }
          }

          // Build research evidence for thesis/sublation prompt injection (FIX #1)
          if (newClaims.length > 0 || newSources.length > 0) {
            researchEvidence = {
              claims: newClaims.slice(0, 15),
              sources: newSources.map((s) => ({
                sourceId: s.sourceId,
                title: s.title,
                url: s.url,
                domain: s.domain,
                qualityScore: s.sourceQualityScore ?? 0.5,
              })),
              gapTypes: gapResult.gapTypes,
              searchRationale: gapResult.rationale,
            }
          }
        } catch (error) {
          log.warn('External research failed; continuing without external evidence', {
            cycleNumber,
            error: error instanceof Error ? error.message : String(error),
          })
          degradedPhases.push('external_research')
        }
      }
    }

    // Build merged context for downstream phases (FIX #1)
    const mergedContext: Record<string, unknown> = {
      constraintOverride: state.context.constraintOverride,
      originalGoal: state.context.originalGoal,
      refinedGoal: state.context.refinedGoal,
      focusAreas,
      ...retrievedContext,
      researchEvidence,
      userContextText,
    }

    return {
      phase: 'thesis_generation',
      cycleNumber,
      context: mergedContext,
      researchBudget: updatedBudget,
      researchSources: newSources,
      researchClaims: newClaims,
      degradedPhases,
      totalTokensUsed: 0,
      totalEstimatedCost: 0,
    }
  }
}

/**
 * Format retrieval context for state storage
 */
function formatRetrievalContext(context: RetrievalContext): Record<string, unknown> {
  return {
    retrievedClaims: context.claims.map((c) => ({
      claimId: c.claimId,
      text: c.text,
      confidence: c.confidence,
      lens: c.sourceLens,
    })),
    retrievedConcepts: context.concepts.map((c) => ({
      conceptId: c.conceptId,
      name: c.name,
      definition: c.definition,
      type: c.conceptType,
    })),
    retrievedMechanisms: context.mechanisms.map((m) => ({
      mechanismId: m.mechanismId,
      type: m.mechanismType,
      description: m.description,
      participantClaimIds: m.participantClaimIds,
    })),
    retrievedContradictions: context.contradictions.map((c) => ({
      contradictionId: c.contradictionId,
      type: c.type,
      claimIds: c.claimIds,
      severity: c.severity,
    })),
    retrievedRegimes: context.regimes.map((r) => ({
      regimeId: r.regimeId,
      name: r.name,
      conditions: r.conditions,
    })),
  }
}

/**
 * Check model heterogeneity and log warning if all agents use same model
 */
function checkModelHeterogeneity(agents: AgentConfig[]): void {
  if (agents.length <= 1) return

  const models = new Set(agents.map((a) => `${a.modelProvider}:${a.modelName}`))

  if (models.size === 1) {
    const [model] = models
    log.warn(
      `All ${agents.length} thesis agents use the same model (${model}). ` +
        `Consider using different models for more diverse perspectives. ` +
        `Dialectical reasoning benefits from model diversity.`
    )
  } else {
    log.info(`Model heterogeneity: ${models.size} different models across ${agents.length} agents`)
  }
}

/**
 * Phase 2: Generate Theses
 * Multiple agents generate theses from different perspectives (lenses).
 */
function createThesisGenerationNode(
  thesisAgents: AgentConfig[],
  execContext: AgentExecutionContext,
  config: DialecticalWorkflowConfig,
  budget: IterationBudget,
  kg: KnowledgeHypergraph | null = null
) {
  return async (state: DialecticalState): Promise<Partial<DialecticalState>> => {
    log.info(
      `Dialectical cycle ${state.cycleNumber}: Thesis Generation phase with ${thesisAgents.length} agents`
    )

    // Emit phase transition event
    await emitPhaseEvent(execContext, 'thesis_generation', state.cycleNumber, {
      agentCount: thesisAgents.length,
    })

    // Check model heterogeneity on first cycle only
    if (state.cycleNumber === 1) {
      checkModelHeterogeneity(thesisAgents)
    }

    const thesisLenses = thesisAgents.map((_, idx) => config.thesisAgents[idx]?.lens ?? 'custom')
    const hasDuplicateLenses = new Set(thesisLenses).size < thesisLenses.length
    if (hasDuplicateLenses) {
      throw new Error(`Thesis agents have duplicate lenses: ${thesisLenses.join(', ')}`)
    }

    // Execute all thesis agents in parallel
    const thesisPromises = thesisAgents.map(async (agent, idx) => {
      const lensConfig = config.thesisAgents[idx]
      const lens = lensConfig?.lens ?? 'custom'

      // Validate research evidence before injection — avoid leaking empty/stale state
      const rawEvidence = state.context.researchEvidence as ResearchEvidence | null | undefined
      const hasValidEvidence = rawEvidence && rawEvidence.claims?.length > 0
      const evidence = hasValidEvidence ? rawEvidence : null

      const thesisPrompt = buildThesisPrompt(
        state.goal,
        lens,
        state.mergedGraph,
        evidence,
        state.cycleNumber === 1
          ? (state.context.userContextText as string | null | undefined)
          : null
      )

      try {
        const thesisBudget =
          budget.perThesisAgentByLens[lens as ThesisLens] ?? budget.perThesisAgent
        const step = await executeAgentWithEvents(
          agent,
          thesisPrompt,
          {
            cycleNumber: state.cycleNumber,
            lens,
            phase: 'thesis_generation',
            goal: state.goal,
          },
          execContext,
          { stepNumber: state.steps.length + idx + 1, maxIterations: thesisBudget }
        )

        // Parse with 3-layer retry: direct → same-provider → Haiku
        const thesis = await withJsonParseRetry(
          step.output,
          (text) => parseThesisOutput(text, agent.agentId, step.model, lens),
          {
            context: `Thesis (${lens})`,
            jsonSchema:
              '{"nodes":[{"id":"string","label":"string (max 80)","type":"claim|concept|mechanism|prediction","note":"string (optional)","sourceId":"string (optional)","sourceUrl":"string (optional)","sourceConfidence":0.0}],"edges":[{"from":"string","to":"string","rel":"causes|contradicts|supports|mediates|scopes","weight":0.0}],"summary":"string (max 200)","reasoning":"string (max 500)","confidence":0.0,"regime":"string","temporalGrain":"string"}',
            emptyFallback:
              '{"nodes":[],"edges":[],"summary":"Parse failure","reasoning":"","confidence":0,"regime":"unknown","temporalGrain":"unknown"}',
            goal: state.goal,
            baseAgent: agent,
            execContext,
            nodeId: 'thesis_generation',
            stepNumber: state.steps.length + idx + 1,
            runId: state.runId,
            repairSchema: CompactGraphSchema,
            originalTaskPrompt: thesisPrompt,
          }
        )

        // Emit thesis event with all structured fields (null/empty defaults for frontend)
        await emitAgentOutput(execContext, 'dialectical_thesis', agent, step.output, {
          lens,
          cycleNumber: state.cycleNumber,
          confidence: thesis.confidence,
          graph: thesis.graph ?? null,
          conceptGraph: thesis.conceptGraph ?? {},
          causalModel: thesis.causalModel ?? [],
          falsificationCriteria: thesis.falsificationCriteria ?? [],
          decisionImplications: thesis.decisionImplications ?? [],
          unitOfAnalysis: thesis.unitOfAnalysis ?? '',
          temporalGrain: thesis.temporalGrain ?? '',
          regimeAssumptions: thesis.regimeAssumptions ?? [],
        })

        return { step, thesis }
      } catch (error) {
        throw new Error(
          `Thesis agent ${agent.name} failed: ${error instanceof Error ? error.message : String(error)}`
        )
      }
    })

    const results = await Promise.all(thesisPromises)

    const newSteps = results.map((r) => r.step)
    const newTheses = results.map((r) => r.thesis)
    const substantiveTheses = newTheses.filter(isSubstantiveThesis)
    const droppedLenses: string[] = []
    for (const thesis of newTheses) {
      const lens = thesis.lens
      if (!isSubstantiveThesis(thesis)) droppedLenses.push(lens)
    }

    // Check if any agent requested user input
    const interruptedStep = newSteps.find((s) => s.askUserInterrupt)
    if (interruptedStep) {
      const interrupt = handleAskUserInterrupt(interruptedStep, 'thesis_generation')
      if (interrupt) {
        return { steps: newSteps, resumeNodeHint: 'generate_theses', ...interrupt }
      }
    }

    if (droppedLenses.length > 0) {
      log.warn('Dropping non-substantive theses before cross-negation', {
        cycleNumber: state.cycleNumber,
        droppedLenses,
        keptLenses: substantiveTheses.map((thesis) => thesis.lens),
      })
    }

    if (substantiveTheses.length < 2) {
      throw new Error(
        `Thesis generation requires at least 2 substantive theses, got ${substantiveTheses.length}. Non-substantive lenses: ${droppedLenses.join(', ') || 'unknown'}`
      )
    }

    // Build agent-to-KG-claim mapping from thesis graph nodes
    const agentToClaimIds: Record<string, string[]> = {}
    if (kg) {
      const sessionId = `dialectical:${state.runId}` as DialecticalSessionId
      for (const thesis of substantiveTheses) {
        const claimNodes = thesis.graph?.nodes.filter((n) => n.type === 'claim') ?? []
        if (claimNodes.length === 0) continue
        const claimIds: string[] = []
        for (const node of claimNodes) {
          try {
            const kgClaim = await kg.addClaim({
              sessionId,
              userId: execContext.userId,
              text: node.label,
              normalizedText: node.label.toLowerCase().trim().replace(/\s+/g, ' '),
              conceptIds: [],
              claimType: 'ASSERTION',
              confidence: thesis.confidence,
              sourceEpisodeId: `episode:thesis:${state.runId}:${thesis.agentId}` as EpisodeId,
              sourceAgentId: asId<'agent'>(`agent:${thesis.agentId}`),
              sourceLens: thesis.lens as ThesisLens,
            })
            claimIds.push(kgClaim.claimId)
          } catch (err) {
            throw new Error(
              `Failed to add thesis claim to KG for ${node.id}: ${err instanceof Error ? err.message : String(err)}`
            )
          }
        }
        if (claimIds.length > 0) {
          agentToClaimIds[thesis.agentId] = claimIds
        }
      }
      if (Object.keys(agentToClaimIds).length > 0) {
        log.info('Built agent-to-claim mapping', {
          agents: Object.keys(agentToClaimIds).length,
          totalClaims: Object.values(agentToClaimIds).reduce((s, ids) => s + ids.length, 0),
        })
      }
    }

    const totalTokens = newSteps.reduce((sum, s) => sum + s.tokensUsed, 0)
    const totalCost = newSteps.reduce((sum, s) => sum + s.estimatedCost, 0)

    return {
      phase: 'cross_negation',
      theses: substantiveTheses,
      steps: newSteps,
      totalTokensUsed: totalTokens,
      totalEstimatedCost: totalCost,
      agentClaimMapping: agentToClaimIds,
      ...(droppedLenses.length > 0 ? { degradedPhases: ['thesis_generation'] } : {}),
    }
  }
}

/**
 * Phase 3: Cross Negation
 * Each thesis is critiqued by the other agents with determinate negation.
 */
function createCrossNegationNode(
  thesisAgents: AgentConfig[],
  execContext: AgentExecutionContext,
  config: DialecticalWorkflowConfig,
  budget: IterationBudget
) {
  return async (state: DialecticalState): Promise<Partial<DialecticalState>> => {
    log.info(
      `Dialectical cycle ${state.cycleNumber}: Cross Negation phase with ${state.theses.length} theses`
    )

    // Emit phase transition event
    await emitPhaseEvent(execContext, 'cross_negation', state.cycleNumber, {
      thesisCount: state.theses.length,
    })

    if (!config.enableCrossNegation || state.theses.length < 2) {
      const reason = !config.enableCrossNegation
        ? 'Cross-negation disabled in workflow config'
        : `Only ${state.theses.length} thesis(es) available, need at least 2`
      log.warn(`Skipping cross-negation: ${reason}`)

      await emitPhaseEvent(execContext, 'cross_negation', state.cycleNumber, {
        skipped: true,
        reason,
      })

      return {
        phase: 'contradiction_crystallization',
        totalTokensUsed: 0,
        totalEstimatedCost: 0,
      }
    }

    const negationPromises: Promise<{
      step: AgentExecutionStep
      negation: NegationOutput
    }>[] = []

    // Build negation pairs: all-pairs when enabled, round-robin otherwise
    const useAllPairs = config.enableAllPairsNegation === true
    const pairs: Array<{ agentIdx: number; targetIdx: number }> = []

    if (useAllPairs) {
      // All-pairs: each thesis critiques every other thesis
      for (let i = 0; i < state.theses.length; i++) {
        for (let j = 0; j < state.theses.length; j++) {
          if (i !== j) pairs.push({ agentIdx: i, targetIdx: j })
        }
      }
      // Cap total negations if configured
      const maxNegations = config.maxNegationsPerCycle ?? pairs.length
      if (pairs.length > maxNegations) {
        // Shuffle and truncate to cap — ensures diverse pairings
        for (let k = pairs.length - 1; k > 0; k--) {
          const r = Math.floor(Math.random() * (k + 1))
          ;[pairs[k], pairs[r]] = [pairs[r], pairs[k]]
        }
        pairs.length = maxNegations
      }
    } else {
      // Round-robin: each agent critiques the next thesis
      for (let i = 0; i < thesisAgents.length && i < state.theses.length; i++) {
        const targetIdx = (i + 1) % state.theses.length
        pairs.push({ agentIdx: i, targetIdx })
      }
    }

    // Each agent critiques assigned target theses
    let executedPairCount = 0
    for (let pairIdx = 0; pairIdx < pairs.length; pairIdx++) {
      const { agentIdx, targetIdx } = pairs[pairIdx]
      const agent = thesisAgents[agentIdx % thesisAgents.length]
      const thesis = state.theses[agentIdx]
      const targetThesis = state.theses[targetIdx]
      if (!agent || !thesis || !targetThesis) continue
      const sourceLens = thesis.lens
      const targetLens = targetThesis.lens
      if (!isSubstantiveThesis(thesis)) {
        log.warn('Skipping negation pair due to non-substantive source thesis', {
          cycleNumber: state.cycleNumber,
          sourceLens,
        })
        continue
      }

      if (!isSubstantiveThesis(targetThesis)) {
        log.warn('Skipping negation pair due to non-substantive target thesis', {
          cycleNumber: state.cycleNumber,
          sourceLens,
          targetLens,
        })
        continue
      }

      const negationPrompt = buildNegationPrompt(thesis, targetThesis)
      const pairStepNumber = state.steps.length + executedPairCount + 1
      executedPairCount++

      negationPromises.push(
        (async () => {
          try {
            const step = await executeAgentWithEvents(
              agent,
              negationPrompt,
              {
                cycleNumber: state.cycleNumber,
                phase: 'cross_negation',
              },
              execContext,
              {
                stepNumber: pairStepNumber,
                maxIterations: budget.perNegationAgent,
              }
            )

            const negation = await withJsonParseRetry(
              step.output,
              (text) => parseNegationOutput(text, agent.agentId, targetThesis.agentId),
              {
                context: 'Negation',
                jsonSchema:
                  '{"internalTensions":["string"],"categoryAttacks":["string"],"preservedValid":["string"],"rivalFraming":"string","rewriteOperator":"SPLIT|MERGE|REVERSE_EDGE|ADD_MEDIATOR|SCOPE_TO_REGIME|TEMPORALIZE","operatorArgs":{}}',
                emptyFallback:
                  '{"internalTensions":[],"categoryAttacks":[],"preservedValid":[],"rivalFraming":"","rewriteOperator":"SPLIT","operatorArgs":{}}',
                goal: state.goal,
                baseAgent: agent,
                execContext,
                nodeId: 'cross_negation',
                stepNumber: pairStepNumber,
                runId: state.runId,
                repairSchema: NegationOutputSchema,
                originalTaskPrompt: negationPrompt,
              }
            )

            // Emit negation event and record message
            await emitAgentOutput(execContext, 'dialectical_negation', agent, step.output, {
              targetThesisLens: targetThesis.lens,
              cycleNumber: state.cycleNumber,
              rewriteOperator: negation.rewriteOperator,
            })

            return { step, negation }
          } catch (error) {
            throw new Error(
              `Negation by ${agent.name} failed: ${error instanceof Error ? error.message : String(error)}`
            )
          }
        })()
      )
    }

    const settled = await Promise.allSettled(negationPromises)
    const results = settled
      .filter(
        (
          result
        ): result is PromiseFulfilledResult<{
          step: AgentExecutionStep
          negation: NegationOutput
        }> => result.status === 'fulfilled'
      )
      .map((result) => result.value)

    const newSteps = results.map((r) => r.step)
    const newNegations = results.map((r) => r.negation)

    // Check if any negation agent requested user input
    const interruptedNegStep = newSteps.find((s) => s.askUserInterrupt)
    if (interruptedNegStep) {
      const interrupt = handleAskUserInterrupt(interruptedNegStep, 'cross_negation')
      if (interrupt) {
        return { steps: newSteps, resumeNodeHint: 'cross_negation', ...interrupt }
      }
    }

    if (newNegations.length === 0) {
      log.warn('Cross-negation produced zero negations, continuing in degraded mode', {
        cycleNumber: state.cycleNumber,
        thesisCount: state.theses.length,
      })
      return {
        phase: 'contradiction_crystallization',
        negations: [],
        degradedPhases: ['cross_negation'],
      }
    }

    const totalTokens = newSteps.reduce((sum, s) => sum + s.tokensUsed, 0)
    const totalCost = newSteps.reduce((sum, s) => sum + s.estimatedCost, 0)

    return {
      phase: 'contradiction_crystallization',
      negations: newNegations,
      steps: newSteps,
      totalTokensUsed: totalTokens,
      totalEstimatedCost: totalCost,
    }
  }
}

/**
 * Phase 4: Crystallize Contradictions
 * Identify, classify, and score contradictions from theses and negations.
 */
function createContradictionCrystallizationNode(
  execContext: AgentExecutionContext,
  config: DialecticalWorkflowConfig,
  kg: KnowledgeHypergraph | null = null
) {
  return async (state: DialecticalState): Promise<Partial<DialecticalState>> => {
    log.info(`Dialectical cycle ${state.cycleNumber}: Contradiction Crystallization phase`)

    // Emit phase transition event
    await emitPhaseEvent(execContext, 'contradiction_crystallization', state.cycleNumber, {
      thesisCount: state.theses.length,
      negationCount: state.negations.length,
    })

    if (state.negations.length === 0) {
      throw new Error('Contradiction crystallization requires negations')
    }

    // Build tracker context for specialized contradiction detection
    const trackerContext: ContradictionTrackerContext = {
      sessionId: state.runId,
      userId: execContext.userId,
      cycleNumber: state.cycleNumber,
      apiKeys: execContext.apiKeys,
    }

    // Extract contradictions from theses and negations using 4 specialized trackers
    const contradictions = extractContradictions(
      state.theses,
      state.negations,
      config,
      trackerContext,
      state.agentClaimMapping
    )

    // Filter by action distance if configured
    let filteredContradictions =
      config.minActionDistance > 0
        ? contradictions.filter((c) => c.actionDistance <= config.minActionDistance)
        : contradictions

    // Phase 27: Filter by severity for progressive deepening
    if (config.contradictionSeverityFilter && config.contradictionSeverityFilter !== 'ALL') {
      const severityOrder = { HIGH: 3, MEDIUM: 2, LOW: 1 }
      const threshold = severityOrder[config.contradictionSeverityFilter] ?? 0
      filteredContradictions = filteredContradictions.filter((c) => {
        const sev = (c.severity ?? '').toUpperCase()
        return (severityOrder[sev as keyof typeof severityOrder] ?? 0) >= threshold
      })
    }

    log.info(
      `Found ${contradictions.length} contradictions, ${filteredContradictions.length} within action distance`
    )

    // Emit contradiction events
    if (execContext.eventWriter && filteredContradictions.length > 0) {
      await execContext.eventWriter.writeEvent({
        type: 'dialectical_contradiction',
        workflowId: execContext.workflowId,
        details: {
          cycleNumber: state.cycleNumber,
          totalContradictions: contradictions.length,
          filteredContradictions: filteredContradictions.length,
          contradictions: filteredContradictions.map((c) => ({
            id: c.id,
            type: c.type,
            severity: c.severity,
            description: c.description,
            actionDistance: c.actionDistance,
          })),
        },
      })

      // Record contradiction summary as a message
      const summaryContent = formatContradictionSummary(filteredContradictions)
      await recordMessage(
        {
          userId: execContext.userId,
          runId: execContext.runId,
          role: 'assistant',
          content: summaryContent,
        },
        { skipPrune: true }
      )
    }

    // Persist contradictions to KnowledgeHypergraph
    if (kg && filteredContradictions.length > 0) {
      const sessionId = `dialectical:${state.runId}` as DialecticalSessionId
      let persisted = 0
      for (const c of filteredContradictions) {
        try {
          // participatingClaims should contain KG claim IDs (via agentClaimMapping).
          // Attempt to resolve them; skip persistence if no valid claim IDs found.
          const claimIds = c.participatingClaims
            .map((pc) => (pc.startsWith('claim_') ? pc : `claim:${pc}`) as ClaimId)
            .filter((cid) => kg.getNode(cid) !== undefined)

          if (claimIds.length === 0) {
            throw new Error(
              `Contradiction ${c.id} has no matching KG claims: ${c.participatingClaims.join(', ')}`
            )
          }

          await kg.addContradiction({
            sessionId,
            userId: execContext.userId,
            type: c.type as 'SYNCHRONIC' | 'DIACHRONIC' | 'REGIME_SHIFT',
            severity: c.severity as 'HIGH' | 'MEDIUM' | 'LOW',
            trackerType: c.trackerAgent as 'LOGIC' | 'PRAGMATIC' | 'SEMANTIC' | 'BOUNDARY',
            description: c.description,
            detailedAnalysis: c.description,
            claimIds,
            actionDistance: c.actionDistance,
            discoveredInCycle: state.cycleNumber,
            discoveredByAgentId: asId<'agent'>(`agent:${c.trackerAgent}`),
          })
          persisted++
        } catch (err) {
          throw new Error(
            `Failed to persist contradiction ${c.id} to KG: ${err instanceof Error ? err.message : String(err)}`
          )
        }
      }
      if (persisted > 0) {
        log.info('Persisted contradictions to KG', {
          persisted,
          total: filteredContradictions.length,
        })
      }
    }

    // Calculate contradiction density for this cycle
    // Count actual claims from thesis graphs (not just thesis count)
    const totalClaims = state.theses.reduce((sum, t) => {
      return sum + (t.graph?.nodes.length ?? Math.max(Object.keys(t.conceptGraph).length, 1))
    }, 0)
    const density = totalClaims > 0 ? filteredContradictions.length / totalClaims : 0

    return {
      phase: 'sublation',
      contradictions: filteredContradictions,
      contradictionDensity: density,
      densityHistory: [density],
      totalTokensUsed: 0,
      totalEstimatedCost: 0,
    }
  }
}

/**
 * Format contradiction summary for message display
 */
function formatContradictionSummary(contradictions: ContradictionOutput[]): string {
  const header = `**[CONTRADICTIONS] Crystallization Results**\n\n`
  const summary = `Found **${contradictions.length}** contradictions:\n\n`

  const details = contradictions
    .slice(0, 5) // Show top 5
    .map((c, idx) => `${idx + 1}. **${c.severity}** (${c.type}): ${c.description}`)
    .join('\n')

  const footer = contradictions.length > 5 ? `\n\n... and ${contradictions.length - 5} more` : ''

  return header + summary + details + footer
}

/**
 * Phase 5: Sublation
 * Generate a synthesis that preserves valid elements while resolving contradictions.
 * Supports competitive synthesis with multiple agents and cross-negation.
 */
function createSublationNode(
  synthesisAgents: AgentConfig[],
  execContext: AgentExecutionContext,
  config: DialecticalWorkflowConfig,
  enableCompetitive: boolean,
  budget: IterationBudget,
  kg: KnowledgeHypergraph | null = null
) {
  return async (state: DialecticalState): Promise<Partial<DialecticalState>> => {
    log.info(`Dialectical cycle ${state.cycleNumber}: Sublation phase`)

    // Emit phase transition event
    await emitPhaseEvent(execContext, 'sublation', state.cycleNumber, {
      contradictionCount: state.contradictions.length,
      synthesisAgentCount: synthesisAgents.length,
      competitive: enableCompetitive && synthesisAgents.length > 1,
    })

    if (state.contradictions.length === 0) {
      throw new Error('Sublation requires at least one contradiction')
    }

    log.info('Sublation checkpoint: post-warning', {
      competitive: enableCompetitive,
      synthesisAgentCount: synthesisAgents.length,
      thesesCount: state.theses.length,
      negationsCount: state.negations.length,
      stepsCount: state.steps.length,
      cycleNumber: state.cycleNumber,
    })

    // Use competitive synthesis if enabled and multiple agents available
    if (enableCompetitive && synthesisAgents.length > 1) {
      log.info('Sublation: entering competitive path')
      return runCompetitiveSublation(state, synthesisAgents, execContext, config, kg)
    }

    // Fall back to single-agent synthesis
    const synthesisAgent = synthesisAgents[0]
    log.info('Sublation: single-agent path', {
      agentName: synthesisAgent.name,
      agentId: synthesisAgent.agentId,
      provider: synthesisAgent.modelProvider,
      model: synthesisAgent.modelName,
      hasTools: (synthesisAgent.toolIds?.length ?? 0) > 0,
    })

    const sublationPrompt = buildSublationPrompt(
      state.theses,
      state.negations,
      state.contradictions,
      state.mergedGraph,
      state.cycleNumber,
      state.context.researchEvidence as ResearchEvidence | null | undefined,
      state.cycleNumber === 1 ? (state.context.userContextText as string | null | undefined) : null
    )
    log.info('Sublation prompt built', {
      promptLength: sublationPrompt.length,
      stepNumber: state.steps.length + 1,
      budgetPerSynthesis: budget.perSynthesisAgent,
    })

    // Wrap in timeout to prevent indefinite hangs (e.g. Firestore/API connection issues)
    const SUBLATION_TIMEOUT_MS = 180_000 // 3 minutes
    let step: AgentExecutionStep
    let sublationTimer: ReturnType<typeof setTimeout> | undefined
    try {
      step = await Promise.race([
        executeAgentWithEvents(
          synthesisAgent,
          sublationPrompt,
          {
            cycleNumber: state.cycleNumber,
            phase: 'sublation',
          },
          execContext,
          { stepNumber: state.steps.length + 1, maxIterations: budget.perSynthesisAgent }
        ),
        new Promise<never>((_, reject) => {
          sublationTimer = setTimeout(
            () => reject(new Error('Sublation agent timed out after 180s')),
            SUBLATION_TIMEOUT_MS
          )
        }),
      ])
      clearTimeout(sublationTimer)
    } catch (error) {
      clearTimeout(sublationTimer)
      const msg = error instanceof Error ? error.message : String(error)
      log.warn('Sublation agent execution failed, continuing in degraded mode', {
        error: msg,
        cycleNumber: state.cycleNumber,
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
          incompleteReason: `Sublation degraded: ${msg}`,
        },
        mergedGraph: state.mergedGraph,
        kgDiff: null,
        conceptualVelocity: 0,
        velocityHistory: [0],
        degradedPhases: ['sublation'],
      }
    }

    // Check if sublation agent requested user input
    const sublationInterrupt = handleAskUserInterrupt(step, 'sublation')
    if (sublationInterrupt) {
      return { steps: [step], resumeNodeHint: 'sublate', ...sublationInterrupt }
    }

    const {
      synthesis,
      mergedGraph: newMergedGraph,
      graphDiff,
    } = await withJsonParseRetry(step.output, (text) => parseSublationOutput(text), {
      context: 'Sublation',
      jsonSchema:
        '{"mergedGraph":{"nodes":[{"id":"string","label":"string (max 80)","type":"claim|concept|mechanism|prediction","note":"string (optional)"}],"edges":[{"from":"string","to":"string","rel":"causes|contradicts|supports|mediates|scopes","weight":0.0}],"summary":"string (max 200)","reasoning":"string (max 500)","confidence":0.0,"regime":"string","temporalGrain":"string"},"diff":{"addedNodes":[],"removedNodes":[],"addedEdges":[],"removedEdges":[],"modifiedNodes":[],"resolvedContradictions":[],"newContradictions":[]},"resolvedContradictions":[]}',
      emptyFallback:
        '{"mergedGraph":{"nodes":[],"edges":[],"summary":"Parse failure","reasoning":"","confidence":0,"regime":"unknown","temporalGrain":"unknown"},"diff":{"addedNodes":[],"removedNodes":[],"addedEdges":[],"removedEdges":[],"modifiedNodes":[],"resolvedContradictions":[],"newContradictions":[]},"resolvedContradictions":[]}',
      goal: state.goal,
      baseAgent: synthesisAgent,
      execContext,
      nodeId: 'sublation',
      stepNumber: state.steps.length + 1,
      runId: state.runId,
      repairSchema: GraphSublationOutputSchema,
      originalTaskPrompt: sublationPrompt,
    })

    // Emit synthesis event and record message
    await emitAgentOutput(execContext, 'dialectical_synthesis', synthesisAgent, step.output, {
      cycleNumber: state.cycleNumber,
      operatorCount: synthesis.operators.length,
      preservedCount: synthesis.preservedElements.length,
      negatedCount: synthesis.negatedElements.length,
      incompleteReason: synthesis.incompleteReason,
      hasGraph: !!newMergedGraph,
      mergedGraph: newMergedGraph ?? undefined,
      graphDiff: graphDiff ?? undefined,
    })

    // Derive KG diff from synthesis operators (or graphDiff when graph format)
    const kgDiff = deriveKGDiff(synthesis, state.contradictions, graphDiff)

    // Apply KGDiff to actual KnowledgeHypergraph
    if (kg && kgDiff) {
      try {
        const sessionId = `dialectical:${state.runId}` as DialecticalSessionId
        const { applied } = await applyKGDiffToGraph(kgDiff, kg, sessionId, execContext.userId)
        log.info('Applied KGDiff to graph (single-agent sublation)', applied)
      } catch (err) {
        throw new Error(
          `Failed to apply KGDiff to graph: ${err instanceof Error ? err.message : String(err)}`
        )
      }
    }

    // Calculate conceptual velocity using the unified function from metaReflection
    const velocity = calculateConceptualVelocity(synthesis, kgDiff, state.theses)

    // Build graph history entry if we have a diff
    const graphHistoryEntry = graphDiff ? [{ cycle: state.cycleNumber, diff: graphDiff }] : []

    return {
      phase: 'meta_reflection',
      synthesis,
      mergedGraph: newMergedGraph ?? state.mergedGraph,
      graphHistory: graphHistoryEntry,
      kgDiff,
      conceptualVelocity: velocity,
      velocityHistory: [velocity],
      steps: [step],
      totalTokensUsed: step.tokensUsed,
      totalEstimatedCost: step.estimatedCost,
    }
  }
}

/**
 * Run competitive synthesis with multiple agents
 */
async function runCompetitiveSublation(
  state: DialecticalState,
  synthesisAgents: AgentConfig[],
  execContext: AgentExecutionContext,
  config: DialecticalWorkflowConfig,
  kg: KnowledgeHypergraph | null = null
): Promise<Partial<DialecticalState>> {
  log.info(`Running competitive synthesis with ${synthesisAgents.length} agents`)

  // Phase 1: Generate synthesis candidates
  const competitiveResult = await runCompetitiveSynthesis(
    state.theses,
    state.negations,
    state.contradictions,
    synthesisAgents,
    execContext,
    config,
    state.cycleNumber,
    state.steps.length
  )

  // Phase 2: Cross-negation of syntheses (if enabled and multiple candidates)
  let finalSyntheses = competitiveResult.candidates
  let crossNegationSteps: AgentExecutionStep[] = []

  if (competitiveResult.candidates.length >= 2) {
    const crossNegationResult = await runSynthesisCrossNegation(
      competitiveResult.candidates,
      state.theses,
      state.contradictions,
      synthesisAgents,
      execContext,
      state.cycleNumber,
      state.steps.length + competitiveResult.steps.length
    )

    finalSyntheses = crossNegationResult.refinedSyntheses
    crossNegationSteps = crossNegationResult.steps
  }

  // Select winner (highest scored after refinement)
  const winner = finalSyntheses[0]
  const synthesis = winner.synthesis

  const allSteps = [...competitiveResult.steps, ...crossNegationSteps]
  const totalTokensUsed = allSteps.reduce((sum, s) => sum + s.tokensUsed, 0)
  const totalEstimatedCost = allSteps.reduce((sum, s) => sum + s.estimatedCost, 0)

  log.info(
    `Competitive synthesis complete. Winner: ${winner.agentName} (score: ${winner.scores.total.toFixed(3)})`
  )

  // Try to extract mergedGraph from winner's raw output (competitive candidates
  // may have produced graph-format sublation). Fall back to state's existing graph.
  let competitiveMergedGraph: CompactGraph | null = state.mergedGraph
  let competitiveGraphDiff: GraphDiff | null = null
  if (winner.rawText) {
    try {
      const parsed = parseSublationOutput(winner.rawText)
      if (parsed.mergedGraph) {
        competitiveMergedGraph = parsed.mergedGraph
        competitiveGraphDiff = parsed.graphDiff
      }
    } catch (error) {
      log.warn('Competitive synthesis winner graph parse failed, preserving prior merged graph', {
        runId: state.runId,
        cycleNumber: state.cycleNumber,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  // Derive KG diff from winning synthesis (uses graphDiff when graph format)
  const kgDiff = deriveKGDiff(synthesis, state.contradictions, competitiveGraphDiff)

  // Apply KGDiff to actual KnowledgeHypergraph
  if (kg && kgDiff) {
    try {
      const sessionId = `dialectical:${state.runId}` as DialecticalSessionId
      const { applied } = await applyKGDiffToGraph(kgDiff, kg, sessionId, execContext.userId)
      log.info('Applied KGDiff to graph (competitive sublation)', applied)
    } catch (err) {
      throw new Error(
        `Failed to apply KGDiff to graph: ${err instanceof Error ? err.message : String(err)}`
      )
    }
  }

  // Calculate velocity from winning synthesis using unified function
  const velocity = calculateConceptualVelocity(synthesis, kgDiff, state.theses)

  // Emit synthesis event for live visualization (matches single-agent path)
  const winnerAgent =
    synthesisAgents.find((a) => a.agentId === winner.agentId) ?? synthesisAgents[0]
  await emitAgentOutput(execContext, 'dialectical_synthesis', winnerAgent, winner.rawText ?? '', {
    cycleNumber: state.cycleNumber,
    hasGraph: !!competitiveMergedGraph,
    mergedGraph: competitiveMergedGraph ?? undefined,
    graphDiff: competitiveGraphDiff ?? undefined,
  })

  const graphHistoryEntry = competitiveGraphDiff
    ? [{ cycle: state.cycleNumber, diff: competitiveGraphDiff }]
    : []

  return {
    phase: 'meta_reflection',
    synthesis,
    mergedGraph: competitiveMergedGraph,
    graphHistory: graphHistoryEntry,
    kgDiff,
    conceptualVelocity: velocity,
    velocityHistory: [velocity],
    steps: allSteps,
    totalTokensUsed,
    totalEstimatedCost,
  }
}

/**
 * Phase 6: Meta Reflection
 * Decide whether to continue the cycle, terminate, or respecify the goal.
 * Uses enhanced meta-reflection with comprehensive metrics tracking.
 */
function createMetaReflectionNode(
  metaAgent: AgentConfig,
  schemaAgent: AgentConfig | undefined,
  execContext: AgentExecutionContext,
  config: DialecticalWorkflowConfig,
  enableSchemaInduction: boolean,
  _budget: IterationBudget
) {
  return async (state: DialecticalState): Promise<Partial<DialecticalState>> => {
    log.info(`Dialectical cycle ${state.cycleNumber}: Meta Reflection phase`)

    // Emit phase transition event
    await emitPhaseEvent(execContext, 'meta_reflection', state.cycleNumber, {
      conceptualVelocity: state.conceptualVelocity,
      synthesisOperators: state.synthesis?.operators.length ?? 0,
    })

    // Calculate tokens/cost for this cycle from recent steps
    const tokensThisCycle = state.steps.reduce((sum, s) => sum + s.tokensUsed, 0)
    const costThisCycle = state.steps.reduce((sum, s) => sum + s.estimatedCost, 0)

    // Run schema induction if enabled
    let communities: Community[] = []
    let schemaSteps: AgentExecutionStep[] = []

    if (enableSchemaInduction && schemaAgent) {
      const schemaInput: SchemaInductionInput = {
        sessionId: asId<'dialecticalSession'>(`dialecticalSession:${state.runId}`),
        userId: state.userId,
        cycleNumber: state.cycleNumber,
        concepts: extractConceptsFromTheses(state.theses),
        claims: extractClaimsFromTheses(state.theses),
        mechanisms: [],
        synthesis: state.synthesis,
        // BUG(MEDIUM): communities not persisted in DialecticalState — always [] here.
        // To enable incremental schema building, add a communities field to the state annotation.
        previousCommunities: communities,
      }

      try {
        const schemaResult = await runSchemaInduction(
          schemaInput,
          schemaAgent,
          execContext,
          config,
          state.steps.length
        )
        communities = schemaResult.communities
        schemaSteps = [schemaResult.step]
        log.info(`Schema induction found ${communities.length} communities`)
      } catch (error) {
        throw new Error(
          `Schema induction failed: ${error instanceof Error ? error.message : String(error)}`
        )
      }
    }

    // Gather prior meta decisions for context continuity
    const previousDecisions =
      (state.context.metaDecisionHistory as Array<{
        cycle: number
        decision: MetaDecision
        reasoning: string
        focusAreas?: string[]
      }>) ?? []

    // Run enhanced meta-reflection using state's accumulated metrics history
    const metaResult = await runMetaReflection(
      {
        cycleNumber: state.cycleNumber,
        goal: state.goal,
        context: state.context,
        theses: state.theses,
        negations: state.negations,
        contradictions: state.contradictions,
        synthesis: state.synthesis,
        communities,
        kgDiff: state.kgDiff ?? null,
        mergedGraph: state.mergedGraph ?? null,
        latestGraphDiff:
          state.graphHistory.length > 0
            ? state.graphHistory[state.graphHistory.length - 1].diff
            : null,
        previousMetrics: state.cycleMetricsHistory,
        previousDecisions,
        tokensUsedThisCycle: tokensThisCycle,
        costThisCycle,
      },
      metaAgent,
      execContext,
      config,
      state.steps.length + schemaSteps.length
    )

    const allSteps = [...schemaSteps, metaResult.step]
    const totalTokensUsed = allSteps.reduce((sum, s) => sum + s.tokensUsed, 0)
    const totalEstimatedCost = allSteps.reduce((sum, s) => sum + s.estimatedCost, 0)

    // Log any warnings
    for (const warning of metaResult.warnings) {
      log.warn(`Meta-reflection warning: ${warning}`)
    }

    // Emit meta decision event and record message
    await emitAgentOutput(execContext, 'dialectical_meta', metaAgent, metaResult.step.output, {
      cycleNumber: state.cycleNumber,
      decision: metaResult.decision,
      conceptualVelocity: state.conceptualVelocity,
      refinedGoal: metaResult.refinedGoal,
    })

    if (metaResult.decision === 'TERMINATE') {
      // Check if termination is due to max cycles constraint
      const isMaxCyclesHit = metaResult.reasoning?.includes('Maximum cycles')
      const constraintOverride = state.context.constraintOverride as
        | { type: string; newLimit?: number }
        | undefined

      if (isMaxCyclesHit) {
        // Check if user already increased the limit
        const effectiveMax =
          constraintOverride?.type === 'max_cycles' && constraintOverride.newLimit
            ? constraintOverride.newLimit
            : config.maxCycles

        if (state.cycleNumber >= effectiveMax) {
          // Pause and ask user instead of terminating
          log.info('Max cycles constraint reached, pausing for user decision', {
            cycles: state.cycleNumber,
            maxCycles: effectiveMax,
          })
          return {
            metaDecision: metaResult.decision,
            cycleMetricsHistory: [metaResult.metrics],
            status: 'waiting_for_input',
            resumeNodeHint: 'meta_reflect',
            constraintPause: {
              constraintType: 'max_cycles',
              currentValue: state.cycleNumber,
              limitValue: effectiveMax,
              unit: 'cycles',
              partialOutput: state.synthesis
                ? `Completed ${state.cycleNumber} dialectical cycles. Current synthesis has ${state.synthesis.preservedElements?.length ?? 0} preserved elements and ${state.synthesis.newClaims?.length ?? 0} new claims.`
                : `Completed ${state.cycleNumber} dialectical cycles.`,
              suggestedIncrease: effectiveMax + 3,
            },
            steps: allSteps,
            totalTokensUsed,
            totalEstimatedCost,
          }
        }
        // User increased limit and we're still under — continue instead of terminating
        return {
          metaDecision: 'CONTINUE' as MetaDecision,
          cycleMetricsHistory: [metaResult.metrics],
          steps: allSteps,
          totalTokensUsed,
          totalEstimatedCost,
        }
      }

      // Non-constraint termination (velocity threshold, convergence, etc.)
      // final_memo node will generate the LLM summary and set status: 'completed'
      return {
        metaDecision: metaResult.decision,
        cycleMetricsHistory: [metaResult.metrics],
        steps: allSteps,
        totalTokensUsed,
        totalEstimatedCost,
      }
    }

    // Handle CONTINUE/RESPECIFY — persist focusAreas, refinedGoal, and decision history for next cycle
    const updatedContext: Record<string, unknown> = {
      ...state.context,
      // Persist focusAreas from meta-reflection for retrieve_context
      focusAreas: metaResult.focusAreas ?? state.context.focusAreas,
      // Accumulate meta decision history for context continuity
      metaDecisionHistory: [
        ...previousDecisions,
        {
          cycle: state.cycleNumber,
          decision: metaResult.decision,
          reasoning: metaResult.reasoning,
          focusAreas: metaResult.focusAreas,
        },
      ],
    }
    if (metaResult.decision === 'RESPECIFY' && metaResult.refinedGoal) {
      updatedContext.originalGoal = state.goal
      updatedContext.refinedGoal = metaResult.refinedGoal
    }

    return {
      metaDecision: metaResult.decision,
      cycleMetricsHistory: [metaResult.metrics],
      context: updatedContext,
      steps: allSteps,
      totalTokensUsed,
      totalEstimatedCost,
    }
  }
}

/**
 * Extract concept summaries from theses for schema induction
 */
function extractConceptsFromTheses(theses: ThesisOutput[]) {
  const concepts: {
    conceptId: ConceptId
    name: string
    definition: string
    type: string
    relatedConcepts: string[]
  }[] = []
  const seen = new Set<string>()

  for (const thesis of theses) {
    for (const [name, related] of Object.entries(thesis.conceptGraph)) {
      if (!seen.has(name.toLowerCase())) {
        seen.add(name.toLowerCase())
        concepts.push({
          conceptId: asId<'concept'>(`concept:${name.toLowerCase().replace(/\s+/g, '_')}`),
          name,
          definition: `Concept from ${thesis.lens} perspective`,
          type: 'ENTITY',
          relatedConcepts: Array.isArray(related) ? related : [],
        })
      }
    }
  }

  return concepts
}

/**
 * Extract claim summaries from theses for schema induction
 */
function extractClaimsFromTheses(theses: ThesisOutput[]) {
  const claims: {
    claimId: ClaimId
    text: string
    type: string
    lens: string
    concepts: string[]
  }[] = []

  for (const thesis of theses) {
    // Extract from falsification criteria
    thesis.falsificationCriteria.forEach((fc, idx) => {
      claims.push({
        claimId: asId<'claim'>(`claim:${thesis.agentId}_fc_${idx}`),
        text: fc,
        type: 'ASSERTION',
        lens: thesis.lens,
        concepts: Object.keys(thesis.conceptGraph).slice(0, 3),
      })
    })

    // Extract from decision implications
    thesis.decisionImplications.forEach((di, idx) => {
      claims.push({
        claimId: asId<'claim'>(`claim:${thesis.agentId}_di_${idx}`),
        text: di,
        type: 'PRESCRIPTION',
        lens: thesis.lens,
        concepts: Object.keys(thesis.conceptGraph).slice(0, 3),
      })
    })
  }

  return claims
}

// ----- Final Summary Memo Node -----

function createFinalMemoNode(agent: AgentConfig, execContext: AgentExecutionContext) {
  return async (state: DialecticalState): Promise<Partial<DialecticalState>> => {
    log.info(`Dialectical cycle ${state.cycleNumber}: Final Summary Memo`)

    await emitPhaseEvent(execContext, 'final_memo', state.cycleNumber, {
      theses: state.theses.length,
      contradictions: state.contradictions.length,
    })

    const prompt = buildFinalMemoPrompt({
      goal: state.goal,
      canonicalGoal: state.goalFrame?.canonicalGoal,
      coreQuestion: state.goalFrame?.coreQuestion,
      theses: state.theses,
      contradictions: state.contradictions,
      synthesis: state.synthesis,
      mergedGraph: state.mergedGraph,
      researchSources: state.researchSources,
      cycleNumber: state.cycleNumber,
      conceptualVelocity: state.conceptualVelocity,
    })

    try {
      const step = await executeAgentWithEvents(
        agent,
        prompt,
        { goal: state.goal, phase: 'final_memo' },
        execContext,
        { stepNumber: state.steps.length + 1, maxIterations: 1 }
      )

      await emitAgentOutput(execContext, 'dialectical_final_memo', agent, step.output, {
        cycleNumber: state.cycleNumber,
      })

      // Combine LLM memo with statistical appendix
      const appendix = formatFinalOutput(state)
      const finalOutput = step.output + '\n\n---\n\n' + appendix

      return {
        finalOutput,
        status: 'completed',
        steps: [step],
        totalTokensUsed: step.tokensUsed,
        totalEstimatedCost: step.estimatedCost,
      }
    } catch (error) {
      log.warn(
        `Final memo LLM call failed, falling back to formatted output: ${error instanceof Error ? error.message : String(error)}`
      )
      return {
        finalOutput: formatFinalOutput(state),
        status: 'completed',
      }
    }
  }
}

// ----- Routing Function -----

/**
 * Route based on meta-reflection decision
 */
function routeMetaDecision(
  state: DialecticalState
): 'goal_framing' | 'research_enrichment' | 'final_memo' | typeof END {
  if (state.status === 'waiting_for_input') {
    return END // Constraint pause — exit graph so executor can handle
  }
  if (state.metaDecision === 'TERMINATE') {
    return 'final_memo'
  }
  if (state.status === 'completed') {
    return END
  }
  if (state.metaDecision === 'RESPECIFY') {
    return 'goal_framing'
  }
  return 'research_enrichment'
}

/**
 * Determine which node to start at on graph entry.
 * On fresh runs, starts at input_normalizer.
 * On resume after pause, skips to the paused node via resumeNodeHint.
 */
function determineDialecticalStartNode(state: DialecticalState): string {
  const hint = state.resumeNodeHint
  if (
    hint &&
    [
      'input_normalizer',
      'goal_framing',
      'context_seeding',
      'decide_research_pre',
      'execute_research',
      'research_enrichment',
      'generate_theses',
      'cross_negation',
      'crystallize',
      'sublate',
      'decide_research_post',
      'execute_research_post',
      'meta_reflect',
    ].includes(hint)
  ) {
    return hint
  }
  return 'input_normalizer'
}

/**
 * Serialize full graph state for persistence across pause/resume cycles.
 */
function buildDialecticalResumeState(state: DialecticalState): Partial<DialecticalState> {
  return {
    cycleNumber: state.cycleNumber,
    phase: state.phase,
    normalizedInput: state.normalizedInput,
    goalFrame: state.goalFrame,
    startupSeedSummary: state.startupSeedSummary,
    theses: state.theses,
    negations: state.negations,
    contradictions: state.contradictions,
    synthesis: state.synthesis,
    mergedGraph: state.mergedGraph,
    graphHistory: state.graphHistory,
    kgDiff: state.kgDiff,
    conceptualVelocity: state.conceptualVelocity,
    velocityHistory: state.velocityHistory,
    contradictionDensity: state.contradictionDensity,
    densityHistory: state.densityHistory,
    cycleMetricsHistory: state.cycleMetricsHistory,
    metaDecision: state.metaDecision,
    agentClaimMapping: state.agentClaimMapping,
    researchBudget: state.researchBudget,
    researchSources: state.researchSources,
    researchClaims: state.researchClaims,
    researchDecision: state.researchDecision,
    steps: state.steps,
    totalTokensUsed: state.totalTokensUsed,
    totalEstimatedCost: state.totalEstimatedCost,
    constraintPause: state.constraintPause,
    pendingInput: state.pendingInput,
    resumeNodeHint: state.resumeNodeHint,
    finalOutput: state.finalOutput,
    status: state.status,
    error: state.error,
    degradedPhases: state.degradedPhases,
  }
}

// ----- Graph Creation -----

/**
 * Create a dialectical workflow graph
 */
function hasConfiguredApiKeys(apiKeys: ProviderKeys): boolean {
  return Object.values(apiKeys).some((key) => typeof key === 'string' && key.trim().length > 0)
}

export function createDialecticalGraph(config: DialecticalGraphConfig) {
  const {
    workflow,
    dialecticalConfig,
    goalFramer,
    thesisAgents,
    synthesisAgents,
    metaAgent,
    schemaAgent,
    apiKeys,
    userId,
    runId,
    eventWriter,
    toolRegistry,
    searchToolKeys,
    enableCompetitiveSynthesis = true,
    enableSchemaInduction = false,
    knowledgeHypergraph,
    sessionId,
    executionMode,
    tierOverride,
    workflowCriticality,
  } = config

  // Validate required agents
  if (!thesisAgents || thesisAgents.length === 0) {
    throw new Error('Dialectical graph requires at least 1 thesis agent')
  }
  if (!synthesisAgents || synthesisAgents.length === 0) {
    throw new Error('Dialectical graph requires at least 1 synthesis agent')
  }
  if (!hasConfiguredApiKeys(apiKeys)) {
    throw new Error('Dialectical graph requires at least 1 configured API key')
  }

  // Phase 28: Quick dialectic mode — 2 lenses, 1 cycle, no KG
  const isQuickMode = dialecticalConfig.mode === 'quick'
  const cfg = { ...dialecticalConfig }
  const agents = [...thesisAgents]
  if (isQuickMode) {
    cfg.maxCycles = 1
    agents.splice(2) // Limit to first 2 lenses
    log.info('Quick dialectic mode: 1 cycle, 2 lenses, no KG')
  }

  // Create the state graph
  const graph = new StateGraph(DialecticalStateAnnotation)

  // Build execution context
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

  // Calculate iteration budget for each agent role
  const iterationBudget = calculateIterationBudget({
    workflowMaxIterations: workflow.maxIterations ?? 8,
    thesisAgents: agents,
    synthesisAgentCount: synthesisAgents.length,
    dialecticalConfig: cfg,
    historicalData: config.historicalData,
  })
  log.info(
    `Iteration budget: thesis=${iterationBudget.perThesisAgent}, negation=${iterationBudget.perNegationAgent}, ` +
      `synthesis=${iterationBudget.perSynthesisAgent}, meta=${iterationBudget.perMetaAgent} ` +
      `(suggested total: ${iterationBudget.suggestedTotal}, configured: ${workflow.maxIterations ?? 30})`
  )

  // Initialize knowledge hypergraph (use provided or create from sessionId)
  // Phase 28: Skip KG in quick mode
  let kg: KnowledgeHypergraph | null = isQuickMode ? null : (knowledgeHypergraph ?? null)
  if (!kg && sessionId && !isQuickMode) {
    kg = new KnowledgeHypergraph(sessionId, userId)
    log.info(`Created new KnowledgeHypergraph for session ${sessionId}`)
  }

  // Note: cycleMetricsHistory is now tracked in DialecticalStateAnnotation
  // and persisted across checkpoint restores

  // --- Always register shared nodes ---
  const framingAgent = goalFramer ?? metaAgent

  graph.addNode('input_normalizer', createInputNormalizerNode(execContext))
  graph.addNode('goal_framing', createGoalFramingNode(framingAgent, execContext, cfg, kg))
  graph.addNode('context_seeding', createContextSeedingNode(framingAgent, execContext, kg))
  graph.addNode('research_enrichment', createResearchEnrichmentNode(execContext, cfg, kg))

  graph.addNode(
    'generate_theses',
    createThesisGenerationNode(agents, execContext, cfg, iterationBudget, kg)
  )

  graph.addNode(
    'cross_negation',
    createCrossNegationNode(agents, execContext, cfg, iterationBudget)
  )

  graph.addNode('crystallize', createContradictionCrystallizationNode(execContext, cfg, kg))

  graph.addNode(
    'sublate',
    createSublationNode(
      synthesisAgents,
      execContext,
      cfg,
      enableCompetitiveSynthesis,
      iterationBudget,
      kg
    )
  )

  graph.addNode(
    'meta_reflect',
    createMetaReflectionNode(
      metaAgent,
      schemaAgent,
      execContext,
      cfg,
      enableSchemaInduction,
      iterationBudget
    )
  )

  graph.addNode('final_memo', createFinalMemoNode(metaAgent, execContext))

  // Helper: route to next node unless paused for user input
  const edgeOrEnd = (target: string) => (state: DialecticalState) =>
    state.status === 'waiting_for_input' ? END : target

  if (cfg.enableReactiveResearch) {
    // --- Reactive research topology (Phase 4) ---
    graph.addNode('decide_research_pre', createDecideResearchNode(execContext, cfg, 'pre_cycle'))
    graph.addNode('execute_research', createExecuteResearchNode(execContext, cfg, kg))
    graph.addNode(
      'decide_research_post',
      createDecideResearchNode(execContext, cfg, 'post_synthesis')
    )
    graph.addNode('execute_research_post', createExecuteResearchNode(execContext, cfg, kg))

    graph.addConditionalEdges(START, (state: DialecticalState) =>
      determineDialecticalStartNode(state)
    )
    graph.addEdge('input_normalizer' as typeof START, 'goal_framing' as typeof START)
    graph.addEdge('goal_framing' as typeof START, 'context_seeding' as typeof START)
    graph.addEdge('context_seeding' as typeof START, 'decide_research_pre' as typeof START)

    graph.addConditionalEdges(
      'decide_research_pre' as typeof START,
      (state: DialecticalState) =>
        state.researchDecision?.needsResearch ? 'execute_research' : 'research_enrichment',
      {
        execute_research: 'execute_research' as typeof START,
        research_enrichment: 'research_enrichment' as typeof START,
      }
    )

    graph.addEdge('execute_research' as typeof START, 'research_enrichment' as typeof START)
    graph.addEdge('research_enrichment' as typeof START, 'generate_theses' as typeof START)
    graph.addConditionalEdges('generate_theses' as typeof START, edgeOrEnd('cross_negation'), {
      cross_negation: 'cross_negation' as typeof START,
      [END]: END,
    })
    graph.addConditionalEdges('cross_negation' as typeof START, edgeOrEnd('crystallize'), {
      crystallize: 'crystallize' as typeof START,
      [END]: END,
    })
    graph.addEdge('crystallize' as typeof START, 'sublate' as typeof START)
    graph.addEdge('sublate' as typeof START, 'decide_research_post' as typeof START)

    graph.addConditionalEdges(
      'decide_research_post' as typeof START,
      (state: DialecticalState) =>
        state.researchDecision?.needsResearch ? 'execute_research_post' : 'meta_reflect',
      {
        execute_research_post: 'execute_research_post' as typeof START,
        meta_reflect: 'meta_reflect' as typeof START,
      }
    )

    graph.addEdge('execute_research_post' as typeof START, 'meta_reflect' as typeof START)

    graph.addConditionalEdges(
      'meta_reflect' as typeof START,
      (state: DialecticalState) => {
        if (state.status === 'waiting_for_input') return END
        if (state.metaDecision === 'TERMINATE') return 'final_memo'
        if (state.status === 'completed') return END
        if (state.metaDecision === 'RESPECIFY') return 'goal_framing'
        return 'decide_research_pre'
      },
      {
        decide_research_pre: 'decide_research_pre' as typeof START,
        goal_framing: 'goal_framing' as typeof START,
        final_memo: 'final_memo' as typeof START,
        [END]: END,
      }
    )
    graph.addEdge('final_memo' as typeof START, END)
  } else {
    // --- Legacy topology ---
    graph.addConditionalEdges(START, (state: DialecticalState) =>
      determineDialecticalStartNode(state)
    )
    graph.addEdge('input_normalizer' as typeof START, 'goal_framing' as typeof START)
    graph.addEdge('goal_framing' as typeof START, 'context_seeding' as typeof START)
    graph.addEdge('context_seeding' as typeof START, 'research_enrichment' as typeof START)
    graph.addEdge('research_enrichment' as typeof START, 'generate_theses' as typeof START)
    graph.addConditionalEdges('generate_theses' as typeof START, edgeOrEnd('cross_negation'), {
      cross_negation: 'cross_negation' as typeof START,
      [END]: END,
    })
    graph.addConditionalEdges('cross_negation' as typeof START, edgeOrEnd('crystallize'), {
      crystallize: 'crystallize' as typeof START,
      [END]: END,
    })
    graph.addEdge('crystallize' as typeof START, 'sublate' as typeof START)
    graph.addConditionalEdges('sublate' as typeof START, edgeOrEnd('meta_reflect'), {
      meta_reflect: 'meta_reflect' as typeof START,
      [END]: END,
    })

    // Add conditional edge for cycle continuation
    graph.addConditionalEdges('meta_reflect' as typeof START, routeMetaDecision, {
      goal_framing: 'goal_framing' as typeof START,
      research_enrichment: 'research_enrichment' as typeof START,
      final_memo: 'final_memo' as typeof START,
      [END]: END,
    })
    graph.addEdge('final_memo' as typeof START, END)
  }

  // Compile with optional checkpointing
  if (config.enableCheckpointing) {
    const checkpointer = createFirestoreCheckpointer(userId, workflow.workflowId, runId)
    return graph.compile({ checkpointer })
  }

  return graph.compile()
}

/**
 * Execute a dialectical workflow using LangGraph
 */
export async function executeDialecticalWorkflowLangGraph(
  config: DialecticalGraphConfig,
  goal: string,
  context?: Record<string, unknown>,
  resumeState?: Partial<DialecticalState>
): Promise<{
  output: string
  steps: AgentExecutionStep[]
  totalTokensUsed: number
  totalEstimatedCost: number
  totalCycles: number
  conceptualVelocity: number
  contradictionsFound: number
  status: 'running' | 'completed' | 'failed' | 'paused' | 'waiting_for_input'
  error?: string
  // Full dialectical state for visualization
  dialecticalState: {
    cycleNumber: number
    maxCycles: number
    phase: string
    theses: ThesisOutput[]
    negations: NegationOutput[]
    contradictions: ContradictionOutput[]
    synthesis: SublationOutput | null
    mergedGraph: CompactGraph | null
    graphHistory: Array<{ cycle: number; diff: GraphDiff }>
    conceptualVelocity: number
    velocityHistory: number[]
    contradictionDensity: number
    densityHistory: number[]
    metaDecision: MetaDecision | null
    tokensUsed: number
    estimatedCost: number
    startedAtMs: number
    researchSourceCount: number
    researchClaimCount: number
    researchBudgetSpent: number
    degradedPhases: string[]
  }
  startup?: {
    normalizedInput: Record<string, unknown> | null
    goalFrame: Record<string, unknown> | null
    startupSeedSummary: Record<string, unknown> | null
  }
  constraintPause?: Run['constraintPause']
  pendingInput?: { prompt: string; nodeId: string }
  dialecticalResumeState?: Partial<DialecticalState>
}> {
  const { workflow, userId, runId } = config
  const startedAtMs = Date.now()
  const trimmedGoal = goal.trim()

  if (trimmedGoal.length === 0) {
    return {
      output: 'Dialectical reasoning failed: Goal is required',
      steps: [],
      totalTokensUsed: 0,
      totalEstimatedCost: 0,
      totalCycles: 0,
      conceptualVelocity: 0,
      contradictionsFound: 0,
      status: 'failed',
      error: 'Goal is required',
      dialecticalState: {
        cycleNumber: 0,
        maxCycles: config.dialecticalConfig.maxCycles,
        phase: 'retrieve_context',
        theses: [],
        negations: [],
        contradictions: [],
        synthesis: null,
        mergedGraph: null,
        graphHistory: [],
        conceptualVelocity: 0,
        velocityHistory: [],
        contradictionDensity: 0,
        densityHistory: [],
        metaDecision: null,
        tokensUsed: 0,
        estimatedCost: 0,
        startedAtMs,
        researchSourceCount: 0,
        researchClaimCount: 0,
        researchBudgetSpent: 0,
        degradedPhases: [],
      },
    }
  }

  // Fetch historical iteration data for budget learning
  let historicalData: HistoricalIterationData | null = null
  try {
    historicalData = await fetchIterationHistory(userId, workflow.workflowId)
  } catch (err) {
    log.warn('Failed to fetch iteration history, using heuristic only', { error: String(err) })
  }

  const compiledGraph = createDialecticalGraph({ ...config, historicalData })

  // Build fresh state
  const freshState: Partial<DialecticalState> = {
    workflowId: workflow.workflowId,
    runId,
    userId,
    goal: trimmedGoal,
    context: context ?? {},
    normalizedInput: null,
    goalFrame: null,
    startupSeedSummary: null,
    cycleNumber: 0,
    phase: 'retrieve_context',
    theses: [],
    negations: [],
    contradictions: [],
    synthesis: null,
    mergedGraph: null,
    graphHistory: [],
    conceptualVelocity: 1.0, // Start high
    contradictionDensity: 0,
    metaDecision: null,
    steps: [],
    totalTokensUsed: 0,
    totalEstimatedCost: 0,
    finalOutput: null,
    status: 'running',
    error: null,
    constraintPause: null,
    pendingInput: null,
    resumeNodeHint: null,
    // Research state
    researchBudget: config.dialecticalConfig.enableExternalResearch
      ? createRunBudget(
          config.dialecticalConfig.researchBudgetUsd ?? 1.0,
          config.dialecticalConfig.researchSearchDepth ?? 'standard'
        )
      : null,
    researchSources: [],
    researchClaims: [],
    degradedPhases: [],
  }

  // If resuming (e.g. after constraint increase), merge previous state
  const mergedResumeContext = {
    ...(resumeState?.context ?? {}),
    ...(freshState.context ?? {}),
  }
  const initialState: Partial<DialecticalState> = resumeState
    ? {
        ...freshState,
        ...resumeState,
        status: 'running',
        constraintPause: null,
        pendingInput: null,
        context: mergedResumeContext,
      }
    : freshState

  // Execute the graph
  let finalState: DialecticalState
  try {
    finalState = (await compiledGraph.invoke(initialState)) as DialecticalState
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e)
    const errorStack = e instanceof Error ? e.stack : undefined
    log.error('Dialectical graph execution failed', {
      error: errorMessage,
      stack: errorStack,
      workflowId: workflow.workflowId,
      runId,
      goal: trimmedGoal.slice(0, 200),
    })
    return {
      output: `Dialectical reasoning failed: ${errorMessage}`,
      steps: [],
      totalTokensUsed: 0,
      totalEstimatedCost: 0,
      totalCycles: 0,
      conceptualVelocity: 0,
      contradictionsFound: 0,
      status: 'failed' as const,
      error: errorMessage,
      dialecticalState: {
        cycleNumber: 0,
        maxCycles: config.dialecticalConfig.maxCycles,
        phase: 'retrieve_context' as const,
        theses: [],
        negations: [],
        contradictions: [],
        synthesis: null,
        mergedGraph: null,
        graphHistory: [],
        conceptualVelocity: 0,
        velocityHistory: [],
        contradictionDensity: 0,
        densityHistory: [],
        metaDecision: null,
        tokensUsed: 0,
        estimatedCost: 0,
        startedAtMs,
        researchSourceCount: 0,
        researchClaimCount: 0,
        researchBudgetSpent: 0,
        degradedPhases: [],
      },
    }
  }

  // Write iteration usage summary for future budget learning
  try {
    const thesisAgentCount = Math.max(1, config.thesisAgents.length)
    const avgToolCount =
      config.thesisAgents.reduce((sum, a) => sum + (a.toolIds?.length ?? 0), 0) / thesisAgentCount
    // Reconstruct the budget used for this run (same params as createDialecticalGraph)
    const budgetUsed = calculateIterationBudget({
      workflowMaxIterations: workflow.maxIterations ?? 8,
      thesisAgents: config.thesisAgents,
      synthesisAgentCount: config.synthesisAgents.length,
      dialecticalConfig: config.dialecticalConfig,
      historicalData,
    })
    await writeIterationUsageSummary(
      userId,
      workflow.workflowId,
      runId,
      finalState.steps ?? [],
      budgetUsed,
      finalState.cycleNumber ?? 0,
      avgToolCount
    )
  } catch (err) {
    log.warn('Failed to write iteration usage summary', { error: String(err) })
  }

  // Calculate contradiction density (contradictions per claim)
  const totalClaims = (finalState.theses?.length ?? 0) + (finalState.negations?.length ?? 0)
  const contradictionDensity =
    totalClaims > 0 ? (finalState.contradictions?.length ?? 0) / totalClaims : 0

  return {
    output: finalState.finalOutput ?? formatFinalOutput(finalState),
    steps: finalState.steps ?? [],
    totalTokensUsed: finalState.totalTokensUsed ?? 0,
    totalEstimatedCost: finalState.totalEstimatedCost ?? 0,
    totalCycles: finalState.cycleNumber ?? 0,
    conceptualVelocity: finalState.conceptualVelocity ?? 0,
    contradictionsFound: finalState.contradictions?.length ?? 0,
    status: finalState.status ?? 'completed',
    constraintPause: finalState.constraintPause ?? undefined,
    pendingInput: finalState.pendingInput ?? undefined,
    dialecticalState: {
      cycleNumber: finalState.cycleNumber ?? 0,
      maxCycles: config.dialecticalConfig.maxCycles,
      phase: finalState.phase ?? 'meta_reflection',
      theses: finalState.theses ?? [],
      negations: finalState.negations ?? [],
      contradictions: finalState.contradictions ?? [],
      synthesis: finalState.synthesis ?? null,
      mergedGraph: finalState.mergedGraph ?? null,
      graphHistory: finalState.graphHistory ?? [],
      conceptualVelocity: finalState.conceptualVelocity ?? 0,
      velocityHistory: finalState.velocityHistory ?? [finalState.conceptualVelocity ?? 0],
      contradictionDensity,
      densityHistory: finalState.densityHistory ?? [contradictionDensity],
      metaDecision: finalState.metaDecision ?? null,
      tokensUsed: finalState.totalTokensUsed ?? 0,
      estimatedCost: finalState.totalEstimatedCost ?? 0,
      startedAtMs,
      // Research metrics
      researchSourceCount: finalState.researchSources?.length ?? 0,
      researchClaimCount: finalState.researchClaims?.length ?? 0,
      researchBudgetSpent: finalState.researchBudget?.spentUsd ?? 0,
      degradedPhases: finalState.degradedPhases ?? [],
    },
    startup: {
      normalizedInput: finalState.normalizedInput
        ? {
            normalizedGoal: finalState.normalizedInput.normalizedGoal,
            contextSummary: finalState.normalizedInput.contextSummary,
            hasContext: finalState.normalizedInput.hasContext,
            noteCount: finalState.normalizedInput.noteCount,
            fileCount: finalState.normalizedInput.fileCount,
            rawCharCount: finalState.normalizedInput.rawCharCount,
            warnings: finalState.normalizedInput.warnings,
          }
        : null,
      goalFrame: (finalState.goalFrame as Record<string, unknown> | null) ?? null,
      startupSeedSummary: (finalState.startupSeedSummary as Record<string, unknown> | null) ?? null,
    },
    dialecticalResumeState: buildDialecticalResumeState(finalState),
  }
}

// ----- Helper Functions -----

function isSubstantiveThesis(thesis: ThesisOutput | null | undefined): thesis is ThesisOutput {
  if (!thesis) return false
  if (thesis.graph && thesis.graph.nodes.length > 0) return true
  if (Object.keys(thesis.conceptGraph ?? {}).length > 0) return true
  if ((thesis.causalModel?.length ?? 0) > 0) return true
  if ((thesis.falsificationCriteria?.length ?? 0) > 0) return true
  if ((thesis.decisionImplications?.length ?? 0) > 0) return true

  const rawText = thesis.rawText?.trim() ?? ''
  if (rawText.length < 20) return false
  if (rawText.startsWith('[PARTIAL RESULT')) return false
  if (rawText.toLowerCase() === 'parse failure') return false

  return true
}

function getValidationErrorForRepair(output: string, schema?: ZodTypeAny): ZodError | null {
  if (!schema) return null
  const parsed = safeParseJson(output)
  if (!parsed) return null
  const validated = schema.safeParse(parsed)
  return validated.success ? null : validated.error
}

function classifyParseFailure(
  error: unknown
): 'no_json' | 'schema_mismatch' | 'post_repair_invalid' {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase()
  if (message.includes('did not contain valid json') || message.includes('did not contain json')) {
    return 'no_json'
  }
  if (
    message.includes('did not match supported schemas') ||
    message.includes('invalid') ||
    message.includes('schema')
  ) {
    return 'schema_mismatch'
  }
  return 'post_repair_invalid'
}

function truncateLogSample(text: string, maxLength = 700): string {
  if (text.length <= maxLength) return text
  return `${text.slice(0, maxLength)}...[truncated]`
}

/**
 * Wrap a parse function with 4-layer JSON retry:
 * 1. Direct parse (parseFn)
 * 2. Same-provider retry with strict JSON-only prompt
 * 3. Dedicated GPT repair with schema-aware validation feedback
 * 4. Anthropic fast fallback with relevance gate
 */
async function withJsonParseRetry<T>(
  rawOutput: string,
  parseFn: (output: string) => T,
  opts: {
    context: string
    jsonSchema: string
    emptyFallback: string
    goal: string
    baseAgent: AgentConfig
    execContext: AgentExecutionContext
    nodeId: string
    stepNumber: number
    runId: string
    repairSchema?: ZodTypeAny
    originalTaskPrompt?: string
  }
): Promise<T> {
  // Layer 1: direct parse
  let finalFailureCategory: 'no_json' | 'schema_mismatch' | 'post_repair_invalid' =
    'post_repair_invalid'
  try {
    return parseFn(rawOutput)
  } catch (firstError) {
    finalFailureCategory = classifyParseFailure(firstError)
    log.warn(`${opts.context} parse failed, retrying with strict JSON prompt`, {
      runId: opts.runId,
      error: firstError instanceof Error ? firstError.message : String(firstError),
    })

    // Layer 2: same provider, strict JSON-only re-prompt
    const retryAgent: AgentConfig = {
      ...opts.baseAgent,
      toolIds: [],
      temperature: 0,
      systemPrompt: `You are a JSON formatter repairing a prior response for the same task. Return ONLY a valid JSON object matching the required schema. No markdown, no explanation, no commentary.

Original system prompt:
${opts.baseAgent.systemPrompt.slice(0, 3000)}

Required schema:
${opts.jsonSchema}`,
    }
    const retryStep = await executeAgentWithEvents(
      retryAgent,
      `${opts.originalTaskPrompt ? `Original task:\n${opts.originalTaskPrompt.slice(0, 4000)}\n\n` : ''}Convert this prior response to JSON:\n\n${rawOutput.slice(0, 8000)}`,
      {},
      opts.execContext,
      { nodeId: opts.nodeId, stepNumber: opts.stepNumber }
    )
    try {
      return parseFn(retryStep.output)
    } catch (retryError) {
      finalFailureCategory = classifyParseFailure(retryError)
      log.warn(`${opts.context} retry failed, attempting GPT repair`, {
        runId: opts.runId,
        error: retryError instanceof Error ? retryError.message : String(retryError),
      })

      if (opts.repairSchema) {
        const repairInput =
          retryStep.output.trim().length >= rawOutput.trim().length * 0.5
            ? retryStep.output
            : rawOutput
        const repairedOutput = await repairJsonOutput(
          repairInput,
          getValidationErrorForRepair(repairInput, opts.repairSchema),
          opts.repairSchema,
          opts.execContext,
          {
            context: opts.context,
            goal: opts.goal,
            originalTaskPrompt: opts.originalTaskPrompt,
            originalSystemPrompt: opts.baseAgent.systemPrompt,
            schemaHint: opts.jsonSchema,
          }
        )

        if (repairedOutput) {
          try {
            return parseFn(repairedOutput)
          } catch (repairError) {
            finalFailureCategory = classifyParseFailure(repairError)
            log.warn(`${opts.context} GPT repair failed, falling back to Anthropic fast`, {
              runId: opts.runId,
              error: repairError instanceof Error ? repairError.message : String(repairError),
            })
          }
        } else {
          log.warn(
            `${opts.context} GPT repair returned no valid JSON, falling back to Anthropic fast`,
            {
              runId: opts.runId,
            }
          )
        }
      }

      // Layer 4: Anthropic fast fallback with relevance gate
      const haikuAgent: AgentConfig = {
        ...opts.baseAgent,
        name: `${opts.nodeId}-json-fixer`,
        toolIds: [],
        modelProvider: 'anthropic',
        modelName: DEFAULT_MODELS.anthropic,
        modelTier: 'fast',
        temperature: 0,
        systemPrompt: `You are a strict JSON extraction assistant. You will receive text that was supposed to be a JSON analysis, but may instead be an error message, refusal, or irrelevant text.

Step 1: Determine if the text contains substantive analysis relevant to the goal: "${opts.goal}"
- If the text is an error message, API failure, refusal, or completely unrelated to the goal, respond with EXACTLY: ${opts.emptyFallback}
- If the text contains relevant analysis (even partial), proceed to step 2.

Step 2: Extract the analysis into this exact JSON schema. Output ONLY valid JSON, nothing else.
${opts.jsonSchema}`,
      }
      const haikuStep = await executeAgentWithEvents(
        haikuAgent,
        `${opts.originalTaskPrompt ? `Original task:\n${opts.originalTaskPrompt.slice(0, 4000)}\n\n` : ''}${rawOutput.slice(0, 8000)}`,
        {},
        opts.execContext,
        { nodeId: opts.nodeId, stepNumber: opts.stepNumber }
      )
      try {
        return parseFn(haikuStep.output)
      } catch (haikuError) {
        finalFailureCategory = classifyParseFailure(haikuError)
        // Layer 5: hard fallback — use the empty fallback directly instead of crashing
        log.error(`${opts.context} all JSON repair layers failed, using empty fallback`, {
          runId: opts.runId,
          error: haikuError instanceof Error ? haikuError.message : String(haikuError),
          ...(opts.context === 'Thesis (economic)'
            ? {
                provider: opts.baseAgent.modelProvider,
                model: opts.baseAgent.modelName,
                toolCount: opts.baseAgent.toolIds?.length ?? 0,
                failureCategory: finalFailureCategory,
                rawOutputSample: truncateLogSample(rawOutput),
              }
            : {}),
        })
        return parseFn(opts.emptyFallback)
      }
    }
  }
}

/**
 * Extract JSON from LLM output
 * Handles both pure JSON and JSON embedded in markdown code blocks
 */
function extractJsonFromOutput(output: string): unknown | null {
  return safeParseJson(output)
}

function parseThesisOutput(
  output: string,
  agentId: string,
  model: string,
  lens: string
): ThesisOutput {
  const parsed = extractJsonFromOutput(output)
  if (!parsed) {
    throw new Error(`Thesis output from ${agentId} did not contain valid JSON`)
  }

  const normalizedParsed = normalizeCompactGraphCandidate(parsed)
  const graphValidated = CompactGraphSchema.safeParse(normalizedParsed)
  if (graphValidated.success) {
    const graph = graphValidated.data as CompactGraph
    return {
      agentId,
      model,
      lens,
      conceptGraph: {},
      causalModel: [],
      falsificationCriteria: [],
      decisionImplications: [],
      unitOfAnalysis: '',
      temporalGrain: graph.temporalGrain,
      regimeAssumptions: graph.regime ? [graph.regime] : [],
      confidence: graph.confidence,
      rawText: graph.summary,
      graph,
    }
  }

  const validated = ThesisOutputSchema.safeParse(parsed)
  if (validated.success) {
    return {
      agentId,
      model,
      lens,
      conceptGraph: validated.data.conceptGraph,
      causalModel: validated.data.causalModel,
      falsificationCriteria: validated.data.falsificationCriteria,
      decisionImplications: validated.data.decisionImplications,
      unitOfAnalysis: validated.data.unitOfAnalysis,
      temporalGrain: validated.data.temporalGrain,
      regimeAssumptions: validated.data.regimeAssumptions,
      confidence: validated.data.confidence,
      rawText: output,
    }
  }

  if (typeof parsed === 'object' && parsed !== null) {
    const obj = parsed as Record<string, unknown>
    const candidateKeys = [
      'structuredThesis',
      'thesis',
      'graph',
      'conceptGraph',
      'mergedGraph',
      'knowledgeGraph',
    ]
    for (const key of candidateKeys) {
      if (obj[key] && typeof obj[key] === 'object') {
        const nested = CompactGraphSchema.safeParse(normalizeCompactGraphCandidate(obj[key]))
        if (nested.success) {
          const graph = nested.data as CompactGraph
          log.info('Extracted CompactGraph from nested key', { key, lens })
          return {
            agentId,
            model,
            lens,
            conceptGraph: {},
            causalModel: [],
            falsificationCriteria: [],
            decisionImplications: [],
            unitOfAnalysis: '',
            temporalGrain: graph.temporalGrain,
            regimeAssumptions: graph.regime ? [graph.regime] : [],
            confidence: graph.confidence,
            rawText: graph.summary,
            graph,
          }
        }
      }
    }
  }

  throw new Error(`Thesis output from ${agentId} did not match supported schemas`)
}

function parseNegationOutput(
  output: string,
  agentId: string,
  targetAgentId: string
): NegationOutput {
  const validRewriteOperators = new Set<NegationOutput['rewriteOperator']>([
    'SPLIT',
    'MERGE',
    'REVERSE_EDGE',
    'ADD_MEDIATOR',
    'SCOPE_TO_REGIME',
    'TEMPORALIZE',
  ])

  // Try to parse structured output using Zod schema
  const parsed = extractJsonFromOutput(output)
  if (!parsed) {
    throw new Error(`Negation output from ${agentId} did not contain valid JSON`)
  }

  const validated = NegationOutputSchema.safeParse(parsed)
  if (validated.success) {
    const rawParsed = parsed as Record<string, unknown>
    let rewriteOperators: NegationOutput['rewriteOperators']
    if (Array.isArray(rawParsed.rewriteOperators)) {
      rewriteOperators = (rawParsed.rewriteOperators as Array<Record<string, unknown>>).map(
        (op) => {
          const type = String(op.type ?? '')
            .trim()
            .toUpperCase() as NegationOutput['rewriteOperator']
          if (!validRewriteOperators.has(type)) {
            throw new Error(
              `Negation output from ${agentId} contained invalid rewrite operator: ${String(op.type ?? '')}`
            )
          }
          return {
            type,
            target: (op.target as string) ?? '',
            rationale: (op.rationale as string) ?? '',
          }
        }
      )
    }

    return {
      agentId,
      targetThesisAgentId: targetAgentId,
      internalTensions: validated.data.internalTensions,
      categoryAttacks: validated.data.categoryAttacks,
      preservedValid: validated.data.preservedValid,
      rivalFraming: validated.data.rivalFraming,
      rewriteOperator: validated.data.rewriteOperator,
      rewriteOperators,
      operatorArgs: validated.data.operatorArgs,
      rawText: output,
    }
  }

  throw new Error(
    `Negation output from ${agentId} did not match schema: ${validated.error.message}`
  )
}

interface GraphSublationResult {
  synthesis: SublationOutput
  mergedGraph: CompactGraph | null
  graphDiff: GraphDiff | null
}

function parseSublationOutput(output: string): GraphSublationResult {
  const parsed = extractJsonFromOutput(output)
  if (!parsed) {
    throw new Error('Sublation output did not contain valid JSON')
  }

  const graphValidated = GraphSublationOutputSchema.safeParse(parsed)
  if (graphValidated.success) {
    const {
      mergedGraph: validatedGraph,
      diff: validatedDiff,
      resolvedContradictions: validatedResolved,
    } = graphValidated.data
    return {
      synthesis: {
        operators: [],
        preservedElements: validatedDiff.addedNodes,
        negatedElements: validatedDiff.removedNodes,
        newConceptGraph: {},
        newClaims: validatedGraph.nodes
          .filter((n) => n.type === 'claim')
          .map((n) => ({ id: n.id, text: n.label, confidence: validatedGraph.confidence })),
        newPredictions: validatedGraph.nodes
          .filter((n) => n.type === 'prediction')
          .map((n) => ({ id: n.id, text: n.label, threshold: 'TBD' })),
        schemaDiff: {
          resolvedContradictions: validatedResolved,
        },
        incompleteReason:
          typeof (parsed as Record<string, unknown>).incompleteReason === 'string'
            ? String((parsed as Record<string, unknown>).incompleteReason)
            : undefined,
      },
      mergedGraph: validatedGraph,
      graphDiff: validatedDiff,
    }
  }

  const validated = SublationOutputSchema.safeParse(parsed)
  if (validated.success) {
    return {
      synthesis: {
        operators: validated.data.operators,
        preservedElements: validated.data.preservedElements,
        negatedElements: validated.data.negatedElements,
        newConceptGraph: validated.data.newConceptGraph,
        newClaims: validated.data.newClaims,
        newPredictions: validated.data.newPredictions,
        schemaDiff: null,
        incompleteReason: validated.data.incompleteReason,
      },
      mergedGraph: null,
      graphDiff: null,
    }
  }

  throw new Error(`Sublation output did not match supported schemas: ${validated.error.message}`)
}

function extractContradictions(
  theses: ThesisOutput[],
  negations: NegationOutput[],
  config: DialecticalWorkflowConfig,
  trackerContext?: ContradictionTrackerContext,
  agentClaimMapping?: Record<string, string[]>
): ContradictionOutput[] {
  // Use the 4 specialized contradiction trackers
  if (trackerContext && config.enabledTrackers.length > 0) {
    const result = runContradictionTrackers(
      theses,
      negations,
      config.enabledTrackers,
      trackerContext,
      agentClaimMapping
    )

    log.info(
      `Contradiction trackers found ${result.allContradictions.length} contradictions in ${result.totalProcessingTimeMs}ms`
    )

    return result.allContradictions
  }

  throw new Error('Contradiction extraction requires trackerContext and enabled trackers')
}

/**
 * Derive a KGDiff from a SublationOutput by mapping rewrite operators to diff fields.
 */
function deriveKGDiff(
  synthesis: SublationOutput,
  contradictions: ContradictionOutput[],
  graphDiff?: GraphDiff | null
): KGDiff {
  // When graph format is used, operators is [] — derive from graphDiff instead
  if (graphDiff && synthesis.operators.length === 0) {
    return deriveKGDiffFromGraphDiff(graphDiff, synthesis, contradictions)
  }

  const diff: KGDiff = {
    conceptSplits: [],
    conceptMerges: [],
    newMediators: [],
    edgeReversals: [],
    regimeScopings: [],
    temporalizations: [],
    newClaims: synthesis.newClaims.map((c) => ({ id: c.id, text: c.text })),
    supersededClaims: synthesis.negatedElements,
    newContradictions: contradictions,
    resolvedContradictions: contradictions
      .filter((c) => synthesis.operators.some((op) => op.target === c.id))
      .map((c) => c.id),
    newPredictions: synthesis.newPredictions.map((p) => ({ id: p.id, text: p.text })),
  }

  for (const op of synthesis.operators) {
    switch (op.type) {
      case 'SPLIT':
        diff.conceptSplits.push({ from: op.target, to: (op.args.to as string[]) ?? [] })
        break
      case 'MERGE':
        diff.conceptMerges.push({ from: (op.args.from as string[]) ?? [], to: op.target })
        break
      case 'ADD_MEDIATOR':
        diff.newMediators.push({ edge: op.target, mediator: (op.args.mediator as string) ?? '' })
        break
      case 'REVERSE_EDGE':
        diff.edgeReversals.push({ edge: op.target })
        break
      case 'SCOPE_TO_REGIME':
        diff.regimeScopings.push({
          claim: op.target,
          regime: (op.args.regime as string) ?? '',
        })
        break
      case 'TEMPORALIZE':
        diff.temporalizations.push({
          claims: (op.args.claims as string[]) ?? [op.target],
          sequence: (op.args.sequence as string[]) ?? [],
        })
        break
    }
  }

  return diff
}

/**
 * Derive KGDiff from a GraphDiff (graph-format sublation output).
 * Maps graph structural changes to the legacy KGDiff fields so that
 * velocity, learning rate, and convergence metrics work correctly.
 */
function deriveKGDiffFromGraphDiff(
  graphDiff: GraphDiff,
  synthesis: SublationOutput,
  contradictions: ContradictionOutput[]
): KGDiff {
  // Modified nodes = concept refinement (structural change for velocity)
  const conceptSplits = graphDiff.modifiedNodes.map((m) => ({
    from: m.oldLabel,
    to: [m.newLabel],
  }))

  // Edges added with rel='mediates' → new mediators
  const newMediators = graphDiff.addedEdges
    .filter((e) => e.rel === 'mediates')
    .map((e) => ({ edge: `${e.from}->${e.to}`, mediator: e.from }))

  // Detect edge reversals: removed A→B + added B→A with same rel
  const edgeReversals: Array<{ edge: string }> = []
  for (const removed of graphDiff.removedEdges) {
    const reversed = graphDiff.addedEdges.find(
      (a) => a.from === removed.to && a.to === removed.from && a.rel === removed.rel
    )
    if (reversed) {
      edgeReversals.push({ edge: `${removed.from}->${removed.to}` })
    }
  }

  // Resolved contradictions: from graphDiff + schemaDiff (Bug 1 fix)
  const resolvedFromDiff = graphDiff.resolvedContradictions ?? []
  const resolvedFromSchema =
    (synthesis.schemaDiff?.resolvedContradictions as string[] | undefined) ?? []
  // Deduplicate: graphDiff has edge IDs, schemaDiff has descriptions — keep both
  const resolvedContradictions = [...new Set([...resolvedFromDiff, ...resolvedFromSchema])]

  // New contradictions: match graphDiff IDs against crystallized contradictions
  const newContradictionIds = new Set(graphDiff.newContradictions ?? [])
  const matchedContradictions =
    newContradictionIds.size > 0
      ? contradictions.filter((c) => newContradictionIds.has(c.id))
      : contradictions
  // If no ID matches found, use all contradictions (the LLM may use different IDs)
  const newContradictions =
    matchedContradictions.length > 0 ? matchedContradictions : contradictions

  return {
    conceptSplits,
    conceptMerges: [], // Can't reliably detect from GraphDiff
    newMediators,
    edgeReversals,
    regimeScopings: [],
    temporalizations: [],
    newClaims: synthesis.newClaims.map((c) => ({ id: c.id, text: c.text })),
    supersededClaims: graphDiff.removedNodes,
    newContradictions,
    resolvedContradictions,
    newPredictions: synthesis.newPredictions.map((p) => ({ id: p.id, text: p.text })),
  }
}

// Local calculateConceptualVelocity removed — use the unified version
// from metaReflection.ts (exported as calculateConceptualVelocity) which
// accounts for KG diff operations (splits, merges, mediators, reversals,
// contradictions) for consistent velocity across UI and termination.

function formatFinalOutput(state: DialecticalState): string {
  const parts: string[] = []

  parts.push(`# Dialectical Analysis Complete`)
  parts.push(`\n## Summary`)
  parts.push(`- Cycles completed: ${state.cycleNumber}`)
  parts.push(`- Theses generated: ${state.theses.length}`)
  parts.push(`- Contradictions found: ${state.contradictions.length}`)
  parts.push(`- Final velocity: ${state.conceptualVelocity.toFixed(2)}`)

  // Knowledge graph summary
  if (state.mergedGraph) {
    const graph = state.mergedGraph
    const contradictEdges = graph.edges.filter((e) => e.rel === 'contradicts')
    parts.push(`\n## Knowledge Graph`)
    parts.push(`**${graph.summary}**`)
    parts.push(`\n${graph.reasoning}`)
    parts.push(`\n- ${graph.nodes.length} nodes, ${graph.edges.length} edges`)
    parts.push(`- Confidence: ${(graph.confidence * 100).toFixed(0)}%`)
    parts.push(`- Unresolved contradictions: ${contradictEdges.length}`)
    parts.push(`- Regime: ${graph.regime}`)
    if (state.graphHistory.length > 0) {
      const totalAdded = state.graphHistory.reduce((s, h) => s + h.diff.addedNodes.length, 0)
      const totalResolved = state.graphHistory.reduce(
        (s, h) => s + h.diff.resolvedContradictions.length,
        0
      )
      parts.push(
        `- Evolution: +${totalAdded} nodes added, ${totalResolved} contradictions resolved across ${state.graphHistory.length} cycles`
      )
    }
  }

  if (state.synthesis) {
    parts.push(`\n## Synthesis`)
    parts.push(`Preserved elements: ${state.synthesis.preservedElements.length}`)
    parts.push(`Negated elements: ${state.synthesis.negatedElements.length}`)
    parts.push(`New claims: ${state.synthesis.newClaims.length}`)
  }

  parts.push(`\n## Key Theses`)
  state.theses.slice(0, 3).forEach((t, i) => {
    parts.push(`\n### Thesis ${i + 1} (${t.lens})`)
    if (t.graph) {
      parts.push(`**${t.graph.summary}**`)
      if (t.graph.reasoning) parts.push(t.graph.reasoning)
    } else {
      parts.push(t.rawText)
    }
  })

  if (state.contradictions.length > 0) {
    parts.push(`\n## Key Contradictions`)
    state.contradictions.slice(0, 5).forEach((c, i) => {
      parts.push(`${i + 1}. [${c.severity}] ${c.type}: ${c.description}`)
    })
  }

  if (state.synthesis?.incompleteReason) {
    parts.push(`\n## Partial Analysis Warning`)
    parts.push(state.synthesis.incompleteReason)
  }

  if (state.degradedPhases.length > 0) {
    parts.push(`\n## Degraded Phases`)
    parts.push([...new Set(state.degradedPhases)].join(', '))
  }

  // Research sources bibliography
  if (state.researchSources && state.researchSources.length > 0) {
    parts.push(`\n## Sources`)
    const sorted = [...state.researchSources]
      .sort((a, b) => (b.sourceQualityScore ?? 0) - (a.sourceQualityScore ?? 0))
      .slice(0, 10)
    sorted.forEach((s) => {
      const quality = s.sourceQualityScore ? ` (quality: ${s.sourceQualityScore.toFixed(2)})` : ''
      parts.push(`- [${s.domain}] ${s.title}${quality} — ${s.url}`)
    })
    if (state.researchClaims && state.researchClaims.length > 0) {
      parts.push(
        `\n*${state.researchClaims.length} claims extracted from ${state.researchSources.length} sources*`
      )
    }
  }

  return parts.join('\n')
}
