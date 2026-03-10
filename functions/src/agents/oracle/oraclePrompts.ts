/**
 * Oracle Scenario Planning Prompt Builders
 *
 * System prompt construction for each Oracle agent role.
 * Each builder injects:
 * - Role-specific instructions
 * - Relevant cookbook recipes (via axiomLoader)
 * - Prior phase summaries (cross-phase context)
 * - Structured JSON output format
 */

import type {
  OracleEvidence,
  OracleGateRemediationPlan,
  OracleGateType,
  OraclePhaseSummary,
  OracleScope,
  OracleSteepCategory,
} from '@lifeos/agents'
import {
  getRecipesForAgent,
  getTechniquesForRecipe,
  getSystemElevations,
  formatRecipeForPrompt,
  formatTechniqueForPrompt,
  formatAxiomForPrompt,
} from './axiomLoader.js'
import { formatPhaseSummariesForContext } from './phaseSummarizer.js'

// ----- Shared Helpers -----

type OracleDepthMode = 'quick' | 'standard' | 'deep'

function buildCookbookContext(
  agentRole: string,
  phase?: string,
  depthMode: OracleDepthMode = 'standard'
): string {
  const allRecipes = getRecipesForAgent(agentRole, phase)
  if (allRecipes.length === 0) return ''

  const recipeLimit = depthMode === 'quick' ? 2 : depthMode === 'deep' ? 5 : 3
  const recipes = allRecipes.slice(0, recipeLimit)

  const parts: string[] = ['## Axiom Cookbook — Your Reasoning Framework\n']

  // Track unique technique IDs to avoid duplicates
  const seenTechniques = new Set<string>()

  for (const recipe of recipes) {
    parts.push(formatRecipeForPrompt(recipe))
    const techniques = getTechniquesForRecipe(recipe.id)
    for (const t of techniques) {
      if (!seenTechniques.has(t.id)) {
        seenTechniques.add(t.id)
        parts.push(formatTechniqueForPrompt(t))
      }
    }
    parts.push('')
  }

  return parts.join('\n')
}

function buildPriorContext(phaseSummaries: OraclePhaseSummary[]): string {
  const ctx = formatPhaseSummariesForContext(phaseSummaries)
  return ctx ? `\n${ctx}\n` : ''
}

function buildEvidenceContext(evidence: OracleEvidence[]): string {
  if (evidence.length === 0) return ''

  // Separate enriched (crawled) from snippet-only evidence
  const enriched = evidence.filter((e) => e.enrichedExcerpt && e.crawlStatus === 'success')
  const snippetOnly = evidence.filter((e) => !e.enrichedExcerpt || e.crawlStatus !== 'success')

  const lines: string[] = []

  // Show enriched evidence first (up to 6 items, ~500 chars each)
  if (enriched.length > 0) {
    lines.push('### Deep Evidence (full-page crawl)')
    for (const item of enriched.slice(0, 6)) {
      const source = sanitizeForPrompt(item.source, 80)
      const excerpt = sanitizeForPrompt(item.enrichedExcerpt!, 500)
      lines.push(
        `- ${item.id} [${item.category}] ${source} (${item.date}, rel=${item.reliability.toFixed(2)}):\n  ${excerpt}`
      )
    }
  }

  // Then show snippet-only evidence to fill remaining slots (up to 12 total)
  const snippetSlots = Math.max(0, 12 - enriched.length)
  if (snippetOnly.length > 0 && snippetSlots > 0) {
    if (enriched.length > 0) lines.push('### Additional Evidence (search snippets)')
    for (const item of snippetOnly.slice(0, snippetSlots)) {
      const source = sanitizeForPrompt(item.source, 80)
      const excerpt = sanitizeForPrompt(item.excerpt, 180)
      lines.push(
        `- ${item.id} [${item.category}] ${source} (${item.date}, rel=${item.reliability.toFixed(2)}): ${excerpt}`
      )
    }
  }

  return `\n## Phase 0 Evidence\nUse these evidence items when grounding claims, evidenceIds, and graph structure:\n${lines.join('\n')}\n`
}

