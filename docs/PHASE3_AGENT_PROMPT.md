# Phase 3: Deep Research (WF2) — Research-First + Tool-Based Reasoning — Agent Prompt

You are implementing Phase 3 of the Dialectical Workflow Improvement Plan. Read the full plan at `docs/DIALECTICAL_WORKFLOW_IMPROVEMENT_PLAN.md` for context, but you are ONLY implementing Phase 3. This phase restructures the deep research workflow so that **all research completes before dialectical reasoning begins**, and thesis agents interact with the KG via tools rather than receiving flat claim lists.

## Constraints

- Every existing test must still pass after your changes.
- All new files use ESM with `.js` extension on relative imports.
- All types imported from the shared package use `import type { ... } from '@lifeos/agents'`.
- Write unit tests for each new or significantly modified module (see test specs below).
- After all changes, run the verification gate and fix any failures before committing.

## Prerequisite Context

Phase 1 completed: `resolveThesisLens`, KG dedup guards, contradiction density fix, `searchToolKeys` passthrough.

Phase 2 completed these changes (do NOT re-implement):
- `functions/src/agents/deepResearch/kgSerializer.ts` exists with `serializeKGToCompactGraph()` and `capGraphForPrompt()`.
- `functions/src/agents/kgTools.ts` exists with `createKGTools(kg)` returning 6 `ToolDefinition[]`.
- `functions/src/agents/langgraph/dialecticalPrompts.ts` has `buildThesisPrompt`, `buildNegationPrompt`, `buildSublationPrompt`, `repairJsonOutput`, and `ResearchEvidence`.
- `packages/agents/src/domain/workflowState.ts` has `KGCompactSnapshot`.
- `packages/agents/src/domain/deepResearchWorkflow.ts` has `researchFirstMode?: boolean` on `DeepResearchRunConfig`.

---

## Target Graph Topology

```
START → sense_making → search_and_ingest → claim_extraction → kg_construction
  → gap_analysis ──[gaps + budget]──→ search_and_ingest  (RESEARCH LOOP)
                 ──[converged]─────→ kg_snapshot
  → thesis_generation → cross_negation → contradiction → sublation → dialectical_meta
      ↑──[CONTINUE]──────────────────────────────────────────────────────┘
      └──[TERMINATE]──→ counterclaim_search → answer_generation → END
```

Research completes fully before dialectical reasoning. `kg_snapshot` is the transition point — it serializes the KG state and creates the tool registry. Dialectical agents get KG tools but NO search tools.

---

## Task 3A: Fix state annotation reducers

**File:** `functions/src/agents/langgraph/stateAnnotations.ts`

### Change `DeepResearchStateAnnotation` reducers

The current `theses`, `negations`, and `contradictions` fields use APPEND reducers (`[...current, ...update]`). This causes unbounded accumulation across dialectical cycles. Change them to REPLACE semantics:

```ts
theses: Annotation<ThesisOutput[]>({
  reducer: (cur, upd) => upd.length > 0 ? upd : cur,
  default: () => [],
}),
negations: Annotation<NegationOutput[]>({
  reducer: (cur, upd) => upd.length > 0 ? upd : cur,
  default: () => [],
}),
contradictions: Annotation<ContradictionOutput[]>({
  reducer: (cur, upd) => upd.length > 0 ? upd : cur,
  default: () => [],
}),
```

### Add new state fields to `DeepResearchStateAnnotation`

Add these fields (find appropriate locations among the existing fields):

```ts
kgSnapshot: Annotation<KGCompactSnapshot | null>({
  reducer: (_cur, upd) => upd,
  default: () => null,
}),
mergedGraph: Annotation<CompactGraph | null>({
  reducer: (_cur, upd) => upd,
  default: () => null,
}),
graphHistory: Annotation<Array<{ cycle: number; diff: GraphDiff }>>({
  reducer: (cur, upd) => [...cur, ...upd].slice(-20),
  default: () => [],
}),
processedSourceUrls: Annotation<Set<string>>({
  reducer: (cur, upd) => new Set([...cur, ...upd]),
  default: () => new Set(),
}),
```

