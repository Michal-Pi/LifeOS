# Phase 4: Dialectical (WF1) — Explicit Decide Research Nodes — Agent Prompt

You are implementing Phase 4 of the Dialectical Workflow Improvement Plan. Read the full plan at `docs/DIALECTICAL_WORKFLOW_IMPROVEMENT_PLAN.md` for context, but you are ONLY implementing Phase 4. This phase adds explicit research decision points to the dialectical workflow (WF1) so it no longer front-loads all research — instead, two nodes per cycle evaluate whether targeted research is needed.

## Constraints

- Every existing test must still pass after your changes.
- The `enableReactiveResearch` feature flag (added in Phase 2) defaults to `false`. When `false`, the existing behavior is 100% preserved (same graph topology, same execution). New behavior only activates when `true`.
- All new files use ESM with `.js` extension on relative imports.
- All types imported from the shared package use `import type { ... } from '@lifeos/agents'`.
- Write unit tests for each new or significantly modified module (see test specs below).
- After all changes, run the verification gate and fix any failures before committing.

## Prerequisite Context

Phases 1–2 completed. Phase 3 may or may not have run — your changes must work regardless. Key items from prior phases:

- `packages/agents/src/domain/dialectical.ts` has `enableReactiveResearch?: boolean` on `DialecticalWorkflowConfig` (Phase 2).
- `functions/src/agents/langgraph/dialecticalPrompts.ts` has `buildThesisPrompt`, `buildNegationPrompt`, `buildSublationPrompt`, `repairJsonOutput`, `ResearchEvidence` (Phase 2).
- `functions/src/agents/deepResearch/kgSerializer.ts` has `serializeKGToCompactGraph()` and `capGraphForPrompt()` (Phase 2).
- `functions/src/agents/deepResearch/graphGapAnalysis.ts` has `analyzeGraphGaps()` with `GraphGapResult`, `GapType`, `GraphGapDirectives` (existing).
- `functions/src/agents/langgraph/dialecticalGraph.ts` has `createRetrieveContextNode` which currently does both internal KG retrieval AND external research in a single node (when `config.enableExternalResearch` is true).

---

## Target Graph Topology (when `enableReactiveResearch` is `true`)

```
START → decide_research_pre ──[research needed]──→ execute_research → retrieve_context
                             ──[no research]─────→ retrieve_context
  → generate_theses → cross_negation → crystallize
  → sublate → decide_research_post ──[research needed]──→ execute_research_post → meta_reflect
                                    ──[no research]─────→ meta_reflect
  → [CONTINUE] → decide_research_pre (next cycle)
  → [TERMINATE] → END
```

When `enableReactiveResearch` is `false`, keep the existing topology unchanged:
```
START → retrieve_context → generate_theses → cross_negation → crystallize → sublate → meta_reflect → [loop or END]
```

---

## Task 4A: Extend `graphGapAnalysis.ts` with phase-aware evaluation

**File:** `functions/src/agents/deepResearch/graphGapAnalysis.ts`

Add a new function `evaluateResearchNeed` that wraps `analyzeGraphGaps` with phase-specific logic.

### Signature:

```ts
export function evaluateResearchNeed(
  graph: CompactGraph | null,
  goal: string,
  directives: GraphGapDirectives,
  phase: 'pre_cycle' | 'post_synthesis',
): GraphGapResult
```

### Implementation:

The existing `analyzeGraphGaps` already handles general gap analysis. `evaluateResearchNeed` adds phase-aware triggers and intensity caps.

**Phase = `pre_cycle`** (before thesis generation):
- Triggers: `directives.focusAreas` from last meta-reflection, stale data (nodes with low confidence), overall low confidence
- Query type: Targeted, 1–3 queries
- Use existing `analyzeGraphGaps(graph, goal, directives)` as the base
- Override intensity to `'targeted'` if `analyzeGraphGaps` returns `'full'`
- Cap the search plan: max 3 SERP queries, max 1 Scholar query, max 1 Semantic query, `targetSourceCount ≤ 3`

**Phase = `post_synthesis`** (after sublation, before meta-reflection):
- Triggers: New `contradicts` edges in the merged graph, thin areas (nodes with ≤1 edge), unsourced claims (nodes without `sourceId`), low source quality
- Query type: Verification, 1–3 queries
- Start from `analyzeGraphGaps(graph, goal, directives)` as the base
- Override intensity to `'verification'`
- Add contradiction-driven gap types: scan `directives.contradictions` for HIGH severity, add `'unresolved_contradiction'` gap type
- Cap the search plan same as pre_cycle

