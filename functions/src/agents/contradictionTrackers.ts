/**
 * Contradiction Trackers
 *
 * Four specialized trackers for detecting different types of contradictions
 * in the dialectical reasoning cycle:
 *
 * 1. LOGIC Tracker: Detects formal logical contradictions (A ∧ ¬A)
 * 2. PRAGMATIC Tracker: Detects action/decision incompatibilities
 * 3. SEMANTIC Tracker: Detects equivocation and term ambiguity
 * 4. BOUNDARY Tracker: Detects regime/context mismatches
 *
 * Each tracker analyzes theses and negations to identify contradictions
 * that require resolution through sublation.
 */

import type {
  ThesisOutput,
  NegationOutput,
  ContradictionOutput,
  ContradictionTrackerType,
  AgentId,
  AgentConfig,
} from '@lifeos/agents'
import { createLogger } from '../lib/logger.js'
import type { ProviderKeys } from './providerService.js'
import { executeWithProvider } from './providerService.js'

const log = createLogger('ContradictionTrackers')

// ----- Configuration Constants -----

/** Jaccard similarity threshold below which concepts are considered semantically different */
const SEMANTIC_SIMILARITY_THRESHOLD = 0.2

/** Temporal grain level difference threshold for boundary contradictions */
const TEMPORAL_BOUNDARY_THRESHOLD = 2

/** Temperature for judge LLM (low for consistency) */
const JUDGE_TEMPERATURE = 0.1

// ----- Type Helpers -----

/**
 * Create a system agent ID for internal agents
 * These are ephemeral agents used for verification, not persisted
 */
function createSystemAgentId(name: string): AgentId {
  return `system_${name}` as AgentId
}

// ----- Tracker Interface -----

export interface ContradictionTrackerResult {
  trackerId: string
  trackerType: ContradictionTrackerType
  contradictions: ContradictionOutput[]
  processingTimeMs: number
}

export interface ContradictionTrackerContext {
  sessionId: string
  userId: string
  cycleNumber: number
  apiKeys: ProviderKeys
}

// ----- Shared Utilities -----

/**
 * Calculate action distance using BFS in a simplified claim graph
 * Lower distance = contradiction closer to actionable decisions
 */
export function calculateActionDistance(
  participatingClaims: string[],
  decisionImplications: Map<string, string[]>
): number {
  // If any claim directly implies an action, distance is 1
  for (const claimId of participatingClaims) {
    const implications = decisionImplications.get(claimId) ?? []
    if (implications.length > 0) {
      return 1
    }
  }

  // Default distance if no direct action implications found
  // Lower is higher priority
  return 3
}

/**
 * Generate a unique contradiction ID
 */
function generateContradictionId(
  trackerType: ContradictionTrackerType,
  index: number,
  cycleNumber: number
): string {
  return `contra_${trackerType.toLowerCase()}_c${cycleNumber}_${index}_${Date.now()}`
}

// ----- Logic Tracker -----

/**
 * LOGIC Tracker: Detects formal logical contradictions
 *
 * Looks for:
 * - Direct negations (A and ¬A)
 * - Incompatible predicates on same subject
 * - Contradictory causal claims
 */
