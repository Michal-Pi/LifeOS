/**
 * Oracle Consistency Checker — 2-Tier Validation
 *
 * Validates the Oracle reasoning ledger and knowledge graph for internal
 * consistency before gate evaluation. Two tiers:
 *
 * Tier 1 (rule-based, no LLM):
 *   1. Axiom violation scan — claims referencing axioms that contradict boundary conditions
 *   2. Graph contradiction check — edges forming direct contradictions (A supports B AND A contradicts B)
 *   3. Reference validation — all evidenceIds, axiomRefs, dependencies point to existing items
 *   4. Circular dependency detection — claim dependency cycles (CLM-001 -> CLM-002 -> CLM-001)
 *   5. Orphan claim detection — claims with no connections at all
 *
 * Tier 2 (LLM confirmation):
 *   For each Tier 1 flag, build a concise prompt asking a cheap LLM to confirm/deny.
 *   Returns the flag plus the LLM's assessment.
 */

import type {
  OracleClaim,
  OracleAssumption,
  OracleKnowledgeGraph,
  OracleEvidence,
} from '@lifeos/agents'
import { getAxiomById } from './axiomLoader.js'
import { createLogger } from '../../lib/logger.js'

const log = createLogger('ConsistencyChecker')

// ----- Interfaces -----

export interface ConsistencyFlag {
  id: string // "CF-001"
  type:
    | 'axiom_violation'
    | 'graph_contradiction'
    | 'invalid_reference'
    | 'circular_dependency'
    | 'orphan_claim'
  severity: 'critical' | 'warning' | 'info'
  message: string
  affectedIds: string[] // Claim/node IDs involved
  llmConfirmed?: boolean // Set by Tier 2
  llmExplanation?: string
}

export interface ConsistencyReport {
  flags: ConsistencyFlag[]
  tier1FlagCount: number
  tier2ConfirmedCount: number
  overallHealthScore: number // 0-1, derived from flags
}

// ----- Helpers -----

/**
 * Creates a scoped flag ID generator.
 * Each call to createFlagIdGenerator() returns a fresh generator
 * that starts from 1, avoiding module-level mutable state.
 */
function createFlagIdGenerator(): () => string {
  let counter = 0
  return () => {
    counter++
    return `CF-${String(counter).padStart(3, '0')}`
  }
}

// ----- Tier 1 Check Implementations -----

/**
 * 1. Axiom violation scan
 *
 * For each claim that references axioms, check whether the claim text
 * contains keywords that directly contradict the axiom's boundary conditions.
 * A boundary condition describes when the axiom does NOT apply; if the claim
 * text matches a boundary condition, it may be violating the axiom.
 */
function checkAxiomViolations(claims: OracleClaim[], nextFlagId: () => string): ConsistencyFlag[] {
  const flags: ConsistencyFlag[] = []

  for (const claim of claims) {
    if (claim.axiomRefs.length === 0) continue

    for (const axiomId of claim.axiomRefs) {
      const axiom = getAxiomById(axiomId)
      if (!axiom) continue // Missing axiom is caught by reference validation

      for (const boundary of axiom.boundaryConditions) {
        // Normalize both strings for comparison
        const claimLower = claim.text.toLowerCase()
        const boundaryLower = boundary.toLowerCase()

        // Extract meaningful keywords from the boundary condition (4+ chars)
        const boundaryKeywords = boundaryLower
          .split(/\s+/)
          .filter((w) => w.length >= 4)
          .map((w) => w.replace(/[^a-z]/g, ''))
          .filter((w) => w.length >= 4)

        // Flag if the claim text contains a significant portion of boundary keywords
        if (boundaryKeywords.length === 0) continue

        const matchCount = boundaryKeywords.filter((kw) => claimLower.includes(kw)).length
        const matchRatio = matchCount / boundaryKeywords.length

        if (matchRatio >= 0.5 && matchCount >= 2) {
          flags.push({
            id: nextFlagId(),
            type: 'axiom_violation',
            severity: 'warning',
            message:
              `Claim ${claim.id} references ${axiomId} but its text overlaps with ` +
              `boundary condition: "${boundary.slice(0, 120)}". ` +
              `The axiom may not apply in this context.`,
            affectedIds: [claim.id, axiomId],
          })
        }
      }
    }
  }

  return flags
}

