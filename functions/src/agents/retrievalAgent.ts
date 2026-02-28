/**
 * Heuristic Retrieval Agent
 *
 * A specialized agent for retrieving context from the Knowledge Hypergraph
 * during the dialectical reasoning cycle.
 *
 * Action Space:
 * - THINK: Analyze query and plan retrieval strategy
 * - QUERY: Formulate a Firestore/graphlib query
 * - RETRIEVE: Execute query and return subgraph
 * - TERMINATE: Return collected context to dialectical agents
 *
 * The agent uses heuristic rules rather than RL to select actions,
 * with patterns extracted from successful retrievals over time.
 */

import type {
  Claim,
  Concept,
  Mechanism,
  Contradiction,
  Regime,
  ThesisLens,
  AgentConfig,
  AgentId,
} from '@lifeos/agents'
import type { KnowledgeHypergraph, KGNode } from './knowledgeHypergraph.js'
import { createLogger } from '../lib/logger.js'
import type { ProviderKeys } from './providerService.js'
import { executeWithProvider } from './providerService.js'

const log = createLogger('RetrievalAgent')

// ----- Configuration Constants -----

/** Default planner temperature for concept extraction */
const PLANNER_TEMPERATURE = 0.3

/**
 * Create a system agent ID for internal retrieval agents
 */
function createSystemAgentId(name: string): AgentId {
  return `system_${name}` as AgentId
}

// ----- Action Types -----

export type RetrievalAction = 'THINK' | 'QUERY' | 'RETRIEVE' | 'TERMINATE'

export interface RetrievalStep {
  action: RetrievalAction
  input: string
  output: string
  durationMs: number
}

export interface RetrievalPlan {
  strategy: 'focused' | 'exploratory' | 'contrastive' | 'historical'
  primaryConcepts: string[]
  secondaryConcepts: string[]
  maxDepth: number
  filters: {
    includeExpired?: boolean
    lenses?: ThesisLens[]
    minConfidence?: number
    regimeIds?: string[]
  }
}

export interface RetrievalContext {
  claims: Claim[]
  concepts: Concept[]
  mechanisms: Mechanism[]
  contradictions: Contradiction[]
  regimes: Regime[]
  relatedNodes: KGNode[]
}

export interface RetrievalResult {
  context: RetrievalContext
  steps: RetrievalStep[]
  totalDurationMs: number
  nodesVisited: number
  strategy: RetrievalPlan['strategy']
}

// ----- Configuration -----

export interface RetrievalAgentConfig {
  maxSteps: number
  maxDepth: number
  topK: number
  modelProvider: 'anthropic' | 'openai' | 'google' | 'xai'
  modelName: string
  temperature: number
}

const DEFAULT_CONFIG: RetrievalAgentConfig = {
  maxSteps: 10,
  maxDepth: 3,
  topK: 10,
  modelProvider: 'anthropic',
  modelName: 'claude-sonnet-4-5',
  temperature: 0.3,
}

// ----- Retrieval Agent -----

/**
 * Execute the heuristic retrieval agent
 *
 * Uses a simple action loop with heuristic rules for action selection
 */
