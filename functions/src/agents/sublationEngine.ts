/**
 * Sublation Engine
 *
 * Implements competitive synthesis for the Hegelian dialectical system.
 * Multiple synthesis candidates are generated and scored based on:
 * - Parsimony: Fewer operators and simpler structure wins
 * - Scope: More contradictions resolved and claims preserved wins
 *
 * The engine also supports cross-negation of syntheses for deeper refinement.
 */

import type {
  AgentConfig,
  AgentExecutionStep,
  SublationOutput,
  ThesisOutput,
  NegationOutput,
  ContradictionOutput,
  RewriteOperator,
  DialecticalWorkflowConfig,
  ModelProvider,
} from '@lifeos/agents'
import { executeAgentWithEvents, type AgentExecutionContext } from './langgraph/utils.js'
import { createLogger } from '../lib/logger.js'

const log = createLogger('SublationEngine')

// ----- Configuration Constants -----

/** Weight for parsimony in synthesis scoring (0-1) */
const PARSIMONY_WEIGHT = 0.4
/** Weight for scope in synthesis scoring (0-1) */
const SCOPE_WEIGHT = 0.4
/** Weight for novelty in synthesis scoring (0-1) */
const NOVELTY_WEIGHT = 0.2
/** Maximum number of operators before parsimony penalty */
const MAX_OPERATORS_THRESHOLD = 5

// ----- Types -----

/**
 * A synthesis candidate with metadata
 */
export interface SynthesisCandidate {
  candidateId: string
  agentId: string
  agentName: string
  model: string
  provider: ModelProvider
  synthesis: SublationOutput
  rawText: string
  step: AgentExecutionStep
}

/**
 * Scored synthesis candidate
 */
export interface ScoredSynthesis extends SynthesisCandidate {
  scores: {
    parsimony: number // 0-1, higher = simpler
    scope: number // 0-1, higher = more resolved
    novelty: number // 0-1, higher = more new concepts
    total: number // Weighted combination
  }
  contradictionsResolved: string[]
  claimsPreserved: number
  claimsNegated: number
}

/**
 * Result of competitive synthesis
 */
export interface CompetitiveSynthesisResult {
  winner: ScoredSynthesis
  candidates: ScoredSynthesis[]
  steps: AgentExecutionStep[]
  totalTokensUsed: number
  totalEstimatedCost: number
}

/**
 * Cross-negation result for syntheses
 */
export interface SynthesisCrossNegationResult {
  originalSyntheses: ScoredSynthesis[]
  negations: SynthesisNegation[]
  refinedSyntheses: ScoredSynthesis[]
  steps: AgentExecutionStep[]
  totalTokensUsed: number
  totalEstimatedCost: number
}

/**
 * Negation of a synthesis by another synthesis agent
 */
export interface SynthesisNegation {
  sourceAgentId: string
  targetCandidateId: string
  critiques: string[]
  missingElements: string[]
  overreaches: string[]
  proposedRefinements: RewriteOperator[]
  rawText: string
}

// ----- Competitive Synthesis -----

/**
 * Generate multiple synthesis candidates and select the best one
 */