/**
 * 2. Graph contradiction check
 *
 * Find pairs of edges where the same source-target pair has both
 * a "supports"/"reinforces" edge AND a "contradicts" edge.
 */
function checkGraphContradictions(
  graph: OracleKnowledgeGraph,
  nextFlagId: () => string
): ConsistencyFlag[] {
  const flags: ConsistencyFlag[] = []

  // Build an index: directed "source->target" -> edge types
  // Only check same-direction edges for contradictions (A→B supports vs A→B contradicts).
  // Reverse-direction (A→B supports vs B→A contradicts) may represent feedback loops, not contradictions.
  const edgeIndex = new Map<string, Set<string>>()
  for (const edge of graph.edges) {
    const key = `${edge.source}->${edge.target}`
    const types = edgeIndex.get(key) ?? new Set<string>()
    types.add(edge.type)
    edgeIndex.set(key, types)
  }

  const positiveTypes = new Set(['supports', 'reinforces', 'causes'])
  const negativeTypes = new Set(['contradicts', 'disrupts'])

  for (const [key, types] of Array.from(edgeIndex.entries())) {
    const typesArr = Array.from(types)
    const hasPositive = typesArr.some((t) => positiveTypes.has(t))
    const hasNegative = typesArr.some((t) => negativeTypes.has(t))

    if (hasPositive && hasNegative) {
      const [source, target] = key.split('->')
      const positiveEdges = typesArr.filter((t) => positiveTypes.has(t))
      const negativeEdges = typesArr.filter((t) => negativeTypes.has(t))

      flags.push({
        id: nextFlagId(),
        type: 'graph_contradiction',
        severity: 'critical',
        message:
          `Contradictory edges between ${source} and ${target}: ` +
          `${positiveEdges.join(', ')} vs ${negativeEdges.join(', ')}. ` +
          `The same node pair should not both support and contradict.`,
        affectedIds: [source, target],
      })
    }
  }

  return flags
}

/**
 * 3. Reference validation
 *
 * Ensure all claim references point to existing items:
 * - evidenceIds -> evidence items
 * - axiomRefs -> axioms in the library
 * - dependencies -> other claim IDs
 * - assumptions -> assumption IDs
 */
function checkInvalidReferences(
  claims: OracleClaim[],
  assumptions: OracleAssumption[],
  evidence: OracleEvidence[],
  nextFlagId: () => string
): ConsistencyFlag[] {
  const flags: ConsistencyFlag[] = []

  const claimIds = new Set(claims.map((c) => c.id))
  const assumptionIds = new Set(assumptions.map((a) => a.id))
  const evidenceIds = new Set(evidence.map((e) => e.id))

  for (const claim of claims) {
    // Check evidence references
    for (const evdId of claim.evidenceIds) {
      if (!evidenceIds.has(evdId)) {
        flags.push({
          id: nextFlagId(),
          type: 'invalid_reference',
          severity: 'warning',
          message: `Claim ${claim.id} references evidence ${evdId} which does not exist.`,
          affectedIds: [claim.id, evdId],
        })
      }
    }

    // Check axiom references
    for (const axmId of claim.axiomRefs) {
      const axiom = getAxiomById(axmId)
      if (!axiom) {
        flags.push({
          id: nextFlagId(),
          type: 'invalid_reference',
          severity: 'warning',
          message: `Claim ${claim.id} references axiom ${axmId} which is not in the axiom library.`,
          affectedIds: [claim.id, axmId],
        })
      }
    }

    // Check dependency references
    for (const depId of claim.dependencies) {
      if (!claimIds.has(depId)) {
        flags.push({
          id: nextFlagId(),
          type: 'invalid_reference',
          severity: 'critical',
          message: `Claim ${claim.id} depends on ${depId} which does not exist.`,
          affectedIds: [claim.id, depId],
        })
      }
    }

    // Check assumption references
    for (const asmId of claim.assumptions) {
      if (!assumptionIds.has(asmId)) {
        flags.push({
          id: nextFlagId(),
          type: 'invalid_reference',
          severity: 'warning',
          message: `Claim ${claim.id} references assumption ${asmId} which does not exist.`,
          affectedIds: [claim.id, asmId],
        })
      }
    }
  }

  return flags
}