export async function executeRetrievalAgent(
  goal: string,
  kg: KnowledgeHypergraph,
  apiKeys: ProviderKeys,
  config: Partial<RetrievalAgentConfig> = {}
): Promise<RetrievalResult> {
  const cfg: RetrievalAgentConfig = { ...DEFAULT_CONFIG, ...config }
  const startTime = Date.now()
  const steps: RetrievalStep[] = []

  // Initialize context
  const context: RetrievalContext = {
    claims: [],
    concepts: [],
    mechanisms: [],
    contradictions: [],
    regimes: [],
    relatedNodes: [],
  }

  let nodesVisited = 0
  let currentAction: RetrievalAction = 'THINK'
  let plan: RetrievalPlan | null = null
  let stepCount = 0

  // Action loop
  while (stepCount < cfg.maxSteps) {
    stepCount++
    const stepStart = Date.now()

    switch (currentAction) {
      case 'THINK': {
        // Analyze the goal and create a retrieval plan
        plan = await planRetrieval(goal, apiKeys, cfg)

        steps.push({
          action: 'THINK',
          input: goal,
          output: JSON.stringify(plan),
          durationMs: Date.now() - stepStart,
        })

        // Move to QUERY
        currentAction = 'QUERY'
        break
      }

      case 'QUERY': {
        if (!plan) {
          currentAction = 'TERMINATE'
          break
        }

        // Execute queries based on the plan
        const queryResult = executeQueries(kg, plan)
        nodesVisited += queryResult.nodesVisited

        // Merge results into context
        mergeIntoContext(context, queryResult)

        steps.push({
          action: 'QUERY',
          input: JSON.stringify(plan.primaryConcepts),
          output: `Found ${queryResult.nodes.length} nodes`,
          durationMs: Date.now() - stepStart,
        })

        // Move to RETRIEVE for deeper exploration if needed
        if (queryResult.nodes.length > 0 && plan.maxDepth > 1) {
          currentAction = 'RETRIEVE'
        } else {
          currentAction = 'TERMINATE'
        }
        break
      }

      case 'RETRIEVE': {
        if (!plan) {
          currentAction = 'TERMINATE'
          break
        }

        // Expand the subgraph by following edges
        const expandedNodes = expandSubgraph(
          kg,
          context.relatedNodes.map((n) => n.id),
          plan.maxDepth - 1
        )
        nodesVisited += expandedNodes.length

        // Add expanded nodes to context
        for (const node of expandedNodes) {
          if (!context.relatedNodes.some((n) => n.id === node.id)) {
            context.relatedNodes.push(node)
            categorizeNode(node, context)
          }
        }

        steps.push({
          action: 'RETRIEVE',
          input: `Expanding ${context.relatedNodes.length} nodes`,
          output: `Added ${expandedNodes.length} related nodes`,
          durationMs: Date.now() - stepStart,
        })

        // Check termination conditions
        if (context.relatedNodes.length >= cfg.topK || expandedNodes.length === 0) {
          currentAction = 'TERMINATE'
        }
        break
      }

      case 'TERMINATE': {
        steps.push({
          action: 'TERMINATE',
          input: 'Context collection complete',
          output: `Collected ${context.claims.length} claims, ${context.concepts.length} concepts, ${context.mechanisms.length} mechanisms`,
          durationMs: Date.now() - stepStart,
        })

        return {
          context,
          steps,
          totalDurationMs: Date.now() - startTime,
          nodesVisited,
          strategy: plan?.strategy ?? 'focused',
        }
      }
    }
  }

  // Max steps reached
  return {
    context,
    steps,
    totalDurationMs: Date.now() - startTime,
    nodesVisited,
    strategy: plan?.strategy ?? 'focused',
  }
}

// ----- Heuristic Planning -----

/**
 * Create a retrieval plan using heuristic rules and LLM assistance
 *
 * @param goal - The retrieval goal/query
 * @param apiKeys - Provider API keys for LLM access
 * @param cfg - Retrieval agent configuration
 */
async function planRetrieval(
  goal: string,
  apiKeys: ProviderKeys,
  cfg: RetrievalAgentConfig
): Promise<RetrievalPlan> {
  // Use LLM to extract key concepts from the goal
  const now = Date.now()
  const plannerAgentId = createSystemAgentId('retrieval_planner')
  const plannerAgent: AgentConfig = {
    agentId: plannerAgentId,
    userId: 'system',
    name: 'Retrieval Planner',
    role: 'planner',
    systemPrompt: `You are a retrieval planner for a knowledge graph.
Extract key concepts and suggest a retrieval strategy.

Respond with JSON only:
{
  "strategy": "focused" | "exploratory" | "contrastive" | "historical",
  "primaryConcepts": ["concept1", "concept2"],
  "secondaryConcepts": ["related1", "related2"],
  "suggestedFilters": {
    "lenses": ["economic", "systems"] // optional
  }
}

Strategies:
- focused: Direct lookup of specific concepts
- exploratory: Broad search across related concepts
- contrastive: Look for opposing viewpoints
- historical: Trace concept evolution over time`,
    modelProvider: cfg.modelProvider,
    modelName: cfg.modelName,
    temperature: PLANNER_TEMPERATURE,
    archived: false,
    createdAtMs: now,
    updatedAtMs: now,
    syncState: 'synced',
    version: 1,
  }

  try {
    const result = await executeWithProvider(plannerAgent, goal, {}, apiKeys, {
      userId: 'system',
      agentId: plannerAgentId,
      workflowId: 'retrieval_session',
      runId: `retrieval_${now}`,
    })

    const parsed = JSON.parse(result.output)

    return {
      strategy: parsed.strategy || 'focused',
      primaryConcepts: parsed.primaryConcepts || [],
      secondaryConcepts: parsed.secondaryConcepts || [],
      maxDepth: cfg.maxDepth,
      filters: {
        lenses: parsed.suggestedFilters?.lenses,
      },
    }
  } catch (error) {
    // Log error and fallback to simple keyword extraction
    log.warn('Failed to plan retrieval with LLM, using fallback', {
      error: error instanceof Error ? error.message : error,
    })
    const words = goal.toLowerCase().split(/\s+/)
    const concepts = words.filter((w) => w.length > 4 && !STOP_WORDS.has(w))

    return {
      strategy: 'focused',
      primaryConcepts: concepts.slice(0, 3),
      secondaryConcepts: concepts.slice(3, 6),
      maxDepth: cfg.maxDepth,
      filters: {},
    }
  }
}

