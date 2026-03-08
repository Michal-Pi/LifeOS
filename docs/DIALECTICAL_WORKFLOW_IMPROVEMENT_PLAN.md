# Improve Dialectical & Deep Research Workflows

## Context

Two dialectical reasoning workflows need architectural improvements:

- **Deep Research (WF2)**: Currently interleaves research and dialectical reasoning. Thesis prompts are underspecified (no JSON schema), agents receive flat claim lists instead of querying the KG, and state uses APPEND reducers causing unbounded accumulation. **Target**: Complete ALL research first, then let thesis agents reason by _querying_ the KG directly via tools.

- **Dialectical (WF1)**: Front-loads all research in Phase 1 and never researches again. **Target**: NO front-loaded research; instead, an explicit "Decide Research" node evaluates research needs at two points per cycle (pre-cycle and post-synthesis).

## Verification Gate (run after each phase)

```bash
cd functions && pnpm lint && pnpm typecheck && pnpm test -- --run
cd ../packages/agents && pnpm lint && pnpm typecheck && pnpm test -- --run
```

All phases are committed only after passing lint + typecheck + tests.

---

## Phase 1: Bug Fixes & Guards (no architectural changes)

Isolated correctness fixes. Every existing test must still pass. No new graph topology, no new nodes, no feature flags.

### 1A. Fix contradiction density formula

**File:** `functions/src/agents/metaReflection.ts`

Use actual claim counts from thesis graphs instead of agent count:

```ts
const totalClaims =
  theses.reduce((sum, t) => {
    if (t.graph) return sum + t.graph.nodes.filter((n) => n.type === 'claim').length
    return sum + t.falsificationCriteria.length + t.decisionImplications.length
  }, 0) +
  negations.reduce((sum, n) => sum + n.internalTensions.length + n.categoryAttacks.length, 0)
```

### 1B. Deterministic lens resolution — `resolveThesisLens` helper

**Files:** New `functions/src/agents/langgraph/dialecticalPrompts.ts`, then update `deepResearchGraph.ts` and `dialecticalGraph.ts`

The regex `(\w+)\s+THESIS` extracts "THINKING" from "SYSTEMS THINKING THESIS" and "TEAM" from "RED-TEAM THESIS". Replace with a deterministic helper:

```ts
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
  if (agent.metadata?.lens) return agent.metadata.lens as string
  const prompt = agent.systemPrompt?.toLowerCase() ?? ''
  for (const [phrase, lens] of Object.entries(LENS_PHRASE_MAP)) {
    if (prompt.includes(phrase)) return lens
  }
  return fallback
}
```

Remove all `systemPrompt?.match(/(\w+)\s+THESIS/i)` usage in both WF1 and WF2.

### 1C. KG duplicate claim guard

**File:** `functions/src/agents/knowledgeHypergraph.ts`

Add `findClaimByNormalizedText(text)` method. In `addClaim()`: if duplicate exists, attach missing source edges but skip node creation.

### 1D. Duplicate causal edge guard

**File:** `functions/src/agents/deepResearch/claimExtraction.ts`

Before `kg.addEdge(conceptIds[0], conceptIds[1], { type: 'causal_link', ... })`, check for existing equivalent edge:

```ts
const existingEdges = kg.getEdgesBetween(conceptIds[0], conceptIds[1])
const hasDuplicateCausal = existingEdges.some(e =>
  e.type === 'causal_link' && e.metadata?.claimId === kgClaim.claimId
)
if (!hasDuplicateCausal) { kg.addEdge(...) }
```

### 1E. Pass `searchToolKeys` into WF2 search nodes

**File:** `functions/src/agents/langgraph/deepResearchGraph.ts`

Add `searchToolKeys` param to `createSearchAndIngestNode` signature. Pass through to `toolContext` and `ingestSources`. Ensure `searchToolKeys` is forwarded when constructing the node in `createDeepResearchGraph`.

### Phase 1 Tests