export async function runCompetitiveSynthesis(
  theses: ThesisOutput[],
  negations: NegationOutput[],
  contradictions: ContradictionOutput[],
  synthesisAgents: AgentConfig[],
  execContext: AgentExecutionContext,
  config: DialecticalWorkflowConfig,
  cycleNumber: number,
  baseStepCount: number
): Promise<CompetitiveSynthesisResult> {
  log.info('Running competitive synthesis', {
    agentCount: synthesisAgents.length,
    contradictionCount: contradictions.length,
  })

  // Generate synthesis candidates in parallel
  const candidatePromises = synthesisAgents.map(async (agent, idx) => {
    const prompt = buildCompetitiveSynthesisPrompt(
      theses,
      negations,
      contradictions,
      idx,
      synthesisAgents.length
    )

    try {
      const step = await executeAgentWithEvents(
        agent,
        prompt,
        {
          cycleNumber,
          phase: 'sublation',
          strategy: config.sublationStrategy,
          contradictionCount: contradictions.length,
        },
        execContext,
        { stepNumber: baseStepCount + idx + 1 }
      )

      const synthesis = parseSynthesisOutput(step.output)
      const candidate: SynthesisCandidate = {
        candidateId: `synth_${cycleNumber}_${idx}`,
        agentId: agent.agentId,
        agentName: agent.name,
        model: step.model,
        provider: step.provider as ModelProvider,
        synthesis,
        rawText: step.output,
        step,
      }

      return candidate
    } catch (error) {
      log.error('Synthesis agent failed', error, { agentName: agent.name })
      return null
    }
  })

  const results = await Promise.all(candidatePromises)
  const candidates = results.filter((r): r is SynthesisCandidate => r !== null)

  if (candidates.length === 0) {
    throw new Error('All synthesis agents failed')
  }

  // Score each candidate
  const scoredCandidates = candidates.map((c) => scoreSynthesisCandidate(c, theses, contradictions))

  // Sort by total score (descending)
  scoredCandidates.sort((a, b) => b.scores.total - a.scores.total)

  const steps = candidates.map((c) => c.step)
  const totalTokensUsed = steps.reduce((sum, s) => sum + s.tokensUsed, 0)
  const totalEstimatedCost = steps.reduce((sum, s) => sum + s.estimatedCost, 0)

  log.info('Competitive synthesis complete', {
    winner: scoredCandidates[0].agentName,
    score: scoredCandidates[0].scores.total,
    candidateCount: scoredCandidates.length,
  })

  return {
    winner: scoredCandidates[0],
    candidates: scoredCandidates,
    steps,
    totalTokensUsed,
    totalEstimatedCost,
  }
}

// ----- Cross-Negation of Syntheses -----

/**
 * Have synthesis agents critique each other's syntheses for refinement
 */
export async function runSynthesisCrossNegation(
  scoredSyntheses: ScoredSynthesis[],
  theses: ThesisOutput[],
  contradictions: ContradictionOutput[],
  synthesisAgents: AgentConfig[],
  execContext: AgentExecutionContext,
  cycleNumber: number,
  baseStepCount: number
): Promise<SynthesisCrossNegationResult> {
  if (scoredSyntheses.length < 2) {
    log.info('Skipping cross-negation: fewer than 2 syntheses')
    return {
      originalSyntheses: scoredSyntheses,
      negations: [],
      refinedSyntheses: scoredSyntheses,
      steps: [],
      totalTokensUsed: 0,
      totalEstimatedCost: 0,
    }
  }

  log.info('Running cross-negation', { synthesisCount: scoredSyntheses.length })

  // Each agent critiques the next synthesis in round-robin
  const negationPromises = scoredSyntheses.map(async (sourceSynthesis, idx) => {
    const targetIdx = (idx + 1) % scoredSyntheses.length
    const targetSynthesis = scoredSyntheses[targetIdx]

    // Find the corresponding agent
    const agent = synthesisAgents.find((a) => a.agentId === sourceSynthesis.agentId)
    if (!agent) {
      log.warn('Agent not found for cross-negation', { agentId: sourceSynthesis.agentId })
      return null
    }

    const prompt = buildSynthesisNegationPrompt(sourceSynthesis, targetSynthesis, theses)

    try {
      const step = await executeAgentWithEvents(
        agent,
        prompt,
        {
          cycleNumber,
          phase: 'sublation',
          subphase: 'cross_negation',
          sourceId: sourceSynthesis.candidateId,
          targetId: targetSynthesis.candidateId,
        },
        execContext,
        { stepNumber: baseStepCount + idx + 1 }
      )

      const negation = parseSynthesisNegation(
        step.output,
        sourceSynthesis.agentId,
        targetSynthesis.candidateId
      )

      return { negation, step }
    } catch (error) {
      log.error('Synthesis negation failed', error, { agentName: agent.name })
      return null
    }
  })

  const results = await Promise.all(negationPromises)
  const successfulResults = results.filter(
    (r): r is { negation: SynthesisNegation; step: AgentExecutionStep } => r !== null
  )

  const negations = successfulResults.map((r) => r.negation)
  const steps = successfulResults.map((r) => r.step)

  // Refine syntheses based on negations
  const refinedSyntheses = refineSyntheses(scoredSyntheses, negations, theses, contradictions)

  // Re-sort by total score
  refinedSyntheses.sort((a, b) => b.scores.total - a.scores.total)

  const totalTokensUsed = steps.reduce((sum, s) => sum + s.tokensUsed, 0)
  const totalEstimatedCost = steps.reduce((sum, s) => sum + s.estimatedCost, 0)

  return {
    originalSyntheses: scoredSyntheses,
    negations,
    refinedSyntheses,
    steps,
    totalTokensUsed,
    totalEstimatedCost,
  }
}