/**
 * 4. Circular dependency detection
 *
 * Uses DFS-based cycle detection on claim dependencies.
 * Reports each cycle found as a separate flag.
 */
function checkCircularDependencies(
  claims: OracleClaim[],
  nextFlagId: () => string
): ConsistencyFlag[] {
  const flags: ConsistencyFlag[] = []
  const reportedCycles = new Set<string>()

  // Build adjacency list: claim ID -> dependency IDs
  const adjList = new Map<string, string[]>()
  const claimIds = new Set<string>()
  for (const claim of claims) {
    adjList.set(claim.id, claim.dependencies)
    claimIds.add(claim.id)
  }

  // DFS state — use path-based cycle detection for accurate reconstruction
  const WHITE = 0 // Not visited
  const GRAY = 1 // In current path
  const BLACK = 2 // Fully processed
  const color = new Map<string, number>()

  for (const id of Array.from(claimIds)) {
    color.set(id, WHITE)
  }

  // Use an explicit path stack for accurate cycle reconstruction
  function dfs(nodeId: string, path: string[]): void {
    color.set(nodeId, GRAY)
    path.push(nodeId)
    const deps = adjList.get(nodeId) ?? []

    for (const dep of deps) {
      if (!claimIds.has(dep)) continue // Skip invalid refs (handled by ref validation)

      if (color.get(dep) === GRAY) {
        // Found a cycle — extract it from the path
        const cycleStart = path.indexOf(dep)
        if (cycleStart >= 0) {
          const cycle = path.slice(cycleStart)

          // Deduplicate using min-rotation canonical form:
          // Find the lexicographically smallest rotation of the cycle.
          // This correctly deduplicates A->B->C and B->C->A (same cycle)
          // while keeping A->B->C and A->C->B as distinct (different cycles).
          const len = cycle.length
          let minIdx = 0
          for (let i = 1; i < len; i++) {
            if (cycle[i] < cycle[minIdx]) minIdx = i
          }
          const normalized = [...cycle.slice(minIdx), ...cycle.slice(0, minIdx)].join(',')
          if (!reportedCycles.has(normalized)) {
            reportedCycles.add(normalized)
            flags.push({
              id: nextFlagId(),
              type: 'circular_dependency',
              severity: 'critical',
              message:
                `Circular dependency detected: ${cycle.join(' -> ')} -> ${cycle[0]}. ` +
                `Claims must form a DAG.`,
              affectedIds: cycle,
            })
          }
        }
      } else if (color.get(dep) === WHITE) {
        dfs(dep, path)
      }
    }

    path.pop()
    color.set(nodeId, BLACK)
  }

  for (const id of Array.from(claimIds)) {
    if (color.get(id) === WHITE) {
      dfs(id, [])
    }
  }

  return flags
}

/**
 * 5. Orphan claim detection
 *
 * Find claims that have:
 * - No dependencies
 * - Not referenced as a dependency by any other claim
 * - No evidence
 * - No axiom refs
 * - No assumptions
 *
 * These claims are completely disconnected from the reasoning graph.
 */
function checkOrphanClaims(claims: OracleClaim[], nextFlagId: () => string): ConsistencyFlag[] {
  const flags: ConsistencyFlag[] = []

  // Build reverse dependency index: which claims reference this claim?
  const referencedBy = new Set<string>()
  for (const claim of claims) {
    for (const depId of claim.dependencies) {
      referencedBy.add(depId)
    }
  }

  for (const claim of claims) {
    const hasDependencies = claim.dependencies.length > 0
    const isReferenced = referencedBy.has(claim.id)
    const hasEvidence = claim.evidenceIds.length > 0
    const hasAxiomRefs = claim.axiomRefs.length > 0
    const hasAssumptions = claim.assumptions.length > 0

    if (!hasDependencies && !isReferenced && !hasEvidence && !hasAxiomRefs && !hasAssumptions) {
      flags.push({
        id: nextFlagId(),
        type: 'orphan_claim',
        severity: 'info',
        message:
          `Claim ${claim.id} is an orphan — no dependencies, not referenced by others, ` +
          `no evidence, no axiom refs, no assumptions. Consider connecting it to the ` +
          `reasoning graph or removing it.`,
        affectedIds: [claim.id],
      })
    }
  }

  return flags
}