export function runLogicTracker(
  theses: ThesisOutput[],
  negations: NegationOutput[],
  context: ContradictionTrackerContext,
  agentClaimMapping?: Record<string, string[]>
): ContradictionTrackerResult {
  const startTime = Date.now()
  const contradictions: ContradictionOutput[] = []

  // Build claim map from theses
  const claimsByAgent = new Map<string, ThesisOutput>()
  const causalStatements = new Map<string, string[]>()
  const conceptAssertions = new Map<string, Map<string, string[]>>() // concept -> agent -> assertions

  for (const thesis of theses) {
    claimsByAgent.set(thesis.agentId, thesis)

    // Index causal claims for contradiction detection (causalModel is string[] of statements)
    causalStatements.set(thesis.agentId, thesis.causalModel)

    // Index concept assertions
    for (const [concept, relations] of Object.entries(thesis.conceptGraph)) {
      if (!conceptAssertions.has(concept)) {
        conceptAssertions.set(concept, new Map())
      }
      const agentAssertions = conceptAssertions.get(concept)!
      agentAssertions.set(thesis.agentId, relations as string[])
    }
  }

  // Check for direct contradictions in causal statements
  let contraIndex = 0
  for (const [agentId1, statements1] of causalStatements.entries()) {
    for (const [agentId2, statements2] of causalStatements.entries()) {
      if (agentId1 >= agentId2) continue // Avoid duplicates

      for (const stmt1 of statements1) {
        for (const stmt2 of statements2) {
          const stmt1Lower = stmt1.toLowerCase()
          const stmt2Lower = stmt2.toLowerCase()

          // Check for contradictory statements (simple heuristic)
          const hasOpposingTerms =
            (stmt1Lower.includes('increase') && stmt2Lower.includes('decrease')) ||
            (stmt1Lower.includes('decrease') && stmt2Lower.includes('increase')) ||
            (stmt1Lower.includes('not ') !== stmt2Lower.includes('not ') &&
              stmt1Lower.replace('not ', '') === stmt2Lower.replace('not ', ''))

          if (hasOpposingTerms) {
            contradictions.push({
              id: generateContradictionId('LOGIC', contraIndex++, context.cycleNumber),
              type: 'SYNCHRONIC',
              severity: 'MEDIUM',
              actionDistance: 2,
              participatingClaims: [
                ...(agentClaimMapping?.[agentId1] ?? [agentId1]),
                ...(agentClaimMapping?.[agentId2] ?? [agentId2]),
              ],
              trackerAgent: 'logic_tracker',
              description: `Contradictory causal claims: "${stmt1}" (${agentId1}) vs "${stmt2}" (${agentId2})`,
            })
          }
        }
      }
    }
  }

  // Check negations for explicit logical contradictions
  for (const negation of negations) {
    const targetThesis = claimsByAgent.get(negation.targetThesisAgentId)
    if (!targetThesis) continue

    // Internal tensions identified by agents are potential contradictions
    for (const tension of negation.internalTensions) {
      if (
        tension.toLowerCase().includes('contradict') ||
        tension.toLowerCase().includes('inconsistent')
      ) {
        contradictions.push({
          id: generateContradictionId('LOGIC', contraIndex++, context.cycleNumber),
          type: 'SYNCHRONIC',
          severity: 'MEDIUM',
          actionDistance: 3,
          participatingClaims: [
            ...(agentClaimMapping?.[negation.agentId] ?? [negation.agentId]),
            ...(agentClaimMapping?.[negation.targetThesisAgentId] ?? [
              negation.targetThesisAgentId,
            ]),
          ],
          trackerAgent: 'logic_tracker',
          description: `Logical tension: ${tension}`,
        })
      }
    }
  }

  return {
    trackerId: `logic_${context.cycleNumber}_${Date.now()}`,
    trackerType: 'LOGIC',
    contradictions,
    processingTimeMs: Date.now() - startTime,
  }
}

// ----- Pragmatic Tracker -----

/**
 * Extract the action verb and object from a decision statement.
 * Used for entity-level contradiction detection: only flag contradiction
 * if the same object has opposing verbs.
 */
function extractActionObject(decision: string): { verb: string; object: string } | null {
  const verbs =
    'increase|decrease|expand|contract|invest|divest|build|demolish|hire|fire|buy|sell|start|stop|accelerate|decelerate|centralize|decentralize'
  const match = decision.match(
    new RegExp(
      `^(${verbs})\\s+(?:the\\s+|a\\s+|an\\s+)?(.+?)(?:\\s+(?:by|to|from|in)\\b|[,.]|$)`,
      'i'
    )
  )
  return match ? { verb: match[1].toLowerCase(), object: match[2].toLowerCase().trim() } : null
}

/**
 * PRAGMATIC Tracker: Detects action/decision incompatibilities
 *
 * Looks for:
 * - Mutually exclusive action recommendations
 * - Resource conflicts (same resources for different purposes)
 * - Timing conflicts (simultaneous incompatible actions)
 */