function sanitizeForPrompt(input: string, maxLength = 500): string {
  return input
    .replace(/[`{}[\]\\$"#]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength)
}

function sanitizeScope(scope: OracleScope): OracleScope {
  return {
    ...scope,
    topic: sanitizeForPrompt(scope.topic, 200),
    domain: sanitizeForPrompt(scope.domain, 120),
    timeHorizon: sanitizeForPrompt(scope.timeHorizon, 120),
    geography: sanitizeForPrompt(scope.geography, 120),
    decisionContext: sanitizeForPrompt(scope.decisionContext, 240),
    boundaries: {
      inScope: scope.boundaries.inScope.map((item) => sanitizeForPrompt(item, 120)),
      outOfScope: scope.boundaries.outOfScope.map((item) => sanitizeForPrompt(item, 120)),
    },
  }
}

function formatSteepCategories(categories: OracleSteepCategory[]): string {
  return categories.length > 0 ? categories.map((category) => `- ${category}`).join('\n') : '- none'
}

function buildRemediationContext(
  remediationPlan?: OracleGateRemediationPlan | null,
  gateFeedback?: string | null,
  humanFeedback?: string | null
): string {
  const gateText = gateFeedback?.trim()
  const humanText = humanFeedback?.trim()
  if (!remediationPlan && !gateText && !humanText) return ''

  const parts: string[] = ['## Gate Remediation Requirements']

  if (gateText) {
    parts.push(`Failed gate feedback:\n"${sanitizeForPrompt(gateText, 900)}"`)
  }

  if (humanText) {
    parts.push(`Human review feedback:\n"${sanitizeForPrompt(humanText, 600)}"`)
  }

  if (remediationPlan) {
    parts.push(`Target retry node: ${remediationPlan.targetNode}`)
    parts.push(`Summary: ${sanitizeForPrompt(remediationPlan.summary, 500)}`)
    parts.push(
      `Required fixes:\n${
        remediationPlan.requiredFixes.length > 0
          ? remediationPlan.requiredFixes
              .map((item: string) => `- ${sanitizeForPrompt(item, 220)}`)
              .join('\n')
          : '- produce meaningful improvements before retry'
      }`
    )
    parts.push(
      `Required deliverables:\n${
        remediationPlan.requiredDeliverables.length > 0
          ? remediationPlan.requiredDeliverables
              .map((item: string) => `- ${sanitizeForPrompt(item, 220)}`)
              .join('\n')
          : '- strengthen traceability and decision usefulness'
      }`
    )
    parts.push(
      `Missing STEEP+V coverage:\n${formatSteepCategories(remediationPlan.missingSteepvCategories)}`
    )
    parts.push(
      `Retry guardrails:
- Use net-new evidence where available.
- Do not restate weak claims unless strengthened.
- Add assumptions, KG structure, falsifiers, and measurable indicators when requested.
- Improve axiom grounding when required.
- Minimum new evidence: ${remediationPlan.minNewEvidenceCount}
- Minimum new claims: ${remediationPlan.minNewClaimCount}
- Minimum new assumptions: ${remediationPlan.minNewAssumptionCount}
- Minimum new KG edges: ${remediationPlan.minNewKgEdges}
- Minimum axiom grounding: ${remediationPlan.minAxiomGroundingPercent}`
    )
  }

  parts.push(
    'Treat these remediation requirements as binding. If a requirement cannot be satisfied, reduce confidence and improve traceability instead of ignoring it.'
  )

  return `${parts.join('\n\n')}\n`
}

function buildJsonOnlyRules(extraRules: string[] = []): string {
  return [
    'Output ONLY one JSON object.',
    'Do not include markdown fences, prose, labels, or commentary before/after JSON.',
    'Do not echo the input context, evidence, or schema.',
    'Include every required top-level key even when arrays are empty.',
    'Use empty arrays instead of null for list fields unless the schema explicitly requires null.',
    'Do not invent extra top-level keys.',
    ...extraRules,
  ]
    .map((rule, index) => `${index + 1}. ${rule}`)
    .join('\n')
}

const DECOMPOSER_OUTPUT_EXAMPLE = `{
  "claims": [
    {
      "id": "CLM-001",
      "type": "causal",
      "text": "AI reduces feature-development cost for horizontal SaaS vendors.",
      "confidence": 0.74,
      "confidenceBasis": "expert_judgment",
      "assumptions": ["ASM-001"],
      "evidenceIds": ["EVD-001"],
      "dependencies": [],
      "axiomRefs": ["AXM-058"],
      "createdBy": "decomposer:model_name",
      "phase": 1
    }
  ],
  "assumptions": [
    {
      "id": "ASM-001",
      "type": "technical",
      "statement": "AI coding tools continue improving through the analysis horizon.",
      "sensitivity": "high",
      "observables": ["Benchmark gains in coding-agent performance"],
      "confidence": 0.65
    }
  ]
}`

const DECOMPOSER_EMPTY_EXAMPLE = `{
  "claims": [],
  "assumptions": []
}`

const SYSTEMS_MAPPER_OUTPUT_EXAMPLE = `{
  "nodes": [
    {
      "id": "N-001",
      "type": "trend",
      "label": "AI lowers software development costs",
      "ledgerRef": "CLM-001",
      "properties": {
        "domain": "technological",
        "impact": "high"
      }
    },
    {
      "id": "N-002",
      "type": "constraint",
      "label": "Feature moats weaken",
      "ledgerRef": "CLM-002",
      "properties": {
        "domain": "economic"
      }
    }
  ],
  "edges": [
    {
      "source": "N-001",
      "target": "N-002",
      "type": "causes",
      "polarity": "-",
      "strength": 0.81,
      "lag": "short"
    }
  ],
  "loops": []
}`

const SYSTEMS_MAPPER_EMPTY_EXAMPLE = `{
  "nodes": [],
  "edges": [],
  "loops": []
}`

const VERIFIER_OUTPUT_EXAMPLE = `{
  "verifiedClaims": [
    {
      "claimId": "CLM-001",
      "adjustedConfidence": 0.68
    }
  ],
  "axiomGroundingPercent": 0.83
}`

const VERIFIER_EMPTY_EXAMPLE = `{
  "verifiedClaims": [],
  "axiomGroundingPercent": 0
}`

/**
 * Build system elevation constraints for prompts that require them.
 * The 7 system elevations are axioms elevated from passive references
 * to architectural constraints that shape Oracle's reasoning.
 *
 * @param relevantIds - Subset of elevation axiom IDs relevant to this agent
 */
function buildSystemElevationContext(relevantIds: string[]): string {
  const elevations = getSystemElevations()
  if (elevations.length === 0) return ''

  const relevant =
    relevantIds.length > 0 ? elevations.filter((a) => relevantIds.includes(a.id)) : elevations

  if (relevant.length === 0) return ''

  const parts: string[] = [
    '## System Elevations — Mandatory Structural Constraints\n',
    'The following axioms are NOT optional cookbook references — they are architectural',
    'requirements that MUST be reflected in your output.\n',
  ]

  for (const axiom of relevant) {
    parts.push(formatAxiomForPrompt(axiom))
    if (axiom.systemElevation) {
      parts.push(`**ARCHITECTURAL ROLE:** ${axiom.systemElevation.role}`)
      parts.push(`**EXPECTED BEHAVIOR:** ${axiom.systemElevation.behavior}\n`)
    }
  }

  return parts.join('\n')
}

// ----- Phase 0: Context Gathering -----

export function buildContextGathererPrompt(
  goal: string,
  depthMode: OracleDepthMode = 'standard'
): string {
  const cookbook = buildCookbookContext('context_gatherer', 'Phase 0', depthMode)
  const sanitizedGoal = sanitizeForPrompt(goal, 500)

  return `You are an Oracle Context Gatherer. Your task is to parse a strategic question into a structured scope and plan the initial evidence search.

## Your Goal
"${sanitizedGoal}"

## Task
1. Parse the goal into a structured scope object with these fields:
   - topic: The core subject
   - domain: The industry/field
   - timeHorizon: How far forward to look
   - geography: Geographic scope
   - decisionContext: What decision this analysis will inform
   - boundaries: { inScope: [...], outOfScope: [...] }

2. Plan STEEP+V evidence gathering:
   - Social, Technological, Economic, Environmental, Political, Values
   - Generate 2-3 search queries per STEEP+V category
   - Each query should target different aspects of the topic
3. Identify the core question, major subquestions, key concepts, and explicit verification targets that later phases must test.

${cookbook}

## Output Format (JSON only):
{
  "canonicalGoal": "<normalized goal>",
  "coreQuestion": "<single core question>",
  "subquestions": ["subquestion 1", "subquestion 2"],
  "keyConcepts": ["concept 1", "concept 2"],
  "verificationTargets": ["target 1", "target 2"],
  "plannerRationale": "<why this framing and search plan are appropriate>",
  "scope": {
    "topic": "<string>",
    "domain": "<string>",
    "timeHorizon": "<string>",
    "geography": "<string>",
    "decisionContext": "<string>",
    "boundaries": { "inScope": ["..."], "outOfScope": ["..."] }
  },
  "searchPlan": {
    "social": ["query1", "query2"],
    "technological": ["query1", "query2"],
    "economic": ["query1", "query2"],
    "environmental": ["query1", "query2"],
    "political": ["query1", "query2"],
    "values": ["query1", "query2"]
  }
}`
}

export function buildGateRemediationPlannerPrompt(input: {
  goal: string
  gateType: OracleGateType
  gateFeedback?: string | null
  humanFeedback?: string | null
  phaseSummaries: OraclePhaseSummary[]
  artifactStats: {
    claimsCount: number
    assumptionsCount: number
    evidenceCount: number
    knowledgeGraphNodes: number
    knowledgeGraphEdges: number
    axiomGroundingPercent: number
    missingSteepvCategories: OracleSteepCategory[]
  }
}): string {
  const prior = buildPriorContext(input.phaseSummaries)
  const gateFeedback = input.gateFeedback?.trim()
    ? sanitizeForPrompt(input.gateFeedback, 900)
    : 'none provided'
  const humanFeedback = input.humanFeedback?.trim()
    ? sanitizeForPrompt(input.humanFeedback, 600)
    : 'none provided'

  return `You are an Oracle Gate Remediation Planner. Convert a failed Oracle gate review into a concrete remediation plan that forces targeted evidence gathering and measurable improvement before retry.

## Goal
"${sanitizeForPrompt(input.goal, 500)}"

## Gate
${input.gateType}

${prior}

## Failed Gate Feedback
"${gateFeedback}"

## Human Review Feedback
"${humanFeedback}"

## Current Artifact Stats
- Claims: ${input.artifactStats.claimsCount}
- Assumptions: ${input.artifactStats.assumptionsCount}
- Evidence items: ${input.artifactStats.evidenceCount}
- KG nodes: ${input.artifactStats.knowledgeGraphNodes}
- KG edges: ${input.artifactStats.knowledgeGraphEdges}
- Axiom grounding percent: ${input.artifactStats.axiomGroundingPercent}
- Missing STEEP+V coverage:
${formatSteepCategories(input.artifactStats.missingSteepvCategories)}

## Task
1. Identify the minimum required fixes before a retry is justified.
2. Choose the correct retry target node for the failed gate.
3. Produce targeted search queries to fill evidence, coverage, falsification, and primary-source gaps.
4. Set concrete thresholds for new evidence, new claims, new assumptions, and new KG edges.
5. Raise the axiom grounding threshold when the feedback calls it out.

## Output Format (JSON only):
{
  "summary": "<string>",
  "targetNode": "decomposer|scanner|equilibrium_analyst",
  "requiredFixes": ["<fix>"],
  "requiredDeliverables": ["<deliverable>"],
  "missingSteepvCategories": ["social", "political"],
  "requirePrimarySources": true,
  "requireAlternativeExplanations": true,
  "requireFalsifiers": true,
  "requireQuantification": true,
  "requireAssumptionRegisterExpansion": true,
  "requireKnowledgeGraphExpansion": true,
  "requireAxiomGroundingImprovement": true,
  "minNewEvidenceCount": 6,
  "minNewClaimCount": 3,
  "minNewAssumptionCount": 2,
  "minNewKgEdges": 4,
  "minAxiomGroundingPercent": 0.8,
  "searchPlan": {
    "social": ["query 1"],
    "technological": ["query 1"],
    "economic": ["query 1"],
    "environmental": ["query 1"],
    "political": ["query 1"],
    "values": ["query 1"]
  }
}

## Rules
${buildJsonOnlyRules([
  'Return every top-level key every time.',
  'Use empty arrays instead of null for missing categories or requirements.',
  'Use a targeted follow-up searchPlan, not a generic full restart.',
  'Choose the retry target that matches the failed gate.',
  'Set thresholds high enough to block superficial retries.',
])}`
}

export function buildEvidenceClusteringPrompt(scope: OracleScope, searchResults: string): string {
  const safeScope = sanitizeScope(scope)
  return `You are an Oracle Context Gatherer performing evidence clustering.

## Scope
Topic: ${safeScope.topic}
Domain: ${safeScope.domain}
Time Horizon: ${safeScope.timeHorizon}
Geography: ${safeScope.geography}

## Search Results
${searchResults}

## Task
1. Cluster the evidence by STEEP+V category.
2. For each piece of evidence, create an evidence record:
   - id: "EVD-001", "EVD-002", etc.
   - source: Title/author
   - url: Source URL
   - date: Publication date
   - excerpt: Key excerpt (max 200 chars)
   - reliability: 0-1 (peer-reviewed=0.9, editorial=0.7, anecdotal=0.4)
   - searchTool: Which tool found it

3. Verify >= 3 evidence items per STEEP+V category. Flag gaps.

## Output Format (JSON only):
{
  "evidence": [
    { "id": "EVD-001", "source": "...", "url": "...", "date": "...", "excerpt": "...", "reliability": 0.8, "searchTool": "serp" }
  ],
  "categoryCoverage": {
    "social": { "count": 0, "sufficient": false },
    "technological": { "count": 0, "sufficient": false },
    "economic": { "count": 0, "sufficient": false },
    "environmental": { "count": 0, "sufficient": false },
    "political": { "count": 0, "sufficient": false },
    "values": { "count": 0, "sufficient": false }
  },
  "gaps": ["categories needing more evidence"]
}`
}

// ----- Phase 1: Decomposition -----

export function buildDecomposerPrompt(
  goal: string,
  scope: OracleScope,
  phaseSummaries: OraclePhaseSummary[],
  depthMode: OracleDepthMode = 'standard',
  evidence: OracleEvidence[] = [],
  verificationTargets: string[] = [],
  seedClaimsSummary = '',
  remediationPlan?: OracleGateRemediationPlan | null,
  gateFeedback?: string | null,
  humanFeedback?: string | null
): string {
  const cookbook = buildCookbookContext('decomposer', 'Phase 1', depthMode)
  const prior = buildPriorContext(phaseSummaries)
  const evidenceContext = buildEvidenceContext(evidence)
  const sanitizedGoal = sanitizeForPrompt(goal, 500)
  const safeScope = sanitizeScope(scope)
  const verificationContext =
    verificationTargets.length > 0
      ? `\n## Verification Targets\n${verificationTargets.map((target) => `- ${sanitizeForPrompt(target, 160)}`).join('\n')}\n`
      : ''
  const seedClaimsContext =
    seedClaimsSummary.trim().length > 0
      ? `\n## Seed Claims From Attached Context\n${seedClaimsSummary}\n`
      : ''
  const remediationContext = buildRemediationContext(remediationPlan, gateFeedback, humanFeedback)

  return `You are an Oracle Decomposer. Break down a strategic question into a sub-question tree with axiom-guided reasoning scaffolds.

## Goal
"${sanitizedGoal}"

## Scope
Topic: ${safeScope.topic} | Domain: ${safeScope.domain} | Horizon: ${safeScope.timeHorizon} | Geography: ${safeScope.geography}
Decision context: ${safeScope.decisionContext}

${prior}

${evidenceContext}

${verificationContext}

${seedClaimsContext}

${remediationContext}

${cookbook}

## Task
1. Internally decompose the goal into ${depthMode === 'quick' ? '3-5' : depthMode === 'deep' ? '6-10' : '4-8'} sub-questions that collectively cover the full scope.
2. For each sub-question, identify which cookbook recipes and axioms are most relevant.
3. Generate initial claims with confidence levels and axiom references.
4. When evidence is available, anchor claims to the strongest relevant evidence items and populate evidenceIds.

## Output Format (JSON only — no markdown, no preamble, no explanation):
{
  "claims": [
    {
      "id": "CLM-001",
      "type": "descriptive|causal|forecast",
      "text": "<string>",
      "confidence": 0.7,
      "confidenceBasis": "data|model_consensus|expert_judgment|speculative",
      "assumptions": [],
      "evidenceIds": ["EVD-001"],
      "dependencies": [],
      "axiomRefs": ["AXM-058"],
      "createdBy": "decomposer:model_name",
      "phase": 1
    }
  ],
  "assumptions": [
    {
      "id": "ASM-001",
      "type": "economic|technical|behavioral|regulatory|structural",
      "statement": "<string>",
      "sensitivity": "high|medium|low",
      "observables": ["<what would confirm/deny>"],
      "confidence": 0.6
    }
  ]
}

## Example Output
${DECOMPOSER_OUTPUT_EXAMPLE}

## Empty-but-valid Fallback
${DECOMPOSER_EMPTY_EXAMPLE}

## Rules
${buildJsonOnlyRules([
  'Return both "claims" and "assumptions" keys every time.',
  'Use only the allowed claim and assumption enum values shown in the schema.',
  'If evidence is weak, lower confidence instead of adding prose outside JSON.',
  'Do not duplicate semantically identical claims.',
])}`
}

export function buildSystemsMapperPrompt(
  scope: OracleScope,
  claimsSummary: string,
  phaseSummaries: OraclePhaseSummary[],
  depthMode: OracleDepthMode = 'standard',
  evidence: OracleEvidence[] = [],
  priorGraphSummary = '',
  remediationPlan?: OracleGateRemediationPlan | null,
  gateFeedback?: string | null,
  humanFeedback?: string | null
): string {
  const cookbook = buildCookbookContext('systems_mapper', 'Phase 1', depthMode)
  const prior = buildPriorContext(phaseSummaries)
  const evidenceContext = buildEvidenceContext(evidence)
  const safeScope = sanitizeScope(scope)
  const starterGraphContext =
    priorGraphSummary.trim().length > 0
      ? `\n## Starter Graph From Attached Context\n${priorGraphSummary}\n`
      : ''
  const remediationContext = buildRemediationContext(remediationPlan, gateFeedback, humanFeedback)

  return `You are an Oracle Systems Mapper. Construct a causal knowledge graph from the claims and evidence gathered so far.

## Scope
${safeScope.topic} | ${safeScope.domain} | ${safeScope.timeHorizon}

${prior}

${evidenceContext}

${starterGraphContext}

${remediationContext}

## Claims from Decomposition
${claimsSummary}

${cookbook}

## Task
1. Create graph nodes for principles, constraints, trends, uncertainties, and variables.
2. Draw edges with polarity (+/-/conditional), strength (0-1), and lag (immediate/short/medium/long).
3. Identify feedback loops (reinforcing/balancing).
4. Find leverage points using Meadows hierarchy.

## Output Format (JSON only):
{
  "nodes": [
    { "id": "N-001", "type": "principle|constraint|trend|uncertainty|variable|scenario_state", "label": "<string>", "ledgerRef": "CLM-001", "properties": {} }
  ],
  "edges": [
    { "source": "N-001", "target": "N-002", "type": "causes|constrains|disrupts|reinforces|resolves_as|supports|contradicts|depends_on", "polarity": "+|-|conditional", "strength": 0.8, "lag": "immediate|short|medium|long" }
  ],
  "loops": [
    { "id": "L-001", "type": "reinforcing|balancing", "nodes": ["N-001", "N-002", "N-003"], "description": "<string>" }
  ]
}

## Example Output
${SYSTEMS_MAPPER_OUTPUT_EXAMPLE}

## Empty-but-valid Fallback
${SYSTEMS_MAPPER_EMPTY_EXAMPLE}

## Rules
${buildJsonOnlyRules([
  'Return "nodes", "edges", and "loops" keys every time.',
  'Use only the allowed node and edge type values shown in the schema.',
  'Every edge source and target must reference an existing node ID.',
  'Use an empty "loops" array when no valid loop is found.',
])}`
}

export function buildVerifierPrompt(
  claimsSummary: string,
  phaseSummaries: OraclePhaseSummary[],
  depthMode: OracleDepthMode = 'standard',
  evidence: OracleEvidence[] = [],
  verificationTargets: string[] = [],
  remediationPlan?: OracleGateRemediationPlan | null,
  gateFeedback?: string | null,
  humanFeedback?: string | null
): string {
  const cookbook = buildCookbookContext('verifier', 'Phase 1', depthMode)
  const prior = buildPriorContext(phaseSummaries)
  const evidenceContext = buildEvidenceContext(evidence)
  const verificationContext =
    verificationTargets.length > 0
      ? `\n## Verification Targets\n${verificationTargets.map((target) => `- ${sanitizeForPrompt(target, 160)}`).join('\n')}\n`
      : ''
  const remediationContext = buildRemediationContext(remediationPlan, gateFeedback, humanFeedback)

  const elevations = buildSystemElevationContext(['AXM-096'])

  return `You are an Oracle Verifier. Run Chain-of-Verification (CoVe) on claims and compute axiom grounding.

${prior}

${evidenceContext}

${verificationContext}

${remediationContext}

## Claims to Verify
${claimsSummary}

${cookbook}

${elevations}

## Task
1. For each claim, run CoVe:
   a. Generate 2-3 verification questions
   b. Answer each independently
   c. Check consistency with original claim
   d. Adjust confidence if inconsistent
2. Compute axiom grounding %: fraction of claims with at least one AXM-xxx reference.
3. Flag: unsupported claims, circular reasoning, assumptions stated as facts.

## Output Format (JSON only):
{
  "verifiedClaims": [
    {
      "claimId": "CLM-001",
      "adjustedConfidence": 0.65
    }
  ],
  "axiomGroundingPercent": 0.82
}

## Example Output
${VERIFIER_OUTPUT_EXAMPLE}

## Empty-but-valid Fallback
${VERIFIER_EMPTY_EXAMPLE}

## Rules
${buildJsonOnlyRules([
  'Return both "verifiedClaims" and "axiomGroundingPercent" keys every time.',
  'If no claim confidence changes are justified, return an empty "verifiedClaims" array.',
  'Keep "axiomGroundingPercent" numeric between 0 and 1.',
])}`
}

// ----- Phase 2: Trend Scanning -----

export function buildScannerPrompt(
  scope: OracleScope,
  phaseSummaries: OraclePhaseSummary[],
  depthMode: OracleDepthMode = 'standard',
  remediationPlan?: OracleGateRemediationPlan | null,
  gateFeedback?: string | null,
  humanFeedback?: string | null
): string {
  const cookbook = buildCookbookContext('scanner', 'Phase 2', depthMode)
  const prior = buildPriorContext(phaseSummaries)
  const safeScope = sanitizeScope(scope)
  const remediationContext = buildRemediationContext(remediationPlan, gateFeedback, humanFeedback)

  return `You are an Oracle Trend Scanner. Identify STEEP+V signals and build trend objects.

## Scope
${safeScope.topic} | ${safeScope.domain} | ${safeScope.timeHorizon} | ${safeScope.geography}

${prior}

${remediationContext}

${cookbook}

## Task
1. Identify ${depthMode === 'quick' ? '4-8' : depthMode === 'deep' ? '12-20' : '8-15'} trends across STEEP+V categories (Social, Technological, Economic, Environmental, Political, Values).
2. For each trend assess: direction, momentum, impact score (0-1), uncertainty score (0-1).
3. Link trends to Phase 1 knowledge graph nodes.
4. Identify second-order effects for high-impact trends.

## Output Format (JSON only):
{
  "trends": [
    {
      "id": "TRD-001",
      "statement": "<string>",
      "steepCategory": "social|technological|economic|environmental|political|values",
      "direction": "<string>",
      "momentum": "accelerating|steady|decelerating",
      "impactScore": 0.8,
      "uncertaintyScore": 0.5,
      "evidenceIds": ["EVD-001"],
      "causalLinks": ["N-001"],
      "secondOrderEffects": ["<effect1>"]
    }
  ]
}`
}

export function buildImpactAssessorPrompt(
  trendsSummary: string,
  phaseSummaries: OraclePhaseSummary[],
  depthMode: OracleDepthMode = 'standard'
): string {
  const cookbook = buildCookbookContext('impact_assessor', 'Phase 2', depthMode)
  const prior = buildPriorContext(phaseSummaries)

  return `You are an Oracle Impact Assessor. Build a cross-impact matrix and rank critical uncertainties.

${prior}

## Trends Identified
${trendsSummary}

${cookbook}

## Task
1. For each pair of significant trends/uncertainties, assess: effect (increases/decreases/enables/blocks/neutral), strength (0-1), mechanism.
2. Identify the top ${depthMode === 'quick' ? '3-5' : depthMode === 'deep' ? '8-12' : '5-8'} critical uncertainties (high impact × high uncertainty).
3. For each uncertainty, define discrete resolution states (2-4 states per uncertainty).
4. Assess controllability (none/low/medium/high) and time-to-resolution.

## Output Format (JSON only):
{
  "crossImpactMatrix": [
    { "sourceId": "TRD-001", "targetId": "TRD-003", "effect": "increases|decreases|enables|blocks|neutral", "strength": 0.7, "mechanism": "<string>" }
  ],
  "criticalUncertainties": [
    {
      "id": "UNC-001",
      "variable": "<string>",
      "states": ["state_A", "state_B"],
      "drivers": ["TRD-001"],
      "impacts": ["<what changes>"],
      "observables": ["<signpost>"],
      "controllability": "none|low|medium|high",
      "timeToResolution": "<string>"
    }
  ]
}`
}

export function buildWeakSignalHunterPrompt(
  scope: OracleScope,
  trendsSummary: string,
  phaseSummaries: OraclePhaseSummary[],
  depthMode: OracleDepthMode = 'standard'
): string {
  const cookbook = buildCookbookContext('weak_signal_hunter', 'Phase 2', depthMode)
  const prior = buildPriorContext(phaseSummaries)
  const safeScope = sanitizeScope(scope)

  return `You are an Oracle Weak Signal Hunter. Find contrarian signals and anomalies that mainstream analysis misses.

## Scope
${safeScope.topic} | ${safeScope.domain} | ${safeScope.timeHorizon}

${prior}

## Known Trends (look for what's MISSING from this list)
${trendsSummary}

${cookbook}

## Task
1. Search for contrarian viewpoints and minority expert opinions.
2. Look for anomalous data that doesn't fit the dominant narrative.
3. Check adjacent domains for parallel patterns (what happened when X occurred in industry Y?).
4. Apply Anti-Availability Search (T09): seek non-recent, non-vivid, non-confirming evidence.
5. For each signal: assess novelty, potential impact, and confidence.

## Output Format (JSON only):
{
  "weakSignals": [
    {
      "id": "WS-001",
      "statement": "<string>",
      "category": "contrarian|anomaly|cross_domain|historical_parallel",
      "novelty": "high|medium|low",
      "potentialImpact": 0.7,
      "confidence": 0.3,
      "evidenceIds": ["EVD-xxx"],
      "rationale": "<why this matters>"
    }
  ]
}`
}

// ----- Phase 3: Scenario Simulation -----

export function buildScenarioDeveloperPrompt(
  scope: OracleScope,
  skeletonsSummary: string,
  phaseSummaries: OraclePhaseSummary[],
  humanGateFeedback?: string | null,
  depthMode: OracleDepthMode = 'standard',
  remediationPlan?: OracleGateRemediationPlan | null,
  gateFeedback?: string | null
): string {
  const cookbook = buildCookbookContext('scenario_developer', 'Phase 3', depthMode)
  const prior = buildPriorContext(phaseSummaries)
  const remediationContext = buildRemediationContext(
    remediationPlan,
    gateFeedback,
    humanGateFeedback
  )
  const safeScope = sanitizeScope(scope)

  const elevations = buildSystemElevationContext(['AXM-095', 'AXM-094'])

  return `You are an Oracle Scenario Developer. Develop full scenario narratives from skeleton combinations.

## Scope
${safeScope.topic} | ${safeScope.domain} | ${safeScope.timeHorizon}

${prior}

${remediationContext}

## Scenario Skeletons to Develop
${skeletonsSummary}

${cookbook}

${elevations}

## Task
For each skeleton:
1. Develop a narrative: causal chain from current state to scenario outcome.
2. Identify which Phase 1 principles are reinforced vs disrupted.
3. Map feedback loops active in this scenario.
4. Derive implications for the decision-maker.
5. Identify signposts (early observable indicators).
6. Identify tail risks specific to this scenario.

## Output Format (JSON only):
{
  "scenarios": [
    {
      "id": "SCN-001",
      "name": "<evocative 3-5 word name>",
      "premise": { "<uncertainty_id>": "<resolved_state>", ... },
      "narrative": "<2-3 paragraph causal story>",
      "reinforcedPrinciples": ["N-001"],
      "disruptedPrinciples": ["N-005"],
      "feedbackLoops": [{ "id": "L-001", "type": "reinforcing|balancing", "nodes": ["..."], "description": "..." }],
      "implications": "<string>",
      "signposts": ["<observable>"],
      "tailRisks": ["<risk>"],
      "assumptionRegister": ["ASM-001"],
      "plausibilityScore": 0.6,
      "divergenceScore": 0.7
    }
  ]
}`
}

export function buildEquilibriumAnalystPrompt(
  uncertaintiesSummary: string,
  crossImpactSummary: string,
  phaseSummaries: OraclePhaseSummary[],
  targetScenarioCount = 4,
  humanGateFeedback?: string | null,
  depthMode: OracleDepthMode = 'standard',
  remediationPlan?: OracleGateRemediationPlan | null,
  gateFeedback?: string | null
): string {
  const cookbook = buildCookbookContext('equilibrium_analyst', 'Phase 3', depthMode)
  const prior = buildPriorContext(phaseSummaries)
  const remediationContext = buildRemediationContext(
    remediationPlan,
    gateFeedback,
    humanGateFeedback
  )

  return `You are an Oracle Equilibrium Analyst. Generate scenario skeletons from critical uncertainties using morphological analysis, then score for consistency and divergence.

${prior}

${remediationContext}

## Critical Uncertainties
${uncertaintiesSummary}

## Cross-Impact Matrix
${crossImpactSummary}

${cookbook}

## Task
1. Build a morphological field: for each critical uncertainty, list possible resolved states (from UncertaintyObject.states).
2. Generate candidate combinations (8-20 skeletons).
3. Apply consistency filter using cross-impact matrix: flag combinations where one state blocks another.
4. Score each surviving skeleton:
   - consistency (0-1): do the states cohere?
   - plausibility (0-1): given current trends, how likely?
   - divergence (0-1): how different from other skeletons?
5. Select top ${targetScenarioCount} that maximize coverage of the outcome space.

## Output Format (JSON only):
{
  "morphologicalField": {
    "<uncertainty_id>": ["state_A", "state_B"]
  },
  "candidateSkeletons": [
    { "id": "SKEL-001", "premise": { "<unc_id>": "<state>" }, "consistency": 0.8, "plausibility": 0.6, "divergence": 0.7, "eliminated": false, "eliminationReason": null }
  ],
  "selectedSkeletons": ["SKEL-001", "SKEL-003", "SKEL-007", "SKEL-012"]
}`
}

export function buildRedTeamPrompt(
  scenariosSummary: string,
  phaseSummaries: OraclePhaseSummary[],
  humanGateFeedback?: string | null,
  depthMode: OracleDepthMode = 'standard'
): string {
  const cookbook = buildCookbookContext('red_team', 'Phase 3', depthMode)
  const prior = buildPriorContext(phaseSummaries)
  const humanFeedback = buildRemediationContext(undefined, null, humanGateFeedback)

  const elevations = buildSystemElevationContext(['AXM-093', 'AXM-097', 'AXM-094'])

  return `You are an Oracle Red Team agent. Stress-test scenarios using inversion, tail risk analysis, and Lollapalooza scanning.

${prior}

${humanFeedback}

## Scenarios to Test
${scenariosSummary}

${cookbook}

${elevations}

## Task
For each scenario:
1. Apply Inversion (AXM-093): list 3-5 conditions that guarantee this scenario FAILS to materialize.
2. Run Lollapalooza Scan (T07): count independent reinforcing forces. Flag if >= 3 with no balancing force.
3. Identify tail risks not in the base scenario.
4. Check for Narrative Fallacy (AXM-092): is the causal story too neat?
5. Stress-test assumptions: which, if wrong, break the scenario?

## Output Format (JSON only):
{
  "assessments": [
    {
      "scenarioId": "SCN-001",
      "failureConditions": [
        { "condition": "<string>", "probability": 0.3, "earlyIndicator": "<string>" }
      ],
      "lollapaloozaRisk": { "reinforcingForces": 3, "balancingForces": 1, "flagged": false },
      "tailRisks": ["<risk>"],
      "narrativeFallacyScore": 0.3,
      "vulnerableAssumptions": [
        { "assumptionId": "ASM-001", "breakingImpact": "<what happens if wrong>" }
      ],
      "overallRobustness": "robust|moderate|fragile"
    }
  ]
}`
}

export function buildBackcastingPrompt(
  scenarios: string,
  phaseSummaries: OraclePhaseSummary[],
  humanGateFeedback?: string | null,
  depthMode: OracleDepthMode = 'standard'
): string {
  const cookbook = buildCookbookContext('scenario_developer', 'Phase 3', depthMode)
  const prior = buildPriorContext(phaseSummaries)
  const humanFeedback = buildRemediationContext(undefined, null, humanGateFeedback)

  const elevations = buildSystemElevationContext(['AXM-098', 'AXM-093'])

  return `You are an Oracle Backcasting Strategist. For each scenario, work backwards from the future state to identify strategic moves.

${prior}

${humanFeedback}

## Final Scenarios
${scenarios}

${cookbook}

${elevations}

## Task
For each scenario:
1. Work backwards: if this scenario occurs in ${new Date().getFullYear() + 5}, what milestones lead there?
2. Identify strategic moves categorized as:
   - no_regret: Beneficial regardless of which scenario materializes
   - option_to_buy: Small investment now that creates future capability
   - hedge: Protects against downside of specific scenarios
   - kill_criterion: Observable signal that a strategy should be abandoned
3. For each move: specify timing, which scenarios it serves, and ledger references.

## Output Format (JSON only):
{
  "backcastTimelines": [
    {
      "scenarioId": "SCN-001",
      "targetYear": "2031",
      "milestones": [
        { "year": "2027", "event": "<string>", "prerequisites": ["<string>"] }
      ]
    }
  ],
  "strategicMoves": [
    {
      "type": "no_regret|option_to_buy|hedge|kill_criterion",
      "description": "<string>",
      "worksAcross": ["SCN-001", "SCN-002"],
      "timing": "<when to execute>",
      "ledgerRefs": ["CLM-001", "ASM-002"]
    }
  ]
}`
}
