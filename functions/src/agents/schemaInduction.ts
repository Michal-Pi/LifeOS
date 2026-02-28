/**
 * Schema Induction Agent
 *
 * Automatically discovers communities of related concepts, claims, and mechanisms
 * from the dialectical knowledge graph. Uses either:
 * - LLM-based grouping: Semantic clustering via LLM analysis
 * - HDBSCAN: Density-based clustering on embeddings (future)
 *
 * The schema induction agent runs after sublation to:
 * 1. Identify emergent concept communities
 * 2. Generate community summaries
 * 3. Detect cross-community relationships
 * 4. Suggest schema refinements
 */

import type {
  AgentConfig,
  AgentExecutionStep,
  Community,
  CommunityId,
  ConceptId,
  ClaimId,
  MechanismId,
  SublationOutput,
  DialecticalWorkflowConfig,
  DialecticalSessionId,
} from '@lifeos/agents'
import { createBiTemporalEdge } from '@lifeos/agents'
import { createLogger } from '../lib/logger.js'
import { executeAgentWithEvents, type AgentExecutionContext } from './langgraph/utils.js'

const log = createLogger('SchemaInduction')
import { v4 as uuidv4 } from 'uuid'

// ----- Configuration Constants -----

/** Default minimum community size */
const MIN_COMMUNITY_SIZE = 2
/** Default cohesion threshold for LLM grouping */
const MIN_COHESION_SCORE = 0.5
/** Maximum number of communities to detect */
const MAX_COMMUNITIES = 10

// ----- Types -----

/**
 * Input data for schema induction
 */
export interface SchemaInductionInput {
  sessionId: DialecticalSessionId
  userId: string
  cycleNumber: number
  concepts: ConceptSummary[]
  claims: ClaimSummary[]
  mechanisms: MechanismSummary[]
  synthesis: SublationOutput | null
  previousCommunities: Community[]
}

/**
 * Summarized concept for clustering
 */
export interface ConceptSummary {
  conceptId: ConceptId
  name: string
  definition: string
  type: string
  relatedConcepts: string[]
}

/**
 * Summarized claim for clustering
 */
export interface ClaimSummary {
  claimId: ClaimId
  text: string
  type: string
  lens: string
  concepts: string[]
}

/**
 * Summarized mechanism for clustering
 */
export interface MechanismSummary {
  mechanismId: MechanismId
  description: string
  type: string
  participants: string[]
}

/**
 * Result of schema induction
 */
export interface SchemaInductionResult {
  communities: Community[]
  newCommunities: Community[]
  mergedCommunities: Array<{
    originalIds: CommunityId[]
    merged: Community
  }>
  splitCommunities: Array<{
    originalId: CommunityId
    splits: Community[]
  }>
  crossCommunityRelations: CrossCommunityRelation[]
  schemaRefinements: SchemaRefinement[]
  step: AgentExecutionStep
}

/**
 * Relationship between communities
 */
export interface CrossCommunityRelation {
  sourceCommunityId: CommunityId
  targetCommunityId: CommunityId
  relationType: 'DEPENDS_ON' | 'CONFLICTS_WITH' | 'GENERALIZES' | 'SPECIALIZES' | 'COMPLEMENTS'
  strength: number // 0-1
  bridgeConcepts: ConceptId[]
  description: string
}

/**
 * Suggested schema refinement
 */
export interface SchemaRefinement {
  refinementId: string
  type: 'RENAME_CONCEPT' | 'MERGE_CONCEPTS' | 'SPLIT_CONCEPT' | 'ADD_HIERARCHY' | 'REDEFINE'
  target: string
  proposal: string
  rationale: string
  confidence: number
}

/**
 * Raw community from LLM output
 */
interface RawCommunity {
  name: string
  description: string
  summary: string
  memberConcepts: string[]
  memberClaims: string[]
  memberMechanisms: string[]
  cohesionScore: number
}

/**
 * Raw cross-community relation from LLM output
 */
interface RawCrossRelation {
  source: string
  target: string
  type: string
  strength: number
  bridgeConcepts: string[]
  description: string
}