Import `KGCompactSnapshot`, `CompactGraph`, and `GraphDiff` from `@lifeos/agents`.

### Update `DeepResearchPhase` type

Add `'kg_snapshot'` to the union:

```ts
export type DeepResearchPhase =
  | 'sense_making' | 'search_planning' | 'search_execution' | 'source_ingestion'
  | 'claim_extraction' | 'kg_construction' | 'kg_snapshot'
  | 'thesis_generation' | 'cross_negation'
  | 'contradiction_crystallization' | 'sublation' | 'meta_reflection'
  | 'gap_analysis' | 'answer_generation'
```

---

## Task 3B: Fix `dialecticalConfig` cast

**File:** `functions/src/agents/langgraph/deepResearchGraph.ts`

The `buildDialecticalConfig()` function (line 338) returns `Record<string, unknown>` and is cast with `as never` at call sites (lines ~922 and ~1045).

### Changes:

1. Change the return type of `buildDialecticalConfig` to `DialecticalWorkflowConfig`:

```ts
import type { DialecticalWorkflowConfig } from '@lifeos/agents'

function buildDialecticalConfig(
  researchConfig: DeepResearchRunConfig,
  thesisAgents: AgentConfig[]
): DialecticalWorkflowConfig {
  return {
    maxCycles: researchConfig.maxDialecticalCycles,
    minCycles: 1,
    enabledTrackers: ['LOGIC', 'PRAGMATIC', 'SEMANTIC', 'BOUNDARY'],
    velocityThreshold: 0.1,
    sublationStrategy: 'COMPETITIVE',
    maxSublationCandidates: 3,
    enableCrossNegation: true,
    negationDepth: 1,
    minActionDistance: 0,
    enableKGPersistence: true,
    enableCommunityDetection: false,
    communityDetectionMethod: 'LLM_GROUPING',
    retrievalDepth: 2,
    retrievalTopK: 5,
    minTheses: Math.min(2, thesisAgents.length),
    maxTheses: thesisAgents.length,
    thesisAgents: thesisAgents.map((a) => ({
      agentId: a.agentId,
      lens: resolveThesisLens(a) as ThesisLens,
      modelProvider: a.modelProvider,
      modelName: a.modelName,
      temperature: a.temperature,
    })),
  }
}
```

You will need to import `ThesisLens` from `@lifeos/agents`. Check the `ThesisAgentConfig` interface in `packages/agents/src/domain/dialectical.ts` to make sure all required fields are provided. If `ThesisAgentConfig` has required fields not present above (e.g. `systemPrompt`), make them optional OR add them to `buildDialecticalConfig`.

2. Remove both `as never` casts at the call sites. Replace with the properly typed variable. The calls should look like:

```ts
// In createSublationNode (~line 922):
runCompetitiveSynthesis(dialecticalConfig, ...)

// In createDialecticalMetaNode (~line 1045):
runMetaReflection(dialecticalConfig, ...)
```

Check the signatures of `runCompetitiveSynthesis` and `runMetaReflection` to ensure `DialecticalWorkflowConfig` is assignable to their parameter types. If they expect `DialecticalWorkflowConfig`, the cast removal should work cleanly. If they have a slightly different type, adjust accordingly.

---

## Task 3C: Create `kg_snapshot` node

**File:** `functions/src/agents/langgraph/deepResearchGraph.ts`

Create a new function `createKGSnapshotNode` — the transition node between the research loop and the dialectical engine.

### Signature:

```ts
function createKGSnapshotNode(
  sharedKg: KnowledgeHypergraph,
  execContext: AgentExecutionContext,
): (state: DeepResearchState) => Promise<Partial<DeepResearchState>>
```

### Implementation:

1. Serialize the KG to a CompactGraph:
   ```ts
   import { serializeKGToCompactGraph } from '../deepResearch/kgSerializer.js'
   const compactGraph = serializeKGToCompactGraph(sharedKg, 50)
   ```

2. Build the `KGCompactSnapshot`:
   ```ts
   import type { KGCompactSnapshot } from '@lifeos/agents'
   const stats = sharedKg.getStats()
   const snapshot: KGCompactSnapshot = {
     graph: compactGraph,
     claimCount: stats.nodesByType.claim ?? 0,
     conceptCount: stats.nodesByType.concept ?? 0,
     sourceCount: stats.nodesByType.source ?? 0,
     contradictionEdgeCount: compactGraph.edges.filter(e => e.rel === 'contradicts').length,
     snapshotAtMs: Date.now(),
     gapIteration: state.gapIterationsUsed,
   }
   ```

3. Create the KG tool registry for dialectical agents:
   ```ts
   import { createKGTools } from '../kgTools.js'
   const kgTools = createKGTools(sharedKg)
   ```
   Store these tools in the state context so thesis nodes can access them. Add to `state.context`:
   ```ts
   context: { ...state.context, kgTools, kgSnapshot: snapshot }
   ```

4. Emit a phase event via `execContext.eventWriter` (if available):
   ```ts
   if (execContext.eventWriter) {
     await execContext.eventWriter.writePhaseEvent({
       phase: 'kg_snapshot',
       message: `KG snapshot created: ${snapshot.claimCount} claims, ${snapshot.conceptCount} concepts, ${snapshot.contradictionEdgeCount} contradictions`,
     })
   }
   ```

5. Return partial state:
   ```ts
   return {
     phase: 'thesis_generation' as DeepResearchPhase,
     kgSnapshot: snapshot,
     mergedGraph: compactGraph,
     kgSnapshots: [snapshot],
     context: { ...state.context, kgTools, kgSnapshot: snapshot },
   }
   ```

---

## Task 3D: Separate `kg_construction` from `claim_extraction`

**File:** `functions/src/agents/langgraph/deepResearchGraph.ts`

Currently `claim_extraction` does both claim extraction AND KG construction (via `mapClaimsToKG`). Split into two nodes:

### `claim_extraction` node changes:
- Keep the claim extraction logic (calling `extractClaimsFromSourceBatch`)
- Remove the `mapClaimsToKG` call
- Return `{ phase: 'kg_construction', extractedClaims, budget }`

### New `kg_construction` node:

```ts
function createKGConstructionNode(
  sharedKg: KnowledgeHypergraph,
  execContext: AgentExecutionContext,
): (state: DeepResearchState) => Promise<Partial<DeepResearchState>>
```

Implementation:
1. Get the latest claims from `state.extractedClaims`
2. Call `mapClaimsToKG(state.extractedClaims, sharedKg, state.goal)` — import from `../deepResearch/claimExtraction.js`
3. Return `{ phase: 'gap_analysis' }`

Look at the existing `claim_extraction` node implementation to see exactly where the KG construction happens and what parameters `mapClaimsToKG` receives. Extract that logic into the new node.

---

## Task 3E: Cross-iteration source dedup

**File:** `functions/src/agents/langgraph/deepResearchGraph.ts` → `createSearchAndIngestNode`

### Before ingestion:

After `executeSearchPlan()` returns results, filter out URLs already processed:

```ts
const previousUrls = state.processedSourceUrls ?? new Set<string>()
const newResults = results.filter(r => !previousUrls.has(normalizeUrl(r.url)))
```

You'll need a `normalizeUrl` helper (or reuse `normalizeUrlForDedup` from `sourceIngestion.ts` if it's exported). If not exported, create a simple one:

```ts
function normalizeUrl(url: string): string {
  try {
    const u = new URL(url)
    return `${u.hostname}${u.pathname}`.replace(/\/$/, '').toLowerCase()
  } catch {
    return url.toLowerCase()
  }
}
```

### After ingestion:

Return newly processed URLs to update state:

```ts
const newProcessedUrls = new Set(sources.map(s => normalizeUrl(s.url)))
return {
  // ... existing return fields ...
  processedSourceUrls: newProcessedUrls,
}
```

---

## Task 3F: Rewrite thesis node — tool-based KG interaction

**File:** `functions/src/agents/langgraph/deepResearchGraph.ts` → `createThesisNode` (around line 700)

### Current behavior:
The thesis node builds `kgContext` from top 15 extracted claims and injects them as text. Agents have no KG tools.

### New behavior:

1. Use `resolveThesisLens(agent)` for lens resolution (already imported from Phase 1).

2. Use `buildThesisPrompt` from `dialecticalPrompts.js`:
   ```ts
   import { buildThesisPrompt, repairJsonOutput } from './dialecticalPrompts.js'

   const prompt = buildThesisPrompt(
     state.goal,
     lens,
     state.mergedGraph,       // from kg_snapshot
     null,                    // no researchEvidence — agents query KG via tools
   )
   ```

3. Append KG tool instructions to the prompt:
   ```ts
   const kgToolInstructions = `

   You have access to knowledge graph query tools. Use them to ground your analysis:
   1. Start with kg_summary to understand the graph landscape
   2. Use kg_get_claims or kg_get_neighborhood for targeted exploration
   3. Use kg_get_contradictions to identify unresolved tensions

   Base your thesis on evidence from the knowledge graph. Cite node IDs when referencing KG data.`

   const fullPrompt = prompt + kgToolInstructions
   ```

4. Grant KG tools to the agent (from state context):
   ```ts
   const kgTools = (state.context?.kgTools ?? []) as ToolDefinition[]
   ```
   Pass the KG tools to `executeAgentWithEvents` via the options. Check how `executeAgentWithEvents` accepts tools — it may be through `execContext.toolRegistry` or `additionalContext`. Looking at the existing code, tools are passed via `ToolRegistry`. You need to:
   - Create a new `ToolRegistry` instance that includes only KG tools (not search tools)
   - Pass it as `execContext.toolRegistry`
   - Set `maxIterations: 4` (1 `kg_summary` + 2 targeted queries + 1 output)

   ```ts
   const kgOnlyExecContext: AgentExecutionContext = {
     ...execContext,
     toolRegistry: buildKGToolRegistry(kgTools),
     searchToolKeys: undefined, // strip search tools
   }
   ```

   To build the tool registry, look at how `ToolRegistry` is constructed elsewhere in the codebase (likely in `toolExecutor.ts`). Create a simple registry with only the KG tools.

5. Parse with shared parser; on failure use `repairJsonOutput`:
   ```ts
   const parsed = CompactGraphSchema.safeParse(extractedJson)
   if (!parsed.success) {
     const repaired = await repairJsonOutput(
       step.output,
       parsed.error,
       CompactGraphSchema,
       execContext,
     )
     if (repaired) {
       // Use repaired output
     } else {
       // Explicit fail — do NOT inject a placeholder
       throw new Error(`Thesis parse failed for agent ${agent.agentId}: ${parsed.error.message}`)
     }
   }
   ```

   **Critical**: On parse failure after repair, throw an explicit error. Do NOT inject a placeholder thesis with empty/dummy fields. The existing code may silently inject placeholders — remove that behavior.

---

## Task 3G: Rewrite negation node — import shared prompt

**File:** `functions/src/agents/langgraph/deepResearchGraph.ts` → `createCrossNegationNode` (around line 763)

1. Import `buildNegationPrompt` from `./dialecticalPrompts.js`.
2. Replace the inline prompt construction with `buildNegationPrompt(sourceThesis, targetThesis)`.
3. Apply the same parse failure policy as thesis: `repairJsonOutput` on Zod error, explicit fail (throw) if repair also fails.

---

## Task 3H: Budget tracking for dialectical phases

Each dialectical node (thesis, negation, contradiction, sublation, meta) must track costs.

