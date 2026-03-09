/**
 * Shared dialectical prompt helpers.
 *
 * Phase 1: resolveThesisLens — deterministic lens extraction from agent config.
 * Phase 2: buildThesisPrompt, buildNegationPrompt, buildSublationPrompt, repairJsonOutput.
 */

import type {
  AgentConfig,
  CompactGraph,
  ThesisOutput,
  NegationOutput,
  ContradictionOutput,
  ExtractedClaim,
} from '@lifeos/agents'
import type { ZodError, z } from 'zod'
import { capGraphForPrompt } from '../deepResearch/kgSerializer.js'
import { DEFAULT_MODELS } from '../providerKeys.js'
import {
  COMPACT_GRAPH_EXAMPLE,
  NEGATION_OUTPUT_EXAMPLE,
  SUBLATION_OUTPUT_EXAMPLE,
} from '../shared/fewShotExamples.js'
import { executeAgentWithEvents, type AgentExecutionContext } from './utils.js'

// ----- Lens Resolution -----

const LENS_PHRASE_MAP: Record<string, string> = {
  'economic thesis': 'economic',
  'systems thinking thesis': 'systems',
  'adversarial thesis': 'adversarial',
  'red-team thesis': 'adversarial',
  'technological thesis': 'technological',
  'geopolitical thesis': 'geopolitical',
  'social thesis': 'social',
}

export function resolveThesisLens(agent: AgentConfig, fallback = 'general'): string {
  // Forward-looking: metadata?.lens will be added to AgentConfig in Phase 2
  const meta = (agent as unknown as { metadata?: Record<string, unknown> }).metadata
  if (meta?.lens) return meta.lens as string
  const prompt = agent.systemPrompt?.toLowerCase() ?? ''
  for (const [phrase, lens] of Object.entries(LENS_PHRASE_MAP)) {
    if (prompt.includes(phrase)) return lens
  }
  return fallback
}

// ----- Research Evidence -----

/** Research evidence injected into thesis/sublation prompts */
export interface ResearchEvidence {
  claims: ExtractedClaim[]
  sources: Array<{
    sourceId: string
    title: string
    url: string
    domain: string
    qualityScore: number
  }>
  gapTypes: string[]
  searchRationale: string
}

// ----- Text Helpers -----

const MAX_RAW_TEXT_LENGTH = 3000

function truncateRawText(text: string): string {
  if (text.length <= MAX_RAW_TEXT_LENGTH) return text
  return text.slice(0, MAX_RAW_TEXT_LENGTH) + '\n[...truncated]'
}