/**
 * Raw schema refinement from LLM output
 */
interface RawRefinement {
  type: string
  target: string
  proposal: string
  rationale: string
  confidence: number
}

// ----- Main Function -----

/**
 * Run schema induction to discover concept communities
 */
export async function runSchemaInduction(
  input: SchemaInductionInput,
  schemaAgent: AgentConfig,
  execContext: AgentExecutionContext,
  config: DialecticalWorkflowConfig,
  baseStepCount: number
): Promise<SchemaInductionResult> {
  log.info('Running schema induction', {
    conceptCount: input.concepts.length,
    claimCount: input.claims.length,
  })

  const method = config.communityDetectionMethod

  if (method === 'HDBSCAN') {
    // Future: implement HDBSCAN clustering with embeddings
    log.warn('HDBSCAN not yet implemented, falling back to LLM_GROUPING')
  }

  // Use LLM-based grouping
  return runLLMGrouping(input, schemaAgent, execContext, config, baseStepCount)
}

/**
 * LLM-based semantic grouping of concepts
 */
async function runLLMGrouping(
  input: SchemaInductionInput,
  schemaAgent: AgentConfig,
  execContext: AgentExecutionContext,
  config: DialecticalWorkflowConfig,
  baseStepCount: number
): Promise<SchemaInductionResult> {
  const prompt = buildSchemaInductionPrompt(input, config)

  const step = await executeAgentWithEvents(
    schemaAgent,
    prompt,
    {
      cycleNumber: input.cycleNumber,
      phase: 'schema_induction',
      conceptCount: input.concepts.length,
      claimCount: input.claims.length,
    },
    execContext,
    { stepNumber: baseStepCount + 1 }
  )

  // Parse the LLM output
  const parsed = parseSchemaInductionOutput(step.output)

  // Convert raw communities to typed Community objects
  const allCommunities = parsed.communities.map((raw) => rawToCommunity(raw, input))

  // Identify new, merged, and split communities
  const { newCommunities, mergedCommunities, splitCommunities } = categorizeCommunityChanges(
    allCommunities,
    input.previousCommunities
  )

  // Convert cross-community relations
  const crossCommunityRelations = parsed.crossRelations.map((raw) =>
    rawToCrossRelation(raw, allCommunities)
  )

  // Convert schema refinements
  const schemaRefinements = parsed.refinements.map((raw, idx) => ({
    refinementId: `ref_${input.cycleNumber}_${idx}`,
    type: mapRefinementType(raw.type),
    target: raw.target,
    proposal: raw.proposal,
    rationale: raw.rationale,
    confidence: raw.confidence,
  }))

  log.info('Schema induction complete', {
    communityCount: allCommunities.length,
    relationCount: crossCommunityRelations.length,
  })

  return {
    communities: allCommunities,
    newCommunities,
    mergedCommunities,
    splitCommunities,
    crossCommunityRelations,
    schemaRefinements,
    step,
  }
}

// ----- Prompt Builder -----