export function runPragmaticTracker(
  theses: ThesisOutput[],
  negations: NegationOutput[],
  context: ContradictionTrackerContext,
  agentClaimMapping?: Record<string, string[]>
): ContradictionTrackerResult {
  const startTime = Date.now()
  const contradictions: ContradictionOutput[] = []

  // Extract decision implications from all theses
  const decisionsByAgent = new Map<string, string[]>()
  const allDecisions: Array<{ agentId: string; decision: string }> = []

  for (const thesis of theses) {
    decisionsByAgent.set(thesis.agentId, thesis.decisionImplications)
    for (const decision of thesis.decisionImplications) {
      allDecisions.push({ agentId: thesis.agentId, decision })
    }
  }

  // Compare decisions for conflicts
  let contraIndex = 0
  for (let i = 0; i < allDecisions.length; i++) {
    for (let j = i + 1; j < allDecisions.length; j++) {
      const d1 = allDecisions[i]
      const d2 = allDecisions[j]

      if (d1.agentId === d2.agentId) continue

      const decision1Lower = d1.decision.toLowerCase()
      const decision2Lower = d2.decision.toLowerCase()

      // Entity-level extraction: only flag contradiction if same object with opposing verb
      const entity1 = extractActionObject(d1.decision)
      const entity2 = extractActionObject(d2.decision)

      // Check for opposing actions
      const opposingPairs = [
        ['increase', 'decrease'],
        ['expand', 'contract'],
        ['invest', 'divest'],
        ['build', 'demolish'],
        ['hire', 'fire'],
        ['buy', 'sell'],
        ['start', 'stop'],
        ['accelerate', 'decelerate'],
        ['centralize', 'decentralize'],
      ]

      for (const [action1, action2] of opposingPairs) {
        if (
          (decision1Lower.includes(action1) && decision2Lower.includes(action2)) ||
          (decision1Lower.includes(action2) && decision2Lower.includes(action1))
        ) {
          // If entity extraction succeeded for both, only flag if same object
          if (entity1 && entity2 && entity1.object !== entity2.object) {
            continue // Different objects — not a true contradiction
          }

          contradictions.push({
            id: generateContradictionId('PRAGMATIC', contraIndex++, context.cycleNumber),
            type: 'SYNCHRONIC',
            severity: 'HIGH',
            actionDistance: 1, // Direct action conflict = highest priority
            participatingClaims: [
              ...(agentClaimMapping?.[d1.agentId] ?? [d1.agentId]),
              ...(agentClaimMapping?.[d2.agentId] ?? [d2.agentId]),
            ],
            trackerAgent: 'pragmatic_tracker',
            description: `Opposing actions recommended: "${d1.decision}" (${d1.agentId}) vs "${d2.decision}" (${d2.agentId})`,
          })
          break
        }
      }
    }
  }

  return {
    trackerId: `pragmatic_${context.cycleNumber}_${Date.now()}`,
    trackerType: 'PRAGMATIC',
    contradictions,
    processingTimeMs: Date.now() - startTime,
  }
}

// ----- Semantic Tracker -----

/**
 * SEMANTIC Tracker: Detects equivocation and term ambiguity
 *
 * Looks for:
 * - Same term used with different meanings across theses
 * - Category errors (treating different things as same)
 * - Hidden assumptions in terminology
 */
