# REFACTOR SPEC: Deep Research, Dialectical & Oracle Workflows

## Document Purpose

This is a spec-driven development document for AI agents. Each item contains enough context, code references, and acceptance criteria for an agent to implement the fix without additional exploration. Items are organized into phases with explicit dependency ordering.

## Architecture Context

### Repository Structure
```
packages/agents/src/domain/     — Domain types (shared across frontend & backend)
functions/src/agents/           — Backend workflow implementations
  langgraph/                    — LangGraph StateGraph definitions
    stateAnnotations.ts         — State types for Deep Research & Dialectical
    oracleStateAnnotation.ts    — State types for Oracle
    deepResearchGraph.ts        — Deep Research graph (22+ nodes)
    dialecticalGraph.ts         — Dialectical graph (thesis → negation → sublation → meta-reflection)
    oracleGraph.ts              — Oracle graph (22 nodes, 3 gates, 4 phases)
    dialecticalPrompts.ts       — Prompt builders for dialectical
    structuredOutputSchemas.ts  — Zod schemas for structured LLM output
  deepResearch/                 — Deep Research supporting modules
    claimExtraction.ts          — Extract claims from sources
    sourceIngestion.ts          — Ingest and chunk web sources
    sourceQuality.ts            — Score source/claim quality
    answerGeneration.ts         — Generate final research answer
    kgSerializer.ts             — Serialize KG to compact format for prompts
    kgEnrichment.ts             — Enrich KG with inferred edges
    contextProcessor.ts         — HTML stripping, text processing
  oracle/                       — Oracle supporting modules
    oraclePrompts.ts            — 12 prompt builders + system elevations
    gateEvaluator.ts            — Gate scoring logic
    phaseSummarizer.ts          — Phase summary generation
    axiomLoader.ts              — Load axiom library + cookbook JSON
  shared/                       — Shared utilities (some to be created)
  knowledgeHypergraph.ts        — In-memory KG with bi-temporal edges
  contradictionTrackers.ts      — 4 deterministic contradiction detectors
  sublationEngine.ts            — Hegelian synthesis scoring + selection
  metaReflection.ts             — Velocity metrics + termination logic
  kgTools.ts                    — KG query tools exposed to agents
  runExecutor.ts                — Orchestrates run lifecycle (start/pause/resume)
  langgraph/executor.ts         — Dispatches to workflow-specific executors
apps/web-vite/src/hooks/        — Frontend React hooks
  useDialecticalState.ts        — Parses dialectical run events for UI
```

### Build & Test Sequence
```bash
cd packages/agents && pnpm build
cp -r packages/agents/dist functions/vendor/agents/
pnpm typecheck                    # 13 projects
cd packages/agents && pnpm test   # 155 tests
cd functions && pnpm test         # 707 tests
```

### Key Patterns
- `as typeof START` — Standard workaround for LangGraph string literal narrowing
- `Array.from()` required for Set/Map iteration (target: ES2022, no downlevelIteration)
- Pre-existing test failures: 2 files fail due to firebase mock (`firestore.settings is not a function`) — unrelated to this refactor

---

## ALREADY FIXED (Prior Session)

| # | Finding | File | Fix |
|---|---------|------|-----|
| F1 | Source quality formula doubled confidence | `sourceQuality.ts:119` | `conf * 0.7 + quality * 0.3` |
| F2 | Parsimony = 1.0 for zero operators → stasis | `sublationEngine.ts:311` | Zero-operator score = 0.2 |
| F3 | Budget exhaustion ignored by gate edges | `oracleGraph.ts:1429-1477` | `checkBudgetExceeded()` guard |
| F4 | Gate refinement counter leak | `oracleGraph.ts` council nodes | Reset `currentGateRefinements: 0` |

---

# PHASE 0: Foundation & Shared Infrastructure

**Goal:** Create shared utilities and state infrastructure that Phase 1 parallel tracks depend on.
**Must complete before Phase 1 begins.**

---

## 0.1 — Extract shared `safeParseJsonWithSchema<T>()` helper

### Problem
Three independent `safeParseJson` implementations exist with different extraction strategies and zero schema validation:

**Implementation A** (`claimExtraction.ts:492-522`): Brace-counting approach
```typescript
function safeParseJson(text: string): unknown | null {
  const start = text.indexOf('{')
  // ... brace counting loop ...
  return JSON.parse(text.slice(start, i + 1))
}
```

**Implementation B** (`oracleGraph.ts:173-193`): Regex-first approach
```typescript
function safeParseJson<T>(text: string): T | null {
  const objMatch = text.match(/\{[\s\S]*\}/)
  if (objMatch) return JSON.parse(objMatch[0]) as T
  const arrMatch = text.match(/\[[\s\S]*\]/)
  if (arrMatch) return JSON.parse(arrMatch[0]) as T
  return null
}
```

**Implementation C** (`sourceQuality.ts`): Similar to A.

All three parse JSON successfully but never validate the parsed object against an expected schema. `{ "claims": "not an array" }` passes through; downstream `.filter()` silently produces empty arrays.

### Solution
Create `functions/src/agents/shared/jsonParser.ts`:

```typescript
import { type ZodType, type ZodError } from 'zod'

export interface ParseResult<T> {
  data: T
  validationErrors?: ZodError
}

export function safeParseJsonWithSchema<T>(
  text: string,
  schema: ZodType<T>,
  fallback: T,
  context?: string
): ParseResult<T> {
  // 1. Strip markdown fences: ```json ... ```
  // 2. Try regex extraction (handles LLM preamble text)
  // 3. Try brace-counting (handles nested objects)
  // 4. JSON.parse
  // 5. Validate against Zod schema
  // 6. On schema violation: log.warn with context, return { data: fallback, validationErrors }
  // 7. On parse failure: log.warn, return { data: fallback }
}

// Backward-compatible wrapper for gradual migration
export function safeParseJson<T>(text: string): T | null {
  // Keep existing behavior for files not yet migrated to schema validation
}
```

### Files to Modify
- **Create:** `functions/src/agents/shared/jsonParser.ts`
- **Update:** `oracleGraph.ts` — replace local `safeParseJson` with import
- **Update:** `claimExtraction.ts` — replace local `safeParseJson` with import
- **Update:** `sourceQuality.ts` — replace local `safeParseJson` with import

### Acceptance Criteria
- [ ] `safeParseJsonWithSchema` extracts JSON from text with markdown fences, preamble text, or raw JSON
- [ ] Valid JSON that fails Zod validation returns fallback and logs warning with `context` label
- [ ] Invalid JSON (unparseable) returns fallback and logs warning
- [ ] Valid JSON that passes Zod validation returns parsed data with no errors
- [ ] All three existing callsites updated to import from shared module
- [ ] Existing `safeParseJson` (no schema) wrapper exported for backward compatibility
- [ ] `pnpm typecheck` passes
- [ ] All existing tests pass (no behavioral change for non-schema callers)

---

## 0.2 — Add `degradedPhases: string[]` to all workflow state annotations

### Problem
All three workflows have error/fallback paths that silently continue as "successful":
- Deep Research: `deepResearchGraph.ts:649` (sense_making fallback), `:1282` (empty contradictions), `:1459` (empty synthesis)
- Dialectical: `dialecticalGraph.ts:1102` (all negations failed), `:1386` (sublation timeout)
- Oracle: Various fallback returns throughout `oracleGraph.ts`

No mechanism tracks which phases degraded. Final output appears successful even when multiple phases used fallback logic.

### Solution
Add `degradedPhases` field to state annotations:

**In `stateAnnotations.ts`** — add to both `DeepResearchStateAnnotation` and `DialecticalStateAnnotation`:
```typescript
degradedPhases: Annotation<string[]>({
  reducer: (current, update) => [...current, ...update],
  default: () => [],
}),
```

**In `oracleStateAnnotation.ts`** — add to `OracleStateAnnotation`:
```typescript
degradedPhases: Annotation<string[]>({
  reducer: (current, update) => [...current, ...update],
  default: () => [],
}),
```

Phase 0 only adds the fields. Actual usage (appending on fallback paths) happens in Phase 1 tracks.

### Files to Modify
- `functions/src/agents/langgraph/stateAnnotations.ts` — add field to Deep Research annotation (after line ~510) and Dialectical annotation (after line ~350)
- `functions/src/agents/langgraph/oracleStateAnnotation.ts` — add field (after line ~140)

### Acceptance Criteria
- [ ] `degradedPhases` field exists on `DeepResearchState`, `DialecticalState`, and `OracleState` types
- [ ] Reducer is additive (appends new phases to existing array)
- [ ] Default value is empty array
- [ ] `pnpm typecheck` passes
- [ ] Existing tests pass (new field has no effect until populated)

---

## 0.3 — Clone config before quick-mode mutation

### Problem
`dialecticalGraph.ts:1887-1891` mutates caller-owned objects:
```typescript
const isQuickMode = dialecticalConfig.mode === 'quick'
if (isQuickMode) {
  dialecticalConfig.maxCycles = 1      // ← MUTATES INPUT
  thesisAgents.splice(2)               // ← MUTATES INPUT
  log.info('Quick dialectic mode: 1 cycle, 2 lenses, no KG')
}
```

If caller reuses the config object (e.g., for multiple runs), subsequent runs inherit quick-mode settings. Also causes test interference.

### Solution
Clone before mutation:
```typescript
const isQuickMode = dialecticalConfig.mode === 'quick'
const cfg = { ...dialecticalConfig }
const agents = [...thesisAgents]
if (isQuickMode) {
  cfg.maxCycles = 1
  agents.splice(2)
  log.info('Quick dialectic mode: 1 cycle, 2 lenses, no KG')
}
// Use `cfg` and `agents` everywhere downstream instead of originals
```

### Files to Modify
- `functions/src/agents/langgraph/dialecticalGraph.ts` — lines 1886-1892, plus update all downstream references to use cloned variables

### Acceptance Criteria
- [ ] Original `dialecticalConfig` object is never mutated
- [ ] Original `thesisAgents` array is never mutated
- [ ] Quick mode still produces 1 cycle with max 2 agents
- [ ] A test can call the function twice with the same config and get consistent behavior
- [ ] `pnpm typecheck` passes

---

## 0.4 — OraclePhase const array for runtime iteration

### Problem
`oracleWorkflow.ts:16-20`:
```typescript
export type OraclePhase =
  | 'context_gathering'
  | 'decomposition'
  | 'trend_scanning'
  | 'scenario_simulation'
```
Union type cannot be iterated or validated at runtime. Downstream code that needs to check phase ordering or enumerate phases has to hardcode the values.

### Solution
```typescript
export const ORACLE_PHASES = [
  'context_gathering',
  'decomposition',
  'trend_scanning',
  'scenario_simulation',
] as const

export type OraclePhase = typeof ORACLE_PHASES[number]
```

### Files to Modify
- `packages/agents/src/domain/oracleWorkflow.ts` — lines 16-20

### Acceptance Criteria
- [ ] `ORACLE_PHASES` is exported as a const array
- [ ] `OraclePhase` type is derived from the array
- [ ] All existing imports of `OraclePhase` continue to work
- [ ] `packages/agents` build succeeds
- [ ] `pnpm typecheck` passes

---

## 0.5 — Reusable capped reducer helper

### Problem
Multiple state annotations need capped additive reducers. Currently:
- `graphHistory` (both workflows): manually capped at 20 with inline logic
- `sources`, `extractedClaims`: uncapped (M11)
- `cycleMetricsHistory`: uncapped (L13)
- `evidence` (Oracle): uncapped (M12)

Each fix would duplicate the cap-and-evict pattern.

### Solution
Create helper in `functions/src/agents/shared/reducerUtils.ts`:
```typescript
/**
 * Creates a LangGraph-compatible additive reducer with a size cap.
 * When the merged array exceeds maxSize, applies evictionFn or keeps last maxSize items.
 */
export function cappedReducer<T>(
  maxSize: number,
  evictionFn?: (items: T[]) => T[]
): (current: T[], update: T[]) => T[] {
  return (current: T[], update: T[]) => {
    const merged = [...current, ...update]
    if (merged.length <= maxSize) return merged
    return evictionFn ? evictionFn(merged).slice(0, maxSize) : merged.slice(-maxSize)
  }
}
```

### Files to Modify
- **Create:** `functions/src/agents/shared/reducerUtils.ts`

### Acceptance Criteria
- [ ] `cappedReducer(20)` produces a function that keeps last 20 items
- [ ] `cappedReducer(100, fn)` applies custom eviction then caps at 100
- [ ] Works as a LangGraph `Annotation` reducer (signature: `(current: T[], update: T[]) => T[]`)
- [ ] Unit test: 15 items + 10 items with cap 20 → last 20 items
- [ ] `pnpm typecheck` passes

---

## Phase 0 Checkpoint

After all 5 items complete:
```bash
cd packages/agents && pnpm build
cp -r packages/agents/dist functions/vendor/agents/
pnpm typecheck
cd packages/agents && pnpm test
cd functions && pnpm test
```

All tests must pass. No behavioral changes — only new utilities and infrastructure fields.

---

# PHASE 1, TRACK A: Deep Research Pipeline

**Scope:** 16 items across Deep Research graph, KG, claim extraction, source ingestion, serialization, enrichment, and tools.

**Files owned by this track:** `deepResearchGraph.ts`, `knowledgeHypergraph.ts`, `claimExtraction.ts`, `sourceIngestion.ts`, `answerGeneration.ts`, `kgSerializer.ts`, `kgEnrichment.ts`, `contextProcessor.ts`, `kgTools.ts`, `sourceQuality.ts`, `stateAnnotations.ts` (Deep Research reducers only, lines 386-538)

**No overlap** with Track B or C files.

---

## A1: Apply synthesis KG diffs to sharedKg before answer generation [H1 — HIGH]

### Problem
Dialectical synthesis within Deep Research produces `mergedGraph` and `kgDiff` stored in state. But answer generation reads from the original `sharedKg`, never updated with synthesis results.

**Synthesis output** (`deepResearchGraph.ts:1409-1448`):
```typescript
const synthesisKgDiff: KGDiff = {
  conceptSplits: [], conceptMerges: [], newMediators: [],
  edgeReversals: [], regimeScopings: [], temporalizations: [],
  newClaims: (synthesis.newClaims ?? []).map(c => ({...})),
  supersededClaims: synthesis.negatedElements ?? [],
  // ...
}
// mergedGraph is set if evolvedGraph exists
if (evolvedGraph) { stateUpdate.mergedGraph = evolvedGraph }
```

**Answer generation** (`deepResearchGraph.ts:1764-1777`):
```typescript
const kg = sharedKg  // ← ORIGINAL KG, never updated
const { answer, updatedBudget } = await generateAnswer(kg, state.goal, ...)
```

`generateAnswer` signature (`answerGeneration.ts:153-161`) receives `kg: KnowledgeHypergraph` as first arg. `buildDetailedKGSummary(kg)` at line 236 builds the summary from whatever KG is passed.

### Solution
Before calling `generateAnswer`, apply `kgDiff` operations to `sharedKg`:

1. For each `newClaims` in kgDiff: call `sharedKg.addClaim()` with the claim data
2. For each `supersededClaims`: mark as expired via `sharedKg.expireClaim()` (or equivalent)
3. For each `conceptMerges`: apply merge
4. Pass the evolved `sharedKg` to `generateAnswer`

If `mergedGraph` exists as a CompactGraph, it's already a serialized snapshot — the KG mutations above create the authoritative in-memory version.

### Files to Modify
- `functions/src/agents/langgraph/deepResearchGraph.ts` — answer_generation node (~line 1764), add KG evolution step before `generateAnswer` call

### Acceptance Criteria
- [ ] New claims from synthesis are present in the KG passed to `generateAnswer`
- [ ] Superseded claims are expired/inactive in the KG passed to `generateAnswer`
- [ ] `buildDetailedKGSummary` output includes synthesis-generated claims
- [ ] If no synthesis occurred (e.g., budget exhaustion), original KG is passed unchanged
- [ ] Existing tests pass

---

## A2: Unify sourced_from edge target format [H2 — HIGH]

### Problem
When a NEW claim is added to KG (`knowledgeHypergraph.ts:508-511`):
```typescript
if (input.sourceEpisodeId) {
  this.addEdge(claimId, input.sourceEpisodeId, {
    type: 'sourced_from', weight: input.confidence, temporal: createBiTemporalEdge(),
  })
}
```

When a DUPLICATE claim is found (`knowledgeHypergraph.ts:476-486`):
```typescript
if (input.sourceEpisodeId) {
  const alreadyLinked = existingSourceEdges.some((e) =>
    e.data.type === 'sourced_from' && e.target === input.sourceEpisodeId
  )
  if (!alreadyLinked) {
    this.addEdge(existing.claimId, input.sourceEpisodeId, {
      type: 'sourced_from', weight: input.confidence ?? 0.5, temporal: createBiTemporalEdge(),
    })
  }
}
```

The edge target is `input.sourceEpisodeId`, which is set in `claimExtraction.ts:230`:
```typescript
sourceEpisodeId: `episode:source:${claim.sourceId}` as EpisodeId
```

But `claim.sourceId` references IDs like `src_abc123`. The `episode:source:` prefix creates IDs that don't correspond to actual source nodes in the KG. Source nodes have IDs like `src_abc123`.

Result: `sourced_from` edges point to non-existent `episode:source:src_abc123` nodes — dangling edges.

### Solution
In `claimExtraction.ts`, use the raw source ID without the `episode:source:` prefix:
```typescript
sourceEpisodeId: claim.sourceId as EpisodeId  // or create proper source node first
```

OR ensure a source node with the episode ID actually exists by adding it before creating claims.

The simpler fix: change `claimExtraction.ts:230` to use the actual source node ID format that exists in the KG.