function buildSchemaInductionPrompt(
  input: SchemaInductionInput,
  _config: DialecticalWorkflowConfig
): string {
  // Note: _config reserved for future config-based prompt customization
  const previousCommunitySummary =
    input.previousCommunities.length > 0
      ? `\nPREVIOUS COMMUNITIES:\n${input.previousCommunities.map((c) => `- ${c.name}: ${c.description}`).join('\n')}`
      : ''

  return `You are a schema induction agent analyzing the dialectical knowledge graph to discover emergent concept communities.

CONCEPTS (${input.concepts.length}):
${input.concepts.map((c) => `- ${c.name}: ${c.definition} [${c.type}]`).join('\n')}

CLAIMS (${input.claims.length}):
${input.claims
  .slice(0, 20)
  .map((c) => `- [${c.lens}] ${c.text.substring(0, 100)}`)
  .join('\n')}

MECHANISMS (${input.mechanisms.length}):
${input.mechanisms.map((m) => `- ${m.description} (${m.type})`).join('\n')}

LATEST SYNTHESIS:
${input.synthesis ? JSON.stringify(input.synthesis.newConceptGraph) : 'None yet'}
${previousCommunitySummary}

Your task:
1. CLUSTER related concepts into communities based on semantic similarity and structural relationships
2. IDENTIFY cross-community relationships (dependencies, conflicts, generalizations)
3. SUGGEST schema refinements (concept renames, merges, splits, hierarchy additions)

Respond with the following JSON structure:
{
  "communities": [
    {
      "name": "Community Name",
      "description": "What unifies this community",
      "summary": "2-3 sentence summary for users",
      "memberConcepts": ["concept_name1", "concept_name2"],
      "memberClaims": ["claim_id1", "claim_id2"],
      "memberMechanisms": ["mech_id1"],
      "cohesionScore": 0.85
    }
  ],
  "crossRelations": [
    {
      "source": "Community A",
      "target": "Community B",
      "type": "DEPENDS_ON|CONFLICTS_WITH|GENERALIZES|SPECIALIZES|COMPLEMENTS",
      "strength": 0.7,
      "bridgeConcepts": ["shared_concept"],
      "description": "How they relate"
    }
  ],
  "refinements": [
    {
      "type": "MERGE_CONCEPTS|SPLIT_CONCEPT|RENAME_CONCEPT|ADD_HIERARCHY|REDEFINE",
      "target": "concept_name",
      "proposal": "proposed change",
      "rationale": "why this improves the schema",
      "confidence": 0.8
    }
  ]
}

Guidelines:
- Minimum community size: ${MIN_COMMUNITY_SIZE}
- Maximum communities: ${MAX_COMMUNITIES}
- Only suggest refinements with confidence > 0.6
- Communities should be cohesive (cohesionScore > ${MIN_COHESION_SCORE})
- Preserve existing community structure unless there's strong reason to change`
}

// ----- Parsers and Converters -----

interface ParsedSchemaInduction {
  communities: RawCommunity[]
  crossRelations: RawCrossRelation[]
  refinements: RawRefinement[]
}

function parseSchemaInductionOutput(output: string): ParsedSchemaInduction {
  try {
    const jsonMatch = output.match(/\{[\s\S]*\}/)?.[0]
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch)
      return {
        communities: parsed.communities ?? [],
        crossRelations: parsed.crossRelations ?? [],
        refinements: parsed.refinements ?? [],
      }
    }
  } catch (error) {
    log.warn('Failed to parse schema induction JSON', { error })
  }

  return {
    communities: [],
    crossRelations: [],
    refinements: [],
  }
}

function rawToCommunity(raw: RawCommunity, input: SchemaInductionInput): Community {
  // Map concept names to IDs
  const conceptNameToId = new Map(input.concepts.map((c) => [c.name.toLowerCase(), c.conceptId]))
  const conceptIds = raw.memberConcepts
    .map((name) => conceptNameToId.get(name.toLowerCase()))
    .filter((id): id is ConceptId => id !== undefined)

  // Map claim texts to IDs (by prefix match)
  const claimIds = raw.memberClaims as ClaimId[]

  // Map mechanism IDs
  const mechanismIds = raw.memberMechanisms as MechanismId[]

  return {
    communityId: `comm_${uuidv4()}` as CommunityId,
    sessionId: input.sessionId,
    userId: input.userId,
    name: raw.name,
    description: raw.description,
    summary: raw.summary,
    conceptIds,
    claimIds,
    mechanismIds,
    clusteringMethod: 'LLM_GROUPING',
    clusteringParams: {},
    cohesionScore: raw.cohesionScore,
    discoveredInCycle: input.cycleNumber,
    temporal: createBiTemporalEdge(),
  }
}

function rawToCrossRelation(
  raw: RawCrossRelation,
  communities: Community[]
): CrossCommunityRelation {
  // Find community IDs by name
  const sourceComm = communities.find((c) => c.name.toLowerCase() === raw.source.toLowerCase())
  const targetComm = communities.find((c) => c.name.toLowerCase() === raw.target.toLowerCase())

  return {
    sourceCommunityId: (sourceComm?.communityId ?? `unknown_${raw.source}`) as CommunityId,
    targetCommunityId: (targetComm?.communityId ?? `unknown_${raw.target}`) as CommunityId,
    relationType: mapRelationType(raw.type),
    strength: raw.strength,
    bridgeConcepts: raw.bridgeConcepts as ConceptId[],
    description: raw.description,
  }
}

