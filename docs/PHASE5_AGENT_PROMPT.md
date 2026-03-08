# Phase 5: Integration Verification & Cleanup — Agent Prompt

You are implementing Phase 5 of the Dialectical Workflow Improvement Plan. Read the full plan at `docs/DIALECTICAL_WORKFLOW_IMPROVEMENT_PLAN.md` for context, but you are ONLY implementing Phase 5. This phase performs cross-workflow integration tests, cleans up dead code left over from Phases 1–4, and runs a final verification pass.

## Constraints

- Every existing test must still pass after your changes.
- You are NOT adding new features or changing any workflow behavior. This phase is purely tests + cleanup.
- All new files use ESM with `.js` extension on relative imports.
- All types imported from the shared package use `import type { ... } from '@lifeos/agents'`.
- After all changes, run the verification gate and fix any failures before committing.

## Prerequisite Context

Phases 1–4 are all completed. Key items from prior phases:

### Phase 1 (Bug Fixes)
- `functions/src/agents/langgraph/dialecticalPrompts.ts` — `resolveThesisLens()` deterministic lens resolution
- `functions/src/agents/knowledgeHypergraph.ts` — `findClaimByNormalizedText()`, dedup guard in `addClaim()`
- `functions/src/agents/deepResearch/claimExtraction.ts` — Duplicate causal edge guard

### Phase 2 (Shared Infrastructure)
- `functions/src/agents/deepResearch/kgSerializer.ts` — `serializeKGToCompactGraph()`, `capGraphForPrompt()`
- `functions/src/agents/kgTools.ts` — 6 semantic KG tools wrapping KnowledgeHypergraph
- `functions/src/agents/langgraph/dialecticalPrompts.ts` — `buildThesisPrompt`, `buildNegationPrompt`, `buildSublationPrompt`, `repairJsonOutput`, `ResearchEvidence`
- `packages/agents/src/domain/dialectical.ts` — `enableReactiveResearch?: boolean` flag
- `packages/agents/src/domain/models.ts` — `researchFirstMode?: boolean` flag
- `packages/agents/src/domain/workflowState.ts` — `KGCompactSnapshot` type

### Phase 3 (Deep Research WF2 — Research-First)
- `functions/src/agents/langgraph/stateAnnotations.ts` — `DeepResearchStateAnnotation` has REPLACE reducers for theses/negations/contradictions, plus `kgSnapshot`, `mergedGraph`, `graphHistory`, `processedSourceUrls` fields
- `functions/src/agents/langgraph/deepResearchGraph.ts` — Research-first topology with `kg_snapshot` node, tool-based thesis/negation, source dedup, parse policy, budget tracking

### Phase 4 (Dialectical WF1 — Reactive Research)
- `functions/src/agents/deepResearch/graphGapAnalysis.ts` — `evaluateResearchNeed(graph, goal, directives, phase)` with phase-aware triggers
- `functions/src/agents/langgraph/stateAnnotations.ts` — `researchDecision` field on `DialecticalStateAnnotation`
- `functions/src/agents/langgraph/dialecticalGraph.ts` — `createDecideResearchNode`, `createExecuteResearchNode`, simplified `createRetrieveContextNode` (skips Phase B when reactive enabled), conditional graph topology based on `enableReactiveResearch`

### Current Test Baseline (pre-existing failures — NOT from Phases 1–4)
- `functions/src/agents/__tests__/graphGuardrails.test.ts` — Fails with firebase mock issue (`firestore.settings is not a function`)
- `functions/src/agents/__tests__/humanApproval.test.ts` — Same firebase mock issue
- `packages/agents/src/usecases/__tests__/agentUsecases.test.ts` — Fails with `configHash` mismatch

These 3 failures are NOT from your changes. Do not attempt to fix them.

### Current Lint Baseline
- `functions`: 0 errors, 78 warnings (all `@typescript-eslint/no-explicit-any`)
- `packages/agents`: 0 errors, 52 warnings

---

## Task 5A: Cross-Workflow Integration Tests

Create ONE new integration test file that tests both workflows at the orchestration level with mocked LLM/search dependencies.

**File:** `functions/src/agents/langgraph/__tests__/dialecticalIntegration.test.ts` (NEW)

### Test Structure