### Files to Modify
- `functions/src/agents/deepResearch/claimExtraction.ts` — line 230
- Verify: `knowledgeHypergraph.ts` addClaim method handles the corrected ID format

### Acceptance Criteria
- [ ] `sourced_from` edge targets match actual node IDs in the KG
- [ ] No dangling edges created for either new or duplicate claims
- [ ] Corroboration tracking still works (duplicate detection unaffected)
- [ ] Existing tests pass

---

## A3: Fix double-seeding of context claims [M1 — MEDIUM]

### Problem
`context_seeding` node (`deepResearchGraph.ts:760-781`) adds claims to KG via `mapClaimsToKG()` AND returns them in `extractedClaims`:
```typescript
const { addedClaimIds } = await mapClaimsToKG(contextClaims, contextSources, sharedKg, sessionId, state.userId)
return {
  sources: contextSources,
  extractedClaims: contextClaims,  // ← ADDED TO STATE
  // NOTE: claimsProcessedCount NOT updated
}
```

Later, `kg_construction` node (`deepResearchGraph.ts:988-1012`) processes claims starting from `claimsProcessedCount`:
```typescript
const alreadyProcessed = state.claimsProcessedCount ?? 0
const newClaims = state.extractedClaims.slice(alreadyProcessed)  // ← REPROCESSES context claims
const { addedClaimIds } = await mapClaimsToKG(newClaims, ...)
```

Since `claimsProcessedCount` is 0 after context_seeding, all context claims are processed again. This inflates corroboration counts and creates duplicate provenance.

### Solution
In `context_seeding` return, advance `claimsProcessedCount`:
```typescript
return {
  sources: contextSources,
  extractedClaims: contextClaims,
  claimsProcessedCount: contextClaims.length,  // ← ADD THIS
  // ...
}
```

### Files to Modify
- `functions/src/agents/langgraph/deepResearchGraph.ts` — context_seeding node return (~line 778)

### Acceptance Criteria
- [ ] After context_seeding, `claimsProcessedCount` equals the number of seeded claims
- [ ] `kg_construction` starts processing from the correct offset (skips already-seeded claims)
- [ ] Claims are only added to the KG once
- [ ] Existing tests pass

---

## A4: Fix counterclaim search event type [M4 — MEDIUM]

### Problem
`deepResearchGraph.ts:1822-1826`:
```typescript
await emitPhaseEvent(execContext, 'answer_generation', {
  phase: 'counterclaim_search',  // ← WRONG: uses answer_generation as event type
  claimCount: state.extractedClaims.length,
})
```

Counterclaim search is a distinct phase but piggybacks on the `answer_generation` event type with an embedded `phase` field. Breaks event filtering and UI phase sequencing.

### Solution
```typescript
await emitPhaseEvent(execContext, 'counterclaim_search', {
  claimCount: state.extractedClaims.length,
})
```

### Files to Modify
- `functions/src/agents/langgraph/deepResearchGraph.ts` — line 1822

### Acceptance Criteria
- [ ] Event type is `'counterclaim_search'`, not `'answer_generation'`
- [ ] Frontend event handlers that switch on event type can distinguish counterclaim search from answer generation
- [ ] Existing tests pass

---

## A5: Validate budget estimation model assumptions [M5 — MEDIUM]

### Problem
Budget estimates hardcode model names:
- `claimExtraction.ts:112`: `estimateLLMCost('gpt-5-mini', ...)`
- `claimExtraction.ts:449`: `estimateLLMCost('gpt-5-mini', ...)`
- `gapAnalysis.ts:98`: similar hardcoding
- `answerGeneration.ts:188`: hardcodes `claude-opus`

If runtime uses different models, cost estimates are wrong, causing incorrect stop/continue budget decisions.

### Solution
Pass the actual model name from the execution context or provider config instead of hardcoded strings. If model name isn't available at estimation time, use a conservative default and document it.

### Files to Modify
- `functions/src/agents/deepResearch/claimExtraction.ts` — lines 112, 449
- `functions/src/agents/deepResearch/gapAnalysis.ts` — line 98
- `functions/src/agents/deepResearch/answerGeneration.ts` — line 188

### Acceptance Criteria
- [ ] No hardcoded model name strings in cost estimation calls
- [ ] Model name sourced from execution context or configuration
- [ ] If model is unknown, uses conservative estimate with log.debug noting the fallback
- [ ] Existing tests pass

---

## A6: Log dropped non-compact KG node types [M9 — MEDIUM]

### Problem
`kgSerializer.ts:21,30-34`:
```typescript
const COMPACT_NODE_TYPES = new Set(['claim', 'concept', 'mechanism', 'prediction'])
// ...
for (const t of ['claim', 'concept', 'mechanism', 'prediction'] as const) {
  allNodes.push(...kg.getNodesByType(t))
}
```
Source nodes, episode nodes, and any other types are silently excluded. No logging indicates data was dropped.

### Solution
Add logging:
```typescript
const allNodeTypes = kg.getNodeTypes()  // or enumerate known types
const droppedTypes = allNodeTypes.filter(t => !COMPACT_NODE_TYPES.has(t))
if (droppedTypes.length > 0) {
  log.debug('KG serialization: dropped non-compact node types', { droppedTypes, droppedCount: ... })
}
```

### Files to Modify
- `functions/src/agents/deepResearch/kgSerializer.ts` — after line 34

### Acceptance Criteria
- [ ] When serializing a KG with source nodes, a debug log is emitted listing dropped types and count
- [ ] No behavioral change to serialization output
- [ ] Existing tests pass

---

## A7: Cap sources and extractedClaims reducers [M11 — MEDIUM]

### Problem
`stateAnnotations.ts:407-414`:
```typescript
extractedClaims: Annotation<ExtractedClaim[]>({
  reducer: (current, update) => [...current, ...update],  // ← NO CAP
  default: () => [],
}),
```
Same pattern for `sources`. With 5+ gap iterations, these can grow to 500+ items, bloating state and checkpoint size.

Compare with `graphHistory` which is capped at 20 (`stateAnnotations.ts:438-441`).

### Solution
Use Phase 0's `cappedReducer`:
```typescript
import { cappedReducer } from '../shared/reducerUtils.js'

sources: Annotation<SourceRecord[]>({
  reducer: cappedReducer(100),  // Keep last 100
  default: () => [],
}),
extractedClaims: Annotation<ExtractedClaim[]>({
  reducer: cappedReducer(200),  // Keep last 200
  default: () => [],
}),
```

### Files to Modify
- `functions/src/agents/langgraph/stateAnnotations.ts` — lines 407-414 (Deep Research reducers)

### Acceptance Criteria
- [ ] `sources` capped at 100 items
- [ ] `extractedClaims` capped at 200 items
- [ ] Oldest items evicted when cap exceeded (FIFO via `slice(-N)`)
- [ ] `pnpm typecheck` passes
- [ ] Existing tests pass

---

## A8: Track degraded phases in Deep Research [M10 usage — MEDIUM]

### Problem
Fallback paths in Deep Research continue silently:
- Line 649: sense_making fallback → generic search plan
- Line 1282: contradiction trackers fail → empty contradictions
- Line 1459: synthesis fails → empty synthesis

### Solution
In each fallback/catch block, append to `degradedPhases`:
```typescript
// Line 649 catch block:
return {
  phase: 'search_execution',
  searchPlans: [fallbackPlan],
  degradedPhases: ['sense_making'],  // ← ADD
}

// Line 1282 catch block:
return {
  phase: 'sublation',
  contradictions: [],
  degradedPhases: ['contradiction_detection'],  // ← ADD
}

// Line 1459 catch block:
return {
  phase: 'meta_reflection',
  degradedPhases: ['sublation'],  // ← ADD
}
```

In the final answer generation, include `degradedPhases` in output metadata.

### Files to Modify
- `functions/src/agents/langgraph/deepResearchGraph.ts` — fallback returns at lines 649, 1282, 1459, plus answer generation output

### Acceptance Criteria
- [ ] Each fallback path appends its phase name to `degradedPhases`
- [ ] Final output metadata includes `degradedPhases` array
- [ ] When no fallbacks triggered, `degradedPhases` is empty
- [ ] Existing tests pass

---

## A9: KG expired node pruning [L1 — LOW]

### Problem
`knowledgeHypergraph.ts`: Expired nodes (with `temporal.tExpired` set) are filtered during queries but never removed from memory. In long-running instances, they accumulate.

### Solution
Add method:
```typescript
pruneExpiredNodes(beforeTimestamp?: number): { prunedCount: number } {
  const cutoff = beforeTimestamp ?? Date.now()
  let prunedCount = 0
  for (const node of this.getAllNodes()) {
    if (node.data?.temporal?.tExpired && node.data.temporal.tExpired < cutoff) {
      this.removeNode(node.id)
      prunedCount++
    }
  }
  return { prunedCount }
}
```

### Files to Modify
- `functions/src/agents/knowledgeHypergraph.ts`

### Acceptance Criteria
- [ ] `pruneExpiredNodes()` removes nodes with `tExpired < cutoff`
- [ ] Associated edges are also removed
- [ ] Returns count of pruned nodes
- [ ] Non-expired nodes unaffected

---

## A10: Document chunking max count cap [L2 — LOW]

### Problem
`sourceIngestion.ts:344-427`: `chunkDocument` has `maxChunkSize` (4000 chars) but no max chunk count. A 200KB document with paragraph breaks produces 50+ chunks.

### Solution
Add safety cap after chunking:
```typescript
const chunks = /* existing chunking logic */
return chunks.slice(0, 50)  // Safety cap
```

### Files to Modify
- `functions/src/agents/deepResearch/sourceIngestion.ts` — end of `chunkDocument` function

### Acceptance Criteria
- [ ] No more than 50 chunks returned per document
- [ ] Small documents unaffected
- [ ] Existing tests pass

---

## A11: Parallelize relevance scoring [L4 — LOW]

### Problem
`sourceIngestion.ts:231-237`:
```typescript
for (const result of searchResults) {
  const relevance = await scoreRelevanceFn(result.snippet, query)  // ← SEQUENTIAL
  scored.push({ ...result, relevance })
}
```
100 results → 30+ seconds sequential.

### Solution
```typescript
const scorePromises = searchResults.slice(0, maxSources * 2).map(async (result) => {
  const relevance = await scoreRelevanceFn(result.snippet, query)
  return { ...result, relevance }
})
const scored = await Promise.all(scorePromises)
```

### Files to Modify
- `functions/src/agents/deepResearch/sourceIngestion.ts` — lines 231-237