- `resolveThesisLens.test.ts`: "SYSTEMS THINKING THESIS" → `systems`; "RED-TEAM THESIS" → `adversarial`; config lens overrides prompt
- `knowledgeHypergraph.test.ts`: `findClaimByNormalizedText` returns existing claim; `addClaim` skips duplicate but attaches source
- `claimExtraction.test.ts`: Duplicate causal edge not re-inserted on repeated claim processing

### Phase 1 Commit

```
fix(agents): correctness fixes — lens resolution, KG dedup guards, contradiction density, searchToolKeys
```

---

## Phase 2: Shared Infrastructure (new modules, no workflow changes yet)

New files that both workflows will depend on. No changes to graph topology. Existing behavior unchanged.

### 2A. Create `kgSerializer.ts` — `functions/src/agents/deepResearch/kgSerializer.ts` (NEW)

**`capGraphForPrompt(graph: CompactGraph, maxChars = 4000) → string`**

- Serialize graph to JSON
- If over maxChars: prune lowest-weight edges first, then lowest-confidence nodes
- Always preserve: nodes with `contradicts` edges, prediction nodes

**`serializeKGToCompactGraph(kg: KnowledgeHypergraph, maxNodes = 50) → CompactGraph`**

- Read claim/concept/mechanism/prediction nodes, sort by confidence/edge-count
- Select top-N + their inter-edges
- Compute aggregate summary/confidence/regime

### 2B. Create KG Tools — `functions/src/agents/kgTools.ts` (NEW)

6 semantic tools wrapping existing `KnowledgeHypergraph` methods:

| Tool Name                  | Wraps                                             | Parameters                                   |
| -------------------------- | ------------------------------------------------- | -------------------------------------------- |
| `kg_summary`               | `getStats()` + top claims + active contradictions | none                                         |
| `kg_get_claims`            | `getNodesByType('claim')`                         | `{ conceptFilter?, minConfidence?, limit? }` |
| `kg_get_neighborhood`      | `getNeighborhood(nodeId, opts)`                   | `{ nodeId, maxDepth?, maxSize? }`            |
| `kg_get_sources_for_claim` | `getSourcesForClaim(claimId)`                     | `{ claimId }`                                |
| `kg_get_contradictions`    | `getActiveContradictions()`                       | none                                         |
| `kg_shortest_path`         | `shortestPath(a, b)`                              | `{ fromNodeId, toNodeId }`                   |

Implementation: `createKGTools(kg: KnowledgeHypergraph): ToolDefinition[]` factory that closes over the KG instance.

### 2C. Extract shared prompts — `functions/src/agents/langgraph/dialecticalPrompts.ts`

Move from `dialecticalGraph.ts` (the file already partially exists from Phase 1 for `resolveThesisLens`):

- `buildThesisPrompt(goal, lens, mergedGraph?, researchEvidence?) → string`
- `buildNegationPrompt(sourceThesis, targetThesis) → string`
- `buildSublationPrompt(theses, negations, contradictions, mergedGraph?, cycleNumber?, researchEvidence?) → string`

Apply `capGraphForPrompt` to all graph serializations within these builders:

- `buildThesisPrompt`: cap mergedGraph to 4000 chars
- `buildNegationPrompt`: cap thesis graph representations
- `buildSublationPrompt`: cap prior merged graph to 5000 chars

Sort research claims by confidence in injection:

```ts
const claimLines = [...researchEvidence.claims]
  .sort((a, b) => b.confidence - a.confidence)
  .slice(0, 10)
```

Add `repairJsonOutput(rawText, zodError, schema, execContext)` utility for parse failure recovery.

Both WF1 and WF2 import from this shared module. WF1's existing prompt builders are replaced by imports — behavior must be identical (verify with existing WF1 tests).

### 2D. Add domain types

**File:** `packages/agents/src/domain/workflowState.ts`

```ts
export interface KGCompactSnapshot {
  graph: CompactGraph
  claimCount: number
  conceptCount: number
  sourceCount: number
  contradictionEdgeCount: number
  snapshotAtMs: number
  gapIteration: number
}
```

### 2E. Add feature flags (inert — not wired yet)

**File:** `packages/agents/src/domain/dialectical.ts` → `DialecticalWorkflowConfig`

```ts
enableReactiveResearch?: boolean  // default: false (backward compat)
```