**Both phases:**
- If budget is exhausted (`directives.budget.phase === 'exhausted'`), return `{ needsResearch: false, searchPlan: null, rationale: 'Budget exhausted', gapTypes: [], researchIntensity: 'none' }`
- Non-Phase-1 research is always `targeted` or `verification` intensity — never `full`

### Search plan capping helper:

```ts
function capSearchPlan(plan: SearchPlan): SearchPlan {
  return {
    ...plan,
    serpQueries: plan.serpQueries.slice(0, 3),
    scholarQueries: plan.scholarQueries.slice(0, 1),
    semanticQueries: plan.semanticQueries.slice(0, 1),
    targetSourceCount: Math.min(plan.targetSourceCount, 3),
  }
}
```

### Types to import:

```ts
import type { CompactGraph, SearchPlan, ContradictionOutput, RunBudget } from '@lifeos/agents'
```

The existing `GraphGapDirectives` interface (already in this file) has `focusAreas`, `contradictions`, `cycleNumber`, `budget`. Check if it already has all the fields you need. If `contradictions` is not on it, add it:

```ts
export interface GraphGapDirectives {
  focusAreas?: string[]
  refinedGoal?: string
  contradictions?: ContradictionOutput[]
  cycleNumber: number
  budget: RunBudget
}
```

---

## Task 4B: Add `researchDecision` to `DialecticalStateAnnotation`

**File:** `functions/src/agents/langgraph/stateAnnotations.ts`

Add a new field to `DialecticalStateAnnotation`:

```ts
researchDecision: Annotation<{
  needsResearch: boolean
  searchPlan: SearchPlan | null
  gapTypes: GapType[]
  phase: string
  intensity: 'targeted' | 'verification' | 'none'
  rationale: string
} | null>({
  reducer: (_cur, upd) => upd,
  default: () => null,
}),
```

Import `SearchPlan` from `@lifeos/agents`. Import `GapType` from `../deepResearch/graphGapAnalysis.js`.

Also add this field to the `DialecticalState` type if it's separately defined (check whether `DialecticalState` is inferred from the annotation or separately declared).

---

## Task 4C: Create `decide_research` node

**File:** `functions/src/agents/langgraph/dialecticalGraph.ts`

### Signature:

```ts
function createDecideResearchNode(
  execContext: AgentExecutionContext,
  config: DialecticalWorkflowConfig,
  position: 'pre_cycle' | 'post_synthesis',
): (state: DialecticalState) => Promise<Partial<DialecticalState>>
```

### Implementation:

1. When `config.enableReactiveResearch` is `false`, always return no research:
   ```ts
   if (!config.enableReactiveResearch) {
     return {
       researchDecision: {
         needsResearch: false,
         searchPlan: null,
         gapTypes: [],
         phase: position,
         intensity: 'none' as const,
         rationale: 'Reactive research disabled',
       },
     }
   }
   ```

2. Build directives from current state:
   ```ts
   const directives: GraphGapDirectives = {
     cycleNumber: state.cycleNumber,
     budget: state.researchBudget ?? createRunBudget(config.researchBudgetUsd ?? 5, config.researchSearchDepth ?? 'standard'),
     focusAreas: position === 'pre_cycle'
       ? (state.metaDecision as { focusAreas?: string[] } | null)?.focusAreas
       : undefined,
     contradictions: position === 'post_synthesis' ? state.contradictions : undefined,
   }
   ```

   Note: `metaDecision` may be a `MetaDecision` type (string like 'CONTINUE' | 'TERMINATE' | 'RESPECIFY'). Check the actual type. The `focusAreas` would come from the meta-reflection result stored elsewhere in the state — look at how `runMetaReflection` returns data. If `focusAreas` is not directly on `metaDecision`, look at `state.context` or `state.cycleMetricsHistory` for a suitable source.

3. Call `evaluateResearchNeed`:
   ```ts
   import { evaluateResearchNeed } from '../deepResearch/graphGapAnalysis.js'

   const result = evaluateResearchNeed(
     state.mergedGraph,
     state.goal,
     directives,
     position,
   )
   ```