/**
 * Common English stop words to filter out during keyword extraction
 */
const STOP_WORDS = new Set([
  // Articles and determiners
  'the',
  'a',
  'an',
  'this',
  'that',
  'these',
  'those',
  // Prepositions
  'about',
  'above',
  'across',
  'after',
  'against',
  'along',
  'among',
  'around',
  'before',
  'behind',
  'below',
  'beneath',
  'beside',
  'between',
  'beyond',
  'during',
  'except',
  'from',
  'inside',
  'into',
  'near',
  'onto',
  'outside',
  'over',
  'through',
  'toward',
  'under',
  'until',
  'upon',
  'with',
  'within',
  'without',
  // Conjunctions
  'and',
  'but',
  'or',
  'nor',
  'for',
  'yet',
  'so',
  'although',
  'because',
  'since',
  'unless',
  'while',
  // Pronouns
  'i',
  'you',
  'he',
  'she',
  'it',
  'we',
  'they',
  'me',
  'him',
  'her',
  'us',
  'them',
  'my',
  'your',
  'his',
  'its',
  'our',
  'their',
  'mine',
  'yours',
  'ours',
  'theirs',
  'myself',
  'yourself',
  'himself',
  'herself',
  'itself',
  'ourselves',
  'themselves',
  'who',
  'whom',
  'whose',
  'which',
  'what',
  'where',
  'when',
  'why',
  'how',
  // Common verbs
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'being',
  'have',
  'has',
  'had',
  'having',
  'do',
  'does',
  'did',
  'doing',
  'will',
  'would',
  'shall',
  'should',
  'may',
  'might',
  'must',
  'can',
  'could',
  // Common adverbs
  'not',
  'very',
  'just',
  'only',
  'also',
  'even',
  'still',
  'again',
  'already',
  'always',
  'never',
  'often',
  'sometimes',
  'usually',
  'really',
  'quite',
  'rather',
  // Other common words
  'there',
  'here',
  'then',
  'now',
  'some',
  'any',
  'each',
  'every',
  'both',
  'few',
  'more',
  'most',
  'other',
  'such',
  'own',
  'same',
  'than',
  'too',
  'further',
])

// ----- Query Execution -----

interface QueryResult {
  nodes: KGNode[]
  nodesVisited: number
}

/**
 * Execute queries against the knowledge graph
 */
function executeQueries(kg: KnowledgeHypergraph, plan: RetrievalPlan): QueryResult {
  const nodes: KGNode[] = []
  let nodesVisited = 0

  // Search for primary concepts
  for (const conceptName of plan.primaryConcepts) {
    const conceptNodes = kg.getNodesByType('concept')
    nodesVisited += conceptNodes.length

    for (const node of conceptNodes) {
      const concept = node.data as Concept
      if (
        concept.name.toLowerCase().includes(conceptName.toLowerCase()) ||
        concept.alternateNames?.some((n) => n.toLowerCase().includes(conceptName.toLowerCase()))
      ) {
        nodes.push(node)
      }
    }
  }

  // Search for claims mentioning the concepts
  const claimNodes = kg.getNodesByType('claim')
  nodesVisited += claimNodes.length

  for (const node of claimNodes) {
    const claim = node.data as Claim
    const claimText = claim.text.toLowerCase()

    if (plan.primaryConcepts.some((c) => claimText.includes(c.toLowerCase()))) {
      nodes.push(node)
    }
  }

  // Apply lens filter if specified
  if (plan.filters.lenses && plan.filters.lenses.length > 0) {
    const filteredNodes = nodes.filter((n) => {
      if (n.type === 'claim') {
        const claim = n.data as Claim
        return plan.filters.lenses!.includes(claim.sourceLens)
      }
      return true
    })
    return { nodes: filteredNodes, nodesVisited }
  }

  return { nodes, nodesVisited }
}

// ----- Subgraph Expansion -----

/**
 * Expand the subgraph by following edges (recursive BFS)
 */