function sanitizeForPrompt(input: string, maxLength = 500): string {
  return input
    .replace(/[`{}[\]\\$"#]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength)
}

// ----- Prompt Builders -----

export function buildThesisPrompt(
  goal: string,
  lens: string,
  mergedGraph?: CompactGraph | null,
  researchEvidence?: ResearchEvidence | null,
  userContext?: string | null
): string {
  const sanitizedGoal = sanitizeForPrompt(goal, 500)
  const priorGraphContext = mergedGraph
    ? `\nPRIOR KNOWLEDGE GRAPH (build upon this — reference existing node IDs, add new nodes/edges):\n${capGraphForPrompt(mergedGraph, 4000)}\n`
    : ''

  // Inject user-provided context when available (first cycle only)
  const userContextSection = userContext
    ? `\n${userContext}\n\nInstructions for context: Extract key claims, concepts, and relationships from the user-provided material above. Reference it when constructing graph nodes. Treat attached context as high-relevance starting material.\n`
    : ''

  // Inject research evidence when available (relevance-weighted sorting)
  let researchSection = ''
  if (researchEvidence && researchEvidence.claims.length > 0) {
    const goalTerms = new Set(
      sanitizedGoal
        .toLowerCase()
        .split(/\W+/)
        .filter((t) => t.length > 3)
    )
    const scoredClaims = researchEvidence.claims.map((c) => {
      const terms = c.claimText.toLowerCase().split(/\W+/)
      const overlap = terms.filter((t) => goalTerms.has(t)).length
      const relevance = Math.min(1, (overlap / Math.max(1, goalTerms.size)) * 2)
      return { ...c, score: c.confidence * (0.5 + 0.5 * relevance) }
    })
    const claimLines = scoredClaims
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
      .map((c, i) => {
        const source = researchEvidence.sources.find((s) => s.sourceId === c.sourceId)
        const sourceTag = source
          ? `[${source.domain}, quality=${source.qualityScore.toFixed(2)}]`
          : ''
        return `  ${i + 1}. [${c.evidenceType}, conf=${c.confidence.toFixed(2)}] ${sourceTag} ${c.claimText}`
      })
      .join('\n')

    researchSection = `
RESEARCH EVIDENCE (ground your analysis in these — cite source domains when building nodes):
${claimLines}
`
  }

  const lensSpecificGuidance =
    lens === 'economic'
      ? `
## Economic Lens Guidance
1. Prioritize serp_search for current market signals and economic evidence.
2. Use semantic_search only when you need conceptual expansion or rival framings.
3. Use read_url only for one or two high-value URLs when a specific datapoint or caveat materially changes the thesis.
4. If tool budget is nearly exhausted, stop researching and return the compact graph immediately.
5. Keep labels terse. Put quantitative support, thresholds, and caveats in "note" or "reasoning", not labels.
6. Do not wrap the graph in outer keys like "thesis", "analysis", or "structuredThesis".
`
      : ''

  return `CRITICAL: Output ONLY a valid JSON object. No markdown fences, no explanation, no preamble.

## Role
You are a domain-specialist knowledge graph analyst constructing structured thesis graphs through a specific analytical lens.

## Task
Analyze the topic below from a **${lens}** perspective. Build a knowledge graph of the key claims, concepts, mechanisms, and predictions visible through this lens.

## Topic
${sanitizedGoal}
${userContextSection}${priorGraphContext}${researchSection}${lensSpecificGuidance}
## Output Schema
Return one JSON object matching this structure exactly:
{
  "nodes": [
    {
      "id": "n1",
      "label": "Claim or concept in <=80 chars",
      "type": "claim | concept | mechanism | prediction",
      "note": "Optional caveat or qualification, <=150 chars",
      "sourceId": "Source ID if backed by research evidence",
      "sourceUrl": "Source URL if available",
      "sourceConfidence": 0.0-1.0
    }
  ],
  "edges": [
    {
      "from": "n1",
      "to": "n2",
      "rel": "causes | contradicts | supports | mediates | scopes",
      "weight": 0.0-1.0
    }
  ],
  "summary": "<=200 char headline of the thesis",
  "reasoning": "<=500 chars of qualitative texture the graph cannot express: nuance, hedging, emergent insights",
  "confidence": 0.0-1.0,
  "regime": "Conditions under which this thesis holds",
  "temporalGrain": "Time scale of analysis (e.g., months, years, decades)"
}

## Example Output
${COMPACT_GRAPH_EXAMPLE}

## Rules
1. Maximum 10 nodes. Each label <=80 characters.
2. Use the "note" field for caveats, qualifications, or uncertainty markers.
3. Use "reasoning" for qualitative insights the graph structure cannot capture.
4. When a prior knowledge graph is provided, reference existing node IDs and extend them. Do not duplicate nodes.
5. When research evidence is provided, populate sourceId, sourceUrl, and sourceConfidence on evidence-backed nodes.
6. Assign higher confidence to claims supported by multiple high-quality sources.
7. If you are uncertain about a claim, lower its confidence score and note the uncertainty rather than omitting it.
8. Omit speculative claims that lack any supporting evidence or reasoning.
9. For each claim, identify at least one observable condition that would falsify it. Include as a "prediction" type node with a threshold in its "note" field (e.g., "Falsified if X drops below Y by Z date").

CRITICAL (restated): Output ONLY the JSON object. No other text.`
}

export function buildNegationPrompt(
  sourceThesis: ThesisOutput,
  targetThesis: ThesisOutput
): string {
  // Use compact graph if available, fall back to truncated rawText
  const sourceRepr = sourceThesis.graph
    ? capGraphForPrompt(sourceThesis.graph, 3000)
    : truncateRawText(sourceThesis.rawText)
  let targetRepr = targetThesis.graph
    ? capGraphForPrompt(targetThesis.graph, 3000)
    : truncateRawText(targetThesis.rawText)

  // Guard against empty target — degrade gracefully with thesis metadata
  if (!targetRepr || targetRepr.trim().length === 0) {
    const rawSnippet = (targetThesis.rawText || '').trim().slice(0, 500)
    targetRepr = rawSnippet
      ? `[Thesis from "${targetThesis.lens}" lens (confidence: ${targetThesis.confidence}): ${rawSnippet}]`
      : `[Thesis from "${targetThesis.lens}" lens, model: ${targetThesis.model}, confidence: ${targetThesis.confidence}. No structured content available — thesis generation may have failed for this agent.]`
  }

  return `CRITICAL: Output ONLY a valid JSON object. No markdown fences, no explanation.

## Role
You are a dialectical critic performing determinate negation — a structured critique that identifies specific transformations to improve a thesis, not mere disagreement.

## Your Thesis (your analytical standpoint)
${sourceRepr}

## Target Thesis to Critique
${targetRepr}

## Task
Critique the target thesis from the standpoint of your thesis. For each weakness, specify the concrete structural transformation that would resolve it.

## Output Schema
{
  "internalTensions": ["Specific contradictions or inconsistencies within the target thesis"],
  "categoryAttacks": ["Challenges to the categories or framing the target thesis uses, explaining what each category misses or distorts"],
  "preservedValid": ["Elements from the target thesis worth preserving in a synthesis"],
  "rivalFraming": "A single alternative framing that resolves the identified tensions",
  "rewriteOperator": "SPLIT | MERGE | REVERSE_EDGE | ADD_MEDIATOR | SCOPE_TO_REGIME | TEMPORALIZE",
  "rewriteOperators": [{"type": "SPLIT | MERGE | ...", "target": "node or edge ID", "rationale": "why this transform"}],
  "operatorArgs": {}
}

## Example Output
${NEGATION_OUTPUT_EXAMPLE}

## Rules
1. Every internal tension MUST reference specific node IDs from the target thesis. Format: "Node X vs Node Y: [why they conflict]". If the target uses a knowledge graph, use the actual node IDs (e.g., "n1", "n2").
2. Every category attack must explain what the category misses or distorts.
3. preservedValid must contain at least one element — no thesis is entirely wrong.
4. The rewriteOperator must directly address the most critical tension identified.
5. If you are uncertain whether a tension is real, say so in the description rather than omitting it.
6. Prioritize accuracy over validation — identify genuine weaknesses, not superficial ones.
7. You may specify multiple rewrite operators if the critique warrants compound transformations. Use the "rewriteOperators" array field instead of the singular "rewriteOperator" when needed.

CRITICAL (restated): Output ONLY the JSON object. No other text.`
}

export function buildSublationPrompt(
  theses: ThesisOutput[],
  negations: NegationOutput[],
  contradictions: ContradictionOutput[],
  mergedGraph?: CompactGraph | null,
  cycleNumber?: number,
  researchEvidence?: ResearchEvidence | null,
  userContext?: string | null
): string {
  // Use compact graphs if available, fall back to truncated rawText
  const thesesRepr = theses
    .map((t, i) => {
      if (t.graph) return `[${i + 1}] (${t.lens}): ${capGraphForPrompt(t.graph, 2000)}`
      return `[${i + 1}] (${t.lens}): ${truncateRawText(t.rawText)}`
    })
    .join('\n\n')

  const negationsRepr = negations
    .map(
      (n, i) =>
        `[${i + 1}]: tensions=${JSON.stringify(n.internalTensions)}, attacks=${JSON.stringify(n.categoryAttacks)}, operator=${n.rewriteOperator}`
    )
    .join('\n')

  const contradictionsRepr =
    contradictions.length > 0
      ? contradictions.map((c) => `- [${c.severity}] ${c.type}: ${c.description}`).join('\n')
      : '(No contradictions found)'

  const isFirstCycle = !cycleNumber || cycleNumber <= 1
  const priorGraphContext =
    mergedGraph && !isFirstCycle
      ? `\nPRIOR MERGED GRAPH (evolve this — preserve valid nodes, add new insights, resolve contradictions):\n${capGraphForPrompt(mergedGraph, 5000)}\n`
      : ''

  const graphInstruction = isFirstCycle
    ? 'Create an initial merged knowledge graph by integrating all thesis perspectives.'
    : 'Evolve the prior merged graph by integrating new thesis insights and resolving contradictions.'

  // Inject user-provided context on first cycle only (later cycles have it in the graph)
  const userContextSection =
    userContext && isFirstCycle
      ? `\n${userContext}\n\nIncorporate claims and concepts from the user-provided context above into the merged graph where relevant.\n`
      : ''

  // Inject research evidence for grounding synthesis in external data
  let researchSection = ''
  if (researchEvidence && researchEvidence.claims.length > 0) {
    const claimLines = [...researchEvidence.claims]
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 8)
      .map((c, i) => {
        const source = researchEvidence.sources.find((s) => s.sourceId === c.sourceId)
        const sourceTag = source
          ? `[${source.domain}, quality=${source.qualityScore.toFixed(2)}]`
          : ''
        return `  ${i + 1}. [${c.evidenceType}, conf=${c.confidence.toFixed(2)}] ${sourceTag} ${c.claimText}`
      })
      .join('\n')

    researchSection = `
RESEARCH EVIDENCE (use to ground synthesis — preserve sourceId/sourceUrl on evidence-backed nodes):
${claimLines}
`
  }

  return `CRITICAL: Output ONLY a valid JSON object. No markdown fences, no explanation, no preamble.

## Role
You are a dialectical synthesizer performing Aufhebung — merging multiple thesis graphs into a single evolved knowledge graph that preserves valid elements, resolves contradictions, and produces emergent insights.

## Task
${graphInstruction}
${userContextSection}${priorGraphContext}
## Thesis Graphs
${thesesRepr}

## Negations
${negationsRepr}

## Contradictions
${contradictionsRepr}
${researchSection}
## Output Schema
{
  "mergedGraph": {
    "nodes": [{"id": "n1", "label": "<=80 chars", "type": "claim|concept|mechanism|prediction", "note": "optional <=150 chars", "sourceId": "optional", "sourceUrl": "optional", "sourceConfidence": 0.0-1.0}],
    "edges": [{"from": "n1", "to": "n2", "rel": "causes|contradicts|supports|mediates|scopes", "weight": 0.0-1.0}],
    "summary": "<=200 char headline of the synthesis",
    "reasoning": "<=500 chars synthesizing qualitative insights from all thesis reasonings",
    "confidence": 0.0-1.0,
    "regime": "Conditions under which the synthesis holds",
    "temporalGrain": "Time scale"
  },
  "diff": {
    "addedNodes": ["IDs of nodes added"],
    "removedNodes": ["IDs of nodes removed"],
    "addedEdges": [{"from": "n1", "to": "n2", "rel": "causes"}],
    "removedEdges": [],
    "modifiedNodes": [{"id": "n1", "oldLabel": "...", "newLabel": "..."}],
    "resolvedContradictions": ["Descriptions of 'contradicts' edges resolved"],
    "newContradictions": ["Descriptions of new 'contradicts' edges discovered"]
  },
  "resolvedContradictions": ["Which input contradictions were resolved and how"]
}

## Example Output
${SUBLATION_OUTPUT_EXAMPLE}

## Rules
1. Maximum 15 nodes in your synthesis output graph. Prune low-confidence nodes that are not critical to resolving contradictions.
2. Preserve valid nodes from all thesis graphs and the prior graph — but remove low-confidence nodes that were contradicted without replacement. Prefer a leaner graph with fewer precise nodes over a bloated one with speculative claims.
3. Connect new nodes to existing nodes via typed edges.
4. Merge redundant nodes that express the same concept under different labels.
5. Resolve contradictions by replacing 'contradicts' edges with 'mediates' or 'supports' edges where evidence permits.
6. The reasoning field must synthesize qualitative insights from all thesis reasonings, not repeat a single one.
7. When research evidence is provided, populate sourceId, sourceUrl, and sourceConfidence on evidence-backed nodes.
8. If you are uncertain whether a contradiction is truly resolved, note the remaining uncertainty in the relevant node's "note" field.
9. Actively prune: if a node's only supporting edges come from a single low-confidence thesis and it was challenged by negation, remove it and list it in removedNodes.
${contradictions.length > 0 ? '10. You MUST resolve at least one HIGH-severity contradiction from the input.' : '10. Focus on integrating the strongest elements from all theses into a coherent whole.'}

CRITICAL (restated): Output ONLY the JSON object. No other text.`
}

// ----- JSON Repair Utility -----

/**
 * Extract JSON from LLM output.
 * Handles pure JSON, JSON in markdown code blocks, and JSON embedded in text.
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

export interface JsonRepairOptions {
  context?: string
  goal?: string
  originalTaskPrompt?: string
  originalSystemPrompt?: string
  schemaHint?: string
}

/**
 * Attempt a single LLM repair of malformed JSON output.
 *
 * Sends the raw text + optional validation errors to a dedicated GPT repair agent.
 * Returns corrected JSON string on success, null on failure.
 */
export async function repairJsonOutput(
  rawText: string,
  zodError: ZodError | null | undefined,
  schema: z.ZodTypeAny,
  execContext: AgentExecutionContext,
  options: JsonRepairOptions = {}
): Promise<string | null> {
  const contextBlock = options.context
    ? `## Context\n${sanitizeForPrompt(options.context, 200)}\n\n`
    : ''
  const goalBlock = options.goal ? `## Goal\n${sanitizeForPrompt(options.goal, 400)}\n\n` : ''
  const taskBlock = options.originalTaskPrompt
    ? `## Original Task Prompt\n${truncateRawText(options.originalTaskPrompt)}\n\n`
    : ''
  const systemBlock = options.originalSystemPrompt
    ? `## Original System Prompt\n${truncateRawText(options.originalSystemPrompt)}\n\n`
    : ''
  const schemaBlock = options.schemaHint
    ? `## Target Schema Summary\n${truncateRawText(options.schemaHint)}\n\n`
    : ''
  const validationBlock = zodError
    ? `## Validation Errors\n${truncateRawText(zodError.message)}\n\n`
    : '## Validation Errors\nThe output either did not contain valid JSON or could not be validated against the target schema.\n\n'

  const repairPrompt = `CRITICAL: Return ONLY valid JSON. No explanation, no markdown fences.

## Task
Repair the output below so it matches the target JSON schema exactly.

${contextBlock}${goalBlock}${taskBlock}${systemBlock}${schemaBlock}${validationBlock}## Original Output
${truncateRawText(rawText)}

## Rules
1. Preserve substantive content when possible.
2. If the output is relevant but malformed, repair it into schema-compliant JSON.
3. If a required field is missing, add it with a reasonable default.
4. If a field has the wrong type, cast it to the correct type.
5. If the output contains prose plus structured content, extract only the structured content.
6. Do not return markdown, code fences, commentary, placeholders, or ellipses.

CRITICAL (restated): Return ONLY the corrected JSON object. No other text.`

  const repairAgent = {
    agentId: 'system_json_repair' as AgentConfig['agentId'],
    name: 'JSON Repair (GPT)',
    modelProvider: 'openai' as const,
    modelName: DEFAULT_MODELS.openai,
    modelTier: 'fast' as const,
    systemPrompt:
      'You are a JSON repair specialist. You receive malformed or off-schema outputs, preserve the relevant content, and return corrected JSON that passes the target schema. Return ONLY valid JSON with all required keys present.',
    temperature: 0,
    archived: false,
    createdAtMs: Date.now(),
    updatedAtMs: Date.now(),
    role: 'formatter' as const,
    syncState: 'synced' as const,
    version: 1,
    userId: execContext.userId,
  } satisfies AgentConfig

  try {
    const step = await executeAgentWithEvents(repairAgent, repairPrompt, {}, execContext, {
      stepNumber: 0,
      nodeId: 'json_repair',
    })

    const parsed = extractJsonFromOutput(step.output)
    if (!parsed) return null

    const result = schema.safeParse(parsed)
    if (result.success) return JSON.stringify(parsed)

    return null
  } catch {
    return null
  }
}