// ----- Scoring Functions -----

/**
 * Score a synthesis candidate on parsimony, scope, and novelty
 */
function scoreSynthesisCandidate(
  candidate: SynthesisCandidate,
  theses: ThesisOutput[],
  contradictions: ContradictionOutput[]
): ScoredSynthesis {
  const synthesis = candidate.synthesis

  // Parsimony: fewer operators = higher score
  const operatorCount = synthesis.operators?.length ?? 0
  const parsimony =
    operatorCount <= MAX_OPERATORS_THRESHOLD
      ? 1 - operatorCount / MAX_OPERATORS_THRESHOLD
      : Math.max(0, 0.5 - (operatorCount - MAX_OPERATORS_THRESHOLD) * 0.1)

  // Scope: more preserved elements and resolved contradictions = higher score
  const totalElements = theses.reduce((sum, t) => {
    const graphSize = Object.keys(t.conceptGraph).length
    const claimCount = t.falsificationCriteria.length + t.decisionImplications.length
    return sum + graphSize + claimCount
  }, 0)

  const preservedCount = synthesis.preservedElements.length
  const negatedCount = synthesis.negatedElements.length
  const claimsPreserved = preservedCount
  const claimsNegated = negatedCount

  // Calculate which contradictions are resolved
  const contradictionsResolved = findResolvedContradictions(synthesis, contradictions)
  const resolutionRate =
    contradictions.length > 0 ? contradictionsResolved.length / contradictions.length : 1

  // Scope combines preservation and resolution
  const preservationRate = totalElements > 0 ? preservedCount / totalElements : 0.5
  const scope = 0.4 * preservationRate + 0.6 * resolutionRate

  // Novelty: new claims and predictions
  const newClaimsCount = synthesis.newClaims?.length ?? 0
  const newPredictionsCount = synthesis.newPredictions?.length ?? 0
  const novelty = Math.min(1, (newClaimsCount + newPredictionsCount) / 10)

  // Total weighted score
  const total = PARSIMONY_WEIGHT * parsimony + SCOPE_WEIGHT * scope + NOVELTY_WEIGHT * novelty

  return {
    ...candidate,
    scores: {
      parsimony,
      scope,
      novelty,
      total,
    },
    contradictionsResolved,
    claimsPreserved,
    claimsNegated,
  }
}

/**
 * Find which contradictions a synthesis resolves
 */
function findResolvedContradictions(
  synthesis: SublationOutput,
  contradictions: ContradictionOutput[]
): string[] {
  const resolved: string[] = []

  for (const contradiction of contradictions) {
    // Check if synthesis operators address this contradiction
    const operators = synthesis.operators ?? []
    const participatingClaims = contradiction.participatingClaims

    // A contradiction is "resolved" if:
    // 1. An operator targets one of the participating claims
    // 2. The contradiction is explicitly mentioned as resolved in schemaDiff
    const isTargeted = operators.some((op) => participatingClaims.includes(op.target))

    // Check schema diff for explicit resolution
    const schemaDiff = synthesis.schemaDiff ?? {}
    const isExplicitlyResolved =
      (schemaDiff as { resolvedContradictions?: string[] }).resolvedContradictions?.includes(
        contradiction.id
      ) ?? false

    if (isTargeted || isExplicitlyResolved) {
      resolved.push(contradiction.id)
    }
  }

  return resolved
}