4. Emit a phase event:
   ```ts
   const decision = result.needsResearch ? 'Research needed' : 'No research needed'
   if (execContext.eventWriter) {
     await recordMessage(execContext, {
       role: 'system',
       content: `[RESEARCH DECISION] ${decision} (${position}): ${result.rationale}`,
     })
   }
   ```

5. Return:
   ```ts
   return {
     researchDecision: {
       needsResearch: result.needsResearch,
       searchPlan: result.searchPlan,
       gapTypes: result.gapTypes,
       phase: position,
       intensity: result.researchIntensity as 'targeted' | 'verification' | 'none',
       rationale: result.rationale,
     },
   }
   ```

---

## Task 4D: Create `execute_research` node

**File:** `functions/src/agents/langgraph/dialecticalGraph.ts`

### Signature:

```ts
function createExecuteResearchNode(
  execContext: AgentExecutionContext,
  config: DialecticalWorkflowConfig,
  kg: KnowledgeHypergraph | null,
): (state: DialecticalState) => Promise<Partial<DialecticalState>>
```

### Implementation:

Extract the existing research logic from `createRetrieveContextNode` Phase B (lines 314–467 in the current file). The execute_research node should:

1. Check `state.researchDecision?.needsResearch` — if false, return immediately (no-op).

2. Get the search plan from `state.researchDecision.searchPlan`.

3. Initialize/continue budget:
   ```ts
   let currentBudget = state.researchBudget ?? createRunBudget(
     config.researchBudgetUsd ?? 5,
     config.researchSearchDepth ?? 'standard',
   )
   ```

4. Execute the search plan — reuse the same pattern from `createRetrieveContextNode`:
   ```ts
   const { results, updatedBudget } = await executeSearchPlan(
     searchPlan, toolRegistry, toolContext, currentBudget
   )
   currentBudget = updatedBudget
   ```

5. Ingest sources:
   ```ts
   const { sources: newSources, contentMap, updatedBudget: postIngestBudget } = await ingestSources(
     results, state.goal, toolRegistry, toolContext, currentBudget, scoreRelevanceFn
   )
   currentBudget = postIngestBudget
   ```

6. Extract claims:
   ```ts
   const { claims: newClaims, updatedBudget: postClaimBudget } = await extractClaimsFromSourceBatch(
     newSources, contentMap, state.goal, providerFn, currentBudget
   )
   currentBudget = postClaimBudget
   ```

7. Apply quality scores:
   ```ts
   const scoredSources = newSources.map(s => ({ ...s, sourceQualityScore: computeSourceQualityScore(s) }))
   const scoredClaims = applyQualityScoresToClaims(newClaims, scoredSources)
   ```

8. Build `ResearchEvidence` and add to context:
   ```ts
   const researchEvidence: ResearchEvidence = {
     claims: scoredClaims.slice(0, 15),
     sources: scoredSources.map(s => ({
       sourceId: s.sourceId, title: s.title, url: s.url,
       domain: s.domain, qualityScore: s.sourceQualityScore ?? 0.5,
     })),
     gapTypes: state.researchDecision?.gapTypes ?? [],
     searchRationale: state.researchDecision?.rationale ?? '',
   }
   ```

9. Return:
   ```ts
   return {
     researchBudget: currentBudget,
     researchSources: scoredSources,
     researchClaims: scoredClaims,
     context: { ...state.context, researchEvidence },
   }
   ```

For building the `toolRegistry`, `toolContext`, `providerFn`, and `scoreRelevanceFn`, copy the patterns from the existing `createRetrieveContextNode`. These involve:
- Creating a `ToolExecutionContext` from `execContext`
- Building a `ProviderExecuteFn` using `executeWithProvider`
- Creating a relevance scoring function using the LLM

---

## Task 4E: Simplify `retrieve_context` when reactive research is enabled

**File:** `functions/src/agents/langgraph/dialecticalGraph.ts` → `createRetrieveContextNode`

When `config.enableReactiveResearch` is `true`, the `createRetrieveContextNode` should **skip Phase B** (external research) entirely — research is handled by the dedicated `decide_research` + `execute_research` nodes. Only do Phase A (internal KG retrieval).

### Implementation:

At the beginning of Phase B (around line 314), add a guard:

```ts
// Phase B: External research (only when reactive research is NOT enabled)
if (config.enableExternalResearch && !config.enableReactiveResearch) {
  // ... existing Phase B logic ...
}
```

The existing `config.enableExternalResearch` check stays — the new guard adds `!config.enableReactiveResearch` as an additional condition.

---

## Task 4F: Rewire graph edges

**File:** `functions/src/agents/langgraph/dialecticalGraph.ts` → `createDialecticalGraph`

### When `enableReactiveResearch` is `true`:

```ts
if (config.enableReactiveResearch) {
  // --- Reactive research topology ---
  graph.addNode('decide_research_pre', createDecideResearchNode(execContext, config, 'pre_cycle'))
  graph.addNode('execute_research', createExecuteResearchNode(execContext, config, kg))
  graph.addNode('decide_research_post', createDecideResearchNode(execContext, config, 'post_synthesis'))
  graph.addNode('execute_research_post', createExecuteResearchNode(execContext, config, kg))

  graph.addEdge(START, 'decide_research_pre')

  graph.addConditionalEdges('decide_research_pre', (state) => {
    return state.researchDecision?.needsResearch ? 'execute_research' : 'retrieve_context'
  }, {
    execute_research: 'execute_research',
    retrieve_context: 'retrieve_context',
  })

  graph.addEdge('execute_research', 'retrieve_context')
  graph.addEdge('retrieve_context', 'generate_theses')
  graph.addEdge('generate_theses', 'cross_negation')
  graph.addEdge('cross_negation', 'crystallize')
  graph.addEdge('crystallize', 'sublate')
  graph.addEdge('sublate', 'decide_research_post')

  graph.addConditionalEdges('decide_research_post', (state) => {
    return state.researchDecision?.needsResearch ? 'execute_research_post' : 'meta_reflect'
  }, {
    execute_research_post: 'execute_research_post',
    meta_reflect: 'meta_reflect',
  })

  graph.addEdge('execute_research_post', 'meta_reflect')

  graph.addConditionalEdges('meta_reflect', (state) => {
    if (state.status === 'waiting_for_input') return END
    if (state.metaDecision === 'TERMINATE' || state.status === 'completed') return END
    return 'decide_research_pre' // CONTINUE or RESPECIFY loop back to research decision
  }, {
    decide_research_pre: 'decide_research_pre',
    [END]: END,
  })
} else {
  // --- Legacy topology (unchanged) ---
  graph.addEdge(START, 'retrieve_context')
  graph.addEdge('retrieve_context', 'generate_theses')
  // ... existing edges ...
}
```

### When `enableReactiveResearch` is `false`:

Keep the **exact existing topology** — no changes whatsoever. The existing nodes (`retrieve_context`, `generate_theses`, etc.) must still be added to the graph. The new nodes are only added in the reactive research branch.

### Shared nodes:

Both topologies share: `retrieve_context`, `generate_theses`, `cross_negation`, `crystallize`, `sublate`, `meta_reflect`. Only register them once:

```ts
// Always register shared nodes
graph.addNode('retrieve_context', createRetrieveContextNode(execContext, config, kg))
graph.addNode('generate_theses', createThesisGenerationNode(thesisAgents, execContext, config, budget))
// ... etc.

// Conditionally register reactive research nodes and wire edges
if (config.enableReactiveResearch) {
  graph.addNode('decide_research_pre', ...)
  graph.addNode('execute_research', ...)
  // ... reactive edges ...
} else {
  // ... legacy edges ...
}
```

---

## Tests to Write

### `functions/src/agents/deepResearch/__tests__/graphGapAnalysis.phase.test.ts` (NEW)

