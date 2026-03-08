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

import type { OracleEvidence, OraclePhaseSummary, OracleScope } from '@lifeos/agents'
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
  depthMode: OracleDepthMode = 'standard',
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

  const lines = evidence.slice(0, 12).map((item) => {
    const source = sanitizeForPrompt(item.source, 80)
    const excerpt = sanitizeForPrompt(item.excerpt, 180)
    return `- ${item.id} [${item.category}] ${source} (${item.date}, rel=${item.reliability.toFixed(2)}): ${excerpt}`
  })

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

function buildHumanFeedbackContext(feedback?: string | null): string {
  const trimmed = feedback?.trim()
  if (!trimmed) return ''
  const sanitized = sanitizeForPrompt(trimmed, 400)

  return `## Human Gate Feedback
The user explicitly requested that Phase 3 incorporate this guidance:
"${sanitized}"

Treat this as a binding refinement request. Adjust scenario selection, narrative emphasis, and signposts accordingly while preserving causal discipline.
`
}

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

  const relevant = relevantIds.length > 0
    ? elevations.filter((a) => relevantIds.includes(a.id))
    : elevations

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
  depthMode: OracleDepthMode = 'standard',
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

export function buildEvidenceClusteringPrompt(
  scope: OracleScope,
  searchResults: string,
): string {
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
): string {
  const cookbook = buildCookbookContext('decomposer', 'Phase 1', depthMode)
  const prior = buildPriorContext(phaseSummaries)
  const evidenceContext = buildEvidenceContext(evidence)
  const sanitizedGoal = sanitizeForPrompt(goal, 500)
  const safeScope = sanitizeScope(scope)
  const verificationContext = verificationTargets.length > 0
    ? `\n## Verification Targets\n${verificationTargets.map((target) => `- ${sanitizeForPrompt(target, 160)}`).join('\n')}\n`
    : ''
  const seedClaimsContext = seedClaimsSummary.trim().length > 0
    ? `\n## Seed Claims From Attached Context\n${seedClaimsSummary}\n`
    : ''

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

${cookbook}

## Task
1. Internally decompose the goal into ${depthMode === 'quick' ? '3-5' : depthMode === 'deep' ? '6-10' : '4-8'} sub-questions that collectively cover the full scope.
2. For each sub-question, identify which cookbook recipes and axioms are most relevant.
3. Generate initial claims with confidence levels and axiom references.
4. When evidence is available, anchor claims to the strongest relevant evidence items and populate evidenceIds.

## Output Format (JSON only):
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
      "subQuestionId": "SQ-001"
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
}`
}

export function buildSystemsMapperPrompt(
  scope: OracleScope,
  claimsSummary: string,
  phaseSummaries: OraclePhaseSummary[],
  depthMode: OracleDepthMode = 'standard',
  evidence: OracleEvidence[] = [],
  priorGraphSummary = '',
): string {
  const cookbook = buildCookbookContext('systems_mapper', 'Phase 1', depthMode)
  const prior = buildPriorContext(phaseSummaries)
  const evidenceContext = buildEvidenceContext(evidence)
  const safeScope = sanitizeScope(scope)
  const starterGraphContext = priorGraphSummary.trim().length > 0
    ? `\n## Starter Graph From Attached Context\n${priorGraphSummary}\n`
    : ''

  return `You are an Oracle Systems Mapper. Construct a causal knowledge graph from the claims and evidence gathered so far.

## Scope
${safeScope.topic} | ${safeScope.domain} | ${safeScope.timeHorizon}

${prior}

${evidenceContext}

${starterGraphContext}

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
}`
}

export function buildVerifierPrompt(
  claimsSummary: string,
  phaseSummaries: OraclePhaseSummary[],
  depthMode: OracleDepthMode = 'standard',
  evidence: OracleEvidence[] = [],
  verificationTargets: string[] = [],
): string {
  const cookbook = buildCookbookContext('verifier', 'Phase 1', depthMode)
  const prior = buildPriorContext(phaseSummaries)
  const evidenceContext = buildEvidenceContext(evidence)
  const verificationContext = verificationTargets.length > 0
    ? `\n## Verification Targets\n${verificationTargets.map((target) => `- ${sanitizeForPrompt(target, 160)}`).join('\n')}\n`
    : ''

  const elevations = buildSystemElevationContext(['AXM-096'])

  return `You are an Oracle Verifier. Run Chain-of-Verification (CoVe) on claims and compute axiom grounding.

${prior}

${evidenceContext}

${verificationContext}

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
}`
}

// ----- Phase 2: Trend Scanning -----

export function buildScannerPrompt(
  scope: OracleScope,
  phaseSummaries: OraclePhaseSummary[],
  depthMode: OracleDepthMode = 'standard',
): string {
  const cookbook = buildCookbookContext('scanner', 'Phase 2', depthMode)
  const prior = buildPriorContext(phaseSummaries)
  const safeScope = sanitizeScope(scope)

  return `You are an Oracle Trend Scanner. Identify STEEP+V signals and build trend objects.

## Scope
${safeScope.topic} | ${safeScope.domain} | ${safeScope.timeHorizon} | ${safeScope.geography}

${prior}

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
  depthMode: OracleDepthMode = 'standard',
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
  depthMode: OracleDepthMode = 'standard',
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
): string {
  const cookbook = buildCookbookContext('scenario_developer', 'Phase 3', depthMode)
  const prior = buildPriorContext(phaseSummaries)
  const humanFeedback = buildHumanFeedbackContext(humanGateFeedback)
  const safeScope = sanitizeScope(scope)

  const elevations = buildSystemElevationContext(['AXM-095', 'AXM-094'])

  return `You are an Oracle Scenario Developer. Develop full scenario narratives from skeleton combinations.

## Scope
${safeScope.topic} | ${safeScope.domain} | ${safeScope.timeHorizon}

${prior}

${humanFeedback}

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
): string {
  const cookbook = buildCookbookContext('equilibrium_analyst', 'Phase 3', depthMode)
  const prior = buildPriorContext(phaseSummaries)
  const humanFeedback = buildHumanFeedbackContext(humanGateFeedback)

  return `You are an Oracle Equilibrium Analyst. Generate scenario skeletons from critical uncertainties using morphological analysis, then score for consistency and divergence.

${prior}

${humanFeedback}

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
  depthMode: OracleDepthMode = 'standard',
): string {
  const cookbook = buildCookbookContext('red_team', 'Phase 3', depthMode)
  const prior = buildPriorContext(phaseSummaries)
  const humanFeedback = buildHumanFeedbackContext(humanGateFeedback)

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
  depthMode: OracleDepthMode = 'standard',
): string {
  const cookbook = buildCookbookContext('scenario_developer', 'Phase 3', depthMode)
  const prior = buildPriorContext(phaseSummaries)
  const humanFeedback = buildHumanFeedbackContext(humanGateFeedback)

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