/**
 * Refine syntheses based on cross-negation feedback
 */
function refineSyntheses(
  originals: ScoredSynthesis[],
  negations: SynthesisNegation[],
  theses: ThesisOutput[],
  contradictions: ContradictionOutput[]
): ScoredSynthesis[] {
  return originals.map((original) => {
    // Find negations targeting this synthesis
    const targetingNegations = negations.filter((n) => n.targetCandidateId === original.candidateId)

    if (targetingNegations.length === 0) {
      return original
    }

    // Apply refinements from negations
    const refinedSynthesis = applySynthesisRefinements(original.synthesis, targetingNegations)

    // Re-score with refined synthesis
    const refinedCandidate: SynthesisCandidate = {
      ...original,
      synthesis: refinedSynthesis,
    }

    return scoreSynthesisCandidate(refinedCandidate, theses, contradictions)
  })
}

/**
 * Apply refinements from negations to a synthesis
 */
function applySynthesisRefinements(
  synthesis: SublationOutput,
  negations: SynthesisNegation[]
): SublationOutput {
  // Collect all proposed refinements
  const allRefinements = negations.flatMap((n) => n.proposedRefinements)
  const allMissingElements = negations.flatMap((n) => n.missingElements)
  const allOverreaches = negations.flatMap((n) => n.overreaches)

  // Merge operators, avoiding duplicates
  const existingOperatorKeys = new Set(synthesis.operators.map((op) => `${op.type}:${op.target}`))

  const newOperators = allRefinements.filter(
    (op) => !existingOperatorKeys.has(`${op.type}:${op.target}`)
  )

  // Add missing elements to preserved
  const existingPreserved = new Set(synthesis.preservedElements)
  const newPreserved = allMissingElements.filter((e) => !existingPreserved.has(e))

  // Remove overreaches from claims
  const overreachSet = new Set(allOverreaches)
  const filteredClaims = synthesis.newClaims.filter(
    (c) => !overreachSet.has(c.text) && !overreachSet.has(c.id)
  )

  return {
    ...synthesis,
    operators: [...synthesis.operators, ...newOperators],
    preservedElements: [...synthesis.preservedElements, ...newPreserved],
    newClaims: filteredClaims,
  }
}

// ----- Prompt Builders -----

function buildCompetitiveSynthesisPrompt(
  theses: ThesisOutput[],
  negations: NegationOutput[],
  contradictions: ContradictionOutput[],
  agentIndex: number,
  totalAgents: number
): string {
  const strategy = agentIndex < totalAgents / 2 ? 'PARSIMONY' : 'SCOPE'

  return `You are generating a synthesis (Aufhebung) that preserves, negates, and transcends the competing theses.

STRATEGY: ${strategy}
${
  strategy === 'PARSIMONY'
    ? 'Prioritize simplicity: use as few rewrite operators as possible while still resolving key contradictions.'
    : 'Prioritize completeness: resolve as many contradictions as possible while preserving valuable elements.'
}

THESES:
${theses.map((t, i) => `[${i + 1}] (${t.lens}): ${t.rawText}`).join('\n\n')}

NEGATIONS:
${negations.map((n, i) => `[${i + 1}]: ${n.rawText}`).join('\n\n')}

CONTRADICTIONS TO RESOLVE:
${contradictions.map((c) => `- [${c.id}] ${c.severity} ${c.type}: ${c.description}`).join('\n')}

Generate a synthesis with the following JSON structure:
{
  "operators": [
    {"type": "SPLIT|MERGE|REVERSE_EDGE|ADD_MEDIATOR|SCOPE_TO_REGIME|TEMPORALIZE", "target": "concept_name", "args": {}, "rationale": "why this operator"}
  ],
  "preservedElements": ["elements from theses that are kept"],
  "negatedElements": ["elements that are rejected"],
  "newConceptGraph": {"concept": ["related_concepts"]},
  "newClaims": [{"id": "claim_1", "text": "claim text", "confidence": 0.8}],
  "newPredictions": [{"id": "pred_1", "text": "testable prediction", "threshold": "success criteria"}],
  "resolvedContradictionIds": ["c_id1", "c_id2"]
}

Your synthesis MUST:
1. Use typed rewrite operators (no free-text transformations)
2. Explicitly list which contradictions are resolved
3. Preserve valid elements from all theses
4. Generate at least one testable prediction`
}