export function runSemanticTracker(
  theses: ThesisOutput[],
  negations: NegationOutput[],
  context: ContradictionTrackerContext,
  agentClaimMapping?: Record<string, string[]>
): ContradictionTrackerResult {
  const startTime = Date.now()
  const contradictions: ContradictionOutput[] = []

  // Build concept usage map across theses
  const conceptUsage = new Map<
    string,
    Array<{ agentId: string; relations: string[]; lens: string }>
  >()

  for (const thesis of theses) {
    for (const [concept, relations] of Object.entries(thesis.conceptGraph)) {
      const normalizedConcept = concept.toLowerCase().trim()
      if (!conceptUsage.has(normalizedConcept)) {
        conceptUsage.set(normalizedConcept, [])
      }
      conceptUsage.get(normalizedConcept)!.push({
        agentId: thesis.agentId,
        relations: relations as string[],
        lens: thesis.lens,
      })
    }
  }

  // Check negations for category attacks (explicit semantic issues)
  let contraIndex = 0
  for (const negation of negations) {
    for (const attack of negation.categoryAttacks) {
      if (
        attack.toLowerCase().includes('equivoc') ||
        attack.toLowerCase().includes('ambig') ||
        attack.toLowerCase().includes('mean') ||
        attack.toLowerCase().includes('defin')
      ) {
        contradictions.push({
          id: generateContradictionId('SEMANTIC', contraIndex++, context.cycleNumber),
          type: 'SYNCHRONIC',
          severity: 'MEDIUM',
          actionDistance: 3,
          participatingClaims: [
            ...(agentClaimMapping?.[negation.agentId] ?? [negation.agentId]),
            ...(agentClaimMapping?.[negation.targetThesisAgentId] ?? [
              negation.targetThesisAgentId,
            ]),
          ],
          trackerAgent: 'semantic_tracker',
          description: `Semantic issue identified: ${attack}`,
        })
      }
    }
  }

  // Check for concepts used very differently across lenses
  for (const [concept, usages] of conceptUsage.entries()) {
    if (usages.length < 2) continue

    // Compare relation sets - significant differences suggest different meanings
    const relationSets = usages.map((u) => new Set(u.relations.map((r) => r.toLowerCase())))

    for (let i = 0; i < relationSets.length; i++) {
      for (let j = i + 1; j < relationSets.length; j++) {
        const set1 = relationSets[i]
        const set2 = relationSets[j]

        // Calculate Jaccard distance
        const intersection = new Set([...set1].filter((x) => set2.has(x)))
        const union = new Set([...set1, ...set2])

        if (union.size > 0) {
          const similarity = intersection.size / union.size

          // Very low similarity suggests different meanings
          if (similarity < SEMANTIC_SIMILARITY_THRESHOLD && set1.size > 0 && set2.size > 0) {
            contradictions.push({
              id: generateContradictionId('SEMANTIC', contraIndex++, context.cycleNumber),
              type: 'SYNCHRONIC',
              severity: 'LOW',
              actionDistance: 4,
              participatingClaims: [
                ...(agentClaimMapping?.[usages[i].agentId] ?? [usages[i].agentId]),
                ...(agentClaimMapping?.[usages[j].agentId] ?? [usages[j].agentId]),
              ],
              trackerAgent: 'semantic_tracker',
              description: `Concept "${concept}" used differently: ${usages[i].lens} lens relates it to [${[...set1].slice(0, 3).join(', ')}...] while ${usages[j].lens} lens relates it to [${[...set2].slice(0, 3).join(', ')}...]`,
            })
          }
        }
      }
    }
  }

  return {
    trackerId: `semantic_${context.cycleNumber}_${Date.now()}`,
    trackerType: 'SEMANTIC',
    contradictions,
    processingTimeMs: Date.now() - startTime,
  }
}

// ----- Boundary Tracker -----

/** Normalize free-form LLM temporal grains to the canonical vocabulary */
const TEMPORAL_GRAIN_MAP: Record<string, string> = {
  days: 'immediate',
  hours: 'immediate',
  now: 'immediate',
  today: 'immediate',
  weeks: 'short_term',
  months: 'short_term',
  weekly: 'short_term',
  monthly: 'short_term',
  quarters: 'medium_term',
  quarter: 'medium_term',
  year: 'medium_term',
  annual: 'medium_term',
  years: 'long_term',
  decades: 'long_term',
  decade: 'long_term',
  '5+ years': 'long_term',
  centuries: 'historical',
  past: 'historical',
  historical: 'historical',
}

function normalizeTemporalGrain(grain: string): string {
  const lower = grain.toLowerCase().trim()
  return TEMPORAL_GRAIN_MAP[lower] ?? lower
}

/**
 * BOUNDARY Tracker: Detects regime/context mismatches
 *
 * Looks for:
 * - Claims valid under different regimes being compared directly
 * - Temporal scope mismatches
 * - Unacknowledged boundary conditions
 */
