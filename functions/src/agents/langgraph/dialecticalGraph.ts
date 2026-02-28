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
import type {
  AgentConfig,
  Workflow,
  AgentExecutionStep,
  DialecticalWorkflowConfig,
  ThesisOutput,
  NegationOutput,
  ContradictionOutput,
  SublationOutput,
  MetaDecision,
  Community,
  DialecticalSessionId,
  ClaimId,
  ConceptId,
} from '@lifeos/agents'
import { asId } from '@lifeos/agents'
import { createFirestoreCheckpointer } from './firestoreCheckpointer.js'
import type { ProviderKeys } from '../providerService.js'
import type { RunEventWriter } from '../runEvents.js'
import type { SearchToolKeys } from '../providerKeys.js'
import type { ToolRegistry } from '../toolExecutor.js'
import { executeAgentWithEvents, type AgentExecutionContext } from './utils.js'
import { DialecticalStateAnnotation, type DialecticalState } from './stateAnnotations.js'
import { runCompetitiveSynthesis, runSynthesisCrossNegation } from '../sublationEngine.js'
import { runMetaReflection } from '../metaReflection.js'
import { recordMessage } from '../messageStore.js'
import { runSchemaInduction, type SchemaInductionInput } from '../schemaInduction.js'
import { executeRetrievalAgent, type RetrievalContext } from '../retrievalAgent.js'
import { selectBestTemplate, getAttenuatedSteps } from '../optimization/retrievalTemplates.js'
import { KnowledgeHypergraph } from '../knowledgeHypergraph.js'
import {
  ThesisOutputSchema,
  NegationOutputSchema,
  SublationOutputSchema,
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
import { createLogger } from '../../lib/logger.js'

const log = createLogger('DialecticalGraph')

// ----- Types -----

/**
 * Configuration for dialectical graph creation
 */
export interface DialecticalGraphConfig {
  workflow: Workflow
  dialecticalConfig: DialecticalWorkflowConfig
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
    | 'dialectical_meta',
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

/**
 * Phase 1: Retrieve Context
 * Query the knowledge graph for relevant concepts, claims, and contradictions.
 * Uses the heuristic retrieval agent with template-based optimization.
 */
function createRetrieveContextNode(
  execContext: AgentExecutionContext,
  config: DialecticalWorkflowConfig,
  kg: KnowledgeHypergraph | null
) {
  return async (state: DialecticalState): Promise<Partial<DialecticalState>> => {
    log.info(`Dialectical cycle ${state.cycleNumber + 1}: Retrieve Context phase`)

    // Emit phase transition event
    await emitPhaseEvent(execContext, 'retrieve_context', state.cycleNumber + 1, {
      hasKnowledgeGraph: !!kg,
    })

    // If no knowledge graph is available, pass through existing context
    if (!kg) {
      log.info('No knowledge hypergraph available, using initial context')
      return {
        phase: 'thesis_generation',
        cycleNumber: state.cycleNumber + 1,
        totalTokensUsed: 0,
        totalEstimatedCost: 0,
      }
    }

    try {
      // Try to select the best retrieval template for this workflow
      const template = await selectBestTemplate(execContext.userId, {
        workflowType: 'dialectical',
        preferValidated: true,
      })

      // Get attenuated steps if template exists (progressive narrowing)
      let templateConfig: { maxSteps?: number } = {}
      if (template) {
        const attenuatedSteps = getAttenuatedSteps(template, {
          currentCycle: state.cycleNumber,
          maxCycles: config.maxCycles,
          attenuationFactor: 0.3,
        })
        templateConfig = { maxSteps: attenuatedSteps.length }
        log.info(`Using retrieval template "${template.name}" with ${attenuatedSteps.length} steps`)
      }

      // Execute retrieval agent
      const retrievalResult = await executeRetrievalAgent(state.goal, kg, execContext.apiKeys, {
        maxSteps: templateConfig.maxSteps ?? 10,
        maxDepth: 3,
        topK: 10,
      })

      log.info(
        `Retrieval complete: ${retrievalResult.context.claims.length} claims, ` +
          `${retrievalResult.context.concepts.length} concepts, ` +
          `${retrievalResult.context.mechanisms.length} mechanisms, ` +
          `${retrievalResult.nodesVisited} nodes visited in ${retrievalResult.totalDurationMs}ms`
      )

      // Merge retrieved context with existing context
      const retrievedContext = formatRetrievalContext(retrievalResult.context)
      const mergedContext = {
        ...state.context,
        ...retrievedContext,
        retrievalStrategy: retrievalResult.strategy,
        retrievalSteps: retrievalResult.steps.length,
      }

      return {
        phase: 'thesis_generation',
        cycleNumber: state.cycleNumber + 1,
        context: mergedContext,
        totalTokensUsed: 0,
        totalEstimatedCost: 0,
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error)
      log.warn('Retrieval agent failed, continuing with existing context', { error: errMsg })
      await emitPhaseEvent(execContext, 'retrieve_context', state.cycleNumber + 1, {
        warning: true,
        reason: `Retrieval failed, using existing context: ${errMsg}`,
      })
      return {
        phase: 'thesis_generation',
        cycleNumber: state.cycleNumber + 1,
        totalTokensUsed: 0,
        totalEstimatedCost: 0,
      }
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
  budget: IterationBudget
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

    // Execute all thesis agents in parallel
    const thesisPromises = thesisAgents.map(async (agent, idx) => {
      const lensConfig = config.thesisAgents[idx]
      const lens = lensConfig?.lens ?? 'custom'

      const thesisPrompt = buildThesisPrompt(state.goal, lens, state.context)

      try {
        const step = await executeAgentWithEvents(
          agent,
          thesisPrompt,
          {
            ...state.context,
            cycleNumber: state.cycleNumber,
            lens,
            phase: 'thesis_generation',
          },
          execContext,
          { stepNumber: state.steps.length + idx + 1, maxIterations: budget.perThesisAgent }
        )

        // Parse the thesis output (in production, use structured output)
        const thesis = parseThesisOutput(step.output, agent.agentId, step.model, lens)

        // Emit thesis event and record message
        await emitAgentOutput(execContext, 'dialectical_thesis', agent, step.output, {
          lens,
          cycleNumber: state.cycleNumber,
          confidence: thesis.confidence,
        })

        return { step, thesis }
      } catch (error) {
        log.error(`Thesis agent ${agent.name} failed`, error)
        return null
      }
    })

    const results = await Promise.all(thesisPromises)
    const successfulResults = results.filter((r) => r !== null)

    const newSteps = successfulResults.map((r) => r.step)
    const newTheses = successfulResults.map((r) => r.thesis)

    // Validate minimum thesis count for dialectical reasoning
    if (newTheses.length < 2) {
      const failedCount = thesisAgents.length - newTheses.length
      const errorMsg = `Thesis generation failed: only ${newTheses.length} of ${thesisAgents.length} agents succeeded (${failedCount} failed). Minimum 2 theses required for dialectical reasoning.`
      log.error(errorMsg)

      await emitPhaseEvent(execContext, 'thesis_generation', state.cycleNumber, {
        error: true,
        successCount: newTheses.length,
        failedCount,
        reason: errorMsg,
      })

      throw new Error(errorMsg)
    }

    const totalTokens = newSteps.reduce((sum, s) => sum + s.tokensUsed, 0)
    const totalCost = newSteps.reduce((sum, s) => sum + s.estimatedCost, 0)

    return {
      phase: 'cross_negation',
      theses: newTheses,
      steps: newSteps,
      totalTokensUsed: totalTokens,
      totalEstimatedCost: totalCost,
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
    } | null>[] = []

    // Each agent critiques theses from other agents
    for (let i = 0; i < thesisAgents.length && i < state.theses.length; i++) {
      const agent = thesisAgents[i]
      const thesis = state.theses[i]

      // This agent critiques the next thesis in a round-robin fashion
      const targetIdx = (i + 1) % state.theses.length
      const targetThesis = state.theses[targetIdx]

      const negationPrompt = buildNegationPrompt(thesis, targetThesis)

      negationPromises.push(
        (async () => {
          try {
            const step = await executeAgentWithEvents(
              agent,
              negationPrompt,
              {
                ...state.context,
                cycleNumber: state.cycleNumber,
                phase: 'cross_negation',
                sourceThesis: thesis,
                targetThesis: targetThesis,
              },
              execContext,
              { stepNumber: state.steps.length + i + 1, maxIterations: budget.perNegationAgent }
            )

            const negation = parseNegationOutput(step.output, agent.agentId, targetThesis.agentId)

            // Emit negation event and record message
            await emitAgentOutput(execContext, 'dialectical_negation', agent, step.output, {
              targetThesisLens: targetThesis.lens,
              cycleNumber: state.cycleNumber,
              rewriteOperator: negation.rewriteOperator,
            })

            return { step, negation }
          } catch (error) {
            const errMsg = error instanceof Error ? error.message : String(error)
            log.error(`Negation by ${agent.name} failed`, error)
            await emitPhaseEvent(execContext, 'cross_negation', state.cycleNumber, {
              warning: true,
              failedAgent: agent.name,
              reason: `Negation agent failed: ${errMsg}`,
            })
            return null
          }
        })()
      )
    }

    const results = await Promise.all(negationPromises)
    const successfulResults = results.filter((r) => r !== null)

    const newSteps = successfulResults.map((r) => r.step)
    const newNegations = successfulResults.map((r) => r.negation)

    if (newNegations.length === 0) {
      log.warn(`All ${thesisAgents.length} negation agents failed - proceeding without negations`)
      await emitPhaseEvent(execContext, 'cross_negation', state.cycleNumber, {
        warning: true,
        reason: `All ${thesisAgents.length} negation agents failed - contradiction detection will be limited`,
      })
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
  config: DialecticalWorkflowConfig
) {
  return async (state: DialecticalState): Promise<Partial<DialecticalState>> => {
    log.info(`Dialectical cycle ${state.cycleNumber}: Contradiction Crystallization phase`)

    // Emit phase transition event
    await emitPhaseEvent(execContext, 'contradiction_crystallization', state.cycleNumber, {
      thesisCount: state.theses.length,
      negationCount: state.negations.length,
    })

    // Warn if input data is empty or degraded
    if (state.negations.length === 0) {
      log.warn('Contradiction crystallization proceeding with zero negations')
      await emitPhaseEvent(execContext, 'contradiction_crystallization', state.cycleNumber, {
        warning: true,
        reason: 'No negations available - contradictions will be limited',
      })
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
      trackerContext
    )

    // Filter by action distance if configured
    const filteredContradictions =
      config.minActionDistance > 0
        ? contradictions.filter((c) => c.actionDistance <= config.minActionDistance)
        : contradictions

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

    return {
      phase: 'sublation',
      contradictions: filteredContradictions,
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
  budget: IterationBudget
) {
  return async (state: DialecticalState): Promise<Partial<DialecticalState>> => {
    log.info(`Dialectical cycle ${state.cycleNumber}: Sublation phase`)

    // Emit phase transition event
    await emitPhaseEvent(execContext, 'sublation', state.cycleNumber, {
      contradictionCount: state.contradictions.length,
      synthesisAgentCount: synthesisAgents.length,
      competitive: enableCompetitive && synthesisAgents.length > 1,
    })

    // Warn if no contradictions available for synthesis
    if (state.contradictions.length === 0) {
      log.warn('Sublation proceeding with zero contradictions - synthesis may be shallow')
      await emitPhaseEvent(execContext, 'sublation', state.cycleNumber, {
        warning: true,
        reason: 'No contradictions to resolve - synthesis will be based on theses only',
      })
    }

    // Use competitive synthesis if enabled and multiple agents available
    if (enableCompetitive && synthesisAgents.length > 1) {
      return runCompetitiveSublation(state, synthesisAgents, execContext, config)
    }

    // Fall back to single-agent synthesis
    const synthesisAgent = synthesisAgents[0]
    const sublationPrompt = buildSublationPrompt(
      state.theses,
      state.negations,
      state.contradictions
    )

    const step = await executeAgentWithEvents(
      synthesisAgent,
      sublationPrompt,
      {
        ...state.context,
        cycleNumber: state.cycleNumber,
        phase: 'sublation',
        theses: state.theses,
        negations: state.negations,
        contradictions: state.contradictions,
      },
      execContext,
      { stepNumber: state.steps.length + 1, maxIterations: budget.perSynthesisAgent }
    )

    const synthesis = parseSublationOutput(step.output)

    // Emit synthesis event and record message
    await emitAgentOutput(execContext, 'dialectical_synthesis', synthesisAgent, step.output, {
      cycleNumber: state.cycleNumber,
      operatorCount: synthesis.operators.length,
      preservedCount: synthesis.preservedElements.length,
      negatedCount: synthesis.negatedElements.length,
    })

    // Calculate conceptual velocity (rate of change in concepts)
    const velocity = calculateConceptualVelocity(state, synthesis)

    return {
      phase: 'meta_reflection',
      synthesis,
      conceptualVelocity: velocity,
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
  config: DialecticalWorkflowConfig
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

  // Calculate velocity from winning synthesis
  const velocity = calculateConceptualVelocity(state, synthesis)

  const allSteps = [...competitiveResult.steps, ...crossNegationSteps]
  const totalTokensUsed = allSteps.reduce((sum, s) => sum + s.tokensUsed, 0)
  const totalEstimatedCost = allSteps.reduce((sum, s) => sum + s.estimatedCost, 0)

  log.info(
    `Competitive synthesis complete. Winner: ${winner.agentName} (score: ${winner.scores.total.toFixed(3)})`
  )

  return {
    phase: 'meta_reflection',
    synthesis,
    conceptualVelocity: velocity,
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
        log.warn('Schema induction failed, continuing without communities', {
          error: String(error),
        })
      }
    }

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
        previousMetrics: state.cycleMetricsHistory,
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
      return {
        metaDecision: metaResult.decision,
        finalOutput: formatFinalOutput(state),
        status: 'completed',
        steps: allSteps,
        totalTokensUsed,
        totalEstimatedCost,
      }
    }

    // Handle RESPECIFY - update goal if refined
    const updatedContext =
      metaResult.decision === 'RESPECIFY' && metaResult.refinedGoal
        ? { ...state.context, originalGoal: state.goal, refinedGoal: metaResult.refinedGoal }
        : state.context

    return {
      metaDecision: metaResult.decision,
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

// ----- Routing Function -----

/**
 * Route based on meta-reflection decision
 */
function routeMetaDecision(state: DialecticalState): 'retrieve_context' | typeof END {
  if (state.metaDecision === 'TERMINATE' || state.status === 'completed') {
    return END
  }
  // CONTINUE or RESPECIFY both loop back to retrieve context
  return 'retrieve_context'
}

// ----- Graph Creation -----

/**
 * Create a dialectical workflow graph
 */
export function createDialecticalGraph(config: DialecticalGraphConfig) {
  const {
    workflow,
    dialecticalConfig,
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
  } = config

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
  }

  // Calculate iteration budget for each agent role
  const iterationBudget = calculateIterationBudget({
    workflowMaxIterations: workflow.maxIterations ?? 80,
    thesisAgents,
    synthesisAgentCount: synthesisAgents.length,
    dialecticalConfig,
    historicalData: config.historicalData,
  })
  log.info(
    `Iteration budget: thesis=${iterationBudget.perThesisAgent}, negation=${iterationBudget.perNegationAgent}, ` +
      `synthesis=${iterationBudget.perSynthesisAgent}, meta=${iterationBudget.perMetaAgent} ` +
      `(suggested total: ${iterationBudget.suggestedTotal}, configured: ${workflow.maxIterations ?? 30})`
  )

  // Initialize knowledge hypergraph (use provided or create from sessionId)
  let kg: KnowledgeHypergraph | null = knowledgeHypergraph ?? null
  if (!kg && sessionId) {
    kg = new KnowledgeHypergraph(sessionId, userId)
    log.info(`Created new KnowledgeHypergraph for session ${sessionId}`)
  }

  // Note: cycleMetricsHistory is now tracked in DialecticalStateAnnotation
  // and persisted across checkpoint restores

  // Add nodes for each phase
  graph.addNode('retrieve_context', createRetrieveContextNode(execContext, dialecticalConfig, kg))

  graph.addNode(
    'generate_theses',
    createThesisGenerationNode(thesisAgents, execContext, dialecticalConfig, iterationBudget)
  )

  graph.addNode(
    'cross_negation',
    createCrossNegationNode(thesisAgents, execContext, dialecticalConfig, iterationBudget)
  )

  graph.addNode(
    'crystallize',
    createContradictionCrystallizationNode(execContext, dialecticalConfig)
  )

  graph.addNode(
    'sublate',
    createSublationNode(
      synthesisAgents,
      execContext,
      dialecticalConfig,
      enableCompetitiveSynthesis,
      iterationBudget
    )
  )

  graph.addNode(
    'meta_reflect',
    createMetaReflectionNode(
      metaAgent,
      schemaAgent,
      execContext,
      dialecticalConfig,
      enableSchemaInduction,
      iterationBudget
    )
  )

  // Add linear edges for the 6-phase cycle
  // Note: Type assertions needed because LangGraph's strict typing requires compile-time node names
  graph.addEdge(START, 'retrieve_context' as typeof START)
  graph.addEdge('retrieve_context' as typeof START, 'generate_theses' as typeof START)
  graph.addEdge('generate_theses' as typeof START, 'cross_negation' as typeof START)
  graph.addEdge('cross_negation' as typeof START, 'crystallize' as typeof START)
  graph.addEdge('crystallize' as typeof START, 'sublate' as typeof START)
  graph.addEdge('sublate' as typeof START, 'meta_reflect' as typeof START)

  // Add conditional edge for cycle continuation
  graph.addConditionalEdges('meta_reflect' as typeof START, routeMetaDecision, {
    retrieve_context: 'retrieve_context' as typeof START,
    [END]: END,
  })

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
  context?: Record<string, unknown>
): Promise<{
  output: string
  steps: AgentExecutionStep[]
  totalTokensUsed: number
  totalEstimatedCost: number
  totalCycles: number
  conceptualVelocity: number
  contradictionsFound: number
  status: 'running' | 'completed' | 'failed' | 'paused' | 'waiting_for_input'
  // Full dialectical state for visualization
  dialecticalState: {
    cycleNumber: number
    phase: string
    theses: ThesisOutput[]
    negations: NegationOutput[]
    contradictions: ContradictionOutput[]
    synthesis: SublationOutput | null
    conceptualVelocity: number
    velocityHistory: number[]
    contradictionDensity: number
    densityHistory: number[]
    metaDecision: MetaDecision | null
    tokensUsed: number
    estimatedCost: number
    startedAtMs: number
  }
}> {
  const { workflow, userId, runId } = config
  const startedAtMs = Date.now()

  // Fetch historical iteration data for budget learning
  let historicalData: HistoricalIterationData | null = null
  try {
    historicalData = await fetchIterationHistory(userId, workflow.workflowId)
  } catch (err) {
    log.warn('Failed to fetch iteration history, using heuristic only', { error: String(err) })
  }

  const compiledGraph = createDialecticalGraph({ ...config, historicalData })

  // Initial state
  const initialState: Partial<DialecticalState> = {
    workflowId: workflow.workflowId,
    runId,
    userId,
    goal,
    context: context ?? {},
    cycleNumber: 0,
    phase: 'retrieve_context',
    theses: [],
    negations: [],
    contradictions: [],
    synthesis: null,
    conceptualVelocity: 1.0, // Start high
    contradictionDensity: 0,
    metaDecision: null,
    steps: [],
    totalTokensUsed: 0,
    totalEstimatedCost: 0,
    finalOutput: null,
    status: 'running',
    error: null,
  }

  // Execute the graph
  const finalState = await compiledGraph.invoke(initialState)

  // Write iteration usage summary for future budget learning
  try {
    const thesisAgentCount = Math.max(1, config.thesisAgents.length)
    const avgToolCount =
      config.thesisAgents.reduce((sum, a) => sum + (a.toolIds?.length ?? 0), 0) / thesisAgentCount
    // Reconstruct the budget used for this run (same params as createDialecticalGraph)
    const budgetUsed = calculateIterationBudget({
      workflowMaxIterations: workflow.maxIterations ?? 80,
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
    dialecticalState: {
      cycleNumber: finalState.cycleNumber ?? 0,
      phase: finalState.phase ?? 'meta_reflection',
      theses: finalState.theses ?? [],
      negations: finalState.negations ?? [],
      contradictions: finalState.contradictions ?? [],
      synthesis: finalState.synthesis ?? null,
      conceptualVelocity: finalState.conceptualVelocity ?? 0,
      velocityHistory: finalState.velocityHistory ?? [finalState.conceptualVelocity ?? 0],
      contradictionDensity,
      densityHistory: finalState.densityHistory ?? [contradictionDensity],
      metaDecision: finalState.metaDecision ?? null,
      tokensUsed: finalState.totalTokensUsed ?? 0,
      estimatedCost: finalState.totalEstimatedCost ?? 0,
      startedAtMs,
    },
  }
}

// ----- Helper Functions -----

function buildThesisPrompt(goal: string, lens: string, context: Record<string, unknown>): string {
  return `You are generating a thesis about the following topic from a ${lens} perspective.

TOPIC: ${goal}

CONTEXT:
${JSON.stringify(context, null, 2)}

Generate a structured thesis with:
1. CONCEPT GRAPH: Key concepts and their relationships
2. CAUSAL MODEL: Cause-effect chains
3. FALSIFICATION CRITERIA: What would disprove this thesis
4. DECISION IMPLICATIONS: What actions follow from this thesis
5. UNIT OF ANALYSIS: The primary subject of analysis
6. TEMPORAL GRAIN: Time scale of the analysis
7. REGIME ASSUMPTIONS: Conditions under which this thesis holds
8. CONFIDENCE: Your confidence level (0-1)

Respond in a structured format.`
}

function buildNegationPrompt(sourceThesis: ThesisOutput, targetThesis: ThesisOutput): string {
  return `You are critiquing a thesis using determinate negation.

YOUR THESIS:
${sourceThesis.rawText}

TARGET THESIS TO CRITIQUE:
${targetThesis.rawText}

Provide a determinate negation that:
1. INTERNAL TENSIONS: Identify contradictions within the target thesis
2. CATEGORY ATTACKS: Challenge the categories used
3. PRESERVED VALID: What should be preserved from the target thesis
4. RIVAL FRAMING: Propose an alternative framing
5. REWRITE OPERATOR: Specify a typed operator (SPLIT, MERGE, REVERSE_EDGE, ADD_MEDIATOR, SCOPE_TO_REGIME, TEMPORALIZE)
6. OPERATOR ARGS: Arguments for the operator

Do NOT simply disagree. You must specify what transformation would improve the thesis.`
}

function buildSublationPrompt(
  theses: ThesisOutput[],
  negations: NegationOutput[],
  contradictions: ContradictionOutput[]
): string {
  return `You are generating a synthesis (Aufhebung) that preserves, negates, and transcends the competing theses.

THESES:
${theses.map((t, i) => `[${i + 1}] (${t.lens}): ${t.rawText}`).join('\n\n')}

NEGATIONS:
${negations.map((n, i) => `[${i + 1}]: ${n.rawText}`).join('\n\n')}

CONTRADICTIONS:
${contradictions.map((c) => `- [${c.severity}] ${c.type}: ${c.description}`).join('\n')}

Generate a synthesis that:
1. OPERATORS: List the rewrite operators to apply
2. PRESERVED: Elements from theses that are preserved
3. NEGATED: Elements that are rejected
4. NEW CONCEPT GRAPH: Updated concept relationships
5. NEW CLAIMS: New claims that emerge from synthesis
6. NEW PREDICTIONS: Testable predictions

The synthesis must resolve at least one HIGH severity contradiction.`
}

/**
 * Extract JSON from LLM output
 * Handles both pure JSON and JSON embedded in markdown code blocks
 */
function extractJsonFromOutput(output: string): unknown | null {
  // Try to extract from markdown code block first
  const codeBlockMatch = output.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (codeBlockMatch) {
    try {
      return JSON.parse(codeBlockMatch[1].trim())
    } catch {
      // Continue to try other patterns
    }
  }

  // Try to parse the entire output as JSON
  try {
    return JSON.parse(output)
  } catch {
    // Continue to try other patterns
  }

  // Try to find JSON object in the output
  const jsonMatch = output.match(/\{[\s\S]*\}/)
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0])
    } catch {
      // Fall through to return null
    }
  }

  return null
}

function parseThesisOutput(
  output: string,
  agentId: string,
  model: string,
  lens: string
): ThesisOutput {
  // Try to parse structured output using Zod schema
  const parsed = extractJsonFromOutput(output)

  if (parsed) {
    try {
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
      log.warn('Thesis output validation failed', { error: validated.error.message })
    } catch (error) {
      log.warn('Thesis output parsing failed', { error: String(error) })
    }
  }

  // Fallback: return placeholder with raw text
  return {
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
    rawText: output,
  }
}

function parseNegationOutput(
  output: string,
  agentId: string,
  targetAgentId: string
): NegationOutput {
  // Try to parse structured output using Zod schema
  const parsed = extractJsonFromOutput(output)

  if (parsed) {
    try {
      const validated = NegationOutputSchema.safeParse(parsed)
      if (validated.success) {
        return {
          agentId,
          targetThesisAgentId: targetAgentId,
          internalTensions: validated.data.internalTensions,
          categoryAttacks: validated.data.categoryAttacks,
          preservedValid: validated.data.preservedValid,
          rivalFraming: validated.data.rivalFraming,
          rewriteOperator: validated.data.rewriteOperator,
          operatorArgs: validated.data.operatorArgs,
          rawText: output,
        }
      }
      log.warn('Negation output validation failed', { error: validated.error.message })
    } catch (error) {
      log.warn('Negation output parsing failed', { error: String(error) })
    }
  }

  // Fallback: return placeholder with raw text
  return {
    agentId,
    targetThesisAgentId: targetAgentId,
    internalTensions: [],
    categoryAttacks: [],
    preservedValid: [],
    rivalFraming: '',
    rewriteOperator: 'SPLIT',
    operatorArgs: {},
    rawText: output,
  }
}

function parseSublationOutput(output: string): SublationOutput {
  // Try to parse structured output using Zod schema
  const parsed = extractJsonFromOutput(output)

  if (parsed) {
    try {
      const validated = SublationOutputSchema.safeParse(parsed)
      if (validated.success) {
        return {
          operators: validated.data.operators,
          preservedElements: validated.data.preservedElements,
          negatedElements: validated.data.negatedElements,
          newConceptGraph: validated.data.newConceptGraph,
          newClaims: validated.data.newClaims,
          newPredictions: validated.data.newPredictions,
          schemaDiff: null,
        }
      }
      log.warn('Sublation output validation failed', { error: validated.error.message })
    } catch (error) {
      log.warn('Sublation output parsing failed', { error: String(error) })
    }
  }

  // Fallback: return placeholder
  return {
    operators: [],
    preservedElements: [],
    negatedElements: [],
    newConceptGraph: {},
    newClaims: [],
    newPredictions: [],
    schemaDiff: null,
  }
}

function extractContradictions(
  theses: ThesisOutput[],
  negations: NegationOutput[],
  config: DialecticalWorkflowConfig,
  trackerContext?: ContradictionTrackerContext
): ContradictionOutput[] {
  // Use the 4 specialized contradiction trackers
  if (trackerContext && config.enabledTrackers.length > 0) {
    const result = runContradictionTrackers(
      theses,
      negations,
      config.enabledTrackers,
      trackerContext
    )

    log.info(
      `Contradiction trackers found ${result.allContradictions.length} contradictions in ${result.totalProcessingTimeMs}ms`
    )

    return result.allContradictions
  }

  // Fallback: generate placeholder contradictions from negations
  return negations.map((n, i) => ({
    id: `c_${Date.now()}_${i}`,
    type: 'SYNCHRONIC' as const,
    severity: 'MEDIUM' as const,
    actionDistance: 2,
    participatingClaims: [n.agentId, n.targetThesisAgentId],
    trackerAgent: 'placeholder',
    description: `Contradiction identified between thesis agents`,
  }))
}

function calculateConceptualVelocity(state: DialecticalState, synthesis: SublationOutput): number {
  // Calculate rate of conceptual change
  // Higher velocity = more new concepts being introduced
  // Lower velocity = convergence, good signal to terminate

  const newConcepts = synthesis.newClaims.length + (synthesis.operators?.length ?? 0)
  const totalConcepts = state.theses.length + newConcepts

  if (totalConcepts === 0) return 0

  // Decay velocity over cycles to encourage termination
  const cycleDecay = Math.pow(0.9, state.cycleNumber)

  return Math.min(1.0, (newConcepts / Math.max(1, state.theses.length)) * cycleDecay)
}

function formatFinalOutput(state: DialecticalState): string {
  const parts: string[] = []

  parts.push(`# Dialectical Analysis Complete`)
  parts.push(`\n## Summary`)
  parts.push(`- Cycles completed: ${state.cycleNumber}`)
  parts.push(`- Theses generated: ${state.theses.length}`)
  parts.push(`- Contradictions found: ${state.contradictions.length}`)
  parts.push(`- Final velocity: ${state.conceptualVelocity.toFixed(2)}`)

  if (state.synthesis) {
    parts.push(`\n## Synthesis`)
    parts.push(`Preserved elements: ${state.synthesis.preservedElements.length}`)
    parts.push(`Negated elements: ${state.synthesis.negatedElements.length}`)
    parts.push(`New claims: ${state.synthesis.newClaims.length}`)
  }

  parts.push(`\n## Key Theses`)
  state.theses.slice(0, 3).forEach((t, i) => {
    parts.push(`\n### Thesis ${i + 1} (${t.lens})`)
    parts.push(t.rawText)
  })

  if (state.contradictions.length > 0) {
    parts.push(`\n## Key Contradictions`)
    state.contradictions.slice(0, 5).forEach((c, i) => {
      parts.push(`${i + 1}. [${c.severity}] ${c.type}: ${c.description}`)
    })
  }

  return parts.join('\n')
}