**File:** `packages/agents/src/domain/models.ts` → `DeepResearchRunConfig`

```ts
researchFirstMode?: boolean  // default: true
```

### Phase 2 Tests

- `kgSerializer.test.ts`: `capGraphForPrompt` at boundary sizes; `serializeKGToCompactGraph` with varying node counts
- `kgTools.test.ts`: Each KG tool returns correct data from a mock KnowledgeHypergraph
- `dialecticalPrompts.test.ts`: Shared prompt builders produce expected output; `capGraphForPrompt` integration; `repairJsonOutput` retry logic
- Verify all existing WF1 tests still pass after prompt builder extraction

### Phase 2 Commit

```
feat(agents): shared infrastructure — KG tools, kgSerializer, shared prompts, domain types
```

---

## Phase 3: Deep Research (WF2) — Research-First + Tool-Based Reasoning

### Target Graph Topology

```
START → sense_making → search_and_ingest → claim_extraction → kg_construction
  → gap_analysis ──[gaps + budget]──→ search_and_ingest  (RESEARCH LOOP)
                  ──[converged]─────→ kg_snapshot
  → thesis_generation → cross_negation → contradiction → sublation → dialectical_meta
      ↑──[CONTINUE]──────────────────────────────────────────────────────┘
      └──[TERMINATE]──→ counterclaim_search → answer_generation → END
```

Research completes fully. `kg_snapshot` serializes state + creates KG tool registry. Dialectical loop has KG tools but NO search tools.

### 3A. Fix state annotation reducers

**File:** `functions/src/agents/langgraph/stateAnnotations.ts` → `DeepResearchStateAnnotation`

Change from APPEND to REPLACE:

```ts
theses: reducer: (cur, upd) => (upd.length > 0 ? upd : cur)
negations: reducer: (cur, upd) => (upd.length > 0 ? upd : cur)
contradictions: reducer: (cur, upd) => (upd.length > 0 ? upd : cur)
```

Add new fields:

```ts
kgSnapshot: Annotation<KGCompactSnapshot | null>
mergedGraph: Annotation<CompactGraph | null>
graphHistory: Annotation<Array<{ cycle: number; diff: GraphDiff }>>({
  reducer: (cur, upd) => [...cur, ...upd].slice(-20),
  default: () => [],
})
processedSourceUrls: Annotation<Set<string>>({
  reducer: (cur, upd) => new Set([...cur, ...upd]),
  default: () => new Set(),
})
```

### 3B. Fix `dialecticalConfig` cast

**File:** `functions/src/agents/langgraph/deepResearchGraph.ts`

Change `buildDialecticalConfig()` to return a proper `DialecticalWorkflowConfig` with all required fields. Remove all `as never` casts.

### 3C. Create `kg_snapshot` node

**File:** `functions/src/agents/langgraph/deepResearchGraph.ts`

Transition node between research loop and dialectical engine. Serializes KG → CompactGraph, builds KGCompactSnapshot, creates dialectical tool registry (KG tools only, search tools stripped).

### 3D. Separate `kg_construction` from `claim_extraction`

Currently combined. Split into two nodes so gap_analysis has a clear KG-based entry point.

### 3E. Cross-iteration source dedup

**File:** `functions/src/agents/langgraph/deepResearchGraph.ts` → `createSearchAndIngestNode`

Before ingestion, filter out URLs already in `state.processedSourceUrls`. After ingestion, return newly processed URLs to update state.

### 3F. Rewrite thesis node — tool-based KG interaction

**File:** `functions/src/agents/langgraph/deepResearchGraph.ts`

Use `resolveThesisLens(agent)` (from Phase 1). Use `buildThesisPrompt` (from Phase 2). Append KG tool instructions. Grant KG tools to agent (not search tools). `maxIterations: 4` (1 kg_summary + 2 targeted queries + 1 output).

Parse with shared parser; on failure use `repairJsonOutput` (1 retry, then explicit fail — no placeholder injection).

### 3G. Rewrite negation node — import shared prompt

Import `buildNegationPrompt` from `dialecticalPrompts.ts`. Same parse failure policy as thesis.