export function runBoundaryTracker(
  theses: ThesisOutput[],
  negations: NegationOutput[],
  context: ContradictionTrackerContext,
  agentClaimMapping?: Record<string, string[]>
): ContradictionTrackerResult {
  const startTime = Date.now()
  const contradictions: ContradictionOutput[] = []

  let contraIndex = 0

  // Check for temporal grain mismatches (normalize free-form LLM grains first)
  const temporalGroups = new Map<string, ThesisOutput[]>()
  for (const thesis of theses) {
    const grain = normalizeTemporalGrain(thesis.temporalGrain)
    if (!temporalGroups.has(grain)) {
      temporalGroups.set(grain, [])
    }
    temporalGroups.get(grain)!.push(thesis)
  }

  // If theses span very different time scales, flag potential boundary issues
  const temporalOrder = ['immediate', 'short_term', 'medium_term', 'long_term', 'historical']
  const grains = [...temporalGroups.keys()]
  if (grains.length > 1) {
    const indices = grains.map((g) => temporalOrder.indexOf(g)).filter((i) => i >= 0)
    if (indices.length > 1) {
      const minIdx = Math.min(...indices)
      const maxIdx = Math.max(...indices)

      // More than TEMPORAL_BOUNDARY_THRESHOLD levels apart = significant temporal boundary issue
      if (maxIdx - minIdx > TEMPORAL_BOUNDARY_THRESHOLD) {
        const shortTermTheses = theses.filter(
          (t) => temporalOrder.indexOf(normalizeTemporalGrain(t.temporalGrain)) <= 1
        )
        const longTermTheses = theses.filter(
          (t) => temporalOrder.indexOf(normalizeTemporalGrain(t.temporalGrain)) >= 3
        )

        for (const st of shortTermTheses) {
          for (const lt of longTermTheses) {
            contradictions.push({
              id: generateContradictionId('BOUNDARY', contraIndex++, context.cycleNumber),
              type: 'DIACHRONIC',
              severity: 'MEDIUM',
              actionDistance: 3,
              participatingClaims: [
                ...(agentClaimMapping?.[st.agentId] ?? [st.agentId]),
                ...(agentClaimMapping?.[lt.agentId] ?? [lt.agentId]),
              ],
              trackerAgent: 'boundary_tracker',
              description: `Temporal scope mismatch: ${st.lens} uses ${st.temporalGrain} grain while ${lt.lens} uses ${lt.temporalGrain} grain`,
            })
          }
        }
      }
    }
  }

  // Check for regime assumption conflicts
  const regimeAssumptions = new Map<string, Array<{ agentId: string; lens: string }>>()

  for (const thesis of theses) {
    for (const assumption of thesis.regimeAssumptions) {
      const normalized = assumption.toLowerCase().trim()
      if (!regimeAssumptions.has(normalized)) {
        regimeAssumptions.set(normalized, [])
      }
      regimeAssumptions.get(normalized)!.push({ agentId: thesis.agentId, lens: thesis.lens })
    }
  }

  // Look for conflicting assumptions
  const assumptionConflicts = [
    ['competitive market', 'monopoly'],
    ['stable', 'volatile'],
    ['growth', 'recession'],
    ['peace', 'conflict'],
    ['abundant', 'scarce'],
    ['open', 'closed'],
  ]

  for (const [a1, a2] of assumptionConflicts) {
    const matches1 = [...regimeAssumptions.entries()].filter(([k]) => k.includes(a1))
    const matches2 = [...regimeAssumptions.entries()].filter(([k]) => k.includes(a2))

    for (const [, agents1] of matches1) {
      for (const [, agents2] of matches2) {
        for (const agent1 of agents1) {
          for (const agent2 of agents2) {
            if (agent1.agentId !== agent2.agentId) {
              contradictions.push({
                id: generateContradictionId('BOUNDARY', contraIndex++, context.cycleNumber),
                type: 'REGIME_SHIFT',
                severity: 'MEDIUM',
                actionDistance: 2,
                participatingClaims: [
                  ...(agentClaimMapping?.[agent1.agentId] ?? [agent1.agentId]),
                  ...(agentClaimMapping?.[agent2.agentId] ?? [agent2.agentId]),
                ],
                trackerAgent: 'boundary_tracker',
                description: `Conflicting regime assumptions: ${agent1.lens} assumes "${a1}" conditions while ${agent2.lens} assumes "${a2}" conditions`,
              })
            }
          }
        }
      }
    }
  }

  return {
    trackerId: `boundary_${context.cycleNumber}_${Date.now()}`,
    trackerType: 'BOUNDARY',
    contradictions,
    processingTimeMs: Date.now() - startTime,
  }
}

// ----- Orchestration -----

/**
 * Run all enabled contradiction trackers and merge results
 *
 * Note: Individual trackers are synchronous (no LLM calls).
 * This function is still async to maintain API compatibility.
 */