// ----- Tier 1 Public API -----

/**
 * Run all Tier 1 (rule-based) consistency checks.
 * Returns an array of flags ordered by severity (critical first).
 */
export function runTier1Checks(
  claims: OracleClaim[],
  assumptions: OracleAssumption[],
  knowledgeGraph: OracleKnowledgeGraph,
  evidence: OracleEvidence[] = []
): ConsistencyFlag[] {
  const nextFlagId = createFlagIdGenerator()

  log.info('Starting Tier 1 consistency checks', {
    claims: claims.length,
    assumptions: assumptions.length,
    edges: knowledgeGraph.edges.length,
    evidence: evidence.length,
  })

  const allFlags: ConsistencyFlag[] = [
    ...checkAxiomViolations(claims, nextFlagId),
    ...checkGraphContradictions(knowledgeGraph, nextFlagId),
    ...checkInvalidReferences(claims, assumptions, evidence, nextFlagId),
    ...checkCircularDependencies(claims, nextFlagId),
    ...checkOrphanClaims(claims, nextFlagId),
  ]

  // Sort by severity: critical > warning > info
  const severityOrder: Record<string, number> = {
    critical: 0,
    warning: 1,
    info: 2,
  }
  allFlags.sort((a, b) => (severityOrder[a.severity] ?? 9) - (severityOrder[b.severity] ?? 9))

  // Re-assign sequential IDs after sorting
  for (let i = 0; i < allFlags.length; i++) {
    allFlags[i].id = `CF-${String(i + 1).padStart(3, '0')}`
  }

  log.info('Tier 1 checks complete', {
    total: allFlags.length,
    critical: allFlags.filter((f) => f.severity === 'critical').length,
    warning: allFlags.filter((f) => f.severity === 'warning').length,
    info: allFlags.filter((f) => f.severity === 'info').length,
  })

  return allFlags
}

// ----- Tier 2: LLM Confirmation -----

/**
 * Build a concise prompt asking a cheap LLM to confirm or deny a Tier 1 flag.
 * Includes relevant claim text for context.
 */
export function buildTier2ConfirmationPrompt(flag: ConsistencyFlag, claims: OracleClaim[]): string {
  const claimMap = new Map(claims.map((c) => [c.id, c]))

  // Gather context: the actual text of affected claims
  const contextLines: string[] = []
  for (const id of flag.affectedIds) {
    const claim = claimMap.get(id)
    if (claim) {
      contextLines.push(
        `- ${claim.id} (${claim.type}, confidence ${claim.confidence}): "${claim.text}"`
      )
    }
  }

  const contextBlock =
    contextLines.length > 0 ? `\nRelevant claims:\n${contextLines.join('\n')}\n` : ''

  return `You are a consistency checker for a scenario planning system.

A rule-based check flagged the following issue:

**Flag type:** ${flag.type}
**Severity:** ${flag.severity}
**Issue:** ${flag.message}
**Affected IDs:** ${flag.affectedIds.join(', ')}
${contextBlock}
Your task: Determine whether this flag represents a REAL consistency problem or a false positive.

Respond with JSON ONLY:
{
  "confirmed": true/false,
  "explanation": "<one sentence explaining your assessment>"
}`
}

/**
 * Build a batched prompt to confirm/deny multiple Tier 1 flags in a single LLM call.
 * Groups up to `batchSize` flags per prompt to reduce LLM call count.
 */
export function buildBatchedTier2Prompt(flags: ConsistencyFlag[], claims: OracleClaim[]): string {
  const claimMap = new Map(claims.map((c) => [c.id, c]))

  const flagDescriptions = flags
    .map((flag, i) => {
      const contextLines: string[] = []
      for (const id of flag.affectedIds) {
        const claim = claimMap.get(id)
        if (claim) {
          contextLines.push(
            `  - ${claim.id} (${claim.type}, conf ${claim.confidence}): "${claim.text.slice(0, 150)}"`
          )
        }
      }
      const ctx = contextLines.length > 0 ? `\n  Context:\n${contextLines.join('\n')}` : ''
      return `Flag ${i + 1} (${flag.id}):
  Type: ${flag.type} | Severity: ${flag.severity}
  Issue: ${flag.message}${ctx}`
    })
    .join('\n\n')

  return `You are a consistency checker for a scenario planning system.
Multiple rule-based checks flagged the following issues. For EACH flag, determine whether it represents a REAL consistency problem or a false positive.

${flagDescriptions}

Respond with a JSON array ONLY, one entry per flag in order:
[
  { "flagId": "${flags[0]?.id ?? 'CF-001'}", "confirmed": true/false, "explanation": "<one sentence>" },
  ...
]`
}