### 3H. Budget tracking for dialectical phases

Each dialectical node (thesis, negation, sublation, meta) must call `recordSpend(state.budget, cost, tokens, 'llm')` and return updated `budget` in state patch.

### 3I. Rewire graph edges

New topology per diagram above. `routeAfterGap` routes to `kg_snapshot` on convergence. `routeDialecticalMeta` routes to `thesis_generation` (CONTINUE) or `counterclaim_search` (TERMINATE).

### Phase 3 Tests

- `stateAnnotations.test.ts`: WF2 REPLACE semantics for theses/negations/contradictions
- `deepResearchGraph.test.ts` (new or extend existing):
  - Research loop completes before thesis_generation
  - Thesis agents receive KG tools, not search tools
  - Parse failure → repair retry → explicit fail (no placeholder)
  - Cross-iteration source dedup: same URL not re-fetched
  - Budget updates propagate through dialectical phase
- Verify `researchFirstMode: false` preserves legacy behavior (if wired)

### Phase 3 Commit

```
feat(agents): WF2 research-first topology with tool-based KG reasoning
```

---

## Phase 4: Dialectical (WF1) — Explicit Decide Research Nodes

### Target Graph Topology

```
START → decide_research_pre ──[research needed]──→ execute_research → retrieve_context
                             ──[no research]─────→ retrieve_context
  → generate_theses → cross_negation → crystallize
  → sublate → decide_research_post ──[research needed]──→ execute_research_post → meta_reflect
                                    ──[no research]─────→ meta_reflect
  → [CONTINUE] → decide_research_pre (next cycle)
  → [TERMINATE] → END
```

Two decision points per cycle:

1. **Pre-cycle** (`decide_research_pre`): Using `focusAreas` from last meta-reflection + current `mergedGraph`
2. **Post-synthesis** (`decide_research_post`): Using new contradictions, thin areas, confidence gaps from sublation

### 4A. Extend `graphGapAnalysis.ts` with phase-aware evaluation

**File:** `functions/src/agents/deepResearch/graphGapAnalysis.ts`

Add `evaluateResearchNeed(graph, goal, directives): GraphGapResult` — phase-aware wrapper around `analyzeGraphGaps`:

| Decision Point | Triggers                                                                | Query Type                |
| -------------- | ----------------------------------------------------------------------- | ------------------------- |
| Pre-cycle      | Focus areas, stale data, low confidence                                 | Targeted: 1-3 queries     |
| Post-synthesis | New contradicts edges, thin areas, unsourced claims, low source quality | Verification: 1-3 queries |

Enforcement: non-Phase-1 research is always `targeted` or `verification` intensity. Cap: max 3 SERP, 1 Scholar, 1 Semantic, targetSourceCount ≤ 3.

### 4B. Add `researchDecision` to `DialecticalStateAnnotation`

**File:** `functions/src/agents/langgraph/stateAnnotations.ts`

```ts
researchDecision: Annotation<{
  needsResearch: boolean
  searchPlan: SearchPlan | null
  gapTypes: GapType[]
  phase: string
  intensity: 'targeted' | 'verification' | 'none'
  rationale: string
} | null>,
```

### 4C. Create `decide_research` node

**File:** `functions/src/agents/langgraph/dialecticalGraph.ts`

`createDecideResearchNode(execContext, config, position: 'pre_cycle' | 'post_synthesis')` — calls `evaluateResearchNeed`, emits phase event, records decision message. When `enableReactiveResearch` is false, always returns `needsResearch: false`.

### 4D. Create `execute_research` node

**File:** `functions/src/agents/langgraph/dialecticalGraph.ts`

Extracted from existing research logic in `createRetrieveContextNode`. Reuses: `executeSearchPlan` → `ingestSources` → `extractClaimsFromSourceBatch` → `applyQualityScores`.

### 4E. Simplify `retrieve_context` when reactive research is enabled

When `enableReactiveResearch` is true, `createRetrieveContextNode` skips Phase B (external research) — only does internal KG retrieval. Research is handled by dedicated nodes.

### 4F. Rewire graph edges

When `enableReactiveResearch` is true: new topology per diagram above. When false: keep existing topology unchanged (backward compat).