function mapRelationType(
  type: string
): 'DEPENDS_ON' | 'CONFLICTS_WITH' | 'GENERALIZES' | 'SPECIALIZES' | 'COMPLEMENTS' {
  const upper = type.toUpperCase()
  if (upper.includes('DEPEND')) return 'DEPENDS_ON'
  if (upper.includes('CONFLICT')) return 'CONFLICTS_WITH'
  if (upper.includes('GENERAL')) return 'GENERALIZES'
  if (upper.includes('SPECIAL')) return 'SPECIALIZES'
  return 'COMPLEMENTS'
}

function mapRefinementType(
  type: string
): 'RENAME_CONCEPT' | 'MERGE_CONCEPTS' | 'SPLIT_CONCEPT' | 'ADD_HIERARCHY' | 'REDEFINE' {
  const upper = type.toUpperCase()
  if (upper.includes('RENAME')) return 'RENAME_CONCEPT'
  if (upper.includes('MERGE')) return 'MERGE_CONCEPTS'
  if (upper.includes('SPLIT')) return 'SPLIT_CONCEPT'
  if (upper.includes('HIERARCHY')) return 'ADD_HIERARCHY'
  return 'REDEFINE'
}

// ----- Community Change Detection -----

interface CommunityChanges {
  newCommunities: Community[]
  mergedCommunities: Array<{
    originalIds: CommunityId[]
    merged: Community
  }>
  splitCommunities: Array<{
    originalId: CommunityId
    splits: Community[]
  }>
}

function categorizeCommunityChanges(current: Community[], previous: Community[]): CommunityChanges {
  const newCommunities: Community[] = []
  const mergedCommunities: CommunityChanges['mergedCommunities'] = []
  const splitCommunities: CommunityChanges['splitCommunities'] = []

  if (previous.length === 0) {
    // All communities are new
    return {
      newCommunities: current,
      mergedCommunities: [],
      splitCommunities: [],
    }
  }

  // Build concept membership maps
  const prevConceptToComm = new Map<ConceptId, CommunityId[]>()
  for (const comm of previous) {
    for (const conceptId of comm.conceptIds) {
      const existing = prevConceptToComm.get(conceptId) ?? []
      existing.push(comm.communityId)
      prevConceptToComm.set(conceptId, existing)
    }
  }

  for (const comm of current) {
    // Find which previous communities overlap with this one
    const overlappingPrevComms = new Set<CommunityId>()
    for (const conceptId of comm.conceptIds) {
      const prevComms = prevConceptToComm.get(conceptId) ?? []
      prevComms.forEach((id) => overlappingPrevComms.add(id))
    }

    if (overlappingPrevComms.size === 0) {
      // New community
      newCommunities.push(comm)
    } else if (overlappingPrevComms.size > 1) {
      // Potentially merged from multiple previous communities
      mergedCommunities.push({
        originalIds: Array.from(overlappingPrevComms),
        merged: comm,
      })
    }
    // Note: splits are detected from the previous perspective
  }

  // Detect splits: previous community with members now in multiple current communities
  for (const prevComm of previous) {
    const currentCommsMembersWentTo = new Set<CommunityId>()
    for (const conceptId of prevComm.conceptIds) {
      for (const currComm of current) {
        if (currComm.conceptIds.includes(conceptId)) {
          currentCommsMembersWentTo.add(currComm.communityId)
        }
      }
    }

    if (currentCommsMembersWentTo.size > 1) {
      const splits = current.filter((c) => currentCommsMembersWentTo.has(c.communityId))
      splitCommunities.push({
        originalId: prevComm.communityId,
        splits,
      })
    }
  }

  return {
    newCommunities,
    mergedCommunities,
    splitCommunities,
  }
}

// ----- Exports -----

export { MIN_COMMUNITY_SIZE, MIN_COHESION_SCORE, MAX_COMMUNITIES }