### Pattern:

For each node that calls an LLM:

```ts
// Before LLM call:
let currentBudget = { ...state.budget }

// After LLM call returns with cost/tokens:
currentBudget = recordSpend(currentBudget, step.estimatedCost, step.tokensUsed, 'llm')

// Return updated budget:
return { ..., budget: currentBudget }
```

Import `recordSpend` from `../deepResearch/budgetController.js` (already imported at the top of the file).

Apply this pattern to:
- `createThesisNode`: aggregate costs from all parallel thesis agents
- `createCrossNegationNode`: aggregate costs from all negation agents
- `createContradictionNode`: cost from `runContradictionTrackers`
- `createSublationNode`: cost from `runCompetitiveSynthesis`
- `createDialecticalMetaNode`: cost from `runMetaReflection`

---

## Task 3I: Rewire graph edges

**File:** `functions/src/agents/langgraph/deepResearchGraph.ts` → `createDeepResearchGraph` (around line 1344)

### New topology:

1. Add the new nodes to the graph:
   ```ts
   graph.addNode('kg_construction', createKGConstructionNode(sharedKg, execContext))
   graph.addNode('kg_snapshot', createKGSnapshotNode(sharedKg, execContext))
   ```

2. Update edge wiring:
   ```ts
   graph.addEdge(START, 'sense_making')
   graph.addEdge('sense_making', 'search_and_ingest')

   // Quick mode check after search
   graph.addConditionalEdges('search_and_ingest', (state) => {
     if (mode === 'quick') return 'answer_generation'
     return 'claim_extraction'
   }, { claim_extraction: 'claim_extraction', answer_generation: 'answer_generation' })

   // Research loop: claim_extraction → kg_construction → gap_analysis
   graph.addEdge('claim_extraction', 'kg_construction')
   graph.addEdge('kg_construction', 'gap_analysis')

   // Gap analysis routes to search (continue research) or kg_snapshot (converged)
   graph.addConditionalEdges('gap_analysis', (state) => {
     if (state.status === 'waiting_for_input') return END
     if (shouldContinueGapLoop(state.budget, state.gapAnalysis, maxGapIterations))
       return 'search_and_ingest'
     return 'kg_snapshot'
   }, { search_and_ingest: 'search_and_ingest', kg_snapshot: 'kg_snapshot', [END]: END })

   // kg_snapshot → dialectical engine
   graph.addEdge('kg_snapshot', 'thesis_generation')
   graph.addEdge('thesis_generation', 'cross_negation')
   graph.addEdge('cross_negation', 'contradiction')
   graph.addEdge('contradiction', 'sublation')
   graph.addEdge('sublation', 'dialectical_meta')

   // Dialectical loop or exit
   graph.addConditionalEdges('dialectical_meta', (state) => {
     if (state.status === 'waiting_for_input') return END
     if (state.dialecticalMetaDecision === 'CONTINUE') return 'thesis_generation'
     return 'counterclaim_search'
   }, {
     thesis_generation: 'thesis_generation',
     counterclaim_search: 'counterclaim_search',
     [END]: END,
   })

   graph.addEdge('counterclaim_search', 'answer_generation')
   graph.addEdge('answer_generation', END)
   ```

### Key changes from current topology:
- `claim_extraction` → `kg_construction` (NEW edge, previously combined)
- `gap_analysis` → `kg_snapshot` on convergence (was → `counterclaim_search`)
- `kg_snapshot` → `thesis_generation` (NEW node + edge)
- `dialectical_meta` TERMINATE → `counterclaim_search` (was → `gap_analysis`)
- Remove old direct edge from `claim_extraction` → `thesis_generation`

---

## Tests to Write

### `functions/src/agents/langgraph/__tests__/deepResearchStateAnnotations.test.ts` (NEW)