### Acceptance Criteria
- [ ] Relevance scoring runs in parallel
- [ ] Same results as sequential (order doesn't matter, sort happens after)
- [ ] Existing tests pass

---

## A12: Fix capGraphForPrompt pruning order [L5 — LOW]

### Problem
`kgSerializer.ts:141-197`: Prunes edges first, then nodes. Removing edges can orphan nodes that remain as disconnected islands.

### Solution
After edge pruning, remove nodes with zero remaining connections (except prediction and contradicts-participant nodes which are protected):
```typescript
// After edge pruning loop, add orphan cleanup:
const connectedIds = new Set<string>()
for (const e of g.edges) { connectedIds.add(e.from); connectedIds.add(e.to) }
g.nodes = g.nodes.filter(n =>
  connectedIds.has(n.id) || n.type === 'prediction' || contradictsNodeIds.has(n.id)
)
```

### Files to Modify
- `functions/src/agents/deepResearch/kgSerializer.ts` — after edge pruning (before node pruning)

### Acceptance Criteria
- [ ] No orphaned nodes remain after edge pruning
- [ ] Prediction nodes and contradicts-participant nodes preserved even if orphaned
- [ ] Output stays under `maxChars` limit
- [ ] Existing tests pass

---

## A13: HTML stripping — remove script content [L6 + S2 — LOW/SECURITY]

### Problem
`contextProcessor.ts:54-69`:
```typescript
function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    // ... entity decoding ...
    .replace(/<[^>]+>/g, '')  // ← Strips tags but NOT script content
}
```
`<script>alert('xss')</script>` becomes `alert('xss')` — script content leaks into KG.

### Solution
Add before the generic tag strip:
```typescript
.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
.replace(/<!--[\s\S]*?-->/g, '')
```

### Files to Modify
- `functions/src/agents/deepResearch/contextProcessor.ts` — lines 54-69

### Acceptance Criteria
- [ ] `<script>` tag content is fully removed (not just tags)
- [ ] `<style>` tag content is fully removed
- [ ] HTML comments removed
- [ ] Regular HTML tags still stripped correctly
- [ ] Existing tests pass

---

## A14: Attribution bounds logging [L8 — LOW]

### Problem
`claimExtraction.ts:388-395`: Silent index clamping masks bad LLM output.
```typescript
const idx = Math.max(0, Math.min(sources.length - 1, (Number(c.sourceIndex) || 1) - 1))
```

### Solution
```typescript
const rawIdx = (Number(c.sourceIndex) || 1) - 1
const idx = Math.max(0, Math.min(sources.length - 1, rawIdx))
if (rawIdx !== idx) {
  log.warn('Claim attribution index clamped', { rawIndex: c.sourceIndex, clampedTo: idx, sourceCount: sources.length })
}
```

### Files to Modify
- `functions/src/agents/deepResearch/claimExtraction.ts` — lines 388-395

### Acceptance Criteria
- [ ] Warning logged when index is clamped
- [ ] Clamping behavior unchanged
- [ ] Existing tests pass

---

## A15: KG Tools max cap [L9 + S3 — LOW/SECURITY]

### Problem
`kgTools.ts:70-96`: `limit` parameter has no max:
```typescript
const limit = (params.limit as number | undefined) ?? 20
```
Agent could request `limit: 10000`, returning massive payloads.

### Solution
```typescript
const limit = Math.min((params.limit as number | undefined) ?? 20, 100)
```

### Files to Modify
- `functions/src/agents/kgTools.ts` — line 70

### Acceptance Criteria
- [ ] `limit` capped at 100 regardless of input
- [ ] Default remains 20
- [ ] Existing tests pass

---

## A16: Prompt injection hygiene [S1 — LOW/SECURITY]

### Problem
`claimExtraction.ts:50-70` and `sourceQuality.ts:162-180` interpolate user input into prompts without sanitization:
```typescript
`## Research Question\n${query.replace(/[{}\"\\]/g, ' ').substring(0, 500)}`
```
The `sourceQuality.ts` version does basic sanitization. `claimExtraction.ts` does less.

### Solution
Apply consistent sanitization to all user-input interpolation points:
```typescript
function sanitizeForPrompt(input: string, maxLength = 500): string {
  return input.replace(/[{}\"\\<>]/g, ' ').substring(0, maxLength).trim()
}
```

### Files to Modify
- `functions/src/agents/deepResearch/claimExtraction.ts` — all user input interpolation points
- `functions/src/agents/deepResearch/sourceQuality.ts` — verify existing sanitization is consistent

### Acceptance Criteria
- [ ] All user input interpolated into prompts is sanitized consistently
- [ ] `<`, `>`, `{`, `}`, `"`, `\` characters replaced
- [ ] Input truncated to 500 characters
- [ ] Existing tests pass

---

## Track A Checkpoint

```bash
cd packages/agents && pnpm build && cp -r dist ../functions/vendor/agents/
cd functions && pnpm typecheck && pnpm test
```

---

# PHASE 1, TRACK B: Dialectical Pipeline

**Scope:** 12 items across dialectical graph, contradiction trackers, sublation engine, meta-reflection, prompts, schemas, and frontend hook.

**Files owned by this track:** `dialecticalGraph.ts`, `contradictionTrackers.ts`, `sublationEngine.ts`, `metaReflection.ts`, `dialecticalPrompts.ts`, `structuredOutputSchemas.ts`, `stateAnnotations.ts` (Dialectical reducers only, lines 232-357), `useDialecticalState.ts`

**No overlap** with Track A or C files.

---

## B1: Fix contradiction ID mismatch for KG persistence [C4 — CRITICAL]

### Problem
All 4 contradiction trackers populate `participatingClaims` with **thesis agent IDs**, not KG claim IDs:

**Logic tracker** (`contradictionTrackers.ts:162-169`):
```typescript
participatingClaims: [agentId1, agentId2],  // ← AGENT IDs like "agent_gpt4_systems"
```

**Pragmatic tracker** (`contradictionTrackers.ts:267-275`):
```typescript
participatingClaims: [d1.agentId, d2.agentId],  // ← AGENT IDs
```

**Semantic tracker** (`contradictionTrackers.ts:338-346`):
```typescript
participatingClaims: [negation.agentId, negation.targetThesisAgentId],  // ← AGENT IDs
```

**Boundary tracker** (`contradictionTrackers.ts:460,507`):
```typescript
participatingClaims: [st.agentId, lt.agentId],  // ← AGENT IDs
```

When KG persistence tries to look up these IDs (`dialecticalGraph.ts:1220-1233`):
```typescript
const claimIds = c.participatingClaims
  .map((pc) => `claim:${pc}` as ClaimId)
  .filter((cid) => kg.getNode(cid) !== undefined)  // ← NEVER RESOLVES

if (claimIds.length === 0) {
  continue  // ← SKIPS PERSISTENCE for almost all contradictions
}
```

**Result:** Dialectical contradictions never make it into the shared KG.

### Root Cause
During thesis generation (`dialecticalGraph.ts:817-881`), each thesis agent generates claims that get added to the KG with real claim IDs (like `claim_1709234567_abc`). But the `ThesisOutput` object preserves the agent's `agentId`, not the KG claim IDs. The contradiction trackers receive `ThesisOutput[]` and use `agentId` fields.

### Solution
Build an agent-to-claims mapping during thesis generation and pass it to contradiction trackers:

1. In the thesis generation node, after parsing thesis output and adding claims to KG, build a map:
```typescript
const agentToClaimIds = new Map<string, string[]>()
// After mapClaimsToKG returns addedClaimIds:
agentToClaimIds.set(agent.agentId, addedClaimIds)
```

2. Store this map in state (add field to DialecticalState):
```typescript
agentClaimMapping: Annotation<Record<string, string[]>>({
  reducer: (current, update) => ({ ...current, ...update }),
  default: () => ({}),
}),
```

3. In contradiction trackers, accept the mapping and emit real claim IDs:
```typescript
export function runContradictionTrackers(
  theses: ThesisOutput[],
  negations: NegationOutput[],
  enabledTrackers: ContradictionTrackerType[],
  context: ContradictionTrackerContext,
  agentClaimMapping?: Record<string, string[]>  // ← NEW PARAM
)
```

4. Each tracker uses the mapping:
```typescript
participatingClaims: [
  ...(agentClaimMapping?.[agentId1] ?? [agentId1]),
  ...(agentClaimMapping?.[agentId2] ?? [agentId2]),
],
```

5. Remove the `continue` workaround in `dialecticalGraph.ts:1224`.

### Files to Modify
- `functions/src/agents/langgraph/stateAnnotations.ts` — add `agentClaimMapping` to DialecticalState
- `functions/src/agents/langgraph/dialecticalGraph.ts` — thesis generation node (build mapping), contradiction persistence (remove workaround), pass mapping to trackers
- `functions/src/agents/contradictionTrackers.ts` — accept and use `agentClaimMapping` parameter in all 4 trackers

### Acceptance Criteria
- [ ] `participatingClaims` in contradiction output contains KG claim IDs (format: `claim_<timestamp>_<random>`)
- [ ] KG persistence no longer hits the `continue` skip for most contradictions
- [ ] Contradictions are actually persisted to the KG via `kg.addContradiction()`
- [ ] Backward compatible: if `agentClaimMapping` is undefined, falls back to agent IDs (existing behavior)
- [ ] `pnpm typecheck` passes
- [ ] Existing tests pass (update contradiction tracker tests to verify new mapping)

---

## B2: Validate contradiction resolution semantics [M6 — MEDIUM]

### Problem
`sublationEngine.ts:372-401` — `findResolvedContradictions`:
```typescript
const isTargeted = operators.some((op) => participatingClaims.includes(op.target))
const isExplicitlyResolved = (schemaDiff as { resolvedContradictions?: string[] })
  .resolvedContradictions?.includes(contradiction.id) ?? false
if (isTargeted || isExplicitlyResolved) {
  resolved.push(contradiction.id)
}
```

An operator that merely "targets" a claim involved in a contradiction is counted as resolving it, even if the operator type is `SPLIT` or `TEMPORALIZE` which don't semantically resolve contradictions.

### Solution
Only count an operator as resolving a contradiction if:
1. It targets a participating claim, AND
2. Its type is resolution-appropriate: `MERGE`, `ADD_MEDIATOR`, `REVERSE_EDGE`, or `SCOPE_TO_REGIME`

```typescript
const RESOLUTION_OPERATORS = new Set(['MERGE', 'ADD_MEDIATOR', 'REVERSE_EDGE', 'SCOPE_TO_REGIME'])
const isTargeted = operators.some((op) =>
  participatingClaims.includes(op.target) && RESOLUTION_OPERATORS.has(op.type)
)
```

### Files to Modify
- `functions/src/agents/sublationEngine.ts` — lines 372-401

### Acceptance Criteria
- [ ] `SPLIT` and `TEMPORALIZE` operators alone don't mark contradictions as resolved
- [ ] `MERGE`, `ADD_MEDIATOR`, `REVERSE_EDGE`, `SCOPE_TO_REGIME` still resolve contradictions
- [ ] Explicit `schemaDiff.resolvedContradictions` listing still works
- [ ] Existing tests pass

---

## B3: Velocity depth metric [M7 — MEDIUM]

### Problem
`metaReflection.ts:319-377` — `calculateConceptualVelocity` is purely count-based:
```typescript
changeScore +=
  newClaims * VELOCITY_WEIGHT_NEW_CLAIMS +
  newPredictions * VELOCITY_WEIGHT_NEW_PREDICTIONS +
  operators * VELOCITY_WEIGHT_OPERATORS
```

This measures breadth of change, not depth of dialectical integration. Adding 10 low-quality claims scores higher than resolving 2 deep contradictions.

### Solution
Add a depth component measuring resolution quality:
```typescript
// After existing changeScore calculation:
const contradictionsDetected = kgDiff?.newContradictions?.length ?? 0
const contradictionsResolved = kgDiff?.resolvedContradictions?.length ?? 0
const resolutionDepth = contradictionsDetected > 0
  ? contradictionsResolved / contradictionsDetected
  : 0

// Blend: 60% change velocity + 40% resolution depth
const blendedVelocity = velocity * 0.6 + resolutionDepth * 0.4
return blendedVelocity
```

Document the magic numbers with inline comments explaining rationale.

### Files to Modify
- `functions/src/agents/metaReflection.ts` — `calculateConceptualVelocity` function (lines 319-377)

### Acceptance Criteria
- [ ] Velocity incorporates contradiction resolution ratio
- [ ] Resolving contradictions contributes to velocity (not just adding claims)
- [ ] When no contradictions exist, depth component is 0 and velocity is purely change-based
- [ ] Magic numbers documented with inline comments
- [ ] Existing tests pass

---

## B4: Track degraded phases in Dialectical [M10 usage — MEDIUM]

### Problem
Fallback paths continue silently:
- Line 1102: all negation agents fail → proceed without negations
- Line 1386-1399: sublation timeout → fabricated minimal synthesis

### Solution
```typescript
// Line 1107, after the warning:
// Add to return: degradedPhases: ['cross_negation']

// Line 1399, in catch block return:
// Add: degradedPhases: ['sublation']
```

Include `degradedPhases` in the final workflow output metadata.

### Files to Modify
- `functions/src/agents/langgraph/dialecticalGraph.ts` — fallback returns at lines 1107, 1399, plus final output

### Acceptance Criteria
- [ ] `degradedPhases` populated when negation agents all fail
- [ ] `degradedPhases` populated when sublation times out
- [ ] Final output includes `degradedPhases` in metadata
- [ ] Existing tests pass

---

## B5: Falsifiability enforcement [Q15 — LOW]

### Problem
`structuredOutputSchemas.ts:34-47`:
```typescript
falsificationCriteria: z.array(z.string()).describe('Conditions that would disprove this thesis'),
```
Allows empty array `[]`, meaning a thesis can claim to be unfalsifiable.

### Solution
```typescript
falsificationCriteria: z.array(z.string()).min(1).describe('At least one condition that would disprove this thesis'),
```

### Files to Modify
- `functions/src/agents/langgraph/structuredOutputSchemas.ts` — line 38

### Acceptance Criteria
- [ ] Schema rejects thesis output with empty `falsificationCriteria`
- [ ] Schema accepts thesis output with 1+ criteria
- [ ] Existing tests pass (update any tests that provide empty arrays)

---

## B6: Sublation prompt node cap [L11 — LOW]

### Problem
`dialecticalPrompts.ts:212-305` — `buildSublationPrompt` has no node count constraint. Thesis prompt caps at 10 nodes (line 145), but sublation prompt allows unbounded growth as synthesis accumulates.

### Solution
Add to the sublation prompt output constraints:
```typescript
// In the prompt text, add constraint:
`Maximum 15 nodes in your synthesis output graph. If you have more, prune low-confidence nodes that are not critical to resolving contradictions.`
```

### Files to Modify
- `functions/src/agents/langgraph/dialecticalPrompts.ts` — within `buildSublationPrompt`, near output constraints section

### Acceptance Criteria
- [ ] Sublation prompt includes "Maximum 15 nodes" constraint
- [ ] Existing tests pass

---

## B7: Research evidence coherence check [L12 — LOW]

### Problem
`dialecticalPrompts.ts:88-101` — top 10 claims by confidence injected without relevance check:
```typescript
const claimLines = [...researchEvidence.claims]
  .sort((a, b) => b.confidence - a.confidence)
  .slice(0, 10)
```

Off-topic high-confidence claims can hijack synthesis.

### Solution
Score by `confidence × relevance` where relevance is a simple keyword overlap with the goal:
```typescript
const goalTerms = new Set(goal.toLowerCase().split(/\W+/).filter(t => t.length > 3))
const scoredClaims = researchEvidence.claims.map(c => {
  const claimTerms = c.claimText.toLowerCase().split(/\W+/)
  const overlap = claimTerms.filter(t => goalTerms.has(t)).length
  const relevance = Math.min(1, overlap / Math.max(1, goalTerms.size) * 2)
  return { ...c, score: c.confidence * (0.5 + 0.5 * relevance) }
})
const claimLines = scoredClaims
  .sort((a, b) => b.score - a.score)
  .slice(0, 10)
```

### Files to Modify
- `functions/src/agents/langgraph/dialecticalPrompts.ts` — lines 88-101

### Acceptance Criteria
- [ ] Claims are ranked by `confidence × relevance` instead of pure confidence
- [ ] Goal-relevant claims are preferred
- [ ] Still takes top 10
- [ ] Existing tests pass

---

## B8: Cap cycleMetricsHistory [L13 — LOW]

### Problem
`stateAnnotations.ts:291-294`:
```typescript
cycleMetricsHistory: Annotation<CycleMetrics[]>({
  reducer: (current, update) => [...current, ...update],  // ← NO CAP
  default: () => [],
}),
```

### Solution
Use Phase 0's `cappedReducer(20)`.

### Files to Modify
- `functions/src/agents/langgraph/stateAnnotations.ts` — lines 291-294 (Dialectical reducers)

### Acceptance Criteria
- [ ] `cycleMetricsHistory` capped at 20 entries
- [ ] Keeps most recent 20
- [ ] Existing tests pass

---

## B9: Pragmatic tracker entity nuance [L14 — LOW]

### Problem
`contradictionTrackers.ts:249-260`:
```typescript
const opposingPairs = [
  ['increase', 'decrease'], ['expand', 'contract'],
  ['invest', 'divest'], ['build', 'demolish'], ...
]
```
"Increase prices" vs "Decrease taxes" flagged as contradictory because both contain opposing verbs without checking the object.

### Solution
Extract verb and object, only flag if same object:
```typescript
function extractActionObject(decision: string): { verb: string; object: string } | null {
  // Simple pattern: "verb [the|a|an]? object" from first clause
  const match = decision.match(/^(increase|decrease|expand|contract|...)\s+(?:the\s+|a\s+|an\s+)?(.+?)(?:\s+(?:by|to|from|in)\b|[,.]|$)/i)
  return match ? { verb: match[1].toLowerCase(), object: match[2].toLowerCase().trim() } : null
}

// Only flag if same object with opposing verb
const a1 = extractActionObject(d1.decision)
const a2 = extractActionObject(d2.decision)
if (a1 && a2 && a1.object === a2.object && isOpposing(a1.verb, a2.verb)) {
  // Flag contradiction
}
```

### Files to Modify
- `functions/src/agents/contradictionTrackers.ts` — lines 249-280

### Acceptance Criteria
- [ ] "Increase prices" vs "Decrease prices" → flagged (same object)
- [ ] "Increase prices" vs "Decrease taxes" → NOT flagged (different objects)
- [ ] Fallback: if extraction fails, use existing verb-only matching
- [ ] Existing tests pass

---

## B10: Research state leakage on failure [L15 — LOW]

### Problem
`dialecticalGraph.ts:448-457`: If research execution fails after ingesting sources but before building evidence, `researchSources` is populated but `researchEvidence` is null.

```typescript
} catch (error) {
  log.warn('[ReactiveResearch] Execute research failed, continuing', { error: String(error) })
  return { researchBudget: currentBudget }  // ← researchSources already set from earlier step
}
```

### Solution
Add consistency check in thesis generation: if `researchSources` is populated but `researchEvidence` is null/empty, skip evidence injection.

### Files to Modify
- `functions/src/agents/langgraph/dialecticalGraph.ts` — thesis generation node, before evidence injection

### Acceptance Criteria
- [ ] Thesis generation does not inject evidence when `researchEvidence` is null but `researchSources` is populated
- [ ] Normal flow (both populated) works correctly
- [ ] Existing tests pass

---

## B11: Entry point validation [L16 — LOW]

### Problem
`dialecticalGraph.ts:1863` — no validation on inputs:
```typescript
// No check that thesisAgents.length > 0, synthesisAgents.length > 0, or apiKeys present
```

### Solution
```typescript
if (thesisAgents.length === 0) throw new Error('Dialectical graph requires at least 1 thesis agent')
if (synthesisAgents.length === 0) throw new Error('Dialectical graph requires at least 1 synthesis agent')
if (!apiKeys || Object.keys(apiKeys).length === 0) throw new Error('Dialectical graph requires API keys')
```

### Files to Modify
- `functions/src/agents/langgraph/dialecticalGraph.ts` — at graph creation entry point (~line 1863)

### Acceptance Criteria
- [ ] Empty `thesisAgents` throws descriptive error
- [ ] Empty `synthesisAgents` throws descriptive error
- [ ] Missing `apiKeys` throws descriptive error
- [ ] Valid inputs proceed normally
- [ ] Existing tests pass

---

## B12: Frontend thesis structured fields in events [L17 — LOW]

### Problem
Frontend (`useDialecticalState.ts:86-102`) extracts detailed thesis fields:
```typescript
graph: (details?.graph as CompactGraph) ?? undefined,
conceptGraph: (details?.conceptGraph as Record<string, unknown>) ?? {},
causalModel: (details?.causalModel as string[]) ?? [],
```

Backend (`dialecticalGraph.ts:869-881`) emits these fields in event details. But the thesis event may not include all structured fields from the parsed `ThesisOutput` if the LLM output parsing was partial.

### Solution
Ensure all structured thesis fields are included in event details when available. In thesis generation, after parsing:
```typescript
await emitAgentOutput(execContext, 'dialectical_thesis', agent, step.output, {
  lens,
  cycleNumber: state.cycleNumber,
  confidence: thesis.confidence,
  graph: thesis.graph ?? null,
  conceptGraph: thesis.conceptGraph ?? {},
  causalModel: thesis.causalModel ?? [],
  falsificationCriteria: thesis.falsificationCriteria ?? [],
  decisionImplications: thesis.decisionImplications ?? [],
  unitOfAnalysis: thesis.unitOfAnalysis ?? '',
  temporalGrain: thesis.temporalGrain ?? '',
  regimeAssumptions: thesis.regimeAssumptions ?? [],
})
```

### Files to Modify
- `functions/src/agents/langgraph/dialecticalGraph.ts` — thesis event emission (~line 869)

### Acceptance Criteria
- [ ] All ThesisOutputSchema fields included in event details with null/empty defaults
- [ ] Frontend `useDialecticalState` can extract all fields without undefined errors
- [ ] Existing tests pass

---

## Track B Checkpoint

```bash
cd packages/agents && pnpm build && cp -r dist ../functions/vendor/agents/
cd functions && pnpm typecheck && pnpm test
```

---

# PHASE 1, TRACK C: Oracle Pipeline

**Scope:** 18 items across Oracle graph, state, prompts, gates, axiom loader, run executor, and domain types.

**Files owned by this track:** `oracleGraph.ts`, `oracleStateAnnotation.ts`, `oraclePrompts.ts`, `gateEvaluator.ts`, `phaseSummarizer.ts`, `axiomLoader.ts`, `runExecutor.ts`, `executor.ts`, `oracleWorkflow.ts` (only non-type additions), `models.ts` (if needed)

**No overlap** with Track A or B files.

---

## C-1: Fix human-gate resume — wire workflowState into resume path [C1 — CRITICAL]

### Problem
**Pause path** (`runExecutor.ts:464-481`): Persists full Oracle state to Firestore:
```typescript
await runRef.update({
  status: 'waiting_for_input',
  workflowState: sanitizeForFirestore(result.workflowState ?? run.workflowState) ?? null,
  // ...
})
```

**Resume path** (`executor.ts:1589-1591`): Uses `resumeState` if provided:
```typescript
const initialState: Partial<OracleState> = resumeState
  ? { ...freshState, ...resumeState, status: 'running', pendingInput: null, humanGateApproved: true }
  : freshState
```

**But:** `runExecutor.ts` resume dispatch passes `context?.resumeState` which is **never populated**. The Run model stores `workflowState` but no code reads it back and passes it as `resumeState` on resume.

**Result:** Oracle restarts from `freshState` after human approval — duplicating all Phase 1 and Phase 2 work.

### Solution
In `runExecutor.ts`, when resuming an Oracle run:

1. Read `workflowState` from the Run document
2. Pass it as `resumeState` to the executor:
```typescript
// In the resume handler for Oracle:
const run = await getRunDocument(runId)
const resumeState = run.workflowState as Partial<OracleState> | undefined

// Pass to executor:
const result = await executeOracleWorkflowLangGraph(config, goal, {
  ...context,
  resumeState,
})
```

3. In `executor.ts`, verify the resume path correctly merges `resumeState`:
```typescript
const initialState: Partial<OracleState> = resumeState
  ? { ...freshState, ...resumeState, status: 'running', pendingInput: null, humanGateApproved: true }
  : freshState
```

### Files to Modify
- `functions/src/agents/runExecutor.ts` — resume dispatch for Oracle workflow
- `functions/src/agents/langgraph/executor.ts` — verify `resumeState` handling, ensure `executeOracleWorkflowLangGraph` signature accepts it properly

### Acceptance Criteria
- [ ] After human approval, Oracle resumes from persisted state (Phase 3), NOT from scratch
- [ ] Phase 1 and Phase 2 results (scope, claims, trends, uncertainties, crossImpactMatrix) are preserved
- [ ] Cost tracker continues from persisted values (no double-counting)
- [ ] `status` is set to `'running'` and `humanGateApproved` is `true` on resume
- [ ] If `workflowState` is null/missing, falls back to fresh start (backward compatibility)
- [ ] `pnpm typecheck` passes
- [ ] Existing tests pass

---

## C-2: Add human feedback path [C2 — CRITICAL]

### Problem
Human gate prompt (`oracleGraph.ts:908-916`):
```typescript
prompt: `...Approve to proceed to Phase 3 (Scenario Simulation), or provide feedback to refine.`
```

Resume path (`oracleGraph.ts:891-897`):
```typescript
if (state.humanGateApproved) {
  return { status: 'running' as const, pendingInput: null }
}
```

State (`oracleStateAnnotation.ts:90`):
```typescript
humanGateApproved: Annotation<boolean>,  // ← BOOLEAN ONLY, no text field
```

**No field for feedback text. No node consumes feedback. User feedback silently discarded.**

### Solution (Option A — implement feedback):

1. Add field to state (`oracleStateAnnotation.ts`):
```typescript
humanGateFeedback: Annotation<string>({
  reducer: (_cur, upd) => upd,
  default: () => '',
}),
```

2. On resume, pass feedback from Run document:
```typescript
// In executor.ts resume path:
humanGateFeedback: context?.humanGateFeedback as string ?? '',
```

3. In human gate node, include feedback in return so Phase 3 nodes can read it:
```typescript
if (state.humanGateApproved) {
  return {
    status: 'running' as const,
    pendingInput: null,
    // humanGateFeedback already in state from resume
  }
}
```

4. In Phase 3 nodes (scenario_developer, equilibrium_analyst), inject feedback into prompts:
```typescript
const feedbackSection = state.humanGateFeedback
  ? `\n## User Feedback on Phase 2 Output\n${state.humanGateFeedback}\n\nIncorporate this feedback into your analysis.\n`
  : ''
```

### Files to Modify
- `functions/src/agents/langgraph/oracleStateAnnotation.ts` — add `humanGateFeedback` field
- `functions/src/agents/langgraph/oracleGraph.ts` — inject feedback into Phase 3 prompts
- `functions/src/agents/langgraph/executor.ts` — pass feedback on resume
- `functions/src/agents/runExecutor.ts` — read feedback from resume request

### Acceptance Criteria
- [ ] `humanGateFeedback` field exists on OracleState
- [ ] Feedback text passed on resume is available in Phase 3 state
- [ ] Phase 3 prompts include feedback section when feedback is non-empty
- [ ] Empty feedback (approve without comment) still works
- [ ] `pnpm typecheck` passes
- [ ] Existing tests pass

---

## C-3: Implement evidence gathering node [C3 — CRITICAL]

### Problem
`context_gathering` node (`oracleGraph.ts:330-343`) parses a `searchPlan` then discards it:
```typescript
const parsed = safeParseJson<{
  scope: OracleScope
  searchPlan: Record<string, string[]>
}>(step.output)
// searchPlan is parsed but NEVER USED — it's discarded
```

`evidence` reducer (`oracleStateAnnotation.ts:63-66`):
```typescript
evidence: Annotation<OracleEvidence[]>({
  reducer: (current, update) => [...current, ...update],
  default: () => [],
}),
```

**`evidence[]` stays empty throughout the entire Oracle pipeline.** The Oracle claims to be evidence-backed but maintains no actual evidence base.

### Solution (Lightweight — structure search plan as evidence records):

1. In `context_gathering` node, return the search plan in state:
```typescript
return {
  scope, searchPlan: parsed?.searchPlan ?? {},
  // ... existing fields
}
```

2. Add `searchPlan` field to OracleState.

3. Add `evidence_gathering` node after `context_gathering` that converts the search plan into structured evidence records:
```typescript
graph.addNode('evidence_gathering', async (state: OracleState) => {
  const evidence: OracleEvidence[] = []
  for (const [category, queries] of Object.entries(state.searchPlan ?? {})) {
    for (const query of queries) {
      evidence.push({
        id: `EV-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        category,
        query,
        source: 'search_plan',
        reliability: 'unverified',
        timestamp: Date.now(),
        relevantScenarios: [],
      })
    }
  }
  return { evidence }
})
```

4. Wire into graph: `context_gathering` → `evidence_gathering` → `decomposer`

5. Feed evidence IDs into downstream prompts where appropriate.

**Note:** Full evidence gathering with actual web search execution is a separate epic. This fix structures the search plan as evidence records so the pipeline is no longer empty.

### Files to Modify
- `functions/src/agents/langgraph/oracleGraph.ts` — add node, wire edges, update context_gathering return
- `functions/src/agents/langgraph/oracleStateAnnotation.ts` — add `searchPlan` field, apply M12 cap to evidence reducer

### Acceptance Criteria
- [ ] `context_gathering` preserves `searchPlan` in state
- [ ] `evidence_gathering` node populates `evidence[]` from search plan
- [ ] `evidence[]` is non-empty after context gathering phase
- [ ] Evidence records have `id`, `category`, `query`, `source`, `reliability`, `timestamp`
- [ ] Evidence reducer capped at 200 items (use Phase 0's `cappedReducer`)
- [ ] Graph edge wiring: context_gathering → evidence_gathering → decomposer
- [ ] Recursion limit formula updated to account for new node
- [ ] `pnpm typecheck` passes
- [ ] Existing tests pass

---

## C-4: Budget enforcement in all LLM-calling nodes [H3 — HIGH]

### Problem
Gate edges have budget guards (F3), but the actual LLM-calling nodes don't check budget before making expensive calls. Councils, scenario development, red teaming, backcasting all proceed even when budget is exhausted.

Budget check pattern from existing gate edges (`oracleGraph.ts:1431`):
```typescript
if (checkBudgetExceeded(state.costTracker, oracleConfig.maxBudgetUsd)) return 'council_gate_a'
```

`checkBudgetExceeded` helper (`oracleGraph.ts:289-302`):
```typescript
function checkBudgetExceeded(tracker: OracleCostTracker, maxBudgetUsd: number): ConstraintPauseInfo | null {
  if (tracker.total >= maxBudgetUsd) {
    return { constraintType: 'budget', currentValue: tracker.total, limitValue: maxBudgetUsd, unit: 'USD', partialOutput: `...` }
  }
  return null
}
```

### Solution
Add budget check at the top of every node that makes LLM calls:
```typescript
const budgetPause = checkBudgetExceeded(state.costTracker, oracleConfig.maxBudgetUsd)
if (budgetPause) {
  log.warn(`Budget exceeded before ${nodeName}`, { runId: state.runId, spent: state.costTracker.total })
  return { status: 'paused' as const, constraintPause: budgetPause, degradedPhases: [nodeName] }
}
```

Nodes requiring this check: `decomposer`, `scanner`, `weak_signal_scanner`, `cross_impact`, `scenario_developer`, `red_team`, `verifier`, `backcaster`, `equilibrium_analyst`, `council_gate_a`, `council_gate_b`, `council_final`.

### Files to Modify
- `functions/src/agents/langgraph/oracleGraph.ts` — add check to every LLM-calling node

### Acceptance Criteria
- [ ] Every node that makes an LLM call checks budget before proceeding
- [ ] Budget-exceeded nodes return `status: 'paused'` with `constraintPause` info
- [ ] The phase name is added to `degradedPhases` when budget-paused
- [ ] Nodes that don't make LLM calls (routing, state management) don't need checks
- [ ] Existing tests pass

---

## C-5: Gate escalation semantics [H4 — HIGH]

### Problem
Gate conditional edges (`oracleGraph.ts:1431-1485`): After refinement exhaustion, graph proceeds without consequence:
```typescript
if (state.currentGateRefinements < oracleConfig.maxRefinementsPerGate) return 'decomposer'
// Max refinements reached — pass anyway (no escalation)
return 'council_gate_a'
```

### Solution
1. Add escalation fields to state:
```typescript
// In oracleStateAnnotation.ts:
gateEscalated: Annotation<boolean>({
  reducer: (_cur, upd) => _cur || upd,  // Once true, stays true
  default: () => false,
}),
gateEscalationFeedback: Annotation<string[]>({
  reducer: (cur, upd) => [...cur, ...upd],
  default: () => [],
}),
```

2. When refinements exhaust:
```typescript
// In gate edge function:
if (state.currentGateRefinements >= oracleConfig.maxRefinementsPerGate) {
  log.warn(`Gate ${gateName} exhausted refinements — escalating`, { runId: state.runId })
  // Return to council with escalation flag
  return 'council_gate_a'  // council node will see escalation
}
```

3. In council nodes, when gate failed but refinements exhausted, set escalation:
```typescript
return {
  gateEscalated: true,
  gateEscalationFeedback: [lastGateResult.feedback],
  // ... existing fields
}
```

4. In final output generation, reduce overall confidence when `gateEscalated`:
```typescript
if (state.gateEscalated) {
  // Append warning to final output
  finalOutput += '\n\n⚠️ Quality gate(s) could not be fully satisfied within refinement budget. Results may have lower confidence.'
}
```

### Files to Modify
- `functions/src/agents/langgraph/oracleStateAnnotation.ts` — add `gateEscalated`, `gateEscalationFeedback`
- `functions/src/agents/langgraph/oracleGraph.ts` — gate edges, council nodes, final output

### Acceptance Criteria
- [ ] `gateEscalated` is true when any gate exhausts refinements
- [ ] Escalation feedback from failed gate is preserved in state
- [ ] Final output includes warning when any gate escalated
- [ ] Once `gateEscalated` is true, it stays true (reducer uses `||`)
- [ ] `pnpm typecheck` passes
- [ ] Existing tests pass

---

## C-6: Token accounting — include stage 2 [M2 — MEDIUM]

### Problem
`oracleGraph.ts:250-251`:
```typescript
const totalTokens = turn.stage1.responses.reduce((sum, r) => sum + (r.tokensUsed ?? 0), 0)
  + (turn.stage3.tokensUsed ?? 0)
// Stage 2 (judge reviews) NOT counted
```

### Solution
```typescript
const totalTokens = turn.stage1.responses.reduce((sum, r) => sum + (r.tokensUsed ?? 0), 0)
  + (turn.stage2?.tokensUsed ?? 0)
  + (turn.stage3.tokensUsed ?? 0)
```

### Files to Modify
- `functions/src/agents/langgraph/oracleGraph.ts` — line 250

### Acceptance Criteria
- [ ] Stage 2 tokens included in council token sum
- [ ] `pnpm typecheck` passes
- [ ] Existing tests pass

---

## C-7: Weak signal STEEP+V mapping [M8 — MEDIUM]

### Problem
`oracleGraph.ts:729-747` — hardcoded 5-entry map:
```typescript
const categoryToSteep: Record<string, TrendObject['steepCategory']> = {
  technological: 'technological', economic: 'economic',
  environmental: 'environmental', political: 'political', social: 'social',
}
// Unmapped → 'values' fallback (no logging)
```

LLM may output "tech", "socio-political", "ecological" etc. All fall through silently to `'values'`.

### Solution
Use substring matching and log fallback:
```typescript
function mapToSteep(raw: string): TrendObject['steepCategory'] {
  const lower = raw.toLowerCase()
  if (lower.includes('tech')) return 'technological'
  if (lower.includes('econ')) return 'economic'
  if (lower.includes('environ') || lower.includes('ecolog') || lower.includes('climate')) return 'environmental'
  if (lower.includes('politic') || lower.includes('regulat') || lower.includes('govern')) return 'political'
  if (lower.includes('social') || lower.includes('societ') || lower.includes('demograph')) return 'social'
  log.debug('Weak signal category unmapped, defaulting to values', { raw })
  return 'values'
}
```

### Files to Modify
- `functions/src/agents/langgraph/oracleGraph.ts` — lines 729-747

### Acceptance Criteria
- [ ] "tech", "technological", "technology" all map to `'technological'`
- [ ] Unmapped categories log a debug message
- [ ] Default fallback still `'values'`
- [ ] Existing tests pass

---

## C-8: Track degraded phases in Oracle [M10 usage — MEDIUM]

### Problem
Oracle has various fallback returns that continue silently.

### Solution
In each catch/fallback block, append to `degradedPhases`:
```typescript
degradedPhases: ['node_name_that_failed'],
```

Include in final output metadata.

### Files to Modify
- `functions/src/agents/langgraph/oracleGraph.ts` — all fallback/error paths

### Acceptance Criteria
- [ ] Each fallback path appends its node name to `degradedPhases`
- [ ] Final output metadata includes `degradedPhases`
- [ ] Existing tests pass

---

## C-9: Cost tracking boilerplate refactor [L18 — LOW]

### Problem
24 instances of:
```typescript
costTracker: updateCostTracker(state.costTracker, step, 0, 'llm'),
```

`updateCostTracker` signature (`oracleGraph.ts:148-171`):
```typescript
function updateCostTracker(
  tracker: OracleCostTracker, step: AgentExecutionStep,
  phase: number, component: 'llm' | 'search' | 'council' | 'evaluation',
): OracleCostTracker
```

### Solution
Extract helper:
```typescript
function trackCost(
  state: OracleState, phase: number, component: 'llm' | 'search' | 'council' | 'evaluation',
  step: AgentExecutionStep
): { costTracker: OracleCostTracker } {
  return { costTracker: updateCostTracker(state.costTracker, step, phase, component) }
}
```

Replace all 24 callsites.

### Files to Modify
- `functions/src/agents/langgraph/oracleGraph.ts` — extract helper, update 24 callsites

### Acceptance Criteria
- [ ] Helper function extracted
- [ ] All 24 callsites updated
- [ ] No behavioral change
- [ ] Existing tests pass

---

## C-10: Axiom loader path resolution [L19 — LOW]

### Problem
`axiomLoader.ts:170`:
```typescript
return resolve(currentDir, '..', '..', '..', '..', 'docs', 'Oracle', filename)
```
Hardcoded 4-level traversal. Breaks if project structure changes or in Cloud Functions deployment.

### Solution
```typescript
const basePath = process.env.AXIOM_BASE_PATH ?? resolve(currentDir, '..', '..', '..', '..', 'docs', 'Oracle')
return resolve(basePath, filename)
```

### Files to Modify
- `functions/src/agents/oracle/axiomLoader.ts` — line 170

### Acceptance Criteria
- [ ] `AXIOM_BASE_PATH` env var overrides default path
- [ ] Default path unchanged when env var not set
- [ ] Existing tests pass

---

## C-11: Axiom loader schema validation [L20 — LOW]

### Problem
`axiomLoader.ts:173-290` — `JSON.parse()` with type assertion, no validation:
```typescript
const raw: RawCookbook = JSON.parse(readFileSync(cookbookPath, 'utf-8'))
```

### Solution
Add Zod schemas and validate:
```typescript
const CookbookSchema = z.object({
  recipes: z.array(z.object({
    id: z.string(),
    name: z.string(),
    category: z.string(),
    // ... all required fields
  })),
  techniques: z.array(z.object({
    id: z.string(),
    name: z.string(),
    // ...
  })),
})

const parsed = CookbookSchema.parse(JSON.parse(readFileSync(cookbookPath, 'utf-8')))
```

### Files to Modify
- `functions/src/agents/oracle/axiomLoader.ts` — add schemas, validate on load

### Acceptance Criteria
- [ ] Cookbook and axiom library JSON validated against Zod schemas on load
- [ ] Corrupted/incomplete files produce clear error messages
- [ ] Valid files load without change in behavior
- [ ] Existing tests pass

---

## C-12: Recipe ordering determinism [L21 — LOW]

### Problem
`axiomLoader.ts:337` — `getRecipesForAgent()` returns Map insertion-order. `allRecipes.slice(0, 3)` without sort.

### Solution
```typescript
return agentRecipes
  .sort((a, b) => a.id.localeCompare(b.id))
  .filter((r) => !phase || r.oraclePhases.includes(phase))
```

### Files to Modify
- `functions/src/agents/oracle/axiomLoader.ts` — `getRecipesForAgent` function

### Acceptance Criteria
- [ ] Recipes always returned in deterministic order (sorted by ID)
- [ ] Same inputs → same recipes regardless of JSON file ordering
- [ ] Existing tests pass

---

## C-13: depthMode affects recipe selection [L22 — LOW]

### Problem
`oraclePrompts.ts:25-50` — `buildCookbookContext` always takes top 3 recipes. `depthMode` adjusts sub-question counts but never recipe selection.

### Solution
```typescript
function buildCookbookContext(agentRole: string, phase?: string, depthMode?: OracleDepthMode): string {
  const allRecipes = getRecipesForAgent(agentRole, phase)
  const maxRecipes = depthMode === 'deep' ? 5 : depthMode === 'quick' ? 2 : 3
  const recipes = allRecipes.slice(0, maxRecipes)
  // ...
}
```

Update all callsites to pass `depthMode`.

### Files to Modify
- `functions/src/agents/oracle/oraclePrompts.ts` — `buildCookbookContext` signature, all callers

### Acceptance Criteria
- [ ] `quick` mode: 2 recipes
- [ ] `standard` mode: 3 recipes
- [ ] `deep` mode: 5 recipes
- [ ] Existing tests pass

---

## C-14: Gate cliff behavior [L24 — LOW]

### Problem
`gateEvaluator.ts:95-104` — any dimension < 3.0 fails the gate, even if average is high:
```typescript
function allAboveMinimum(scores: OracleRubricScores, minimum: number): boolean {
  return scores.mechanisticClarity >= minimum && scores.completeness >= minimum && ...
}
// passed = allAbove3 && avg >= 3.5
```

### Solution
Replace cliff with floor + weighted average:
```typescript
const hasFloorViolation = Object.values(scores).some(s => s < 2.0)
const passed = !hasFloorViolation && avg >= 3.5
```

Any dimension < 2.0 is a hard fail. Otherwise, average >= 3.5 passes.

### Files to Modify
- `functions/src/agents/oracle/gateEvaluator.ts` — lines 95-119

### Acceptance Criteria
- [ ] Dimension at 2.5 with high average no longer fails the gate
- [ ] Dimension below 2.0 always fails the gate
- [ ] Average threshold remains 3.5
- [ ] Gate-specific overrides (axiom grounding, decision usefulness) unchanged
- [ ] Existing tests pass (update threshold expectations)

---

## C-15: Phase summaries reference gate results [L25 — LOW]

### Problem
`phaseSummarizer.ts:27` — summarizer takes only phase name:
```typescript
export function buildPhaseSummarizerPrompt(phase: OraclePhase): string
```

### Solution
```typescript
export function buildPhaseSummarizerPrompt(phase: OraclePhase, gateResult?: OracleGateResult): string {
  let prompt = /* existing prompt */
  if (gateResult) {
    prompt += `\n## Gate Evaluation Results\nPassed: ${gateResult.passed}\nFeedback: ${gateResult.feedback}\nScores: ${JSON.stringify(gateResult.scores)}\n\nAddress any gate feedback in your summary.`
  }
  return prompt
}
```

Update callsites to pass latest gate result.

### Files to Modify
- `functions/src/agents/oracle/phaseSummarizer.ts` — signature and prompt
- `functions/src/agents/langgraph/oracleGraph.ts` — callsites

### Acceptance Criteria
- [ ] Summarizer includes gate feedback when available
- [ ] Summaries address gate-flagged issues
- [ ] No gate result → no gate section in prompt (backward compatible)
- [ ] Existing tests pass

---

## C-16: Equilibrium analyst caching [L26 — LOW]

### Problem
`oracleGraph.ts:1032-1100` — on refinement loops, equilibrium analyst regenerates all scenario skeletons with identical inputs. 3 refinement attempts = 3 redundant LLM calls.

### Solution
Cache skeleton generation keyed on uncertainties + cross-impact hash:
```typescript
const inputHash = hashObject({ uncertainties: state.uncertainties, crossImpact: state.crossImpactMatrix })
if (state._skeletonCache?.hash === inputHash) {
  return { scenarioPortfolio: state._skeletonCache.portfolio }
}
// ... generate skeletons ...
return {
  scenarioPortfolio: portfolio,
  _skeletonCache: { hash: inputHash, portfolio },
}
```

### Files to Modify
- `functions/src/agents/langgraph/oracleGraph.ts` — equilibrium analyst node
- `functions/src/agents/langgraph/oracleStateAnnotation.ts` — add `_skeletonCache` field

### Acceptance Criteria
- [ ] Identical inputs → cached result returned without LLM call
- [ ] Changed inputs → new generation
- [ ] Cache field is internal (prefixed with `_`)
- [ ] Existing tests pass

---

## C-17: Recursion limit documentation [L27 — LOW]

### Problem
`oracleGraph.ts:1599-1601`:
```typescript
const maxRef = config.oracleConfig.maxRefinementsPerGate
const recursionLimit = 22 + (maxRef * (4 + 4 + 3)) + 10
```
Undocumented formula. Adding C-3's `evidence_gathering` node changes the base count.

### Solution
```typescript
// Base nodes: context_gathering(1) + evidence_gathering(1) + decomposer(1) + gate_a(1) + council_a(1)
//           + scanner(1) + weak_signals(1) + cross_impact(1) + gate_b(1) + council_b(1)
//           + human_gate(1) + consistency(1) + equilibrium(1) + scenario_dev(1) + red_team(1)
//           + verifier(1) + gate_c(1) + council_final(1) + backcaster(1) + final_output(1)
// = 20 base nodes (was 22, some nodes combined)
// Refinement loops: Gate A refines decomposer (4 nodes), Gate B refines scanner chain (4 nodes),
//                   Gate C refines scenario chain (3 nodes) = 11 nodes per refinement
// Safety margin: 10
const baseNodes = 23  // Update after adding evidence_gathering
const nodesPerRefinement = 11
const safetyMargin = 10
const recursionLimit = baseNodes + (maxRef * nodesPerRefinement) + safetyMargin
```

### Files to Modify
- `functions/src/agents/langgraph/oracleGraph.ts` — lines 1599-1601

### Acceptance Criteria
- [ ] Formula documented with node-by-node breakdown
- [ ] Updated to account for `evidence_gathering` node (C-3)
- [ ] Named constants instead of magic numbers
- [ ] Existing tests pass

---

## Track C Checkpoint

```bash
cd packages/agents && pnpm build && cp -r dist ../functions/vendor/agents/
cd functions && pnpm typecheck && pnpm test
```

---

# PHASE 2: Integration Testing & Cross-Cutting Verification

**Goal:** Add targeted tests for previously untested bugs. Verify cross-workflow consistency.

**Prerequisite:** All Phase 1 tracks complete and passing independently.

## Test Matrix

| # | Test Description | Workflow | Validates |
|---|-----------------|----------|-----------|
| T1 | Pause Oracle at human gate → read workflowState → resume → verify Phase 1+2 state preserved | Oracle | C1 |
| T2 | Resume Oracle with feedback text → verify feedback appears in Phase 3 prompts | Oracle | C2 |
| T3 | Run context_gathering → verify evidence[] is non-empty | Oracle | C3 |
| T4 | Run thesis gen → build agentClaimMapping → run trackers → verify KG claim IDs in participatingClaims | Dialectical | C4 |
| T5 | Run dialectical synthesis → verify kgDiff applied to sharedKg before answer generation | Deep Research | H1 |
| T6 | Add normal claim + duplicate claim → verify both sourced_from edges point to real source nodes | Deep Research | H2 |
| T7 | Set budget to $0.001 → run Oracle → verify early pause with constraintPause | Oracle | H3 |
| T8 | Exhaust gate refinements → verify gateEscalated=true and feedback preserved | Oracle | H4 |
| T9 | Call graph creation function twice with same config → verify config not mutated | Dialectical | M3 |
| T10 | Seed context claims → verify claimsProcessedCount advanced → kg_construction skips seeded claims | Deep Research | M1 |
| T11 | Run Expert Council → verify stage 2 tokens included in total | Oracle | M2 |

## Cross-Cutting Checks

| # | Check | Method |
|---|-------|--------|
| X1 | `degradedPhases` populated in at least one fallback path per workflow | Grep for `degradedPhases:` in fallback catch blocks |
| X2 | Reducer caps enforced: sources(100), claims(200), evidence(200), cycleMetrics(20) | Unit test each reducer with oversized input |
| X3 | `safeParseJsonWithSchema` imported from shared module (no local copies) | Grep for `function safeParseJson` — should only exist in shared module |
| X4 | No hardcoded model names in budget estimation | Grep for `'gpt-5-mini'` and `'claude-opus'` — should be zero matches |

## Phase 2 Checkpoint

```bash
cd packages/agents && pnpm build && cp -r dist ../functions/vendor/agents/
pnpm typecheck
cd packages/agents && pnpm test
cd functions && pnpm test
```

Full code review of ALL Phase 1 + Phase 2 changes. Verify no regressions across 707+ function tests and 155 package tests.

---
---

# AGENT PROMPTS

The following prompts are self-contained instructions for AI agents. Each prompt includes all context needed to implement the assigned work without reading the full spec above. Copy-paste the relevant prompt to launch each agent.

---

## AGENT PROMPT: Phase 0 — Foundation & Shared Infrastructure

```
You are implementing Phase 0 of a major refactor across three AI workflow systems.
Your job is to create shared utilities and state infrastructure that three parallel
implementation tracks will depend on. You must complete ALL 5 items before the
parallel tracks can begin.

## Repository Structure
- packages/agents/src/domain/ — Domain types (shared)
- functions/src/agents/ — Backend implementations
  - langgraph/stateAnnotations.ts — State types for Deep Research & Dialectical
  - langgraph/oracleStateAnnotation.ts — State types for Oracle
  - shared/ — Shared utilities (you'll create files here)
- Build: cd packages/agents && pnpm build && cp -r dist ../functions/vendor/agents/
- Typecheck: pnpm typecheck
- Test: cd packages/agents && pnpm test && cd ../functions && pnpm test

## IMPORTANT CONSTRAINTS
- Do NOT modify any workflow graph files (deepResearchGraph.ts, dialecticalGraph.ts, oracleGraph.ts)
- Do NOT modify any test files
- Only create/modify the files listed below
- After ALL items, run the full build+typecheck+test sequence and fix any failures

## ITEM 0.1: Extract shared safeParseJsonWithSchema helper

### Problem
Three independent safeParseJson implementations exist:
1. claimExtraction.ts:492 — brace-counting approach
2. oracleGraph.ts:173 — regex-first approach
3. sourceQuality.ts — similar to #1
None validate against a schema. Bad shapes pass through silently.

### What to do
Create functions/src/agents/shared/jsonParser.ts:

```typescript
import { type ZodType, type ZodError } from 'zod'
import * as log from '../../logger.js'  // adjust import path

export interface ParseResult<T> {
  data: T
  validationErrors?: ZodError
}

/**
 * Parse JSON from LLM output text with Zod schema validation.
 * Handles markdown fences, preamble text, nested objects.
 */
export function safeParseJsonWithSchema<T>(
  text: string,
  schema: ZodType<T>,
  fallback: T,
  context?: string
): ParseResult<T> {
  const raw = extractJson(text)
  if (raw === null) {
    log.warn('safeParseJsonWithSchema: no JSON found', { context, textLength: text.length })
    return { data: fallback }
  }
  const result = schema.safeParse(raw)
  if (!result.success) {
    log.warn('safeParseJsonWithSchema: schema validation failed', {
      context,
      errors: result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`),
    })
    return { data: fallback, validationErrors: result.error }
  }
  return { data: result.data }
}

/**
 * Backward-compatible wrapper. No schema validation.
 */
export function safeParseJson<T>(text: string): T | null {
  const raw = extractJson(text)
  return raw as T | null
}

function extractJson(text: string): unknown | null {
  // 1. Strip markdown fences
  let cleaned = text.replace(/```(?:json)?\s*([\s\S]*?)```/g, '$1').trim()

  // 2. Try regex extraction (object)
  const objMatch = cleaned.match(/\{[\s\S]*\}/)
  if (objMatch) {
    try { return JSON.parse(objMatch[0]) } catch {}
  }

  // 3. Try regex extraction (array)
  const arrMatch = cleaned.match(/\[[\s\S]*\]/)
  if (arrMatch) {
    try { return JSON.parse(arrMatch[0]) } catch {}
  }

  // 4. Try brace counting for nested objects
  const start = cleaned.indexOf('{')
  if (start >= 0) {
    let depth = 0
    for (let i = start; i < cleaned.length; i++) {
      if (cleaned[i] === '{') depth++
      else if (cleaned[i] === '}') depth--
      if (depth === 0) {
        try { return JSON.parse(cleaned.slice(start, i + 1)) } catch { break }
      }
    }
  }

  return null
}
```

Then update these three files to import from the shared module:

1. oracleGraph.ts: Replace the local safeParseJson function (lines 173-193) with:
   import { safeParseJson } from '../shared/jsonParser.js'
   Delete the local function definition.

2. claimExtraction.ts: Replace the local safeParseJson function (lines 492-522) with:
   import { safeParseJson } from '../shared/jsonParser.js'
   Delete the local function definition.

3. sourceQuality.ts: Find and replace its local safeParseJson with the import.
   import { safeParseJson } from '../shared/jsonParser.js'

### Acceptance criteria
- safeParseJsonWithSchema extracts JSON from text with markdown fences
- safeParseJsonWithSchema validates against Zod schema and returns fallback on failure
- safeParseJson (backward compat) works identically to existing implementations
- All three callsites updated to import from shared module
- No local safeParseJson function definitions remain in the three files
- pnpm typecheck passes
- All existing tests pass

## ITEM 0.2: Add degradedPhases field to all workflow state annotations

### Problem
All three workflows have error/fallback paths that continue silently. No mechanism
tracks which phases degraded.

### What to do
Add to functions/src/agents/langgraph/stateAnnotations.ts:

In the DeepResearchStateAnnotation (around line 510), add:
```typescript
degradedPhases: Annotation<string[]>({
  reducer: (current, update) => [...current, ...update],
  default: () => [],
}),
```

In the DialecticalStateAnnotation (around line 350), add the same field.

Add to functions/src/agents/langgraph/oracleStateAnnotation.ts (around line 140):
Same field definition.

### Acceptance criteria
- degradedPhases exists on DeepResearchState, DialecticalState, and OracleState
- Reducer is additive (appends)
- Default is empty array
- pnpm typecheck passes
- All existing tests pass (field has no effect until populated)

## ITEM 0.3: Clone config before quick-mode mutation

### Problem
dialecticalGraph.ts:1887-1891 mutates caller-owned objects:
```typescript
if (isQuickMode) {
  dialecticalConfig.maxCycles = 1      // MUTATES INPUT
  thesisAgents.splice(2)               // MUTATES INPUT
}
```

### What to do
In functions/src/agents/langgraph/dialecticalGraph.ts, find the quick mode block
(search for "dialecticalConfig.maxCycles = 1"). Replace with:

```typescript
const isQuickMode = dialecticalConfig.mode === 'quick'
const cfg = { ...dialecticalConfig }
const agents = [...thesisAgents]
if (isQuickMode) {
  cfg.maxCycles = 1
  agents.splice(2)
  log.info('Quick dialectic mode: 1 cycle, 2 lenses, no KG')
}
```

Then update ALL downstream references in the same function to use `cfg` instead of
`dialecticalConfig` and `agents` instead of `thesisAgents`. Search carefully — there
may be 5-10 references to each.

### Acceptance criteria
- Original dialecticalConfig object is never mutated
- Original thesisAgents array is never mutated
- Quick mode still limits to 1 cycle, max 2 agents
- pnpm typecheck passes
- All existing tests pass

## ITEM 0.4: OraclePhase const array

### Problem
packages/agents/src/domain/oracleWorkflow.ts:16-20 defines OraclePhase as a union type
that can't be iterated at runtime.

### What to do
In packages/agents/src/domain/oracleWorkflow.ts, replace:
```typescript
export type OraclePhase =
  | 'context_gathering'
  | 'decomposition'
  | 'trend_scanning'
  | 'scenario_simulation'
```

With:
```typescript
export const ORACLE_PHASES = [
  'context_gathering',
  'decomposition',
  'trend_scanning',
  'scenario_simulation',
] as const

export type OraclePhase = typeof ORACLE_PHASES[number]
```

Ensure ORACLE_PHASES is also exported from the package's index.ts if OraclePhase is.

### Acceptance criteria
- ORACLE_PHASES exported as const array
- OraclePhase type derived from array
- All existing imports of OraclePhase continue to work
- packages/agents build succeeds
- pnpm typecheck passes
- All tests pass

## ITEM 0.5: Reusable capped reducer helper

### Problem
Multiple state reducers need size caps. Currently only graphHistory has one (inline).

### What to do
Create functions/src/agents/shared/reducerUtils.ts:

```typescript
/**
 * Creates a LangGraph-compatible additive reducer with a size cap.
 * When merged array exceeds maxSize, keeps the last maxSize items (FIFO eviction)
 * unless a custom evictionFn is provided.
 */
export function cappedReducer<T>(
  maxSize: number,
  evictionFn?: (items: T[]) => T[]
): (current: T[], update: T[]) => T[] {
  return (current: T[], update: T[]) => {
    const merged = [...current, ...update]
    if (merged.length <= maxSize) return merged
    return evictionFn ? evictionFn(merged).slice(0, maxSize) : merged.slice(-maxSize)
  }
}
```

### Acceptance criteria
- cappedReducer(20) keeps last 20 items from merged array
- cappedReducer(100, fn) applies custom eviction then caps at 100
- Function signature matches LangGraph Annotation reducer type
- pnpm typecheck passes

## FINAL VERIFICATION

After all 5 items:
```bash
cd packages/agents && pnpm build
cp -r packages/agents/dist functions/vendor/agents/
pnpm typecheck
cd packages/agents && pnpm test
cd functions && pnpm test
```

ALL tests must pass. If any fail, fix the issue before declaring Phase 0 complete.
Report what you changed and the test results.
```

---

## AGENT PROMPT: Track A — Deep Research Pipeline

```
You are implementing Track A of a major refactor — the Deep Research pipeline.
This track runs IN PARALLEL with Track B (Dialectical) and Track C (Oracle).
You must NOT modify files owned by those tracks.

Phase 0 (Foundation) has already been completed. You can use:
- functions/src/agents/shared/jsonParser.ts — safeParseJsonWithSchema, safeParseJson
- functions/src/agents/shared/reducerUtils.ts — cappedReducer
- degradedPhases field already exists on DeepResearchState

## YOUR FILES (only modify these)
- functions/src/agents/langgraph/deepResearchGraph.ts
- functions/src/agents/knowledgeHypergraph.ts
- functions/src/agents/deepResearch/claimExtraction.ts
- functions/src/agents/deepResearch/sourceIngestion.ts
- functions/src/agents/deepResearch/answerGeneration.ts
- functions/src/agents/deepResearch/kgSerializer.ts
- functions/src/agents/deepResearch/kgEnrichment.ts
- functions/src/agents/deepResearch/contextProcessor.ts
- functions/src/agents/kgTools.ts
- functions/src/agents/deepResearch/sourceQuality.ts
- functions/src/agents/langgraph/stateAnnotations.ts (ONLY Deep Research reducers, lines 386-538)

## DO NOT MODIFY
- dialecticalGraph.ts, contradictionTrackers.ts, sublationEngine.ts, metaReflection.ts
- oracleGraph.ts, oracleStateAnnotation.ts, oraclePrompts.ts, gateEvaluator.ts
- Any file in oracle/ directory
- stateAnnotations.ts lines 232-357 (Dialectical reducers — Track B owns these)

## Build & Test
cd packages/agents && pnpm build && cp -r dist ../functions/vendor/agents/
cd functions && pnpm typecheck && pnpm test

## ITEMS — Implement in this order (critical path first)

### A1: Apply synthesis KG diffs to sharedKg [HIGH]
In deepResearchGraph.ts answer_generation node (~line 1764), BEFORE calling generateAnswer:
1. Read state.kgDiff (the KGDiff from dialectical synthesis)
2. For each newClaims entry in kgDiff: call sharedKg.addClaim() with the claim data
3. For each supersededClaims entry: if sharedKg has a method to expire/deactivate claims, use it
4. Pass the updated sharedKg to generateAnswer

The current code:
```typescript
const kg = sharedKg  // ← STALE — never updated with synthesis
const { answer } = await generateAnswer(kg, state.goal, ...)
```

After your fix:
```typescript
// Apply synthesis diffs to KG
if (state.kgDiff) {
  for (const claim of state.kgDiff.newClaims ?? []) {
    sharedKg.addClaim({ text: claim.text, normalizedText: claim.text.toLowerCase().trim(), ... })
  }
  // Handle superseded claims if possible
}
const kg = sharedKg  // Now includes synthesis results
const { answer } = await generateAnswer(kg, state.goal, ...)
```

Acceptance: buildDetailedKGSummary output includes synthesis-generated claims.

### A2: Unify sourced_from edge format [HIGH]
In claimExtraction.ts:230, the source episode ID is:
```typescript
sourceEpisodeId: `episode:source:${claim.sourceId}` as EpisodeId
```
This creates IDs like "episode:source:src_abc123" which don't match real source nodes.

In knowledgeHypergraph.ts, both new claims (~line 508) and duplicate claims (~line 476)
create sourced_from edges pointing to whatever sourceEpisodeId is.

Fix: In claimExtraction.ts, use the actual source ID format that matches KG source nodes.
If sources are added as nodes with IDs like "src_abc123", then use that directly:
```typescript
sourceEpisodeId: claim.sourceId as EpisodeId
```

Verify: After fix, sourced_from edges should point to existing source node IDs.

### A3: Fix double-seeding claims [MEDIUM]
In deepResearchGraph.ts context_seeding node (~line 778), the return includes
extractedClaims but NOT claimsProcessedCount:
```typescript
return {
  extractedClaims: contextClaims,
  // claimsProcessedCount NOT set → stays 0
}
```

Later, kg_construction (~line 988) does:
```typescript
const alreadyProcessed = state.claimsProcessedCount ?? 0
const newClaims = state.extractedClaims.slice(alreadyProcessed)  // Reprocesses all
```

Fix: Add to context_seeding return:
```typescript
claimsProcessedCount: contextClaims.length,
```

### A4: Fix counterclaim event type [MEDIUM]
In deepResearchGraph.ts:1822-1826, change:
```typescript
await emitPhaseEvent(execContext, 'answer_generation', {
  phase: 'counterclaim_search', ...
})
```
To:
```typescript
await emitPhaseEvent(execContext, 'counterclaim_search', { ... })
```

### A5: Budget model assumptions [MEDIUM]
In claimExtraction.ts:112 and :449, gapAnalysis.ts:98, answerGeneration.ts:188:
Replace hardcoded model names ('gpt-5-mini', 'claude-opus') in estimateLLMCost calls
with the actual model from execution context. If not available, use a generic fallback
and log.debug noting it.

### A6: Log dropped KG node types [MEDIUM]
In kgSerializer.ts after line 34, add:
```typescript
// Log what's being dropped
const allTypes = new Set(kg.getAllNodes().map(n => n.type))
const dropped = [...allTypes].filter(t => !COMPACT_NODE_TYPES.has(t))
if (dropped.length > 0) {
  log.debug('KG serialization: filtered non-compact types', { dropped })
}
```

### A7: Cap sources and extractedClaims [MEDIUM]
In stateAnnotations.ts (Deep Research section, ~lines 407-414):
```typescript
import { cappedReducer } from '../shared/reducerUtils.js'

sources: Annotation<SourceRecord[]>({
  reducer: cappedReducer(100),
  default: () => [],
}),
extractedClaims: Annotation<ExtractedClaim[]>({
  reducer: cappedReducer(200),
  default: () => [],
}),
```

### A8: Track degraded phases [MEDIUM]
In deepResearchGraph.ts, in each catch/fallback block:

Line 649 (sense_making fallback) — add to return:
  degradedPhases: ['sense_making'],

Line 1282 (contradiction fallback) — add to return:
  degradedPhases: ['contradiction_detection'],

Line 1459 (synthesis fallback) — add to return:
  degradedPhases: ['sublation'],

In the answer generation output, include state.degradedPhases in the metadata.

### A9: KG expired node pruning [LOW]
Add to knowledgeHypergraph.ts:
```typescript
pruneExpiredNodes(beforeTimestamp?: number): { prunedCount: number } {
  const cutoff = beforeTimestamp ?? Date.now()
  let prunedCount = 0
  for (const node of this.getAllNodes()) {
    const temporal = (node.data as any)?.temporal
    if (temporal?.tExpired && temporal.tExpired < cutoff) {
      this.removeNode(node.id)
      prunedCount++
    }
  }
  return { prunedCount }
}
```

### A10: Chunking max count [LOW]
In sourceIngestion.ts, at the end of chunkDocument function:
```typescript
return chunks.slice(0, 50)  // Safety cap: max 50 chunks per document
```

### A11: Parallelize relevance scoring [LOW]
In sourceIngestion.ts:231-237, replace the sequential loop:
```typescript
// Before (sequential):
for (const result of searchResults) {
  const relevance = await scoreRelevanceFn(result.snippet, query)
  scored.push({ ...result, relevance })
}

// After (parallel):
const candidates = searchResults.slice(0, maxSources * 2)
const results = await Promise.all(
  candidates.map(async (result) => ({
    ...result,
    relevance: await scoreRelevanceFn(result.snippet, query),
  }))
)
scored.push(...results)
```

### A12: capGraphForPrompt orphan cleanup [LOW]
In kgSerializer.ts, after the edge pruning loop (~line 173) and before node pruning,
add orphan detection:
```typescript
const connectedIds = new Set<string>()
for (const e of g.edges) { connectedIds.add(e.from); connectedIds.add(e.to) }
g.nodes = g.nodes.filter(n =>
  connectedIds.has(n.id) || n.type === 'prediction' || contradictsNodeIds.has(n.id)
)
```

### A13: HTML stripping [LOW + SECURITY]
In contextProcessor.ts, in the stripHtml function, add BEFORE the generic tag strip:
```typescript
.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
.replace(/<!--[\s\S]*?-->/g, '')
```

### A14: Attribution bounds logging [LOW]
In claimExtraction.ts:388-395, add warning when clamping:
```typescript
const rawIdx = (Number(c.sourceIndex) || 1) - 1
const idx = Math.max(0, Math.min(sources.length - 1, rawIdx))
if (rawIdx !== idx) {
  log.warn('Claim attribution index clamped', { rawIndex: c.sourceIndex, clampedTo: idx, sourceCount: sources.length })
}
```

### A15: KG Tools max cap [LOW + SECURITY]
In kgTools.ts:70, change:
```typescript
const limit = (params.limit as number | undefined) ?? 20
```
To:
```typescript
const limit = Math.min((params.limit as number | undefined) ?? 20, 100)
```

### A16: Prompt injection hygiene [LOW + SECURITY]
In claimExtraction.ts, find all places where user input (query, goal) is interpolated
into prompt strings. Apply consistent sanitization:
```typescript
function sanitizeForPrompt(input: string, maxLength = 500): string {
  return input.replace(/[{}\\"<>]/g, ' ').substring(0, maxLength).trim()
}
```
sourceQuality.ts already has partial sanitization — verify it's complete.

## FINAL VERIFICATION
```bash
cd packages/agents && pnpm build && cp -r dist ../functions/vendor/agents/
cd functions && pnpm typecheck && pnpm test
```
All tests must pass. Report changes and results.
```

---

## AGENT PROMPT: Track C — Oracle Pipeline

```
You are implementing Track C of a major refactor — the Oracle pipeline.
This track runs IN PARALLEL with Track A (Deep Research) and Track B (Dialectical).
You must NOT modify files owned by those tracks.

Phase 0 (Foundation) has already been completed. You can use:
- functions/src/agents/shared/jsonParser.ts — safeParseJsonWithSchema, safeParseJson
- functions/src/agents/shared/reducerUtils.ts — cappedReducer
- degradedPhases field already exists on OracleState
- OraclePhase is now a const array (ORACLE_PHASES) in oracleWorkflow.ts

## YOUR FILES (only modify these)
- functions/src/agents/langgraph/oracleGraph.ts
- functions/src/agents/langgraph/oracleStateAnnotation.ts
- functions/src/agents/oracle/oraclePrompts.ts
- functions/src/agents/oracle/gateEvaluator.ts
- functions/src/agents/oracle/phaseSummarizer.ts
- functions/src/agents/oracle/axiomLoader.ts
- functions/src/agents/runExecutor.ts
- functions/src/agents/langgraph/executor.ts
- packages/agents/src/domain/oracleWorkflow.ts (non-type additions only)
- packages/agents/src/domain/models.ts (if needed for Run type)

## DO NOT MODIFY
- deepResearchGraph.ts, knowledgeHypergraph.ts, claimExtraction.ts
- dialecticalGraph.ts, contradictionTrackers.ts, sublationEngine.ts
- stateAnnotations.ts (owned by Track A and B)

## Build & Test
cd packages/agents && pnpm build && cp -r dist ../functions/vendor/agents/
cd functions && pnpm typecheck && pnpm test

## ITEMS — Implement in this order (critical path first)

### C-1: Fix human-gate resume [CRITICAL]

#### The bug
When Oracle pauses at the human gate, state is persisted to Firestore:
(runExecutor.ts:464):
```typescript
await runRef.update({
  status: 'waiting_for_input',
  workflowState: sanitizeForFirestore(result.workflowState ?? run.workflowState) ?? null,
})
```

When the user approves, the resume path dispatches to the executor:
(executor.ts:1589-1591):
```typescript
const initialState: Partial<OracleState> = resumeState
  ? { ...freshState, ...resumeState, status: 'running', pendingInput: null, humanGateApproved: true }
  : freshState
```

BUT: resumeState is read from context?.resumeState which is NEVER POPULATED.
The Run model stores workflowState but no code maps it to resumeState on resume.
Result: Oracle restarts from freshState, duplicating Phase 1+2 work.

#### Fix
In runExecutor.ts, find the resume handler for Oracle workflows.
When resuming:
1. Read the Run document to get workflowState
2. Pass it as resumeState to executeOracleWorkflowLangGraph

The exact location depends on how resume is dispatched. Search for where
Oracle runs are resumed (look for 'oracle' in the resume/approval flow).

In executor.ts, verify executeOracleWorkflowLangGraph properly handles resumeState:
- Line 1589-1591 already has the merge logic
- Ensure the function signature accepts resumeState parameter
- Ensure workflowState from Firestore is compatible with OracleState type

#### Acceptance criteria
- After approval, Oracle resumes from Phase 3 (not Phase 1)
- Phase 1+2 state preserved: scope, claims, trends, uncertainties, crossImpactMatrix
- costTracker continues from persisted values
- humanGateApproved is true on resume
- If workflowState is null, falls back to fresh start
- pnpm typecheck + tests pass

### C-2: Add human feedback path [CRITICAL]

#### The bug
Human gate prompt (oracleGraph.ts:908) says "provide feedback to refine" but:
- State only has humanGateApproved: boolean (no text field)
- Resume path only sets humanGateApproved: true
- No node reads or consumes feedback text

#### Fix — 4 steps:

STEP 1: Add field to state (oracleStateAnnotation.ts):
```typescript
humanGateFeedback: Annotation<string>({
  reducer: (_cur, upd) => upd,
  default: () => '',
}),
```

STEP 2: On resume, pass feedback from Run document.
In executor.ts, when building initialState for resume:
```typescript
const initialState = resumeState
  ? {
      ...freshState,
      ...resumeState,
      status: 'running',
      pendingInput: null,
      humanGateApproved: true,
      humanGateFeedback: resumeState.humanGateFeedback ?? '',
    }
  : freshState
```

Also update runExecutor.ts resume path to pass feedback from the approval request.

STEP 3: In Phase 3 nodes that generate prompts (scenario_developer, equilibrium_analyst,
red_team), inject feedback:
```typescript
const feedbackSection = state.humanGateFeedback
  ? `\n## User Feedback on Phase 2 Output\n${state.humanGateFeedback}\nIncorporate this feedback.\n`
  : ''
// Append feedbackSection to the prompt
```

STEP 4: The human gate node itself doesn't need changes — it already returns the
prompt text. The feedback is injected on RESUME, not on pause.

#### Acceptance criteria
- humanGateFeedback field exists on OracleState
- Feedback text available in Phase 3 state when provided on resume
- Phase 3 prompts include feedback when non-empty
- Empty feedback (approve without comment) works
- pnpm typecheck + tests pass

### C-3: Implement evidence gathering node [CRITICAL — largest item]

#### The bug
context_gathering (oracleGraph.ts:330-343) parses searchPlan then discards it:
```typescript
const parsed = safeParseJson<{
  scope: OracleScope; searchPlan: Record<string, string[]>
}>(step.output)
// searchPlan is parsed but NEVER USED
```
evidence[] stays empty throughout. Oracle claims evidence-backing without evidence.

#### Fix — 4 steps:

STEP 1: Add searchPlan field to OracleState (oracleStateAnnotation.ts):
```typescript
searchPlan: Annotation<Record<string, string[]>>({
  reducer: (_cur, upd) => upd,
  default: () => ({}),
}),
```

STEP 2: Update context_gathering to return searchPlan:
```typescript
return {
  scope,
  searchPlan: parsed?.searchPlan ?? {},
  // ... existing fields
}
```

STEP 3: Add evidence_gathering node (oracleGraph.ts):
```typescript
graph.addNode('evidence_gathering', async (state: OracleState) => {
  log.info('Phase 0: Evidence Gathering', { runId: state.runId })

  const evidence: OracleEvidence[] = []
  for (const [category, queries] of Object.entries(state.searchPlan ?? {})) {
    for (const query of queries) {
      evidence.push({
        id: `EV-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        category,
        query,
        source: 'search_plan',
        reliability: 'unverified',
        timestamp: Date.now(),
        relevantScenarios: [],
      })
    }
  }

  log.info('Evidence gathering complete', { runId: state.runId, evidenceCount: evidence.length })
  return { evidence }
})
```

STEP 4: Wire into graph edges:
- Change: context_gathering → decomposer
- To: context_gathering → evidence_gathering → decomposer

Find where the edge from context_gathering is defined and update it.

STEP 5: Cap evidence reducer (oracleStateAnnotation.ts):
```typescript
import { cappedReducer } from '../shared/reducerUtils.js'

evidence: Annotation<OracleEvidence[]>({
  reducer: cappedReducer(200),
  default: () => [],
}),
```

STEP 6: Update recursion limit formula (oracleGraph.ts:1599-1601):
Add 1 to the base node count for the new evidence_gathering node.

#### Acceptance criteria
- context_gathering preserves searchPlan in state
- evidence_gathering node creates evidence records from search plan
- evidence[] is non-empty after context gathering
- Evidence has id, category, query, source, reliability, timestamp
- Evidence reducer capped at 200
- Graph wiring: context_gathering → evidence_gathering → decomposer
- Recursion limit updated
- pnpm typecheck + tests pass

### C-4: Budget enforcement in all LLM nodes [HIGH]

#### The pattern
checkBudgetExceeded helper (oracleGraph.ts:289-302) returns ConstraintPauseInfo
if budget exceeded. Currently only checked at gate edges.

#### Fix
At the TOP of every node that makes an LLM call, add:
```typescript
const budgetPause = checkBudgetExceeded(state.costTracker, oracleConfig.maxBudgetUsd)
if (budgetPause) {
  log.warn(`Budget exceeded before ${nodeName}`, { runId: state.runId })
  return { status: 'paused' as const, constraintPause: budgetPause, degradedPhases: [nodeName] }
}
```

Nodes needing this: decomposer, scanner, weak_signal_scanner, cross_impact,
scenario_developer, red_team, verifier, backcaster, equilibrium_analyst,
council_gate_a, council_gate_b, council_final.

### C-5: Gate escalation semantics [HIGH]

#### Fix — 3 steps:

STEP 1: Add fields (oracleStateAnnotation.ts):
```typescript
gateEscalated: Annotation<boolean>({
  reducer: (_cur, upd) => _cur || upd,  // Once true, stays true
  default: () => false,
}),
gateEscalationFeedback: Annotation<string[]>({
  reducer: (cur, upd) => [...cur, ...upd],
  default: () => [],
}),
```

STEP 2: In gate edges (oracleGraph.ts:1431,1451,1478), when refinements exhaust:
The graph already proceeds to council. In the council nodes, when the gate
didn't pass but refinements are exhausted, set:
```typescript
return {
  gateEscalated: true,
  gateEscalationFeedback: [lastGateResult.feedback],
  currentGateRefinements: 0,
  // ... existing fields
}
```

STEP 3: In final output generation, append warning:
```typescript
if (state.gateEscalated) {
  finalOutput += '\n\nNote: Quality gate(s) could not be fully satisfied within refinement budget.'
}
```

### C-6: Token accounting [MEDIUM]
In oracleGraph.ts:250-251, change:
```typescript
const totalTokens = turn.stage1.responses.reduce((sum, r) => sum + (r.tokensUsed ?? 0), 0)
  + (turn.stage3.tokensUsed ?? 0)
```
To:
```typescript
const totalTokens = turn.stage1.responses.reduce((sum, r) => sum + (r.tokensUsed ?? 0), 0)
  + (turn.stage2?.tokensUsed ?? 0)
  + (turn.stage3.tokensUsed ?? 0)
```

### C-7: Weak signal STEEP+V mapping [MEDIUM]
In oracleGraph.ts:729-747, replace the hardcoded map with substring matching:
```typescript
function mapToSteep(raw: string): TrendObject['steepCategory'] {
  const lower = raw.toLowerCase()
  if (lower.includes('tech')) return 'technological'
  if (lower.includes('econ')) return 'economic'
  if (lower.includes('environ') || lower.includes('ecolog') || lower.includes('climate')) return 'environmental'
  if (lower.includes('politic') || lower.includes('regulat') || lower.includes('govern')) return 'political'
  if (lower.includes('social') || lower.includes('societ') || lower.includes('demograph')) return 'social'
  log.debug('Weak signal category unmapped, defaulting to values', { raw })
  return 'values'
}
```

### C-8: Track degraded phases [MEDIUM]
In oracleGraph.ts catch/fallback blocks, append to degradedPhases:
```typescript
degradedPhases: ['node_name'],
```

### C-9: Cost tracking boilerplate [LOW]
Extract helper:
```typescript
function trackCost(
  state: OracleState, phase: number,
  component: 'llm' | 'search' | 'council' | 'evaluation',
  step: AgentExecutionStep
): { costTracker: OracleCostTracker } {
  return { costTracker: updateCostTracker(state.costTracker, step, phase, component) }
}
```
Replace all 24 callsites: `...trackCost(state, phaseNum, 'llm', step)`

### C-10: Axiom loader path [LOW]
In axiomLoader.ts:170, change:
```typescript
return resolve(currentDir, '..', '..', '..', '..', 'docs', 'Oracle', filename)
```
To:
```typescript
const basePath = process.env.AXIOM_BASE_PATH
  ?? resolve(currentDir, '..', '..', '..', '..', 'docs', 'Oracle')
return resolve(basePath, filename)
```

### C-11: Axiom loader schema validation [LOW]
In axiomLoader.ts, add Zod schemas for the cookbook and axiom library JSON structures.
Validate on load instead of bare type assertions. Log clear errors for invalid data.

### C-12: Recipe ordering [LOW]
In axiomLoader.ts getRecipesForAgent (~line 337):
Sort recipes by ID before returning:
```typescript
return agentRecipes.sort((a, b) => a.id.localeCompare(b.id)).filter(...)
```

### C-13: depthMode recipe selection [LOW]
In oraclePrompts.ts buildCookbookContext (~line 25):
Accept depthMode parameter. Use it to vary recipe count:
- quick: 2 recipes, standard: 3, deep: 5
Update all callers to pass depthMode from config.

### C-14: Gate cliff behavior [LOW]
In gateEvaluator.ts, evaluateGate function:
Replace "any dimension < 3.0 fails" with "any dimension < 2.0 fails":
```typescript
const hasFloorViolation = allAboveMinimum(scores, 2.0) === false
const passed = !hasFloorViolation && avg >= 3.5
```
Keep gate-specific overrides (axiom grounding, decision usefulness).

### C-15: Phase summaries with gate results [LOW]
In phaseSummarizer.ts, add optional gateResult parameter:
```typescript
export function buildPhaseSummarizerPrompt(
  phase: OraclePhase,
  gateResult?: OracleGateResult
): string
```
If gateResult provided, append gate feedback to the prompt.
Update callers in oracleGraph.ts to pass the latest gate result.

### C-16: Equilibrium analyst caching [LOW]
In oracleGraph.ts equilibrium_analyst node (~line 1032):
Add a cache key based on uncertainties + crossImpactMatrix hash.
Store in state as _skeletonCache. On cache hit, skip LLM call.

Add to oracleStateAnnotation.ts:
```typescript
_skeletonCache: Annotation<{ hash: string; portfolio: OracleScenario[] } | null>({
  reducer: (_cur, upd) => upd,
  default: () => null,
}),
```

### C-17: Recursion limit documentation [LOW]
In oracleGraph.ts:1599-1601, replace magic numbers with named constants:
```typescript
const baseNodes = 23  // context(1) + evidence(1) + decomposer(1) + gate_a(1) + ...
const nodesPerRefinement = 11  // Gate A(4) + Gate B(4) + Gate C(3)
const safetyMargin = 10
const recursionLimit = baseNodes + (maxRef * nodesPerRefinement) + safetyMargin
```
Add a comment listing each node.

## FINAL VERIFICATION
```bash
cd packages/agents && pnpm build && cp -r dist ../functions/vendor/agents/
cd functions && pnpm typecheck && pnpm test
```
All tests must pass. Report changes and results.
```

---

## AGENT PROMPT: Phase 2 — Integration Testing & Cross-Cutting Verification

```
You are implementing Phase 2 of a major refactor. Phases 0 and 1 (Tracks A, B, C)
are ALREADY COMPLETE. All workflow code changes have been made. Your job is to:

1. Write targeted integration tests that verify the critical/high bug fixes
2. Run cross-cutting consistency checks
3. Ensure the full test suite passes

## Repository Structure
- functions/src/agents/__tests__/ — Most test files live here
- functions/src/agents/oracle/__tests__/ — Oracle-specific tests
- functions/src/agents/langgraph/__tests__/ — LangGraph-specific tests
- functions/src/agents/deepResearch/__tests__/ — Deep Research tests
- Test framework: Vitest (import { describe, it, expect, vi, beforeEach } from 'vitest')
- Mock pattern: vi.mock() at top of file, before imports

## Testing Conventions
Follow these patterns observed in existing tests:

Mock firebase-admin/firestore:
```typescript
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: vi.fn(() => mockDb),
}))
const mockSet = vi.fn().mockResolvedValue(undefined)
const mockUpdate = vi.fn().mockResolvedValue(undefined)
const mockDoc = vi.fn(() => ({ set: mockSet, update: mockUpdate }))
const mockGet = vi.fn().mockResolvedValue({ docs: [] })
const mockCollection = vi.fn(() => ({ get: mockGet }))
const mockDb = { doc: mockDoc, collection: mockCollection }
```

Mock logger:
```typescript
vi.mock('../../lib/logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(),
  }),
}))
```

Helper for claim inputs (from kgEnrichment.test.ts):
```typescript
function makeClaimInput(text: string, overrides?: Partial<CreateClaimInput>): CreateClaimInput {
  return {
    sessionId: 'session-1' as DialecticalSessionId,
    userId: 'user-1',
    text,
    normalizedText: text.toLowerCase().trim().replace(/\s+/g, ' '),
    sourceEpisodeId: 'src-1' as EpisodeId,  // NOTE: Post-fix should use real source ID format
    sourceAgentId: 'agent:test' as AgentId,
    sourceLens: 'systems' as ThesisLens,
    claimType: 'ASSERTION',
    confidence: 0.8,
    conceptIds: [],
    ...overrides,
  }
}
```

## BUILD & TEST
cd packages/agents && pnpm build && cp -r dist ../functions/vendor/agents/
pnpm typecheck
cd packages/agents && pnpm test
cd functions && pnpm test

## TEST ITEMS TO WRITE

### T1: Oracle human-gate pause → resume state integrity [validates C1]
File: functions/src/agents/oracle/__tests__/oracleResume.test.ts

Test scenario:
1. Create a mock OracleState representing completed Phase 1+2 (with scope, claims,
   trends, uncertainties, crossImpactMatrix, costTracker populated)
2. Simulate pause: workflowState = sanitizeForFirestore(state)
3. Simulate resume: read workflowState, pass as resumeState
4. Verify: initialState includes Phase 1+2 data (not freshState defaults)
5. Verify: status is 'running', humanGateApproved is true
6. Verify: costTracker values are preserved (not reset to 0)

The key function to test is in executor.ts — how it builds initialState from resumeState:
```typescript
const initialState = resumeState
  ? { ...freshState, ...resumeState, status: 'running', pendingInput: null, humanGateApproved: true }
  : freshState
```

### T2: Oracle resume with feedback [validates C2]
Same test file as T1.

Test scenario:
1. Resume with humanGateFeedback: "Focus more on AI disruption scenarios"
2. Verify: state.humanGateFeedback contains the feedback string
3. Verify: When Phase 3 prompts are built, they include the feedback text
   (Test buildScenarioDeveloperPrompt or similar with feedback injected)

### T3: Evidence population after context_gathering [validates C3]
File: functions/src/agents/oracle/__tests__/oracleEvidence.test.ts

Test scenario:
1. Create mock state with searchPlan: { "technology": ["AI trends 2026", "quantum computing"] }
2. Call the evidence_gathering node logic
3. Verify: evidence[] contains 2 records
4. Verify: Each evidence record has id, category, query, source, reliability, timestamp
5. Verify: evidence reducer caps at 200 (test with 250 items → trimmed to 200)

### T4: Contradiction KG claim IDs [validates C4]
File: functions/src/agents/__tests__/contradictionMapping.test.ts

Test scenario:
1. Create mock theses with agent IDs: ["agent_systems", "agent_critical"]
2. Create agentClaimMapping: { "agent_systems": ["claim_123"], "agent_critical": ["claim_456"] }
3. Run runContradictionTrackers with the mapping
4. Verify: participatingClaims in output contains "claim_123" and "claim_456" (not agent IDs)
5. Verify: Without mapping (undefined), falls back to agent IDs

### T5: KG evolution before answer generation [validates H1]
File: functions/src/agents/langgraph/__tests__/deepResearchKGEvolution.test.ts

Test scenario:
1. Create a KnowledgeHypergraph with 3 initial claims
2. Create a kgDiff with 2 newClaims
3. Apply the evolution logic (the code added in A1)
4. Verify: KG now has 5 claims total
5. Verify: buildDetailedKGSummary includes the new claims

### T6: Sourced_from edge format consistency [validates H2]
File: functions/src/agents/__tests__/kgEnrichment.test.ts (add to existing)

Test scenario:
1. Add a new claim with sourceEpisodeId = 'src-1' (corrected format)
2. Add a duplicate claim with sourceEpisodeId = 'src-2'
3. Verify: Both sourced_from edges point to IDs that match source node format
4. Verify: No edges pointing to 'episode:source:*' format

### T7: Budget enforcement early exit [validates H3]
File: functions/src/agents/oracle/__tests__/oracleBudget.test.ts

Test scenario:
1. Create state with costTracker.total = 10.0, maxBudgetUsd = 0.001
2. Call checkBudgetExceeded
3. Verify: Returns ConstraintPauseInfo with constraintType: 'budget'
4. Verify: The budget guard at a node level returns { status: 'paused', degradedPhases: [nodeName] }

### T8: Gate escalation on exhaustion [validates H4]
File: functions/src/agents/oracle/__tests__/oracleGateEscalation.test.ts

Test scenario:
1. Create state with currentGateRefinements = maxRefinementsPerGate (e.g., 3)
2. Create gateResults with last gate_a result: passed = false
3. Simulate council node behavior when gate failed + refinements exhausted
4. Verify: gateEscalated is true
5. Verify: gateEscalationFeedback contains the gate's feedback string
6. Verify: Once gateEscalated is true, another update with false keeps it true (reducer test)

### T9: Config immutability [validates M3]
File: functions/src/agents/langgraph/__tests__/dialecticalConfigClone.test.ts

Test scenario:
1. Create config: { mode: 'quick', maxCycles: 5, ... }
2. Create thesisAgents array with 4 agents
3. Call the graph creation function (or the relevant code path)
4. Verify: Original config.maxCycles is still 5 (not 1)
5. Verify: Original thesisAgents.length is still 4 (not 2)

### T10: Context claim seeding advances counter [validates M1]
File: functions/src/agents/langgraph/__tests__/deepResearchSeeding.test.ts

Test scenario:
1. Simulate context_seeding: returns extractedClaims with 5 claims
2. Verify: claimsProcessedCount in returned state equals 5
3. Simulate kg_construction with claimsProcessedCount = 5 and 8 total extractedClaims
4. Verify: Only claims 5-7 (the 3 new ones) are processed

### T11: Stage 2 token accounting [validates M2]
File: functions/src/agents/oracle/__tests__/oracleTokens.test.ts

Test scenario:
1. Create council turn with:
   - stage1.responses = [{ tokensUsed: 100 }, { tokensUsed: 150 }]
   - stage2 = { tokensUsed: 50 }
   - stage3 = { tokensUsed: 200 }
2. Compute totalTokens with the fixed formula
3. Verify: totalTokens = 100 + 150 + 50 + 200 = 500 (not 450)

## CROSS-CUTTING CHECKS

After writing tests, verify these manually:

### X1: degradedPhases populated
```bash
# Should find matches in deepResearchGraph.ts, dialecticalGraph.ts, oracleGraph.ts
grep -rn "degradedPhases:" functions/src/agents/langgraph/deepResearchGraph.ts functions/src/agents/langgraph/dialecticalGraph.ts functions/src/agents/langgraph/oracleGraph.ts
```
Verify at least 1 match per file.

### X2: Reducer caps enforced
Add these to a shared test file or to existing state annotation tests:
```typescript
it('sources reducer caps at 100', () => {
  const reducer = /* get the sources reducer */
  const current = Array.from({ length: 80 }, (_, i) => ({ id: `s${i}` }))
  const update = Array.from({ length: 40 }, (_, i) => ({ id: `s${80+i}` }))
  const result = reducer(current, update)
  expect(result.length).toBe(100)
})
```
Test caps for: sources(100), extractedClaims(200), evidence(200), cycleMetrics(20)

### X3: No local safeParseJson copies
```bash
grep -rn "function safeParseJson" functions/src/agents/ --include="*.ts"
```
Should only match functions/src/agents/shared/jsonParser.ts

### X4: No hardcoded model names
```bash
grep -rn "'gpt-5-mini'" functions/src/agents/ --include="*.ts" | grep -v test | grep -v __tests__
grep -rn "'claude-opus'" functions/src/agents/ --include="*.ts" | grep -v test | grep -v __tests__
```
Should return 0 matches outside test files.

## FINAL VERIFICATION
```bash
cd packages/agents && pnpm build && cp -r dist ../functions/vendor/agents/
pnpm typecheck
cd packages/agents && pnpm test
cd functions && pnpm test
```
All tests (existing + new) must pass. Report total test counts and any failures.
```

---

## AGENT PROMPT: Phase 3 — Quality & Depth Improvements

```
You are implementing Phase 3 of a major refactor — quality and analytical depth
improvements. Phases 0, 1, and 2 are ALREADY COMPLETE. All bugs are fixed and
tested. Your job is to improve the analytical quality of the three AI workflow systems.

These are enhancements, not bug fixes. Prioritize by ROI (effort vs impact).
Skip items that require extensive design spikes — note them as "deferred" with
reasoning.

## Repository Structure
- functions/src/agents/langgraph/ — Graph definitions
- functions/src/agents/deepResearch/ — Deep Research modules
- functions/src/agents/oracle/ — Oracle modules
- functions/src/agents/ — Shared modules (contradictionTrackers, sublationEngine, metaReflection, etc.)
- packages/agents/src/domain/ — Domain types

## Build & Test
cd packages/agents && pnpm build && cp -r dist ../functions/vendor/agents/
pnpm typecheck
cd packages/agents && pnpm test
cd functions && pnpm test

## TIER 1 — High ROI (mostly verification that Phase 1 fixes landed correctly)

These items overlap with bug fixes from Phase 1. Verify they're already addressed
and note as DONE if so. Only implement if gaps remain.

### Q1: KG authoritative in answer generation
Verify H1 fix landed: sharedKg is updated with synthesis diffs before answer generation.
If buildDetailedKGSummary still reads from stale KG, fix it.

### Q4: Surface degraded-mode metadata
Verify M10 fix landed: degradedPhases is populated and included in final output.
If not surfaced to the user, add it to the output metadata/footer.

### Q7: Unified identifiers across dialectical
Verify C4 fix landed: contradictions use KG claim IDs. If the agentClaimMapping
approach left gaps (e.g., some trackers still emit agent IDs), fix them.

### Q15: Falsifiability enforcement
Verify B5 fix landed: ThesisOutputSchema has .min(1) on falsificationCriteria.

### Q17: Gate controlling semantics
Verify H4 fix landed: gates set gateEscalated flag and final output warns.

### Q18: Pause/resume + feedback
Verify C1+C2 fixes landed: resume reads workflowState, feedback consumed in Phase 3.

### Q19: Budget checkpoints
Verify H3 fix landed: all LLM-calling nodes check budget.

## TIER 2 — Medium ROI (implement these)

### Q2: Evidence triangulation
In answerGeneration.ts, when building the final answer, check each major claim's
source count. If a claim has only 1 source, append a marker:
```typescript
const sourceCount = kg.getOutEdges(claim.id).filter(e => e.data.type === 'sourced_from').length
const marker = sourceCount < 2 ? ' [single-source]' : ''
```
Include in the summary output. This surfaces epistemic risk without blocking.

Files: functions/src/agents/deepResearch/answerGeneration.ts

### Q3: Strengthen adversarial retrieval
In the counterclaim search node of deepResearchGraph.ts, update the prompt to
explicitly request DISCONFIRMING evidence, not just "alternative views":
```
"Search for evidence that CONTRADICTS or WEAKENS the following claims. Prioritize:
1. Studies with opposing conclusions
2. Methodological criticisms of supporting evidence
3. Counter-examples from different contexts or time periods"
```

Files: functions/src/agents/langgraph/deepResearchGraph.ts (counterclaim search prompt)

### Q5: Post-validate citations against KG
After answer generation, scan the answer text for claim references. For each,
verify a matching claim exists in the KG. If not, append a warning:
"Note: Some claims in this analysis could not be traced to indexed sources."

Files: functions/src/agents/deepResearch/answerGeneration.ts

### Q9: Enforce perspective diversity
In dialecticalGraph.ts thesis generation, after agent assignment, verify that
thesis agents have diverse lenses. If 2+ agents share the same lens, log a warning
and note it in degradedPhases:
```typescript
const lenses = thesisAgents.map(a => a.lens ?? 'custom')
const unique = new Set(lenses)
if (unique.size < lenses.length) {
  log.warn('Thesis agents have duplicate lenses', { lenses })
}
```

Files: functions/src/agents/langgraph/dialecticalGraph.ts

### Q10: Quality thresholds for meta-reflection termination
In metaReflection.ts, add a coverage metric alongside velocity:
```typescript
const claimsAddressed = /* claims that have been part of at least one contradiction */
const totalClaims = /* total claims in KG */
const coverage = totalClaims > 0 ? claimsAddressed / totalClaims : 0
```
Include coverage in the termination recommendation prompt so the LLM can consider
whether enough of the claim space has been explored.

Files: functions/src/agents/metaReflection.ts

### Q11: Distinguish honest incompleteness from synthetic completion
In dialecticalGraph.ts sublation fallback (~line 1386-1399), instead of returning
a fabricated minimal synthesis, return a synthesis with an explicit
`incompleteReason` field:
```typescript
return {
  synthesis: {
    operators: [],
    preservedElements: state.theses.map(t => t.lens),
    negatedElements: [],
    // ...
    incompleteReason: `Sublation failed: ${msg}. Results represent partial analysis.`,
  },
  degradedPhases: ['sublation'],
}
```
Surface `incompleteReason` in the final output.

Files: functions/src/agents/langgraph/dialecticalGraph.ts

### Q20: Separate narrative quality from evidentiary quality
In gateEvaluator.ts, the 6 dimensions mix narrative and evidentiary quality.
Add a comment documenting which dimensions are narrative (mechanisticClarity,
completeness) vs evidentiary (evidenceQuality, causalDiscipline) vs decision
(decisionUsefulness, uncertaintyHygiene). When computing averages, log both
sub-scores for transparency:
```typescript
const narrativeAvg = (scores.mechanisticClarity + scores.completeness) / 2
const evidentiaryAvg = (scores.evidenceQuality + scores.causalDiscipline) / 2
log.info('Gate quality breakdown', { narrativeAvg, evidentiaryAvg, overall: avg })
```

Files: functions/src/agents/oracle/gateEvaluator.ts

### Q21: Scenario portfolio diversity
In oracleGraph.ts final_output node, before producing the final output, check
scenario distinctness. If 2+ scenarios are very similar (share >80% of their
key uncertainties in the same state), log a warning:
```typescript
// Simple heuristic: check if scenario names or key drivers overlap significantly
const scenarioDriverSets = state.scenarioPortfolio.map(s =>
  new Set(s.keyDrivers?.map(d => d.toLowerCase()) ?? [])
)
for (let i = 0; i < scenarioDriverSets.length; i++) {
  for (let j = i + 1; j < scenarioDriverSets.length; j++) {
    const intersection = [...scenarioDriverSets[i]].filter(d => scenarioDriverSets[j].has(d))
    const unionSize = new Set([...scenarioDriverSets[i], ...scenarioDriverSets[j]]).size
    if (unionSize > 0 && intersection.length / unionSize > 0.8) {
      log.warn('Low scenario diversity detected', { scenario1: i, scenario2: j })
    }
  }
}
```

Files: functions/src/agents/langgraph/oracleGraph.ts

## TIER 3 — Lower ROI / Design Spikes (defer or implement if time permits)

### Q6: Fuzzy/semantic query deduplication [DEFER — needs embedding model]
Current: case-insensitive substring matching for query dedup.
Better: semantic similarity via embeddings.
Defer: Requires embedding pipeline not currently in the system.

### Q8: Persist dialectical cycle memory [DEFER — architectural]
Current: Each cycle starts mostly fresh.
Better: Retain contradiction lineage, synthesis lineage across cycles.
Defer: Requires state model redesign beyond this refactor scope.

### Q12: Rebalance synthesis scope scoring
In sublationEngine.ts, the scope formula is:
```typescript
preservationRate * 0.4 + resolutionRate * 0.6
```
Hypothesis: Resolution should be weighted higher (0.8) to incentivize actual
contradiction resolution over preservation.
If implementing: Change to 0.2/0.8, run existing synthesis tests, check for regressions.
This is a tuning change — if tests break, the weights may need experimentation.

Files: functions/src/agents/sublationEngine.ts

### Q13: Novelty scoring: uniqueness not count
In metaReflection.ts, novelty is `min(1, (newClaims + newPreds) / 10)`.
Better: Score based on semantic distance from existing claims.
Defer: Requires embedding comparison. For now, document the limitation.

### Q14: Convergence vs stalled detection
Both states show velocity ≈ 0. Distinguish by checking if unresolved contradictions
remain (stalled) vs all contradictions resolved (converged):
```typescript
const unresolvedCount = contradictions.filter(c => !resolvedIds.has(c.id)).length
const isConverged = velocity < 0.1 && unresolvedCount === 0
const isStalled = velocity < 0.1 && unresolvedCount > 0
```
If implementing, inject this into the meta-reflection termination prompt.

Files: functions/src/agents/metaReflection.ts

### Q16: Full evidence ledger [DEFER — extends C3]
C3 implemented a lightweight evidence model (search plan → evidence records).
Full ledger with real web search execution, provenance tracking, reliability scoring,
and scenario-relevance mapping is a separate epic.

### Q22: Cookbook recipe chaining [DEFER — needs cookbook schema change]
Currently recipes are isolated. Chaining (one recipe suggests follow-on recipes
for subsequent phases) requires cookbook schema changes and new axiomLoader logic.
Defer to a cookbook v2 effort.

## IMPLEMENTATION ORDER
1. Tier 1: Verify Phase 1 fixes (quick pass — mark DONE or fix gaps)
2. Tier 2: Q2, Q3, Q5 (Deep Research quality)
3. Tier 2: Q9, Q10, Q11 (Dialectical quality)
4. Tier 2: Q20, Q21 (Oracle quality)
5. Tier 3: Q12, Q14 if time permits; Q6, Q8, Q13, Q16, Q22 deferred

## FINAL VERIFICATION
```bash
cd packages/agents && pnpm build && cp -r dist ../functions/vendor/agents/
pnpm typecheck
cd packages/agents && pnpm test
cd functions && pnpm test
```
All tests must pass. Report what was implemented, what was verified as already done,
and what was deferred with reasoning.
```

---

## AGENT PROMPT: Track B — Dialectical Pipeline

```
You are implementing Track B of a major refactor — the Dialectical pipeline.
This track runs IN PARALLEL with Track A (Deep Research) and Track C (Oracle).
You must NOT modify files owned by those tracks.

Phase 0 (Foundation) has already been completed. You can use:
- functions/src/agents/shared/jsonParser.ts — safeParseJsonWithSchema, safeParseJson
- functions/src/agents/shared/reducerUtils.ts — cappedReducer
- degradedPhases field already exists on DialecticalState
- dialecticalConfig cloning already done (Item 0.3)

## YOUR FILES (only modify these)
- functions/src/agents/langgraph/dialecticalGraph.ts
- functions/src/agents/contradictionTrackers.ts
- functions/src/agents/sublationEngine.ts
- functions/src/agents/metaReflection.ts
- functions/src/agents/langgraph/dialecticalPrompts.ts
- functions/src/agents/langgraph/structuredOutputSchemas.ts
- functions/src/agents/langgraph/stateAnnotations.ts (ONLY Dialectical reducers, lines 232-357)
- apps/web-vite/src/hooks/useDialecticalState.ts

## DO NOT MODIFY
- deepResearchGraph.ts, knowledgeHypergraph.ts, claimExtraction.ts, sourceIngestion.ts
- oracleGraph.ts, oracleStateAnnotation.ts, oraclePrompts.ts
- stateAnnotations.ts lines 386-538 (Deep Research reducers — Track A owns these)
- Any file in oracle/ or deepResearch/ directories

## Build & Test
cd packages/agents && pnpm build && cp -r dist ../functions/vendor/agents/
cd functions && pnpm typecheck && pnpm test

## ITEMS — Implement in this order (critical path first)

### B1: Fix contradiction ID mismatch [CRITICAL — largest item]

This is the most important fix in Track B. All 4 contradiction trackers populate
`participatingClaims` with AGENT IDs, not KG claim IDs:

In contradictionTrackers.ts:
- Logic tracker (line 162): participatingClaims: [agentId1, agentId2]
- Pragmatic tracker (line 267): participatingClaims: [d1.agentId, d2.agentId]
- Semantic tracker (line 338): participatingClaims: [negation.agentId, negation.targetThesisAgentId]
- Boundary tracker (line 460): participatingClaims: [st.agentId, lt.agentId]

In dialecticalGraph.ts:1220-1233, KG persistence tries to look these up:
```typescript
const claimIds = c.participatingClaims
  .map((pc) => `claim:${pc}` as ClaimId)
  .filter((cid) => kg.getNode(cid) !== undefined)  // NEVER RESOLVES
if (claimIds.length === 0) { continue }  // SKIPS MOST CONTRADICTIONS
```

#### Solution — 4 steps:

STEP 1: Add agentClaimMapping to DialecticalState.
In stateAnnotations.ts, in the DialecticalStateAnnotation (around line 350), add:
```typescript
agentClaimMapping: Annotation<Record<string, string[]>>({
  reducer: (current, update) => ({ ...current, ...update }),
  default: () => ({}),
}),
```

STEP 2: Build the mapping during thesis generation.
In dialecticalGraph.ts, in the thesis generation node (around line 817-881):
After thesis parsing adds claims to KG via mapClaimsToKG, build a mapping:
```typescript
const agentToClaimIds: Record<string, string[]> = {}
// For each thesis agent that successfully generated claims:
agentToClaimIds[agent.agentId] = addedClaimIds  // from mapClaimsToKG return
```
Return agentClaimMapping in the node's state update.

NOTE: You need to find where thesis claims are added to KG. The thesis generation
node calls parseThesisOutput which returns structured thesis data. Claims from the
thesis output need to be mapped to their KG IDs. Look at how addedClaimIds is
obtained — it may come from mapClaimsToKG or a similar function. If thesis claims
aren't added to KG at thesis generation time, you may need to extract claim texts
from the thesis output and track them.

STEP 3: Pass the mapping to contradiction trackers.
The orchestration function signature (contradictionTrackers.ts:534):
```typescript
export function runContradictionTrackers(
  theses: ThesisOutput[],
  negations: NegationOutput[],
  enabledTrackers: ContradictionTrackerType[],
  context: ContradictionTrackerContext,
  agentClaimMapping?: Record<string, string[]>  // ← ADD THIS PARAM
)
```

Each tracker function also needs the param. In each tracker, replace:
```typescript
participatingClaims: [agentId1, agentId2],
```
With:
```typescript
participatingClaims: [
  ...(agentClaimMapping?.[agentId1] ?? [agentId1]),
  ...(agentClaimMapping?.[agentId2] ?? [agentId2]),
],
```
The fallback to agentId ensures backward compatibility if mapping isn't provided.

STEP 4: Remove the workaround in dialecticalGraph.ts:1224.
The `continue` that skips contradictions with no matching KG claims should now
rarely trigger. Keep it as a safety check but add a log.warn.

#### Acceptance criteria
- participatingClaims contains KG claim IDs (format: claim_<timestamp>_<random>)
- KG persistence no longer skips most contradictions
- Contradictions actually persist to KG
- If agentClaimMapping is undefined, falls back to agent IDs (backward compat)
- pnpm typecheck passes, all tests pass

### B2: Validate contradiction resolution semantics [MEDIUM]
In sublationEngine.ts, findResolvedContradictions function (lines 372-401):

Current logic:
```typescript
const isTargeted = operators.some((op) => participatingClaims.includes(op.target))
```
An operator that merely targets a claim is counted as resolving the contradiction,
even for SPLIT or TEMPORALIZE which don't resolve contradictions.

Fix: Only count resolution-appropriate operators:
```typescript
const RESOLUTION_OPERATORS = new Set(['MERGE', 'ADD_MEDIATOR', 'REVERSE_EDGE', 'SCOPE_TO_REGIME'])
const isTargeted = operators.some((op) =>
  participatingClaims.includes(op.target) && RESOLUTION_OPERATORS.has(op.type)
)
```

### B3: Velocity depth metric [MEDIUM]
In metaReflection.ts, calculateConceptualVelocity (lines 319-377):

Currently purely count-based. Add a depth component:
```typescript
// After existing velocity calculation (the final `return velocity` line):
const contradictionsDetected = kgDiff?.newContradictions?.length ?? 0
const contradictionsResolved = kgDiff?.resolvedContradictions?.length ?? 0
const resolutionDepth = contradictionsDetected > 0
  ? contradictionsResolved / contradictionsDetected
  : 0

// Blend: 60% change velocity + 40% resolution depth
return velocity * 0.6 + resolutionDepth * 0.4
// Document: 0.6/0.4 split because resolution quality matters but shouldn't dominate
// when no contradictions exist (resolutionDepth = 0 → pure change velocity)
```

### B4: Track degraded phases [MEDIUM]
In dialecticalGraph.ts fallback paths:

Line 1107 (all negations failed) — add to the state returned near this warning:
  degradedPhases: ['cross_negation'],

Line 1399 (sublation timeout catch block) — add to return:
  degradedPhases: ['sublation'],

Include degradedPhases in final workflow output metadata.

### B5: Falsifiability enforcement [LOW]
In structuredOutputSchemas.ts, ThesisOutputSchema (line 38), change:
```typescript
falsificationCriteria: z.array(z.string())
```
To:
```typescript
falsificationCriteria: z.array(z.string()).min(1)
```

Check if any tests provide empty falsificationCriteria arrays — update them.

### B6: Sublation prompt node cap [LOW]
In dialecticalPrompts.ts, buildSublationPrompt function (~line 212-305):
Find the output format/constraints section and add:
"Maximum 15 nodes in your synthesis output graph. Prune low-confidence nodes
that are not critical to resolving contradictions."

### B7: Research evidence coherence [LOW]
In dialecticalPrompts.ts, buildThesisPrompt (lines 88-101):
Replace pure confidence sorting with relevance-weighted:
```typescript
// The function receives `goal` as first param — use it
const goalTerms = new Set(goal.toLowerCase().split(/\W+/).filter(t => t.length > 3))
const scoredClaims = researchEvidence.claims.map(c => {
  const terms = c.claimText.toLowerCase().split(/\W+/)
  const overlap = terms.filter(t => goalTerms.has(t)).length
  const relevance = Math.min(1, overlap / Math.max(1, goalTerms.size) * 2)
  return { ...c, score: c.confidence * (0.5 + 0.5 * relevance) }
})
const claimLines = scoredClaims
  .sort((a, b) => b.score - a.score)
  .slice(0, 10)
```

### B8: Cap cycleMetricsHistory [LOW]
In stateAnnotations.ts (Dialectical section, lines 291-294):
```typescript
import { cappedReducer } from '../shared/reducerUtils.js'

cycleMetricsHistory: Annotation<CycleMetrics[]>({
  reducer: cappedReducer(20),
  default: () => [],
}),
```

### B9: Pragmatic tracker entity nuance [LOW]
In contradictionTrackers.ts, pragmatic tracker (lines 249-280):
Add entity extraction:
```typescript
function extractActionObject(decision: string): { verb: string; object: string } | null {
  const verbs = 'increase|decrease|expand|contract|invest|divest|build|demolish|hire|fire|buy|sell|start|stop|accelerate|decelerate|centralize|decentralize'
  const match = decision.match(
    new RegExp(`^(${verbs})\\s+(?:the\\s+|a\\s+|an\\s+)?(.+?)(?:\\s+(?:by|to|from|in)\\b|[,.]|$)`, 'i')
  )
  return match ? { verb: match[1].toLowerCase(), object: match[2].toLowerCase().trim() } : null
}
```
Use it: only flag contradiction if same object with opposing verb. Fall back to
existing behavior if extraction fails for either decision.

### B10: Research state leakage [LOW]
In dialecticalGraph.ts, thesis generation node, before evidence injection:
```typescript
const hasValidEvidence = state.context?.researchEvidence &&
  state.context.researchEvidence.claims?.length > 0
// Only inject evidence if it's properly populated
const evidence = hasValidEvidence ? state.context.researchEvidence : null
```

### B11: Entry point validation [LOW]
In dialecticalGraph.ts, at graph creation entry (~line 1863):
```typescript
if (!thesisAgents || thesisAgents.length === 0) {
  throw new Error('Dialectical graph requires at least 1 thesis agent')
}
if (!synthesisAgents || synthesisAgents.length === 0) {
  throw new Error('Dialectical graph requires at least 1 synthesis agent')
}
```

### B12: Frontend thesis structured fields [LOW]
In dialecticalGraph.ts thesis event emission (~line 869), ensure ALL ThesisOutputSchema
fields are included with null/empty defaults:
```typescript
await emitAgentOutput(execContext, 'dialectical_thesis', agent, step.output, {
  lens,
  cycleNumber: state.cycleNumber,
  confidence: thesis.confidence,
  graph: thesis.graph ?? null,
  conceptGraph: thesis.conceptGraph ?? {},
  causalModel: thesis.causalModel ?? [],
  falsificationCriteria: thesis.falsificationCriteria ?? [],
  decisionImplications: thesis.decisionImplications ?? [],
  unitOfAnalysis: thesis.unitOfAnalysis ?? '',
  temporalGrain: thesis.temporalGrain ?? '',
  regimeAssumptions: thesis.regimeAssumptions ?? [],
})
```

## FINAL VERIFICATION
```bash
cd packages/agents && pnpm build && cp -r dist ../functions/vendor/agents/
cd functions && pnpm typecheck && pnpm test
```
All tests must pass. Report changes and results.
```