### Phase 4 Tests

- `graphGapAnalysis.test.ts`: `evaluateResearchNeed` per phase (pre-cycle focus areas, post-synthesis contradictions, intensity caps)
- `dialecticalGraph.test.ts` (new or extend):
  - `enableReactiveResearch: true`: `decide_research_pre` and `decide_research_post` events in logs; targeted search executes when gaps found; no research in `retrieve_context`
  - `enableReactiveResearch: false`: existing behavior unchanged
- Existing WF1 tests still pass (feature flag defaults to false)

### Phase 4 Commit

```
feat(agents): WF1 reactive research — explicit decide/execute research nodes
```

---

## Phase 5: Integration Verification & Cleanup

Final verification across both workflows together.

### 5A. Cross-workflow integration tests

- WF2 end-to-end: research → kg_snapshot → thesis (with KG tool calls) → negation → sublation → answer
- WF1 end-to-end: decide_research → thesis → negation → sublation → decide_research_post → meta_reflect → loop
- Both legacy modes (flags off) produce identical behavior to pre-change baseline

### 5B. Manual verification checklist

- Run WF2 → inspect thesis agent tool calls → confirm `kg_summary`, `kg_get_neighborhood` appear
- Run WF1 on topic needing fresh data → confirm `[RESEARCH DECISION] Research needed`
- Run WF1 on self-contained topic → confirm `[RESEARCH DECISION] No research needed`
- Verify budget shows dialectical phase costs in WF2
- Verify mergedGraph stays under 4000 chars in prompts after 5+ cycles
- Verify parse failure produces explicit error (not silent placeholder)

### 5C. Cleanup

- Remove any dead code from prompt builder extraction
- Verify no unused imports after refactoring
- Final lint + typecheck + test pass

### Phase 5 Commit

```
test(agents): integration tests and cleanup for dialectical workflow improvements
```

---

## Files Modified (Summary)

| File                                                    | Phase | Changes                                                                                                                                   |
| ------------------------------------------------------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `functions/src/agents/metaReflection.ts`                | 1     | Fix contradiction density formula                                                                                                         |
| `functions/src/agents/knowledgeHypergraph.ts`           | 1     | `findClaimByNormalizedText`, dedup guard in `addClaim`                                                                                    |
| `functions/src/agents/deepResearch/claimExtraction.ts`  | 1     | Duplicate causal edge guard                                                                                                               |
| `functions/src/agents/langgraph/deepResearchGraph.ts`   | 1,3   | searchToolKeys fix (1); research-first topology, kg_snapshot, tool-based thesis/negation, source dedup, parse policy, budget tracking (3) |
| `functions/src/agents/deepResearch/kgSerializer.ts`     | 2     | **NEW** — serializeKGToCompactGraph, capGraphForPrompt                                                                                    |
| `functions/src/agents/kgTools.ts`                       | 2     | **NEW** — 6 semantic KG tools wrapping KnowledgeHypergraph                                                                                |
| `functions/src/agents/langgraph/dialecticalPrompts.ts`  | 1,2   | **NEW** — resolveThesisLens (1); shared prompt builders, capGraphForPrompt integration, repairJsonOutput (2)                              |
| `functions/src/agents/langgraph/stateAnnotations.ts`    | 3,4   | WF2: REPLACE reducers, kgSnapshot/mergedGraph/graphHistory/processedSourceUrls (3). WF1: researchDecision (4)                             |
| `functions/src/agents/langgraph/dialecticalGraph.ts`    | 4     | decide_research + execute_research nodes, simplified retrieve_context, graph rewiring                                                     |
| `functions/src/agents/deepResearch/graphGapAnalysis.ts` | 4     | evaluateResearchNeed with phase-aware triggers                                                                                            |
| `packages/agents/src/domain/workflowState.ts`           | 2     | KGCompactSnapshot type                                                                                                                    |
| `packages/agents/src/domain/dialectical.ts`             | 2     | enableReactiveResearch flag                                                                                                               |
| `packages/agents/src/domain/models.ts`                  | 2     | researchFirstMode flag                                                                                                                    |
