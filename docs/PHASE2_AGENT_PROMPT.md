# Phase 2: Shared Infrastructure — Agent Prompt

You are implementing Phase 2 of the Dialectical Workflow Improvement Plan. Read the full plan at `docs/DIALECTICAL_WORKFLOW_IMPROVEMENT_PLAN.md` for context, but you are ONLY implementing Phase 2. This phase creates new shared modules that both workflows will depend on. **No changes to graph topology. No changes to how WF1 or WF2 execute.** Existing behavior must be unchanged.

## Constraints

- Every existing test must still pass after your changes.
- Do NOT change any graph topology or workflow execution logic.
- Do NOT wire feature flags into runtime behavior — only add the type declarations (they remain inert).
- Do NOT modify `dialecticalGraph.ts` execution logic. You will extract prompt builders from it, but the functions must produce identical output. Verify by running existing WF1 tests.
- All new files use ESM with `.js` extension on relative imports (e.g., `import { foo } from './bar.js'`).
- All types imported from the shared package use `import type { ... } from '@lifeos/agents'`.
- Write unit tests for each new module (see test specs below).
- After all changes, run the verification gate and fix any failures before committing.

## Prerequisite Context

Phase 1 already completed these changes (do NOT re-implement):
- `functions/src/agents/langgraph/dialecticalPrompts.ts` exists with `resolveThesisLens()`.
- `functions/src/agents/knowledgeHypergraph.ts` has `findClaimByNormalizedText()` and dedup guard in `addClaim()`.
- `functions/src/agents/deepResearch/claimExtraction.ts` has the duplicate causal edge guard.
- `functions/src/agents/metaReflection.ts` has the corrected contradiction density formula.

---

## Task 2A: Create `kgSerializer.ts`

**Create:** `functions/src/agents/deepResearch/kgSerializer.ts` (NEW file)

This module converts between the runtime `KnowledgeHypergraph` (graphlib-based) and the LLM-facing `CompactGraph` (JSON-serializable). Two functions:

### `serializeKGToCompactGraph(kg: KnowledgeHypergraph, maxNodes?: number): CompactGraph`

Converts a live KG instance into a `CompactGraph` suitable for prompt injection.