```ts
describe('DeepResearchStateAnnotation', () => {
  describe('REPLACE semantics', () => {
    it('replaces theses when non-empty update', () => { ... })
    it('keeps current theses when update is empty', () => { ... })
    it('replaces negations when non-empty update', () => { ... })
    it('replaces contradictions when non-empty update', () => { ... })
  })

  describe('new fields', () => {
    it('kgSnapshot defaults to null', () => { ... })
    it('mergedGraph defaults to null', () => { ... })
    it('graphHistory accumulates with cap at 20', () => { ... })
    it('processedSourceUrls merges sets', () => { ... })
  })
})
```

### `functions/src/agents/langgraph/__tests__/deepResearchGraph.test.ts` (NEW or extend)

```ts
describe('deep research graph topology', () => {
  it('research loop completes before thesis_generation', () => {
    // Verify that kg_snapshot is the transition point
    // Mock graph nodes, verify execution order
  })

  it('thesis agents receive KG tools, not search tools', () => {
    // Mock createKGTools, verify tools passed to thesis agents
    // Verify searchToolKeys is stripped
  })

  it('parse failure triggers repair retry then explicit fail', () => {
    // Mock executeAgentWithEvents to return invalid JSON
    // Mock repairJsonOutput to return null
    // Verify error is thrown (not a placeholder)
  })

  it('cross-iteration source dedup: same URL not re-fetched', () => {
    // Set processedSourceUrls with known URLs
    // Run search_and_ingest
    // Verify those URLs are filtered out
  })

  it('budget updates propagate through dialectical phase', () => {
    // Track budget.spentUsd through thesis → negation → sublation → meta
    // Verify each phase increments the cost
  })
})

describe('buildDialecticalConfig', () => {
  it('returns proper DialecticalWorkflowConfig without as-never casts', () => {
    // Verify all required fields are present and properly typed
  })
})

describe('kg_snapshot node', () => {
  it('serializes KG to CompactGraph with correct counts', () => { ... })
  it('creates KG tools for dialectical agents', () => { ... })
  it('emits phase event', () => { ... })
})
```

For these tests, use the same Firestore mock pattern from Phase 2 tests. Mock `executeAgentWithEvents`, `executeSearchPlan`, `ingestSources`, etc. Focus on verifying the data flow between nodes rather than the LLM outputs themselves.

### Verify existing tests

After all changes, run:
```bash
cd functions && npx vitest run src/agents/langgraph/__tests__/
```
to verify all existing tests still pass.

---

## Verification Gate

After all changes and tests are written, run:

```bash
cd functions && pnpm lint && pnpm typecheck && pnpm test -- --run
cd ../packages/agents && pnpm lint && pnpm typecheck && pnpm test -- --run
```

Fix any lint errors, type errors, or test failures before committing. Note: `packages/agents/src/usecases/__tests__/agentUsecases.test.ts` has a pre-existing failure related to `configHash` — this is NOT from your changes.

---

## Files Summary

| File | Action | What |
|---|---|---|
| `functions/src/agents/langgraph/stateAnnotations.ts` | **MODIFY** | REPLACE reducers for theses/negations/contradictions; add kgSnapshot, mergedGraph, graphHistory, processedSourceUrls; add 'kg_snapshot' to DeepResearchPhase |
| `functions/src/agents/langgraph/deepResearchGraph.ts` | **MODIFY** | Fix `buildDialecticalConfig` return type; remove `as never` casts; add `createKGSnapshotNode`; split claim_extraction from kg_construction; source dedup; tool-based thesis; shared negation prompt; budget tracking; rewire graph edges |
| `functions/src/agents/langgraph/__tests__/deepResearchStateAnnotations.test.ts` | **CREATE** | Tests for reducer changes |
| `functions/src/agents/langgraph/__tests__/deepResearchGraph.test.ts` | **CREATE** or **EXTEND** | Tests for new topology, KG tools, parse policy, source dedup, budget tracking |

## Commit

Once everything passes:

```
feat(agents): WF2 research-first topology with tool-based KG reasoning
```