```ts
describe('evaluateResearchNeed', () => {
  describe('pre_cycle phase', () => {
    it('returns targeted research when focusAreas present', () => {
      const result = evaluateResearchNeed(graph, 'test goal', {
        cycleNumber: 2,
        budget: healthyBudget,
        focusAreas: ['economic impact'],
      }, 'pre_cycle')
      expect(result.needsResearch).toBe(true)
      expect(result.researchIntensity).toBe('targeted')
    })

    it('caps search plan to 3 SERP, 1 Scholar, 1 Semantic', () => {
      const result = evaluateResearchNeed(lowConfGraph, 'test', {
        cycleNumber: 2, budget: healthyBudget,
      }, 'pre_cycle')
      expect(result.searchPlan?.serpQueries.length).toBeLessThanOrEqual(3)
      expect(result.searchPlan?.scholarQueries.length).toBeLessThanOrEqual(1)
      expect(result.searchPlan?.semanticQueries.length).toBeLessThanOrEqual(1)
    })

    it('returns no research when budget exhausted', () => {
      const result = evaluateResearchNeed(graph, 'test', {
        cycleNumber: 2, budget: exhaustedBudget,
      }, 'pre_cycle')
      expect(result.needsResearch).toBe(false)
    })
  })

  describe('post_synthesis phase', () => {
    it('returns verification research for unresolved contradictions', () => {
      const result = evaluateResearchNeed(graphWithContradictions, 'test', {
        cycleNumber: 2, budget: healthyBudget,
        contradictions: [highSeverityContradiction],
      }, 'post_synthesis')
      expect(result.needsResearch).toBe(true)
      expect(result.researchIntensity).toBe('verification')
    })

    it('returns no research when graph has no gaps', () => {
      const result = evaluateResearchNeed(wellCoveredGraph, 'test', {
        cycleNumber: 2, budget: healthyBudget,
      }, 'post_synthesis')
      expect(result.needsResearch).toBe(false)
    })
  })

  it('never returns full intensity from non-Phase-1 research', () => {
    const result = evaluateResearchNeed(null, 'test', {
      cycleNumber: 1, budget: healthyBudget,
    }, 'pre_cycle')
    expect(result.researchIntensity).not.toBe('full')
  })
})
```

### `functions/src/agents/langgraph/__tests__/dialecticalGraph.reactive.test.ts` (NEW)

```ts
describe('dialectical graph — reactive research', () => {
  describe('enableReactiveResearch: true', () => {
    it('decide_research_pre emits research decision event', () => { ... })

    it('decide_research_pre routes to execute_research when gaps found', () => { ... })

    it('decide_research_pre routes directly to retrieve_context when no gaps', () => { ... })

    it('execute_research executes search plan and returns sources/claims', () => { ... })

    it('decide_research_post evaluates post-synthesis gaps', () => { ... })

    it('retrieve_context skips Phase B when reactive research enabled', () => { ... })

    it('meta_reflect loops back to decide_research_pre on CONTINUE', () => { ... })
  })

  describe('enableReactiveResearch: false (default)', () => {
    it('preserves existing topology (retrieve_context first)', () => { ... })

    it('retrieve_context includes Phase B research when enableExternalResearch is true', () => { ... })

    it('decide_research nodes are not registered', () => { ... })
  })
})
```

For these tests, mock the external dependencies (`executeSearchPlan`, `ingestSources`, `extractClaimsFromSourceBatch`, `analyzeGraphGaps`, `evaluateResearchNeed`, `executeAgentWithEvents`, etc.) and verify the data flow and routing decisions.

### Verify existing WF1 tests

After all changes:
```bash
cd functions && npx vitest run src/agents/langgraph/__tests__/dialecticalPrompts.test.ts
cd functions && npx vitest run src/agents/__tests__/graphGuardrails.test.ts
```
These must still pass since `enableReactiveResearch` defaults to `false`.

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
| `functions/src/agents/deepResearch/graphGapAnalysis.ts` | **MODIFY** | Add `evaluateResearchNeed(graph, goal, directives, phase)` with phase-aware triggers, intensity caps, search plan capping |
| `functions/src/agents/langgraph/stateAnnotations.ts` | **MODIFY** | Add `researchDecision` field to `DialecticalStateAnnotation` |
| `functions/src/agents/langgraph/dialecticalGraph.ts` | **MODIFY** | Add `createDecideResearchNode`, `createExecuteResearchNode`; simplify `createRetrieveContextNode` when reactive enabled; conditional graph topology based on `enableReactiveResearch` |
| `functions/src/agents/deepResearch/__tests__/graphGapAnalysis.phase.test.ts` | **CREATE** | Tests for `evaluateResearchNeed` per phase |
| `functions/src/agents/langgraph/__tests__/dialecticalGraph.reactive.test.ts` | **CREATE** | Tests for reactive research topology and backward compatibility |

## Commit

Once everything passes:

```
feat(agents): WF1 reactive research — explicit decide/execute research nodes
```