Implementation:
1. Read all nodes via `kg.getNodesByType()` for types: `'claim'`, `'concept'`, `'mechanism'`, `'prediction'`. The KG node type is `KGNodeType` (string union).
2. Each `KGNode` has shape `{ id: string, type: KGNodeType, label: string, data: unknown }`. For claims, `data` is a `Claim` object with `text`, `confidence`, etc.
3. Score nodes by: `(edgeCount * 0.4) + (confidence * 0.6)` where edgeCount = number of edges incident on that node (use `kg.getOutEdges(id).length + kg.getInEdges(id).length`), and confidence comes from `(node.data as { confidence?: number }).confidence ?? 0.5`.
4. Sort descending, take top `maxNodes` (default 50).
5. Collect all edges between selected nodes. For each selected node, use `kg.getOutEdges(nodeId)` → returns `Array<{ target: string; data: KGEdge }>`. Only include edges where both source and target are in the selected set. Map `KGEdge.type` to CompactGraph edge `rel`:
   - `'causal_link'` → `'causes'`
   - `'contradicts'` → `'contradicts'`
   - `'supports'` → `'supports'`
   - `'mediates'` → `'mediates'`
   - `'scoped_by'` → `'scopes'`
   - All others → skip (don't include `sourced_from`, `belongs_to`, etc.)
6. Build CompactGraph with:
   - `nodes`: mapped from KG nodes (id, label from node.label, type from node.type — only include types that match CompactGraph's union: `claim | concept | mechanism | prediction`)
   - `edges`: mapped as above
   - `summary`: Generate from top 3 claims by confidence: `"Key findings: {claim1.label}; {claim2.label}; {claim3.label}"`
   - `confidence`: Average confidence across all selected claim nodes
   - `regime`: `"multi-regime"` (placeholder)
   - `temporalGrain`: `"mixed"` (placeholder)
   - `reasoning`: `""` (empty — this is a serialized snapshot, not LLM-generated)

### `capGraphForPrompt(graph: CompactGraph, maxChars?: number): string`

Serializes a `CompactGraph` to a JSON string, pruning if necessary to stay under the character budget.

Implementation:
1. `maxChars` defaults to 4000.
2. `const json = JSON.stringify(graph)` — if `json.length <= maxChars`, return it.
3. Prune iteratively:
   a. Sort edges by weight ascending (lowest weight = least important). Remove edges one at a time until under budget. **Never** remove edges where `rel === 'contradicts'`. **Never** remove edges connected to prediction nodes.
   b. If still over budget after removing all pruneable edges, sort nodes by confidence ascending. Remove nodes one at a time (and their remaining edges). **Never** remove nodes with `type === 'prediction'` or nodes that have `contradicts` edges.
   c. After each removal, re-serialize and check length.
4. Return the pruned JSON string.

### Types needed

```ts
import type { CompactGraph } from '@lifeos/agents'
import type { KnowledgeHypergraph } from '../knowledgeHypergraph.js'
```

The `KGEdge` type is defined in `knowledgeHypergraph.ts`:
```ts
interface KGEdge {
  type: KGEdgeType  // string like 'causal_link', 'contradicts', 'supports', etc.
  weight: number
  temporal: BiTemporalEdge
  metadata?: Record<string, unknown>
}
```

The `KGNode` type:
```ts
interface KGNode {
  id: string
  type: KGNodeType  // 'claim' | 'concept' | 'mechanism' | 'prediction' | 'source' | 'contradiction' | 'regime' | 'community'
  label: string
  data: unknown  // The actual domain object (Claim, Concept, etc.)
}
```

These types are exported from `knowledgeHypergraph.ts`.

---

## Task 2B: Create KG Tools

**Create:** `functions/src/agents/kgTools.ts` (NEW file)

A factory function that creates 6 semantic tool definitions, each wrapping a `KnowledgeHypergraph` method. These will be granted to thesis agents in Phase 3 (not wired in this phase).

### `createKGTools(kg: KnowledgeHypergraph): ToolDefinition[]`

Use the `ToolDefinition` interface from `./toolExecutor.js`:

```ts
interface ToolDefinition {
  toolId?: ToolId
  name: string
  description: string
  parameters: {
    type: 'object'
    properties: Record<string, { type: string; description: string; required?: boolean; ... }>
    required?: string[]
  }
  execute: (params: Record<string, unknown>, context: ToolExecutionContext) => Promise<unknown>
}
```

Import it: `import type { ToolDefinition, ToolExecutionContext } from './toolExecutor.js'`

### Tool specifications:

**1. `kg_summary`**
- Description: `"Get a summary of the knowledge graph: node/edge counts, top claims by confidence, and active contradictions"`
- Parameters: none (`properties: {}, required: []`)
- Execute: Call `kg.getStats()`, then `kg.getNodesByType('claim')` sorted by confidence descending (top 10), then `kg.getActiveContradictions()`. Return a JSON object:
  ```ts
  {
    stats: kg.getStats(),
    topClaims: topClaims.map(n => ({ id: n.id, label: n.label, confidence: (n.data as { confidence?: number }).confidence })),
    activeContradictions: contradictions.map(n => ({ id: n.id, label: n.label })),
  }
  ```

**2. `kg_get_claims`**
- Description: `"Query claims from the knowledge graph, optionally filtering by concept and minimum confidence"`
- Parameters:
  - `conceptFilter` (string, optional): `"Only return claims connected to this concept node ID"`
  - `minConfidence` (number, optional): `"Minimum confidence threshold (0-1)"`
  - `limit` (number, optional): `"Max claims to return (default 20)"`
- Execute: Get all claims via `kg.getNodesByType('claim')`. Filter by confidence if `minConfidence` given. If `conceptFilter` given, use `kg.getNeighbors(conceptFilter)` to get connected node IDs, then filter claims to those whose `id` is in that set. Sort by confidence descending, slice to limit. Return array of `{ id, label, confidence, text }`.

**3. `kg_get_neighborhood`**
- Description: `"Get the local neighborhood of a node in the knowledge graph (nodes and edges within N hops)"`
- Parameters:
  - `nodeId` (string, required): `"The node ID to explore from"`
  - `maxDepth` (number, optional): `"Maximum hops from the node (default 2)"`
  - `maxSize` (number, optional): `"Maximum number of nodes to return (default 30)"`
- Execute: Call `kg.getNeighborhood(nodeId, { maxDepth, limit: maxSize })`. Returns `KGQueryResult` which has `{ nodes: KGNode[], edges: Array<{ source, target, data }> }`. Map to a simplified shape for the LLM.

**4. `kg_get_sources_for_claim`**
- Description: `"Get the source records (URLs, titles, quality scores) that support a specific claim"`
- Parameters:
  - `claimId` (string, required): `"The claim node ID"`
- Execute: Call `kg.getSourcesForClaim(claimId)`. Returns `KGNode[]` where each node's `data` is a source record. Map to `{ sourceId, label, url, domain }` — extract fields from `node.data` with safe access.

**5. `kg_get_contradictions`**
- Description: `"Get all active (unresolved) contradictions in the knowledge graph"`
- Parameters: none
- Execute: Call `kg.getActiveContradictions()`. Map each contradiction node to `{ id, label, data: node.data }`.

**6. `kg_shortest_path`**
- Description: `"Find the shortest path between two nodes in the knowledge graph"`
- Parameters:
  - `fromNodeId` (string, required): `"Starting node ID"`
  - `toNodeId` (string, required): `"Target node ID"`
- Execute: Call `kg.shortestPath(fromNodeId, toNodeId)`. Returns `string[] | null` (array of node IDs or null if no path). If null, return `{ path: null, message: 'No path found' }`. Otherwise, resolve each node ID to `{ id, label, type }` and return `{ path: resolvedNodes }`.

### Important implementation notes

- All `execute` functions are async and return `Promise<unknown>`.
- Use defensive access on `node.data` — it's typed as `unknown`, so cast carefully: `(node.data as Record<string, unknown>)`.
- The `context` parameter on `execute` is not used by KG tools (they close over the `kg` instance), but it's part of the interface.
- Export only `createKGTools`.

---

## Task 2C: Extract shared prompts into `dialecticalPrompts.ts`

**File:** `functions/src/agents/langgraph/dialecticalPrompts.ts` (extend existing — already has `resolveThesisLens`)

Extract 3 prompt builders + 1 utility from `dialecticalGraph.ts` into this shared module. After extraction, `dialecticalGraph.ts` must import from this module — its behavior must remain identical.

### Functions to extract:

**1. `buildThesisPrompt(goal, lens, mergedGraph?, researchEvidence?): string`**

Copy the existing `buildThesisPrompt` function from `dialecticalGraph.ts` (around line 1780). Then apply these improvements:

- Replace `JSON.stringify(mergedGraph)` with `capGraphForPrompt(mergedGraph, 4000)` (import from `../deepResearch/kgSerializer.js`).
- Sort research claims by confidence descending before slicing:
  ```ts
  const claimLines = [...researchEvidence.claims]
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 10)
  ```
  (The existing code does `.slice(0, 10)` but does NOT sort first.)

**2. `buildNegationPrompt(sourceThesis, targetThesis): string`**

Copy from `dialecticalGraph.ts` (around line 1830). Apply:
- Replace `JSON.stringify(sourceThesis.graph)` and `JSON.stringify(targetThesis.graph)` with `capGraphForPrompt(thesis.graph, 3000)` calls.
- Keep `truncateRawText` as a local helper in this file (copy it + the `MAX_RAW_TEXT_LENGTH = 3000` constant).

**3. `buildSublationPrompt(theses, negations, contradictions, mergedGraph?, cycleNumber?, researchEvidence?): string`**

Copy from `dialecticalGraph.ts` (around line 1868). Apply:
- Replace `JSON.stringify(mergedGraph)` with `capGraphForPrompt(mergedGraph, 5000)`.
- Replace `JSON.stringify(t.graph)` in thesis representations with `capGraphForPrompt(t.graph, 2000)`.
- Sort research claims by confidence descending before slicing (same pattern as thesis).

**4. `repairJsonOutput(rawText, zodError, schema, execContext): Promise<string | null>`**

New utility for structured output parse failure recovery. When a Zod parse fails:
1. Build a repair prompt: `"The following JSON output failed validation. Fix it to match the schema.\n\nOriginal output:\n${rawText}\n\nValidation errors:\n${zodError.message}\n\nReturn ONLY the corrected JSON."`
2. Call the LLM via `executeAgentWithEvents` (from `./utils.js`) using a lightweight repair agent config.
3. Parse the response — if valid, return the corrected JSON string. If still invalid, return `null`.
4. This is a **1-retry** strategy: call once, if that fails return null (no infinite loops).

Signature:
```ts
import type { ZodError } from 'zod'
import type { AgentExecutionContext } from './utils.js'
import type { z } from 'zod'

export async function repairJsonOutput(
  rawText: string,
  zodError: ZodError,
  schema: z.ZodTypeAny,
  execContext: AgentExecutionContext
): Promise<string | null>
```

Implementation:
- Create a minimal repair agent config inline (don't import from elsewhere):
  ```ts
  const repairAgent = {
    agentId: 'system_json_repair' as AgentConfig['agentId'],
    name: 'JSON Repair',
    modelProvider: 'openai' as const,
    modelName: 'gpt-4o-mini',
    systemPrompt: 'You fix malformed JSON to match a schema. Return ONLY valid JSON, no explanation.',
    temperature: 0,
    archived: false,
    createdAtMs: Date.now(),
    updatedAtMs: Date.now(),
    role: 'custom' as const,
    syncState: 'synced' as const,
    version: 1,
    userId: execContext.userId,
  } satisfies AgentConfig
  ```
- Use `executeAgentWithEvents(repairAgent, repairPrompt, {}, execContext, { stepNumber: 0, nodeId: 'json_repair' })`.
- Extract JSON from the response using the same `extractJsonFromOutput` pattern already in `dialecticalGraph.ts` (copy the helper or import it). Validate with `schema.safeParse()`. Return the JSON string if valid, null if not.

### Types to import

```ts
import type { CompactGraph, ThesisOutput, NegationOutput, ContradictionOutput, AgentConfig } from '@lifeos/agents'
import type { ExtractedClaim } from '@lifeos/agents'
```

You'll also need the `ResearchEvidence` interface. It's currently defined in `dialecticalGraph.ts` (line 94):
```ts
export interface ResearchEvidence {
  claims: ExtractedClaim[]
  sources: Array<{ sourceId: string; title: string; url: string; domain: string; qualityScore: number }>
  gapTypes: string[]
  searchRationale: string
}
```

**Move** this interface to `dialecticalPrompts.ts` and re-export it. Update `dialecticalGraph.ts` to import it from `dialecticalPrompts.js` instead.

### After extraction: update `dialecticalGraph.ts`

1. Remove the local `buildThesisPrompt`, `buildNegationPrompt`, `buildSublationPrompt`, `truncateRawText`, `MAX_RAW_TEXT_LENGTH`, and `ResearchEvidence` interface.
2. Add imports: `import { buildThesisPrompt, buildNegationPrompt, buildSublationPrompt, type ResearchEvidence } from './dialecticalPrompts.js'`
3. The existing call sites in `dialecticalGraph.ts` should not change — they already call these functions by name.
4. **Do NOT remove** `extractJsonFromOutput` or `parseThesisOutput` from `dialecticalGraph.ts` — those stay (they are used by the graph execution nodes).

### Critical: verify no behavior change

The extraction must produce **identical prompt strings** for the existing code paths. The only differences are:
- `capGraphForPrompt` may truncate very large graphs (which previously were injected untruncated — this is strictly an improvement, not a behavior change).
- Research claims are now sorted by confidence before slicing (strictly better ordering).

Run all existing WF1 tests after this change to verify nothing breaks.

---

## Task 2D: Add domain types

**File:** `packages/agents/src/domain/workflowState.ts`

Add this interface (place it near the existing `CompactGraph` definition, around line 275):

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

Then export it from the package's barrel file. Check `packages/agents/src/index.ts` (or `packages/agents/src/domain/index.ts`) to find where other types from `workflowState.ts` are re-exported. Add `KGCompactSnapshot` to the same export list.

---

## Task 2E: Add feature flags (inert — not wired)

### 2E-i: `DialecticalWorkflowConfig`

**File:** `packages/agents/src/domain/dialectical.ts`

Add to the `DialecticalWorkflowConfig` interface (place near the end, after the existing optional fields):

```ts
/** Enable reactive research: explicit decide/execute research nodes per cycle.
 *  When false (default), existing front-loaded research behavior is preserved. */
enableReactiveResearch?: boolean
```

### 2E-ii: `DeepResearchRunConfig`

**File:** `packages/agents/src/domain/models.ts`

Find a suitable location for this. There may not be an existing `DeepResearchRunConfig` type — if not, look for where deep research configuration is defined. The most likely location is in `DeepResearchWorkflowState` (in `workflowState.ts`) or as part of the `Run` type in `models.ts`.

If no suitable config type exists, add a new interface in `models.ts`:

```ts
/** Configuration for deep research run behavior */
export interface DeepResearchRunConfig {
  /** When true (default), all research completes before dialectical reasoning begins.
   *  When false, research and dialectical phases interleave (legacy behavior). */
  researchFirstMode?: boolean
}
```

Export it from the package barrel file.

If a config type already exists that logically holds this field, add `researchFirstMode?: boolean` there instead of creating a new type.

---

## Tests to Write

### `functions/src/agents/deepResearch/__tests__/kgSerializer.test.ts`

```ts
describe('capGraphForPrompt', () => {
  it('returns JSON as-is when under maxChars', () => { ... })
  it('prunes lowest-weight edges first when over budget', () => { ... })
  it('never prunes contradicts edges', () => { ... })
  it('never prunes prediction nodes', () => { ... })
  it('prunes lowest-confidence nodes after edges exhausted', () => { ... })
  it('respects custom maxChars parameter', () => { ... })
})

describe('serializeKGToCompactGraph', () => {
  it('selects top-N nodes by score (edgeCount * 0.4 + confidence * 0.6)', () => { ... })
  it('only includes edges between selected nodes', () => { ... })
  it('maps KG edge types to CompactGraph rel types', () => { ... })
  it('skips non-semantic edges (sourced_from, belongs_to)', () => { ... })
  it('computes summary from top 3 claims', () => { ... })
  it('defaults maxNodes to 50', () => { ... })
})
```

Mock setup: Create a `KnowledgeHypergraph` instance with the Firestore mock pattern from Phase 1 tests:
```ts
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: vi.fn(() => mockDb),
}))
const mockSet = vi.fn().mockResolvedValue(undefined)
const mockDoc = vi.fn(() => ({ set: mockSet, update: vi.fn() }))
const mockGet = vi.fn().mockResolvedValue({ docs: [] })
const mockCollection = vi.fn(() => ({ get: mockGet }))
const mockDb = { doc: mockDoc, collection: mockCollection }
```

Then populate the KG by calling `kg.addNode()` and `kg.addEdge()` directly to set up test scenarios.

### `functions/src/agents/__tests__/kgTools.test.ts`

```ts
describe('createKGTools', () => {
  it('returns 6 tools with correct names', () => { ... })

  describe('kg_summary', () => {
    it('returns stats, top claims, and contradictions', () => { ... })
  })

  describe('kg_get_claims', () => {
    it('returns all claims when no filters', () => { ... })
    it('filters by minConfidence', () => { ... })
    it('filters by conceptFilter', () => { ... })
    it('respects limit parameter', () => { ... })
  })

  describe('kg_get_neighborhood', () => {
    it('returns nodes and edges within maxDepth', () => { ... })
  })

  describe('kg_get_sources_for_claim', () => {
    it('returns source nodes for a claim', () => { ... })
  })

  describe('kg_get_contradictions', () => {
    it('returns active contradictions', () => { ... })
  })

  describe('kg_shortest_path', () => {
    it('returns resolved path when path exists', () => { ... })
    it('returns null message when no path', () => { ... })
  })
})
```

Use the same Firestore mock pattern and populate KG with test data.

### `functions/src/agents/langgraph/__tests__/dialecticalPrompts.test.ts` (extend existing)

Add new describe blocks to the existing file:

```ts
describe('buildThesisPrompt', () => {
  it('includes goal and lens in prompt', () => { ... })
  it('includes capped mergedGraph when provided', () => { ... })
  it('sorts research claims by confidence descending', () => { ... })
  it('omits research section when no evidence', () => { ... })
})

describe('buildNegationPrompt', () => {
  it('includes source and target thesis representations', () => { ... })
  it('caps graph representations', () => { ... })
  it('falls back to truncated rawText when no graph', () => { ... })
})

describe('buildSublationPrompt', () => {
  it('includes all theses, negations, and contradictions', () => { ... })
  it('caps prior merged graph to 5000 chars', () => { ... })
  it('sorts research claims by confidence', () => { ... })
  it('uses different instruction for first cycle vs later', () => { ... })
})

describe('repairJsonOutput', () => {
  it('returns corrected JSON on successful repair', () => { ... })
  it('returns null when repair also fails', () => { ... })
})
```

For `repairJsonOutput` tests, mock `executeAgentWithEvents` from `../utils.js` (same pattern as `graphGuardrails.test.ts`):
```ts
vi.mock('../utils.js', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return { ...actual, executeAgentWithEvents: vi.fn() }
})
```

### Verify existing tests

After all changes, run:
```bash
cd functions && npx vitest run src/agents/langgraph/__tests__/dialecticalGraph
```
to verify WF1 tests still pass with the extracted prompt builders.

---

## Verification Gate

After all changes and tests are written, run:

```bash
cd functions && pnpm lint && pnpm typecheck && pnpm test -- --run
cd ../packages/agents && pnpm lint && pnpm typecheck && pnpm test -- --run
```

Fix any lint errors, type errors, or test failures before committing.

---

## Files Summary

| File | Action | What |
|---|---|---|
| `functions/src/agents/deepResearch/kgSerializer.ts` | **CREATE** | `serializeKGToCompactGraph`, `capGraphForPrompt` |
| `functions/src/agents/kgTools.ts` | **CREATE** | `createKGTools` — 6 semantic KG tool definitions |
| `functions/src/agents/langgraph/dialecticalPrompts.ts` | **EXTEND** | Add `buildThesisPrompt`, `buildNegationPrompt`, `buildSublationPrompt`, `repairJsonOutput`, `ResearchEvidence` |
| `functions/src/agents/langgraph/dialecticalGraph.ts` | **MODIFY** | Remove extracted prompt builders, import from `dialecticalPrompts.js` |
| `packages/agents/src/domain/workflowState.ts` | **MODIFY** | Add `KGCompactSnapshot` interface |
| `packages/agents/src/domain/dialectical.ts` | **MODIFY** | Add `enableReactiveResearch?: boolean` to `DialecticalWorkflowConfig` |
| `packages/agents/src/domain/models.ts` | **MODIFY** | Add `DeepResearchRunConfig` with `researchFirstMode?: boolean` |
| Package barrel file(s) | **MODIFY** | Export new types |
| `functions/src/agents/deepResearch/__tests__/kgSerializer.test.ts` | **CREATE** | Tests for serializer |
| `functions/src/agents/__tests__/kgTools.test.ts` | **CREATE** | Tests for KG tools |
| `functions/src/agents/langgraph/__tests__/dialecticalPrompts.test.ts` | **EXTEND** | Tests for prompt builders + repairJsonOutput |

## Commit

Once everything passes:

```
feat(agents): shared infrastructure — KG serializer, KG tools, shared prompts, domain types
```
