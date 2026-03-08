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
import { SUBLATION_OUTPUT_EXAMPLE, SYNTHESIS_NEGATION_EXAMPLE } from './shared/fewShotExamples.js'

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
      throw new Error(
        `Synthesis agent ${agent.name} failed: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  })

  const candidates = await Promise.all(candidatePromises)

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
      throw new Error(`Agent not found for cross-negation: ${sourceSynthesis.agentId}`)
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
      throw new Error(
        `Synthesis negation by ${agent.name} failed: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  })

  const results = await Promise.all(negationPromises)
  const negations = results.map((r) => r.negation)
  const steps = results.map((r) => r.step)

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

  // Parsimony: fewer operators = higher score, but zero operators is penalized
  // (a synthesis that changes nothing is not parsimonious — it's inert)
  const operatorCount = synthesis.operators?.length ?? 0
  const parsimony =
    operatorCount === 0
      ? 0.2
      : operatorCount <= MAX_OPERATORS_THRESHOLD
        ? 1 - operatorCount / MAX_OPERATORS_THRESHOLD
        : Math.max(0, 0.5 - (operatorCount - MAX_OPERATORS_THRESHOLD) * 0.1)

  // Scope: more preserved elements and resolved contradictions = higher score
  const totalElements = theses.reduce((sum, t) => {
    if (t.graph) {
      // Graph-native: count nodes + edges as total addressable elements
      return sum + t.graph.nodes.length + t.graph.edges.length
    }
    // Legacy: concept graph keys + falsification criteria + decision implications
    return (
      sum +
      Math.max(
        Object.keys(t.conceptGraph).length +
          t.falsificationCriteria.length +
          t.decisionImplications.length,
        1 // Ensure at least 1 per thesis
      )
    )
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
  // Weight contradiction resolution more heavily than preservation:
  // a synthesis that keeps many elements but fails to resolve tensions
  // should not outrank one that actually advances the dialectic.
  const scope = 0.2 * preservationRate + 0.8 * resolutionRate

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
    // 1. A resolution-appropriate operator targets one of the participating claims
    //    (SPLIT/TEMPORALIZE don't resolve contradictions — they restructure)
    // 2. The contradiction is explicitly mentioned as resolved in schemaDiff
    const RESOLUTION_OPERATORS = new Set([
      'MERGE',
      'ADD_MEDIATOR',
      'REVERSE_EDGE',
      'SCOPE_TO_REGIME',
    ])
    const isTargeted = operators.some(
      (op) => participatingClaims.includes(op.target) && RESOLUTION_OPERATORS.has(op.type)
    )

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

  // Use compact graphs if available, fall back to truncated rawText
  const thesesRepr = theses
    .map((t, i) => {
      if (t.graph) return `[${i + 1}] (${t.lens}): ${JSON.stringify(t.graph)}`
      return `[${i + 1}] (${t.lens}): ${t.rawText.length > 3000 ? t.rawText.slice(0, 3000) + '\n[...truncated]' : t.rawText}`
    })
    .join('\n\n')

  const negationsRepr = negations
    .map(
      (n, i) =>
        `[${i + 1}]: tensions=${JSON.stringify(n.internalTensions)}, attacks=${JSON.stringify(n.categoryAttacks)}, operator=${n.rewriteOperator}`
    )
    .join('\n')

  return `CRITICAL: Output ONLY a valid JSON object. No markdown fences, no explanation, no preamble.

## Role
You are a competitive synthesis agent performing Aufhebung — merging thesis graphs into a single evolved knowledge graph.

## Strategy: ${strategy}
${
  strategy === 'PARSIMONY'
    ? 'Optimize for simplicity: minimize node count, prefer clean edge structures, resolve the highest-impact contradictions first.'
    : 'Optimize for completeness: resolve as many contradictions as possible, preserve all valid nodes, maximize evidence coverage.'
}

## Thesis Graphs
${thesesRepr}

## Negations
${negationsRepr}

## Contradictions to Resolve
${contradictions.map((c) => `- [${c.id}] ${c.severity} ${c.type}: ${c.description}`).join('\n')}

## Output Schema
{
  "mergedGraph": {
    "nodes": [{"id": "n1", "label": "<=80 chars", "type": "claim|concept|mechanism|prediction", "note": "optional <=150 chars"}],
    "edges": [{"from": "n1", "to": "n2", "rel": "causes|contradicts|supports|mediates|scopes", "weight": 0.0-1.0}],
    "summary": "<=200 char headline of the synthesis",
    "reasoning": "<=500 chars synthesizing qualitative insights from all theses",
    "confidence": 0.0-1.0,
    "regime": "Conditions under which this synthesis holds",
    "temporalGrain": "Time scale of analysis"
  },
  "diff": {
    "addedNodes": ["IDs of nodes added"],
    "removedNodes": ["IDs of nodes removed"],
    "addedEdges": [{"from": "n1", "to": "n2", "rel": "causes"}],
    "removedEdges": [],
    "modifiedNodes": [],
    "resolvedContradictions": ["Descriptions of contradictions resolved"],
    "newContradictions": ["Descriptions of new contradictions discovered"]
  },
  "resolvedContradictions": ["Which input contradictions were resolved and how"]
}

## Example Output
${SUBLATION_OUTPUT_EXAMPLE}

## Rules
1. Merge all thesis graphs into one coherent graph.
2. Resolve contradictions by replacing 'contradicts' edges with 'mediates' or 'supports' edges where evidence permits.
3. The reasoning field must synthesize qualitative insights from all thesis reasonings — not repeat one.
4. If you are uncertain about a resolution, note the remaining uncertainty in the relevant node's "note" field.
${contradictions.length > 0 ? '5. You MUST resolve at least one HIGH-severity contradiction.' : '5. Focus on integrating the strongest elements from all theses.'}

CRITICAL (restated): Output ONLY the JSON object. No other text.`
}

function buildSynthesisNegationPrompt(
  sourceSynthesis: ScoredSynthesis,
  targetSynthesis: ScoredSynthesis,
  theses: ThesisOutput[]
): string {
  // Use graph nodes as key concepts when available
  const thesesRepr = theses
    .map((t, i) => {
      if (t.graph) return `[${i + 1}] ${t.lens}: ${t.graph.summary} (${t.graph.nodes.length} nodes)`
      return `[${i + 1}] ${t.lens}: Key concepts: ${Object.keys(t.conceptGraph).slice(0, 5).join(', ')}`
    })
    .join('\n')

  return `CRITICAL: Output ONLY a valid JSON object. No markdown fences, no explanation.

## Role
You are a synthesis critic evaluating a competing synthesis candidate. Your goal is to identify genuine weaknesses, not to validate.

## Your Synthesis (${sourceSynthesis.agentName})
Score: parsimony=${sourceSynthesis.scores.parsimony.toFixed(2)}, scope=${sourceSynthesis.scores.scope.toFixed(2)}
Operators: ${JSON.stringify(sourceSynthesis.synthesis.operators)}
Preserved: ${sourceSynthesis.synthesis.preservedElements.join(', ')}
Contradictions resolved: ${sourceSynthesis.contradictionsResolved.join(', ')}

## Target Synthesis to Critique (${targetSynthesis.agentName})
Score: parsimony=${targetSynthesis.scores.parsimony.toFixed(2)}, scope=${targetSynthesis.scores.scope.toFixed(2)}
${targetSynthesis.rawText}

## Original Theses
${thesesRepr}

## Task
Critique the target synthesis. Identify what it missed, what it overclaimed, and what specific transformations would improve it.

## Output Schema
{
  "critiques": ["Specific issues with the target synthesis, referencing concrete nodes or claims"],
  "missingElements": ["Elements from the original theses that should have been preserved but were lost"],
  "overreaches": ["Claims or operators in the target that go beyond what the evidence supports"],
  "proposedRefinements": [
    {"type": "SPLIT|MERGE|REVERSE_EDGE|ADD_MEDIATOR|SCOPE_TO_REGIME|TEMPORALIZE", "target": "concept or claim ID", "args": {}, "rationale": "Why this transformation improves the synthesis"}
  ]
}

## Evaluation Priorities
1. Missing preservation: Valid thesis elements that the target synthesis dropped.
2. Unresolved contradictions: HIGH-severity contradictions the target failed to address.
3. Unnecessary operators: Transformations that add complexity without resolving a real problem.
4. Unsupported claims: New claims in the synthesis not grounded in the original theses.
5. Prioritize accuracy over validation — flag genuine weaknesses.

## Example Output
${SYNTHESIS_NEGATION_EXAMPLE}

CRITICAL (restated): Output ONLY the JSON object. No other text.`
}

// ----- Parsers -----

function parseSynthesisOutput(output: string): SublationOutput {
  const codeBlockMatch = output.match(/```(?:json)?\s*([\s\S]*?)```/)
  const jsonMatch = codeBlockMatch ? codeBlockMatch[1].trim() : output.match(/\{[\s\S]*\}/)?.[0]
  if (!jsonMatch) {
    throw new Error('Synthesis output did not contain JSON')
  }

  const parsed = JSON.parse(jsonMatch)

  if (parsed.mergedGraph?.nodes && parsed.diff) {
    const graph = parsed.mergedGraph
    const diff = parsed.diff
    return {
      operators: [],
      preservedElements: diff.addedNodes ?? [],
      negatedElements: diff.removedNodes ?? [],
      newConceptGraph: {},
      newClaims: (graph.nodes ?? [])
        .filter((n: { type: string }) => n.type === 'claim')
        .map((n: { id: string; label: string }) => ({
          id: n.id,
          text: n.label,
          confidence: graph.confidence ?? 0.7,
        })),
      newPredictions: (graph.nodes ?? [])
        .filter((n: { type: string }) => n.type === 'prediction')
        .map((n: { id: string; label: string }) => ({ id: n.id, text: n.label, threshold: 'TBD' })),
      schemaDiff: {
        resolvedContradictions: parsed.resolvedContradictions ?? diff.resolvedContradictions ?? [],
      },
    }
  }

  if (!Array.isArray(parsed.operators)) {
    throw new Error('Synthesis output did not contain operators or mergedGraph')
  }

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

function parseSynthesisNegation(
  output: string,
  sourceAgentId: string,
  targetCandidateId: string
): SynthesisNegation {
  const jsonMatch = output.match(/\{[\s\S]*\}/)?.[0]
  if (!jsonMatch) {
    throw new Error(`Synthesis negation from ${sourceAgentId} did not contain JSON`)
  }

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

// ----- Exports -----

export { PARSIMONY_WEIGHT, SCOPE_WEIGHT, NOVELTY_WEIGHT, MAX_OPERATORS_THRESHOLD }