/**
 * Parse the batched LLM confirmation response.
 */
export function parseBatchedTier2Confirmation(
  llmOutput: string
): Array<{ flagId: string; confirmed: boolean; explanation: string }> | null {
  try {
    const arrMatch = llmOutput.match(/\[[\s\S]*\]/)
    if (!arrMatch) return null

    const parsed = JSON.parse(arrMatch[0])
    if (!Array.isArray(parsed)) return null

    return parsed
      .filter(
        (item: { flagId?: string; confirmed?: boolean }) =>
          typeof item.flagId === 'string' && typeof item.confirmed === 'boolean'
      )
      .map((item: { flagId: string; confirmed: boolean; explanation?: string }) => ({
        flagId: item.flagId,
        confirmed: item.confirmed,
        explanation:
          typeof item.explanation === 'string' ? item.explanation : 'No explanation provided.',
      }))
  } catch {
    log.warn('Failed to parse batched Tier 2 LLM confirmation', {
      textLength: llmOutput.length,
    })
    return null
  }
}

/**
 * Parse the LLM's confirmation response.
 * Returns null if the response cannot be parsed.
 */
export function parseTier2Confirmation(
  llmOutput: string
): { confirmed: boolean; explanation: string } | null {
  try {
    const jsonMatch = llmOutput.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return null

    const parsed = JSON.parse(jsonMatch[0])

    if (typeof parsed.confirmed !== 'boolean') return null

    return {
      confirmed: parsed.confirmed,
      explanation:
        typeof parsed.explanation === 'string' ? parsed.explanation : 'No explanation provided.',
    }
  } catch {
    log.warn('Failed to parse Tier 2 LLM confirmation', {
      textLength: llmOutput.length,
    })
    return null
  }
}

// ----- Health Score -----

/**
 * Compute an overall health score from consistency flags.
 *
 * Scoring:
 * - Start at 1.0 (perfect health)
 * - Penalties are normalized by graph size: a 100-claim graph with 2 critical
 *   flags is healthier than a 5-claim graph with 2 critical flags.
 * - Base penalties: critical = 0.15, warning = 0.05, info = 0.01
 * - Normalization: penalty / max(1, log2(totalItems + 1) / 3)
 *   So a 100-item graph reduces each penalty by ~2.2x, a 10-item graph by ~1.2x.
 * - Minimum: 0.0
 *
 * If Tier 2 confirmation is available, only confirmed flags count.
 */
export function computeHealthScore(flags: ConsistencyFlag[], totalItems?: number): number {
  let score = 1.0

  // Normalize penalties by graph size — larger graphs tolerate more flags
  const normFactor = totalItems && totalItems > 0 ? Math.max(1, Math.log2(totalItems + 1) / 3) : 1

  for (const flag of flags) {
    // If Tier 2 ran and the LLM said "not confirmed", skip this flag
    if (flag.llmConfirmed === false) continue

    switch (flag.severity) {
      case 'critical':
        score -= 0.15 / normFactor
        break
      case 'warning':
        score -= 0.05 / normFactor
        break
      case 'info':
        score -= 0.01 / normFactor
        break
    }
  }

  return Math.max(0, Math.round(score * 100) / 100)
}

// ----- Report Builder -----

/**
 * Build a full consistency report from Tier 1 flags.
 * Tier 2 confirmation counts are computed from flags that have llmConfirmed set.
 * @param totalItems Total claims + assumptions + edges for health score normalization
 */
export function buildConsistencyReport(
  flags: ConsistencyFlag[],
  totalItems?: number
): ConsistencyReport {
  const tier2Confirmed = flags.filter((f) => f.llmConfirmed === true).length

  return {
    flags,
    tier1FlagCount: flags.length,
    tier2ConfirmedCount: tier2Confirmed,
    overallHealthScore: computeHealthScore(flags, totalItems),
  }
}