function buildSynthesisNegationPrompt(
  sourceSynthesis: ScoredSynthesis,
  targetSynthesis: ScoredSynthesis,
  theses: ThesisOutput[]
): string {
  return `You are critiquing another synthesis candidate to identify areas for improvement.

YOUR SYNTHESIS (${sourceSynthesis.agentName}):
Score: parsimony=${sourceSynthesis.scores.parsimony.toFixed(2)}, scope=${sourceSynthesis.scores.scope.toFixed(2)}
Operators: ${JSON.stringify(sourceSynthesis.synthesis.operators)}
Preserved: ${sourceSynthesis.synthesis.preservedElements.join(', ')}
Contradictions resolved: ${sourceSynthesis.contradictionsResolved.join(', ')}

TARGET SYNTHESIS TO CRITIQUE (${targetSynthesis.agentName}):
Score: parsimony=${targetSynthesis.scores.parsimony.toFixed(2)}, scope=${targetSynthesis.scores.scope.toFixed(2)}
${targetSynthesis.rawText}

ORIGINAL THESES:
${theses.map((t, i) => `[${i + 1}] ${t.lens}: Key concepts: ${Object.keys(t.conceptGraph).slice(0, 5).join(', ')}`).join('\n')}

Provide a critique with the following JSON structure:
{
  "critiques": ["specific issues with the target synthesis"],
  "missingElements": ["elements from theses that should have been preserved"],
  "overreaches": ["claims or operators that go beyond what the evidence supports"],
  "proposedRefinements": [
    {"type": "SPLIT|MERGE|...", "target": "concept", "args": {}, "rationale": "improvement reason"}
  ]
}

Focus on:
1. Missing preservation of valid thesis elements
2. Contradictions that remain unresolved
3. Operators that are unnecessary or harmful
4. Claims that lack support from the original theses`
}

// ----- Parsers -----

function parseSynthesisOutput(output: string): SublationOutput {
  try {
    // Try to extract JSON from the output
    const jsonMatch = output.match(/\{[\s\S]*\}/)?.[0]
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch)
      return {
        operators: parsed.operators ?? [],
        preservedElements: parsed.preservedElements ?? [],
        negatedElements: parsed.negatedElements ?? [],
        newConceptGraph: parsed.newConceptGraph ?? {},
        newClaims: parsed.newClaims ?? [],
        newPredictions: parsed.newPredictions ?? [],
        schemaDiff: {
          resolvedContradictions: parsed.resolvedContradictionIds ?? [],
        },
      }
    }
  } catch (error) {
    log.warn('Failed to parse synthesis JSON, using defaults', { error })
  }

  // Return empty synthesis if parsing fails
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

function parseSynthesisNegation(
  output: string,
  sourceAgentId: string,
  targetCandidateId: string
): SynthesisNegation {
  try {
    const jsonMatch = output.match(/\{[\s\S]*\}/)?.[0]
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch)
      return {
        sourceAgentId,
        targetCandidateId,
        critiques: parsed.critiques ?? [],
        missingElements: parsed.missingElements ?? [],
        overreaches: parsed.overreaches ?? [],
        proposedRefinements: parsed.proposedRefinements ?? [],
        rawText: output,
      }
    }
  } catch (error) {
    log.warn('Failed to parse synthesis negation JSON', { error })
  }

  return {
    sourceAgentId,
    targetCandidateId,
    critiques: [],
    missingElements: [],
    overreaches: [],
    proposedRefinements: [],
    rawText: output,
  }
}

// ----- Exports -----

export { PARSIMONY_WEIGHT, SCOPE_WEIGHT, NOVELTY_WEIGHT, MAX_OPERATORS_THRESHOLD }