export function runContradictionTrackers(
  theses: ThesisOutput[],
  negations: NegationOutput[],
  enabledTrackers: ContradictionTrackerType[],
  context: ContradictionTrackerContext,
  agentClaimMapping?: Record<string, string[]>
): {
  allContradictions: ContradictionOutput[]
  trackerResults: ContradictionTrackerResult[]
  totalProcessingTimeMs: number
} {
  const startTime = Date.now()
  const trackerResults: ContradictionTrackerResult[] = []

  // Run enabled trackers
  if (enabledTrackers.includes('LOGIC')) {
    trackerResults.push(runLogicTracker(theses, negations, context, agentClaimMapping))
  }

  if (enabledTrackers.includes('PRAGMATIC')) {
    trackerResults.push(runPragmaticTracker(theses, negations, context, agentClaimMapping))
  }

  if (enabledTrackers.includes('SEMANTIC')) {
    trackerResults.push(runSemanticTracker(theses, negations, context, agentClaimMapping))
  }

  if (enabledTrackers.includes('BOUNDARY')) {
    trackerResults.push(runBoundaryTracker(theses, negations, context, agentClaimMapping))
  }

  // Merge and deduplicate contradictions
  const allContradictions: ContradictionOutput[] = []
  const seenDescriptions = new Set<string>()

  for (const result of trackerResults) {
    for (const contradiction of result.contradictions) {
      // Simple deduplication by description
      if (!seenDescriptions.has(contradiction.description)) {
        seenDescriptions.add(contradiction.description)
        allContradictions.push(contradiction)
      }
    }
  }

  // Sort by action distance (lower = higher priority)
  allContradictions.sort((a, b) => a.actionDistance - b.actionDistance)

  return {
    allContradictions,
    trackerResults,
    totalProcessingTimeMs: Date.now() - startTime,
  }
}

/**
 * Cross-verify contradictions using an LLM judge
 * This provides a second opinion on detected contradictions
 */
export async function crossVerifyContradictions(
  contradictions: ContradictionOutput[],
  theses: ThesisOutput[],
  apiKeys: ProviderKeys,
  judgeModel: { provider: string; modelName: string } = {
    provider: 'anthropic',
    modelName: 'claude-sonnet-4-6',
  }
): Promise<{
  verified: ContradictionOutput[]
  rejected: ContradictionOutput[]
  uncertain: ContradictionOutput[]
}> {
  if (contradictions.length === 0) {
    return { verified: [], rejected: [], uncertain: [] }
  }

  // Build context for the judge
  const thesesContext = theses.map((t) => `[${t.lens}] ${t.rawText.substring(0, 500)}`).join('\n\n')

  const contradictionsContext = contradictions
    .map((c, i) => `${i + 1}. [${c.severity}] ${c.description}`)
    .join('\n')

  const judgePrompt = `You are verifying contradictions detected between thesis statements.

THESES:
${thesesContext}

DETECTED CONTRADICTIONS:
${contradictionsContext}

For each numbered contradiction, respond with one of:
- VERIFIED: The contradiction is real and significant
- REJECTED: The contradiction is false positive or trivial
- UNCERTAIN: Need more context to determine

Format your response as a JSON array like:
[{"index": 1, "verdict": "VERIFIED", "reason": "..."}, ...]`

  const now = Date.now()
  const judgeAgentId = createSystemAgentId('contradiction_judge')
  const judgeAgent: AgentConfig = {
    agentId: judgeAgentId,
    userId: 'system',
    name: 'Contradiction Judge',
    role: 'critic',
    systemPrompt: 'You are a careful analyst who verifies logical and semantic contradictions.',
    modelProvider: judgeModel.provider as 'anthropic' | 'openai' | 'google' | 'xai',
    modelName: judgeModel.modelName,
    temperature: JUDGE_TEMPERATURE,
    archived: false,
    createdAtMs: now,
    updatedAtMs: now,
    syncState: 'synced',
    version: 1,
  }

  try {
    const result = await executeWithProvider(judgeAgent, judgePrompt, {}, apiKeys, {
      userId: 'system',
      agentId: judgeAgentId,
      workflowId: 'internal_verification',
      runId: `verify_${now}`,
    })

    // Parse the response
    const verdicts = JSON.parse(result.output) as Array<{
      index: number
      verdict: 'VERIFIED' | 'REJECTED' | 'UNCERTAIN'
      reason: string
    }>

    const verified: ContradictionOutput[] = []
    const rejected: ContradictionOutput[] = []
    const uncertain: ContradictionOutput[] = []

    for (const verdict of verdicts) {
      const contradiction = contradictions[verdict.index - 1]
      if (!contradiction) continue

      switch (verdict.verdict) {
        case 'VERIFIED':
          verified.push(contradiction)
          break
        case 'REJECTED':
          rejected.push(contradiction)
          break
        case 'UNCERTAIN':
        default:
          uncertain.push(contradiction)
      }
    }

    return { verified, rejected, uncertain }
  } catch (error) {
    // If parsing fails, log the error and treat all as uncertain
    log.error('Failed to parse contradiction judge response', {
      error: error instanceof Error ? error.message : error,
    })
    return { verified: [], rejected: [], uncertain: contradictions }
  }
}