function expandSubgraph(kg: KnowledgeHypergraph, nodeIds: string[], depth: number): KGNode[] {
  if (depth <= 0 || nodeIds.length === 0) {
    return []
  }

  const expanded: KGNode[] = []
  const visited = new Set(nodeIds)

  for (const nodeId of nodeIds) {
    // Get neighbors (both incoming and outgoing edges)
    const neighbors = kg.getNeighbors(nodeId)

    for (const neighborId of neighbors) {
      if (visited.has(neighborId)) continue
      visited.add(neighborId)

      const node = kg.getNode(neighborId)
      if (node) {
        expanded.push(node)
      }
    }
  }

  // Recursively expand if depth allows
  if (depth > 1 && expanded.length > 0) {
    const deeperNodes = expandSubgraph(
      kg,
      expanded.map((n) => n.id),
      depth - 1
    )
    expanded.push(...deeperNodes)
  }

  return expanded
}

// ----- Context Management -----

/**
 * Merge query results into the context
 */
function mergeIntoContext(context: RetrievalContext, queryResult: QueryResult): void {
  for (const node of queryResult.nodes) {
    if (!context.relatedNodes.some((n) => n.id === node.id)) {
      context.relatedNodes.push(node)
      categorizeNode(node, context)
    }
  }
}

/**
 * Categorize a node into the appropriate context bucket
 */
function categorizeNode(node: KGNode, context: RetrievalContext): void {
  switch (node.type) {
    case 'claim':
      context.claims.push(node.data as Claim)
      break
    case 'concept':
      context.concepts.push(node.data as Concept)
      break
    case 'mechanism':
      context.mechanisms.push(node.data as Mechanism)
      break
    case 'contradiction':
      context.contradictions.push(node.data as Contradiction)
      break
    case 'regime':
      context.regimes.push(node.data as Regime)
      break
  }
}

// ----- Retrieval Templates -----

/**
 * Pre-defined retrieval templates for common patterns
 * These are extracted from successful retrieval sequences
 */
export const RETRIEVAL_TEMPLATES = {
  /**
   * Template for retrieving context about competing claims
   */
  competingClaims: {
    description: 'Find claims that compete or contradict on the same topic',
    steps: [
      { action: 'THINK' as const, focus: 'Identify the core topic and key claims' },
      { action: 'QUERY' as const, focus: 'Find all claims related to the topic' },
      { action: 'RETRIEVE' as const, focus: 'Expand to find contradictions and mechanisms' },
      { action: 'TERMINATE' as const, focus: 'Return claims with their contexts' },
    ],
  },

  /**
   * Template for tracing causal chains
   */
  causalChain: {
    description: 'Trace cause-effect relationships through the graph',
    steps: [
      { action: 'THINK' as const, focus: 'Identify the starting cause or effect' },
      { action: 'QUERY' as const, focus: 'Find mechanisms involving the starting point' },
      { action: 'RETRIEVE' as const, focus: 'Follow mechanism edges to trace the chain' },
      { action: 'RETRIEVE' as const, focus: 'Continue tracing until reaching an action' },
      { action: 'TERMINATE' as const, focus: 'Return the causal path' },
    ],
  },

  /**
   * Template for retrieving regime-specific context
   */
  regimeSpecific: {
    description: 'Find claims and concepts valid under a specific regime',
    steps: [
      { action: 'THINK' as const, focus: 'Identify the target regime conditions' },
      { action: 'QUERY' as const, focus: 'Find the regime and its scoped claims' },
      { action: 'RETRIEVE' as const, focus: 'Expand to related concepts' },
      { action: 'TERMINATE' as const, focus: 'Return regime-scoped context' },
    ],
  },

  /**
   * Template for concept evolution
   */
  conceptEvolution: {
    description: 'Trace how a concept has evolved through dialectical cycles',
    steps: [
      { action: 'THINK' as const, focus: 'Identify the concept to trace' },
      { action: 'QUERY' as const, focus: 'Find all versions of the concept' },
      { action: 'RETRIEVE' as const, focus: 'Find splits, merges, and related operators' },
      { action: 'TERMINATE' as const, focus: 'Return concept lineage' },
    ],
  },
} as const

/**
 * Select the most appropriate template based on the goal
 */
export function selectRetrievalTemplate(goal: string): keyof typeof RETRIEVAL_TEMPLATES | null {
  const goalLower = goal.toLowerCase()

  if (goalLower.includes('cause') || goalLower.includes('effect') || goalLower.includes('chain')) {
    return 'causalChain'
  }

  if (
    goalLower.includes('regime') ||
    goalLower.includes('condition') ||
    goalLower.includes('context')
  ) {
    return 'regimeSpecific'
  }

  if (
    goalLower.includes('evolve') ||
    goalLower.includes('change') ||
    goalLower.includes('history')
  ) {
    return 'conceptEvolution'
  }

  if (
    goalLower.includes('contradict') ||
    goalLower.includes('compete') ||
    goalLower.includes('conflict')
  ) {
    return 'competingClaims'
  }

  return null
}