Use vitest with the same mock patterns as existing tests (e.g., `dialecticalGraph.reactive.test.ts`, `deepResearchGraph.test.ts`). Mock all external service calls (`executeWithProvider`, `executeAgentWithEvents`, search tools, firebase, etc.) but let the actual graph construction and state annotation logic run.

**Important mock pattern:** All `vi.mock()` calls must be at the top of the file, before any imports of the mocked modules. Use factory functions that return mock implementations.

### Tests to Write

#### WF1 (Dialectical) — Reactive Research Path

```ts
describe('WF1 integration — reactive research', () => {
  describe('enableReactiveResearch: true', () => {
    it('decide_research_pre emits [RESEARCH DECISION] message', async () => {
      // Setup: enableReactiveResearch: true, mock evaluateResearchNeed to return needsResearch: true
      // Verify: recordMessage was called with content containing '[RESEARCH DECISION] Research needed (pre_cycle)'
    })

    it('full cycle: decide → execute → retrieve → thesis → negation → crystallize → sublate → decide_post → meta', async () => {
      // Setup: mock all node dependencies, enableReactiveResearch: true
      // Verify: state transitions through all expected phases in order
      // Verify: researchDecision is set at both pre and post points
    })

    it('skips execute_research when no gaps found', async () => {
      // Setup: mock evaluateResearchNeed to return needsResearch: false
      // Verify: executeSearchPlan is NOT called
      // Verify: flow goes decide_research_pre → retrieve_context directly
    })

    it('retrieve_context skips Phase B when reactive research enabled', async () => {
      // Setup: enableReactiveResearch: true, enableExternalResearch: true
      // Verify: analyzeGraphGaps is NOT called inside retrieve_context
      // Verify: executeSearchPlan is NOT called inside retrieve_context
    })
  })

  describe('enableReactiveResearch: false (legacy)', () => {
    it('preserves existing behavior — retrieve_context does Phase A + Phase B', async () => {
      // Setup: enableReactiveResearch: false, enableExternalResearch: true
      // Verify: analyzeGraphGaps IS called inside retrieve_context
      // Verify: no decide_research nodes are in the graph
    })

    it('meta_reflect routes to retrieve_context on CONTINUE (not decide_research_pre)', async () => {
      // Setup: legacy mode, mock meta to return CONTINUE
      // Verify: next node after meta_reflect is retrieve_context
    })
  })
})
```

#### WF2 (Deep Research) — Research-First Path

```ts
describe('WF2 integration — research-first topology', () => {
  it('research loop completes before thesis_generation', async () => {
    // Setup: mock gap analysis to converge after 1 iteration
    // Verify: search_and_ingest runs before thesis_generation
    // Verify: kg_snapshot is created between research and dialectical phases
  })

  it('thesis agents do NOT receive search tools', async () => {
    // Setup: mock createKGTools, track tool registrations
    // Verify: thesis agent tool set includes kg_summary, kg_get_claims etc
    // Verify: thesis agent tool set does NOT include web_search, scholar_search
  })

  it('cross-iteration source dedup prevents re-fetching same URL', async () => {
    // Setup: mock ingestSources to return sources with URLs
    // Run 2 gap iterations
    // Verify: second iteration filters out URLs from first iteration
    // Verify: processedSourceUrls grows across iterations
  })

  it('budget updates propagate through dialectical phases', async () => {
    // Setup: initial budget, mock LLM calls to record spend
    // Verify: budget.spentUsd increases after thesis, negation, sublation nodes
  })
})
```

#### Legacy Mode Backward Compatibility

```ts
describe('legacy mode backward compatibility', () => {
  it('WF1 with all flags off produces same topology as pre-Phase-1', () => {
    // Verify: graph has exactly these edges:
    // START → retrieve_context → generate_theses → cross_negation → crystallize → sublate → meta_reflect → [END or retrieve_context]
    // Verify: no decide_research, execute_research nodes exist
  })

  it('WF2 with researchFirstMode: true (default) keeps existing research-first behavior', () => {
    // Verify: graph follows research-first topology
  })
})
```

### Mock Strategy

For the integration tests, you need to mock at the **service boundary**, not at the node level:

```ts
// Services to mock (these make external calls):
vi.mock('../../providerService.js', () => ({ executeWithProvider: vi.fn() }))
vi.mock('../utils.js', () => ({ executeAgentWithEvents: vi.fn(), handleAskUserInterrupt: vi.fn() }))
vi.mock('../../messageStore.js', () => ({ recordMessage: vi.fn() }))
vi.mock('../../deepResearch/sourceIngestion.js', () => ({ executeSearchPlan: vi.fn(), ingestSources: vi.fn() }))
vi.mock('../../deepResearch/claimExtraction.js', () => ({ extractClaimsFromSourceBatch: vi.fn() }))

// Modules to let run (they contain the logic under test):
// - graphGapAnalysis.ts (pure function)
// - stateAnnotations.ts (state schema)
// - dialecticalGraph.ts (graph construction)
// - budgetController.ts (pure function)
```

However, if the transitive import chain makes this impractical (firebase mocks, etc.), fall back to the same fully-mocked pattern used in `dialecticalGraph.reactive.test.ts` and test the routing/state logic without compiling full LangGraph instances.

---

## Task 5B: Manual Verification Checklist (as code comments)

Add a checklist comment block at the top of the integration test file:

```ts
/**
 * MANUAL VERIFICATION CHECKLIST (to be run against a live environment):
 *
 * [ ] Run WF2 → inspect thesis agent tool calls → confirm kg_summary, kg_get_neighborhood appear
 * [ ] Run WF1 on topic needing fresh data → confirm [RESEARCH DECISION] Research needed
 * [ ] Run WF1 on self-contained topic → confirm [RESEARCH DECISION] No research needed
 * [ ] Verify budget shows dialectical phase costs in WF2
 * [ ] Verify mergedGraph stays under 4000 chars in prompts after 5+ cycles
 * [ ] Verify parse failure produces explicit error (not silent placeholder)
 */
```

---

## Task 5C: Cleanup — Remove Dead Code

### 5C-1: `repairJsonOutput` in `dialecticalPrompts.ts`

`repairJsonOutput` (line 282 of `functions/src/agents/langgraph/dialecticalPrompts.ts`) is exported but ONLY consumed by test code (`dialecticalPrompts.test.ts`). It is part of the Phase 2 shared infrastructure and is designed to be used by future thesis/negation/sublation nodes when they adopt structured output parsing. **Do NOT remove it** — it is intentionally pre-staged for Phase 3/5 integration. Leave it as-is.

### 5C-2: Verify no unused imports in changed files

Run `pnpm lint` and verify 0 errors. The files changed in Phases 1–4 are:
- `functions/src/agents/deepResearch/graphGapAnalysis.ts`
- `functions/src/agents/langgraph/stateAnnotations.ts`
- `functions/src/agents/langgraph/dialecticalGraph.ts`
- `functions/src/agents/langgraph/dialecticalPrompts.ts`

If any of these files have unused import lint errors, fix them. Do NOT fix lint warnings in files you didn't change.

### 5C-3: Check for stale comments

Scan the files modified in Phases 1–4 for comments that reference "TODO", "FIXME", "FIX #", "Phase X" markers that are now resolved. Update or remove stale ones. Do not remove comments that describe current behavior.

---

## Task 5D: Final Verification Gate

After all changes and tests are written, run:

```bash
cd functions && pnpm lint && pnpm typecheck && pnpm test -- --run
cd ../packages/agents && pnpm lint && pnpm typecheck && pnpm test -- --run
```

### Expected results:
- **Lint:** 0 errors in both packages (warnings are acceptable)
- **Typecheck:** Clean in both packages
- **Tests (functions):** 2 pre-existing suite failures (`graphGuardrails.test.ts`, `humanApproval.test.ts` — firebase mock), all other tests pass including your new integration tests
- **Tests (agents):** 1 pre-existing test failure (`agentUsecases.test.ts` — configHash), all other tests pass

Fix any NEW lint errors, type errors, or test failures before committing. Do not attempt to fix the 3 pre-existing failures listed above.

---

## Files Summary

| File | Action | What |
|---|---|---|
| `functions/src/agents/langgraph/__tests__/dialecticalIntegration.test.ts` | **CREATE** | Cross-workflow integration tests for WF1 reactive research, WF2 research-first, legacy backward compatibility |
| Various Phase 1–4 files | **MODIFY** (if needed) | Remove unused imports, fix stale comments |

## Commit

Once everything passes:

```
test(agents): integration tests and cleanup for dialectical workflow improvements
```
